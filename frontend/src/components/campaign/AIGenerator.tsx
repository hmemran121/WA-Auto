import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ChevronDown, Users, User, Wand2, MessageSquare, Send, Clock, Loader2, CheckCircle, Info, X, Settings2, Activity } from 'lucide-react';
import { Contact, Group } from './types';
import PremiumSelect from '../common/PremiumSelect';
import PremiumDateTimePicker from '../common/PremiumDateTimePicker';
import { Calendar } from 'lucide-react';
import { generateDynamicMessage } from '../../services/geminiService';
import { Socket } from 'socket.io-client';
import { isCurrentlyInsideActiveWindow } from '../common/windowUtils';

interface AIGeneratorProps {
    showAiPanel: boolean;
    setShowAiPanel: (show: boolean) => void;
    contacts: Contact[];
    groups: Group[];
    isConnected: boolean;
    socket: Socket | null;
}

const AIGenerator: React.FC<AIGeneratorProps> = ({
    showAiPanel, setShowAiPanel, contacts, groups, isConnected, socket
}) => {
    const [selectedContactId, setSelectedContactId] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [campaignMode, setCampaignMode] = useState<'single' | 'group'>('single');
    const [context, setContext] = useState('');
    const [tone, setTone] = useState('Friendly');
    const [language, setLanguage] = useState('English');
    const [message, setMessage] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [progress, setProgress] = useState({ current: 0, total: 0 });
    const [success, setSuccess] = useState(false);
    const [sendMode, setSendMode] = useState<'now' | 'schedule'>('now');
    const [scheduledAt, setScheduledAt] = useState('');
    const [campaignName, setCampaignName] = useState('');
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduleSuccess, setScheduleSuccess] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [customMinDelay, setCustomMinDelay] = useState<string>('');
    const [customMaxDelay, setCustomMaxDelay] = useState<string>('');
    const [advancedSpeedMode, setAdvancedSpeedMode] = useState(false);
    const [aiWaitSeconds, setAiWaitSeconds] = useState(30);
    const [showJitterOverrides, setShowJitterOverrides] = useState(false);
    const [campaignWindows, setCampaignWindows] = useState<{ start: string, end: string }[]>([]);

    const [globalSettings, setGlobalSettings] = useState<any>({});
    const [pendingSafetyPopup, setPendingSafetyPopup] = useState<{ title: string, reason: string } | null>(null);
    const [showWindowOverrides, setShowWindowOverrides] = useState(false);
    const [respectExecutionWindows, setRespectExecutionWindows] = useState(true);
    const [activeWindowPicker, setActiveWindowPicker] = useState<{ idx: number, field: 'start' | 'end' } | null>(null);

    // Initial sync of local speed states from global settings
    React.useEffect(() => {
        if (globalSettings.scheduler_delay_min_ms && globalSettings.scheduler_delay_max_ms) {
            const minV = parseInt(globalSettings.scheduler_delay_min_ms) / 1000;
            const maxV = parseInt(globalSettings.scheduler_delay_max_ms) / 1000;
            const avgV = Math.round((minV + maxV) / 2);
            setAiWaitSeconds(avgV);
            if (!customMinDelay) setCustomMinDelay(minV.toString());
            if (!customMaxDelay) setCustomMaxDelay(maxV.toString());
        }
    }, [globalSettings.scheduler_delay_min_ms, globalSettings.scheduler_delay_max_ms]);
    const stopRef = React.useRef(false);
    const isWindowsActive = respectExecutionWindows && globalSettings.enable_windows === 'true';
    const isInsideActiveWindow = isWindowsActive ? isCurrentlyInsideActiveWindow(
        campaignWindows,
        globalSettings.enable_windows,
        parseInt(globalSettings.timezone_offset || '0', 10)
    ) : false;

    const formatTime12h = (t: string) => {
        if (!t) return '--:--';
        const [h, m] = t.split(':');
        const hours = parseInt(h);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const h12 = hours % 12 || 12;
        return `${h12}:${m} ${ampm}`;
    };

    React.useEffect(() => {
        if (showAiPanel) {
            fetch('http://localhost:3001/api/settings')
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        setGlobalSettings(data.settings || {});
                        if (data.settings?.execution_windows && campaignWindows.length === 0) {
                            setCampaignWindows(JSON.parse(data.settings.execution_windows));
                        }
                    }
                })
                .catch(err => console.error('Failed to load global settings:', err));
        }
    }, [showAiPanel]);

    const handleGenerate = async () => {
        let targetName = 'Customer';
        if (campaignMode === 'single') {
            const contact = contacts.find(c => c.id === selectedContactId);
            if (contact) targetName = contact.name;
        } else {
            targetName = 'Valued Customer';
        }
        if (!context) return;
        setIsGenerating(true);
        const generatedText = await generateDynamicMessage(targetName, context, { tone, language });
        setMessage(generatedText);
        setIsGenerating(false);
    };

    const handleSend = async () => {
        if (!isConnected || !message) return;

        // 🛡️ Global Safety Check
        if (globalSettings.enable_jitter === 'false' || globalSettings.enable_windows === 'false') {
            const missing = [];
            if (globalSettings.enable_jitter === 'false') missing.push("Human Jitter");
            if (globalSettings.enable_windows === 'false') missing.push("Safety Windows");

            if (!confirm(`Warning: The following safety features are disabled globally: ${missing.join(", ")}. Sending now is HIGH RISK. Do you want to proceed?`)) {
                return;
            }
        }

        let targets: Contact[] = [];
        if (campaignMode === 'single') {
            const contact = contacts.find(c => c.id === selectedContactId);
            if (contact) targets = [contact];
        } else if (selectedGroupId) {
            try {
                const res = await fetch(`http://localhost:3001/api/groups/${selectedGroupId}/contacts`);
                const data = await res.json();
                targets = data.map((c: any) => ({ id: c.id.toString(), name: c.name, phone: c.number }));
            } catch (err) {
                console.error('Failed to fetch group contacts:', err);
                return;
            }
        }

        if (targets.length === 0) return;
        setIsSending(true);
        setProgress({ current: 0, total: targets.length });
        stopRef.current = false;

        for (let i = 0; i < targets.length; i++) {
            if (stopRef.current) break;
            const contact = targets[i];
            setProgress(p => ({ ...p, current: i + 1 }));
            if (socket && socket.connected) {
                socket.emit('send-message', { to: contact.phone, text: message, contactId: contact.id, contactName: contact.name });
            }
            if (i < targets.length - 1) {
                let finalDelayMin: number | undefined = undefined;
                let finalDelayMax: number | undefined = undefined;

                if (showJitterOverrides) {
                    if (advancedSpeedMode) {
                        finalDelayMin = customMinDelay ? parseInt(customMinDelay) * 1000 : undefined;
                        finalDelayMax = customMaxDelay ? parseInt(customMaxDelay) * 1000 : undefined;
                    } else {
                        finalDelayMin = Math.max(1000, (aiWaitSeconds - 5) * 1000);
                        finalDelayMax = (aiWaitSeconds + 5) * 1000;
                    }
                }

                const min = finalDelayMin ?? (parseInt(globalSettings.scheduler_delay_min_ms) || 15000);
                const max = finalDelayMax ?? (parseInt(globalSettings.scheduler_delay_max_ms) || 25000);
                const delay = min + Math.random() * (max - min);

                const start = Date.now();
                while (Date.now() - start < delay) {
                    if (stopRef.current) break;
                    await new Promise(r => setTimeout(r, 500));
                }
            }
        }
        setIsSending(false);
        setSuccess(true);
        setTimeout(() => {
            setSuccess(false);
            setShowAiPanel(false);
        }, 2000);
        setMessage('');
        setContext('');
        setSelectedContactId('');
        setSelectedGroupId('');
    };

    const handleSchedule = async () => {
        if (!message || !scheduledAt) return;

        // 🛡️ Global Safety Check
        if (globalSettings.enable_jitter === 'false' || globalSettings.enable_windows === 'false') {
            const missing = [];
            if (globalSettings.enable_jitter === 'false') missing.push("Human Jitter");
            if (globalSettings.enable_windows === 'false') missing.push("Safety Windows");

            if (!confirm(`Warning: The following safety features are disabled globally: ${missing.join(", ")}. Scheduling now is HIGH RISK. Do you want to proceed?`)) {
                return;
            }
        }

        const targetId = campaignMode === 'single' ? selectedContactId : selectedGroupId;
        const targetType = campaignMode === 'single' ? 'contact' : 'group';
        const targetObj = campaignMode === 'single'
            ? contacts.find(c => c.id === selectedContactId)
            : groups.find(g => String(g.id) === selectedGroupId);

        if (!targetId || !targetObj) return;

        let scheduledDate: Date;
        if (isWindowsActive && !isInsideActiveWindow && /^\d{4}-\d{2}-\d{2}$/.test(scheduledAt)) {
            const [y, m, d] = scheduledAt.split('-').map(Number);
            scheduledDate = new Date(y, m - 1, d, 0, 0, 0); // Local start
        } else {
            scheduledDate = new Date(scheduledAt);
        }

        const now = new Date();

        // 🧠 Smart Adjustment: if today and time is midnight or past, default to "now"
        // so that the scheduler's next-window logic can take over correctly.
        if (isWindowsActive && !isInsideActiveWindow && scheduledDate <= now) {
            if (scheduledDate.toDateString() === now.toDateString()) {
                scheduledDate = new Date(now.getTime() + 1000);
            }
        } else if (!isWindowsActive && scheduledDate.toDateString() === now.toDateString() && scheduledDate <= now) {
            scheduledDate = new Date(now.getTime() + 120000); // +2 mins fallback for legacy
        } else if (isWindowsActive && isInsideActiveWindow && scheduledDate <= now) {
            scheduledDate = new Date(now.getTime() + 120000); // +2 mins buffer if manually picking a past time inside active window manually
        }

        if (isNaN(scheduledDate.getTime()) || scheduledDate <= now) {
            alert("Scheduled time must be in the future.");
            return;
        }

        const name = campaignName.trim() || `Campaign: ${targetObj.name}`;
        // --- Delay Calculation ---
        let finalDelayMin: number | undefined = undefined;
        let finalDelayMax: number | undefined = undefined;

        if (showJitterOverrides) {
            if (advancedSpeedMode) {
                finalDelayMin = customMinDelay ? parseInt(customMinDelay) * 1000 : undefined;
                finalDelayMax = customMaxDelay ? parseInt(customMaxDelay) * 1000 : undefined;
            } else {
                finalDelayMin = Math.max(1000, (aiWaitSeconds - 5) * 1000);
                finalDelayMax = (aiWaitSeconds + 5) * 1000;
            }
        }

        setIsScheduling(true);

        try {
            const res = await fetch('http://localhost:3001/api/campaigns/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    message,
                    target_type: targetType,
                    target_id: targetId,
                    target_name: targetObj.name,
                    scheduled_at: scheduledDate.toISOString(),
                    total_recipients: targetType === 'group' ? (targetObj as any).contactCount || 0 : 1,
                    delayMin: finalDelayMin,
                    delayMax: finalDelayMax,
                    respect_execution_windows: respectExecutionWindows ? 1 : 0,
                    execution_windows: campaignWindows.length > 0 ? JSON.stringify(campaignWindows) : undefined
                }),
            });
            const data = await res.json();
            if (data.success) {
                setScheduleSuccess(true);
                setMessage('');
                setContext('');
                setCampaignName('');
                setScheduledAt('');
                setSendMode('now');
                setTimeout(() => {
                    setScheduleSuccess(false);
                    setShowAiPanel(false);
                }, 2000);
            }
        } catch {
            console.error('Schedule failed');
        } finally {
            setIsScheduling(false);
        }
    };

    return (
        <>
            <motion.div
                className="glass-card bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white overflow-hidden"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
            >
                <button
                    onClick={() => setShowAiPanel(!showAiPanel)}
                    className="w-full flex items-center justify-between p-8 hover:bg-purple-50/30 transition-colors group"
                >
                    <div className="flex items-center gap-5">
                        <div className="p-4 bg-purple-100 rounded-2xl text-purple-600 group-hover:bg-purple-200 transition-colors">
                            <Sparkles size={26} />
                        </div>
                        <div className="text-left">
                            <h2 className="text-2xl font-black text-gray-800">AI Message Generator</h2>
                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                                Generate personalized messages on the fly
                            </p>
                        </div>
                    </div>
                    <motion.div animate={{ rotate: showAiPanel ? 180 : 0 }} transition={{ duration: 0.2 }}>
                        <ChevronDown size={22} className="text-gray-400" />
                    </motion.div>
                </button>

                <AnimatePresence>
                    {showAiPanel && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden"
                        >
                            <div className="p-8 pt-0">
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                                    {/* Configuration Side */}
                                    <div className="space-y-8 bg-gray-50/50 p-6 rounded-3xl border border-gray-100">
                                        <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-gray-100">
                                            <div className="flex items-center gap-4 p-4">
                                                <div className="p-4 bg-purple-100 rounded-2xl text-purple-600">
                                                    <Sparkles size={28} />
                                                </div>
                                                <div>
                                                    <h2 className="text-2xl font-black text-gray-800">AI Setup</h2>
                                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Create smart messages</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex bg-gray-50 p-2 rounded-2xl mb-8">
                                            <button
                                                onClick={() => setCampaignMode('single')}
                                                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${campaignMode === 'single' ? 'bg-white text-purple-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                                            >Single Contact</button>
                                            <button
                                                onClick={() => setCampaignMode('group')}
                                                className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${campaignMode === 'group' ? 'bg-white text-purple-600 shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
                                            >Group Campaign</button>
                                        </div>

                                        <div className="space-y-6">
                                            <div className="group">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">
                                                    {campaignMode === 'single' ? 'Select Contact' : 'Select Target Group'}
                                                </label>
                                                <div className="relative">
                                                    <Users className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-purple-500 transition-colors" size={20} />
                                                    {campaignMode === 'single' ? (
                                                        <PremiumSelect
                                                            label="Select Contact"
                                                            icon={User}
                                                            options={contacts.map(c => ({
                                                                value: c.id,
                                                                label: c.name,
                                                                description: c.phone
                                                            }))}
                                                            value={selectedContactId}
                                                            onChange={setSelectedContactId}
                                                            variant="purple"
                                                        />
                                                    ) : (
                                                        <PremiumSelect
                                                            label="Select Group"
                                                            icon={Users}
                                                            options={groups.map(g => ({
                                                                value: g.id,
                                                                label: g.name,
                                                                description: `${g.contactCount || 0} contacts`
                                                            }))}
                                                            value={selectedGroupId}
                                                            onChange={setSelectedGroupId}
                                                            variant="purple"
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            <div className="group">
                                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">Message Purpose</label>
                                                <textarea
                                                    rows={4}
                                                    placeholder="e.g. Informing about our new special offer..."
                                                    className="w-full px-6 py-5 bg-gray-50 border-2 border-transparent focus:border-purple-500/20 focus:bg-white rounded-[1.5rem] outline-none transition-all font-bold text-gray-700 resize-none"
                                                    value={context}
                                                    onChange={(e) => setContext(e.target.value)}
                                                />
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="group">
                                                    <PremiumSelect
                                                        label="Tone"
                                                        options={[
                                                            { value: 'Friendly', label: 'Friendly' },
                                                            { value: 'Professional', label: 'Professional' },
                                                            { value: 'Exciting', label: 'Exciting' },
                                                            { value: 'Urgent', label: 'Urgent' }
                                                        ]}
                                                        value={tone}
                                                        onChange={setTone}
                                                        variant="purple"
                                                        searchable={false}
                                                    />
                                                </div>
                                                <div className="group">
                                                    <PremiumSelect
                                                        label="Language"
                                                        options={[
                                                            { value: 'English', label: 'English' },
                                                            { value: 'Bengali', label: 'Bengali' }
                                                        ]}
                                                        value={language}
                                                        onChange={setLanguage}
                                                        variant="purple"
                                                        searchable={false}
                                                    />
                                                </div>
                                            </div>

                                            <motion.button
                                                whileHover={{ scale: 1.02, y: -2 }}
                                                whileTap={{ scale: 0.98 }}
                                                onClick={handleGenerate}
                                                disabled={(campaignMode === 'single' ? !selectedContactId : !selectedGroupId) || !context || isGenerating}
                                                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-5 rounded-2xl font-black flex items-center justify-center gap-3 shadow-xl shadow-purple-500/20 transition-all uppercase tracking-widest text-xs disabled:opacity-50"
                                            >
                                                {isGenerating ? <Loader2 className="animate-spin" size={20} /> : (
                                                    <motion.div animate={{ rotate: [0, 15, -15, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
                                                        <Sparkles size={20} />
                                                    </motion.div>
                                                )}
                                                Generate with AI
                                            </motion.button>
                                        </div>
                                    </div>

                                    {/* Message Review side */}
                                    <div className="glass-card bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white p-10 flex flex-col h-full space-y-8">
                                        <div className="flex items-center gap-4">
                                            <div className="p-4 bg-blue-100 rounded-2xl text-blue-600">
                                                <Wand2 size={28} />
                                            </div>
                                            <div>
                                                <h2 className="text-2xl font-black text-gray-800">Review and Send</h2>
                                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Edit as you like</p>
                                            </div>
                                        </div>

                                        <div className="flex-1 flex flex-col gap-6">
                                            <div className="flex-1 bg-gray-50/50 rounded-[2rem] p-8 border-2 border-dashed border-gray-100 relative group focus-within:border-wa-teal/30 transition-all">
                                                {!message ? (
                                                    <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4">
                                                        <MessageSquare size={48} className="opacity-20" />
                                                        <p className="font-bold italic">Generate a message from the left panel...</p>
                                                    </div>
                                                ) : (
                                                    <textarea
                                                        className="w-full h-full bg-transparent border-none outline-none resize-none text-gray-800 font-bold leading-relaxed text-lg"
                                                        value={message}
                                                        onChange={(e) => setMessage(e.target.value)}
                                                    />
                                                )}
                                            </div>

                                            <AnimatePresence>
                                                {message && (
                                                    <motion.div
                                                        initial={{ opacity: 0, y: -10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        className="space-y-4 pt-4 border-t border-purple-100/50 mt-4"
                                                    >
                                                        {/* Unified Anti-Ban Speed Control */}
                                                        <div className="bg-white p-6 rounded-[2rem] border border-purple-50 shadow-sm relative overflow-hidden group/safety">
                                                            {/* Lock overlay if global is off */}
                                                            {globalSettings.enable_jitter === 'false' && (
                                                                <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-[2px] flex items-center justify-center p-6 text-center">
                                                                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 shadow-sm">Speed Control Restricted Disable In Settings</p>
                                                                </div>
                                                            )}

                                                            <div className="flex items-center justify-between mb-2">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                                                                        <Activity size={18} className="animate-pulse" />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-gray-800 uppercase tracking-widest">Speed Control</p>
                                                                        <p className="text-[9px] font-bold text-purple-600/60 uppercase tracking-wider">
                                                                            {showJitterOverrides
                                                                                ? (advancedSpeedMode ? 'Advanced Override Active' : 'Custom Slider Active')
                                                                                : `Global Active (${parseInt(globalSettings.scheduler_delay_min_ms || "15000") / 1000}s - ${parseInt(globalSettings.scheduler_delay_max_ms || "25000") / 1000}s)`}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                                {globalSettings.enable_jitter !== 'false' && (
                                                                    <div className="flex items-center gap-2">
                                                                        {!showJitterOverrides && (
                                                                            <p className="text-[8px] font-black text-gray-300 uppercase tracking-tight mr-1">Inherit Global</p>
                                                                        )}
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => setShowJitterOverrides(!showJitterOverrides)}
                                                                            className={`relative w-8 h-4 rounded-full transition-colors duration-200 focus:outline-none ${showJitterOverrides ? 'bg-purple-500' : 'bg-gray-200'}`}
                                                                        >
                                                                            <motion.div
                                                                                animate={{ x: showJitterOverrides ? 18 : 2 }}
                                                                                className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow-sm"
                                                                            />
                                                                        </button>
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <AnimatePresence>
                                                                {!showJitterOverrides && globalSettings.enable_jitter !== 'false' && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, height: 0 }}
                                                                        animate={{ opacity: 1, height: 'auto' }}
                                                                        exit={{ opacity: 0, height: 0 }}
                                                                        className="mt-2 bg-gray-50/50 p-3 rounded-2xl border border-dashed border-gray-100"
                                                                    >
                                                                        <div className="flex justify-between items-center opacity-60 px-2">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Min Delay</span>
                                                                                <span className="text-[10px] font-bold text-gray-600">{parseInt(globalSettings.scheduler_delay_min_ms || "15000") / 1000}s</span>
                                                                            </div>
                                                                            <div className="flex flex-col items-end">
                                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Max Delay</span>
                                                                                <span className="text-[10px] font-bold text-gray-600">{parseInt(globalSettings.scheduler_delay_max_ms || "25000") / 1000}s</span>
                                                                            </div>
                                                                        </div>
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>

                                                            <AnimatePresence>
                                                                {showJitterOverrides && (
                                                                    <motion.div
                                                                        initial={{ opacity: 0, height: 0 }}
                                                                        animate={{ opacity: 1, height: 'auto' }}
                                                                        exit={{ opacity: 0, height: 0 }}
                                                                        className="overflow-hidden pt-4 mt-2 border-t border-purple-50/50"
                                                                    >
                                                                        <div className="flex items-center justify-between mb-4">
                                                                            <p className="text-[9px] font-bold text-gray-400">Configure delays for this campaign.</p>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setAdvancedSpeedMode(!advancedSpeedMode)}
                                                                                className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-2 py-1.5 rounded transition-colors ${advancedSpeedMode ? 'text-indigo-600 bg-indigo-50 border border-indigo-100' : 'text-gray-400 hover:bg-gray-50 border border-transparent'}`}
                                                                            >
                                                                                <Settings2 size={12} />
                                                                                {advancedSpeedMode ? 'Back to Simple' : 'Advanced Mode'}
                                                                            </button>
                                                                        </div>

                                                                        {!advancedSpeedMode ? (
                                                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5 bg-purple-50/30 border border-purple-100/50 rounded-2xl relative shadow-inner">
                                                                                <div className="flex items-center justify-between mb-4">
                                                                                    <span className="text-[9px] font-black text-purple-700/70 uppercase tracking-widest">Target Average Delay</span>
                                                                                    <span className="text-[10px] font-black text-purple-600 bg-white px-3 py-1 rounded-lg shadow-sm border border-purple-100">{aiWaitSeconds}s Precision</span>
                                                                                </div>
                                                                                <input
                                                                                    type="range" min="10" max="120"
                                                                                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-500 relative z-10"
                                                                                    value={aiWaitSeconds}
                                                                                    onChange={e => setAiWaitSeconds(Number(e.target.value))}
                                                                                />
                                                                                <div className="flex justify-between mt-3 text-[8px] font-black text-purple-700/40 uppercase tracking-widest relative z-10">
                                                                                    <span>Fast (10s)</span>
                                                                                    <span>Safe (60s)</span>
                                                                                    <span>Stealth (120s)</span>
                                                                                </div>
                                                                            </motion.div>
                                                                        ) : (
                                                                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-4 p-5 bg-indigo-50/30 border border-indigo-100/50 rounded-2xl shadow-inner">
                                                                                <div className="space-y-1.5">
                                                                                    <label className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.1em] ml-1">Min Delay (s)</label>
                                                                                    <input
                                                                                        type="number" min="5" placeholder="e.g. 15"
                                                                                        className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl text-xs font-black text-gray-700 outline-none focus:border-indigo-500/30 shadow-sm transition-all"
                                                                                        value={customMinDelay} onChange={e => setCustomMinDelay(e.target.value)}
                                                                                    />
                                                                                </div>
                                                                                <div className="space-y-1.5">
                                                                                    <label className="text-[8px] font-black text-indigo-500 uppercase tracking-[0.1em] ml-1">Max Delay (s)</label>
                                                                                    <input
                                                                                        type="number" min="6" placeholder="e.g. 25"
                                                                                        className="w-full px-4 py-2.5 bg-white border border-indigo-100 rounded-xl text-xs font-black text-gray-700 outline-none focus:border-indigo-500/30 shadow-sm transition-all"
                                                                                        value={customMaxDelay} onChange={e => setCustomMaxDelay(e.target.value)}
                                                                                    />
                                                                                </div>
                                                                            </motion.div>
                                                                        )}
                                                                    </motion.div>
                                                                )}
                                                            </AnimatePresence>
                                                        </div>

                                                        {/* Respect Windows Toggle */}
                                                        <div className="flex items-center justify-between bg-white/50 backdrop-blur-sm p-4 rounded-2xl border border-purple-100/50 shadow-sm">
                                                            <div className="flex items-center gap-3">
                                                                <div className={`p-2 rounded-lg ${respectExecutionWindows ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                                                                    <CheckCircle size={18} />
                                                                </div>
                                                                <div>
                                                                    <p className="text-xs font-black text-gray-700 uppercase tracking-tight">Respect Anti-Ban Windows</p>
                                                                    <p className="text-[9px] font-bold text-gray-400 uppercase">Ensures safety during active hours</p>
                                                                </div>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setRespectExecutionWindows(!respectExecutionWindows)}
                                                                className={`relative w-10 h-5 rounded-full transition-colors duration-200 focus:outline-none ${respectExecutionWindows ? 'bg-purple-500' : 'bg-gray-300'}`}
                                                            >
                                                                <motion.div
                                                                    animate={{ x: respectExecutionWindows ? 20 : 2 }}
                                                                    className="absolute top-1 w-3 h-3 bg-white rounded-full shadow-sm"
                                                                />
                                                            </button>
                                                        </div>

                                                        {respectExecutionWindows && (
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                className="space-y-4"
                                                            >

                                                                <div className="pb-2">
                                                                    <div
                                                                        className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${globalSettings.enable_windows === 'false' ? 'text-rose-500' : 'text-indigo-600 hover:text-indigo-700 cursor-pointer border-b border-dashed border-indigo-200'}`}
                                                                        onClick={() => {
                                                                            if (globalSettings.enable_windows === 'false') {
                                                                                setPendingSafetyPopup({
                                                                                    title: 'Time Window Restricted',
                                                                                    reason: 'গ্লোবাল সেটিংস থেকে "Safety Windows" অফ করা আছে। সেফ উইন্ডো ছাড়া যে কোনো সময় মেসেজ পাঠালে আপনার একাউন্ট হাই-রিক্স জোনে থাকবে।'
                                                                                });
                                                                            } else {
                                                                                setShowWindowOverrides(!showWindowOverrides);
                                                                            }
                                                                        }}
                                                                    >
                                                                        {globalSettings.enable_windows === 'false' ? 'Scheduling: Restricted (Global Off)' : (showWindowOverrides ? 'Hide Time Windows' : 'Schedule Specific Windows (Optional)')}
                                                                    </div>

                                                                    <AnimatePresence>
                                                                        {showWindowOverrides && (
                                                                            <motion.div
                                                                                initial={{ opacity: 0, height: 0 }}
                                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                                exit={{ opacity: 0, height: 0 }}
                                                                                className="overflow-hidden mt-4 space-y-3"
                                                                            >
                                                                                {campaignWindows.map((w, idx) => (
                                                                                    <motion.div
                                                                                        key={idx}
                                                                                        initial={{ opacity: 0, x: -10 }}
                                                                                        animate={{ opacity: 1, x: 0 }}
                                                                                        className="flex items-center gap-3 bg-white/80 backdrop-blur-sm p-3 rounded-2xl border border-indigo-100 shadow-sm hover:shadow-md transition-all group"
                                                                                    >
                                                                                        <div
                                                                                            onClick={() => setActiveWindowPicker({ idx, field: 'start' })}
                                                                                            className="flex-1 flex items-center gap-2 px-3 py-2 bg-indigo-50/50 rounded-xl border border-indigo-50 group-hover:border-indigo-200 transition-colors cursor-pointer"
                                                                                        >
                                                                                            <Clock size={14} className="text-indigo-400" />
                                                                                            <span className="text-xs font-black text-indigo-700">{formatTime12h(w.start)}</span>
                                                                                        </div>
                                                                                        <span className="text-indigo-200 font-bold">to</span>
                                                                                        <div
                                                                                            onClick={() => setActiveWindowPicker({ idx, field: 'end' })}
                                                                                            className="flex-1 flex items-center gap-2 px-3 py-2 bg-indigo-50/50 rounded-xl border border-indigo-50 group-hover:border-indigo-200 transition-colors cursor-pointer"
                                                                                        >
                                                                                            <Clock size={14} className="text-indigo-400" />
                                                                                            <span className="text-xs font-black text-indigo-700">{formatTime12h(w.end)}</span>
                                                                                        </div>
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => setCampaignWindows(campaignWindows.filter((_, i) => i !== idx))}
                                                                                            className="p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                                                                                        >
                                                                                            <X size={14} />
                                                                                        </button>
                                                                                    </motion.div>
                                                                                ))}
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => setCampaignWindows([...campaignWindows, { start: '09:00', end: '18:00' }])}
                                                                                    className="w-full py-3 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-widest hover:from-indigo-100 hover:to-purple-100 border border-dashed border-indigo-200 transition-all flex items-center justify-center gap-2"
                                                                                >
                                                                                    <Clock size={14} />
                                                                                    Add New Time Window
                                                                                </button>
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>

                                                                    <AnimatePresence>
                                                                        {activeWindowPicker && (
                                                                            <PremiumDateTimePicker
                                                                                mode="time"
                                                                                value={activeWindowPicker.field === 'start' ? campaignWindows[activeWindowPicker.idx].start : campaignWindows[activeWindowPicker.idx].end}
                                                                                onChange={(val) => {
                                                                                    const nw = [...campaignWindows];
                                                                                    nw[activeWindowPicker.idx][activeWindowPicker.field] = val;
                                                                                    setCampaignWindows(nw);
                                                                                }}
                                                                                onClose={() => setActiveWindowPicker(null)}
                                                                                label={`Window ${activeWindowPicker.field === 'start' ? 'Start' : 'End'} - Slot ${activeWindowPicker.idx + 1}`}
                                                                            />
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* Send Mode Toggle */}
                                            <div className="flex bg-gray-50 p-1.5 rounded-2xl">
                                                <button
                                                    onClick={() => setSendMode('now')}
                                                    className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${sendMode === 'now' ? 'bg-white text-gray-800 shadow-md' : 'text-gray-400 hover:text-gray-600'
                                                        }`}
                                                >
                                                    <Send size={11} /> Send Now
                                                </button>
                                                <button
                                                    onClick={() => setSendMode('schedule')}
                                                    className={`flex-1 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all ${sendMode === 'schedule' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-400 hover:text-gray-600'
                                                        }`}
                                                >
                                                    <Clock size={11} /> Schedule
                                                </button>
                                            </div>

                                            {/* Schedule Options */}
                                            <AnimatePresence>
                                                {sendMode === 'schedule' && (
                                                    <motion.div
                                                        key="schedule-opts"
                                                        initial={{ opacity: 0, height: 0 }}
                                                        animate={{ opacity: 1, height: 'auto' }}
                                                        exit={{ opacity: 0, height: 0 }}
                                                        transition={{ duration: 0.2 }}
                                                        className="overflow-hidden space-y-3"
                                                    >
                                                        {/* Campaign Name */}
                                                        <div>
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Campaign Name (optional)</label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. Eid Offer Campaign"
                                                                className="w-full px-5 py-3 bg-gray-50 border-2 border-transparent focus:border-indigo-300 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700 text-sm"
                                                                value={campaignName}
                                                                onChange={e => setCampaignName(e.target.value)}
                                                            />
                                                        </div>
                                                        {/* DateTime Picker */}
                                                        <div>
                                                            <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Schedule Date & Time <span className="text-red-400">*</span></label>
                                                            <div
                                                                onClick={() => setShowDatePicker(true)}
                                                                className="w-full px-5 py-3 bg-gray-50 border-2 border-transparent hover:border-indigo-300 cursor-pointer rounded-2xl outline-none transition-all font-bold text-gray-700 text-sm flex items-center justify-between group"
                                                            >
                                                                <span className={scheduledAt ? 'text-gray-800' : 'text-gray-400'}>
                                                                    {scheduledAt
                                                                        ? (isWindowsActive && !isInsideActiveWindow && /^\d{4}-\d{2}-\d{2}$/.test(scheduledAt)
                                                                            ? new Date(scheduledAt).toLocaleDateString([], { dateStyle: 'long' })
                                                                            : new Date(scheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
                                                                        : (isWindowsActive && !isInsideActiveWindow ? 'Choose Launch Date' : 'Choose Launch Window')}
                                                                </span>
                                                                <Calendar size={18} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
                                                            </div>
                                                        </div>

                                                        <AnimatePresence>
                                                            {showDatePicker && (
                                                                <PremiumDateTimePicker
                                                                    mode={isWindowsActive && !isInsideActiveWindow ? 'date' : 'datetime'}
                                                                    value={scheduledAt}
                                                                    onChange={setScheduledAt}
                                                                    onClose={() => setShowDatePicker(false)}
                                                                    label={isWindowsActive && !isInsideActiveWindow ? 'Select Launch Date' : 'Campaign Launch Window'}
                                                                />
                                                            )}
                                                        </AnimatePresence>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>

                                            {/* Send / Schedule Button */}
                                            <AnimatePresence mode="wait">
                                                {isSending ? (
                                                    <motion.div
                                                        key="sending-now"
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="w-full space-y-3"
                                                    >
                                                        <div className={`w-full py-6 rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-2xl uppercase tracking-[0.2em] bg-wa-sidebar text-white`}>
                                                            <div className="flex flex-col items-center">
                                                                <Loader2 className="animate-spin mb-1" size={24} />
                                                                <span className="text-[10px] font-bold opacity-70">Sending {progress.current} of {progress.total}...</span>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => stopRef.current = true}
                                                            className="w-full py-2 rounded-lg text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 border border-rose-100 transition-all font-outfit"
                                                        >
                                                            Stop Execution
                                                        </button>
                                                    </motion.div>
                                                ) : sendMode === 'now' ? (
                                                    <motion.button
                                                        key={success ? 'success' : 'send-now'}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        onClick={handleSend}
                                                        disabled={!message || isSending}
                                                        className={`w-full py-6 rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-2xl uppercase tracking-[0.2em] ${success
                                                            ? 'bg-wa-teal text-white shadow-wa-teal/30'
                                                            : 'bg-wa-sidebar text-white hover:bg-black disabled:bg-gray-100 disabled:text-gray-400 disabled:shadow-none'
                                                            }`}
                                                    >
                                                        {success ? (
                                                            <><CheckCircle size={24} /> Sent Successfully!</>
                                                        ) : (
                                                            <><Send size={20} /> Launch Campaign</>
                                                        )}
                                                    </motion.button>
                                                ) : (
                                                    <motion.button
                                                        key={scheduleSuccess ? 'sched-success' : 'sched-idle'}
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        exit={{ opacity: 0, y: -10 }}
                                                        onClick={handleSchedule}
                                                        disabled={!message || !scheduledAt || isScheduling}
                                                        className={`w-full py-6 rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-2xl uppercase tracking-[0.2em] ${scheduleSuccess
                                                            ? 'bg-indigo-500 text-white shadow-indigo-500/30'
                                                            : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:from-indigo-700 hover:to-purple-700 disabled:opacity-40 disabled:shadow-none'
                                                            }`}
                                                    >
                                                        {isScheduling ? (
                                                            <><Loader2 className="animate-spin" size={20} /> Scheduling...</>
                                                        ) : scheduleSuccess ? (
                                                            <><CheckCircle size={24} /> Campaign Scheduled!
                                                            </>
                                                        ) : (
                                                            <><Clock size={20} /> Schedule Campaign</>
                                                        )}
                                                    </motion.button>
                                                )}
                                            </AnimatePresence>

                                            <div className="flex items-start gap-3 p-4 bg-blue-50/50 rounded-2xl border border-blue-50">
                                                <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
                                                <p className="text-[10px] font-bold text-blue-600 leading-relaxed uppercase tracking-tight">
                                                    WARNING: Sending a large number of messages simultaneously may result in temporary WhatsApp account suspension. Use with caution.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

            </motion.div >

            <AnimatePresence>
                {pendingSafetyPopup && (
                    <div className="fixed inset-0 z-[500000] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-rose-950/60 backdrop-blur-md"
                            onClick={() => setPendingSafetyPopup(null)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-3xl border border-rose-100/50 overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 text-rose-500 opacity-5 -translate-y-4 translate-x-4"><Clock size={160} /></div>
                            <div className="relative space-y-8">
                                <div className="p-5 bg-gradient-to-br from-rose-500 to-rose-600 w-fit rounded-3xl text-white shadow-xl shadow-rose-200 ring-4 ring-rose-50">
                                    <Clock size={32} />
                                </div>
                                <div className="space-y-3">
                                    <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight leading-none">{pendingSafetyPopup.title}</h3>
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                                        <p className="text-[10px] font-extrabold text-rose-500 uppercase tracking-[0.2em]">Global Status: Disabled</p>
                                    </div>
                                </div>
                                <div className="p-5 bg-rose-50/80 rounded-[2rem] border border-rose-100/50 backdrop-blur-sm">
                                    <p className="text-xs font-bold text-rose-900 leading-relaxed tracking-wide">{pendingSafetyPopup.reason}</p>
                                </div>
                                <button
                                    onClick={() => setPendingSafetyPopup(null)}
                                    className="w-full py-5 bg-gray-900 text-white rounded-[1.5rem] font-black text-[11px] uppercase tracking-[0.3em] shadow-2xl hover:bg-black hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >Understood</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};

export default AIGenerator;
