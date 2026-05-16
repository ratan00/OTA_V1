import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers, type IChartApi, type ISeriesApi, type SeriesMarker } from 'lightweight-charts';
import { RefreshCw } from 'lucide-react';

interface TradingChartProps {
    data: any[];
    liveData?: any;
    title?: string;
    timeframe: number | string;
    theme?: 'dark' | 'light';
    showVolume?: boolean;
    showEma?: boolean;
    showVwcb?: boolean;
    showUtBot?: boolean;
    showGammaLevels?: boolean;
    callWall?: number;
    putWall?: number;
    callWall2?: number;
    putWall2?: number;
    gammaFlip?: number;
    positions?: any[];
    onModifyPosition?: (id: string, type: 'SL'|'TP', newPrice: number) => void;
}

// EMA Calculation Utility
const calculateEMA = (data: any[], period: number) => {
    if (data.length < period) return [];
    const k = 2 / (period + 1);
    
    const firstPeriod = data.slice(0, period);
    let ema = firstPeriod.reduce((acc, val) => acc + val.close, 0) / period;
    
    const results = [{ time: data[period - 1].time, value: ema }];
    
    for (let i = period; i < data.length; i++) {
        ema = data[i].close * k + ema * (1 - k);
        results.push({ time: data[i].time, value: ema });
    }
    return results;
};

// ATR Calculation Utility
const calculateATR = (data: any[], period: number) => {
    if (data.length < period) return [];
    const trs = [];
    for (let i = 1; i < data.length; i++) {
        const h_l = data[i].high - data[i].low;
        const h_pc = Math.abs(data[i].high - data[i - 1].close);
        const l_pc = Math.abs(data[i].low - data[i - 1].close);
        trs.push(Math.max(h_l, h_pc, l_pc));
    }
    
    const atrs = [];
    let sum = trs.slice(0, period).reduce((a, b) => a + b, 0);
    atrs.push({ time: data[period].time, value: sum / period });

    for (let i = period; i < trs.length; i++) {
        const nextAtr = (atrs[atrs.length - 1].value * (period - 1) + trs[i]) / period;
        atrs.push({ time: data[i + 1].time, value: nextAtr });
    }
    return atrs;
};

// UT Bot Calculation
const calculateUtBot = (data: any[], sensitivity: number = 1, atrPeriod: number = 10) => {
    if (data.length <= atrPeriod) return [];
    const atrs = calculateATR(data, atrPeriod);
    const results: SeriesMarker<any>[] = [];
    
    let xATRTrailingStop = 0;
    let prevStop = 0;
    
    const dataMap = new Map(data.map(d => [d.time, d]));
    
    for (let i = 0; i < atrs.length; i++) {
        const bar = dataMap.get(atrs[i].time);
        const prevBar = dataMap.get(data[data.indexOf(bar) - 1]?.time);
        if (!bar || !prevBar) continue;

        const nLoss = sensitivity * atrs[i].value;
        const src = bar.close;
        const prevSrc = prevBar.close;

        if (src > prevStop && prevSrc > prevStop) {
            xATRTrailingStop = Math.max(prevStop, src - nLoss);
        } else if (src < prevStop && prevSrc < prevStop) {
            xATRTrailingStop = Math.min(prevStop, src + nLoss);
        } else if (src > prevStop) {
            xATRTrailingStop = src - nLoss;
        } else {
            xATRTrailingStop = src + nLoss;
        }

        if (prevSrc <= prevStop && src > xATRTrailingStop) {
            results.push({
                time: bar.time,
                position: 'belowBar',
                color: '#26a69a',
                shape: 'arrowUp',
                text: 'BUY',
            });
        } else if (prevSrc >= prevStop && src < xATRTrailingStop) {
            results.push({
                time: bar.time,
                position: 'aboveBar',
                color: '#ef5350',
                shape: 'arrowDown',
                text: 'SELL',
            });
        }
        prevStop = xATRTrailingStop;
    }
    return results;
};

export const TradingChart: React.FC<TradingChartProps> = ({
    data,
    liveData,
    title = "NIFTY",
    timeframe,
    theme = 'dark',
    showVolume = true,
    showEma = true,
    showVwcb = false,
    showUtBot = false,
    showGammaLevels = true,
    callWall,
    putWall,
    callWall2,
    putWall2,
    gammaFlip,
    positions,
    onModifyPosition
}) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
    const ema9SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const ema21SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const seriesMarkersRef = useRef<any>(null);
    
    // Refs for Gamma Levels
    const callWallLineRef = useRef<any>(null);
    const putWallLineRef = useRef<any>(null);
    const callWallLine2Ref = useRef<any>(null);
    const putWallLine2Ref = useRef<any>(null);
    const gammaFlipLineRef = useRef<any>(null);
    
    const [legendData, setLegendData] = useState<any>(null);

    const isDark = theme === 'dark';
    const backgroundColor = isDark ? '#131722' : '#ffffff';
    const textColor = isDark ? '#D1D4DC' : '#1e293b';
    const gridColor = isDark ? '#2a2e39' : '#f1f5f9';
    const upColor = '#089981';
    const downColor = '#f23645';

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: backgroundColor },
                textColor,
                fontSize: 10,
                fontFamily: 'Inter, sans-serif',
            },
            grid: {
                vertLines: { color: gridColor },
                horzLines: { color: gridColor },
            },
            crosshair: {
                mode: 0,
                vertLine: { labelBackgroundColor: '#2962FF' },
                horzLine: { labelBackgroundColor: '#2962FF' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: gridColor,
                barSpacing: 10,
                tickMarkFormatter: (timestamp: number, tickMarkType: number) => {
                    const date = new Date(timestamp * 1000);
                    if (timeframe === '1D' || tickMarkType >= 2) {
                        return new Intl.DateTimeFormat('en-IN', {
                            timeZone: 'Asia/Kolkata',
                            day: '2-digit',
                            month: 'short'
                        }).format(date);
                    }
                    return new Intl.DateTimeFormat('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    }).format(date);
                },
            },
            localization: {
                timeFormatter: (timestamp: number) => {
                    return new Intl.DateTimeFormat('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: timeframe === 1 ? '2-digit' : undefined,
                        hour12: true
                    }).format(new Date(timestamp * 1000));
                },
                priceFormatter: (price: number) => {
                    return price.toFixed(2);
                }
            },
            rightPriceScale: {
                borderColor: gridColor,
                scaleMargins: { top: 0.1, bottom: 0.2 },
            },
            watermark: {
                visible: true,
                fontSize: 48,
                horzAlign: 'center' as any,
                vertAlign: 'center' as any,
                color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)',
                text: `${title} ${timeframe}${typeof timeframe === 'number' ? 'm' : ''}`,
            },
            handleScroll: true,
            handleScale: true,
        } as any);

        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor,
            downColor,
            borderVisible: false,
            wickUpColor: upColor,
            wickDownColor: downColor,
            priceFormat: { type: 'price', precision: 2, minMove: 0.05 },
        });

        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: { type: 'volume' },
            priceScaleId: '',
        });
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        const ema9Series = chart.addSeries(LineSeries, {
            color: '#2962FF',
            lineWidth: 1,
            title: 'EMA 9',
            visible: showEma,
            lastValueVisible: true,
            priceLineVisible: false,
        });
        const ema21Series = chart.addSeries(LineSeries, {
            color: '#FF9800',
            lineWidth: 1,
            title: 'EMA 21',
            visible: showEma,
            lastValueVisible: true,
            priceLineVisible: false,
        });

        chartRef.current = chart;
        candleSeriesRef.current = candleSeries;
        volumeSeriesRef.current = volumeSeries;
        ema9SeriesRef.current = ema9Series;
        ema21SeriesRef.current = ema21Series;
        if (!seriesMarkersRef.current) {
            seriesMarkersRef.current = createSeriesMarkers(candleSeries);
        }

        chart.subscribeCrosshairMove((param) => {
            if (!param.time || param.point === undefined || !param.seriesData.get(candleSeries)) {
                setLegendData(null);
                return;
            }
            const data = param.seriesData.get(candleSeries) as any;
            const vol = param.seriesData.get(volumeSeries) as any;
            setLegendData({ ...data, volume: vol?.value });
        });

        const handleResize = () => {
            if (chartContainerRef.current && chartRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                    height: chartContainerRef.current.clientHeight
                });
            }
        };

        // Use ResizeObserver so chart reflows immediately on container resize
        // (catches fullscreen toggle, sidebar collapse, etc — not just window resize)
        const ro = new ResizeObserver(() => handleResize());
        if (chartContainerRef.current) ro.observe(chartContainerRef.current);
        window.addEventListener('resize', handleResize);
        // Initial size pass after next paint
        requestAnimationFrame(handleResize);

        return () => {
            ro.disconnect();
            window.removeEventListener('resize', handleResize);
            seriesMarkersRef.current = null;
            chart.remove();
        };
    }, [theme, title, timeframe]);

    useEffect(() => {
        if (!candleSeriesRef.current || !data || data.length === 0) return;

        // ── Client-side ghost candle guard ────────────────────────────────────
        // Filter intraday bars to IST 09:15–15:30 to kill off-hours ghost candles.
        // Skip for '1D' — daily bars have midnight timestamps outside this window.
        const IST_OFFSET = 19800; // 5h30m in seconds
        const inTradingHours = (timeVal: number | string) => {
            const ts = typeof timeVal === 'string' ? new Date(timeVal).getTime() / 1000 : (timeVal > 2000000000 ? timeVal / 1000 : timeVal);
            const istSeconds = (ts + IST_OFFSET) % 86400; // seconds since midnight IST
            const minOfDay = Math.floor(istSeconds / 60);  // minute of day in IST
            return minOfDay >= 555 && minOfDay <= 930;      // 09:15–15:30
        };
        const isDaily = timeframe === '1D';

        const candles_raw = data
            .filter(d => isDaily || inTradingHours(d.time))  // skip filter for daily
            .map(d => ({
                time: d.time,
                open: d.open,
                high: d.high,
                low: d.low,
                close: d.close,
                volume: d.volume || 0
            })).sort((a, b) => a.time - b.time);

        const vLen = 20;
        const vols = candles_raw.map(c => c.volume);
        const candleData = candles_raw.map((c, i) => {
            if (!showVwcb) return c;
            
            const start = Math.max(0, i - vLen);
            const slice = vols.slice(start, i + 1);
            const vSMA = slice.reduce((a, b) => a + b, 0) / slice.length;
            const isBull = c.close >= c.open;
            
            let color = isBull ? upColor : downColor;
            if (c.volume > vSMA * 1.618) {
                color = isBull ? '#006400' : '#8B0000'; // darker red for high vol bear
            } else if (c.volume < vSMA * 0.618) {
                color = isBull ? '#7FFFD4' : '#FFA500';
            }
            
            return {
                ...c,
                color,
                wickColor: color,
                borderVisible: false
            };
        });

        const volumes = candles_raw.map(d => ({
            time: d.time,
            value: d.volume || 0,
            color: d.close >= d.open ? 'rgba(8, 153, 129, 0.3)' : 'rgba(242, 54, 69, 0.3)',
        }));

        candleSeriesRef.current.setData(candleData);
        if (volumeSeriesRef.current) volumeSeriesRef.current.setData(volumes);

        if (showEma && ema9SeriesRef.current && ema21SeriesRef.current) {
            ema9SeriesRef.current.setData(calculateEMA(candles_raw, 9));
            ema21SeriesRef.current.setData(calculateEMA(candles_raw, 21));
        }

        if (showUtBot) {
            const markers = calculateUtBot(candles_raw);
            if (seriesMarkersRef.current) seriesMarkersRef.current.setMarkers(markers);
        } else {
            if (seriesMarkersRef.current) seriesMarkersRef.current.setMarkers([]);
        }

        const last = data[data.length - 1];
        setLegendData({ ...last });

    }, [data, showEma, showVwcb, showUtBot, theme]);

    useEffect(() => {
        // Guard 1: backend sends ohlc=null off-hours
        if (!candleSeriesRef.current || !liveData) return;
        // Guard 2: client-side IST hours check (09:15–15:30) — same logic as setData filter
        const istMin = Math.floor(((liveData.time + 19800) % 86400) / 60);
        if (istMin < 555 || istMin > 930) return; // off-hours → skip, no ghost candle
        
        let color = liveData.close >= liveData.open ? upColor : downColor;
        if (showVwcb) {
            color = liveData.close >= liveData.open ? '#089981' : '#f23645';
        }

        candleSeriesRef.current.update({
            time: liveData.time,
            open: liveData.open,
            high: liveData.high,
            low: liveData.low,
            close: liveData.close,
            color: showVwcb ? color : undefined,
            wickColor: showVwcb ? color : undefined,
        });

        if (volumeSeriesRef.current && liveData.volume !== undefined) {
            volumeSeriesRef.current.update({
                time: liveData.time,
                value: liveData.volume,
                color: liveData.close >= liveData.open ? 'rgba(8, 153, 129, 0.3)' : 'rgba(242, 54, 69, 0.3)',
            });
        }
        
        setLegendData({ ...liveData });
    }, [liveData, showVwcb, theme]);

    // Handle Gamma Levels (Reference Lines)
    useEffect(() => {
        const series = candleSeriesRef.current;
        if (!series) return;

        // Cleanup existing lines — must null-guard series because chart may have been
        // destroyed and re-created between renders (theme / timeframe change).
        const lines = [callWallLineRef, putWallLineRef, callWallLine2Ref, putWallLine2Ref, gammaFlipLineRef];
        lines.forEach(ref => {
            if (ref.current) {
                try { series.removePriceLine(ref.current); } catch (_) { /* chart was destroyed */ }
                ref.current = null;
            }
        });

        if (!showGammaLevels) return;

        // Primary Walls
        if (callWall && callWall > 0) {
            callWallLineRef.current = series.createPriceLine({
                price: callWall, color: '#089981', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'CALL WALL 1',
            });
        }
        if (putWall && putWall > 0) {
            putWallLineRef.current = series.createPriceLine({
                price: putWall, color: '#f23645', lineWidth: 2, lineStyle: 2, axisLabelVisible: true, title: 'PUT WALL 1',
            });
        }

        // Secondary Walls (Faded)
        if (callWall2 && callWall2 > 0) {
            callWallLine2Ref.current = series.createPriceLine({
                price: callWall2, color: '#089981', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'CW 2',
            });
        }
        if (putWall2 && putWall2 > 0) {
            putWallLine2Ref.current = series.createPriceLine({
                price: putWall2, color: '#f23645', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: 'PW 2',
            });
        }

        if (gammaFlip && gammaFlip > 0) {
            gammaFlipLineRef.current = series.createPriceLine({
                price: gammaFlip, color: '#a78bfa', lineWidth: 2, lineStyle: 3, axisLabelVisible: true, title: 'GAMMA FLIP',
            });
        }
    }, [callWall, putWall, callWall2, putWall2, gammaFlip, timeframe, showGammaLevels, theme]);

    useEffect(() => {
        if (ema9SeriesRef.current) ema9SeriesRef.current.applyOptions({ visible: showEma });
        if (ema21SeriesRef.current) ema21SeriesRef.current.applyOptions({ visible: showEma });
        if (volumeSeriesRef.current) volumeSeriesRef.current.applyOptions({ visible: showVolume });
    }, [showEma, showVolume]);

    const [orderCoords, setOrderCoords] = useState<{ id: string, type: 'SL'|'TP', y: number, price: number, side: string }[]>([]);
    const draggingRef = useRef<{ id: string, type: 'SL'|'TP' } | null>(null);

    // Sync coordinates when chart moves/scales or positions change
    const syncCoords = useCallback(() => {
        if (!candleSeriesRef.current || !positions) return;
        
        // Determine if the chart is showing an option or an index.
        // For options the title is like "24500 CE"; for indices it's "NIFTY 50".
        const isOptChart = title.endsWith('CE') || title.endsWith('PE');

        const coords: typeof orderCoords = [];
        positions.forEach(pos => {
            // For option charts: match by symbol name.
            // For index charts: show ALL open positions (entry price lines).
            const shouldShow = isOptChart
                ? (pos.symbol && pos.symbol.includes(title.split(' ')[0]))
                : true;

            if (shouldShow) {
                if (pos.slPrice) {
                    const y = candleSeriesRef.current?.priceToCoordinate(pos.slPrice);
                    if (y !== null && y !== undefined) coords.push({ id: pos.id, type: 'SL', y, price: pos.slPrice, side: pos.side });
                }
                if (pos.targetPrice) {
                    const y = candleSeriesRef.current?.priceToCoordinate(pos.targetPrice);
                    if (y !== null && y !== undefined) coords.push({ id: pos.id, type: 'TP', y, price: pos.targetPrice, side: pos.side });
                }
            }
        });
        setOrderCoords(coords);
    }, [positions, title]);

    useEffect(() => {
        if (chartRef.current) {
            chartRef.current.timeScale().subscribeVisibleTimeRangeChange(syncCoords);
            chartRef.current.timeScale().subscribeVisibleLogicalRangeChange(syncCoords);
            // Also re-sync when user zooms the price axis vertically
            try { chartRef.current.priceScale('right').applyOptions({}); } catch {}
        }
        syncCoords();
        // Subscribe to price scale changes via chart's subscribe mechanism
        const crosshairHandler = () => syncCoords();
        chartRef.current?.subscribeCrosshairMove(crosshairHandler);
        return () => {
            if (chartRef.current) {
                chartRef.current.timeScale().unsubscribeVisibleTimeRangeChange(syncCoords);
                chartRef.current.timeScale().unsubscribeVisibleLogicalRangeChange(syncCoords);
                chartRef.current.unsubscribeCrosshairMove(crosshairHandler);
            }
        };
    }, [syncCoords, data]);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!draggingRef.current || !chartContainerRef.current || !candleSeriesRef.current) return;
            const rect = chartContainerRef.current.getBoundingClientRect();
            const y = e.clientY - rect.top;
            const newPrice = candleSeriesRef.current.coordinateToPrice(y);
            if (newPrice !== null) {
                setOrderCoords(prev => prev.map(c => 
                    c.id === draggingRef.current?.id && c.type === draggingRef.current?.type 
                    ? { ...c, y, price: newPrice } : c
                ));
            }
        };

        const handleMouseUp = (e: MouseEvent) => {
            if (draggingRef.current && chartContainerRef.current && candleSeriesRef.current) {
                const rect = chartContainerRef.current.getBoundingClientRect();
                const y = e.clientY - rect.top;
                const newPrice = candleSeriesRef.current.coordinateToPrice(y);
                if (newPrice !== null && onModifyPosition) {
                    onModifyPosition(draggingRef.current.id, draggingRef.current.type, newPrice);
                }
            }
            draggingRef.current = null;
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [onModifyPosition]);

    return (
        <div className="relative w-full h-full group">
            {(!data || data.length === 0) && (
                <div className={`absolute inset-0 z-20 flex items-center justify-center ${isDark ? 'bg-[#131722]' : 'bg-white'}`}>
                    <div className="flex flex-col items-center gap-3">
                        <RefreshCw size={24} className="text-trading-accent animate-spin" />
                        <span className="text-xs font-black uppercase tracking-widest text-trading-muted">Loading {title}...</span>
                    </div>
                </div>
            )}
            
            <div className={`absolute top-3 left-4 z-10 pointer-events-none transition-opacity duration-300 ${legendData && data?.length > 0 ? 'opacity-100' : 'opacity-0'}`}>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className={`text-xs font-black uppercase tracking-tighter ${isDark ? 'text-white' : 'text-slate-900'}`}>{title}</span>
                        <span className="text-[10px] font-bold text-trading-muted">{timeframe}{typeof timeframe === 'number' ? 'm' : ''}</span>
                    </div>
                    {legendData && (
                        <div className="flex items-center gap-3 text-[10px] font-mono">
                            <div className="flex gap-1 pr-2 border-r border-trading-border">
                                <span className="text-trading-accent font-black">
                                    {new Intl.DateTimeFormat('en-IN', {
                                        timeZone: 'Asia/Kolkata',
                                        day: timeframe === '1D' ? '2-digit' : undefined,
                                        month: timeframe === '1D' ? 'short' : undefined,
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        hour12: true
                                    }).format(new Date(legendData.time * 1000))}
                                </span>
                            </div>
                            <div className="flex gap-1">
                                <span className="text-trading-muted uppercase">O</span>
                                <span className={legendData.close >= legendData.open ? 'text-emerald-500' : 'text-rose-500'}>{legendData.open?.toFixed(2)}</span>
                            </div>
                            <div className="flex gap-1">
                                <span className="text-trading-muted uppercase">H</span>
                                <span className={legendData.close >= legendData.open ? 'text-emerald-500' : 'text-rose-500'}>{legendData.high?.toFixed(2)}</span>
                            </div>
                            <div className="flex gap-1">
                                <span className="text-trading-muted uppercase">L</span>
                                <span className={legendData.close >= legendData.open ? 'text-emerald-500' : 'text-rose-500'}>{legendData.low?.toFixed(2)}</span>
                            </div>
                            <div className="flex gap-1">
                                <span className="text-trading-muted uppercase">C</span>
                                <span className={legendData.close >= legendData.open ? 'text-emerald-500' : 'text-rose-500'}>{legendData.close?.toFixed(2)}</span>
                            </div>
                            {legendData.volume > 0 && (
                                <div className="flex gap-1 border-l border-trading-border pl-3">
                                    <span className="text-trading-muted uppercase">V</span>
                                    <span className="text-trading-accent">{Number(legendData.volume).toLocaleString()}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <div ref={chartContainerRef} className="w-full h-full" />
            
            {orderCoords.map(coord => (
                <div 
                    key={`${coord.id}-${coord.type}`} 
                    className="absolute left-0 right-[60px] border-t-2 border-dashed z-40 cursor-ns-resize group/line pointer-events-auto"
                    style={{ 
                        top: coord.y, 
                        borderColor: coord.type === 'SL' ? '#f23645' : '#089981' 
                    }}
                    onMouseDown={() => { draggingRef.current = { id: coord.id, type: coord.type }; }}
                >
                    <div 
                        className="absolute right-0 -top-3 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest flex items-center gap-2 select-none shadow-xl"
                        style={{ backgroundColor: coord.type === 'SL' ? '#f23645' : '#089981', color: '#fff' }}
                    >
                        {coord.type} {coord.price.toFixed(1)}
                        <span className="opacity-0 group-hover/line:opacity-100 transition-opacity whitespace-nowrap text-[8px] bg-black/20 px-1 rounded">DRAG</span>
                    </div>
                </div>
            ))}
        </div>
    );
};
