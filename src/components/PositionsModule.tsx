import React from 'react';
import { Briefcase, XCircle, Trash2, ArrowUpRight, ArrowDownRight, RefreshCw } from 'lucide-react';

interface Position {
  id: string;
  side: 'CE' | 'PE';
  strike: number;
  entryPrice: number;
  slPrice: number;
  targetPrice?: number;
  qty: number;
  orderType: string;
  timestamp: string;
  isPaper?: boolean;
  securityId?: string | number;
  segment?: string;
}

interface PositionsModuleProps {
  positions: Position[];
  onExit: (id: string) => void;
  onExitAll: () => void;
  onRefresh: () => void;
  theme: 'dark' | 'light';
  bookedPnl: number;
  chain: any[];
  ltpMap?: Record<string, number>;
}

export const PositionsModule: React.FC<PositionsModuleProps> = ({
  positions,
  onExit,
  onExitAll,
  onRefresh,
  theme,
  bookedPnl,
  chain,
  ltpMap = {}
}) => {
  const isDark = theme === 'dark';

  // Calculate total floating PnL
  const floatingPnl = positions.reduce((acc, pos) => {
    let ltp = pos.securityId ? ltpMap[String(pos.securityId)] : undefined;
    if (!ltp) {
        const strikeData = chain.find(r => r.Strike === pos.strike);
        ltp = pos.side === 'CE' ? (strikeData?.Call_LTP || pos.entryPrice) : (strikeData?.Put_LTP || pos.entryPrice);
    }
    ltp = ltp || pos.entryPrice;
    
    const gain = (Number(ltp || 0) - Number(pos.entryPrice || 0)) * Number(pos.qty || 0);
    return acc + (isNaN(gain) ? 0 : gain);
  }, 0);

  return (
    <div className={`rounded-xl border bg-trading-card border-trading-border overflow-hidden shadow-2xl flex flex-col h-full`}>
      <div className={`px-4 py-2 ${isDark ? 'bg-[#1e222d]' : 'bg-slate-50'} border-b border-trading-border flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-3">
          <Briefcase size={16} className="text-trading-accent" />
          <span className={`text-[12px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-trading-muted' : 'text-slate-600'}`}>Live Positions ({positions.length})</span>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 border-r border-white/10 pr-4">
             <div className="text-right">
                <span className="text-[10px] text-trading-muted uppercase font-bold block leading-none mb-1">Floating</span>
                <span className={`text-sm font-mono font-black ${floatingPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    ₹{floatingPnl.toFixed(2)}
                </span>
             </div>
             <div className="text-right">
                <span className="text-[10px] text-trading-muted uppercase font-bold block leading-none mb-1">Booked</span>
                <span className={`text-sm font-mono font-black ${bookedPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    ₹{bookedPnl.toFixed(2)}
                </span>
             </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onRefresh}
              className={`p-2 ${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-100'} rounded-lg text-trading-muted hover:text-trading-accent transition-colors`}
              title="Refresh Positions"
            >
              <RefreshCw size={14} />
            </button>
            {positions.length > 0 && (
              <button 
                onClick={onExitAll}
                className="flex items-center gap-2 px-4 py-1.5 bg-trading-danger/10 hover:bg-trading-danger/20 text-trading-danger text-[10px] font-black uppercase tracking-widest rounded border border-trading-danger/30 transition-colors"
              >
                <Trash2 size={14} />
                Exit All
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {positions.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 p-6 text-center">
            <Briefcase size={48} className="mb-3" />
            <p className="text-[12px] font-black uppercase tracking-widest">No Active Positions</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className={`sticky top-0 ${isDark ? 'bg-[#2a2e39]' : 'bg-slate-100'} text-trading-muted uppercase text-[10px] font-black tracking-widest z-10`}>
              <tr>
                <th className="px-4 py-3">Instrument</th>
                <th className="px-4 py-3 text-right">LTP/Entry</th>
                <th className="px-4 py-3 text-right">PnL</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {positions.map((pos) => {
                const isCE = pos.side === 'CE';
                let ltp = pos.securityId ? ltpMap[String(pos.securityId)] : undefined;
                if (!ltp) {
                    const strikeData = chain.find(r => r.Strike === pos.strike);
                    ltp = isCE ? (strikeData?.Call_LTP || pos.entryPrice) : (strikeData?.Put_LTP || pos.entryPrice);
                }
                ltp = ltp || pos.entryPrice;
                
                const pnl = (Number(ltp || 0) - Number(pos.entryPrice || 0)) * Number(pos.qty || 0);
                const displayPnl = isNaN(pnl) ? 0 : pnl;
                
                return (
                  <tr key={pos.id} className="hover:bg-white/5 transition-colors group">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {isCE ? <ArrowUpRight size={18} className="text-emerald-500" /> : <ArrowDownRight size={18} className="text-rose-500" />}
                        <div>
                          <p className="font-black text-sm text-trading-text">{pos.strike} {pos.side}</p>
                          <p className="text-[9px] text-trading-muted uppercase font-bold tracking-tighter">{pos.orderType} | QTY: {pos.qty}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <p className="font-mono font-black text-sm text-trading-text leading-none">₹{ltp.toFixed(2)}</p>
                      <div className="flex items-center justify-end gap-2 mt-1">
                          <span className="text-[8px] text-trading-muted font-bold">ENTRY: ₹{pos.entryPrice.toFixed(1)}</span>
                          <span className="text-[8px] text-rose-500 font-bold">SL: ₹{pos.slPrice.toFixed(1)}</span>
                          {pos.targetPrice && <span className="text-[8px] text-emerald-500 font-bold">TGT: ₹{pos.targetPrice.toFixed(1)}</span>}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-mono font-black text-sm ${displayPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      ₹{displayPnl.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button 
                        onClick={() => onExit(pos.id)}
                        className="p-2 bg-trading-danger/10 hover:bg-trading-danger text-trading-danger hover:text-white rounded-lg transition-all"
                        title="One Tap Exit"
                      >
                        <XCircle size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
