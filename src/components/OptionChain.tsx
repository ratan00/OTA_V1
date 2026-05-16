import React from 'react';
import { BarChart3 } from 'lucide-react';

interface OptionChainProps {
    data: any[];
    spotPrice: number;
    theme?: 'dark' | 'light';
    onSelectInstrument: (instrument: { id: string, name: string, type: 'INDEX' | 'OPT' }) => void;
}

export const OptionChain: React.FC<OptionChainProps> = ({ data, spotPrice, theme = 'dark', onSelectInstrument }) => {
    const strikesList = Array.isArray(data) ? data : [];
    const sortedRows = [...strikesList].sort((a, b) => Number(b.Strike) - Number(a.Strike));

    if (strikesList.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center gap-3 text-trading-muted">
                <div className="w-8 h-8 border-2 border-trading-accent/30 border-t-trading-accent rounded-full animate-spin" />
                <span className="text-[11px] font-black uppercase tracking-widest">Loading option chain…</span>
            </div>
        );
    }

    const isDark      = theme === 'dark';
    const tableBg     = isDark ? 'bg-[#181c2a]' : 'bg-white';
    const headerBg    = isDark ? 'bg-[#1e2235]' : 'bg-slate-100';
    const rowBorder   = isDark ? 'border-[#252a3d]' : 'border-slate-200';
    const strikeBg    = isDark ? 'bg-[#0e1120]' : 'bg-slate-50';
    const bodyText    = isDark ? 'text-[#d1d4dc]' : 'text-slate-800';
    const mutedText   = isDark ? 'text-[#6b7594]' : 'text-slate-500';

    const diffs    = sortedRows.map(r => Math.abs(Number(r.Strike) - spotPrice));
    const minDiff  = Math.min(...diffs);
    const maxCallOI = Math.max(...sortedRows.map(r => Number(r.Call_OI || 0)), 1);
    const maxPutOI  = Math.max(...sortedRows.map(r => Number(r.Put_OI  || 0)), 1);
    const maxNetGex = Math.max(...sortedRows.map(r => Math.abs(Number(r.Net_GEX || 0))), 1);

    const fmtOI = (v: number) =>
        v <= 0 ? '—' : v >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : v.toLocaleString();

    const ivColor = (iv: number) =>
        iv > 30 ? 'text-rose-400' : iv > 18 ? 'text-amber-400' : 'text-emerald-400';

    return (
        <div className={`overflow-x-auto ${tableBg} rounded-lg`} style={{ minWidth: 560 }}>
            <table className="w-full text-left border-collapse">
                {/* ── Header ── */}
                <thead className={`${headerBg} ${mutedText} text-[10px] font-black uppercase tracking-wider sticky top-0 z-10`}>
                    <tr>
                        {/* CALL SIDE */}
                        <th className="px-3 py-3 hidden xl:table-cell text-emerald-400 text-right">C-IV%</th>
                        <th className="px-3 py-3 text-emerald-400 text-right">Call OI</th>
                        <th className="px-3 py-3 text-emerald-500 text-right">Call LTP</th>
                        {/* STRIKE */}
                        <th className={`px-4 py-3 text-center ${isDark ? 'text-white' : 'text-slate-800'} border-x ${rowBorder}`}>
                            Strike
                        </th>
                        {/* PUT SIDE */}
                        <th className="px-3 py-3 text-rose-500 text-left">Put LTP</th>
                        <th className="px-3 py-3 text-rose-400 text-left">Put OI</th>
                        <th className="px-3 py-3 hidden xl:table-cell text-rose-400">P-IV%</th>
                        {/* NET GEX */}
                        <th className="px-3 py-3 hidden lg:table-cell text-center text-violet-400">Net GEX</th>
                    </tr>
                </thead>

                {/* ── Body ── */}
                <tbody className={bodyText}>
                    {sortedRows.map((row, idx) => {
                        const strike    = Number(row?.Strike  || 0);
                        const isATM     = Math.abs(strike - spotPrice) === minDiff;
                        const isITMCall = strike < spotPrice;
                        const isITMPut  = strike > spotPrice;

                        const callOI   = Number(row?.Call_OI  || 0);
                        const callLTP  = Number(row?.Call_LTP || 0);
                        const putOI    = Number(row?.Put_OI   || 0);
                        const putLTP   = Number(row?.Put_LTP  || 0);
                        const callIV   = Number(row?.Call_IV  || 0);
                        const putIV    = Number(row?.Put_IV   || 0);
                        const netGex   = Number(row?.Net_GEX  || 0);
                        const gexPct   = netGex / maxNetGex;
                        const gexPos   = netGex >= 0;

                        const callOIPct = (callOI / maxCallOI) * 100;
                        const putOIPct  = (putOI  / maxPutOI ) * 100;

                        const rowCls = isATM
                            ? `border-b-2 ${isDark ? 'bg-blue-500/[0.08] border-blue-400/50' : 'bg-blue-50 border-blue-300'}`
                            : `border-b ${rowBorder} hover:bg-white/[0.025] transition-colors duration-75`;

                        return (
                            <tr key={strike || idx} className={`text-[13px] ${rowCls}`}>

                                {/* ── C-IV% ── */}
                                <td className={`px-3 py-2.5 font-mono hidden xl:table-cell text-right ${ivColor(callIV)} ${isITMCall ? 'opacity-45' : ''}`}>
                                    {callIV > 0 ? callIV.toFixed(1) : '—'}
                                </td>

                                {/* ── Call OI with background bar ── */}
                                <td className={`px-3 py-2.5 text-right font-mono relative min-w-[80px] ${isITMCall ? 'opacity-45' : 'text-emerald-400'}`}>
                                    <div
                                        className="absolute inset-y-0 right-0 bg-emerald-500/10 pointer-events-none"
                                        style={{ width: `${callOIPct}%` }}
                                    />
                                    <span className="relative">{fmtOI(callOI)}</span>
                                </td>

                                {/* ── Call LTP ── */}
                                <td className={`px-3 py-2.5 text-right font-bold min-w-[80px] ${isITMCall ? 'text-emerald-300' : isDark ? 'text-white' : 'text-slate-900'}`}>
                                    <div className="flex items-center justify-end gap-1.5">
                                        <span className="tabular-nums">{callLTP > 0 ? callLTP.toFixed(1) : '—'}</span>
                                        <button
                                            onClick={() => onSelectInstrument({ id: row.Call_SecurityId, name: `${strike} CE`, type: 'OPT' })}
                                            className="p-0.5 bg-emerald-500/10 hover:bg-emerald-500/30 rounded text-emerald-400 transition-colors shrink-0"
                                            title="Chart Call"
                                        >
                                            <BarChart3 size={12} />
                                        </button>
                                    </div>
                                </td>

                                {/* ── Strike ── */}
                                <td className={`px-4 py-2.5 text-center font-black text-[14px] tracking-tight ${strikeBg} border-x ${rowBorder} whitespace-nowrap ${
                                    isATM ? 'text-blue-400' : isDark ? 'text-white' : 'text-slate-800'
                                }`}>
                                    {strike.toLocaleString()}
                                    {isATM && (
                                        <span className="ml-1.5 text-[9px] font-black text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded-full align-middle">
                                            ATM
                                        </span>
                                    )}
                                </td>

                                {/* ── Put LTP ── */}
                                <td className={`px-3 py-2.5 text-left font-bold min-w-[80px] ${isITMPut ? 'text-rose-300' : isDark ? 'text-white' : 'text-slate-900'}`}>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            onClick={() => onSelectInstrument({ id: row.Put_SecurityId, name: `${strike} PE`, type: 'OPT' })}
                                            className="p-0.5 bg-rose-500/10 hover:bg-rose-500/30 rounded text-rose-400 transition-colors shrink-0"
                                            title="Chart Put"
                                        >
                                            <BarChart3 size={12} />
                                        </button>
                                        <span className="tabular-nums">{putLTP > 0 ? putLTP.toFixed(1) : '—'}</span>
                                    </div>
                                </td>

                                {/* ── Put OI with background bar ── */}
                                <td className={`px-3 py-2.5 text-left font-mono relative min-w-[80px] ${isITMPut ? 'opacity-45' : 'text-rose-400'}`}>
                                    <div
                                        className="absolute inset-y-0 left-0 bg-rose-500/10 pointer-events-none"
                                        style={{ width: `${putOIPct}%` }}
                                    />
                                    <span className="relative">{fmtOI(putOI)}</span>
                                </td>

                                {/* ── P-IV% ── */}
                                <td className={`px-3 py-2.5 font-mono hidden xl:table-cell ${ivColor(putIV)} ${isITMPut ? 'opacity-45' : ''}`}>
                                    {putIV > 0 ? putIV.toFixed(1) : '—'}
                                </td>

                                {/* ── Net GEX symmetric bar ── */}
                                <td className="px-3 py-2.5 hidden lg:table-cell min-w-[120px]">
                                    <div className="flex items-center gap-2 justify-center">
                                        <div className="relative w-20 h-2.5 rounded-full bg-white/5 overflow-hidden">
                                            {/* zero line */}
                                            <div className="absolute inset-y-0 left-1/2 w-px bg-white/15 z-10" />
                                            {gexPos ? (
                                                <div
                                                    className="absolute inset-y-0 left-1/2 bg-emerald-500 rounded-r-full"
                                                    style={{ width: `${Math.abs(gexPct) * 50}%` }}
                                                />
                                            ) : (
                                                <div
                                                    className="absolute inset-y-0 right-1/2 bg-rose-500 rounded-l-full"
                                                    style={{ width: `${Math.abs(gexPct) * 50}%` }}
                                                />
                                            )}
                                        </div>
                                        <span className={`text-[11px] font-mono w-12 text-right tabular-nums ${gexPos ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            {Math.abs(netGex) >= 10 ? netGex.toFixed(0) : Math.abs(netGex) >= 1 ? netGex.toFixed(1) : netGex.toFixed(2)}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};
