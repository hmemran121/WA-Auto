import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Play, Plus, History, X, AlertCircle } from 'lucide-react';

interface ResumeConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (additionalMinutes: number) => Promise<void>;
    campaignName: string;
}

const ResumeConfirmModal: React.FC<ResumeConfirmModalProps> = ({
    isOpen, onClose, onConfirm, campaignName
}) => {
    const [extraMinutes, setExtraMinutes] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleConfirm = async () => {
        setIsSubmitting(true);
        try {
            await onConfirm(extraMinutes);
            onClose();
        } catch (err) {
            console.error('Resume confirm error', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
                    />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="relative w-full max-w-md bg-white rounded-[2rem] shadow-2xl overflow-hidden"
                    >
                        {/* Header */}
                        <div className="bg-indigo-600 p-8 text-white relative">
                            <button
                                onClick={onClose}
                                className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                            <div className="bg-white/20 w-12 h-12 rounded-2xl flex items-center justify-center mb-4">
                                <Play size={24} fill="currentColor" />
                            </div>
                            <h3 className="text-2xl font-black leading-tight">Resume Campaign</h3>
                            <p className="text-indigo-100 mt-2 font-medium truncate">{campaignName}</p>
                        </div>

                        {/* Content */}
                        <div className="p-8">
                            <div className="flex items-start gap-4 p-4 bg-indigo-50 rounded-2xl mb-8 border border-indigo-100">
                                <AlertCircle className="text-indigo-500 shrink-0 mt-0.5" size={20} />
                                <p className="text-sm text-indigo-900 font-medium leading-relaxed">
                                    Resuming will automatically extend the schedule by the amount of time it was paused to maintain original duration.
                                </p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-4">
                                        Optional: Add Extra Extension
                                    </label>
                                    <div className="grid grid-cols-4 gap-3">
                                        {[0, 5, 10, 30].map((mins) => (
                                            <button
                                                key={mins}
                                                onClick={() => setExtraMinutes(mins)}
                                                className={`py-3 rounded-xl font-bold transition-all border-2 ${extraMinutes === mins
                                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-200'
                                                    : 'bg-white border-gray-100 text-gray-400 hover:border-indigo-200'
                                                    }`}
                                            >
                                                {mins === 0 ? 'None' : `+${mins}m`}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="pt-4 flex gap-3">
                                    <button
                                        onClick={onClose}
                                        className="flex-1 py-4 bg-gray-50 text-gray-400 hover:text-gray-600 font-black rounded-2xl transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleConfirm}
                                        disabled={isSubmitting}
                                        className="flex-2 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-2 px-8"
                                    >
                                        {isSubmitting ? (
                                            <Clock className="animate-spin" size={20} />
                                        ) : (
                                            <>
                                                <Play size={18} fill="currentColor" />
                                                <span>Confirm Resume</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ResumeConfirmModal;
