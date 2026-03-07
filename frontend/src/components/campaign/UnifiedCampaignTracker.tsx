import React, { useState, useEffect, useMemo } from 'react';
import { Play, Pause, XCircle, RefreshCw, Eye, History, AlertTriangle, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getStatusColor = (status: string) => {
    switch (status) {
        case 'completed': return 'bg-green-100 text-green-700 border-green-200';
        case 'running': return 'bg-blue-100 text-blue-700 border-blue-200';
        case 'paused': return 'bg-amber-100 text-amber-700 border-amber-200';
        case 'cancelled': return 'bg-red-100 text-red-700 border-red-200';
        case 'failed': return 'bg-rose-100 text-rose-700 border-rose-200';
        default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
};

const UnifiedCampaignTracker: React.FC<any> = ({ socket, onPause, onResume, onCancel, campaignExecution }) => {
    const [campaigns, setCampaigns] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedCampaign, setSelectedCampaign] = useState<any>(null);
    const [details, setDetails] = useState<any>(null);
    const [resending, setResending] = useState(false);

    // Pagination states
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    useEffect(() => {
        fetchCampaigns();

        if (socket) {
            socket.on('scheduled_campaigns_changed', fetchCampaigns);
            socket.on('process_end', fetchCampaigns);
        }

        return () => {
            if (socket) {
                socket.off('scheduled_campaigns_changed', fetchCampaigns);
                socket.off('process_end', fetchCampaigns);
            }
        };
    }, [socket]);

    const fetchCampaigns = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/campaigns');
            const data = await res.json();
            if (data.success) {
                setCampaigns(data.campaigns);
            }
        } catch (err) {
            console.error('Failed to fetch unified campaigns:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleViewDetails = async (campaign: any) => {
        setSelectedCampaign(campaign);
        setDetails(null);
        try {
            const res = await fetch(`http://localhost:3001/api/campaigns/${campaign.id}/details`);
            const data = await res.json();
            if (data.success) {
                setDetails(data);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSmartResend = async () => {
        if (!selectedCampaign || resending) return;
        setResending(true);
        try {
            const res = await fetch(`http://localhost:3001/api/campaigns/${selectedCampaign.id}/resend`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert(`Smart Resend initialized for ${data.resentCount} failed numbers!`);
                setSelectedCampaign(null);
                fetchCampaigns();
            } else {
                alert(`Failed to resend: ${data.error || data.message}`);
            }
        } catch (err) {
            console.error(err);
            alert('Error starting resend.');
        } finally {
            setResending(false);
        }
    };

    // Calculate pagination data
    const totalPages = Math.ceil(campaigns.length / itemsPerPage);
    const currentCampaigns = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return campaigns.slice(startIndex, startIndex + itemsPerPage);
    }, [campaigns, currentPage, itemsPerPage]);

    // Handle page changes
    const goToNextPage = () => setCurrentPage(prev => Math.min(prev + 1, totalPages));
    const goToPrevPage = () => setCurrentPage(prev => Math.max(prev - 1, 1));

    if (loading) {
        return (
            <div className="bg-white/50 backdrop-blur-xl border border-gray-200/50 rounded-3xl p-8 shadow-xl mb-6">
                <div className="flex items-center justify-center p-8">
                    <RefreshCw className="w-8 h-8 text-wa-teal animate-spin" />
                </div>
            </div>
        );
    }

    return (
        <React.Fragment>
            <div className="bg-white/50 backdrop-blur-xl border border-gray-200/50 rounded-3xl p-8 shadow-xl mb-6 mt-10 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-500/10 to-teal-500/10 rounded-bl-[100px] -z-10" />

                <div className="flex items-center gap-3 mb-6">
                    <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/20 text-white">
                        <History size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 tracking-tight">
                            Unified Tracker
                        </h2>
                        <p className="text-sm font-medium text-gray-500 mt-1">
                            Track every campaign and smartly resend to failed numbers.
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto rounded-xl border border-gray-100 shadow-inner bg-white/40">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-100/80 text-gray-500 text-xs uppercase tracking-wider font-semibold">
                                <th className="p-4">Name / Date</th>
                                <th className="p-4 text-center">Type</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-center">Progress</th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {currentCampaigns.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="p-8 text-center text-gray-400">
                                        No campaigns found.
                                    </td>
                                </tr>
                            ) : currentCampaigns.map(camp => {
                                const progress = camp.total_recipients > 0 ? Math.round(((camp.sent_count + camp.fail_count) / camp.total_recipients) * 100) : 0;

                                return (
                                    <tr key={camp.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="p-4">
                                            <div className="font-semibold text-gray-800">{camp.name}</div>
                                            <div className="text-xs text-gray-400 mt-1">{new Date(camp.created_at).toLocaleString()}</div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className="px-2 py-1 text-xs font-bold uppercase rounded bg-gray-100 text-gray-600 border border-gray-200">
                                                {camp.type}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getStatusColor(camp.status)} uppercase tracking-wide inline-flex items-center gap-1.5 shadow-sm`}>
                                                {camp.status}
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col items-center">
                                                <div className="w-full bg-gray-200 rounded-full h-2 mb-1">
                                                    <div className="bg-indigo-500 h-2 rounded-full" style={{ width: `${progress}%` }}></div>
                                                </div>
                                                <div className="text-xs font-medium text-gray-500 flex gap-2">
                                                    <span className="text-green-600">{camp.sent_count} S</span>
                                                    <span>/</span>
                                                    <span className="text-red-500">{camp.fail_count} F</span>
                                                    <span>/</span>
                                                    <span>{camp.total_recipients} T</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <button
                                                onClick={() => handleViewDetails(camp)}
                                                className="p-2 text-indigo-500 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-all"
                                                title="View Report & Resend"
                                            >
                                                <Eye size={18} />
                                            </button>

                                            {/* Legacy Controls for Scheduled ones */}
                                            {camp.status === 'running' && camp.type === 'scheduled' && (
                                                <button onClick={() => onPause(camp.id)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition-all ml-2" title="Pause">
                                                    <Pause size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 bg-white/50 border-t border-gray-100 mt-2 rounded-xl">
                        <div className="text-sm text-gray-500">
                            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, campaigns.length)}</span> of <span className="font-medium">{campaigns.length}</span> campaigns
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={goToPrevPage}
                                disabled={currentPage === 1}
                                className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            >
                                <ChevronLeft size={16} /> Prev
                            </button>
                            <div className="flex items-center px-4 font-medium text-gray-700">
                                Page {currentPage} of {totalPages}
                            </div>
                            <button
                                onClick={goToNextPage}
                                disabled={currentPage === totalPages}
                                className="p-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                            >
                                Next <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Campaign Details Modal with Smart Resend */}
            <AnimatePresence>
                {selectedCampaign && (
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 min-h-screen">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] flex flex-col"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-slate-900 border-b border-white/10 px-6 py-5 flex items-center justify-between">
                                <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                    <History size={20} className="text-indigo-400" />
                                    Campaign Report: {selectedCampaign.name}
                                </h3>
                                <button onClick={() => setSelectedCampaign(null)} className="text-gray-400 hover:text-white transition-colors">
                                    <XCircle size={28} />
                                </button>
                            </div>

                            <div className="p-6 flex-1 overflow-y-auto custom-scrollbar bg-slate-50">
                                {!details ? (
                                    <div className="flex justify-center p-12">
                                        <RefreshCw className="animate-spin text-indigo-500" size={32} />
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm text-center">
                                                <div className="text-sm font-medium text-gray-500 mb-1">Total Targets</div>
                                                <div className="text-3xl font-black text-gray-800">{details.summary.total}</div>
                                            </div>
                                            <div className="bg-green-50 p-4 rounded-xl border border-green-100 shadow-sm text-center">
                                                <div className="text-sm font-medium text-green-600 mb-1">Delivered</div>
                                                <div className="text-3xl font-black text-green-700">{details.summary.sent}</div>
                                            </div>
                                            <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm text-center">
                                                <div className="text-sm font-medium text-red-600 mb-1">Failed</div>
                                                <div className="text-3xl font-black text-red-700">{details.summary.failed}</div>
                                            </div>
                                        </div>

                                        <div className="bg-white border text-sm text-gray-600 border-gray-200 rounded-xl overflow-hidden shadow-sm h-64 overflow-y-auto custom-scrollbar">
                                            <table className="w-full text-left">
                                                <thead className="bg-gray-50 sticky top-0 border-b">
                                                    <tr>
                                                        <th className="p-3">Phone</th>
                                                        <th className="p-3">Name</th>
                                                        <th className="p-3">Status</th>
                                                        <th className="p-3">Sent At</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {details.messages.map((m: any) => (
                                                        <tr key={m.id}>
                                                            <td className="p-3 font-medium">{m.number}</td>
                                                            <td className="p-3">{m.contactName}</td>
                                                            <td className="p-3">
                                                                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${m.status.startsWith('error') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                                    {m.status}
                                                                </span>
                                                            </td>
                                                            <td className="p-3 text-gray-400">{new Date(m.timestamp).toLocaleTimeString()}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center justify-between">
                                {details && details.summary.failed > 0 && selectedCampaign.status !== 'running' ? (
                                    <p className="text-sm text-gray-500 flex items-center gap-2">
                                        <AlertTriangle size={16} className="text-amber-500" />
                                        This campaign has {details.summary.failed} missed targets.
                                    </p>
                                ) : <div />}

                                <div className="flex gap-3">
                                    <button
                                        onClick={() => setSelectedCampaign(null)}
                                        className="px-6 py-2.5 rounded-xl font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors"
                                    >
                                        Close
                                    </button>

                                    {details && details.summary.failed > 0 && selectedCampaign.status !== 'running' && (
                                        <button
                                            onClick={handleSmartResend}
                                            disabled={resending}
                                            className="px-6 py-2.5 rounded-xl font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2 shadow-lg shadow-indigo-600/30"
                                        >
                                            {resending ? <RefreshCw className="animate-spin" size={18} /> : <Send size={18} />}
                                            Smart Resend to Failed
                                        </button>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </React.Fragment>
    );
};

export default UnifiedCampaignTracker;
