import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    BrainCircuit,
    Building2,
    PackageSearch,
    BookOpen,
    RefreshCw,
    Save,
    Plus,
    Trash2,
    Edit2,
    CheckCircle2, MessageSquare, AlertCircle, ShoppingCart,
    Database, Link, ExternalLink, ArrowRight, Star, Settings, ChevronRight, Zap, Target, MousePointer2,
    Sparkles, Tag, TrendingUp, Cpu, Activity, Globe, Search, Filter, X, Layers, Info,
    ChevronLeft, ShoppingBag, History as HistoryIcon, Clock
} from 'lucide-react';
import ProcessModal from './ProcessModal';

export default function AIBrainView() {
    const [activeTab, setActiveTab] = useState<'profile' | 'products' | 'knowledge' | 'analytics' | 'logs'>('profile');
    const [loading, setLoading] = useState(false);

    // States
    const [profile, setProfile] = useState<any>({});
    const [products, setProducts] = useState<any[]>([]);
    const [knowledge, setKnowledge] = useState<any[]>([]);
    const [pagination, setPagination] = useState({ total: 0, pendingTotal: 0, page: 1, limit: 50, totalPages: 0 });
    const [isFetchingMore, setIsFetchingMore] = useState(false);

    // AI Command Center States
    const [aiLogs, setAiLogs] = useState<any[]>([]);
    const [aiAnalytics, setAiAnalytics] = useState<any>({
        total_replies: 0,
        handover_rate: 0,
        avg_confidence: 0,
        daily_trends: []
    });
    const [logsPagination, setLogsPagination] = useState({ total: 0, page: 1, limit: 50 });
    const [selectedLog, setSelectedLog] = useState<any>(null);

    // 🔒 VECTOR SYNC CONFIRMATION MODAL STATE
    const [confirmModal, setConfirmModal] = useState<{
        open: boolean;
        type: 'products' | 'profile' | 'knowledge' | null;
        onConfirm: (() => void) | null;
    }>({ open: false, type: null, onConfirm: null });

    // Process Modal States
    const [processModalOpen, setProcessModalOpen] = useState(false);
    const [processLogs, setProcessLogs] = useState<any[]>([]);
    const [processCurrent, setProcessCurrent] = useState(0);
    const [processTotal, setProcessTotal] = useState(50);
    const [processStatus, setProcessStatus] = useState<'processing' | 'completed' | 'failed'>('processing');
    const [currentProcessId, setCurrentProcessId] = useState<string | null>(null);
    const [discoveries, setDiscoveries] = useState<number>(0);

    useEffect(() => {
        fetchProfile();
        fetchProducts(1); // Proactively fetch products count for the sync badge

        const socket = (window as any).socket;
        if (!socket) return;

        socket.on('process_start', (data: any) => {
            if (data.id.startsWith('ai_brain_sync') || data.id.startsWith('vector_sync')) {
                setCurrentProcessId(data.id);
                setProcessModalOpen(true);
                setProcessStatus('processing');
                setProcessCurrent(0);
                setProcessTotal(data.total || 50);
                setProcessLogs([{
                    id: 'start',
                    message: `🚀 ${data.title || 'Process'} initialized...`,
                    type: 'info',
                    timestamp: new Date().toLocaleTimeString()
                }]);
            }
        });

        socket.on('process_update', (data: any) => {
            if (data.id === currentProcessId) {
                setProcessLogs(prev => [...prev.slice(-99), {
                    id: Date.now().toString() + Math.random(),
                    message: data.message,
                    type: data.type || 'info',
                    timestamp: new Date().toLocaleTimeString()
                }]);
            }
        });

        socket.on('process_progress', (data: any) => {
            if (data.id === currentProcessId) {
                setProcessCurrent(data.current);
                if (data.total) setProcessTotal(data.total);
            }
        });

        socket.on('process_end', (data: any) => {
            if (data.id === currentProcessId) {
                setProcessStatus(data.status);
                setProcessLogs(prev => [...prev, {
                    id: 'end',
                    message: data.message,
                    type: data.status === 'completed' ? 'success' : 'error',
                    timestamp: new Date().toLocaleTimeString()
                }]);
                
                // Refresh data
                if (activeTab === 'profile') fetchProfile();
                // Always refresh products count for the sync badge regardless of active tab
                fetchProducts(1);
                if (activeTab === 'knowledge') fetchKnowledge();
            }
        });

        socket.on('new_ai_product_scraped', (data: any) => {
            // v15.0 Enterprise: Optimization to prevent browser RAM bloat
            // Instead of injecting 5,000 products into React state (which consumes ~2GB RAM),
            // we increment the total count and show a "New Discoveries" signal.
            setPagination(prev => ({ 
                ...prev, 
                total: prev.total + 1, 
                pendingTotal: prev.pendingTotal + 1 
            }));
            
            // Only update products list if we are on page 1 and have very few items
            // This allows the user to see initial progress without crashing the browser.
            setProducts(prev => {
                if (prev.length < 20 && pagination.page === 1) {
                    const exists = prev.find(p => p.id === data.product.id || p.name === data.product.name);
                    if (exists) return prev.map(p => (p.id === data.product.id || p.name === data.product.name) ? { ...p, ...data.product } : p);
                    return [data.product, ...prev];
                }
                return prev;
            });

            setDiscoveries(prev => prev + 1);
        });

        socket.on('intelligent_products_changed', () => {
            if (activeTab === 'products') fetchProducts(1);
        });

        if (activeTab === 'analytics') fetchAIAnalytics();
        if (activeTab === 'logs') fetchAILogs(1);

        return () => {
            socket.off('process_start');
            socket.off('process_update');
            socket.off('process_progress');
            socket.off('process_end');
            socket.off('new_ai_product_scraped');
            socket.off('intelligent_products_changed');
        };
    }, [currentProcessId, activeTab]);

    const fetchProfile = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/profile');
            const data = await res.json();
            if (data.success) setProfile(data.profile || {});
        } catch (e) { console.error(e); }
    };

    const fetchProducts = useCallback(async (page = 1, search = '') => {
        if (page === 1) setLoading(true);
        else setIsFetchingMore(true);

        try {
            const limit = 50;
            const offset = (page - 1) * limit;
            const res = await fetch(`http://localhost:3001/api/ai-brain/products?limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ''}`);
            const data = await res.json();
            if (data.success) {
                if (page === 1) {
                    setProducts(data.products || []);
                } else {
                    setProducts(prev => {
                        // Avoid duplicates if any
                        const existingIds = new Set(prev.map(p => p.id));
                        const newProducts = (data.products || []).filter((p: any) => !existingIds.has(p.id));
                        return [...prev, ...newProducts];
                    });
                }
                if (data.pagination) setPagination(data.pagination);
            }
        } catch (e) { console.error(e); }

        setLoading(false);
        setIsFetchingMore(false);
    }, []);

    const fetchKnowledge = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/knowledge');
            const data = await res.json();
            if (data.success) setKnowledge(data.documents || []);
        } catch (e) { console.error(e); }
    };

    const fetchAILogs = async (page = 1) => {
        setLoading(true);
        try {
            const limit = logsPagination.limit;
            const offset = (page - 1) * limit;
            const res = await fetch(`http://localhost:3001/api/ai-brain/logs?limit=${limit}&offset=${offset}`);
            const data = await res.json();
            if (data.success) {
                setAiLogs(data.logs || []);
                setLogsPagination(prev => ({ ...prev, total: data.total, page }));
            }
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const fetchAIAnalytics = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/analytics');
            const data = await res.json();
            if (data.success) setAiAnalytics(data.stats);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const syncBrain = async () => {
        // 🔒 GUARD: Show confirmation modal before scraper sync
        setConfirmModal({
            open: true,
            type: null,
            onConfirm: async () => {
                setConfirmModal({ open: false, type: null, onConfirm: null });
                setLoading(true);
                try {
                    const res = await fetch('http://localhost:3001/api/ai-brain/sync', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        setCurrentProcessId(data.id);
                        setProcessModalOpen(true);
                    }
                } catch (e) {
                    alert('Sync failed');
                }
                setLoading(false);
            }
        });
    };

    // 🔒 STRICT GUARD: ALL vector syncs go through this function
    // This is the ONLY way to trigger vectorization from the UI
    const syncVectors = (type: 'products' | 'profile' | 'knowledge' = 'products') => {
        // Step 1: Show the confirmation modal - MANDATORY, no bypass
        setConfirmModal({
            open: true,
            type,
            onConfirm: async () => {
                // Step 2: Only run AFTER the user explicitly confirms
                setConfirmModal({ open: false, type: null, onConfirm: null });
                setLoading(true);
                try {
                    const endpoint = `/api/ai-brain/vectors/sync-${type}`;
                    const res = await fetch(`http://localhost:3001${endpoint}`, { method: 'POST' });
                    const data = await res.json();

                    if (res.status === 409) {
                        alert('⚠️ A vector sync is already running. Please wait for it to complete.');
                        setLoading(false);
                        return;
                    }

                    if (data.success) {
                        setCurrentProcessId(data.id);
                        setProcessModalOpen(true);
                    } else {
                        alert(`❌ Sync failed: ${data.error || 'Unknown error'}`);
                    }
                } catch (e) {
                    alert(`${type} vector sync failed`);
                }
                setLoading(false);
            }
        });
    };


    const pendingVectors = pagination.pendingTotal || 0;

    return (
        <div className="h-[calc(100vh-40px)] flex flex-col gap-5 pb-[10px] overflow-hidden">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                        <BrainCircuit className="text-purple-600" />
                        AI Brain Hub
                    </h1>
                    <p className="text-gray-500">Manage business intelligence for the RAG Auto-Reply system.</p>
                </div>
                {discoveries > 0 && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-purple-100 border border-purple-200 text-purple-700 px-4 py-1.5 rounded-full text-sm font-medium flex items-center gap-2 shadow-sm animate-pulse"
                    >
                        <Sparkles size={14} />
                        {discoveries} new intelligence findings
                    </motion.div>
                )}
                <div className="flex gap-3">
                    <button
                        onClick={syncBrain}
                        disabled={loading}
                        className="bg-white border border-gray-200 hover:border-purple-300 text-gray-700 px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all hover:shadow-md active:scale-95"
                    >
                        <RefreshCw size={18} className={loading && currentProcessId?.startsWith('ai_brain_sync') ? 'animate-spin' : ''} />
                        Sync Scraper
                    </button>
                    <button
                        onClick={() => syncVectors('products')}
                        disabled={loading}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 font-bold transition-all shadow-lg shadow-purple-200 active:scale-95"
                    >
                        <Zap size={18} className={loading && currentProcessId?.startsWith('vector_sync_products') ? 'animate-spin text-yellow-300' : 'text-yellow-300'} />
                        Sync Products Brain ({pagination.total})
                        {pendingVectors > 0 && (
                            <span className="bg-white/20 px-1.5 py-0.5 rounded-md text-[10px] ml-1">{pendingVectors}</span>
                        )}
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200">
                <button
                    onClick={() => { setActiveTab('profile'); fetchProfile(); }}
                    className={`px-6 py-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'profile' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <Building2 size={18} /> Business Profile
                </button>
                <button
                    onClick={() => { setActiveTab('products'); fetchProducts(1); setDiscoveries(0); }}
                    className={`px-6 py-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'products' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <PackageSearch size={18} /> AI Products
                    {discoveries > 0 && (
                        <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                            {discoveries}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => { setActiveTab('knowledge'); fetchKnowledge(); }}
                    className={`px-6 py-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'knowledge' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <BookOpen size={18} /> Knowledge Base
                </button>
                <button
                    onClick={() => { setActiveTab('analytics'); fetchAIAnalytics(); }}
                    className={`px-6 py-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'analytics' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <TrendingUp size={18} /> Performance
                </button>
                <button
                    onClick={() => { setActiveTab('logs'); fetchAILogs(1); }}
                    className={`px-6 py-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'logs' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <HistoryIcon size={18} /> Audit Logs
                </button>
            </div>

            {/* Content Area */}
            <div className={`flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden ${activeTab !== 'products' ? 'p-6 overflow-y-auto custom-scrollbar' : 'p-0'}`}>
                {activeTab === 'profile' && <ProfileTab profile={profile} fetchProfile={fetchProfile} syncVectors={syncVectors} />}
                {activeTab === 'products' && (
                    <ProductsTab 
                        products={products} 
                        fetchProducts={fetchProducts} 
                        pagination={pagination} 
                        isFetchingMore={isFetchingMore}
                    />
                )}
                {activeTab === 'knowledge' && <KnowledgeTab knowledge={knowledge} fetchKnowledge={fetchKnowledge} syncVectors={syncVectors} />}
                {activeTab === 'analytics' && <AnalyticsTab stats={aiAnalytics} />}
                {activeTab === 'logs' && (
                    <LogsTab 
                        logs={aiLogs} 
                        pagination={logsPagination} 
                        fetchLogs={fetchAILogs} 
                        onSelect={setSelectedLog} 
                    />
                )}
            </div>

            <ProcessModal
                isOpen={processModalOpen}
                title="AI Brain Sync Engine"
                current={processCurrent}
                total={processTotal}
                logs={processLogs}
                status={processStatus}
                id={currentProcessId || ''}
                onClose={() => setProcessModalOpen(false)}
            />

            {/* 🔒 VECTOR SYNC CONFIRMATION MODAL - Guards ALL vector sync actions */}
            <VectorSyncConfirmModal
                open={confirmModal.open}
                type={confirmModal.type}
                onConfirm={confirmModal.onConfirm!}
                onCancel={() => setConfirmModal({ open: false, type: null, onConfirm: null })}
            />

            <LogDetailModal log={selectedLog} onClose={() => setSelectedLog(null)} />

        </div>
    );
}

function ProfileTab({ profile, fetchProfile, syncVectors }: { profile: any, fetchProfile: () => void, syncVectors: (type: 'products' | 'profile' | 'knowledge') => void }) {
    const [formData, setFormData] = useState<any>(profile || {});
    const [saving, setSaving] = useState(false);

    useEffect(() => { setFormData(profile || {}); }, [profile]);

    const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const saveProfile = async () => {
        setSaving(true);
        try {
            await fetch('http://localhost:3001/api/ai-brain/profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            fetchProfile();
            // alert removed for smoother experience
        } catch (e) { alert('Save failed'); }
        setSaving(false);
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl space-y-8">
            <div>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">Business Intelligence Profile</h2>
                <p className="text-sm text-gray-500 font-medium">Fine-tune the foundational data that powers your AI's understanding.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Enterprise Name</label>
                        <input type="text" name="company_name" value={formData.company_name || ''} onChange={handleChange} className="w-full p-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all outline-none font-bold text-gray-800 shadow-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Direct Line</label>
                        <input type="text" name="contact_phone" value={formData.contact_phone || ''} onChange={handleChange} className="w-full p-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all outline-none font-bold text-gray-800 shadow-sm" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Digital Presence (URL)</label>
                        <div className="relative">
                            <Globe className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input type="text" name="main_website_url" value={formData.main_website_url || ''} onChange={handleChange} placeholder="https://yourstore.com" className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-purple-100 focus:bg-white transition-all outline-none font-bold text-gray-800 shadow-sm" />
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="p-6 bg-purple-600 rounded-[2rem] shadow-xl shadow-purple-100 flex flex-col justify-between h-full min-h-[180px]">
                        <div className="flex justify-between items-start">
                            <div>
                                <h3 className="font-black text-white text-lg leading-tight">AI Deployment</h3>
                                <p className="text-purple-100 text-xs font-bold mt-1 opacity-80">RAG-based Automated Intelligence</p>
                            </div>
                            <button
                                onClick={() => setFormData({ ...formData, ai_auto_reply_enabled: formData.ai_auto_reply_enabled === 'true' ? 'false' : 'true' })}
                                className={`w-14 h-7 rounded-full transition-all relative ${formData.ai_auto_reply_enabled === 'true' ? 'bg-white shadow-inner' : 'bg-purple-800/50'}`}
                            >
                                <div className={`absolute top-1 w-5 h-5 rounded-full transition-all flex items-center justify-center ${formData.ai_auto_reply_enabled === 'true' ? 'left-8 bg-purple-600' : 'left-1 bg-white/20'}`}>
                                    {formData.ai_auto_reply_enabled === 'true' && <Zap size={10} className="text-white" />}
                                </div>
                            </button>
                        </div>
                        <div className="pt-4 border-t border-white/10">
                            <span className="text-[10px] font-black text-white uppercase tracking-widest opacity-60">Status</span>
                            <div className="text-white font-bold flex items-center gap-2 mt-0.5">
                                <div className={`w-2 h-2 rounded-full ${formData.ai_auto_reply_enabled === 'true' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                                {formData.ai_auto_reply_enabled === 'true' ? 'ACTIVE & RESPONDING' : 'OFFLINE'}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="col-span-1 md:col-span-2 space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">HQ Address</label>
                        <input type="text" name="address" value={formData.address || ''} onChange={handleChange} className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-2 focus:ring-purple-100 outline-none font-bold text-gray-800" />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <PackageSearch size={16} className="text-purple-500" /> Logistics Strategy
                            </label>
                            <textarea name="shipping_policy" value={formData.shipping_policy || ''} onChange={handleChange} rows={4} placeholder="Define how products reach your customers..." className="w-full p-4 bg-gray-50 border border-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-50 focus:bg-white outline-none text-sm font-medium transition-all" />
                        </div>
                        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                <RefreshCw size={16} className="text-rose-500" /> Trust Framework
                            </label>
                            <textarea name="return_policy" value={formData.return_policy || ''} onChange={handleChange} rows={4} placeholder="Returns, refunds, and customer protection..." className="w-full p-4 bg-gray-50 border border-gray-50 rounded-2xl focus:ring-2 focus:ring-rose-50 focus:bg-white outline-none text-sm font-medium transition-all" />
                        </div>
                    </div>
                </div>
            </div>

            <div className="pt-4 flex gap-4">
                <button
                    onClick={saveProfile}
                    disabled={saving}
                    className="group bg-gray-900 hover:bg-black text-white px-8 py-4 rounded-[2rem] flex items-center gap-3 font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-gray-200 transition-all active:scale-95"
                >
                    <Save size={18} className="group-hover:rotate-12 transition-transform" />
                    {saving ? 'UPDATING SYSTEM...' : 'COMMIT PROFILE CHANGES'}
                </button>
                <button
                    onClick={() => syncVectors('profile')}
                    className="group bg-white border-2 border-purple-600 text-purple-600 hover:bg-purple-50 px-8 py-4 rounded-[2rem] flex items-center gap-3 font-black text-xs uppercase tracking-[0.2em] transition-all active:scale-95"
                >
                    <Zap size={18} className="text-yellow-500" />
                    Sync Profile Brain
                </button>
            </div>
        </motion.div>
    );
}

function ProductsTab({ products, fetchProducts, pagination, isFetchingMore }: { products: any[], fetchProducts: (page?: number, search?: string) => void, pagination: any, isFetchingMore: boolean }) {
    const [adding, setAdding] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [formData, setFormData] = useState<any>({
        name: '', price: '', description: '', product_url: '',
        full_description: '', sku: '', regular_price: '', sale_price: '',
        composition: '', handling_guidelines: '', technical_attributes: ''
    });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isAllSelectedGlobally, setIsAllSelectedGlobally] = useState(false);
    
    // V16.0 Virtualization: Ultra-low RAM DOM Rendering
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const rowHeight = 100; // Est. height per row
    const viewportBuffer = 10; // Extra rows for smooth scroll
    
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - viewportBuffer);
    const visibleProducts = products.slice(startIndex, startIndex + 30); // Render window of 30
    const topSpacer = startIndex * rowHeight;
    const bottomSpacer = Math.max(0, (products.length - (startIndex + visibleProducts.length)) * rowHeight);

    const toggleSelectAll = () => {
        if (isAllSelectedGlobally) {
            setIsAllSelectedGlobally(false);
            setSelectedIds(new Set());
        } else if (selectedIds.size === products.length && products.length > 0) {
            setSelectedIds(new Set());
            setIsAllSelectedGlobally(false);
        } else {
            setSelectedIds(new Set(products.map(p => p.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) {
            next.delete(id);
            setIsAllSelectedGlobally(false); // Deselecting one breaks global select
        } else {
            next.add(id);
        }
        setSelectedIds(next);
    };

    const bulkDelete = async () => {
        if (selectedIds.size === 0 && !isAllSelectedGlobally) return;
        
        const count = isAllSelectedGlobally ? pagination.total : selectedIds.size;
        if (!confirm(`Are you sure you want to delete ${count} products?`)) return;

        try {
            const body: any = { selectionMode: isAllSelectedGlobally ? 'filter' : 'ids' };
            if (isAllSelectedGlobally) {
                body.filter = { search: searchQuery };
            } else {
                body.ids = Array.from(selectedIds);
            }

            const res = await fetch('http://localhost:3001/api/ai-brain/products/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                setSelectedIds(new Set());
                setIsAllSelectedGlobally(false);
                fetchProducts(1, searchQuery);
            }
        } catch (e) { alert('Bulk delete failed'); }
    };

    // Server-side search debouncing
    useEffect(() => {
        const timer = setTimeout(() => {
            fetchProducts(1, searchQuery);
            setIsAllSelectedGlobally(false); // Reset global select on search change
        }, 500);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // Infinite Scroll Implementation
    const observer = React.useRef<IntersectionObserver | null>(null);
    const lastElementRef = React.useCallback((node: any) => {
        if (isFetchingMore) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && pagination.page < pagination.totalPages) {
                fetchProducts(pagination.page + 1, searchQuery);
            }
        });
        if (node) observer.current.observe(node);
    }, [isFetchingMore, pagination, searchQuery, fetchProducts]);

    const addProduct = async () => {
        try {
            await fetch('http://localhost:3001/api/ai-brain/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            fetchProducts(1);
            setAdding(false);
            setFormData({
                name: '', price: '', description: '', product_url: '',
                full_description: '', sku: '', regular_price: '', sale_price: '',
                composition: '', handling_guidelines: '', technical_attributes: ''
            });
        } catch (e) { alert('Failed to add product'); }
    };

    const deleteProduct = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            await fetch(`http://localhost:3001/api/ai-brain/products/${id}`, { method: 'DELETE' });
            fetchProducts(1);
        } catch (e) { alert('Failed to delete'); }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6 p-6 h-full min-h-0">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Product Catalog</h2>
                    <p className="text-sm text-gray-500 font-medium">Manage and monitor {pagination.total} intelligence nodes.</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Find a product..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-purple-200 focus:border-purple-400 outline-none transition-all text-sm font-medium"
                        />
                    </div>
                    {selectedIds.size > 0 && (
                        <button
                            onClick={bulkDelete}
                            className="bg-rose-50 hover:bg-rose-100 text-rose-600 px-5 py-2.5 rounded-2xl flex items-center gap-2 font-bold text-sm transition-all border border-rose-100"
                        >
                            <Trash2 size={18} /> Delete {isAllSelectedGlobally ? pagination.total : selectedIds.size}
                        </button>
                    )}
                    <button onClick={() => setAdding(!adding)} className="bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-2xl flex items-center gap-2 font-bold text-sm shadow-lg shadow-gray-200 transition-all active:scale-95">
                        <Plus size={18} /> Add Node
                    </button>
                </div>
            </div>

            {adding && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="bg-purple-50/50 p-6 rounded-[2.5rem] border border-purple-100 mb-2 shadow-inner"
                >
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Product Name</label>
                            <input type="text" placeholder="e.g. Premium Silk Saree" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Price Point (Display)</label>
                            <input type="text" placeholder="e.g. 2450 Tk" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">SKU / Code</label>
                            <input type="text" placeholder="e.g. PROD-123" value={formData.sku || ''} onChange={e => setFormData({ ...formData, sku: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Regular Price</label>
                            <input type="text" placeholder="e.g. 2800 Tk" value={formData.regular_price || ''} onChange={e => setFormData({ ...formData, regular_price: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Offer Price</label>
                            <input type="text" placeholder="e.g. 2450 Tk" value={formData.sale_price || ''} onChange={e => setFormData({ ...formData, sale_price: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Quick Snapshot</label>
                            <textarea placeholder="Write a short summary..." value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-purple-200 outline-none" rows={2} />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Full Description (SEO Rich Content)</label>
                            <textarea placeholder="Paste detailed descriptions or rich content here..." value={formData.full_description || ''} onChange={e => setFormData({ ...formData, full_description: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-purple-200 outline-none" rows={3} />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Composition (Fabric/Ingredients)</label>
                            <input type="text" placeholder="e.g. 100% Cotton" value={formData.composition || ''} onChange={e => setFormData({ ...formData, composition: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Handling (Care/Usage)</label>
                            <input type="text" placeholder="e.g. Hand Wash Only" value={formData.handling_guidelines || ''} onChange={e => setFormData({ ...formData, handling_guidelines: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Technical Attributes (Fit/Dims/Specs)</label>
                            <textarea placeholder="Fit: Slim | Stretch: Low | Weight: 250g" value={formData.technical_attributes || ''} onChange={e => setFormData({ ...formData, technical_attributes: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-purple-200 outline-none" rows={2} />
                        </div>
                        <div className="col-span-2 flex gap-3 pt-2">
                            <button onClick={addProduct} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-purple-100 transition-all">Save Intelligence Node</button>
                            <button onClick={() => setAdding(false)} className="px-6 py-3 bg-white border border-gray-200 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all">Cancel</button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* 
              Enterprise-grade responsive table:
              - table-fixed: columns share space, no overflow bleed
              - w-full: fills entire container, no min-width hard-code
              - column widths in % → fully dynamic to viewport
              - All text content uses truncate so no cell can expand past its column
            */}
            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
                {/* Selection Banner */}
                {selectedIds.size === products.length && products.length > 0 && pagination.total > products.length && (
                    <div className="bg-purple-600 text-white px-8 py-2 text-[11px] font-bold flex items-center justify-center gap-4 transition-all animate-in slide-in-from-top">
                        <span>{isAllSelectedGlobally ? `All ${pagination.total} products in the brain are selected.` : `All ${products.length} products on this page are selected.`}</span>
                        {!isAllSelectedGlobally ? (
                            <button 
                                onClick={() => setIsAllSelectedGlobally(true)}
                                className="underline hover:text-yellow-300 transition-colors"
                            >
                                Select all {pagination.total} products in the brain
                            </button>
                        ) : (
                            <button 
                                onClick={() => setIsAllSelectedGlobally(false)}
                                className="underline hover:text-yellow-300 transition-colors"
                            >
                                Clear selection
                            </button>
                        )}
                    </div>
                )}
                <div 
                    ref={containerRef}
                    onScroll={handleScroll}
                    className="overflow-x-hidden overflow-y-auto custom-scrollbar flex-1 min-h-0"
                >
                    <table className="w-full text-left border-collapse table-fixed">
                        <colgroup>
                            {/* Checkbox */}
                            <col style={{ width: '44px' }} />
                            {/* Name + variants — takes the bulk of space */}
                            <col style={{ width: '42%' }} />
                            {/* Price */}
                            <col style={{ width: '15%' }} />
                            {/* Origin */}
                            <col style={{ width: '13%' }} />
                            {/* Brain Status */}
                            <col style={{ width: '15%' }} />
                            {/* Actions */}
                            <col style={{ width: '80px' }} />
                        </colgroup>
                        <thead className="bg-gray-50/50 sticky top-0 z-10 backdrop-blur-md">
                            <tr>
                                <th className="px-3 py-4">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === products.length && products.length > 0}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                    />
                                </th>
                                <th className="px-3 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">
                                    <div className="flex items-center gap-2">
                                        <Tag size={12} className="text-purple-400 flex-shrink-0" /> Intelligence Node
                                    </div>
                                </th>
                                <th className="px-3 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp size={12} className="text-emerald-400 flex-shrink-0" /> Valuation
                                    </div>
                                </th>
                                <th className="px-3 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">
                                    <div className="flex items-center gap-2">
                                        <Cpu size={12} className="text-indigo-400 flex-shrink-0" /> Origin
                                    </div>
                                </th>
                                <th className="px-3 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">
                                    <div className="flex items-center gap-2">
                                        <Activity size={12} className="text-amber-400 flex-shrink-0" /> Status
                                    </div>
                                </th>
                                <th className="px-3 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Act</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {products.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-20 text-center">
                                        <div className="flex flex-col items-center gap-3 opacity-20">
                                            <PackageSearch size={48} />
                                            <p className="font-bold tracking-tight">No products found in the brain.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                <>
                                    {topSpacer > 0 && <tr><td colSpan={6} style={{ height: topSpacer }} /></tr>}
                                    {visibleProducts.map((p, i) => (
                                        <tr
                                            key={p.id || (startIndex + i)}
                                            onClick={() => setSelectedProduct(p)}
                                            className={`group hover:bg-purple-50/40 transition-all cursor-pointer border-b border-gray-50/80 last:border-0 ${selectedIds.has(p.id) ? 'bg-purple-50/20' : ''}`}
                                        >
                                            {/* Checkbox */}
                                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(p.id)}
                                                    onChange={() => toggleSelect(p.id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                />
                                            </td>
        
                                            {/* Name + Description + Variants */}
                                            <td className="px-3 py-3 overflow-hidden">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    {/* Product thumbnail */}
                                                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden border-2 border-gray-100 flex-shrink-0 shadow-sm group-hover:border-purple-200 transition-all duration-200">
                                                        {p.image_url ? (
                                                            <img loading="lazy" src={p.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                        ) : (
                                                            <PackageSearch className="text-gray-200" size={22} />
                                                        )}
                                                    </div>
                                                    {/* Text content - MUST stay within column */}
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-extrabold text-gray-900 group-hover:text-purple-700 transition-colors truncate text-sm mb-0.5">{p.name}</div>
                                                        <div className="text-[10px] text-gray-400 font-medium truncate">{p.description || 'No description...'}</div>
                                                        {/* Inline variant badges */}
                                                        {(() => {
                                                            const raw = p.variants;
                                                            let items: any[] = [];
                                                            try {
                                                                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                                                items = parsed?.items || (Array.isArray(parsed) ? parsed : []);
                                                            } catch { items = []; }
                                                            if (items.length === 0) return null;
                                                            return (
                                                                <div className="flex flex-wrap gap-1 mt-1.5">
                                                                    {items.slice(0, 3).map((v: any, vi: number) => (
                                                                        <span key={vi} className="px-2 py-0.5 bg-purple-50 text-[9px] font-black text-purple-600 rounded-md border border-purple-100/60 uppercase tracking-tighter whitespace-nowrap">
                                                                            {v.type || v.name}: {v.value || v.sku}
                                                                        </span>
                                                                    ))}
                                                                    {items.length > 3 && (
                                                                        <span className="px-2 py-0.5 bg-gray-50 text-[9px] font-black text-gray-400 rounded-md border border-gray-100 uppercase tracking-tighter whitespace-nowrap">
                                                                            +{items.length - 3}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            );
                                                        })()}
                                                        {/* Domain + ID row */}
                                                        <div className="flex items-center gap-2 mt-1">
                                                            {p.product_url && (
                                                                <div className="inline-flex items-center gap-1 text-[9px] font-bold text-gray-300 group-hover:text-purple-400 uppercase transition-colors truncate max-w-[120px]">
                                                                    <Globe size={9} />
                                                                    <span className="truncate">{(() => { try { return new URL(p.product_url).hostname; } catch { return ''; } })()}</span>
                                                                </div>
                                                            )}
                                                            <div className="text-[9px] font-bold text-gray-300 uppercase tracking-tighter flex-shrink-0">#{String(p.id).slice(-6)}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
        
                                            {/* Price */}
                                            <td className="px-3 py-3 overflow-hidden">
                                                <div className="flex flex-col gap-0.5">
                                                    {p.regular_price && p.sale_price ? (
                                                        <>
                                                            <div className="text-[10px] font-bold text-gray-400 line-through leading-none truncate">{p.regular_price}</div>
                                                            <div className="flex items-center gap-1 flex-wrap">
                                                                <div className="text-base font-black text-emerald-600 tracking-tight leading-none truncate">{p.sale_price}</div>
                                                                <div className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black rounded border border-emerald-100/50 flex-shrink-0">OFFER</div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <div className="text-base font-black text-gray-900 tracking-tight truncate">{p.price || 'N/A'}</div>
                                                    )}
                                                    <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Price</div>
                                                </div>
                                            </td>
        
                                            {/* Origin */}
                                            <td className="px-3 py-3 overflow-hidden">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest max-w-full ${p.manual_override ? 'bg-indigo-50/80 text-indigo-600 border border-indigo-100' : 'bg-emerald-50/80 text-emerald-600 border border-emerald-100'}`}>
                                                    {p.manual_override ? <Edit2 size={10} /> : <Zap size={10} />}
                                                    <span className="truncate">{p.manual_override ? 'Manual' : 'System'}</span>
                                                </div>
                                            </td>

                                    {/* Brain Status */}
                                    <td className="px-3 py-3 overflow-hidden">
                                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest max-w-full ${p.embedding && p.embedding.length > 10 ? 'bg-teal-50 text-teal-600 border border-teal-100' : 'bg-amber-50/80 text-amber-600 border border-amber-100'}`}>
                                            {p.embedding && p.embedding.length > 10 ? (
                                                <><CheckCircle2 size={10} /><span className="truncate">Ready</span></>
                                            ) : (
                                                <><Activity size={10} className="animate-pulse" /><span className="truncate">Pending</span></>
                                            )}
                                        </div>
                                    </td>

                                    {/* Actions */}
                                    <td className="px-3 py-3 text-right">
                                        <div className="flex justify-end items-center gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteProduct(p.id); }}
                                                className="p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
                                                title="Remove"
                                            >
                                                <Trash2 size={15} />
                                            </button>
                                            <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-purple-600 group-hover:text-white group-hover:shadow-md group-hover:shadow-purple-200 transition-all duration-300">
                                                <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                                            </div>
                                        </div>
                                    </td>
                                        </tr>
                                    ))}
                                    {bottomSpacer > 0 && <tr><td colSpan={6} style={{ height: bottomSpacer }} /></tr>}
                                    {/* Infinite Scroll Sentinel */}
                                    {!isFetchingMore && pagination.page < pagination.totalPages && (
                                        <tr ref={lastElementRef}>
                                            <td colSpan={6} className="py-4 text-center">
                                                <div className="flex items-center justify-center gap-2 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] animate-pulse">
                                                    <RefreshCw size={12} className="animate-spin" />
                                                    Syncing more nodes...
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Loading Footer */}
                <div className="px-8 py-4 bg-white/80 border-t border-gray-50 flex items-center justify-between sticky bottom-0 z-10 backdrop-blur-md">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Showing <span className="text-purple-600">{products.length}</span> of <span className="text-gray-900">{pagination.total}</span> nodes
                    </div>
                    {isFetchingMore && (
                        <div className="flex items-center gap-2 text-purple-600 font-bold text-[10px] uppercase tracking-widest">
                            <RefreshCw size={14} className="animate-spin" /> Fetching More Intelligence...
                        </div>
                    )}
                </div>
            </div>

            {/* Product Detail Modal */}
            {selectedProduct && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        onClick={() => setSelectedProduct(null)}
                        className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        className="relative w-full max-w-4xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row h-[80vh] max-h-[700px]"
                    >
                        {/* Scrollable body wrapper */}
                        <div className="flex flex-col md:flex-row w-full h-full overflow-hidden">
                            {/* Left: Product Image & Basic Info */}
                            <div className="w-full md:w-2/5 bg-gray-50 p-8 flex flex-col border-r border-gray-100 overflow-y-auto custom-scrollbar">
                                <div className="aspect-square bg-white rounded-3xl border border-gray-200 flex items-center justify-center overflow-hidden mb-6 shadow-sm">
                                    {selectedProduct.image_url ? (
                                        <img src={selectedProduct.image_url} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <PackageSearch size={64} className="text-gray-200" />
                                    )}
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${selectedProduct.manual_override ? 'bg-indigo-100 text-indigo-700' : 'bg-wa-teal/10 text-wa-teal'}`}>
                                            {selectedProduct.manual_override ? 'Manual Node' : 'Scraped Intelligence'}
                                        </span>
                                        <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${selectedProduct.embedding ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {selectedProduct.embedding ? 'Vector Ready' : 'Sync Pending'}
                                        </span>
                                    </div>
                                    <h3 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">{selectedProduct.name}</h3>

                                    <div className="flex flex-col gap-1">
                                        {selectedProduct.sku && (
                                            <div className="flex items-center gap-2 mb-2">
                                                <div className="px-2.5 py-1 bg-gray-100 text-[10px] font-black text-gray-500 rounded-lg uppercase tracking-widest border border-gray-200">
                                                    SKU: {selectedProduct.sku}
                                                </div>
                                            </div>
                                        )}
                                        {selectedProduct.regular_price && selectedProduct.sale_price ? (
                                            <div className="flex flex-col">
                                                <div className="text-sm font-bold text-gray-400 line-through leading-none mb-1">{selectedProduct.regular_price}</div>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-3xl font-black text-purple-600 tracking-tight leading-none">{selectedProduct.sale_price}</div>
                                                    <div className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-lg uppercase tracking-widest border border-emerald-200">SPECIAL OFFER</div>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-3xl font-black text-purple-600 font-mono">{selectedProduct.price || selectedProduct.regular_price || 'Price TBA'}</div>
                                        )}
                                    </div>

                                    {selectedProduct.product_url && (
                                        <a
                                            href={selectedProduct.product_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-2 px-5 py-3 bg-white border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-purple-600 hover:border-purple-200 hover:shadow-lg transition-all rounded-2xl"
                                        >
                                            <Globe size={14} /> Open Store Page <ExternalLink size={12} />
                                        </a>
                                    )}
                                </div>
                            </div>

                            {/* Right: Full Description & Variants */}
                            <div className="flex-1 p-10 overflow-y-auto custom-scrollbar bg-white">
                                <div className="space-y-8">
                                    {selectedProduct.description && (
                                        <div className="mb-8">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                                                    <Info size={16} />
                                                </div>
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Quick Overview</h4>
                                            </div>
                                            <p className="text-gray-600 leading-relaxed font-medium whitespace-pre-wrap">
                                                {selectedProduct.description}
                                            </p>
                                        </div>
                                    )}

                                    {(selectedProduct.composition || selectedProduct.materials) && (
                                        <div className="mb-8">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                                                    <Activity size={16} />
                                                </div>
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Composition & Materials</h4>
                                            </div>
                                            <p className="text-gray-600 leading-relaxed font-medium">
                                                {selectedProduct.composition || selectedProduct.materials}
                                            </p>
                                        </div>
                                    )}

                                    {(selectedProduct.handling_guidelines || selectedProduct.wash_instructions) && (
                                        <div className="mb-8">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                                                    <Globe size={16} />
                                                </div>
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Handling & Care Guidelines</h4>
                                            </div>
                                            <p className="text-gray-600 leading-relaxed font-medium">
                                                {selectedProduct.handling_guidelines || selectedProduct.wash_instructions}
                                            </p>
                                        </div>
                                    )}

                                    {selectedProduct.technical_attributes && (
                                        <div className="mb-8">
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                    <Cpu size={16} />
                                                </div>
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Technical Attributes</h4>
                                            </div>
                                            <p className="text-gray-600 leading-relaxed font-medium whitespace-pre-wrap">
                                                {selectedProduct.technical_attributes}
                                            </p>
                                        </div>
                                    )}

                                    {selectedProduct.full_description && selectedProduct.full_description !== selectedProduct.description && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600">
                                                    <Layers size={16} />
                                                </div>
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Technical Specifications</h4>
                                            </div>
                                            <p className="text-gray-600 leading-relaxed font-medium whitespace-pre-wrap">
                                                {selectedProduct.full_description}
                                            </p>
                                        </div>
                                    )}

                                    {!selectedProduct.description && !selectedProduct.full_description && (
                                        <div>
                                            <div className="flex items-center gap-2 mb-4">
                                                <div className="w-8 h-8 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400">
                                                    <Info size={16} />
                                                </div>
                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Intelligence Data</h4>
                                            </div>
                                            <p className="text-gray-400 leading-relaxed font-medium italic">No detailed intelligence available for this node.</p>
                                        </div>
                                    )}

                                    <div>
                                        {(() => {
                                            const raw = selectedProduct.variants;
                                            let vData: any = { items: [], price_map: {} };

                                            /** Super Robust Parsing Engine **/
                                            const parseDeep = (input: any): any => {
                                                if (!input) return null;
                                                let current = input;
                                                // Handle double stringification
                                                if (typeof current === 'string') {
                                                    try { current = JSON.parse(current); } catch (e) { return null; }
                                                }
                                                if (typeof current === 'string') {
                                                    try { current = JSON.parse(current); } catch (e) { }
                                                }
                                                return current;
                                            };

                                            const parsed = parseDeep(raw);
                                            if (parsed) {
                                                // CASE 1: Standard V3 Object { items, price_map, ... }
                                                if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                                                    vData.items = parsed.items || (parsed.variants ? (Array.isArray(parsed.variants) ? parsed.variants : []) : []);
                                                    vData.price_map = parsed.price_map || parsed.prices || {};
                                                }
                                                // CASE 2: Legacy Array structure
                                                else if (Array.isArray(parsed)) {
                                                    vData.items = parsed;
                                                }
                                            }

                                            const hasPriceMap = vData.price_map && Object.keys(vData.price_map).length > 0;
                                            const hasItems = vData.items && vData.items.length > 0;

                                            return (
                                                <div className="space-y-8">
                                                    {/* Price Map - High Priority for Users */}
                                                    {hasPriceMap && (
                                                        <div className="bg-purple-50/30 p-6 rounded-[2rem] border border-purple-100/50">
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <div className="w-8 h-8 rounded-xl bg-purple-600 flex items-center justify-center text-white shadow-lg shadow-purple-200">
                                                                    <TrendingUp size={16} />
                                                                </div>
                                                                <h4 className="text-xs font-black text-purple-900 uppercase tracking-widest">Intelligent Price Map</h4>
                                                            </div>
                                                            <div className="grid grid-cols-1 gap-3">
                                                                {Object.entries(vData.price_map).map(([key, val], idx) => (
                                                                    <div key={idx} className="flex justify-between items-center p-4 bg-white border border-purple-50 rounded-2xl shadow-sm hover:shadow-md hover:border-purple-200 transition-all transform hover:-translate-y-0.5 group">
                                                                        <div className="flex flex-col max-w-[60%]">
                                                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1 truncate">Combination</span>
                                                                            <span className="font-bold text-gray-800 group-hover:text-purple-700 transition-colors">{key}</span>
                                                                        </div>
                                                                        <div className="flex flex-col items-end whitespace-nowrap">
                                                                            <span className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Live Intelligence</span>
                                                                            <span className="font-black text-purple-600 text-lg tracking-tight">{String(val)} BDT</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Standard Variations Grid */}
                                                    {hasItems && (
                                                        <div>
                                                            <div className="flex items-center gap-2 mb-4">
                                                                <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                                                                    <Layers size={16} />
                                                                </div>
                                                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Available Options</h4>
                                                            </div>
                                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                                {vData.items.map((v: any, vi: number) => (
                                                                    <div key={vi} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex flex-col gap-1 hover:bg-white hover:border-indigo-100 hover:shadow-md transition-all group">
                                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest group-hover:text-indigo-400">{v.type || v.name || 'Option'}</span>
                                                                        <span className="font-bold text-gray-800">{v.value || v.sku || 'N/A'}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Fallback for single style */}
                                                    {!hasPriceMap && !hasItems && (
                                                        <div className="p-10 bg-gray-50 rounded-[2rem] border border-dashed border-gray-200 text-center">
                                                            <ShoppingBag size={32} className="mx-auto text-gray-300 mb-3" />
                                                            <p className="text-xs font-black text-gray-400 uppercase tracking-[0.2em]">Standard Single Style Product</p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Top Close Button */}
                        <button
                            onClick={() => setSelectedProduct(null)}
                            className="absolute top-6 right-6 w-12 h-12 bg-gray-900/5 hover:bg-gray-900/10 text-gray-500 rounded-full flex items-center justify-center transition-all backdrop-blur-sm"
                        >
                            <X size={24} />
                        </button>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
}

function KnowledgeTab({ knowledge, fetchKnowledge, syncVectors }: { knowledge: any[], fetchKnowledge: () => void, syncVectors: (type: 'products' | 'profile' | 'knowledge') => void }) {
    const [adding, setAdding] = useState(false);
    const [formData, setFormData] = useState<any>({ title: '', content: '', type: 'faq' });

    const addDoc = async () => {
        try {
            await fetch('http://localhost:3001/api/ai-brain/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            fetchKnowledge();
            setAdding(false);
            setFormData({ title: '', content: '', type: 'faq' });
        } catch (e) { alert('Failed to add document'); }
    };

    const deleteDoc = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            await fetch(`http://localhost:3001/api/ai-brain/knowledge/${id}`, { method: 'DELETE' });
            fetchKnowledge();
        } catch (e) { alert('Failed to delete'); }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Intelligence Repository</h2>
                    <p className="text-sm text-gray-500 font-medium">Custom rules and explicit knowledge fragments.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => syncVectors('knowledge')}
                        className="bg-white border border-purple-200 text-purple-600 hover:bg-purple-50 px-5 py-2.5 rounded-2xl flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-all"
                    >
                        <Zap size={18} className="text-yellow-500" /> Sync KB Brain
                    </button>
                    <button onClick={() => setAdding(!adding)} className="bg-purple-50 text-purple-700 hover:bg-purple-100 px-5 py-2.5 rounded-2xl flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-all">
                        <Plus size={18} /> Add Knowledge
                    </button>
                </div>
            </div>

            {adding && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-200 mb-8 overflow-hidden shadow-inner">
                    <div className="max-w-2xl space-y-4">
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Knowledge Title</label>
                            <input type="text" placeholder="e.g. Do you ship internationally?" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full p-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Intelligence Payload</label>
                            <textarea placeholder="Explicit instructions for the AI..." value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} className="w-full p-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-purple-200" rows={4} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Category</label>
                                <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full p-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200 appearance-none">
                                    <option value="faq">FAQ</option>
                                    <option value="policy">Policy</option>
                                    <option value="general">General Info</option>
                                </select>
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button onClick={addDoc} className="flex-1 bg-gray-900 text-white py-3.5 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-gray-200 transition-all hover:bg-black">Archive Knowledge</button>
                            <button onClick={() => setAdding(false)} className="px-6 py-3.5 bg-white border border-gray-200 text-gray-400 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all">Discard</button>
                        </div>
                    </div>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {knowledge.length === 0 ? (
                    <div className="col-span-2 p-20 text-center opacity-20">
                        <BookOpen size={48} className="mx-auto mb-3" />
                        <p className="font-bold tracking-tight">Repository is empty.</p>
                    </div>
                ) : knowledge.map((k, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="group relative bg-white border border-gray-100 rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:shadow-purple-500/5 hover:-translate-y-1 transition-all duration-300"
                    >
                        <div className="flex justify-between items-start mb-4">
                            <div className="flex gap-2">
                                <div className="px-3 py-1 bg-gray-50 text-[9px] font-black text-gray-400 rounded-full border border-gray-100 uppercase tracking-widest">
                                    {k.type}
                                </div>
                                <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${k.embedding && k.embedding.length > 10 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-amber-50 text-amber-600 border border-amber-100'}`}>
                                    {k.embedding && k.embedding.length > 10 ? 'Ready' : 'Pending'}
                                </div>
                            </div>
                            <button onClick={() => deleteDoc(k.id)} className="opacity-0 group-hover:opacity-100 p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all">
                                <Trash2 size={16} />
                            </button>
                        </div>
                        <h3 className="text-lg font-black text-gray-900 leading-tight mb-2 group-hover:text-purple-600 transition-colors">{k.title}</h3>
                        <p className="text-sm text-gray-500 font-medium leading-relaxed line-clamp-3 group-hover:line-clamp-none transition-all">{k.content}</p>
                    </motion.div>
                ))}
            </div>
        </motion.div>
    );
}

// ============================================================
// 🔒 VECTOR SYNC CONFIRMATION MODAL
// This modal MUST appear before ANY vector sync action.
// ============================================================
const VECTOR_SYNC_CONFIG: Record<string, { title: string; desc: string; icon: string; color: string; btnCls: string; gradCls: string; badgeCls: string; labelCls: string }> = {
    products: {
        title: 'Product Brain Sync',
        desc: 'সমস্ত প্রোডাক্টের AI embeddings পুনরায় তৈরি হবে Gemini API দিয়ে। এটি আপনার প্রোডাক্টগুলোকে AI-এর জন্য আরও বুদ্ধিমান করে তুলবে।',
        icon: '📦',
        color: 'purple',
        btnCls: 'bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-200',
        gradCls: 'from-purple-600 to-violet-600',
        badgeCls: 'bg-purple-50 text-purple-600 border-purple-100',
        labelCls: 'text-purple-500',
    },
    profile: {
        title: 'Profile Brain Sync',
        desc: 'Business Profile-এর AI embedding পুনরায় তৈরি হবে Gemini API দিয়ে। এটি চ্যাটবটকে আপনার বিজনেস সম্পর্কে জানতে সাহায্য করবে।',
        icon: '🏢',
        color: 'blue',
        btnCls: 'bg-blue-600 hover:bg-blue-700 shadow-lg shadow-blue-200',
        gradCls: 'from-blue-600 to-cyan-600',
        badgeCls: 'bg-blue-50 text-blue-600 border-blue-100',
        labelCls: 'text-blue-500',
    },
    knowledge: {
        title: 'Knowledge Brain Sync',
        desc: 'সমস্ত Knowledge Base documents-এর AI embeddings পুনরায় তৈরি হবে Gemini API দিয়ে। এটি আপনার নলেজ বেসকে AI-এর জন্য প্রস্তুত করবে।',
        icon: '📖',
        color: 'emerald',
        btnCls: 'bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-200',
        gradCls: 'from-emerald-600 to-teal-600',
        badgeCls: 'bg-emerald-50 text-emerald-600 border-emerald-100',
        labelCls: 'text-emerald-500',
    },
    scraper: {
        title: 'AI Brain Scraper Sync',
        desc: 'ওয়েবসাইট crawl করে নতুন প্রোডাক্ট সংগ্রহ হবে এবং AI Brain-এ সংরক্ষণ হবে। এটি কেবল নতুন ডেটা আপডেট করবে, কোনো ভেক্টর প্রসেসিং হবে না।',
        icon: '🕷️',
        color: 'indigo',
        btnCls: 'bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-200',
        gradCls: 'from-indigo-600 to-purple-600',
        badgeCls: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        labelCls: 'text-indigo-500',
    },
};

function VectorSyncConfirmModal({
    open,
    type,
    onConfirm,
    onCancel,
}: {
    open: boolean;
    type: 'products' | 'profile' | 'knowledge' | null;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    if (!open) return null;

    const cfg = VECTOR_SYNC_CONFIG[type || 'scraper'] || VECTOR_SYNC_CONFIG.products;

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ backgroundColor: 'rgba(15,15,30,0.6)', backdropFilter: 'blur(8px)' }}
            onClick={onCancel}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.85, y: 32 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.85, y: 32 }}
                transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                className="bg-white w-full max-w-[420px] mx-4 rounded-[2rem] overflow-hidden shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Gradient top bar */}
                <div className={`h-1.5 bg-gradient-to-r ${cfg.gradCls}`} />

                <div className="p-8">
                    {/* Header row */}
                    <div className="flex items-start gap-4 mb-6">
                        <div className={`w-14 h-14 rounded-2xl border ${cfg.badgeCls} flex items-center justify-center text-[2rem] flex-shrink-0`}>
                            {cfg.icon}
                        </div>
                        <div className="pt-1">
                            <p className={`text-[9px] font-black uppercase tracking-[0.18em] mb-0.5 ${cfg.labelCls}`}>
                                ⚡ Confirmation Required
                            </p>
                            <h2 className="text-lg font-black text-gray-900 leading-snug">{cfg.title}</h2>
                        </div>
                    </div>

                    {/* Warning card */}
                    <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-5">
                        <span className="text-xl flex-shrink-0 mt-0.5">⚠️</span>
                        <p className="text-sm text-amber-900 font-medium leading-relaxed">{cfg.desc}</p>
                    </div>

                    {/* Sub-note */}
                    <p className="text-[11px] text-gray-400 font-medium text-center mb-6">
                        {type === 'scraper' 
                            ? 'এটি একটি ব্যাকগ্রাউন্ড প্রসেস যা ডেটা আপডেট করবে · বাতিল করতে Escape বা Cancel চাপুন'
                            : 'এই কাজটি Gemini API কল করবে এবং ভেক্টর ডাটা আপডেট করবে · বাতিল করতে Escape বা Cancel চাপুন'
                        }
                    </p>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 py-3.5 rounded-2xl border-2 border-gray-200 text-gray-600 text-sm font-black hover:bg-gray-50 hover:border-gray-300 transition-all active:scale-95"
                        >
                            ✕ বাতিল
                        </button>
                        <button
                            onClick={onConfirm}
                            className={`flex-1 py-3.5 rounded-2xl text-white text-sm font-black ${cfg.btnCls} transition-all active:scale-95`}
                        >
                            ✓ হ্যাঁ, Sync করুন
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

function AnalyticsTab({ stats }: { stats: any }) {
    if (!stats) return <div className="p-10 text-center text-gray-400">📊 Loading metrics...</div>;
    const handoverRate = stats.total_replies > 0 ? (stats.handovers / stats.total_replies) * 100 : 0;
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-8 bg-purple-50 rounded-[2.5rem] border border-purple-100 flex flex-col justify-between shadow-sm">
                    <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-4 font-mono">Total AI Autoreplies</p>
                    <h3 className="text-4xl font-black text-purple-900 leading-none">{stats.total_replies || 0}</h3>
                </div>
                <div className="p-8 bg-amber-50 rounded-[2.5rem] border border-amber-100 flex flex-col justify-between shadow-sm">
                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest mb-4 font-mono">Handover Rate</p>
                    <h3 className="text-4xl font-black text-amber-900 leading-none">{handoverRate.toFixed(1)}%</h3>
                </div>
                <div className="p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100 flex flex-col justify-between shadow-sm">
                    <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4 font-mono">AI Confidence Level</p>
                    <h3 className="text-4xl font-black text-emerald-900 leading-none">{((stats.avg_confidence || 0) * 100).toFixed(0)}%</h3>
                </div>
            </div>
            
            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm">
                <h3 className="text-lg font-black text-gray-900 mb-8 flex items-center gap-2">
                    <TrendingUp size={20} className="text-purple-600" /> 7-Day Performance Trend
                </h3>
                <div className="flex items-end justify-between h-48 gap-3">
                    {stats.daily_trends.map((d: any, i: number) => {
                        const totalHeight = Math.max(10, (d.total / (stats.total_replies || 1)) * 400); 
                        return (
                            <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                <div className="relative w-full flex flex-col justify-end h-32">
                                    <div className="absolute -top-6 text-[10px] font-black text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">{d.total} replies</div>
                                    <div className="w-full bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-all" style={{ height: `${totalHeight}%` }}></div>
                                    <div className="absolute bottom-0 w-full bg-rose-500 rounded-lg opacity-40" style={{ height: `${(d.handovers / (d.total || 1)) * totalHeight}%` }}></div>
                                </div>
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{d.day.split('-').slice(1).join('/')}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </motion.div>
    );
}

function LogsTab({ logs, pagination, fetchLogs, onSelect }: { logs: any[], pagination: any, fetchLogs: (p: number) => void, onSelect: (log: any) => void }) {
    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">
            <div className="flex-1 overflow-x-auto p-2">
                <table className="w-full text-left">
                    <thead className="bg-gray-50/50">
                        <tr>
                            <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Time</th>
                            <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Customer</th>
                            <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Status</th>
                            <th className="px-6 py-4 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {logs.map((log) => (
                            <tr key={log.id} className="hover:bg-purple-50/30 transition-colors group cursor-pointer" onClick={() => onSelect(log)}>
                                <td className="px-6 py-4 whitespace-nowrap font-mono text-[10px] text-gray-400">{new Date(log.timestamp).toLocaleTimeString()}</td>
                                <td className="px-6 py-4 whitespace-nowrap font-bold text-gray-700">{log.customer_number}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${log.is_handover ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-purple-50 text-purple-600 border border-purple-100'}`}>
                                        {log.is_handover ? 'Handover' : 'Solved'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-purple-600 font-black text-[10px] uppercase underline tracking-widest opacity-0 group-hover:opacity-100 transition-all">Audit</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-6 border-t border-gray-50 flex items-center justify-between">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Showing {logs.length} of {pagination.total} entries</span>
                <div className="flex gap-2">
                    <button disabled={pagination.page <= 1} onClick={(e) => { e.stopPropagation(); fetchLogs(pagination.page - 1); }} className="p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-20 transition-all"><ChevronLeft size={16} /></button>
                    <button disabled={logs.length < pagination.limit} onClick={(e) => { e.stopPropagation(); fetchLogs(pagination.page + 1); }} className="p-2.5 rounded-xl border border-gray-100 hover:bg-gray-50 disabled:opacity-20 transition-all"><ChevronRight size={16} /></button>
                </div>
            </div>
        </motion.div>
    );
}

function LogDetailModal({ log, onClose }: { log: any, onClose: () => void }) {
    if (!log) return null;
    return (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-gray-900/40 backdrop-blur-md p-4" onClick={onClose}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white w-full max-w-2xl rounded-[2.5rem] overflow-hidden shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="p-8 border-b border-gray-50 flex justify-between items-center bg-gradient-to-r from-purple-50/50 to-white">
                    <div>
                        <h4 className="text-lg font-black text-gray-900">Brain Audit</h4>
                        <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{log.customer_number} · {new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 bg-gray-50 flex items-center justify-center rounded-2xl hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-all border border-gray-100"><X size={20} /></button>
                </div>
                <div className="p-8 overflow-y-auto custom-scrollbar space-y-8">
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Customer Message</label>
                        <div className="p-5 bg-gray-50 rounded-2xl text-gray-700 font-medium italic border-l-4 border-gray-200">“{log.user_query}”</div>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">AI Result</label>
                        <div className="p-6 bg-purple-600 text-white rounded-[2rem] text-sm font-bold leading-relaxed shadow-lg">{log.ai_response}</div>
                    </div>
                    <div className="space-y-3">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Source Context (RAG Snapshot)</label>
                        <div className="p-6 bg-gray-900 text-gray-300 rounded-3xl text-[11px] font-mono leading-relaxed whitespace-pre-wrap border border-gray-800">{log.context_used || 'No intelligence fragments retrieved.'}</div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
