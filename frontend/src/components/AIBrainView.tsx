import React, { useState, useEffect } from 'react';
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
    ChevronLeft, ShoppingBag
} from 'lucide-react';
import ProcessModal from './ProcessModal';

export default function AIBrainView() {
    const [activeTab, setActiveTab] = useState<'profile' | 'products' | 'knowledge'>('profile');
    const [loading, setLoading] = useState(false);

    // States
    const [profile, setProfile] = useState<any>({});
    const [products, setProducts] = useState<any[]>([]);
    const [knowledge, setKnowledge] = useState<any[]>([]);

    // Process Modal States
    const [processModalOpen, setProcessModalOpen] = useState(false);
    const [processLogs, setProcessLogs] = useState<any[]>([]);
    const [processCurrent, setProcessCurrent] = useState(0);
    const [processTotal, setProcessTotal] = useState(50);
    const [processStatus, setProcessStatus] = useState<'processing' | 'completed' | 'failed'>('processing');
    const [currentProcessId, setCurrentProcessId] = useState<string | null>(null);

    useEffect(() => {
        fetchProfile();

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
            }
        });

        socket.on('new_ai_product_scraped', (data: any) => {
            setProducts(prev => {
                const exists = prev.find(p => p.id === data.product.id || p.name === data.product.name);
                if (exists) {
                    return prev.map(p => (p.id === data.product.id || p.name === data.product.name) ? { ...p, ...data.product } : p);
                }
                return [data.product, ...prev];
            });
        });

        socket.on('ai_products_changed', () => {
            if (activeTab === 'products') fetchProducts();
        });

        return () => {
            socket.off('process_start');
            socket.off('process_update');
            socket.off('process_progress');
            socket.off('process_end');
            socket.off('new_ai_product_scraped');
            socket.off('ai_products_changed');
        };
    }, [currentProcessId, activeTab]);

    const fetchProfile = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/profile');
            const data = await res.json();
            if (data.success) setProfile(data.profile || {});
        } catch (e) { console.error(e); }
    };

    const fetchProducts = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/products');
            const data = await res.json();
            if (data.success) setProducts(data.products || []);
        } catch (e) { console.error(e); }
    };

    const fetchKnowledge = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/knowledge');
            const data = await res.json();
            if (data.success) setKnowledge(data.documents || []);
        } catch (e) { console.error(e); }
    };

    const syncBrain = async () => {
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
    };

    const syncVectors = async (type: 'products' | 'profile' | 'knowledge' = 'products') => {
        setLoading(true);
        try {
            const endpoint = `/api/ai-brain/vectors/sync-${type}`;
            const res = await fetch(`http://localhost:3001${endpoint}`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                setCurrentProcessId(data.id);
                setProcessModalOpen(true);
            }
        } catch (e) {
            alert(`${type} vector sync failed`);
        }
        setLoading(false);
    };

    const pendingVectors = products.filter(p => !p.embedding || p.embedding === 'null' || p.embedding === '[]').length;

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
                        Sync Products Brain
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
                    onClick={() => { setActiveTab('products'); fetchProducts(); }}
                    className={`px-6 py-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'products' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <PackageSearch size={18} /> AI Products
                </button>
                <button
                    onClick={() => { setActiveTab('knowledge'); fetchKnowledge(); }}
                    className={`px-6 py-3 font-medium flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'knowledge' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                        }`}
                >
                    <BookOpen size={18} /> Knowledge Base
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex flex-col overflow-y-auto custom-scrollbar">
                {activeTab === 'profile' && <ProfileTab profile={profile} fetchProfile={fetchProfile} syncVectors={syncVectors} />}
                {activeTab === 'products' && <ProductsTab products={products} fetchProducts={fetchProducts} />}
                {activeTab === 'knowledge' && <KnowledgeTab knowledge={knowledge} fetchKnowledge={fetchKnowledge} syncVectors={syncVectors} />}
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

function ProductsTab({ products, fetchProducts }: { products: any[], fetchProducts: () => void }) {
    const [adding, setAdding] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [formData, setFormData] = useState<any>({ name: '', price: '', description: '', product_url: '', full_description: '', sku: '', regular_price: '', sale_price: '' });
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(20);

    const toggleSelectAll = () => {
        if (selectedIds.size === products.length && products.length > 0) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredProducts.map(p => p.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const bulkDelete = async () => {
        if (selectedIds.size === 0) return;
        if (!confirm(`Are you sure you want to delete ${selectedIds.size} products?`)) return;

        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/products/bulk-delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });
            if (res.ok) {
                setSelectedIds(new Set());
                fetchProducts();
            }
        } catch (e) { alert('Bulk delete failed'); }
    };

    const filteredProducts = products.filter(p =>
        p.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Pagination Logic
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedProducts = filteredProducts.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery]);

    const addProduct = async () => {
        try {
            await fetch('http://localhost:3001/api/ai-brain/products', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            fetchProducts();
            setAdding(false);
            setFormData({ name: '', price: '', description: '', product_url: '', full_description: '', sku: '', regular_price: '', sale_price: '' });
        } catch (e) { alert('Failed to add product'); }
    };

    const deleteProduct = async (id: string) => {
        if (!confirm('Are you sure?')) return;
        try {
            await fetch(`http://localhost:3001/api/ai-brain/products/${id}`, { method: 'DELETE' });
            fetchProducts();
        } catch (e) { alert('Failed to delete'); }
    };

    return (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                <div>
                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Product Catalog</h2>
                    <p className="text-sm text-gray-500 font-medium">Manage and monitor {products.length} intelligence nodes.</p>
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
                            <Trash2 size={18} /> Delete {selectedIds.size}
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
                            <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1.5 block">Full Technical Specs</label>
                            <textarea placeholder="Paste detailed descriptions or variants here..." value={formData.full_description || ''} onChange={e => setFormData({ ...formData, full_description: e.target.value })} className="w-full p-3 bg-white border border-purple-100 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-purple-200 outline-none" rows={3} />
                        </div>
                        <div className="col-span-2 flex gap-3 pt-2">
                            <button onClick={addProduct} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-lg shadow-purple-100 transition-all">Save Intelligence Node</button>
                            <button onClick={() => setAdding(false)} className="px-6 py-3 bg-white border border-gray-200 text-gray-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-50 transition-all">Cancel</button>
                        </div>
                    </div>
                </motion.div>
            )}

            <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[800px] relative">
                        <thead className="bg-gray-50/50">
                            <tr>
                                <th className="p-6 w-12">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.size === products.length && products.length > 0}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 transition-all cursor-pointer"
                                    />
                                </th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">
                                    <div className="flex items-center gap-2">
                                        <Tag size={12} className="text-purple-400" /> Intelligence Node
                                    </div>
                                </th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left w-32">
                                    <div className="flex items-center gap-2">
                                        <TrendingUp size={12} className="text-emerald-400" /> Valuation
                                    </div>
                                </th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left w-32">
                                    <div className="flex items-center gap-2">
                                        <Cpu size={12} className="text-indigo-400" /> Origin
                                    </div>
                                </th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-left w-32">
                                    <div className="flex items-center gap-2">
                                        <Activity size={12} className="text-amber-400" /> Status
                                    </div>
                                </th>
                                <th className="p-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right w-24">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredProducts.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="p-20 text-center">
                                        <div className="flex flex-col items-center gap-3 opacity-20">
                                            <PackageSearch size={48} />
                                            <p className="font-bold tracking-tight">No products found in the brain.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : paginatedProducts.map((p, i) => (
                                <motion.tr
                                    key={p.id || i}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    onClick={() => setSelectedProduct(p)}
                                    className={`group hover:bg-purple-50/40 transition-all cursor-pointer border-b border-gray-50/80 last:border-0 relative ${selectedIds.has(p.id) ? 'bg-purple-50/20 active-row' : ''}`}
                                >
                                    <td className="p-6" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(p.id)}
                                            onChange={() => toggleSelect(p.id)}
                                            className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 transition-all cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-6">
                                        <div className="flex items-center gap-5">
                                            <div className="w-16 h-16 bg-white rounded-[1.25rem] flex items-center justify-center overflow-hidden border-2 border-gray-100 flex-shrink-0 shadow-sm group-hover:border-purple-200 group-hover:shadow-md transition-all duration-300">
                                                {p.image_url ? (
                                                    <img src={p.image_url} alt="" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                                                ) : (
                                                    <PackageSearch className="text-gray-200" size={28} />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="font-extrabold text-gray-900 group-hover:text-purple-700 transition-colors truncate max-w-[240px] text-base mb-0.5">{p.name}</div>
                                                <div className="text-[10px] text-gray-400 font-bold truncate max-w-sm">{p.description || 'No specialized description...'}</div>
                                                <div className="flex items-center gap-3 mt-2.5">
                                                    {p.product_url && (
                                                        <div className="inline-flex items-center gap-1.5 text-[9px] font-black text-gray-300 group-hover:text-purple-400 uppercase transition-colors">
                                                            <Globe size={10} /> {new URL(p.product_url).hostname}
                                                        </div>
                                                    )}
                                                    <div className="w-1 h-1 rounded-full bg-gray-200" />
                                                    <div className="text-[9px] font-black text-gray-300 uppercase tracking-tighter">ID: {String(p.id).slice(-6)}</div>
                                                </div>
                                            </div>
                                        </div>
                                        {(() => {
                                            const raw = p.variants;
                                            let items = [];
                                            try {
                                                const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
                                                items = (parsed?.items || (Array.isArray(parsed) ? parsed : []));
                                            } catch (e) { items = []; }

                                            if (items.length === 0) return null;

                                            return (
                                                <div className="flex flex-wrap gap-1.5 mt-4 ml-21">
                                                    {items.slice(0, 3).map((v: any, vi: number) => (
                                                        <span key={vi} className="px-2.5 py-1 bg-white text-[9px] font-black text-purple-600 rounded-lg border border-purple-100/50 uppercase tracking-tighter shadow-sm whitespace-nowrap group-hover:border-purple-200 transition-colors">
                                                            {v.type || v.name}: {v.value || v.sku}
                                                        </span>
                                                    ))}
                                                    {items.length > 3 && (
                                                        <span className="px-2 py-1 bg-gray-50 text-[9px] font-black text-gray-400 rounded-lg border border-gray-100 uppercase tracking-tighter whitespace-nowrap">
                                                            +{items.length - 3} MORE
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-6">
                                        <div className="flex flex-col gap-1">
                                            {p.regular_price && p.sale_price ? (
                                                <>
                                                    <div className="text-[10px] font-bold text-gray-400 line-through leading-none">{p.regular_price}</div>
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="text-lg font-black text-emerald-600 tracking-tight leading-none">{p.sale_price}</div>
                                                        <div className="px-1.5 py-0.5 bg-emerald-50 text-emerald-600 text-[8px] font-black rounded-md uppercase tracking-tighter border border-emerald-100/50">OFFER</div>
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-lg font-black text-gray-900 tracking-tight">{p.price || 'N/A'}</div>
                                            )}
                                            <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest mt-0.5">EST. VALUE</div>
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm transition-all ${p.manual_override ? 'bg-indigo-50/80 text-indigo-600 border border-indigo-100' : 'bg-emerald-50/80 text-emerald-600 border border-emerald-100'}`}>
                                            {p.manual_override ? <Edit2 size={11} /> : <Zap size={11} />}
                                            {p.manual_override ? 'Manual' : 'System'}
                                        </div>
                                    </td>
                                    <td className="p-6">
                                        <div className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-sm transition-all ${p.embedding && p.embedding.length > 10 ? 'bg-wa-teal/10 text-wa-teal border border-wa-teal/20' : 'bg-amber-50/80 text-amber-600 border border-amber-100'}`}>
                                            {p.embedding && p.embedding.length > 10 ? (
                                                <>
                                                    <CheckCircle2 size={11} />
                                                    <span>Brain Ready</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Activity size={11} className="animate-pulse" />
                                                    <span>Syncing...</span>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-6 text-right">
                                        <div className="flex justify-end items-center gap-4">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteProduct(p.id); }}
                                                className="p-2.5 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all shadow-sm hover:shadow-md"
                                                title="Remove Node"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                            <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-300 group-hover:bg-purple-600 group-hover:text-white group-hover:shadow-lg group-hover:shadow-purple-200 transition-all duration-300">
                                                <ChevronRight size={20} className="group-hover:translate-x-0.5 transition-transform" />
                                            </div>
                                        </div>
                                    </td>
                                </motion.tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                <div className="px-8 py-5 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                    <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Showing <span className="text-purple-600">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="text-purple-600">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> of <span className="text-gray-900">{filteredProducts.length}</span> nodes
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className={`p-2 rounded-xl transition-all ${currentPage === 1 ? 'text-gray-300' : 'text-gray-600 hover:bg-white hover:shadow-sm hover:text-purple-600 active:scale-95'}`}
                        >
                            <ChevronLeft size={18} />
                        </button>

                        <div className="flex items-center gap-1">
                            {[...Array(totalPages)].map((_, idx) => {
                                const pageNum = idx + 1;
                                // Basic sliding window for many pages
                                if (totalPages > 7) {
                                    if (pageNum !== 1 && pageNum !== totalPages && Math.abs(pageNum - currentPage) > 1) {
                                        if (pageNum === 2 || pageNum === totalPages - 1) return <span key={idx} className="text-gray-300 text-xs px-1">...</span>;
                                        return null;
                                    }
                                }

                                return (
                                    <button
                                        key={idx}
                                        onClick={() => setCurrentPage(pageNum)}
                                        className={`w-8 h-8 rounded-xl text-[10px] font-black transition-all ${currentPage === pageNum ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'text-gray-400 hover:bg-white hover:text-purple-600 shadow-sm border border-transparent hover:border-purple-100'}`}
                                    >
                                        {pageNum}
                                    </button>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                            disabled={currentPage === totalPages || totalPages === 0}
                            className={`p-2 rounded-xl transition-all ${currentPage === totalPages || totalPages === 0 ? 'text-gray-300' : 'text-gray-600 hover:bg-white hover:shadow-sm hover:text-purple-600 active:scale-95'}`}
                        >
                            <ChevronRight size={18} />
                        </button>
                    </div>
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
