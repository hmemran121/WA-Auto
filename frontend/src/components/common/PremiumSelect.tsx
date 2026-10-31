import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search, Check, LucideIcon } from 'lucide-react';

interface Option {
    value: string | number;
    label: string;
    description?: string;
    icon?: LucideIcon;
}

interface PremiumSelectProps {
    options: Option[];
    value: string | number;
    onChange: (value: any) => void;
    placeholder?: string;
    label?: string;
    icon?: LucideIcon;
    searchable?: boolean;
    className?: string;
    variant?: 'emerald' | 'purple' | 'indigo' | 'rose' | 'amber' | 'blue';
}

const PremiumSelect: React.FC<PremiumSelectProps> = ({
    options,
    value,
    onChange,
    placeholder = "Select an option...",
    label,
    icon: Icon,
    searchable = true,
    className = "",
    variant = 'indigo'
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [dynamicMaxHeight, setDynamicMaxHeight] = useState('300px');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const listContainerRef = useRef<HTMLDivElement>(null);

    const calculateSpace = () => {
        if (dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom - 40; // 40px safety margin
            // Minimum 200px, otherwise use available space
            setDynamicMaxHeight(`${Math.max(200, spaceBelow)}px`);
        }
    };

    useEffect(() => {
        if (isOpen) {
            calculateSpace();
            window.addEventListener('resize', calculateSpace);
            window.addEventListener('scroll', calculateSpace, true);
        }
        return () => {
            window.removeEventListener('resize', calculateSpace);
            window.removeEventListener('scroll', calculateSpace, true);
        };
    }, [isOpen]);

    const selectedOption = options.find(opt => opt.value === value);

    const filteredOptions = options.filter(opt =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (opt.description && opt.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const variants = {
        emerald: {
            bg: 'bg-emerald-50 text-emerald-600',
            border: 'border-emerald-100',
            hover: 'hover:bg-emerald-100',
            accent: 'bg-emerald-500',
            shadow: 'shadow-emerald-500/10'
        },
        purple: {
            bg: 'bg-purple-50 text-purple-600',
            border: 'border-purple-100',
            hover: 'hover:bg-purple-100',
            accent: 'bg-purple-500',
            shadow: 'shadow-purple-500/10'
        },
        indigo: {
            bg: 'bg-indigo-50 text-indigo-600',
            border: 'border-indigo-100',
            hover: 'hover:bg-indigo-100',
            accent: 'bg-indigo-500',
            shadow: 'shadow-indigo-500/10'
        },
        rose: {
            bg: 'bg-rose-50 text-rose-600',
            border: 'border-rose-100',
            hover: 'hover:bg-rose-100',
            accent: 'bg-rose-500',
            shadow: 'shadow-rose-500/10'
        },
        amber: {
            bg: 'bg-amber-50 text-amber-600',
            border: 'border-amber-100',
            hover: 'hover:bg-amber-100',
            accent: 'bg-amber-500',
            shadow: 'shadow-amber-500/10'
        },
        blue: {
            bg: 'bg-blue-50 text-blue-600',
            border: 'border-blue-100',
            hover: 'hover:bg-blue-100',
            accent: 'bg-blue-500',
            shadow: 'shadow-blue-500/10'
        }
    };

    const style = variants[variant];

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {label && (
                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-3 ml-1">
                    {label}
                </label>
            )}

            <div
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full py-4 px-6 bg-white border border-gray-100 rounded-2xl text-sm font-bold text-gray-700 flex items-center justify-between cursor-pointer hover:border-${variant}-200 hover:shadow-lg hover:${style.shadow} transition-all outline-none group overflow-hidden`}
            >
                <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-8 h-8 rounded-xl ${style.bg} flex items-center justify-center transition-colors group-hover:scale-110 duration-300`}>
                        {selectedOption?.icon ? (
                            <selectedOption.icon size={16} />
                        ) : Icon ? (
                            <Icon size={16} />
                        ) : (
                            <div className="w-1.5 h-1.5 rounded-full bg-current" />
                        )}
                    </div>
                    <span className={`truncate ${!selectedOption ? 'text-gray-400 font-medium' : 'text-gray-900'}`}>
                        {selectedOption ? selectedOption.label : placeholder}
                    </span>
                </div>
                <motion.div
                    animate={{ rotate: isOpen ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="text-gray-400 ml-2"
                >
                    <ChevronDown size={18} />
                </motion.div>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 5, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute left-0 right-0 top-full z-[100] bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-gray-100 p-3"
                    >
                        {searchable && (
                            <div className="relative mb-3 px-2">
                                <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300" size={14} />
                                <input
                                    type="text"
                                    autoFocus
                                    placeholder="Search..."
                                    className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-transparent focus:border-indigo-500/10 rounded-xl text-xs font-bold text-gray-700 outline-none transition-all"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                />
                            </div>
                        )}

                        <div 
                            ref={listContainerRef}
                            className="overflow-y-auto custom-scrollbar space-y-1"
                            style={{ maxHeight: dynamicMaxHeight }}
                        >
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map(option => (
                                    <button
                                        key={option.value}
                                        onClick={() => {
                                            onChange(option.value);
                                            setIsOpen(false);
                                            setSearchTerm("");
                                        }}
                                        className={`w-full text-left px-5 py-3.5 rounded-xl text-xs font-bold transition-all flex items-center justify-between group/item ${value === option.value ? style.bg : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 underline-none border-none'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${value === option.value ? 'bg-white/20' : 'bg-gray-100 group-hover/item:bg-white transition-colors'}`}>
                                                {option.icon ? <option.icon size={12} /> : <div className="w-1 h-1 rounded-full bg-current opacity-40" />}
                                            </div>
                                            <div>
                                                <p className="leading-none">{option.label}</p>
                                                {option.description && (
                                                    <p className={`text-[10px] mt-1 font-medium opacity-60 ${value === option.value ? 'text-white' : 'text-gray-400'}`}>
                                                        {option.description}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {value === option.value && (
                                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                                <Check size={10} strokeWidth={4} />
                                            </div>
                                        )}
                                    </button>
                                ))
                            ) : (
                                <div className="py-8 text-center">
                                    <Search size={24} className="mx-auto text-gray-200 mb-2" />
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">No results found</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default PremiumSelect;
