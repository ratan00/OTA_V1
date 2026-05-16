# Option Trading Terminal — Technical Specification (May 2026)

This document is the authoritative architectural blueprint for the OT3 Option Trading Terminal.
Written for high readability by AI agents to enable rapid debugging, restoration, and extension.
All information is grounded in the actual source code as of **May 16, 2026**.

## External References
- Dhan SDK: https://github.com/dhan-oss/DhanHQ-py
- Dhan API Docs: https://dhanhq.co/docs/v2/
- MStock Type A Docs: https://tradingapi.mstock.com/docs/v1/typeA/Orders/
- MStock Annexure: https://tradingapi.mstock.com/docs/v1/Annexure/

---

## 1. System Architecture

```
Frontend (React/TypeScript/Vite)
    ↕ WebSocket /ws         (real-time: market data, OCO events, LTP)
    ↕ HTTP REST             (order execution, auth, cache)
Backend (FastAPI/Python)
    ↕ ThreadPoolExecutor    (non-blocking SDK calls)
DhanHQ API  ←→  MStock Type A API
    ↕
SQLite Cache (data.db)
```

- **Frontend:** React 18, TypeScript, Vite, TailwindCSS, TradingView Lightweight Charts, Recharts, Lucide Icons.
- **Backend:** FastAPI, DhanHQ SDK v2.1+ (`DhanContext`), Pandas, SciPy, SQLite.
- **Transport:** Single persistent WebSocket (`/ws`) for all real-time data. HTTP REST for order execution and auth.
- **Concurrency:** Dhan API calls run in a `ThreadPoolExecutor(max_workers=5)` to avoid blocking the async event loop.
- **Timezone:** All operations are anchored to **Asia/Kolkata (IST, UTC+5:30)**.

---

## 2. Core Constants & Mappings

### Index Configuration (`backend/main.py` → `INDEX_CONFIG`)

| App ID | Name | Dhan Sec ID | Segment | Lot Size | Step | Opt Segment | MStock Exchange |
|:---|:---|:---|:---|:---|:---|:---|:---|
| 13 | NIFTY 50 | 13 | IDX_I | 65 | 50 | NSE_FNO | NFO |
| 25 | BANK NIFTY | 25 | IDX_I | 30 | 100 | NSE_FNO | NFO |
| 27 | FIN NIFTY | 27 | IDX_I | 60 | 50 | NSE_FNO | NFO |
| 14 | NIFTY NEXT 50 | 14 | IDX_I | 25 | 50 | NSE_FNO | NFO |
| 51 | MIDCP NIFTY | 442 | IDX_I | 120 | 25 | NSE_FNO | NFO |
| 1 | SENSEX | 51 | IDX_I | 20 | 100 | BSE_FNO | BFO |
| 12 | BANKEX | 69 | IDX_I | 30 | 100 | BSE_FNO | BFO |

> **Note:** App ID ≠ Dhan Security ID for MIDCP (442), SENSEX (51), BANKEX (69).
> **MStock F&O Exchange:** MUST be `NFO` (not `NSE`) for NSE derivatives, `BFO` for BSE derivatives.

### Analytics Constants (`backend/analytics.py`)
- `RISK_FREE = 0.065` — 6.5% annual risk-free rate
- `DEFAULT_IV = 0.15` — 15% fallback IV when chain data is missing

### Timeframes (`frontend/src/App.tsx`)
- Defined as `[1, 5, 15, 60, '1D']` (minutes, except `'1D'` string sentinel)
- Keyboard shortcut: type any number → Enter to jump to nearest supported timeframe

---

## 3. Backend Module Reference

### `main.py` — Core Server
- **FastAPI app** with CORS open to all origins.
- Hosts the WebSocket endpoint (`/ws`) and all REST endpoints.
- `get_market_status()` → Returns `"open"`, `"pre-market"`, or `"closed"`.
  - Pre-market: 09:00–09:14 IST
  - Live: 09:15–15:30 IST
  - Weekend + static 2026 holiday list check.
- `stream_market_data(websocket, auth)` — The core streaming coroutine. Runs as an `asyncio.Task`.
- `oco_monitor()` — Background `asyncio.Task` started at server startup. Polls MStock order book every 2s to implement Synthetic OCO. Sends `oco_filled` WS events to all connected clients.
- `app._oco_pairs` — In-memory dict: `{entry_order_id: {sl_id, tgt_id, symbol, qty}}`. Cleared on server restart.
- `app._active_websockets` — Set of all live WebSocket connections (used for broadcast).

### `dhan_client.py` — DhanHQ Integration
- `DhanClient(client_id, access_token)` — wraps the `dhanhq` SDK client.
- `initialize()` — creates `DhanContext` + `dhanhq` instance in executor (15s timeout).
- `_run_sync(name, func, *args)` — runs any synchronous SDK call in the executor (10s timeout).
- `_unwrap(response)` — normalizes the 3 possible SDK response shapes into plain data.
- `get_history(id, seg, inst_type, timeframe)` — fetches intraday 1-min data (last 7 days), then calls `_aggregate_ohlc()` for higher timeframes.
- `get_daily_history(id, seg, inst_type)` — fetches 1 year of daily OHLC; normalizes timestamps to `00:00:00 IST`.
- `get_option_chain(id, seg, expiry)` — returns a Pandas DataFrame with columns: `Strike`, `Call_OI`, `Call_LTP`, `Call_IV`, `Call_Delta`, `Call_Gamma`, `Call_SecurityId`, `Put_*` equivalents.
- `get_expiry_list(id, seg)` — returns list of `"YYYY-MM-DD"` strings. Falls back to next 4 Thursdays if API fails.

### `analytics.py` — Greeks & GEX Engine
- **Greeks computed:** Gamma, Vanna, Volga, Charm (Call & Put), Delta.
- `compute_gex(df, spot, dte, lot_size)` — vectorized; adds `Call_GEX`, `Put_GEX`, `Net_GEX`, `Net_Vanna`, `Net_Volga`, `Net_Charm` columns.
  - GEX multiplier: `spot² × lot_size × 0.0001 / 1e7`
- `find_gamma_flip(df, spot)` — linear interpolation between strikes where `Net_GEX` sign flips.
- `compute_walls_and_regime(df)` → `(call_wall, put_wall, call_wall_2, put_wall_2, regime)`
  - `regime = "Stabilizing"` if total Net GEX > 0, else `"Volatile"`
- `compute_pcr_maxpain(df)` → `(pcr, max_pain_strike)`
  - Max pain = strike with highest total OI (Call + Put combined).

### `mstock_client.py` — Order Execution (CORRECTED — May 2026)

> **CRITICAL:** All fields below are verified against official MStock Type A API docs.

- **Base URL:** `https://api.mstock.trade/openapi/typea` ← **NOT** `tradingapi.mstock.com`
- **Auth header:** `Authorization: token {api_key}:{access_token}`
- **Content-Type for order requests:** `application/x-www-form-urlencoded`

#### Methods
| Method | Endpoint | Description |
|:---|:---|:---|
| `login_step1()` | POST `/connect/login` | Step 1: Trigger TOTP (sends user/password) |
| `verify_totp(totp)` | POST `/session/verifytotp` | Step 2: Get `access_token` |
| `place_order(...)` | POST `/orders/regular` | Place a regular order |
| `cancel_order(order_id)` | DELETE `/orders/regular/{order_id}` | Cancel — order ID in **URL path**, no body |
| `get_order_book()` | GET `/orders` | Full order book (used by OCO monitor) |
| `get_order_status(order_id)` | GET `/order/details?order_id=X` | Individual order status |
| `get_positions()` | GET `/portfolio/positions` | Live positions |
| `get_funds()` | GET `/funds/limit` | Available margin |

#### `place_order` Field Names (form-urlencoded)
```
tradingsymbol   ← field name (NOT trading_symbol)
exchange        ← NFO / BFO / NSE (auto-detected; never pass "NSE" for F&O)
transaction_type← BUY / SELL
quantity        ← int
price           ← float (0 for MARKET / SL-M)
trigger_price   ← float (required for SL / SL-M)
product         ← MIS (intraday)
order_type      ← MARKET / LIMIT / SL / SL-M
validity        ← DAY
```

#### Order Type Constants
| Our String | MStock String | Use Case |
|:---|:---|:---|
| `MARKET` | `MARKET` | Immediate fill |
| `LIMIT` | `LIMIT` | Limit order (needs `price`) |
| `SL` | `SL` | Stop-Loss Limit (needs `price` + `trigger_price`) |
| `SL-M` | `SL-M` | Stop-Loss Market (needs `trigger_price` only) — preferred for SL legs |

#### Exchange Auto-Detection (`_detect_exchange`)
```python
NFO  ← NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, NIFTYNXT50
BFO  ← SENSEX, BANKEX
NSE  ← all other equity symbols
```

### `symbol_transformer.py` — Symbol Generation
- `get_mstock_symbol(underlying, expiry, strike, option_type)` — generates MStock trading symbol:
  - **Weekly format:** `{UNDERLYING}{YY}{M}{DD}{STRIKE}{CE/PE}` (Oct=O, Nov=N, Dec=D, DD is zero-padded 2 digits)
  - **Monthly format:** `{UNDERLYING}{YY}{MMM}{STRIKE}{CE/PE}`
  - Monthly detection: expiry within 3 days before (or on) last target weekday of month. Strictly NO future dates.
  - Weekly expiry days: NIFTY=Thu, BANKNIFTY=Wed, FINNIFTY=Tue, MIDCPNIFTY/BANKEX=Mon, SENSEX=Fri.
- `get_dhan_human_symbol(underlying, expiry, strike, option_type)` → `"NIFTY 15 May 24500 CE"` style string for UI display.

### `database.py` — SQLite Persistence (`data.db`)
Two tables:
1. **`config`** — key/value store for `dhan_client_id`, `dhan_access_token`.
2. **`cache`** — key/value + `updated_at` timestamp for history & option chain data.

- `get_cache(key)` / `set_cache(key, value)` — JSON-serialized cache.
- `get_cache_with_time(key)` — returns `(data, datetime)` tuple.
- DB auto-initialized at import via `init_db()`.
- Cache can be cleared via `GET /cache/clear`.

### `api_utils.py` — JWT Utilities
- `decode_dhan_token(token)` — decodes Dhan JWT (HS512), returns `client_id`, `expiry`, `is_expired`, `seconds_left`.

---

## 4. REST API Endpoints

| Method | Path | Description |
|:---|:---|:---|
| GET | `/` | Health check |
| POST | `/mstock/login` | Step 1: Trigger TOTP |
| POST | `/mstock/verify-totp` | Step 2: Get access token |
| GET | `/mstock/positions` | Fetch live positions |
| GET | `/mstock/funds` | Fetch available margin |
| POST | `/mstock/place-order` | Place single order (exchange auto-detected) |
| POST | `/mstock/place-multi-order` | Place multiple orders in sequence |
| DELETE | `/mstock/cancel-order/{order_id}` | Cancel a specific order |
| GET | `/mstock/order-status/{order_id}` | Get individual order status |
| GET | `/mstock/order-book` | Full today's order book |
| POST | `/mstock/register-oco` | Register SL+TGT as Synthetic OCO pair |
| GET | `/dhan/decode-token` | Decode + validate Dhan JWT |
| GET | `/dhan/config` | Read saved Dhan credentials from DB |
| POST | `/dhan/renew-token` | Renew Dhan token via `DhanLogin` |
| GET | `/cache/clear` | Wipe entire cache table + signal WS to force-refresh |
| WS | `/ws` | Main real-time data WebSocket |

---

## 5. WebSocket Protocol

### Client → Server Messages

| `type` | `payload` | Effect |
|:---|:---|:---|
| `auth` | `{client_id, access_token}` | Initializes/restarts `stream_market_data` task |
| `select_index` | index App ID (string) | Switch active index; reloads history & expiries in parallel |
| `select_expiry` | `"YYYY-MM-DD"` | Switch active expiry; forces chain re-fetch |
| `select_timeframe` | `1`, `5`, `15`, `60`, or `"1D"` | Switch chart timeframe; reloads history |
| `select_chart_instrument` | `{id, name, type: 'INDEX'|'OPT'}` | Switch chart to any instrument (index or option) |
| `select_gex_strikes` | integer (5–51) | Change GEX display strike count |
| `refresh_gex` | — | Force immediate chain re-fetch |
| `has_active_orders` | boolean | Accelerates chain polling to 2s when `true` |
| `active_position_ids` | `{"NSE_FNO": [sec_id,...]}` | Triggers dedicated 1s LTP poll for open positions |

### Server → Client Messages

| `type` | Key Fields | Description |
|:---|:---|:---|
| `history` | `data[]`, `target`, `name` | Array of OHLC bars for chart |
| `expiries` | `data[]` | List of available expiry dates |
| `indices_spot` | `data[]` | All indices: `{id, name, spot, change, p_change}` |
| `data` | `spot`, `ohlc`, `chain[]`, `gex[]`, `agg_gex[]`, `market_on`, `market_status`, `pcr`, `max_pain`, `call_wall`, `put_wall`, `call_wall_2`, `put_wall_2`, `gamma_flip`, `regime`, `lot_size`, `current_expiry` | Full analytics payload |
| `ltp_update` | `{sec_id: ltp, ...}` | Fast 1s LTP map for active positions (bypasses chain poll) |
| `oco_filled` | `{entry_id, filled_leg, symbol, qty, cancelled_id, cancel_result}` | Backend OCO monitor fired; one leg filled, other cancelled |
| `error` | `message` | Auth or connection error |

---

## 6. Streaming Loop Logic (`stream_market_data`)

The stream runs a tight `asyncio` loop with 200ms sleep between iterations.

### Polling Intervals
| Data | Market Open | Market Off |
|:---|:---|:---|
| Quote (all indices) | Every 2s | Every 300s |
| Option Chain (normal) | Every 5s | Once (cached) |
| Option Chain (has active orders) | Every 2s | N/A |
| LTP fast poll (active positions) | Every 1s | N/A |
| Aggregated GEX (next 4 expiries) | Every 30s | On force_fetch |
| Off-market heartbeat | N/A | Every 600s |

### Candle Formation (`forming_candle`)
- Lives in memory for the lifetime of the WebSocket connection.
- For sub-day timeframes: `now_floor = (now_ts // window_sec) * window_sec`
- For `1D`: `now_floor = (int(now_ts + 5.5*3600) // 86400) * 86400 - 5.5*3600` (IST midnight anchor)
- When `now_floor > forming_candle['time']` → new candle starts; else high/low/close are updated.
- **Ghost candle guard:** Candle only updates when `market_active = True` AND `chart_lp > 0`. No post-market candle drift.
- `forming_candle` is sent as the `ohlc` field in every `"data"` message.

### Cache TTL
- History (market off): 24h (`3600*24` seconds)
- History (market on): 30s
- Chain (market off): served from DB until force_fetch

### Analytics Trigger
Re-calculates on any of:
- `force_recalc` flag set
- Spot moved > 0.05 points since last calc
- More than 1 second since last calc

### DTE Calculation
Dynamic: `(expiry_datetime_15:30_IST - now_IST).total_seconds() / 86400`, floored at 0.01.

### Option Chain Window Sent to Frontend
- **Chain table:** ATM ± 20 strikes (41 rows max)
- **GEX chart:** ATM ± `gex_num/2` strikes (default 30 → ±15)

---

## 7. Synthetic OCO System

MStock Type A has **no native bracket/OCO order type**. OT3 implements a fully server-side Synthetic OCO:

### Bracket Order Flow (Live Trading)
```
1. Place BUY entry (MARKET or SL order) → capture entry_order_id
2. Wait 800ms → Place SELL SL-M (trigger_price = sl_level) → capture sl_order_id
3. Wait 1500ms → Place SELL LIMIT (price = target_level) → capture tgt_order_id
4. POST /mstock/register-oco {entry_order_id, sl_order_id, tgt_order_id, symbol, qty}
```

### Backend OCO Monitor (`oco_monitor` asyncio Task)
- Runs continuously since server startup (started in `@app.on_event("startup")`).
- Every 2s: polls `GET /orders` (full order book), builds `{order_id: status}` map.
- For each registered pair:
  - If `sl_status in {COMPLETE, FILLED, TRADED}` → cancel `tgt_order_id`; push `oco_filled(filled_leg="SL")` WS event
  - If `tgt_status in {COMPLETE, FILLED, TRADED}` → cancel `sl_order_id`; push `oco_filled(filled_leg="TGT")` WS event
  - If both legs are CANCELLED/REJECTED/EXPIRED → clean up pair
- Pairs survive server restart only if `app._oco_pairs` is persisted (currently in-memory only).

### Frontend OCO Handler
- Receives `oco_filled` WS message.
- Removes matching position from state.
- Updates `bookedPnl` based on `pos.slPrice` or `pos.targetPrice`.
- Shows 🛑 SL HIT or 🎯 TGT HIT toast notification.

---

## 8. Frontend Architecture (`frontend/src/`)

### `App.tsx` — Root Component
- Manages all global state: spot, chain, GEX, positions, orders, expiries, theme, PnL, `ltpMap`.
- **WebSocket lifecycle:** `useEffect` keyed on `[dhanKeys, addLog, notify]` — all stable refs.
  - On fatal auth error: auto-reconnect is aborted.
  - On normal disconnect: reconnects after 5s.
- **Paper Trading:** toggled via `useSandboxEngine`. When active, all trades/positions go to sandbox.
- **Keyboard Shortcuts:**
  - `Shift+B` → Buy ATM CE (market order)
  - `Shift+S` → Buy ATM PE (market order)
  - `Shift+X` → Panic exit all positions
  - `0-9` → Type timeframe minutes, Enter to apply
- **`ltpMap`** state: `{security_id: ltp}` — updated by `ltp_update` WS messages every 1s for active positions.

### `TradingChart.tsx` — Chart Component
- TradingView Lightweight Charts library.
- Overlays: EMA, VWCB, UT Bot signals, GEX levels (Call Wall, Put Wall, Gamma Flip).
- Supports chart instrument switching (indices or options).
- Tick mark formatter uses `Intl.DateTimeFormat` with `timeZone: 'Asia/Kolkata'`.
- `liveData` prop feeds the `forming_candle` for real-time bar updates.

### `OptionChain.tsx` — Options Matrix
- Displays ATM ±20 strikes from `chain[]` data.
- Columns: Call OI, Call IV%, Call LTP | Strike | Put LTP, Put IV%, Put OI + Net GEX bar.
- ATM row highlighted. Click on row → triggers `onSelectInstrument` to chart that option.

### `GexChart.tsx` — GEX Bar Chart (Recharts)
- Two instances in the UI:
  1. Current expiry GEX profile (from `data.gex`).
  2. Aggregated next-4-expiries GEX (from `data.agg_gex`).
- Supports fullscreen toggle.

### `ScalperModule.tsx` — Quick Trade Panel
- ATM ±N strike selector, lot selector, SL/Target input.
- Order types: MKT / LMT.
- Calls `handleScalperTrade` in `App.tsx`.
- In paper mode: routes to `sandbox.executeTrade`.

### `PositionsModule.tsx` — Position Tracker
- Shows live or paper positions with floating PnL.
- **PnL source priority:** `ltpMap[pos.securityId]` → chain LTP → entry price.
- Per-position Exit button + global Exit All button.

### `OrdersModule.tsx` — Order Log
- Read-only order history log for session.

### `SettingsModal.tsx` — Configuration
- Dhan credentials input + JWT decode/validate + token renew.
- MStock two-step login (password → TOTP).
- Paper trading toggle + simulated capital input.
- "Refresh Market Data" button → calls `GET /cache/clear` then sends `refresh_gex` WS message.
- All credentials auto-saved to DB on successful auth. Auto-populated from DB on page load.

### `ProcessTerminal.tsx` — Log Console
- Scrollable terminal-style log, fixed at bottom of page.
- Levels: `info`, `warn`, `error`, `success`.
- Max 100 entries in memory.

### `useSandboxEngine.ts` — Paper Trading Engine
- Manages `paperCapital`, `positions`, `orders`, `bookedPnl`.
- Auto SL/Target monitoring via `useEffect` on `chainData` updates.
- Capital and booked PnL persisted to `localStorage` (`paper_capital`, `paper_booked_pnl`).
- `modifyPosition(id, 'SL'|'TP', price)` — adjustable from chart.

---

## 9. Key Logic & Heuristics

### IST Anchoring
- Daily bars are normalized to `00:00:00 IST` in both `get_daily_history` and the 1D candle floor calculation.
- The IST offset constant used: `5.5 * 3600` seconds.

### 1D History Merge
For `current_timeframe == "1D"`:
1. Fetch 1 year of daily history.
2. Fetch last 7 days of 1-min intraday data.
3. Aggregate intraday by day (IST midnight key).
4. If today's date matches last daily bar → replace it; if newer → append.
This ensures the live today-candle is always visible.

### WebSocket Reconnection Stability
The WS `useEffect` depends on `[dhanKeys, addLog, notify]` — all stable references. This prevents infinite reconnection loops. Fatal auth errors (`"credentials"` or `"failed to connect"` in error message) abort the auto-reconnect.

### Bracket Order Flow (Live)
1. Place BUY (market or SL-limit) → capture `entry_order_id`.
2. Wait 800ms → Place SELL `SL-M` (trigger_price = SL level) → capture `sl_order_id`.
3. Wait 1500ms → Place SELL `LIMIT` (price = target) → capture `tgt_order_id`.
4. POST `/mstock/register-oco` → backend OCO monitor takes over.
5. Frontend shows 🛑/🎯 toast when `oco_filled` WS message arrives.

> **SL-M vs SL:** Use `SL-M` (Stop-Loss Market) for the SL leg — it requires only `trigger_price`, fills immediately at market when triggered, and avoids the price slippage problem with SL-Limit.

### Aggregated GEX (Multi-Expiry)
- Fetches top 4 expiries in parallel via `asyncio.gather`.
- Computes per-expiry GEX with that expiry's dynamic DTE.
- Groups by Strike, sums `Net_GEX` (and other columns) across expiries.
- Cached on the websocket object as `cached_agg_gex`.

---

## 10. Known Bugs Fixed in This Session (May 2026)

| Bug | Root Cause | Fix |
|:---|:---|:---|
| `OrderRequest.exchange` default `"NSE"` bypassed F&O auto-detect | Schema default was always truthy | Changed default to `""` |
| `asyncio.get_event_loop()` deprecated Python 3.10+ | Old API | Changed to `asyncio.get_running_loop()` |
| Stream loop indentation broken | Removing `if should_run:` wrapper left over-indented body | Re-indented entire block to 16-space level |
| MStock cancel order sent ID in body | Old incorrect impl | DELETE URL now `/orders/regular/{order_id}`, no body |
| MStock place order used wrong field name `trading_symbol` | Docs discrepancy | Corrected to `tradingsymbol` |
| MStock place order used wrong endpoint `/order/regular` | Docs discrepancy | Corrected to `/orders/regular` |
| MStock F&O exchange was `"NSE"` | Equity vs F&O exchange confusion | Auto-detect: `NFO` for NSE F&O, `BFO` for BSE F&O |
| SL leg used `SL` (SL-Limit) requiring both price + trigger | `SL` needs a limit price too | Changed to `SL-M` (market SL) — only needs trigger_price |

---

## 11. Troubleshooting Guide

| Symptom | Likely Cause | Where to Check |
|:---|:---|:---|
| Missing today's candle on 1D | Intraday merge failed, or `is_market_on()` holiday mismatch | `send_initial_history()` in `main.py` |
| Auth loop / infinite WS reconnect | `dhanKeys` object reference changing on each render | `App.tsx` — WS `useEffect` dependency array |
| Date off-by-one on chart | Missing `timeZone: 'Asia/Kolkata'` in tick formatter | `TradingChart.tsx` tick mark formatter |
| Wrong ATM highlight | Step size mismatch — `atm_strike = round(spot / step) * step` | `main.py`, `INDEX_CONFIG[step]` |
| GEX profile empty | `agg_gex` empty because `current_spot <= 0` at fetch time | `stream_market_data` — `current_spot` guard |
| MStock order rejected | Wrong exchange (`NSE` vs `NFO`), wrong field name, wrong endpoint | `mstock_client.py` — see Section 3 table |
| OCO not triggering | `app._oco_pairs` empty (server restarted) — pairs are in-memory only | Restart backend restores fresh state; re-place orders |
| Expired Dhan token | JWT `exp` field in past | Use `/dhan/decode-token` + Settings → Renew Token |
| Chain polling too slow | `has_active_orders` not sent to backend | `App.tsx` positions `useEffect` → `has_active_orders` WS message |
| Ghost candle at 7:30pm | Old bug: forming_candle updated outside market hours | Fixed: candle only updates when `market_active = True` |

---

*Updated: May 16, 2026 — reflects complete OCO implementation, corrected MStock API, and all bug fixes.*
