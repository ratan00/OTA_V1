import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import dotenv from "dotenv";
import { DhanClient } from "./server/dhanClient";
import { MStockClient } from "./server/mstockClient";
import { computeGex, findGammaFlip, computeWallsAndRegime, computePcrAndMaxPain } from "./server/analytics";

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = 3000;

app.use(express.json());

// Global Clients Store
const mstockClients = new Map<string, MStockClient>();

const INDEX_CONFIG: Record<string, any> = {
    "13": { name: "NIFTY", dhan_id: "13", seg: "IDX_I", lot: 75 },
    "25": { name: "BANKNIFTY", dhan_id: "25", seg: "IDX_I", lot: 15 },
    "27": { name: "FINNIFTY", dhan_id: "27", seg: "IDX_I", lot: 25 },
    "51": { name: "MIDCPNIFTY", dhan_id: "51", seg: "IDX_I", lot: 50 },
    "1":  { name: "SENSEX", dhan_id: "1", seg: "IDX_I", lot: 10 },
    "12": { name: "BANKEX", dhan_id: "12", seg: "IDX_I", lot: 15 },
    "14": { name: "NIFTYNXT50", dhan_id: "14", seg: "IDX_I", lot: 25 }
};

// --- Synthetic OCO Monitor ---
const ocoPairs: Record<string, any> = {}; // {entry_id: {sl_id, tgt_id, symbol, qty, client_id}}

async function startOcoMonitor() {
    const FILLED_STATUSES = ["COMPLETE", "FILLED", "TRADED"];
    const DEAD_STATUSES = ["CANCELLED", "REJECTED", "EXPIRED"];

    setInterval(async () => {
        const pairs = Object.entries(ocoPairs);
        if (pairs.length === 0) return;

        // Group pairs by client to fetch orderbook once per client
        const clientPairs: Record<string, any[]> = {};
        for (const [entryId, pair] of pairs) {
            if (!clientPairs[pair.client_id]) clientPairs[pair.client_id] = [];
            clientPairs[pair.client_id].push({ entryId, ...pair });
        }

        for (const clientId of Object.keys(clientPairs)) {
            const client = mstockClients.get(clientId);
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
                        delete ocoPairs[pair.entryId];
                        continue;
                    }

                    if (filledLeg && cancelId) {
                        const res = await client.cancelOrder(cancelId);
                        console.log(`[OCO] ${filledLeg} filled - cancelled ${cancelId}:`, res);
                        
                        // Notify WS clients
                        wss.clients.forEach(wsClient => {
                            if (wsClient.readyState === WebSocket.OPEN) {
                                wsClient.send(JSON.stringify({
                                    type: "oco_filled",
                                    data: { entry_id: pair.entryId, filled_leg: filledLeg, symbol: pair.symbol, qty: pair.qty }
                                }));
                            }
                        });
                        delete ocoPairs[pair.entryId];
                    }
                }
            } catch (e) {
                console.error("[OCO Monitor Error]:", e);
            }
        }
    }, 2000);
}

// --- Market Status ---
function getMarketStatus() {
    const now = new Date();
    const istOffset = 330; 
    const istDate = new Date(now.getTime() + (istOffset * 60000));
    const day = istDate.getUTCDay();
    const hour = istDate.getUTCHours();
    const min = istDate.getUTCMinutes();
    const totalMin = hour * 60 + min;

    // Weekends
    if (day === 0 || day === 6) return { status: "closed", on: false };
    
    // Normal Trading Hours (NSE/BSE)
    // Pre-market: 09:00 - 09:15 (540 - 555)
    if (totalMin >= 540 && totalMin < 555) return { status: "pre-market", on: false };
    
    // Normal Session: 09:15 - 15:30 (555 - 930)
    // Using <= 930 to include exactly 15:30
    if (totalMin >= 555 && totalMin <= 930) return { status: "open", on: true };
    
    // Post-market: 15:40 - 16:00 (940 - 960)
    if (totalMin >= 940 && totalMin <= 960) return { status: "post-market", on: false };

    return { status: "closed", on: false };
}

// --- API Routes ---
app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.post("/api/mstock/login", async (req, res) => {
    const { user_id, password, api_key } = req.body;
    const client = new MStockClient(api_key, user_id, password);
    const result = await client.loginStep1();
    if (result.status === "success") {
        mstockClients.set(user_id, client);
    }
    res.json(result);
});

app.post("/api/mstock/verify-totp", async (req, res) => {
    const { user_id, api_key, totp } = req.body;
    let client = mstockClients.get(user_id);
    if (!client) client = new MStockClient(api_key, user_id);
    const result = await client.verifyTotp(totp);
    if (result.status === "success") {
        mstockClients.set(user_id, client);
    }
    res.json(result);
});

app.get("/api/mstock/funds", async (req, res) => {
    const userId = (req.headers['x-user-id'] as string) || mstockClients.keys().next().value;
    const client = mstockClients.get(userId);
    if (!client) return res.status(401).json({ status: "error", message: "Not logged in" });
    const funds = await client.getFunds();
    res.json({ status: "success", funds });
});

app.get("/api/mstock/positions", async (req, res) => {
    const userId = (req.headers['x-user-id'] as string) || mstockClients.keys().next().value;
    const client = mstockClients.get(userId);
    if (!client) return res.status(401).json({ status: "error", message: "Not logged in" });
    const positions = await client.getPositions();
    res.json({ status: "success", positions });
});

app.post("/api/mstock/place-order", async (req, res) => {
    const userId = (req.headers['x-user-id'] as string) || mstockClients.keys().next().value;
    const client = mstockClients.get(userId);
    if (!client) return res.status(401).json({ status: "error", message: "Not logged in" });
    const result = await client.placeOrder(req.body);
    res.json(result);
});

app.post("/api/mstock/register-oco", async (req, res) => {
    const userId = (req.headers['x-user-id'] as string) || mstockClients.keys().next().value;
    const { entry_order_id, sl_order_id, tgt_order_id, symbol, qty } = req.body;
    ocoPairs[entry_order_id] = { sl_id: sl_order_id, tgt_id: tgt_order_id, symbol, qty, client_id: userId };
    res.json({ status: "success", message: "Registered" });
});

app.post("/api/dhan/renew-token", async (req, res) => {
    // Stub for frontend call
    res.json({ status: "success", message: "Token renewal is handled via direct login in this version" });
});

app.get("/api/cache/clear", async (req, res) => {
    res.json({ status: "success", message: "Cache cleared" });
});

// --- WebSocket Streaming Loop ---
wss.on("connection", (ws: any) => {
    console.log("New terminal client connected");
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    let dhan: DhanClient | null = null;
    let currentConfig = {
        indexId: "13",
        expiry: "",
        timeframe: "1D" as number | string,
        gexNum: 30,
        moduleConfig: { optionChain: true, gexProfile: true, combinedGex: false }
    };

    let intervalId: NodeJS.Timeout | null = null;
    let lastChainUpdate = 0;
    const CHAIN_REFRESH_MS = 60000; // Refresh option chain every 60 seconds to avoid 429
    let cachedChain: any[] = [];
    const lastSpotMap = new Map<string, number>();

    const streamLoop = async () => {
        try {
            const mStatus = getMarketStatus();
            const activeIdx = INDEX_CONFIG[currentConfig.indexId];
            
            let quotesRes: any = null;
            if (dhan) {
                try {
                    const indexIds = Object.values(INDEX_CONFIG).map(c => c.dhan_id);
                    // For quotes, Dhan usually expects segmentId as NSE_INDEX or IDX_I
                    quotesRes = await dhan.getQuote(indexIds, activeIdx.seg || "IDX_I");
                } catch (e) {
                    console.error("Dhan Quote Error:", e);
                }
            }

            const idxSpot = Object.entries(INDEX_CONFIG).map(([id, cfg]) => {
                let lp = lastSpotMap.get(id) || 0;
                let prevClose = lp;
                
                // Dhan Quote API v2 can return data flattened or nested by segment
                const q = quotesRes?.[cfg.dhan_id] || quotesRes?.["IDX_I"]?.[cfg.dhan_id] || quotesRes?.["NSE_INDEX"]?.[cfg.dhan_id];
                
                if (q) {
                    lp = q.last_price || q.lastPrice || lp;
                    prevClose = q.ohlc?.close || q.close || lp;
                    if (lp > 0) lastSpotMap.set(id, lp);
                }
                
                const change = lp - prevClose;
                return { id, name: cfg.name, spot: Number(lp.toFixed(2)), change: Number(change.toFixed(2)), p_change: Number((lp && prevClose ? (change / prevClose) * 100 : 0).toFixed(2)) };
            });
            ws.send(JSON.stringify({ type: 'indices_spot', data: idxSpot }));

            if (currentConfig.moduleConfig.optionChain || currentConfig.moduleConfig.gexProfile || currentConfig.moduleConfig.combinedGex) {
                let spot = idxSpot.find(i => i.id === currentConfig.indexId)?.spot || 0;
                const now = Date.now();

                if (dhan && currentConfig.expiry && (now - lastChainUpdate > CHAIN_REFRESH_MS || cachedChain.length === 0)) {
                    try {
                        // Add a small delay between Quote and OptionChain calls
                        await new Promise(resolve => setTimeout(resolve, 500)); 
                        
                        const newChain = await dhan.getOptionChain(Number(activeIdx.dhan_id), activeIdx.seg || "IDX_I", currentConfig.expiry);
                        if (newChain && newChain.length > 0) {
                            cachedChain = newChain;
                            lastChainUpdate = now;
                        }
                    } catch (e: any) {
                        console.error("Dhan Chain Error:", e.message || e);
                    }
                } 
                
                const chain = cachedChain;
                
                if (chain && chain.length > 0) {
                    if (spot === 0) spot = chain[Math.floor(chain.length/2)].Strike;
                    
                    // Calculate DTE
                    let dte = 5;
                    if (currentConfig.expiry) {
                        try {
                            const expDate = new Date(currentConfig.expiry);
                            dte = Math.max(0.1, (expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        } catch(e) { dte = 5; }
                    }
                    
                    const ceGex = chain.map(r => ({
                        strike: r.Strike, type: 'CE' as const, ltp: r.Call_LTP, oi: r.Call_OI, iv: r.Call_IV, delta: r.Call_Delta, gamma: r.Call_Gamma
                    }));
                    const peGex = chain.map(r => ({
                        strike: r.Strike, type: 'PE' as const, ltp: r.Put_LTP, oi: r.Put_OI, iv: r.Put_IV, delta: r.Put_Delta, gamma: r.Put_Gamma
                    }));
                    const gexData = computeGex([...ceGex, ...peGex] as any, spot, dte, activeIdx.lot);

                    const { pcr, maxPain } = computePcrAndMaxPain(chain);
                    const { callWall, putWall, regime } = computeWallsAndRegime(chain.map(r => ({ ...r, netGex: (r.Call_Gamma * r.Call_OI) - (r.Put_Gamma * r.Put_OI), callOi: r.Call_OI, putOi: r.Put_OI })));

                    ws.send(JSON.stringify({
                        type: 'data',
                        spot,
                        chain: chain.slice(Math.max(0, Math.floor(chain.length/2 - currentConfig.gexNum/2)), Math.floor(chain.length/2 + currentConfig.gexNum/2)),
                        gex: gexData,
                        pcr,
                        max_pain: maxPain,
                        call_wall: callWall,
                        put_wall: putWall,
                        regime,
                        market_status: mStatus.status,
                        market_on: mStatus.on
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type: 'data',
                        spot,
                        chain: [],
                        market_status: mStatus.status,
                        market_on: mStatus.on
                    }));
                }
            } else {
                ws.send(JSON.stringify({
                    type: 'data',
                    spot: idxSpot.find(i => i.id === currentConfig.indexId)?.spot || 0,
                    market_status: mStatus.status,
                    market_on: mStatus.on
                }));
            }
        } catch (e) {
            console.error("WS Loop Error:", e);
        }
    };
    
    // Do not start loop until dhan is connected to avoid empty updates
    // intervalId = setInterval(streamLoop, 2000);
    // streamLoop();

    ws.on("message", async (msg: string) => {
        try {
            const payload = JSON.parse(msg);
            if (payload.type === 'auth') {
                const { client_id, access_token } = payload.payload;
                dhan = new DhanClient(client_id, access_token);
                const exps = await dhan.getExpiryList(Number(INDEX_CONFIG[currentConfig.indexId].dhan_id), INDEX_CONFIG[currentConfig.indexId].seg);
                currentConfig.expiry = exps[0];
                ws.send(JSON.stringify({ type: 'expiries', data: exps }));
                
                const hist = await dhan.getHistory(INDEX_CONFIG[currentConfig.indexId].dhan_id, INDEX_CONFIG[currentConfig.indexId].seg, "INDEX", currentConfig.timeframe);
                ws.send(JSON.stringify({ type: 'history', data: hist, target: 'chart', name: INDEX_CONFIG[currentConfig.indexId].name }));

                if (intervalId) clearInterval(intervalId);
                intervalId = setInterval(streamLoop, 5000); // 5s interval to avoid 429
                
                // Force immediate update with new dhan client
                streamLoop();
            } else if (payload.type === 'module_config') {
                currentConfig.moduleConfig = { ...currentConfig.moduleConfig, ...payload.payload };
            } else if (payload.type === 'index_change') {
                currentConfig.indexId = payload.id;
                if (dhan) {
                    const exps = await dhan.getExpiryList(Number(INDEX_CONFIG[currentConfig.indexId].dhan_id), INDEX_CONFIG[currentConfig.indexId].seg);
                    currentConfig.expiry = exps[0];
                    ws.send(JSON.stringify({ type: 'expiries', data: exps }));
                    const hist = await dhan.getHistory(INDEX_CONFIG[currentConfig.indexId].dhan_id, INDEX_CONFIG[currentConfig.indexId].seg, "INDEX", currentConfig.timeframe);
                    ws.send(JSON.stringify({ type: 'history', data: hist, target: 'chart', name: INDEX_CONFIG[currentConfig.indexId].name }));
                }
            } else if (payload.type === 'timeframe_change') {
                currentConfig.timeframe = payload.timeframe;
                if (dhan) {
                    const hist = await dhan.getHistory(INDEX_CONFIG[currentConfig.indexId].dhan_id, INDEX_CONFIG[currentConfig.indexId].seg, "INDEX", currentConfig.timeframe);
                    ws.send(JSON.stringify({ type: 'history', data: hist, target: 'chart', name: INDEX_CONFIG[currentConfig.indexId].name }));
                }
            }
 else if (payload.type === 'expiry_change') {
                currentConfig.expiry = payload.expiry;
            }
        } catch (e) {}
    });

    ws.on("close", () => {
        if (intervalId) clearInterval(intervalId);
    });
});

async function startServer() {
    if (process.env.NODE_ENV !== "production") {
        const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
        app.use(vite.middlewares);
    } else {
        const distPath = path.join(process.cwd(), "dist");
        app.use(express.static(distPath));
        app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
    }

    server.listen(PORT, "0.0.0.0", () => {
        console.log(`Live Trading Server running on port ${PORT}`);
        startOcoMonitor();
    });
}

startServer();
