import React from 'react';
import { Shield, History, Briefcase } from 'lucide-react';
import type { SandboxPosition, SandboxOrder } from '../hooks/useSandboxEngine';
import { PositionsModule } from './PositionsModule';
import { OrdersModule } from './OrdersModule';

interface SandboxContainerProps {
    active: boolean;
    capital: number;
    positions: SandboxPosition[];
    orders: SandboxOrder[];
    bookedPnl: number;
    floatingPnl: number;
    onExit: (id: string) => void;
    onExitAll: () => void;
    onClearOrders: () => void;
    theme: 'dark' | 'light';
    chain: any[];
    activeTab: 'positions' | 'orders';
    onTabChange: (tab: 'positions' | 'orders') => void;
}

export const SandboxContainer: React.FC<SandboxContainerProps> = ({
    active,
    capital,
    positions,
    orders,
    bookedPnl,
    floatingPnl,
    onExit,
    onExitAll,
    onClearOrders,
    theme,
    chain,
    activeTab,
    onTabChange
}) => {
    const isDark = theme === 'dark';
    const totalPnl = bookedPnl + floatingPnl;

    if (!active) return null;

    return (
        <div className="space-y-3 animate-in fade-in zoom-in-95 duration-300">
            {/* Sandbox Header Stats */}
            <div className={`p-4 rounded-xl border-2 border-amber-500/20 bg-amber-500/5 backdrop-blur-md flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-amber-500 rounded-lg shadow-lg shadow-amber-500/20">
                        <Shield size={20} className="text-white" />
                    </div>
                    <div>
                        <h4 className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>Sandbox Active</h4>
                        <div className="flex items-center gap-2">
                             <span className="text-[10px] text-trading-muted font-bold">Paper Capital:</span>
                             <span className="text-xs font-mono font-black text-amber-500">₹{capital.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <span className="text-[9px] text-trading-muted uppercase font-black tracking-tighter block">Session PnL</span>
                        <span className={`text-lg font-mono font-black tracking-tighter ${totalPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            ₹{totalPnl.toLocaleString()}
                        </span>
                    </div>
                    <div className="h-8 w-px bg-amber-500/20"></div>
                    <div className="flex flex-col items-end">
                         <div className="flex items-center gap-1.5">
                            <span className="text-[8px] text-trading-muted font-bold uppercase">Float:</span>
                            <span className={`text-[10px] font-mono font-bold ${floatingPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{floatingPnl.toFixed(0)}</span>
                         </div>
                         <div className="flex items-center gap-1.5">
                            <span className="text-[8px] text-trading-muted font-bold uppercase">Booked:</span>
                            <span className={`text-[10px] font-mono font-bold ${bookedPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>₹{bookedPnl.toFixed(0)}</span>
                         </div>
                    </div>
                </div>
            </div>

            {/* Sandbox Execution Tabs */}
            <div className="flex flex-col h-full min-h-[220px]">
                <div className={`flex bg-trading-card border-x border-t border-trading-border rounded-t-xl overflow-hidden`}>
                    <button 
                        onClick={() => onTabChange('positions')}
                        className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'positions' ? 'bg-amber-500 text-white' : 'text-trading-muted hover:bg-white/5'}`}
                    >
                        <Briefcase size={12} />
                        Paper Positions ({positions.length})
                    </button>
                    <button 
                        onClick={() => onTabChange('orders')}
                        className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${activeTab === 'orders' ? 'bg-amber-500 text-white' : 'text-trading-muted hover:bg-white/5'}`}
                    >
                        <History size={12} />
                        Paper Orders ({orders.length})
                    </button>
                </div>
                <div className="flex-1 min-h-0 border-x border-b border-trading-border rounded-b-xl overflow-hidden">
                    {activeTab === 'positions' ? (
                        <PositionsModule 
                            positions={positions as any} 
                            onExit={onExit} 
                            onExitAll={onExitAll} 
                            onRefresh={() => {}} 
                            theme={theme} 
                            bookedPnl={bookedPnl}
                            chain={chain}
                        />
                    ) : (
                        <OrdersModule 
                            orders={orders as any} 
                            onClear={onClearOrders} 
                            theme={theme} 
                        />
                    )}
                </div>
            </div>
        </div>
    );
};
