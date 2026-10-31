import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingCart, Plus, Box, X, Trash2, Calendar, Factory, Truck, CreditCard, Activity, Tag, Package, TrendingUp, ArrowRight, Layers, DollarSign } from 'lucide-react';
import BatchManifest from './shared/BatchManifest';

interface BatchItem {
    id: string; // Internal temporary ID
    product_id: string;
    variant_name: string;
    quantity: string;
    purchase_price: string;
}

export default function PurchaseView({ 
    products: externalProducts, 
    fetchProducts: externalFetchProducts, 
    preSelected, 
    clearPreSelected 
}: { 
    products?: any[], 
    fetchProducts?: (p: number) => void, 
    preSelected?: any, 
    clearPreSelected?: () => void 
}) {
    const [procurements, setProcurements] = useState<any[]>([]); // This will now hold batches
    const [adding, setAdding] = useState(false);
    const [loading, setLoading] = useState(true);
    
    // Batch Detail Modal State
    const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
    
    // Batch State
    const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
    const [batchExpenses, setBatchExpenses] = useState<{ id: string, purpose: string, amount: string, paid_by: 'self' | 'supplier' }[]>([]);
    const [supplier, setSupplier] = useState('');
    const [suppliers, setSuppliers] = useState<any[]>([]);
    const [showSupplierDropdown, setShowSupplierDropdown] = useState(false);
    const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
    const [spotPayment, setSpotPayment] = useState({ amount: '', note: 'Spot Payment' });
    
    // Internal state for products if not passed as props
    const [internalProducts, setInternalProducts] = useState<any[]>([]);
    const products = externalProducts || internalProducts;

    const fetchInternalProducts = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/products?limit=1000');
            const data = await res.json();
            if (data.success) setInternalProducts(data.products || []);
        } catch (e) { console.error(e); }
    };

    const fetchProcurements = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/procurement-batches');
            const data = await res.json();
            if (data.success) setProcurements(data.batches || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    };


    const fetchSuppliers = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/suppliers');
            const data = await res.json();
            if (data.success) setSuppliers(data.suppliers);
        } catch (e) { console.error("Supplier fetch failed", e); }
    };

    useEffect(() => {
        fetchProcurements();
        fetchSuppliers();
        if (!externalProducts) fetchInternalProducts();
    }, [externalProducts]);

    useEffect(() => {
        if (preSelected) {
            setBatchItems([{
                id: Math.random().toString(36).substr(2, 9),
                product_id: preSelected.id.toString(),
                variant_name: '',
                quantity: '',
                purchase_price: ''
            }]);
            setAdding(true);
            if (clearPreSelected) clearPreSelected();
        }
    }, [preSelected]);

    const addRow = () => {
        setBatchItems([...batchItems, {
            id: Math.random().toString(36).substr(2, 9),
            product_id: '',
            variant_name: '',
            quantity: '',
            purchase_price: ''
        }]);
    };

    const removeRow = (id: string) => {
        if (batchItems.length > 1) {
            setBatchItems(batchItems.filter(item => item.id !== id));
        }
    };

    const updateItem = async (id: string, field: keyof BatchItem, value: string) => {
        // Immediate UI update
        setBatchItems(prev => prev.map(item => 
            item.id === id ? { ...item, [field]: value } : item
        ));

        // Intelligent Price Prefill Logic
        if (field === 'product_id' || field === 'variant_name') {
            // We need the current state of that specific row to know BOTH product and variant
            setBatchItems(currentItems => {
                const item = currentItems.find(i => i.id === id);
                if (!item || !item.product_id) return currentItems;

                const pid = field === 'product_id' ? value : item.product_id;
                const vname = field === 'variant_name' ? value : item.variant_name;

                // Fire and forget fetch to avoid blocking UI
                fetch(`http://localhost:3001/api/ai-brain/procurements/last-price?product_id=${pid}&variant_name=${encodeURIComponent(vname || '')}`)
                    .then(res => res.json())
                    .then(data => {
                        if (data.success && data.price !== null) {
                            setBatchItems(latest => latest.map(i => 
                                i.id === id ? { ...i, purchase_price: data.price.toString() } : i
                            ));
                        }
                    })
                    .catch(e => console.error("Last price fetch error:", e));

                return currentItems;
            });
        }
    };

    const addExpenseRow = () => {
        setBatchExpenses([...batchExpenses, { id: Math.random().toString(), purpose: '', amount: '', paid_by: 'self' }]);
    };

    const removeExpenseRow = (id: string) => {
        setBatchExpenses(batchExpenses.filter(e => e.id !== id));
    };

    const updateExpense = (id: string, field: string, value: any) => {
        setBatchExpenses(batchExpenses.map(e => e.id === id ? { ...e, [field]: value } : e));
    };

    const handleSave = async () => {
        if (!supplier) {
            alert("Please enter a supplier/source name");
            return;
        }

        const validItems = batchItems.filter(i => i.product_id && i.quantity);
        if (validItems.length === 0) return;

        const itemsPayload = validItems.map(item => ({
            product_id: item.product_id,
            variant_name: item.variant_name,
            quantity: item.quantity,
            purchase_price: item.purchase_price,
            supplier: supplier || 'MARKET',
            purchase_date: purchaseDate
        }));

        const expensesPayload = batchExpenses.filter(e => e.purpose && e.amount);

        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/procurements/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    items: itemsPayload, 
                    expenses: expensesPayload,
                    payment: spotPayment.amount ? { ...spotPayment, amount: parseFloat(spotPayment.amount) } : null
                })
            });
            
            if (res.ok) {
                fetchProcurements();
                if (externalFetchProducts) externalFetchProducts(1);
                else fetchInternalProducts();
                
                setAdding(false);
                setBatchItems([]);
                setBatchExpenses([]);
                setSpotPayment({ amount: '', note: 'Spot Payment' });
                setSupplier('');
                setPurchaseDate(new Date().toISOString().split('T')[0]);
            }
        } catch (e) { console.error(e); }
    };

    const productTotal = batchItems.reduce((acc, item) => acc + (parseFloat(item.quantity) || 0) * (parseFloat(item.purchase_price) || 0), 0);
    const supplierExpenseTotal = batchExpenses.filter(e => e.paid_by === 'supplier').reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);
    const totalSupplierBill = productTotal + supplierExpenseTotal;
    const selfExpenseTotal = batchExpenses.filter(e => e.paid_by === 'self').reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);
    const totalInvestment = productTotal + supplierExpenseTotal + selfExpenseTotal;
    const remainingDebt = totalSupplierBill - (parseFloat(spotPayment.amount) || 0);

    const totalBatchCost = batchItems.reduce((acc, item) => 
        acc + (parseFloat(item.quantity) || 0) * (parseFloat(item.purchase_price) || 0), 0
    );

    // Dynamic Column Width Calculation for Alignment
    const getColWidths = () => {
        let maxQty = 8;
        let maxPrice = 10;
        let maxSubtotal = 14;

        batchItems.forEach(item => {
            maxQty = Math.max(maxQty, (item.quantity?.length || 0) + 2);
            maxPrice = Math.max(maxPrice, (item.purchase_price?.length || 0) + 2);
            const sub = ((parseFloat(item.quantity) || 0) * (parseFloat(item.purchase_price) || 0)).toLocaleString();
            maxSubtotal = Math.max(maxSubtotal, sub.length + 3);
        });

        return {
            qty: `${maxQty}ch`,
            price: `${maxPrice}ch`,
            subtotal: `${maxSubtotal}ch`
        };
    };

    const cw = getColWidths();

    // Summary Totals from existing history
    // Summary Totals from existing batches
    const totalQtyInjected = procurements.reduce((acc, p) => acc + (parseFloat(p.total_qty) || 0), 0);
    const historyBaseTotal = procurements.reduce((acc, p) => acc + (parseFloat(p.total_investment) || 0), 0);
    const historyLandedTotal = procurements.reduce((acc, p) => acc + (parseFloat(p.total_landed_investment) || 0), 0);
    const historyLogsTotal = historyLandedTotal - historyBaseTotal;

    return (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8 max-w-7xl mx-auto pb-12">
            <div className="flex justify-between items-center bg-gray-900 text-white p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                <div className="relative z-10">
                    <h3 className="text-2xl font-black tracking-tight mb-1">Procurement Master</h3>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] opacity-80">Track every stock unit with purchase cost history</p>
                </div>
                <button 
                    onClick={() => {
                        setBatchItems([{ id: 'init', product_id: '', variant_name: '', quantity: '', purchase_price: '' }]);
                        setAdding(true);
                    }} 
                    className="relative z-10 bg-white text-gray-900 px-8 py-3.5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl shadow-white/5 flex items-center gap-2"
                >
                    <Plus size={16} /> Log Procurement
                </button>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <TrendingUp size={12} className="text-purple-500" /> Total Investment
                    </span>
                    <div className="mt-4">
                        <span className="text-2xl font-black tracking-tighter text-gray-900">{historyLandedTotal.toLocaleString()}</span>
                        <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Package size={12} className="text-blue-500" /> Items Procured
                    </span>
                    <div className="mt-4">
                        <span className="text-2xl font-black tracking-tighter text-gray-900">{Number(totalQtyInjected).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 })}</span>
                        <span className="text-xs font-bold text-gray-400 ml-2">Units</span>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                        <Tag size={12} className="text-emerald-500" /> Base Goods Cost
                    </span>
                    <div className="mt-4">
                        <span className="text-2xl font-black tracking-tighter text-emerald-600">{historyBaseTotal.toLocaleString()}</span>
                        <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                    </div>
                </div>

                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col justify-between overflow-hidden relative group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50 rounded-full -mr-12 -mt-12 group-hover:scale-150 transition-transform duration-700 opacity-50" />
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 relative z-10">
                        <Truck size={12} className="text-indigo-500" /> Logistics Impact
                    </span>
                    <div className="mt-4 relative z-10">
                        <span className="text-2xl font-black tracking-tighter text-indigo-600">{historyLogsTotal.toLocaleString()}</span>
                        <span className="text-xs font-bold text-gray-400 ml-2">Tk</span>
                    </div>
                </div>
            </div>

            {/* List Table */}
            <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50">
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Entry Date</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Supplier / Source</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Batch Reference</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Items</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Investment (Total)</th>
                                <th className="px-10 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Landed (Final)</th>
                                <th className="px-10 py-6"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {procurements.length > 0 ? procurements.map((batch) => (
                                <tr 
                                    key={batch.batch_id} 
                                    className="group hover:bg-gray-50 transition-colors cursor-pointer"
                                    onClick={() => setSelectedBatchId(batch.batch_id)}
                                >
                                    <td className="px-10 py-6">
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold text-gray-900">{new Date(batch.date).toLocaleDateString()}</span>
                                            <span className="text-[10px] text-gray-400 font-medium">{new Date(batch.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </td>
                                    <td className="px-10 py-6">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-purple-50 flex items-center justify-center text-purple-600 text-xs font-black uppercase">
                                                {batch.supplier ? batch.supplier[0] : 'M'}
                                            </div>
                                            <span className="text-sm font-bold text-gray-800">{batch.supplier || 'MARKET'}</span>
                                        </div>
                                    </td>
                                    <td className="px-10 py-6">
                                        <span className="text-xs font-black text-gray-400 font-mono tracking-tighter uppercase">{batch.batch_id}</span>
                                    </td>
                                    <td className="px-10 py-6 text-center">
                                        <span className="text-sm font-black text-gray-900">{batch.item_count}</span>
                                        <span className="text-[10px] text-gray-400 font-black ml-1 uppercase tracking-tighter">SKUs</span>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <span className="text-sm font-black text-gray-900">৳{batch.total_investment?.toLocaleString()}</span>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <span className="text-base font-black text-emerald-600">৳{batch.total_landed_investment?.toLocaleString()}</span>
                                    </td>
                                    <td className="px-10 py-6 text-right">
                                        <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-gray-300 group-hover:text-purple-600 group-hover:bg-purple-50 transition-all">
                                            <ArrowRight size={18} />
                                        </div>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="px-10 py-20 text-center text-gray-300">
                                        <div className="flex flex-col items-center gap-4 opacity-30 grayscale">
                                            <Box size={48} />
                                            <p className="font-black text-xl">No Procurement Batches Yet</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Batch Modal */}
            <AnimatePresence>
                {adding && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-md">
                        <motion.div 
                            initial={{ opacity: 0, y: 50, scale: 0.95 }} 
                            animate={{ opacity: 1, y: 0, scale: 1 }} 
                            exit={{ opacity: 0, scale: 0.95, y: 50 }}
                            className="bg-white w-full max-w-5xl max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden border border-white/20 flex flex-col"
                        >
                            {/* Modal Header */}
                            <div className="px-10 py-8 bg-gray-50 border-b border-gray-100 flex justify-between items-center flex-shrink-0">
                                <div>
                                    <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                                        <Box size={24} className="text-purple-600" /> Batch Procurement Entry
                                    </h2>
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Record multiple stock injections in a single session</p>
                                </div>
                                <button onClick={() => setAdding(false)} className="p-3 bg-white text-gray-400 rounded-2xl hover:text-gray-900 transition-all border border-gray-100">
                                    <X size={24} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-10 custom-scrollbar">
                                {/* Batch Header Info */}
                                <div className="grid grid-cols-2 gap-6 mb-10">
                                    <div className="relative group">
                                        <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-3 block flex items-center gap-2">
                                            <Factory size={12} /> Supplier / Source
                                        </label>
                                        <div className="relative">
                                            <input 
                                                type="text" 
                                                placeholder="Market, Factory, or Wholesaler Name" 
                                                value={supplier} 
                                                onChange={e => setSupplier(e.target.value)}
                                                onFocus={() => setShowSupplierDropdown(true)}
                                                className="w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-sm font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all placeholder:text-gray-300" 
                                            />
                                            <AnimatePresence>
                                                {showSupplierDropdown && (
                                                    <>
                                                        <div 
                                                            className="fixed inset-0 z-0" 
                                                            onClick={() => setShowSupplierDropdown(false)}
                                                        />
                                                        <motion.div 
                                                            initial={{ opacity: 0, y: 10 }}
                                                            animate={{ opacity: 1, y: 0 }}
                                                            exit={{ opacity: 0, y: 10 }}
                                                            className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-[1.5rem] shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar p-2"
                                                        >
                                                            {suppliers.length === 0 ? (
                                                                <div className="p-4 text-xs font-bold text-gray-400 text-center italic">No saved suppliers yet. Type to add.</div>
                                                            ) : (
                                                                <>
                                                                    <div className="px-3 py-2 text-[9px] font-black text-purple-400 uppercase tracking-widest">Select Existing</div>
                                                                    {suppliers.filter(s => s.name.toLowerCase().includes(supplier.toLowerCase())).map(s => (
                                                                        <button 
                                                                            key={s.id}
                                                                            onClick={() => {
                                                                                setSupplier(s.name);
                                                                                setShowSupplierDropdown(false);
                                                                            }}
                                                                            className="w-full text-left px-4 py-3 hover:bg-purple-50 rounded-xl transition-colors flex items-center justify-between group"
                                                                        >
                                                                            <span className="text-sm font-black text-gray-800">{s.name}</span>
                                                                            <span className="text-[10px] font-bold text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">Record History</span>
                                                                        </button>
                                                                    ))}
                                                                    {suppliers.filter(s => s.name.toLowerCase().includes(supplier.toLowerCase())).length === 0 && (
                                                                         <div className="p-4 text-xs font-bold text-gray-400 text-center italic">No matching supplier. New entries will be saved.</div>
                                                                    )}
                                                                </>
                                                            )}
                                                        </motion.div>
                                                    </>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-purple-600 uppercase tracking-widest mb-3 block flex items-center gap-2">
                                            <Calendar size={12} /> Purchase Date
                                        </label>
                                        <input 
                                            type="date" 
                                            value={purchaseDate} 
                                            onChange={e => setPurchaseDate(e.target.value)} 
                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-[1.5rem] text-sm font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all" 
                                        />
                                    </div>
                                </div>

                                {/* Items Table */}
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block px-2">Products in this Batch</label>
                                    
                                    {/* Column Headers */}
                                    <div 
                                        className="grid gap-4 px-8 py-3 bg-gray-100/50 rounded-2xl items-center mb-2"
                                        style={{ 
                                            gridTemplateColumns: `3fr 2fr ${cw.qty} ${cw.price} ${cw.subtotal} 40px` 
                                        }}
                                    >
                                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Product Node</div>
                                        <div className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Variant</div>
                                        <div className="text-[10px] font-black text-gray-400 uppercase text-center">Qty</div>
                                        <div className="text-[10px] font-black text-gray-400 uppercase text-center">Buying Price</div>
                                        <div className="text-[10px] font-black text-gray-400 uppercase text-right">Subtotal</div>
                                        <div className=""></div>
                                    </div>

                                    <div className="space-y-3">
                                        {batchItems.map((item, index) => {
                                            const selectedProduct = products.find(p => p.id === parseInt(item.product_id));
                                            const subtotal = (parseFloat(item.quantity) || 0) * (parseFloat(item.purchase_price) || 0);
                                            const subtotalStr = subtotal.toLocaleString();
                                            
                                            const totalExpenses = batchExpenses.reduce((acc, exp) => acc + (parseFloat(exp.amount) || 0), 0);
                                            const itemQty = parseFloat(item.quantity) || 0;
                                            const itemPrice = parseFloat(item.purchase_price) || 0;
                                            const itemValue = itemQty * itemPrice;
                                            const expenseShare = totalBatchCost > 0 ? (itemValue / totalBatchCost) * totalExpenses : 0;
                                            const unitLandedCost = itemQty > 0 ? (itemValue + expenseShare) / itemQty : 0;
                                            const landedSubtotal = itemQty * unitLandedCost;

                                            return (
                                                <div 
                                                    key={item.id} 
                                                    className={`grid gap-4 px-8 py-5 items-center bg-white rounded-[2rem] border border-gray-100 shadow-sm group transition-all hover:shadow-xl hover:shadow-purple-100/20 ${unitLandedCost > itemPrice ? 'ring-1 ring-purple-100' : ''}`}
                                                    style={{ 
                                                        gridTemplateColumns: `3fr 2fr ${cw.qty} ${cw.price} ${cw.subtotal} 40px` 
                                                    }}
                                                >
                                                    <div className="min-w-0">
                                                        <select 
                                                            value={item.product_id}
                                                            onChange={e => updateItem(item.id, 'product_id', e.target.value)}
                                                            className="w-full p-4 bg-gray-50/50 border border-gray-100 rounded-2xl text-[12px] font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all appearance-none"
                                                        >
                                                            <option value="">Select product...</option>
                                                            {products.map(p => (
                                                                <option key={p.id} value={p.id}>{p.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    
                                                    <div className="min-w-0">
                                                        <select 
                                                            value={item.variant_name}
                                                            onChange={e => updateItem(item.id, 'variant_name', e.target.value)}
                                                            className="w-full p-4 bg-gray-50/50 border border-gray-100 rounded-2xl text-[12px] font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all appearance-none"
                                                            disabled={!selectedProduct || !selectedProduct.variants || !selectedProduct.variants.items || selectedProduct.variants.items.length === 0}
                                                        >
                                                            <option value="">Primary</option>
                                                            {selectedProduct && selectedProduct.variants && selectedProduct.variants.items && selectedProduct.variants.items.map((vItem: any, i: number) => {
                                                                const vName = vItem.name || (vItem.type && vItem.value ? `${vItem.type}: ${vItem.value}` : (vItem.type || vItem.value || 'Unknown Variant'));
                                                                return (
                                                                    <option key={i} value={vName}>
                                                                        {vName}
                                                                    </option>
                                                                );
                                                            })}
                                                        </select>
                                                    </div>
 
                                                    <div className="transition-all">
                                                        <input 
                                                            type="number" 
                                                            step="0.001"
                                                            placeholder="0"
                                                            value={item.quantity}
                                                            onChange={e => updateItem(item.id, 'quantity', e.target.value)}
                                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-[12px] font-black text-center outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                                                        />
                                                    </div>
 
                                                    <div className="transition-all">
                                                        <input 
                                                            type="number" 
                                                            placeholder="0"
                                                            value={item.purchase_price}
                                                            onChange={e => updateItem(item.id, 'purchase_price', e.target.value)}
                                                            className="w-full p-4 bg-gray-50 border border-gray-100 rounded-2xl text-[12px] font-black text-center outline-none focus:ring-4 focus:ring-purple-100 transition-all"
                                                        />
                                                    </div>

                                                    <div className="text-right transition-all">
                                                        <div className="flex flex-col items-end">
                                                            <div className="text-[14px] font-black text-emerald-600 tracking-tighter whitespace-nowrap">
                                                                {subtotalStr} <span className="text-[10px] text-gray-400">Tk</span>
                                                            </div>
                                                            {unitLandedCost > 0 && unitLandedCost !== itemPrice && (
                                                                <div className="text-[9px] font-black text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md mt-1 border border-purple-100 flex items-center gap-1">
                                                                    <span>Landed:</span>
                                                                    <span>{unitLandedCost.toFixed(2)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
 
                                                    <div className="flex justify-center">
                                                        <button 
                                                            onClick={() => removeRow(item.id)}
                                                            disabled={batchItems.length === 1}
                                                            className="p-3 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all disabled:opacity-30"
                                                        >
                                                            <Trash2 size={20} />
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    
                                    <button 
                                        onClick={addRow}
                                        className="flex items-center gap-2 px-6 py-4 bg-gray-50 text-gray-500 rounded-[1.5rem] font-black text-[11px] uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all w-full justify-center border-2 border-dashed border-gray-200 hover:border-purple-600"
                                    >
                                        <Plus size={16} /> Add Product to Batch
                                    </button>
                                </div>

                                {/* Batch Expenses Section */}
                                <div className="mt-12 pt-10 border-t border-gray-100">
                                    <div className="flex justify-between items-end mb-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-3">
                                                <Truck size={20} className="text-emerald-500" /> Batch Logistics & Additional Costs
                                            </h3>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Add transport, labor, or other associated expenses</p>
                                        </div>
                                        <button 
                                            onClick={addExpenseRow}
                                            className="px-5 py-2.5 bg-emerald-50 text-emerald-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-500 hover:text-white transition-all flex items-center gap-2"
                                        >
                                            <Plus size={14} /> Add Cost Entry
                                        </button>
                                    </div>

                                    <div className="space-y-3">
                                        {batchExpenses.map((exp) => (
                                            <div key={exp.id} className="flex gap-4 items-center bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                                                <div className="flex-1">
                                                    <input 
                                                        type="text" 
                                                        placeholder="Purpose (e.g. Transport, Porterage)"
                                                        value={exp.purpose}
                                                        onChange={e => updateExpense(exp.id, 'purpose', e.target.value)}
                                                        className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl text-xs font-black outline-none focus:ring-4 focus:ring-emerald-100 transition-all placeholder:text-gray-300"
                                                    />
                                                </div>
                                                <div className="w-32">
                                                    <input 
                                                        type="number" 
                                                        placeholder="Amount"
                                                        value={exp.amount}
                                                        onChange={e => updateExpense(exp.id, 'amount', e.target.value)}
                                                        className="w-full px-4 py-3 bg-white border border-gray-100 rounded-xl text-xs font-black text-center outline-none focus:ring-4 focus:ring-emerald-100 transition-all"
                                                    />
                                                </div>
                                                <div className="flex items-center bg-white p-1 rounded-xl border border-gray-100">
                                                    <button 
                                                        onClick={() => updateExpense(exp.id, 'paid_by', 'self')}
                                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${exp.paid_by === 'self' ? 'bg-gray-900 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                                                    >
                                                        Self Paid
                                                    </button>
                                                    <button 
                                                        onClick={() => updateExpense(exp.id, 'paid_by', 'supplier')}
                                                        className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${exp.paid_by === 'supplier' ? 'bg-purple-600 text-white shadow-lg' : 'text-gray-400 hover:text-gray-600'}`}
                                                    >
                                                        Supplier
                                                    </button>
                                                </div>
                                                <button 
                                                    onClick={() => removeExpenseRow(exp.id)}
                                                    className="p-2.5 text-gray-300 hover:text-red-500 hover:bg-white rounded-xl transition-all"
                                                >
                                                    <X size={18} />
                                                </button>
                                            </div>
                                        ))}

                                        {batchExpenses.length === 0 && (
                                            <div className="py-8 border-2 border-dashed border-gray-100 rounded-[2rem] flex flex-col items-center justify-center text-gray-300">
                                                <Truck size={32} className="mb-2 opacity-20" />
                                                <p className="text-[10px] font-black uppercase tracking-widest">No extra costs added to this batch</p>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Spot Payment Section */}
                                <div className="mt-12 pt-10 border-t border-gray-100 pb-10">
                                    <div className="flex justify-between items-end mb-6">
                                        <div>
                                            <h3 className="text-lg font-black text-gray-900 tracking-tight flex items-center gap-3">
                                                <CreditCard size={20} className="text-purple-600" /> Spot Payment (Cash/Bank)
                                            </h3>
                                            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Record any payment made to the supplier right now</p>
                                        </div>
                                        <button 
                                            onClick={() => setSpotPayment({ ...spotPayment, amount: totalSupplierBill.toString() })}
                                            className="px-5 py-2.5 bg-purple-50 text-purple-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-purple-600 hover:text-white transition-all flex items-center gap-2"
                                        >
                                            <CreditCard size={14} /> Pay Full Bill
                                        </button>
                                    </div>

                                    <div className="flex gap-4 items-center bg-purple-50/30 p-6 rounded-[2rem] border border-purple-100">
                                        <div className="flex-1">
                                            <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-2 ml-4">Payment Notes / Reference</div>
                                            <input 
                                                type="text" 
                                                placeholder="e.g. Cash Payment, Bank Transfer Ref"
                                                value={spotPayment.note}
                                                onChange={e => setSpotPayment({ ...spotPayment, note: e.target.value })}
                                                className="w-full px-6 py-4 bg-white border border-purple-100 rounded-2xl text-sm font-black outline-none focus:ring-4 focus:ring-purple-100 transition-all placeholder:text-gray-300"
                                            />
                                        </div>
                                        <div className="w-48">
                                            <div className="text-[9px] font-black text-purple-400 uppercase tracking-widest mb-2 text-center">Amount Paid Today</div>
                                            <input 
                                                type="number" 
                                                placeholder="0.00"
                                                value={spotPayment.amount}
                                                onChange={e => setSpotPayment({ ...spotPayment, amount: e.target.value })}
                                                className="w-full px-6 py-4 bg-white border border-purple-100 rounded-2xl text-xl font-black text-center outline-none focus:ring-4 focus:ring-purple-100 transition-all text-purple-600"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Modal Footer */}
                            <div className="px-10 py-8 bg-white border-t border-gray-100 flex items-center justify-between flex-shrink-0 shadow-[0_-20px_50px_rgba(0,0,0,0.02)]">
                                <div className="flex gap-10">
                                    <div className="flex flex-col">
                                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Base Goods Value</span>
                                        <span className="text-xl font-black text-gray-900 tracking-tighter">
                                            {productTotal.toLocaleString()} <span className="text-[10px] text-gray-400">Tk</span>
                                        </span>
                                    </div>
                                    <div className="flex flex-col border-l border-gray-100 pl-10">
                                        <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Extra Costs (Total)</span>
                                        <span className="text-xl font-black text-emerald-600 tracking-tighter">
                                            {(supplierExpenseTotal + selfExpenseTotal).toLocaleString()} <span className="text-[10px] text-gray-400">Tk</span>
                                        </span>
                                    </div>
                                    <div className="flex flex-col border-l border-gray-100 pl-10">
                                        <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Supplier Debt</span>
                                        <span className="text-xl font-black text-red-500 tracking-tighter">
                                            {remainingDebt.toLocaleString()} <span className="text-[10px] text-gray-400">Tk</span>
                                        </span>
                                    </div>
                                    <div className="flex flex-col border-l border-gray-200 pl-10">
                                        <span className="text-[9px] font-black text-purple-600 uppercase tracking-widest">Landed Investment</span>
                                        <span className="text-xl font-black text-purple-600 tracking-tighter">
                                            {totalInvestment.toLocaleString()} <span className="text-[10px] text-gray-400">Tk</span>
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    onClick={handleSave} 
                                    className="bg-gray-900 text-white px-14 py-6 rounded-[2.5rem] font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-2xl shadow-gray-200 active:scale-95 flex items-center justify-center gap-3"
                                >
                                    <Plus size={18} /> Confirm Stock Injection
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
            {/* Reusable Side Drawer For Batch Detail */}
            <BatchManifest 
                batchId={selectedBatchId} 
                onClose={() => setSelectedBatchId(null)} 
            />
        </motion.div>
    );
}
