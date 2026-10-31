import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Users, AlertTriangle, TrendingUp, Filter, ArrowRight, Star, DollarSign, Activity, MessageCircle, ShieldCheck } from 'lucide-react';
import { Contact } from '../types';

const IntelligenceHubView: React.FC = () => {
    const [hotLeads, setHotLeads] = useState<Contact[]>([]);
    const [stats, setStats] = useState<any>({
        hot_leads: 0,
        churn_risks: 0,
        premium_buyers: 0,
        bargainers: 0,
        info_seekers: 0,
        total_intel_tracked: 0
    });
    const [heartbeat, setHeartbeat] = useState<any[]>([]);
    const [brief, setBrief] = useState<string>("Analyzing current business intelligence...");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchInitialData();
        const statsInterval = setInterval(fetchStats, 15000); // Stats: 15s
        return () => clearInterval(statsInterval);
    }, []);

    const fetchInitialData = async () => {
        setLoading(true);
        await Promise.all([fetchStats(), fetchBrief()]);
        setLoading(false);
    };

    const fetchBrief = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/executive-brief');
            const data = await res.json();
            if (data.success) setBrief(data.brief);
        } catch (err) {
            console.error('Failed to fetch executive brief:', err);
        }
    };

    const fetchStats = async () => {
        try {
            const statsRes = await fetch('http://localhost:3001/api/ai-brain/intelligence-stats');
            const statsData = await statsRes.json();
            if (statsData.success) {
                setStats(statsData.stats);
                setHeartbeat(statsData.heartbeat || []);
            }

            const contactsRes = await fetch('http://localhost:3001/api/contacts');
            const contactsData = await contactsRes.json();
            if (contactsData.success) {
                const hot = contactsData.contacts
                    .filter((c: any) => c.interest_score > 70 || c.lifecycle_stage === 'opportunity')
                    .sort((a: any, b: any) => (b.interest_score || 0) - (a.interest_score || 0))
                    .slice(0, 5);
                setHotLeads(hot);
            }
        } catch (err) {
            console.error('Failed to fetch intelligence hub data:', err);
        }
    };

    return (
        <div className="p-8 h-full overflow-y-auto custom-scrollbar bg-slate-50/50">
            {/* 🧠 AI Executive Brief Section */}
            <header className="mb-8">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-4">
                        <div className="p-4 bg-gradient-to-br from-wa-teal to-emerald-600 text-white rounded-[2rem] shadow-xl shadow-wa-teal/20">
                            <Zap size={28} />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Intelligence Hub</h1>
                            <p className="text-slate-500 font-bold text-xs uppercase tracking-widest opacity-60">Command Center v2.5 (Fully Dynamic)</p>
                        </div>
                    </div>
                </div>

                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 bg-gradient-to-br from-indigo-600 to-indigo-900 rounded-[2.5rem] shadow-2xl relative overflow-hidden group"
                >
                    <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform">
                        <ShieldCheck size={120} className="text-white" />
                    </div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
                            <span className="text-[10px] font-black text-indigo-200 uppercase tracking-widest">AI Strategic Advisory</span>
                        </div>
                        <h2 className="text-xl font-black text-white leading-tight min-h-[3rem]">
                            {loading ? "Generating business health report..." : brief}
                        </h2>
                    </div>
                </motion.div>
            </header>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left Column: Segments & Stats */}
                <div className="xl:col-span-2 space-y-8">
                    {/* Top Stats Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                                    <Star size={20} className="fill-emerald-600" />
                                </div>
                                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-100/50 px-2 py-1 rounded-md">High Growth</span>
                            </div>
                            <h3 className="text-4xl font-black text-slate-800 mb-1">{stats.hot_leads}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Hot Leads</p>
                        </div>

                        <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm hover:shadow-md transition-all">
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                                    <AlertTriangle size={20} />
                                </div>
                                <span className="text-[10px] font-black text-rose-600 uppercase tracking-widest bg-rose-100/50 px-2 py-1 rounded-md">At Risk</span>
                            </div>
                            <h3 className="text-4xl font-black text-slate-800 mb-1">{stats.churn_risks}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sentiment Warnings</p>
                        </div>
                    </div>

                    {/* Lower Grid: Detailed Segmentation */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <section className="space-y-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Behavioral Segments</h3>
                            <div className="space-y-3">
                                <div className="p-5 bg-white rounded-2xl border border-slate-100 flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                            <DollarSign size={20} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Premium Buyers</p>
                                            <h4 className="text-xl font-black text-slate-800">{stats.premium_buyers}</h4>
                                        </div>
                                    </div>
                                    <ArrowRight size={16} className="text-slate-300 group-hover:text-indigo-600 transition-colors" />
                                </div>
                                <div className="p-5 bg-white rounded-2xl border border-slate-100 flex items-center justify-between group cursor-pointer hover:bg-slate-50 transition-colors">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">
                                            <TrendingUp size={20} />
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Info Seekers</p>
                                            <h4 className="text-xl font-black text-slate-800">{stats.info_seekers}</h4>
                                        </div>
                                    </div>
                                    <ArrowRight size={16} className="text-slate-300 group-hover:text-amber-600 transition-colors" />
                                </div>
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Closing Queue</h3>
                            <div className="space-y-2">
                                {hotLeads.map((lead, i) => (
                                    <motion.div 
                                        whileHover={{ x: 5 }}
                                        key={lead.id} 
                                        className="p-4 bg-white rounded-2xl border border-slate-100 flex items-center justify-between group cursor-pointer"
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-lg bg-wa-teal/10 text-wa-teal flex items-center justify-center font-black text-xs">
                                                {lead.name[0]}
                                            </div>
                                            <span className="text-xs font-black text-slate-700">{lead.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-1.5 h-1.5 rounded-full ${(lead as any).interest_score > 85 ? 'bg-emerald-500 animate-pulse' : 'bg-wa-teal'}`}></div>
                                            <span className="text-[10px] font-black text-wa-teal">{(lead as any).interest_score}%</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Right Column: Live Heartbeat Feed */}
                <div className="space-y-6">
                    <section className="bg-slate-900 rounded-[2.5rem] shadow-2xl p-8 h-full min-h-[500px] flex flex-col">
                        <div className="flex items-center justify-between mb-8">
                            <div className="flex items-center gap-3">
                                <Activity size={20} className="text-emerald-400 animate-pulse" />
                                <h2 className="text-xs font-black text-white uppercase tracking-widest">AI Heartbeat Feed</h2>
                            </div>
                            <span className="text-[8px] font-black text-slate-500 uppercase">Live Stream</span>
                        </div>

                        <div className="flex-1 space-y-6 overflow-hidden">
                            <AnimatePresence mode="popLayout">
                                {heartbeat.map((log, i) => (
                                    <motion.div 
                                        initial={{ opacity: 0, x: 20 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, scale: 0.9 }}
                                        key={log.id || i}
                                        className="border-l-2 border-emerald-500/20 pl-4 space-y-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 bg-emerald-500/10 rounded text-emerald-400">
                                                <MessageCircle size={10} />
                                            </div>
                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter truncate max-w-[120px]">{log.customer_number}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-300 font-medium leading-relaxed italic line-clamp-2">
                                            "{log.user_query}"
                                        </p>
                                        {log.intel && (
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {JSON.parse(log.intel).tags?.slice(0, 2).map((tag: string, j: number) => (
                                                    <span key={j} className="text-[7px] font-black px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded-sm uppercase">#{tag}</span>
                                                ))}
                                            </div>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        <div className="mt-8 pt-6 border-t border-slate-800">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-[8px] font-black text-slate-500 uppercase mb-1">Network Capacity</p>
                                    <div className="flex gap-1">
                                        {[...Array(6)].map((_, i) => (
                                            <motion.div 
                                                animate={{ height: [4, 12, 4] }}
                                                transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                                                key={i} 
                                                className="w-1 bg-wa-teal/40 rounded-full" 
                                            />
                                        ))}
                                    </div>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-wa-teal block leading-none">V2.5 ACTIVE</span>
                                    <span className="text-[7px] font-black text-slate-600 uppercase tracking-tighter">Sync Stream Online</span>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default IntelligenceHubView;
