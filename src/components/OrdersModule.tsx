import React from 'react';
import { ClipboardList, CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';

export interface Order {
  id: string;
  action: 'BUY' | 'SELL';
  side: 'CE' | 'PE';
  strike: number;
  type: 'MKT' | 'LMT';
  price: number;
  qty: number;
  status: 'PENDING' | 'EXECUTED' | 'REJECTED' | 'CANCELLED';
  timestamp: string;
}

interface OrdersModuleProps {
  orders: Order[];
  onClear: () => void;
  theme: 'dark' | 'light';
}

export const OrdersModule: React.FC<OrdersModuleProps> = ({ orders, onClear, theme }) => {
  const isDark = theme === 'dark';

  const getStatusIcon = (status: Order['status']) => {
    switch (status) {
      case 'EXECUTED': return <CheckCircle2 size={14} className="text-emerald-500" />;
      case 'PENDING': return <Clock size={14} className="text-trading-accent animate-pulse" />;
      case 'REJECTED': return <AlertCircle size={14} className="text-rose-500" />;
      default: return <XCircle size={14} className="text-trading-muted" />;
    }
  };

  return (
    <div className={`rounded-xl border bg-trading-card border-trading-border overflow-hidden shadow-2xl flex flex-col h-full`}>
      <div className={`px-4 py-2 ${isDark ? 'bg-[#1e222d]' : 'bg-slate-50'} border-b border-trading-border flex items-center justify-between shrink-0`}>
        <div className="flex items-center gap-3">
          <ClipboardList size={16} className="text-trading-accent" />
          <span className={`text-[12px] font-black uppercase tracking-[0.2em] ${isDark ? 'text-trading-muted' : 'text-slate-600'}`}>Order Book</span>
        </div>
        <button 
          onClick={onClear}
          className="text-[10px] font-bold text-trading-muted hover:text-trading-accent transition-colors uppercase tracking-widest"
        >
          Clear Logs
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {orders.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30 p-6 text-center">
            <ClipboardList size={48} className="mb-3" />
            <p className="text-[12px] font-black uppercase tracking-widest">No orders this session</p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className={`sticky top-0 ${isDark ? 'bg-[#2a2e39]' : 'bg-slate-100'} text-trading-muted uppercase text-[8px] font-black tracking-widest z-10`}>
              <tr>
                <th className="px-3 py-3 text-[9px]">Time</th>
                <th className="px-3 py-3 text-[9px]">Action</th>
                <th className="px-3 py-3 text-[9px]">Order</th>
                <th className="px-3 py-3 text-right text-[9px]">Price/Qty</th>
                <th className="px-3 py-3 text-right text-[9px]">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-3 py-3">
                    <span className="text-[10px] font-mono text-trading-muted">{order.timestamp}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded ${order.action === 'BUY' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                        {order.action}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                       <span className="text-[10px] font-black text-trading-muted">{order.side}</span>
                       <span className="font-black text-sm text-trading-text">{order.strike}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <p className="text-sm font-mono font-black text-trading-text leading-none">₹{order.price.toFixed(2)}</p>
                    <p className="text-[9px] text-trading-muted mt-1 uppercase font-bold">{order.type} | QTY: {order.qty}</p>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <span className={`text-[9px] font-black uppercase tracking-tighter ${
                        order.status === 'EXECUTED' ? 'text-emerald-500' : 
                        order.status === 'PENDING' ? 'text-trading-accent' : 'text-rose-500'
                      }`}>
                        {order.status}
                      </span>
                      {getStatusIcon(order.status)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
