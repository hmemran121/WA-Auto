import React, { useState, useEffect, useRef } from 'react';
import { RefreshCw, CheckCircle2, Database, Info, AlertCircle, Settings2, Globe, Server, Link2, Link2Off, Smartphone, ChevronDown, Users } from 'lucide-react';
import { io, Socket } from 'socket.io-client';
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

  const [config, setConfig] = useState<ConnectionConfig>({
    bridgeUrl: 'http://localhost:3001',
    apiKey: '',
    useExternalBridge: true
  });

  // Socket connection is managed by App.tsx
  // We just listen to the passed socket instance in the useEffect below

  const simulateConnection = () => {
    setLoading(true);
    setConnectionStep('Connecting to simulation server...');

    setTimeout(() => {
      setConnectionStep('Connected! Waiting for QR...');
      setSocketStatus('connected');

      setTimeout(() => {
        setQrCode('Simulated QR Code');
        setLoading(false);
        setConnectionStep('');

        // Simulate scan after 3s
        setTimeout(() => {
          setConnectionStep('Authenticated... Please wait');
          setQrCode(null);
          setLoading(true);

          setTimeout(() => {
            setIsConnected(true);
            setLoading(false);
            setConnectionStep('Connected successfully!');
          }, 2000);
        }, 3000);
      }, 1500);
    }, 1000);
  };
  useEffect(() => {
    if (!socket || !config.useExternalBridge) return;

    if (socket.connected) {
      setSocketStatus('connected');
    }

    const onConnect = () => {
      setSocketStatus('connected');
      setConnectionStep('Connected to server! synchronizing...');
    };

    const onQr = (qrBase64: string) => {
      setQrCode(qrBase64);
      setLoading(false);
      setConnectionStep('');
    };

    const onReady = () => {
      setLoading(false);
      setIsConnected(true);
      setConnectionStep('Connected successfully!');
    };

    const onAuthenticated = () => {
      setConnectionStep('Authenticated... Please wait');
    };

    const onStatusUpdate = (status: any) => {
      if (status.state === 'ready') {
        setIsConnected(true);
        setLoading(false);
      } else if (status.state === 'qr') {
        setQrCode(status.data);
        setLoading(false);
      } else if (status.state === 'initial' || status.state === 'auth_failure') {
        setIsConnected(false);
        setQrCode(null);
        setLoading(false);
        setConnectionStep(status.state === 'auth_failure' ? 'Authentication Failed. Please try again.' : '');
      }
    };

    const onDisconnect = () => {
      setSocketStatus('disconnected');
    };

    const onConnectError = () => {
      setConnectionStep('Could not connect to server. Check URL.');
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
  }, [socket, config.useExternalBridge]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-6xl mx-auto space-y-8"
    >
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div
            key="connected"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="max-w-md mx-auto bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-emerald-100 p-12 text-center"
          >
            <div className="relative inline-block mb-8">
              <motion.div
                animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.2, 0.4] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="absolute inset-0 bg-emerald-200 blur-3xl rounded-full"
              ></motion.div>
              <div className="relative inline-flex items-center justify-center w-28 h-28 bg-wa-teal rounded-full border-4 border-white shadow-xl text-white">
                <CheckCircle2 size={56} />
              </div>
            </div>
            <h2 className="text-3xl font-black text-gray-800 mb-3">Successfully Connected!</h2>
            <p className="text-gray-500 mb-10 leading-relaxed font-medium">
              Your WhatsApp session is now fully active. You can now send messages from the dashboard.
            </p>
            <div className="mb-6 p-6 bg-white/50 rounded-3xl border border-gray-100/50 shadow-inner group">
              <label className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] block mb-4 px-1 text-left">
                Assign to Group
              </label>

              <PremiumSelect
                label="Assign to Group"
                icon={Users}
                options={[
                  { value: '', label: 'No Group (Sync only)', description: 'Do not assign contacts' },
                  ...groups.map(g => ({
                    value: g.id,
                    label: g.name,
                    description: `${g.contactCount || 0} contacts`
                  }))
                ]}
                value={selectedGroupId}
                onChange={setSelectedGroupId}
                variant="emerald"
              />
            </div>

            <div className="flex gap-2 mb-6 p-1 bg-emerald-50/50 rounded-2xl border border-emerald-100/50">
              <button
                onClick={() => setSyncMode('all')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${syncMode === 'all'
                  ? 'bg-wa-teal text-white shadow-lg'
                  : 'text-gray-500 hover:bg-emerald-100'
                  }`}
              >
                All Contacts
              </button>
              <button
                onClick={() => setSyncMode('chats')}
                className={`flex-1 py-3 px-4 rounded-xl text-xs font-bold transition-all ${syncMode === 'chats'
                  ? 'bg-wa-teal text-white shadow-lg'
                  : 'text-gray-500 hover:bg-emerald-100'
                  }`}
              >
                Only Chats
              </button>
            </div>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                socket?.emit('sync-contacts', { mode: syncMode, groupId: selectedGroupId });
                // We don't need alert as ProcessModal will show progress
              }}
              className="w-full py-4 mb-3 bg-emerald-50 text-wa-teal font-black rounded-2xl hover:bg-emerald-100 transition-all border border-emerald-100 flex items-center justify-center gap-2 uppercase tracking-widest text-xs"
            >
              <Database size={18} /> Sync {syncMode === 'all' ? 'Everything' : 'Chat Contacts'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => {
                setIsConnected(false);
                // socket disconnect is managed globally
              }}
              className="w-full py-4 bg-rose-50 text-rose-600 font-bold rounded-2xl hover:bg-rose-100 transition-all border border-rose-100 flex items-center justify-center gap-2"
            >
              Disconnect Now
            </motion.button>
          </motion.div>
        ) : (
          <motion.div
            key="connect-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8"
          >
            <div className="flex flex-col md:flex-row bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white overflow-hidden">
              <div className="flex-1 p-10 md:p-16">
                <div className="flex justify-between items-start mb-10">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-wa-teal rounded-2xl shadow-lg shadow-wa-teal/20">
                      <Database size={24} className="text-white" />
                    </div>
                    <div>
                      <h2 className="text-3xl font-black text-gray-800">Connect WhatsApp</h2>
                      <div className="flex items-center gap-2 mt-2">
                        {config.useExternalBridge ? (
                          <span className={`flex items-center gap-1.5 text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full ${socketStatus === 'connected' ? 'bg-emerald-100 text-wa-teal' : 'bg-amber-100 text-amber-600'}`}>
                            {socketStatus === 'connected' ? <Link2 size={12} /> : <Link2Off size={12} />}
                            {socketStatus === 'connected' ? 'Server Active' : 'Connecting...'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-black tracking-widest uppercase px-3 py-1 rounded-full bg-blue-100 text-blue-600">Simulation Mode</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ rotate: 15, scale: 1.1 }}
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className={`p-3 rounded-2xl transition-all ${showAdvanced ? 'bg-indigo-50 text-indigo-600' : 'text-gray-400 hover:bg-gray-100'}`}
                  >
                    <Settings2 size={24} />
                  </motion.button>
                </div>

                <div className="space-y-8">
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="flex gap-5 group"
                  >
                    <span className="flex-shrink-0 w-10 h-10 bg-gray-50 text-gray-400 group-hover:bg-wa-teal group-hover:text-white transition-all text-sm font-black rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm">1</span>
                    <div>
                      <p className="font-bold text-gray-800 text-lg">Open WhatsApp Application</p>
                      <p className="text-sm text-gray-500 leading-relaxed font-medium">Go to Linked Devices in your phone's menu and click on the Link Device option.</p>
                    </div>
                  </motion.div>
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="flex gap-5 group"
                  >
                    <span className="flex-shrink-0 w-10 h-10 bg-gray-50 text-gray-400 group-hover:bg-wa-teal group-hover:text-white transition-all text-sm font-black rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm">2</span>
                    <div>
                      <p className="font-bold text-gray-800 text-lg">Scan the QR Code</p>
                      <p className="text-sm text-gray-500 leading-relaxed font-medium">Point your phone's camera at the QR code displayed in the right panel.</p>
                    </div>
                  </motion.div>
                </div>

                {!config.useExternalBridge && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-12 p-6 bg-amber-50/50 border border-amber-100 rounded-2xl flex items-start gap-4"
                  >
                    <AlertCircle className="text-amber-500 flex-shrink-0 mt-1" size={24} />
                    <div>
                      <p className="text-sm font-black text-amber-800 uppercase tracking-wide">Simulation Mode (Demo)</p>
                      <p className="text-xs text-amber-700 leading-relaxed mt-2 font-medium">
                        For real scanning to work, your backend server must be running. To see the demo <span className="font-black underline cursor-pointer hover:text-amber-900 transition-colors" onClick={simulateConnection}>Connect directly</span>.
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>

              <div className="w-full md:w-[460px] bg-gray-50/50 p-10 flex flex-col items-center justify-center border-l border-gray-100 relative overflow-hidden">
                <AnimatePresence mode="wait">
                  {loading ? (
                    <motion.div
                      key="loading"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex flex-col items-center gap-8 text-center"
                    >
                      <div className="relative">
                        <div className="w-24 h-24 border-4 border-gray-100 rounded-full"></div>
                        <div className="absolute inset-0 w-24 h-24 border-4 border-transparent border-t-emerald-500 rounded-full animate-spin"></div>
                      </div>
                      <p className="text-sm font-black text-gray-600 animate-pulse tracking-wide uppercase">{connectionStep}</p>
                    </motion.div>
                  ) : qrCode ? (
                    <motion.div
                      key="qr"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-8 w-full"
                    >
                      <div className="bg-white p-8 rounded-3xl shadow-2xl border-4 border-white">
                        <img
                          src={qrCode.startsWith('data:') ? qrCode : `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${qrCode}`}
                          alt="WhatsApp QR"
                          className="w-56 h-56 rounded-xl"
                        />
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-4">Will connect automatically</p>
                        <div className="flex flex-col gap-3 items-center">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              if (!config.useExternalBridge) {
                                simulateConnection();
                              } else {
                                socket?.emit('restart-service', { clearSession: false });
                                setLoading(true);
                                setConnectionStep('Refreshing QR Code...');
                              }
                            }}
                            className="flex items-center gap-2 mx-auto text-wa-teal font-black text-xs hover:text-emerald-700 transition-colors uppercase tracking-widest"
                          >
                            <RefreshCw size={14} /> Refresh QR
                          </motion.button>

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              if (window.confirm("This will logout current session and clear all data. Continue?")) {
                                socket?.emit('restart-service', { clearSession: true });
                                setLoading(true);
                                setConnectionStep('Clearing Session & Restarting...');
                              }
                            }}
                            className="text-[10px] text-rose-500 font-bold hover:text-rose-700 transition-colors uppercase tracking-tight opacity-60 hover:opacity-100"
                          >
                            Full Reset (Clear Session)
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="start"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center space-y-6 w-full"
                    >
                      <div className="w-56 h-56 bg-white rounded-3xl border border-gray-100 flex items-center justify-center text-gray-200 shadow-sm mx-auto">
                        <motion.div
                          animate={{ y: [0, -10, 0] }}
                          transition={{ repeat: Infinity, duration: 3 }}
                        >
                          <Smartphone size={64} className="opacity-40" />
                        </motion.div>
                      </div>
                      <motion.button
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={simulateConnection}
                        className="w-full bg-wa-teal text-white py-4 rounded-2xl font-black shadow-xl shadow-wa-teal/20 hover:bg-emerald-600 transition-all uppercase tracking-widest text-xs"
                      >
                        Connect Now (Demo)
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: 20 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: 20 }}
                  className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-indigo-50 p-10"
                >
                  <div className="flex items-center gap-4 mb-10">
                    <div className="p-3 bg-indigo-100 rounded-2xl text-indigo-600">
                      <Server size={24} />
                    </div>
                    <h3 className="text-2xl font-black text-gray-800">Server Settings</h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-6 bg-gray-50/50 rounded-2xl border border-gray-100">
                        <div>
                          <p className="font-bold text-gray-800">Live Socket Connection</p>
                          <p className="text-xs text-gray-400 font-medium">Use your own backend</p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={config.useExternalBridge}
                            onChange={(e) => setConfig({ ...config, useExternalBridge: e.target.checked })}
                          />
                          <div className="w-12 h-6.5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5.5 after:w-5.5 after:transition-all peer-checked:bg-emerald-500"></div>
                        </label>
                      </div>

                      <div>
                        <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Server URL (Socket.io)</label>
                        <div className="relative group">
                          <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
                          <input
                            type="text"
                            className="w-full pl-12 pr-6 py-4 border-2 border-gray-50 rounded-2xl focus:border-emerald-500 focus:ring-0 outline-none disabled:bg-gray-50 transition-all font-bold text-gray-700"
                            placeholder="http://localhost:3001"
                            value={config.bridgeUrl}
                            disabled={!config.useExternalBridge}
                            onChange={(e) => setConfig({ ...config, bridgeUrl: e.target.value })}
                          />
                        </div>
                        <p className="text-[10px] text-gray-400 mt-3 font-bold uppercase tracking-tight italic">Your Node.js server must be running properly.</p>
                      </div>
                    </div>

                    <div className="bg-indigo-50/30 rounded-2xl p-8 border border-indigo-50 relative overflow-hidden">
                      <div className="relative z-10">
                        <h4 className="font-black text-indigo-900 mb-4 flex items-center gap-2 uppercase tracking-wide">
                          <Info size={18} /> Backend Process
                        </h4>
                        <ul className="space-y-3">
                          {['Open terminal in backend folder.', 'Install required packages.', 'Run the server script.', 'Setup server URL and refresh.'].map((text, i) => (
                            <li key={i} className="flex gap-3 text-xs text-indigo-700 font-bold">
                              <span className="opacity-30">{i + 1}.</span>
                              {text}
                            </li>
                          ))}
                        </ul>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => setShowAdvanced(false)}
                          className="mt-8 w-full bg-indigo-600 text-white py-3 rounded-xl text-xs font-black shadow-lg shadow-indigo-600/20 uppercase tracking-widest"
                        >
                          Close Settings
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ConnectView;
