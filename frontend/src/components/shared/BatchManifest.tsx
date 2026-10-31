import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Layers, Package, Truck, DollarSign } from 'lucide-react';

interface BatchManifestProps {
    batchId: string | null;
    onClose: () => void;
    onlySupplierPaid?: boolean;
    hideLandedDetails?: boolean;
}

const BatchManifest: React.FC<BatchManifestProps> = ({ batchId, onClose, onlySupplierPaid, hideLandedDetails }) => {
    const [selectedBatchItems, setSelectedBatchItems] = useState<any[]>([]);
    const [selectedBatchExpenses, setSelectedBatchExpenses] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [summary, setSummary] = useState<any>(null);

    useEffect(() => {
        if (batchId) {
            fetchBatchDetails(batchId);
        } else {
            setSelectedBatchItems([]);
            setSelectedBatchExpenses([]);
            setSummary(null);
        }
    }, [batchId]);

    const fetchBatchDetails = async (id: string) => {
        setLoadingDetails(true);
        try {
            // 1. Fetch Items and Expenses
            const res = await fetch(`http://localhost:3001/api/ai-brain/procurements?batch_id=${id}`);
            const data = await res.json();
            if (data.success) {
                setSelectedBatchItems(data.procurements || []);
                setSelectedBatchExpenses(data.expenses || []);
                
                // 2. Synthesize summary from items if available
                if (data.procurements && data.procurements.length > 0) {
                    const first = data.procurements[0];
                    const totalInv = data.procurements.reduce((acc: number, item: any) => acc + (item.quantity * item.purchase_price), 0);
                    const totalLanded = data.procurements.reduce((acc: number, item: any) => acc + (item.quantity * (item.landed_cost || item.purchase_price)), 0);
                    
                    setSummary({
                        batch_id: id,
                        supplier: first.supplier,
                        item_count: new Set(data.procurements.map((i: any) => i.product_id)).size,
                        total_investment: totalInv,
                        total_landed_investment: totalLanded
                    });
                }
            }
        } catch (e) {
            console.error('Error fetching manifest details:', e);
        } finally {
            setLoadingDetails(false);
        }
    };

    return (
        <AnimatePresence>
            {batchId && (
                <>
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
                    />
                    <motion.div 
                        initial={{ x: '100%' }} 
                        animate={{ x: 0 }} 
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                        className="fixed right-0 top-0 bottom-0 w-full max-w-4xl bg-white shadow-2xl z-[110] overflow-hidden flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-10 border-b border-gray-100 flex items-center justify-between bg-gray-50/30">
                            <div className="flex items-center gap-5">
                                <div className="p-4 bg-purple-600 text-white rounded-3xl shadow-xl shadow-purple-500/20">
                                    <Layers size={28} />
                                </div>
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tighter">Batch Manifest</h2>
                                    <p className="text-xs text-gray-400 font-black uppercase tracking-widest">Ref: {batchId}</p>
                                </div>
                            </div>
                            <button 
                                onClick={onClose}
                                className="p-3 hover:bg-rose-50 hover:text-rose-500 rounded-2xl text-gray-400 transition-all font-black text-2xl bg-white border border-gray-100"
                            >
                                &times;
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
                            {!summary && loadingDetails ? (
                                <div className="space-y-10 animate-pulse">
                                    {/* Skeleton Summary Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                        {[1, 2, 3, 4].map(idx => (
                                            <div key={idx} className="h-24 bg-gray-100 rounded-3xl" />
                                        ))}
                                    </div>
                                    {/* Skeleton Table */}
                                    <div className="space-y-4">
                                        <div className="h-4 w-32 bg-gray-100 rounded" />
                                        <div className="h-64 bg-gray-50 rounded-[2.5rem]" />
                                    </div>
                                </div>
                            ) : summary ? (
                                <>
                                    {/* Summary Cards */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                        <div className="flex flex-col bg-gray-50 p-6 rounded-3xl border border-gray-100">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Supplier</span>
                                            <span className="text-sm font-bold text-gray-900 uppercase">{summary.supplier}</span>
                                        </div>
                                        <div className="flex flex-col bg-gray-50 p-6 rounded-3xl border border-gray-100">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Entries</span>
                                            <span className="text-sm font-bold text-gray-900">{summary.item_count} Unique SKUs</span>
                                        </div>
                                        <div className="flex flex-col bg-gray-50 p-6 rounded-3xl border border-gray-100">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Invested</span>
                                            <span className="text-sm font-bold text-gray-900">৳{summary.total_investment?.toLocaleString()}</span>
                                        </div>
                                        {!hideLandedDetails && (
                                            <div className="flex flex-col bg-purple-600 p-6 rounded-3xl shadow-lg shadow-purple-100 text-white">
                                                <span className="text-[10px] font-black text-purple-200 uppercase tracking-widest mb-1">Landed Value</span>
                                                <span className="text-sm font-bold">৳{summary.total_landed_investment?.toLocaleString()}</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Product Breakdown */}
                                    <div className="space-y-4">
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <Package size={14} /> Product Breakdown
                                        </h3>
                                        <div className="border border-gray-100 rounded-[2.5rem] overflow-hidden">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="bg-gray-50/80">
                                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Product / Variant</th>
                                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Batch Qty</th>
                                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Unit Buy</th>
                                                        {!hideLandedDetails && <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Unit Landed</th>}
                                                        <th className="px-8 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Subtotal</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {selectedBatchItems.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                                                            <td className="px-8 py-5">
                                                                <div className="flex flex-col">
                                                                    <span className="text-sm font-bold text-gray-900">{item.product_name}</span>
                                                                    <span className="text-[10px] text-gray-400 font-black uppercase tracking-tighter italic">
                                                                        {item.variant_name || 'Base Variation'} • SKU: {item.product_sku || 'N/A'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-8 py-5 text-center">
                                                                <span className="text-sm font-black text-gray-900">
                                                                    {Number(item.quantity).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                                                                </span>
                                                            </td>
                                                            <td className="px-8 py-5 text-right">
                                                                <span className="text-sm font-bold text-gray-600">৳{item.purchase_price?.toLocaleString()}</span>
                                                            </td>
                                                            {!hideLandedDetails && (
                                                                <td className="px-8 py-5 text-right">
                                                                    <span className="text-sm font-black text-emerald-600">৳{(item.landed_cost || item.purchase_price)?.toLocaleString()}</span>
                                                                </td>
                                                            )}
                                                            <td className="px-8 py-5 text-right">
                                                                <span className="text-sm font-black text-gray-900">৳{(item.quantity * item.purchase_price)?.toLocaleString()}</span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    {/* Logistics Breakdown */}
                                    {selectedBatchExpenses.length > 0 && (
                                        <div className="space-y-4">
                                            <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest flex items-center gap-2">
                                                <Truck size={14} /> Logistics & Overhead Breakdown
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {selectedBatchExpenses
                                                    .filter(exp => !onlySupplierPaid || exp.paid_by === 'supplier' || exp.description?.toLowerCase().includes('[paid by supplier]'))
                                                    .map((exp, idx) => (
                                                    <div key={idx} className="bg-indigo-50/30 border border-indigo-100/50 p-5 rounded-3xl flex justify-between items-center group hover:bg-indigo-50 transition-colors">
                                                        <div className="flex items-center gap-4">
                                                            <div className="w-10 h-10 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center text-indigo-500 shadow-sm">
                                                                <DollarSign size={18} />
                                                            </div>
                                                            <div className="flex flex-col">
                                                                <span className="text-[13px] font-black text-gray-900 group-hover:text-indigo-600 transition-colors">{exp.description || exp.category}</span>
                                                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-tighter">Operational Cost</span>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className="text-base font-black text-indigo-600">৳{exp.amount?.toLocaleString()}</span>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-20">
                                    <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-6">
                                        <Package size={40} className="text-gray-200" />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-900 mb-2">Manifest Not Available</h3>
                                    <p className="text-sm text-gray-400 font-medium max-w-sm">
                                        We couldn't retrieve the product breakdown for this transaction. 
                                        <br/><br/>
                                        <span className="text-[10px] uppercase font-black bg-gray-100 px-2 py-1 rounded">Note:</span> This happens for historical data saved before the manifest update or manual ledger entries.
                                    </p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default BatchManifest;
