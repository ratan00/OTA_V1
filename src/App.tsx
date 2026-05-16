import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { TradingChart } from './components/TradingChart';
import { OptionChain } from './components/OptionChain';
import { GexChart } from './components/GexChart';
import { SettingsModal } from './components/SettingsModal';
import { ScalperModule } from './components/ScalperModule';
import { PositionsModule } from './components/PositionsModule';
import { OrdersModule, type Order } from './components/OrdersModule';
import { ProcessTerminal, type LogEntry } from './components/ProcessTerminal';
import { useSandboxEngine } from './hooks/useSandboxEngine';
import { Shield, Activity, Layout, PieChart, Settings, Zap, Calendar, AlertTriangle, Maximize2, Minimize2, Sun, Moon, Clock, Wallet } from 'lucide-react';
import { localAppServer } from './services/LocalServer';

const INDICES = [
  { name: 'NIFTY 50', id: '13' },
  { name: 'BANK NIFTY', id: '25' },
  { name: 'FIN NIFTY', id: '27' },
  { name: 'MIDCP NIFTY', id: '51' },
  { name: 'NIFTY NEXT 50', id: '14' },
  { name: 'SENSEX', id: '1' },
  { name: 'BANKEX', id: '12' }
];

const TIMEFRAMES = [
    { label: '1m', value: 1 },
    { label: '5m', value: 5 },
    { label: '15m', value: 15 },
    { label: '1h', value: 60 },
    { label: '1D', value: '1D' },
];

const MemoizedTradingChart = memo(TradingChart);
const MemoizedOptionChain = memo(OptionChain);
const MemoizedGexChart = memo(GexChart);

function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') || 'dark';
  });
  
  const [data, setData] = useState<any>({
    spot: 0,
    chain: [],
    gex: [],
    agg_gex: [],
    current_expiry: '',
    current_index_id: 13,
    market_on: false,
    market_status: 'closed',
    gamma_flip: 0,
    pcr: 0,
    max_pain: 0,
    lot_size: 65,
  });
  const [expiries, setExpiries] = useState<string[]>([]);
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [selectedIndex, setSelectedIndex] = useState('13');
  const [selectedTimeframe, setSelectedTimeframe] = useState<number | string>('1D');
  const [gexStrikes, setGexStrikes] = useState(30);
  const [isChartFullscreen, setIsChartFullscreen] = useState(false);
  const [isGexFullscreen, setIsGexFullscreen] = useState(false);
  const [isCombinedGexFullscreen, setIsCombinedGexFullscreen] = useState(false);
  
  const [indexChartData, setIndexChartData] = useState<any[]>([]);
  const [liveOhlc, setLiveOhlc] = useState<any>(null);
  const [showVolume, setShowVolume] = useState(true);
  const [showEma, setShowEma] = useState(false);
  const [showVwcb, setShowVwcb] = useState(false);
  const [showUtBot, setShowUtBot] = useState(false);
  const [showGammaLevels, setShowGammaLevels] = useState(true);
  const [indicesSpot, setIndicesSpot] = useState<any[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [chartName, setChartName] = useState<string>('NIFTY 50');
  const [timeLeft, setTimeLeft] = useState<string>('--:--');
  const [capital, setCapital] = useState<number>(() => {
    return Number(localStorage.getItem('trading_capital')) || 0;
  });
  const [positions, setPositions] = useState<any[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeExecTab, setActiveExecTab] = useState<'positions' | 'orders'>('positions');
  const [bookedPnl, setBookedPnl] = useState<number>(() => {
    return Number(localStorage.getItem('booked_pnl')) || 0;
  });
  
  const [hasError, setHasError] = useState<string | null>(null);
  const [dhanConnected, setDhanConnected] = useState(false);
  const [mstockConnected, setMstockConnected] = useState(false);
  const [toasts, setToasts] = useState<any[]>([]);
  const [ltpMap, setLtpMap] = useState<Record<string, number>>({});  // Fast LTP for active positions

  // ── Module Toggles (persisted to localStorage) ──
  const [moduleConfig, setModuleConfig] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('module_config');
      return saved ? JSON.parse(saved) : { optionChain: true, gexProfile: true, combinedGex: false, scalper: true, watchlist: true };
    } catch { return { optionChain: true, gexProfile: true, combinedGex: false, scalper: true, watchlist: true }; }
  });

  const handleModuleToggle = useCallback((key: string, val: boolean) => {
    setModuleConfig(prev => {
      const next = { ...prev, [key]: val };
      localStorage.setItem('module_config', JSON.stringify(next));
      localAppServer.handleMessage({ type: 'module_config', payload: next });
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const [timeframeInput, setTimeframeInput] = useState('');
  const [showTimeframeInput, setShowTimeframeInput] = useState(false);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;
    
    const handleKeyDown = (e: KeyboardEvent) => {
        if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
        
        if (e.key === 'Enter' && showTimeframeInput) {
            const val = parseInt(timeframeInput);
            if (val > 0) {
                const supported = [1, 3, 5, 15, 30, 60, '1D'];
                const closest = supported.reduce((prev, curr) => {
                    if (curr === '1D') return prev;
                    return Math.abs((curr as number) - val) < Math.abs((prev as number) - val) ? curr : prev;
                });
                handleTimeframeChange(closest);
            }
            setShowTimeframeInput(false);
            setTimeframeInput('');
            return;
        }

        if (e.key === 'Escape') {
            if (showTimeframeInput)       { setShowTimeframeInput(false); setTimeframeInput(''); return; }
            if (isChartFullscreen)        { setIsChartFullscreen(false);        return; }
            if (isGexFullscreen)          { setIsGexFullscreen(false);          return; }
            if (isCombinedGexFullscreen)  { setIsCombinedGexFullscreen(false);  return; }
            return;
        }

        if (e.key >= '0' && e.key <= '9') {
            setShowTimeframeInput(true);
            setTimeframeInput(prev => {
                const newVal = prev + e.key;
                clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    setShowTimeframeInput(false);
                    setTimeframeInput('');
                }, 3000);
                return newVal;
            });
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
        window.removeEventListener('keydown', handleKeyDown);
        clearTimeout(timeoutId);
    };
  }, [showTimeframeInput, timeframeInput, isChartFullscreen, isGexFullscreen, isCombinedGexFullscreen]);

  const notify = useCallback((message: string, type: 'info' | 'error' | 'warn' | 'success' = 'info') => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev.slice(-4), { id, message: String(message), type }]);
    
    const newLog: LogEntry = {
        id,
        timestamp: new Date().toLocaleTimeString(),
        message: String(message),
        level: type === 'error' ? 'error' : (type === 'warn' ? 'warn' : (type === 'success' ? 'success' : 'info'))
    };
    setLogs(prev => [...prev.slice(-99), newLog]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const addLog = useCallback((message: string, level: LogEntry['level'] = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      message: String(message),
      level
    };
    setLogs(prev => [...prev.slice(-99), newLog]);
  }, []);


  useEffect(() => {
    const handleOnline = () => notify('Internet connection restored', 'success');
    const handleOffline = () => notify('No internet connection detected', 'error');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [notify]);

  useEffect(() => {
    localStorage.setItem('trading_capital', capital.toString());
  }, [capital]);

  useEffect(() => {
    localStorage.setItem('booked_pnl', bookedPnl.toString());
  }, [bookedPnl]);

  const [dhanKeys, setDhanKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('dhan_keys');
      return saved ? JSON.parse(saved) : { client_id: '', access_token: '' };
    } catch (e) {
      return { client_id: '', access_token: '' };
    }
  });

  const [mstockKeys, setMstockKeys] = useState(() => {
    try {
      const saved = localStorage.getItem('mstock_keys');
      return saved ? JSON.parse(saved) : { api_key: '', user_id: '', password: '' };
    } catch (e) {
      return { api_key: '', user_id: '', password: '' };
    }
  });

  const [paperTrading, setPaperTrading] = useState(() => {
    return localStorage.getItem('paper_trading') === 'true';
  });
  
  const sandbox = useSandboxEngine(paperTrading, 1000000, data.lot_size, notify, data.chain);

  useEffect(() => {
    localStorage.setItem('paper_trading', paperTrading.toString());
  }, [paperTrading]);

  // Send active position security IDs to backend for fast 1s LTP polling
  useEffect(() => {
        const activePosArr = (paperTrading ? sandbox.positions : positions).filter((p: any) => p.qty > 0);
        const hasOrders = activePosArr.length > 0;
        localAppServer.handleMessage({ type: 'has_active_orders', payload: hasOrders });
        // Send security IDs for fast LTP polling (live mode only)
        if (!paperTrading && hasOrders) {
            const idMap: Record<string, number[]> = {};
            activePosArr.forEach((p: any) => {
                if (p.securityId && p.segment) {
                    if (!idMap[p.segment]) idMap[p.segment] = [];
                    idMap[p.segment].push(Number(p.securityId));
                }
            });
            if (Object.keys(idMap).length > 0) {
                localAppServer.handleMessage({ type: 'active_position_ids', payload: idMap });
            }
        }
  }, [positions, sandbox.positions, paperTrading]);

  const handleGetFunds = useCallback(async () => {
    if (!mstockConnected) {
        addLog('[BROKER] MSTOCK NOT CONNECTED. CANNOT FETCH FUNDS.', 'warn');
        return;
    }
    addLog('[BROKER] FETCHING LIVE FUND LIMITS...', 'info');
    try {
        const funds = await localAppServer.getFunds(mstockKeys?.user_id || '');
        setCapital(funds);
        addLog(`[BROKER] LIMITS UPDATED: ₹${Number(funds).toLocaleString()}`, 'success');
    } catch (e) {
        addLog('[BROKER] FUND FETCH ERROR', 'error');
    }
  }, [addLog, mstockConnected, mstockKeys]);

  const handleScalperTrade = useCallback(async (side: 'CE' | 'PE', strike: number, price: number, sl: number, target: number, orderType: 'MKT' | 'LMT', numLots: number = 1) => {
    let targetStrike = strike;
    if (targetStrike === 0 && data.chain.length > 0) {
        const sorted = [...data.chain].sort((a, b) => Math.abs(a.Strike - data.spot) - Math.abs(b.Strike - data.spot));
        targetStrike = sorted[0].Strike;
    }
    const strikeData = data.chain.find((r: any) => r.Strike === targetStrike);
    const symbol = side === 'CE' ? strikeData?.Call_Symbol : strikeData?.Put_Symbol;
    const ltp = side === 'CE' ? strikeData?.Call_LTP : strikeData?.Put_LTP;
    if (!symbol) { notify(`FAILED TO RESOLVE SYMBOL FOR ${side} ${targetStrike}`, 'error'); return; }

    const effectivePrice = price || ltp || 0;
    const effectiveSL = sl || (side === 'CE' ? effectivePrice - 10 : effectivePrice + 10);
    const effectiveTarget = target || (side === 'CE' ? effectivePrice + 20 : effectivePrice - 20);

    // Paper trades always proceed — market status is advisory only
    if (paperTrading) {
        if (!data.market_on) notify('MARKET CLOSED — paper trade recorded for simulation.', 'warn');
        sandbox.executeTrade(side, targetStrike, effectivePrice, effectiveSL, effectiveTarget, orderType, numLots, symbol);
        return;
    }

    // Live trades require market to be open
    if (!data.market_on) {
        notify(`MARKET CLOSED — ${data.market_status?.toUpperCase() || 'CLOSED'}. Live orders cannot be placed.`, 'error');
        return;
    }


    const orderId = Math.random().toString(36).substr(2, 9);
    const totalQty = data.lot_size * numLots;
    const entryType = orderType === 'LMT' ? 'SL' : 'MARKET';
    notify(`INITIATING BRACKET BUY ${symbol} (x${numLots})...`, 'info');
    try {
        const entryRes = await localAppServer.placeOrder(mstockKeys?.user_id || '', { symbol, qty: totalQty, side: 'BUY', price: orderType === 'LMT' ? effectivePrice + 0.1 : 0, trigger_price: orderType === 'LMT' ? effectivePrice : 0, order_type: entryType });
        if (entryRes.status === 'success') {
            const entryOrderId = entryRes.data?.order_id || orderId;
            notify(`ENTRY PLACED: ${entryOrderId}`, 'success');

            // Place SL leg (SL-M = Stop-Loss Market: trigger_price only, fills at market)
            const placeSL = async (): Promise<string | null> => {
                await new Promise(r => setTimeout(r, 800));
                const slData = await localAppServer.placeOrder(mstockKeys?.user_id || '', { symbol, qty: totalQty, side: 'SELL', price: 0, trigger_price: effectiveSL, order_type: 'SL-M' });
                if (slData.status === 'success') {
                    notify(`AUTO-SL ACTIVE: ₹${effectiveSL.toFixed(1)} (SL-M)`, 'success');
                    return slData.data?.order_id || null;
                }
                notify(`AUTO-SL REJECTED: ${slData.message}`, 'warn');
                return null;
            };

            // Place TGT leg (LIMIT order)
            const placeTGT = async (): Promise<string | null> => {
                await new Promise(r => setTimeout(r, 1500));
                const tgtData = await localAppServer.placeOrder(mstockKeys?.user_id || '', { symbol, qty: totalQty, side: 'SELL', price: effectiveTarget, order_type: 'LIMIT' });
                if (tgtData.status === 'success') {
                    notify(`AUTO-TGT ACTIVE: ₹${effectiveTarget.toFixed(1)}`, 'success');
                    return tgtData.data?.order_id || null;
                }
                notify(`AUTO-TGT REJECTED: ${tgtData.message}`, 'warn');
                return null;
            };

            // Place both legs in parallel (after their delays) and register OCO
            const [slOrderId, tgtOrderId] = await Promise.all([placeSL(), placeTGT()]);
            if (slOrderId && tgtOrderId) {
                // Register the OCO pair with the backend monitor
                localAppServer.registerOco(mstockKeys?.user_id || '', { entry_order_id: entryOrderId, sl_order_id: slOrderId, tgt_order_id: tgtOrderId, symbol, qty: totalQty });
                notify('OCO REGISTERED — app will auto-cancel other leg on fill', 'info');
            }

            const newPos = { id: entryOrderId, symbol, side, strike: targetStrike, entryPrice: effectivePrice, slPrice: effectiveSL, targetPrice: effectiveTarget, qty: totalQty, orderType, timestamp: new Date().toLocaleTimeString() };
            setPositions(prev => [...prev, newPos]);
            setOrders(prev => [{ id: entryOrderId, action: 'BUY', side, strike: targetStrike, type: orderType, price: effectivePrice, qty: totalQty, status: 'EXECUTED', timestamp: new Date().toLocaleTimeString() }, ...prev]);
        } else notify(`ENTRY FAILED: ${entryRes.message}`, 'error');
    } catch (e: any) { notify(`EXECUTION ERROR: ${e.message}`, 'error'); }

  }, [data.chain, data.spot, data.lot_size, notify, paperTrading, sandbox]);

  const handleExitPosition = useCallback(async (id: string) => {
    if (paperTrading) {
        sandbox.exitPosition(id);
        return;
    }

    const pos = positions.find(p => p.id === id);
    if (!pos) return;
    notify(`EXITING POSITION ${pos.symbol}...`, 'info');
    try {
        const orderRes = await localAppServer.placeOrder(mstockKeys?.user_id || '', { symbol: pos.symbol, qty: pos.qty, side: 'SELL', price: 0, order_type: 'MARKET' });
        if (orderRes.status === 'success') {
            const strikeData = data.chain.find((r: any) => r.Strike === pos.strike);
            const exitPrice = pos.side === 'CE' ? (strikeData?.Call_LTP || pos.entryPrice) : (strikeData?.Put_LTP || pos.entryPrice);
            const pnl = (exitPrice - pos.entryPrice) * pos.qty;
            setBookedPnl(prev => prev + pnl);
            setPositions(prev => prev.filter(p => p.id !== id));
            setOrders(prev => [{
                id: `EXIT_${id}`,
                action: 'SELL',
                side: pos.side,
                strike: pos.strike,
                type: 'MKT',
                price: exitPrice,
                qty: pos.qty,
                status: 'EXECUTED',
                timestamp: new Date().toLocaleTimeString()
            }, ...prev]);
            notify(`EXIT SUCCESS: Realized ₹${pnl.toFixed(2)}`, 'success');
            handleGetFunds();
        } else notify(`EXIT FAILED: ${orderRes.message}`, 'error');
    } catch (e: any) { notify(`EXIT ERROR: ${e.message}`, 'error'); }
  }, [positions, data.chain, notify, handleGetFunds, paperTrading, sandbox]);

  const handleExitAll = useCallback(async () => {
    if (paperTrading) {
        sandbox.exitAll();
        return;
    }
    if (positions.length === 0) return;
    notify(`INITIATING PANIC EXIT FOR ${positions.length} POSITIONS...`, 'warn');
    for (const pos of [...positions]) await handleExitPosition(pos.id);
  }, [positions, notify, handleExitPosition, paperTrading, sandbox]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement).tagName)) return;
        if (e.shiftKey) {
            if (e.key === 'B' || e.key === 'b') { e.preventDefault(); handleScalperTrade('CE', 0, 0, 0, 0, 'MKT', 1); }
            else if (e.key === 'S' || e.key === 's') { e.preventDefault(); handleScalperTrade('PE', 0, 0, 0, 0, 'MKT', 1); }
            else if (e.key === 'X' || e.key === 'x') { e.preventDefault(); handleExitAll(); }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExitAll, handleScalperTrade]);

  // Bar Countdown Logic
  useEffect(() => {
    const timer = setInterval(() => {
        if (!data.market_on) { setTimeLeft('00:00'); return; }
        if (typeof selectedTimeframe !== 'number') { setTimeLeft('--:--'); return; }
        const now = new Date();
        const secondsSinceEpoch = Math.floor(now.getTime() / 1000);
        const windowSec = (selectedTimeframe as number) * 60;
        const nextBarBoundary = (Math.floor(secondsSinceEpoch / windowSec) + 1) * windowSec;
        const diff = nextBarBoundary - secondsSinceEpoch;
        if (diff > 0) {
            const m = Math.floor(diff / 60);
            const s = diff % 60;
            setTimeLeft(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
        } else setTimeLeft('00:00');
    }, 1000);
    return () => clearInterval(timer);
  }, [data.market_on, selectedTimeframe]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  useEffect(() => {
    const handleError = (e: ErrorEvent) => {
        console.error("App Runtime Error:", e.error);
        addLog(`Runtime Error: ${e.message}`, 'error');
        setHasError(e.message || 'Unknown runtime error'); 
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, [addLog]);

  const [showSettings, setShowSettings] = useState(!dhanKeys?.client_id);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    const handleMessage = (message: any) => {
        try {
            if (message.type === 'error') {
                notify(message.message, 'error');
                if (message.message.toLowerCase().includes('credentials') || message.message.toLowerCase().includes('failed to connect')) {
                    setDhanConnected(false);
                    addLog('Fatal Auth Error: Auto-reconnect aborted', 'error');
                }
            }
            else if (message.type === 'oco_filled') {
                const { entry_id, filled_leg, symbol, qty } = message.data;
                const icon = filled_leg === 'TGT' ? '🎯' : '🛑';
                addLog(`${icon} OCO ${filled_leg} FILLED: ${symbol} x${qty}`, filled_leg === 'TGT' ? 'success' : 'warn');
                notify(`${icon} ${filled_leg} HIT — ${symbol} position closed by OCO`, filled_leg === 'TGT' ? 'success' : 'warn');
                setPositions(prev => {
                    const pos = prev.find((p: any) => p.id === entry_id);
                    if (pos) {
                        const exitPrice = filled_leg === 'TGT' ? (pos.targetPrice || pos.entryPrice) : (pos.slPrice || pos.entryPrice);
                        const pnl = (exitPrice - pos.entryPrice) * pos.qty;
                        setBookedPnl(bpnl => bpnl + pnl);
                        setOrders(ord => [{ id: `OCO_${entry_id}`, action: 'SELL' as const, side: pos.side, strike: pos.strike, type: filled_leg, price: exitPrice, qty: pos.qty, status: 'EXECUTED' as const, timestamp: new Date().toLocaleTimeString() }, ...ord]);
                    }
                    return prev.filter((p: any) => p.id !== entry_id);
                });
            }
            else if (message.type === 'ltp_update') {
                setLtpMap(prev => ({ ...prev, ...message.data }));
            }
            else if (message.type === 'history') {
              if (message.target === 'index' || message.target === 'chart') setIndexChartData(message.data);
            } else if (message.type === 'expiries') {
              setExpiries(Array.isArray(message.data) ? message.data : []);
              if (Array.isArray(message.data) && message.data.length > 0) setSelectedExpiry(message.data[0]);
              setDhanConnected(true);
              if (dhanKeys?.client_id && dhanKeys?.access_token) {
                localStorage.setItem('dhan_keys', JSON.stringify(dhanKeys));
              }
            } else if (message.type === 'indices_spot') {
              if (Array.isArray(message.data)) setIndicesSpot(message.data.filter((i: any) => i !== null));
            } else if (message.type === 'data') {
              if (message.ohlc) setLiveOhlc(message.ohlc);
              setData((prev: any) => ({
                  ...prev,
                  ...message,
                  spot: message.spot > 0 ? message.spot : prev.spot,
                  market_on: !!message.market_on,
                  market_status: message.market_status || 'closed',
                  chain: Array.isArray(message.chain) && message.chain.length > 0 ? message.chain : prev.chain,
                  gex: Array.isArray(message.gex) && message.gex.length > 0 ? message.gex : prev.gex,
              }));
            }
        } catch (e: any) { addLog('LocalServer Error: ' + e.message, 'warn'); }
    };

    const unsubscribe = localAppServer.onMessage(handleMessage);
    
    if (dhanKeys?.client_id && dhanKeys?.access_token) {
        localAppServer.handleMessage({ type: 'auth', payload: dhanKeys });
    }

    return () => unsubscribe();
  }, [dhanKeys, addLog, notify]);

  const handleExpiryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const expiry = e.target.value;
    setSelectedExpiry(expiry);
    localAppServer.handleMessage({ type: 'select_expiry', payload: expiry });
  };

  const handleIndexChange = (indexId: string) => {
    setSelectedIndex(indexId);
    setIndexChartData([]); 
    const idxName = INDICES.find(i => i.id === indexId)?.name || 'INDEX';
    setChartName(idxName);
    localAppServer.handleMessage({ type: 'index_change', id: indexId });
  };

  const handleSelectInstrument = (inst: { id: string, name: string, type: 'INDEX' | 'OPT' }) => {
    setChartName(inst.name);
    setIndexChartData([]); 
    localAppServer.handleMessage({ type: 'select_chart_instrument', payload: inst });
  };

  const handleTimeframeChange = (tf: number | string) => {
    setSelectedTimeframe(tf);
    localAppServer.handleMessage({ type: 'timeframe_change', timeframe: tf });
  };

  const handleGexStrikesChange = (num: number) => {
    setGexStrikes(num);
    localAppServer.handleMessage({ type: 'select_gex_strikes', payload: num });
  };

  const handleSaveSettings = async (dhan: any, mstock: any) => {
    setDhanKeys(dhan);
    setMstockKeys(mstock);
    localStorage.setItem('dhan_keys', JSON.stringify(dhan));
    localStorage.setItem('mstock_keys', JSON.stringify(mstock));
    setShowSettings(false);
    if (dhan.client_id) setDhanConnected(true);
    if (mstock.api_key && mstock.user_id) setMstockConnected(true);
  };

  useEffect(() => { handleGetFunds(); }, [handleGetFunds]);

  const handleRefreshPositions = async () => {
    try {
        const remotePositions = await localAppServer.getPositions(mstockKeys?.user_id || '');
        notify(`SYNC COMPLETE: Found ${Array.isArray(remotePositions) ? remotePositions.length : 0} external positions`, 'success');
    } catch (e: any) { notify(`SYNC FAILED: ${e.message}`, 'error'); }
  };

  const floatingPnl = positions.reduce((acc, pos) => {
    // 1. Try fast LTP map first (real-time 1s poll)
    let ltp = pos.securityId ? ltpMap[String(pos.securityId)] : undefined;
    // 2. Fall back to chain data
    if (!ltp) {
        const strikeData = data.chain.find((r: any) => r.Strike === pos.strike);
        ltp = pos.side === 'CE' ? strikeData?.Call_LTP : strikeData?.Put_LTP;
    }
    // 3. Fall back to entry price if neither available
    ltp = ltp || pos.entryPrice;
    
    const gain = (Number(ltp || 0) - Number(pos.entryPrice || 0)) * Number(pos.qty || 0);
    return acc + (isNaN(gain) ? 0 : gain);
  }, 0);
  const totalPnL = (Number(bookedPnl) || 0) + floatingPnl;


  if (hasError) {
      return (
          <div className={`min-h-screen ${theme === 'dark' ? 'bg-trading-bg' : 'bg-slate-50'} text-white flex items-center justify-center p-10`}>
              <div className="bg-trading-card border border-trading-danger p-8 rounded-2xl max-w-md w-full space-y-4 shadow-2xl">
                  <div className="flex items-center gap-3 text-trading-danger">
                      <AlertTriangle size={32} />
                      <h2 className="text-2xl font-black uppercase tracking-tighter">UI CRASHED</h2>
                  </div>
                  <div className="bg-black/30 p-4 rounded-lg font-mono text-[10px] text-trading-danger break-all">{hasError}</div>
                  <button onClick={() => { setHasError(null); window.location.reload(); }} className="w-full py-3 bg-trading-accent rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-blue-600 transition-colors">Reload Application</button>
              </div>
          </div>
      );
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Expiry';
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
    } catch (e) { return dateStr; }
  };

  return (
    <div className={`min-h-screen bg-trading-bg text-trading-text font-sans selection:bg-trading-accent/30 overflow-x-hidden transition-colors duration-300`}>
      <style>{`
        :root {
          --trading-bg: ${theme === 'dark' ? '#0d1117' : '#f8fafc'};
          --trading-card: ${theme === 'dark' ? '#161b22' : '#ffffff'};
          --trading-border: ${theme === 'dark' ? '#30363d' : '#e2e8f0'};
          --trading-text: ${theme === 'dark' ? '#c9d1d9' : '#1e293b'};
          --trading-muted: ${theme === 'dark' ? '#8b949e' : '#64748b'};
          --trading-accent: #38bdf8;
          --trading-success: #238636;
          --trading-danger: #da3633;
          color-scheme: ${theme};
        }
      `}</style>
      
      <header className={`border-b border-trading-border ${theme === 'dark' ? 'bg-trading-card/95' : 'bg-white/95'} backdrop-blur-md px-4 h-auto min-h-[64px] flex flex-col md:flex-row items-center justify-between sticky top-0 z-40 shadow-lg py-2 md:py-0`}>
        <div className="flex items-center justify-between w-full md:w-auto">
          <div className="flex items-center gap-3">
            <div className="bg-trading-accent p-1.5 rounded-lg shadow-lg shadow-trading-accent/20">
              <Zap size={22} className="text-white fill-current" />
            </div>
            <h1 className={`text-lg font-black tracking-tighter ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>TERMINAL</h1>
            <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border text-[8px] font-black uppercase tracking-widest ${data.market_status === 'open' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500' : data.market_status === 'pre-market' ? 'bg-amber-500/10 border-amber-500/30 text-amber-500' : 'bg-rose-500/10 border-rose-500/30 text-rose-500'}`}>
                <div className={`h-1.5 w-1.5 rounded-full ${data.market_status === 'open' ? 'bg-emerald-500 animate-pulse' : data.market_status === 'pre-market' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'}`}></div>
                <span className="hidden sm:inline">{data.market_status === 'open' ? 'Live' : data.market_status === 'pre-market' ? 'Pre-market' : 'Closed'}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 md:hidden">
            <button onClick={toggleTheme} className={`p-2 rounded-xl border border-trading-border ${theme === 'dark' ? 'bg-trading-card text-yellow-400' : 'bg-white text-slate-600'}`}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
            <button onClick={() => setShowSettings(true)} className={`p-2 rounded-xl border border-trading-border ${theme === 'dark' ? 'bg-trading-card text-white' : 'bg-white text-slate-600'}`}><Settings size={18} /></button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto mt-2 md:mt-0">
          <div className="flex items-center space-x-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0 no-scrollbar">
             <div className={`flex items-center ${theme === 'dark' ? 'bg-trading-bg' : 'bg-slate-100'} border border-trading-border rounded-xl px-3 py-1.5 space-x-2 shrink-0`}>
                <Calendar size={14} className="text-trading-muted" />
                <select value={selectedExpiry} onChange={handleExpiryChange} className={`bg-transparent text-[10px] font-black uppercase tracking-wider ${theme === 'dark' ? 'text-white' : 'text-slate-900'} outline-none cursor-pointer min-w-[120px]`}>
                    {expiries.length === 0 && <option value="" className={theme === 'dark' ? 'bg-[#1e222d] text-white' : 'bg-white text-slate-900'}>Expiry</option>}
                    {expiries.map(exp => <option key={exp} value={exp} className={theme === 'dark' ? 'bg-[#1e222d] text-white' : 'bg-white text-slate-900'}>{formatDate(exp)}</option>)}
                </select>
             </div>
             <div className={`flex items-center ${theme === 'dark' ? 'bg-trading-bg' : 'bg-slate-100'} border border-trading-border rounded-xl p-1 space-x-1 shrink-0`}>
                {TIMEFRAMES.map(tf => (
                    <button key={tf.value} onClick={() => handleTimeframeChange(tf.value)} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${selectedTimeframe === tf.value ? 'bg-trading-accent text-white shadow-sm' : 'text-trading-muted hover:bg-white/5'}`}>{tf.label}</button>
                ))}
             </div>
          </div>
          <div className="flex items-center justify-between w-full md:w-auto gap-3">
            <div className={`flex items-center gap-3 ${theme === 'dark' ? 'bg-trading-bg' : 'bg-slate-100'} border border-trading-border rounded-xl px-4 py-1.5 flex-1 md:w-48`}>
              <span className="text-[10px] font-black text-trading-muted uppercase whitespace-nowrap">GEX: {gexStrikes}</span>
              <input type="range" min="5" max="51" step="2" value={gexStrikes} onChange={(e) => handleGexStrikesChange(parseInt(e.target.value))} className="w-full h-1.5 bg-trading-border rounded-lg appearance-none cursor-pointer accent-trading-accent" />
            </div>
            <div className="hidden md:flex items-center gap-2">
              <button onClick={toggleTheme} className={`p-2.5 rounded-xl border border-trading-border ${theme === 'dark' ? 'bg-trading-card text-yellow-400 hover:scale-105' : 'bg-white text-slate-600 hover:scale-105'} transition-all`}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button>
              <button onClick={() => setShowSettings(true)} className={`p-2.5 rounded-xl border border-trading-border ${theme === 'dark' ? 'bg-trading-card text-white hover:scale-105' : 'bg-white text-slate-600 hover:scale-105'} transition-all`}><Settings size={18} /></button>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-3 bg-trading-accent/5 px-3 py-1.5 rounded-xl border border-trading-accent/20 shadow-inner shrink-0">
                <div className="flex flex-col items-end">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] font-black text-trading-muted uppercase">Booked:</span>
                    <span className={`text-[10px] font-mono font-bold ${ (paperTrading ? sandbox.bookedPnl : bookedPnl) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{(paperTrading ? sandbox.bookedPnl : bookedPnl).toFixed(0)}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[8px] font-black text-trading-muted uppercase">Float:</span>
                    <span className={`text-[10px] font-mono font-bold ${ (paperTrading ? sandbox.floatingPnl : floatingPnl) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{(paperTrading ? sandbox.floatingPnl : floatingPnl).toFixed(0)}</span>
                  </div>
                </div>
                <div className="h-6 w-px bg-trading-accent/20"></div>
                <div className="flex flex-col items-start relative">
                  <div className="flex items-center gap-1">
                    <span className="text-[8px] font-black text-trading-muted uppercase tracking-widest">PnL</span>
                    {paperTrading && <Shield size={10} className="text-amber-500 fill-current" />}
                  </div>
                  <p className={`text-sm md:text-lg font-mono font-black tracking-tighter ${ (paperTrading ? (sandbox.bookedPnl + sandbox.floatingPnl) : totalPnL) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    ₹{(paperTrading ? (sandbox.bookedPnl + sandbox.floatingPnl) : totalPnL).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </p>
                </div>
            </div>
            <div className="flex items-center gap-3 bg-trading-accent/5 px-3 py-1.5 rounded-xl border border-trading-accent/20 shadow-inner shrink-0">
                <button onClick={handleGetFunds} className="flex items-center gap-1.5 text-trading-accent text-[10px] font-black uppercase tracking-widest hover:text-white transition-all active:scale-95 group"><Wallet size={14} className="group-hover:animate-bounce" /><span className="hidden sm:inline">Funds</span></button>
                <div className="h-4 w-px bg-trading-accent/20"></div>
                <p className="text-sm md:text-lg font-mono font-black text-trading-accent tracking-tighter">₹{(paperTrading ? sandbox.paperCapital : capital).toLocaleString()}</p>
            </div>
          </div>
        </div>
      </header>

      {showSettings && (
        <SettingsModal
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
          initialDhan={dhanKeys}
          initialMstock={mstockKeys}
          dhanConnected={dhanConnected}
          mstockConnected={mstockConnected}
          theme={theme}
          notify={notify}
          onRefreshFunds={handleGetFunds}
          paperTrading={paperTrading}
          onTogglePaperTrading={setPaperTrading}
          simCapital={sandbox.paperCapital}
          onSimCapitalChange={sandbox.setPaperCapital}
          moduleConfig={moduleConfig}
          onModuleToggle={handleModuleToggle}
          onRenewKeys={() => {
              setDhanKeys({ client_id: '', access_token: '' });
              setMstockKeys({ api_key: '', user_id: '', password: '' });
              localStorage.removeItem('dhan_keys');
              localStorage.removeItem('mstock_keys');
              notify('CREDENTIALS CLEARED. PLEASE RE-AUTHENTICATE.', 'warn');
          }}
        />
      )}

      <main className="p-3 grid grid-cols-1 xl:grid-cols-12 gap-3 max-w-[1920px] mx-auto pb-80">
          <div className={`xl:col-span-9 space-y-3 ${(isGexFullscreen || isCombinedGexFullscreen) ? 'hidden' : ''}`}>
            <div className={`bg-trading-card rounded-xl border border-trading-border overflow-hidden shadow-2xl flex flex-col ${isChartFullscreen ? 'fixed inset-0 z-[100] rounded-none border-none' : ''}`}>
                <div className={`px-4 py-1.5 shrink-0 ${theme === 'dark' ? 'bg-[#1e222d]' : 'bg-slate-50'} border-b border-trading-border flex justify-between items-center`}>
                    <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
                        <div className="flex items-center gap-2">
                            <Activity size={16} className="text-trading-accent" />
                            <span className={`text-[12px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{chartName}</span>
                        </div>
                        <div className="h-4 w-px bg-trading-border hidden sm:block"></div>
                        <div className="flex items-center gap-2 px-2.5 py-0.5 bg-black/10 rounded-lg shrink-0">
                            <Clock size={11} className="text-trading-accent" />
                            <span className={`text-[10px] font-mono font-black ${theme === 'dark' ? 'text-trading-accent' : 'text-blue-600'}`}>{timeLeft}</span>
                        </div>
                        <div className="h-4 w-px bg-trading-border hidden sm:block"></div>
                        <div className="flex items-center gap-1.5 shrink-0">
                            {['EMA', 'VOL', 'VWCB', 'UT-BOT', 'GEX'].map(btn => (
                                <button key={btn} onClick={() => {
                                    if(btn==='EMA') setShowEma(!showEma);
                                    if(btn==='VOL') setShowVolume(!showVolume);
                                    if(btn==='VWCB') setShowVwcb(!showVwcb);
                                    if(btn==='UT-BOT') setShowUtBot(!showUtBot);
                                    if(btn==='GEX') setShowGammaLevels(!showGammaLevels);
                                }} className={`px-2 py-0.5 rounded text-[8px] font-black uppercase transition-colors ${(btn==='EMA' && showEma) || (btn==='VOL' && showVolume) || (btn==='VWCB' && showVwcb) || (btn==='UT-BOT' && showUtBot) || (btn==='GEX' && showGammaLevels) ? 'bg-trading-accent text-white shadow-sm' : 'text-trading-muted hover:bg-white/5 border border-trading-border'}`}>{btn}</button>
                            ))}
                        </div>
                    </div>
                    <button onClick={() => setIsChartFullscreen(!isChartFullscreen)} className="text-trading-muted hover:text-white transition-colors p-1 shrink-0 ml-2">{isChartFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}</button>
                </div>
                {/* Chart canvas — flex-1 fills remaining height after toolbar */}
                <div className={`${isChartFullscreen ? 'flex-1 min-h-0' : 'h-[300px] md:h-[440px]'} relative`}>
                    {showTimeframeInput && (
                        <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/20 backdrop-blur-sm rounded-xl">
                            <div className={`p-6 rounded-2xl ${theme === 'dark' ? 'bg-[#1e222d] border border-[#2a2e39]' : 'bg-white border border-slate-200'} shadow-2xl flex flex-col items-center animate-in fade-in zoom-in duration-200`}>
                                <span className={`text-[10px] font-black uppercase tracking-widest mb-2 ${theme === 'dark' ? 'text-trading-muted' : 'text-slate-500'}`}>Change Timeframe</span>
                                <div className="text-4xl font-black font-mono text-trading-accent">{timeframeInput}<span className="animate-pulse">_</span></div>
                                <span className={`mt-4 text-[9px] ${theme === 'dark' ? 'text-[#4b5563]' : 'text-slate-400'}`}>Press Enter to apply, Esc to cancel</span>
                            </div>
                        </div>
                    )}
                    <MemoizedTradingChart data={indexChartData} liveData={liveOhlc} title={chartName} timeframe={selectedTimeframe} theme={theme} showVolume={showVolume} showEma={showEma} showVwcb={showVwcb} showUtBot={showUtBot} showGammaLevels={showGammaLevels} callWall={data.call_wall} putWall={data.put_wall} callWall2={data.call_wall_2} putWall2={data.put_wall_2} gammaFlip={data.gamma_flip} positions={paperTrading ? sandbox.positions : positions} onModifyPosition={paperTrading ? sandbox.modifyPosition : () => {}} />
                </div>
            </div>

            {!isChartFullscreen && (moduleConfig.scalper !== false) && (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
                  <div className="h-full min-h-[220px]">
                    <ScalperModule capital={paperTrading ? sandbox.paperCapital : capital} spot={data.spot} chain={data.chain} lotSize={data.lot_size} onTrade={handleScalperTrade} theme={theme} />
                  </div>
                  <div className="h-full min-h-[220px] flex flex-col">

                    <div className={`flex bg-trading-card border-x border-t border-trading-border rounded-t-xl overflow-hidden`}>
                        <button onClick={() => setActiveExecTab('positions')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${activeExecTab === 'positions' ? (paperTrading ? 'bg-amber-500' : 'bg-trading-accent') : 'text-trading-muted hover:bg-white/5'} text-white`}>
                            {paperTrading ? 'Paper Positions' : 'Live Positions'} ({ (paperTrading ? sandbox.positions : positions).length })
                        </button>
                        <button onClick={() => setActiveExecTab('orders')} className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${activeExecTab === 'orders' ? (paperTrading ? 'bg-amber-500' : 'bg-trading-accent') : 'text-trading-muted hover:bg-white/5'} text-white`}>
                            {paperTrading ? 'Paper Orders' : 'Live Orders'} ({ (paperTrading ? sandbox.orders : orders).length })
                        </button>
                    </div>
                    <div className="flex-1 min-h-0 border-x border-b border-trading-border rounded-b-xl overflow-hidden">
                        {activeExecTab === 'positions' ? (
                            <PositionsModule 
                                positions={ (paperTrading ? sandbox.positions : positions) as any } 
                                onExit={ paperTrading ? sandbox.exitPosition : handleExitPosition } 
                                onExitAll={ paperTrading ? sandbox.exitAll : handleExitAll } 
                                onRefresh={ paperTrading ? () => {} : handleRefreshPositions } 
                                theme={theme} 
                                bookedPnl={ paperTrading ? sandbox.bookedPnl : bookedPnl } 
                                chain={data.chain} 
                                ltpMap={ltpMap}
                            />
                        ) : (
                            <OrdersModule 
                                orders={ (paperTrading ? sandbox.orders : orders) as any } 
                                onClear={ paperTrading ? () => {} : () => setOrders([]) } 
                                theme={theme} 
                            />
                        )}
                    </div>
                  </div>
               </div>
            )}

            {/* ── Option Matrix ── */}
            {!isChartFullscreen && moduleConfig.optionChain !== false && (
              <div className="bg-trading-card rounded-xl border border-trading-border overflow-hidden shadow-2xl">
                <div className={`px-4 py-1.5 ${theme === 'dark' ? 'bg-[#1e222d]' : 'bg-slate-100'} border-b border-trading-border flex justify-between items-center`}>
                  <div className="flex items-center gap-3">
                    <Layout size={14} className="text-trading-accent" />
                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-trading-muted' : 'text-slate-600'}`}>Option Matrix</span>
                  </div>
                </div>
                <div className="p-0 overflow-x-auto no-scrollbar">
                  <MemoizedOptionChain data={data?.chain} spotPrice={data.spot} theme={theme} onSelectInstrument={handleSelectInstrument} />
                </div>
              </div>
            )}

          </div>{/* end xl:col-span-9 */}

          {!isChartFullscreen && (
            <div className="xl:col-span-3 space-y-3">
                {/* Watchlist */}
                {moduleConfig.watchlist !== false && (
                <div className={`bg-trading-card rounded-xl border border-trading-border overflow-hidden shadow-2xl transition-all hover:border-trading-muted/50 ${
                    (isGexFullscreen || isCombinedGexFullscreen) ? 'hidden' : ''
                }`}>
                    <div className={`px-4 py-1.5 ${theme === 'dark' ? 'bg-[#1e222d]' : 'bg-slate-50'} border-b border-trading-border flex items-center gap-3`}>
                        <Activity size={14} className="text-trading-accent" />
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-trading-muted' : 'text-slate-600'}`}>Watchlist</span>
                    </div>
                    <div className="p-0 max-h-[200px] md:max-h-[260px] overflow-y-auto">
                        <table className="w-full text-xs text-left">
                            <thead className={`text-[9px] uppercase ${theme === 'dark' ? 'bg-[#2a2e39]' : 'bg-slate-100'} text-trading-muted sticky top-0 z-10`}>
                                <tr><th className="px-4 py-2">Index</th><th className="px-4 py-2 text-right">Price</th><th className="px-4 py-2 text-right text-[8px]">Change</th></tr>
                            </thead>
                            <tbody className={theme === 'dark' ? 'text-[#d1d4dc]' : 'text-slate-700'}>
                                {indicesSpot && indicesSpot.map((idx, i) => (
                                    <tr key={idx?.id || i} onClick={() => handleIndexChange(idx.id)} className={`border-b border-trading-border hover:bg-white/5 cursor-pointer transition-colors ${selectedIndex === idx.id ? 'bg-trading-accent/10' : ''}`}>
                                        <td className="px-4 py-2.5 font-bold">{idx.name}</td>
                                        <td className="px-4 py-2.5 text-right font-mono font-bold">₹{idx.spot?.toLocaleString()}</td>
                                        <td className={`px-4 py-2.5 text-right font-mono font-black ${idx.change >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{idx.change >= 0 ? '+' : ''}{idx.p_change}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
                )}
                {/* ── Current Expiry GEX ── */}
                {moduleConfig.gexProfile !== false && (
                <div className={`bg-trading-card rounded-xl border border-trading-border overflow-hidden shadow-2xl flex flex-col ${
                    isGexFullscreen ? 'fixed inset-0 z-[100] rounded-none border-none h-screen' : isCombinedGexFullscreen ? 'hidden' : ''
                }`}>
                    <div className={`px-4 py-1.5 shrink-0 ${theme === 'dark' ? 'bg-[#1e222d]' : 'bg-slate-50'} border-b border-trading-border flex justify-between items-center`}>
                        <div className="flex items-center gap-3">
                            <PieChart size={14} className="text-trading-accent" />
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-trading-muted' : 'text-slate-600'}`}>
                                GEX Profile
                            </span>
                            {data.current_expiry && (
                                <span className="text-[8px] font-mono text-trading-muted bg-white/5 px-2 py-0.5 rounded">
                                    {data.current_expiry}
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => setIsGexFullscreen(!isGexFullscreen)}
                            className="text-trading-muted hover:text-white transition-colors p-1 shrink-0"
                        >
                            {isGexFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                    </div>
                    <div className={`p-3 ${isGexFullscreen ? 'flex-1 min-h-0' : 'shrink-0 h-[300px]'}`}>
                        <MemoizedGexChart
                            data={data.gex}
                            theme={theme}
                            callWall={data.call_wall}
                            putWall={data.put_wall}
                            callWall2={data.call_wall_2}
                            putWall2={data.put_wall_2}
                            gammaFlip={data.gamma_flip}
                            spotPrice={data.spot}
                            height={isGexFullscreen ? 'calc(100vh - 96px)' : 280}
                        />
                    </div>
                </div>
                )}

                {/* ── Combined GEX (below GEX Profile, own fullscreen) ── */}
                {moduleConfig.combinedGex !== false && (
                <div className={`bg-trading-card rounded-xl border border-trading-border overflow-hidden shadow-2xl flex flex-col ${
                    isCombinedGexFullscreen ? 'fixed inset-0 z-[100] rounded-none border-none h-screen' : isGexFullscreen ? 'hidden' : ''
                }`}>
                    <div className={`px-4 py-1.5 shrink-0 ${theme === 'dark' ? 'bg-[#1e222d]' : 'bg-slate-50'} border-b border-trading-border flex justify-between items-center`}>
                        <div className="flex items-center gap-3">
                            <PieChart size={14} className="text-trading-accent opacity-70" />
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-trading-muted' : 'text-slate-600'}`}>
                                Combined GEX
                            </span>
                            {data.agg_gex?.length > 0 && (
                                <span className="text-[8px] font-mono text-trading-muted bg-white/5 px-2 py-0.5 rounded">
                                    {data.agg_gex.length} strikes · ≤4 expiries
                                </span>
                            )}
                        </div>
                        <button
                            onClick={() => setIsCombinedGexFullscreen(!isCombinedGexFullscreen)}
                            className="text-trading-muted hover:text-white transition-colors p-1 shrink-0"
                        >
                            {isCombinedGexFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                    </div>
                    <div className={`p-3 ${isCombinedGexFullscreen ? 'flex-1 min-h-0' : 'shrink-0 h-[300px]'}`}>
                        <MemoizedGexChart
                            data={data.agg_gex}
                            theme={theme}
                            spotPrice={data.spot}
                            callWall={data.call_wall}
                            putWall={data.put_wall}
                            gammaFlip={data.gamma_flip}
                            height={isCombinedGexFullscreen ? 'calc(100vh - 96px)' : 280}
                        />
                    </div>
                </div>
                )}

            </div>
          )}

      </main>

      <ProcessTerminal logs={logs} theme={theme} onClear={() => setLogs([])} />

      {/* Toast Notifications */}
      <div className="fixed top-24 md:top-20 right-4 z-[100] flex flex-col gap-2 pointer-events-none max-w-[calc(100vw-32px)]">
        {toasts.map(toast => (
          <div key={toast.id} className={`px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 animate-in slide-in-from-right-full duration-300 pointer-events-auto min-w-[240px] ${toast.type === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' : toast.type === 'error' ? 'bg-rose-500 border-rose-400 text-white' : toast.type === 'warn' ? 'bg-amber-500 border-amber-400 text-white' : 'bg-[#1e222d] border-[#30363d] text-white'}`}>
            <div className="shrink-0">{toast.type === 'success' ? <Zap size={18} /> : toast.type === 'error' ? <AlertTriangle size={18} /> : toast.type === 'warn' ? <AlertTriangle size={18} /> : <Activity size={18} />}</div>
            <p className="text-[11px] font-bold uppercase tracking-wide leading-tight">{toast.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default App;
