import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, ChevronDown, Users, User, Send, Clock, Loader2, CheckCircle, MessageSquare, X, Image as ImageIcon, Video, Plus, Paperclip, Activity, Calendar, Settings2 } from 'lucide-react';
import { Contact, Group, TemplateOption } from './types';
import PremiumSelect from '../common/PremiumSelect';
import PremiumDateTimePicker from '../common/PremiumDateTimePicker';
import { Socket } from 'socket.io-client';
import { isCurrentlyInsideActiveWindow } from '../common/windowUtils';

interface TemplateCampaignProps {
    showTemplateCampaign: boolean;
    setShowTemplateCampaign: (show: boolean) => void;
    contacts: Contact[];
    groups: Group[];
    isConnected: boolean;
    socket: Socket | null;
}

const TemplateCampaign: React.FC<TemplateCampaignProps> = ({
    showTemplateCampaign, setShowTemplateCampaign, contacts, groups, isConnected, socket
}) => {
    const [allTemplates, setAllTemplates] = useState<TemplateOption[]>([]);
    const [templateSearch, setTemplateSearch] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateOption | null>(null);
    const [tmplCampaignMode, setTmplCampaignMode] = useState<'single' | 'group'>('single');
    const [tmplContactId, setTmplContactId] = useState('');
    const [tmplGroupId, setTmplGroupId] = useState('');
    const [tmplSendMode, setTmplSendMode] = useState<'now' | 'schedule'>('now');
    const [tmplScheduledAt, setTmplScheduledAt] = useState('');
    const [tmplCampaignName, setTmplCampaignName] = useState('');
    const [isTemplateSending, setIsTemplateSending] = useState(false);
    const [isTemplateScheduling, setIsTemplateScheduling] = useState(false);
    const [showPremiumPicker, setShowPremiumPicker] = useState(false);
    const [templateSendSuccess, setTemplateSendSuccess] = useState(false);
    const [templateScheduleSuccess, setTemplateScheduleSuccess] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [tmplProgress, setTmplProgress] = useState({ current: 0, total: 0 });
    const [customMinDelay, setCustomMinDelay] = useState<string>('');
    const [customMaxDelay, setCustomMaxDelay] = useState<string>('');
    const [advancedSpeedMode, setAdvancedSpeedMode] = useState(false);
    const [showJitterOverrides, setShowJitterOverrides] = useState(false);
    const [campaignWindows, setCampaignWindows] = useState<{ start: string, end: string }[]>([]);
    const [showWindowOverrides, setShowWindowOverrides] = useState(false);
    const [respectExecutionWindows, setRespectExecutionWindows] = useState(true);
    const [activeWindowPicker, setActiveWindowPicker] = useState<{ idx: number, field: 'start' | 'end' } | null>(null);
    const [adjustmentNotice, setAdjustmentNotice] = useState<string | null>(null);
    const [globalSettings, setGlobalSettings] = useState<any>({});
    const [pendingSafetyPopup, setPendingSafetyPopup] = useState<{ title: string, reason: string } | null>(null);
    const [tmplWaitSeconds, setTmplWaitSeconds] = useState(30);
    const stopRef = useRef(false);
    const mediaInputRef = useRef<HTMLInputElement>(null);
    const [editableContent, setEditableContent] = useState('');
    const [editableMediaUrl, setEditableMediaUrl] = useState('');
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

    useEffect(() => {
        if (showTemplateCampaign) {
            if (allTemplates.length === 0) {
                fetch('http://localhost:3001/api/templates')
                    .then(r => r.json())
                    .then(setAllTemplates)
                    .catch(err => console.error('Failed to load templates:', err));
            }

            fetch('http://localhost:3001/api/settings')
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        setGlobalSettings(data.settings || {});
                        if (data.settings?.execution_windows && campaignWindows.length === 0) {
                            setCampaignWindows(JSON.parse(data.settings.execution_windows));
                        }

                        // Smart Initialization for Speed States
                        if (data.settings?.scheduler_delay_min_ms && data.settings?.scheduler_delay_max_ms) {
                            const minVal = parseInt(data.settings.scheduler_delay_min_ms) / 1000;
                            const maxVal = parseInt(data.settings.scheduler_delay_max_ms) / 1000;
                            const avgVal = Math.round((minVal + maxVal) / 2);
                            setTmplWaitSeconds(avgVal);
                            if (!customMinDelay) setCustomMinDelay(minVal.toString());
                            if (!customMaxDelay) setCustomMaxDelay(maxVal.toString());
                        }
                    }
                })
                .catch(err => console.error('Failed to load global settings:', err));
        }
    }, [showTemplateCampaign, allTemplates.length]);

    const handleMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('http://localhost:3001/upload', {
                method: 'POST',
                body: formData
            });
            const data = await res.json();
            if (data.url) {
                setEditableMediaUrl(`http://localhost:3001${data.url}`);
            }
        } catch (err) {
            console.error('Media upload failed:', err);
        }
    };

    const handleTemplateSendNow = async () => {
        if (!isConnected || !selectedTemplate) {
            alert(!isConnected ? "WhatsApp not connected!" : "Please select a template.");
            return;
        }

        const targets = tmplCampaignMode === 'single'
            ? contacts.filter(c => String(c.id) === String(tmplContactId))
            : contacts.filter(c => c.groupNames?.includes(groups.find(g => String(g.id) === String(tmplGroupId))?.name || '_INVALID_GROUP_'));

        if (targets.length === 0) {
            alert(`No recipients found for the selected ${tmplCampaignMode === 'single' ? 'contact' : 'group'}.`);
            return;
        }

        setIsTemplateSending(true);
        setTmplProgress({ current: 0, total: targets.length });
        stopRef.current = false;

        let templateContent = selectedTemplate.content;
        if (!templateContent) {
            try {
                const res = await fetch(`http://localhost:3001/api/templates/${selectedTemplate.id}`);
                const data = await res.json();
                if (data.success) {
                    templateContent = data.template.content;
                } else { throw new Error(data.error || "Template not found"); }
            } catch (err: any) {
                alert("Failed to fetch template content: " + err.message);
                setIsTemplateSending(false);
                return;
            }
        }

        try {
            let finalAttachments: any[] | undefined = undefined;
            if (selectedTemplate) {
                const originalFirstMediaUrl = selectedTemplate.media_path
                    ? (selectedTemplate.media_path.startsWith('http') ? selectedTemplate.media_path : `http://localhost:3001${selectedTemplate.media_path}`)
                    : '';
                if (!editableMediaUrl) {
                    finalAttachments = [];
                } else if (editableMediaUrl !== originalFirstMediaUrl) {
                    finalAttachments = [{ url: editableMediaUrl }];
                } else {
                    finalAttachments = selectedTemplate.attachments || (selectedTemplate.media_path ? [{ url: selectedTemplate.media_path }] : []);
                }
            }

            // --- Delay Calculation ---
            let finalDelayMin: number | undefined = undefined;
            let finalDelayMax: number | undefined = undefined;

            if (showJitterOverrides) {
                if (advancedSpeedMode) {
                    finalDelayMin = customMinDelay ? parseInt(customMinDelay) * 1000 : undefined;
                    finalDelayMax = customMaxDelay ? parseInt(customMaxDelay) * 1000 : undefined;
                } else {
                    finalDelayMin = Math.max(1000, (tmplWaitSeconds - 5) * 1000);
                    finalDelayMax = (tmplWaitSeconds + 5) * 1000;
                }
            }

            const bodyPayload = {
                targets,
                text: editableContent || templateContent,
                templateId: selectedTemplate.id,
                delayMin: finalDelayMin,
                delayMax: finalDelayMax,
                executionWindows: campaignWindows.length > 0 ? campaignWindows : undefined,
                respectExecutionWindows,
                attachments: finalAttachments && finalAttachments.length > 0 ? finalAttachments : undefined
            };

            const response = await fetch('http://localhost:3001/api/campaigns/run-instant', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(bodyPayload)
            });
            const resData = await response.json();
            if (!resData.success) throw new Error(resData.error || 'Failed to start campaign');

            setTemplateSendSuccess(true);
            setTimeout(() => {
                setTemplateSendSuccess(false);
                setShowTemplateCampaign(false);
            }, 2000);
            setTmplContactId('');
            setTmplGroupId('');
        } catch (err: any) {
            console.error('Failed to start server-side campaign:', err);
            alert("Error: " + (err.message || "Failed to start server-side execution. Check backend logs."));
        } finally {
            setIsTemplateSending(false);
        }
    };

    const handleTemplateSchedule = async () => {
        if (!selectedTemplate) {
            alert("Please select a template first.");
            return;
        }
        if (!tmplScheduledAt) {
            alert("Please select a scheduled date and time.");
            return;
        }

        const targetId = tmplCampaignMode === 'single' ? tmplContactId : tmplGroupId;
        const targetType = tmplCampaignMode === 'single' ? 'contact' : 'group';

        const targetObj = tmplCampaignMode === 'single'
            ? contacts.find(c => String(c.id) === String(tmplContactId))
            : groups.find(g => String(g.id) === String(tmplGroupId));

        if (!targetId || !targetObj) {
            alert(`Please select a valid ${targetType} for the campaign.`);
            return;
        }

        let scheduledDate: Date;
        if (isWindowsActive && !isInsideActiveWindow && /^\d{4}-\d{2}-\d{2}$/.test(tmplScheduledAt)) {
            const [y, m, d] = tmplScheduledAt.split('-').map(Number);
            scheduledDate = new Date(y, m - 1, d, 0, 0, 0);
        } else {
            scheduledDate = new Date(tmplScheduledAt);
        }

        const now = new Date();
        const isToday = scheduledDate.toDateString() === now.toDateString();

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

        if (scheduledDate.getTime() <= now.getTime()) {
            alert("Scheduled time must be in the future.");
            return;
        }

        let templateContent = selectedTemplate.content;
        if (!templateContent) {
            try {
                const res = await fetch(`http://localhost:3001/api/templates/${selectedTemplate.id}`);
                const data = await res.json();
                if (data.success) {
                    templateContent = data.template.content;
                } else { throw new Error(data.error || "Template not found"); }
            } catch (err: any) {
                alert("Failed to fetch template content: " + err.message);
                return;
            }
        }

        const name = tmplCampaignName.trim() || `Template: ${selectedTemplate.title}`;

        let finalAttachments: any[] | undefined = undefined;
        if (selectedTemplate) {
            const originalFirstMediaUrl = selectedTemplate.media_path
                ? (selectedTemplate.media_path.startsWith('http') ? selectedTemplate.media_path : `http://localhost:3001${selectedTemplate.media_path}`)
                : '';
            if (!editableMediaUrl) {
                finalAttachments = [];
            } else if (editableMediaUrl !== originalFirstMediaUrl) {
                finalAttachments = [{ url: editableMediaUrl }];
            } else {
                finalAttachments = selectedTemplate.attachments || (selectedTemplate.media_path ? [{ url: selectedTemplate.media_path }] : []);
            }
        }

        // --- Delay Calculation ---
        let finalDelayMin: number | undefined = undefined;
        let finalDelayMax: number | undefined = undefined;

        if (showJitterOverrides) {
            if (advancedSpeedMode) {
                finalDelayMin = customMinDelay ? parseInt(customMinDelay) * 1000 : undefined;
                finalDelayMax = customMaxDelay ? parseInt(customMaxDelay) * 1000 : undefined;
            } else {
                finalDelayMin = Math.max(1000, (tmplWaitSeconds - 5) * 1000);
                finalDelayMax = (tmplWaitSeconds + 5) * 1000;
            }
        }

        setIsTemplateScheduling(true);
        try {
            const res = await fetch('http://localhost:3001/api/campaigns/schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    message: editableContent || templateContent,
                    target_type: targetType,
                    target_id: targetId,
                    target_name: targetObj.name,
                    scheduled_at: scheduledDate.toISOString(),
                    total_recipients: targetType === 'group' ? (targetObj as any).contactCount || 0 : 1,
                    template_id: selectedTemplate.id,
                    delayMin: finalDelayMin,
                    delayMax: finalDelayMax,
                    respect_execution_windows: 0, // Direct Launch overrides windows
                    attachments: finalAttachments && finalAttachments.length > 0 ? finalAttachments : undefined
                }),
            });
            const data = await res.json();
            if (data.success) {
                setTemplateScheduleSuccess(true);
                setTmplCampaignName('');
                setTmplScheduledAt('');
                setTmplSendMode('now');
                setTimeout(() => {
                    setTemplateScheduleSuccess(false);
                    setShowTemplateCampaign(false);
                }, 2000);
            } else {
                alert(data.error || "Failed to schedule campaign on server side.");
            }
        } catch (err: any) {
            console.error('Schedule failed:', err);
            alert("A network error occurred while scheduling the campaign.");
        } finally {
            setIsTemplateScheduling(false);
        }
    };

    return (
        <div className="relative group/campaign">
            {/* Animated Background Decorative Elements */}
            <div className="absolute -top-20 -left-20 w-80 h-80 bg-emerald-500/5 blur-[100px] rounded-full animate-pulse pointer-events-none" />
            <div className="absolute -bottom-20 -right-20 w-80 h-80 bg-blue-500/5 blur-[100px] rounded-full animate-pulse pointer-events-none" style={{ animationDelay: '2s' }} />

            <motion.div
                className="glass-card bg-white/40 backdrop-blur-3xl rounded-[3rem] shadow-[0_32px_120px_-20px_rgba(0,0,0,0.08)] border border-white/60 overflow-hidden relative z-10"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
                {/* Header Action / Toggle */}
                <button
                    onClick={() => setShowTemplateCampaign(!showTemplateCampaign)}
                    className="w-full flex items-center justify-between p-10 hover:bg-white/40 transition-all duration-500 group/header relative"
                >
                    <div className="flex items-center gap-6">
                        <div className="p-5 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-[1.5rem] text-white shadow-xl shadow-emerald-500/20 group-hover/header:scale-110 transition-transform duration-500">
                            <FileText size={28} />
                        </div>
                        <div className="text-left">
                            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Campaign Deployment</h2>
                            <p className="text-xs text-emerald-600/60 font-black uppercase tracking-[0.2em] mt-1 space-x-2">
                                <span>Precision Execution</span>
                                <span className="text-gray-300">•</span>
                                <span>Template Guided</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {showTemplateCampaign && (
                            <div className="hidden md:flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100/50">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                <span className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Active Master Session</span>
                            </div>
                        )}
                        <motion.div
                            animate={{ rotate: showTemplateCampaign ? 180 : 0, scale: showTemplateCampaign ? 1.1 : 1 }}
                            transition={{ type: "spring", stiffness: 300 }}
                            className="bg-gray-100 p-2 rounded-xl text-gray-400 group-hover/header:text-emerald-500 group-hover/header:bg-emerald-50 transition-colors"
                        >
                            <ChevronDown size={20} />
                        </motion.div>
                    </div>
                </button>

                <AnimatePresence>
                    {showTemplateCampaign && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                            className="overflow-hidden"
                        >
                            {/* Step Progress Indicator */}
                            <div className="px-10 pb-8 flex items-center justify-between border-b border-gray-100/50">
                                <div className="flex items-center gap-12">
                                    <div className="flex items-center gap-3 group/step">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-all duration-300 ${allTemplates.length > 0 ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white border-gray-200 text-gray-400'}`}>01</div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Step 01</span>
                                            <span className="text-[11px] font-black text-gray-900 uppercase">Library</span>
                                        </div>
                                    </div>
                                    <div className="w-12 h-[2px] bg-gray-100" />
                                    <div className="flex items-center gap-3 group/step">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-all duration-300 ${selectedTemplate ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white border-gray-200 text-gray-400'}`}>02</div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Step 02</span>
                                            <span className="text-[11px] font-black text-gray-900 uppercase">Intelligence</span>
                                        </div>
                                    </div>
                                    <div className="w-12 h-[2px] bg-gray-100" />
                                    <div className="flex items-center gap-3 group/step">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border-2 transition-all duration-300 ${(tmplContactId || tmplGroupId) && editableContent ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-white border-gray-200 text-gray-400'}`}>03</div>
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Step 03</span>
                                            <span className="text-[11px] font-black text-gray-900 uppercase">Launch</span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-10 pt-8">
                                <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
                                    <div className="lg:col-span-3 space-y-6">
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-6 bg-gradient-to-b from-emerald-400 to-teal-500 rounded-full" />
                                                <h3 className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Template Library</h3>
                                            </div>
                                            <span className="text-[9px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100/50">
                                                {allTemplates.length} Total
                                            </span>
                                        </div>
                                        <div className="relative group/search">
                                            <div className="absolute inset-0 bg-emerald-500/5 blur-xl group-focus-within/search:bg-emerald-500/10 transition-colors rounded-2xl" />
                                            <input
                                                type="text"
                                                placeholder="Search templates..."
                                                className="w-full px-6 py-5 bg-white/60 backdrop-blur-md border border-gray-100 focus:border-emerald-500/30 focus:bg-white rounded-[1.5rem] outline-none font-bold text-gray-700 transition-all pl-12 shadow-sm relative z-10"
                                                value={templateSearch}
                                                onChange={e => setTemplateSearch(e.target.value)}
                                            />
                                            <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within/search:text-emerald-500 transition-colors z-20" size={20} />
                                        </div>

                                        <div className="max-h-[550px] overflow-y-auto custom-scrollbar space-y-4 pr-3 scroll-smooth py-2">
                                            {allTemplates.filter(t => t.title.toLowerCase().includes(templateSearch.toLowerCase())).map(t => (
                                                <motion.button
                                                    key={t.id}
                                                    whileHover={{ scale: 1.02, x: 6 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => {
                                                        setSelectedTemplate(t);
                                                        setEditableContent(t.content || t.body || '');
                                                        const mUrl = t.media_path ? (t.media_path.startsWith('http') ? t.media_path : `http://localhost:3001${t.media_path}`) : '';
                                                        setEditableMediaUrl(mUrl);
                                                    }}
                                                    className={`w-full group text-left p-5 rounded-[2rem] transition-all relative overflow-hidden border ${selectedTemplate?.id === t.id
                                                        ? 'bg-gradient-to-br from-emerald-50 to-teal-50/30 border-emerald-200 shadow-lg shadow-emerald-500/5 ring-1 ring-emerald-500/10'
                                                        : 'bg-white/40 backdrop-blur-sm border-gray-100 hover:border-emerald-200 hover:bg-white/60 hover:shadow-md'
                                                        }`}
                                                >
                                                    <div className="relative z-10">
                                                        <div className="flex items-start justify-between">
                                                            <p className={`font-black text-sm tracking-tight transition-colors leading-tight mb-2 ${selectedTemplate?.id === t.id ? 'text-emerald-900' : 'text-gray-700 group-hover:text-emerald-800'}`}>{t.title}</p>
                                                            {selectedTemplate?.id === t.id && (
                                                                <div className="bg-emerald-500 text-white p-1 rounded-full shadow-lg shadow-emerald-500/20 animate-in zoom-in-50 duration-300">
                                                                    <CheckCircle size={10} strokeWidth={3} />
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{new Date(t.created_at).toLocaleDateString()}</span>
                                                                {t.media_path && <ImageIcon size={10} className="text-emerald-500/50" />}
                                                            </div>
                                                            <span className="text-[8px] font-black text-emerald-600/40 uppercase tracking-tight group-hover:text-emerald-600 transition-colors">Select Template</span>
                                                        </div>
                                                    </div>
                                                </motion.button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="lg:col-span-5 space-y-10">
                                        <div className="bg-white/60 backdrop-blur-2xl rounded-[3rem] p-10 border border-white/80 shadow-2xl relative z-20 group/intel">
                                            <div className="absolute top-0 right-0 w-48 h-48 bg-emerald-500/5 blur-[80px] rounded-full -mr-12 -mt-12 group-hover/intel:bg-emerald-500/10 transition-colors pointer-events-none" />

                                            <div className="flex items-center justify-between mb-8">
                                                <h3 className="text-[11px] font-black text-emerald-900 uppercase tracking-[0.25em] flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-inner">
                                                        <Users size={20} />
                                                    </div>
                                                    Step 1: Intelligence
                                                </h3>
                                                <div className="px-3 py-1 bg-emerald-50 rounded-lg border border-emerald-100/50">
                                                    <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Target Selection</span>
                                                </div>
                                            </div>

                                            <div className="flex bg-gray-100/50 backdrop-blur-sm p-1.5 rounded-[1.5rem] mb-8 shadow-inner border border-gray-100">
                                                <button
                                                    onClick={() => setTmplCampaignMode('single')}
                                                    className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${tmplCampaignMode === 'single' ? 'bg-white text-emerald-700 shadow-xl shadow-gray-200/50 ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    <User size={14} className={tmplCampaignMode === 'single' ? 'text-emerald-500' : 'text-gray-300'} />
                                                    Single Personal
                                                </button>
                                                <button
                                                    onClick={() => setTmplCampaignMode('group')}
                                                    className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all duration-300 flex items-center justify-center gap-2 ${tmplCampaignMode === 'group' ? 'bg-white text-emerald-700 shadow-xl shadow-gray-200/50 ring-1 ring-black/5' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    <Users size={14} className={tmplCampaignMode === 'group' ? 'text-emerald-500' : 'text-gray-300'} />
                                                    Mass Broadcast
                                                </button>
                                            </div>

                                            <div className="relative z-10 space-y-6">
                                                <div className="relative">
                                                    {tmplCampaignMode === 'single' ? (
                                                        <PremiumSelect
                                                            label="Select Direct Recipient"
                                                            icon={User}
                                                            options={contacts.map(c => ({
                                                                value: c.id,
                                                                label: c.name,
                                                                description: c.phone
                                                            }))}
                                                            value={tmplContactId}
                                                            onChange={setTmplContactId}
                                                            variant="emerald"
                                                        />
                                                    ) : (
                                                        <PremiumSelect
                                                            label="Select Target Broadcast Group"
                                                            icon={Users}
                                                            options={groups.map(g => ({
                                                                value: g.id,
                                                                label: g.name,
                                                                description: `${g.contactCount || 0} Registered Contacts`
                                                            }))}
                                                            value={tmplGroupId}
                                                            onChange={setTmplGroupId}
                                                            variant="emerald"
                                                        />
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        <AnimatePresence mode="wait">
                                            {selectedTemplate ? (
                                                <motion.div
                                                    key={selectedTemplate.id}
                                                    initial={{ opacity: 0, scale: 0.98, y: 10 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.98, y: -10 }}
                                                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                                                    className="bg-gray-900 rounded-[3rem] p-8 border border-gray-800 shadow-[0_40px_100px_-20px_rgba(0,0,0,0.4)] relative z-10 overflow-hidden group/preview"
                                                >
                                                    <div className="absolute top-6 right-10 flex gap-1.5 opacity-40 group-hover/preview:opacity-100 transition-opacity">
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50" />
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500/30" />
                                                        <div className="w-2 h-2 rounded-full bg-emerald-500/10" />
                                                    </div>

                                                    <div className="flex items-center justify-between mb-6">
                                                        <h3 className="text-[11px] font-black text-emerald-400 uppercase tracking-[0.25em] flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                                                <MessageSquare size={16} />
                                                            </div>
                                                            Content Master Preview
                                                        </h3>
                                                        <motion.button
                                                            whileHover={{ scale: 1.05, backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={() => {
                                                                setEditableContent(selectedTemplate.content || selectedTemplate.body || '');
                                                                const mUrl = selectedTemplate.media_path ? (selectedTemplate.media_path.startsWith('http') ? selectedTemplate.media_path : `http://localhost:3001${selectedTemplate.media_path}`) : '';
                                                                setEditableMediaUrl(mUrl);
                                                            }}
                                                            className="text-[9px] font-black text-emerald-500/70 hover:text-emerald-400 uppercase tracking-widest transition-all flex items-center gap-2 bg-emerald-500/5 px-4 py-2 rounded-xl border border-emerald-500/20"
                                                        >
                                                            <Loader2 size={12} className="group-hover:rotate-180 transition-transform duration-500" />
                                                            Restore Original
                                                        </motion.button>
                                                    </div>

                                                    <div className="bg-gray-800/40 backdrop-blur-xl rounded-[2rem] p-6 border border-white/5 min-h-[160px] relative focus-within:border-emerald-500/40 transition-all shadow-inner group/edit">
                                                        <textarea
                                                            className="w-full bg-transparent border-none outline-none resize-none text-gray-300 font-medium leading-relaxed min-h-[130px] custom-scrollbar text-sm placeholder:text-gray-600"
                                                            value={editableContent}
                                                            onChange={(e) => setEditableContent(e.target.value)}
                                                            placeholder="Type your message masterpiece here..."
                                                        />

                                                        {editableMediaUrl && (
                                                            <motion.div
                                                                initial={{ opacity: 0, scale: 0.9 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                className="mt-6 pt-6 border-t border-white/5"
                                                            >
                                                                <div className="relative group/media rounded-[2rem] overflow-hidden border border-white/10 bg-black/40 shadow-2xl">
                                                                    {editableMediaUrl.match(/\.(mp4|webm|ogg)$/i) ? (
                                                                        <video src={editableMediaUrl} className="w-full max-h-[220px] object-contain" controls />
                                                                    ) : editableMediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                                                                        <img src={editableMediaUrl} alt="Preview" className="w-full max-h-[220px] object-contain" />
                                                                    ) : (
                                                                        <div className="flex items-center gap-4 p-5">
                                                                            <div className="w-12 h-12 bg-emerald-500/20 rounded-2xl flex items-center justify-center text-emerald-400 shadow-lg">
                                                                                <FileText size={22} />
                                                                            </div>
                                                                            <div className="flex-1 overflow-hidden">
                                                                                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-1">Advanced Document Attached</p>
                                                                                <p className="text-[9px] font-bold text-gray-400 truncate tracking-wide">{editableMediaUrl.split('/').pop()}</p>
                                                                            </div>
                                                                        </div>
                                                                    )}
                                                                    <button
                                                                        onClick={() => setEditableMediaUrl('')}
                                                                        className="absolute top-3 right-3 p-2.5 bg-rose-500 text-white rounded-2xl opacity-0 group-hover/media:opacity-100 transition-all duration-300 shadow-xl hover:bg-rose-600 hover:scale-110"
                                                                    >
                                                                        <X size={16} />
                                                                    </button>
                                                                </div>
                                                            </motion.div>
                                                        )}

                                                        <div className="mt-6 flex items-center gap-3">
                                                            <input
                                                                type="file"
                                                                ref={mediaInputRef}
                                                                onChange={handleMediaUpload}
                                                                className="hidden"
                                                                accept="image/*,video/*,.pdf,.doc,.docx"
                                                            />
                                                            <motion.button
                                                                whileHover={{ scale: 1.02 }}
                                                                whileTap={{ scale: 0.98 }}
                                                                onClick={() => mediaInputRef.current?.click()}
                                                                className="flex items-center gap-3 px-6 py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-[10px] font-black text-white uppercase tracking-[0.15em] transition-all border border-white/10 shadow-lg"
                                                            >
                                                                <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                                                                    <Plus size={14} className="text-emerald-400" />
                                                                </div>
                                                                {editableMediaUrl ? 'Exchange Asset' : 'Inject Media Asset'}
                                                            </motion.button>
                                                        </div>
                                                    </div>
                                                    <div className="mt-6 flex flex-wrap items-center gap-5 text-[10px] font-black uppercase tracking-widest">
                                                        <div className="flex items-center gap-2 text-emerald-500/50 italic">
                                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                                            Dynamic Variable Injection Active
                                                        </div>
                                                        <div className="text-gray-600 ml-auto bg-gray-800/50 px-3 py-1 rounded-lg border border-white/5">
                                                            {editableContent.length} <span className="opacity-40">Chars</span>
                                                        </div>
                                                    </div>
                                                </motion.div>
                                            ) : (
                                                <div className="h-[400px] rounded-[3rem] border-2 border-dashed border-gray-100/50 flex flex-col items-center justify-center text-gray-300 space-y-5 bg-gray-50/30">
                                                    <motion.div
                                                        animate={{ y: [0, -10, 0] }}
                                                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                                        className="p-6 bg-white rounded-[2rem] shadow-xl shadow-gray-200/50"
                                                    >
                                                        <MessageSquare size={48} strokeWidth={1} className="text-emerald-500/20" />
                                                    </motion.div>
                                                    <div className="text-center">
                                                        <p className="text-xs font-black uppercase tracking-[0.3em] text-gray-400">Master Preview Interface</p>
                                                        <p className="text-[10px] font-bold text-gray-300 uppercase tracking-widest mt-2">Select a template to begin</p>
                                                    </div>
                                                </div>
                                            )}
                                        </AnimatePresence>
                                    </div>

                                    <div className="lg:col-span-4 space-y-8">
                                        <div className="bg-gradient-to-br from-emerald-50/80 to-teal-50/50 backdrop-blur-3xl rounded-[3rem] p-10 border border-white shadow-2xl relative overflow-hidden group/opt">
                                            <div className="absolute -bottom-12 -right-12 w-48 h-48 bg-emerald-500/5 blur-[60px] rounded-full pointer-events-none" />

                                            <h3 className="text-[11px] font-black text-emerald-900 uppercase tracking-[0.25em] mb-8 flex items-center gap-3">
                                                <div className="w-10 h-10 rounded-2xl bg-white flex items-center justify-center text-emerald-600 shadow-lg border border-emerald-50">
                                                    <Send size={18} />
                                                </div>
                                                Step 2: Optimization
                                            </h3>

                                            <div className="flex bg-white/40 backdrop-blur-md p-1.5 rounded-[1.5rem] mb-10 shadow-sm border border-white/60">
                                                <button
                                                    onClick={() => setTmplSendMode('now')}
                                                    className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 ${tmplSendMode === 'now' ? 'bg-white text-emerald-900 shadow-xl shadow-emerald-500/5 ring-1 ring-emerald-500/10' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    <Send size={14} className={tmplSendMode === 'now' ? 'text-emerald-500' : 'text-gray-300'} />
                                                    Direct Launch
                                                </button>
                                                <button
                                                    onClick={() => setTmplSendMode('schedule')}
                                                    className={`flex-1 py-4 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-300 ${tmplSendMode === 'schedule' ? 'bg-white text-teal-800 shadow-xl shadow-teal-500/5 ring-1 ring-teal-500/10' : 'text-gray-400 hover:text-gray-600'}`}
                                                >
                                                    <Clock size={14} className={tmplSendMode === 'schedule' ? 'text-teal-500' : 'text-gray-300'} />
                                                    Set Countdown
                                                </button>
                                            </div>

                                            {tmplSendMode === 'schedule' && (
                                                <div className="space-y-4">
                                                    <div className="flex items-center justify-between bg-white/80 p-4 rounded-3xl border border-emerald-50 shadow-sm transition-all hover:shadow-md">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2.5 rounded-2xl transition-colors ${respectExecutionWindows ? 'bg-emerald-100 text-emerald-600 shadow-inner' : 'bg-gray-100 text-gray-400'}`}>
                                                                <CheckCircle size={18} />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-gray-800 uppercase tracking-tight">Anti-Ban Windows</p>
                                                                <p className="text-[9px] font-extrabold text-emerald-600/50 uppercase tracking-tighter transition-opacity">{respectExecutionWindows ? 'Maximum Safety' : 'Bypass Protected'}</p>
                                                            </div>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => setRespectExecutionWindows(!respectExecutionWindows)}
                                                            className={`relative w-12 h-6 rounded-full transition-colors duration-300 focus:outline-none ring-4 ring-transparent ${respectExecutionWindows ? 'bg-emerald-500 shadow-lg shadow-emerald-500/20' : 'bg-gray-300 shadow-inner'}`}
                                                        >
                                                            <motion.div
                                                                animate={{ x: respectExecutionWindows ? 26 : 4 }}
                                                                transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                                                className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-lg"
                                                            />
                                                        </button>
                                                    </div>

                                                    <AnimatePresence>
                                                        {respectExecutionWindows && (
                                                            <motion.div
                                                                initial={{ opacity: 0, height: 0 }}
                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                exit={{ opacity: 0, height: 0 }}
                                                                className="overflow-hidden pt-4"
                                                            >
                                                                <div className="bg-emerald-50/50 rounded-2xl border border-emerald-100/60 p-4 shadow-inner">
                                                                    <div
                                                                        className="flex items-center justify-between cursor-pointer group/windowToggle"
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
                                                                        <div className="flex items-center gap-3">
                                                                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shadow-sm border ${globalSettings.enable_windows === 'false' ? 'bg-rose-50 text-rose-500 border-rose-100' : 'bg-white text-emerald-600 border-emerald-50 group-hover/windowToggle:border-emerald-200 group-hover/windowToggle:bg-emerald-50'}`}>
                                                                                <Clock size={14} />
                                                                            </div>
                                                                            <div>
                                                                                <p className={`text-[10px] font-black uppercase tracking-widest ${globalSettings.enable_windows === 'false' ? 'text-rose-600' : 'text-emerald-800'}`}>
                                                                                    {globalSettings.enable_windows === 'false' ? 'Global Restriction' : 'Active Time Frames'}
                                                                                </p>
                                                                                <p className="text-[8px] font-bold text-gray-400 uppercase tracking-wider">
                                                                                    {globalSettings.enable_windows === 'false' ? 'Windows Disabled By Admin' : (showWindowOverrides ? 'Click to collapse windows' : 'Click to configure hours')}
                                                                                </p>
                                                                            </div>
                                                                        </div>
                                                                        <div className={`p-1.5 rounded-lg transition-colors ${showWindowOverrides ? 'bg-emerald-100 text-emerald-600' : 'bg-white text-gray-400 shadow-sm border border-emerald-50'}`}>
                                                                            <ChevronDown size={14} className={`transition-transform duration-300 ${showWindowOverrides ? 'rotate-180' : ''}`} />
                                                                        </div>
                                                                    </div>

                                                                    <AnimatePresence>
                                                                        {showWindowOverrides && (
                                                                            <motion.div
                                                                                initial={{ opacity: 0, height: 0 }}
                                                                                animate={{ opacity: 1, height: 'auto' }}
                                                                                exit={{ opacity: 0, height: 0 }}
                                                                                className="overflow-hidden space-y-3 pt-4 mt-4 border-t border-emerald-100/50"
                                                                            >
                                                                                {campaignWindows.map((w, idx) => (
                                                                                    <div key={idx} className="flex flex-col sm:flex-row items-center gap-2">
                                                                                        <div className="flex-1 w-full flex items-center bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden group/window hover:border-emerald-300 transition-all">
                                                                                            <div className="px-3 py-2.5 bg-emerald-50 border-r border-emerald-100 text-emerald-600 flex items-center justify-center">
                                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                                                                            </div>
                                                                                            <div onClick={() => setActiveWindowPicker({ idx, field: 'start' })} className="flex-1 px-3 py-2 text-[10px] font-black text-gray-700 text-center cursor-pointer hover:bg-emerald-50/50 transition-colors">
                                                                                                {formatTime12h(w.start)}
                                                                                            </div>
                                                                                        </div>

                                                                                        <span className="text-emerald-300/80 text-[9px] font-black px-1 tracking-widest uppercase">TO</span>

                                                                                        <div className="flex-1 w-full flex items-center bg-white rounded-xl border border-emerald-100 shadow-sm overflow-hidden group/window hover:border-emerald-300 transition-all">
                                                                                            <div className="px-3 py-2.5 bg-indigo-50 border-r border-indigo-100 text-indigo-500 flex items-center justify-center">
                                                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>
                                                                                            </div>
                                                                                            <div onClick={() => setActiveWindowPicker({ idx, field: 'end' })} className="flex-1 px-3 py-2 text-[10px] font-black text-gray-700 text-center cursor-pointer hover:bg-indigo-50/50 transition-colors">
                                                                                                {formatTime12h(w.end)}
                                                                                            </div>
                                                                                        </div>

                                                                                        <button onClick={() => setCampaignWindows(campaignWindows.filter((_, i) => i !== idx))} className="sm:ml-1 w-full sm:w-auto p-2 bg-white border border-rose-100 text-rose-400 hover:text-white hover:bg-rose-500 rounded-xl transition-all shadow-sm flex items-center justify-center">
                                                                                            <X size={14} />
                                                                                        </button>
                                                                                    </div>
                                                                                ))}
                                                                                <button
                                                                                    onClick={() => setCampaignWindows([...campaignWindows, { start: '09:00', end: '18:00' }])}
                                                                                    className="w-full mt-3 py-3 bg-white text-emerald-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-dashed border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all flex items-center justify-center gap-2 shadow-sm"
                                                                                >
                                                                                    <Plus size={14} />
                                                                                    Add Execution Window
                                                                                </button>
                                                                            </motion.div>
                                                                        )}
                                                                    </AnimatePresence>
                                                                </div>
                                                            </motion.div>
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            )}

                                            <div className="space-y-4 p-2">
                                                {/* Unified Anti-Ban Speed Control */}
                                                <div className="bg-white p-6 rounded-[2rem] border border-emerald-50 shadow-sm relative overflow-hidden group/safety">
                                                    {/* Lock overlay if global is off */}
                                                    {globalSettings.enable_jitter === 'false' && (
                                                        <div className="absolute inset-0 z-20 bg-white/80 backdrop-blur-[2px] flex items-center justify-center p-6 text-center">
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 shadow-sm">Speed Control Restricted Disable In Settings</p>
                                                        </div>
                                                    )}

                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-3">
                                                            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                                                                <Activity size={18} className="animate-pulse" />
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-black text-gray-800 uppercase tracking-widest">Speed Control</p>
                                                                <p className="text-[9px] font-bold text-emerald-600/60 uppercase tracking-wider">
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
                                                                    className={`relative w-8 h-4 rounded-full transition-colors duration-200 focus:outline-none ${showJitterOverrides ? 'bg-emerald-500' : 'bg-gray-200'}`}
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
                                                                className="overflow-hidden pt-4 mt-2 border-t border-emerald-50/50"
                                                            >
                                                                <div className="flex items-center justify-between mb-4">
                                                                    <p className="text-[9px] font-bold text-gray-400">Configure delays for this campaign.</p>
                                                                    <button
                                                                        onClick={() => setAdvancedSpeedMode(!advancedSpeedMode)}
                                                                        className={`flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider px-2 py-1.5 rounded transition-colors ${advancedSpeedMode ? 'text-indigo-600 bg-indigo-50 border border-indigo-100' : 'text-gray-400 hover:bg-gray-50 border border-transparent'}`}
                                                                    >
                                                                        <Settings2 size={12} />
                                                                        {advancedSpeedMode ? 'Back to Simple' : 'Advanced Mode'}
                                                                    </button>
                                                                </div>

                                                                {!advancedSpeedMode ? (
                                                                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-5 bg-emerald-50/30 border border-emerald-100/50 rounded-2xl relative shadow-inner">
                                                                        <div className="flex items-center justify-between mb-4">
                                                                            <span className="text-[9px] font-black text-emerald-700/70 uppercase tracking-widest">Target Average Delay</span>
                                                                            <span className="text-[10px] font-black text-emerald-600 bg-white px-3 py-1 rounded-lg shadow-sm border border-emerald-100">{tmplWaitSeconds}s Precision</span>
                                                                        </div>
                                                                        <input
                                                                            type="range" min="10" max="120"
                                                                            className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-500 relative z-10"
                                                                            value={tmplWaitSeconds}
                                                                            onChange={e => setTmplWaitSeconds(Number(e.target.value))}
                                                                        />
                                                                        <div className="flex justify-between mt-3 text-[8px] font-black text-emerald-700/40 uppercase tracking-widest relative z-10">
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


                                            </div>

                                            <div className="mt-8 pt-8 border-t border-emerald-100/50 space-y-6">
                                                {tmplSendMode === 'schedule' && (
                                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                                                        <div className="space-y-2">
                                                            <label className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Campaign Label</label>
                                                            <input
                                                                type="text"
                                                                placeholder="e.g. Bulk Promo A"
                                                                className="w-full px-5 py-3 bg-white border border-emerald-100 focus:border-emerald-400 rounded-2xl text-xs font-black text-gray-800 outline-none shadow-sm transition-all"
                                                                value={tmplCampaignName} onChange={e => setTmplCampaignName(e.target.value)}
                                                            />
                                                        </div>
                                                        <div className="bg-gradient-to-br from-white to-emerald-50/50 p-6 rounded-3xl border border-emerald-100/80 shadow-xl shadow-emerald-900/5 space-y-4 relative group">
                                                            <div className="flex items-center justify-between relative z-10">
                                                                <div className="flex items-center gap-4">
                                                                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                                                                        <Clock size={20} />
                                                                    </div>
                                                                    <div>
                                                                        <p className="text-[10px] font-black text-gray-800 uppercase tracking-tight">{isWindowsActive ? 'Launch Date' : 'Launch Schedule'}</p>
                                                                        <p className="text-[9px] font-bold text-emerald-600/60 uppercase tracking-wider">{isWindowsActive ? 'Window Optimized' : 'Precision Timing'}</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* DateTime Picker */}
                                                            <div>
                                                                <div
                                                                    onClick={() => setShowDatePicker(true)}
                                                                    className="w-full px-5 py-3 bg-white border border-emerald-50 hover:border-emerald-200 cursor-pointer rounded-2xl outline-none transition-all font-bold text-gray-700 text-sm flex items-center justify-between group shadow-sm"
                                                                >
                                                                    <span className={tmplScheduledAt ? 'text-gray-800' : 'text-gray-400'}>
                                                                        {tmplScheduledAt
                                                                            ? (isWindowsActive && !isInsideActiveWindow && /^\d{4}-\d{2}-\d{2}$/.test(tmplScheduledAt)
                                                                                ? new Date(tmplScheduledAt).toLocaleDateString([], { dateStyle: 'long' })
                                                                                : new Date(tmplScheduledAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }))
                                                                            : (isWindowsActive && !isInsideActiveWindow ? 'Choose Launch Date' : 'Choose Launch Window')}
                                                                    </span>
                                                                    <Calendar size={18} className="text-gray-400 group-hover:text-emerald-500 transition-colors" />
                                                                </div>
                                                            </div>

                                                            <AnimatePresence>
                                                                {showDatePicker && (
                                                                    <PremiumDateTimePicker
                                                                        mode={isWindowsActive && !isInsideActiveWindow ? 'date' : 'datetime'}
                                                                        value={tmplScheduledAt}
                                                                        onChange={setTmplScheduledAt}
                                                                        onClose={() => setShowDatePicker(false)}
                                                                        label={isWindowsActive && !isInsideActiveWindow ? 'Select Launch Date' : 'Campaign Launch Window'}
                                                                    />
                                                                )}
                                                            </AnimatePresence>

                                                            <AnimatePresence>
                                                                {activeWindowPicker && (
                                                                    <PremiumDateTimePicker
                                                                        mode="time"
                                                                        value={campaignWindows[activeWindowPicker.idx][activeWindowPicker.field]}
                                                                        onChange={(newTime) => {
                                                                            const updatedWindows = [...campaignWindows];
                                                                            updatedWindows[activeWindowPicker.idx] = {
                                                                                ...updatedWindows[activeWindowPicker.idx],
                                                                                [activeWindowPicker.field]: newTime
                                                                            };
                                                                            setCampaignWindows(updatedWindows);
                                                                        }}
                                                                        onClose={() => setActiveWindowPicker(null)}
                                                                        label={`Adjust Window ${activeWindowPicker.field === 'start' ? 'Start' : 'End'}`}
                                                                    />
                                                                )}
                                                            </AnimatePresence>



                                                            <div className="bg-gray-900 rounded-[2rem] p-6 border border-gray-800 shadow-2xl relative overflow-hidden">
                                                                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
                                                                <div className="flex items-center justify-between mb-4">
                                                                    <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                                                        <Activity size={12} className="animate-pulse" /> Security Protocol
                                                                    </span>
                                                                    <div className="flex gap-1">
                                                                        <div className="w-1 h-3 bg-emerald-500/40 rounded-full" />
                                                                        <div className="w-1 h-4 bg-emerald-500/60 rounded-full" />
                                                                        <div className="w-1 h-2 bg-emerald-500/20 rounded-full" />
                                                                    </div>
                                                                </div>
                                                                <p className="text-[9px] font-bold text-gray-500 leading-relaxed uppercase tracking-widest italic">
                                                                    Artificial intelligence will verify variables before injection to prevent pattern detection.
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </div>

                                            <div className="pt-4">
                                                <AnimatePresence mode="wait">
                                                    {isTemplateSending ? (
                                                        <motion.div key="sending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                                                            <div className="w-full py-8 rounded-[2rem] font-black text-xs flex flex-col items-center justify-center gap-3 bg-gray-900 text-white shadow-2xl uppercase tracking-[0.3em] ring-1 ring-white/10">
                                                                <Loader2 size={28} className="animate-spin text-emerald-400" />
                                                                <div className="flex flex-col items-center">
                                                                    <span className="text-[8px] text-gray-500 mb-1">Satellite Broadcast Active</span>
                                                                    <span>{tmplProgress.current} / {tmplProgress.total} Complete</span>
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={() => stopRef.current = true}
                                                                className="w-full py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50/50 transition-all border border-rose-500/10"
                                                            >
                                                                Emergency Abort Mission
                                                            </button>
                                                        </motion.div>
                                                    ) : (
                                                        <motion.button
                                                            key={tmplSendMode === 'now' ? (templateSendSuccess ? 'success' : 'now') : (templateScheduleSuccess ? 's-success' : 'schedule')}
                                                            initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                                            whileHover={{ scale: 1.02, y: -4 }}
                                                            whileTap={{ scale: 0.98 }}
                                                            onClick={tmplSendMode === 'now' ? handleTemplateSendNow : handleTemplateSchedule}
                                                            disabled={isTemplateSending || isTemplateScheduling || (tmplCampaignMode === 'single' ? !tmplContactId : !tmplGroupId) || !selectedTemplate || (tmplSendMode === 'schedule' && !tmplScheduledAt)}
                                                            className={`w-full py-8 rounded-[2rem] font-black text-xs flex items-center justify-center gap-4 transition-all uppercase tracking-[0.4em] shadow-[0_25px_60px_-15px_rgba(16,185,129,0.4)] relative overflow-hidden group disabled:opacity-50 disabled:grayscale ${tmplSendMode === 'now'
                                                                ? (templateSendSuccess ? 'bg-emerald-500 text-white' : 'bg-gray-900 text-white hover:bg-black ring-1 ring-white/10')
                                                                : (templateScheduleSuccess ? 'bg-indigo-500 text-white' : 'bg-teal-900 text-white hover:bg-teal-950')
                                                                }`}
                                                        >
                                                            <div className="absolute inset-x-0 h-[1px] top-0 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                                                            <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/10 to-emerald-500/0 -translate-x-full group-hover:animate-[shimmer_2s_infinite]" />

                                                            {tmplSendMode === 'now' ? (
                                                                templateSendSuccess ? <><CheckCircle size={22} className="animate-bounce" /> Mission Success</> : <><Send size={20} className="group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" /> Deploy Now</>
                                                            ) : (
                                                                templateScheduleSuccess ? <><CheckCircle size={22} className="animate-bounce" /> Launch Scheduled</> : <><Clock size={20} className="group-hover:rotate-12 transition-transform" /> Schedule</>
                                                            )}
                                                        </motion.button>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </motion.div>

            <AnimatePresence>
                {pendingSafetyPopup && (
                    <div className="fixed inset-0 z-[200000] flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-rose-950/40 backdrop-blur-md"
                            onClick={() => setPendingSafetyPopup(null)}
                        />
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="relative w-full max-w-sm bg-white rounded-[2.5rem] p-8 shadow-2xl border border-rose-100 overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 text-rose-500 opacity-10"><Clock size={120} /></div>
                            <div className="relative space-y-6">
                                <div className="p-4 bg-rose-500 w-fit rounded-2xl text-white shadow-lg shadow-rose-200">
                                    <Clock size={28} />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">{pendingSafetyPopup.title}</h3>
                                    <p className="text-[11px] font-bold text-gray-400 leading-relaxed uppercase tracking-widest">Global Status: <span className="text-rose-500">Disabled</span></p>
                                </div>
                                <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                                    <p className="text-xs font-bold text-rose-800 leading-relaxed">{pendingSafetyPopup.reason}</p>
                                </div>
                                <button
                                    onClick={() => setPendingSafetyPopup(null)}
                                    className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all"
                                >Understood</button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TemplateCampaign;
