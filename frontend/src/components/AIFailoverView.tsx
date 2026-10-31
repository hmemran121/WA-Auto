
import React, { useState, useEffect } from 'react';
import { 
    Plus, Cpu, Activity, ArrowRight, Trash2, Globe, X,
    Settings, ShieldCheck, History, Clock, Zap, Search,
    LayoutGrid, List
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AIFailoverView() {
    const [loading, setLoading] = useState(false);
    const [apiConfigs, setApiConfigs] = useState<any[]>([]);
    const [apiUsage, setApiUsage] = useState<any>({ stats: [], configStats: [] });
    const [isAdding, setIsAdding] = useState(false);
    const [formData, setFormData] = useState({ name: '', provider: 'google', api_key: '', model: 'gemini-2.5-flash-lite', is_primary: false });
    
    // View States
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Logs States
    const [selectedConfigForLogs, setSelectedConfigForLogs] = useState<any>(null);
    const [configLogs, setConfigLogs] = useState<any[]>([]);
    const [logsPagination, setLogsPagination] = useState({ total: 0, page: 1, limit: 20 });
    const [isLogsLoading, setIsLogsLoading] = useState(false);

    useEffect(() => {
        fetchAIConfigs();
        fetchAIUsage();
    }, []);

    const fetchAIConfigs = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/configs');
            const data = await res.json();
            if (data.success) setApiConfigs(data.configs);
        } catch (e) { console.error(e); }
    };

    const fetchAIUsage = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/usage-stats');
            const data = await res.json();
            if (data.success) setApiUsage({ stats: data.stats, configStats: data.configStats });
        } catch (e) { console.error(e); }
    };

    const fetchLogsForConfig = async (config: any, page = 1) => {
        setSelectedConfigForLogs(config);
        setIsLogsLoading(true);
        try {
            const offset = (page - 1) * logsPagination.limit;
            const res = await fetch(`http://localhost:3001/api/ai-brain/configs/${config.id}/logs?limit=${logsPagination.limit}&offset=${offset}`);
            const data = await res.json();
            if (data.success) {
                if (page === 1) setConfigLogs(data.logs);
                else setConfigLogs(prev => [...prev, ...data.logs]);
                setLogsPagination({ ...logsPagination, total: data.total, page });
            }
        } catch (e) { console.error(e); }
        setIsLogsLoading(false);
    };

    const saveConfig = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/configs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            if (res.ok) {
                fetchAIConfigs();
                setIsAdding(false);
                setFormData({ name: '', provider: 'google', api_key: '', model: 'gemini-2.5-flash-lite', is_primary: false });
            }
        } catch (e) { alert('Failed to save API config'); }
    };

    const togglePrimary = async (id: number) => {
        try {
            await fetch(`http://localhost:3001/api/ai-brain/configs/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_primary: true })
            });
            fetchAIConfigs();
        } catch (e) { }
    };

    const deleteConfig = async (id: number) => {
        if (!confirm('Remove this API key?')) return;
        try {
            await fetch(`http://localhost:3001/api/ai-brain/configs/${id}`, { method: 'DELETE' });
            fetchAIConfigs();
        } catch (e) { }
    };

    return (
        <div className="space-y-10 pb-20 p-6 overflow-y-auto custom-scrollbar h-full">
            {/* Professional Header */}
            <div className="flex justify-between items-center mb-8">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-xl shadow-purple-200">
                            <ShieldCheck className="text-white" size={26} />
                        </div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">AI Failover Center</h1>
                    </div>
                    <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] pl-1">Multi-API Rotation & Network Health Control</p>
                </div>

                <div className="flex items-center gap-6">
                    {/* View Toggle */}
                    <div className="flex items-center bg-gray-100/50 p-1 rounded-2xl border border-gray-100">
                        <button 
                            onClick={() => setViewMode('grid')}
                            className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <LayoutGrid size={18} />
                        </button>
                        <button 
                            onClick={() => setViewMode('list')}
                            className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                            <List size={18} />
                        </button>
                    </div>

                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => { fetchAIConfigs(); fetchAIUsage(); }}
                            className="p-3 bg-white border border-gray-100 rounded-2xl hover:bg-gray-50 transition-all text-gray-400 hover:text-purple-600 shadow-sm"
                        >
                            <Activity size={20} />
                        </button>
                        <button 
                            onClick={() => setIsAdding(true)}
                            className="bg-gray-900 text-white px-8 py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-black transition-all shadow-xl active:scale-95 flex items-center gap-2"
                        >
                            <Plus size={16} />
                            Deploy Cluster
                        </button>
                    </div>
                </div>
            </div>

            {/* Layout Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    
                    {/* Items Logic */}
                    <AnimatePresence mode="wait">
                        {apiConfigs.length > 0 ? (
                            viewMode === 'grid' ? (
                                <motion.div 
                                    key="grid"
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -20 }}
                                    className="grid grid-cols-1 md:grid-cols-2 gap-6"
                                >
                                    {apiConfigs.map(config => (
                                        <ConfigCard 
                                            key={config.id} 
                                            config={config} 
                                            onSetPrimary={() => togglePrimary(config.id)} 
                                            onDelete={() => deleteConfig(config.id)} 
                                            onViewLogs={() => fetchLogsForConfig(config)}
                                        />
                                    ))}
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="list"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    className="space-y-4"
                                >
                                    {/* List Headers */}
                                    <div className="px-8 flex items-center text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">
                                        <div className="w-[45%]">Cluster Identity</div>
                                        <div className="w-[20%]">Status</div>
                                        <div className="w-[15%] text-right pr-10">Lifetime</div>
                                        <div className="w-[20%] text-right">Actions</div>
                                    </div>
                                    {apiConfigs.map(config => (
                                        <ConfigListRow 
                                            key={config.id} 
                                            config={config} 
                                            onSetPrimary={() => togglePrimary(config.id)} 
                                            onDelete={() => deleteConfig(config.id)} 
                                            onViewLogs={() => fetchLogsForConfig(config)}
                                        />
                                    ))}
                                </motion.div>
                            )
                        ) : (
                            <div className="py-32 bg-gray-50/50 rounded-[4rem] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-center">
                                <div className="w-20 h-20 bg-white rounded-[2rem] flex items-center justify-center mb-6 shadow-sm">
                                    <Cpu size={40} className="text-gray-200" />
                                </div>
                                <p className="text-sm font-black text-gray-900 uppercase tracking-[0.2em]">No API Intelligence Found</p>
                                <p className="text-xs text-gray-400 mt-2 font-medium">Connect external API clusters to enable failover redundancy.</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Right Rail: Usage Analytics */}
                <div className="bg-gray-50/80 rounded-[3rem] p-10 border border-gray-100 flex flex-col gap-10 h-fit sticky top-6">
                    <div className="flex items-center gap-3">
                        <Activity className="text-purple-600" size={20} />
                        <h4 className="text-sm font-black text-gray-900 uppercase tracking-widest">Network Health</h4>
                    </div>
                    
                    <UsageMetrics usage={apiUsage} />

                    <div className="pt-8 border-t border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Failover Logic</span>
                            <span className="bg-emerald-100 text-emerald-600 px-2 py-0.5 rounded-full text-[8px] font-black uppercase">Active</span>
                        </div>
                        <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                            System automatically shifts to the next available cluster if rate limits are reached. Token tracking is updated every search/interaction.
                        </p>
                    </div>
                </div>
            </div>

            {/* Addition Modal */}
            <AnimatePresence>
                {isAdding && (
                    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden">
                            <div className="p-10 pb-0 flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight">Deploy AI Cluster</h2>
                                    <p className="text-sm text-gray-500 font-medium">Connect a new API endpoint to the rotation engine.</p>
                                </div>
                                <button onClick={() => setIsAdding(false)} className="p-3 hover:bg-gray-50 rounded-2xl transition-all">
                                    <X size={24} className="text-gray-300" />
                                </button>
                            </div>
                            
                            <div className="p-10 space-y-6">
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block pl-1">Display Name</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Gemini Premium Hub"
                                        value={formData.name} 
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all" 
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block pl-1">Provider</label>
                                        <select 
                                            value={formData.provider} 
                                            onChange={e => setFormData({ ...formData, provider: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all appearance-none"
                                        >
                                            <option value="google">Google Gemini</option>
                                            <option value="openai">OpenAI (Coming Soon)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block pl-1">Model Arch</label>
                                        <select 
                                            value={formData.model} 
                                            onChange={e => setFormData({ ...formData, model: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all appearance-none"
                                        >
                                            <option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
                                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                                            <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
                                            <option value="gemini-1.5-pro">Gemini 1.5 Pro</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block pl-1">API Key</label>
                                    <div className="relative">
                                        <input 
                                            type="password" 
                                            placeholder="Enter key..."
                                            value={formData.api_key} 
                                            onChange={e => setFormData({ ...formData, api_key: e.target.value })}
                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-sm font-bold outline-none focus:ring-4 focus:ring-purple-100 transition-all pr-12" 
                                        />
                                        <Globe className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300" size={20} />
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 p-4 bg-purple-50/50 rounded-[1.5rem] border border-purple-100">
                                    <input 
                                        type="checkbox" 
                                        id="primary"
                                        checked={formData.is_primary}
                                        onChange={e => setFormData({ ...formData, is_primary: e.target.checked })}
                                        className="w-5 h-5 rounded-lg border-purple-200 text-purple-600 focus:ring-purple-500"
                                    />
                                    <label htmlFor="primary" className="text-xs font-black text-purple-700 uppercase tracking-widest cursor-pointer select-none">Set as Primary Gateway</label>
                                </div>
                                <button 
                                    onClick={saveConfig}
                                    className="w-full bg-gray-900 text-white py-5 rounded-[2rem] font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-gray-200 hover:bg-black transition-all active:scale-95"
                                >
                                    Activate Cluster
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Logs Modal */}
            <AnimatePresence>
                {selectedConfigForLogs && (
                    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, x: 100 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 100 }} className="bg-white w-full max-w-4xl h-[80vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden">
                            <div className="p-10 pb-6 border-b border-gray-100 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600">
                                        <History size={24} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-gray-900 tracking-tight">{selectedConfigForLogs.name} <span className="text-gray-400 font-medium ml-2 text-sm italic">Audit Logs</span></h2>
                                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-0.5">Full Transaction History & Cost Breakdown</p>
                                    </div>
                                </div>
                                <button onClick={() => setSelectedConfigForLogs(null)} className="p-3 hover:bg-gray-50 rounded-2xl transition-all">
                                    <X size={24} className="text-gray-300" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar space-y-6">
                                {configLogs.length > 0 ? (
                                    <div className="space-y-4">
                                        {configLogs.map((log, i) => (
                                            <div key={i} className="bg-gray-50 rounded-3xl p-6 border border-gray-100 hover:border-purple-200 transition-colors group">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 bg-white rounded-xl flex items-center justify-center text-purple-600 shadow-sm border border-purple-50">
                                                            <Clock size={16} />
                                                        </div>
                                                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                                            {new Date(log.timestamp).toLocaleString()}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-right">
                                                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Cost Burn</p>
                                                            <p className="text-xs font-black text-emerald-600">${log.cost?.toFixed(4)}</p>
                                                        </div>
                                                        <div className="px-3 py-1 bg-white rounded-full border border-gray-200 text-[8px] font-black text-gray-500 uppercase">
                                                            {log.latency}ms
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/50">
                                                    <div className="space-y-2">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Input Buffer</p>
                                                        <p className="text-[11px] text-gray-600 font-medium leading-relaxed bg-white/50 p-3 rounded-2xl border border-white/80 line-clamp-3 group-hover:line-clamp-none transition-all duration-500 italic">"{log.user_query}"</p>
                                                    </div>
                                                    <div className="space-y-2">
                                                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">AI Synthesis</p>
                                                        <p className="text-[11px] text-gray-600 font-medium leading-relaxed bg-white p-3 rounded-2xl border border-white line-clamp-3 group-hover:line-clamp-none transition-all duration-500">"{log.ai_response}"</p>
                                                    </div>
                                                </div>

                                                <div className="mt-4 flex items-center gap-4 text-[9px] font-black uppercase tracking-widest text-gray-400">
                                                    <div className="flex items-center gap-1.5"><Zap size={10} className="text-purple-400" /> {log.total_tokens} Total Tokens</div>
                                                    <div className="w-1 h-1 bg-gray-300 rounded-full" />
                                                    <div className="flex items-center gap-1.5"><Search size={10} className="text-blue-400" /> Purpose: {log.purpose || 'General'}</div>
                                                </div>
                                            </div>
                                        ))}
                                        {logsPagination.total > configLogs.length && (
                                            <button 
                                                onClick={() => fetchLogsForConfig(selectedConfigForLogs, logsPagination.page + 1)}
                                                disabled={isLogsLoading}
                                                className="w-full py-6 mt-6 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest hover:border-purple-200 hover:text-purple-600 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50"
                                            >
                                                {isLogsLoading ? 'Synchronizing Cluster...' : 'Load Deep History'}
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-center opacity-40 py-20">
                                        <History size={64} className="text-gray-300 mb-6" />
                                        <h3 className="text-lg font-black text-gray-400 uppercase tracking-widest">No Interaction History</h3>
                                        <p className="text-sm font-medium text-gray-400 mt-2">Activate this cluster to begin logging intelligence transactions.</p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}

function ConfigCard({ config, onSetPrimary, onDelete, onViewLogs }: { config: any, onSetPrimary: () => void, onDelete: () => void, onViewLogs: () => void }) {
    return (
        <div className={`group relative bg-white p-8 rounded-[3rem] border transition-all duration-500 hover:shadow-2xl hover:shadow-purple-500/5 ${config.is_primary ? 'border-purple-200 shadow-xl shadow-purple-500/5' : 'border-gray-100 shadow-sm'}`}>
            {config.is_primary && (
                <div className="absolute top-0 right-10 -translate-y-1/2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-5 py-1.5 rounded-full text-[8px] font-black uppercase tracking-[0.2em] shadow-lg">
                    Primary Gateway
                </div>
            )}
            
            <div className="flex justify-between items-start mb-6">
                <div className={`p-4 rounded-2xl transition-all duration-500 ${config.is_primary ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-gray-50 text-gray-400 group-hover:bg-purple-50 group-hover:text-purple-400'}`}>
                    <Cpu size={24} />
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={onViewLogs} className="p-2.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="View Audit Logs"><History size={18} /></button>
                    {!config.is_primary && (
                        <button onClick={onSetPrimary} className="p-2.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="Promote to Primary"><ArrowRight size={18} /></button>
                    )}
                    <button onClick={onDelete} className="p-2.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button>
                </div>
            </div>

            <h4 className="text-lg font-black text-gray-900 mb-1 tracking-tight">{config.name}</h4>
            <div className="flex items-center gap-2 mb-6">
                <span className={`w-2 h-2 rounded-full ${config.status === 'active' ? 'bg-emerald-400 animate-pulse' : config.status === 'limit_exceeded' ? 'bg-orange-400' : 'bg-rose-400'}`} />
                <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">
                    {config.provider}: {config.model}
                </p>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 rounded-2xl border border-gray-100">
                <div className="space-y-0.5">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Lifetime Hits</p>
                    <p className="text-sm font-black text-gray-900">{config.usage_count || 0}</p>
                </div>
                <div className="space-y-0.5">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Current State</p>
                    <p className={`text-sm font-black uppercase tracking-widest ${config.status === 'active' ? 'text-emerald-600' : 'text-rose-500'}`}>{config.status}</p>
                </div>
            </div>

            {config.last_error && config.status !== 'active' && (
                <div className="mt-4 p-3 bg-rose-50 rounded-xl border border-rose-100 text-[10px] text-rose-600 font-medium italic">
                    ⚠️ {config.last_error.substring(0, 80)}...
                </div>
            )}
        </div>
    );
}

function ConfigListRow({ config, onSetPrimary, onDelete, onViewLogs }: { config: any, onSetPrimary: () => void, onDelete: () => void, onViewLogs: () => void }) {
    return (
        <div className={`group relative bg-white p-6 rounded-3xl border transition-all duration-500 flex items-center hover:shadow-xl hover:shadow-purple-500/5 ${config.is_primary ? 'border-purple-200' : 'border-gray-100 shadow-sm'}`}>
            <div className="w-[45%] flex items-center gap-4">
                <div className={`p-3 rounded-xl transition-all duration-500 ${config.is_primary ? 'bg-purple-600 text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-purple-50 group-hover:text-purple-400'}`}>
                    <Cpu size={20} />
                </div>
                 <div>
                    <h4 className="text-sm font-black text-gray-900 tracking-tight flex items-center gap-2">
                        {config.name}
                        {config.is_primary && <span className="text-[7px] bg-purple-600 text-white px-2 py-0.5 rounded-full uppercase tracking-widest">Primary</span>}
                    </h4>
                    <p className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{config.provider}: {config.model}</p>
                </div>
            </div>
            
            <div className="w-[20%]">
                <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${config.status === 'active' ? 'bg-emerald-400 animate-pulse' : config.status === 'limit_exceeded' ? 'bg-orange-400' : 'bg-rose-400'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${config.status === 'active' ? 'text-emerald-600' : 'text-rose-500'}`}>{config.status}</span>
                </div>
            </div>

            <div className="w-[15%] text-right pr-10">
                <p className="text-sm font-black text-gray-900">{config.usage_count || 0}</p>
                <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Total Hits</p>
            </div>

            <div className="w-[20%] flex justify-end gap-2 pr-2">
                <button onClick={onViewLogs} className="p-2.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="View Audit Logs"><History size={18} /></button>
                {!config.is_primary && (
                    <button onClick={onSetPrimary} className="p-2.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-all" title="Promote to Primary"><ArrowRight size={18} /></button>
                )}
                <button onClick={onDelete} className="p-2.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all"><Trash2 size={18} /></button>
            </div>
        </div>
    );
}

function UsageMetrics({ usage }: { usage: any }) {
    const totalTokens = usage?.configStats?.reduce((acc: number, curr: any) => acc + (curr?.total_tokens || 0), 0) || 0;
    const totalCost = usage?.configStats?.reduce((acc: number, curr: any) => acc + (curr?.total_cost || 0), 0) || 0;

    return (
        <div className="space-y-8">
             <div className="space-y-4">
                <div className="flex justify-between items-end">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Token Saturation</span>
                    <span className="text-xs font-black text-purple-600">{(totalTokens / 1000).toFixed(1)}k Hits</span>
                </div>
                <div className="h-4 bg-white rounded-full overflow-hidden border border-gray-100 p-1">
                    <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (totalTokens / 100000) * 100)}%` }}
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Weight</p>
                    <p className="text-xl font-black text-gray-900 tracking-tight">{(totalTokens / 1000).toFixed(1)}k<span className="text-[10px] ml-1 text-gray-400">tkns</span></p>
                </div>
                <div className="p-6 bg-emerald-50 rounded-[2rem] border border-emerald-100 shadow-sm">
                    <p className="text-[8px] font-black text-emerald-600/60 uppercase tracking-widest mb-2">Burn Rate</p>
                    <p className="text-xl font-black text-emerald-600 tracking-tight">${totalCost.toFixed(3)}</p>
                </div>
            </div>

            <div className="space-y-4 pt-4">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Gateway Distribution</p>
                <div className="space-y-3">
                    {usage?.configStats?.map((c: any, i: number) => (
                        <div key={i} className="flex items-center justify-between p-4 bg-white/50 rounded-2xl border border-gray-50 group hover:border-purple-100 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className={`w-2 h-2 rounded-full ${c.status === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                <span className="text-xs font-bold text-gray-700">{c.name}</span>
                            </div>
                            <span className="text-xs font-black text-gray-400">{(c.total_requests || 0)} calls</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

