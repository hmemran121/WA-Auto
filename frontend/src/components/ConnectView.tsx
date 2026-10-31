import React, { useState, useEffect, useRef } from 'react';
import {
  RefreshCw, CheckCircle2, Database, Info, AlertCircle, Settings2,
  Globe, Server, Link2, Link2Off, Smartphone, ChevronDown, Users,
  ShieldCheck, Zap, Wifi, WifiOff, ScanLine, LogOut, Loader2
} from 'lucide-react';
import { Socket } from 'socket.io-client';
import { ConnectionConfig, Group } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import PremiumSelect from './common/PremiumSelect';

interface ConnectViewProps {
  isConnected: boolean;
  setIsConnected: (val: boolean) => void;
  socket: Socket | null;
  groups: Group[];
}

const ConnectView: React.FC<ConnectViewProps> = ({ isConnected, setIsConnected, socket, groups }) => {
  const [loading, setLoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [connectionStep, setConnectionStep] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [socketStatus, setSocketStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [syncMode, setSyncMode] = useState<'all' | 'chats'>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [accountInfo, setAccountInfo] = useState<{ name?: string; number?: string; platform?: string } | null>(null);

  const initializeBridge = (clearSession: boolean = false) => {
    setError(null);
    setLoading(true);
    setConnectionStep(clearSession ? 'Wiping Local Data...' : 'Initializing Bridge...');
    socket?.emit('restart-service', { clearSession });
  };

  useEffect(() => {
    if (!socket) return;

    if (socket.connected) {
      setSocketStatus('connected');
    }

    const onConnect = () => {
      setSocketStatus('connected');
      setConnectionStep('System Ready...');
    };

    const onQr = (qrBase64: string) => {
      setQrCode(qrBase64);
      setLoading(false);
      setConnectionStep('');
    };

    const onReady = () => {
      setLoading(false);
      setIsConnected(true);
      setConnectionStep('Active');
    };

    const onAuthenticated = () => {
      setConnectionStep('Synchronizing...');
    };

    const onStatusUpdate = (status: any) => {
      if (status.state === 'ready') {
        setIsConnected(true);
        setLoading(false);
        setError(null);
      } else if (status.state === 'qr') {
        setQrCode(status.data);
        setLoading(false);
        setError(null);
      } else if (status.state === 'error') {
        setError(status.error || 'Connection Failed');
        setLoading(false);
        setQrCode(null);
        setIsConnected(false);
      } else if (status.state === 'ready' || status.state === 'authenticated') {
        if (status.accountInfo) {
          setAccountInfo(status.accountInfo);
        }
        setError(null);
      } else if (status.state === 'initial' || status.state === 'auth_failure') {
        setIsConnected(false);
        setQrCode(null);
        setLoading(false);
        setConnectionStep(status.state === 'auth_failure' ? 'Auth Failure' : '');
      }
    };

    const onDisconnect = () => {
      setSocketStatus('disconnected');
    };

    const onConnectError = () => {
      setConnectionStep('Bridge Offline');
      setLoading(false);
      setSocketStatus('disconnected');
    };

    socket.on('connect', onConnect);
    socket.on('qr', onQr);
    socket.on('ready', onReady);
    socket.on('authenticated', onAuthenticated);
    socket.on('status_update', onStatusUpdate);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);

    return () => {
      socket.off('connect', onConnect);
      socket.off('qr', onQr);
      socket.off('ready', onReady);
      socket.off('authenticated', onAuthenticated);
      socket.off('status_update', onStatusUpdate);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
    };
  }, [socket, setIsConnected]);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 relative">
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div
            key="connected-state"
            initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
            className="max-w-4xl mx-auto"
          >
            <div className="bg-white/70 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] border border-emerald-100/50 p-12 relative">
              {/* Background Accents (Clipped separately to allow dropdown pop-outs) */}
              <div className="absolute inset-0 rounded-[2.5rem] overflow-hidden pointer-events-none">
                <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-400/10 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-teal-400/10 blur-[80px] rounded-full -ml-24 -mb-24"></div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-12 relative z-10">
                <div className="flex-shrink-0 text-center">
                  <div className="relative inline-block mb-6">
                    <motion.div
                      animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 3 }}
                      className="absolute inset-0 bg-emerald-400 blur-3xl rounded-full"
                    ></motion.div>
                    <div className="relative w-32 h-32 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center border-4 border-white shadow-2xl">
                      <ShieldCheck size={64} className="text-white" />
                    </div>
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -bottom-1 -right-1 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-emerald-50"
                    >
                      <div className="w-5 h-5 bg-emerald-500 rounded-full animate-pulse"></div>
                    </motion.div>
                  </div>
                  <h2 className="text-3xl font-black text-gray-900 tracking-tight">
                    {accountInfo?.name || 'System Secured'}
                  </h2>
                  <p className="text-emerald-600 font-bold uppercase tracking-widest text-[10px] mt-2">
                    {accountInfo?.number ? `+${accountInfo.number}` : 'Active Session'}
                  </p>
                  {accountInfo?.platform && (
                    <div className="mt-2 flex items-center justify-center gap-1 text-gray-400 text-[9px] font-bold">
                      <Smartphone size={10} />
                      <span className="uppercase tracking-widest">{accountInfo.platform} Device</span>
                    </div>
                  )}
                </div>

                <div className="flex-grow space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="bg-white/40 p-6 rounded-3xl border border-white shadow-sm">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Status</p>
                      <div className="flex items-center gap-2">
                        <Zap size={18} className="text-amber-500" />
                        <span className="font-bold text-gray-800">Operational</span>
                      </div>
                    </div>
                    <div className="bg-white/40 p-6 rounded-3xl border border-white shadow-sm">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Latency</p>
                      <div className="flex items-center gap-2">
                        <Wifi size={18} className="text-emerald-500" />
                        <span className="font-bold text-gray-800">Optimized</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-8 bg-black/[0.02] rounded-[2rem] border border-black/[0.03] space-y-6">
                    <div>
                      <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Users size={14} /> Group & Sync Management
                      </h4>
                      <PremiumSelect
                        label="Primary Target Group"
                        icon={Users}
                        options={[
                          { value: '', label: 'Individual Sync', description: 'No group persistence' },
                          ...groups.map(g => ({
                            value: g.id,
                            label: g.name,
                            description: `${g.contactCount || 0} members recorded`
                          }))
                        ]}
                        value={selectedGroupId}
                        onChange={setSelectedGroupId}
                        variant="emerald"
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => setSyncMode('all')}
                        className={`flex-1 py-3 px-4 rounded-2xl text-[11px] font-black transition-all uppercase tracking-widest ${syncMode === 'all'
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-white/60 text-gray-400 hover:text-gray-600 border border-white'
                          }`}
                      >
                        Complete Cloud Sync
                      </button>
                      <button
                        onClick={() => setSyncMode('chats')}
                        className={`flex-1 py-3 px-4 rounded-2xl text-[11px] font-black transition-all uppercase tracking-widest ${syncMode === 'chats'
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                          : 'bg-white/60 text-gray-400 hover:text-gray-600 border border-white'
                          }`}
                      >
                        Recent Chats Only
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => socket?.emit('sync-contacts', { mode: syncMode, groupId: selectedGroupId })}
                      className="py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 text-[11px] uppercase tracking-widest"
                    >
                      <Database size={16} /> Execute Synchronization
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => setIsConnected(false)}
                      className="py-4 bg-rose-50 text-rose-600 font-black rounded-2xl hover:bg-rose-100 transition-all border border-rose-100 flex items-center justify-center gap-2 text-[11px] uppercase tracking-widest"
                    >
                      <LogOut size={16} /> Terminate Session
                    </motion.button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="disconnected-state"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -30 }}
            className="max-w-5xl mx-auto h-[600px]"
          >
            <div className="h-full grid grid-cols-1 md:grid-cols-5 gap-6">
              {/* Left Panel: Instructions */}
              <div className="md:col-span-3 bg-white/70 backdrop-blur-3xl rounded-[2.5rem] p-12 border border-white shadow-2xl flex flex-col justify-center">
                <div className="mb-10">
                  <span className="inline-block px-4 py-1.5 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest mb-4">
                    Enterprise Bridge v2.0
                  </span>
                  <h1 className="text-5xl font-black text-gray-900 tracking-tighter leading-none mb-4">
                    Connect Your <br /><span className="text-emerald-500">Business</span> Assets
                  </h1>
                  <p className="text-gray-500 font-medium leading-relaxed max-w-md">
                    Seamlessly link your WhatsApp instance to our AI-driven automation engine for real-time engagement and growth.
                  </p>
                </div>

                <div className="space-y-8 relative">
                  <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-gradient-to-b from-emerald-500/50 to-transparent"></div>

                  {[
                    { icon: Smartphone, title: 'Open WhatsApp', desc: 'Navigate to Linked Devices in your settings.' },
                    { icon: ScanLine, title: 'Scan Securely', desc: 'Initialize device linking and authorize access.' }
                  ].map((step, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ delay: 0.1 * (idx + 1) }}
                      className="flex gap-6 relative z-10 group"
                    >
                      <div className="w-10 h-10 bg-white border border-gray-100 rounded-2xl flex items-center justify-center shadow-lg group-hover:bg-emerald-500 group-hover:text-white transition-all duration-500">
                        <step.icon size={20} />
                      </div>
                      <div>
                        <h3 className="font-black text-gray-800 text-lg tracking-tight">{step.title}</h3>
                        <p className="text-sm text-gray-400 font-medium">{step.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                <div className="mt-12 flex items-center gap-4">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-xs font-black transition-all ${showAdvanced ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                  >
                    <Settings2 size={16} /> Advanced Config
                  </motion.button>

                  <div className="h-2 w-2 bg-emerald-500 rounded-full animate-ping"></div>
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">System Online</span>
                </div>
              </div>

              {/* Right Panel: Interactive Connector */}
              <div className="md:col-span-2 bg-gray-900 rounded-[2.5rem] p-4 shadow-2xl relative overflow-hidden group">
                {/* Visual Eye-Candy for Dark Panel */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/20 blur-[60px] rounded-full"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 blur-[80px] rounded-full"></div>

                <div className="h-full border border-white/5 rounded-[2.2rem] flex flex-col items-center justify-center p-8 relative z-10">
                  <AnimatePresence mode="wait">
                    {loading ? (
                      <motion.div
                        key="connector-loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="text-center space-y-6"
                      >
                        <div className="relative w-32 h-32 mx-auto">
                          <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                            className="absolute inset-0 border-4 border-emerald-500/20 rounded-full"
                          ></motion.div>
                          <motion.div
                            animate={{ rotate: -360 }}
                            transition={{ repeat: Infinity, duration: 3, ease: "linear" }}
                            className="absolute inset-2 border-4 border-t-emerald-500 border-transparent rounded-full"
                          ></motion.div>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 size={32} className="text-emerald-500 animate-spin" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.3em]">Processing</p>
                          <p className="text-white font-bold text-sm tracking-wide">{connectionStep || 'Initializing...'}</p>
                        </div>
                      </motion.div>
                    ) : qrCode ? (
                      <motion.div
                        key="qr-active"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.1 }}
                        className="w-full text-center space-y-8"
                      >
                        <div className="relative group">
                          <div className="absolute -inset-4 bg-emerald-500/20 blur-2xl rounded-[3rem] opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
                          <div className="relative bg-white p-6 rounded-[2.5rem] shadow-2xl border-8 border-white/10 mx-auto w-fit">
                            <img
                              src={qrCode}
                              alt="Secure Gateway QR"
                              className="w-56 h-56 rounded-2xl"
                            />
                            <div className="absolute inset-0 rounded-[2rem] border-2 border-emerald-500/30 scale-[1.05] pointer-events-none"></div>
                          </div>
                        </div>

                        <div className="space-y-4">
                          <div className="flex items-center justify-center gap-3">
                            <RefreshCw
                              size={16}
                              className="text-emerald-500 cursor-pointer hover:rotate-180 transition-transform duration-500"
                              onClick={() => initializeBridge(false)}
                            />
                            <span className="text-white/60 text-[10px] font-black uppercase tracking-widest">Scan to Proceed</span>
                          </div>
                          <button
                            onClick={() => {
                              if (window.confirm("Full system reset will clear all local session data. Continue?")) {
                                initializeBridge(true);
                              }
                            }}
                            className="text-[9px] font-black text-rose-500 hover:text-rose-400 uppercase tracking-widest opacity-40 hover:opacity-100 transition-all"
                          >
                            Force Global Reset
                          </button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="connector-idle"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center space-y-10"
                      >
                        <div className="relative">
                          <motion.div
                            animate={{ scale: [1, 1.2, 1], rotate: [0, 5, -5, 0] }}
                            transition={{ repeat: Infinity, duration: 5 }}
                            className="w-40 h-40 bg-white/5 rounded-[3rem] border border-white/10 flex items-center justify-center shadow-inner"
                          >
                            <Smartphone size={80} className="text-emerald-500/40" />
                          </motion.div>
                          <div className="absolute -bottom-4 -right-4 w-12 h-12 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-xl">
                            <Link2 size={24} className="text-white" />
                          </div>
                        </div>

                        <div className="space-y-6 w-full">
                          <div className="text-center">
                            <h4 className="text-white font-black text-xl tracking-tight">Ready to Link</h4>
                            <p className="text-white/40 text-xs font-medium mt-1">Initialize your secure connection</p>
                          </div>

                          {error && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-start gap-4"
                            >
                              <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={18} />
                              <div className="text-left">
                                <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest">Initialization Error</p>
                                <p className="text-white/70 text-xs mt-1 font-medium">{error}</p>
                              </div>
                            </motion.div>
                          )}

                          <motion.button
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => initializeBridge(false)}
                            className="w-full bg-emerald-500 text-white py-4 rounded-2xl font-black shadow-2xl shadow-emerald-500/20 hover:bg-emerald-400 transition-all text-xs uppercase tracking-widest"
                          >
                            {loading ? 'Initializing...' : 'Initialize Bridge'}
                          </motion.button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>

            {/* Advanced Settings Modal-like section */}
            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, y: 50, filter: 'blur(20px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, y: 50, filter: 'blur(20px)' }}
                  className="mt-8 bg-white/70 backdrop-blur-3xl rounded-[2.5rem] p-10 border border-white shadow-2xl"
                >
                  <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl">
                      <Server size={24} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-900 tracking-tight">Backend Infrastructure</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <div className="p-6 bg-gray-50/50 rounded-3xl border border-gray-100 flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-800">Bridge Infrastructure</p>
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Enterprise Proxy Layer</p>
                        </div>
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                          <ShieldCheck size={20} />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">Gateway Endpoint</label>
                        <div className="relative">
                          <Globe className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                          <input
                            type="text"
                            value="http://localhost:3001"
                            disabled={true}
                            className="w-full bg-white border-2 border-gray-100 pl-14 pr-6 py-4 rounded-2xl outline-none transition-all font-bold text-gray-700 disabled:bg-gray-50/50"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-8 text-white relative overflow-hidden">
                      <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-3xl rounded-full -mr-16 -mt-16"></div>
                      <h4 className="font-black text-white/50 text-[10px] uppercase tracking-[0.3em] mb-4">Diagnostics</h4>
                      <div className="flex items-center gap-3 mb-6">
                        <div className={`w-3 h-3 rounded-full ${socketStatus === 'connected' ? 'bg-emerald-400' : 'bg-red-400'} shadow-[0_0_12px_rgba(52,211,153,0.5)]`}></div>
                        <span className="font-bold tracking-tight">Socket: {socketStatus === 'connected' ? 'Established' : 'Intercepted'}</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between text-[11px] font-medium border-b border-white/10 pb-2">
                          <span className="opacity-60">Handshake Protocol</span>
                          <span className="font-black">WebSocket Secure</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium border-b border-white/10 pb-2">
                          <span className="opacity-60">Identity Token</span>
                          <span className="font-black">Provisioned</span>
                        </div>
                        <div className="flex justify-between text-[11px] font-medium">
                          <span className="opacity-60">Last Sync</span>
                          <span className="font-black">Just now</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConnectView;
