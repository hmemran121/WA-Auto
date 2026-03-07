/**
 * ConfirmModal — Premium confirmation dialog
 * Replaces window.confirm() with a beautiful, animated modal
 * consistent with WA-Auto's design language.
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Trash2, Info, HelpCircle } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type ConfirmType = 'danger' | 'warning' | 'info';

export interface ConfirmOptions {
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: ConfirmType;
}

interface ConfirmModalProps extends ConfirmOptions {
    visible: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

// ─── Theme config ─────────────────────────────────────────────────────────────
const THEMES = {
    danger: {
        icon: Trash2,
        iconBg: 'bg-red-100',
        iconColor: 'text-red-500',
        confirmBg: 'bg-red-500 hover:bg-red-600 active:bg-red-700',
        confirmText: 'text-white',
        headerAccent: 'from-red-500/10 to-transparent',
        ringColor: 'ring-red-200',
    },
    warning: {
        icon: AlertTriangle,
        iconBg: 'bg-amber-100',
        iconColor: 'text-amber-500',
        confirmBg: 'bg-amber-500 hover:bg-amber-600 active:bg-amber-700',
        confirmText: 'text-white',
        headerAccent: 'from-amber-500/10 to-transparent',
        ringColor: 'ring-amber-200',
    },
    info: {
        icon: Info,
        iconBg: 'bg-teal-100',
        iconColor: 'text-teal-500',
        confirmBg: 'bg-teal-500 hover:bg-teal-600 active:bg-teal-700',
        confirmText: 'text-white',
        headerAccent: 'from-teal-500/10 to-transparent',
        ringColor: 'ring-teal-200',
    },
};

// ─── Component ────────────────────────────────────────────────────────────────
const ConfirmModal: React.FC<ConfirmModalProps> = ({
    visible,
    title = 'Are you sure?',
    message = 'This action cannot be undone.',
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    type = 'danger',
    onConfirm,
    onCancel,
}) => {
    const theme = THEMES[type];
    const Icon = theme.icon;

    return (
        <AnimatePresence>
            {visible && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        key="confirm-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 z-[9998] bg-black/50 backdrop-blur-[2px]"
                        onClick={onCancel}
                    />

                    {/* Dialog */}
                    <motion.div
                        key="confirm-dialog"
                        initial={{ opacity: 0, scale: 0.85, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.85, y: 20 }}
                        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
                        className={`fixed inset-0 z-[9999] flex items-center justify-center p-4`}
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="confirm-title"
                    >
                        <div
                            className={`bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden ring-1 ${theme.ringColor}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Colored header band */}
                            <div className={`bg-gradient-to-b ${theme.headerAccent} pt-8 pb-4 px-8 flex flex-col items-center gap-4`}>
                                {/* Icon */}
                                <div className={`w-16 h-16 rounded-2xl ${theme.iconBg} flex items-center justify-center shadow-sm`}>
                                    <Icon size={32} className={theme.iconColor} />
                                </div>

                                {/* Title */}
                                <h2
                                    id="confirm-title"
                                    className="text-xl font-black text-gray-900 text-center leading-tight"
                                >
                                    {title}
                                </h2>
                            </div>

                            {/* Body */}
                            <div className="px-8 pb-8">
                                {/* Message */}
                                <p className="text-sm text-gray-500 text-center font-medium leading-relaxed mb-8">
                                    {message}
                                </p>

                                {/* Buttons */}
                                <div className="flex gap-3">
                                    {/* Cancel */}
                                    <button
                                        onClick={onCancel}
                                        className="flex-1 py-3 px-6 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-gray-300 text-gray-700 font-bold text-sm transition-all duration-200 active:scale-95"
                                    >
                                        {cancelLabel}
                                    </button>

                                    {/* Confirm */}
                                    <button
                                        onClick={onConfirm}
                                        className={`flex-1 py-3 px-6 rounded-2xl ${theme.confirmBg} ${theme.confirmText} font-bold text-sm transition-all duration-200 active:scale-95 shadow-lg shadow-black/10`}
                                    >
                                        {confirmLabel}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default ConfirmModal;
