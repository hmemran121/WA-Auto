/**
 * useModal — Global Modal System for WA-Auto
 * Provides confirm() and alert() as Promises,
 * replacing window.confirm and window.alert across the app.
 */
import { useContext } from 'react';
import { ModalContext } from '../components/ModalProvider';

export { ModalContext };
export const useModal = () => useContext(ModalContext);
