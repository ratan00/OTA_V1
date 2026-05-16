import { useState, useEffect, useRef } from 'react';
import { Terminal as TerminalIcon, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

interface ProcessTerminalProps {
  logs: LogEntry[];
  onClear: () => void;
  theme?: 'dark' | 'light';
}

export const ProcessTerminal = ({ logs, onClear, theme = 'dark' }: ProcessTerminalProps) => {
  const [isMinimized, setIsMinimized] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current && !isMinimized) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isMinimized]);

  const isDark = theme === 'dark';

  const getLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'success': return 'text-trading-success';
      case 'error': return 'text-trading-danger';
      case 'warn': return 'text-yellow-500';
      default: return 'text-trading-accent';
    }
  };

  return (
    <div className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${isMinimized ? 'h-10' : 'h-64'}`}>
      <div className={`mx-6 h-full bg-trading-card border-trading-border border-x border-t rounded-t-xl shadow-2xl flex flex-col`}>
        {/* Header */}
        <div className={`px-4 py-2 border-b ${isDark ? 'border-trading-border bg-[#1e222d]' : 'border-slate-200 bg-slate-50'} flex items-center justify-between rounded-t-xl`}>
          <div className="flex items-center gap-2">
            <TerminalIcon size={14} className="text-trading-accent" />
            <span className={`text-xs font-bold uppercase tracking-wider ${isDark ? 'text-white' : 'text-slate-900'}`}>Process Terminal</span>
            <span className={`text-[10px] ${isDark ? 'bg-[#30363d] text-trading-muted' : 'bg-slate-200 text-slate-500'} px-2 py-0.5 rounded`}>{logs.length} entries</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClear} className="text-trading-muted hover:text-trading-danger transition-colors">
              <Trash2 size={14} />
            </button>
            <button onClick={() => setIsMinimized(!isMinimized)} className={`${isDark ? 'text-trading-muted hover:text-white' : 'text-slate-400 hover:text-slate-900'} transition-colors`}>
              {isMinimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* Log Area */}
        {!isMinimized && (
          <div 
            ref={scrollRef}
            className={`flex-1 overflow-y-auto p-4 font-mono text-[12px] space-y-1 ${isDark ? 'bg-[#0d1117]/50' : 'bg-slate-50/50'}`}
          >
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center text-trading-muted italic">
                No active processes to display...
              </div>
            ) : (
              logs.map((log) => (
                <div key={log.id} className={`flex gap-3 ${isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'} px-2 py-0.5 rounded transition-colors group`}>
                  <span className="text-trading-muted shrink-0">[{log.timestamp}]</span>
                  <span className={`font-bold shrink-0 w-16 uppercase ${getLevelColor(log.level)}`}>{log.level}</span>
                  <span className="text-trading-text break-all">{log.message}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};
