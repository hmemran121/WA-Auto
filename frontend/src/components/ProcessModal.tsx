import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2, CheckCircle2, AlertCircle, Terminal, ChevronDown, Minimize2, Maximize2, Timer, Pause, Play, Shield, Activity, Cpu, Zap, BarChart3, Layers, Clock, MessageSquare, Users, Send } from 'lucide-react';

interface ProcessLog {
    id: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
    timestamp: string;
}

interface ProcessModalProps {
    isOpen: boolean;
    title: string;
    current: number;
    total: number;
    logs: ProcessLog[];
    status: 'processing' | 'completed' | 'failed';
    id?: string; // Instant process ID
    campaignId?: number; // Scheduled campaign ID
    source?: string;
    antiBan?: {
        quota?: { sent: number; limit: number; enabled: boolean };
        batch?: { enabled: boolean; batchSize: number; current?: number };
        jitter?: { enabled: boolean; min: number; max: number; current?: string; expiresAt?: number };
        windows?: { enabled: boolean };
        batchProgress?: { current: number; total: number };
    };
    statusDetail?: 'active' | 'batch_break' | 'window_wait' | 'jitter_wait' | 'quota_reached';
    breakEndsAt?: number;
    resumeAt?: number;
    sentCount?: number;
    failCount?: number;
    messagePreview?: string;
    recipients?: { name: string; phone: string; status: string; timestamp: string }[];
    onClose: () => void;
    onStop?: () => void;
    onPause?: () => void;
    onResume?: () => void;
    executionState?: 'paused' | 'running' | 'cancelled';
}

const formatETA = (ms: number): string => {
    if (ms <= 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    return `${m}:${s.toString().padStart(2, '0')}`;
};

const SuccessParticles: React.FC = () => {
    return (
        <div className="absolute inset-0 pointer-events-none overflow-hidden z-[101]">
            {[...Array(20)].map((_, i) => (
                <motion.div
                    key={i}
                    initial={{ opacity: 1, scale: 0, x: '50%', y: '50%' }}
                    animate={{
                        opacity: 0,
                        scale: [0, Math.random() * 2 + 1, 0],
                        x: `${Math.random() * 100}%`,
                        y: `${Math.random() * 100}%`,
                        rotate: Math.random() * 720
                    }}
                    transition={{ duration: 1.5, ease: "easeOut" }}
                    className="absolute w-6 h-6 bg-amber-400 shadow-[0_0_20px_#fbbf24]"
                    style={{
                        boxShadow: `0 0 ${Math.random() * 30 + 15}px #fbbf24`,
                        clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)'
                    }}
                />
            ))}
        </div>
    );
};
const ProcessModal: React.FC<ProcessModalProps> = ({
    isOpen, title, current, total, logs, status, id, campaignId, source, antiBan,
    statusDetail = 'active', breakEndsAt, resumeAt, sentCount, failCount,
    messagePreview, recipients, onClose, onStop, onPause, onResume, executionState
}) => {
    const logEndRef = useRef<HTMLDivElement>(null);
    const logContainerRef = useRef<HTMLDivElement>(null);
    const isPinnedRef = useRef(true);
    const isAutoScrollingRef = useRef(false);
    const startTimeRef = useRef<number | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [hasNewLogs, setHasNewLogs] = useState(false);
    const [showParticle, setShowParticle] = useState(false);
    const [etaMs, setEtaMs] = useState<number>(0);
    const [timeLeftInBreak, setTimeLeftInBreak] = useState<number>(0);
    const [timeLeftInWindow, setTimeLeftInWindow] = useState<number>(0);
    const [timeLeftInJitter, setTimeLeftInJitter] = useState<number>(0);
    const [activeTab, setActiveTab] = useState<'logs' | 'contacts'>('logs');
    const [speedMultiplier, setSpeedMultiplier] = useState(1);
    const [isEditingContent, setIsEditingContent] = useState(false);
    const [liveContent, setLiveContent] = useState(messagePreview || '');

    const isScheduled = source === 'scheduled_campaign';

    // Progress & ETA Calculation
    const progress = total > 0 ? Math.min(Math.round((current / total) * 100), 100) : 0;

    useEffect(() => {
        if (status === 'processing' && current > 0 && total > 0) {
            if (!startTimeRef.current) {
                startTimeRef.current = Date.now();
            }
            const elapsed = Date.now() - startTimeRef.current;
            const msPerItem = elapsed / current;
            const remaining = total - current;
            setEtaMs(Math.round(remaining * msPerItem));
        } else if (status !== 'processing') {
            startTimeRef.current = null;
            setEtaMs(0);
        }
    }, [current, total, status]);

    // Timer Effects for Anti-Ban
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (statusDetail === 'batch_break' && breakEndsAt) {
            interval = setInterval(() => {
                const left = breakEndsAt - Date.now();
                setTimeLeftInBreak(Math.max(0, left));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [statusDetail, breakEndsAt]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (statusDetail === 'window_wait' && resumeAt) {
            interval = setInterval(() => {
                const left = resumeAt - Date.now();
                setTimeLeftInWindow(Math.max(0, left));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [statusDetail, resumeAt]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (statusDetail === 'jitter_wait' && antiBan?.jitter?.expiresAt) {
            interval = setInterval(() => {
                const left = antiBan.jitter!.expiresAt! - Date.now();
                setTimeLeftInJitter(Math.max(0, left));
            }, 100);
        }
        return () => clearInterval(interval);
    }, [statusDetail, antiBan?.jitter?.expiresAt]);

    const [isSaving, setIsSaving] = useState(false);

    // Debounced Auto-Save Logic
    useEffect(() => {
        if (!isEditingContent) return;

        const timer = setTimeout(() => {
            const socket = (window as any).socket;
            if (socket) {
                setIsSaving(true);
                socket.emit('update_campaign_content', {
                    id: id,
                    campaignId: campaignId,
                    text: liveContent
                });
                // Small delay to show "Saving..." feedback
                setTimeout(() => setIsSaving(false), 500);
            }
        }, 800); // 800ms debounce

        return () => clearTimeout(timer);
    }, [liveContent, id, campaignId, isEditingContent]);

    useEffect(() => {
        const socket = (window as any).socket;
        if (!socket) return;

        const handleUpdate = (data: any) => {
            if ((data.id && data.id === id) || (data.campaignId && data.campaignId === campaignId)) {
                // If it's an external update and we are not editing, update local state
                if (!isEditingContent) {
                    setLiveContent(data.text);
                }
            }
        };

        socket.on('campaign_content_updated', handleUpdate);
        return () => { socket.off('campaign_content_updated', handleUpdate); };
    }, [id, campaignId, isEditingContent]);

    // Update liveContent when messagePreview prop changes (initially)
    useEffect(() => {
        if (messagePreview && !isEditingContent) {
            setLiveContent(messagePreview);
        }
    }, [messagePreview, isEditingContent]);

    const handleStop = async () => {
        if (!window.confirm('Are you sure you want to FORCE STOP this operation?')) return;
        if (onStop) {
            onStop();
            return;
        }
        try {
            const processId = id || String(campaignId);
            const url = `http://localhost:3001/api/processes/${processId}/cancel`;
            await fetch(url, { method: 'PATCH' });
        } catch (e) { console.error('Stop failed', e); }
    };

    const handlePause = async () => {
        if (onPause) {
            onPause();
            return;
        }
        try {
            const processId = id || String(campaignId);
            const url = `http://localhost:3001/api/processes/${processId}/pause`;
            await fetch(url, { method: 'PATCH' });
        } catch (e) { console.error('Pause failed', e); }
    };

    const handleResume = async () => {
        if (onResume) {
            onResume();
            return;
        }
        try {
            const processId = id || String(campaignId);
            const url = `http://localhost:3001/api/processes/${processId}/resume`;
            await fetch(url, { method: 'PATCH' });
        } catch (e) { console.error('Resume failed', e); }
    };

    const handleSpeedChange = (val: number) => {
        setSpeedMultiplier(val);
        const socket = (window as any).socket;
        if (socket && campaignId) {
            // Fetch current settings to get baseline delays if needed, 
            // but usually we just send the multiplier or adjusted values
            // The backend expect delayMinMs and delayMaxMs
            // We'll trust the multiplier logic from ScheduledCountdownManager
            const baselineMin = 8000;
            const baselineMax = 15000;
            socket.emit('update_execution_delays', {
                campaignId,
                delayMinMs: Math.round(baselineMin / val),
                delayMaxMs: Math.round(baselineMax / val)
            });
        }
    };

    // ... progress calculation ...

    // Handle Scroll Detection (USER manual scroll only)
    const handleScroll = () => {
        if (!logContainerRef.current) return;

        // If this scroll was triggered by the system (auto-scroll), ignore it
        if (isAutoScrollingRef.current) {
            isAutoScrollingRef.current = false;
            return;
        }

        const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current;
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;

        // v8.7: Industry standard at-bottom detection (threshold 60px)
        const isNearBottom = distanceToBottom <= 60;

        setIsAtBottom(isNearBottom);

        // If they scrolled UP away from the bottom, unpin.
        // If they scrolled DOWN to the bottom, re-pin.
        if (isNearBottom) {
            isPinnedRef.current = true;
            setHasNewLogs(false);
        } else {
            isPinnedRef.current = false;
        }
    };

    // Use interaction handlers to instantly lock scroll when intent is "Scroll UP"
    const handleUserInteraction = (e: any) => {
        // For wheel, only lock if we are scrolling UP
        if (e.deltaY && e.deltaY < 0) {
            isPinnedRef.current = false;
            setIsAtBottom(false);
        } else if (!e.deltaY) {
            // For touch, any movement unpins
            isPinnedRef.current = false;
            setIsAtBottom(false);
        }
    };

    // v8.7: "Magnetic sticky" force-flush on every log update
    useLayoutEffect(() => {
        if (!isMinimized && logContainerRef.current && isPinnedRef.current) {
            const container = logContainerRef.current;
            isAutoScrollingRef.current = true;
            container.scrollTop = container.scrollHeight;
        } else if (logs.length > 0 && !isPinnedRef.current) {
            setHasNewLogs(true);
        }
    }, [logs.length, isMinimized]);

    // v8.7: RE-SIZE OBSERVER - The "Absolute Solution" for sticky terminals
    // This watches for physical content height changes (DOM updates)
    useEffect(() => {
        if (!logContainerRef.current || isMinimized) return;

        const container = logContainerRef.current;
        const resizeObserver = new ResizeObserver(() => {
            if (isPinnedRef.current) {
                isAutoScrollingRef.current = true;
                container.scrollTop = container.scrollHeight;
            }
        });

        // Observe the scroll container's scrollHeight changes
        // We observe the container itself because scrollHeight changes trigger scrolls
        resizeObserver.observe(container);

        return () => resizeObserver.disconnect();
    }, [isMinimized]);

    const scrollToBottom = () => {
        if (logContainerRef.current) {
            isAutoScrollingRef.current = true;
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
        isPinnedRef.current = true;
        setIsAtBottom(true);
        setHasNewLogs(false);
    };

    useEffect(() => {
        if (logs.length > 0) {
            const lastLog = logs[logs.length - 1];
            if (lastLog.type === 'success') {
                setShowParticle(true);
                setTimeout(() => setShowParticle(false), 2000);
            }
        }
    }, [logs.length]);

    if (!isOpen) return null;

    if (isMinimized) {
        const progress = total > 0 ? Math.round((current / total) * 100) : 0;
        const pillRadius = 14;
        const pillCircumference = 2 * Math.PI * pillRadius;

        return (
            <div className="fixed bottom-8 right-8 z-[100]">
                <motion.button
                    layoutId="execution-hud-pill"
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    whileHover={{ scale: 1.05 }}
                    onClick={() => setIsMinimized(false)}
                    className="flex items-center gap-4 pl-2 pr-6 py-2 bg-[#0a0d0c]/90 backdrop-blur-xl border border-wa-teal/20 rounded-full shadow-2xl group overflow-hidden"
                >
                    {showParticle && <SuccessParticles />}
                    <div className="relative w-10 h-10 flex-shrink-0">
                        <svg className="w-full h-full -rotate-90">
                            <circle cx="20" cy="20" r={pillRadius} className="stroke-white/5 fill-transparent" strokeWidth="3" />
                            <motion.circle
                                cx="20" cy="20" r={pillRadius}
                                className="stroke-wa-teal fill-transparent"
                                strokeWidth="3"
                                strokeDasharray={pillCircumference}
                                animate={{ strokeDashoffset: pillCircumference * (1 - (progress / 100)) }}
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            {status === 'processing' ? (
                                <Activity size={12} className="text-wa-teal animate-pulse" />
                            ) : status === 'completed' ? (
                                <CheckCircle2 size={12} className="text-emerald-400" />
                            ) : (
                                <AlertCircle size={12} className="text-rose-400" />
                            )}
                        </div>
                    </div>
                    <div className="text-left">
                        <p className="text-[10px] font-black text-white uppercase tracking-widest truncate max-w-[120px]">{title}</p>
                        <p className="text-[9px] font-bold text-wa-teal/80">{progress}% • {current}/{total}</p>
                    </div>
                    <Maximize2 size={14} className="text-white/40 group-hover:text-white" />
                </motion.button>
            </div>
        );
    }

    // ... Minimized Bubble UI (kept similar) ...

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-gray-900/60 backdrop-blur-xl"
                    onClick={status !== 'processing' ? onClose : undefined}
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 30 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 30 }}
                    className="relative w-full max-w-2xl max-h-[92vh] bg-white rounded-[3rem] shadow-[0_32px_128px_-16px_rgba(0,0,0,0.3)] overflow-hidden flex flex-col border border-white/20"
                >
                    <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-wa-teal via-emerald-400 to-wa-teal animate-gradient-x z-20" />

                    <div className="px-8 py-3.5 flex justify-between items-center bg-gradient-to-b from-gray-50/5 to-transparent border-b border-gray-100/50">
                        <div className="flex items-center gap-4">
                            <motion.div
                                animate={status === 'processing' ? { scale: [1, 1.05, 1], boxShadow: ["0 0 0px 0px rgba(18, 140, 126, 0)", "0 0 20px 5px rgba(18, 140, 126, 0.1)", "0 0 0px 0px rgba(18, 140, 126, 0)"] } : {}}
                                transition={{ repeat: Infinity, duration: 2.5 }}
                                className={`p-3 rounded-2xl shadow-xl ${status === 'completed' ? 'bg-emerald-500' : status === 'failed' ? 'bg-rose-500' : 'bg-wa-teal'} text-white`}
                            >
                                {status === 'processing' ? <Activity className="animate-pulse" size={20} /> : status === 'completed' ? <CheckCircle2 size={20} /> : <AlertCircle size={20} />}
                            </motion.div>
                            <div>
                                <h3 className="text-lg font-black text-gray-900 leading-none">{title}</h3>
                                <div className="flex items-center gap-2 mt-1.5">
                                    <div className="flex items-center gap-1.5 bg-gray-100 px-2.5 py-1 rounded-xl border border-gray-200">
                                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{current} / {total}</p>
                                    </div>
                                    {isScheduled && status === 'processing' && (
                                        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded-xl">
                                            <span className="text-[8px] font-black text-indigo-400 uppercase">Speed</span>
                                            <input
                                                type="range" min="0.5" max="5" step="0.5"
                                                value={speedMultiplier}
                                                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                                                className="w-16 h-1 bg-gray-200 rounded-full appearance-none cursor-pointer accent-indigo-500"
                                            />
                                            <span className="text-[9px] font-mono font-bold text-indigo-600">{speedMultiplier}x</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsMinimized(true)} className="p-2 border border-gray-100 rounded-xl text-gray-400 hover:text-gray-600 shadow-sm"><Minimize2 size={16} /></button>
                            {status !== 'processing' && <button onClick={onClose} className="p-2 border border-gray-100 rounded-xl text-gray-400 hover:text-rose-600 shadow-sm"><X size={18} /></button>}
                        </div>
                    </div>

                    <div className="px-8 pt-10 pb-10 flex-1 overflow-y-auto custom-scrollbar flex flex-col gap-8 min-h-0">
                        {/* Stats & Visualizer (identical to before but unified) */}
                        <div className="bg-gradient-to-br from-emerald-50/50 to-white p-6 rounded-[2.5rem] border border-emerald-100/50 shadow-sm relative group">
                            <BarChart3 size={100} className="absolute -bottom-6 -right-6 text-emerald-500/5 rotate-12" />
                            <div className="grid grid-cols-3 gap-3 relative z-10">
                                <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-emerald-100/50 flex flex-col items-center justify-center gap-1">
                                    <span className="text-[9px] font-black text-wa-teal uppercase tracking-widest">Progress</span>
                                    <h4 className="text-3xl font-black text-gray-900 tracking-tighter leading-none">{progress}%</h4>
                                </div>
                                <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-emerald-100/50 flex flex-col items-center justify-center gap-1">
                                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Success</span>
                                    <h4 className="text-3xl font-black text-emerald-700 tracking-tighter leading-none">{sentCount}</h4>
                                </div>
                                <div className="bg-white/50 backdrop-blur-sm p-4 rounded-3xl border border-emerald-100/50 flex flex-col items-center justify-center gap-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">ETA</span>
                                    <span className="text-xl font-black font-mono">{etaMs > 0 ? formatETA(etaMs) : '---'}</span>
                                </div>
                            </div>
                            {/* ProgressBar */}
                            <div className="relative h-4 bg-white rounded-full overflow-hidden p-1 border border-emerald-100 shadow-inner mt-6">
                                <motion.div className="h-full rounded-full bg-gradient-to-r from-wa-teal to-emerald-400" initial={{ width: 0 }} animate={{ width: `${progress}%` }} />
                            </div>
                        </div>

                        {/* Security Layer (same as before) */}
                        {status === 'processing' && (
                            <div className="space-y-4">
                                <div className="flex items-center gap-3 px-2">
                                    <Shield size={14} className="text-amber-500 font-black" />
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.25em]">Security & Health Monitor</span>
                                </div>
                                <div className="grid grid-cols-3 gap-4">
                                    {/* Quota */}
                                    <div className="p-5 rounded-[2.5rem] bg-gray-50/80 border border-gray-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <Zap size={14} className="text-emerald-600" />
                                            <span className="text-[9px] font-black uppercase text-emerald-600">Quota</span>
                                        </div>
                                        <div className="flex justify-between items-end">
                                            <span className="text-xl font-black text-gray-900">{antiBan?.quota?.sent || 0}</span>
                                            <span className="text-[10px] font-bold text-gray-400">/ {antiBan?.quota?.limit || '---'}</span>
                                        </div>
                                    </div>
                                    {/* Batching */}
                                    <div className="p-5 rounded-[2.5rem] bg-gray-50/80 border border-gray-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <Layers size={14} className="text-indigo-600" />
                                            <span className="text-[9px] font-black uppercase text-indigo-600">Batching</span>
                                        </div>
                                        <span className="text-xl font-black text-gray-900">
                                            {statusDetail === 'batch_break' ? <span className="text-amber-600 animate-pulse">{formatETA(timeLeftInBreak)}</span> : (antiBan?.batchProgress ? `${antiBan.batchProgress.current}/${antiBan.batchProgress.total}` : 'Active')}
                                        </span>
                                    </div>
                                    {/* Jitter */}
                                    <div className="p-5 rounded-[2.5rem] bg-gray-50/80 border border-gray-100">
                                        <div className="flex justify-between items-center mb-2">
                                            <Cpu size={14} className="text-amber-600" />
                                            <span className="text-[9px] font-black uppercase text-amber-600">Jitter</span>
                                        </div>
                                        <span className="text-xl font-black text-gray-900">
                                            {statusDetail === 'jitter_wait' ? <span className="text-wa-teal">{(timeLeftInJitter / 1000).toFixed(1)}s</span> : (antiBan?.jitter?.current || 'Active')}
                                        </span>
                                    </div>
                                </div>

                                {/* Live Content Update Interface */}
                                <div className="bg-gray-900 rounded-[2.5rem] p-6 border border-gray-800 shadow-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-wa-teal/5 blur-3xl rounded-full -mr-16 -mt-16 pointer-events-none" />
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2">
                                            <MessageSquare size={14} className="text-wa-teal" />
                                            <span className="text-[10px] font-black text-wa-teal/80 uppercase tracking-widest">Live Campaign Message</span>
                                        </div>
                                        {!isEditingContent ? (
                                            <button
                                                onClick={() => setIsEditingContent(true)}
                                                className="text-[9px] font-black text-gray-400 hover:text-wa-teal uppercase tracking-widest transition-colors flex items-center gap-1 bg-white/5 px-2 py-1 rounded-lg border border-white/10"
                                            >
                                                Edit Live
                                            </button>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => setIsEditingContent(false)}
                                                    className="text-[9px] font-black text-rose-400 hover:text-rose-500 uppercase tracking-widest transition-all bg-rose-500/5 px-2 py-1 rounded-lg border border-rose-500/10"
                                                >
                                                    Discard & Close
                                                </button>
                                                {isSaving && (
                                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                                                        <Loader2 size={10} className="animate-spin text-emerald-400" />
                                                        <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">Saving...</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {isEditingContent ? (
                                        <div className="space-y-3">
                                            <textarea
                                                className="w-full bg-black/30 border border-white/10 rounded-2xl p-4 text-xs text-gray-300 font-medium leading-relaxed resize-none h-24 focus:border-wa-teal/30 outline-none custom-scrollbar"
                                                value={liveContent}
                                                onChange={(e) => setLiveContent(e.target.value)}
                                                placeholder="Update message content..."
                                            />
                                            <div className="flex justify-between items-center text-[8px] font-bold text-gray-500 uppercase">
                                                <span>Variables will be auto-replaced</span>
                                                <span>{liveContent.length} chars</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-black/20 rounded-2xl p-4 border border-white/5">
                                            <p className="text-xs text-gray-400 font-medium leading-relaxed line-clamp-2">
                                                {liveContent || 'No message content provided...'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Tabs (Logs vs Recipients) */}
                        <div className="flex flex-col flex-1 min-h-[400px]">
                            <div className="flex bg-gray-100/50 p-1.5 rounded-2xl gap-1 mb-4 border border-gray-200/50">
                                <button onClick={() => setActiveTab('logs')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'logs' ? 'bg-white text-wa-teal shadow-md shadow-wa-teal/5' : 'text-gray-400'}`}>Terminal</button>
                                <button onClick={() => setActiveTab('contacts')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'contacts' ? 'bg-white text-wa-teal shadow-md shadow-wa-teal/5' : 'text-gray-400'}`}>Recipients {recipients && recipients.length > 0 && `(${recipients.length})`}</button>
                            </div>
                            <div className="flex-1 min-h-0">
                                {activeTab === 'logs' ? (
                                    <div className="h-full bg-gray-950 rounded-[2.5rem] border border-gray-800 shadow-2xl overflow-hidden flex flex-col font-mono text-[11px]">

                                        <div
                                            ref={logContainerRef}
                                            onScroll={handleScroll}
                                            onWheel={handleUserInteraction}
                                            onTouchStart={handleUserInteraction}
                                            className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-4 relative"
                                        >
                                            <AnimatePresence>
                                                {hasNewLogs && (
                                                    <motion.button
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: 10 }}
                                                        onClick={scrollToBottom}
                                                        className="absolute bottom-6 right-8 z-30 bg-wa-teal text-white px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 text-[10px] font-black uppercase tracking-widest border border-white/20 hover:scale-105 active:scale-95 transition-transform"
                                                    >
                                                        <ChevronDown size={14} className="animate-bounce" />
                                                        New Logs Below
                                                    </motion.button>
                                                )}
                                            </AnimatePresence>

                                            {logs.map((log, i) => (
                                                <motion.div
                                                    initial={{ opacity: 0, x: -5 }}
                                                    animate={{ opacity: 1, x: 0 }}
                                                    key={log.id}
                                                    className="mb-2 flex gap-3 opacity-90 transition-opacity hover:opacity-100 group"
                                                >
                                                    <span className="text-gray-700 select-none group-hover:text-wa-teal transition-colors">{(i + 1).toString().padStart(3, '0')}</span>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-500 text-[9px]">[{log.timestamp}]</span>
                                                            <span className={`font-black text-[9px] uppercase px-1.5 py-0.5 rounded ${log.type === 'error' ? 'bg-rose-500/10 text-rose-400' : log.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-indigo-500/10 text-indigo-300'}`}>{log.type}</span>
                                                        </div>
                                                        <p className="text-gray-300 mt-1 leading-relaxed">{log.message}</p>
                                                    </div>
                                                </motion.div>
                                            ))}
                                            {statusDetail !== 'active' && status === 'processing' && (
                                                <div className="mb-2 flex gap-3 opacity-100 border-l-2 border-amber-500/50 pl-3 -ml-[1px]">
                                                    <span className="text-amber-500/50 select-none animate-pulse">WAIT</span>
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-gray-500">[{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                                            <span className="font-bold uppercase text-amber-400">PENDING</span>
                                                        </div>
                                                        <p className="text-amber-200 mt-0.5 leading-relaxed font-bold">
                                                            {statusDetail === 'batch_break' ? `Anti-Ban Rest: ${formatETA(timeLeftInBreak)}`
                                                                : statusDetail === 'window_wait' ? `Window Wait: ${formatETA(timeLeftInWindow)}`
                                                                    : statusDetail === 'jitter_wait' ? `Human Simulation: ${(timeLeftInJitter / 1000).toFixed(1)}s`
                                                                        : 'System Pulse: Cooling...'}
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                            {status === 'processing' && <motion.span animate={{ opacity: [1, 0] }} transition={{ repeat: Infinity, duration: 0.8 }} className="text-emerald-500 ml-11">█</motion.span>}
                                            <div ref={logEndRef} />
                                        </div>
                                    </div>
                                ) : (
                                    <div className="h-full bg-gray-50/50 rounded-[2.5rem] border border-gray-100 p-6 overflow-y-auto custom-scrollbar">
                                        {(!recipients || recipients.length === 0) ? (
                                            <div className="h-full flex flex-col items-center justify-center opacity-30 italic text-sm">No recipients recorded yet...</div>
                                        ) : (
                                            <div className="space-y-3">
                                                {recipients.map((r, i) => (
                                                    <div key={i} className="bg-white p-4 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${r.status === 'success' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-500'}`}>
                                                                {r.status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                                                            </div>
                                                            <div>
                                                                <p className="font-black text-gray-800 text-sm">{r.name}</p>
                                                                <p className="text-[10px] font-bold text-gray-400">{r.phone}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-lg ${r.status === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{r.status}</span>
                                                            <p className="text-[8px] text-gray-300 mt-1 font-bold">{new Date(r.timestamp).toLocaleTimeString()}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex items-center justify-center gap-4">
                        {status === 'processing' ? (
                            <div className="flex gap-4 w-full max-w-sm">
                                {(() => {
                                    console.log(`[ProcessModal Debug] statusDetail: ${statusDetail}, executionState: ${executionState}`);
                                    return (statusDetail === 'paused' || executionState === 'paused') ? (
                                        <button onClick={handleResume} className="flex-[2] py-3 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100">Resume</button>
                                    ) : (
                                        <button onClick={handlePause} className="flex-[2] py-3 bg-amber-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-100">Pause</button>
                                    );
                                })()}
                                <button onClick={handleStop} className="flex-1 py-3 bg-white border border-rose-100 text-rose-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-colors">Stop</button>
                            </div>
                        ) : (
                            <button onClick={onClose} className="w-full max-w-sm py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl">Close Terminal</button>
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};

export default ProcessModal;
