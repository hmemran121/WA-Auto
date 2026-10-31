import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BrainCircuit,
    Brain,
    Building2,
    PackageSearch,
    BookOpen,
    RefreshCw,
    Save,
    Plus,
    Trash2,
    Edit2,
    CheckCircle2, MessageSquare, AlertCircle, ShoppingCart,
    Database, Link as LinkIcon, ExternalLink, ArrowRight, Star, Settings, ChevronRight, ChevronDown, ChevronUp, Zap, Target, MousePointer2,
    Sparkles, Tag, TrendingUp, Cpu, Activity, Globe, Search, Filter, X, Layers, Info, Pin, Wand2,
    ChevronLeft, ShoppingBag, History as HistoryIcon, Clock, LayoutGrid, List,
    Calendar, BarChart3, Image as ImageIcon, Film,
    Eye, EyeOff, FileSpreadsheet, Upload,
    Box, Check, Sliders, SlidersHorizontal, Loader2, RotateCcw, Compass
} from 'lucide-react';
import ProcessModal from './ProcessModal';

export default function AIBrainView({ onProcurementRequest }: { onProcurementRequest?: (p: any) => void }) {
    const [activeTab, setActiveTab] = useState<'profile' | 'products' | 'knowledge' | 'orders' | 'simulator' | 'analytics' | 'logs' | 'ai-config' | 'cache'>(
        (localStorage.getItem('wa_auto_brain_tab') as any) || 'profile'
    );
    const [loading, setLoading] = useState(false);

    // Cache Studio States
    const [cacheClusters, setCacheClusters] = useState<any[]>([]);
    const [cacheAnalytics, setCacheAnalytics] = useState<any>({
        total_cached_entries: 0,
        total_hits: 0,
        golden_templates_count: 0,
        estimated_tokens_saved: 0,
        estimated_cost_saved: 0
    });
    const [cacheSearch, setCacheSearch] = useState('');
    const [editingCacheItem, setEditingCacheItem] = useState<any>(null);
    const [editResponseText, setEditResponseText] = useState('');
    const [editIsGolden, setEditIsGolden] = useState(false);
    const [reassignTargetIntent, setReassignTargetIntent] = useState('');

    // States
    const [profile, setProfile] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [categories, setCategories] = useState<any[]>([]);
    const [knowledge, setKnowledge] = useState<any[]>([]);
    const [simulatorResults, setSimulatorResults] = useState<any>(null);
    const [isSimulating, setIsSimulating] = useState(false);
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

    // Finance & Purchase States
    const [procurements, setProcurements] = useState<any[]>([]);
    const [preSelectedProduct, setPreSelectedProduct] = useState<any>(null);

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
    const [popoverState, setPopoverState] = useState<{ productId: number | string, rect: DOMRect | null } | null>(null);
    const [editingVariant, setEditingVariant] = useState<{ index: number, value: string } | null>(null);

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
            const res = await fetch(`http://localhost:3001/api/ai-brain/products?limit=${limit}&offset=${offset}${search ? `&search=${encodeURIComponent(search)}` : ''}`, {
                headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' }
            });
            const data = await res.json();
            if (data.success) {
                if (page === 1) {
                    setProducts(data.products || []);
                } else {
                    setProducts(prev => {
                        const updated = [...prev];
                        (data.products || []).forEach((newP: any) => {
                            const idx = updated.findIndex(p => String(p.id) === String(newP.id));
                            if (idx !== -1) updated[idx] = newP;
                            else updated.push(newP);
                        });
                        return updated;
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
            if (data.success) setKnowledge(data.knowledge || []);
        } catch (e) { console.error(e); }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/categories');
            const data = await res.json();
            if (data.success) setCategories(data.categories);
        } catch (e) { console.error(e); }
    };

    const fetchProductsRef = useRef<any>(null);
    useEffect(() => {
        fetchProductsRef.current = fetchProducts;
    }, [fetchProducts]);

    useEffect(() => {
        fetchProfile();
        fetchProducts(1); // Proactively fetch products count for the sync badge
        fetchCategories();

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
                fetchProductsRef.current(1);
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
            fetchProductsRef.current(1);
        });

        if (activeTab === 'profile') fetchProfile();
        if (activeTab === 'products') fetchProducts(1);
        if (activeTab === 'knowledge') fetchKnowledge();
        if (activeTab === 'analytics') fetchAIAnalytics();
        if (activeTab === 'logs') fetchAILogs(1);
        if (activeTab === 'cache') fetchCacheStudioData();

        // Smart Persistence: Save active tab to localStorage
        localStorage.setItem('wa_auto_brain_tab', activeTab);

        return () => {
            socket.off('process_start');
            socket.off('process_update');
            socket.off('process_progress');
            socket.off('process_end');
            socket.off('new_ai_product_scraped');
            socket.off('intelligent_products_changed');
        };
    }, [currentProcessId, activeTab]);

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

    const fetchCacheStudioData = async () => {
        setLoading(true);
        try {
            const [r1, r2] = await Promise.all([
                fetch('http://localhost:3001/api/ai/cache-clusters'),
                fetch('http://localhost:3001/api/ai/cache-analytics')
            ]);
            const d1 = await r1.json();
            const d2 = await r2.json();
            if (d1.success) setCacheClusters(d1.clusters || []);
            if (d2.success) setCacheAnalytics(d2);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const handleSaveCacheItem = async () => {
        if (!editingCacheItem) return;
        try {
            const res = await fetch(`http://localhost:3001/api/ai/cache-clusters/${editingCacheItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    responseText: editResponseText,
                    isGolden: editIsGolden ? 1 : 0,
                    intentKey: reassignTargetIntent || editingCacheItem.intent_key
                })
            });
            const data = await res.json();
            if (data.success) {
                setEditingCacheItem(null);
                fetchCacheStudioData();
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteCacheItem = async (id: number) => {
        if (!confirm('Are you sure you want to remove this cache item?')) return;
        try {
            const res = await fetch(`http://localhost:3001/api/ai/cache-clusters/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) fetchCacheStudioData();
        } catch (e) { console.error(e); }
    };

    const handleVariantStockSave = async (productId: number | string, variantIndex: number, newValue: string, currentSearch = '') => {
        const product = products.find(p => String(p.id) === String(productId));
        if (!product) return;
        
        try {
            const raw = product.variants;
            let items: any[] = [];
            try {
                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                items = parsed?.items || (Array.isArray(parsed) ? parsed : []);
            } catch { }

            if (items[variantIndex]) {
                items[variantIndex].stock = newValue;
                if (items[variantIndex].stock_quantity !== undefined) items[variantIndex].stock_quantity = newValue;
                if (items[variantIndex].quantity !== undefined) items[variantIndex].quantity = newValue;
            }

            const variantsObj = { items };
            const newTotalStock = items.reduce((sum: number, v: any) => {
                const s = v.stock ?? v.stock_quantity ?? v.quantity ?? 0;
                return sum + (parseFloat(s) || 0);
            }, 0);

            const res = await fetch(`http://localhost:3001/api/ai-brain/products/${productId}/stock`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stock_quantity: newTotalStock, variants: variantsObj })
            });

            if (res.ok) {
                setEditingVariant(null);
                fetchProducts(pagination.page, currentSearch);
            }
        } catch (err) {
            console.error('Failed to update variant stock:', err);
        }
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
        <div className="h-[calc(100vh-40px)] flex flex-col gap-6 pb-[10px] overflow-hidden">
            {/* 🏗️ SMART PROFESSIONAL HEADER (Two-Tier) */}
            <div className="flex flex-col gap-6">
                {/* Tier 1: Identity & Global Actions */}
                <div className="flex justify-between items-center">
                    <div className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-200">
                                <BrainCircuit className="text-white" size={24} />
                            </div>
                            <h1 className="text-2xl font-black text-gray-900 tracking-tight">AI Brain Hub</h1>
                        </div>
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest pl-1">RAG Intelligence & Automation Control Center</p>
                    </div>

                    <div className="flex items-center gap-4">
                        {discoveries > 0 && (
                            <motion.div 
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                className="bg-emerald-50 border border-emerald-100 text-emerald-600 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm"
                            >
                                <Sparkles size={14} className="animate-pulse" />
                                {discoveries} New Insights
                            </motion.div>
                        )}
                        <div className="h-10 w-[1px] bg-gray-100 mx-2" />
                        <div className="flex gap-3">
                            <button
                                onClick={syncBrain}
                                disabled={loading}
                                className="bg-white border border-gray-200 hover:border-purple-300 text-gray-700 px-5 py-2.5 rounded-2xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all hover:shadow-xl hover:shadow-gray-100 active:scale-95 disabled:opacity-50"
                            >
                                <RefreshCw size={16} className={loading && currentProcessId?.startsWith('ai_brain_sync') ? 'animate-spin' : ''} />
                                Sync Scraper
                            </button>
                            <button
                                onClick={() => syncVectors('products')}
                                disabled={loading || pendingVectors === 0}
                                className={`px-5 py-2.5 rounded-2xl flex items-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all shadow-xl active:scale-95 disabled:opacity-50 ${pendingVectors === 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-none' : 'bg-gray-900 hover:bg-black text-white shadow-gray-200'}`}
                            >
                                {pendingVectors === 0 ? (
                                    <CheckCircle2 size={16} className="text-emerald-500" />
                                ) : (
                                    <Zap size={16} className={loading && currentProcessId?.startsWith('vector_sync_products') ? 'animate-spin text-yellow-400' : 'text-yellow-400'} />
                                )}
                                {pendingVectors === 0 ? 'Brain Ready' : `Sync Brain (${pendingVectors})`}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Tier 2: Refined Navigation (Glassmorphism inspired) */}
                <div className="flex bg-gray-50/50 p-1.5 rounded-[2.5rem] border border-gray-100/50 backdrop-blur-md relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 via-transparent to-indigo-500/5 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                    {[
                        { id: 'profile', icon: Building2, label: 'Profile' },
                        { id: 'products', icon: PackageSearch, label: 'Catalogue' },
                        { id: 'knowledge', icon: BrainCircuit, label: 'Intelligence' },
                        { id: 'ai-config', icon: SlidersHorizontal, label: 'AI Config' },
                        { id: 'orders', icon: HistoryIcon, label: 'Orders' },
                        { id: 'simulator', icon: Activity, label: 'Playground' },
                        { id: 'analytics', icon: TrendingUp, label: 'Performance' },
                        { id: 'cache', icon: Cpu, label: 'AI Cache Studio' },
                        { id: 'logs', icon: List, label: 'Audit Logs' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`relative flex items-center gap-2.5 px-8 py-3.5 rounded-full text-[10px] font-black transition-all duration-500 tracking-[0.15em] uppercase z-10 ${activeTab === tab.id
                                ? 'bg-white text-purple-600 shadow-2xl shadow-purple-500/20 scale-105 ring-1 ring-purple-50'
                                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100/30'
                                }`}
                        >
                            <tab.icon size={14} className={`${activeTab === tab.id ? 'animate-pulse' : 'opacity-70'}`} />
                            {tab.label}
                            {activeTab === tab.id && (
                                <motion.div 
                                    layoutId="activeTabGlow"
                                    className="absolute -inset-1 bg-purple-500/5 blur-xl rounded-full -z-10"
                                />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className={`flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col overflow-hidden ${activeTab !== 'products' ? 'p-6 overflow-y-auto custom-scrollbar' : 'p-0'}`}>
                {activeTab === 'profile' && <ProfileTab profile={profile} fetchProfile={fetchProfile} syncVectors={syncVectors} />}
                {activeTab === 'products' && (
                    <ProductsTab 
                        products={products} 
                        categories={categories}
                        fetchProducts={fetchProducts} 
                        pagination={pagination} 
                        isFetchingMore={isFetchingMore}
                        onQuickBuy={(p: any) => {
                            if ((window as any).onProcurementRequest) (window as any).onProcurementRequest(p);
                        }}
                        popoverState={popoverState}
                        setPopoverState={setPopoverState}
                        editingVariant={editingVariant}
                        setEditingVariant={setEditingVariant}
                        handleVariantStockSave={handleVariantStockSave}
                    />
                )}
                {activeTab === 'knowledge' && (
                    <KnowledgeTab 
                        knowledge={knowledge} 
                        fetchKnowledge={() => fetchKnowledge()} 
                        products={products} 
                        categories={categories} 
                        syncVectors={syncVectors}
                        loading={loading}
                        currentProcessId={currentProcessId}
                    />
                )}
                {activeTab === 'orders' && <OrdersTab />}
                {activeTab === 'simulator' && <SimulatorTab results={simulatorResults} setResults={setSimulatorResults} isSimulating={isSimulating} setIsSimulating={setIsSimulating} />}
                {activeTab === 'analytics' && <AnalyticsTab stats={aiAnalytics} />}
                {activeTab === 'ai-config' && <AIConfigTab />}
                {activeTab === 'cache' && <AICacheStudioTab />}
                {activeTab === 'logs' && <LogsTab logs={aiLogs} pagination={logsPagination} fetchLogs={fetchAILogs} onSelect={setSelectedLog} />}
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

// ============================================================
// 📁 PRODUCT CATEGORY MANAGER
// ============================================================
function CategoryTab({ categories, fetchCategories }: { categories: any[], fetchCategories: () => void }) {
    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-gray-50 p-6 rounded-[2rem] border border-gray-100">
                <div>
                    <h3 className="text-xl font-black text-gray-900 tracking-tight">Product Hierarchy</h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Define category-specific shipping and context rules</p>
                </div>
            </div>
            
            <CategoryManager categories={categories} fetchCategories={fetchCategories} onClose={() => {}} />
        </div>
    );
}

function CategoryManager({ categories, fetchCategories, onClose }: { categories: any[], fetchCategories: () => void, onClose?: () => void }) {
    const [formData, setFormData] = useState<any>({ name: '', shipping_inside: '', shipping_outside: '', special_policy: '' });
    const [editingId, setEditingId] = useState<string | null>(null);

    const saveCategory = async () => {
        const method = editingId ? 'PUT' : 'POST';
        const url = editingId ? `http://localhost:3001/api/ai-brain/categories/${editingId}` : 'http://localhost:3001/api/ai-brain/categories';
        try {
            await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            fetchCategories();
            setFormData({ name: '', shipping_inside: '', shipping_outside: '', special_policy: '' });
            setEditingId(null);
        } catch (e) { alert('Failed to save category'); }
    };

    const deleteCategory = async (id: string) => {
        if (!confirm('Are you sure? Products in this category will become uncategorized.')) return;
        try {
            await fetch(`http://localhost:3001/api/ai-brain/categories/${id}`, { method: 'DELETE' });
            fetchCategories();
        } catch (e) { alert('Failed to delete'); }
    };

    return (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-sm">
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Product Categories</h2>
                        <p className="text-sm text-gray-500 font-medium">Define shipping policies and intelligence tiers.</p>
                    </div>
                    <button onClick={onClose} className="p-3 hover:bg-white rounded-2xl transition-all shadow-sm border border-transparent hover:border-gray-200">
                        <X size={24} className="text-gray-400" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8 custom-scrollbar">
                    {/* Form */}
                    <div className="space-y-6">
                        <div className="p-6 bg-purple-50/50 rounded-[2rem] border border-purple-100 space-y-4">
                            <h3 className="text-sm font-black text-purple-700 uppercase tracking-widest mb-2">{editingId ? 'Edit' : 'Create'} Category</h3>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Category Name</label>
                                <input type="text" placeholder="e.g. Mens Activewear" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Inside Dhaka (Tk)</label>
                                    <input type="text" placeholder="80" value={formData.shipping_inside} onChange={e => setFormData({ ...formData, shipping_inside: e.target.value })} className="w-full p-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Outside Dhaka (Tk)</label>
                                    <input type="text" placeholder="150" value={formData.shipping_outside} onChange={e => setFormData({ ...formData, shipping_outside: e.target.value })} className="w-full p-3 bg-white border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200" />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Special Intelligence Policy</label>
                                <textarea placeholder="e.g. Delivery takes 7 days for this category..." value={formData.special_policy} onChange={e => setFormData({ ...formData, special_policy: e.target.value })} className="w-full p-3 bg-white border border-gray-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-purple-200" rows={3} />
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button onClick={saveCategory} className="flex-1 bg-gray-900 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg active:scale-95">
                                    {editingId ? 'Update Category' : 'Create Category'}
                                </button>
                                {editingId && (
                                    <button onClick={() => { setEditingId(null); setFormData({ name: '', shipping_inside: '', shipping_outside: '', special_policy: '' }); }} className="bg-white border border-gray-200 text-gray-400 px-5 rounded-2xl font-black text-xs uppercase hover:bg-gray-50">
                                        Cancel
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* List */}
                    <div className="space-y-4">
                        <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Existing Categories</h3>
                        {categories.map((c, i) => (
                            <div key={i} className="group p-5 bg-white border border-gray-100 rounded-[1.5rem] hover:border-purple-200 hover:shadow-xl hover:shadow-purple-500/5 transition-all flex justify-between items-center">
                                <div>
                                    <h4 className="font-black text-gray-900 text-base">{c.name}</h4>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase">IN: {c.shipping_inside || 'Def'}</span>
                                        <span className="text-[9px] font-bold text-gray-400 uppercase">OUT: {c.shipping_outside || 'Def'}</span>
                                    </div>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => { setEditingId(c.id); setFormData(c); }} className="p-2 text-indigo-400 hover:bg-indigo-50 rounded-xl transition-all"><Edit2 size={16} /></button>
                                    <button onClick={() => deleteCategory(c.id)} className="p-2 text-rose-400 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

// ============================================================
// 📁 SMART MULTI-PIN SELECTOR
// ============================================================
function SmartPinSelector({ categories, products, selected, onToggle }: { categories: any[], products: any[], selected: any[], onToggle: (item: any) => void }) {
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className="relative">
            <div 
                onClick={() => setIsModalOpen(true)}
                className="w-full p-4 bg-white border-2 border-dashed border-purple-100 rounded-[2rem] flex flex-wrap gap-2 min-h-[64px] cursor-pointer hover:border-purple-300 hover:bg-purple-50/10 transition-all shadow-sm group"
            >
                {(selected || []).length === 0 && (
                    <div className="flex items-center gap-3 px-2 text-gray-400 group-hover:text-purple-400 transition-colors">
                        <Plus size={18} className="bg-gray-50 group-hover:bg-purple-100 p-1 rounded-full transition-colors" />
                        <span className="text-xs font-black uppercase tracking-widest">Connect Products & Categories...</span>
                    </div>
                )}
                {(selected || []).map((item, i) => (
                    <div key={i} className="px-4 py-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-purple-500/20 active:scale-95 transition-transform">
                        <Pin size={10} className="opacity-70" />
                        <span>{item.name}</span>
                        <X size={12} className="cursor-pointer hover:text-rose-200" onClick={(e) => { e.stopPropagation(); onToggle(item); }} />
                    </div>
                ))}
            </div>

            {isModalOpen && (
                <PinningModal 
                    categories={categories}
                    products={products}
                    selected={selected}
                    onToggle={onToggle}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
}

function PinningModal({ categories, products, selected, onToggle, onClose }: { categories: any[], products: any[], selected: any[], onToggle: (item: any) => void, onClose: () => void }) {
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState<'all' | 'products' | 'categories'>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    
    const filtered = useMemo(() => {
        const s = search.toLowerCase();
        let items = [
            ...categories.map(c => ({ id: c.id, name: c.name, type: 'category', sku: undefined })),
            ...products.map(p => ({ id: p.id, name: p.name, type: 'product', sku: p.sku }))
        ];
        
        if (tab === 'products') items = items.filter(i => i.type === 'product');
        if (tab === 'categories') items = items.filter(i => i.type === 'category');

        if (!s) return items;
        return items.filter(i => 
            i.name.toLowerCase().includes(s) || 
            (i.sku && i.sku.toLowerCase().includes(s))
        );
    }, [search, categories, products, tab]);

    const isSelected = (id: any, type: string) => (selected || []).some(s => s.id === id && s.type === type);

    return (
        <div className="fixed inset-0 z-[60000] flex items-center justify-center bg-gray-900/40 backdrop-blur-md p-6" onClick={onClose}>
            <motion.div 
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                className="bg-white w-full max-w-4xl h-[85vh] rounded-[3.5rem] shadow-[0_32px_128px_-32px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header Section */}
                <div className="p-10 pb-6 border-b border-gray-50 flex flex-col gap-8 bg-gradient-to-b from-gray-50/50 to-white">
                    <div className="flex justify-between items-start">
                        <div>
                            <span className="bg-purple-600/10 text-purple-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-[0.2em] mb-3 inline-block">Logic Connection</span>
                            <h2 className="text-3xl font-black text-gray-900 tracking-tighter">Smart Intelligence Pining</h2>
                            <p className="text-gray-400 text-sm font-medium mt-1">Select the entities that should inherit this specific business truth.</p>
                        </div>
                        <button onClick={onClose} className="w-12 h-12 bg-white flex items-center justify-center rounded-2xl hover:bg-rose-50 text-gray-400 hover:text-rose-500 transition-all border border-gray-100 shadow-sm"><X size={24} /></button>
                    </div>

                    <div className="flex gap-4 items-center">
                        <div className="flex-1 relative group">
                            <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-purple-500 transition-colors" />
                            <input 
                                autoFocus
                                type="text" 
                                placeholder="Search products, SKUs, or categories..." 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-50 rounded-[2rem] outline-none text-sm font-bold focus:bg-white focus:ring-4 focus:ring-purple-50 focus:border-purple-100 transition-all shadow-inner"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100">
                                <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><LayoutGrid size={18} /></button>
                                <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}><List size={18} /></button>
                            </div>
                            <div className="flex bg-gray-50 p-1.5 rounded-[2rem] border border-gray-100">
                                {(['all', 'products', 'categories'] as const).map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setTab(t)}
                                        className={`px-6 py-2.5 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest transition-all ${tab === t ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content Section */}
                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar bg-white">
                    <div className={viewMode === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4' : 'flex flex-col gap-2'}>
                        {filtered.length === 0 && (
                            <div className="col-span-full py-20 text-center space-y-4 opacity-40">
                                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto"><Search size={32} /></div>
                                <p className="font-black text-xs uppercase tracking-widest text-gray-500">No Entities Found Matching "{search}"</p>
                            </div>
                        )}
                        {filtered.map((item, i) => {
                            const active = isSelected(item.id, item.type);
                            if (viewMode === 'list') {
                                return (
                                    <motion.div 
                                        key={i} 
                                        onClick={() => onToggle(item)}
                                        className={`p-4 px-6 rounded-2xl border transition-all flex items-center gap-4 cursor-pointer ${active ? 'bg-purple-600 border-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white border-gray-50 hover:bg-gray-50 text-gray-800'}`}
                                    >
                                        <div className={`p-2 rounded-xl flex-shrink-0 ${active ? 'bg-white/10' : 'bg-purple-50'}`}>
                                            {item.type === 'product' ? <ShoppingBag size={18} className={active ? 'text-white' : 'text-purple-600'} /> : <Layers size={18} className={active ? 'text-white' : 'text-purple-600'} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className={`text-sm font-black tracking-tight leading-tight truncate ${active ? 'text-white' : 'text-gray-900'}`}>{item.name}</h4>
                                            <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 opacity-60 ${active ? 'text-purple-100' : 'text-gray-400'}`}>
                                                {item.type} {item.sku && `· ${item.sku}`}
                                            </p>
                                        </div>
                                        {active && <CheckCircle2 size={18} className="flex-shrink-0" />}
                                    </motion.div>
                                );
                            }
                            return (
                                <motion.div 
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    key={i} 
                                    onClick={() => onToggle(item)}
                                    className={`p-5 rounded-[2rem] border-2 cursor-pointer transition-all flex flex-col gap-3 h-full justify-between ${active ? 'bg-purple-600 border-purple-600 text-white shadow-xl shadow-purple-200' : 'bg-white border-gray-50 hover:border-purple-200 text-gray-800'}`}
                                >
                                    <div className="flex justify-between items-start">
                                        <div className={`p-2 rounded-xl ${active ? 'bg-white/10' : 'bg-gray-50'}`}>
                                            {item.type === 'product' ? <ShoppingBag size={18} /> : <Layers size={18} />}
                                        </div>
                                        {active && <CheckCircle2 size={18} />}
                                    </div>
                                    <div>
                                        <h4 className={`text-sm font-black tracking-tight leading-tight ${active ? 'text-white' : 'text-gray-900'}`}>{item.name}</h4>
                                        <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 opacity-60 ${active ? 'text-purple-100' : 'text-gray-400'}`}>
                                            {item.type} {item.sku && `· ${item.sku}`}
                                        </p>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer Section */}
                <div className="p-8 px-10 border-t border-gray-50 bg-gray-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center border border-gray-100 shadow-sm">
                            <Pin className="text-purple-600" size={24} />
                        </div>
                        <div>
                            <span className="block text-lg font-black text-gray-900 leading-none">{(selected || []).length} Entities Attached</span>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-0.5">Ready to sync intelligence</span>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="bg-gray-900 hover:bg-black text-white px-10 py-4 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-gray-200 transition-all active:scale-95 flex items-center gap-3"
                    >
                        Confirm Links <ArrowRight size={16} />
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

function ProfileTab({ profile, fetchProfile, syncVectors }: { profile: any, fetchProfile: () => void, syncVectors: (type: 'products' | 'profile' | 'knowledge') => void }) {
    const [formData, setFormData] = useState<any>(profile || {});
    const [saving, setSaving] = useState(false);
    const [tuning, setTuning] = useState(false);

    useEffect(() => { setFormData(profile || {}); }, [profile]);

    const handleChange = (e: any) => setFormData({ ...formData, [e.target.name]: e.target.value });

    const handleTuneOverview = async () => {
        if (!formData.about_text) return;
        setTuning(true);
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/tune-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: formData.about_text })
            });
            const data = await res.json();
            if (data.success) {
                setFormData({ ...formData, about_text: data.tunedText });
            }
        } catch (e) { console.error('Tune failed', e); }
        setTuning(false);
    };

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
                    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm space-y-4 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 blur-[50px] pointer-events-none" />
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
                            <label className="text-[11px] font-black text-gray-900 uppercase tracking-widest flex items-center gap-2 z-10">
                                <Sparkles size={16} className="text-purple-600" /> Business Overview / Core Concept
                            </label>
                            <button 
                                onClick={handleTuneOverview} 
                                disabled={tuning || !formData.about_text}
                                className="flex items-center gap-2 text-[10px] bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-xl font-black uppercase tracking-widest hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed z-10"
                            >
                                {tuning ? <RefreshCw size={12} className="animate-spin" /> : <Wand2 size={12} />}
                                {tuning ? 'Tuning Profile...' : 'AI Fine-Tune'}
                            </button>
                        </div>
                        <textarea name="about_text" value={formData.about_text || ''} onChange={handleChange} rows={4} placeholder="Simple description: We sell organic skincare products in Dhaka..." className="w-full p-4 bg-gray-50 border border-gray-50 rounded-2xl focus:ring-2 focus:ring-purple-100 focus:bg-white outline-none text-sm font-medium transition-all relative z-10" />
                    </div>

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

function ProductsTab({ 
    products, 
    categories, 
    fetchProducts, 
    pagination, 
    isFetchingMore, 
    onQuickBuy,
    popoverState,
    setPopoverState,
    editingVariant,
    setEditingVariant,
    handleVariantStockSave
}: any) {
    const [searchQuery, setSearchQuery] = useState('');
    const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'empty' | 'hidden'>('all');
    const [adding, setAdding] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [quickEditingStock, setQuickEditingStock] = useState<number | null>(null);
    const [quickStockValue, setQuickStockValue] = useState<number>(0);
    const popoverTimeoutRef = useRef<any>(null);

    const [isSyncing, setIsSyncing] = useState(false);

    const activePopoverProduct = useMemo(() => {
        if (!popoverState) return null;
        const p = products.find(p => String(p.id) === String(popoverState.productId));
        console.log('[Popover] Active product updated:', p?.name, p?.stock_quantity);
        return p;
    }, [popoverState, products]);

    const parsedVariants = useMemo(() => {
        if (!activePopoverProduct) return [];
        const raw = activePopoverProduct.variants;
        console.log('[Popover] Raw variants:', typeof raw, raw);
        try {
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const items = parsed?.items || (Array.isArray(parsed) ? parsed : []);
            console.log('[Popover] Parsed items count:', items.length);
            return items;
        } catch (e) { 
            console.error('[Popover] Parse error:', e);
            return []; 
        }
    }, [activePopoverProduct]);

    useEffect(() => {
        const socket = (window as any).socket;
        if (!socket) return;

        socket.on('procurement_log', (msg: string) => {
            console.log('%c' + msg, 'color: #8b5cf6; font-weight: bold; background: #f5f3ff; padding: 2px 5px; border-radius: 4px;');
        });

        return () => { socket.off('procurement_log'); };
    }, []);

    const handleForceSync = async () => {
        setIsSyncing(true);
        console.log('[ForceSync] Starting for product:', activePopoverProduct?.id);
        try {
            await fetchProducts(pagination.page, searchQuery);
            console.log('[ForceSync] Success. Products list updated.');
        } catch (err) {
            console.error('[ForceSync] Failed:', err);
        } finally {
            setTimeout(() => setIsSyncing(false), 800);
        }
    };


    const handleQuickStockSave = async (id: number) => {
        try {
            const product = products.find(p => String(p.id) === String(id));
            let payload: any = { stock_quantity: quickStockValue };

            // Smart Sync: If product has exactly one variant, sync its stock too
            if (product) {
                const raw = product.variants;
                let items: any[] = [];
                try {
                    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                    items = parsed?.items || (Array.isArray(parsed) ? parsed : []);
                } catch { }

                if (items.length === 1) {
                    items[0].stock = String(quickStockValue);
                    if (items[0].stock_quantity !== undefined) items[0].stock_quantity = String(quickStockValue);
                    payload.variants = { items };
                }
            }

            const res = await fetch(`http://localhost:3001/api/ai-brain/products/${id}/stock`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                fetchProducts(pagination.page, searchQuery);
                setQuickEditingStock(null);
            }
        } catch (e) { console.error("Quick stock update failed", e); }
    };

    const [formData, setFormData] = useState<any>({
        full_description: '', sku: '', regular_price: '', sale_price: '',
        composition: '', handling_guidelines: '', technical_attributes: '',
        category_id: null,
        stock_quantity: 0,
        stock_status: 1
    });
    const [variantList, setVariantList] = useState<{name: string, price: string, stock: number}[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // 💡 V17.0 ENTERPRISE: Automatic Price Range Engine
    // If the user doesn't provide a specific Regular/Offer price, 
    // we calculate the range from variants to show "Min - Max Tk"
    useEffect(() => {
        if (!adding) return;

        const hasManualPrices = formData.regular_price || formData.sale_price;
        if (!hasManualPrices) {
            const prices = variantList
                .map(v => {
                    const clean = v.price.toString().replace(/[^0-9.]/g, '');
                    return clean ? parseFloat(clean) : null;
                })
                .filter(p => p !== null) as number[];

            if (prices.length > 0) {
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                const rangeLabel = min === max ? `${min} Tk` : `${min} - ${max} Tk`;

                // Only auto-update if current price is empty or looks like a previously auto-generated range
                const isAutoOrEmpty = !formData.price || 
                                    formData.price.includes(' - ') || 
                                    (formData.price.endsWith(' Tk') && !isNaN(parseInt(formData.price)));

                if (isAutoOrEmpty && formData.price !== rangeLabel) {
                    setFormData(prev => ({ ...prev, price: rangeLabel }));
                }
            }
        }
    }, [variantList, adding, formData.regular_price, formData.sale_price]);
    const [isAllSelectedGlobally, setIsAllSelectedGlobally] = useState(false);
    const [editingProduct, setEditingProduct] = useState<any>(null);

    const startEdit = (p: any, e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingProduct(p);
        setAdding(true);
        
        // Parse variants
        let parsedVariants: {name: string, price: string, stock: number}[] = [];
        try {
            const raw = p.variants;
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const items = parsed?.items || (Array.isArray(parsed) ? parsed : []);
            parsedVariants = items.map((v: any) => ({ 
                name: v.type || v.name || '', 
                price: v.price || v.value || '',
                stock: parseFloat(v.stock) || 0
            }));
        } catch (err) { }

        setVariantList(parsedVariants);
        setFormData({
            name: p.name || '',
            price: p.price || '',
            description: p.description || '',
            product_url: p.product_url || '',
            full_description: p.full_description || '',
            sku: p.sku || '',
            regular_price: p.regular_price || '',
            sale_price: p.sale_price || '',
            composition: p.composition || '',
            handling_guidelines: p.handling_guidelines || '',
            technical_attributes: p.technical_attributes || '',
            category_id: p.category_id || null,
            stock_quantity: parseFloat(p.stock_quantity) || 0,
            stock_status: p.stock_status ?? 1
        });

        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    
    // V16.0 Virtualization: Ultra-low RAM DOM Rendering
    const [scrollTop, setScrollTop] = useState(0);
    const containerRef = React.useRef<HTMLDivElement>(null);
    const rowHeight = 100; // Est. height per row
    const viewportBuffer = 10; // Extra rows for smooth scroll
    
    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    };

    const filteredProducts = products.filter(p => {
        if (stockFilter === 'low') return p.stock_quantity > 0 && p.stock_quantity < 10;
        if (stockFilter === 'empty') return p.stock_quantity <= 0;
        if (stockFilter === 'hidden') return p.stock_status === 0;
        return true;
    });

    const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - viewportBuffer);
    const visibleProducts = filteredProducts.slice(startIndex, startIndex + 30); // Render window of 30
    const topSpacer = startIndex * rowHeight;
    const bottomSpacer = Math.max(0, (filteredProducts.length - (startIndex + visibleProducts.length)) * rowHeight);

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
            const validVariants = variantList.filter(v => v.name.trim() !== '');
            const payload = { 
                ...formData, 
                variants: validVariants.length > 0 
                    ? JSON.stringify({ 
                        items: validVariants.map(v => ({ type: v.name, price: v.price, stock: v.stock })),
                        price_map: Object.fromEntries(validVariants.map(v => [v.name, v.price]))
                    }) 
                    : '' 
            };

            const url = editingProduct 
                ? `http://localhost:3001/api/ai-brain/products/${editingProduct.id}` 
                : 'http://localhost:3001/api/ai-brain/products';
            
            const method = editingProduct ? 'PUT' : 'POST';

            await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            fetchProducts(1);
            setAdding(false);
            setEditingProduct(null);
            setVariantList([]);
            setFormData({
                name: '', price: '', description: '', product_url: '',
                full_description: '', sku: '', regular_price: '', sale_price: '',
                composition: '', handling_guidelines: '', technical_attributes: '',
                category_id: null,
                stock_quantity: 0,
                stock_status: 1
            });
        } catch (e) { alert(editingProduct ? 'Failed to update product' : 'Failed to add product'); }
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
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
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
                    <button 
                        onClick={() => {
                            if (adding && editingProduct) {
                                setEditingProduct(null);
                                setFormData({
                                    name: '', price: '', description: '', product_url: '',
                                    full_description: '', sku: '', regular_price: '', sale_price: '',
                                    composition: '', handling_guidelines: '', technical_attributes: '',
                                    category_id: null,
                                    stock_quantity: 0,
                                    stock_status: 1
                                });
                                setVariantList([]);
                            } else {
                                setAdding(!adding);
                                setEditingProduct(null);
                            }
                        }} 
                        className="bg-gray-900 hover:bg-black text-white px-5 py-2.5 rounded-2xl flex items-center gap-2 font-bold text-sm shadow-lg shadow-gray-200 transition-all active:scale-95"
                    >
                        <Plus size={18} /> {editingProduct ? 'Cancel Edit' : 'Add Node'}
                    </button>
                </div>
            </div>

            {/* V17.5: Advanced Stock Intelligence Filters */}
            <div className="flex flex-wrap items-center gap-2 mb-4 p-1.5 bg-gray-100/50 rounded-[1.5rem] border border-gray-100 w-fit">
                <button 
                    onClick={() => setStockFilter('all')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${stockFilter === 'all' ? 'bg-white text-gray-900 shadow-md ring-1 ring-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
                >
                    All Nodes
                </button>
                <div className="w-px h-4 bg-gray-200 mx-1" />
                <button 
                    onClick={() => setStockFilter('low')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${stockFilter === 'low' ? 'bg-amber-100 text-amber-700 shadow-sm ring-1 ring-amber-200' : 'text-amber-500 hover:bg-amber-50'}`}
                >
                    <Activity size={12} /> Low Stock
                </button>
                <button 
                    onClick={() => setStockFilter('empty')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${stockFilter === 'empty' ? 'bg-rose-100 text-rose-700 shadow-sm ring-1 ring-rose-200' : 'text-rose-600 hover:bg-rose-50'}`}
                >
                    <PackageSearch size={12} /> Empty Stock
                </button>
                <button 
                    onClick={() => setStockFilter('hidden')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${stockFilter === 'hidden' ? 'bg-indigo-100 text-indigo-700 shadow-sm ring-1 ring-indigo-200' : 'text-indigo-600 hover:bg-indigo-50'}`}
                >
                    <EyeOff size={12} /> Hidden Nodes
                </button>
            </div>

            {adding && (
                <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="bg-purple-50/50 p-6 rounded-[2.5rem] border border-purple-100 mb-2 shadow-inner max-h-[60vh] overflow-y-auto custom-scrollbar"
                >
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Product Name</label>
                            <input type="text" placeholder="e.g. Wireless Headset" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Price Point (Display)</label>
                            <input 
                                type="text" 
                                placeholder="e.g. 2450 Tk" 
                                value={formData.price} 
                                onChange={e => setFormData({ ...formData, price: e.target.value })} 
                                className={`w-full p-3 bg-white border rounded-2xl text-sm font-bold outline-none transition-all ${formData.price && formData.price.includes('-') ? 'border-indigo-200 ring-2 ring-indigo-50 text-indigo-600' : 'border-purple-100 focus:ring-2 focus:ring-purple-200'}`} 
                            />
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
                        <div className="col-span-2">
                            <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-1.5 block">High-Density AI Attributes (Key Facts & Specs)</label>
                            <input type="text" placeholder='e.g. {"origin": "Padma River", "material": "100% Pure Cotton", "benefits": "Chemical Free"}' value={formData.ai_attributes || ''} onChange={e => setFormData({ ...formData, ai_attributes: e.target.value })} className="w-full p-3 bg-purple-50/50 border border-purple-100 rounded-2xl text-xs font-mono font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Composition (Fabric/Ingredients)</label>
                            <input type="text" placeholder="e.g. 100% Cotton" value={formData.composition || ''} onChange={e => setFormData({ ...formData, composition: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Handling (Care/Usage)</label>
                            <input type="text" placeholder="e.g. Hand Wash Only" value={formData.handling_guidelines || ''} onChange={e => setFormData({ ...formData, handling_guidelines: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                        </div>
                        
                        {/* V17.5: Inventory Control Form Fields */}
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 block">Stock Quantity (Physical)</label>
                            <input 
                                type="number" 
                                step="0.001"
                                placeholder="0" 
                                value={formData.stock_quantity}
                                onChange={e => setFormData({ ...formData, stock_quantity: parseFloat(e.target.value) || 0 })}
                                className="w-full p-3.5 bg-white border border-gray-100 rounded-2xl text-[13px] font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all placeholder:text-gray-300" 
                            />
                        </div>
                        <div className="col-span-1">
                            <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1.5 block">Catalog Visibility</label>
                            <select 
                                value={formData.stock_status ?? 1} 
                                onChange={e => setFormData({ ...formData, stock_status: parseInt(e.target.value) })} 
                                className="w-full p-3 bg-white border border-emerald-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-emerald-200 outline-none appearance-none"
                            >
                                <option value={1}>Available / Listed</option>
                                <option value={0}>Out of Stock / Hidden</option>
                            </select>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Category Assignment</label>
                            <select 
                                value={formData.category_id || ''} 
                                onChange={e => setFormData({ ...formData, category_id: e.target.value || null })} 
                                className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none appearance-none"
                            >
                                <option value="">General / Uncategorized</option>
                                {categories.map((c, i) => (
                                    <option key={i} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="col-span-2">
                            <div className="flex justify-between items-center mb-1.5">
                                <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest">Variants (Colors/Sizes/Options)</label>
                                <button onClick={() => setVariantList([...variantList, { name: '', price: '', stock: 0 }])} className="text-[10px] bg-purple-100 text-purple-600 px-2 py-1 rounded font-black hover:bg-purple-200 transition-all">+ Add Variant</button>
                            </div>
                            <div className="space-y-2">
                                {variantList.length === 0 && (
                                    <div className="p-3 bg-white border border-dashed border-purple-200 rounded-2xl text-xs text-gray-400 font-medium text-center italic">No variants added. Click + Add Variant if needed.</div>
                                )}
                                {variantList.map((v, idx) => (
                                    <div key={idx} className="flex gap-2 items-center">
                                        <input type="text" placeholder="e.g. Size M, Color Red" value={v.name} onChange={e => {
                                            const next = [...variantList]; next[idx].name = e.target.value; setVariantList(next);
                                        }} className="flex-1 p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                                        <input type="text" placeholder="Price" value={v.price} onChange={e => {
                                            const next = [...variantList]; next[idx].price = e.target.value; setVariantList(next);
                                        }} className="w-24 p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" />
                                        <input 
                                            type="number" 
                                            step="0.001"
                                            placeholder="0" 
                                            value={v.stock || 0}
                                            onChange={e => {
                                                const newList = [...variantList];
                                                newList[idx].stock = parseFloat(e.target.value) || 0;
                                                setVariantList(newList);
                                            }}
                                            className="w-20 p-3 bg-white border border-purple-100 rounded-2xl text-sm font-bold focus:ring-2 focus:ring-purple-200 outline-none" 
                                        />
                                        <button onClick={() => setVariantList(variantList.filter((_, i) => i !== idx))} className="w-10 h-10 flex items-center justify-center bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-100 transition-all cursor-pointer flex-shrink-0">
                                            <X size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Technical Attributes (Fit/Dims/Specs)</label>
                            <textarea placeholder="Fit: Slim | Stretch: Low | Weight: 250g" value={formData.technical_attributes || ''} onChange={e => setFormData({ ...formData, technical_attributes: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-purple-200 outline-none" rows={2} />
                        </div>
                        <div className="col-span-2 flex gap-3 pt-2">
                            <button onClick={addProduct} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-purple-100 transition-all">
                                {editingProduct ? 'Update Intelligence Node' : 'Save Intelligence Node'}
                            </button>
                            <button onClick={() => { setAdding(false); setEditingProduct(null); }} className="px-6 py-3 bg-white border border-gray-200 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all">Cancel</button>
                        </div>
                    </div>
                </motion.div>
            )}

            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
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
                            <col style={{ width: '44px' }} />
                            <col style={{ width: '40%' }} />
                            <col style={{ width: '15%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '18%' }} />
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
                                            <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(p.id)}
                                                    onChange={() => toggleSelect(p.id)}
                                                    className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                                                />
                                            </td>
        
                                            <td className="px-3 py-3 overflow-hidden">
                                                <div className="flex items-center gap-3 min-w-0">
                                                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center overflow-hidden border-2 border-gray-100 flex-shrink-0 shadow-sm group-hover:border-purple-200 transition-all duration-200">
                                                        {p.image_url ? (
                                                            <img loading="lazy" src={p.image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                                        ) : (
                                                            <PackageSearch className="text-gray-200" size={22} />
                                                        )}
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="font-extrabold text-gray-900 group-hover:text-purple-700 transition-colors truncate text-sm mb-0.5">{p.name}</div>
                                                        <div className="text-[10px] text-gray-400 font-medium truncate mb-1">{p.description || 'No description...'}</div>
                                                        {p.category_name && (
                                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-900 text-[8px] font-black text-white rounded uppercase tracking-tighter mb-1.5">
                                                                <Tag size={8} /> {p.category_name}
                                                            </div>
                                                        )}
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
                                                                            {v.type || v.name}: {v.value || v.sku || (v.price ? `${v.price}` : '')}
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
        
                                            {/* Price & Valuation */}
                                            <td className="px-3 py-3 overflow-hidden">
                                                <div className="flex flex-col gap-1.5">
                                                    {/* Selling Price */}
                                                    <div>
                                                        {p.regular_price && p.sale_price ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-sm font-black text-emerald-600 truncate">{p.sale_price}</span>
                                                                <span className="text-[9px] font-bold text-gray-300 line-through truncate opacity-60">{p.regular_price}</span>
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm font-black text-gray-900 truncate">{p.price || 'N/A'}</div>
                                                        )}
                                                        <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest leading-tight">Selling Price</div>
                                                    </div>
                                                </div>
                                            </td>
        
                                            {/* Origin */}
                                            <td className="px-3 py-3 overflow-hidden">
                                                <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest max-w-full ${p.manual_override ? 'bg-indigo-50/80 text-indigo-600 border border-indigo-100' : 'bg-emerald-50/80 text-emerald-600 border border-emerald-100'}`}>
                                                    {p.manual_override ? <Edit2 size={10} /> : <Zap size={10} />}
                                                    <span className="truncate">{p.manual_override ? 'Manual' : 'System'}</span>
                                                </div>
                                            </td>

                                    {/* Inventory Intelligence Status */}
                                    <td className="px-3 py-3 overflow-hidden">
                                        <div className="flex flex-col gap-1.5 min-w-0 relative group/stock">
                                            {p.stock_status === 0 ? (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-gray-100 text-gray-500 rounded-md text-[8px] font-black uppercase tracking-widest border border-gray-200 w-fit">
                                                    <EyeOff size={10} /> HIDDEN
                                                </div>
                                            ) : p.stock_quantity <= 0 ? (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md text-[8px] font-black uppercase tracking-widest border border-rose-100 w-fit animate-pulse">
                                                    <ShoppingCart size={10} /> EMPTY
                                                </div>
                                            ) : p.stock_quantity < 10 ? (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-amber-50 text-amber-600 rounded-md text-[8px] font-black uppercase tracking-widest border border-amber-100 w-fit">
                                                    <Activity size={10} /> LOW STOCK
                                                </div>
                                            ) : (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md text-[8px] font-black uppercase tracking-widest border border-emerald-100 w-fit">
                                                    <CheckCircle2 size={10} /> AVAILABLE
                                                </div>
                                            )}
                                            
                                            <div className="flex items-center gap-2 group/adjust">
                                                {quickEditingStock === p.id ? (
                                                    <div className="flex items-center gap-1 animate-in fade-in slide-in-from-left-2 overflow-hidden">
                                                        <input 
                                                            type="number" 
                                                            step="0.001"
                                                            autoFocus
                                                            value={quickStockValue} 
                                                            onChange={e => setQuickStockValue(parseFloat(e.target.value) || 0)}
                                                            onKeyDown={e => e.key === 'Enter' && handleQuickStockSave(p.id)}
                                                            className="w-16 h-7 bg-white border border-purple-300 rounded-lg text-xs font-black text-center focus:ring-2 focus:ring-purple-200 outline-none"
                                                        />
                                                        <button onClick={() => handleQuickStockSave(p.id)} className="w-7 h-7 bg-emerald-500 text-white rounded-lg flex items-center justify-center hover:bg-emerald-600 shadow-sm transition-all"><Check size={14} /></button>
                                                        <button onClick={() => setQuickEditingStock(null)} className="w-7 h-7 bg-gray-100 text-gray-500 rounded-lg flex items-center justify-center hover:bg-gray-200 transition-all"><X size={14} /></button>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className={`text-xs font-black tracking-tight ${p.stock_quantity <= 0 ? 'text-rose-600' : p.stock_quantity < 10 ? 'text-amber-500' : 'text-gray-900'}`}>
                                                            {Number(p.stock_quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })} <span className="text-[9px] text-gray-400 uppercase font-bold tracking-widest">Units</span>
                                                        </div>
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); setQuickEditingStock(p.id); setQuickStockValue(p.stock_quantity || 0); }}
                                                            className="opacity-0 group-hover/adjust:opacity-100 p-1 text-gray-300 hover:text-purple-600 hover:bg-purple-50 rounded transition-all cursor-pointer"
                                                        >
                                                            <Edit2 size={10} />
                                                        </button>
                                                    </>
                                                )}
                                                {p.stock_quantity < 0 && (
                                                    <div className="px-1.5 py-0.5 bg-rose-900 text-white text-[7px] font-black rounded uppercase">BACK-ORDER</div>
                                                )}
                                                {p.variants?.items?.length > 0 && (
                                                    <div 
                                                        onMouseEnter={(e) => {
                                                            if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setPopoverState({ productId: p.id, rect });
                                                        }}
                                                        onMouseLeave={() => {
                                                            popoverTimeoutRef.current = setTimeout(() => {
                                                                setPopoverState(null);
                                                            }, 150); // 150ms grace period to move mouse to popover
                                                        }}
                                                        className="px-1.5 py-0.5 bg-purple-50 text-purple-600 border border-purple-100 text-[7px] font-black rounded uppercase flex items-center gap-0.5 cursor-help group-hover/adjust:bg-purple-600 group-hover/adjust:text-white group-hover/adjust:border-purple-600 transition-all"
                                                    >
                                                        <Box size={8} /> {p.variants.items.length} VARIANTS
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>

                                    {/* Actions */}
                                    <td className="px-3 py-3 text-right">
                                        <div className="flex justify-end items-center gap-2">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); onQuickBuy(p); }}
                                                className="p-2 text-gray-300 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all"
                                                title="Quick Buy / Re-stock"
                                            >
                                                <ShoppingCart size={15} />
                                            </button>
                                            <button
                                                onClick={(e) => startEdit(p, e)}
                                                className="p-2 text-gray-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                                                title="Edit Node"
                                            >
                                                <Edit2 size={15} />
                                            </button>
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

            {/* GLOBAL FIXED VARIANT HUD - Escapes all overflow clipping by using fixed positioning */}
            {popoverState && popoverState.rect && activePopoverProduct && (
                <div 
                    className="fixed z-[9999] animate-in fade-in zoom-in duration-200 pointer-events-auto"
                    onMouseEnter={() => {
                        if (popoverTimeoutRef.current) clearTimeout(popoverTimeoutRef.current);
                    }}
                    onMouseLeave={() => {
                        popoverTimeoutRef.current = setTimeout(() => {
                            setPopoverState(null);
                        }, 100);
                    }}
                    style={{
                        left: popoverState.rect.left + (popoverState.rect.width / 2),
                        top: popoverState.rect.top < 250 ? popoverState.rect.bottom + 12 : popoverState.rect.top - 12,
                        transform: `translateX(-50%) ${popoverState.rect.top < 250 ? '' : 'translateY(-100%)'}`
                    }}
                >
                    <div className="bg-gray-900/98 backdrop-blur-xl text-white p-5 rounded-[2rem] shadow-[0_20px_50px_rgba(0,0,0,0.4)] border border-white/10 min-w-[240px] ring-1 ring-black/50">
                        <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                            <div className="flex items-center gap-2">
                                <Box size={14} className="text-purple-400" />
                                <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">Variant Inventory</p>
                            </div>
                            <div className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.8)]" />
                        </div>
                        <div className="max-h-[350px] overflow-y-auto custom-scrollbar pr-2 space-y-2.5">
                            {parsedVariants.length === 0 ? (
                                <p className="text-[10px] text-gray-500 italic py-4 text-center">No variants found for this node.</p>
                            ) : (
                                parsedVariants.map((v: any, i: number) => {
                                    // Robust stock key lookup
                                    const vStockRaw = v.stock ?? v.stock_quantity ?? v.quantity ?? 0;
                                    const vStock = parseFloat(vStockRaw) || 0;
                                    const vName = v.name || (v.type && v.value ? `${v.type}: ${v.value}` : (v.value || v.type || v.sku || `Variant ${i + 1}`));
                                    const isEditing = editingVariant?.index === i;

                                    return (
                                        <div key={`${i}-${vStock}-${v.price}`} className="flex items-center justify-between gap-8 group/vitem py-1">
                                            <div className="flex flex-col">
                                                <span className="text-[11px] font-bold text-gray-200 group-hover/vitem:text-white transition-colors">{vName}</span>
                                                <span className="text-[9px] font-medium text-gray-500">{v.price} Tk</span>
                                            </div>
                                            
                                            {isEditing ? (
                                                <div className="flex items-center gap-1">
                                                    <input 
                                                        type="number"
                                                        className="w-14 bg-white/10 border border-white/20 rounded px-1 py-0.5 text-[10px] font-bold text-white outline-none focus:border-purple-500/50"
                                                        value={editingVariant.value}
                                                        onChange={(e) => setEditingVariant({ ...editingVariant, value: e.target.value })}
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') handleVariantStockSave(activePopoverProduct.id, i, editingVariant.value, searchQuery);
                                                            if (e.key === 'Escape') setEditingVariant(null);
                                                        }}
                                                    />
                                                    <button 
                                                        onClick={() => handleVariantStockSave(activePopoverProduct.id, i, editingVariant.value, searchQuery)}
                                                        className="p-1 rounded bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                                                    >
                                                        <Check size={10} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div 
                                                    onClick={() => setEditingVariant({ index: i, value: String(vStock) })}
                                                    className={`min-w-[32px] cursor-pointer text-center text-[11px] font-black px-2 py-1 rounded-xl border transition-all hover:scale-105 active:scale-95 ${vStock <= 0 ? 'text-rose-400 bg-rose-400/10 border-rose-400/20 shadow-[0_0_15px_rgba(251,113,133,0.1)]' : (vStock < 5 ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20')}`}
                                                >
                                                    {Number(vStock).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <div className="mt-5 pt-3 border-t border-white/5 flex items-center justify-between">
                            <button 
                                onClick={handleForceSync}
                                disabled={isSyncing}
                                className={`flex items-center gap-1.5 transition-colors group/sync ${isSyncing ? 'text-emerald-400' : 'hover:text-emerald-400 text-gray-500'}`}
                            >
                                <div className={`w-1.5 h-1.5 rounded-full bg-emerald-500 ${isSyncing ? 'animate-ping' : 'animate-pulse'}`} />
                                <span className="text-[8px] font-black uppercase tracking-widest group-hover/sync:underline">
                                    {isSyncing ? 'Syncing...' : 'Force Sync'}
                                </span>
                                <RefreshCw size={8} className={`${isSyncing ? 'animate-spin' : 'group-hover/sync:rotate-180'} transition-transform duration-500`} />
                            </button>
                            <span className="text-[10px] font-black text-white">{activePopoverProduct.stock_quantity} Total</span>
                        </div>
                    </div>
                    {/* Floating Indicator Arrow */}
                    <div 
                        className={`w-3 h-3 bg-gray-900 absolute left-1/2 -translate-x-1/2 rotate-45 border-white/10 ${popoverState.rect.top < 250 ? '-top-1.5 border-l border-t' : '-bottom-1.5 border-r border-b'}`} 
                    />
                </div>
            )}

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
                                                                        <span className="font-bold text-gray-800">{v.value || v.sku || (v.price ? `${v.price} BDT` : 'N/A')}</span>
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

function KnowledgeTab({ knowledge, categories, products, fetchKnowledge, syncVectors, loading, currentProcessId }: { knowledge: any[], categories: any[], products: any[], fetchKnowledge: () => void, syncVectors: (type: any) => void, loading: boolean, currentProcessId: string | null }) {
    const [adding, setAdding] = useState(false);
    const [managingCategories, setManagingCategories] = useState(false);
    const [showExpired, setShowExpired] = useState(false);
    const [ingestionMethod, setIngestionMethod] = useState<'manual' | 'bulk' | 'scrape'>('manual');
    const [scrapeUrl, setScrapeUrl] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [formData, setFormData] = useState<any>({ 
        title: '', 
        content: '', 
        type: 'faq', 
        is_pinned: 1, 
        pinned_items: [], 
        response_style: 'conversational',
        expiry_date: '',
        media_url: '',
        media_type: 'image',
        action_tag: ''
    });
    const [isTuning, setIsTuning] = useState(false);

    const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            const csvText = event.target?.result as string;
            try {
                const res = await fetch('http://localhost:3001/api/ai-brain/knowledge/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ csvText })
                });
                const data = await res.json();
                if (data.success) {
                    setAdding(false);
                }
            } catch (err) { alert('CSV Import Failed'); }
        };
        reader.readAsText(file);
    };

    const handleScrape = async () => {
        if (!scrapeUrl) return;
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/knowledge/scrape', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: scrapeUrl })
            });
            const data = await res.json();
            if (data.success) {
                setAdding(false);
            }
        } catch (err) { alert('Scrape Failed'); }
    };

    const togglePin = (item: any) => {
        const exists = formData.pinned_items.some((i: any) => i.id === item.id && i.type === item.type);
        if (exists) {
            setFormData({ ...formData, pinned_items: formData.pinned_items.filter((i: any) => !(i.id === item.id && i.type === item.type)) });
        } else {
            setFormData({ ...formData, pinned_items: [...formData.pinned_items, item] });
        }
    };

    const tuneWithAI = async () => {
        if (!formData.content || isTuning) return;
        setIsTuning(true);
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/knowledge/tune', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: formData.content })
            });
            const data = await res.json();
            if (data.success && data.refined) {
                setFormData({ ...formData, content: data.refined });
            }
        } catch (err) {
            console.error('Tuning failed:', err);
        } finally {
            setIsTuning(false);
        }
    };

    const addDoc = async () => {
        try {
            const isEdit = !!formData.id;
            const url = isEdit 
                ? `http://localhost:3001/api/ai-brain/knowledge/${formData.id}` 
                : 'http://localhost:3001/api/ai-brain/knowledge';
            
            await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            fetchKnowledge();
            setAdding(false);
            setFormData({ title: '', content: '', type: 'faq', is_pinned: 1, pinned_items: [], response_style: 'conversational', action_tag: '', media_url: '', media_type: 'image' });
        } catch (e) { alert('Failed to save document'); }
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
                    <p className="text-sm text-gray-500 font-medium">Hierarchy of Truth: Pinned &gt; Category &gt; Global Knowledge.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setShowExpired(!showExpired)}
                        className={`px-5 py-2.5 rounded-2xl flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-all ${showExpired ? 'bg-rose-50 text-rose-600 border border-rose-100 shadow-sm' : 'bg-white border border-gray-200 text-gray-400'}`}
                    >
                        {showExpired ? <Eye size={18} /> : <EyeOff size={18} />} {showExpired ? 'Showing Expired' : 'Hide Expired'}
                    </button>
                    <button
                        onClick={() => syncVectors('knowledge')}
                        disabled={loading || knowledge.filter(k => !k.embedding).length === 0}
                        className={`px-5 py-2.5 rounded-2xl flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-all relative group ${knowledge.filter(k => !k.embedding).length === 0 ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-none' : 'bg-white border border-purple-200 text-purple-600 hover:bg-purple-50'}`}
                    >
                        {knowledge.filter(k => !k.embedding).length === 0 ? (
                            <CheckCircle2 size={18} className="text-emerald-500" />
                        ) : (
                            <BrainCircuit size={18} className={loading && currentProcessId?.startsWith('vector_sync_knowledge') ? 'animate-spin' : ''} />
                        )}
                        {knowledge.filter(k => !k.embedding).length === 0 ? 'Intel Ready' : `Sync Knowledge Brain (${knowledge.filter(k => !k.embedding).length})`}
                        
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 px-3 py-1 bg-gray-900 text-white text-[9px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                            Vectorize only new/updated documents
                        </div>
                    </button>
                    <button
                        onClick={() => setManagingCategories(true)}
                        className="bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-5 py-2.5 rounded-2xl flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-all"
                    >
                        <Tag size={18} /> Manage Categories
                    </button>
                    <button onClick={() => setAdding(!adding)} className="bg-purple-50 text-purple-700 hover:bg-purple-100 px-5 py-2.5 rounded-2xl flex items-center gap-2 font-black text-xs uppercase tracking-widest transition-all">
                        <Plus size={18} /> Add Knowledge
                    </button>
                </div>
            </div>

            {managingCategories && (
                <CategoryManager 
                    categories={categories} 
                    fetchCategories={() => {}} 
                    onClose={() => setManagingCategories(false)} 
                />
            )}

            {adding && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="bg-gray-50 rounded-[2.5rem] border border-gray-200 mb-10 overflow-hidden shadow-inner flex flex-col">
                    {/* Sub-Header: Ingestion Method Selection */}
                    <div className="flex bg-white/50 border-b border-gray-100 p-2 gap-2">
                        {[
                            { id: 'manual', label: 'Manual Add', icon: <Plus size={14}/> },
                            { id: 'bulk', label: 'Bulk CSV', icon: <FileSpreadsheet size={14}/> },
                            { id: 'scrape', label: 'Site Scraper', icon: <Globe size={14}/> }
                        ].map(m => (
                            <button
                                key={m.id}
                                onClick={() => setIngestionMethod(m.id as any)}
                                className={`flex-1 py-3.5 rounded-2xl flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest transition-all ${ingestionMethod === m.id ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-400 hover:bg-white hover:text-gray-600'}`}
                            >
                                {m.icon} {m.label}
                            </button>
                        ))}
                    </div>

                    <div className="p-10 space-y-8">
                        {ingestionMethod === 'manual' && (
                            <div className="max-w-2xl space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Knowledge Title</label>
                                        <input type="text" placeholder="e.g. Do you ship internationally?" value={formData.title} onChange={e => setFormData({ ...formData, title: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-3xl text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all" />
                                    </div>
                                    <div className="col-span-2">
                                        <div className="flex justify-between items-center mb-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block">Intelligence Payload</label>
                                            <button 
                                                onClick={tuneWithAI}
                                                disabled={isTuning || !formData.content}
                                                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${isTuning ? 'bg-purple-100 text-purple-400 cursor-not-allowed' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200 active:scale-95'}`}
                                            >
                                                {isTuning ? <RefreshCw size={10} className="animate-spin" /> : <Sparkles size={10} />}
                                                {isTuning ? 'Refining...' : 'Magic Tune'}
                                            </button>
                                        </div>
                                        <textarea placeholder="Explicit instructions for the AI..." value={formData.content} onChange={e => setFormData({ ...formData, content: e.target.value })} className="w-full p-5 bg-white border border-gray-200 rounded-[2rem] text-sm font-medium outline-none focus:ring-4 focus:ring-purple-100 transition-all min-h-[140px]"></textarea>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Type</label>
                                        <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-3xl text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 appearance-none">
                                            <option value="faq">FAQ</option>
                                            <option value="policy">Policy</option>
                                            <option value="general">General Info</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-1"><Calendar size={12}/> Expiry Date</label>
                                        <input type="date" value={formData.expiry_date} onChange={e => setFormData({ ...formData, expiry_date: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-3xl text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block flex items-center gap-1"><ImageIcon size={12}/> Media URL</label>
                                        <input type="text" placeholder="https://..." value={formData.media_url} onChange={e => setFormData({ ...formData, media_url: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-3xl text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block flex items-center gap-1"><Zap size={12}/> Action Trigger</label>
                                        <input type="text" placeholder="TAG_NAME" value={formData.action_tag} onChange={e => setFormData({ ...formData, action_tag: e.target.value.toUpperCase() })} className="w-full p-4 bg-indigo-50 border border-indigo-100 rounded-3xl text-sm font-black outline-none focus:ring-4 focus:ring-indigo-100" />
                                    </div>
                                </div>

                                <div className="p-8 bg-purple-50/50 rounded-[2.5rem] border border-purple-100/50">
                                    <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-4 block flex items-center gap-2">
                                        <LinkIcon size={14} /> Smart Pinning: Link to Specific Products or Categories
                                    </label>
                                    <SmartPinSelector categories={categories} products={products} selected={formData.pinned_items} onToggle={togglePin} />
                                </div>

                                <div className="flex gap-4">
                                    <button onClick={addDoc} className="flex-1 bg-gray-900 text-white py-4 rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-gray-200 transition-all hover:bg-black active:scale-95">Archive Intelligence</button>
                                    <button onClick={() => setAdding(false)} className="px-10 py-4 bg-white border border-gray-200 text-gray-400 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all">Discard</button>
                                </div>
                            </div>
                        )}

                        {ingestionMethod === 'bulk' && (
                            <div className="max-w-xl space-y-8 py-10">
                                <div className="text-center space-y-2">
                                    <div className="w-16 h-16 bg-purple-50 text-purple-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-purple-100 shadow-sm">
                                        <FileSpreadsheet size={32} />
                                    </div>
                                    <h4 className="text-xl font-black text-gray-900">Bulk CSV Ingestion</h4>
                                    <p className="text-sm text-gray-500 font-medium max-w-sm mx-auto">Upload a CSV file to add multiple knowledge nodes instantly. Headers required: title, content, type.</p>
                                </div>
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="border-2 border-dashed border-gray-200 rounded-[2.5rem] p-12 text-center hover:border-purple-300 hover:bg-purple-50/30 transition-all cursor-pointer group"
                                >
                                    <input type="file" ref={fileInputRef} onChange={handleCSVUpload} accept=".csv" className="hidden" />
                                    <Upload size={40} className="mx-auto text-gray-300 group-hover:text-purple-400 mb-4 transition-colors" />
                                    <p className="text-sm font-black text-gray-400 uppercase tracking-widest group-hover:text-purple-600 transition-colors">Click to upload CSV File</p>
                                </div>
                                <div className="flex justify-center">
                                    <button onClick={() => setAdding(false)} className="text-[10px] font-black text-gray-400 uppercase tracking-widest hover:text-rose-500 transition-colors">✕ Cancel Process</button>
                                </div>
                            </div>
                        )}

                        {ingestionMethod === 'scrape' && (
                            <div className="max-w-xl space-y-8 py-10">
                                <div className="text-center space-y-2">
                                    <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-indigo-100 shadow-sm">
                                        <Globe size={32} />
                                    </div>
                                    <h4 className="text-xl font-black text-gray-900">Intelligent Web Scraper</h4>
                                    <p className="text-sm text-gray-500 font-medium max-w-sm mx-auto">Enter a URL (e.g. your policy page). AI will visit the site, understand the content, and break it into fragments.</p>
                                </div>
                                <div className="relative">
                                    <Globe size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" />
                                    <input 
                                        type="text" 
                                        placeholder="https://yourwebsite.com/shipping-policy" 
                                        value={scrapeUrl} 
                                        onChange={e => setScrapeUrl(e.target.value)}
                                        className="w-full p-5 pl-14 bg-white border border-gray-200 rounded-3xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-100 transition-all"
                                    />
                                </div>
                                <div className="flex gap-4">
                                    <button 
                                        onClick={handleScrape}
                                        disabled={!scrapeUrl || loading}
                                        className="flex-1 bg-indigo-600 text-white py-4 rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-indigo-100 transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-50"
                                    >
                                        🚀 Begin Scrape
                                    </button>
                                    <button onClick={() => setAdding(false)} className="px-10 py-4 bg-white border border-gray-200 text-gray-400 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all">Cancel</button>
                                </div>
                            </div>
                        )}
                    </div>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {(() => {
                    const filtered = knowledge.filter(k => {
                        const isExpired = k.expiry_date && new Date(k.expiry_date) < new Date();
                        return showExpired || !isExpired;
                    });

                    if (filtered.length === 0) {
                        return (
                            <div className="col-span-2 p-20 text-center opacity-20">
                                <BookOpen size={48} className="mx-auto mb-3" />
                                <p className="font-bold tracking-tight">{knowledge.length === 0 ? 'Repository is empty.' : 'No active fragments found.'}</p>
                            </div>
                        );
                    }

                    return filtered.map((k, i) => {
                        const isNearExpiry = k.expiry_date && (new Date(k.expiry_date).getTime() - new Date().getTime()) < 86400000 * 3;
                        const isExpired = k.expiry_date && new Date(k.expiry_date) < new Date();

                        return (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`group relative bg-white border border-gray-100 rounded-[2.5rem] p-7 shadow-sm hover:shadow-2xl hover:shadow-purple-500/10 hover:-translate-y-1.5 transition-all duration-300 ${isExpired ? 'opacity-60 grayscale' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-5">
                                    <div className="flex gap-2 flex-wrap max-w-[80%]">
                                        <div className="px-3 py-1 bg-gray-50 text-[9px] font-black text-gray-400 rounded-full border border-gray-100 uppercase tracking-widest flex items-center gap-1.5">
                                            <BarChart3 size={10} className="text-purple-400" /> {k.usage_count || 0} Uses
                                        </div>
                                        <div className="px-3 py-1 bg-gray-50 text-[9px] font-black text-gray-400 rounded-full border border-gray-100 uppercase tracking-widest">
                                            {k.type}
                                        </div>
                                        {k.pinned_items && k.pinned_items.length > 0 && (
                                            <div className="px-3 py-1 bg-purple-600 text-[9px] font-black text-white rounded-full flex items-center gap-1.5 uppercase tracking-widest shadow-lg shadow-purple-500/20">
                                                <Pin size={10} /> {k.pinned_items.length} Pins
                                            </div>
                                        )}
                                        {k.media_url && (
                                            <div className="px-3 py-1 bg-indigo-50 text-[9px] font-black text-indigo-500 rounded-full flex items-center gap-1.5 uppercase tracking-widest border border-indigo-100">
                                                {k.media_type === 'video' ? <Film size={10} /> : <ImageIcon size={10} />} Media
                                            </div>
                                        )}
                                        {k.expiry_date && (
                                            <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-1.5 ${isExpired ? 'bg-rose-50 text-rose-500 border-rose-100' : isNearExpiry ? 'bg-amber-50 text-amber-500 border-amber-100' : 'bg-emerald-50 text-emerald-500 border-emerald-100'}`}>
                                                <Clock size={10} /> {isExpired ? 'Expired' : isNearExpiry ? 'Expiring Soon' : 'Active'}
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => deleteDoc(k.id)} className="opacity-0 group-hover:opacity-100 p-2 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all ml-2">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                
                                <div className="space-y-4">
                                    {k.media_url && k.media_type === 'image' && (
                                        <div className="w-full h-32 rounded-3xl overflow-hidden mb-4 border border-gray-100 shadow-inner group-hover:scale-[1.02] transition-transform">
                                            <img src={k.media_url} className="w-full h-full object-cover" onError={(e: any) => e.target.style.display='none'} />
                                        </div>
                                    )}
                                    <h3 className="text-xl font-black text-gray-900 leading-tight group-hover:text-purple-600 transition-colors line-clamp-2">{k.title}</h3>
                                    <p className="text-sm text-gray-500 font-medium line-clamp-3 leading-relaxed opacity-80">{k.content}</p>
                                    
                                    <div className="pt-4 mt-4 border-t border-gray-50 flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{k.action_tag ? `Auto-Action: ${k.action_tag}` : 'Standard Logic'}</span>
                                            <span className="text-[10px] font-bold text-gray-500">{k.last_used_at ? 'Last seen ' + new Date(k.last_used_at).toLocaleDateString() : 'New Intel'}</span>
                                        </div>
                                        <button onClick={() => { setFormData(k); setAdding(true); }} className="w-10 h-10 bg-gray-50 text-gray-400 rounded-2xl flex items-center justify-center hover:bg-purple-600 hover:text-white transition-all shadow-sm">
                                            <Edit2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    });
                })()}
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
    type: 'products' | 'profile' | 'knowledge' | 'scraper' | null;
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
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Performance Chart */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
                    <h3 className="text-lg font-black text-gray-900 mb-8 flex items-center gap-2">
                        <TrendingUp size={20} className="text-purple-600" /> 7-Day Performance Trend
                    </h3>
                    <div className="flex items-end justify-between flex-1 h-48 gap-3">
                        {stats.daily_trends.map((d: any, i: number) => {
                            const totalHeight = Math.max(10, (d.total / (stats.total_replies || 1)) * 400); 
                            return (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
                                    <div className="relative w-full flex flex-col justify-end h-32">
                                        <div className="absolute -top-6 text-[10px] font-black text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">{d.total} replies</div>
                                        <div className="w-full bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-all" style={{ height: `${totalHeight}%` }}></div>
                                        <div className="absolute bottom-0 w-full bg-rose-500 rounded-lg opacity-40" style={{ height: `${(d.handovers / (d.total || 1)) * totalHeight}%` }}></div>
                                    </div>
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-tighter">{d.day.split('-').slice(1).join('/')}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Most Helpful Knowledge */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col">
                    <h3 className="text-lg font-black text-gray-900 mb-8 flex items-center gap-2">
                        <Zap size={20} className="text-indigo-600" /> Most Helpful Knowledge
                    </h3>
                    <div className="space-y-4 flex-1">
                        {!stats.top_knowledge || stats.top_knowledge.length === 0 ? (
                            <div className="h-full flex items-center justify-center text-gray-300 text-xs font-bold italic uppercase tracking-widest">No intelligence uses recorded yet</div>
                        ) : stats.top_knowledge.map((k: any, i: number) => (
                            <div key={i} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 hover:border-indigo-200 transition-all group">
                                <div className="flex items-center gap-4">
                                    <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center text-xs font-black text-indigo-600 shadow-sm border border-gray-100 group-hover:scale-110 transition-transform">#{i+1}</div>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-black text-gray-900 line-clamp-1">{k.title}</span>
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{k.type}</span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-black text-indigo-600">{k.usage_count}</div>
                                    <div className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Uses</div>
                                </div>
                            </div>
                        ))}
                    </div>
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
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${log.is_handover ? 'bg-rose-50 text-rose-600 border border-rose-100' : 'bg-purple-50 text-purple-600 border border-purple-100'}`}>
                                            {log.is_handover ? 'Handover' : 'Solved'}
                                        </span>
                                        {log.intel && (
                                            <span className="px-2 py-1 bg-indigo-50 text-indigo-600 text-[8px] font-black rounded border border-indigo-100 flex items-center gap-1">
                                                <Brain size={8} /> INTEL
                                            </span>
                                        )}
                                    </div>
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

                    {log.intel && (() => {
                        let intel: any = {};
                        try { intel = typeof log.intel === 'string' ? JSON.parse(log.intel) : log.intel; } catch (e) {}
                        return (
                            <div className="p-8 bg-indigo-50/50 rounded-[2.5rem] border border-indigo-100/50 space-y-6">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                                        <Brain size={20} />
                                    </div>
                                    <div>
                                        <h5 className="text-sm font-black text-indigo-900 uppercase tracking-tight">AI Intelligence Extraction</h5>
                                        <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">Automated Profile Synchronization</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    {intel.sentiment && (
                                        <div className="bg-white p-4 rounded-2xl border border-indigo-50 shadow-sm">
                                            <div className="text-[8px] font-black text-indigo-300 uppercase tracking-widest mb-1">Sentiment</div>
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-emerald-500" style={{ width: `${intel.sentiment}%` }} />
                                                </div>
                                                <span className="text-xs font-black text-indigo-600">{intel.sentiment}%</span>
                                            </div>
                                        </div>
                                    )}
                                    {intel.lifecycle_stage && (
                                        <div className="bg-white p-4 rounded-2xl border border-indigo-50 shadow-sm">
                                            <div className="text-[8px] font-black text-indigo-300 uppercase tracking-widest mb-1">Lifecycle Stage</div>
                                            <div className="text-xs font-black text-indigo-900 uppercase">{intel.lifecycle_stage}</div>
                                        </div>
                                    )}
                                </div>

                                {intel.tags && intel.tags.length > 0 && (
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Detected Tags</label>
                                        <div className="flex flex-wrap gap-2">
                                            {intel.tags.map((t: string, ti: number) => (
                                                <span key={ti} className="px-3 py-1 bg-white text-indigo-600 text-[10px] font-black rounded-lg border border-indigo-100 shadow-sm uppercase tracking-tighter">
                                                    #{t}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {intel.extract && Object.keys(intel.extract).filter(k => intel.extract[k]).length > 0 && (
                                    <div className="space-y-2">
                                        <label className="text-[9px] font-black text-indigo-300 uppercase tracking-widest">Extracted Profile Data</label>
                                        <div className="grid grid-cols-1 gap-2">
                                            {Object.entries(intel.extract).filter(([_, v]) => v).map(([k, v]: any, vi: number) => (
                                                <div key={vi} className="flex items-center justify-between p-3 bg-white/60 rounded-xl border border-indigo-50">
                                                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{k}</span>
                                                    <span className="text-xs font-bold text-indigo-900">{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>
            </motion.div>
        </div>
    );
}
// ============================================================
// 🧪 AI PLAYGROUND (SIMULATOR)
// ============================================================
function SimulatorTab({ results, setResults, isSimulating, setIsSimulating }: any) {
    const [query, setQuery] = useState('');
    const [testerNumber, setTesterNumber] = useState('');

    const runSimulation = async () => {
        if (!query) return;
        setIsSimulating(true);
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/simulate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: query, number: testerNumber })
            });
            const data = await res.json();
            setResults(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsSimulating(false);
        }
    };

    return (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left: Input Panel */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-sm border-b-4 border-b-purple-500/20">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                                <Activity size={24} />
                            </div>
                            <div>
                                <h3 className="text-xl font-black text-gray-900 tracking-tight">Intelligence Tester</h3>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Debug RAG Engine Performance</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Impersonate Customer (Number)</label>
                                <input 
                                    type="text" 
                                    placeholder="88017..." 
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200 transition-all"
                                    value={testerNumber}
                                    onChange={e => setTesterNumber(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block">Test Query</label>
                                <textarea 
                                    placeholder="e.g. Do you have this item in red?" 
                                    rows={4}
                                    className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200 transition-all resize-none"
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                />
                            </div>
                            <button 
                                onClick={runSimulation}
                                disabled={isSimulating}
                                className="w-full py-4 bg-purple-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-purple-200 hover:shadow-purple-300 transition-all flex items-center justify-center gap-2 group"
                            >
                                {isSimulating ? <RefreshCw className="animate-spin" size={18}/> : <Zap size={18} className="group-hover:scale-110 transition-transform" />}
                                {isSimulating ? 'Processing...' : 'Execute Trace'}
                            </button>
                        </div>
                    </div>

                    <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 flex items-start gap-4">
                        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 shadow-sm flex-shrink-0">
                            <Target size={20} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-emerald-800 leading-relaxed">
                                This tool bypasses WhatsApp and simulates how the AI would respond using the current **Hierarchy of Truth**. 
                            </p>
                        </div>
                    </div>
                </div>

                {/* Right: Results Panel */}
                <div className="lg:col-span-7">
                    {results ? (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="bg-gray-900 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden relative">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/10 blur-[100px] pointer-events-none" />
                                
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="text-[10px] font-black text-purple-400 uppercase tracking-widest">AI Agent Response</h4>
                                    <div className="flex gap-2 flex-wrap">
                                        {results.detected_intent && <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 text-[8px] font-black rounded uppercase tracking-tighter">Intent: {results.detected_intent}</span>}
                                        {results.action && <span className="px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-[8px] font-black rounded uppercase tracking-tighter">Action: {results.action}</span>}
                                        {results.handover && <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 text-[8px] font-black rounded uppercase tracking-tighter">Handover Triggered</span>}
                                    </div>
                                </div>

                                <div className="text-gray-100 font-medium leading-relaxed font-mono text-sm mb-8">
                                    {results.response}
                                </div>

                                <div className="space-y-4 pt-6 border-t border-white/5">
                                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Knowledge Context Injected</h4>
                                    <div className="bg-black/30 p-4 rounded-xl max-h-64 overflow-y-auto custom-scrollbar">
                                        <pre className="text-[11px] text-gray-400 font-mono whitespace-pre-wrap">{results.context}</pre>
                                    </div>
                                </div>

                                <div className="mt-6 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    <span className="text-[9px] font-black text-gray-500 uppercase tracking-widest">Generated via Gemini 2.5 Flash Lite</span>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full min-h-[400px] bg-gray-50 border-2 border-dashed border-gray-200 rounded-[2.5rem] flex flex-col items-center justify-center text-gray-400 select-none">
                            <Cpu size={48} className="mb-4 opacity-20" />
                            <p className="font-black text-sm tracking-tight opacity-40">Ready for Simulation</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
}

// ============================================================
// 📁 ORDER INTELLIGENCE TAB
// ============================================================
function OrdersTab() {
    const [orders, setOrders] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [formData, setFormData] = useState({
        customer_number: '',
        status: 'pending',
        total_amount: '',
        tracking_id: '',
        scheduled_delivery: ''
    });

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/orders');
            const data = await res.json();
            setOrders(data);
        } catch (e) { console.error(e); }
        setLoading(false);
    };

    const addOrder = async () => {
        if (!formData.customer_number || !formData.total_amount) return;
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                setAdding(false);
                fetchOrders();
                setFormData({ customer_number: '', status: 'pending', total_amount: '', tracking_id: '', scheduled_delivery: '' });
            }
        } catch (e) { console.error(e); }
    };

    useEffect(() => { fetchOrders(); }, []);

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pt-4">
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Order Intelligence</h2>
                    <p className="text-xs text-gray-500 font-medium tracking-wide">Customer transaction mapping for AI personalization</p>
                </div>
                <button onClick={() => setAdding(!adding)} className="bg-gray-900 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)] hover:shadow-gray-200 active:scale-95">
                    <Plus size={18} className="inline mr-2" /> New Simulation Order
                </button>
            </div>

            {adding && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="bg-gray-50/50 p-10 rounded-[3rem] border border-gray-100 mb-10 overflow-hidden shadow-inner">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Customer WhatsApp Number</label>
                            <input type="text" placeholder="e.g. 88017..." value={formData.customer_number} onChange={e => setFormData({ ...formData, customer_number: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-purple-100 transition-all placeholder:text-gray-300" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Order Status</label>
                            <select value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold shadow-sm outline-none appearance-none cursor-pointer">
                                <option value="pending">⏳ Pending Processing</option>
                                <option value="processed">📦 Processed / Packed</option>
                                <option value="shipped">🚚 Shipped / In Transit</option>
                                <option value="delivered">✅ Delivered Successfully</option>
                                <option value="cancelled">❌ Cancelled</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Total Amount (BDT)</label>
                            <input type="text" placeholder="e.g. ৳ 2,500" value={formData.total_amount} onChange={e => setFormData({ ...formData, total_amount: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-purple-100 transition-all" />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Tracking ID (Optional)</label>
                            <input type="text" placeholder="TRK12345678" value={formData.tracking_id} onChange={e => setFormData({ ...formData, tracking_id: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-purple-100 transition-all" />
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 block">Est. Delivery Date</label>
                            <input type="date" value={formData.scheduled_delivery} onChange={e => setFormData({ ...formData, scheduled_delivery: e.target.value })} className="w-full p-4 bg-white border border-gray-200 rounded-2xl text-sm font-bold shadow-sm outline-none focus:ring-4 focus:ring-purple-100 transition-all" />
                        </div>
                    </div>
                    <div className="flex gap-4 mt-10">
                        <button onClick={addOrder} className="flex-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white py-4.5 rounded-3xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-purple-200 hover:shadow-purple-300 transition-all active:scale-[0.98]">Live Inject Order</button>
                        <button onClick={() => setAdding(false)} className="px-12 py-4.5 bg-white border border-gray-200 text-gray-400 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-gray-100 hover:text-gray-600 transition-all">Discard</button>
                    </div>
                </motion.div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {orders.map(order => (
                    <div key={order.id} className="group bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm relative overflow-hidden transition-all duration-500 hover:border-purple-200 hover:shadow-2xl hover:shadow-purple-500/5 hover:-translate-y-1">
                        <div className="flex justify-between items-start mb-6">
                            <div className="w-14 h-14 bg-gray-50 rounded-[1.5rem] flex items-center justify-center text-gray-400 group-hover:bg-purple-600 group-hover:text-white transition-all duration-500 rotate-3 group-hover:rotate-0">
                                <ShoppingCart size={24} />
                            </div>
                            <span className={`px-5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                                order.status === 'delivered' ? 'bg-green-50 text-green-600' :
                                order.status === 'shipped' ? 'bg-blue-50 text-blue-600' : 'bg-orange-50 text-orange-600'
                            }`}>
                                {order.status}
                            </span>
                        </div>
                        <h4 className="text-lg font-black text-gray-900 mb-1 tracking-tight">+{order.customer_number}</h4>
                        <div className="flex items-center gap-2 mb-6">
                            <div className={`w-2 h-2 rounded-full ${order.status === 'delivered' ? 'bg-green-400' : 'bg-orange-400'} animate-pulse`} />
                            <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">Global Order: {order.total_amount}</p>
                        </div>
                        <div className="space-y-3 p-5 bg-gray-50/50 rounded-[2rem] border border-gray-100 group-hover:bg-white group-hover:shadow-inner transition-colors">
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">Tracking</span>
                                <span className="text-gray-900 font-black tracking-widest">{order.tracking_id || 'PENDING'}</span>
                            </div>
                            <div className="flex justify-between items-center text-[10px]">
                                <span className="text-gray-400 font-bold uppercase tracking-widest">Arrival</span>
                                <span className="text-gray-900 font-black tracking-widest">{order.scheduled_delivery ? new Date(order.scheduled_delivery).toLocaleDateString() : 'TBD'}</span>
                            </div>
                        </div>
                        <div className="mt-6 flex items-center justify-between">
                            <p className="text-[9px] text-gray-300 font-bold uppercase tracking-tighter">Registered: {new Date(order.created_at).toLocaleDateString()}</p>
                            <div className="w-2 h-2 rounded-full bg-purple-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                    </div>
                ))}
            </div>

            {orders.length === 0 && !loading && (
                <div className="text-center py-32 bg-gray-50/50 rounded-[4rem] border-2 border-dashed border-gray-200">
                    <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-sm">
                        <PackageSearch size={40} className="text-gray-200" />
                    </div>
                    <p className="text-sm font-black text-gray-900 uppercase tracking-[0.2em]">Intelligence Vacuum</p>
                    <p className="text-xs text-gray-400 mt-2 font-medium">Create simulation orders to verify AI contextual awareness.</p>
                </div>
            )}
        </motion.div>
    );
}

// ============================================================
// 🤖 AI BEHAVIOR CONFIG TAB — Enterprise Settings
// ============================================================
const AI_DEFAULTS = {
    ai_persona: `You are a world-class senior sales representative for our business. You are professional, empathetic, knowledgeable, and focused on delivering a premium customer experience.`,
    ai_tone_guide: `- Sound like a real, warm human — never robotic or template-like.
- Automatically detect and match the customer's language (Bangla, English, or mixed).
- Use emojis naturally and sparingly.
- Be concise. Don't repeat information unnecessarily.
- Never use time-stamps or filler words like "today" / "আজ" unless the customer used them first.
- Greeting: Use warm, culturally appropriate greetings. For general Bengali greetings, prefer "আসসালামু আলাইকুম" or "হ্যালো". Do NOT use "নমস্কার" as a default unless the customer uses it first.
- Avoid robotic phrases like "আমি কিভাবে আপনাকে সাহায্য করতে পারি আজ?" (uses 'আজ' unnecessarily). Instead, use natural phrases like "কিভাবে সাহায্য করতে পারি বলুন? 😊" or "বলুন, কিভাবে সাহায্য করতে পারি?"
- Handling Out-of-Stock / Unavailable Items: When a product is not in the catalog or is out of stock, do NOT use robotic database jargon like "আমাদের ক্যাটালগে তালিকাভুক্ত নেই", "তালিকাভুক্ত নেই", or "সিস্টেমে নেই". Instead, say: "দুঃখিত, এই মুহূর্তে আমাদের কাছে [আইটেমের নাম] নেই।" or "দুঃখিত, আজকে আমাদের কালেকশনে [আইটেমের নাম] নেই।" Then naturally suggest other available products.`,
    ai_funnel_rules: `STAGE 1 — BROWSING (Customer is exploring):
- Customer asks about price, size, color, availability, or product details.
- Action: Provide ONLY the requested info. Close with a friendly open-ended question to keep dialogue flowing.
- FORBIDDEN: Do NOT ask for Name, Address, or Phone Number at this stage.

STAGE 2 — BUYING INTENT (Customer explicitly wants to order):
- Triggered by: "অর্ডার করবো", "how to order", "I want this", or confirming a size/color to buy.
- Action: Summarize chosen items. State shipping charges. Ask for: Full Name, Complete Delivery Address, Phone Number.

STAGE 3 — FINAL CONFIRMATION (All details collected):
- Present a clean order review. Ask for explicit final confirmation.
- ONLY append [ACTION: PLACE_ORDER] when customer says "Yes", "Confirm", or equivalent affirmation.`,
    ai_stage3_template: `Please review your order before I confirm:\n📦 Items: [LIST_ITEMS]\n💰 Total: [TOTAL_AMOUNT] (shipping included)\n📍 Address: [DELIVERY_ADDRESS]\n📞 Phone: [PHONE]\n\nShall I go ahead and confirm this order?`,
    ai_tagging_rules: `1. Assign #HighValue if strong purchase intent is detected.\n2. Assign #PriceSensitive if they negotiate or ask for discounts.\n3. Assign #Returning if they mention or reference a previous order.`
};

const INTENT_LIST = [
    { code: 'GREETING_SOCIAL', name: 'কুশলাদি ও স্বাগত', desc: 'সাধারণ শুভেচ্ছা ও প্রারম্ভিক বার্তা', tokens: 150 },
    { code: 'PRICE_AVAILABILITY', name: 'দাম ও স্টক অনুসন্ধান', desc: 'মূল্য ও সহজ স্টক চেক', tokens: 450 },
    { code: 'PRODUCT_DETAILS_DEEP', name: 'পণ্যের উপাদান ও অরিজিন', desc: 'মেটেরিয়াল, সুবিধা ও ব্যবহারবিধি', tokens: 600 },
    { code: 'PRODUCT_RECOMMENDATION', name: 'পণ্য পরামর্শ ও পছন্দ', desc: 'বয়স/ব্যবহারভিত্তিক চয়েস', tokens: 550 },
    { code: 'COMPARISON_CROSS_SELL', name: 'পণ্য তুলনা', desc: 'পার্থক্য ও সুবিধা সাইড-বাই-সাইড', tokens: 600 },
    { code: 'DISCOUNT_BARGAIN_PROMO', name: 'ডিসকাউন্ট ও কুপন', desc: 'ছাড় ও অফারের আলোচনা', tokens: 350 },
    { code: 'DELIVERY_LOGISTICS', name: 'ডেলিভারি চার্জ ও সময়', desc: 'কুরিয়ার ও পাঠানোর খরচ', tokens: 350 },
    { code: 'LOCATION_COVERAGE', name: 'এলাকাভিত্তিক কভারেজ', desc: 'জেলা/থানায় হোম ডেলিভারি', tokens: 300 },
    { code: 'ORDER_CONFIRMATION_BUYING', name: 'অর্ডার প্লেসমেন্ট', desc: 'ক্রয় ইচ্ছা ও ঠিকানা জমা', tokens: 500 },
    { code: 'ORDER_STATUS_TRACKING', name: 'অর্ডার ট্র্যাকিং', desc: 'পার্সেল ট্র্যাকিং স্ট্যাটাস', tokens: 300 },
    { code: 'ORDER_MODIFICATION_CANCEL', name: 'অর্ডার সংশোধন/বাতিল', desc: 'ঠিকানা চেঞ্জ বা ক্যানসেল', tokens: 350 },
    { code: 'PAYMENT_METHODS_DETAILS', name: 'পেমেন্ট মেথড ও বিকাশ', desc: 'বিকাশ/ব্যাংক/COD তথ্য', tokens: 250 },
    { code: 'PAYMENT_PROOF_VERIFICATION', name: 'পেমেন্ট ভেরিফিকেশন', desc: 'ট্রানজেকশন আইডি যাচাই', tokens: 300 },
    { code: 'POLICIES_RETURNS_EXCHANGE', name: 'রিটার্ন ও এক্সচেঞ্জ', desc: 'ফেরত ও ওয়ারেন্টি নীতি', tokens: 400 },
    { code: 'COMPLAINT_HUMAN_HANDOVER', name: 'অভিযোগ ও হিউম্যান কল', desc: 'সরাসরি প্রতিনিধি হ্যান্ডওভার', tokens: 150 },
    { code: 'STORE_LOCATION_INFO', name: 'দোকান/শোরুমের ঠিকানা', desc: 'শোরুম ও ওপেনিং সময়', tokens: 300 },
    { code: 'TRUST_AUTHENTICITY_REVIEWS', name: 'অরিজিনালিটি ও রিভিউ', desc: 'খাঁটি নিশ্চয়তা ও প্রমাণ', tokens: 300 },
    { code: 'OUT_OF_SCOPE', name: 'অপ্রাসঙ্গিক বিষয়', desc: 'সীমানার বাইরের বার্তা', tokens: 150 },
];

function AIConfigTab() {
    const [aiCustomInstructions, setAiCustomInstructions] = useState('');
    const [aiPersona, setAiPersona]               = useState('');
    const [aiToneGuide, setAiToneGuide]           = useState('');
    const [aiFunnelRules, setAiFunnelRules]       = useState('');
    const [aiStage3Template, setAiStage3Template] = useState('');
    const [aiTaggingRules, setAiTaggingRules]     = useState('');
    const [cacheTtlHours, setCacheTtlHours]       = useState('12');
    const [semanticThreshold, setSemanticThreshold] = useState('0.92');
    
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isLoading, setIsLoading]       = useState(true);
    const [isSaving,  setIsSaving]        = useState(false);
    const [saved,     setSaved]           = useState(false);

    useEffect(() => {
        const load = async () => {
            try {
                const res  = await fetch('http://localhost:3001/api/settings');
                const data = await res.json();
                if (data.success && data.settings) {
                    const s = data.settings;
                    setAiCustomInstructions(s.ai_custom_instructions || '');
                    setAiPersona(s.ai_persona || AI_DEFAULTS.ai_persona);
                    setAiToneGuide(s.ai_tone_guide || AI_DEFAULTS.ai_tone_guide);
                    setAiFunnelRules(s.ai_funnel_rules || AI_DEFAULTS.ai_funnel_rules);
                    setAiStage3Template(s.ai_stage3_template || AI_DEFAULTS.ai_stage3_template);
                    setAiTaggingRules(s.ai_tagging_rules || AI_DEFAULTS.ai_tagging_rules);
                    setCacheTtlHours(s.ai_cache_ttl_hours || '12');
                    setSemanticThreshold(s.ai_semantic_threshold || '0.92');
                } else {
                    setAiCustomInstructions('');
                    setAiPersona(AI_DEFAULTS.ai_persona);
                    setAiToneGuide(AI_DEFAULTS.ai_tone_guide);
                    setAiFunnelRules(AI_DEFAULTS.ai_funnel_rules);
                    setAiStage3Template(AI_DEFAULTS.ai_stage3_template);
                    setAiTaggingRules(AI_DEFAULTS.ai_tagging_rules);
                }
            } catch (e) { 
                console.error(e); 
                setAiCustomInstructions('');
                setAiPersona(AI_DEFAULTS.ai_persona);
                setAiToneGuide(AI_DEFAULTS.ai_tone_guide);
                setAiFunnelRules(AI_DEFAULTS.ai_funnel_rules);
                setAiStage3Template(AI_DEFAULTS.ai_stage3_template);
                setAiTaggingRules(AI_DEFAULTS.ai_tagging_rules);
            }
            finally { setIsLoading(false); }
        };
        load();
    }, []);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await fetch('http://localhost:3001/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    settings: {
                        ai_custom_instructions: aiCustomInstructions,
                        ai_persona:             aiPersona,
                        ai_tone_guide:          aiToneGuide,
                        ai_funnel_rules:        aiFunnelRules,
                        ai_stage3_template:     aiStage3Template,
                        ai_tagging_rules:       aiTaggingRules,
                        ai_cache_ttl_hours:     cacheTtlHours,
                        ai_semantic_threshold:   semanticThreshold,
                    }
                })
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) { console.error(e); }
        finally { setIsSaving(false); }
    };

    if (isLoading) {
        return (
            <div className="h-full flex flex-col items-center justify-center space-y-4 py-32">
                <Loader2 className="animate-spin text-purple-600" size={48} />
                <p className="text-gray-500 font-medium animate-pulse">Loading AI Settings...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 max-w-4xl mx-auto pb-12">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                        <SlidersHorizontal className="text-purple-500" />
                        AI Behavior Configuration
                    </h2>
                    <p className="text-sm text-gray-400 font-medium mt-1">
                        Configure how your AI thinks, speaks, and handles the sales funnel.
                        These rules are injected into every AI response.
                    </p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                    onClick={handleSave} disabled={isSaving}
                    className="bg-purple-600 text-white px-8 py-3.5 rounded-2xl font-black
                               shadow-xl shadow-purple-500/20 flex items-center gap-2
                               disabled:opacity-50 transition-all hover:bg-purple-700"
                >
                    {isSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                    {isSaving ? 'Saving...' : 'Save Config'}
                </motion.button>
            </div>

            <AnimatePresence>
                {saved && (
                    <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="bg-emerald-500 text-white p-4 rounded-2xl flex items-center gap-3 shadow-lg">
                        <CheckCircle2 size={20} />
                        <span className="font-bold text-sm">AI Configuration saved — active on next reply.</span>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Custom Business Instructions Card (Main User Facing Section) */}
            <div className="p-8 bg-gradient-to-br from-purple-50 to-indigo-50/30 border border-purple-100 rounded-[2.5rem] shadow-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-6 text-purple-200/50 opacity-20 pointer-events-none">
                    <Wand2 size={120} />
                </div>
                <div className="flex items-center gap-4 mb-4">
                    <div className="p-3 bg-white rounded-2xl shadow-sm text-purple-600">
                        <Wand2 size={24} className="animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-gray-900">Custom AI Guidelines (কাস্টম নির্দেশনা)</h3>
                        <p className="text-xs text-gray-400 font-medium mt-0.5">
                            সাধারণ ভাষায় আপনার ব্যবসার জন্য অতিরিক্ত বা বিশেষ নিয়ম লিখে দিন। AI এটি সবসময় মেনে চলবে।
                        </p>
                    </div>
                </div>
                <textarea
                    value={aiCustomInstructions}
                    onChange={e => setAiCustomInstructions(e.target.value)}
                    rows={6}
                    placeholder="যেমনঃ 
১. কাস্টমারদের সবসময় 'আপনি' বলে কথা বলবেন এবং অত্যন্ত বিনীত থাকবেন।
২. আমাদের কোনো ফিক্সড ডিসকাউন্ট বা ক্যাশ অন ডেলিভারি অফার নেই।
৩. অর্ডার কনফার্ম করার আগে ৫১০ টাকা বিকাশ বা রকেট নাম্বারে পেমেন্ট করতে বলুন।"
                    className="w-full p-5 bg-white border border-gray-100 rounded-3xl text-sm font-medium
                               text-gray-700 shadow-inner outline-none focus:ring-2 focus:ring-purple-200
                               focus:border-purple-200 resize-none transition-all leading-relaxed placeholder:text-gray-300"
                />
            </div>

            {/* 18-Intent Modular Router Dashboard Card */}
            <div className="p-8 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm relative overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                            <Compass size={24} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black text-gray-900">18-Intent Modular Router & Token Engine</h3>
                            <p className="text-xs text-gray-400 font-medium">কাস্টমার বার্তার ধরন চিনে নিয়ে স্বয়ংক্রিয়ভাবে প্রম্পট ফিল্টার করে এবং টোকেন খরচ ৮০% পর্যন্ত কমায়।</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 text-xs font-black rounded-full uppercase tracking-wider flex items-center gap-1.5">
                            <Zap size={14} className="animate-bounce" /> 18 Intents Active
                        </span>
                        <span className="px-3 py-1.5 bg-purple-50 text-purple-600 border border-purple-100 text-xs font-black rounded-full uppercase tracking-wider">
                            ~75% Token Savings
                        </span>
                    </div>
                </div>

                {/* Intent Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {INTENT_LIST.map((item, idx) => (
                        <div key={idx} className="p-3.5 bg-gray-50/70 hover:bg-purple-50/30 border border-gray-100 hover:border-purple-100 rounded-2xl transition-all flex items-start justify-between group">
                            <div>
                                <span className="text-[9px] font-black uppercase tracking-wider text-purple-600 block group-hover:text-purple-700">{item.code}</span>
                                <span className="text-xs font-bold text-gray-800 block mt-0.5">{item.name}</span>
                                <span className="text-[10px] text-gray-400 font-medium">{item.desc}</span>
                            </div>
                            <span className="text-[9px] font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-100 flex-shrink-0">
                                ~{item.tokens}t
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Advanced Toggle Button */}
            <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between p-6 bg-white border border-gray-100 rounded-[2rem]
                           hover:border-purple-100 hover:shadow-md transition-all font-black text-sm text-gray-700 cursor-pointer active:scale-98"
            >
                <div className="flex items-center gap-3">
                    <SlidersHorizontal size={18} className="text-purple-500 animate-spin-slow" />
                    <span>Advanced Behavior Configuration (উন্নত কনফিগারেশন)</span>
                </div>
                {showAdvanced ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
            </button>

            {showAdvanced && (
                <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                >
                    <ConfigSection
                        icon={<Brain className="text-purple-500" size={20} />}
                        title="AI Persona"
                        subtitle="Who is your AI? Define its identity and role."
                        hint='e.g. "You are a world-class senior sales representative..."'
                        value={aiPersona}
                        onChange={setAiPersona}
                        onRestoreDefault={() => setAiPersona(AI_DEFAULTS.ai_persona)}
                        rows={4}
                        tag="ai_persona"
                    />

                    <ConfigSection
                        icon={<MessageSquare className="text-indigo-500" size={20} />}
                        title="Tone & Language Guide"
                        subtitle="How should the AI communicate? Natural rules for language and style."
                        hint="e.g. Match customer language. Never say 'আজ'. Be concise and warm."
                        value={aiToneGuide}
                        onChange={setAiToneGuide}
                        onRestoreDefault={() => setAiToneGuide(AI_DEFAULTS.ai_tone_guide)}
                        rows={5}
                        tag="ai_tone_guide"
                    />

                    <ConfigSection
                        icon={<Target className="text-rose-500" size={20} />}
                        title="Sales Funnel Rules (Stage 1 → 2 → 3)"
                        subtitle="Define when and how to move customers through the buying journey."
                        hint="STAGE 1 — Browsing: Only provide info. STAGE 2 — Intent: Collect details. STAGE 3 — Confirm order."
                        value={aiFunnelRules}
                        onChange={setAiFunnelRules}
                        onRestoreDefault={() => setAiFunnelRules(AI_DEFAULTS.ai_funnel_rules)}
                        rows={8}
                        tag="ai_funnel_rules"
                    />

                    <ConfigSection
                        icon={<ShoppingCart className="text-emerald-500" size={20} />}
                        title="Order Confirmation Template (Stage 3)"
                        subtitle="The message structure shown to the customer before placing an order."
                        hint="Use placeholders: [LIST_ITEMS], [TOTAL_AMOUNT], [DELIVERY_ADDRESS], [PHONE]"
                        value={aiStage3Template}
                        onChange={setAiStage3Template}
                        onRestoreDefault={() => setAiStage3Template(AI_DEFAULTS.ai_stage3_template)}
                        rows={6}
                        tag="ai_stage3_template"
                    />

                    <ConfigSection
                        icon={<Tag className="text-amber-500" size={20} />}
                        title="CRM Tagging Rules"
                        subtitle="Rules for auto-tagging customers based on behavior."
                        hint="e.g. 1. Assign #HighValue if strong purchase intent. 2. Assign #PriceSensitive if they ask for discounts."
                        value={aiTaggingRules}
                        onChange={setAiTaggingRules}
                        onRestoreDefault={() => setAiTaggingRules(AI_DEFAULTS.ai_tagging_rules)}
                        rows={4}
                        tag="ai_tagging_rules"
                    />

                    <div className="p-6 bg-gray-50 rounded-[2rem] border border-gray-100 space-y-6">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="p-2 bg-gray-200 rounded-xl">
                                <Cpu size={18} className="text-gray-600" />
                            </div>
                            <div>
                                <h3 className="font-black text-gray-800">Advanced Vector & Cache Tuning</h3>
                                <p className="text-xs text-gray-400 font-medium">
                                    Fine-tune cache and semantic matching behavior.
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                                    Cache TTL (Hours)
                                </label>
                                <input
                                    type="number" min="1" max="168"
                                    value={cacheTtlHours}
                                    onChange={e => setCacheTtlHours(e.target.value)}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-2xl
                                               text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200"
                                />
                                <p className="text-[10px] text-gray-400 mt-1.5">How long to cache AI responses (default: 12h)</p>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">
                                    Semantic Cache Threshold (0.5 – 1.0)
                                </label>
                                <input
                                    type="number" min="0.5" max="1.0" step="0.01"
                                    value={semanticThreshold}
                                    onChange={e => setSemanticThreshold(e.target.value)}
                                    className="w-full p-3 bg-white border border-gray-200 rounded-2xl
                                               text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200"
                                />
                                <p className="text-[10px] text-gray-400 mt-1.5">Similarity score for cache hit (default: 0.92)</p>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}

function AICacheStudioTab() {
    const [cacheClusters, setCacheClusters] = useState<any[]>([]);
    const [cacheAnalytics, setCacheAnalytics] = useState<any>({
        total_cached_entries: 0,
        total_hits: 0,
        golden_templates_count: 0,
        estimated_tokens_saved: 0,
        estimated_cost_saved: 0
    });
    const [loading, setLoading] = useState(false);
    const [cacheSearch, setCacheSearch] = useState('');
    const [editingCacheItem, setEditingCacheItem] = useState<any>(null);
    const [editResponseText, setEditResponseText] = useState('');
    const [editIsGolden, setEditIsGolden] = useState(false);
    const [reassignTargetIntent, setReassignTargetIntent] = useState('');

    const [showAddQueryModal, setShowAddQueryModal] = useState(false);
    const [addQueryIntentKey, setAddQueryIntentKey] = useState('');
    const [addQueryText, setAddQueryText] = useState('');
    const [addQueryResponseText, setAddQueryResponseText] = useState('');
    const [addQueryIsGolden, setAddQueryIsGolden] = useState(false);

    // ── Next-Gen Studio State ─────────────────────────────────────────────
    const [testQueryText, setTestQueryText] = useState('');
    const [testResult, setTestResult] = useState<any>(null);
    const [isTesting, setIsTesting] = useState(false);

    const [similarityThreshold, setSimilarityThreshold] = useState<number>(0.95);
    const [ttlMode, setTtlMode] = useState<string>('PERMANENT');

    const [showSynonymModal, setShowSynonymModal] = useState(false);
    const [synonymTargetIntent, setSynonymTargetIntent] = useState('');
    const [synonymSampleQuery, setSynonymSampleQuery] = useState('');
    const [generatedSynonyms, setGeneratedSynonyms] = useState<string[]>([]);
    const [selectedSynonyms, setSelectedSynonyms] = useState<Record<string, boolean>>({});
    const [isGeneratingSynonyms, setIsGeneratingSynonyms] = useState(false);

    const [uncachedQueries, setUncachedQueries] = useState<any[]>([]);

    const fetchCacheStudioData = useCallback(async () => {
        setLoading(true);
        try {
            const [r1, r2, r3, r4] = await Promise.all([
                fetch('http://localhost:3001/api/ai/cache-clusters'),
                fetch('http://localhost:3001/api/ai/cache-analytics'),
                fetch('http://localhost:3001/api/ai/cache-settings'),
                fetch('http://localhost:3001/api/ai/cache-uncached-queries')
            ]);
            const d1 = await r1.json();
            const d2 = await r2.json();
            const d3 = await r3.json();
            const d4 = await r4.json();
            if (d1.success) setCacheClusters(d1.clusters || []);
            if (d2.success) setCacheAnalytics(d2);
            if (d3.success) {
                if (d3.threshold) setSimilarityThreshold(d3.threshold);
                if (d3.ttl) setTtlMode(d3.ttl);
            }
            if (d4.success) setUncachedQueries(d4.uncached || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchCacheStudioData();
    }, [fetchCacheStudioData]);

    const handleSaveThreshold = async (newVal: number) => {
        setSimilarityThreshold(newVal);
        try {
            await fetch('http://localhost:3001/api/ai/cache-settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ threshold: newVal })
            });
        } catch (e) { console.error(e); }
    };

    const handleTestQuery = async () => {
        if (!testQueryText.trim()) return;
        setIsTesting(true);
        setTestResult(null);
        try {
            const res = await fetch('http://localhost:3001/api/ai/cache-clusters/test-query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ queryText: testQueryText })
            });
            const data = await res.json();
            setTestResult(data);
        } catch (e) { console.error(e); }
        setIsTesting(false);
    };

    const handleGenerateSynonyms = async (intentKey: string, sample: string) => {
        setSynonymTargetIntent(intentKey);
        setSynonymSampleQuery(sample);
        setShowSynonymModal(true);
        setIsGeneratingSynonyms(true);
        setGeneratedSynonyms([]);
        setSelectedSynonyms({});
        try {
            const res = await fetch('http://localhost:3001/api/ai/cache-clusters/generate-synonyms', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intentKey, sampleQuery: sample })
            });
            const data = await res.json();
            if (data.success && Array.isArray(data.questions)) {
                setGeneratedSynonyms(data.questions);
                const initialMap: Record<string, boolean> = {};
                data.questions.forEach((q: string) => { initialMap[q] = true; });
                setSelectedSynonyms(initialMap);
            }
        } catch (e) { console.error(e); }
        setIsGeneratingSynonyms(false);
    };

    const handleAddSelectedSynonyms = async () => {
        const toAdd = Object.keys(selectedSynonyms).filter(k => selectedSynonyms[k]);
        if (toAdd.length === 0) return;
        const targetCluster = cacheClusters.find(c => c.intent_key === synonymTargetIntent);
        const sampleResponse = targetCluster?.items[0]?.response_text ? tryParseReply(targetCluster?.items[0]?.response_text) : 'Default approved answer.';
        for (const q of toAdd) {
            try {
                await fetch('http://localhost:3001/api/ai/cache-clusters/add-query', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        intentKey: synonymTargetIntent,
                        pureQuery: q,
                        responseText: sampleResponse,
                        isGolden: 1
                    })
                });
            } catch (e) { console.error(e); }
        }
        setShowSynonymModal(false);
        fetchCacheStudioData();
    };

    const handleBulkGolden = async (intentKey: string, isGolden: boolean) => {
        try {
            await fetch('http://localhost:3001/api/ai/cache-clusters/bulk-golden', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ intentKey, isGolden })
            });
            fetchCacheStudioData();
        } catch (e) { console.error(e); }
    };

    const handleAddQuery = async () => {
        if (!addQueryIntentKey || !addQueryText) return;
        try {
            const res = await fetch('http://localhost:3001/api/ai/cache-clusters/add-query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    intentKey: addQueryIntentKey,
                    pureQuery: addQueryText,
                    responseText: addQueryResponseText,
                    isGolden: addQueryIsGolden ? 1 : 0
                })
            });
            const data = await res.json();
            if (data.success) {
                setShowAddQueryModal(false);
                setAddQueryText('');
                fetchCacheStudioData();
            }
        } catch (e) { console.error(e); }
    };

    const handleSaveCacheItem = async () => {
        if (!editingCacheItem) return;
        try {
            const res = await fetch(`http://localhost:3001/api/ai/cache-clusters/${editingCacheItem.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    responseText: editResponseText,
                    isGolden: editIsGolden ? 1 : 0,
                    intentKey: reassignTargetIntent || editingCacheItem.intent_key
                })
            });
            const data = await res.json();
            if (data.success) {
                setEditingCacheItem(null);
                fetchCacheStudioData();
            }
        } catch (e) { console.error(e); }
    };

    const handleDeleteCacheItem = async (id: number) => {
        if (!confirm('Are you sure you want to remove this cache item?')) return;
        try {
            const res = await fetch(`http://localhost:3001/api/ai/cache-clusters/${id}`, { method: 'DELETE' });
            const data = await res.json();
            if (data.success) fetchCacheStudioData();
        } catch (e) { console.error(e); }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-8"
        >
            {/* 🟢 Dynamic Math Calculation Guard Notice Banner */}
            <div className="p-4 bg-gradient-to-r from-emerald-950 via-gray-900 to-emerald-950 border border-emerald-500/30 rounded-2xl flex items-center justify-between text-white shadow-lg">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center font-bold">
                        🛡️
                    </div>
                    <div>
                        <h4 className="text-xs font-black text-emerald-400 uppercase tracking-widest">Dynamic Math Guard Active</h4>
                        <p className="text-[11px] text-gray-300">All weight, count, price, and quantity calculation questions automatically BYPASS cache for 100% accurate live AI math.</p>
                    </div>
                </div>
                <span className="text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-3 py-1 rounded-full uppercase tracking-wider">
                    Zero Cache Errors Guaranteed
                </span>
            </div>

            {/* Header & Stats Banner */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="p-6 bg-gradient-to-br from-purple-900 to-indigo-900 text-white rounded-[2.5rem] shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10"><Cpu size={96} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-purple-300 mb-1">Total Cached Entries</p>
                    <h3 className="text-3xl font-black">{cacheAnalytics.total_cached_entries}</h3>
                    <p className="text-xs text-purple-200 mt-2 font-medium">{cacheAnalytics.total_cache_hits} Total Hits Recorded</p>
                </div>
                <div className="p-6 bg-gradient-to-br from-emerald-900 to-teal-900 text-white rounded-[2.5rem] shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10"><CheckCircle2 size={96} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-300 mb-1">Cache Hit Rate</p>
                    <h3 className="text-3xl font-black">{cacheAnalytics.cache_hit_rate}%</h3>
                    <p className="text-xs text-emerald-200 mt-2 font-medium">Instant ~10ms Automated Answers</p>
                </div>
                <div className="p-6 bg-gradient-to-br from-amber-900 to-orange-900 text-white rounded-[2.5rem] shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10"><Star size={96} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-300 mb-1">Golden Templates</p>
                    <h3 className="text-3xl font-black">{cacheAnalytics.golden_templates_count}</h3>
                    <p className="text-xs text-amber-200 mt-2 font-medium">Locked Admin Approved Intents</p>
                </div>
                <div className="p-6 bg-gradient-to-br from-blue-900 to-cyan-900 text-white rounded-[2.5rem] shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10"><TrendingUp size={96} /></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-1">Est. Cost Savings</p>
                    <h3 className="text-3xl font-black">${cacheAnalytics.estimated_cost_saved}</h3>
                    <p className="text-xs text-blue-200 mt-2 font-medium">~{cacheAnalytics.estimated_tokens_saved.toLocaleString()} LLM Tokens Saved</p>
                </div>
            </div>

            {/* ⚡ Dynamic Sensitivity Control & Live Query Simulator Bar */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 🧪 Live Cache Match Simulator */}
                <div className="lg:col-span-2 p-6 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm space-y-4">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="font-black text-gray-900 text-base">🧪 Interactive Live Cache Simulator</h3>
                            <p className="text-xs text-gray-400 font-medium">Type any customer sentence to test vector similarity match & response live!</p>
                        </div>
                    </div>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={testQueryText}
                            onChange={e => setTestQueryText(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleTestQuery()}
                            placeholder="উদাহরণ: আজকে কোন কোন মাছ পাওয়া যাবে?"
                            className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200"
                        />
                        <button
                            onClick={handleTestQuery}
                            disabled={isTesting}
                            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-2"
                        >
                            {isTesting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                            Test Match
                        </button>
                    </div>

                    {testResult && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-2xl border text-xs space-y-2 bg-gray-50 border-gray-200">
                            {testResult.isMathQuery ? (
                                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl font-bold">
                                    {testResult.message}
                                </div>
                            ) : testResult.hit ? (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full font-black text-[10px] uppercase">
                                            🟢 CACHE HIT (Vector Match &ge; {testResult.thresholdUsed * 100}%)
                                        </span>
                                    </div>
                                    <div className="p-3 bg-white border border-gray-200 rounded-xl font-medium text-gray-700">
                                        {tryParseReply(JSON.stringify(testResult.response))}
                                    </div>
                                </div>
                            ) : (
                                <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl font-bold">
                                    🔴 CACHE MISS: {testResult.message}
                                </div>
                            )}
                        </motion.div>
                    )}
                </div>

                {/* ⚡ Sensitivity Precision Slider */}
                <div className="p-6 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sliders size={18} className="text-purple-600" />
                            <h3 className="font-black text-gray-900 text-sm">Cache Precision Level</h3>
                        </div>
                        <span className="text-xs font-black text-purple-600 bg-purple-50 border border-purple-200 px-3 py-1 rounded-full">
                            {Math.round(similarityThreshold * 100)}% Match Threshold
                        </span>
                    </div>

                    <p className="text-xs text-gray-400 font-medium leading-relaxed">
                        Adjust semantic similarity threshold. Higher values prevent false hits; lower values save more tokens.
                    </p>

                    <input
                        type="range"
                        min="0.80"
                        max="0.99"
                        step="0.01"
                        value={similarityThreshold}
                        onChange={e => handleSaveThreshold(parseFloat(e.target.value))}
                        className="w-full accent-purple-600 cursor-pointer"
                    />

                    <div className="flex justify-between text-[10px] font-black uppercase text-gray-400">
                        <span>Relaxed (80%)</span>
                        <span>Balanced (90%)</span>
                        <span>Strict (95%+)</span>
                    </div>
                </div>
            </div>

            {/* Toolbar & Search Bar */}
            <div className="flex items-center justify-between gap-4 bg-white p-4 rounded-[2rem] border border-gray-100 shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        value={cacheSearch}
                        onChange={e => setCacheSearch(e.target.value)}
                        placeholder="Search cached intents or customer queries..."
                        className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200"
                    />
                </div>
                <button
                    onClick={fetchCacheStudioData}
                    className="px-5 py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 border border-purple-200 transition-all active:scale-95 cursor-pointer"
                >
                    <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    Refresh Studio
                </button>
            </div>

            {/* Intent Clusters Grid */}
            <div className="space-y-6">
                {cacheClusters
                    .filter(c => !cacheSearch || c.intent_key.toLowerCase().includes(cacheSearch.toLowerCase()) || c.items.some((i: any) => i.pure_query.toLowerCase().includes(cacheSearch.toLowerCase())))
                    .map((cluster: any) => (
                        <div key={cluster.intent_key} className="p-6 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm hover:shadow-md transition-all space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl font-black text-xs">
                                        <Layers size={18} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-900 text-base flex items-center gap-2">
                                            {cluster.intent_key}
                                            {cluster.golden_count > 0 && (
                                                <span className="text-[9px] bg-amber-50 text-amber-600 border border-amber-200 px-2.5 py-0.5 rounded-full font-black uppercase tracking-widest flex items-center gap-1">
                                                    <Star size={10} fill="currentColor" /> {cluster.golden_count} Golden
                                                </span>
                                            )}
                                        </h3>
                                        <p className="text-xs text-gray-400 font-medium">
                                            {cluster.total_queries} Queries Grouped · {cluster.total_hits} Total Hits
                                        </p>
                                    </div>
                                </div>

                                <button
                                    onClick={() => {
                                        setAddQueryIntentKey(cluster.intent_key);
                                        setAddQueryText('');
                                        setAddQueryResponseText(cluster.items[0]?.response_text ? tryParseReply(cluster.items[0]?.response_text) : '');
                                        setAddQueryIsGolden(false);
                                        setShowAddQueryModal(true);
                                    }}
                                    className="px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 font-bold text-xs rounded-xl border border-purple-200 flex items-center gap-1.5 transition-all cursor-pointer"
                                >
                                    <Plus size={14} /> + নতুন প্রশ্ন / সিনোনিম যোগ করুন
                                </button>
                            </div>

                            {/* Queries Breakdown */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {cluster.items.map((item: any) => (
                                    <div key={item.id} className="p-4 bg-gray-50 border border-gray-100 rounded-2xl space-y-3 relative group">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-sm font-bold text-gray-900">"{item.pure_query}"</p>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">
                                                    Hits: {item.hit_count || 1} · {item.is_golden ? '⭐ Golden Template' : 'Auto Cached'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingCacheItem(item);
                                                        setEditResponseText(item.response_text ? tryParseReply(item.response_text) : '');
                                                        setEditIsGolden(Boolean(item.is_golden));
                                                        setReassignTargetIntent(item.intent_key || '');
                                                    }}
                                                    className="p-2 bg-white hover:bg-purple-50 text-gray-600 hover:text-purple-600 rounded-xl border border-gray-200 transition-all cursor-pointer"
                                                    title="Edit Response / Mark Golden / Reassign"
                                                >
                                                    <Edit2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteCacheItem(item.id)}
                                                    className="p-2 bg-white hover:bg-red-50 text-gray-600 hover:text-red-600 rounded-xl border border-gray-200 transition-all cursor-pointer"
                                                    title="Delete Cache"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="p-3 bg-white border border-gray-100 rounded-xl text-xs font-medium text-gray-600 leading-relaxed max-h-24 overflow-y-auto">
                                            {item.response_text ? tryParseReply(item.response_text) : 'No response text'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
            </div>

            {/* Edit Modal / Drawer */}
            <AnimatePresence>
                {editingCacheItem && (
                    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl space-y-6"
                        >
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                <div>
                                    <h3 className="font-black text-lg text-gray-900">HITL Cache Control Editor</h3>
                                    <p className="text-xs text-gray-400 font-medium">Query: "{editingCacheItem.pure_query}"</p>
                                </div>
                                <button onClick={() => setEditingCacheItem(null)} className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Intent Group Assignment</label>
                                    <select
                                        value={reassignTargetIntent}
                                        onChange={e => setReassignTargetIntent(e.target.value)}
                                        className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-purple-200"
                                    >
                                        {['FULL_CATALOG_OVERVIEW', 'PRICE_AVAILABILITY', 'DELIVERY_LOGISTICS', 'POLICIES_RETURNS_EXCHANGE', 'PAYMENT_METHODS_DETAILS', 'STORE_LOCATION_INFO', 'BUSINESS_HOURS', 'GREETING_SOCIAL', 'PRODUCT_DETAILS_DEEP'].map(intent => (
                                            <option key={intent} value={intent}>{intent}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Cached Response Reply Text</label>
                                    <textarea
                                        value={editResponseText}
                                        onChange={e => setEditResponseText(e.target.value)}
                                        rows={6}
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-medium outline-none focus:ring-2 focus:ring-purple-200"
                                    />
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                                    <input
                                        type="checkbox"
                                        id="goldenCheck"
                                        checked={editIsGolden}
                                        onChange={e => setEditIsGolden(e.target.checked)}
                                        className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                                    />
                                    <label htmlFor="goldenCheck" className="text-xs font-bold text-amber-900 cursor-pointer">
                                        Mark as Golden Intent Template (Permanent lock, bypasses automatic invalidation)
                                    </label>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                                <button onClick={() => setEditingCacheItem(null)} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs uppercase tracking-widest rounded-2xl">
                                    Cancel
                                </button>
                                <button onClick={handleSaveCacheItem} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-purple-200">
                                    Save Cache Changes
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* Add Synonym Query Modal */}
                {showAddQueryModal && (
                    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] p-8 max-w-xl w-full space-y-6 shadow-2xl border border-gray-100">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                                        <Plus size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-900 text-lg">নতুন প্রশ্ন / সিনোনিম যুক্ত করুন</h3>
                                        <p className="text-xs text-purple-600 font-bold uppercase tracking-wider">Group: {addQueryIntentKey}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowAddQueryModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label className="text-xs font-black text-gray-700 uppercase tracking-wider block mb-2">গ্রাহকের নতুন সম্ভাব্য প্রশ্ন / বাক্য (Customer Query):</label>
                                    <input
                                        type="text"
                                        value={addQueryText}
                                        onChange={e => setAddQueryText(e.target.value)}
                                        placeholder="উদাহরণ: আজকে কোন কোন মাছ এভেলেবল আছে?"
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-900 focus:outline-none focus:border-purple-500"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-black text-gray-700 uppercase tracking-wider block mb-2">অনুমোদিত এআই উত্তর (Approved Response):</label>
                                    <textarea
                                        rows={4}
                                        value={addQueryResponseText}
                                        onChange={e => setAddQueryResponseText(e.target.value)}
                                        className="w-full p-4 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-medium text-gray-900 focus:outline-none focus:border-purple-500"
                                    />
                                </div>

                                <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl">
                                    <input
                                        type="checkbox"
                                        id="addGoldenCheck"
                                        checked={addQueryIsGolden}
                                        onChange={e => setAddQueryIsGolden(e.target.checked)}
                                        className="w-5 h-5 accent-amber-500 rounded cursor-pointer"
                                    />
                                    <label htmlFor="addGoldenCheck" className="text-xs font-bold text-amber-900 cursor-pointer">
                                        Mark as Golden Intent Template (Permanent lock)
                                    </label>
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                                <button onClick={() => setShowAddQueryModal(false)} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs uppercase tracking-widest rounded-2xl">
                                    Cancel
                                </button>
                                <button onClick={handleAddQuery} className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-purple-200">
                                    + প্রশ্ন সেভ করুন
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}

                {/* 🤖 AI Auto-Synonym Generator Modal */}
                {showSynonymModal && (
                    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-[2.5rem] p-8 max-w-xl w-full space-y-6 shadow-2xl border border-gray-100">
                            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-purple-50 text-purple-600 rounded-2xl">
                                        <Sparkles size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-900 text-lg">🤖 AI Auto-Synonym Generator</h3>
                                        <p className="text-xs text-purple-600 font-bold uppercase tracking-wider">Group: {synonymTargetIntent}</p>
                                    </div>
                                </div>
                                <button onClick={() => setShowSynonymModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400">
                                    <X size={18} />
                                </button>
                            </div>

                            {isGeneratingSynonyms ? (
                                <div className="py-12 text-center space-y-3">
                                    <RefreshCw size={32} className="animate-spin text-purple-600 mx-auto" />
                                    <p className="text-xs font-black text-gray-700 uppercase tracking-widest">Generating 5 Natural Customer Question Variations...</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-xs text-gray-500 font-medium">
                                        AI has generated the following 5 natural customer question phrasings for <strong className="text-purple-700">{synonymTargetIntent}</strong>. Check the variations you want to cache:
                                    </p>

                                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                                        {generatedSynonyms.map((q, idx) => (
                                            <label key={idx} className="flex items-center gap-3 p-3.5 bg-gray-50 hover:bg-purple-50/50 border border-gray-100 rounded-2xl cursor-pointer transition-all">
                                                <input
                                                    type="checkbox"
                                                    checked={Boolean(selectedSynonyms[q])}
                                                    onChange={e => setSelectedSynonyms({ ...selectedSynonyms, [q]: e.target.checked })}
                                                    className="w-4 h-4 accent-purple-600 rounded cursor-pointer"
                                                />
                                                <span className="text-xs font-bold text-gray-800">"{q}"</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                                <button onClick={() => setShowSynonymModal(false)} className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black text-xs uppercase tracking-widest rounded-2xl">
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddSelectedSynonyms}
                                    disabled={isGeneratingSynonyms}
                                    className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-xl shadow-purple-200"
                                >
                                    + Add Selected to Cache
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function tryParseReply(raw: string) {
    try {
        const obj = JSON.parse(raw);
        return obj.reply || raw;
    } catch {
        return raw;
    }
}

function ConfigSection({ icon, title, subtitle, hint, value, onChange, onRestoreDefault, rows, tag }: {
    icon: React.ReactNode;
    title: string;
    subtitle: string;
    hint: string;
    value: string;
    onChange: (v: string) => void;
    onRestoreDefault: () => void;
    rows: number;
    tag: string;
}) {
    return (
        <div className="p-6 bg-white border border-gray-100 rounded-[2rem] shadow-sm
                        hover:border-purple-100 hover:shadow-lg hover:shadow-purple-500/5 transition-all">
            <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-gray-50 rounded-xl">{icon}</div>
                <div>
                    <h3 className="font-black text-gray-900">{title}</h3>
                    <p className="text-xs text-gray-400 font-medium">{subtitle}</p>
                </div>
                
                <div className="ml-auto flex items-center gap-2">
                    <button
                        onClick={onRestoreDefault}
                        className="text-[9px] font-black text-purple-600 hover:text-purple-700 uppercase tracking-widest
                                   bg-purple-50 hover:bg-purple-100 px-3 py-1.5 rounded-full border border-purple-200
                                   transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                        title="Restore default enterprise template"
                    >
                        <RotateCcw size={10} />
                        Default
                    </button>
                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest
                                     bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                        {tag}
                    </span>
                </div>
            </div>
            <textarea
                value={value}
                onChange={e => onChange(e.target.value)}
                rows={rows}
                placeholder={hint}
                className="w-full p-4 bg-gray-50/80 border border-gray-100 rounded-2xl text-sm
                           font-medium text-gray-700 outline-none focus:ring-2 focus:ring-purple-200
                           focus:border-purple-200 resize-none transition-all leading-relaxed
                           placeholder:text-gray-300"
            />
        </div>
    );
}

