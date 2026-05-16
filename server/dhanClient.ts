
import axios from 'axios';

export class DhanClient {
    private clientId: string;
    private accessToken: string;
    private baseUrl = 'https://api.dhan.co';

    constructor(clientId: string, accessToken: string) {
        this.clientId = clientId;
        this.accessToken = accessToken;
    }

    private get headers() {
        return {
            'access-token': this.accessToken,
            'client-id': this.clientId,
            'Content-Type': 'application/json'
        };
    }

    private unwrap(response: any) {
        if (response?.status === 'success') {
            const data = response.data;
            if (data?.status === 'success' && data.data) return data.data;
            if (data?.data && Object.keys(data).length === 1) return data.data;
            return data;
        }
        return null;
    }

    async getHistory(securityId: string | number, segment: string, instrumentType: string = 'INDEX', timeframe: number | string = 1) {
        try {
            const sid = securityId.toString();
            const toDate = new Date();
            // Intraday charts usually support limited lookback. 
            let lookbackDays = 5; 
            const tf = typeof timeframe === 'number' ? timeframe : 1;
            if (tf >= 60) lookbackDays = 15;
            else if (tf >= 15) lookbackDays = 7;
            
            const fromDate = new Date();
            fromDate.setDate(toDate.getDate() - lookbackDays);

            const format = (d: Date) => d.toISOString().replace('T', ' ').split('.')[0];
            
            // For indices, segment often needs to be IDX_I or NSE_INDEX
            // Instrument type usually INDEX
            const actualInstType = segment === 'NSE_FNO' ? 'OPTIDX' : 'INDEX';

            const payload = {
                security_id: sid,
                segment: segment,
                instrument_type: actualInstType,
                from_date: format(fromDate),
                to_date: format(toDate)
            };

            const response = await axios.post(`${this.baseUrl}/v2/charts/intraday`, payload, { 
                headers: this.headers,
                timeout: 10000 
            });

            const unwrapped = this.unwrap(response.data);
            if (!unwrapped?.timestamp) {
                if (response.data?.status === 'failed' || response.data?.data?.status === 'failed') {
                    const err = response.data?.remarks || response.data?.data?.remarks || response.data?.errors;
                    console.warn(`Dhan getHistory failed for ${sid}:`, err);
                }
                return [];
            }

            const history = unwrapped.timestamp.map((t: number, i: number) => ({
                time: t,
                open: unwrapped.open[i],
                high: unwrapped.high[i],
                low: unwrapped.low[i],
                close: unwrapped.close[i],
                volume: unwrapped.volume?.[i] || 0
            }));

            // IST filter (09:15 - 15:30)
            const filtered = history.filter((b: any) => {
                const date = new Date(b.time * 1000);
                const istMinutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 330) % 1440;
                return istMinutes >= 555 && istMinutes <= 930;
            });

            if (typeof timeframe === 'string') return filtered;

            return this.aggregateOhlc(filtered, tf);
        } catch (e) {
            console.error(`Dhan getHistory error:`, e);
            return [];
        }
    }

    private aggregateOhlc(bars: any[], period: number) {
        if (period <= 1) return bars;
        const aggregated: any[] = [];
        const windowSec = period * 60;
        let currentBar: any = null;

        for (const bar of bars) {
            const barStart = Math.floor(bar.time / windowSec) * windowSec;
            if (!currentBar || barStart !== currentBar.time) {
                if (currentBar) aggregated.push(currentBar);
                currentBar = { ...bar, time: barStart };
            } else {
                currentBar.high = Math.max(currentBar.high, bar.high);
                currentBar.low = Math.min(currentBar.low, bar.low);
                currentBar.close = bar.close;
                currentBar.volume += bar.volume;
            }
        }
        if (currentBar) aggregated.push(currentBar);
        return aggregated;
    }

    async getOptionChain(securityId: number, segment: string, expiry: string) {
        try {
            // Updated payload for V2 Option Chain
            const payload = {
                underlying_external_id: securityId.toString(),
                underlying_segment: segment,
                expiry_date: expiry,
                // fallback fields
                security_id: securityId.toString(),
                segment: segment,
                underlying_id: securityId.toString(),
                underlying_segment_id: segment
            };

            const response = await axios.post(`${this.baseUrl}/v2/optionchain`, payload, { 
                headers: this.headers,
                timeout: 15000
            });

            const unwrapped = this.unwrap(response.data);
            if (!unwrapped) {
                 if (response.data?.status === 'failed' || response.data?.data?.status === 'failed') {
                    const err = response.data?.remarks || response.data?.data?.remarks || response.data?.errors;
                    console.warn(`Dhan getOptionChain failed:`, err);
                }
                return [];
            }
            
            const ocRaw = unwrapped.oc || unwrapped;
            const rows: any[] = [];

            const parseLeg = (leg: any) => ({
                OI: parseInt(leg?.oi || 0),
                LTP: parseFloat(leg?.last_price || 0),
                IV: parseFloat(leg?.implied_volatility || 0),
                Delta: parseFloat(leg?.greeks?.delta || 0),
                Gamma: parseFloat(leg?.greeks?.gamma || 0),
                SecurityId: leg?.security_id || '',
                Symbol: leg?.trading_symbol || ''
            });

            if (ocRaw && typeof ocRaw === 'object' && !Array.isArray(ocRaw)) {
                for (const [strike, data] of Object.entries(ocRaw)) {
                    const row: any = { Strike: parseFloat(strike) };
                    const ce = parseLeg((data as any).ce);
                    const pe = parseLeg((data as any).pe);
                    Object.entries(ce).forEach(([k, v]) => row[`Call_${k}`] = v);
                    Object.entries(pe).forEach(([k, v]) => row[`Put_${k}`] = v);
                    rows.push(row);
                }
            } else if (Array.isArray(ocRaw)) {
                ocRaw.forEach((item: any) => {
                    const row: any = { Strike: parseFloat(item.strike_price || 0) };
                    const ce = parseLeg(item.ce);
                    const pe = parseLeg(item.pe);
                    Object.entries(ce).forEach(([k, v]) => row[`Call_${k}`] = v);
                    Object.entries(pe).forEach(([k, v]) => row[`Put_${k}`] = v);
                    rows.push(row);
                });
            }

            return rows.sort((a, b) => a.Strike - b.Strike);
        } catch (e) {
            console.error(`Dhan getOptionChain error:`, e);
            return [];
        }
    }

    async getExpiryList(securityId: number, segment: string) {
        try {
            const payload = {
                underlying_external_id: securityId.toString(),
                underlying_segment: segment,
                // Fallback fields
                security_id: securityId.toString(),
                segment: segment,
                underlying_id: securityId.toString(),
                underlying_segment_id: segment
            };
            const response = await axios.post(`${this.baseUrl}/v2/optionchain/expy`, payload, { 
                headers: this.headers,
                timeout: 10000
            });

            const unwrapped = this.unwrap(response.data);
            if (Array.isArray(unwrapped) && unwrapped.length > 0) return unwrapped;
            return this.getFallbackExpiries();
        } catch (e) {
            return this.getFallbackExpiries();
        }
    }

    private getFallbackExpiries() {
        const expiries = [];
        const today = new Date();
        const daysAhead = (3 - today.getDay() + 7) % 7;
        const current = new Date(today);
        current.setDate(today.getDate() + daysAhead);
        for (let i = 0; i < 4; i++) {
            expiries.push(current.toISOString().split('T')[0]);
            current.setDate(current.getDate() + 7);
        }
        return expiries;
    }

    async getQuote(securityIds: string[], segment: string = 'IDX_I') {
        try {
            // New V2 format: { instruments: [ { segmentId, securityId } ] }
            const response = await axios.post(`${this.baseUrl}/v2/marketfeed/quote`, {
                instruments: securityIds.map(id => ({
                    segmentId: segment,
                    securityId: id.toString()
                }))
            }, { headers: this.headers });
            
            const unwrapped = this.unwrap(response.data);
            if (Array.isArray(unwrapped)) {
                const map: Record<string, any> = {};
                unwrapped.forEach((item: any) => {
                    const sid = item.security_id || item.securityId || '';
                    if (sid) map[sid.toString()] = item;
                });
                return map;
            }
            return unwrapped;
        } catch (e) {
            return null;
        }
    }

    async getOhlc(securityIds: string[], segment: string = 'IDX_I') {
        try {
            const response = await axios.post(`${this.baseUrl}/v2/marketfeed/ohlc`, {
                instruments: securityIds.map(id => ({
                    segmentId: segment,
                    securityId: id.toString()
                }))
            }, { headers: this.headers });
            return this.unwrap(response.data);
        } catch (e) {
            return null;
        }
    }
}
