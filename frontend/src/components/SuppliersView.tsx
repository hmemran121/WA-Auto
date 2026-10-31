import React, { useState, useEffect } from 'react';
import { 
    Truck, 
    HandCoins, 
    ReceiptText, 
    ArrowUpCircle, 
    ArrowDownCircle, 
    Plus, 
    X,
    ChevronRight,
    Search,
    Calendar,
    Wallet
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import BatchManifest from './shared/BatchManifest';

interface Supplier {
    id: number;
    name: string;
    phone: string;
    address: string;
    total_purchased: number;
    total_paid: number;
    balance: number;
    created_at: string;
}

interface LedgerEntry {
    id: number;
    supplier_id: number;
    type: 'purchase' | 'payment';
    amount: number;
    reference_id: string;
    note: string;
    date: string;
}

const SuppliersView: React.FC = () => {
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
    const [ledger, setLedger] = useState<LedgerEntry[]>([]);
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [paymentData, setPaymentData] = useState({ amount: '', note: '', date: new Date().toISOString().split('T')[0] });
    const [pendingBatches, setPendingBatches] = useState<any[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    const [manifestBatchId, setManifestBatchId] = useState<string | null>(null); // For detail viewing
    const [newSupplierData, setNewSupplierData] = useState({ name: '', phone: '', address: '' });

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/suppliers');
            const data = await res.json();
            if (data.success) setSuppliers(data.suppliers);
            setLoading(false);
        } catch (e) { console.error(e); setLoading(false); }
    };

    const handleAddSupplier = async () => {
        if (!newSupplierData.name) return;
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/suppliers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newSupplierData)
            });
            const data = await res.json();
            if (data.success) {
                setIsAddModalOpen(false);
                setNewSupplierData({ name: '', phone: '', address: '' });
                fetchSuppliers();
            }
        } catch (e) { console.error(e); }
    };

    const fetchLedger = async (id: number) => {
        try {
            const res = await fetch(`http://localhost:3001/api/ai-brain/suppliers/${id}/ledger`);
            const data = await res.json();
            if (data.success) setLedger(data.ledger);
        } catch (e) { console.error(e); }
    };

    const handleSupplierSelect = (supplier: Supplier) => {
        setSelectedSupplier(supplier);
        fetchLedger(supplier.id);
        fetchPendingBatches(supplier.id);
    };

    const fetchPendingBatches = async (supplierId: number) => {
        try {
            const res = await fetch(`http://localhost:3001/api/ai-brain/suppliers/${supplierId}/batches`);
            const data = await res.json();
            if (data.success) {
                setPendingBatches(data.batches);
            }
        } catch (e) { console.error(e); }
    };

    const handleRecordPayment = async () => {
        if (!selectedSupplier || !paymentData.amount) return;

        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/suppliers/payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supplier_id: selectedSupplier.id,
                    amount: parseFloat(paymentData.amount),
                    note: paymentData.note,
                    date: paymentData.date,
                    reference_id: selectedBatchId || 'GENERAL'
                })
            });
            const data = await res.json();
            if (data.success) {
                setIsPaymentModalOpen(false);
                setPaymentData({ amount: '', note: '', date: new Date().toISOString().split('T')[0] });
                fetchSuppliers(); // Refresh Balances
                fetchLedger(selectedSupplier.id); // Refresh Detail
                fetchPendingBatches(selectedSupplier.id); // Refresh Batches
                setSelectedBatchId(null);
            }
        } catch (e) { console.error(e); }
    };

    const filteredSuppliers = suppliers.filter(s => 
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        s.phone?.includes(searchTerm)
    );

    const totalStats = suppliers.reduce((acc, s) => ({
        debt: acc.debt + s.balance,
        paid: acc.paid + s.total_paid,
        purchased: acc.purchased + s.total_purchased
    }), { debt: 0, paid: 0, purchased: 0 });

    if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wa-teal"></div></div>;

    return (
        <div className="space-y-8 max-w-7xl mx-auto pb-12">
            {/* Header section */}
            <div className="flex justify-between items-center bg-gray-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="relative z-10">
                    <h1 className="text-4xl font-black tracking-tight mb-2 flex items-center gap-4">
                        Suppliers & Ledger <Truck className="text-wa-teal" />
                    </h1>
                    <p className="text-gray-400 font-medium max-w-md">Manage accounts payable, track buying history, and coordinate payments.</p>
                    
                    <button 
                        onClick={() => setIsAddModalOpen(true)}
                        className="mt-6 bg-wa-teal text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-wa-teal/20"
                    >
                        <Plus size={18} /> Register Supplier
                    </button>
                </div>
                
                <div className="flex gap-4 relative z-10">
                   {/* Summary Quick Stats in Header */}
                   <div className="bg-white/5 border border-white/10 p-5 rounded-3xl backdrop-blur-xl">
                        <p className="text-[10px] font-black text-wa-teal uppercase tracking-widest mb-1">Total Outstanding</p>
                        <p className="text-2xl font-black">{totalStats.debt.toLocaleString()} <span className="text-xs text-gray-500">Tk</span></p>
                   </div>
                </div>

                <div className="absolute top-0 right-0 w-64 h-64 bg-wa-teal/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:bg-wa-teal/20 transition-all duration-700"></div>
            </div>

            <div className="grid grid-cols-12 gap-8">
                {/* Supplier List */}
                <div className="col-span-12 lg:col-span-5 space-y-6">
                    <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 flex items-center gap-4">
                        <Search className="text-gray-400" size={20} />
                        <input 
                            type="text" 
                            placeholder="Find supplier by name or phone..."
                            className="bg-transparent border-none outline-none text-sm font-medium w-full"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="space-y-3">
                        {filteredSuppliers.map(s => (
                            <motion.button
                                key={s.id}
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => handleSupplierSelect(s)}
                                className={`w-full text-left p-6 rounded-[2rem] border transition-all flex items-center justify-between group ${
                                    selectedSupplier?.id === s.id 
                                    ? 'bg-gray-900 border-gray-900 text-white shadow-xl shadow-gray-200' 
                                    : 'bg-white border-gray-100 hover:border-wa-teal/30 hover:shadow-lg'
                                }`}
                            >
                                <div className="flex items-center gap-4">
                                    <div className={`p-3 rounded-2xl ${selectedSupplier?.id === s.id ? 'bg-wa-teal text-white' : 'bg-gray-50 text-gray-400 group-hover:bg-wa-teal/10 group-hover:text-wa-teal'}`}>
                                        <Truck size={20} />
                                    </div>
                                    <div>
                                        <p className="font-black text-[14px]">{s.name}</p>
                                        <p className={`text-[10px] ${selectedSupplier?.id === s.id ? 'text-gray-400' : 'text-gray-500'}`}>{s.phone || 'No phone'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className={`font-black text-[15px] ${s.balance > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                        {s.balance.toLocaleString()}
                                    </p>
                                    <p className="text-[9px] uppercase font-bold tracking-tighter opacity-60">Balance Tk</p>
                                </div>
                            </motion.button>
                        ))}
                    </div>
                </div>

                {/* Ledger Details */}
                <div className="col-span-12 lg:col-span-7">
                    <AnimatePresence mode="wait">
                        {selectedSupplier ? (
                            <motion.div 
                                key={selectedSupplier.id}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6"
                            >
                                {/* Active Supplier Card */}
                                <div className="bg-white p-8 rounded-[3rem] shadow-xl shadow-gray-100 border border-gray-100 relative overflow-hidden">
                                     <div className="flex justify-between items-start relative z-10">
                                         <div>
                                            <span className="bg-wa-teal/10 text-wa-teal px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest mb-4 inline-block">Active Ledger</span>
                                            <h2 className="text-3xl font-black text-gray-900">{selectedSupplier.name}</h2>
                                            <p className="text-gray-500 text-sm mt-1">{selectedSupplier.address || 'No address registered'}</p>
                                         </div>
                                         <button 
                                            onClick={() => setIsPaymentModalOpen(true)}
                                            className="bg-gray-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-3 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-gray-900/10"
                                         >
                                             <HandCoins size={18} /> Record Payment
                                         </button>
                                     </div>

                                     <div className="grid grid-cols-2 gap-4 mt-8">
                                         <div className="bg-gray-50 p-6 rounded-[2rem]">
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Total Liability</p>
                                            <p className="text-2xl font-black text-gray-900">{selectedSupplier.total_purchased.toLocaleString()} <span className="text-xs">Tk</span></p>
                                         </div>
                                         <div className="bg-emerald-50 p-6 rounded-[2rem]">
                                            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">Total Paid</p>
                                            <p className="text-2xl font-black text-emerald-700">{selectedSupplier.total_paid.toLocaleString()} <span className="text-xs">Tk</span></p>
                                         </div>
                                     </div>
                                </div>

                                {/* Transaction List */}
                                <div className="bg-white rounded-[3rem] border border-gray-100 overflow-hidden">
                                    <div className="p-8 border-b border-gray-100 flex justify-between items-center">
                                        <h3 className="font-black text-gray-900 flex items-center gap-3"><ReceiptText size={20} className="text-wa-teal" /> Transaction History</h3>
                                        <div className="flex gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 border-2 border-white shadow-sm"></span>
                                            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></span>
                                        </div>
                                    </div>
                                    <div className="max-h-[500px] overflow-y-auto">
                                        {ledger.length === 0 ? (
                                            <div className="p-12 text-center text-gray-400 font-medium">No transactions found for this supplier.</div>
                                        ) : (
                                            <table className="w-full">
                                                <thead className="bg-gray-50 text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                                    <tr>
                                                        <th className="px-8 py-4 text-left">Date</th>
                                                        <th className="px-8 py-4 text-left">Ref / Note</th>
                                                        <th className="px-8 py-4 text-right">Amount</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-50">
                                                    {ledger.map(entry => {
                                                        const isBatch = entry.type === 'purchase' && entry.reference_id;
                                                        return (
                                                            <tr 
                                                                key={entry.id} 
                                                                onClick={() => { if (isBatch) setManifestBatchId(entry.reference_id); }}
                                                                className={`transition-colors ${isBatch ? 'cursor-pointer hover:bg-purple-50 group/row' : 'hover:bg-gray-50/50'}`}
                                                            >
                                                                <td className="px-8 py-6">
                                                                    <p className="text-xs font-black text-gray-900">{new Date(entry.date).toLocaleDateString()}</p>
                                                                    <p className="text-[9px] text-gray-400 font-bold uppercase">{new Date(entry.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                                                </td>
                                                                <td className="px-8 py-6">
                                                                    <div className="flex items-center gap-3">
                                                                        {entry.type === 'purchase' ? (
                                                                            <ArrowUpCircle className="text-rose-400" size={16} />
                                                                        ) : (
                                                                            <ArrowDownCircle className="text-emerald-400" size={16} />
                                                                        )}
                                                                        <div className="flex flex-col">
                                                                            <div className="flex items-center gap-2">
                                                                                <p className="text-[11px] font-black text-gray-800">{entry.note}</p>
                                                                                {isBatch && <span className="text-[8px] font-black bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-md uppercase tracking-tighter opacity-0 group-hover/row:opacity-100 transition-opacity">View Details</span>}
                                                                            </div>
                                                                            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">REF: {entry.reference_id}</p>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-8 py-6 text-right">
                                                                    <p className={`text-sm font-black ${entry.type === 'purchase' ? 'text-rose-500' : 'text-emerald-600'}`}>
                                                                        {entry.type === 'purchase' ? '+' : '-'}{entry.amount.toLocaleString()}
                                                                    </p>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center bg-gray-50/50 rounded-[4rem] border-2 border-dashed border-gray-200 p-12 text-center">
                                <div className="bg-white p-6 rounded-[2rem] shadow-xl shadow-gray-200/50 mb-6">
                                    <Truck size={48} className="text-gray-200" />
                                </div>
                                <h3 className="text-xl font-black text-gray-400">Select a supplier to view history</h3>
                                <p className="text-gray-400 text-sm max-w-[280px] mt-2 font-medium">Click on a supplier from the list to see their detailed transaction logs.</p>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Payment Modal */}
            <AnimatePresence>
                {isPaymentModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsPaymentModalOpen(false)}
                            className="absolute inset-0 bg-gray-900/40 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl relative z-10 overflow-hidden"
                        >
                            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="bg-wa-teal p-3 rounded-2xl text-white">
                                        <HandCoins size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-900">Record Payment</h3>
                                        <p className="text-[10px] font-black text-wa-teal uppercase tracking-widest">Clearing Debt For: {selectedSupplier?.name}</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsPaymentModalOpen(false)} className="p-3 hover:bg-gray-100 rounded-2xl text-gray-400 transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-10 space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-2">Allocate Payment To</label>
                                    <div className="grid grid-cols-2 gap-2 bg-gray-50 p-1 rounded-2xl border border-gray-100">
                                        <button 
                                            onClick={() => { setSelectedBatchId(null); setPaymentData({ ...paymentData, amount: '' }); }}
                                            className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!selectedBatchId ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            General Balance
                                        </button>
                                        <button 
                                            onClick={() => { if (pendingBatches.length > 0) setSelectedBatchId(pendingBatches[0].reference_id); }}
                                            className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${selectedBatchId ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                                        >
                                            Specific Batch
                                        </button>
                                    </div>

                                    {selectedBatchId && (
                                        <div className="space-y-2 mt-2">
                                            <select 
                                                value={selectedBatchId}
                                                onChange={(e) => {
                                                    const batchId = e.target.value;
                                                    setSelectedBatchId(batchId);
                                                    const batch = pendingBatches.find(b => b.reference_id === batchId);
                                                    if (batch) setPaymentData({ ...paymentData, amount: batch.balance.toString() });
                                                }}
                                                className="w-full px-5 py-4 bg-purple-50 border border-purple-100 rounded-2xl text-xs font-black text-purple-700 outline-none focus:ring-4 focus:ring-purple-100 transition-all appearance-none"
                                            >
                                                {pendingBatches.map(batch => (
                                                    <option key={batch.reference_id} value={batch.reference_id}>
                                                        {batch.reference_id} — Bill: {batch.total_due.toLocaleString()} (Due: {batch.balance.toLocaleString()} Tk)
                                                    </option>
                                                ))}
                                            </select>
                                            {pendingBatches.length === 0 && (
                                                <p className="text-[10px] text-rose-500 font-bold px-2">No pending batches found for this supplier.</p>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-2">Amount to Pay (Tk)</label>
                                    <div className="relative group">
                                        <Wallet className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 group-focus-within:text-wa-teal transition-colors" size={20} />
                                        <input 
                                            type="number" 
                                            placeholder="Enter amount..."
                                            value={paymentData.amount}
                                            onChange={e => setPaymentData({ ...paymentData, amount: e.target.value })}
                                            className="w-full pl-16 pr-8 py-5 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-2xl font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all placeholder:text-gray-200"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-2 text-center">Payment Date</label>
                                        <div className="relative group">
                                            <Calendar className="absolute left-6 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none" size={18} />
                                            <input 
                                                type="date" 
                                                value={paymentData.date}
                                                onChange={e => setPaymentData({ ...paymentData, date: e.target.value })}
                                                className="w-full pl-14 pr-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-2 text-center">Reference / Note</label>
                                        <input 
                                            type="text" 
                                            placeholder="Method, Bank, etc."
                                            value={paymentData.note}
                                            onChange={e => setPaymentData({ ...paymentData, note: e.target.value })}
                                            className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-xs font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                                        />
                                    </div>
                                </div>

                                <button 
                                    onClick={handleRecordPayment}
                                    disabled={!paymentData.amount}
                                    className="w-full bg-wa-sidebar text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-wa-sidebar/10 disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    <Plus size={18} /> Complete Transaction
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Add Supplier Modal */}
            <AnimatePresence>
                {isAddModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
                        <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsAddModalOpen(false)}
                            className="absolute inset-0 bg-gray-900/40 backdrop-blur-md"
                        />
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl relative z-10 overflow-hidden"
                        >
                            <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <div className="flex items-center gap-3">
                                    <div className="bg-wa-teal p-3 rounded-2xl text-white">
                                        <Truck size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-black text-gray-900">Register Supplier</h3>
                                        <p className="text-[10px] font-black text-wa-teal uppercase tracking-widest">Add new wholesaler or factory profile</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsAddModalOpen(false)} className="p-3 hover:bg-gray-100 rounded-2xl text-gray-400 transition-all">
                                    <X size={20} />
                                </button>
                            </div>

                            <div className="p-10 space-y-6">
                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-2">Supplier Name *</label>
                                    <input 
                                        type="text" 
                                        placeholder="E.g. Green Textile Ltd."
                                        value={newSupplierData.name}
                                        onChange={e => setNewSupplierData({ ...newSupplierData, name: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-2">Phone Number</label>
                                    <input 
                                        type="text" 
                                        placeholder="017xxxxxxxx"
                                        value={newSupplierData.phone}
                                        onChange={e => setNewSupplierData({ ...newSupplierData, phone: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-2">Full Address</label>
                                    <textarea 
                                        placeholder="Market, Shop No, City..."
                                        value={newSupplierData.address}
                                        onChange={e => setNewSupplierData({ ...newSupplierData, address: e.target.value })}
                                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl text-sm font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all min-h-[100px] resize-none"
                                    />
                                </div>

                                <button 
                                    onClick={handleAddSupplier}
                                    disabled={!newSupplierData.name}
                                    className="w-full bg-wa-sidebar text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-wa-sidebar/10 disabled:opacity-50 disabled:hover:scale-100"
                                >
                                    <Plus size={18} /> Register Supplier
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Batch Manifest Detail Drawer */}
            <BatchManifest 
                batchId={manifestBatchId} 
                onClose={() => setManifestBatchId(null)} 
                onlySupplierPaid={true}
                hideLandedDetails={true}
            />
        </div>
    );
};

export default SuppliersView;
