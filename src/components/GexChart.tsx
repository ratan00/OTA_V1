import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface GexChartProps {
    data: any[];
    theme?: 'dark' | 'light';
    callWall?: number;
    putWall?: number;
    callWall2?: number;
    putWall2?: number;
    gammaFlip?: number;
    spotPrice?: number;
    height?: string | number;
}

const CustomTooltip = ({ active, payload, theme, mode }: any) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const strike = Number(data.Strike).toLocaleString();
        const value = Number(data[mode] || 0).toFixed(2);
        const callValue = Number(data[`Call_${mode.split('_')[1]}`] || 0).toFixed(2);
        const putValue = Number(data[`Put_${mode.split('_')[1]}`] || 0).toFixed(2);
        const isDark = theme === 'dark';
        const metricName = mode.split('_')[1];

        return (
            <div className={`p-3 rounded-xl border shadow-2xl backdrop-blur-md ${isDark ? 'bg-[#1e222d]/90 border-[#30363d] text-white' : 'bg-white/90 border-slate-200 text-slate-900'}`}>
                <div className="flex items-center justify-between gap-4 mb-2 border-b border-white/5 pb-2">
                    <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase bg-trading-accent/20 text-trading-accent">{strike}</span>
                    <span className={`text-[10px] font-mono font-bold ${Number(value) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>{value} Cr</span>
                </div>
                <div className="space-y-1 text-[9px]">
                    <div className="flex justify-between"><span>Call {metricName}:</span><span className="text-emerald-500 font-bold">{callValue} Cr</span></div>
                    <div className="flex justify-between"><span>Put {metricName}:</span><span className="text-rose-500 font-bold">{putValue} Cr</span></div>
                </div>
            </div>
        );
    }
    return null;
};

export const GexChart: React.FC<GexChartProps> = ({ data, theme = 'dark', callWall, putWall, callWall2, putWall2, gammaFlip, spotPrice, height = 360 }) => {
    const [mode, setMode] = React.useState<'Net_GEX' | 'Net_Vanna' | 'Net_Volga' | 'Net_Charm'>('Net_GEX');
    const isFullscreen = typeof height === 'string' && (height === '100%' || (height as string).includes('vh') || (height as string).includes('calc'));
    const chartData = Array.isArray(data) ? data : [];
    const backgroundColor = theme === 'dark' ? '#131722' : '#ffffff';
    const gridColor = theme === 'dark' ? '#2a2e39' : '#f1f5f9';
    const axisColor = theme === 'dark' ? '#94a3b8' : '#64748b';

    return (
        <div className={`flex flex-col ${isFullscreen ? 'h-full min-h-0' : ''}`} style={isFullscreen ? undefined : { height }}>
            {/* Critical Wall Labels Above Chart */}
            <div className={`flex items-center ${isFullscreen ? 'gap-4 py-3' : 'gap-2 py-1'} mb-2 overflow-x-auto scrollbar-hide shrink-0`}>
                <div className="flex bg-black/20 p-1 rounded-lg gap-1 mr-4">
                    {(['Net_GEX', 'Net_Vanna', 'Net_Volga', 'Net_Charm'] as const).map(m => (
                        <button 
                            key={m}
                            onClick={() => setMode(m)}
                            className={`px-3 py-1 rounded text-[9px] font-black uppercase transition-all ${mode === m ? 'bg-trading-accent text-white' : 'text-trading-muted hover:text-white'}`}
                        >
                            {m.split('_')[1]}
                        </button>
                    ))}
                </div>

                {gammaFlip && (
                    <div className={`flex items-center ${isFullscreen ? 'gap-2 px-3 py-1' : 'gap-1 px-1.5 py-0.5'} bg-violet-500/10 border border-violet-500/20 rounded shadow-sm`}>
                        <span className={`${isFullscreen ? 'text-[10px]' : 'text-[7px]'} font-black text-violet-400 uppercase`}>Flip</span>
                        <span className={`${isFullscreen ? 'text-[14px]' : 'text-[9px]'} font-mono font-black text-violet-400`}>{gammaFlip}</span>
                    </div>
                )}
                {callWall && (
                    <div className={`flex items-center ${isFullscreen ? 'gap-2 px-3 py-1' : 'gap-1 px-1.5 py-0.5'} bg-emerald-500/10 border border-emerald-500/20 rounded shadow-sm`}>
                        <span className={`${isFullscreen ? 'text-[10px]' : 'text-[7px]'} font-black text-emerald-400 uppercase`}>CW1</span>
                        <span className={`${isFullscreen ? 'text-[14px]' : 'text-[9px]'} font-mono font-black text-emerald-400`}>{callWall}</span>
                    </div>
                )}
                {callWall2 ? (callWall2 > 0 && (
                    <div className={`flex items-center ${isFullscreen ? 'gap-2 px-3 py-1' : 'gap-1 px-1.5 py-0.5'} bg-emerald-500/5 border border-emerald-500/10 rounded shadow-sm`}>
                        <span className={`${isFullscreen ? 'text-[10px]' : 'text-[7px]'} font-black text-emerald-300 uppercase`}>CW2</span>
                        <span className={`${isFullscreen ? 'text-[14px]' : 'text-[9px]'} font-mono font-black text-emerald-300`}>{callWall2}</span>
                    </div>
                )) : null}
                {putWall && (
                    <div className={`flex items-center ${isFullscreen ? 'gap-2 px-3 py-1' : 'gap-1 px-1.5 py-0.5'} bg-rose-500/10 border border-rose-500/20 rounded shadow-sm`}>
                        <span className={`${isFullscreen ? 'text-[10px]' : 'text-[7px]'} font-black text-rose-400 uppercase`}>PW1</span>
                        <span className={`${isFullscreen ? 'text-[14px]' : 'text-[9px]'} font-mono font-black text-rose-400`}>{putWall}</span>
                    </div>
                )}
                {putWall2 ? (putWall2 > 0 && (
                    <div className={`flex items-center ${isFullscreen ? 'gap-2 px-3 py-1' : 'gap-1 px-1.5 py-0.5'} bg-rose-500/5 border border-rose-500/10 rounded shadow-sm`}>
                        <span className={`${isFullscreen ? 'text-[10px]' : 'text-[7px]'} font-black text-rose-300 uppercase`}>PW2</span>
                        <span className={`${isFullscreen ? 'text-[14px]' : 'text-[9px]'} font-mono font-black text-rose-300`}>{putWall2}</span>
                    </div>
                )) : null}
            </div>

            <div className="flex-1 rounded-lg transition-colors duration-300" style={{ backgroundColor }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} horizontal={true} vertical={false} />
                        <XAxis type="number" stroke={axisColor} fontSize={isFullscreen ? 12 : 10} tickFormatter={(value) => `${Number(value || 0).toFixed(0)}`} />
                        <YAxis dataKey="Strike" type="number" stroke={axisColor} fontSize={isFullscreen ? 11 : 9} width={isFullscreen ? 70 : 50} domain={['auto', 'auto']} tickFormatter={(val) => Number(val).toLocaleString()} reversed={true} />
                        <Tooltip cursor={{fill: gridColor, opacity: 0.1}} content={<CustomTooltip theme={theme} mode={mode} />} />
                        <ReferenceLine x={0} stroke={axisColor} strokeWidth={1} />
                        {gammaFlip && <ReferenceLine y={gammaFlip} stroke="#a78bfa" strokeDasharray="5 5" strokeWidth={2} />}
                        {spotPrice && <ReferenceLine y={spotPrice} stroke="#3b82f6" strokeWidth={2} />}
                        {callWall && <ReferenceLine y={callWall} stroke="#089981" strokeDasharray="3 3" strokeWidth={2} />}
                        {callWall2 && callWall2 > 0 && <ReferenceLine y={callWall2} stroke="#089981" strokeDasharray="5 5" strokeWidth={1} opacity={0.5} />}
                        {putWall && <ReferenceLine y={putWall} stroke="#f23645" strokeDasharray="3 3" strokeWidth={2} />}
                        {putWall2 && putWall2 > 0 && <ReferenceLine y={putWall2} stroke="#f23645" strokeDasharray="5 5" strokeWidth={1} opacity={0.5} />}
                        <Bar dataKey={mode} radius={[0, 4, 4, 0]} barSize={isFullscreen ? 18 : 12}>
                            {chartData.map((entry, index) => {
                                const val = Number(entry?.[mode] || 0);
                                return <Cell key={`cell-${index}`} fill={val >= 0 ? '#089981' : '#f23645'} />;
                            })}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};
