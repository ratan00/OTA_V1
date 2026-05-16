import React, { useState, useEffect } from 'react';
import { Zap, RotateCcw } from 'lucide-react';

interface ScalperModuleProps {
  capital: number;
  spot: number;
  chain: any[];
  lotSize: number;
  onTrade: (side: 'CE' | 'PE', strike: number, price: number, sl: number, target: number, orderType: 'MKT' | 'LMT', numLots: number) => void;
  theme: 'dark' | 'light';
}

export const ScalperModule: React.FC<ScalperModuleProps> = ({
  capital,
  spot,
  chain,
  lotSize,
  onTrade,
  theme
}) => {
  const [riskPoints, setRiskPoints] = useState(10.0);
  const [targetPoints, setTargetPoints] = useState(20.0);
  const [numLots, setNumLots] = useState(1);
  const [orderType, setOrderType] = useState<'MKT' | 'LMT'>('MKT');
  const [manualCE, setManualCE] = useState<number | null>(null);
  const [manualPE, setManualPE] = useState<number | null>(null);
  const [limitPriceCE, setLimitPriceCE] = useState<number>(0);
  const [limitPricePE, setLimitPricePE] = useState<number>(0);
  const [recommendations, setRecommendations] = useState<{ CE: any; PE: any }>({ CE: null, PE: null });

  const handleReset = () => {
    setManualCE(null);
    setManualPE(null);
  };

  const activeCE = manualCE ? chain.find(r => r.Strike === manualCE) : recommendations.CE;
  const activePE = manualPE ? chain.find(r => r.Strike === manualPE) : recommendations.PE;

  useEffect(() => {
    if (orderType === 'MKT') {
        if (activeCE) setLimitPriceCE(activeCE.Call_LTP || 0);
        if (activePE) setLimitPricePE(activePE.Put_LTP || 0);
    }
  }, [activeCE?.Call_LTP, activePE?.Put_LTP, orderType]);

  useEffect(() => {
    if (!chain || chain.length === 0 || spot === 0) return;

    const validChain = chain.filter(row => row.Call_LTP > 0 || row.Put_LTP > 0);
    if (validChain.length === 0) return;

    const currentCapital = Number(capital) || 0;
    const currentLotSize = Number(lotSize) || 1;

    const sortedByProximity = [...validChain].sort((a, b) => Math.abs(a.Strike - spot) - Math.abs(b.Strike - spot));
    
    let bestCE = sortedByProximity.find(s => {
        const price = Number(s.Call_LTP) || 0;
        return price > 0 && (currentCapital === 0 || (price * currentLotSize <= currentCapital));
    });

    let bestPE = sortedByProximity.find(s => {
        const price = Number(s.Put_LTP) || 0;
        return price > 0 && (currentCapital === 0 || (price * currentLotSize <= currentCapital));
    });

    if (!bestCE) bestCE = sortedByProximity[0];
    if (!bestPE) bestPE = sortedByProximity[0];

    setRecommendations({ CE: bestCE, PE: bestPE });
  }, [chain, spot, capital, lotSize]);

  const handleTrade = (side: 'CE' | 'PE') => {
    let rec = side === 'CE' ? activeCE : activePE;
    if (!rec) return;

    const price = side === 'CE' ? limitPriceCE : limitPricePE;
    if (price <= 0) return; 

    // Directional SL/TGT calculation
    const sl = side === 'CE' ? (price - riskPoints) : (price + riskPoints);
    const target = side === 'CE' ? (price + targetPoints) : (price - targetPoints);
    
    onTrade(side, rec.Strike, price, sl, target, orderType, numLots);
  };

  const strikesList = Array.isArray(chain) ? chain : [];
  const allStrikes = [...new Set(strikesList.map(r => r.Strike))].sort((a, b) => a - b);

  return (
    <div className={`rounded-xl border ${theme === 'dark' ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200'} overflow-hidden shadow-2xl flex flex-col h-full`}>
      <div className={`px-4 py-2 ${theme === 'dark' ? 'bg-[#1e222d]' : 'bg-slate-50'} border-b ${theme === 'dark' ? 'border-[#30363d]' : 'border-slate-100'} flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0`}>
        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          <Zap size={16} className="text-yellow-500 shrink-0" />
          <span className={`text-[12px] font-black uppercase tracking-[0.2em] ${theme === 'dark' ? 'text-trading-muted' : 'text-slate-600'} shrink-0`}>Scalper</span>
          <span className="bg-trading-accent/10 text-trading-accent text-[10px] font-black px-2 py-0.5 rounded ml-2 shrink-0">LOT: {lotSize}</span>
          <button 
            onClick={handleReset}
            className="flex items-center gap-1 ml-3 px-2 py-0.5 bg-trading-accent/10 hover:bg-trading-accent text-trading-accent hover:text-white text-[9px] font-black uppercase tracking-widest rounded transition-all group shrink-0"
            title="Reset to Recommended ATM Strikes"
          >
            <RotateCcw size={10} className="group-hover:rotate-[-45deg] transition-transform" />
            <span className="hidden xs:inline">Reset strikes</span>
          </button>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end overflow-x-auto no-scrollbar">
           <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-trading-muted uppercase">Lots:</span>
              <div className="flex items-center bg-black/20 rounded px-2 py-1">
                <input 
                  type="number" 
                  min="1"
                  max="100"
                  value={numLots} 
                  onChange={(e) => setNumLots(Math.max(1, Number(e.target.value)))}
                  className="bg-transparent text-[11px] font-mono font-bold w-10 outline-none text-trading-accent"
                />
              </div>
           </div>
           <div className="flex items-center gap-1.5">
                <button 
                    onClick={() => setOrderType('MKT')}
                    className={`text-[9px] font-black px-2.5 py-1 rounded transition-all ${orderType === 'MKT' ? 'bg-trading-accent text-white' : 'text-trading-muted hover:bg-white/5'}`}
                >MKT</button>
                <button 
                    onClick={() => setOrderType('LMT')}
                    className={`text-[9px] font-black px-2.5 py-1 rounded transition-all ${orderType === 'LMT' ? 'bg-trading-accent text-white' : 'text-trading-muted hover:bg-white/5'}`}
                >LMT</button>
           </div>
           <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-trading-muted uppercase">SL:</span>
              <div className="flex items-center bg-black/20 rounded px-2 py-1">
                <input 
                  type="number" 
                  step="0.05"
                  value={riskPoints} 
                  onChange={(e) => setRiskPoints(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-mono font-bold w-14 outline-none text-rose-500"
                />
              </div>
           </div>
           <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-trading-muted uppercase">TGT:</span>
              <div className="flex items-center bg-black/20 rounded px-2 py-1">
                <input 
                  type="number" 
                  step="0.05"
                  value={targetPoints} 
                  onChange={(e) => setTargetPoints(Number(e.target.value))}
                  className="bg-transparent text-[11px] font-mono font-bold w-14 outline-none text-emerald-500"
                />
              </div>
           </div>
        </div>
      </div>

      <div className="p-3 grid grid-cols-1 md:grid-cols-2 gap-3 flex-1">
        {/* CE Recommendation */}
        <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-100'} flex flex-col justify-between`}>
          <div className="flex justify-between items-start mb-2">
            <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500 block mb-1">CALL</span>
                <select 
                    value={activeCE?.Strike || ''} 
                    onChange={(e) => setManualCE(Number(e.target.value))}
                    className="bg-transparent text-lg font-black font-mono outline-none cursor-pointer hover:text-emerald-400"
                >
                    {allStrikes.map(s => <option key={s} value={s} className={theme === 'dark' ? 'bg-[#161b22] text-white' : 'bg-white text-slate-900'}>{s}</option>)}
                </select>
            </div>
            <div className="text-right space-y-1">
                <div className="flex items-center gap-2 justify-end">
                    <span className="text-[10px] text-trading-muted uppercase font-bold tracking-tighter">CMP:</span>
                    <span className="text-sm font-mono font-black text-trading-text">₹{activeCE?.Call_LTP?.toFixed(2) || '0.00'}</span>
                </div>
                {orderType === 'LMT' && (
                  <div className="flex items-center gap-2 justify-end animate-in fade-in slide-in-from-right-1 duration-200">
                      <span className="text-[10px] text-emerald-500 uppercase font-black tracking-tighter">LIMIT:</span>
                      <input 
                          type="number"
                          step="0.05"
                          value={limitPriceCE}
                          onChange={(e) => setLimitPriceCE(Number(e.target.value))}
                          className="bg-emerald-500/10 text-sm font-mono font-black text-emerald-400 w-20 px-1 rounded outline-none border border-emerald-500/30"
                      />
                  </div>
                )}
                <div className="flex items-center gap-2 justify-end">
                    <span className="text-[10px] text-trading-muted uppercase font-bold tracking-tighter">Delta:</span>
                    <span className="text-xs font-mono font-black text-emerald-400">{activeCE?.Call_Delta?.toFixed(2) || '0.00'}</span>
                </div>
            </div>
          </div>
          <button 
            disabled={!activeCE}
            onClick={() => handleTrade('CE')}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded shadow-xl shadow-emerald-500/10 active:scale-95 transition-all"
          >
            BUY CE
          </button>
        </div>

        {/* PE Recommendation */}
        <div className={`p-3 rounded-lg border ${theme === 'dark' ? 'bg-rose-500/5 border-rose-500/20' : 'bg-rose-50 border-rose-100'} flex flex-col justify-between`}>
          <div className="flex justify-between items-start mb-2">
            <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-rose-500 block mb-1">PUT</span>
                <select 
                    value={activePE?.Strike || ''} 
                    onChange={(e) => setManualPE(Number(e.target.value))}
                    className="bg-transparent text-lg font-black font-mono outline-none cursor-pointer hover:text-rose-400"
                >
                    {allStrikes.map(s => <option key={s} value={s} className={theme === 'dark' ? 'bg-[#161b22] text-white' : 'bg-white text-slate-900'}>{s}</option>)}
                </select>
            </div>
            <div className="text-right space-y-1">
                <div className="flex items-center gap-2 justify-end">
                    <span className="text-[10px] text-trading-muted uppercase font-bold tracking-tighter">CMP:</span>
                    <span className="text-sm font-mono font-black text-trading-text">₹{activePE?.Put_LTP?.toFixed(2) || '0.00'}</span>
                </div>
                {orderType === 'LMT' && (
                  <div className="flex items-center gap-2 justify-end animate-in fade-in slide-in-from-right-1 duration-200">
                      <span className="text-[10px] text-rose-500 uppercase font-black tracking-tighter">LIMIT:</span>
                      <input 
                          type="number"
                          step="0.05"
                          value={limitPricePE}
                          onChange={(e) => setLimitPricePE(Number(e.target.value))}
                          className="bg-rose-500/10 text-sm font-mono font-black text-rose-400 w-20 px-1 rounded outline-none border border-rose-500/30"
                      />
                  </div>
                )}
                <div className="flex items-center gap-2 justify-end">
                    <span className="text-[10px] text-trading-muted uppercase font-bold tracking-tighter">Delta:</span>
                    <span className="text-xs font-mono font-black text-rose-400">{activePE?.Put_Delta?.toFixed(2) || '0.00'}</span>
                </div>
            </div>
          </div>
          <button 
            disabled={!activePE}
            onClick={() => handleTrade('PE')}
            className="w-full py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-[0.2em] rounded shadow-xl shadow-rose-500/10 active:scale-95 transition-all"
          >
            BUY PE
          </button>
        </div>
      </div>
    </div>
  );
};
