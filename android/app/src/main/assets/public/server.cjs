var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server.ts
var import_express = __toESM(require("express"), 1);
var import_path = __toESM(require("path"), 1);
var import_vite = require("vite");
var import_http = __toESM(require("http"), 1);
var import_ws = require("ws");
var import_dotenv = __toESM(require("dotenv"), 1);

// src/server/dhan.ts
var import_axios = __toESM(require("axios"), 1);
var import_date_fns = require("date-fns");
var DhanClient = class {
  constructor(clientId, accessToken) {
    this.baseUrl = "https://api.dhan.co";
    this.clientId = clientId;
    this.accessToken = accessToken;
  }
  get headers() {
    return {
      "access-token": this.accessToken,
      "client-id": this.clientId,
      "Content-Type": "application/json"
    };
  }
  unwrap(response) {
    if (!response || response.status !== "success") return null;
    let data = response.data;
    if (data && data.status === "success" && data.data) return data.data;
    if (data && data.data && Object.keys(data).length === 1) return data.data;
    return data;
  }
  async getQuoteBatch(query) {
    try {
      const res = await import_axios.default.post(`${this.baseUrl}/marketfeed/quote`, query, { headers: this.headers });
      return this.unwrap(res.data);
    } catch (e) {
      console.error("Dhan Quote Error", e);
      return null;
    }
  }
  async getHistory(securityId, segment, instType, timeframe) {
    try {
      const toDate = /* @__PURE__ */ new Date();
      const fromDate = (0, import_date_fns.subDays)(toDate, 7);
      const payload = {
        symbol: securityId,
        exchangeSegment: segment,
        instrumentType: instType,
        expiryCode: 0,
        fromDate: (0, import_date_fns.format)(fromDate, "yyyy-MM-dd HH:mm:ss"),
        toDate: (0, import_date_fns.format)(toDate, "yyyy-MM-dd HH:mm:ss")
      };
      const res = await import_axios.default.post(`${this.baseUrl}/charts/intraday`, payload, { headers: this.headers });
      const data = this.unwrap(res.data);
      if (!data || !data.timestamp) return [];
      const history = data.timestamp.map((t, i) => ({
        time: t,
        open: data.open[i],
        high: data.high[i],
        low: data.low[i],
        close: data.close[i],
        volume: data.volume[i]
      }));
      if (typeof timeframe === "number" && timeframe > 1) {
        return this.aggregateOHLC(history, timeframe);
      }
      return history;
    } catch (e) {
      console.error("Dhan History Error", e);
      return [];
    }
  }
  aggregateOHLC(bars, tf) {
    if (bars.length === 0) return [];
    const windowSec = tf * 60;
    const aggregated = [];
    let currentBar = null;
    for (const bar of bars) {
      const windowStart = Math.floor(bar.time / windowSec) * windowSec;
      if (!currentBar || windowStart !== currentBar.time) {
        if (currentBar) aggregated.append(currentBar);
        currentBar = { ...bar, time: windowStart };
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
  async getOptionChain(securityId, segment, expiry) {
    try {
      const payload = {
        underlyingId: securityId,
        underlyingSegment: segment,
        expiry
      };
      const res = await import_axios.default.post(`${this.baseUrl}/optionchain`, payload, { headers: this.headers });
      const unwrapped = this.unwrap(res.data);
      if (!unwrapped) return [];
      const oc = unwrapped.oc || unwrapped;
      const rows = [];
      const strikeKeys = Object.keys(oc);
      for (const strike of strikeKeys) {
        const item = oc[strike];
        const row = { Strike: parseFloat(strike) };
        if (item.ce) {
          row.Call_OI = item.ce.oi || 0;
          row.Call_LTP = item.ce.last_price || 0;
          row.Call_IV = item.ce.implied_volatility || 0;
          row.Call_Delta = item.ce.greeks?.delta || 0;
          row.Call_SecurityId = item.ce.security_id;
          row.Call_Symbol = item.ce.trading_symbol;
        }
        if (item.pe) {
          row.Put_OI = item.pe.oi || 0;
          row.Put_LTP = item.pe.last_price || 0;
          row.Put_IV = item.pe.implied_volatility || 0;
          row.Put_Delta = item.pe.greeks?.delta || 0;
          row.Put_SecurityId = item.pe.security_id;
          row.Put_Symbol = item.pe.trading_symbol;
        }
        rows.push(row);
      }
      return rows.sort((a, b) => a.Strike - b.Strike);
    } catch (e) {
      console.error("Dhan Option Chain Error", e);
      return [];
    }
  }
  async getExpiryList(securityId, segment) {
    try {
      const res = await import_axios.default.post(`${this.baseUrl}/optionchain/expiry`, { underlyingId: securityId, underlyingSegment: segment }, { headers: this.headers });
      return this.unwrap(res.data) || [];
    } catch (e) {
      return [];
    }
  }
};

// src/server/mstock.ts
var import_axios2 = __toESM(require("axios"), 1);
var import_qs = __toESM(require("qs"), 1);
var MStockClient = class {
  constructor() {
    this.baseUrl = "https://api.mstock.trade/openapi/typea";
    this.apiKey = "";
    this.userId = "";
    this.password = "";
    this.accessToken = "";
  }
  get headers() {
    return {
      "Authorization": `token ${this.apiKey}:${this.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded"
    };
  }
  async loginStep1(userId, pass) {
    this.userId = userId;
    this.password = pass;
    try {
      const res = await import_axios2.default.post(`${this.baseUrl}/connect/login`, import_qs.default.stringify({
        userId: this.userId,
        password: this.password
      }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      return res.data;
    } catch (e) {
      return { status: "error", message: e.message };
    }
  }
  async verifyTOTP(apiKey, totp) {
    this.apiKey = apiKey;
    try {
      const res = await import_axios2.default.post(`${this.baseUrl}/session/verifytotp`, import_qs.default.stringify({
        userId: this.userId,
        totp
      }), { headers: { "Content-Type": "application/x-www-form-urlencoded" } });
      if (res.data.status === "success") {
        this.accessToken = res.data.data.accessToken;
      }
      return res.data;
    } catch (e) {
      return { status: "error", message: e.message };
    }
  }
  async placeOrder(symbol, qty, side, price, orderType, exchange = null, trigger_price = 0) {
    if (!exchange) exchange = this.detectExchange(symbol);
    const payload = {
      tradingsymbol: symbol,
      exchange,
      transaction_type: side,
      quantity: qty,
      price,
      trigger_price,
      product: "MIS",
      order_type: orderType,
      validity: "DAY"
    };
    try {
      const res = await import_axios2.default.post(`${this.baseUrl}/orders/regular`, import_qs.default.stringify(payload), { headers: this.headers });
      return res.data;
    } catch (e) {
      return { status: "error", message: e.message };
    }
  }
  async cancelOrder(orderId) {
    try {
      const res = await import_axios2.default.delete(`${this.baseUrl}/orders/regular/${orderId}`, { headers: this.headers });
      return res.data;
    } catch (e) {
      return { status: "error", message: e.message };
    }
  }
  async getPositions() {
    try {
      const res = await import_axios2.default.get(`${this.baseUrl}/portfolio/positions`, { headers: this.headers });
      return res.data;
    } catch (e) {
      return { status: "error", message: e.message };
    }
  }
  async getFunds() {
    try {
      const res = await import_axios2.default.get(`${this.baseUrl}/funds/limit`, { headers: this.headers });
      return res.data?.data?.available_margin || 0;
    } catch (e) {
      return 0;
    }
  }
  async getOrderBook() {
    try {
      const res = await import_axios2.default.get(`${this.baseUrl}/orders`, { headers: this.headers });
      return res.data?.data || [];
    } catch (e) {
      return [];
    }
  }
  detectExchange(symbol) {
    const nfoIndices = ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY", "NIFTYNXT50"];
    const bfoIndices = ["SENSEX", "BANKEX"];
    for (const idx of nfoIndices) if (symbol.startsWith(idx)) return "NFO";
    for (const idx of bfoIndices) if (symbol.startsWith(idx)) return "BFO";
    return "NSE";
  }
};

// src/server/analytics.ts
var import_jstat = require("jstat");
var RISK_FREE = 0.065;
var DEFAULT_IV = 0.15;
function bsGamma(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  return import_jstat.jStat.normal.pdf(d1, 0, 1) / (S * sigma * Math.sqrt(T));
}
function bsVanna(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  return -import_jstat.jStat.normal.pdf(d1, 0, 1) * d2 / sigma;
}
function bsVolga(S, K, T, r, sigma) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  const vega = S * Math.sqrt(T) * import_jstat.jStat.normal.pdf(d1, 0, 1) * 0.01;
  return vega * d1 * d2 / sigma;
}
function bsCharm(S, K, T, r, sigma, isCall) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  const d2 = d1 - sigma * Math.sqrt(T);
  let charm = -import_jstat.jStat.normal.pdf(d1, 0, 1) * (r / (sigma * Math.sqrt(T)) - d2 / (2 * T));
  if (!isCall) {
    charm = charm + RISK_FREE * Math.exp(-RISK_FREE * T);
  }
  return charm / 365;
}
function bsDelta(S, K, T, r, sigma, isCall) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return isCall ? 0.5 : -0.5;
  const d1 = (Math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * Math.sqrt(T));
  if (isCall) return import_jstat.jStat.normal.cdf(d1, 0, 1);
  return import_jstat.jStat.normal.cdf(d1, 0, 1) - 1;
}
function computeGex(df, spot, dte, lotSize, iv = DEFAULT_IV) {
  const T = Math.max(dte / 365, 1 / 365);
  const multiplier = spot ** 2 * lotSize * 1e-4 / 1e7;
  const vannaMultiplier = spot * lotSize * 0.01 / 1e7;
  const volgaMultiplier = lotSize * 0.01 / 1e7;
  const charmMultiplier = spot * lotSize * 100 / 1e7;
  return df.map((row) => {
    const avgIv = ((row.Call_IV || 0) + (row.Put_IV || 0)) / 200 || iv;
    const gamma = bsGamma(spot, row.Strike, T, RISK_FREE, avgIv);
    const vanna = bsVanna(spot, row.Strike, T, RISK_FREE, avgIv);
    const volga = bsVolga(spot, row.Strike, T, RISK_FREE, avgIv);
    const cCharm = bsCharm(spot, row.Strike, T, RISK_FREE, avgIv, true);
    const pCharm = bsCharm(spot, row.Strike, T, RISK_FREE, avgIv, false);
    let cDelta = row.Call_Delta;
    if (cDelta === void 0 || cDelta === null) cDelta = bsDelta(spot, row.Strike, T, RISK_FREE, avgIv, true);
    let pDelta = row.Put_Delta;
    if (pDelta === void 0 || pDelta === null) pDelta = bsDelta(spot, row.Strike, T, RISK_FREE, avgIv, false);
    const callGex = gamma * (row.Call_OI || 0) * multiplier;
    const putGex = -gamma * (row.Put_OI || 0) * multiplier;
    const callVanna = vanna * (row.Call_OI || 0) * vannaMultiplier;
    const putVanna = -vanna * (row.Put_OI || 0) * vannaMultiplier;
    const callVolga = volga * (row.Call_OI || 0) * volgaMultiplier;
    const putVolga = -volga * (row.Put_OI || 0) * volgaMultiplier;
    const netCharm = (cCharm * (row.Call_OI || 0) - pCharm * (row.Put_OI || 0)) * charmMultiplier;
    return {
      ...row,
      Gamma: gamma,
      Vanna: vanna,
      Volga: volga,
      Call_Charm: cCharm,
      Put_Charm: pCharm,
      Call_Delta: cDelta,
      Put_Delta: pDelta,
      Call_GEX: callGex,
      Put_GEX: putGex,
      Net_GEX: callGex + putGex,
      Call_Vanna: callVanna,
      Put_Vanna: putVanna,
      Net_Vanna: callVanna + putVanna,
      Call_Volga: callVolga,
      Put_Volga: putVolga,
      Net_Volga: callVolga + putVolga,
      Net_Charm: netCharm
    };
  });
}
function findGammaFlip(df) {
  if (df.length === 0) return null;
  const sorted = [...df].sort((a, b) => a.Strike - b.Strike);
  for (let i = 0; i < sorted.length - 1; i++) {
    const g0 = sorted[i].Net_GEX;
    const g1 = sorted[i + 1].Net_GEX;
    if (g0 * g1 < 0) {
      const k0 = sorted[i].Strike;
      const k1 = sorted[i + 1].Strike;
      const flipPrice = k0 + (k1 - k0) * -g0 / (g1 - g0);
      return Math.round(flipPrice * 100) / 100;
    }
  }
  return null;
}
function computeWallsAndRegime(df) {
  if (df.length === 0) return { callWall: 0, putWall: 0, callWall2: 0, putWall2: 0, regime: "Unknown" };
  const posGex = df.filter((r) => r.Net_GEX > 0).sort((a, b) => b.Net_GEX - a.Net_GEX);
  const negGex = df.filter((r) => r.Net_GEX < 0).sort((a, b) => a.Net_GEX - b.Net_GEX);
  const totalNetGex = df.reduce((acc, r) => acc + r.Net_GEX, 0);
  return {
    callWall: posGex[0]?.Strike || 0,
    callWall2: posGex[1]?.Strike || 0,
    putWall: negGex[0]?.Strike || 0,
    putWall2: negGex[1]?.Strike || 0,
    regime: totalNetGex > 0 ? "Stabilizing" : "Volatile"
  };
}
function computePcrMaxPain(df) {
  if (df.length === 0) return { pcr: 0, maxPain: 0 };
  const totalCallOi = df.reduce((acc, r) => acc + (r.Call_OI || 0), 0);
  const totalPutOi = df.reduce((acc, r) => acc + (r.Put_OI || 0), 0);
  const pcr = totalCallOi > 0 ? totalPutOi / totalCallOi : 0;
  let minPain = Infinity;
  let maxPainStrike = 0;
  const strikes = df.map((r) => r.Strike);
  for (const candidate of strikes) {
    let pain = 0;
    for (const row of df) {
      pain += Math.max(0, candidate - row.Strike) * (row.Call_OI || 0);
      pain += Math.max(0, row.Strike - candidate) * (row.Put_OI || 0);
    }
    if (pain < minPain) {
      minPain = pain;
      maxPainStrike = candidate;
    }
  }
  return { pcr: Math.round(pcr * 1e3) / 1e3, maxPain: maxPainStrike };
}

// server.ts
import_dotenv.default.config();
var app = (0, import_express.default)();
var server = import_http.default.createServer(app);
var wss = new import_ws.WebSocketServer({ server, path: "/ws" });
var PORT = 3e3;
app.use(import_express.default.json());
var mstockClient = new MStockClient();
var activeWebsockets = /* @__PURE__ */ new Set();
var ocoPairs = {};
var INDEX_CONFIG = {
  13: { name: "NIFTY 50", seg: "IDX_I", lot: 65, step: 50, opt_seg: "NSE_FNO", dhan_id: "13" },
  25: { name: "BANK NIFTY", seg: "IDX_I", lot: 30, step: 100, opt_seg: "NSE_FNO", dhan_id: "25" },
  27: { name: "FIN NIFTY", seg: "IDX_I", lot: 60, step: 50, opt_seg: "NSE_FNO", dhan_id: "27" },
  14: { name: "NIFTY NEXT 50", seg: "IDX_I", lot: 25, step: 50, opt_seg: "NSE_FNO", dhan_id: "14" },
  51: { name: "MIDCP NIFTY", seg: "IDX_I", lot: 120, step: 25, opt_seg: "NSE_FNO", dhan_id: "442" },
  1: { name: "SENSEX", seg: "IDX_I", lot: 20, step: 100, opt_seg: "BSE_FNO", dhan_id: "51" },
  12: { name: "BANKEX", seg: "IDX_I", lot: 30, step: 100, opt_seg: "BSE_FNO", dhan_id: "69" }
};
function getMarketStatus() {
  const now = /* @__PURE__ */ new Date();
  const istOffset = 5.5 * 60 * 60 * 1e3;
  const nowIst = new Date(now.getTime() + istOffset);
  const day = nowIst.getUTCDay();
  if (day === 0 || day === 6) return "closed";
  const hours = nowIst.getUTCHours();
  const minutes = nowIst.getUTCMinutes();
  const currentMin = hours * 60 + minutes;
  const preStart = 9 * 60;
  const liveStart = 9 * 60 + 15;
  const marketEnd = 15 * 60 + 30;
  const dateStr = nowIst.toISOString().split("T")[0];
  const holidays = ["2026-01-26", "2026-03-06", "2026-04-02", "2026-04-14", "2026-05-01", "2026-08-15", "2026-10-02", "2026-12-25"];
  if (holidays.includes(dateStr)) return "closed";
  if (currentMin >= preStart && currentMin < liveStart) return "pre-market";
  if (currentMin >= liveStart && currentMin <= marketEnd) return "open";
  return "closed";
}
async function startOcoMonitor() {
  const FILLED_STATUSES = ["COMPLETE", "FILLED", "TRADED"];
  const DEAD_STATUSES = ["CANCELLED", "REJECTED", "EXPIRED"];
  setInterval(async () => {
    try {
      const pairKeys = Object.keys(ocoPairs);
      if (pairKeys.length > 0 && mstockClient.accessToken) {
        const orderBook = await mstockClient.getOrderBook();
        const statusMap = {};
        orderBook.forEach((o) => {
          if (o.order_id) statusMap[String(o.order_id)] = String(o.status).toUpperCase();
        });
        for (const entryId of pairKeys) {
          const pair = ocoPairs[entryId];
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
            delete ocoPairs[entryId];
            continue;
          }
          if (filledLeg && cancelId) {
            const cancelRes = await mstockClient.cancelOrder(cancelId);
            console.log(`[OCO] ${filledLeg} filled. Cancelled ${cancelId}: ${JSON.stringify(cancelRes)}`);
            const msg = JSON.stringify({
              type: "oco_filled",
              data: {
                entry_id: entryId,
                filled_leg: filledLeg,
                symbol: pair.symbol,
                qty: pair.qty,
                cancelled_id: cancelId,
                cancel_result: cancelRes.status || "unknown"
              }
            });
            activeWebsockets.forEach((ws) => {
              if (ws.readyState === import_ws.WebSocket.OPEN) ws.send(msg);
            });
            delete ocoPairs[entryId];
          }
        }
      }
    } catch (e) {
      console.error("[OCO Monitor] Error:", e);
    }
  }, 2e3);
}
async function startMarketDataStream(ws, client_id, access_token) {
  const dhan = new DhanClient(client_id, access_token);
  let current_index_id = 13;
  let current_expiry = null;
  let current_timeframe = "1D";
  let current_gex_num = 30;
  let last_quote_fetch = 0;
  let last_chain_fetch = 0;
  let last_spot = 0;
  let last_analytics_ts = 0;
  let forming_candle = null;
  const state = {
    pending_index: null,
    pending_expiry: null,
    pending_timeframe: null,
    pending_gex_num: null,
    pending_chart_inst: null,
    has_active_orders: false,
    active_position_ids: {},
    force_refresh: false
  };
  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "select_index") state.pending_index = data.payload;
      if (data.type === "select_expiry") state.pending_expiry = data.payload;
      if (data.type === "select_timeframe") state.pending_timeframe = data.payload;
      if (data.type === "select_gex_strikes") state.pending_gex_num = data.payload;
      if (data.type === "select_chart_instrument") state.pending_chart_inst = data.payload;
      if (data.type === "has_active_orders") state.has_active_orders = data.payload;
      if (data.type === "active_position_ids") state.active_position_ids = data.payload;
      if (data.type === "refresh_gex") state.force_refresh = true;
    } catch (e) {
    }
  });
  const expiries = await dhan.getExpiryList(Number(INDEX_CONFIG[current_index_id].dhan_id), "IDX_I");
  if (expiries.length > 0) {
    current_expiry = expiries[0];
    ws.send(JSON.stringify({ type: "expiries", data: expiries }));
  }
  const interval = setInterval(async () => {
    if (ws.readyState !== import_ws.WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }
    try {
      const mStatus = getMarketStatus();
      const marketActive = mStatus === "open";
      const now = Date.now();
      if (state.pending_index) {
        current_index_id = Number(state.pending_index);
        state.pending_index = null;
        const newExpiries = await dhan.getExpiryList(Number(INDEX_CONFIG[current_index_id].dhan_id), "IDX_I");
        if (newExpiries.length > 0) {
          current_expiry = newExpiries[0];
          ws.send(JSON.stringify({ type: "expiries", data: newExpiries }));
        }
        state.force_refresh = true;
      }
      if (state.pending_expiry) {
        current_expiry = state.pending_expiry;
        state.pending_expiry = null;
        state.force_refresh = true;
      }
      if (state.pending_timeframe) {
        current_timeframe = state.pending_timeframe;
        state.pending_timeframe = null;
        state.force_refresh = true;
      }
      if (state.pending_gex_num) {
        current_gex_num = state.pending_gex_num;
        state.pending_gex_num = null;
      }
      const quoteInterval = marketActive ? 2e3 : 3e5;
      if (now - last_quote_fetch >= quoteInterval || state.force_refresh) {
        const query = {};
        Object.values(INDEX_CONFIG).forEach((cfg) => {
          if (!query[cfg.seg]) query[cfg.seg] = [];
          query[cfg.seg].push(Number(cfg.dhan_id));
        });
        const quotes = await dhan.getQuoteBatch(query);
        if (quotes) {
          last_quote_fetch = now;
          const idxData = Object.keys(INDEX_CONFIG).map((id) => {
            const cfg = INDEX_CONFIG[Number(id)];
            const q = (quotes[cfg.seg] || {})[cfg.dhan_id] || {};
            const lp = q.last_price || 0;
            if (Number(id) === current_index_id) last_spot = lp;
            return {
              id,
              name: cfg.name,
              spot: lp,
              change: lp - (q.ohlc?.close || lp),
              p_change: (lp - (q.ohlc?.close || lp)) / (q.ohlc?.close || lp) * 100 || 0
            };
          });
          ws.send(JSON.stringify({ type: "indices_spot", data: idxData }));
        }
      }
      const chainInterval = state.has_active_orders && marketActive ? 2e3 : marketActive ? 5e3 : 36e5;
      if (current_expiry && (now - last_chain_fetch >= chainInterval || state.force_refresh)) {
        const chain = await dhan.getOptionChain(Number(INDEX_CONFIG[current_index_id].dhan_id), "IDX_I", current_expiry);
        if (chain.length > 0) {
          last_chain_fetch = now;
          const expDate = /* @__PURE__ */ new Date(current_expiry + "T15:30:00+05:30");
          const dte = Math.max(0.01, (expDate.getTime() - Date.now()) / (1e3 * 60 * 60 * 24));
          const cfg = INDEX_CONFIG[current_index_id];
          const enrichedChain = computeGex(chain, last_spot, dte, cfg.lot);
          const flip = findGammaFlip(enrichedChain);
          const walls = computeWallsAndRegime(enrichedChain);
          const pcrData = computePcrMaxPain(enrichedChain);
          ws.send(JSON.stringify({
            type: "data",
            spot: last_spot,
            market_on: marketActive,
            market_status: mStatus,
            current_expiry,
            lot_size: cfg.lot,
            gamma_flip: flip,
            pcr: pcrData.pcr,
            max_pain: pcrData.maxPain,
            ...walls,
            chain: enrichedChain.slice(0, 41),
            // ATM center simplified
            gex: enrichedChain.slice(0, current_gex_num)
          }));
        }
      }
      state.force_refresh = false;
    } catch (e) {
      console.error("[Stream Loop] Error:", e);
    }
  }, 1e3);
}
app.post("/api/mstock/login", async (req, res) => {
  const { user_id, password } = req.body;
  const result = await mstockClient.loginStep1(user_id, password);
  res.json(result);
});
app.post("/api/mstock/verify-totp", async (req, res) => {
  const { api_key, totp } = req.body;
  const result = await mstockClient.verifyTOTP(api_key, totp);
  res.json(result);
});
app.get("/api/mstock/positions", async (req, res) => {
  res.json(await mstockClient.getPositions());
});
app.get("/api/mstock/funds", async (req, res) => {
  res.json({ status: "success", funds: await mstockClient.getFunds() });
});
app.post("/api/mstock/place-order", async (req, res) => {
  const { symbol, qty, side, price, trigger_price, order_type } = req.body;
  res.json(await mstockClient.placeOrder(symbol, qty, side, price, order_type, null, trigger_price));
});
app.post("/api/mstock/register-oco", async (req, res) => {
  const { entry_order_id, sl_order_id, tgt_order_id, symbol, qty } = req.body;
  ocoPairs[entry_order_id] = { sl_id: sl_order_id, tgt_id: tgt_order_id, symbol, qty };
  res.json({ status: "success", message: "Registered" });
});
app.get("/api/health", (req, res) => res.json({ status: "ok" }));
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await (0, import_vite.createServer)({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = import_path.default.join(process.cwd(), "dist");
    app.use(import_express.default.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(import_path.default.join(distPath, "index.html"));
    });
  }
  wss.on("connection", (ws) => {
    activeWebsockets.add(ws);
    ws.on("close", () => activeWebsockets.delete(ws));
    ws.on("message", async (msgStr) => {
      const msg = JSON.parse(msgStr);
      if (msg.type === "auth") {
        const { client_id, access_token } = msg.payload;
        startMarketDataStream(ws, client_id, access_token);
      }
    });
  });
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
    startOcoMonitor();
  });
}
startServer();
//# sourceMappingURL=server.cjs.map
