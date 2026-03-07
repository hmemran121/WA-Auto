import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Clock,
    Play,
    Pause,
    X,
    Target,
    AlertCircle,
    ChevronRight,
    Info,
    Terminal,
    CheckCircle2,
    Timer,
    AlertTriangle,
    Minimize2,
    Maximize2,
    StopCircle,
    Edit3,
    Check,
    Wifi,
    WifiOff,
    RefreshCw,
    Shield,
    Activity,
    Cpu,
    Zap,
    BarChart3,
    Layers,
    MessageSquare,
    Users,
    Send,
} from 'lucide-react';
import { ScheduledCampaign } from './types';
import ConfirmationModal from '../common/ConfirmationModal';

// ... (ExecutionHUD remains mostly similar but I'll update the main component below)
// I'll re-implement the main component parts to include SVG and Edit UI


interface Props {
    campaigns: ScheduledCampaign[];
    onPause: (id: number) => void;
    onResume: (id: number, additionalMinutes?: number) => void;
    onCancel: (id: number) => void;
}

function formatCountdown(targetDate: string): string {
    const total = Date.parse(targetDate) - Date.now();
    if (total <= 0) return 'Starting...';
    const s = Math.floor((total / 1000) % 60);
    const m = Math.floor((total / 1000 / 60) % 60);
    const h = Math.floor((total / (1000 * 60 * 60)) % 24);
    const parts: string[] = [];
    if (h > 0) parts.push(`${h}h`);
    parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
}

function formatETA(ms: number): string {
    if (ms <= 0) return '<1s';
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

const updateCampaign = (id: number, data: { message?: string, scheduled_at?: string }) =>
    fetch(`http://localhost:3001/api/campaigns/scheduled/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

// --- Sound Assets (Subtle UI Pings) ---
const playSuccessSound = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/1435/1435-preview.mp3');
    audio.volume = 0.15;
    audio.play().catch(() => { });
};
const playErrorSound = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2864/2864-preview.mp3');
    audio.volume = 0.2;
    audio.play().catch(() => { });
};
const playCampaignDoneSound = () => {
    const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');
    audio.volume = 0.3;
    audio.play().catch(() => { });
};

// --- Particle Animation Component ---

// ─── Main Component ────────────────────────────────────────────────────────────
const ScheduledCountdownManager: React.FC<Props> = ({
    campaigns, onPause, onResume, onCancel
}) => {
    const [isMinimized, setIsMinimized] = useState(false);
    const [currentTime, setCurrentTime] = useState(Date.now());
    const [isEditing, setIsEditing] = useState(false);
    const [editMessage, setEditMessage] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);
    const [showConfirmCancel, setShowConfirmCancel] = useState(false);
    const [preFlightStatus, setPreFlightStatus] = useState<'idle' | 'checking' | 'warning' | 'error' | 'ok'>('idle');
    const [preFlightError, setPreFlightError] = useState<string | null>(null);
    const [recoveryAlert, setRecoveryAlert] = useState<{ id: number, name: string } | null>(null);
    const preFlightChecked = useRef(false);

    const isExecuting = false;

    useEffect(() => {
        const t = setInterval(() => setCurrentTime(Date.now()), 1000);
        return () => clearInterval(t);
    }, []);



    const activeCampaign = campaigns.find(
        c => c.status === 'pending' || c.status === 'paused'
    );

    useEffect(() => {
        if (activeCampaign) {
            setEditMessage(activeCampaign.message || '');
        }
    }, [activeCampaign?.id]);

    const msUntil = activeCampaign ? Date.parse(activeCampaign.scheduled_at) - currentTime : Infinity;
    const isUrgent = !isExecuting && msUntil > 0 && msUntil <= 2 * 60 * 1000;

    // Pre-flight Trigger (10s before)
    useEffect(() => {
        if (!isExecuting && activeCampaign && msUntil > 0 && msUntil <= 10000 && !preFlightChecked.current) {
            preFlightChecked.current = true;
            runPreFlight();
        }
        if (msUntil > 15000) preFlightChecked.current = false; // Reset if time moved back
    }, [msUntil, isExecuting, activeCampaign]);

    const runPreFlight = async () => {
        setPreFlightStatus('checking');
        setPreFlightError(null);
        try {
            const res = await fetch('http://localhost:3001/api/system/status');
            const data = await res.json();
            if (data.success) {
                if (data.whatsapp === 'ready') {
                    setPreFlightStatus('ok');
                } else if (data.whatsapp === 'qr' || data.whatsapp === 'initial') {
                    setPreFlightStatus('error');
                    setPreFlightError('WhatsApp is not connected. Launch may fail.');
                } else {
                    setPreFlightStatus('warning');
                    setPreFlightError(`WhatsApp is in state: ${data.whatsapp}`);
                }
            }
        } catch (e) {
            setPreFlightStatus('error');
            setPreFlightError('Could not reach backend for system check.');
        }
        // Auto-clear success after 5s, keep errors
        setTimeout(() => setPreFlightStatus(prev => prev === 'ok' ? 'idle' : prev), 5000);
    };

    // Overlap Detection
    const otherCampaigns = campaigns.filter(c => c.id !== activeCampaign?.id && c.status === 'pending');
    const overlapCampaign = activeCampaign ? otherCampaigns.find(c => {
        const diff = Math.abs(Date.parse(c.scheduled_at) - Date.parse(activeCampaign.scheduled_at));
        return diff < 5 * 60 * 1000;
    }) : null;


    if (!activeCampaign) return null;

    const handleSuggestDelay = async () => {
        if (!activeCampaign) return;
        const newTime = new Date(Date.parse(activeCampaign.scheduled_at) + 5 * 60 * 1000).toISOString();
        setIsUpdating(true);
        try {
            await updateCampaign(activeCampaign.id, { scheduled_at: newTime });
        } catch (e) { console.error(e); }
        finally { setIsUpdating(false); }
    };

    const handleSaveEdit = async () => {
        if (!activeCampaign) return;
        setIsUpdating(true);
        try {
            await updateCampaign(activeCampaign.id, { message: editMessage });
            setIsEditing(false);
        } catch (e) { console.error(e); }
        finally { setIsUpdating(false); }
    };

    // Floating Status Pill removed - functionality migrated to ProcessModal bubble

    // SVG Ring Logic
    const totalDuration = activeCampaign ? (Date.parse(activeCampaign.scheduled_at) - (activeCampaign.created_at ? Date.parse(activeCampaign.created_at) : (Date.parse(activeCampaign.scheduled_at) - 10 * 60 * 1000))) : 600000;
    const remainingMs = Math.max(0, msUntil);
    const circleProgress = Math.min(100, (remainingMs / totalDuration) * 100);
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const offset = (circleProgress / 100) * circumference;

    let ringColor = 'stroke-emerald-400';
    if (remainingMs < 10000) ringColor = 'stroke-rose-500';
    else if (remainingMs < 60000) ringColor = 'stroke-amber-400';

    // ── Full Popup ─────────────────────────────────────────────────────────────
    return (
        <div className="fixed bottom-6 right-6 z-[90]">
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                    className={`relative w-[380px] bg-white/95 backdrop-blur-3xl rounded-[2.5rem] shadow-[0_24px_64px_-12px_rgba(0,0,0,0.25)] border overflow-hidden border-white/50
                        ${isUrgent ? 'border-rose-200 shadow-rose-100' : ''}
                    `}
                >

                    {/* Pre-flight / System Status Banner */}
                    <AnimatePresence>
                        {preFlightStatus !== 'idle' && !isExecuting && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className={`px-6 py-2 flex items-center justify-between gap-3 border-b text-[10px] font-bold uppercase tracking-widest
                                    ${preFlightStatus === 'checking' ? 'bg-indigo-50 border-indigo-100 text-indigo-500' : ''}
                                    ${preFlightStatus === 'ok' ? 'bg-emerald-50 border-emerald-100 text-emerald-500' : ''}
                                    ${preFlightStatus === 'warning' ? 'bg-amber-50 border-amber-100 text-amber-600' : ''}
                                    ${preFlightStatus === 'error' ? 'bg-rose-50 border-rose-100 text-rose-500' : ''}
                                `}
                            >
                                <div className="flex items-center gap-2">
                                    {preFlightStatus === 'checking' && <RefreshCw size={12} className="animate-spin" />}
                                    {preFlightStatus === 'ok' && <Wifi size={12} />}
                                    {(preFlightStatus === 'warning' || preFlightStatus === 'error') && <WifiOff size={12} />}
                                    <span>{preFlightStatus === 'checking' ? 'System Check...' : (preFlightError || 'System Ready')}</span>
                                </div>
                                {preFlightStatus === 'error' && (
                                    <button onClick={runPreFlight} className="text-rose-600 hover:underline">Retry</button>
                                )}
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Recovery Mode Overlay */}
                    <AnimatePresence>
                        {recoveryAlert && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 z-[60] bg-[#0a0f0d]/90 backdrop-blur-md flex items-center justify-center p-8"
                            >
                                <motion.div
                                    initial={{ scale: 0.9, y: 20 }}
                                    animate={{ scale: 1, y: 0 }}
                                    className="bg-zinc-900 border border-emerald-500/30 rounded-[2.5rem] p-8 shadow-2xl w-full text-center"
                                >
                                    <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-emerald-500/20">
                                        <RefreshCw size={32} className="text-emerald-500" />
                                    </div>
                                    <h3 className="text-white font-black text-lg mb-2">Recovery Alert</h3>
                                    <p className="text-zinc-400 text-xs leading-relaxed mb-8">
                                        A campaign execution was detected running in the background. Would you like to re-attach the progress tracker?
                                    </p>
                                    <div className="flex flex-col gap-3">
                                        <button
                                            onClick={() => {
                                                setRecoveryAlert(null);
                                                window.location.reload(); // Force refresh to sync socket
                                            }}
                                            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-lg shadow-emerald-900/40"
                                        >
                                            Re-attach HUD
                                        </button>
                                        <button
                                            onClick={() => setRecoveryAlert(null)}
                                            className="w-full py-3 bg-white/5 hover:bg-white/10 text-zinc-500 rounded-2xl font-black text-[10px] uppercase tracking-wider transition-all"
                                        >
                                            Dismiss
                                        </button>
                                    </div>
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* Countdown Phase */}
                    {!isExecuting && activeCampaign && (
                        <>
                            <div className={`absolute top-0 left-0 w-full h-1 ${isUrgent ? 'bg-gradient-to-r from-rose-400 via-orange-400 to-rose-400 animate-pulse' : 'bg-gradient-to-r from-indigo-400 via-violet-400 to-indigo-400'}`} />
                            <div className="p-7">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-3 rounded-2xl shadow-lg ${isUrgent ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-indigo-500 text-white shadow-indigo-200'}`}>
                                            <Clock size={20} />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Launching Soon</p>
                                            <h3 className="text-base font-black text-gray-800 leading-tight truncate">{activeCampaign.name}</h3>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => setIsEditing(!isEditing)} className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400" title="Edit Message">
                                            <Edit3 size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Overlap Warning */}
                                {overlapCampaign && !isEditing && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        className="mb-4 p-3 bg-amber-50 border border-amber-100 rounded-2xl flex items-center justify-between gap-3"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                                            <p className="text-[10px] font-bold text-amber-700 leading-tight truncate">
                                                Schedule overlap with "{overlapCampaign.name}"
                                            </p>
                                        </div>
                                        <button
                                            onClick={handleSuggestDelay}
                                            disabled={isUpdating}
                                            className="px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-800 rounded-lg text-[9px] font-black uppercase tracking-wider shrink-0"
                                        >
                                            {isUpdating ? '...' : '+5m'}
                                        </button>
                                    </motion.div>
                                )}

                                {/* Humanized Countdown with SVG Ring */}
                                <div className="relative flex justify-center items-center mb-6">
                                    <svg className="w-48 h-48 -rotate-90">
                                        <circle cx="96" cy="96" r={radius} className="stroke-gray-100 fill-transparent" strokeWidth="8" />
                                        <motion.circle
                                            cx="96" cy="96" r={radius}
                                            className={`fill-transparent transition-colors duration-500 ${ringColor}`}
                                            strokeWidth="8"
                                            strokeDasharray={circumference}
                                            animate={{ strokeDashoffset: offset }}
                                            transition={{ duration: 1, ease: "linear" }}
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                        {isUrgent && (
                                            <motion.div
                                                animate={{ scale: [1, 1.1, 1] }}
                                                transition={{ repeat: Infinity, duration: 2 }}
                                                className="flex items-center justify-center gap-1.5 text-rose-500 text-[9px] font-black uppercase tracking-widest mb-1"
                                            >
                                                Launching
                                            </motion.div>
                                        )}
                                        <p className={`${formatCountdown(activeCampaign.scheduled_at) === 'Starting...' ? 'text-xl' : 'text-4xl'} font-black tracking-tighter tabular-nums ${isUrgent ? 'text-rose-600' : 'text-indigo-600'}`}>
                                            {activeCampaign.status === 'paused' ? '—' : formatCountdown(activeCampaign.scheduled_at)}
                                        </p>
                                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                            {activeCampaign.status === 'paused'
                                                ? 'Campaign Paused'
                                                : new Date(activeCampaign.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>

                                {/* Inline Editing UI */}
                                <AnimatePresence>
                                    {isEditing && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="mb-5 space-y-2 overflow-hidden"
                                        >
                                            <div className="relative">
                                                <textarea
                                                    value={editMessage}
                                                    onChange={(e) => setEditMessage(e.target.value)}
                                                    className="w-full h-24 p-4 bg-gray-50 border border-indigo-100 rounded-2xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-700 resize-none"
                                                    placeholder="Edit message..."
                                                />
                                                <div className="absolute bottom-3 right-3 flex gap-1">
                                                    <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 bg-gray-200 text-gray-600 rounded-xl text-[10px] font-black uppercase">Cancel</button>
                                                    <button
                                                        onClick={handleSaveEdit}
                                                        disabled={isUpdating}
                                                        className="px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase flex items-center gap-1"
                                                    >
                                                        {isUpdating ? '...' : <><Check size={12} /> Save</>}
                                                    </button>
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                <div className="mb-6">
                                    <p className="text-xs text-gray-500 font-medium flex items-center gap-2">
                                        <Target size={12} className="text-indigo-400" />
                                        {activeCampaign.target_name || 'Recipients'}
                                        <span className="w-1 h-1 rounded-full bg-gray-300" />
                                        {activeCampaign.total_recipients} Contacts
                                    </p>
                                </div>

                                <div className="flex gap-2">
                                    {activeCampaign.status === 'paused' ? (
                                        <>
                                            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                                onClick={() => onResume(activeCampaign.id)}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-50 hover:bg-green-100 text-green-600 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border border-green-100">
                                                <Play size={14} /> Resume
                                            </motion.button>
                                            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                                onClick={() => setShowConfirmCancel(true)}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border border-red-100">
                                                <X size={14} /> Cancel
                                            </motion.button>
                                        </>
                                    ) : (
                                        <>
                                            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                                onClick={() => onPause(activeCampaign.id)}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border border-orange-100">
                                                <Pause size={14} /> Pause
                                            </motion.button>
                                            <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                                onClick={() => setShowConfirmCancel(true)}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl font-black text-xs uppercase tracking-wider transition-all border border-red-100">
                                                <X size={14} /> Cancel
                                            </motion.button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </motion.div>
            </AnimatePresence>

            <ConfirmationModal
                isOpen={showConfirmCancel}
                onClose={() => setShowConfirmCancel(false)}
                onConfirm={async () => {
                    setShowConfirmCancel(false);
                    const campaignId = activeCampaign?.id;
                    if (campaignId) {
                        onCancel(campaignId);
                    }
                }}
                title="Force Stop Campaign?"
                message="Stopping this campaign now will prevent any further messages from being sent. This action cannot be undone."
                confirmText="Stop Execution"
                type="danger"
            />
        </div >
    );
};

export default ScheduledCountdownManager;
