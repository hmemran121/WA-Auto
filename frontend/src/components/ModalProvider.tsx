/**
 * ModalProvider — Global premium modal/alert context
 * Wraps the app to provide confirm() and alert() from any component.
 *
 * Usage:
 *   const { confirm, alert: showAlert } = useModal();
 *   const ok = await confirm({ title: 'Delete?', type: 'danger' });
 *   showAlert({ message: 'Done!', type: 'success' });
 */
import React, { createContext, useState, useCallback, useRef } from 'react';
import ConfirmModal, { ConfirmOptions } from './ConfirmModal';
import AlertModal, { AlertOptions } from './AlertModal';

// ─── Types ────────────────────────────────────────────────────────────────────
interface ModalContextValue {
    confirm: (options: ConfirmOptions) => Promise<boolean>;
    alert: (options: AlertOptions) => void;
}

// ─── Context ──────────────────────────────────────────────────────────────────
export const ModalContext = createContext<ModalContextValue>({
    confirm: async () => false,
    alert: () => { },
});

// ─── Provider ─────────────────────────────────────────────────────────────────
export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Confirm state
    const [confirmState, setConfirmState] = useState<(ConfirmOptions & { visible: boolean }) | null>(null);
    const confirmResolveRef = useRef<((val: boolean) => void) | null>(null);

    // Alert state
    const [alertState, setAlertState] = useState<(AlertOptions & { visible: boolean }) | null>(null);

    // ── Confirm ─────────────────────────────────────────────────────────────
    const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            confirmResolveRef.current = resolve;
            setConfirmState({ ...options, visible: true });
        });
    }, []);

    const handleConfirmClose = useCallback((result: boolean) => {
        confirmResolveRef.current?.(result);
        confirmResolveRef.current = null;
        setConfirmState(null);
    }, []);

    // ── Alert ────────────────────────────────────────────────────────────────
    const alert = useCallback((options: AlertOptions) => {
        setAlertState({ ...options, visible: true });
    }, []);

    const handleAlertClose = useCallback(() => {
        setAlertState(null);
    }, []);

    return (
        <ModalContext.Provider value={{ confirm, alert }}>
            {children}

            {confirmState && (
                <ConfirmModal
                    {...confirmState}
                    visible={confirmState.visible}
                    onConfirm={() => handleConfirmClose(true)}
                    onCancel={() => handleConfirmClose(false)}
                />
            )}

            {alertState && (
                <AlertModal
                    {...alertState}
                    visible={alertState.visible}
                    onClose={handleAlertClose}
                />
            )}
        </ModalContext.Provider>
    );
};
