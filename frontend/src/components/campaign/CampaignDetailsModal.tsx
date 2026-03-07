import React, { useEffect, useRef, useState } from 'react';
import {
    X,
    Calendar,
    Users,
    Send,
    AlertCircle,
    Link,
    CheckCircle2,
    ExternalLink,
    Loader2,
    MessageSquare,
    Pause,
    Play,
    Shield,
    Activity,
    Zap,
    Layers,
    Clock,
    BarChart3,
    Timer,
    Minimize2,
    Terminal,
    ChevronDown,
    Cpu
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MessageLog {
    id: number;
    number: string;
    text: string;
    timestamp: string;
    status: string;
    whatsapp_id?: string;
    contactName?: string;
}

interface CampaignDetailsModalProps {
    isOpen: boolean;
    onClose: () => void;
    campaign: any;
    executionData?: any;
    onPause?: (id: number) => Promise<void>;
    onResume?: (id: number) => Promise<void>;
    onCancel?: (id: number) => Promise<void>;
}

function formatETA(ms: number): string {
    if (ms <= 0 || !isFinite(ms)) return '…';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

const CampaignDetailsModal: React.FC<CampaignDetailsModalProps> = ({
    isOpen,
    onClose,
    campaign,
    executionData,
    onPause,
    onResume,
    onCancel
}) => {
    // Memoized Status Component
    const StatCard = React.memo(({ icon: Icon, label, value, colorClass }: any) => (
        <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-emerald-100/50 flex flex-col items-center justify-center gap-1">
            <div className="flex items-center gap-1.5 opacity-60">
                <Icon size={10} className={colorClass} />
                <span className={`text-[9px] font-black uppercase tracking-widest ${colorClass}`}>{label}</span>
            </div>
            <h4 className="text-3xl font-black text-gray-900 tracking-tighter leading-none">{value}</h4>
        </div>
    ));

    // Memoized Log Item
    const LogItem = React.memo(({ log, index }: any) => (
        <div className="mb-2 group flex gap-3">
            <span className="text-gray-700 opacity-50">{(index + 1).toString().padStart(3, '0')}</span>
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <span className="text-gray-600 text-[10px]">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                    <span className={`font-bold ${(log.type || log.status) === 'error' ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {(log.type || log.status).toUpperCase()}
                    </span>
                </div>
                <p className="text-gray-300 mt-0.5">{log.message || log.text}</p>
            </div>
        </div>
    ));

    // Memoized Recipient Item
    const RecipientItem = React.memo(({ recipient, index }: any) => (
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
            <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${recipient.status === 'sent' || recipient.status === 'delivered' || recipient.status === 'read' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-500'}`}>
                    {recipient.status === 'sent' || recipient.status === 'delivered' || recipient.status === 'read' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                </div>
                <div>
                    <p className="text-sm font-black text-gray-800">{recipient.contactName || recipient.number}</p>
                    <p className="text-[10px] font-bold text-gray-400">{recipient.number}</p>
                </div>
            </div>
            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${recipient.status?.includes('read') || recipient.status?.includes('sent') ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                {recipient.status}
            </span>
        </div>
    ));

    const [messages, setMessages] = useState<MessageLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [timeLeftInBreak, setTimeLeftInBreak] = useState<number>(0);
    const [timeLeftInWindow, setTimeLeftInWindow] = useState<number>(0);
    const [timeLeftInJitter, setTimeLeftInJitter] = useState<number>(0);
    const [activeTab, setActiveTab] = useState<'logs' | 'contacts'>('logs');
    const [isMessageExpanded, setIsMessageExpanded] = useState(false);

    const startTimeRef = useRef<number | null>(null);
    const [etaMs, setEtaMs] = useState<number>(0);

    const isRunning = executionData?.isActive && executionData?.campaignId === campaign?.id;
    const currentSent = isRunning ? (executionData.sentCount || 0) : (campaign?.sent_count || 0);
    const currentFailed = isRunning ? (executionData.failCount || 0) : (campaign?.fail_count || 0);
    const currentTotal = campaign?.total_recipients || 0;
    const progress = currentTotal > 0 ? Math.round(((currentSent + currentFailed) / currentTotal) * 100) : 0;

    // Unified Timer Effect
    useEffect(() => {
        if (!isRunning) {
            setTimeLeftInBreak(0);
            setTimeLeftInWindow(0);
            setTimeLeftInJitter(0);
            return;
        }

        const timer = setInterval(() => {
            const now = Date.now();

            // Batch Break
            if (executionData?.statusDetail === 'batch_break' && executionData?.breakEndsAt) {
                setTimeLeftInBreak(Math.max(0, executionData.breakEndsAt - now));
            } else {
                setTimeLeftInBreak(0);
            }

            // Window Wait
            if (executionData?.statusDetail === 'window_wait' && executionData?.resumeAt) {
                setTimeLeftInWindow(Math.max(0, executionData.resumeAt - now));
            } else {
                setTimeLeftInWindow(0);
            }

            // Jitter Wait
            if (executionData?.statusDetail === 'jitter_wait' && executionData?.antiBan?.jitter?.expiresAt) {
                setTimeLeftInJitter(Math.max(0, executionData.antiBan.jitter.expiresAt - now));
            } else {
                setTimeLeftInJitter(0);
            }
        }, 500); // Optimized 500ms cycle for UI state

        return () => clearInterval(timer);
    }, [isRunning, executionData?.statusDetail, executionData?.breakEndsAt, executionData?.resumeAt, executionData?.antiBan?.jitter?.expiresAt]);

    useEffect(() => {
        if (isOpen && campaign?.id) {
            fetchMessages();
        }
    }, [isOpen, campaign?.id]);

    const fetchMessages = async () => {
        setLoading(true);
        try {
            const resp = await fetch(`http://localhost:3001/api/campaigns/scheduled/${campaign.id}/details`);
            const data = await resp.json();
            if (data.success) {
                setMessages(data.messages || []);
            }
        } catch (err) {
            console.error('Failed to fetch campaign details:', err);
        } finally {
            setLoading(false);
        }
    };

    // Track start time for ETA
    useEffect(() => {
        if (isOpen && isRunning && startTimeRef.current === null) {
            startTimeRef.current = Date.now();
        }
        if (!isOpen) {
            startTimeRef.current = null;
            setEtaMs(0);
        }
    }, [isOpen, isRunning]);

    // Calculate ETA
    useEffect(() => {
        if (isRunning && currentSent > 0 && startTimeRef.current !== null && currentTotal > 0) {
            const elapsed = Date.now() - startTimeRef.current;
            const msPerItem = elapsed / currentSent;
            const remaining = currentTotal - currentSent;
            setEtaMs(msPerItem * remaining);
        }
    }, [currentSent, currentTotal, isRunning]);

    // For live logs
    const displayMessages = isRunning && executionData.logs ? [...executionData.logs].reverse() : messages;

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-gray-900/60 backdrop-blur-xl"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 30 }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                    className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-[3rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col border border-white/20"
                >
                    {/* Top Animated Accent */}
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-wa-teal via-emerald-400 to-wa-teal animate-gradient-x z-20" />

                    {/* ✨ Premium Header */}
                    <div className="px-8 py-3.5 flex justify-between items-center relative z-10 bg-gradient-to-b from-gray-50/50 to-transparent border-b border-gray-100/50">
                        <div className="flex items-center gap-4">
                            <motion.div
                                animate={isRunning ? {
                                    scale: [1, 1.05, 1],
                                    boxShadow: ["0 0 0px 0px rgba(18, 140, 126, 0)", "0 0 20px 5px rgba(18, 140, 126, 0.1)", "0 0 0px 0px rgba(18, 140, 126, 0)"]
                                } : {}}
                                transition={{ repeat: Infinity, duration: 2.5 }}
                                className={`p-3 rounded-2xl shadow-xl transition-all duration-700 ${isRunning ? 'bg-wa-teal text-white shadow-wa-teal/20' : 'bg-gray-900 text-white shadow-gray-200'}`}
                            >
                                {isRunning ? <Activity className="animate-pulse" size={20} /> : <Calendar size={20} />}
                            </motion.div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900 tracking-tight leading-none">{campaign?.name}</h3>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <div className="flex items-center gap-1 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                                        {isRunning && (
                                            <motion.div
                                                animate={{ scale: [1, 1.3, 1], opacity: [1, 0.5, 1] }}
                                                transition={{ repeat: Infinity, duration: 1 }}
                                                className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-sm"
                                            />
                                        )}
                                        <p className="text-[9px] font-black text-gray-500 uppercase tracking-widest">
                                            {isRunning ? `${currentSent} / ${currentTotal}` : 'Scheduled Details'}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-gray-400 font-bold">
                                        <Clock size={10} />
                                        {new Date(campaign?.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <motion.button
                            whileHover={{ scale: 1.1, rotate: 90, backgroundColor: '#fee2e2' }}
                            whileTap={{ scale: 0.9 }}
                            onClick={onClose}
                            className="p-2 bg-white border border-gray-100 rounded-xl shadow-sm text-gray-400 hover:text-rose-600"
                        >
                            <X size={18} />
                        </motion.button>
                    </div>

                    {/* 🚀 Main Content Layout */}
                    <div className="px-8 pt-10 pb-10 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-8 relative z-10 min-h-0">

                        {/* 📊 Central Progress Visualizer */}
                        <div className="bg-gradient-to-br from-emerald-50/50 to-white p-4 rounded-[2.5rem] border border-emerald-100/50 shadow-sm relative group">
                            <BarChart3 size={100} className="absolute -bottom-6 -right-6 text-emerald-500/5 rotate-12 group-hover:rotate-6 transition-transform duration-700" />

                            <div className="grid grid-cols-3 gap-2 relative z-10">
                                <StatCard icon={Layers} label="Progress" value={`${progress}%`} colorClass="text-wa-teal" />
                                <StatCard icon={Zap} label="Success" value={`${currentTotal > 0 ? Math.round((currentSent / currentTotal) * 100) : 0}%`} colorClass="text-emerald-600" />
                                <StatCard icon={Timer} label="Remaining" value={isRunning ? (etaMs > 0 ? formatETA(etaMs) : '---') : 'Ready'} colorClass="text-wa-teal" />
                            </div>

                            <div className="relative h-8 bg-white rounded-2xl overflow-hidden p-1.5 border border-emerald-100 shadow-inner mt-4">
                                <motion.div
                                    className="h-full rounded-xl relative overflow-hidden"
                                    style={{ background: 'linear-gradient(90deg, #128c7e, #2ecc71)' }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ type: 'spring', damping: 30, stiffness: 100 }}
                                >
                                    {isRunning && (
                                        <motion.div
                                            animate={{ x: ["-100%", "200%"] }}
                                            transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                                            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent w-full skew-x-12"
                                        />
                                    )}
                                </motion.div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <div className="p-3 bg-white/40 rounded-2xl border border-emerald-100/30 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 bg-emerald-100 rounded-lg flex items-center justify-center text-emerald-600">
                                            <Send size={12} />
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Sent</span>
                                    </div>
                                    <span className="text-lg font-black text-emerald-700">{currentSent}</span>
                                </div>
                                <div className="p-3 bg-white/40 rounded-2xl border border-rose-100/30 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 bg-rose-100 rounded-lg flex items-center justify-center text-rose-500">
                                            <AlertCircle size={12} />
                                        </div>
                                        <span className="text-[10px] font-black text-gray-400 tracking-widest uppercase">Failed</span>
                                    </div>
                                    <span className="text-lg font-black text-rose-600">{currentFailed}</span>
                                </div>
                            </div>
                        </div>

                        {/* 📝 Message Preview */}
                        <div className="bg-indigo-50/50 rounded-3xl border border-indigo-100/50 overflow-hidden">
                            <button
                                onClick={() => setIsMessageExpanded(!isMessageExpanded)}
                                className="w-full flex items-center justify-between p-5 hover:bg-indigo-100/30 transition-colors"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600">
                                        <MessageSquare size={16} />
                                    </div>
                                    <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Message Template</span>
                                </div>
                                <ChevronDown size={16} className={`text-indigo-400 transition-transform ${isMessageExpanded ? 'rotate-180' : ''}`} />
                            </button>
                            <AnimatePresence>
                                {isMessageExpanded && (
                                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="px-5 pb-5">
                                        <div className="p-4 bg-white/80 rounded-2xl border border-indigo-100 text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                                            {campaign?.message || 'No template available'}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* 🛡️ Advanced Security Layer */}
                        {isRunning && executionData.antiBan && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-2 px-2">
                                    <Shield size={14} className="text-amber-500" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em]">Security & Health Layer</span>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    <div className="p-5 rounded-[2.5rem] bg-gray-50/80 border border-gray-100 flex flex-col gap-3 group hover:shadow-lg">
                                        <div className="flex justify-between items-center">
                                            <div className="p-2 bg-emerald-100/50 rounded-xl text-emerald-600 relative">
                                                <Zap size={14} />
                                                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute inset-0 bg-emerald-400 rounded-full -z-10" />
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Daily Quota</span>
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex justify-between items-end">
                                                <span className="text-xl font-black text-gray-900 tracking-tight">{executionData.antiBan.quota?.sent || 0}</span>
                                                <span className="text-[10px] font-bold text-gray-400 font-mono">/ {executionData.antiBan.quota?.limit || '---'}</span>
                                            </div>
                                            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                <motion.div className="h-full bg-emerald-500" animate={{ width: executionData.antiBan.quota?.limit ? `${(Math.min(executionData.antiBan.quota.sent, executionData.antiBan.quota.limit) / executionData.antiBan.quota.limit) * 100}%` : '0%' }} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-5 rounded-[2.5rem] bg-gray-50/80 border border-gray-100 flex flex-col gap-3 group hover:shadow-lg">
                                        <div className="flex justify-between items-center">
                                            <div className="p-2 bg-indigo-100/50 rounded-xl text-indigo-600 relative">
                                                <Layers size={14} />
                                                {executionData.statusDetail === 'batch_break' && (
                                                    <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }} transition={{ repeat: Infinity, duration: 1.5 }} className="absolute inset-0 bg-indigo-400 rounded-full -z-10" />
                                                )}
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Batching</span>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Batch Progress</span>
                                            <span className="text-xl font-black text-gray-900 tracking-tight">
                                                {executionData.statusDetail === 'batch_break' ? (
                                                    <span className="text-amber-600 animate-pulse">{formatETA(timeLeftInBreak)}</span>
                                                ) : (
                                                    executionData.antiBan.batchProgress ? `${executionData.antiBan.batchProgress.current}/${executionData.antiBan.batchProgress.total}` : 'Active'
                                                )}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="p-5 rounded-[2.5rem] bg-gray-50/80 border border-gray-100 flex flex-col gap-3 group hover:shadow-lg">
                                        <div className="flex justify-between items-center">
                                            <div className="p-2 bg-amber-100/50 rounded-xl text-amber-600 relative">
                                                <Cpu size={14} />
                                                {executionData.statusDetail === 'jitter_wait' && (
                                                    <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }} transition={{ repeat: Infinity, duration: 1 }} className="absolute inset-0 bg-amber-400 rounded-full -z-10" />
                                                )}
                                            </div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">Jitter</span>
                                        </div>
                                        <div className="space-y-1">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">
                                                {executionData.statusDetail === 'jitter_wait' ? 'Next message' : 'Human Delay'}
                                            </span>
                                            <span className="text-xl font-black text-gray-900 tracking-tight">
                                                {executionData.statusDetail === 'jitter_wait' ? (
                                                    <span className="text-wa-teal">{(timeLeftInJitter / 1000).toFixed(1)}s</span>
                                                ) : (
                                                    executionData.antiBan.jitter?.current || 'Active'
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Pulse Status Bar */}
                                <div className="mx-2 px-6 py-3 rounded-2xl bg-gray-900 text-white flex items-center justify-between shadow-2xl relative overflow-hidden">
                                    <div className="flex items-center gap-3 relative z-10">
                                        <div className={`w-2.5 h-2.5 rounded-full ${executionData.statusDetail === 'batch_break' ? 'bg-amber-500 animate-pulse' :
                                            executionData.statusDetail === 'window_wait' ? 'bg-indigo-500 animate-pulse' :
                                                executionData.statusDetail === 'jitter_wait' ? 'bg-emerald-400 animate-pulse' : 'bg-wa-teal'
                                            }`} />
                                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">
                                            {executionData.statusDetail === 'batch_break' ? `Anti-Ban Rest: ${formatETA(timeLeftInBreak)}` :
                                                executionData.statusDetail === 'window_wait' ? `Window Wait: ${formatETA(timeLeftInWindow)}` :
                                                    executionData.statusDetail === 'jitter_wait' ? `Human Simulated Delay: ${(timeLeftInJitter / 1000).toFixed(1)}s` :
                                                        'System Pulse: Optimal & Protected'}
                                        </span>
                                    </div>
                                    <motion.div animate={{ x: ["-100%", "200%"] }} transition={{ repeat: Infinity, duration: 3, ease: "linear" }} className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent w-full pointer-events-none" />
                                </div>
                            </div>
                        )}

                        {/* 📋 Tabs and Activity Feed */}
                        <div className="flex flex-col flex-1 min-h-[400px]">
                            <div className="flex bg-gray-100/50 p-1.5 rounded-2xl gap-1 mb-4 border border-gray-200/50">
                                <button onClick={() => setActiveTab('logs')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'logs' ? 'bg-white text-wa-teal shadow-md border border-wa-teal/10' : 'text-gray-400'}`}>
                                    <Terminal size={12} /> Live Terminal
                                </button>
                                <button onClick={() => setActiveTab('contacts')} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'contacts' ? 'bg-white text-wa-teal shadow-md border border-wa-teal/10' : 'text-gray-400'}`}>
                                    <Users size={12} /> Recipients
                                </button>
                            </div>

                            <AnimatePresence mode="wait">
                                {activeTab === 'logs' ? (
                                    <motion.div key="logs" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex-1 bg-gray-950 rounded-[2.5rem] border border-gray-800 shadow-2xl overflow-hidden flex flex-col min-h-[300px]">
                                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                                <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Process Stream</span>
                                            </div>
                                            <span className="text-[9px] font-black text-gray-600 tracking-widest">UTF-8 // WS_LIVE</span>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-6 font-mono text-xs custom-scrollbar will-change-transform">
                                            {loading ? (
                                                <div className="h-full flex flex-col items-center justify-center gap-2 text-gray-600">
                                                    <Loader2 className="animate-spin" size={20} />
                                                    <span className="uppercase tracking-widest text-[9px]">Fetching Logs...</span>
                                                </div>
                                            ) : displayMessages.length === 0 ? (
                                                <p className="text-gray-600 italic">No activity logs found.</p>
                                            ) : (
                                                displayMessages.map((log: any, idx: number) => (
                                                    <LogItem key={log.id || idx} log={log} index={idx} />
                                                ))
                                            )}
                                        </div>
                                    </motion.div>
                                ) : (
                                    <motion.div key="contacts" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex-1 bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[300px]">
                                        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
                                            <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Delivery Report</h4>
                                        </div>
                                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar will-change-transform">
                                            {messages.length === 0 ? (
                                                <div className="h-full flex flex-col items-center justify-center opacity-40">
                                                    <Users size={30} className="mb-2" />
                                                    <p className="text-[10px] font-black uppercase">No recipients yet</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    {messages.map((r, i) => (
                                                        <RecipientItem key={`${r.phone}-${r.timestamp || i}`} recipient={r} index={i} />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* Footer Controls */}
                    <div className="px-8 py-4 bg-gray-50/90 backdrop-blur-xl border-t border-gray-100 flex items-center justify-center relative z-20">
                        {isRunning ? (
                            <div className="flex flex-col items-center gap-3 w-full max-w-sm">
                                <div className="flex items-center gap-3 w-full">
                                    {executionData.status === 'paused' ? (
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => onResume?.(campaign.id)} className="flex-[2] py-3 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2 border-b-2 border-indigo-800">
                                            <Play size={14} fill="white" /> Resume Stream
                                        </motion.button>
                                    ) : (
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => onPause?.(campaign.id)} className="flex-[2] py-3 rounded-2xl bg-amber-500 text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg flex items-center justify-center gap-2 border-b-2 border-amber-700">
                                            <Pause size={14} fill="white" /> Pause Stream
                                        </motion.button>
                                    )}
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => onCancel?.(campaign.id)} className="flex-1 py-3 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 font-black text-[10px] uppercase tracking-[0.2em]">
                                        Stop
                                    </motion.button>
                                </div>
                                <div className="flex items-center gap-1.5 opacity-40">
                                    <Shield size={8} />
                                    <p className="text-[9px] font-black uppercase tracking-[0.05em]">Session Protection Active</p>
                                </div>
                            </div>
                        ) : (
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={onClose} className="w-full max-w-sm py-4 rounded-2xl bg-gray-900 text-white font-black shadow-xl uppercase tracking-[0.2em] text-[11px] border-b-2 border-black">
                                Close Terminal
                            </motion.button>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default CampaignDetailsModal;
