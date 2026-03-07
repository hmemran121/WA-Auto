import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Layout,
    FileText,
    Plus,
    Search,
    File as FileIcon,
    Edit2,
    Trash2,
    Zap,
    X,
    CheckCircle,
    CheckCircle2,
    Tag,
    Paperclip,
    Save,
    Bold,
    Italic,
    Strikethrough,
    Code,
    Copy,
    Pin,
    PinOff,
    Settings,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Info,
    Mic,
    Volume2,
    Square,
    Play,
    Pause,
    BarChart3,
    Library,
    Shuffle,
    Globe,
    MapPin,
    UserCircle2
} from 'lucide-react';
import { Template } from '../types';
import { TEMPLATE_CATEGORIES, PREDEFINED_TEMPLATES } from '../constants/templateLibrary';

const CATEGORY_COLORS: Record<string, string> = {
    'General': 'bg-gray-100 text-gray-600',
    'Welcome': 'bg-indigo-100 text-indigo-700',
    'Sales': 'bg-blue-100 text-blue-700',
    'Follow-up': 'bg-sky-100 text-sky-700',
    'Support': 'bg-emerald-100 text-emerald-700',
    'Reminder': 'bg-teal-100 text-teal-700',
    'Marketing': 'bg-fuchsia-100 text-fuchsia-700',
    'Payment': 'bg-rose-100 text-rose-700',
    'Feedback': 'bg-amber-100 text-amber-700',
    'Alert': 'bg-orange-100 text-orange-700',
    'Custom': 'bg-slate-100 text-slate-700',
    'default': 'bg-wa-teal/10 text-wa-teal'
};

const getCategoryColor = (category: string) => {
    return CATEGORY_COLORS[category] || CATEGORY_COLORS['default'];
};

const VoiceMessagePreview: React.FC<{ url: string; isTemplatePreview?: boolean }> = ({ url, isTemplatePreview }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            const current = audioRef.current.currentTime;
            const dur = audioRef.current.duration;
            setCurrentTime(current);
            setProgress((current / dur) * 100);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`flex items-center gap-3 p-3 ${isTemplatePreview ? 'bg-wa-teal/5' : 'bg-white'} rounded-2xl border border-wa-teal/10 shadow-sm w-full max-w-sm`}>
            <button
                onClick={togglePlay}
                className="w-10 h-10 flex items-center justify-center bg-wa-teal text-white rounded-full hover:scale-105 active:scale-95 transition-all shadow-lg shadow-wa-teal/20"
            >
                {isPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} className="ml-0.5" fill="currentColor" />}
            </button>

            <div className="flex-1 space-y-1">
                <div className="h-1.5 bg-wa-teal/10 rounded-full overflow-hidden relative">
                    <motion.div
                        className="absolute h-full bg-wa-teal"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                    />
                </div>
                <div className="flex justify-between items-center text-[10px] font-black tracking-widest uppercase text-wa-teal/60">
                    <span>{formatTime(currentTime)}</span>
                    <div className="flex items-center gap-1">
                        <Volume2 size={10} />
                        <span>{formatTime(duration)}</span>
                    </div>
                </div>
            </div>

            <audio
                ref={audioRef}
                src={url.startsWith('http') ? url : `http://localhost:3001${url}`}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
            />
        </div>
    );
};

const TemplatesView: React.FC = () => {
    const [templates, setTemplates] = useState<Template[]>([]);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortByUsage, setSortByUsage] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
    const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
    const [formData, setFormData] = useState({
        title: '',
        content: '',
        category: 'General',
        attachments: [] as { url: string; type: string, caption?: string, lat?: string, lng?: string, name?: string, phone?: string }[]
    });
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
    const [showLivePreview, setShowLivePreview] = useState(true);
    const [selection, setSelection] = useState<{ start: number, end: number, text: string } | null>(null);
    const [showAIModal, setShowAIModal] = useState(false);
    const [showLocationModal, setShowLocationModal] = useState(false);
    const [locationData, setLocationData] = useState({ lat: '', lng: '', name: '' });
    const [showVCardModal, setShowVCardModal] = useState(false);
    const [vcardData, setVcardData] = useState({ name: '', phone: '' });
    const [aiPrompt, setAIPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [useSpintaxAI, setUseSpintaxAI] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isVoiceUploading, setIsVoiceUploading] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const recordingInterval = useRef<any>(null);
    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    const [showLibraryModal, setShowLibraryModal] = useState(false);
    const [selectedLibraryCategory, setSelectedLibraryCategory] = useState(TEMPLATE_CATEGORIES[0]);
    const [librarySearchTerm, setLibrarySearchTerm] = useState('');
    const [selectedLibraryTemplate, setSelectedLibraryTemplate] = useState<Partial<Template> | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [showSpintaxModal, setShowSpintaxModal] = useState(false);
    const [spintaxInput, setSpintaxInput] = useState('');

    // Library logic
    const itemsPerPage = 6;
    const filteredLibraryTemplates = PREDEFINED_TEMPLATES.filter(t => {
        const matchesCategory = selectedLibraryCategory === 'All' || t.category === selectedLibraryCategory;
        const matchesSearch = (t.title?.toLowerCase().includes(librarySearchTerm.toLowerCase()) || t.content?.toLowerCase().includes(librarySearchTerm.toLowerCase()));
        return matchesCategory && matchesSearch;
    });

    const totalPages = Math.ceil(filteredLibraryTemplates.length / itemsPerPage);
    const currentTemplates = filteredLibraryTemplates.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const handlePageChange = (page: number) => setCurrentPage(page);
    const handleSelectTemplate = (template: Partial<Template>) => setSelectedLibraryTemplate(template);

    const handleApplyTemplate = () => {
        if (!selectedLibraryTemplate) return;
        setFormData({
            title: selectedLibraryTemplate.title || '',
            content: selectedLibraryTemplate.content || '',
            category: selectedLibraryTemplate.category || 'General',
            attachments: []
        });
        setEditingTemplate(null);
        setShowLibraryModal(false);
        setSelectedLibraryTemplate(null);
        setShowModal(true); // Open the normal Create Template modal with pre-filled data
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
                ? 'audio/ogg; codecs=opus'
                : 'audio/webm';
            const mediaRecorder = new MediaRecorder(stream, { mimeType });

            chunksRef.current = [];
            mediaRecorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };
            mediaRecorder.onstop = async () => {
                console.log('Recording stopped. Total chunks:', chunksRef.current.length);

                // Immediately transition states
                setIsRecording(false);
                setIsVoiceUploading(true);
                clearInterval(recordingInterval.current);

                try {
                    const blob = new Blob(chunksRef.current, { type: mimeType });
                    console.log('Blob created. Size:', blob.size);

                    if (blob.size === 0) {
                        console.error('Final audio blob is empty');
                        alert('ভয়েস রেকর্ডটি ফাঁকা (Empty) দেখাচ্ছে। দয়াকরে আবার রেকর্ড করুন।');
                        setIsVoiceUploading(false);
                        return;
                    }

                    const fileName = `voice-template-${Date.now()}.${mimeType.includes('ogg') ? 'ogg' : 'webm'}`;
                    const file = new File([blob], fileName, { type: mimeType });

                    // Upload the recording
                    const uploadData = new FormData();
                    uploadData.append('file', file);

                    console.log('Uploading voice recording:', fileName);
                    const response = await fetch('http://localhost:3001/upload', {
                        method: 'POST',
                        body: uploadData
                    });

                    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

                    const data = await response.json();
                    console.log('Upload success. Received:', data);

                    if (data.url) {
                        setFormData(prev => {
                            const updatedAttachments = [...(prev.attachments || []), {
                                url: data.url,
                                type: data.mimetype || mimeType,
                                caption: ''
                            }];
                            console.log('Updating formData with new attachment...');
                            return {
                                ...prev,
                                attachments: updatedAttachments
                            };
                        });
                    } else {
                        throw new Error('Server returned success but no URL');
                    }
                } catch (err) {
                    console.error('Recording upload failed:', err);
                    alert(`ভয়েস আপলোড ব্যর্থ হয়েছে: ${err.message}`);
                } finally {
                    setIsVoiceUploading(false);
                    console.log('Voice upload flow finished.');
                }

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start(200); // Collect data every 200ms
            recorderRef.current = mediaRecorder;
            setIsRecording(true);
            setRecordingTime(0);

            console.log('Recording started...');

            recordingInterval.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);

        } catch (err) {
            console.error('Microphone access denied:', err);
            alert('Microphone access is required for voice templates.');
        }
    };

    const stopRecording = () => {
        if (recorderRef.current && recorderRef.current.state === 'recording') {
            console.log('Stopping recorder...');
            recorderRef.current.stop();
            // Note: We don't setIsRecording(false) here. 
            // It will be handled in onstop to ensure smooth transition.
        } else {
            console.warn('Stop called but recorder is not recording. State:', recorderRef.current?.state);
            // If it's somehow stuck, clear it anyway
            setIsRecording(false);
            clearInterval(recordingInterval.current);
        }
    };

    const cancelRecording = () => {
        if (recorderRef.current) {
            recorderRef.current.onstop = null;
            recorderRef.current.stop();
            setIsRecording(false);
            clearInterval(recordingInterval.current);
            recorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/templates');
            const data = await response.json();
            setTemplates(data);
        } catch (err) {
            console.error('Failed to fetch templates:', err);
        }
    };

    const handleSave = async () => {
        if (!formData.title || (!formData.content?.trim() && (!formData.attachments || formData.attachments.length === 0))) return;
        setIsLoading(true);
        try {
            const url = editingTemplate
                ? `http://localhost:3001/api/templates/${editingTemplate.id}`
                : 'http://localhost:3001/api/templates';
            const method = editingTemplate ? 'PUT' : 'POST';

            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            if (response.ok) {
                await fetchTemplates();
                setShowModal(false);
                setEditingTemplate(null);
                setFormData({ title: '', content: '', category: 'General', attachments: [] });
            }
        } catch (err) {
            console.error('Failed to save template:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const uploadData = new FormData();
        uploadData.append('file', file);

        try {
            const response = await fetch('http://localhost:3001/upload', {
                method: 'POST',
                body: uploadData
            });
            const data = await response.json();
            if (data.url) {
                setFormData(prev => ({
                    ...prev,
                    attachments: [...prev.attachments, { url: data.url, type: data.mimetype }]
                }));
            }
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setIsUploading(false);
        }
    };


    const handleDelete = async (id: string, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (!window.confirm('Are you sure you want to delete this template?')) return;
        try {
            const response = await fetch(`http://localhost:3001/api/templates/${id}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                await fetchTemplates();
                if (previewTemplate?.id === id) setPreviewTemplate(null);
            }
        } catch (err) {
            console.error('Failed to delete template:', err);
        }
    };

    const handleTogglePin = async (template: Template, e: React.MouseEvent) => {
        e.stopPropagation(); // prevent opening preview
        const newPinStatus = template.is_pinned ? 0 : 1;
        try {
            const response = await fetch(`http://localhost:3001/api/templates/${template.id}/pin`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_pinned: newPinStatus })
            });

            if (response.ok) {
                await fetchTemplates(); // Refresh lists
            }
        } catch (err) {
            console.error('Failed to toggle pin:', err);
        }
    };

    const openEdit = (template: Template, e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        setEditingTemplate(template);
        setFormData({
            title: template.title,
            content: template.content,
            category: template.category,
            attachments: template.attachments || (template.media_path ? [{ url: template.media_path, type: template.media_type || '' }] : [])
        });
        setPreviewTemplate(null);
        setShowModal(true);
    };

    /* Button handlers removed */

    const handleSelectionChange = () => {
        const textarea = document.getElementById('template-content-textarea') as HTMLTextAreaElement;
        if (textarea && textarea.selectionStart !== null && textarea.selectionEnd !== null && textarea.selectionStart !== textarea.selectionEnd) {
            setSelection({
                start: textarea.selectionStart,
                end: textarea.selectionEnd,
                text: formData.content.substring(textarea.selectionStart, textarea.selectionEnd)
            });
        } else {
            setSelection(null);
        }
    };

    const applyFormat = (char: string) => {
        if (!selection) return;
        const textarea = document.getElementById('template-content-textarea') as HTMLTextAreaElement;
        const newText = formData.content.substring(0, selection.start) + char + selection.text + char + formData.content.substring(selection.end);
        setFormData({ ...formData, content: newText });
        setSelection(null);
        setTimeout(() => {
            if (textarea) {
                textarea.focus();
                textarea.setSelectionRange(selection.start + char.length, selection.end + char.length);
            }
        }, 0);
    };

    const processSpintaxFrontend = (text: string) => {
        if (!text) return text;
        let processed = text;
        let lastProcessed;
        let iterations = 0;
        const maxIterations = 10; // Prevent infinite loops
        do {
            lastProcessed = processed;
            processed = processed.replace(/\{([^{}]+)\}/g, (match, contents) => {
                const spinOptions = contents.split('|');
                return spinOptions[Math.floor(Math.random() * spinOptions.length)];
            });
            iterations++;
        } while (processed !== lastProcessed && iterations < maxIterations);
        return processed;
    };

    const generatePreviewHTML = (text: string) => {
        if (!text) return { __html: '<span class="text-gray-400 italic">No content yet...</span>' };

        const now = new Date();
        const dateStr = now.toLocaleDateString();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let content = text;
        content = content.replace(/\[Name\]/gi, 'John Doe');
        content = content.replace(/\[Phone\]/gi, '+1234567890');
        content = content.replace(/\[Date\]/gi, dateStr);
        content = content.replace(/\[Time\]/gi, timeStr);
        content = content.replace(/\[Group\]/gi, 'VIP Customers');
        content = content.replace(/\[Email\]/gi, 'rahim@example.com');
        content = content.replace(/\[Address\]/gi, '123 Smart Ave, Mirpur');
        content = content.replace(/\[City\]/gi, 'Dhaka');
        content = content.replace(/\[Company\]/gi, 'Antigravity IT');

        // Apply Spintax processing for preview
        content = processSpintaxFrontend(content);

        let formatted = content
            .replace(/\n/g, '<br />')
            .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            .replace(/~(.*?)~/g, '<del>$1</del>')
            .replace(/```(.*?)```/gs, '<code class="bg-black/10 px-1 py-0.5 rounded text-sm font-mono">$1</code>');

        return { __html: formatted };
    };


    const handleAIGenerate = async () => {
        if (!aiPrompt) return;
        setIsGenerating(true);
        try {
            const response = await fetch('http://localhost:3001/api/ai/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: aiPrompt, category: formData.category, useSpintax: useSpintaxAI })
            });
            const data = await response.json();
            if (data.success) {
                setFormData(prev => ({ ...prev, content: data.content }));
                setShowAIModal(false);
                setAIPrompt('');
                if (!showModal) setShowModal(true);
            } else {
                alert("AI Error: " + data.error);
            }
        } catch (err) {
            console.error('AI Generation failed:', err);
            alert("AI Generation failed. Check terminal.");
        } finally {
            setIsGenerating(false);
        }
    };

    const filteredTemplates = templates.filter(t =>
        t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.content.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.category.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => {
        if (sortByUsage) {
            return (b.usage_count || 0) - (a.usage_count || 0);
        }
        return 0; // maintain default order if not explicitly sorted by usage
    });

    // Extract Top 3 used templates or manually pinned templates to pin them at the top
    let pinnedTemplates: Template[] = [];
    let standardTemplates: Template[] = filteredTemplates;

    if (!sortByUsage && !searchTerm) {
        // Manually pinned
        const manuallyPinned = filteredTemplates.filter(t => t.is_pinned);

        // Sort remaining by usage to find the top ones
        const unpinned = filteredTemplates.filter(t => !t.is_pinned);
        const sortedByUsage = [...unpinned].sort((a, b) => (b.usage_count || 0) - (a.usage_count || 0));
        const autoPinned = sortedByUsage.filter(t => (t.usage_count || 0) > 0).slice(0, 3);

        pinnedTemplates = [...manuallyPinned, ...autoPinned];

        // Remove pinned templates from the standard list
        standardTemplates = filteredTemplates.filter(t => !pinnedTemplates.find(p => p.id === t.id));
    }

    const renderTemplateList = (templateList: Template[], isPinnedSection = false) => (
        <AnimatePresence mode="popLayout">
            {templateList.map((template) => (
                <motion.div
                    layout
                    key={template.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    whileHover={{ y: -5 }}
                    onClick={() => setPreviewTemplate(template)}
                    className={`group bg-white rounded-[2rem] shadow-xl border ${isPinnedSection ? 'border-orange-200 shadow-orange-500/10' : 'border-gray-100 hover:border-wa-teal/30 hover:shadow-wa-teal/5'} hover:shadow-2xl transition-all relative overflow-hidden flex cursor-pointer ${viewMode === 'grid' ? 'flex-col h-72 p-7' : 'flex-row items-center p-5 gap-6'}`}
                >
                    {isPinnedSection && (
                        <div className="absolute top-0 right-0 border-[20px] border-transparent border-t-orange-100 border-r-orange-100 opacity-50"></div>
                    )}
                    <div className={`${viewMode === 'grid' ? 'mb-4' : 'w-32 flex-shrink-0 flex flex-col gap-2'}`}>
                        <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 ${getCategoryColor(template.category)} text-[10px] font-black uppercase tracking-widest rounded-lg break-normal whitespace-nowrap`}>
                                {template.category}
                            </span>
                            {template.is_pinned ? (
                                <span className="flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-orange-400 to-amber-500 text-white text-[10px] font-black uppercase rounded-lg shadow-sm whitespace-nowrap">
                                    <Pin size={10} className="fill-white" /> Pinned
                                </span>
                            ) : template.usage_count ? (
                                <span className={`flex items-center gap-1 px-2 py-1 ${isPinnedSection ? 'bg-orange-500 text-white' : 'bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100 text-orange-600'} text-[10px] font-black uppercase rounded-lg shadow-sm whitespace-nowrap`}>
                                    🔥 {template.usage_count}
                                </span>
                            ) : null}
                        </div>
                    </div>
                    <div className={`flex-1 min-w-0 ${viewMode === 'grid' ? '' : 'flex flex-row items-center gap-6 overflow-hidden'}`}>
                        <div className={`${viewMode === 'grid' ? 'mb-4' : 'flex-1 min-w-0'}`}>
                            <h3 className={`font-black text-gray-800 flex items-center gap-2 ${viewMode === 'grid' ? 'text-xl mb-2 line-clamp-1' : 'text-lg truncate mb-0.5'}`}>
                                {isPinnedSection && <Zap size={16} className="text-orange-500 fill-orange-500" />}
                                {template.title}
                            </h3>
                            <p className={`font-medium text-gray-500 italic leading-relaxed ${viewMode === 'grid' ? 'text-sm line-clamp-1' : 'text-sm line-clamp-1 whitespace-nowrap overflow-hidden text-ellipsis'}`}>
                                {template.content}
                            </p>
                        </div>

                        {/* Premium Stacked Media View */}
                        {(template.attachments && template.attachments.length > 0) || (template.media_path) ? (
                            <div className={`${viewMode === 'grid' ? 'mb-4' : 'flex-shrink-0'}`}>
                                <div className="relative group/media-stack">
                                    {/* Background Stack Cards */}
                                    {((template.attachments?.length || 0) > 2) && (
                                        <div className="absolute inset-0 bg-gray-200 rounded-xl transform rotate-6 scale-90 translate-x-1 origin-center shadow-sm border border-gray-100 opacity-50 block"></div>
                                    )}
                                    {((template.attachments?.length || 0) > 1) && (
                                        <div className="absolute inset-0 bg-gray-100 rounded-xl transform rotate-3 scale-95 translate-x-0.5 origin-center shadow-sm border border-gray-100 block"></div>
                                    )}

                                    {/* Main Media Thumbnail */}
                                    <div className={`rounded-xl overflow-hidden bg-white border border-gray-200 flex items-center justify-center relative z-10 shadow-sm ${viewMode === 'grid' ? 'w-full h-24' : 'w-14 h-14'}`}>
                                        {template.attachments && template.attachments.length > 0 ? (
                                            <>
                                                {template.attachments[0].type?.startsWith('image/') ? (
                                                    <img
                                                        src={template.attachments[0].url.startsWith('http') ? template.attachments[0].url : `http://localhost:3001${template.attachments[0].url}`}
                                                        className="w-full h-full object-cover"
                                                        alt=""
                                                    />
                                                ) : template.attachments[0].type?.startsWith('audio/') ? (
                                                    <div className="w-full h-full flex items-center justify-center text-wa-teal bg-wa-teal/10">
                                                        <Mic size={viewMode === 'grid' ? 24 : 18} />
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-wa-teal bg-wa-teal/5">
                                                        <FileIcon size={viewMode === 'grid' ? 24 : 18} />
                                                    </div>
                                                )}

                                                {/* Dynamic Counter Badge */}
                                                {template.attachments.length > 1 && (
                                                    <div className="absolute top-1 right-1 bg-wa-teal text-white text-[8px] font-black px-1.5 py-0.5 rounded-full z-20 shadow-lg ring-1 ring-white/50">
                                                        +{template.attachments.length - 1}
                                                    </div>
                                                )}
                                            </>
                                        ) : template.media_path && (
                                            <>
                                                {template.media_type?.startsWith('image/') ? (
                                                    <img
                                                        src={template.media_path.startsWith('http') ? template.media_path : `http://localhost:3001${template.media_path}`}
                                                        className="w-full h-full object-cover"
                                                        alt=""
                                                    />
                                                ) : template.media_type?.startsWith('audio/') ? (
                                                    <div className="w-full h-full flex items-center justify-center text-wa-teal bg-wa-teal/10">
                                                        <Mic size={viewMode === 'grid' ? 24 : 18} />
                                                    </div>
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-wa-teal bg-wa-teal/5">
                                                        <FileIcon size={viewMode === 'grid' ? 24 : 18} />
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className={`${viewMode === 'grid' ? 'opacity-0 group-hover:opacity-100 transition-opacity absolute top-7 right-7 flex gap-2' : 'flex-shrink-0 flex gap-2 ml-auto'}`}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                (window as any).setActiveTab?.('analytics');
                            }}
                            className="p-3 bg-white text-gray-400 hover:text-wa-teal hover:bg-wa-teal/5 rounded-xl transition-all shadow-sm flex items-center justify-center border border-gray-100"
                            title="View Analytics"
                        >
                            <BarChart3 size={16} />
                        </button>
                        <button onClick={(e) => handleTogglePin(template, e)} className={`p-3 rounded-xl transition-all shadow-sm flex items-center justify-center ${template.is_pinned ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'bg-gray-50 text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`} title={template.is_pinned ? "Unpin Template" : "Pin Template"}>
                            {template.is_pinned ? <PinOff size={16} /> : <Pin size={16} />}
                        </button>
                        <button onClick={(e) => openEdit(template, e)} className="p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all shadow-sm flex items-center justify-center"><Edit2 size={16} /></button>
                        <button onClick={(e) => handleDelete(template.id, e)} className="p-3 bg-gray-50 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all shadow-sm flex items-center justify-center"><Trash2 size={16} /></button>
                    </div>
                </motion.div>
            ))}
        </AnimatePresence>
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                <div>
                    <h2 className="text-3xl font-black text-gray-800 flex items-center gap-3">
                        <Layout className="text-wa-teal" size={32} />
                        Templates
                    </h2>
                </div>

                <div className="flex items-center gap-4 w-full md:w-auto">
                    {/* View Mode Toggle */}
                    <div className="bg-gray-100 p-1 rounded-2xl flex items-center gap-1 shadow-inner border border-gray-200/50">
                        <div className="relative group">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-2.5 rounded-xl transition-all duration-300 ${viewMode === 'grid' ? 'bg-white text-wa-teal shadow-xl shadow-black/5' : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'}`}
                            >
                                <Layout size={18} />
                            </button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-xl">
                                Grid View
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                            </div>
                        </div>

                        <div className="relative group">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-2.5 rounded-xl transition-all duration-300 ${viewMode === 'list' ? 'bg-white text-wa-teal shadow-xl shadow-black/5' : 'text-gray-400 hover:text-gray-600 hover:bg-white/50'}`}
                            >
                                <FileText size={18} />
                            </button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-xl">
                                List View
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons: Icon Only with Tooltips */}
                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowAIModal(true)}
                                className="w-12 h-12 rounded-2xl bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white shadow-lg shadow-indigo-500/20 flex items-center justify-center transition-all"
                            >
                                <Zap size={20} className="fill-white animate-pulse" />
                            </motion.button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-xl">
                                Magic AI Generator
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                            </div>
                        </div>

                        <div className="relative group">
                            <button
                                onClick={() => setSortByUsage(!sortByUsage)}
                                className={`w-12 h-12 rounded-2xl transition-all duration-300 border shadow-sm flex items-center justify-center
                                    ${sortByUsage ? 'bg-orange-50 text-orange-600 border-orange-200' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'}`}
                            >
                                <BarChart3 size={20} className={sortByUsage ? "text-orange-500" : ""} />
                            </button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-xl">
                                {sortByUsage ? "Showing Most Used" : "Sort by Most Used"}
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                            </div>
                        </div>

                        <div className="relative group">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowLibraryModal(true)}
                                className="w-12 h-12 rounded-2xl bg-white border-2 border-gray-100 hover:border-wa-teal hover:text-wa-teal text-gray-500 flex items-center justify-center shadow-lg shadow-black/5 transition-all"
                            >
                                <Library size={20} />
                            </motion.button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-xl">
                                Template Library
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                            </div>
                        </div>

                        <div className="relative group">
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => {
                                    setEditingTemplate(null);
                                    setFormData({ title: '', content: '', category: 'General', attachments: [] });
                                    setShowModal(true);
                                }}
                                className="w-12 h-12 rounded-2xl bg-wa-teal hover:bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-wa-teal/20 transition-all"
                            >
                                <Plus size={24} />
                            </motion.button>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-3 py-1.5 bg-gray-800 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-xl">
                                Create New Template
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Quick Stats & Search Bar Area */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-[2rem] shadow-xl border border-gray-100 flex items-center gap-4 group hover:border-indigo-100 transition-colors">
                    <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-all duration-500 shadow-inner">
                        <FileText size={24} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Total</p>
                        <p className="text-2xl font-black text-gray-800">{templates.length}</p>
                    </div>
                </div>

                <div className="md:col-span-3 bg-white p-4 rounded-[2rem] shadow-xl border border-gray-100 flex items-center px-6 focus-within:border-wa-teal/30 focus-within:shadow-2xl transition-all duration-500">
                    <Search className="text-gray-300 mr-4" size={20} />
                    <input
                        type="text"
                        placeholder="Search templates by title, content or category..."
                        className="w-full bg-transparent outline-none font-bold text-gray-700 placeholder:text-gray-300"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Templates List/Grid Content */}
            {pinnedTemplates.length > 0 && (
                <div className="mb-10">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-gradient-to-br from-orange-400 to-amber-500 rounded-xl shadow-lg shadow-orange-500/20 text-white">
                            <Zap size={20} className="fill-white" />
                        </div>
                        <h3 className="text-xl font-black text-gray-800 tracking-tight">Top Templates</h3>
                    </div>
                    <motion.div
                        layout
                        className={viewMode === 'grid'
                            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                            : "space-y-4"
                        }
                    >
                        {renderTemplateList(pinnedTemplates, true)}
                    </motion.div>
                </div>
            )}

            {(standardTemplates.length > 0 || pinnedTemplates.length > 0) && (
                <div>
                    {pinnedTemplates.length > 0 && (
                        <h3 className="text-xl font-black text-gray-800 tracking-tight mb-6 flex items-center gap-3">
                            <div className="p-2 bg-gray-100 rounded-xl text-gray-400">
                                <Layout size={20} />
                            </div>
                            All Templates
                        </h3>
                    )}
                    <motion.div
                        layout
                        className={viewMode === 'grid'
                            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                            : "space-y-4"
                        }
                    >
                        {renderTemplateList(standardTemplates, false)}
                    </motion.div>
                </div>
            )}

            {filteredTemplates.length === 0 && (
                <div className="col-span-full py-20 text-center glass-card bg-white/50">
                    <div className="w-20 h-20 bg-gray-100 text-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-inner">
                        <Zap size={40} />
                    </div>
                    <h4 className="text-xl font-black text-gray-800 mb-2 uppercase tracking-tight">No Templates Found</h4>
                    <p className="text-sm font-bold text-gray-400 italic">Adjust your search or start creating!</p>
                </div>
            )}

            {/* Template Preview Modal */}
            <AnimatePresence>
                {previewTemplate && (
                    <div className="fixed inset-0 z-[130] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setPreviewTemplate(null)}
                            className="absolute inset-0 bg-gray-900/40 backdrop-blur-xl"
                        ></motion.div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 30 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 30 }}
                            className="relative bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-white"
                        >
                            {/* Modal Header Wrap */}
                            <div className="p-10 pb-6 shrink-0">
                                <div className="flex justify-between items-start mb-6">
                                    <div>
                                        <span className={`px-4 py-1.5 ${getCategoryColor(previewTemplate.category)} text-[11px] font-black uppercase tracking-[0.2em] rounded-full`}>
                                            {previewTemplate.category}
                                        </span>
                                        <h3 className="text-4xl font-black text-gray-800 mt-4 tracking-tight leading-tight">
                                            {previewTemplate.title}
                                        </h3>
                                    </div>
                                    <button
                                        onClick={() => setPreviewTemplate(null)}
                                        className="p-4 bg-gray-50 hover:bg-gray-100 rounded-[1.5rem] text-gray-400 hover:text-gray-800 transition-all shadow-sm"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>
                            </div>

                            {/* Scrollable Content Body */}
                            <div className="px-10 pb-10 space-y-8 overflow-y-auto custom-scrollbar flex-1">
                                <div className="space-y-8">
                                    <div className="bg-gray-50/50 rounded-[2rem] p-8 border border-gray-100 shadow-inner">
                                        <p className="text-gray-700 font-medium text-lg leading-relaxed whitespace-pre-wrap italic">
                                            {previewTemplate.content}
                                        </p>
                                    </div>

                                    {(previewTemplate.attachments && previewTemplate.attachments.length > 0) ? (
                                        <div className="grid grid-cols-2 gap-4">
                                            {previewTemplate.attachments.map((attach, idx) => (
                                                <div key={idx} className="rounded-[2rem] overflow-hidden border-4 border-white shadow-2xl bg-gray-50 flex flex-col relative group">
                                                    <div className="aspect-video relative overflow-hidden flex-1 shrink-0">
                                                        {attach.type?.startsWith('image/') ? (
                                                            <img
                                                                src={attach.url.startsWith('http') ? attach.url : `http://localhost:3001${attach.url}`}
                                                                className="w-full h-full object-cover"
                                                                alt="Template Media"
                                                            />
                                                        ) : attach.type?.startsWith('audio/') ? (
                                                            <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-4">
                                                                <VoiceMessagePreview url={attach.url} isTemplatePreview />
                                                                <span className="text-[10px] font-black text-wa-teal uppercase tracking-widest">Voice Note Template</span>
                                                            </div>
                                                        ) : attach.type === 'vcard' ? (
                                                            <div className="w-full h-full flex flex-col items-center justify-center text-emerald-500 gap-4 bg-emerald-50/50">
                                                                <div className="p-4 bg-emerald-100 rounded-full shadow-inner">
                                                                    <UserCircle2 size={32} />
                                                                </div>
                                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-80">Contact Card</span>
                                                                <span className="font-bold text-[12px] text-gray-700 truncate max-w-[80%] px-4">{attach.name}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="w-full h-full flex flex-col items-center justify-center text-wa-teal gap-4">
                                                                <div className="p-4 bg-wa-teal/5 rounded-full shadow-inner">
                                                                    <FileText size={32} />
                                                                </div>
                                                                <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Attachment File</span>
                                                                <span className="font-black text-[10px] uppercase tracking-widest text-gray-400 truncate max-w-[80%] px-4">{attach.type}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    {attach.caption && (
                                                        <div className="bg-white px-5 py-4 shrink-0 border-t border-gray-100">
                                                            <p className="text-xs font-bold text-gray-600 line-clamp-2 italic">{attach.caption}</p>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (previewTemplate.media_path && (
                                        <div className="rounded-[2rem] overflow-hidden border-4 border-white shadow-2xl bg-gray-50 aspect-video relative group">
                                            {previewTemplate.media_type?.startsWith('image/') ? (
                                                <img
                                                    src={previewTemplate.media_path.startsWith('http') ? previewTemplate.media_path : `http://localhost:3001${previewTemplate.media_path}`}
                                                    className="w-full h-full object-cover"
                                                    alt="Template Media"
                                                />
                                            ) : previewTemplate.media_type?.startsWith('audio/') ? (
                                                <div className="w-full h-full flex flex-col items-center justify-center p-6 gap-4">
                                                    <VoiceMessagePreview url={previewTemplate.media_path} isTemplatePreview />
                                                    <span className="text-[10px] font-black text-wa-teal uppercase tracking-widest">Voice Note Template</span>
                                                </div>
                                            ) : (
                                                <div className="w-full h-full flex flex-col items-center justify-center text-wa-teal gap-4">
                                                    <div className="p-6 bg-wa-teal/5 rounded-full shadow-inner">
                                                        <FileText size={48} />
                                                    </div>
                                                    <span className="font-black text-[12px] uppercase tracking-widest text-gray-400">Attached Document</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Modal Footer Actions */}
                            <div className="p-10 pt-4 flex gap-4 bg-gray-50/30 border-t border-gray-100 shrink-0">
                                <button
                                    onClick={() => openEdit(previewTemplate)}
                                    className="flex-1 py-5 bg-white border-2 border-gray-100 rounded-[2rem] font-black text-gray-500 hover:border-wa-teal hover:text-wa-teal hover:bg-wa-teal/5 transition-all uppercase tracking-widest text-xs shadow-sm flex items-center justify-center gap-2"
                                >
                                    <Edit2 size={16} /> Edit Details
                                </button>
                                <button
                                    onClick={() => setPreviewTemplate(null)}
                                    className="flex-1 py-5 bg-wa-teal text-white rounded-[2rem] font-black shadow-xl shadow-wa-teal/20 hover:bg-emerald-600 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                                >
                                    <CheckCircle2 size={16} /> Close Preview
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Template Edit/Create Modal (Existing Modal with UI Tweaks) */}
            <AnimatePresence>
                {
                    showModal && (
                        <div className="fixed inset-0 z-[140] flex items-center justify-center p-6">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowModal(false)}
                                className="absolute inset-0 bg-gray-900/70 backdrop-blur-md"
                            ></motion.div>

                            <motion.div
                                layout
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="relative bg-white rounded-[3rem] shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col border border-white overflow-hidden"
                            >
                                <div className="absolute top-4 right-4 z-50 lg:hidden">
                                    <button
                                        onClick={() => setShowModal(false)}
                                        className="p-3 bg-white/80 backdrop-blur hover:bg-white rounded-2xl text-gray-500 shadow-md transition-all"
                                    >
                                        <X size={24} />
                                    </button>
                                </div>

                                <div className="flex flex-col lg:flex-row flex-1 overflow-hidden relative">
                                    <motion.div
                                        layout
                                        className="flex-[3] flex flex-col h-full overflow-y-auto custom-scrollbar border-r border-gray-100 z-10 relative bg-white"
                                    >
                                        <div className="p-10 pb-6 border-b border-gray-50 flex justify-between items-center bg-gradient-to-r from-gray-50/50 to-white sticky top-0 z-20">
                                            <div>
                                                <h3 className="text-3xl font-black text-gray-800 flex items-center gap-4">
                                                    <div className="w-12 h-12 bg-wa-teal/10 rounded-2xl flex items-center justify-center text-wa-teal shadow-inner">
                                                        {editingTemplate ? <Edit2 size={24} /> : <Plus size={24} />}
                                                    </div>
                                                    {editingTemplate ? 'Edit Template' : 'Create Template'}
                                                </h3>
                                                <p className="text-gray-400 font-bold mt-1 text-xs uppercase tracking-widest ml-16 italic">
                                                    Customize your quick response
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <button
                                                    onClick={() => setShowLivePreview(!showLivePreview)}
                                                    className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${showLivePreview ? 'bg-wa-teal text-white border-wa-teal' : 'bg-gray-50 text-gray-400 border-gray-100'}`}
                                                >
                                                    <Zap size={14} className={showLivePreview ? 'fill-white' : ''} />
                                                    {showLivePreview ? 'Hide Preview' : 'Show Preview'}
                                                </button>
                                                <button
                                                    onClick={() => setShowModal(false)}
                                                    className="hidden lg:flex p-4 hover:bg-gray-100 rounded-2xl text-gray-400 hover:text-gray-800 transition-all"
                                                >
                                                    <X size={24} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="p-10 space-y-6">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 px-3">Template Title</label>
                                                    <input
                                                        type="text"
                                                        placeholder="e.g., Welcome Message"
                                                        className="w-full px-6 py-4 bg-gray-50 rounded-[1.5rem] border-2 border-transparent focus:border-wa-teal focus:bg-white outline-none transition-all font-bold text-gray-800 shadow-inner"
                                                        value={formData.title}
                                                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                                    />
                                                </div>

                                                <div>
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-3 px-3">Category</label>
                                                    <div className="relative">
                                                        <button
                                                            type="button"
                                                            onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                                                            className="w-full px-6 py-4 bg-gray-50 rounded-[1.5rem] border-2 border-transparent focus:border-wa-teal focus:bg-white focus:shadow-inner outline-none transition-all font-bold text-gray-800 flex justify-between items-center group"
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <span className={`w-3 h-3 rounded-full ${getCategoryColor(formData.category).split(' ')[0]}`}></span>
                                                                {formData.category}
                                                            </div>
                                                            <ChevronDown size={20} className={`text-gray-400 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`} />
                                                        </button>
                                                        <AnimatePresence>
                                                            {isCategoryDropdownOpen && (
                                                                <>
                                                                    <div className="fixed inset-0 z-40" onClick={() => setIsCategoryDropdownOpen(false)}></div>
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: 10 }}
                                                                        animate={{ opacity: 1, y: 0 }}
                                                                        exit={{ opacity: 0, y: 10 }}
                                                                        className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-100 rounded-[1.5rem] shadow-2xl p-2 z-50 grid grid-cols-2 gap-1 max-h-60 overflow-y-auto custom-scrollbar"
                                                                    >
                                                                        {Object.keys(CATEGORY_COLORS).filter(c => c !== 'default').map(cat => (
                                                                            <button
                                                                                key={cat}
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setFormData({ ...formData, category: cat });
                                                                                    setIsCategoryDropdownOpen(false);
                                                                                }}
                                                                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-bold w-full text-left hover:bg-gray-50 hover:pl-5 
                                                                                ${formData.category === cat ? getCategoryColor(cat) + ' border border-transparent/10' : 'text-gray-600'}`}
                                                                            >
                                                                                <span className={`w-2.5 h-2.5 rounded-full ${getCategoryColor(cat).split(' ')[0]}`}></span>
                                                                                {cat}
                                                                            </button>
                                                                        ))}
                                                                    </motion.div>
                                                                </>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex flex-col gap-3 mb-3 px-3">
                                                    <div className="flex justify-between items-center">
                                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Message Content</label>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        {[
                                                            { tag: '{{name}}', label: 'Name', color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100' },
                                                            { tag: '{{first_name}}', label: 'First Name', color: 'bg-blue-50 text-blue-500 border-blue-100 hover:bg-blue-100' },
                                                            { tag: '{{phone}}', label: 'Phone', color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' },
                                                            { tag: '{{date}}', label: 'Date', color: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100' },
                                                            { tag: '{{time}}', label: 'Time', color: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100' },
                                                            { tag: '{{group}}', label: 'Group', color: 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100' },
                                                            { tag: '{{city}}', label: 'City', color: 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100' },
                                                            { tag: '{{company}}', label: 'Company', color: 'bg-pink-50 text-pink-600 border-pink-200 hover:bg-pink-100' }
                                                        ].map(v => (
                                                            <button
                                                                key={v.tag}
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    const textarea = document.getElementById('template-content-textarea') as HTMLTextAreaElement;
                                                                    if (textarea) {
                                                                        const start = textarea.selectionStart;
                                                                        const end = textarea.selectionEnd;
                                                                        const newText = formData.content.substring(0, start) + v.tag + formData.content.substring(end);
                                                                        setFormData({ ...formData, content: newText });
                                                                        setTimeout(() => {
                                                                            textarea.focus();
                                                                            textarea.setSelectionRange(start + v.tag.length, start + v.tag.length);
                                                                        }, 0);
                                                                    } else {
                                                                        setFormData({ ...formData, content: formData.content + v.tag });
                                                                    }
                                                                }}
                                                                className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-1.5 ${v.color}`}
                                                                title={`Click to insert ${v.tag}`}
                                                            >
                                                                <Tag size={10} className="opacity-50" />
                                                                {v.label}
                                                            </button>
                                                        ))}

                                                        <div className="w-px h-6 bg-gray-200 mx-1 mt-1"></div>
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.preventDefault();
                                                                setShowSpintaxModal(true);
                                                            }}
                                                            className="px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center gap-1 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 border-indigo-200 hover:from-indigo-100 hover:to-purple-100"
                                                            title="Insert Spintax block for random variations (Anti-Ban)"
                                                        >
                                                            <Shuffle size={12} />
                                                            Spintax
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="relative">
                                                    <textarea
                                                        id="template-content-textarea"
                                                        rows={5}
                                                        placeholder="Type your message here..."
                                                        className="w-full px-8 py-6 bg-gray-50 rounded-[2rem] border-2 border-transparent focus:border-wa-teal focus:bg-white outline-none transition-all font-bold text-gray-800 resize-none shadow-inner"
                                                        value={formData.content}
                                                        onMouseUp={handleSelectionChange}
                                                        onKeyUp={handleSelectionChange}
                                                        onChange={(e) => {
                                                            setFormData({ ...formData, content: e.target.value });
                                                            if (selection) setSelection(null);
                                                        }}
                                                    />
                                                    {selection && (
                                                        <div className="absolute top-6 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-white rounded-[1rem] shadow-2xl flex items-center p-1.5 z-[100] gap-1 animate-in fade-in slide-in-from-top-2">
                                                            <button type="button" onMouseDown={(e) => { e.preventDefault(); applyFormat('*'); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="Bold"><Bold size={16} /></button>
                                                            <button type="button" onMouseDown={(e) => { e.preventDefault(); applyFormat('_'); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="Italic"><Italic size={16} /></button>
                                                            <button type="button" onMouseDown={(e) => { e.preventDefault(); applyFormat('~'); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="Strikethrough"><Strikethrough size={16} /></button>
                                                            <button type="button" onMouseDown={(e) => { e.preventDefault(); applyFormat('```'); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="Monospace"><Code size={16} /></button>
                                                            <div className="w-px h-5 bg-gray-700 mx-1"></div>
                                                            <button type="button" onMouseDown={(e) => { e.preventDefault(); navigator.clipboard.writeText(selection.text); setSelection(null); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-blue-400" title="Copy"><Copy size={16} /></button>
                                                            <button type="button" onMouseDown={(e) => { e.preventDefault(); setFormData(prev => ({ ...prev, content: prev.content.substring(0, selection.start) + prev.content.substring(selection.end) })); setSelection(null); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-red-400" title="Delete"><Trash2 size={16} /></button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Button Builder Section Removed */}

                                            <div>
                                                <div className="flex justify-between items-center mb-3 px-3">
                                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Media Attachments</label>
                                                    <div className="flex items-center gap-2">
                                                        {isRecording ? (
                                                            <div className="flex items-center gap-3 bg-red-50 text-red-600 px-4 py-2 rounded-full border border-red-100 shadow-sm animate-pulse">
                                                                <div className="w-2.5 h-2.5 rounded-full bg-red-600 animate-ping"></div>
                                                                <span className="text-[10px] font-black tracking-[0.2em] uppercase">Recording {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}</span>
                                                                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-red-200">
                                                                    <button onClick={stopRecording} className="p-1.5 hover:bg-black/5 rounded-full transition-colors flex items-center justify-center" title="Stop and Save"><Square size={12} fill="currentColor" /></button>
                                                                    <button onClick={cancelRecording} className="p-1.5 hover:bg-black/5 rounded-full transition-colors flex items-center justify-center text-gray-400 hover:text-red-600" title="Cancel"><X size={14} /></button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                type="button"
                                                                onClick={startRecording}
                                                                className="flex items-center gap-2 px-4 py-2 bg-wa-teal/10 text-wa-teal rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-wa-teal/20 transition-all active:scale-95"
                                                            >
                                                                <Mic size={14} /> Record Voice Template
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    {/* Existing Attachments Preview */}
                                                    {formData.attachments && formData.attachments.length > 0 && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            {formData.attachments.map((attach, idx) => (
                                                                <div key={idx} className="w-full flex-col px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl shadow-sm">
                                                                    <div className="flex items-center justify-between mb-3">
                                                                        <div className="flex items-center gap-4 truncate">
                                                                            {attach.type?.startsWith('image/') ? (
                                                                                <img
                                                                                    src={attach.url.startsWith('http') ? attach.url : `http://localhost:3001${attach.url}`}
                                                                                    className="h-12 w-12 object-cover rounded-xl shadow-sm border border-white shrink-0"
                                                                                    alt="Attached"
                                                                                />
                                                                            ) : attach.type?.startsWith('audio/') ? (
                                                                                <div className="h-12 w-12 bg-wa-teal/5 rounded-xl shadow-sm flex items-center justify-center text-wa-teal border border-white shrink-0">
                                                                                    <Mic size={20} />
                                                                                </div>
                                                                            ) : attach.type === 'vcard' ? (
                                                                                <div className="h-12 w-12 bg-emerald-50 rounded-xl shadow-sm flex items-center justify-center text-emerald-500 border border-white shrink-0">
                                                                                    <UserCircle2 size={20} />
                                                                                </div>
                                                                            ) : (
                                                                                <div className="h-12 w-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-wa-teal border border-white shrink-0">
                                                                                    <FileText size={20} />
                                                                                </div>
                                                                            )}
                                                                            <div className="truncate flex-1">
                                                                                <p className="text-xs font-black text-gray-800 truncate">{attach.name || attach.url.split('/').pop() || (attach.type?.startsWith('audio/') ? 'Voice Template' : 'Attached File')}</p>
                                                                                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tight truncate">{attach.type === 'vcard' ? attach.phone : attach.type}</p>
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                setFormData(prev => ({
                                                                                    ...prev,
                                                                                    attachments: prev.attachments.filter((_, i) => i !== idx)
                                                                                }));
                                                                            }}
                                                                            className="p-2 bg-white text-red-500 hover:bg-red-50 hover:text-red-600 rounded-xl transition-all shadow-sm shrink-0"
                                                                        >
                                                                            <Trash2 size={16} />
                                                                        </button>
                                                                    </div>
                                                                    {/* Caption Input */}
                                                                    <div className="w-full">
                                                                        <input
                                                                            type="text"
                                                                            placeholder="Add a caption..."
                                                                            className="w-full px-4 py-2 bg-white border border-gray-100 focus:border-wa-teal rounded-xl text-[11px] font-medium text-gray-700 outline-none transition-colors"
                                                                            value={attach.caption || ''}
                                                                            onChange={(e) => {
                                                                                const newAttachments = [...formData.attachments];
                                                                                newAttachments[idx] = { ...newAttachments[idx], caption: e.target.value };
                                                                                setFormData({ ...formData, attachments: newAttachments });
                                                                            }}
                                                                        />
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {/* Voice Uploading Placeholder */}
                                                    {isVoiceUploading && (
                                                        <div className="w-full flex items-center gap-4 px-6 py-5 bg-wa-teal/5 border-2 border-dashed border-wa-teal/20 rounded-[2rem] animate-pulse">
                                                            <div className="w-12 h-12 bg-wa-teal text-white rounded-2xl flex items-center justify-center shadow-lg shadow-wa-teal/20">
                                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                            </div>
                                                            <div className="flex-1">
                                                                <p className="text-[10px] font-black text-wa-teal uppercase tracking-[0.2em] mb-1">যাচাই করা হচ্ছে...</p>
                                                                <p className="text-xs font-bold text-gray-400 italic">আপনার ভয়েস নোটটি সেভ করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন।</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Media, Location, and VCard Buttons */}
                                                    <div className="grid grid-cols-3 gap-4">
                                                        {/* Upload Button */}
                                                        <div
                                                            onClick={() => fileInputRef.current?.click()}
                                                            className={`w-full rounded-[2rem] border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group/upload border-gray-200 hover:border-wa-teal/50 hover:bg-wa-teal/5 h-32`}
                                                        >
                                                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />

                                                            {isUploading ? (
                                                                <div className="flex flex-col items-center gap-4 animate-pulse">
                                                                    <div className="w-8 h-8 rounded-full border-4 border-wa-teal border-t-transparent animate-spin"></div>
                                                                    <span className="text-[10px] font-black text-wa-teal uppercase tracking-widest">Uploading...</span>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <div className="p-3 bg-gray-100 rounded-2xl text-gray-400 mb-2 group-hover/upload:bg-wa-teal group-hover/upload:text-white transition-all shadow-sm">
                                                                        <Plus size={20} />
                                                                    </div>
                                                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/upload:text-wa-teal text-center px-2">Attach Media</p>
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* Location Button */}
                                                        <div
                                                            onClick={() => setShowLocationModal(true)}
                                                            className={`w-full rounded-[2rem] border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group/loc border-gray-200 hover:border-blue-500/50 hover:bg-blue-50 h-32`}
                                                        >
                                                            <div className="p-3 bg-gray-100 rounded-2xl text-gray-400 mb-2 group-hover/loc:bg-blue-500 group-hover/loc:text-white transition-all shadow-sm">
                                                                <Globe size={20} />
                                                            </div>
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/loc:text-blue-500 text-center px-2">Map Location</p>
                                                        </div>

                                                        {/* VCard Button */}
                                                        <div
                                                            onClick={() => setShowVCardModal(true)}
                                                            className={`w-full rounded-[2rem] border-2 border-dashed transition-all duration-500 flex flex-col items-center justify-center cursor-pointer relative overflow-hidden group/vcard border-gray-200 hover:border-emerald-500/50 hover:bg-emerald-50 h-32`}
                                                        >
                                                            <div className="p-3 bg-gray-100 rounded-2xl text-gray-400 mb-2 group-hover/vcard:bg-emerald-500 group-hover/vcard:text-white transition-all shadow-sm">
                                                                <UserCircle2 size={20} />
                                                            </div>
                                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover/vcard:text-emerald-500 text-center px-2">Contact Card</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>


                                            <div className="sticky bottom-0 p-10 pt-4 bg-white/90 backdrop-blur-md border-t border-gray-100 flex gap-4 z-30 -mx-10 -mb-10">
                                                <button
                                                    onClick={() => setShowModal(false)}
                                                    className="flex-1 py-6 border-2 border-gray-100 rounded-[2rem] font-black text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition-all uppercase tracking-widest text-xs"
                                                >
                                                    Discard
                                                </button>
                                                <button
                                                    disabled={isLoading || isVoiceUploading || !formData.title || (!formData.content?.trim() && (!formData.attachments || formData.attachments.length === 0))}
                                                    onClick={handleSave}
                                                    className="flex-[2] py-6 bg-wa-teal text-white rounded-[2rem] font-black shadow-2xl shadow-wa-teal/30 hover:bg-wa-teal/90 transition-all uppercase tracking-widest text-xs disabled:opacity-40 flex items-center justify-center gap-2"
                                                >
                                                    {isLoading ? (
                                                        <>
                                                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                            Saving...
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Save size={16} />
                                                            {editingTemplate ? 'Update Template' : 'Create Template'}
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </motion.div>
                                    {/* Live Preview Panel */}
                                    <AnimatePresence mode="popLayout">
                                        {showLivePreview && (
                                            <motion.div
                                                layout
                                                initial={{ x: 100, opacity: 0, width: 0 }}
                                                animate={{ x: 0, opacity: 1, width: 'auto' }}
                                                exit={{ x: 100, opacity: 0, width: 0 }}
                                                transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                                                className="hidden lg:flex flex-[2] bg-[url('https://i.pinimg.com/736x/8c/98/99/8c98994518b575bfd8c949e91d20548b.jpg')] bg-cover bg-center flex-col h-full relative shrink-0 border-l border-gray-100 overflow-hidden"
                                            >
                                                <div className="absolute inset-0 bg-white/90 backdrop-blur-sm"></div>
                                                <div className="relative p-6 px-8 border-b border-gray-200/50 bg-white/50 backdrop-blur-md sticky top-0 z-10 flex justify-between items-center bg-gradient-to-b from-white to-white/50">
                                                    <div>
                                                        <h4 className="font-black text-gray-800 flex items-center gap-2 text-lg"><Zap size={20} className="text-wa-teal fill-wa-teal/20" /> Live Preview</h4>
                                                        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold mt-1">Simulated delivery view</p>
                                                    </div>
                                                </div>
                                                <div className="relative flex-1 p-6 px-10 overflow-y-auto custom-scrollbar flex flex-col gap-3 pb-10">
                                                    <div className="text-center my-4">
                                                        <span className="bg-white/80 backdrop-blur text-[10px] font-black text-gray-500 uppercase tracking-widest px-4 py-2 rounded-full shadow-sm">Today</span>
                                                    </div>
                                                    {(formData.content) && (
                                                        <div className="bg-white p-4 pr-14 rounded-2xl rounded-tl-sm shadow-sm max-w-[85%] self-start relative border border-gray-100/50 hover:shadow-md transition-shadow">
                                                            <div
                                                                className="text-gray-800 font-medium text-[15px] leading-relaxed break-words whitespace-pre-wrap select-text"
                                                                dangerouslySetInnerHTML={generatePreviewHTML(formData.content)}
                                                            />
                                                            <div className="absolute bottom-2 right-3 flex items-center gap-1 opacity-60">
                                                                <span className="text-[10px] font-bold text-gray-400">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(formData.attachments && formData.attachments.length > 0) ? (
                                                        <div className="flex flex-col gap-3 max-w-[85%] self-start">
                                                            {formData.attachments.map((attach, idx) => (
                                                                <div key={idx} className="bg-white p-2 border-4 border-white rounded-2xl rounded-tl-sm shadow-sm relative group hover:shadow-md transition-shadow">
                                                                    {attach.type?.startsWith('image/') ? (
                                                                        <img src={attach.url.startsWith('http') ? attach.url : `http://localhost:3001${attach.url}`} className="w-full max-h-56 object-cover rounded-xl border border-gray-100/50" alt="Preview" />
                                                                    ) : attach.type?.startsWith('audio/') ? (
                                                                        <div className="w-full p-4 bg-wa-teal/5 rounded-xl border border-gray-100/50 flex flex-col items-center gap-3">
                                                                            <VoiceMessagePreview url={attach.url} />
                                                                            <span className="text-[10px] font-black text-wa-teal uppercase tracking-widest">Voice Note</span>
                                                                        </div>
                                                                    ) : attach.type === 'vcard' ? (
                                                                        <div className="w-full p-4 bg-white rounded-xl border flex items-center gap-4 text-gray-700">
                                                                            <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 overflow-hidden shrink-0">
                                                                                <UserCircle2 size={24} />
                                                                            </div>
                                                                            <div className="flex-1 truncate">
                                                                                <p className="font-bold text-[15px] text-emerald-600 truncate">{attach.name}</p>
                                                                                <p className="text-xs font-medium text-gray-500 mt-0.5 truncate">{attach.phone}</p>
                                                                            </div>
                                                                        </div>
                                                                    ) : (
                                                                        <div className="h-20 bg-gray-50 rounded-xl flex items-center justify-center text-gray-400 gap-3 px-6 border border-gray-100/50">
                                                                            <FileText size={20} className="text-red-500" />
                                                                            <span className="text-sm font-bold truncate">Attachment File</span>
                                                                        </div>
                                                                    )}
                                                                    {attach.caption && <p className="text-[15px] text-gray-700 mt-2 px-2 font-medium pb-2 whitespace-pre-wrap break-words">{attach.caption}</p>}
                                                                    <div className="absolute bottom-2 right-3 flex items-center gap-1 opacity-60 bg-white/80 px-1 rounded backdrop-blur">
                                                                        <span className="text-[10px] font-bold text-gray-400">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : null}

                                                    {/* Interactive Buttons Preview Removed */}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Location Attachment Modal */}
            <AnimatePresence>
                {showLocationModal && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowLocationModal(false)}
                            className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
                        ></motion.div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-sm bg-white rounded-[3rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8 pb-6 bg-gradient-to-br from-blue-50 to-white flex justify-between items-start border-b border-gray-100">
                                <div>
                                    <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                                        <div className="p-3 bg-blue-500 text-white rounded-xl shadow-lg shadow-blue-500/20">
                                            <Globe size={20} />
                                        </div>
                                        Add Location
                                    </h3>
                                    <p className="text-[10px] uppercase font-bold text-gray-400 mt-2 tracking-widest pl-16">Map Pinhole</p>
                                </div>
                                <button onClick={() => setShowLocationModal(false)} className="p-2 text-gray-400 hover:text-gray-800 bg-white rounded-full shadow-sm">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-5">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Location Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. Office, Delivery Spot"
                                        value={locationData.name}
                                        onChange={e => setLocationData({ ...locationData, name: e.target.value })}
                                        className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-gray-800 text-sm mb-4"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const setLocationFromCoords = (lat: number, lng: number) => {
                                                setLocationData(prev => ({
                                                    ...prev,
                                                    lat: lat.toString(),
                                                    lng: lng.toString()
                                                }));
                                            };

                                            const fallbackToIPLocation = async (originalPosition?: GeolocationPosition) => {
                                                try {
                                                    const res = await fetch('/api/location');
                                                    const data = await res.json();

                                                    if (data.success && data.latitude && data.longitude) {
                                                        setLocationFromCoords(data.latitude, data.longitude);
                                                        alert("Fetched approximate location (Browser GPS was inaccurate/blocked).");
                                                    } else {
                                                        throw new Error("Proxy API failed to resolve coords");
                                                    }
                                                } catch (err) {
                                                    console.warn("All advanced location methods failed:", err);
                                                    if (originalPosition) {
                                                        setLocationFromCoords(originalPosition.coords.latitude, originalPosition.coords.longitude);
                                                    } else {
                                                        alert("Could not automatically determine your location. Please enter it manually or check your internet connection.");
                                                    }
                                                }
                                            };

                                            if ('geolocation' in navigator) {
                                                navigator.geolocation.getCurrentPosition(
                                                    (position) => {
                                                        const latStr = position.coords.latitude.toString();
                                                        const lngStr = position.coords.longitude.toString();

                                                        // Check if browser is returning artificially truncated (low-precision) coordinates
                                                        if (latStr.length <= 6 || lngStr.length <= 6) {
                                                            console.warn("Browser returned low-precision coordinates. Attempting advanced network GPS.");
                                                            fallbackToIPLocation(position);
                                                        } else {
                                                            setLocationFromCoords(position.coords.latitude, position.coords.longitude);
                                                        }
                                                    },
                                                    (error) => {
                                                        console.warn("Browser Geolocation failed/denied. Falling back to advanced network GPS:", error);
                                                        fallbackToIPLocation();
                                                    },
                                                    { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
                                                );
                                            } else {
                                                fallbackToIPLocation();
                                            }
                                        }}
                                        className="w-full py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2 border border-blue-100"
                                    >
                                        <MapPin size={14} /> Use My Current Location
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Latitude</label>
                                        <input
                                            type="text"
                                            placeholder="23.8103"
                                            value={locationData.lat}
                                            onChange={e => setLocationData({ ...locationData, lat: e.target.value })}
                                            className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-gray-800 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Longitude</label>
                                        <input
                                            type="text"
                                            placeholder="90.4125"
                                            value={locationData.lng}
                                            onChange={e => setLocationData({ ...locationData, lng: e.target.value })}
                                            className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none font-bold text-gray-800 text-sm"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-8 pt-4 bg-gray-50/50 border-t border-gray-100 flex gap-4">
                                <button
                                    onClick={() => {
                                        if (!locationData.lat || !locationData.lng) return;
                                        setFormData(prev => ({
                                            ...prev,
                                            attachments: [...prev.attachments, { url: `loc_${locationData.lat}_${locationData.lng}`, type: 'location', lat: locationData.lat, lng: locationData.lng, name: locationData.name }]
                                        }));
                                        setLocationData({ lat: '', lng: '', name: '' });
                                        setShowLocationModal(false);
                                    }}
                                    disabled={!locationData.lat || !locationData.lng}
                                    className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-blue-600 transition-colors disabled:opacity-50 blur-0"
                                >
                                    <CheckCircle2 size={16} /> Attach Location
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* VCard Attachment Modal */}
            <AnimatePresence>
                {showVCardModal && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowVCardModal(false)}
                            className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
                        ></motion.div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-sm bg-white rounded-[3rem] shadow-2xl overflow-hidden"
                        >
                            <div className="p-8 pb-6 bg-gradient-to-br from-emerald-50 to-white flex justify-between items-start border-b border-gray-100">
                                <div>
                                    <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                                        <div className="p-3 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-500/20">
                                            <UserCircle2 size={20} />
                                        </div>
                                        Add Contact
                                    </h3>
                                    <p className="text-[10px] uppercase font-bold text-gray-400 mt-2 tracking-widest pl-16">Contact Card</p>
                                </div>
                                <button onClick={() => setShowVCardModal(false)} className="p-2 text-gray-400 hover:text-gray-800 bg-white rounded-full shadow-sm">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-8 space-y-5">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Contact Name</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. John Doe, HR Dept"
                                        value={vcardData.name}
                                        onChange={e => setVcardData({ ...vcardData, name: e.target.value })}
                                        className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-emerald-500 focus:bg-white outline-none font-bold text-gray-800 text-sm mb-4"
                                    />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 px-2">Phone Number</label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 8801700000000"
                                        value={vcardData.phone}
                                        onChange={e => setVcardData({ ...vcardData, phone: e.target.value.replace(/[^0-9+]/g, '') })}
                                        className="w-full px-5 py-4 bg-gray-50 rounded-2xl border-2 border-transparent focus:border-emerald-500 focus:bg-white outline-none font-bold text-gray-800 text-sm"
                                    />
                                    <p className="text-[10px] text-gray-400 font-medium px-2 mt-2">Include country code for best results (+880...)</p>
                                </div>
                            </div>

                            <div className="p-8 pt-4 bg-gray-50/50 border-t border-gray-100 flex gap-4">
                                <button
                                    onClick={() => {
                                        if (!vcardData.name || !vcardData.phone) return;
                                        const newAttachment = {
                                            url: `vcard_${Date.now()}`,
                                            type: 'vcard',
                                            name: vcardData.name,
                                            phone: vcardData.phone
                                        };
                                        setFormData(prev => ({
                                            ...prev,
                                            attachments: [...prev.attachments, newAttachment]
                                        }));
                                        setVcardData({ name: '', phone: '' });
                                        setShowVCardModal(false);
                                    }}
                                    disabled={!vcardData.name || !vcardData.phone}
                                    className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-emerald-600 transition-colors disabled:opacity-50 blur-0"
                                >
                                    <CheckCircle2 size={16} /> Attach VCard
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* AI Generator Modal */}
            <AnimatePresence>
                {
                    showAIModal && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                onClick={() => setShowAIModal(false)}
                                className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
                            ></motion.div>
                            <motion.div
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                                className="relative w-full max-w-xl bg-white rounded-[3rem] shadow-2xl border border-white overflow-hidden"
                            >
                                <div className="p-10">
                                    <div className="flex justify-between items-start mb-10">
                                        <div className="flex items-center gap-5">
                                            <div className="p-4 bg-gradient-to-br from-indigo-500 to-fuchsia-600 rounded-2xl text-white shadow-xl shadow-indigo-600/20">
                                                <Zap size={28} className="fill-white animate-pulse" />
                                            </div>
                                            <div>
                                                <h3 className="text-3xl font-black text-gray-800 tracking-tight">Magic AI Generator</h3>
                                                <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Smart Template Writer</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => setShowAIModal(false)}
                                            className="p-3 bg-gray-50 text-gray-400 hover:bg-rose-50 hover:text-rose-600 rounded-2xl transition-all"
                                        >
                                            <X size={24} />
                                        </button>
                                    </div>

                                    <div className="space-y-8">
                                        <div>
                                            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-4 px-1">What should the message be about?</label>
                                            <textarea
                                                placeholder="Example: Welcome message for new premium students with 10% discount code..."
                                                className="w-full p-6 bg-gray-50 border-2 border-gray-100 rounded-[2rem] focus:bg-white focus:border-wa-teal focus:ring-0 outline-none transition-all font-bold text-gray-700 min-h-[150px] shadow-inner"
                                                value={aiPrompt}
                                                onChange={(e) => setAIPrompt(e.target.value)}
                                            />
                                        </div>

                                        {/* Spintax Toggle */}
                                        <div className="flex items-center justify-between p-6 bg-indigo-50/30 rounded-3xl border border-indigo-100/50 group hover:border-indigo-200 transition-all cursor-pointer" onClick={() => setUseSpintaxAI(!useSpintaxAI)}>
                                            <div className="flex items-center gap-4">
                                                <div className={`p-3 rounded-2xl transition-all ${useSpintaxAI ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20' : 'bg-white text-gray-400 border border-gray-100'}`}>
                                                    <Shuffle size={20} className={useSpintaxAI ? 'animate-spin-slow' : ''} />
                                                </div>
                                                <div>
                                                    <h4 className="font-black text-gray-800 text-sm">Smart Spintax Mode</h4>
                                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">AI will generate variations (Anti-Ban)</p>
                                                </div>
                                            </div>
                                            <div className={`w-14 h-8 rounded-full p-1 transition-all duration-300 ${useSpintaxAI ? 'bg-indigo-600' : 'bg-gray-200'}`}>
                                                <motion.div
                                                    animate={{ x: useSpintaxAI ? 24 : 0 }}
                                                    className="w-6 h-6 bg-white rounded-full shadow-md"
                                                />
                                            </div>
                                        </div>

                                        <div className="flex gap-4">
                                            <button
                                                onClick={() => setShowAIModal(false)}
                                                className="px-8 py-4 bg-gray-100 text-gray-600 font-black rounded-2xl hover:bg-gray-200 transition-all uppercase tracking-widest text-xs"
                                            >
                                                Cancel
                                            </button>
                                            <motion.button
                                                whileHover={{ scale: 1.02 }}
                                                whileTap={{ scale: 0.98 }}
                                                disabled={isGenerating || !aiPrompt}
                                                onClick={handleAIGenerate}
                                                className={`flex-1 py-4 bg-gradient-to-r from-indigo-500 to-fuchsia-600 text-white font-black rounded-2xl shadow-xl transition-all flex items-center justify-center gap-3 uppercase tracking-widest text-xs ${isGenerating || !aiPrompt ? 'opacity-50 grayscale' : 'hover:shadow-indigo-500/30'}`}
                                            >
                                                {isGenerating ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                                ) : (
                                                    <Zap size={18} className="fill-white" />
                                                )}
                                                {isGenerating ? 'Generating...' : 'Generate Magic Template'}
                                            </motion.button>
                                        </div>

                                        <div className="p-6 bg-indigo-50/50 rounded-2xl border border-indigo-100/50">
                                            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1 flex items-center gap-2">
                                                <Info size={12} /> PRO TIP
                                            </p>
                                            <p className="text-xs text-indigo-700 leading-relaxed font-bold italic">
                                                "Be specific! Mention your target audience and the main offer for best results."
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    )
                }
            </AnimatePresence >

            {/* Library Modal */}
            <AnimatePresence>
                {showLibraryModal && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => { setShowLibraryModal(false); setSelectedLibraryTemplate(null); }}
                            className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
                        ></motion.div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative w-full max-w-4xl h-[90vh] bg-white rounded-[3rem] shadow-2xl border border-white flex flex-col overflow-hidden"
                        >
                            <div className="p-10 pb-4 border-b border-gray-100 flex justify-between items-start">
                                <div>
                                    <h3 className="text-3xl font-black text-gray-800 tracking-tight">Template Library</h3>
                                    <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">Choose from pre-built templates</p>
                                </div>
                                <button
                                    onClick={() => { setShowLibraryModal(false); setSelectedLibraryTemplate(null); }}
                                    className="p-3 bg-gray-50 text-gray-400 hover:bg-rose-50 hover:text-rose-600 rounded-2xl transition-all"
                                >
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="p-10 flex-1 overflow-y-auto custom-scrollbar">
                                <div className="mb-8 relative">
                                    <input
                                        type="text"
                                        placeholder="Search templates..."
                                        className="w-full p-4 pl-12 bg-gray-50 border-2 border-gray-100 rounded-[2rem] focus:bg-white focus:border-wa-teal focus:ring-0 outline-none transition-all font-bold text-gray-700 shadow-inner"
                                        value={librarySearchTerm}
                                        onChange={(e) => { setLibrarySearchTerm(e.target.value); setCurrentPage(1); }}
                                    />
                                    <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                                </div>

                                {filteredLibraryTemplates.length === 0 ? (
                                    <div className="text-center py-10 text-gray-500 font-bold">No templates found matching your search.</div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        {currentTemplates.map((template) => (
                                            <motion.div
                                                key={template.id}
                                                layout
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: 20 }}
                                                transition={{ duration: 0.2 }}
                                                className={`bg-white rounded-3xl shadow-lg border-2 p-4 cursor-pointer transition-all ${selectedLibraryTemplate?.id === template.id ? 'border-wa-teal ring-4 ring-wa-teal/20' : 'border-gray-100 hover:border-gray-200'}`}
                                                onClick={() => handleSelectTemplate(template)}
                                            >
                                                <div className="relative h-40 w-full rounded-2xl overflow-hidden mb-4 bg-wa-teal/5 flex items-center justify-center">
                                                    <FileText size={48} className="text-wa-teal/40" />
                                                    {selectedLibraryTemplate?.id === template.id && (
                                                        <div className="absolute inset-0 bg-wa-teal/30 flex items-center justify-center">
                                                            <CheckCircle size={40} className="text-white" />
                                                        </div>
                                                    )}
                                                </div>
                                                <h4 className="font-black text-gray-800 text-lg mb-2">{template.title}</h4>
                                                <p className="text-sm text-gray-600 line-clamp-3" dangerouslySetInnerHTML={generatePreviewHTML(template.content || '')}></p>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">{template.category}</span>
                                                </div>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}

                                {totalPages > 1 && (
                                    <div className="flex justify-center items-center gap-4 mt-8">
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className="p-3 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-all"
                                        >
                                            <ChevronLeft size={20} />
                                        </button>
                                        <span className="font-bold text-gray-700">{currentPage} / {totalPages}</span>
                                        <button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                            className="p-3 bg-gray-100 rounded-full text-gray-600 hover:bg-gray-200 disabled:opacity-50 transition-all"
                                        >
                                            <ChevronRight size={20} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="p-6 border-t border-gray-100 flex justify-end gap-4 bg-white/90 backdrop-blur-md">
                                <button
                                    onClick={() => { setShowLibraryModal(false); setSelectedLibraryTemplate(null); }}
                                    className="px-8 py-4 bg-gray-100 text-gray-600 font-black rounded-2xl hover:bg-gray-200 transition-all uppercase tracking-widest text-xs"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleApplyTemplate}
                                    disabled={!selectedLibraryTemplate}
                                    className="px-8 py-4 bg-wa-teal text-white font-black rounded-2xl shadow-xl shadow-wa-teal/30 hover:bg-wa-teal/90 transition-all uppercase tracking-widest text-xs disabled:opacity-40"
                                >
                                    Apply Selected Template
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Spintax Builder Modal */}
            <AnimatePresence>
                {showSpintaxModal && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSpintaxModal(false)}
                            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
                        ></motion.div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white p-8"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-inner">
                                        <Shuffle size={20} />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Spintax Builder</h3>
                                </div>
                                <button onClick={() => setShowSpintaxModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <p className="text-xs font-bold text-gray-500 italic">ব্যবহৃত আইটেমগুলোর মধ্যে বিরতি দিতে (comma) অথবা নতুন লাইন (Enter) ব্যবহার করুন।</p>
                                <textarea
                                    className="w-full h-32 p-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-700 transition-all resize-none shadow-inner"
                                    placeholder="e.g. Hi, Hello, Hey"
                                    value={spintaxInput}
                                    onChange={(e) => setSpintaxInput(e.target.value)}
                                    autoFocus
                                />
                                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Preview of Spintax Block:</p>
                                    <code className="text-sm font-black text-indigo-600 block truncate">
                                        {'{'}{spintaxInput.split(/[,|\n]+/).map(s => s.trim()).filter(Boolean).join('|')}{'}'}
                                    </code>
                                </div>
                            </div>

                            <div className="flex gap-4 mt-8">
                                <button
                                    onClick={() => setShowSpintaxModal(false)}
                                    className="flex-1 py-4 font-black uppercase tracking-widest text-xs text-gray-400 hover:bg-gray-50 rounded-2xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={!spintaxInput.trim()}
                                    onClick={() => {
                                        const options = spintaxInput.split(/[,|\n\/]+/).map(s => s.trim()).filter(Boolean);
                                        if (options.length > 0) {
                                            const spintax = `{${options.join('|')}}`;
                                            const textarea = document.getElementById('template-content-textarea') as HTMLTextAreaElement;
                                            if (textarea) {
                                                const start = textarea.selectionStart;
                                                const end = textarea.selectionEnd;
                                                const newText = formData.content.substring(0, start) + spintax + formData.content.substring(end);
                                                setFormData({ ...formData, content: newText });
                                                setTimeout(() => {
                                                    textarea.focus();
                                                    textarea.setSelectionRange(start + spintax.length, start + spintax.length);
                                                }, 0);
                                            } else {
                                                setFormData({ ...formData, content: formData.content + spintax });
                                            }
                                        }
                                        setSpintaxInput('');
                                        setShowSpintaxModal(false);
                                    }}
                                    className="flex-[2] py-4 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
                                >
                                    Insert Spintax
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default TemplatesView;
