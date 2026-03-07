import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock, ChevronDown, XCircle, Loader2, Pause, Play, Zap, Info,
    CheckCircle2, AlertCircle, History, ChevronRight, Terminal,
    Send, AlertTriangle, Trash2
} from 'lucide-react';
import { ScheduledCampaign } from './types';
import { Socket } from 'socket.io-client';
import CampaignDetailsModal from './CampaignDetailsModal';
import ConfirmationModal from '../common/ConfirmationModal';

interface ScheduledQueueProps {
    showScheduleQueue: boolean;
    setShowScheduleQueue: (show: boolean) => void;
    socket: Socket | null;
    scheduledCampaigns: ScheduledCampaign[];
    onPause: (id: number) => Promise<void>;
    onResume: (id: number) => Promise<void>;
    onCancel: (id: number) => Promise<void>;
    campaignExecution?: any; // live execution state from parent
}

interface HistoryCampaign {
    id: number;
    name: string;
    status: string;
    sent_count: number;
    fail_count: number;
    total_recipients: number;
    scheduled_at: string;
    target_name?: string;
    message?: string;
    target_type?: string;
}

const formatCountdown = (targetDate: string) => {
    const total = Date.parse(targetDate) - Date.now();
    if (total <= 0) return 'Starting...';
    const seconds = Math.floor((total / 1000) % 60);
    const minutes = Math.floor((total / 1000 / 60) % 60);
    const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0 || hours > 0) parts.push(`${minutes}m`);
    parts.push(`${seconds}s`);
    return parts.join(' ');
};

type TabType = 'queue' | 'history';

const ScheduledQueue: React.FC<ScheduledQueueProps> = ({
    showScheduleQueue, setShowScheduleQueue, socket, scheduledCampaigns,
    onPause, onResume, onCancel, campaignExecution
}) => {
    const [isActioning, setIsActioning] = useState<number | null>(null);
    const [now, setNow] = useState(Date.now());
    const [activeTab, setActiveTab] = useState<TabType>('queue');
    const [historyData, setHistoryData] = useState<HistoryCampaign[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState<number | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState<HistoryCampaign | null>(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        campaignId: number | null;
        title: string;
        message: string;
    }>({
        isOpen: false,
        campaignId: null,
        title: '',
        message: ''
    });

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Fetch history whenever tab switches to history
    const fetchHistory = async () => {
        setHistoryLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/campaigns/scheduled?all=true');
            const data = await res.json();
            if (data.campaigns) {
                const done = data.campaigns.filter((c: any) =>
                    c.status === 'completed' || c.status === 'failed' || c.status === 'cancelled'
                );
                setHistoryData(done.reverse());
            }
        } catch (err) {
            console.error('Failed to load campaign history', err);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        if (showScheduleQueue && activeTab === 'history') {
            fetchHistory();
        }
    }, [showScheduleQueue, activeTab]);

    // Refresh history when a new execution completes
    useEffect(() => {
        if (
            campaignExecution?.status === 'completed' ||
            campaignExecution?.status === 'failed'
        ) {
            fetchHistory();
        }
    }, [campaignExecution?.status]);

    const handlePauseScheduled = async (id: number) => {
        setIsActioning(id);
        try { await onPause(id); } catch (err) { console.error(err); }
        finally { setIsActioning(null); }
    };

    const handleResumeScheduled = async (id: number) => {
        setIsActioning(id);
        try { await onResume(id); } catch (err) { console.error(err); }
        finally { setIsActioning(null); }
    };

    const handleCancelScheduled = async (id: number) => {
        const campaign = scheduledCampaigns.find(c => c.id === id);
        if (!campaign) return;

        // If running, we MUST ask for confirmation for "Force Cancel"
        if (campaign.status === 'running') {
            setConfirmModal({
                isOpen: true,
                campaignId: id,
                title: 'Force Cancel Campaign?',
                message: `The campaign "${campaign.name}" is currently running. Forcing it to stop will prevent any remaining messages from being sent. Proceed?`
            });
            return;
        }

        // Otherwise (pending/paused), proceed normally
        setIsActioning(id);
        try {
            await onCancel(id);
        } catch (err) {
            console.error(err);
        } finally {
            setIsActioning(null);
        }
    };

    const confirmForceCancel = async () => {
        const id = confirmModal.campaignId;
        if (!id) return;

        setConfirmModal(prev => ({ ...prev, isOpen: false }));
        setIsActioning(id);
        try {
            // Force Cancel: Use the unified process cancel endpoint
            const res = await fetch(`http://localhost:3001/api/processes/${id}/cancel`, { method: 'PATCH' });
            const data = await res.json();
            if (data.success) {
                // Success: HUD and Queue will sync via Socket.io automatically
            }
        } catch (err) {
            console.error('Force cancel failed:', err);
        } finally {
            setIsActioning(null);
        }
    };

    const handleDeleteHistory = async (id: number) => {
        setDeleteLoading(id);
        try {
            await fetch(`http://localhost:3001/api/campaigns/scheduled/${id}`, { method: 'DELETE' });
            setHistoryData(prev => prev.filter(c => c.id !== id));
        } catch (err) { console.error(err); }
        finally { setDeleteLoading(null); }
    };

    const pendingCount = scheduledCampaigns.filter(c => c.status === 'pending').length;
    const runningCount = scheduledCampaigns.filter(c => c.status === 'running').length;

    return (
        <>
            <motion.div
                className="glass-card bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white overflow-hidden"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
            >
                {/* Header */}
                <button
                    onClick={() => setShowScheduleQueue(!showScheduleQueue)}
                    className="w-full flex items-center justify-between p-8 hover:bg-indigo-50/30 transition-colors group"
                >
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-indigo-100 rounded-2xl text-indigo-500 group-hover:bg-indigo-200 transition-colors relative">
                            <Clock size={26} />
                            {runningCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white">
                                    <motion.span
                                        animate={{ scale: [1, 1.5, 1] }}
                                        transition={{ repeat: Infinity, duration: 1 }}
                                        className="absolute inset-0 rounded-full bg-green-400 opacity-60"
                                    />
                                </span>
                            )}
                        </div>
                        <div className="text-left">
                            <h2 className="text-2xl font-black text-gray-800">Scheduled Queue</h2>
                            <div className="flex items-center gap-3 mt-0.5">
                                {pendingCount > 0 && (
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">
                                        {pendingCount} pending
                                    </span>
                                )}
                                {runningCount > 0 && (
                                    <span className="flex items-center gap-1 text-[10px] font-bold text-green-600 uppercase tracking-widest">
                                        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                                        {runningCount} live
                                    </span>
                                )}
                                {pendingCount === 0 && runningCount === 0 && (
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                        No campaigns running
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <motion.div animate={{ rotate: showScheduleQueue ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown size={22} className="text-gray-400" />
                    </motion.div>
                </button>

                <AnimatePresence>
                    {showScheduleQueue && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            {/* Tab Switcher */}
                            <div className="px-8 pt-2 pb-4 border-t border-indigo-50">
                                <div className="flex bg-gray-100/70 rounded-2xl p-1 gap-1">
                                    <button
                                        onClick={() => setActiveTab('queue')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'queue'
                                            ? 'bg-white text-indigo-600 shadow-md'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        <Clock size={12} />
                                        Queue
                                        {scheduledCampaigns.length > 0 && (
                                            <span className="w-4 h-4 text-[9px] rounded-full bg-indigo-500 text-white flex items-center justify-center font-black">
                                                {scheduledCampaigns.length}
                                            </span>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('history')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'history'
                                            ? 'bg-white text-indigo-600 shadow-md'
                                            : 'text-gray-400 hover:text-gray-600'
                                            }`}
                                    >
                                        <History size={12} />
                                        History
                                        {historyData.length > 0 && (
                                            <span className="w-4 h-4 text-[9px] rounded-full bg-gray-400 text-white flex items-center justify-center font-black">
                                                {historyData.length}
                                            </span>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* ── Queue Tab ─────────────────────────────────────── */}
                            {activeTab === 'queue' && (
                                <div className="px-8 pb-8 space-y-3">
                                    {scheduledCampaigns.length === 0 ? (
                                        <div className="text-center py-10">
                                            <div className="w-14 h-14 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-3">
                                                <Clock size={24} className="text-indigo-300" />
                                            </div>
                                            <p className="text-gray-400 font-bold">Queue is empty</p>
                                            <p className="text-gray-300 text-xs mt-1">Schedule a campaign to see it here</p>
                                        </div>
                                    ) : (
                                        scheduledCampaigns.map(sc => {
                                            const isRunning = sc.status === 'running';
                                            const isPaused = sc.status === 'paused';

                                            // Live counts from the real-time execution state
                                            const isLive = campaignExecution?.isActive && campaignExecution?.campaignId === sc.id;
                                            const liveSent = isLive ? campaignExecution.sentCount : sc.sent_count;
                                            const liveFail = isLive ? campaignExecution.failCount : (sc.fail_count || 0);
                                            const progress = sc.total_recipients > 0 ? (liveSent / sc.total_recipients) * 100 : 0;
                                            const isExecPaused = isLive && campaignExecution?.executionState === 'paused';

                                            let adjustmentText = '';
                                            if (sc.is_adjusted && sc.original_scheduled_at) {
                                                const original = Date.parse(sc.original_scheduled_at);
                                                const current = Date.parse(sc.scheduled_at);
                                                const diffMin = Math.round((current - original) / 60000);
                                                if (diffMin !== 0) adjustmentText = `${diffMin > 0 ? '+' : ''}${diffMin}m`;
                                            }

                                            return (
                                                <div key={sc.id}
                                                    className={`p-5 rounded-3xl border transition-all group/item
                                                    ${isRunning && !isExecPaused ? 'bg-green-50/50 border-green-100 shadow-green-50 shadow-xl' :
                                                            isExecPaused ? 'bg-amber-50/50 border-amber-100' :
                                                                isPaused ? 'bg-orange-50/50 border-orange-100' :
                                                                    'bg-gray-50/50 border-gray-100/50 hover:bg-white hover:shadow-xl hover:shadow-indigo-50 hover:border-indigo-100'
                                                        }`}
                                                >
                                                    <div className="flex items-center justify-between gap-4">
                                                        <div className="flex items-center gap-4 flex-1 min-w-0">
                                                            {/* Status Indicator */}
                                                            <div className="relative flex-shrink-0">
                                                                <div className={`w-1.5 h-12 rounded-full ${isRunning && !isExecPaused ? 'bg-green-400 animate-pulse' :
                                                                    isExecPaused ? 'bg-amber-400' :
                                                                        isPaused ? 'bg-orange-400' : 'bg-indigo-400'
                                                                    }`} />
                                                                {isRunning && !isExecPaused && (
                                                                    <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-20" />
                                                                )}
                                                            </div>

                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                                    <p className="font-black text-gray-800 truncate">{sc.name}</p>
                                                                    {isPaused && !isExecPaused && (
                                                                        <span className="px-2 py-0.5 bg-orange-100 text-orange-600 text-[8px] font-black uppercase rounded-full shrink-0">Paused</span>
                                                                    )}
                                                                    {isRunning && !isExecPaused && (
                                                                        <span className="px-2 py-0.5 bg-green-100 text-green-600 text-[8px] font-black uppercase rounded-full shrink-0 flex items-center gap-1">
                                                                            <Zap size={8} fill="currentColor" /> Live
                                                                        </span>
                                                                    )}
                                                                    {isExecPaused && (
                                                                        <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-black uppercase rounded-full shrink-0">⏸ Exec Paused</span>
                                                                    )}
                                                                    {adjustmentText && (
                                                                        <span className="px-2 py-0.5 bg-indigo-100 text-indigo-600 text-[8px] font-black uppercase rounded-full shrink-0 flex items-center gap-1"
                                                                            title={`Original: ${new Date(sc.original_scheduled_at!).toLocaleTimeString()}`}>
                                                                            <Info size={8} /> {adjustmentText}
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                <div className="flex items-center gap-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider flex-wrap">
                                                                    <span className="flex items-center gap-1 text-indigo-500">
                                                                        <Clock size={9} />
                                                                        {new Date(sc.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                    {!isRunning && !isPaused && (
                                                                        <span>In <span className="text-gray-600">{formatCountdown(sc.scheduled_at)}</span></span>
                                                                    )}
                                                                    {(isRunning || isPaused) && (
                                                                        <>
                                                                            <span className="text-emerald-600 flex items-center gap-1">
                                                                                <Send size={9} /> {liveSent} sent
                                                                            </span>
                                                                            {liveFail > 0 && (
                                                                                <span className="text-rose-500 flex items-center gap-1">
                                                                                    <AlertTriangle size={9} /> {liveFail} fail
                                                                                </span>
                                                                            )}
                                                                            <span className="text-gray-400">/ {sc.total_recipients}</span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Action Buttons */}
                                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                                            {isPaused && !isExecPaused ? (
                                                                <button onClick={() => handleResumeScheduled(sc.id)} disabled={isActioning === sc.id}
                                                                    className="p-3 text-indigo-600 hover:bg-indigo-50 rounded-2xl transition-all disabled:opacity-50 active:scale-90" title="Resume">
                                                                    {isActioning === sc.id ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} fill="currentColor" />}
                                                                </button>
                                                            ) : !isRunning && (
                                                                <button onClick={() => handlePauseScheduled(sc.id)} disabled={isActioning === sc.id}
                                                                    className="p-3 text-orange-500 hover:bg-orange-50 rounded-2xl transition-all disabled:opacity-50 active:scale-90" title="Pause">
                                                                    {isActioning === sc.id ? <Loader2 size={18} className="animate-spin" /> : <Pause size={18} fill="currentColor" />}
                                                                </button>
                                                            )}
                                                            <button onClick={() => handleCancelScheduled(sc.id)} disabled={isActioning === sc.id}
                                                                className="p-3 text-gray-300 hover:bg-red-50 hover:text-red-500 rounded-2xl transition-all disabled:opacity-50 active:scale-90" title="Cancel">
                                                                <XCircle size={18} />
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Live Progress Bar */}
                                                    {isRunning && (
                                                        <div className="mt-4 space-y-1.5">
                                                            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                                                <motion.div
                                                                    className={`h-full rounded-full ${isExecPaused ? 'bg-amber-400' : 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.3)]'}`}
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: `${progress}%` }}
                                                                    transition={{ duration: 0.5 }}
                                                                />
                                                            </div>
                                                            <div className="flex justify-between text-[9px] font-mono text-gray-400">
                                                                <span>{Math.round(progress)}% complete</span>
                                                                <span>{sc.total_recipients - liveSent - liveFail} remaining</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}

                            {/* ── History Tab ───────────────────────────────────── */}
                            {activeTab === 'history' && (
                                <div className="px-8 pb-8 space-y-3">
                                    {historyLoading ? (
                                        <div className="flex items-center justify-center py-10">
                                            <Loader2 size={22} className="animate-spin text-indigo-400" />
                                        </div>
                                    ) : historyData.length === 0 ? (
                                        <div className="text-center py-10">
                                            <div className="w-14 h-14 bg-gray-50 rounded-3xl flex items-center justify-center mx-auto mb-3">
                                                <History size={24} className="text-gray-300" />
                                            </div>
                                            <p className="text-gray-400 font-bold">No history yet</p>
                                            <p className="text-gray-300 text-xs mt-1">Completed campaigns will appear here</p>
                                        </div>
                                    ) : (
                                        historyData.map(c => {
                                            const isCompleted = c.status === 'completed';
                                            const isFailed = c.status === 'failed';
                                            const isCancelled = c.status === 'cancelled';
                                            // Execution Progress: total attempted vs total requested
                                            const tried = (c.sent_count || 0) + (c.fail_count || 0);
                                            const execProgress = c.total_recipients > 0
                                                ? Math.min(100, Math.round((tried / c.total_recipients) * 100))
                                                : (isCompleted || isFailed) ? 100 : 0;

                                            // Success Rate: sent vs. total requested (the original goal)
                                            const successRate = c.total_recipients > 0
                                                ? Math.round(((c.sent_count || 0) / c.total_recipients) * 100)
                                                : tried > 0 ? Math.round(((c.sent_count || 0) / tried) * 100) : 0;

                                            return (
                                                <div key={c.id}
                                                    onClick={() => {
                                                        setSelectedCampaign(c);
                                                        setIsDetailsModalOpen(true);
                                                    }}
                                                    className={`p-5 rounded-3xl border transition-all group/hist cursor-pointer active:scale-[0.98]
                                                    ${isCompleted ? 'bg-emerald-50/40 border-emerald-100 hover:bg-emerald-50' :
                                                            isFailed ? 'bg-rose-50/40 border-rose-100 hover:bg-rose-50' :
                                                                'bg-gray-50 border-gray-100 hover:bg-white hover:shadow-xl hover:shadow-gray-200/50'
                                                        }`}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                                            <div className={`w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0
                                                            ${isCompleted ? 'bg-emerald-100' : isFailed ? 'bg-rose-100' : 'bg-gray-100'}`}>
                                                                {isCompleted ? <CheckCircle2 size={16} className="text-emerald-600" /> :
                                                                    isFailed ? <AlertCircle size={16} className="text-rose-500" /> :
                                                                        <XCircle size={16} className="text-gray-400" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className="font-black text-gray-800 truncate text-sm">{c.name}</p>
                                                                <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                                                                    {new Date(c.scheduled_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                                                                    {' · '}
                                                                    {new Date(c.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteHistory(c.id);
                                                            }}
                                                            disabled={deleteLoading === c.id}
                                                            className="p-2 text-gray-300 hover:text-rose-400 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover/hist:opacity-100"
                                                        >
                                                            {deleteLoading === c.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                                                        </button>
                                                    </div>

                                                    {/* Stats row */}
                                                    <div className="mt-3 flex items-center gap-3 flex-wrap">
                                                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-100/60 rounded-xl">
                                                            <Send size={9} className="text-emerald-600" />
                                                            <span className="text-[10px] font-black text-emerald-700">{c.sent_count} sent</span>
                                                        </div>
                                                        {(c.fail_count || 0) > 0 && (
                                                            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-100/60 rounded-xl">
                                                                <AlertTriangle size={9} className="text-rose-500" />
                                                                <span className="text-[10px] font-black text-rose-600">{c.fail_count} failed</span>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-xl">
                                                            <span className="text-[10px] font-black text-gray-500">{successRate}% success rate</span>
                                                        </div>
                                                        {isCancelled && (
                                                            <div className="px-2.5 py-1 bg-gray-100 rounded-xl">
                                                                <span className="text-[10px] font-black text-gray-400 uppercase">Cancelled</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Progress fill bar */}
                                                    <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full ${isCompleted ? 'bg-emerald-400' : isFailed ? 'bg-rose-400' : 'bg-gray-400'}`}
                                                            style={{ width: `${execProgress}%`, transition: 'width 0.6s ease' }}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            <CampaignDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                campaign={selectedCampaign}
                executionData={campaignExecution}
                onPause={onPause}
                onResume={onResume}
                onCancel={onCancel}
            />

            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={confirmForceCancel}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText="Stop Campaign"
                type="danger"
                isLoading={isActioning === confirmModal.campaignId}
            />
        </>
    );
};

export default ScheduledQueue;
