/**
 * AlertModal — Premium Alert/Notification modal
 * Replaces window.alert() with a beautiful slide-in notification
 * consistent with WA-Auto's design language.
 */
import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
export type AlertType = 'success' | 'error' | 'warning' | 'info';

export interface AlertOptions {
    message: string;
    title?: string;
    type?: AlertType;
    autoDismiss?: boolean;
    dismissAfter?: number; // ms
}

interface AlertModalProps extends AlertOptions {
    visible: boolean;
    onClose: () => void;
}

// ─── Theme config ─────────────────────────────────────────────────────────────
const ALERT_THEMES = {
    success: {
        icon: CheckCircle2,
        iconColor: 'text-emerald-500',
        bg: 'bg-white',
        border: 'border-l-4 border-emerald-400',
        title: 'Success',
        progressColor: 'bg-emerald-400',
        iconBg: 'bg-emerald-50',
    },
    error: {
        icon: XCircle,
        iconColor: 'text-red-500',
        bg: 'bg-white',
        border: 'border-l-4 border-red-400',
        title: 'Error',
        progressColor: 'bg-red-400',
        iconBg: 'bg-red-50',
    },
    warning: {
        icon: AlertTriangle,
        iconColor: 'text-amber-500',
        bg: 'bg-white',
        border: 'border-l-4 border-amber-400',
        title: 'Warning',
        progressColor: 'bg-amber-400',
        iconBg: 'bg-amber-50',
    },
    info: {
        icon: Info,
        iconColor: 'text-teal-500',
        bg: 'bg-white',
        border: 'border-l-4 border-teal-400',
        title: 'Information',
        progressColor: 'bg-teal-400',
        iconBg: 'bg-teal-50',
    },
};

// ─── Component ────────────────────────────────────────────────────────────────
const AlertModal: React.FC<AlertModalProps> = ({
    visible,
    message,
    title,
    type = 'info',
    autoDismiss = true,
    dismissAfter = 4000,
    onClose,
}) => {
    const theme = ALERT_THEMES[type];
    const Icon = theme.icon;
    const displayTitle = title || theme.title;

    // Auto-dismiss
    useEffect(() => {
        if (visible && autoDismiss) {
            const timer = setTimeout(onClose, dismissAfter);
            return () => clearTimeout(timer);
        }
    }, [visible, autoDismiss, dismissAfter, onClose]);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    key="alert-modal"
                    initial={{ opacity: 0, x: 60, scale: 0.92 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 60, scale: 0.92 }}
                    transition={{ type: 'spring', stiffness: 350, damping: 28 }}
                    className={`fixed bottom-6 right-6 z-[9999] w-full max-w-sm ${theme.bg} ${theme.border} rounded-2xl shadow-2xl overflow-hidden`}
                    role="alert"
                    aria-live="assertive"
                >
                    {/* Main content */}
                    <div className="flex items-start gap-4 p-5">
                        {/* Icon */}
                        <div className={`w-10 h-10 rounded-xl ${theme.iconBg} flex-shrink-0 flex items-center justify-center shadow-sm`}>
                            <Icon size={22} className={theme.iconColor} />
                        </div>

                        {/* Text */}
                        <div className="flex-1 min-w-0">
                            <p className="font-black text-gray-900 text-sm mb-0.5">{displayTitle}</p>
                            <p className="text-xs text-gray-500 font-medium leading-relaxed break-words">{message}</p>
                        </div>

                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="flex-shrink-0 w-7 h-7 flex items-center justify-center hover:bg-gray-100 active:bg-gray-200 rounded-lg transition-colors -mt-0.5 -mr-0.5"
                            aria-label="Close notification"
                        >
                            <X size={14} className="text-gray-400" />
                        </button>
                    </div>

                    {/* Progress bar (auto-dismiss timer) */}
                    {autoDismiss && (
                        <motion.div
                            initial={{ scaleX: 1 }}
                            animate={{ scaleX: 0 }}
                            transition={{ duration: dismissAfter / 1000, ease: 'linear' }}
                            style={{ transformOrigin: 'left' }}
                            className={`h-1 ${theme.progressColor}`}
                        />
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default AlertModal;
