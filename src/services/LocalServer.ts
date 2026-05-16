import { DhanClient } from "./dhanClient";
import { MStockClient } from "./mstockClient";
import { computeGex, findGammaFlip, computeWallsAndRegime, computePcrAndMaxPain } from "./analytics";

export const INDEX_CONFIG: Record<string, any> = {
    "13": { name: "NIFTY", dhan_id: "13", seg: "IDX_I", lot: 75 },
    "25": { name: "BANKNIFTY", dhan_id: "25", seg: "IDX_I", lot: 15 },
    "27": { name: "FINNIFTY", dhan_id: "27", seg: "IDX_I", lot: 25 },
    "51": { name: "MIDCPNIFTY", dhan_id: "51", seg: "IDX_I", lot: 50 },
    "1":  { name: "SENSEX", dhan_id: "1", seg: "IDX_I", lot: 10 },
    "12": { name: "BANKEX", dhan_id: "12", seg: "IDX_I", lot: 15 },
    "14": { name: "NIFTYNXT50", dhan_id: "14", seg: "IDX_I", lot: 25 }
};

function getMarketStatus() {
    const now = new Date();
    const istOffset = 330; 
    const istDate = new Date(now.getTime() + (istOffset * 60000));
    const day = istDate.getUTCDay();
    const hour = istDate.getUTCHours();
    const min = istDate.getUTCMinutes();
    const totalMin = hour * 60 + min;

    if (day === 0 || day === 6) return { status: "closed", on: false };
    if (totalMin >= 540 && totalMin < 555) return { status: "pre-market", on: false };
    if (totalMin >= 555 && totalMin <= 930) return { status: "open", on: true };
    if (totalMin >= 940 && totalMin <= 960) return { status: "post-market", on: false };

    return { status: "closed", on: false };
}

export class LocalServer {
    private dhan: DhanClient | null = null;
    private mstockClients = new Map<string, MStockClient>();
    private ocoPairs: Record<string, any> = {};
    private listeners = new Set<(event: any) => void>();
    
    private currentConfig = {
        indexId: "13",
        expiry: "",
        timeframe: "1D" as number | string,
        gexNum: 30,
        moduleConfig: { optionChain: true, gexProfile: true, combinedGex: false }
    };

    private intervalId: NodeJS.Timeout | null = null;
    private ocoIntervalId: NodeJS.Timeout | null = null;
    private lastChainUpdate = 0;
    private CHAIN_REFRESH_MS = 60000;
    private cachedChain: any[] = [];
    private lastSpotMap = new Map<string, number>();

    onMessage(callback: (event: any) => void) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }

    private emit(event: any) {
        this.listeners.forEach(l => l(event));
    }

    async mstockLogin(user_id: string, password?: string, api_key?: string) {
        let client = this.mstockClients.get(user_id);
        if (!client) {
            client = new MStockClient(api_key, user_id, password);
        }
        const res = await client.loginStep1();
        if (res.status === "success" && client) {
            this.mstockClients.set(user_id, client);
        }
        return res;
    }

    async mstockVerifyTotp(user_id: string, api_key: string, totp: string) {
        let client = this.mstockClients.get(user_id);
        if (!client) client = new MStockClient(api_key, user_id);
        const res = await client.verifyTotp(totp);
        if (res.status === 'success' && client) {
            this.mstockClients.set(user_id, client);
            if (!this.ocoIntervalId) this.startOcoMonitor();
        }
        return res;
    }

    async getFunds(userId: string) {
        const client = this.mstockClients.get(userId) || Array.from(this.mstockClients.values())[0];
        if (!client) throw new Error("Not logged in");
        return await client.getFunds();
    }

    async getPositions(userId: string) {
        const client = this.mstockClients.get(userId) || Array.from(this.mstockClients.values())[0];
        if (!client) throw new Error("Not logged in");
        return await client.getPositions();
    }

    async placeOrder(userId: string, body: any) {
        const client = this.mstockClients.get(userId) || Array.from(this.mstockClients.values())[0];
        if (!client) throw new Error("Not logged in");
        return await client.placeOrder(body);
    }

    registerOco(userId: string, body: any) {
        const { entry_order_id, sl_order_id, tgt_order_id, symbol, qty } = body;
        const uid = userId || Array.from(this.mstockClients.keys())[0];
        this.ocoPairs[entry_order_id] = { sl_id: sl_order_id, tgt_id: tgt_order_id, symbol, qty, client_id: uid };
        return { status: "success", message: "Registered" };
    }

    private startOcoMonitor() {
        const FILLED_STATUSES = ["COMPLETE", "FILLED", "TRADED"];
        const DEAD_STATUSES = ["CANCELLED", "REJECTED", "EXPIRED"];

        this.ocoIntervalId = setInterval(async () => {
            const pairs = Object.entries(this.ocoPairs);
            if (pairs.length === 0) return;

            const clientPairs: Record<string, any[]> = {};
            for (const [entryId, pair] of pairs) {
                if (!clientPairs[pair.client_id]) clientPairs[pair.client_id] = [];
                clientPairs[pair.client_id].push({ entryId, ...pair });
            }

            for (const clientId of Object.keys(clientPairs)) {
                const client = this.mstockClients.get(clientId);
                if (!client || !client.access_token) continue;

                try {
                    const orderBook = await client.getOrderBook();
                    const statusMap: Record<string, string> = {};
                    orderBook.forEach((o: any) => {
                        if (o.order_id) statusMap[o.order_id] = (o.status || "").toUpperCase();
                    });

                    for (const pair of clientPairs[clientId]) {
                        const slStatus = statusMap[pair.sl_id] || "OPEN";
                        const tgtStatus = statusMap[pair.tgt_id] || "OPEN";

                        let filledLeg = null;
                        let cancelId = null;

                        if (FILLED_STATUSES.includes(slStatus)) {
                            filledLeg = "SL";
                            cancelId = pair.tgt_id;
                        } else if (FILLED_STATUSES.includes(tgtStatus)) {
                            filledLeg = "TGT";
                            cancelId = pair.sl_id;
                        } else if (DEAD_STATUSES.includes(slStatus) && DEAD_STATUSES.includes(tgtStatus)) {
                            delete this.ocoPairs[pair.entryId];
                            continue;
                        }

                        if (filledLeg && cancelId) {
                            const res = await client.cancelOrder(cancelId);
                            console.log(`[OCO] ${filledLeg} filled - cancelled ${cancelId}:`, res);
                            this.emit({
                                type: "oco_filled",
                                data: { entry_id: pair.entryId, filled_leg: filledLeg, symbol: pair.symbol, qty: pair.qty }
                            });
                            delete this.ocoPairs[pair.entryId];
                        }
                    }
                } catch (e) {
                    console.error("[OCO Monitor Error]:", e);
                }
            }
        }, 2000);
    }

    async handleMessage(payload: any) {
        if (payload.type === 'auth') {
            const { client_id, access_token } = payload.payload;
            this.dhan = new DhanClient(client_id, access_token);
            const activeIdx = INDEX_CONFIG[this.currentConfig.indexId];
            const exps = await this.dhan.getExpiryList(Number(activeIdx.dhan_id), activeIdx.seg);
            this.currentConfig.expiry = exps[0];
            this.emit({ type: 'expiries', data: exps });
            
            const hist = await this.dhan.getHistory(activeIdx.dhan_id, activeIdx.seg, "INDEX", this.currentConfig.timeframe);
            this.emit({ type: 'history', data: hist, target: 'chart', name: activeIdx.name });

            if (this.intervalId) clearInterval(this.intervalId);
            this.intervalId = setInterval(() => this.streamLoop(), 5000);
            
            this.streamLoop();
        } else if (payload.type === 'module_config') {
            this.currentConfig.moduleConfig = { ...this.currentConfig.moduleConfig, ...payload.payload };
        } else if (payload.type === 'index_change') {
            this.currentConfig.indexId = payload.id;
            const activeIdx = INDEX_CONFIG[this.currentConfig.indexId];
            if (this.dhan) {
                const exps = await this.dhan.getExpiryList(Number(activeIdx.dhan_id), activeIdx.seg);
                this.currentConfig.expiry = exps[0];
                this.emit({ type: 'expiries', data: exps });
                const hist = await this.dhan.getHistory(activeIdx.dhan_id, activeIdx.seg, "INDEX", this.currentConfig.timeframe);
                this.emit({ type: 'history', data: hist, target: 'chart', name: activeIdx.name });
            }
        } else if (payload.type === 'timeframe_change') {
            this.currentConfig.timeframe = payload.timeframe;
            if (this.dhan) {
                const activeIdx = INDEX_CONFIG[this.currentConfig.indexId];
                const hist = await this.dhan.getHistory(activeIdx.dhan_id, activeIdx.seg, "INDEX", this.currentConfig.timeframe);
                this.emit({ type: 'history', data: hist, target: 'chart', name: activeIdx.name });
            }
        } else if (payload.type === 'expiry_change') {
            this.currentConfig.expiry = payload.expiry;
        }
    }

    private async streamLoop() {
        try {
            const mStatus = getMarketStatus();
            const activeIdx = INDEX_CONFIG[this.currentConfig.indexId];
            
            let quotesRes: any = null;
            if (this.dhan) {
                try {
                    const indexIds = Object.values(INDEX_CONFIG).map(c => c.dhan_id);
                    quotesRes = await this.dhan.getQuote(indexIds, activeIdx.seg || "IDX_I");
                } catch (e) {
                    console.error("Dhan Quote Error:", e);
                }
            }

            const idxSpot = Object.entries(INDEX_CONFIG).map(([id, cfg]) => {
                let lp = this.lastSpotMap.get(id) || 0;
                let prevClose = lp;
                
                const q = quotesRes?.[cfg.dhan_id] || quotesRes?.["IDX_I"]?.[cfg.dhan_id] || quotesRes?.["NSE_INDEX"]?.[cfg.dhan_id];
                
                if (q) {
                    lp = q.last_price || q.lastPrice || lp;
                    prevClose = q.ohlc?.close || q.close || lp;
                    if (lp > 0) this.lastSpotMap.set(id, lp);
                }
                
                const change = lp - prevClose;
                return { id, name: cfg.name, spot: Number(lp.toFixed(2)), change: Number(change.toFixed(2)), p_change: Number((lp && prevClose ? (change / prevClose) * 100 : 0).toFixed(2)) };
            });
            this.emit({ type: 'indices_spot', data: idxSpot });

            if (this.currentConfig.moduleConfig.optionChain || this.currentConfig.moduleConfig.gexProfile || this.currentConfig.moduleConfig.combinedGex) {
                let spot = idxSpot.find(i => i.id === this.currentConfig.indexId)?.spot || 0;
                const now = Date.now();

                if (this.dhan && this.currentConfig.expiry && (now - this.lastChainUpdate > this.CHAIN_REFRESH_MS || this.cachedChain.length === 0)) {
                    try {
                        await new Promise(resolve => setTimeout(resolve, 500)); 
                        
                        const newChain = await this.dhan.getOptionChain(Number(activeIdx.dhan_id), activeIdx.seg || "IDX_I", this.currentConfig.expiry);
                        if (newChain && newChain.length > 0) {
                            this.cachedChain = newChain;
                            this.lastChainUpdate = now;
                        }
                    } catch (e: any) {
                        console.error("Dhan Chain Error:", e.message || e);
                    }
                } 
                
                const chain = this.cachedChain;
                
                if (chain && chain.length > 0) {
                    if (spot === 0) spot = chain[Math.floor(chain.length/2)].Strike;
                    
                    let dte = 5;
                    if (this.currentConfig.expiry) {
                        try {
                            const expDate = new Date(this.currentConfig.expiry);
                            dte = Math.max(0.1, (expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        } catch(e) { dte = 5; }
                    }
                    
                    const ceGex = chain.map(r => ({ ...r, type: 'CE' as const, ltp: r.Call_LTP, oi: r.Call_OI, iv: r.Call_IV, delta: r.Call_Delta, gamma: r.Call_Gamma }));
                    const peGex = chain.map(r => ({ ...r, type: 'PE' as const, ltp: r.Put_LTP, oi: r.Put_OI, iv: r.Put_IV, delta: r.Put_Delta, gamma: r.Put_Gamma }));
                    const gexData = computeGex([...ceGex, ...peGex] as any, spot, dte, activeIdx.lot);

                    const { pcr, maxPain } = computePcrAndMaxPain(chain);
                    const { callWall, putWall, regime } = computeWallsAndRegime(chain.map(r => ({ ...r, netGex: (r.Call_Gamma * r.Call_OI) - (r.Put_Gamma * r.Put_OI), callOi: r.Call_OI, putOi: r.Put_OI })));

                    this.emit({
                        type: 'data',
                        spot,
                        chain: chain.slice(Math.max(0, Math.floor(chain.length/2 - this.currentConfig.gexNum/2)), Math.floor(chain.length/2 + this.currentConfig.gexNum/2)),
                        gex: gexData,
                        pcr,
                        max_pain: maxPain,
                        call_wall: callWall,
                        put_wall: putWall,
                        regime,
                        market_status: mStatus.status,
                        market_on: mStatus.on
                    });
                } else {
                    this.emit({ type: 'data', spot, chain: [], market_status: mStatus.status, market_on: mStatus.on });
                }
            } else {
                this.emit({
                    type: 'data',
                    spot: idxSpot.find(i => i.id === this.currentConfig.indexId)?.spot || 0,
                    market_status: mStatus.status,
                    market_on: mStatus.on
                });
            }
        } catch (e) {
            console.error("WS Loop Error:", e);
        }
    }
}

export const localAppServer = new LocalServer();
