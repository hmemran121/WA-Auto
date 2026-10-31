import React, { useState, useEffect } from 'react';
import {
    Settings,
    Clock,
    Trash2,
    Plus,
    ShieldCheck,
    AlertCircle,
    Save,
    Zap,
    Moon,
    Loader2,
    ToggleLeft,
    ToggleRight,
    AlertTriangle,
    ShieldAlert,
    X
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import PremiumDateTimePicker from './common/PremiumDateTimePicker';

interface Window {
    start: string;
    end: string;
}

const SYSTEM_DEFAULTS = {
    delayMin: 15,
    delayMax: 25,
    dailyLimit: 600,
    batchMin: 30,
    batchMax: 50,
    breakMin: 2,
    breakMax: 5
};


interface SafetyPopupProps {
    title: string;
    reason: string;
    onConfirm: () => void;
    onCancel: () => void;
}

const SafetyPopup: React.FC<SafetyPopupProps> = ({ title, reason, onConfirm, onCancel }) => (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-rose-950/40 backdrop-blur-md"
            onClick={onCancel}
        />
        <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            className="relative w-full max-w-md bg-white rounded-[2.5rem] p-8 shadow-2xl border border-rose-100 overflow-hidden"
        >
            <div className="absolute top-0 left-0 w-full h-2 bg-rose-500" />
            <div className="flex flex-col items-center text-center space-y-4">
                <div className="p-4 bg-rose-50 text-rose-500 rounded-full animate-bounce">
                    <ShieldAlert size={40} />
                </div>
                <h3 className="text-2xl font-black text-gray-800">আপনি কি নিশ্চিত?</h3>
                <p className="text-gray-500 font-medium leading-relaxed">
                    <span className="text-rose-600 font-bold underline">{title}</span> বন্ধ করা আপনার হোয়াটসঅ্যাপ একাউন্টের জন্য অত্যন্ত ঝুঁকিপূর্ণ হতে পারে।
                    <br /><br />
                    <span className="text-gray-800 font-bold italic">"{reason}"</span>
                </p>
                <div className="flex gap-3 w-full pt-4">
                    <button
                        onClick={onCancel}
                        className="flex-1 py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all"
                    >
                        না, চালু থাক
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 py-4 bg-rose-500 text-white rounded-2xl font-bold shadow-lg shadow-rose-200 hover:bg-rose-600 transition-all"
                    >
                        হ্যাঁ, বন্ধ করুন
                    </button>
                </div>
            </div>
        </motion.div>
    </div>
);

const SettingsView: React.FC = () => {
    const [delayMin, setDelayMin] = useState<number | string>(15);
    const [delayMax, setDelayMax] = useState<number | string>(25);
    const [dailyLimit, setDailyLimit] = useState<number | string>(600);
    const [batchMin, setBatchMin] = useState<number | string>(30);
    const [batchMax, setBatchMax] = useState<number | string>(50);
    const [breakMin, setBreakMin] = useState<number | string>(2);
    const [breakMax, setBreakMax] = useState<number | string>(5);
    const [windows, setWindows] = useState<Window[]>([]);

    // Safety Toggles
    const [enableJitter, setEnableJitter] = useState(true);
    const [enableDailyLimit, setEnableDailyLimit] = useState(true);
    const [enableBatching, setEnableBatching] = useState(true);
    const [enableWindows, setEnableWindows] = useState(true);
    const [aiTaggingRules, setAiTaggingRules] = useState('');

    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [showSavedMsg, setShowSavedMsg] = useState(false);
    const [activePicker, setActivePicker] = useState<{ idx: number, field: 'start' | 'end' } | null>(null);
    const [pendingToggle, setPendingToggle] = useState<{ key: string, title: string, reason: string } | null>(null);

    useEffect(() => {
        fetchSettings();
    }, []);

    const formatTime12h = (t: string) => {
        if (!t) return '--:--';
        const [h, m] = t.split(':');
        const hours = parseInt(h);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const h12 = hours % 12 || 12;
        return `${h12}:${m} ${ampm}`;
    };

    const fetchSettings = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/settings');
            const data = await res.json();
            if (data.success && data.settings) {
                const s = data.settings;
                if (s.scheduler_delay_min_ms) setDelayMin(Math.round(Number(s.scheduler_delay_min_ms) / 1000));
                if (s.scheduler_delay_max_ms) setDelayMax(Math.round(Number(s.scheduler_delay_max_ms) / 1000));
                if (s.daily_limit) setDailyLimit(Number(s.daily_limit));
                if (s.batch_min) setBatchMin(Number(s.batch_min));
                if (s.batch_max) setBatchMax(Number(s.batch_max));
                if (s.break_min_ms) setBreakMin(Math.round(Number(s.break_min_ms) / 60000));
                if (s.break_max_ms) setBreakMax(Math.round(Number(s.break_max_ms) / 60000));
                if (s.execution_windows) setWindows(JSON.parse(s.execution_windows));

                // Flags
                setEnableJitter(s.enable_jitter !== 'false');
                setEnableDailyLimit(s.enable_daily_limit !== 'false');
                setEnableBatching(s.enable_batching !== 'false');
                setEnableWindows(s.enable_windows !== 'false');
                if (s.ai_tagging_rules) setAiTaggingRules(s.ai_tagging_rules);
            }
        } catch (e) {
            console.error('Failed to fetch settings:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // Enterprise Guard: Ensure we don't save "0" for empty values
            const payload = {
                scheduler_delay_min_ms: delayMin !== "" ? Number(delayMin) * 1000 : SYSTEM_DEFAULTS.delayMin * 1000,
                scheduler_delay_max_ms: delayMax !== "" ? Number(delayMax) * 1000 : SYSTEM_DEFAULTS.delayMax * 1000,
                daily_limit: dailyLimit !== "" ? Number(dailyLimit) : SYSTEM_DEFAULTS.dailyLimit,
                batch_min: batchMin !== "" ? Number(batchMin) : SYSTEM_DEFAULTS.batchMin,
                batch_max: batchMax !== "" ? Number(batchMax) : SYSTEM_DEFAULTS.batchMax,
                break_min_ms: breakMin !== "" ? Number(breakMin) * 60000 : SYSTEM_DEFAULTS.breakMin * 60000,
                break_max_ms: breakMax !== "" ? Number(breakMax) * 60000 : SYSTEM_DEFAULTS.breakMax * 60000,
                execution_windows: JSON.stringify(windows),
                enable_jitter: String(enableJitter),
                enable_daily_limit: String(enableDailyLimit),
                enable_batching: String(enableBatching),
                enable_windows: String(enableWindows),
                ai_tagging_rules: aiTaggingRules
            };

            const res = await fetch('http://localhost:3001/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ settings: payload })
            });

            const data = await res.json();
            if (data.success) {
                setShowSavedMsg(true);
                setTimeout(() => setShowSavedMsg(false), 3000);
            }
        } catch (e) {
            console.error('Failed to save settings:', e);
        } finally {
            setIsSaving(false);
        }
    };

    const attemptToggle = (key: string, currentVal: boolean, title: string, reason: string) => {
        if (currentVal) {
            // Trying to turn OFF -> show warning
            setPendingToggle({ key, title, reason });
        } else {
            // Trying to turn ON -> just do it
            confirmToggle(key, true);
        }
    };

    const confirmToggle = (key: string, val: boolean) => {
        if (key === 'jitter') setEnableJitter(val);
        if (key === 'daily') setEnableDailyLimit(val);
        if (key === 'batch') setEnableBatching(val);
        if (key === 'windows') setEnableWindows(val);
        setPendingToggle(null);
    };

    const addWindow = () => {
        setWindows([...windows, { start: '09:00', end: '12:00' }]);
    };

    const removeWindow = (index: number) => {
        setWindows(windows.filter((_, i) => i !== index));
    };

    const updateWindow = (index: number, field: 'start' | 'end', value: string) => {
        const newWindows = [...windows];
        newWindows[index][field] = value;
        setWindows(newWindows);
    };

    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4">
                <Loader2 className="animate-spin text-wa-teal" size={48} />
                <p className="text-gray-500 font-medium animate-pulse">লোড হচ্ছে...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-12">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-gray-800 flex items-center gap-2">
                        <Settings className="text-wa-teal" />
                        Advanced Safety Controls
                    </h1>
                    <p className="text-gray-500 font-medium italic">Configure advanced human behavior patterns</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-wa-teal text-white px-8 py-3.5 rounded-2xl font-black shadow-xl shadow-wa-teal/20 flex items-center gap-2 disabled:opacity-50 transition-all"
                >
                    {isSaving ? <Zap className="animate-spin" size={20} /> : <Save size={20} />}
                    {isSaving ? 'Updating...' : 'Save Configuration'}
                </motion.button>
            </div>

            <AnimatePresence>
                {showSavedMsg && (
                    <motion.div
                        initial={{ opacity: 0, y: -20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="bg-emerald-500 text-white p-5 rounded-[2rem] flex items-center gap-4 border border-emerald-400 shadow-xl shadow-emerald-100"
                    >
                        <ShieldCheck size={24} className="animate-pulse" />
                        <div>
                            <p className="font-black text-sm uppercase tracking-widest">Settings Synchronized</p>
                            <p className="text-xs opacity-90 font-medium">Real-time protection layers updated across all engines.</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {pendingToggle && (
                    <SafetyPopup
                        title={pendingToggle.title}
                        reason={pendingToggle.reason}
                        onConfirm={() => confirmToggle(pendingToggle.key, false)}
                        onCancel={() => setPendingToggle(null)}
                    />
                )}
            </AnimatePresence>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* 1. Human Behavior Jitter */}
                <section className={`relative bg-white p-8 rounded-[3rem] border-2 transition-all duration-500 overflow-hidden ${enableJitter ? 'border-gray-100 shadow-sm' : 'border-rose-500 bg-rose-50/20 shadow-xl shadow-rose-100'}`}>
                    {!enableJitter && <div className="absolute top-0 right-0 p-4 text-rose-500 opacity-20"><ShieldAlert size={80} /></div>}
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-3xl ${enableJitter ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-500 text-white shadow-lg shadow-rose-200'}`}>
                                <Clock size={24} />
                            </div>
                            <div>
                                <h2 className="font-black text-gray-800 text-lg uppercase tracking-tight">Human Jitter</h2>
                                <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">Safe Delay Profile</p>
                            </div>
                        </div>
                        <button
                            onClick={() => attemptToggle('jitter', enableJitter, 'Human Jitter', 'এটি বন্ধ করলে হোয়াটসঅ্যাপ বুঝবে যে আপনি একটি বট ব্যবহার করছেন, কারণ প্রতিটি মেসেজের ইন্টারভাল একদম ফিক্সড থাকবে।')}
                            className={`p-1 w-14 rounded-full transition-all duration-300 relative ${enableJitter ? 'bg-wa-teal' : 'bg-gray-200'}`}
                        >
                            <motion.div
                                animate={{ x: enableJitter ? '100%' : '0%', left: enableJitter ? -30 : 2 }}
                                className="w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center"
                            >
                                {enableJitter ? <ToggleRight size={14} className="text-wa-teal" /> : <ToggleLeft size={14} className="text-gray-400" />}
                            </motion.div>
                        </button>
                    </div>

                    <div className={`space-y-6 ${!enableJitter ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Min (Sec)</label>
                                <input
                                    type="number"
                                    value={delayMin}
                                    onChange={(e) => setDelayMin(e.target.value)}
                                    placeholder={String(SYSTEM_DEFAULTS.delayMin)}
                                    className="w-full bg-gray-50 border-2 border-transparent focus:border-wa-teal rounded-2xl px-5 py-3.5 outline-none transition-all font-black text-gray-800"
                                />

                            </div>
                            <div className="space-y-2">
                                <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Max (Sec)</label>
                                <input
                                    type="number"
                                    value={delayMax}
                                    onChange={(e) => setDelayMax(e.target.value)}
                                    placeholder={String(SYSTEM_DEFAULTS.delayMax)}
                                    className="w-full bg-gray-50 border-2 border-transparent focus:border-wa-teal rounded-2xl px-5 py-3.5 outline-none transition-all font-black text-gray-800"
                                />

                            </div>
                        </div>
                    </div>

                    {!enableJitter && (
                        <div className="mt-8 p-5 bg-rose-500 rounded-3xl border border-rose-400 space-y-2 shadow-lg shadow-rose-100">
                            <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-tighter">
                                <AlertTriangle size={16} /> দয়া করে লক্ষ্য করুন
                            </div>
                            <p className="text-white text-[11px] leading-relaxed font-bold">
                                প্রোটেকশন বন্ধ: মেসেজ সেন্ডিং এখন একদম ফিক্সড ডিলেতে হবে যা আপনার একাউন্টকে চরম ঝুঁকিতে ফেলবে।
                            </p>
                        </div>
                    )}
                </section>

                {/* 2. Daily Sending Quota */}
                <section className={`relative bg-white p-8 rounded-[3rem] border-2 transition-all duration-500 overflow-hidden ${enableDailyLimit ? 'border-gray-100 shadow-sm' : 'border-rose-500 bg-rose-50/20 shadow-xl shadow-rose-100'}`}>
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-3xl ${enableDailyLimit ? 'bg-purple-50 text-purple-600' : 'bg-rose-500 text-white shadow-lg shadow-rose-200'}`}>
                                <Zap size={24} />
                            </div>
                            <div>
                                <h2 className="font-black text-gray-800 text-lg uppercase tracking-tight">Daily Quota</h2>
                                <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">Safe Ceiling</p>
                            </div>
                        </div>
                        <button
                            onClick={() => attemptToggle('daily', enableDailyLimit, 'Daily Quota', 'দৈনিক লিটিম না থাকলে সিস্টেম নন-স্টপ মেসেজ পাঠাতে থাকবে, যা হোয়াটসঅ্যাপ স্প্যাম ফিল্টারের রেড-অ্যালার্ট ট্রিগার করবে।')}
                            className={`p-1 w-14 rounded-full transition-all duration-300 relative ${enableDailyLimit ? 'bg-wa-teal' : 'bg-gray-200'}`}
                        >
                            <motion.div
                                animate={{ x: enableDailyLimit ? '100%' : '0%', left: enableDailyLimit ? -30 : 2 }}
                                className="w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center"
                            >
                                {enableDailyLimit ? <ToggleRight size={14} className="text-wa-teal" /> : <ToggleLeft size={14} className="text-gray-400" />}
                            </motion.div>
                        </button>
                    </div>

                    <div className={`space-y-6 ${!enableDailyLimit ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        <div className="space-y-2">
                            <label className="text-xs font-black text-gray-400 uppercase tracking-widest pl-1">Max Messages (24h)</label>
                            <input
                                type="number"
                                value={dailyLimit}
                                onChange={(e) => setDailyLimit(e.target.value)}
                                placeholder={String(SYSTEM_DEFAULTS.dailyLimit)}
                                className="w-full bg-gray-50 border-2 border-transparent focus:border-wa-teal rounded-2xl px-5 py-3.5 outline-none transition-all font-black text-gray-800"
                            />
                        </div>
                    </div>

                    {!enableDailyLimit && (
                        <div className="mt-8 p-5 bg-rose-500 rounded-3xl border border-rose-400 space-y-2 shadow-lg shadow-rose-100">
                            <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-tighter">
                                <AlertTriangle size={16} /> দয়া করে লক্ষ্য করুন
                            </div>
                            <p className="text-white text-[11px] leading-relaxed font-bold">
                                প্রোটেকশন বন্ধ: সিস্টেম এখন আনলিমিটেড মেসেজ পাঠাবে, যা আপনার নাম্বার আজীবনের জন্য ব্যান করতে পারে।
                            </p>
                        </div>
                    )}
                </section>

                {/* 3. Smart Batching */}
                <section className={`relative bg-white p-8 rounded-[3rem] border-2 transition-all duration-500 overflow-hidden ${enableBatching ? 'border-gray-100 shadow-sm' : 'border-rose-500 bg-rose-50/20 shadow-xl shadow-rose-100'}`}>
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className={`p-4 rounded-3xl ${enableBatching ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-500 text-white shadow-lg shadow-rose-200'}`}>
                                <ShieldCheck size={24} />
                            </div>
                            <div>
                                <h2 className="font-black text-gray-800 text-lg uppercase tracking-tight">Smart Batch</h2>
                                <p className="text-[10px] text-gray-400 font-bold tracking-widest uppercase">Human Rest Cycle</p>
                            </div>
                        </div>
                        <button
                            onClick={() => attemptToggle('batch', enableBatching, 'Smart Batch', 'এটি বন্ধ করলে সিস্টেম কোনো বিরতি ছাড়াই হাজার হাজার মেসেজ পাঠাবে, যা মানুষের পক্ষে অসম্ভব এবং হোয়াটসঅ্যাপ এটি সহজেই শনাক্ত করবে।')}
                            className={`p-1 w-14 rounded-full transition-all duration-300 relative ${enableBatching ? 'bg-wa-teal' : 'bg-gray-200'}`}
                        >
                            <motion.div
                                animate={{ x: enableBatching ? '100%' : '0%', left: enableBatching ? -30 : 2 }}
                                className="w-7 h-7 bg-white rounded-full shadow-md flex items-center justify-center"
                            >
                                {enableBatching ? <ToggleRight size={14} className="text-wa-teal" /> : <ToggleLeft size={14} className="text-gray-400" />}
                            </motion.div>
                        </button>
                    </div>

                    <div className={`space-y-6 ${!enableBatching ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Batch Range</label>
                                <div className="flex gap-2">
                                    <input type="number" value={batchMin} onChange={(e) => setBatchMin(e.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 font-black text-gray-700 outline-none border-2 border-transparent focus:border-wa-teal" placeholder={String(SYSTEM_DEFAULTS.batchMin)} />
                                    <input type="number" value={batchMax} onChange={(e) => setBatchMax(e.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 font-black text-gray-700 outline-none border-2 border-transparent focus:border-wa-teal" placeholder={String(SYSTEM_DEFAULTS.batchMax)} />
                                </div>

                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Break Range</label>
                                <div className="flex gap-2">
                                    <input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 font-black text-gray-700 outline-none border-2 border-transparent focus:border-wa-teal" placeholder={String(SYSTEM_DEFAULTS.breakMin)} />
                                    <input type="number" value={breakMax} onChange={(e) => setBreakMax(e.target.value)} className="w-full bg-gray-50 rounded-2xl px-4 py-3 font-black text-gray-700 outline-none border-2 border-transparent focus:border-wa-teal" placeholder={String(SYSTEM_DEFAULTS.breakMax)} />
                                </div>

                            </div>
                        </div>
                    </div>

                    {!enableBatching && (
                        <div className="mt-8 p-5 bg-rose-500 rounded-3xl border border-rose-400 space-y-2 shadow-lg shadow-rose-100">
                            <div className="flex items-center gap-2 text-white font-black text-xs uppercase tracking-tighter">
                                <AlertTriangle size={16} /> দয়া করে লক্ষ্য করুন
                            </div>
                            <p className="text-white text-[11px] leading-relaxed font-bold">
                                প্রোটেকশন বন্ধ: সিস্টেম এখন কোনো 'সাইলেন্ট ব্রেক' নিবে না, যা এআই ফিল্টারের নজরে পড়ার সম্ভাবনা বাড়িয়ে দেয়।
                            </p>
                        </div>
                    )}
                </section>

                {/* 4. Execution Windows */}
                <section className={`relative md:col-span-2 bg-white p-10 rounded-[4rem] border-2 transition-all duration-500 overflow-hidden ${enableWindows ? 'border-gray-100 shadow-sm' : 'border-rose-500 bg-rose-50/20 shadow-xl shadow-rose-100'}`}>
                    <div className="flex items-center justify-between mb-8 border-b border-gray-50 pb-6">
                        <div className="flex items-center gap-6">
                            <div className={`p-5 rounded-[2rem] ${enableWindows ? 'bg-indigo-50 text-indigo-600' : 'bg-rose-500 text-white shadow-lg shadow-rose-200'}`}>
                                <Moon size={32} />
                            </div>
                            <div>
                                <h2 className="font-black text-gray-900 text-2xl uppercase tracking-tighter">Safety Windows</h2>
                                <p className="text-xs text-gray-400 font-bold tracking-[0.3em] uppercase">Time-of-Day Policy</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-6">
                            <button
                                onClick={addWindow}
                                disabled={!enableWindows}
                                className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${enableWindows ? 'bg-wa-teal/10 text-wa-teal hover:bg-wa-teal hover:text-white' : 'opacity-20 pointer-events-none'}`}
                            >
                                <Plus size={16} /> Slot
                            </button>
                            <button
                                onClick={() => attemptToggle('windows', enableWindows, 'Safety Windows', 'উইন্ডো বন্ধ থাকলে সিস্টেম গভীর রাতেও মেসেজ পাঠাতে পারে, যা সাধারণ মানুষের ব্যবহারের বিপরীতে একটি স্পষ্ট বোট অ্যাক্টিভিটি।')}
                                className={`p-1 w-16 h-8 rounded-full transition-all duration-300 relative ${enableWindows ? 'bg-wa-teal' : 'bg-gray-200'}`}
                            >
                                <motion.div
                                    animate={{ x: enableWindows ? '100%' : '0%', left: enableWindows ? -32 : 2 }}
                                    className="w-8 h-6 bg-white rounded-full shadow-md flex items-center justify-center mt-0"
                                >
                                    {enableWindows ? <ToggleRight size={18} className="text-wa-teal" /> : <ToggleLeft size={18} className="text-gray-400" />}
                                </motion.div>
                            </button>
                        </div>
                    </div>

                    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 ${!enableWindows ? 'opacity-30 pointer-events-none grayscale' : ''}`}>
                        {windows.length === 0 && (
                            <div className="col-span-full py-16 text-center bg-gray-50 rounded-[3rem] border-4 border-dashed border-gray-100">
                                <Clock className="mx-auto text-gray-200 mb-4" size={48} />
                                <p className="text-gray-400 font-bold italic tracking-wide">No windows configured. System active 24/7/365.</p>
                            </div>
                        )}

                        <AnimatePresence>
                            {windows.map((w, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9 }}
                                    className="bg-white p-6 rounded-[2.5rem] border border-gray-100 flex items-center gap-4 group relative shadow-sm hover:shadow-md transition-all"
                                >
                                    <div className="space-y-1 flex-1">
                                        <label className="text-[10px] uppercase font-black text-gray-300 tracking-[0.2em]">Start</label>
                                        <div onClick={() => setActivePicker({ idx, field: 'start' })} className="w-full bg-gray-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-wa-teal/5 transition-all text-sm font-black text-gray-800">
                                            {formatTime12h(w.start)}
                                        </div>
                                    </div>
                                    <div className="space-y-1 flex-1">
                                        <label className="text-[10px] uppercase font-black text-gray-300 tracking-[0.2em]">End</label>
                                        <div onClick={() => setActivePicker({ idx, field: 'end' })} className="w-full bg-gray-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-wa-teal/5 transition-all text-sm font-black text-gray-800">
                                            {formatTime12h(w.end)}
                                        </div>
                                    </div>
                                    <button onClick={() => removeWindow(idx)} className="p-2.5 bg-rose-50 text-rose-400 hover:bg-rose-500 hover:text-white rounded-xl transition-all shadow-sm">
                                        <X size={16} />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {!enableWindows && (
                        <div className="mt-10 p-6 bg-rose-500 rounded-[2.5rem] border border-rose-400 flex items-center gap-6 shadow-xl shadow-rose-200">
                            <div className="p-4 bg-white/20 rounded-2xl text-white">
                                <ShieldAlert size={32} />
                            </div>
                            <div className="flex-1">
                                <h4 className="text-white font-black uppercase tracking-widest text-sm mb-1">Time Policy Disabled</h4>
                                <p className="text-white text-xs opacity-90 font-medium leading-relaxed">
                                    সতর্কতা: উইন্ডো স্লট না থাকলে সিস্টেম সব সময় মেসেজ পাঠাবে। গভীর রাতে মেসেজ পাঠানো হোয়াটসঅ্যাপ ফিল্টারে ধরা পড়ার প্রধান কারণগুলোর একটি।
                                </p>
                            </div>
                        </div>
                    )}
                </section>

                {/* 5. AI Intelligence & Dynamic Tagging */}
                <section className="bg-white p-10 rounded-[3rem] border-2 border-gray-100 shadow-sm md:col-span-2 overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-8 text-wa-teal/5 -rotate-12 transition-transform group-hover:rotate-0 duration-500">
                        <Zap size={120} />
                    </div>
                    <div className="flex items-center gap-6 mb-8">
                        <div className="p-5 bg-wa-teal/10 text-wa-teal rounded-[2rem] shadow-inner">
                            <Zap size={32} />
                        </div>
                        <div>
                            <h2 className="font-black text-gray-900 text-2xl uppercase tracking-tighter">AI Intelligence & Tagging</h2>
                            <p className="text-xs text-gray-400 font-bold tracking-[0.3em] uppercase">Dynamic Segmentation Rules</p>
                        </div>
                    </div>

                    <div className="space-y-6 relative z-10">
                        <div className="p-6 bg-slate-50 rounded-[2.5rem] border border-slate-100 flex items-start gap-4">
                            <AlertCircle className="text-wa-teal shrink-0 mt-1" size={20} />
                            <div className="space-y-1">
                                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">How it works</p>
                                <p className="text-xs text-slate-500 font-bold leading-relaxed">
                                    নিচে আপনার এআই-এর জন্য ট্যাগিং গাইডলাইন লিখে দিন। কথোপকথনের সময় এআই এই রুলগুলো অনুসরণ করে কাস্টমারদের অটোমেটিক ট্যাগ করবে। উদাহরণস্বরূপ: "কাস্টমার যদি ডিসকাউন্ট চায় তবে তাকে #PriceSensitive ট্যাগ দিন।"
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-2">AI Tagging Instructions</label>
                            <textarea
                                value={aiTaggingRules}
                                onChange={(e) => setAiTaggingRules(e.target.value)}
                                placeholder="e.g. 1. If customer asks for discount, assign #Price_Sensitive&#10;2. If customer is repeat buyer, assign #Loyal"
                                className="w-full h-48 bg-gray-50 border-2 border-transparent focus:border-wa-teal focus:bg-white rounded-[2.5rem] p-8 outline-none transition-all font-bold text-gray-700 text-sm leading-relaxed shadow-inner resize-none"
                            />
                        </div>

                        <div className="flex items-center justify-between gap-3 p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                            <div className="flex items-center gap-3">
                                <ShieldCheck className="text-emerald-500" size={18} />
                                <p className="text-[10px] text-emerald-700 font-black uppercase tracking-widest">
                                    Rules are injected directly into the Gemini-2.5-Flash Knowledge Engine.
                                </p>
                            </div>
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="bg-wa-teal text-white px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-md hover:bg-wa-teal/90 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isSaving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />}
                                Update Rules
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            <AnimatePresence>
                {activePicker && (
                    <PremiumDateTimePicker
                        mode="time"
                        value={activePicker.field === 'start' ? windows[activePicker.idx].start : windows[activePicker.idx].end}
                        onChange={(val) => updateWindow(activePicker.idx, activePicker.field, val)}
                        onClose={() => setActivePicker(null)}
                        label={`${activePicker.field === 'start' ? 'Window Start' : 'Window End'} - Slot ${activePicker.idx + 1}`}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default SettingsView;
