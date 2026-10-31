import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wallet, Plus, X, Trash2, Calendar, Filter, TrendingUp, TrendingDown, DollarSign, Tag, FileText, Zap } from 'lucide-react';

interface Expense {
    id: number;
    category: string;
    amount: number;
    description: string;
    type: 'direct' | 'indirect';
    reference_id: string | null;
    expense_date: string;
    created_at: string;
}

interface FinanceStats {
    totalRevenue: number;
    realizedCash: number;
    totalCOGS: number;
    grossProfit: number;
    totalExpenses: number;
    netProfit: number;
    taxLiability: number;
    burnRate: number;
    inventoryValue: number;
    totalStockItems: number;
    periodBaseSpend: number;
    periodLandedSpend: number;
    orderCount: number;
}

export default function FinanceView() {
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [stats, setStats] = useState<FinanceStats | null>(null);
    const [prevStats, setPrevStats] = useState<FinanceStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [adding, setAdding] = useState(false);
    const [showCustomDates, setShowCustomDates] = useState(false);
    const [filter, setFilter] = useState('all');
    
    // Period Filtering State
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    
    const [selectedPeriod, setSelectedPeriod] = useState('month');
    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(lastDay);

    // New Expense State
    const [newExpense, setNewExpense] = useState({
        category: 'Operations',
        amount: '',
        description: '',
        date: new Date().toISOString().split('T')[0]
    });

    const categories = ['Procurement', 'Operations', 'Marketing', 'Rent', 'Utilities', 'Salary', 'Misc'];

    const fetchData = async () => {
        setLoading(true);
        try {
            // Get Current Stats
            const statsRes = await fetch(`http://localhost:3001/api/ai-brain/finance-overview?from=${startDate}&to=${endDate}`);
            const statsData = await statsRes.json();
            
            // Intelligence: Calculate Previous Period Dates for Comparison
            const start = new Date(startDate);
            const end = new Date(endDate);
            const diffTime = Math.abs(end.getTime() - start.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            
            const prevStart = new Date(start);
            prevStart.setDate(prevStart.getDate() - diffDays);
            const prevEnd = new Date(start);
            prevEnd.setDate(prevEnd.getDate() - 1);
            
            const prevFrom = prevStart.toISOString().split('T')[0];
            const prevTo = prevEnd.toISOString().split('T')[0];
            
            // Concurrent Fetches: Expenses & Previous Stats
            const [expRes, prevRes] = await Promise.all([
                fetch(`http://localhost:3001/api/ai-brain/expenses?from=${startDate}&to=${endDate}`),
                fetch(`http://localhost:3001/api/ai-brain/finance-overview?from=${prevFrom}&to=${prevTo}`)
            ]);
            
            const expData = await expRes.json();
            const prevData = await prevRes.json();
            
            if (expData.success) {
                setExpenses(Array.isArray(expData.expenses) ? expData.expenses : []);
            }
            if (statsData.success) {
                setStats(statsData.stats);
            }
            if (prevData.success) {
                setPrevStats(prevData.stats);
            }
        } catch (e) {
            console.error("Finance fetch error:", e);
            setExpenses([]);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchData();
    }, [startDate, endDate]);

    const handlePeriodChange = (period: string) => {
        setSelectedPeriod(period);
        setShowCustomDates(period === 'custom');
        const curr = new Date();
        
        switch(period) {
            case 'today':
                setStartDate(curr.toISOString().split('T')[0]);
                setEndDate(curr.toISOString().split('T')[0]);
                break;
            case '7days':
                const sevenAgo = new Date();
                sevenAgo.setDate(curr.getDate() - 7);
                setStartDate(sevenAgo.toISOString().split('T')[0]);
                setEndDate(curr.toISOString().split('T')[0]);
                break;
            case 'month':
                setStartDate(new Date(curr.getFullYear(), curr.getMonth(), 1).toISOString().split('T')[0]);
                setEndDate(new Date(curr.getFullYear(), curr.getMonth() + 1, 0).toISOString().split('T')[0]);
                break;
            case 'last_month':
                setStartDate(new Date(curr.getFullYear(), curr.getMonth() - 1, 1).toISOString().split('T')[0]);
                setEndDate(new Date(curr.getFullYear(), curr.getMonth(), 0).toISOString().split('T')[0]);
                break;
            case 'all':
                setStartDate('2024-01-01');
                setEndDate(curr.toISOString().split('T')[0]);
                break;
        }
    };

    const getTrend = (current: number | undefined, previous: number | undefined) => {
        if (!current || !previous || previous === 0) return null;
        const change = ((current - previous) / previous) * 100;
        return {
            val: Math.abs(change).toFixed(1),
            dir: change >= 0 ? 'up' : 'down'
        };
    };

    const TrendBadge = ({ current, previous, inverse = false }: { current: number | undefined, previous: number | undefined, inverse?: boolean }) => {
        const trend = getTrend(current, previous);
        if (!trend) return null;
        
        const isGood = inverse ? trend.dir === 'down' : trend.dir === 'up';
        
        return (
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${isGood ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                {trend.dir === 'up' ? '↑' : '↓'} {trend.val}%
            </div>
        );
    };

    const getHealthInsight = () => {
        if (!stats) return "Waking up analytics engine...";
        if (stats.netProfit > 0) {
            const trend = getTrend(stats.netProfit, prevStats?.netProfit);
            if (trend?.dir === 'up') return "Excellent profitability trend - Business health is optimal.";
            return "Positive liquidity maintained for the current period.";
        }
        if (stats.netProfit < 0) return "Caution: Operational expenses exceeding revenue for this period.";
        return "Establishing financial baseline for the selected timeframe.";
    };

    const handleAddExpense = async () => {
        if (!newExpense.amount || !newExpense.description) return;
        
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newExpense)
            });
            
            if (res.ok) {
                setAdding(false);
                setNewExpense({
                    category: 'Operations',
                    amount: '',
                    description: '',
                    date: new Date().toISOString().split('T')[0]
                });
                fetchData();
            }
        } catch (e) {
            console.error("Add expense error:", e);
        }
    };

    const handleDeleteExpense = async (id: number) => {
        if (!confirm("Are you sure you want to delete this expense record?")) return;
        
        try {
            const res = await fetch(`http://localhost:3001/api/ai-brain/expenses/${id}`, {
                method: 'DELETE'
            });
            if (res.ok) fetchData();
        } catch (e) {
            console.error("Delete expense error:", e);
        }
    };

    const filteredExpenses = Array.isArray(expenses) ? expenses.filter(e => {
        if (filter === 'all') return true;
        if (filter === 'direct') return e.type === 'direct' || e.type === 'landed_logistics';
        if (filter === 'indirect') return e.type === 'indirect';
        return e.category === filter;
    }) : [];

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 max-w-7xl mx-auto pb-12">
            {/* Header / Top Control Center */}
            <div className="bg-gray-900 text-white p-12 rounded-[4rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.3)] relative overflow-hidden group border border-white/5">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 via-transparent to-emerald-600/5 opacity-60" />
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full -mr-48 -mt-48 transition-all duration-1000 group-hover:bg-purple-600/10" />
                
                <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between gap-12">
                    {/* Branding & Status */}
                    <div className="space-y-6">
                        <div>
                            <div className="flex items-center gap-4 mb-3">
                                <div className="bg-purple-500/20 p-3 rounded-2xl border border-purple-500/30">
                                    <Wallet className="text-purple-400" size={28} />
                                </div>
                                <h3 className="text-4xl font-black tracking-tighter">Finance Hub</h3>
                            </div>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-[0.3em] ml-1">Enterprise Yield & P&L Oversight</p>
                        </div>

                        <div className="flex flex-col gap-2">
                             <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 bg-white/5 py-1.5 px-3 rounded-full border border-white/10">
                                    <Calendar size={10} className="text-purple-400" />
                                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{startDate}</span>
                                    <span className="text-[10px] font-black text-gray-600">→</span>
                                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{endDate}</span>
                                </div>
                                <div className="text-[10px] font-bold text-emerald-400/80 uppercase tracking-widest animate-pulse">● System Live</div>
                            </div>
                            <p className="text-xs font-bold text-gray-400/90 tracking-tight leading-relaxed max-w-sm italic">
                                "{getHealthInsight()}"
                            </p>
                        </div>
                    </div>

                    {/* Interaction Suite */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
                        {/* Intelligence Bar */}
                        <div className="bg-black/40 backdrop-blur-3xl p-2 rounded-[2.5rem] border border-white/10 flex items-center gap-1 shadow-2xl">
                            {[
                                { id: 'today', label: 'Today' },
                                { id: '7days', label: '7D' },
                                { id: 'month', label: 'This Month' },
                                { id: 'last_month', label: 'Prev' },
                                { id: 'all', label: 'All Time' },
                                { id: 'custom', label: '...' }
                            ].map(p => (
                                <button 
                                    key={p.id}
                                    onClick={() => handlePeriodChange(p.id)}
                                    className={`px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${selectedPeriod === p.id ? 'bg-white text-gray-900 shadow-[0_10px_20px_rgba(255,255,255,0.1)]' : 'text-gray-500 hover:text-white hover:bg-white/5'}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        <button 
                            onClick={() => setAdding(true)}
                            className="group relative overflow-hidden bg-gradient-to-r from-white to-white/90 text-gray-900 px-10 py-5 rounded-[2rem] font-black text-[12px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all flex items-center gap-3 shadow-2xl shadow-white/5"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-purple-400 to-emerald-400 opacity-0 group-hover:opacity-10 transition-opacity" />
                            <Plus size={18} className="transition-transform group-hover:rotate-90" /> 
                            Log Spending
                        </button>
                    </div>
                </div>

                <AnimatePresence>
                    {showCustomDates && (
                        <motion.div 
                            initial={{ opacity: 0, y: -20, height: 0 }}
                            animate={{ opacity: 1, y: 0, height: 'auto' }}
                            exit={{ opacity: 0, y: -20, height: 0 }}
                            className="pt-10 relative z-10"
                        >
                            <div className="bg-white/5 backdrop-blur-xl border border-white/10 p-8 rounded-[2.5rem] grid grid-cols-2 gap-8 max-w-2xl">
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.3em] mb-3 block">Primary Audit Date (From)</label>
                                    <input 
                                        type="date" 
                                        value={startDate}
                                        onChange={e => setStartDate(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 text-white rounded-2xl p-4 text-xs font-black outline-none focus:border-purple-400/50 focus:ring-4 focus:ring-purple-400/10 transition-all"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-[0.3em] mb-3 block">Secondary Audit Date (To)</label>
                                    <input 
                                        type="date" 
                                        value={endDate}
                                        onChange={e => setEndDate(e.target.value)}
                                        className="w-full bg-black/20 border border-white/10 text-white rounded-2xl p-4 text-xs font-black outline-none focus:border-purple-400/50 focus:ring-4 focus:ring-purple-400/10 transition-all"
                                    />
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-8">
                        <div className="bg-white/5 backdrop-blur-md rounded-[2.5rem] p-6 border border-white/10 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                    <TrendingUp size={12} className="text-emerald-400" /> Booked Revenue
                                </span>
                                <TrendBadge current={stats?.totalRevenue} previous={prevStats?.totalRevenue} />
                            </div>
                            <div className="mt-4">
                                <span className="text-2xl font-black tracking-tighter">{(stats?.totalRevenue || 0).toLocaleString()}</span>
                                <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                                <p className="text-[8px] font-black text-gray-500 uppercase mt-2 tracking-tighter italic">Total order value (Accrual)</p>
                            </div>
                        </div>

                        <div className="bg-emerald-600/10 backdrop-blur-md rounded-[2.5rem] p-6 border border-emerald-500/20 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                    <Wallet size={12} /> Collected Cash
                                </span>
                                <TrendBadge current={stats?.realizedCash} previous={prevStats?.realizedCash} />
                            </div>
                            <div className="mt-4">
                                <span className="text-2xl font-black tracking-tighter text-emerald-400">{(stats?.realizedCash || 0).toLocaleString()}</span>
                                <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                                <div className="mt-2 h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-emerald-500 transition-all duration-1000" 
                                        style={{ width: `${Math.min(100, ((stats?.realizedCash || 0) / (stats?.totalRevenue || 1)) * 100)}%` }}
                                    />
                                </div>
                                <p className="text-[8px] font-black text-emerald-500/70 uppercase mt-1 tracking-tighter italic">
                                    {Math.round(((stats?.realizedCash || 0) / (stats?.totalRevenue || 1)) * 100)}% Realization Rate
                                </p>
                            </div>
                        </div>

                        <div className="bg-white/10 backdrop-blur-xl rounded-[2.5rem] p-6 border border-white/20 flex flex-col justify-between shadow-xl shadow-purple-500/10">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-purple-300 uppercase tracking-widest flex items-center gap-2">
                                    <DollarSign size={12} /> Net Profit
                                </span>
                                <TrendBadge current={stats?.netProfit} previous={prevStats?.netProfit} />
                            </div>
                            <div className="mt-4">
                                <span className={`text-3xl font-black tracking-tighter ${(stats?.netProfit || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                    {(stats?.netProfit || 0).toLocaleString()}
                                </span>
                                <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                            </div>
                        </div>

                        <div className="bg-indigo-600/20 backdrop-blur-md rounded-[2.5rem] p-6 border border-indigo-500/20 flex flex-col justify-between">
                            <div className="flex justify-between items-start">
                                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                    <Zap size={12} /> Sustainability Hub
                                </span>
                                <span className="text-[8px] font-black text-indigo-300 uppercase px-2 py-0.5 bg-indigo-500/20 rounded-full">Automated</span>
                            </div>
                            <div className="mt-4 space-y-3">
                                <div>
                                    <span className="text-[9px] font-black text-gray-400 uppercase block">Daily Burn Rate</span>
                                    <span className="text-lg font-black text-gray-200">৳{(stats?.burnRate || 0).toLocaleString()}</span>
                                </div>
                                <div>
                                    <span className="text-[9px] font-black text-gray-400 uppercase block">Projected Runway</span>
                                    <span className="text-xl font-black text-emerald-400">
                                        {stats?.burnRate ? Math.floor((stats?.realizedCash || 0) / stats.burnRate) : '∞'} 
                                        <span className="text-[10px] text-gray-400 ml-1">Days</span>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 mt-6">
                        <div className="bg-emerald-600/20 backdrop-blur-md rounded-[2.5rem] p-6 border border-emerald-500/20 flex flex-col justify-between">
                            <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                                <TrendingUp size={12} /> Inventory Assets
                            </span>
                            <div className="mt-2">
                                <span className="text-2xl font-black tracking-tighter text-emerald-400">{(stats?.inventoryValue || 0).toLocaleString()}</span>
                                <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                            </div>
                            <p className="text-[8px] font-black text-gray-500 uppercase mt-2 tracking-tighter leading-none italic">Value of physical stock (Landed)</p>
                        </div>

                        <div className="bg-rose-600/10 backdrop-blur-md rounded-[2.5rem] p-6 border border-rose-500/20 flex flex-col justify-between">
                            <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                                <TrendingDown size={12} /> Period Spending
                            </span>
                            <div className="mt-2">
                                <span className="text-2xl font-black tracking-tighter text-rose-400">{(stats?.totalExpenses || 0).toLocaleString()}</span>
                                <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                            </div>
                        </div>

                        <div className="bg-amber-600/10 backdrop-blur-md rounded-[2.5rem] p-6 border border-amber-500/20 flex flex-col justify-between">
                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                                <TrendingDown size={12} /> Estimated Tax (15%)
                            </span>
                            <div className="mt-2">
                                <span className="text-2xl font-black tracking-tighter text-amber-400">{(stats?.taxLiability || 0).toLocaleString()}</span>
                                <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                            </div>
                            <p className="text-[8px] font-black text-gray-500 uppercase mt-2 tracking-tighter leading-none italic">Projected liability for current profit</p>
                        </div>

                        <div className="bg-indigo-600/20 backdrop-blur-md rounded-[2.5rem] p-6 border border-indigo-500/20 flex flex-col justify-between">
                            <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                <Tag size={12} /> Period Spend Audit
                            </span>
                            <div className="mt-2">
                                <div className="flex items-baseline gap-2">
                                    <span className="text-2xl font-black tracking-tighter text-indigo-400">{(stats?.periodLandedSpend || 0).toLocaleString()}</span>
                                    <span className="text-[8px] font-bold text-indigo-300 uppercase">Landed</span>
                                </div>
                                <div className="text-[8px] font-bold text-gray-500 mt-1 uppercase">
                                    Goods: ৳{(stats?.periodBaseSpend || 0).toLocaleString()} 
                                </div>
                                <div className="text-[8px] font-bold text-gray-400 mt-0.5 uppercase">
                                    Logs: ৳{((stats?.periodLandedSpend || 0) - (stats?.periodBaseSpend || 0)).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>

            {/* Filter & Toolbar */}
            <div className="flex items-center gap-4 px-4 overflow-x-auto pb-2 no-scrollbar">
                <button 
                    onClick={() => setFilter('all')}
                    className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'all' ? 'bg-gray-900 text-white shadow-lg' : 'bg-white text-gray-400 border border-gray-100 hover:border-gray-300'}`}
                >
                    All Entries
                </button>
                <div className="w-px h-6 bg-gray-200 mx-2" />
                <button 
                    onClick={() => setFilter('direct')}
                    className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'direct' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-200' : 'bg-white text-gray-400 border border-gray-100'}`}
                >
                    Direct / Landed
                </button>
                <button 
                    onClick={() => setFilter('indirect')}
                    className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${filter === 'indirect' ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-white text-gray-400 border border-gray-100'}`}
                >
                    Indirect (Overhead)
                </button>
                {categories.map(cat => (
                    <button 
                        key={cat}
                        onClick={() => setFilter(cat)}
                        className={`px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all whitespace-nowrap ${filter === cat ? 'bg-gray-700 text-white shadow-lg' : 'bg-white text-gray-400 border border-gray-100'}`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {/* Ledger Table */}
            <div className="bg-white rounded-[3.5rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-8 border-b border-gray-50 flex justify-between items-center">
                    <h4 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center gap-2">
                        <FileText className="text-gray-400" /> Daily Expense Ledger
                    </h4>
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        Showing {filteredExpenses.length} Records
                    </span>
                </div>
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount (Tk)</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Type</th>
                                <th className="px-10 py-6"></th>
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {filteredExpenses.map((e) => (
                                    <motion.tr 
                                        key={e.id}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="group hover:bg-gray-50/50 transition-all border-b border-gray-50 last:border-0"
                                    >
                                        <td className="px-10 py-6">
                                            <div className="text-xs font-black text-gray-400 uppercase flex items-center gap-2">
                                                <Calendar size={12} /> {new Date(e.expense_date).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="px-10 py-6">
                                            <span className="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-black uppercase tracking-wider">
                                                {e.category}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6">
                                            <div className="flex flex-col">
                                                <span className="text-[13px] font-bold text-gray-900 group-hover:text-purple-600 transition-colors uppercase tracking-tight">{e.description}</span>
                                                {e.reference_id && (
                                                    <span className="text-[9px] font-black text-gray-400 tracking-widest flex items-center gap-1 mt-1">
                                                        <Tag size={10} /> {e.reference_id}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-10 py-6 text-right">
                                            <span className="text-sm font-black text-gray-900 tracking-tighter">
                                                {e.amount.toLocaleString()}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6 text-center">
                                            <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                                e.type === 'direct' ? 'bg-emerald-50 text-emerald-600' : 
                                                e.type === 'landed_logistics' ? 'bg-indigo-50 text-indigo-600' : 
                                                'bg-purple-50 text-purple-600'
                                            }`}>
                                                {e.type.replace('_', ' ')}
                                            </span>
                                        </td>
                                        <td className="px-10 py-6 text-right">
                                            <button 
                                                onClick={() => handleDeleteExpense(e.id)}
                                                className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl opacity-0 group-hover:opacity-100 transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                            
                            {filteredExpenses.length === 0 && !loading && (
                                <tr>
                                    <td colSpan={6} className="px-10 py-32 text-center">
                                        <div className="flex flex-col items-center opacity-20">
                                            <Wallet size={48} className="mb-4" />
                                            <p className="text-xs font-black uppercase tracking-[0.3em]">No expense records found</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Manual Entry Modal */}
            <AnimatePresence>
                {adding && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-900/40 backdrop-blur-sm">
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl overflow-hidden border border-gray-100"
                        >
                            <div className="px-10 py-8 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-black text-gray-900 tracking-tight">Record Manual Outlet</h2>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Add non-procurement business costs</p>
                                </div>
                                <button onClick={() => setAdding(false)} className="p-2.5 bg-white border border-gray-100 text-gray-400 rounded-xl hover:text-gray-900 transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-10 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Category</label>
                                        <select 
                                            value={newExpense.category}
                                            onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all appearance-none"
                                        >
                                            {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Amount (Tk)</label>
                                        <input 
                                            type="number" 
                                            placeholder="0.00"
                                            value={newExpense.amount}
                                            onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Description</label>
                                    <input 
                                        type="text" 
                                        placeholder="e.g. Office Rent for April"
                                        value={newExpense.description}
                                        onChange={e => setNewExpense({...newExpense, description: e.target.value})}
                                        className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 block ml-2">Date</label>
                                    <input 
                                        type="date" 
                                        value={newExpense.date}
                                        onChange={e => setNewExpense({...newExpense, date: e.target.value})}
                                        className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all font-mono"
                                    />
                                </div>

                                <button 
                                    onClick={handleAddExpense}
                                    className="w-full bg-gray-900 text-white py-5 rounded-3xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-xl shadow-gray-200 active:scale-95"
                                >
                                    Confirm Entry
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}
