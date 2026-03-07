import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, FileText, ChevronDown, CheckCircle2, Loader2, AlertCircle, RefreshCw, Filter, Users, User, Search, Check, List, MessageSquare, Phone, Calendar, Trash, X } from 'lucide-react';
import { Contact, Group, TemplateOption, StatusFilter, SendGroupRecipient, SendGroup, DeleteCandidate, TemplateSendGroup } from './types';
import PremiumSelect from '../common/PremiumSelect';

interface SmartBulkDeleteProps {
    showDeletePanel: boolean;
    setShowDeletePanel: (show: boolean) => void;
}

const SmartBulkDelete: React.FC<SmartBulkDeleteProps> = ({
    showDeletePanel, setShowDeletePanel
}) => {
    const [templates, setTemplates] = useState<TemplateOption[]>([]);
    const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [numberFilterMode, setNumberFilterMode] = useState<'all' | 'smart' | 'manual'>('all');
    const [specificNumbers, setSpecificNumbers] = useState('');
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [candidates, setCandidates] = useState<DeleteCandidate[]>([]);
    const [previewDone, setPreviewDone] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [sendGroups, setSendGroups] = useState<TemplateSendGroup[]>([]);
    const [isLoadingGroups, setIsLoadingGroups] = useState(false);
    const [selectedSendDates, setSelectedSendDates] = useState<Record<number, string[]>>({});
    const [checkedRecipients, setCheckedRecipients] = useState<Set<string>>(new Set());

    const STATUS_OPTIONS: { value: StatusFilter; label: string; desc: string; color: string }[] = useMemo(() => [
        { value: 'not_read', label: 'Read করেনি', desc: 'delivered but not opened', color: 'border-blue-400 bg-blue-50 text-blue-700' },
        { value: 'not_delivered', label: 'Delivered পায়নি', desc: 'still stuck at sent', color: 'border-amber-400 bg-amber-50 text-amber-700' },
        { value: 'not_replied', label: 'Reply করেনি', desc: 'no response recorded', color: 'border-purple-400 bg-purple-50 text-purple-700' },
        { value: 'all', label: 'সবাই', desc: 'all recipients', color: 'border-gray-400 bg-gray-50 text-gray-700' },
    ], []);

    useEffect(() => {
        if (showDeletePanel && templates.length === 0) {
            fetch('http://localhost:3001/api/templates')
                .then(r => r.json())
                .then(setTemplates)
                .catch(err => console.error('Failed to load templates:', err));
        }
    }, [showDeletePanel, templates.length]);

    const fetchSendGroups = useCallback(async (ids: number[]) => {
        if (ids.length === 0) { setSendGroups([]); setCheckedRecipients(new Set()); return; }
        setIsLoadingGroups(true);
        try {
            const res = await fetch('http://localhost:3001/api/messages/template-send-groups', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateIds: ids }),
            });
            const data = await res.json();
            if (data.success) {
                setSendGroups(data.groups);
                const defaultDates: Record<number, string[]> = {};
                const allWids = new Set<string>();
                for (const tg of data.groups) {
                    defaultDates[tg.templateId] = tg.sendGroups.map((sg: SendGroup) => sg.sendDate);
                    tg.sendGroups.forEach((sg: SendGroup) => sg.recipients.forEach(r => allWids.add(r.whatsappId)));
                }
                setSelectedSendDates(defaultDates);
                setCheckedRecipients(allWids);
            }
        } catch (err) {
            console.error('Failed to load send groups:', err);
        } finally {
            setIsLoadingGroups(false);
        }
    }, []);

    const toggleTemplate = (id: number) => {
        setSelectedTemplateIds(prev => {
            const next = prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id];
            fetchSendGroups(next);
            return next;
        });
        setPreviewDone(false);
        setCandidates([]);
    };

    const toggleSendDate = (templateId: number, date: string) => {
        setSelectedSendDates(prev => {
            const currentDates = prev[templateId] ?? [];
            const nextDates = currentDates.includes(date)
                ? currentDates.filter(d => d !== date)
                : [...currentDates, date];
            return { ...prev, [templateId]: nextDates };
        });
        setPreviewDone(false);
        setCandidates([]);
    };

    const toggleRecipient = (wid: string) => {
        setCheckedRecipients(prev => {
            const next = new Set(prev);
            if (next.has(wid)) next.delete(wid);
            else next.add(wid);
            return next;
        });
        setPreviewDone(false);
        setCandidates([]);
    };

    const handlePreview = async () => {
        if (selectedTemplateIds.length === 0) return;
        setIsPreviewing(true);
        try {
            let numbers: string[] = [];
            if (numberFilterMode === 'smart') {
                numbers = visibleRecipients.filter(r => checkedRecipients.has(r.whatsappId)).map(r => r.number);
            } else if (numberFilterMode === 'manual') {
                numbers = specificNumbers.split(',').map(n => n.trim()).filter(Boolean);
            }
            const res = await fetch('http://localhost:3001/api/messages/delete-candidates/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ templateIds: selectedTemplateIds, statusFilter, numbers })
            });
            const data = await res.json();
            if (data.success) {
                setCandidates(data.candidates);
                setPreviewDone(true);
            }
        } catch {
            console.error('Preview failed');
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleBulkDelete = async () => {
        if (candidates.length === 0) return;
        setIsDeleting(true);
        try {
            const res = await fetch('http://localhost:3001/api/messages/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ whatsappIds: candidates.map(c => c.whatsapp_id) })
            });
            const data = await res.json();
            if (data.success) {
                setPreviewDone(false);
                setCandidates([]);
            }
        } catch {
            console.error('Delete failed');
        } finally {
            setIsDeleting(false);
        }
    };

    const visibleRecipients = useMemo(() => {
        const result: SendGroupRecipient[] = [];
        const seen = new Set<string>();
        for (const tg of sendGroups) {
            if (!selectedTemplateIds.includes(tg.templateId)) continue;
            const allowedDates = selectedSendDates[tg.templateId] || [];
            for (const sg of tg.sendGroups) {
                if (!allowedDates.includes(sg.sendDate)) continue;
                for (const r of sg.recipients) {
                    if (!seen.has(r.whatsappId)) {
                        result.push(r);
                        seen.add(r.whatsappId);
                    }
                }
            }
        }
        return result;
    }, [sendGroups, selectedSendDates, selectedTemplateIds]);

    return (
        <motion.div
            className="glass-card bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white overflow-hidden"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
        >
            <button
                onClick={() => setShowDeletePanel(!showDeletePanel)}
                className="w-full flex items-center justify-between p-8 hover:bg-red-50/30 transition-colors group"
            >
                <div className="flex items-center gap-5">
                    <div className="p-4 bg-red-100 rounded-2xl text-red-500 group-hover:bg-red-200 transition-colors">
                        <Trash2 size={26} />
                    </div>
                    <div className="text-left">
                        <h2 className="text-2xl font-black text-gray-800">Smart Bulk Delete</h2>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
                            Clean up specific campaign messages professionally
                        </p>
                    </div>
                </div>
                <motion.div animate={{ rotate: showDeletePanel ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown size={22} className="text-gray-400" />
                </motion.div>
            </button>

            <AnimatePresence>
                {showDeletePanel && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="px-8 pb-10 space-y-10">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {/* Step 1: Select Campaigns */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px]">1</span>
                                        Select Campaigns
                                    </h3>
                                    <div className="bg-gray-50/50 rounded-3xl p-5 border border-gray-100 space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {templates.map(t => (
                                            <button
                                                key={t.id}
                                                onClick={() => toggleTemplate(t.id)}
                                                className={`w-full p-4 rounded-2xl flex items-center justify-between transition-all border-2 ${selectedTemplateIds.includes(t.id) ? 'bg-white border-red-200 shadow-sm' : 'border-transparent hover:bg-white/50'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${selectedTemplateIds.includes(t.id) ? 'bg-red-500 border-red-500 text-white' : 'border-gray-200'}`}>
                                                        {selectedTemplateIds.includes(t.id) && <Check size={12} strokeWidth={4} />}
                                                    </div>
                                                    <span className={`text-sm font-bold ${selectedTemplateIds.includes(t.id) ? 'text-gray-900' : 'text-gray-500'}`}>{t.title}</span>
                                                </div>
                                            </button>
                                        ))}
                                        {templates.length === 0 && <p className="text-center py-10 text-gray-400 font-bold italic text-sm">No templates found</p>}
                                    </div>
                                </div>

                                {/* Step 2: Date Choice */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px]">2</span>
                                        Filter by date
                                    </h3>
                                    <div className="bg-gray-50/50 rounded-3xl p-5 border border-gray-100 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                                        {isLoadingGroups ? <div className="py-20 flex flex-col items-center gap-3 text-gray-400"><Loader2 className="animate-spin" /> <span className="text-[10px] font-black uppercase tracking-widest">Loading dates...</span></div> : (
                                            selectedTemplateIds.length === 0 ? <p className="text-center py-20 text-gray-400 font-bold italic text-sm px-4">Select templates first to see send dates</p> : (
                                                sendGroups.filter(tg => selectedTemplateIds.includes(tg.templateId)).map(tg => (
                                                    <div key={tg.templateId} className="space-y-2">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">{tg.templateTitle}</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {tg.sendGroups.map(sg => {
                                                                const active = (selectedSendDates[tg.templateId] || []).includes(sg.sendDate);
                                                                return (
                                                                    <button key={sg.sendDate} onClick={() => toggleSendDate(tg.templateId, sg.sendDate)} className={`px-4 py-2 rounded-xl text-[10px] font-black transition-all ${active ? 'bg-red-500 text-white shadow-md shadow-red-500/20' : 'bg-white text-gray-500 border border-gray-100 hover:border-red-200'}`}>
                                                                        {new Date(sg.sendDate).toLocaleDateString()}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                ))
                                            )
                                        )}
                                    </div>
                                </div>

                                {/* Step 3: Recipient Filter */}
                                <div className="space-y-4">
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2 px-1">
                                        <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-[10px]">3</span>
                                        Recipients & Status
                                    </h3>
                                    <div className="bg-gray-50/50 rounded-3xl p-5 border border-gray-100 space-y-6">
                                        <div className="space-y-3">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Message Status</p>
                                            <div className="grid grid-cols-2 gap-2">
                                                {STATUS_OPTIONS.map(opt => (
                                                    <button key={opt.value} onClick={() => { setStatusFilter(opt.value); setPreviewDone(false); setCandidates([]); }} className={`p-3 rounded-2xl border-2 text-left transition-all ${statusFilter === opt.value ? 'bg-white border-gray-800 shadow-sm' : 'border-transparent hover:bg-white/50'}`}>
                                                        <p className="text-[10px] font-black text-gray-800">{opt.label}</p>
                                                        <p className="text-[8px] font-bold text-gray-400 uppercase tracking-tight">{opt.desc}</p>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="space-y-3">
                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Number Filter</p>
                                            <div className="flex bg-white p-1 rounded-2xl border border-gray-100">
                                                <button onClick={() => setNumberFilterMode('all')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${numberFilterMode === 'all' ? 'bg-gray-800 text-white' : 'text-gray-400'}`}>All</button>
                                                <button onClick={() => setNumberFilterMode('smart')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${numberFilterMode === 'smart' ? 'bg-gray-800 text-white' : 'text-gray-400'}`}>Hybrid</button>
                                                <button onClick={() => setNumberFilterMode('manual')} className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${numberFilterMode === 'manual' ? 'bg-gray-800 text-white' : 'text-gray-400'}`}>Manual</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Hybrid Selector - Dynamic Panel */}
                            <AnimatePresence>
                                {numberFilterMode === 'smart' && visibleRecipients.length > 0 && (
                                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100">
                                        <div className="flex items-center justify-between mb-6 px-2">
                                            <div>
                                                <h4 className="text-xl font-black text-gray-800">Select Recipients</h4>
                                                <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Refine who gets their messages deleted</p>
                                            </div>
                                            <div className="flex items-center gap-3 bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
                                                <button onClick={() => { setCheckedRecipients(new Set(visibleRecipients.map(r => r.whatsappId))); setPreviewDone(false); setCandidates([]); }} className="px-4 py-2 rounded-xl text-[10px] font-black text-gray-600 hover:bg-gray-50 transition-all uppercase tracking-widest">Select All</button>
                                                <div className="w-[1px] h-4 bg-gray-100" />
                                                <button onClick={() => { setCheckedRecipients(new Set()); setPreviewDone(false); setCandidates([]); }} className="px-4 py-2 rounded-xl text-[10px] font-black text-red-500 hover:bg-red-50 transition-all uppercase tracking-widest">Clear</button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                            {visibleRecipients.map(r => (
                                                <button key={r.whatsappId} onClick={() => toggleRecipient(r.whatsappId)} className={`p-4 rounded-2xl flex items-center gap-3 transition-all border-2 text-left ${checkedRecipients.has(r.whatsappId) ? 'bg-white border-indigo-400 shadow-md' : 'border-transparent bg-white/40 opacity-60'}`}>
                                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${checkedRecipients.has(r.whatsappId) ? 'bg-indigo-500 border-indigo-500 text-white' : 'border-gray-200'}`}>{checkedRecipients.has(r.whatsappId) && <Check size={12} strokeWidth={4} />}</div>
                                                    <div className="min-w-0">
                                                        <p className="font-black text-gray-800 text-[11px] truncate whitespace-nowrap overflow-hidden">{r.name || r.number}</p>
                                                        <p className="text-[9px] text-gray-400 font-bold">{r.number}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {numberFilterMode === 'manual' && (
                                    <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="p-8 bg-gray-50/50 rounded-[2.5rem] border border-gray-100">
                                        <h4 className="text-xl font-black text-gray-800 mb-2 px-2">Manual Number Entry</h4>
                                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-6 px-2">Enter phone numbers separated by commas</p>
                                        <textarea rows={3} placeholder="8801700000000, 8801800000000..." className="w-full p-6 bg-white border-2 border-transparent focus:border-red-500/20 rounded-3xl outline-none font-bold text-gray-700 shadow-sm resize-none" value={specificNumbers} onChange={e => { setSpecificNumbers(e.target.value); setPreviewDone(false); setCandidates([]); }} />
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Action Bar */}
                            <div className="flex flex-col md:flex-row items-center gap-6 pt-6 border-t border-gray-50">
                                {!previewDone ? (
                                    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handlePreview} disabled={selectedTemplateIds.length === 0 || isPreviewing} className="w-full md:w-auto px-12 py-5 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-2xl disabled:opacity-50 transition-all">
                                        {isPreviewing ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Scan Messages
                                    </motion.button>
                                ) : (
                                    <div className="flex flex-col md:flex-row items-center gap-6 w-full">
                                        <div className="flex items-center gap-4 px-6 py-4 bg-red-50 rounded-2xl border border-red-100 flex-1">
                                            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600 font-black text-lg">{candidates.length}</div>
                                            <div>
                                                <p className="font-black text-gray-800 text-sm">Candidates found</p>
                                                <p className="text-[10px] text-red-500 font-bold uppercase tracking-widest">Ready for permanent deletion</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 w-full md:w-auto">
                                            <button onClick={() => { setPreviewDone(false); setCandidates([]); }} className="px-6 py-5 rounded-2xl font-black text-xs text-gray-400 uppercase tracking-widest hover:text-gray-600 transition-all">Cancel</button>
                                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleBulkDelete} disabled={candidates.length === 0 || isDeleting} className="flex-1 md:flex-none px-12 py-5 bg-red-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-red-500/20 transition-all border-0 ring-4 ring-white">
                                                {isDeleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} Delete Forever
                                            </motion.button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
};

export default SmartBulkDelete;
