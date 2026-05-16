import { useState, useEffect, useCallback } from 'react';

export interface SandboxPosition {
    id: string;
    symbol: string;
    side: 'CE' | 'PE';
    strike: number;
    entryPrice: number;
    slPrice: number;
    targetPrice?: number;
    qty: number;
    orderType: string;
    timestamp: string;
    isPaper: true;
}

export interface SandboxOrder {
    id: string;
    action: 'BUY' | 'SELL';
    side: 'CE' | 'PE';
    strike: number;
    type: string;
    price: number;
    qty: number;
    status: 'EXECUTED' | 'CANCELLED';
    timestamp: string;
}

export const useSandboxEngine = (active: boolean, initialCapital: number, lotSize: number, notify: any, chainData: any[]) => {
    const [paperCapital, setPaperCapital] = useState(() => {
        const saved = localStorage.getItem('paper_capital');
        return saved ? Number(saved) : initialCapital;
    });
    
    const [positions, setPositions] = useState<SandboxPosition[]>([]);
    const [orders, setOrders] = useState<SandboxOrder[]>([]);
    const [bookedPnl, setBookedPnl] = useState(() => {
        return Number(localStorage.getItem('paper_booked_pnl')) || 0;
    });

    useEffect(() => {
        localStorage.setItem('paper_capital', paperCapital.toString());
    }, [paperCapital]);

    useEffect(() => {
        localStorage.setItem('paper_booked_pnl', bookedPnl.toString());
    }, [bookedPnl]);

    const executeTrade = useCallback((side: 'CE' | 'PE', strike: number, price: number, sl: number, target: number, orderType: string, numLots: number, symbol: string) => {
        if (!active) return;

        const totalQty = lotSize * numLots;
        const orderValue = price * totalQty;

        if (orderValue > paperCapital) {
            notify(`[SANDBOX] INSUFFICIENT CAPITAL: ₹${orderValue.toLocaleString()} > ₹${paperCapital.toLocaleString()}`, 'error');
            return;
        }

        const id = Math.random().toString(36).substr(2, 9);
        const timestamp = new Date().toLocaleTimeString();

        setPaperCapital(prev => prev - orderValue);
        
        const newPos: SandboxPosition = {
            id: `PAPER_${id}`,
            symbol,
            side,
            strike,
            entryPrice: price,
            slPrice: sl,
            targetPrice: target,
            qty: totalQty,
            orderType,
            timestamp,
            isPaper: true
        };

        const newOrder: SandboxOrder = {
            id: `PAPER_${id}`,
            action: 'BUY',
            side,
            strike,
            type: orderType,
            price,
            qty: totalQty,
            status: 'EXECUTED',
            timestamp
        };

        setPositions(prev => [...prev, newPos]);
        setOrders(prev => [newOrder, ...prev]);
        notify(`[SANDBOX] BOUGHT ${symbol} @ ₹${price.toFixed(2)}`, 'success');
    }, [active, paperCapital, lotSize, notify]);

    const modifyPosition = useCallback((id: string, type: 'SL' | 'TP', newPrice: number) => {
        setPositions(prev => prev.map(p => {
            if (p.id === id) {
                if (type === 'SL') return { ...p, slPrice: newPrice };
                if (type === 'TP') return { ...p, targetPrice: newPrice };
            }
            return p;
        }));
        notify(`[SANDBOX] UPDATED ${type} TO ₹${newPrice.toFixed(1)}`, 'success');
    }, [notify]);

    const exitPosition = useCallback((id: string) => {
        const pos = positions.find(p => p.id === id);
        if (!pos) return;

        const strikeData = chainData.find((r: any) => r.Strike === pos.strike);
        const exitPrice = pos.side === 'CE' ? (strikeData?.Call_LTP || pos.entryPrice) : (strikeData?.Put_LTP || pos.entryPrice);
        
        const pnl = (exitPrice - pos.entryPrice) * pos.qty;
        const totalRelease = exitPrice * pos.qty;

        setPaperCapital(prev => prev + totalRelease);
        setBookedPnl(prev => prev + pnl);
        setPositions(prev => prev.filter(p => p.id !== id));
        
        const exitOrder: SandboxOrder = {
            id: `PAPER_EXIT_${id}`,
            action: 'SELL',
            side: pos.side,
            strike: pos.strike,
            type: 'MKT',
            price: exitPrice,
            qty: pos.qty,
            status: 'EXECUTED',
            timestamp: new Date().toLocaleTimeString()
        };
        setOrders(prev => [exitOrder, ...prev]);
        notify(`[SANDBOX] EXITED ${pos.symbol} @ ₹${exitPrice.toFixed(2)} | PnL: ₹${pnl.toFixed(2)}`, pnl >= 0 ? 'success' : 'warn');
    }, [positions, chainData, notify]);

    const exitAll = useCallback(() => {
        if (positions.length === 0) return;
        // Batch all exits in a single state update to avoid stale closure issues.
        // Each call to exitPosition captures the positions snapshot at creation time,
        // so looping over them would only ever exit the first one.
        let capitalDelta = 0;
        let pnlDelta = 0;
        const exitOrders: SandboxOrder[] = [];
        const now = new Date().toLocaleTimeString();

        positions.forEach(pos => {
            const strikeData = chainData.find((r: any) => r.Strike === pos.strike);
            const exitPrice = pos.side === 'CE'
                ? (strikeData?.Call_LTP || pos.entryPrice)
                : (strikeData?.Put_LTP || pos.entryPrice);
            const pnl = (exitPrice - pos.entryPrice) * pos.qty;
            capitalDelta += exitPrice * pos.qty;
            pnlDelta += pnl;
            exitOrders.push({ id: `PAPER_EXIT_${pos.id}`, action: 'SELL', side: pos.side, strike: pos.strike, type: 'MKT', price: exitPrice, qty: pos.qty, status: 'EXECUTED', timestamp: now });
            notify(`[SANDBOX] EXITED ${pos.symbol} @ ₹${exitPrice.toFixed(2)} | PnL: ₹${pnl.toFixed(2)}`, pnl >= 0 ? 'success' : 'warn');
        });

        setPaperCapital(prev => prev + capitalDelta);
        setBookedPnl(prev => prev + pnlDelta);
        setPositions([]);
        setOrders(prev => [...exitOrders, ...prev]);
    }, [positions, chainData, notify]);

    // Background Price Monitor
    useEffect(() => {
        if (positions.length === 0 || chainData.length === 0) return;

        positions.forEach(pos => {
            const strikeData = chainData.find((r: any) => r.Strike === pos.strike);
            const ltp = pos.side === 'CE' ? strikeData?.Call_LTP : strikeData?.Put_LTP;

            if (!ltp || ltp <= 0) return;

            let triggered = false;
            if (pos.side === 'CE') {
                if (ltp <= pos.slPrice) {
                    notify(`[SANDBOX] CE SL TRIGGERED @ ₹${ltp.toFixed(2)}`, 'error');
                    triggered = true;
                } else if (pos.targetPrice && ltp >= pos.targetPrice) {
                    notify(`[SANDBOX] CE TARGET HIT @ ₹${ltp.toFixed(2)}`, 'success');
                    triggered = true;
                }
            } else {
                if (ltp >= pos.slPrice) {
                    notify(`[SANDBOX] PE SL TRIGGERED @ ₹${ltp.toFixed(2)}`, 'error');
                    triggered = true;
                } else if (pos.targetPrice && ltp <= pos.targetPrice) {
                    notify(`[SANDBOX] PE TARGET HIT @ ₹${ltp.toFixed(2)}`, 'success');
                    triggered = true;
                }
            }

            if (triggered) exitPosition(pos.id);
        });
    }, [active, positions, chainData, exitPosition, notify]);

    // Calculate Floating PnL
    const floatingPnl = positions.reduce((acc, pos) => {
        const strikeData = chainData.find((r: any) => r.Strike === pos.strike);
        const ltp = pos.side === 'CE' ? (strikeData?.Call_LTP || pos.entryPrice) : (strikeData?.Put_LTP || pos.entryPrice);
        const gain = (ltp - pos.entryPrice) * pos.qty;
        return acc + gain;
    }, 0);

    return {
        paperCapital,
        positions,
        orders,
        bookedPnl,
        floatingPnl,
        executeTrade,
        exitPosition,
        exitAll,
        setPaperCapital,
        modifyPosition
    };
};
