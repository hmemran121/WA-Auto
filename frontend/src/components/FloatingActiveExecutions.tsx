
import React, { useState, useEffect } from 'react';
import {
    Activity,
    ChevronDown,
    ChevronUp,
    Pause,
    Play,
    X,
    CheckCircle2,
    AlertCircle,
    Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface ActiveExecution {
    id: string;
    type: string;
    current_index: number;
    total_count: number;
    status: 'running' | 'paused';
    status_detail?: 'active' | 'batch_break' | 'window_wait' | 'jitter_wait' | 'quota_reached';
    updated_at: string;
}

const FloatingActiveExecutions: React.FC<{ socket: any }> = ({ socket }) => {
    const [executions, setExecutions] = useState<ActiveExecution[]>([]);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        fetchActiveExecutions();

        if (socket) {
            socket.on('active_executions_sync', (data: ActiveExecution[]) => {
                setExecutions(data);
            });

            socket.on('process_update', (data: any) => {
                // Handle specific process updates if needed, 
                // but sync usually comes back frequently or on change
                fetchActiveExecutions();
            });
        }

        return () => {
            if (socket) {
                socket.off('active_executions_sync');
                socket.off('process_update');
            }
        };
    }, [socket]);

    const fetchActiveExecutions = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/campaigns/active');
            const data = await res.json();
            if (data.success) {
                setExecutions(data.executions);
            }
        } catch (e) {
            console.error('Failed to fetch active executions:', e);
        }
    };

    const handleToggleStatus = async (exe: ActiveExecution) => {
        const action = exe.status === 'running' ? 'pause' : 'resume';
        try {
            // Endpoint depends on type (instant vs scheduled)
            // For now, let's assume we use a unified patch endpoint or specialized ones
            const url = exe.type === 'instant'
                ? `http://localhost:3001/api/processes/${exe.id}/${action}`
                : `http://localhost:3001/api/campaigns/scheduled/${exe.id}/${action}`;

            await fetch(url, { method: 'PATCH' });
            fetchActiveExecutions();
        } catch (e) {
            console.error(`Failed to ${action} execution:`, e);
        }
    };

    const handleCancel = async (id: string) => {
        if (!window.confirm('Are you sure you want to cancel this background campaign?')) return;
        try {
            await fetch(`http://localhost:3001/api/processes/${id}/cancel`, { method: 'PATCH' });
            fetchActiveExecutions();
        } catch (e) {
            console.error('Failed to cancel:', e);
        }
    };

    if (executions.length === 0) return null;

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end pointer-events-none">
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        className="mb-4 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden pointer-events-auto"
                    >
                        <div className="bg-wa-teal p-4 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity size={18} />
                                <span className="font-bold">Active Background Tasks</span>
                            </div>
                            <span className="bg-white/20 px-2 py-0.5 rounded text-[10px] font-bold">
                                {executions.length} TOTAL
                            </span>
                        </div>

                        <div className="max-h-96 overflow-y-auto p-2 space-y-2 bg-gray-50/50">
                            {executions.map((exe) => (
                                <div key={exe.id} className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 shrink-0">
                                            {exe.status === 'running' ? (
                                                <div className="relative">
                                                    <Activity size={14} className="text-wa-teal animate-pulse" />
                                                    <div className="absolute inset-0 bg-wa-teal blur-sm opacity-50 animate-ping rounded-full"></div>
                                                </div>
                                            ) : (
                                                <Clock size={14} className="text-amber-500" />
                                            )}
                                            <span className="text-xs font-bold text-gray-700 truncate max-w-[120px]">
                                                {exe.id.replace('instant_campaign_', 'Campaign #')}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button
                                                onClick={() => handleToggleStatus(exe)}
                                                className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-all"
                                                title={exe.status === 'running' ? 'Pause' : 'Resume'}
                                            >
                                                {exe.status === 'running' ? <Pause size={14} /> : <Play size={14} />}
                                            </button>
                                            <button
                                                onClick={() => handleCancel(exe.id)}
                                                className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-500 rounded-lg transition-all"
                                                title="Cancel"
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] font-bold text-gray-400">
                                            <span>PROGRESS</span>
                                            <span>{Math.round((exe.current_index / exe.total_count) * 100)}%</span>
                                        </div>
                                        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(exe.current_index / exe.total_count) * 100}%` }}
                                                className={`h-full ${exe.status === 'running' ? 'bg-wa-teal' : 'bg-amber-400'}`}
                                            />
                                        </div>
                                        <div className="flex justify-between text-[9px] text-gray-400">
                                            <span>{exe.current_index} / {exe.total_count} sent</span>
                                            <span className="font-bold text-wa-teal">
                                                {exe.status_detail === 'batch_break' ? '☕ Break' :
                                                    exe.status_detail === 'window_wait' ? '⏳ Window' :
                                                        exe.status_detail === 'jitter_wait' ? '🤝 Jitter' :
                                                            exe.status === 'paused' ? 'Waiting...' : 'Active'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.button
                layout
                onClick={() => setIsExpanded(!isExpanded)}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="pointer-events-auto bg-white border border-gray-100 shadow-xl rounded-full px-6 py-3 flex items-center gap-3 group hover:border-wa-teal transition-all"
            >
                <div className="relative">
                    <Activity size={20} className="text-wa-teal group-hover:scale-110 transition-transform" />
                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></div>
                </div>
                <div className="text-left">
                    <p className="text-[10px] font-bold text-gray-400 leading-none mb-1">SYSTEM MONITOR</p>
                    <p className="text-sm font-bold text-gray-700 leading-none">
                        {executions.filter(e => e.status === 'running').length} Active Tasks
                    </p>
                </div>
                {isExpanded ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronUp size={18} className="text-gray-400" />}
            </motion.button>
        </div>
    );
};

export default FloatingActiveExecutions;
