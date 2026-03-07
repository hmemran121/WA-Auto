import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    BarChart3,
    TrendingUp,
    CheckCircle2,
    MessageCircle,
    Eye,
    ChevronRight,
    Search,
    Filter,
    ArrowUpRight,
    Loader2,
    RefreshCw,
    Calendar,
    ArrowLeft,
    Clock,
    User,
    Check,
    Download
} from 'lucide-react';
import { io } from 'socket.io-client';

interface TemplateStat {
    id: number;
    title: string;
    category: string;
    total_sent: number;
    delivered: number;
    read: number;
    responses: number;
}

interface InteractionDetail {
    whatsapp_id: string;
    status: string;
    responded: number;
    timestamp: string;
    number: string;
    contact_name: string | null;
}

interface PeakHourStat {
    hour: string;
    total_sent: number;
    delivered: number;
    read: number;
    responses: number;
}

interface MediaStat {
    media_type: string;
    total_sent: number;
    delivered: number;
    read: number;
    responses: number;
}

interface AudienceStat {
    tag: string;
    total_sent: number;
    delivered: number;
    read: number;
    responses: number;
}

const AnalyticsView: React.FC = () => {
    const [stats, setStats] = useState<TemplateStat[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTemplate, setSelectedTemplate] = useState<TemplateStat | null>(null);
    const [interactions, setInteractions] = useState<InteractionDetail[]>([]);
    const [peakHours, setPeakHours] = useState<PeakHourStat[]>([]);
    const [mediaStats, setMediaStats] = useState<MediaStat[]>([]);
    const [audienceStats, setAudienceStats] = useState<AudienceStat[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [dateRange, setDateRange] = useState<'today' | '7d' | '30d' | 'all'>('all');

    const fetchStats = useCallback(async () => {
        setLoading(true);
        try {
            let url = 'http://localhost:3001/api/analytics/templates';
            const params = new URLSearchParams();

            if (dateRange === 'today') {
                params.append('startDate', new Date().toISOString().split('T')[0]);
            } else if (dateRange === '7d') {
                const d = new Date();
                d.setDate(d.getDate() - 7);
                params.append('startDate', d.toISOString());
            } else if (dateRange === '30d') {
                const d = new Date();
                d.setDate(d.getDate() - 30);
                params.append('startDate', d.toISOString());
            }

            const response = await fetch(`${url}?${params.toString()}`);
            const data = await response.json();
            setStats(data);

            // Fetch extra analytics with same filters
            const extraParams = new URLSearchParams(params);
            if (selectedTemplate) {
                extraParams.append('id', selectedTemplate.id);
            }

            const [peakData, mediaData, audienceData] = await Promise.all([
                fetch(`http://localhost:3001/api/analytics/peak-hours?${extraParams.toString()}`).then(res => res.json()),
                fetch(`http://localhost:3001/api/analytics/media-performance?${params.toString()}`).then(res => res.json()),
                fetch(`http://localhost:3001/api/analytics/audience-performance?${params.toString()}`).then(res => res.json())
            ]);
            setPeakHours(peakData);
            setMediaStats(mediaData);
            setAudienceStats(audienceData);

        } catch (err) {
            console.error('Failed to fetch analytics:', err);
        } finally {
            setLoading(false);
        }
    }, [dateRange, selectedTemplate]);

    const fetchDetails = async (templateId: number) => {
        setLoadingDetails(true);
        try {
            const response = await fetch(`http://localhost:3001/api/analytics/templates/${templateId}/details`);
            const data = await response.json();
            setInteractions(data);
        } catch (err) {
            console.error('Failed to fetch interaction details:', err);
        } finally {
            setLoadingDetails(false);
        }
    };

    useEffect(() => {
        fetchStats();

        // Socket for real-time updates
        const socket = io('http://localhost:3001');
        socket.on('analytics_update', () => {
            console.log('Analytics update received from socket...');
            fetchStats();
            if (selectedTemplate) fetchDetails(selectedTemplate.id);
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchStats, selectedTemplate]);

    const exportToCSV = () => {
        if (stats.length === 0) return;

        const headers = ["Template", "Category", "Sent", "Delivered", "Read", "Replied", "Read Rate %", "Engagement %"];
        const rows = stats.map(s => [
            s.title,
            s.category || 'General',
            s.total_sent,
            s.delivered,
            s.read,
            s.responses,
            ((s.read / (s.delivered || 1)) * 100).toFixed(2),
            ((s.responses / (s.read || 1)) * 100).toFixed(2)
        ]);

        const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `analytics_report_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const filteredStats = stats.filter(s =>
        s.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const totalSent = stats.reduce((acc, s) => acc + s.total_sent, 0);
    const totalDelivered = stats.reduce((acc, s) => acc + s.delivered, 0);
    const totalRead = stats.reduce((acc, s) => acc + s.read, 0);
    const totalResponses = stats.reduce((acc, s) => acc + s.responses, 0);

    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;
    const readRate = totalDelivered > 0 ? (totalRead / totalDelivered) * 100 : 0;
    const responseRate = totalRead > 0 ? (totalResponses / totalRead) * 100 : 0;

    if (selectedTemplate) {
        return (
            <div className="max-w-[1400px] mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setSelectedTemplate(null)}
                        className="p-3 bg-white border border-gray-100 text-gray-400 hover:text-wa-teal hover:border-wa-teal rounded-2xl transition-all shadow-sm"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-3xl font-black text-gray-900 tracking-tight">{selectedTemplate.title}</h1>
                        <p className="text-gray-500 font-medium">Detailed interaction logs and metrics.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <MiniMetricCard title="Sent" value={selectedTemplate.total_sent} color="blue" />
                    <MiniMetricCard title="Delivered" value={selectedTemplate.delivered} color="green" />
                    <MiniMetricCard title="Read" value={selectedTemplate.read} color="purple" />
                    <MiniMetricCard title="Replied" value={selectedTemplate.responses} color="orange" />
                </div>

                <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden">
                    <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                        <div className="flex items-center gap-3 font-black text-gray-900 uppercase tracking-widest text-xs">
                            <Clock size={16} className="text-wa-teal" />
                            Live Activity Stream
                        </div>
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-white px-4 py-2 rounded-full border border-gray-100">
                            Auto-updating
                        </div>
                    </div>

                    {loadingDetails ? (
                        <div className="py-24 flex flex-col items-center justify-center gap-4">
                            <Loader2 className="animate-spin text-wa-teal" size={48} />
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-8 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Contact</th>
                                        <th className="px-8 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Time</th>
                                        <th className="px-8 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Status</th>
                                        <th className="px-8 py-4 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {interactions.map((it, idx) => (
                                        <motion.tr
                                            key={it.whatsapp_id}
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: idx * 0.03 }}
                                            className="hover:bg-gray-50/50 transition-colors"
                                        >
                                            <td className="px-8 py-5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
                                                        <User size={16} />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-gray-900">{it.contact_name || it.number}</p>
                                                        <p className="text-[10px] text-gray-400 font-bold">{it.number}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-8 py-5">
                                                <span className="text-xs font-medium text-gray-500">
                                                    {new Date(it.timestamp).toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-8 py-5">
                                                <StatusBadge status={it.status} responded={it.responded} />
                                            </td>
                                            <td className="px-8 py-5 text-right">
                                                <button
                                                    onClick={() => {
                                                        (window as any).setSelectedChat(it.number);
                                                        (window as any).setActiveTab('messages');
                                                    }}
                                                    className="text-wa-teal font-black text-[10px] uppercase underline tracking-widest hover:text-wa-teal/70 transition-colors"
                                                >
                                                    Chat
                                                </button>
                                            </td>
                                        </motion.tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1400px] mx-auto space-y-8 pb-12">
            {/* Header section */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight">Real-time Analytics</h1>
                    <p className="text-gray-500 mt-2 font-medium">Smart performance tracking with live data stream.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex bg-white p-1.5 rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        {(['all', 'today', '7d', '30d'] as const).map(range => (
                            <button
                                key={range}
                                onClick={() => setDateRange(range)}
                                className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${dateRange === range
                                    ? 'bg-wa-teal text-white shadow-lg shadow-wa-teal/20'
                                    : 'text-gray-400 hover:text-gray-600'
                                    }`}
                            >
                                {range}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={fetchStats}
                        className="p-3.5 bg-white border border-gray-100 text-gray-400 hover:text-wa-teal hover:border-wa-teal rounded-2xl transition-all shadow-sm group"
                    >
                        <RefreshCw size={20} className={loading ? "animate-spin" : "group-hover:rotate-180 transition-transform duration-500"} />
                    </button>

                    <button
                        onClick={exportToCSV}
                        disabled={loading || stats.length === 0}
                        className="flex items-center gap-2 px-6 py-3.5 bg-wa-teal text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-wa-teal/20 hover:bg-wa-teal/90 transition-all disabled:opacity-50"
                    >
                        <Download size={18} />
                        Export Report
                    </button>
                </div>
            </div>

            {/* Top metrics cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard
                    title="Total Sent"
                    value={totalSent}
                    icon={<BarChart3 className="text-blue-600" size={24} />}
                    color="blue"
                    trend="+12% vs last period"
                    isLoading={loading}
                />
                <MetricCard
                    title="Delivery Rate"
                    value={`${deliveryRate.toFixed(1)}%`}
                    icon={<CheckCircle2 className="text-green-600" size={24} />}
                    color="green"
                    trend="High efficiency"
                    isLoading={loading}
                />
                <MetricCard
                    title="Read Rate"
                    value={`${readRate.toFixed(1)}%`}
                    icon={<Eye className="text-purple-600" size={24} />}
                    color="purple"
                    trend="Users are viewing"
                    isLoading={loading}
                />
                <MetricCard
                    title="Response Rate"
                    value={`${responseRate.toFixed(1)}%`}
                    icon={<MessageCircle className="text-orange-600" size={24} />}
                    color="orange"
                    trend="Direct engagement"
                    isLoading={loading}
                />
            </div>

            {/* Performance Visualization (Placeholder for custom SVG chart if needed, but metrics are already dynamic) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-gray-100 shadow-xl overflow-hidden flex flex-col">
                    <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-wa-teal/10 rounded-2xl">
                                <TrendingUp size={24} className="text-wa-teal" />
                            </div>
                            <h2 className="text-xl font-black text-gray-900">Campaign Performance</h2>
                        </div>
                        <div className="relative flex-1 max-w-xs ml-auto group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-wa-teal transition-colors" size={18} />
                            <input
                                type="text"
                                placeholder="Search templates..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-transparent focus:border-wa-teal focus:bg-white rounded-2xl outline-none transition-all text-sm font-medium"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-24 flex flex-col items-center justify-center gap-4 flex-1">
                            <Loader2 className="animate-spin text-wa-teal" size={48} />
                        </div>
                    ) : (
                        <div className="overflow-x-auto flex-1">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50">
                                    <tr>
                                        <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Asset Name</th>
                                        <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest">Reach</th>
                                        <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest text-center">Efficiency</th>
                                        <th className="px-8 py-5 text-xs font-black text-gray-400 uppercase tracking-widest text-right">Details</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    <AnimatePresence mode="popLayout">
                                        {filteredStats.map((template, idx) => (
                                            <motion.tr
                                                key={template.id}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                transition={{ delay: idx * 0.05 }}
                                                className="group hover:bg-wa-teal/[0.02] transition-colors cursor-pointer"
                                                onClick={() => {
                                                    setSelectedTemplate(template);
                                                    fetchDetails(template.id);
                                                }}
                                            >
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-10 w-10 bg-gray-100 rounded-xl flex items-center justify-center font-black text-gray-400 group-hover:bg-wa-teal/10 group-hover:text-wa-teal transition-all">
                                                            {template.title.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold text-gray-900">{template.title}</p>
                                                            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{template.category || 'General'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col">
                                                        <span className="font-black text-gray-900 text-lg leading-none">{template.total_sent}</span>
                                                        <span className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-tighter">Contacts</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6">
                                                    <div className="flex flex-col items-center gap-2 max-w-[120px] mx-auto">
                                                        <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                                                            <motion.div
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${(template.delivered / (template.total_sent || 1)) * 100}%` }}
                                                                className="h-full bg-wa-teal rounded-full"
                                                            />
                                                        </div>
                                                        <div className="flex justify-between w-full text-[9px] font-black text-gray-400">
                                                            <span>{((template.delivered / (template.total_sent || 1)) * 100).toFixed(0)}% DELIV.</span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    <div className="inline-flex p-2.5 bg-gray-50 text-gray-400 group-hover:bg-wa-teal group-hover:text-white rounded-xl transition-all">
                                                        <ChevronRight size={18} />
                                                    </div>
                                                </td>
                                            </motion.tr>
                                        ))}
                                    </AnimatePresence>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="bg-wa-sidebar rounded-[2.5rem] p-8 text-white shadow-2xl relative overflow-hidden">
                    <div className="absolute -right-20 -top-20 w-64 h-64 bg-wa-teal/20 rounded-full blur-[80px]"></div>
                    <div className="relative z-10 space-y-8">
                        <div>
                            <h3 className="text-xl font-black tracking-tight">Enterprise Insights</h3>
                            <p className="text-gray-400 mt-1 font-medium">Smart audience and media evaluation.</p>
                        </div>

                        <div className="space-y-6">
                            <div className="bg-white/5 p-5 rounded-[1.5rem] border border-white/5">
                                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Top Media Channel</p>
                                {mediaStats.length > 0 ? (
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-lg capitalize">{mediaStats.sort((a, b) => b.read - a.read)[0].media_type}</span>
                                        <span className="text-wa-teal font-black">Best Engagement</span>
                                    </div>
                                ) : <p className="text-sm">No data yet</p>}
                            </div>

                            <div className="bg-white/5 p-5 rounded-[1.5rem] border border-white/5">
                                <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Audience Sweet Spot</p>
                                {audienceStats.length > 0 ? (
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-lg">{audienceStats.sort((a, b) => b.responses - a.responses)[0].tag}</span>
                                        <span className="text-orange-400 font-black">Most Collaborative</span>
                                    </div>
                                ) : <p className="text-sm">No data yet</p>}
                            </div>
                        </div>

                        <div className="pt-4 p-6 bg-white/5 rounded-[2rem] border border-white/10">
                            <p className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-4">Real-time Recommendation</p>
                            <p className="text-sm font-medium leading-relaxed">
                                {peakHours.length > 0 ? (
                                    <>Based on your data, your peak engagement hour is <span className="text-wa-teal font-black">{peakHours.sort((a, b) => b.read - a.read)[0].hour}:00</span>. Schedule your next campaign then for maximum impact.</>
                                ) : "Your analytics engine is stabilizing. Keep sending to see smarter recommendations."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Phase 6: Enterprise Visuals */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-12">
                {/* Peak Hours Heatmap */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl">
                                <Clock size={20} />
                            </div>
                            <h3 className="font-black text-gray-900 tracking-tight">24h Engagement Heatmap</h3>
                        </div>
                    </div>

                    <div className="grid grid-cols-12 gap-2 h-48 items-end">
                        {Array.from({ length: 24 }).map((_, i) => {
                            const hourStr = i.toString().padStart(2, '0');
                            const data = peakHours.find(p => p.hour === hourStr);
                            const height = data ? Math.max(10, (data.read / (totalRead || 1)) * 100) : 5;
                            return (
                                <div key={i} className="group relative flex flex-col items-center gap-2 h-full justify-end">
                                    <div className="absolute -top-8 bg-gray-900 text-white text-[9px] font-black px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-20 whitespace-nowrap">
                                        {hourStr}:00 - {data?.read || 0} Reads
                                    </div>
                                    <motion.div
                                        initial={{ height: 0 }}
                                        animate={{ height: `${height}%` }}
                                        className={`w-full rounded-t-lg transition-all ${data && data.read > 0 ? 'bg-purple-500 hover:bg-purple-600' : 'bg-gray-100'}`}
                                    />
                                    <span className="text-[8px] font-black text-gray-400">{i % 4 === 0 ? i + 'h' : ''}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Media Type Performance */}
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-xl space-y-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
                                <TrendingUp size={20} />
                            </div>
                            <h3 className="font-black text-gray-900 tracking-tight">Media Channel Impact</h3>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {mediaStats.length > 0 ? mediaStats.map(m => (
                            <div key={m.media_type} className="space-y-1.5">
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">{m.media_type}</span>
                                    <span className="text-xs font-black text-gray-900 leading-none">{((m.read / (m.total_sent || 1)) * 100).toFixed(1)}% Read Rate</span>
                                </div>
                                <div className="h-2 bg-gray-50 rounded-full overflow-hidden border border-gray-100">
                                    <motion.div
                                        initial={{ width: 0 }}
                                        animate={{ width: `${(m.read / (m.total_sent || 1)) * 100}%` }}
                                        className="h-full bg-wa-teal rounded-full"
                                    />
                                </div>
                            </div>
                        )) : (
                            <div className="h-full flex items-center justify-center text-gray-400 text-sm py-12">
                                Waiting for cross-media data...
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MiniMetricCard: React.FC<{ title: string; value: number; color: string }> = ({ title, value, color }) => {
    const bgColors: any = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        purple: 'bg-purple-50 text-purple-600',
        orange: 'bg-orange-50 text-orange-600'
    };
    return (
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm flex flex-col gap-2">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{title}</span>
            <div className={`p-2 w-fit rounded-lg text-lg font-black ${bgColors[color]}`}>{value}</div>
        </div>
    );
}

const StatusBadge: React.FC<{ status: string; responded: number }> = ({ status, responded }) => {
    if (responded) return (
        <span className="px-3 py-1 bg-orange-50 text-orange-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-orange-100 flex items-center gap-1.5 w-fit">
            <MessageCircle size={10} /> Replied
        </span>
    );

    if (status === 'read') return (
        <span className="px-3 py-1 bg-purple-50 text-purple-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-purple-100 flex items-center gap-1.5 w-fit">
            <Eye size={10} /> Read
        </span>
    );

    if (status === 'delivered') return (
        <span className="px-3 py-1 bg-green-50 text-green-600 rounded-lg text-[9px] font-black uppercase tracking-widest border border-green-100 flex items-center gap-1.5 w-fit">
            <Check size={10} /> Delivered
        </span>
    );

    return (
        <span className="px-3 py-1 bg-gray-50 text-gray-400 rounded-lg text-[9px] font-black uppercase tracking-widest border border-gray-100 w-fit">
            Sent
        </span>
    );
}

const HealthItem: React.FC<{ label: string; status: string; color: string }> = ({ label, status, color }) => (
    <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-300">{label}</span>
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full bg-${color === 'wa-teal' ? 'wa-teal' : color + '-500'} animate-pulse`}></div>
            <span className={`text-xs font-black uppercase tracking-widest text-${color === 'wa-teal' ? 'wa-teal' : color + '-400'}`}>{status}</span>
        </div>
    </div>
);

interface MetricCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    color: 'blue' | 'green' | 'purple' | 'orange';
    trend: string;
    isLoading?: boolean;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, color, trend, isLoading }) => {
    const colors = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        purple: 'bg-purple-50 text-purple-600',
        orange: 'bg-orange-50 text-orange-600'
    };

    return (
        <motion.div
            whileHover={{ y: -5 }}
            className="p-8 bg-white border border-gray-100 rounded-[2.5rem] shadow-sm hover:shadow-xl transition-all"
        >
            <div className="flex items-center justify-between mb-6">
                <div className={`p-4 rounded-2xl ${colors[color]}`}>
                    {icon}
                </div>
                <div className="flex items-center gap-1 px-3 py-1 bg-wa-teal/5 text-wa-teal rounded-full text-[9px] font-black uppercase tracking-widest">
                    {trend}
                </div>
            </div>
            <p className="text-gray-400 font-bold tracking-widest text-[11px] uppercase">{title}</p>
            {isLoading ? (
                <div className="h-9 w-24 bg-gray-50 animate-pulse rounded-lg mt-1"></div>
            ) : (
                <h3 className="text-3xl font-black text-gray-900 mt-1">{value}</h3>
            )}
        </motion.div>
    );
};

export default AnalyticsView;
