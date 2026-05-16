
import axios from 'axios';

export class DhanClient {
    private clientId: string;
    private accessToken: string;
    private baseUrl = 'https://api.dhan.co';
    public rateLimitUntil = 0;

    constructor(clientId: string, accessToken: string) {
        this.clientId = clientId;
        this.accessToken = accessToken;
    }

    private checkRateLimit() {
        if (Date.now() < this.rateLimitUntil) {
            throw new Error("429 Too Many Requests");
        }
    }

    private handleRateLimit(e: any) {
        const errStr = e.response ? JSON.stringify(e.response.data) : e.message;
        if (errStr.includes("805") || errStr.includes("Too many requests") || (e.response && e.response.status === 429)) {
            if (Date.now() > this.rateLimitUntil) {
                console.warn(`Dhan API rate limit hit. Throttling for 60 seconds.`);
            }
            this.rateLimitUntil = Date.now() + 60000; // Block for 60 seconds
            throw new Error("429 Too Many Requests");
        }
        console.error(`Dhan API error:`, errStr);
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
        } else if (response?.data?.status === 'failed') {
            throw new Error(response.data.remarks || response.data.errorType || "Dhan API Failed");
        }
        return null;
    }

    async getHistory(securityId: string | number, segment: string, instrumentType: string = 'INDEX', timeframe: number | string = 1) {
        try {
            this.checkRateLimit();
            const sid = securityId.toString();
            const toDate = new Date();
            
            if (timeframe === '1D') {
                 // Fetch 1 year of daily history + recent intraday for merge
                 const fromYear = new Date();
                 fromYear.setFullYear(toDate.getFullYear() - 1);
                 
                 const formatD = (d: Date) => d.toISOString().split('T')[0];
                 const actualInstType = segment === 'NSE_FNO' ? 'OPTIDX' : 'INDEX';

                 const [dailyRes, intradayRes] = await Promise.all([
                     axios.post(`${this.baseUrl}/charts/historical`, {
                         securityId: sid, exchangeSegment: segment, instrument: actualInstType, interval: "1D",
                         fromDate: formatD(fromYear), toDate: formatD(toDate)
                     }, { headers: this.headers, timeout: 10000 }).catch(e => null),
                     axios.post(`${this.baseUrl}/charts/historical`, {
                         securityId: sid, exchangeSegment: segment, instrument: actualInstType, interval: 1,
                         fromDate: formatD(new Date(toDate.getTime() - 7 * 86400000)), toDate: formatD(toDate)
                     }, { headers: this.headers, timeout: 10000 }).catch(e => null)
                 ]);

                 const parseRes = (res: any) => {
                     let _data = res?.data;
                     if (typeof _data === 'string') { try{ _data = JSON.parse(_data); }catch(e){} }
                     if (_data?.data) _data = _data.data;
                     const ts = _data?.start_Time || _data?.timestamp;
                     if (!ts || !Array.isArray(ts)) return [];
                     return ts.map((t: number, i: number) => ({
                         time: t, open: _data.open[i], high: _data.high[i], low: _data.low[i], close: _data.close[i], volume: _data.volume?.[i] || 0
                     }));
                 };

                 const dailyHist = parseRes(dailyRes).filter((b: any) => {
                     const date = new Date(b.time * 1000);
                     const istOffset = 330;
                     const istDate = new Date(date.getTime() + (istOffset * 60000));
                     const day = istDate.getUTCDay();
                     return day !== 0 && day !== 6;
                 });
                 let intradayHist = parseRes(intradayRes);

                 // Standardize dailyHist times to midnight IST
                 dailyHist.forEach((b: any) => {
                     const date = new Date(b.time * 1000);
                     date.setUTCHours(18, 30, 0, 0); // 00:00:00 IST is 18:30 UTC previous day
                     if (date.getUTCDate() !== new Date(b.time * 1000).getUTCDate()) {
                         date.setUTCDate(date.getUTCDate() + 1);
                     }
                     b.time = date.getTime() / 1000;
                 });

                 const todayIntraday = intradayHist.filter((b: any) => {
                     const date = new Date(b.time * 1000);
                     const istMinutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 330) % 1440;
                     return istMinutes >= 555 && istMinutes <= 930;
                 }).filter((b: any) => {
                     const date = new Date(b.time * 1000);
                     const istOffset = 330;
                     const istDate = new Date(date.getTime() + (istOffset * 60000));
                     const day = istDate.getUTCDay();
                     if (day === 0 || day === 6) return false;
                     return istDate.toISOString().split('T')[0] === new Date(Date.now() + 330 * 60000).toISOString().split('T')[0];
                 });

                 if (todayIntraday.length > 0) {
                     const todayCandle = this.aggregateOhlc(todayIntraday, 99999999)[0];
                     const todayMidnight = new Date();
                     todayMidnight.setUTCHours(18, 30, 0, 0);
                     if (todayMidnight.getTime() > Date.now()) todayMidnight.setDate(todayMidnight.getDate() - 1);
                     todayCandle.time = todayMidnight.getTime() / 1000;
                     
                     const lastDaily = dailyHist[dailyHist.length - 1];
                     if (lastDaily && lastDaily.time === todayCandle.time) {
                         dailyHist[dailyHist.length - 1] = todayCandle;
                     } else {
                         dailyHist.push(todayCandle);
                     }
                 }
                 return dailyHist;
            }

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
                securityId: sid,
                exchangeSegment: segment,
                instrument: actualInstType,
                interval: 1, // we aggregate this ourselves later if needed
                oi: false,
                fromDate: format(fromDate).split(' ')[0],
                toDate: format(toDate).split(' ')[0]
            };

            const response = await axios.post(`${this.baseUrl}/v2/charts/intraday`, payload, { 
                headers: this.headers,
                timeout: 10000 
            });

            let dataObj = response.data;
            if (typeof dataObj === 'string') {
               try { dataObj = JSON.parse(dataObj); } catch(e){}
            }
            if (dataObj && dataObj.status === 'success' && dataObj.data) {
               dataObj = dataObj.data;
            }
            
            const tsArray = dataObj?.start_Time || dataObj?.timestamp;
            if (!tsArray || !Array.isArray(tsArray)) {
                console.warn(`Dhan getHistory missing timestamp array. Keys:`, dataObj ? Object.keys(dataObj) : "null");
                return [];
            }

            const history = tsArray.map((t: number, i: number) => ({
                time: t,
                open: dataObj.open[i],
                high: dataObj.high[i],
                low: dataObj.low[i],
                close: dataObj.close[i],
                volume: dataObj.volume?.[i] || 0
            }));

            // IST filter (09:15 - 15:30) and Weekend check
            const filtered = history.filter((b: any) => {
                // Remove weekend candles:
                const date = new Date(b.time * 1000);
                const istOffset = 330;
                const istDate = new Date(date.getTime() + (istOffset * 60000));
                const day = istDate.getUTCDay();
                if (day === 0 || day === 6) return false;

                const istMinutes = (date.getUTCHours() * 60 + date.getUTCMinutes() + 330) % 1440;
                return istMinutes >= 555 && istMinutes <= 930;
            });

            if (typeof timeframe === 'string') return filtered;

            return this.aggregateOhlc(filtered, tf);
        } catch (e) {
            this.handleRateLimit(e);
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
            this.checkRateLimit();
            // Updated payload for V2 Option Chain
            const payload = {
                UnderlyingScrip: securityId,
                UnderlyingSeg: segment,
                Expiry: expiry
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
        } catch (e: any) {
            this.handleRateLimit(e);
            return [];
        }
    }

    async getExpiryList(securityId: number, segment: string) {
        try {
            this.checkRateLimit();
            const payload = {
                UnderlyingScrip: securityId,
                UnderlyingSeg: segment
            };
            const response = await axios.post(`${this.baseUrl}/v2/optionchain/expirylist`, payload, { 
                headers: this.headers,
                timeout: 10000
            });

            const unwrapped = this.unwrap(response.data);
            if (Array.isArray(unwrapped) && unwrapped.length > 0) return unwrapped;
            return this.getFallbackExpiries();
        } catch (e: any) {
            try { this.handleRateLimit(e); } catch(err) { throw err; } // throw 429
            if (e.response?.status === 401 || e.response?.status === 403) {
                throw new Error("Invalid Dhan credentials");
            }
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
            this.checkRateLimit();
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
            this.handleRateLimit(e);
            return null;
        }
    }

    async getOhlc(securityIds: string[], segment: string = 'IDX_I') {
        try {
            this.checkRateLimit();
            const response = await axios.post(`${this.baseUrl}/v2/marketfeed/ohlc`, {
                instruments: securityIds.map(id => ({
                    segmentId: segment,
                    securityId: id.toString()
                }))
            }, { headers: this.headers });
            return this.unwrap(response.data);
        } catch (e) {
            this.handleRateLimit(e);
            return null;
        }
    }
}
