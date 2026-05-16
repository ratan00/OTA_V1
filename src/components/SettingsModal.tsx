import React, { useState, useCallback } from 'react';
import { X, Key, Shield, User, Link2, CheckCircle2, AlertCircle, RefreshCw, Clock, Database, Download } from 'lucide-react';
import { decodeDhanToken } from '../utils/tokenUtils';
import { localAppServer } from '../services/LocalServer';

interface SettingsModalProps {
  onSave: (dhan: any, mstock: any) => void;
  onClose: () => void;
  initialDhan: any;
  initialMstock: any;
  dhanConnected: boolean;
  mstockConnected: boolean;
  theme?: 'dark' | 'light';
  notify: (msg: string, level?: any) => void;
  onRefreshFunds: () => void;
  paperTrading: boolean;
  onTogglePaperTrading: (val: boolean) => void;
  simCapital: number;
  onSimCapitalChange: (val: number) => void;
  moduleConfig: Record<string, boolean>;
  onModuleToggle: (key: string, val: boolean) => void;
  onRenewKeys: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ 
  onSave, 
  onClose, 
  initialDhan, 
  initialMstock, 
  dhanConnected,
  mstockConnected,
  theme = 'dark',
  notify,
  onRefreshFunds,
  paperTrading,
  onTogglePaperTrading,
  simCapital,
  onSimCapitalChange,
  moduleConfig,
  onModuleToggle,
  onRenewKeys
}) => {
  const [dhan, setDhan] = useState(initialDhan || { client_id: '', access_token: '' });
  const [mstock, setMstock] = useState(initialMstock || { api_key: '', user_id: '', password: '' });
  const [totp, setTotp] = useState('');
  const [step, setStep] = useState<'LOGIN' | 'TOTP'>(mstockConnected ? 'LOGIN' : 'LOGIN');
  const [loading, setLoading] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [refreshingData, setRefreshingData] = useState(false);

  const isDark = theme === 'dark';

  const handleClearCache = useCallback(async () => {
    setClearingCache(true);
    try {
      const res = await localAppServer.clearCache();
      const data = res;
      if (data.status === 'success') {
        notify('Cache cleared — stream will fetch fresh data automatically.', 'success');
      } else {
        notify(`Failed to clear cache: ${data.message || 'Unknown error'}`, 'error');
      }
    } catch (e: any) {
      notify(`Cache clear error: ${e.message}`, 'error');
    } finally {
      setClearingCache(false);
    }
  }, [notify]);

  const handleRefreshData = useCallback(async () => {
    setRefreshingData(true);
    try {
      // Clear cache first, then signal WS to re-fetch immediately
      await localAppServer.clearCache();
      notify('Market data refresh triggered — stream will reload fresh data.', 'success');
    } catch (e: any) {
      notify(`Refresh error: ${e.message}`, 'error');
    } finally {
      setTimeout(() => setRefreshingData(false), 2000);
    }
  }, [notify]);

  const handleMStockLogin = async () => {
    if (!mstock.user_id || !mstock.password) {
        notify('MStock User ID and Password required', 'error');
        return;
    }
    setLoading(true);
    try {
        const data = await localAppServer.mstockLogin(mstock.user_id, mstock.password, mstock.api_key);
        if (data.status === 'success') {
            notify('MStock Login Step 1 Success. Enter TOTP.', 'success');
            setStep('TOTP');
        } else {
            notify(`MStock Login Failed: ${data.message}`, 'error');
        }
    } catch (e: any) {
        notify(`Connection Error: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
  };

  const handleMStockVerify = async () => {
    if (!totp) {
        notify('TOTP code required', 'error');
        return;
    }
    setLoading(true);
    try {
        const data = await localAppServer.mstockVerifyTotp(mstock.user_id, mstock.api_key, totp);
        if (data.status === 'success') {
            notify('MStock Authentication Complete', 'success');
            onRefreshFunds();
            onSave(dhan, mstock);
        } else {
            notify(`TOTP Verification Failed: ${data.message}`, 'error');
        }
    } catch (e: any) {
        notify(`Connection Error: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] backdrop-blur-sm p-4">
      <div className={`${isDark ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-slate-200'} border rounded-2xl w-full max-w-[480px] shadow-2xl overflow-hidden`}>
        <div className={`px-6 py-4 border-b ${isDark ? 'bg-[#1e222d] border-[#30363d]' : 'bg-slate-50 border-slate-200'} flex justify-between items-center`}>
          <div className="flex items-center space-x-2">
            <Key size={18} className="text-[#2962FF]" />
            <h3 className={`font-bold text-lg ${isDark ? 'text-white' : 'text-slate-900'}`}>API Configuration</h3>
          </div>
          <button onClick={onClose} className={`${isDark ? 'text-[#8b949e] hover:text-white' : 'text-slate-400 hover:text-slate-600'} transition-colors`}>
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
          {/* Paper Trading Toggle */}
          <div className={`p-4 rounded-xl border-2 flex items-center justify-between ${paperTrading ? 'bg-amber-500/10 border-amber-500/40' : 'bg-emerald-500/10 border-emerald-500/40'}`}>
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${paperTrading ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                <Shield size={20} className="text-white" />
              </div>
              <div>
                <h4 className={`text-sm font-black uppercase ${isDark ? 'text-white' : 'text-slate-900'}`}>
                  {paperTrading ? 'Sandbox Mode' : 'Live Execution'}
                </h4>
                <p className="text-[10px] text-trading-muted font-bold">
                  {paperTrading ? 'Simulating trades locally' : 'Orders sent to broker'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => onTogglePaperTrading(!paperTrading)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${paperTrading ? 'bg-amber-500' : 'bg-emerald-500'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${paperTrading ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {paperTrading && (
            <div className={`p-4 rounded-xl border-2 bg-black/5 ${isDark ? 'border-[#30363d]' : 'border-slate-100'} animate-in fade-in slide-in-from-top-2 duration-200`}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <RefreshCw size={14} className="text-amber-500" />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-white' : 'text-slate-900'}`}>Simulation Capital</span>
                    </div>
                </div>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-trading-muted font-mono font-bold">₹</span>
                    <input 
                        type="number"
                        value={simCapital}
                        onChange={(e) => onSimCapitalChange(Number(e.target.value))}
                        className={`w-full pl-8 pr-4 py-2 rounded-lg font-mono font-bold text-sm ${isDark ? 'bg-[#0d1117] text-white border-[#30363d]' : 'bg-white text-slate-900 border-slate-200'} border outline-none focus:border-amber-500 transition-colors`}
                    />
                </div>
                <p className="mt-2 text-[9px] text-trading-muted font-bold">Set your starting balance for Sandbox mode strategy testing.</p>
            </div>
          )}

          {/* Module Toggles */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2 border-l-4 border-violet-500 pl-3">
                <Shield size={16} className="text-violet-500" />
                <h4 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-[#8b949e]' : 'text-slate-500'}`}>Modules</h4>
                <span className="text-[8px] text-trading-muted font-bold bg-white/5 px-2 py-0.5 rounded">SAVE COMPUTATION</span>
            </div>
            <div className={`grid gap-2 p-3 rounded-xl border ${isDark ? 'bg-[#0d1117] border-[#30363d]' : 'bg-slate-50 border-slate-200'}`}>
              {[
                { key: 'optionChain', label: 'Option Chain', desc: 'Strike matrix with OI, IV, Greeks' },
                { key: 'gexProfile', label: 'GEX Profile', desc: 'Current expiry gamma exposure chart' },
                { key: 'combinedGex', label: 'Combined GEX', desc: 'Multi-expiry aggregated GEX chart' },
                { key: 'scalper', label: 'Scalper + Positions', desc: 'Quick trade panel and position tracker' },
                { key: 'watchlist', label: 'Watchlist', desc: 'Indices spot prices sidebar' },
              ].map(mod => (
                <div key={mod.key} className="flex items-center justify-between py-1.5">
                  <div>
                    <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{mod.label}</span>
                    <p className="text-[9px] text-trading-muted">{mod.desc}</p>
                  </div>
                  <button
                    onClick={() => onModuleToggle(mod.key, !moduleConfig[mod.key])}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${moduleConfig[mod.key] !== false ? 'bg-violet-500' : isDark ? 'bg-[#30363d]' : 'bg-slate-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${moduleConfig[mod.key] !== false ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Dhan Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 border-l-4 border-[#2962FF] pl-3">
                    <Shield size={16} className="text-[#2962FF]" />
                    <h4 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-[#8b949e]' : 'text-slate-500'}`}>Dhan Market Data</h4>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={onRenewKeys}
                        className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border transition-all flex items-center gap-1 ${isDark ? 'border-trading-accent/30 text-trading-accent hover:bg-trading-accent/10' : 'border-blue-200 text-blue-600 hover:bg-blue-50'}`}
                        title="Reset Dhan & MStock Credentials"
                    >
                        <RefreshCw size={10} /> Renew Session
                    </button>
                    <button 
                        onClick={handleClearCache}
                        disabled={clearingCache}
                        className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border transition-all flex items-center gap-1 disabled:opacity-50 ${isDark ? 'border-purple-500/30 text-purple-500 hover:bg-purple-500/10' : 'border-purple-200 text-purple-600 hover:bg-purple-50'}`}
                        title="Clear Offline Market Data Cache"
                    >
                        {clearingCache
                          ? <RefreshCw size={10} className="animate-spin" />
                          : <Database size={10} />}
                        {clearingCache ? 'Clearing...' : 'Clear Cache'}
                    </button>
                    <button
                        onClick={handleRefreshData}
                        disabled={refreshingData}
                        className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border transition-all flex items-center gap-1 disabled:opacity-50 ${isDark ? 'border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10' : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}
                        title="Refresh Market Data — clears cache and reloads all data"
                    >
                        {refreshingData
                          ? <RefreshCw size={10} className="animate-spin" />
                          : <Download size={10} />}
                        {refreshingData ? 'Refreshing...' : 'Refresh Data'}
                    </button>
                    <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase ${dhanConnected ? 'text-emerald-500 bg-emerald-500/10' : 'text-trading-muted bg-white/5'}`}>
                        {dhanConnected ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                        {dhanConnected ? 'Connected' : 'Disconnected'}
                    </div>
                </div>
            </div>
            <div className="grid gap-3">
              <div className="space-y-1">
                <label className={`text-xs ${isDark ? 'text-[#8b949e]' : 'text-slate-500'} ml-1`}>Client ID</label>
                <input 
                  type="text" 
                  value={dhan.client_id}
                  onChange={e => setDhan({...dhan, client_id: e.target.value})}
                  className={`w-full ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-lg px-3 py-2 text-sm focus:border-[#2962FF] outline-none transition-colors`}
                  placeholder="Enter Dhan Client ID"
                />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between items-center ml-1 pr-1">
                  <label className={`text-xs ${isDark ? 'text-[#8b949e]' : 'text-slate-500'}`}>Access Token</label>
                  {dhan.client_id && dhan.access_token && (
                    <button 
                      onClick={async () => {
                        setLoading(true);
                        try {
                          const data = await localAppServer.renewDhanToken(dhan.client_id, dhan.access_token) as any;
                          if (data.status === 'success' && data.data) {
                            const newToken = data.data.accessToken || data.data.access_token || data.data.token || (typeof data.data === 'string' ? data.data : null);
                            if (newToken) {
                                const updatedDhan = { ...dhan, access_token: newToken };
                                setDhan(updatedDhan);
                                // Persist immediately — auto-fills on next launch
                                localStorage.setItem('dhan_keys', JSON.stringify(updatedDhan));
                                onSave(updatedDhan, mstock);
                                notify('Token renewed & saved automatically.', 'success');
                            } else {
                                notify('Token renewed but could not parse response', 'warn');
                            }
                          } else {
                            notify(`Failed to renew token: ${data.message || 'Unknown error'}`, 'error');
                          }
                        } catch(e: any) {
                          notify(`Error: ${e.message}`, 'error');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      disabled={loading}
                      className={`text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all ${isDark ? 'text-trading-accent hover:text-white disabled:text-trading-muted' : 'text-blue-600 hover:text-blue-800 disabled:text-slate-400'}`}
                      title="Renew token via Dhan API"
                    >
                      <RefreshCw size={10} className={loading ? 'animate-spin' : ''} />
                      {loading ? 'Renewing...' : 'Renew Token'}
                    </button>
                  )}
                </div>
                <textarea 
                  value={dhan.access_token}
                  onChange={e => setDhan({...dhan, access_token: e.target.value})}
                  className={`w-full ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-lg px-3 py-2 text-[10px] font-mono focus:border-[#2962FF] outline-none transition-colors min-h-[60px] resize-none`}
                  placeholder="Enter Dhan Access Token"
                />
              </div>

              {dhan.access_token && decodeDhanToken(dhan.access_token) && (
                <div className={`p-2 rounded-lg border flex items-center justify-between ${decodeDhanToken(dhan.access_token)?.is_expired ? 'bg-rose-500/10 border-rose-500/30 text-rose-500' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'}`}>
                    <div className="flex items-center gap-2">
                        <Clock size={12} />
                        <span className="text-[9px] font-black uppercase">
                            {decodeDhanToken(dhan.access_token)?.is_expired ? 'EXPIRED' : 'EXPIRES'}
                        </span>
                    </div>
                    <span className="text-[9px] font-mono font-bold">
                        {decodeDhanToken(dhan.access_token)?.expiry}
                    </span>
                </div>
              )}
            </div>
          </div>

          {/* mStock Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 border-l-4 border-[#f23645] pl-3">
                    <User size={16} className="text-[#f23645]" />
                    <h4 className={`text-sm font-bold uppercase tracking-wider ${isDark ? 'text-[#8b949e]' : 'text-slate-500'}`}>mStock Execution</h4>
                </div>
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-black uppercase ${mstockConnected ? 'text-emerald-500 bg-emerald-500/10' : 'text-trading-muted bg-white/5'}`}>
                    {mstockConnected ? <CheckCircle2 size={10} /> : <AlertCircle size={10} />}
                    {mstockConnected ? 'Connected' : 'Disconnected'}
                </div>
            </div>
            <div className="grid gap-3">
              <div className="space-y-1">
                <label className={`text-xs ${isDark ? 'text-[#8b949e]' : 'text-slate-500'} ml-1`}>API Key</label>
                <input 
                  type="text" 
                  value={mstock.api_key}
                  onChange={e => setMstock({...mstock, api_key: e.target.value})}
                  disabled={mstockConnected}
                  className={`w-full ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-lg px-3 py-2 text-sm focus:border-[#f23645] outline-none transition-colors disabled:opacity-50`}
                  placeholder="Enter mStock API Key"
                />
              </div>
              <div className="flex gap-3">
                <div className="space-y-1 flex-1">
                  <label className={`text-xs ${isDark ? 'text-[#8b949e]' : 'text-slate-500'} ml-1`}>User ID</label>
                  <input 
                    type="text" 
                    value={mstock.user_id}
                    onChange={e => setMstock({...mstock, user_id: e.target.value})}
                    disabled={mstockConnected}
                    className={`w-full ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-lg px-3 py-2 text-sm focus:border-[#f23645] outline-none transition-colors disabled:opacity-50`}
                    placeholder="User ID"
                  />
                </div>
                <div className="space-y-1 flex-1">
                  <label className={`text-xs ${isDark ? 'text-[#8b949e]' : 'text-slate-500'} ml-1`}>Password</label>
                  <input 
                    type="password" 
                    value={mstock.password}
                    onChange={e => setMstock({...mstock, password: e.target.value})}
                    disabled={mstockConnected}
                    className={`w-full ${isDark ? 'bg-[#0d1117] border-[#30363d] text-white' : 'bg-slate-50 border-slate-200 text-slate-900'} border rounded-lg px-3 py-2 text-sm focus:border-[#f23645] outline-none transition-colors disabled:opacity-50`}
                    placeholder="Password"
                  />
                </div>
              </div>

              {step === 'TOTP' && (
                <div className="space-y-1 mt-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-xs text-trading-accent font-black uppercase tracking-widest ml-1">Enter TOTP Code</label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={totp}
                      onChange={e => setTotp(e.target.value)}
                      className={`flex-1 ${isDark ? 'bg-[#0d1117] border-trading-accent text-white' : 'bg-slate-50 border-trading-accent text-slate-900'} border-2 rounded-lg px-3 py-2 text-sm outline-none font-mono font-bold tracking-[0.5em] text-center`}
                      placeholder="000000"
                      autoFocus
                    />
                    <button 
                        onClick={handleMStockVerify}
                        disabled={loading}
                        className="px-4 bg-trading-accent text-white rounded-lg font-black text-xs uppercase hover:bg-blue-600 transition-all disabled:opacity-50"
                    >
                        Verify
                    </button>
                  </div>
                </div>
              )}

              {!mstockConnected && step === 'LOGIN' && (
                <button 
                  onClick={handleMStockLogin}
                  disabled={loading}
                  className="w-full mt-2 flex items-center justify-center gap-2 py-2.5 bg-[#f23645] hover:bg-red-600 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg shadow-red-500/20 active:scale-[0.98] disabled:opacity-50"
                >
                  {loading ? <RefreshCw size={14} className="animate-spin" /> : <Link2 size={14} />}
                  Connect MStock
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={`p-6 ${isDark ? 'bg-[#1e222d] border-[#30363d]' : 'bg-slate-50 border-slate-200'} border-t flex gap-3`}>
          <button 
            onClick={onClose}
            className={`flex-1 px-4 py-2 rounded-lg border ${isDark ? 'border-[#30363d] text-white hover:bg-[#30363d]' : 'border-slate-200 text-slate-600 hover:bg-slate-100'} text-sm font-bold transition-colors`}
          >
            Cancel
          </button>
          <button 
            onClick={() => onSave(dhan, mstock)}
            className="flex-1 px-4 py-2 rounded-lg bg-[#2962FF] text-white text-sm font-bold hover:bg-[#1e4bd8] transition-colors shadow-lg shadow-[#2962FF]/20"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};
