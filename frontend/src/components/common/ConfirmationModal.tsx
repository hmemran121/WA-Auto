import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, X, CheckCircle2, HelpCircle } from 'lucide-react';

interface ConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    type?: 'danger' | 'warning' | 'success' | 'info';
    isLoading?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    type = 'warning',
    isLoading = false
}) => {
    const getColors = () => {
        switch (type) {
            case 'danger': return { bg: 'bg-rose-500', text: 'text-rose-500', border: 'border-rose-500/20', icon: <AlertCircle className="text-rose-500" size={24} /> };
            case 'success': return { bg: 'bg-emerald-500', text: 'text-emerald-500', border: 'border-emerald-500/20', icon: <CheckCircle2 className="text-emerald-500" size={24} /> };
            case 'info': return { bg: 'bg-indigo-500', text: 'text-indigo-500', border: 'border-indigo-500/20', icon: <HelpCircle className="text-indigo-500" size={24} /> };
            default: return { bg: 'bg-amber-500', text: 'text-amber-500', border: 'border-amber-500/20', icon: <AlertCircle className="text-amber-500" size={24} /> };
        }
    };

    const colors = getColors();

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/60 backdrop-blur-md"
                    />

                    {/* Modal Content */}
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0.9, opacity: 0, y: 20 }}
                        className="relative w-full max-w-md bg-[#0a0d0c] border border-white/10 rounded-[2.5rem] shadow-2xl overflow-hidden"
                    >
                        {/* Status Bar */}
                        <div className={`h-1.5 w-full ${colors.bg}`} />

                        <div className="p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div className={`p-4 rounded-2xl bg-white/5 border ${colors.border}`}>
                                    {colors.icon}
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            <h3 className="text-2xl font-black text-white mb-2">{title}</h3>
                            <p className="text-gray-400 text-sm leading-relaxed mb-8">
                                {message}
                            </p>

                            <div className="flex gap-3">
                                <button
                                    onClick={onClose}
                                    className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl border border-white/5 transition-all active:scale-95"
                                >
                                    {cancelText}
                                </button>
                                <button
                                    onClick={onConfirm}
                                    disabled={isLoading}
                                    className={`flex-1 px-6 py-4 ${colors.bg} hover:brightness-110 text-white font-bold rounded-2xl shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2`}
                                >
                                    {isLoading ? (
                                        <motion.div
                                            animate={{ rotate: 360 }}
                                            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                                            className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                                        />
                                    ) : (
                                        confirmText
                                    )}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};

export default ConfirmationModal;
