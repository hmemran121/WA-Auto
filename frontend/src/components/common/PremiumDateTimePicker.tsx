import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar as CalendarIcon, Clock, ChevronLeft, ChevronRight, X, Check } from 'lucide-react';

interface PremiumDateTimePickerProps {
    value: string; // ISO string or partial
    onChange: (value: string) => void;
    mode: 'date' | 'datetime' | 'time';
    onClose: () => void;
    label?: string;
}

const PremiumDateTimePicker: React.FC<PremiumDateTimePickerProps> = ({
    value, onChange, mode, onClose, label
}) => {
    // Determine default date/time properly
    const parseInitialValue = () => {
        if (!value) return new Date();
        if (mode === 'time') {
            const [h, m] = value.split(':');
            const d = new Date();
            d.setHours(parseInt(h || '0'), parseInt(m || '0'), 0, 0);
            return d;
        }
        // If it's just YYYY-MM-DD, parse manually to avoid UTC shift
        if (mode === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
            const [y, m, d] = value.split('-').map(Number);
            return new Date(y, m - 1, d);
        }
        return new Date(value);
    };

    const defaultDate = parseInitialValue();
    const [currentDate, setCurrentDate] = useState(defaultDate);
    const [viewDate, setViewDate] = useState(new Date(currentDate));

    // Convert 24h to 12h
    const get12H = (h: number) => ({
        hours: h % 12 || 12,
        ampm: h >= 12 ? 'PM' : 'AM'
    });

    const initTime = get12H(currentDate.getHours());
    const [selectedTime, setSelectedTime] = useState({
        hours: initTime.hours,
        minutes: currentDate.getMinutes(),
        ampm: initTime.ampm
    });

    // Manual Input Mode
    const [isManualMode, setIsManualMode] = useState(false);
    const [manualHours, setManualHours] = useState(selectedTime.hours.toString());
    const [manualMinutes, setManualMinutes] = useState(selectedTime.minutes.toString().padStart(2, '0'));

    const dropdownRef = useRef<HTMLDivElement>(null);
    const manualRef = useRef<HTMLDivElement>(null);

    // Body Scroll Lock & Click Outside
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.body.style.overflow = 'unset';
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [onClose]);

    // ESC Key to close
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const daysInMonth = (month: number, year: number) => new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = (month: number, year: number) => new Date(year, month, 1).getDay();

    const months = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ];

    const get24H = (h: number, ampm: string) => {
        let hours = h;
        if (ampm === 'PM' && hours < 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        return hours;
    };

    const formatLocal = (date: Date): string => {
        const pad = (n: number) => n.toString().padStart(2, '0');
        const y = date.getFullYear();
        const m = pad(date.getMonth() + 1);
        const d = pad(date.getDate());
        const hh = pad(date.getHours());
        const mm = pad(date.getMinutes());

        // Get Timezone Offset in ±HH:mm format
        const offsetMinutes = -date.getTimezoneOffset();
        const offsetSign = offsetMinutes >= 0 ? '+' : '-';
        const offsetHours = pad(Math.floor(Math.abs(offsetMinutes) / 60));
        const offsetMins = pad(Math.abs(offsetMinutes) % 60);
        const offsetStr = `${offsetSign}${offsetHours}:${offsetMins}`;

        if (mode === 'datetime') return `${y}-${m}-${d}T${hh}:${mm}:00${offsetStr}`;
        if (mode === 'date') return `${y}-${m}-${d}`;
        return `${hh}:${mm}`;
    };

    const handleDateSelect = (day: number) => {
        const newDate = new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
        if (mode === 'datetime') {
            const h24 = get24H(selectedTime.hours, selectedTime.ampm);
            newDate.setHours(h24);
            newDate.setMinutes(selectedTime.minutes);
            setCurrentDate(newDate);
            onChange(formatLocal(newDate));
        } else {
            setCurrentDate(newDate);
            onChange(formatLocal(newDate));
        }
    };

    const handleTimeChange = (type: 'hours' | 'minutes' | 'ampm', val: any, syncManual = true) => {
        const newTime = { ...selectedTime, [type]: val };
        setSelectedTime(newTime);

        // Sync manual display only if requested (don't overwrite while user is typing)
        if (syncManual) {
            if (type === 'hours') setManualHours(val.toString());
            if (type === 'minutes') setManualMinutes(val.toString().padStart(2, '0'));
        }

        const h24 = get24H(newTime.hours, newTime.ampm);
        const newDate = new Date(currentDate);
        newDate.setHours(h24);
        newDate.setMinutes(newTime.minutes);
        setCurrentDate(newDate);

        if (mode === 'time') {
            onChange(`${h24.toString().padStart(2, '0')}:${newTime.minutes.toString().padStart(2, '0')}`);
        } else {
            onChange(formatLocal(newDate));
        }
    };

    const handleManualChange = (type: 'hours' | 'minutes', val: string) => {
        const cleanVal = val.replace(/\D/g, '').slice(0, 2);
        if (type === 'hours') setManualHours(cleanVal);
        else setManualMinutes(cleanVal);

        const num = parseInt(cleanVal);
        if (!isNaN(num)) {
            if (type === 'hours' && num >= 1 && num <= 12) {
                handleTimeChange('hours', num, false);
            }
            if (type === 'minutes' && num >= 0 && num <= 59) {
                handleTimeChange('minutes', num, false);
            }
        }
    };

    const handleManualSubmit = () => {
        let h = parseInt(manualHours);
        let m = parseInt(manualMinutes);

        if (isNaN(h)) h = selectedTime.hours;
        if (h < 1) h = 1;
        if (h > 12) h = 12;

        if (isNaN(m)) m = selectedTime.minutes;
        if (m < 0) m = 0;
        if (m > 59) m = 59;

        setManualHours(h.toString());
        setManualMinutes(m.toString().padStart(2, '0'));

        handleTimeChange('hours', h);
        handleTimeChange('minutes', m);
        setIsManualMode(false);
    };

    const handleContainerBlur = (e: React.FocusEvent) => {
        if (manualRef.current && !manualRef.current.contains(e.relatedTarget as Node)) {
            handleManualSubmit();
        }
    };

    const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
    const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));

    return createPortal(
        <AnimatePresence>
            <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 sm:p-6 pointer-events-auto">
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-black/60 backdrop-blur-xl"
                />

                <motion.div
                    ref={dropdownRef}
                    initial={{ opacity: 0, scale: 0.8, y: 50, rotateX: 15 }}
                    animate={{
                        opacity: 1,
                        scale: 1,
                        y: 0,
                        rotateX: 0,
                        transition: {
                            type: 'spring',
                            damping: 25,
                            stiffness: 300
                        }
                    }}
                    exit={{ opacity: 0, scale: 0.8, y: 50, rotateX: 15 }}
                    className="relative w-full max-w-sm bg-white/95 backdrop-blur-2xl rounded-[2.5rem] shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] border border-white/20 overflow-hidden z-10"
                    onClick={e => e.stopPropagation()}
                >
                    <div className="bg-gradient-to-br from-emerald-50 to-teal-50/50 rounded-[2rem] overflow-hidden">
                        {/* Luxury Header */}
                        <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-6 text-white relative shadow-lg">
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80">
                                    {label || (mode === 'date' ? 'Launch Date' : 'Exact Schedule')}
                                </p>
                                <button
                                    onClick={onClose}
                                    className="p-2 hover:bg-white/20 rounded-full transition-all group/close"
                                >
                                    <X size={18} className="group-hover:rotate-90 transition-transform duration-300" />
                                </button>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                    {mode === 'date' ? <CalendarIcon size={24} /> : <Clock size={24} />}
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-baseline gap-2">
                                        {mode !== 'date' && isManualMode ? (
                                            <div
                                                ref={manualRef}
                                                onBlur={handleContainerBlur}
                                                className="flex items-center gap-1 bg-white/10 p-1.5 rounded-xl border border-white/20"
                                            >
                                                <input
                                                    autoFocus
                                                    type="text"
                                                    value={manualHours}
                                                    onChange={e => handleManualChange('hours', e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                                                    className="w-10 bg-transparent text-2xl font-black text-white outline-none text-center"
                                                />
                                                <span className="text-xl font-black text-white/50">:</span>
                                                <input
                                                    type="text"
                                                    value={manualMinutes}
                                                    onChange={e => handleManualChange('minutes', e.target.value)}
                                                    onKeyDown={e => e.key === 'Enter' && handleManualSubmit()}
                                                    className="w-10 bg-transparent text-2xl font-black text-white outline-none text-center"
                                                />
                                            </div>
                                        ) : (
                                            <h3
                                                onClick={() => mode !== 'date' && setIsManualMode(true)}
                                                className={`text-2xl font-black tracking-tight leading-none ${mode !== 'date' ? 'cursor-pointer hover:bg-white/10 px-2 py-1 rounded-lg transition-all' : ''}`}
                                            >
                                                {mode === 'date'
                                                    ? viewDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                                                    : mode === 'time'
                                                        ? `${selectedTime.hours}:${selectedTime.minutes.toString().padStart(2, '0')}`
                                                        : `${selectedTime.hours}:${selectedTime.minutes.toString().padStart(2, '0')}`
                                                }
                                            </h3>
                                        )}
                                        <span className="text-emerald-200 font-bold">
                                            {mode === 'date' ? viewDate.getFullYear() : selectedTime.ampm}
                                        </span>
                                    </div>
                                    <p className="text-[10px] font-bold text-emerald-100 mt-1 uppercase tracking-wider">
                                        {mode === 'date' ? 'Strategic Selection' : mode === 'time' ? 'Time Precision (Click to Type)' : 'Precision Timing (Click to Type)'}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto no-scrollbar">
                            {/* Calendar Section */}
                            {(mode === 'date' || mode === 'datetime') && (
                                <div className="bg-white/60 backdrop-blur-md rounded-3xl p-4 border border-emerald-50 shadow-inner">
                                    <div className="flex items-center justify-between mb-4 px-1">
                                        <h4 className="font-black text-gray-800 uppercase text-xs tracking-[0.15em]">
                                            {months[viewDate.getMonth()]} <span className="text-emerald-500">{viewDate.getFullYear()}</span>
                                        </h4>
                                        <div className="flex gap-2">
                                            <button onClick={prevMonth} className="p-2 hover:bg-emerald-500 hover:text-white rounded-xl transition-all text-emerald-600 border border-emerald-100/50">
                                                <ChevronLeft size={18} />
                                            </button>
                                            <button onClick={nextMonth} className="p-2 hover:bg-emerald-500 hover:text-white rounded-xl transition-all text-emerald-600 border border-emerald-100/50">
                                                <ChevronRight size={18} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-7 gap-1">
                                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                                            <div key={d} className="text-center text-[9px] font-black text-gray-400 py-2">{d}</div>
                                        ))}
                                        {Array.from({ length: firstDayOfMonth(viewDate.getMonth(), viewDate.getFullYear()) }).map((_, i) => (
                                            <div key={`empty-${i}`} />
                                        ))}
                                        {Array.from({ length: daysInMonth(viewDate.getMonth(), viewDate.getFullYear()) }).map((_, i) => {
                                            const day = i + 1;
                                            const isSelected = currentDate.getDate() === day && currentDate.getMonth() === viewDate.getMonth() && currentDate.getFullYear() === viewDate.getFullYear();
                                            return (
                                                <button
                                                    key={day}
                                                    onClick={() => handleDateSelect(day)}
                                                    className={`h-10 w-10 flex items-center justify-center rounded-2xl text-xs font-black transition-all group/day ${isSelected
                                                        ? 'bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-xl shadow-emerald-200 scale-110'
                                                        : 'text-gray-700 hover:bg-emerald-50 hover:text-emerald-600'
                                                        }`}
                                                >
                                                    {day}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Time Section (Only for datetime or time mode) */}
                            {(mode === 'datetime' || mode === 'time') && (
                                <div className="bg-white/60 backdrop-blur-md rounded-3xl p-4 border border-emerald-50 space-y-4 shadow-inner">
                                    <div className="flex items-center justify-between px-1">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            <h4 className="font-black text-gray-800 uppercase text-[10px] tracking-widest">Digital Precision</h4>
                                        </div>
                                        <div className="flex bg-emerald-100/30 p-1 rounded-xl border border-emerald-100/50">
                                            {['AM', 'PM'].map(p => (
                                                <button
                                                    key={p}
                                                    onClick={() => handleTimeChange('ampm', p)}
                                                    className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${selectedTime.ampm === p ? 'bg-emerald-500 text-white shadow-lg' : 'text-emerald-600 hover:bg-emerald-100/50'}`}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-4 pt-2">
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[9px] font-black text-gray-400 uppercase">Hours</span>
                                                <span className="font-black text-emerald-600 text-sm bg-emerald-50 px-2 py-0.5 rounded-md">{selectedTime.hours}</span>
                                            </div>
                                            <input
                                                type="range" min="1" max="12"
                                                value={selectedTime.hours}
                                                onChange={e => handleTimeChange('hours', parseInt(e.target.value))}
                                                className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center px-1">
                                                <span className="text-[9px] font-black text-gray-400 uppercase">Minutes</span>
                                                <span className="font-black text-emerald-600 text-sm bg-emerald-50 px-2 py-0.5 rounded-md">{selectedTime.minutes.toString().padStart(2, '0')}</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="59"
                                                value={selectedTime.minutes}
                                                onChange={e => handleTimeChange('minutes', parseInt(e.target.value))}
                                                className="w-full accent-emerald-500 h-1.5 cursor-pointer"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            <button
                                onClick={onClose}
                                className="w-full py-5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] shadow-2xl shadow-emerald-200 hover:shadow-emerald-300 hover:scale-[1.02] transition-all flex items-center justify-center gap-3 active:scale-95 group"
                            >
                                <div className="p-1.5 bg-white/20 rounded-lg group-hover:rotate-12 transition-transform">
                                    <Check size={18} strokeWidth={4} />
                                </div>
                                Confirm Schedule
                            </button>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>,
        document.body
    );
};

export default PremiumDateTimePicker;
