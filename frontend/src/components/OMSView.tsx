import React, { useState, useEffect } from 'react';
import FinancialLedger, { FinancialEvent } from './finance/FinancialLedger';
import FinancialSnapshot, { FinancialDNA } from './finance/FinancialSnapshot';
import { 
    Package, 
    Search, 
    Filter, 
    Copy,
    ChevronRight, 
    Clock, 
    Truck, 
    CheckCircle2, 
    XCircle, 
    ExternalLink, 
    MapPin, 
    MapPinned,
    ShieldAlert,
    Phone, 
    User,
    ArrowRight,
    ShoppingBag,
    Plus,
    Trash2,
    DollarSign,
    CreditCard,
    MoreVertical,
    FileText,
    History,
    RefreshCw,
    Minus,
    Save,
    Edit3,
    AlertCircle,
    Eye,
    MessageSquare,
    Send,
    SquareArrowRight,
    Check,
    ArrowRightLeft,
    Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type OrderStatus = 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

interface OrderItem {
    id: number;
    name: string;
    qty: number;
    price: number;
}

interface Order {
    id: number;
    customer_number: string;
    status: OrderStatus;
    total_amount: string;
    items: string; // JSON string
    payment_status: 'pending' | 'paid' | 'partial';
    amount_paid: number;
    delivery_charge?: number;
    discount?: number;
    customer_name?: string;
    customer_address?: string;
    scheduled_delivery?: string;
    original_items?: string;
    tracking_id?: string;
    order_notes?: string;
    due_added?: number;
    created_at?: string;
    human_verified?: number;
}

const isCurrentlyTransferred = (notes?: string) => {
    if (!notes) return false;
    const lastTransfer = notes.lastIndexOf('[Transferred]');
    const lastRestore = notes.lastIndexOf('[Debt Restored]');
    return lastTransfer > -1 && lastTransfer > lastRestore;
};

const LedgerRow = ({ label, value, isCredit = false }: { label: string, value: number, isCredit?: boolean }) => (
    <div className="flex justify-between items-center text-[10px] font-black group">
        <span className="text-gray-400 uppercase tracking-widest group-hover:text-gray-600 transition-colors">{label}</span>
        <span className={`text-xs ${isCredit ? 'text-emerald-500' : 'text-gray-900'}`}>
            {isCredit ? '-' : ''}৳{value.toLocaleString()}
        </span>
    </div>
);

const SmartLogText = ({ text, onOrderClick }: { text: string, onOrderClick: (id: string) => void }) => {
    if (!text) return null;
    const parts = text.split(/(#\d+)/g);
    return (
        <div className="text-[10px] font-medium text-gray-500 mt-1 leading-relaxed">
            {parts.map((part, i) => {
                if (part.startsWith('#')) {
                    const id = part.substring(1);
                    return (
                        <span 
                            key={i}
                            onClick={(e) => { e.stopPropagation(); onOrderClick(id); }}
                            className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg font-black cursor-pointer hover:bg-indigo-600 hover:text-white transition-all mx-0.5 inline-flex items-center gap-1 border border-indigo-100 shadow-sm"
                        >
                            <ExternalLink size={10} className="opacity-70" /> {part}
                        </span>
                    );
                }
                return <span key={i}>{part}</span>;
            })}
        </div>
    );
};

const TimelineStep = ({ active, label, desc, icon, isCompleted, onClick, isLast = false, smartDesc = null }: { active: boolean, label: string, desc: string, icon: React.ReactNode, isCompleted: boolean, onClick: () => void, isLast?: boolean, smartDesc?: React.ReactNode }) => (
    <div className={`relative pb-8 ${isLast ? '' : ''} group cursor-pointer`} onClick={onClick}>
        <div className={`absolute -left-[2.1rem] top-0 w-8 h-8 rounded-full flex items-center justify-center transition-all ${isCompleted ? 'bg-indigo-600 text-white' : active ? 'bg-wa-teal text-white animate-pulse' : 'bg-gray-100 text-gray-400'} ring-4 ring-white shadow-sm group-hover:scale-110`}>
            {isCompleted ? <CheckCircle2 size={16} /> : React.cloneElement(icon as React.ReactElement, { size: 16 })}
        </div>
        <div className={`pl-6 transition-all ${active || isCompleted ? 'opacity-100' : 'opacity-40'}`}>
            <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-800 flex items-center gap-2">
                {label}
                {isCompleted && <div className="w-1 h-1 bg-emerald-400 rounded-full animate-pulse" />}
            </h5>
            {smartDesc ? smartDesc : <p className="text-[9px] font-medium text-gray-400 mt-1 leading-relaxed pr-4">{desc}</p>}
        </div>
    </div>
);

const IntelligenceMeter = ({ label, value, color = "bg-wa-teal" }: { label: string, value: number, color?: string }) => (
    <div className="space-y-2">
        <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest text-gray-400">
            <span>{label}</span>
            <span>{value}%</span>
        </div>
        <div className="h-1.5 w-full bg-gray-50 rounded-full overflow-hidden border border-gray-100 p-0.5">
            <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${value}%` }}
                className={`h-full rounded-full ${color} shadow-sm`}
            />
        </div>
    </div>
);

const safeParseItems = (data: any): any[] => {
    if (!data) return [];
    if (Array.isArray(data)) return data;
    try {
        let parsed = typeof data === 'string' ? JSON.parse(data) : data;
        // Handle double encoding
        if (typeof parsed === 'string') {
            try {
                const secondParse = JSON.parse(parsed);
                if (Array.isArray(secondParse)) return secondParse;
            } catch (e) {}
        }
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
};

export default function OMSView() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
    const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'due'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
    const [otherActiveOrders, setOtherActiveOrders] = useState<any[]>([]);
    const [isCreatingOrder, setIsCreatingOrder] = useState(false);
    const [isEditingManifest, setIsEditingManifest] = useState(false);
    const [amendedItems, setAmendedItems] = useState<OrderItem[]>([]);
    const [showOriginal, setShowOriginal] = useState(false);
    const [manifestSearch, setManifestSearch] = useState('');
    const [selectedProductForAmendment, setSelectedProductForAmendment] = useState<any>(null);
    const [selectedVariantForAmendment, setSelectedVariantForAmendment] = useState<string>('');
    const [amendmentQty, setAmendmentQty] = useState(1);
    
    // 📝 Meta Editing States (Logistics & Finance)
    const [isEditingAddress, setIsEditingAddress] = useState(false);
    const [tempAddress, setTempAddress] = useState('');
    const [isEditingDelivery, setIsEditingDelivery] = useState(false);
    const [tempDelivery, setTempDelivery] = useState(0);
    const [isEditingShippingPhone, setIsEditingShippingPhone] = useState(false);
    const [tempShippingPhone, setTempShippingPhone] = useState('');
    const [isUpdatingMeta, setIsUpdatingMeta] = useState(false);
    const [debtChain, setDebtChain] = useState<any[]>([]);
    const [loadingDebtChain, setLoadingDebtChain] = useState(false);
    const handleUpdateMeta = async (updates: { delivery_charge?: number, shipping_address?: string, shipping_phone?: string }) => {
        if (!selectedOrder) return;
        setIsUpdatingMeta(true);
        try {
            const resp = await fetch(`http://localhost:3001/api/oms/orders/${selectedOrder.id}/meta`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updates)
            });
            const data = await resp.json();
            if (data.success) {
                setSelectedOrder({
                    ...selectedOrder,
                    ...updates,
                    customer_address: updates.shipping_address !== undefined ? updates.shipping_address : selectedOrder.customer_address,
                    shipping_phone: updates.shipping_phone !== undefined ? updates.shipping_phone : selectedOrder.shipping_phone,
                    total_amount: data.total_amount || selectedOrder.total_amount
                });
                setIsEditingAddress(false);
                setIsEditingDelivery(false);
                setIsEditingShippingPhone(false);
            }
        } catch (err) {
            console.error("Meta Update Error:", err);
            alert("Failed to update order details.");
        } finally {
            setIsUpdatingMeta(false);
        }
    };
    const [verifiedItems, setVerifiedItems] = useState<string[]>([]);
    const [activeDetailTab, setActiveDetailTab] = useState<'manifest' | 'logistics' | 'finance' | 'customer' | 'timeline'>('manifest');
    const [paymentInput, setPaymentInput] = useState<string>('');
    const [tempDeliveryCharge, setTempDeliveryCharge] = useState<number>(0);
    const [customerHistory, setCustomerHistory] = useState<Order[]>([]);
    const [customerMetadata, setCustomerMetadata] = useState<any>(null);
    const [loadingMetadata, setLoadingMetadata] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [paymentHistory, setPaymentHistory] = useState<any[]>([]);
    const [orderLogs, setOrderLogs] = useState<any[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);
    const [customerFinancialDNA, setCustomerFinancialDNA] = useState<FinancialDNA | null>(null);
    const [customerFinancialLedger, setCustomerFinancialLedger] = useState<FinancialEvent[]>([]);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [paymentNotes, setPaymentNotes] = useState('');
    
    // 🛡️ Cancellation Modal States
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [predecessors, setPredecessors] = useState<any[]>([]);
    const [selectedReactivateIds, setSelectedReactivateIds] = useState<number[]>([]);
    const [isFetchingPredecessors, setIsFetchingPredecessors] = useState(false);

    const fetchCustomerMetadata = async (number: string) => {
        try {
            setLoadingMetadata(true);
            const res = await fetch(`http://localhost:3001/api/contacts/profile/${number}`);
            const data = await res.json();
            if (data.success) {
                setCustomerMetadata(data.contact);
                setCustomerHistory(data.orders || []);
                setCustomerFinancialDNA(data.financialDNA);
                setCustomerFinancialLedger(data.financialLedger || []);
            }
        } catch (e) {
            console.error("Fetch Customer Metadata Error:", e);
        } finally {
            setLoadingMetadata(false);
        }
    };

    const fetchPaymentHistory = async (orderId: number | string) => {
        try {
            const res = await fetch(`http://localhost:3001/api/oms/orders/${orderId}/payments`);
            const data = await res.json();
            if (data.success) setPaymentHistory(data.payments);
        } catch (e) {
            console.error("Fetch Payment History Error:", e);
        }
    };

    const fetchOrderLogs = async (orderId: number | string) => {
        try {
            setLoadingLogs(true);
            const res = await fetch(`http://localhost:3001/api/oms/orders/${orderId}/logs`);
            const data = await res.json();
            if (data.success) setOrderLogs(data.logs);
        } catch (e) {
            console.error("Fetch Order Logs Error:", e);
        } finally {
            setLoadingLogs(false);
        }
    };

    const fetchAndOpenOrder = async (id: number | string) => {
        if (!id || id === 'newest') return; 
        try {
            setLoadingHistory(true);
            const response = await fetch(`http://localhost:3001/api/oms/orders/${id}`);
            const data = await response.json();
            if (data.success) {
                setSelectedOrder(data.order);
                fetchPaymentHistory(id);
                fetchOrderLogs(id);
            } else {
                alert("Failed to fetch linked order.");
            }
        } catch (err) {
            console.error("Fetch Linked Order Error:", err);
        } finally {
            setLoadingHistory(false);
        }
    };

    const lastOrderIdRef = React.useRef<number | null>(null);

    useEffect(() => {
        if (selectedOrder) {
            setAmendedItems(safeParseItems(selectedOrder.items));
            setSelectedProductForAmendment(null);
            setManifestSearch('');
            setVerifiedItems([]); 
            
            // 🔥 Professional Fix: Only reset tab if we opened a DIFFERENT order
            // useRef persists across renders but doesn't trigger effect on change.
            if (lastOrderIdRef.current !== selectedOrder.id) {
                setActiveDetailTab('manifest');
                lastOrderIdRef.current = selectedOrder.id;
            }
            fetchDebtChain(selectedOrder.id);

            setTempDeliveryCharge(selectedOrder.delivery_charge || 0);
            setPaymentInput('');
            fetchPaymentHistory(selectedOrder.id);
            fetchOrderLogs(selectedOrder.id);
        } else {
            setIsEditingManifest(false);
            setShowOriginal(false);
            setManifestSearch('');
            setSelectedProductForAmendment(null);
            setVerifiedItems([]);
            // Don't reset lastOrderIdRef.current here, wait for next order
        }
    }, [selectedOrder]);

    const toggleItemVerification = (key: string) => {
        setVerifiedItems(prev => 
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    const fetchProducts = async () => {
        try {
            const res = await fetch('http://localhost:3001/api/ai-brain/products?limit=1000');
            const data = await res.json();
            if (data.success) setProducts(data.products || []);
        } catch (e) {
            console.error('Failed to fetch products', e);
        }
    };

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/oms/orders');
            const data = await res.json();
            if (data.success) setOrders(data.orders);
        } catch (e) {
            console.error('Failed to fetch orders', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrders();
        fetchProducts();
        
        // Socket listener for real-time updates
        const socket = (window as any).socket;
        if (socket) {
            socket.on('order_status_updated', () => fetchOrders());
            socket.on('order_payment_updated', () => fetchOrders());
            socket.on('new_order_created', () => fetchOrders());
            socket.on('order_manifest_updated', () => fetchOrders());
        }
    }, []);

    const fetchCustomerHistory = async (customerNumber: string) => {
        if (!customerNumber) return;
        setLoadingHistory(true);
        try {
            const res = await fetch(`http://localhost:3001/api/oms/orders?customer_number=${encodeURIComponent(customerNumber)}`);
            const data = await res.json();
            if (data.success) {
                setCustomerHistory(data.orders || []);
            }
        } catch (e) {
            console.error('Failed to fetch history', e);
        } finally {
            setLoadingHistory(false);
        }
    };

    useEffect(() => {
        if (['customer', 'finance'].includes(activeDetailTab) && selectedOrder?.customer_number) {
            fetchCustomerMetadata(selectedOrder.customer_number);
        }
    }, [activeDetailTab, selectedOrder?.customer_number]);

    const fetchOtherActiveOrders = async (number: string) => {
        try {
            const res = await fetch(`http://localhost:3001/api/oms/customers/${encodeURIComponent(number)}/active-orders`);
            const data = await res.json();
            if (data.success) {
                setOtherActiveOrders(data.orders || []);
            }
        } catch (e) {
            console.error('Failed to fetch other active orders', e);
        }
    };

    useEffect(() => {
        if (selectedOrder?.customer_number) {
            fetchOtherActiveOrders(selectedOrder.customer_number);
        } else {
            setOtherActiveOrders([]);
        }
    }, [selectedOrder?.customer_number]);

    const handleUpdateFinancials = async () => {
        if (!selectedOrder) return;
        setLoading(true);
        try {
            const items = safeParseItems(selectedOrder.items);
            const subtotal = items.reduce((sum: number, it: any) => {
                const p = parseFloat(it.price.toString().replace(/[^0-9.]/g, '')) || 0;
                return sum + (p * (it.qty || 1));
            }, 0);
            const totalAmount = subtotal + tempDeliveryCharge - (selectedOrder.discount || 0);
            
            const res = await fetch(`http://localhost:3001/api/oms/orders/${selectedOrder.id}/manifest`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    items, 
                    total_amount: totalAmount,
                    delivery_charge: tempDeliveryCharge,
                    discount: selectedOrder.discount || 0
                })
            });
            const data = await res.json();
            if (data.success) {
                if (data.order) setSelectedOrder(data.order);
                fetchOrders();
            }
        } catch (e) {
            console.error('Failed to update financials', e);
        } finally {
            setLoading(false);
        }
    };

    const fetchDebtChain = async (id: number | string) => {
        setLoadingDebtChain(true);
        try {
            const res = await fetch(`http://localhost:3001/api/oms/orders/${id}/debt-chain`);
            const data = await res.json();
            if (data.success) setDebtChain(data.chain || []);
        } catch (e) {
            console.error("Failed to fetch debt chain", e);
        } finally {
            setLoadingDebtChain(false);
        }
    };

    const handleCollectPayment = async (amountInput: string) => {
        if (!selectedOrder) return;
        const inputVal = parseFloat(amountInput) || 0;
        if (inputVal <= 0) return;

        const newAmountPaid = (selectedOrder.amount_paid || 0) + inputVal;
        const orderTotal = parseFloat(selectedOrder.total_amount.toString().replace(/[^0-9.]/g, ''));
        
        let newStatus = 'partial';
        if (newAmountPaid >= orderTotal) {
            newStatus = 'paid';
        }

        setLoading(true);
        try {
            await updatePayment(selectedOrder.id, newStatus, newAmountPaid, paymentMethod, paymentNotes);
            setPaymentInput('');
            setPaymentNotes('');
            // Refresh financial data
            if (selectedOrder.customer_number) {
                fetchCustomerMetadata(selectedOrder.customer_number);
            }
        } catch (e) {
            console.error('Failed to collect payment', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSendMemo = async () => {
        if (!selectedOrder) return;
        try {
            const res = await fetch(`http://localhost:3001/api/oms/orders/${selectedOrder.id}/send-memo`, { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert('Smart Memo Queued/Sent via WhatsApp successfully!');
            } else {
                alert('Failed to send memo: ' + data.error);
            }
        } catch (e) {
            console.error('Failed to send memo', e);
            alert('Failed to send memo');
        }
    };

    const updatePayment = async (id: number, paymentStatus: string, amountPaid: number, method: string = 'cash', notes: string = '') => {
        try {
            const res = await fetch(`http://localhost:3001/api/oms/orders/${id}/payment`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    payment_status: paymentStatus, 
                    amount_paid: amountPaid,
                    method,
                    notes
                })
            });
            const data = await res.json();
            if (data.success) {
                fetchOrders();
                fetchPaymentHistory(id);
                if (selectedOrder?.id === id) {
                    setSelectedOrder(prev => prev ? { ...prev, payment_status: paymentStatus as any, amount_paid: amountPaid } : null);
                }
            }
        } catch (e) {
            console.error('Failed to update payment', e);
        }
    };

    const updateStatus = async (id: number, status: OrderStatus, trackingId?: string, reactivateIds?: number[]) => {
        // 🔒 Frontend Guard
        if (['processing', 'shipped', 'delivered'].includes(status) && !selectedOrder?.customer_address) {
            alert("⚠️ ACTION BLOCKED: A shipping address must be added before this order can leave the Pending stage.");
            return;
        }

        // 🚨 Intercept Cancellation for Master Orders
        if (status === 'cancelled' && !reactivateIds) {
            try {
                setIsFetchingPredecessors(true);
                const res = await fetch(`http://localhost:3001/api/oms/orders/${id}/predecessors`);
                const data = await res.json();
                if (data.success && data.predecessors.length > 0) {
                    setPredecessors(data.predecessors);
                    setSelectedReactivateIds([]); // Default: None reactivated (user's preferred simple logic)
                    setIsCancelModalOpen(true);
                    return; // Stop here, wait for modal confirmation
                }
            } catch (e) {
                console.error("Fetch Predecessors Error:", e);
            } finally {
                setIsFetchingPredecessors(false);
            }
        }

        try {
            const res = await fetch(`http://localhost:3001/api/oms/orders/${id}/status`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    status, 
                    tracking_id: trackingId,
                    reactivateOrderIds: reactivateIds 
                })
            });

            if (res.status === 400) {
                const errData = await res.json();
                alert(errData.error || "Update Failed");
                return;
            }

            const data = await res.json();
            if (data.success) {
                fetchOrders();
                if (selectedOrder?.id === id) {
                    setSelectedOrder(prev => prev ? { ...prev, status, tracking_id: trackingId || prev.tracking_id } : null);
                }
            }
        } catch (e) {
            console.error('Failed to update status', e);
        }
    };

    const saveManifest = async () => {
        if (!selectedOrder) return;
        setLoading(true);
        try {
            const totalAmount = amendedItems.reduce((sum, it) => {
                const p = parseFloat(it.price.toString().replace(/[^0-9.]/g, '')) || 0;
                return sum + (p * (it.qty || 1));
            }, 0) + (selectedOrder.delivery_charge || 0) - (selectedOrder.discount || 0);
            
            const res = await fetch(`http://localhost:3001/api/oms/orders/${selectedOrder.id}/manifest`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    items: amendedItems, 
                    total_amount: totalAmount,
                    delivery_charge: selectedOrder.delivery_charge || 0,
                    discount: selectedOrder.discount || 0
                })
            });
            const data = await res.json();
            if (data.success) {
                setIsEditingManifest(false);
                if (data.order) {
                    setSelectedOrder(data.order);
                    fetchDebtChain(id);
                }
                fetchOrders();
            }
        } catch (e) {
            console.error('Failed to save manifest', e);
        } finally {
            setLoading(false);
        }
    };

    const handleQtyChange = (idx: number, delta: number) => {
        setAmendedItems(prev => prev.map((item, i) => {
            if (i === idx) {
                const newQty = Math.max(1, (item.qty || 1) + delta);
                return { ...item, qty: newQty };
            }
            return item;
        }));
    };

    const removeItem = (idx: number) => {
        setAmendedItems(prev => prev.filter((_, i) => i !== idx));
    };

    const addAmendedItem = () => {
        if (!selectedProductForAmendment) return;

        let rawPrice = selectedProductForAmendment.price;
        if (selectedVariantForAmendment && selectedProductForAmendment.variants?.items) {
            const variant = selectedProductForAmendment.variants.items.find((v: any, i: number) => {
                const vName = v.name || (v.type && v.value ? `${v.type}: ${v.value}` : (v.value || v.type || v.sku || `Variant ${i + 1}`));
                return vName === selectedVariantForAmendment;
            });
            if (variant && variant.price) rawPrice = variant.price;
        }

        const cleanPriceString = rawPrice.toString().split('-')[0].replace(/[^0-9.]/g, '');
        const finalPrice = parseFloat(cleanPriceString) || 0;

        const newItem = {
            id: selectedProductForAmendment.id,
            name: selectedProductForAmendment.name,
            qty: amendmentQty,
            price: finalPrice,
            ...(selectedVariantForAmendment ? { variant: selectedVariantForAmendment } : {})
        };

        setAmendedItems(prev => [...prev, newItem as any]);
        setSelectedProductForAmendment(null);
        setSelectedVariantForAmendment('');
        setAmendmentQty(1);
    };

    const getStatusColor = (status: OrderStatus) => {
        switch (status) {
            case 'pending': return 'bg-amber-100 text-amber-700 border-amber-200';
            case 'processing': return 'bg-blue-100 text-blue-700 border-blue-200';
            case 'shipped': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
            case 'delivered': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'cancelled': return 'bg-rose-100 text-rose-700 border-rose-200';
            case 'merged': return 'bg-purple-100 text-purple-700 border-purple-200';
            default: return 'bg-gray-100 text-gray-700 border-gray-200';
        }
    };

    const getPaymentStatusColor = (status: string) => {
        switch (status) {
            case 'paid': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
            case 'partial': return 'bg-blue-100 text-blue-700 border-blue-200';
            default: return 'bg-gray-100 text-gray-500 border-gray-200';
        }
    };

    const getStatusIcon = (status: OrderStatus | 'merged') => {
        switch (status) {
            case 'pending': return <Clock size={12} />;
            case 'processing': return <Package size={12} />;
            case 'shipped': return <Truck size={12} />;
            case 'delivered': return <CheckCircle2 size={12} />;
            case 'cancelled': return <XCircle size={12} />;
            case 'merged': return <RefreshCw size={12} />;
            default: return <Clock size={12} />;
        }
    };

    const filteredOrders = orders.filter(o => {
        const matchesStatus = filter === 'all' || o.status === filter;
        const matchesSearch = o.customer_number.includes(searchQuery) || 
                              (o.id.toString().includes(searchQuery));
        
        const total = parseFloat(o.total_amount.toString().replace(/[^0-9.]/g, '')) || 0;
        const isPaidInFull = (o.amount_paid || 0) >= total;
        
        const matchesPayment = paymentFilter === 'all' || 
                               (paymentFilter === 'paid' && isPaidInFull) ||
                               (paymentFilter === 'due' && !isPaidInFull);

        return matchesStatus && matchesSearch && matchesPayment;
    });

    const stats = {
        total: orders.length,
        pending: orders.filter(o => o.status === 'pending').length,
        shipped: orders.filter(o => o.status === 'shipped').length,
        delivered: orders.filter(o => o.status === 'delivered').length,
    };

    return (
        <div className="flex flex-col h-full gap-6">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                        <ShoppingBag size={32} className="text-wa-teal" />
                        OMS <span className="text-wa-teal">Workspace</span>
                    </h1>
                    <p className="text-gray-500 font-medium">Manage your sales lifecycle and automate fulfillment</p>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={() => setIsCreatingOrder(true)}
                        className="bg-wa-teal text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-wa-teal-dark active:scale-95 transition-all shadow-lg shadow-wa-teal/10 flex items-center gap-2"
                    >
                        <Plus size={18} /> Create Order
                    </button>
                    <button 
                        onClick={fetchOrders}
                        className="p-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition-all active:scale-95"
                    >
                        <History size={20} />
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="Total Orders" value={stats.total} icon={<ShoppingBag />} color="from-gray-700 to-gray-900" />
                <StatCard label="Pending Approval" value={stats.pending} icon={<Clock />} color="from-amber-500 to-orange-600" />
                <StatCard label="In Transit" value={stats.shipped} icon={<Truck />} color="from-indigo-500 to-blue-600" />
                <StatCard label="Success Rate" value={`${stats.total ? Math.round((stats.delivered / stats.total) * 100) : 0}%`} icon={<CheckCircle2 />} color="from-emerald-500 to-teal-600" />
            </div>

            {/* Filters & Search */}
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-hide">
                        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>All Orders</FilterButton>
                        <FilterButton active={filter === 'pending'} onClick={() => setFilter('pending')}>Pending</FilterButton>
                        <FilterButton active={filter === 'processing'} onClick={() => setFilter('processing')}>Processing</FilterButton>
                        <FilterButton active={filter === 'shipped'} onClick={() => setFilter('shipped')}>Shipped</FilterButton>
                        <FilterButton active={filter === 'delivered'} onClick={() => setFilter('delivered')}>Completed</FilterButton>
                    </div>
                    <div className="flex items-center gap-2 bg-indigo-50/50 p-1 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-hide">
                        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest px-3">Finance:</span>
                        <FilterButton active={paymentFilter === 'all'} onClick={() => setPaymentFilter('all')}>Show All</FilterButton>
                        <FilterButton active={paymentFilter === 'paid'} onClick={() => setPaymentFilter('paid')}>Already Paid</FilterButton>
                        <FilterButton active={paymentFilter === 'due'} onClick={() => setPaymentFilter('due')}>Balance Due</FilterButton>
                    </div>
                </div>

                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input 
                        type="text" 
                        placeholder="Search ID or Phone..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 bg-gray-50 border-none rounded-xl focus:ring-2 focus:ring-wa-teal/20 transition-all outline-none text-sm"
                    />
                </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-3xl border border-gray-100 shadow-lg overflow-hidden flex-1 flex flex-col relative min-h-[750px]">
                {loading && (
                    <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
                        <div className="w-10 h-10 border-4 border-wa-teal border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}
                
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/50 border-b border-gray-100">
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Order ID</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Customer</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Items</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Amount</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                            {filteredOrders.length > 0 ? filteredOrders.map(order => (
                                <tr 
                                    key={order.id} 
                                    className="group hover:bg-wa-teal/[0.02] transition-colors cursor-pointer"
                                    onClick={() => setSelectedOrder(order)}
                                >
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-black text-gray-900">#{order.id}</span>
                                            <span className="text-[10px] text-gray-400 font-medium">{new Date(order.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 text-xs font-bold ring-2 ring-white">
                                                {(order.customer_name || order.customer_number).slice(-2)}
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="font-bold text-gray-800 text-sm truncate max-w-[150px]">{order.customer_name || 'Guest User'}</span>
                                                <span className="text-[10px] text-gray-400 flex items-center gap-1 font-medium italic">{order.customer_number}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            const items = safeParseItems(order.items);
                                            return (
                                                <div className="flex -space-x-2">
                                                    {items.slice(0, 3).map((it: any, idx: number) => (
                                                        <div key={idx} className="w-7 h-7 rounded border-2 border-white bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-600 shadow-sm overflow-hidden" title={it.name}>
                                                            {it.name[0].toUpperCase()}
                                                        </div>
                                                    ))}
                                                    {items.length > 3 && (
                                                        <div className="w-7 h-7 rounded border-2 border-white bg-gray-800 flex items-center justify-center text-[8px] font-black text-white shadow-sm">
                                                            +{items.length - 3}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1 text-right md:text-left">
                                            <span className="font-black text-gray-900 leading-tight">
                                                {(() => {
                                                    // 🛡️ SMART LIST DISPLAY: Reconcile amount on the fly to prevent ghost debt
                                                    const items = safeParseItems(order.items);
                                                    const subtotal = items.reduce((acc: number, it: any) => {
                                                        const p = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0;
                                                        return acc + (p * (it.qty || 1));
                                                    }, 0);
                                                    const del = order.delivery_charge || 0;
                                                    const disc = order.discount || 0;
                                                    const baseTotal = subtotal + del - disc;
                                                    
                                                    // If this order has debt added, check if those items are ALREADY in the manifest
                                                    // Note: Full debtChain isn't available for every list item for performance, 
                                                    // so we use the database's total_amount but guard against double counting if we detect a merge.
                                                    const hasMergedItems = items.some((it: any) => it.mergedFrom);
                                                    const dbTotal = parseFloat(order.total_amount.toString().replace(/[^0-9.]/g, '')) || 0;
                                                    
                                                    // If we detect a discrepancy where DB Total > Calculated Total but items are merged, 
                                                    // we trust the baseTotal + any non-duplicated debt.
                                                    return `৳${dbTotal.toLocaleString()}`;
                                                })()}
                                            </span>
                                            {(() => {
                                                const total = parseFloat(order.total_amount.toString().replace(/[^0-9.]/g, '')) || 0;
                                                const paid = order.amount_paid || 0;
                                                const due = Math.max(0, total - paid);
                                                const isTransferred = isCurrentlyTransferred(order.order_notes);
                                                
                                                if (isTransferred) {
                                                    return <span className="text-[8px] font-black text-blue-500 uppercase px-2 py-0.5 bg-blue-50 rounded-lg border border-blue-100 w-fit">TRANSFERRED</span>;
                                                } else if (due <= 0) {
                                                    return <span className="text-[8px] font-black text-emerald-500 uppercase px-2 py-0.5 bg-emerald-50 rounded-lg border border-emerald-100 w-fit">PAID</span>;
                                                } else {
                                                    return (
                                                        <div className="flex flex-col gap-0.5">
                                                            <span className="text-[8px] font-black text-amber-500 uppercase px-2 py-0.5 bg-amber-50 rounded-lg border border-amber-100 w-fit">৳{due.toLocaleString()} Due</span>
                                                            {paid > 0 && <span className="text-[7px] text-gray-400 font-bold uppercase tracking-tighter">৳{paid.toLocaleString()} Collected</span>}
                                                        </div>
                                                    );
                                                }
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            <span className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase flex items-center gap-1.5 w-fit border ${getStatusColor(order.status)}`}>
                                                {getStatusIcon(order.status)}
                                                {order.status}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button className="p-2 text-gray-400 hover:text-wa-teal hover:bg-wa-teal/5 rounded-lg transition-all active:scale-95">
                                            <ArrowRight size={18} />
                                        </button>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={6} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-3 grayscale opacity-30">
                                            <ShoppingBag size={48} />
                                            <p className="font-black text-xl">No Orders Found</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Side Drawer For Details */}
            <AnimatePresence>
                {selectedOrder && (() => {
                    // 💰 MASTER FINANCIAL ENGINE (Shared Context)
                    const itemsToCalc = isEditingManifest ? amendedItems : safeParseItems(selectedOrder.items);
                    const subtotal = itemsToCalc.reduce((acc: number, it: any) => {
                        const price = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0;
                        return acc + (price * (it.qty || 1));
                    }, 0);
                    const delivery = isEditingManifest ? tempDeliveryCharge : (selectedOrder.delivery_charge || 0);
                    const discount = selectedOrder.discount || 0;
                    
                    const currentOrderGross = (parseFloat(subtotal.toString()) || 0) + (parseFloat(delivery.toString()) || 0) - (parseFloat(discount.toString()) || 0);
                    const predecessorsGross = (debtChain || []).reduce((sum, o) => {
                        if (o.id == selectedOrder.id) return sum;
                        
                        // 🛡️ RECONCILIATION 2.0: 
                        const isMergedIn = itemsToCalc.some((it: any) => it.mergedFrom == o.id);
                        if (isMergedIn) return sum;

                        if (parseFloat(selectedOrder.due_added || 0) >= parseFloat(o.total_amount || 0)) return sum;
                        
                        const total = parseFloat((o.total_amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                        const dueAdded = parseFloat(o.due_added || 0);
                        return sum + (total - dueAdded);
                    }, 0);

                    const totalInvoice = currentOrderGross + predecessorsGross;
                    const paid = selectedOrder.amount_paid || 0;

                    return (
                        <>
                            <motion.div 
                                initial={{ opacity: 0 }} 
                                animate={{ opacity: 1 }} 
                                exit={{ opacity: 0 }}
                                onClick={() => setSelectedOrder(null)}
                                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[60]"
                            />
                            <motion.div 
                                initial={{ x: '100%' }} 
                                animate={{ x: 0 }} 
                                exit={{ x: '100%' }}
                                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                                className="fixed right-0 top-0 bottom-0 w-full max-w-4xl bg-white shadow-[-20px_0_50px_-20px_rgba(0,0,0,0.1)] z-[70] overflow-hidden flex flex-col"
                            >
                                <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                                    <div className="flex items-center gap-3">
                                        <div className="p-3 bg-wa-teal/10 text-wa-teal rounded-2xl">
                                            <ShoppingBag size={24} />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h2 className="text-xl font-black text-gray-900">Order Detail</h2>
                                                {selectedOrder.original_items && (
                                                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[8px] font-black uppercase">Amended</span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Reference: #{selectedOrder.id}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {!['delivered', 'cancelled', 'merged'].includes(selectedOrder.status) && (
                                            <button 
                                                onClick={() => setIsEditingManifest(!isEditingManifest)}
                                                className={`px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 ${
                                                    isEditingManifest ? 'bg-rose-50 text-rose-500' : 'bg-wa-teal/10 text-wa-teal hover:bg-wa-teal/20'
                                                }`}
                                            >
                                                {isEditingManifest ? <>&times; CANCEL EDIT</> : <><Edit3 size={14} /> EDIT MANIFEST</>}
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => setSelectedOrder(null)}
                                            className="p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-all font-black text-xl"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-hidden flex flex-col">
                                    {/* 🗂 Premium Tab Navigation */}
                                    <div className="px-6 py-2 bg-white border-b border-gray-100 flex items-center gap-1 overflow-x-auto no-scrollbar">
                                        <div className="flex gap-1 bg-gray-100/50 p-1 rounded-xl w-full">
                                            <DetailTabBtn active={activeDetailTab === 'manifest'} onClick={() => setActiveDetailTab('manifest')} label="Manifest" icon={<ShoppingBag size={14} />} />
                                            <DetailTabBtn active={activeDetailTab === 'logistics'} onClick={() => setActiveDetailTab('logistics')} label="Logistics" icon={<Truck size={14} />} />
                                            <DetailTabBtn active={activeDetailTab === 'finance'} onClick={() => setActiveDetailTab('finance')} label="Finance" icon={<DollarSign size={14} />} />
                                            <DetailTabBtn active={activeDetailTab === 'customer'} onClick={() => setActiveDetailTab('customer')} label="Customer" icon={<User size={14} />} />
                                            <DetailTabBtn active={activeDetailTab === 'timeline'} onClick={() => setActiveDetailTab('timeline')} label="Timeline" icon={<History size={14} />} />
                                        </div>
                                    </div>

                                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar pb-32">
                                    <AnimatePresence mode="wait">
                                        {/* 📦 MANIFEST TAB */}
                                        {activeDetailTab === 'manifest' && (
                                            <motion.div 
                                                key="tab-manifest"
                                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                                                className="space-y-6"
                                            >
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                        <Package size={14} /> {isEditingManifest ? 'Amending Manifest' : 'Order Manifest'}
                                                    </h3>
                                                    {selectedOrder.original_items && !isEditingManifest && (
                                                        <button 
                                                            onClick={() => setShowOriginal(!showOriginal)}
                                                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black transition-all shadow-sm ${
                                                                showOriginal ? 'bg-amber-500 text-white shadow-amber-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                                            }`}
                                                        >
                                                            {showOriginal ? <Eye size={14} /> : <History size={14} />}
                                                            {showOriginal ? 'VIEW CURRENT' : 'VIEW ORIGINAL REQUEST'}
                                                        </button>
                                                    )}
                                                </div>

                                                {/* 🌍 MULTI-DESTINATION INTELLIGENCE */}
                                                {(() => {
                                                    const currentAddr = (selectedOrder.shipping_address || 'UNSPECIFIED').trim().toLowerCase().replace(/\s+/g, ' ');
                                                    const others = otherActiveOrders.filter(o => 
                                                        o.id !== selectedOrder.id && 
                                                        (o.shipping_address || 'UNSPECIFIED').trim().toLowerCase().replace(/\s+/g, ' ') !== currentAddr
                                                    );

                                                    if (others.length === 0) return null;

                                                    return (
                                                        <motion.div 
                                                            initial={{ opacity: 0, scale: 0.95 }}
                                                            animate={{ opacity: 1, scale: 1 }}
                                                            className="bg-rose-50 border-2 border-rose-100 rounded-[2rem] p-6 space-y-4 mb-6 shadow-sm border-dashed"
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="p-3 bg-rose-500 text-white rounded-2xl shadow-lg">
                                                                    <MapPin size={24} />
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-sm font-black text-rose-900 uppercase tracking-widest">Multi-Destination Conflict</h4>
                                                                    <p className="text-[10px] font-bold text-rose-600 uppercase tracking-widest mt-1">
                                                                        Customer has {others.length} other active orders for DIFFERENT addresses.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-1 gap-2">
                                                                {others.map(o => (
                                                                    <button 
                                                                        key={o.id}
                                                                        onClick={() => fetchAndOpenOrder(o.id)}
                                                                        className="flex items-center justify-between p-3 bg-white/60 hover:bg-white rounded-xl border border-rose-100 transition-all text-left group"
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            <span className="text-[10px] font-black text-rose-700 bg-rose-100 px-2 py-0.5 rounded-md">#{o.id}</span>
                                                                            <span className="text-[10px] font-bold text-gray-600 truncate max-w-[200px]">{o.shipping_address}</span>
                                                                        </div>
                                                                        <ExternalLink size={12} className="text-rose-400 opacity-0 group-hover:opacity-100 transition-all" />
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </motion.div>
                                                    );
                                                })()}

                                                    {/* 🚨 Merge/Lock Alerts */}
                                                    {selectedOrder.status === 'merged' && (
                                                        <div className="bg-purple-50 border-2 border-purple-100 rounded-[2rem] p-6 flex items-center justify-between gap-6 shadow-sm mb-6">
                                                            <div className="flex items-center gap-4">
                                                                <div className="p-3 bg-purple-600 text-white rounded-2xl shadow-lg">
                                                                    <RefreshCw size={24} />
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-sm font-black text-purple-900 uppercase tracking-widest">Order Consolidated</h4>
                                                                    <p className="text-[10px] font-bold text-purple-600 uppercase tracking-widest mt-1">This order is locked because it was merged into a newer shipment.</p>
                                                                </div>
                                                            </div>
                                                            {(() => {
                                                                const notes = selectedOrder.order_notes || '';
                                                                // Match any variation of Master Order: #ID
                                                                const match = notes.match(/(?:Successor Master Order|Master Order|Moved to):\s*#(\d+)/i) || 
                                                                              notes.match(/Successor Order\s*#(\d+)/i);
                                                                
                                                                const successorId = match ? match[1] : null;
                                                                
                                                                if (!successorId) return null;

                                                                return (
                                                                    <button 
                                                                        onClick={(e) => { e.stopPropagation(); fetchAndOpenOrder(successorId); }}
                                                                        className="px-6 py-3 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase hover:bg-purple-700 transition-all shadow-lg flex items-center gap-2"
                                                                    >
                                                                        View Master Order <ArrowRight size={14} />
                                                                    </button>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}

                                                    {/* Smart Diff / Original View */}
                                                <AnimatePresence mode="wait">
                                                    {showOriginal ? (
                                                        <motion.div 
                                                            key="original"
                                                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                                                            className="border-2 border-amber-200 rounded-[2.5rem] p-8 bg-amber-50/50 space-y-6 relative overflow-hidden"
                                                        >
                                                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-200/20 rounded-bl-full -mr-10 -mt-10" />
                                                            <div className="flex items-center justify-between relative z-10">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="p-2 bg-amber-500 text-white rounded-xl shadow-lg">
                                                                        <History size={18} />
                                                                    </div>
                                                                    <div>
                                                                        <h4 className="text-xs font-black text-amber-900 uppercase tracking-tighter">Initial Customer Intent</h4>
                                                                        <p className="text-[9px] font-bold text-amber-600 uppercase tracking-widest">Snapshot taken before amendments</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            <div className="space-y-4">
                                                                {safeParseItems(selectedOrder.original_items || selectedOrder.items).map((item: any, idx: number) => (
                                                                    <div key={idx} className="flex justify-between items-center bg-white/60 p-4 rounded-2xl border border-amber-100 shadow-sm transition-all hover:translate-x-1">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-sm font-black text-gray-800">{item.name}</span>
                                                                            {item.variant && <span className="text-[9px] font-black text-amber-600 uppercase flex items-center gap-1 mt-1"><Plus size={8} /> {item.variant}</span>}
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <div className="text-[10px] font-black text-gray-400 uppercase">QTY: {item.qty}</div>
                                                                            <div className="text-xs font-black text-gray-900">৳{((parseFloat(item.price.toString().replace(/[^0-9.]/g, '')) || 0) * (item.qty || 1)).toLocaleString()}</div>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            <div className="p-4 bg-amber-100/50 rounded-2xl border border-amber-200 text-center">
                                                                <span className="text-[9px] font-black text-amber-700 uppercase tracking-widest">This list represents the original items received from the customer.</span>
                                                            </div>
                                                        </motion.div>
                                                    ) : (
                                                        <motion.div 
                                                            key="current"
                                                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                                            className="border border-gray-100 rounded-[2.5rem] divide-y divide-gray-50 overflow-hidden shadow-sm"
                                                        >
                                                            {(isEditingManifest ? amendedItems : safeParseItems(selectedOrder.items)).map((item: any, idx: number) => (
                                                                <div key={idx} className={`p-5 flex items-center justify-between transition-colors ${isEditingManifest ? 'bg-wa-teal/[0.01]' : 'hover:bg-gray-50/30'}`}>
                                                                    <div className="flex items-center gap-4">
                                                                        <div className="w-10 h-10 bg-gray-100 rounded-2xl flex items-center justify-center font-black text-gray-400 text-xs">
                                                                            {idx + 1}
                                                                        </div>
                                                                        <div className="flex flex-col">
                                                                            <div className="flex items-center gap-2">
                                                                                <span className="font-bold text-gray-900 text-sm leading-tight">{item.name}</span>
                                                                                 {item.mergedFrom && (
                                                                                    <span 
                                                                                        onClick={(e) => { e.stopPropagation(); fetchAndOpenOrder(item.mergedFrom); }}
                                                                                        className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded text-[7px] font-black uppercase border border-purple-100 cursor-pointer hover:bg-purple-600 hover:text-white transition-all shadow-sm active:scale-95"
                                                                                    >
                                                                                        From #{item.mergedFrom}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            {item.variant && <span className="text-[9px] font-black text-wa-teal uppercase flex items-center gap-1"><Plus size={8} /> {item.variant}</span>}
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    <div className="flex items-center gap-6">
                                                                        {isEditingManifest ? (
                                                                            <div className="flex items-center gap-3 bg-white border border-gray-100 rounded-xl p-1 shadow-sm">
                                                                                <button onClick={() => handleQtyChange(idx, -1)} className="p-1.5 hover:bg-rose-50 text-rose-500 rounded-lg transition-all"><Minus size={14} /></button>
                                                                                <span className="text-sm font-black w-8 text-center">{item.qty}</span>
                                                                                <button onClick={() => handleQtyChange(idx, 1)} className="p-1.5 hover:bg-emerald-50 text-emerald-500 rounded-lg transition-all"><Plus size={14} /></button>
                                                                                <button onClick={() => removeItem(idx)} className="p-1.5 text-gray-300 hover:text-rose-500 ml-1"><Trash2 size={14} /></button>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="text-[10px] text-gray-400 font-black uppercase bg-gray-50 px-2 py-1 rounded-lg">QTY: {item.qty || 1}</span>
                                                                        )}
                                                                        <span className="font-black text-gray-900 min-w-[70px] text-right">৳{(parseFloat(item.price.toString().replace(/[^0-9.]/g, '')) * (item.qty || 1)).toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                            ))}

                                                            {isEditingManifest && (
                                                                <div className="p-6 bg-gray-50 space-y-4">
                                                                    <div className="relative">
                                                                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                                                                        <input 
                                                                            type="text"
                                                                            value={manifestSearch}
                                                                            onChange={(e) => setManifestSearch(e.target.value)}
                                                                            placeholder="Search products to add..."
                                                                            className="w-full pl-12 pr-6 py-4 bg-white border-2 border-gray-100 rounded-2xl focus:border-wa-teal outline-none transition-all text-xs font-bold"
                                                                        />
                                                                    </div>

                                                                    {/* Product Results */}
                                                                    {manifestSearch.length > 1 && (
                                                                        <div className="max-h-64 overflow-y-auto bg-white border border-gray-100 rounded-2xl p-2 shadow-xl space-y-1">
                                                                            {products.filter(p => p.name.toLowerCase().includes(manifestSearch.toLowerCase()))
                                                                                .map(p => (
                                                                                    <button 
                                                                                        key={p.id}
                                                                                        onClick={() => {
                                                                                            setSelectedProductForAmendment(p);
                                                                                            setManifestSearch('');
                                                                                            setSelectedVariantForAmendment('');
                                                                                            setAmendmentQty(1);
                                                                                        }}
                                                                                        className="w-full text-left p-3 hover:bg-wa-teal/5 rounded-xl transition-all flex items-center justify-between group"
                                                                                    >
                                                                                        <div className="flex items-center gap-3">
                                                                                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-[10px] font-black text-gray-400 group-hover:bg-wa-teal/10 group-hover:text-wa-teal">
                                                                                                {p.name[0].toUpperCase()}
                                                                                            </div>
                                                                                            <span className="text-xs font-black text-gray-700">{p.name}</span>
                                                                                        </div>
                                                                                        <span className="text-[10px] font-black text-gray-400 group-hover:text-wa-teal">৳{p.price.toLocaleString()}</span>
                                                                                    </button>
                                                                                ))}
                                                                            {products.filter(p => p.name.toLowerCase().includes(manifestSearch.toLowerCase())).length === 0 && (
                                                                                <div className="p-4 text-center text-[10px] font-black text-gray-400 uppercase tracking-widest">No products found</div>
                                                                            )}
                                                                        </div>
                                                                    )}

                                                                    {selectedProductForAmendment && (
                                                                        <motion.div 
                                                                            initial={{ opacity: 0, scale: 0.95 }}
                                                                            animate={{ opacity: 1, scale: 1 }}
                                                                            className="p-5 bg-wa-teal/[0.03] border border-wa-teal/10 rounded-2xl space-y-4"
                                                                        >
                                                                            <div className="flex justify-between items-center">
                                                                                <div className="flex flex-col">
                                                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Selected to Add</span>
                                                                                    <span className="text-xs font-black text-wa-teal uppercase">{selectedProductForAmendment.name}</span>
                                                                                </div>
                                                                                <button onClick={() => setSelectedProductForAmendment(null)} className="text-[10px] font-black text-gray-400 hover:text-rose-500 transition-colors uppercase">Cancel</button>
                                                                            </div>

                                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                                {selectedProductForAmendment.variants?.items?.length > 0 && (
                                                                                    <div className="space-y-1.5">
                                                                                        <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block pl-1">Variant</label>
                                                                                        <select 
                                                                                            value={selectedVariantForAmendment}
                                                                                            onChange={e => setSelectedVariantForAmendment(e.target.value)}
                                                                                            className="w-full p-3 bg-white border border-gray-100 rounded-xl text-xs font-black outline-none focus:border-wa-teal transition-all"
                                                                                        >
                                                                                            <option value="">Default (No Variant)</option>
                                                                                            {selectedProductForAmendment.variants.items.map((v: any, i: number) => {
                                                                                                const name = v.name || (v.type && v.value ? `${v.type}: ${v.value}` : (v.value || v.type || v.sku || `Variant ${i + 1}`));
                                                                                                const stockAtLocal = parseFloat(v.stock?.toString() || '0');
                                                                                                const isExplicitlyOut = v.stock_status === 0 || selectedProductForAmendment.stock_status === 0;
                                                                                                return (
                                                                                                    <option key={i} value={name} disabled={isExplicitlyOut}>
                                                                                                        {name} — ৳{v.price || selectedProductForAmendment.price} (Stock: {stockAtLocal}){isExplicitlyOut ? ' — OUT OF STOCK' : ''}
                                                                                                    </option>
                                                                                                );
                                                                                            })}
                                                                                        </select>
                                                                                    </div>
                                                                                )}
                                                                                <div className="space-y-1.5">
                                                                                    <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest block pl-1">Quantity</label>
                                                                                    <div className="flex items-center gap-2">
                                                                                         <input 
                                                                                             type="number" 
                                                                                             step="0.001"
                                                                                             value={amendmentQty} 
                                                                                             onChange={e => setAmendmentQty(parseFloat(e.target.value) || 1)}
                                                                                             onFocus={(e) => e.target.select()}
                                                                                             className="w-20 p-3 bg-white border border-gray-100 rounded-xl text-xs font-black outline-none focus:border-wa-teal transition-all text-center"
                                                                                             placeholder="0.000"
                                                                                         />
                                                                                        <button 
                                                                                            onClick={addAmendedItem}
                                                                                            className="px-6 py-3 bg-wa-teal text-white rounded-xl text-[10px] font-bold hover:bg-wa-teal-dark shadow-lg shadow-wa-teal/20 transition-all uppercase whitespace-nowrap"
                                                                                        >
                                                                                            Add Item
                                                                                        </button>
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                {/* 🏷 Manual Verification Section */}
                                                {!isEditingManifest && ['pending', 'processing'].includes(selectedOrder.status) && (
                                                    <motion.div 
                                                        initial={{ opacity: 0, y: 10 }}
                                                        animate={{ opacity: 1, y: 0 }}
                                                        className="bg-emerald-50/50 p-6 rounded-[2.5rem] border border-emerald-100 space-y-5"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <div className="flex items-center gap-2">
                                                                <div className="p-2 bg-emerald-500 text-white rounded-lg shadow-lg">
                                                                    <CheckCircle2 size={14} />
                                                                </div>
                                                                <div>
                                                                    <h3 className="text-xs font-black text-emerald-900 uppercase tracking-tighter">Manual Verification</h3>
                                                                    <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-widest leading-none">Confirm physical stock matched</p>
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <span className="text-xs font-black text-emerald-700">
                                                                    {Math.round((verifiedItems.length / (safeParseItems(selectedOrder.items).length || 1)) * 100)}%
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Progress Bar */}
                                                        <div className="h-1.5 w-full bg-emerald-100 rounded-full overflow-hidden">
                                                            <motion.div 
                                                                className="h-full bg-emerald-500"
                                                                initial={{ width: 0 }}
                                                                animate={{ width: `${(verifiedItems.length / (safeParseItems(selectedOrder.items).length || 1)) * 100}%` }}
                                                            />
                                                        </div>

                                                        <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar pr-2">
                                                            {safeParseItems(selectedOrder.items).map((item: any, idx: number) => {
                                                                const key = `${item.id}-${item.variant || ''}-${idx}`;
                                                                const isVerified = verifiedItems.includes(key);
                                                                return (
                                                                    <button 
                                                                        key={key}
                                                                        onClick={() => toggleItemVerification(key)}
                                                                        className={`w-full flex items-center justify-between p-3 rounded-xl transition-all border ${
                                                                            isVerified ? 'bg-emerald-100/50 border-emerald-200' : 'bg-white border-gray-100'
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-3">
                                                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-colors ${
                                                                                isVerified ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-gray-200'
                                                                            }`}>
                                                                                {isVerified && <CheckCircle2 size={12} />}
                                                                            </div>
                                                                            <div className="flex flex-col text-left">
                                                                                <span className={`text-[11px] font-black ${isVerified ? 'text-emerald-900 line-through opacity-50' : 'text-gray-700'}`}>{item.name}</span>
                                                                                {item.variant && <span className="text-[8px] font-bold text-emerald-600 uppercase">{item.variant}</span>}
                                                                            </div>
                                                                        </div>
                                                                        <span className="text-[10px] font-black text-gray-400">× {item.qty}</span>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    </motion.div>
                                                )}
                                            </motion.div>
                                        )}
                                        {/* 💰 FINANCE TAB (Master Redesign) */}
                                        {activeDetailTab === 'finance' && (
                                            <motion.div 
                                                key="tab-finance"
                                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                                                className="space-y-10"
                                            >
                                                {(() => {
                                                    const itemsToCalculate = isEditingManifest ? amendedItems : safeParseItems(selectedOrder.items);
                                                    const subtotal = itemsToCalculate.reduce((acc: number, it: any) => {
                                                        const price = parseFloat(it.price.toString().replace(/[^0-9.]/g, '')) || 0;
                                                        return acc + (price * (it.qty || 1));
                                                    }, 0);
                                                    
                                                    const delivery = isEditingManifest ? tempDeliveryCharge : (selectedOrder.delivery_charge || 0);
                                                    const discount = selectedOrder.discount || 0;

                                                    // 🔥 SHARED FINANCE LOGIC: Direct link to Debt Intelligence
                                                    const filteredDebtChain = (debtChain || []).filter(o => o.status !== 'merged');
                                                    const dynamicPrevDue = filteredDebtChain.reduce((sum, o) => {
                                                        const orderTotal = parseFloat((o.total_amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                                        const orderPaid = parseFloat(o.amount_paid || 0);
                                                        return sum + Math.max(0, orderTotal - orderPaid);
                                                    }, 0);
                                                    
                                                    const currentOrderTotal = subtotal + delivery - discount;
                                                     const currentOrderGross = subtotal + delivery - discount;
                                                     const predecessorsGross = (debtChain || []).reduce((sum, o) => {
                                                         if (o.id == selectedOrder.id) return sum;
                                                         
                                                         // 🛡️ RECONCILIATION 2.0: 
                                                         // 1. If items are already merged into the current manifest, skip the gross total.
                                                         const isMergedIn = itemsToCalculate.some((it: any) => it.mergedFrom == o.id);
                                                         if (isMergedIn) return sum;

                                                         // 2. If the current order's due_added already explicitly includes this predecessor's total, skip it.
                                                         // (This handles the succession from Order 5 -> 6)
                                                         if (parseFloat(selectedOrder.due_added || 0) >= parseFloat(o.total_amount || 0)) {
                                                             return sum;
                                                         }
                                                         
                                                         const total = parseFloat((o.total_amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                                         const dueAdded = parseFloat(o.due_added || 0);
                                                         return sum + (total - dueAdded);
                                                     }, 0);
                                                     const totalInvoice = currentOrderGross + predecessorsGross;

                                                    // Separate Local vs Linked payments
                                                    const localPayments = (paymentHistory || []).filter(p => !p.notes?.includes('[LINKED]'));
                                                    const localPaid = localPayments.reduce((acc: number, p: any) => acc + (p.amount || 0), 0);
                                                    const paid = selectedOrder.amount_paid || 0; // Global total paid
                                                    
                                                    const isTransferred = isCurrentlyTransferred(selectedOrder.order_notes);
                                                    const collectionPercentage = Math.min(100, (paid / (totalInvoice || 1)) * 100);

                                                    return (
                                                        <>
                                                            {/* 📊 FINANCIAL HEALTH HERO */}
                                                            <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                                                                <div className="absolute top-0 right-0 w-64 h-64 bg-wa-teal/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-wa-teal/20 transition-all duration-700" />
                                                                <div className="relative z-10 space-y-10">
                                                                    <div className="flex items-center justify-between">
                                                                        <div className="flex items-center gap-4">
                                                                            <div className="p-4 bg-wa-teal/20 backdrop-blur-md rounded-[1.5rem] border border-white/10">
                                                                                <CreditCard size={28} className="text-wa-teal" />
                                                                            </div>
                                                                            <div>
                                                                                <h3 className="text-sm font-black text-white/60 uppercase tracking-[0.2em]">Financial Summary</h3>
                                                                                <p className="text-xs font-bold text-wa-teal uppercase tracking-widest">{selectedOrder.payment_status || 'Pending Verification'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="text-right">
                                                                            <div className="text-3xl font-black tracking-tighter">৳{(totalInvoice - paid).toLocaleString()}</div>
                                                                            <div className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Total Net Payable</div>
                                                                        </div>
                                                                    </div>
                                                                    <div className="space-y-4">
                                                                        <div className="flex justify-between items-end">
                                                                            <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Collection Progress</span>
                                                                            <span className="text-xl font-black text-wa-teal">{Math.round(collectionPercentage)}%</span>
                                                                        </div>
                                                                        <div className="h-3 w-full bg-white/5 rounded-full overflow-hidden border border-white/5 p-0.5">
                                                                            <motion.div initial={{ width: 0 }} animate={{ width: `${collectionPercentage}%` }} transition={{ duration: 1 }} className="h-full rounded-full bg-gradient-to-r from-wa-teal to-emerald-400" />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 💳 INSTANT COLLECTION PANEL */}
                                                            {selectedOrder.status !== 'cancelled' && selectedOrder.status !== 'returned' && selectedOrder.status !== 'merged' && (
                                                                (totalInvoice - paid) > 0 ? (
                                                                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="bg-gradient-to-r from-wa-teal to-emerald-500 p-8 rounded-[3rem] text-white shadow-xl shadow-wa-teal/20 space-y-6">
                                                                        <div className="flex flex-col md:flex-row items-center gap-6">
                                                                            <div className="flex-1">
                                                                                <h3 className="text-sm font-black uppercase tracking-widest">Instant Collection</h3>
                                                                                <p className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Settle remaining balance for this shipment</p>
                                                                            </div>
                                                                            <div className="flex gap-2 w-full md:w-auto">
                                                                                <div className="relative flex-1 md:w-48">
                                                                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/50 font-black">৳</span>
                                                                                    <input type="number" value={paymentInput} onChange={(e) => setPaymentInput(e.target.value)} className="w-full pl-8 pr-4 py-4 bg-white/10 border border-white/20 rounded-2xl text-lg font-black outline-none" placeholder="0.00" />
                                                                                </div>
                                                                                <button onClick={() => handleCollectPayment(paymentInput)} disabled={!paymentInput} className="px-10 bg-white text-wa-teal rounded-2xl font-black text-xs uppercase hover:bg-emerald-50 transition-all">Collect</button>
                                                                            </div>
                                                                        </div>
                                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                                                            <div className="md:col-span-2 flex gap-2">
                                                                                {['cash', 'bkash', 'nagad', 'bank'].map(m => (
                                                                                    <button key={m} onClick={() => setPaymentMethod(m)} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${paymentMethod === m ? 'bg-white text-wa-teal' : 'bg-white/10 text-white/60 border border-white/10'}`}>{m}</button>
                                                                                ))}
                                                                            </div>
                                                                            <input type="text" placeholder="Reference note..." value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} className="w-full p-3 bg-white/10 border border-white/20 rounded-xl text-[10px] text-white outline-none" />
                                                                        </div>
                                                                    </motion.div>
                                                                ) : (
                                                                    <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-[3rem] text-center flex flex-col items-center gap-2">
                                                                        <CheckCircle2 size={24} className="text-emerald-500" />
                                                                        <h3 className="text-sm font-black text-emerald-900 uppercase">Order Fully Settled</h3>
                                                                    </div>
                                                                )
                                                            )}

                                                            {/* 🏛️ FINANCIAL COMMAND CENTER GRID */}
                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                                                
                                                                {/* 📦 SECTION 1: MANIFEST ALLOCATION (The Box) */}
                                                                <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
                                                                    <div className="flex items-center justify-between">
                                                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2"><ShoppingBag size={14} /> Manifest Allocation</h4>
                                                                        <span className="px-3 py-1 bg-wa-teal/5 text-wa-teal text-[9px] font-black rounded-full uppercase">Current Parcel</span>
                                                                    </div>
                                                                    <div className="space-y-4">
                                                                        <LedgerRow label="Subtotal Items" value={subtotal} />
                                                                        <LedgerRow label="Delivery Charge" value={delivery} />
                                                                        <LedgerRow label="Discount Applied" value={discount} isCredit />
                                                                        <div className="pt-4 border-t border-dashed border-gray-100 flex justify-between items-center">
                                                                            <div className="flex flex-col">
                                                                                <span className="text-[9px] font-black text-gray-400 uppercase">Payments Collected (This Box)</span>
                                                                                <span className="text-[8px] font-bold text-emerald-600 uppercase">Verified on {selectedOrder.payment_status}</span>
                                                                            </div>
                                                                            <span className="text-xs font-black text-emerald-500">-৳{localPaid.toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="p-4 bg-gray-50 rounded-2xl flex justify-between items-center border border-gray-100">
                                                                             <div className="flex flex-col">
                                                                                 <span className="text-[10px] font-black text-gray-700 uppercase">Manifest Balance</span>
                                                                                 <span className="text-[7px] font-bold text-gray-400 uppercase">(Items + Del - Local Paid)</span>
                                                                             </div>
                                                                             <span className="text-sm font-black text-gray-900">৳{Math.max(0, currentOrderTotal - localPaid).toLocaleString()}</span>
                                                                         </div>
                                                                    </div>
                                                                </div>

                                                                {/* 🧬 SECTION 2: DEBT INTELLIGENCE (The History) */}
                                                                <div className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
                                                                    <div className="flex items-center justify-between">
                                                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2"><History size={14} /> Debt Intelligence</h4>
                                                                        {isTransferred && <span className="px-3 py-1 bg-blue-50 text-blue-500 text-[9px] font-black rounded-full uppercase flex items-center gap-1"><ArrowRightLeft size={10} /> Chained</span>}
                                                                    </div>
                                                                    <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                                                                        {loadingDebtChain ? (
                                                                            <div className="py-10 text-center animate-pulse"><RefreshCw className="animate-spin inline-block mr-2" size={14}/> <span className="text-[10px] font-black text-gray-400 uppercase">Tracing chain...</span></div>
                                                                        ) : debtChain.filter(o => o.status !== 'merged').length > 0 ? (
                                                                            debtChain
                                                                                .filter(o => o.status !== 'merged')
                                                                                .map((order, idx) => {
                                                                                const orderTotal = parseFloat((order.total_amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                                                                const orderPaid = parseFloat(order.amount_paid || 0);
                                                                                const orderDue = orderTotal - orderPaid;
                                                                                const recentPayments = (order.payments || []).filter((p: any) => {
                                                                                    const pDate = new Date(p.created_at);
                                                                                    const diff = (new Date().getTime() - pDate.getTime()) / (1000 * 60 * 60 * 24);
                                                                                    return diff <= 1; // within 24 hours
                                                                                });

                                                                                return (
                                                                                    <div key={idx} className={`p-5 rounded-2xl border transition-all ${orderDue > 0 ? (recentPayments.length > 0 ? 'bg-emerald-50/30 border-emerald-200' : 'bg-amber-50/30 border-amber-100') : 'bg-gray-50/50 border-gray-100 opacity-60'}`}>
                                                                                        <div className="flex justify-between items-start mb-3">
                                                                                            <div className="flex flex-col">
                                                                                                <span className="text-[10px] font-black text-gray-900">ORDER #{order.id}</span>
                                                                                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">{new Date(order.created_at).toLocaleDateString()} • {order.status}</span>
                                                                                            </div>
                                                                                            <div className="text-right">
                                                                                                {selectedOrder.payment_status === 'paid' ? (
                                                                                                    <div className="flex flex-col items-end">
                                                                                                        <span className="text-xs font-black text-emerald-500 flex items-center gap-1">
                                                                                                            <CheckCircle2 size={12} /> RECONCILED
                                                                                                        </span>
                                                                                                        <div className="text-[8px] font-black text-emerald-400 uppercase tracking-tighter">
                                                                                                            Covered via Master #{selectedOrder.id}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                ) : (
                                                                                                    <>
                                                                                                        <span className={`text-xs font-black ${order.status === 'merged' ? 'text-indigo-500' : (orderDue > 0 ? 'text-rose-500' : 'text-emerald-500')}`}>
                                                                                                            ৳{orderDue.toLocaleString()}
                                                                                                        </span>
                                                                                                        <div className="text-[8px] font-black text-gray-400 uppercase tracking-tighter">
                                                                                                            {order.status === 'merged' ? 'Transferred to Master' : 'Remaining Balance'}
                                                                                                        </div>
                                                                                                    </>
                                                                                                )}
                                                                                            </div>
                                                                                        </div>
                                                                                        
                                                                                        {recentPayments.length > 0 && (
                                                                                            <div className="pt-3 border-t border-emerald-100 flex items-center gap-2">
                                                                                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                                                                                <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">
                                                                                                    📉 Reduced by ৳{recentPayments.reduce((a:any,b:any)=>a+b.amount,0)} (Today)
                                                                                                </span>
                                                                                            </div>
                                                                                        )}

                                                                                        {order.payments?.length > 0 && (
                                                                                            <details className="mt-2 group">
                                                                                                <summary className="text-[8px] font-black text-gray-400 uppercase cursor-pointer list-none flex items-center gap-1 hover:text-wa-teal transition-colors">
                                                                                                    <Plus size={8} className="group-open:rotate-45 transition-transform" />
                                                                                                    {order.payments.length} Payments Collected
                                                                                                </summary>
                                                                                                <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-gray-100">
                                                                                                    {order.payments.map((p: any, pIdx: number) => (
                                                                                                        <div key={pIdx} className="flex justify-between text-[8px] font-bold text-gray-500">
                                                                                                            <span>{new Date(p.created_at).toLocaleDateString()} via {p.method}</span>
                                                                                                            <span className="text-emerald-600">৳{p.amount.toLocaleString()}</span>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </details>
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })
                                                                        ) : (
                                                                            <div className="py-10 text-center bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                                                                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-[0.2em]">No Preceding Debt</span>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 🗺️ SECTION 3: GLOBAL SETTLEMENT HUB (The Result) */}
                                                            <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-10 rounded-[3.5rem] text-white shadow-2xl relative overflow-hidden">
                                                                <div className="absolute bottom-0 right-0 w-80 h-80 bg-wa-teal/5 rounded-full blur-[100px] -mr-40 -mb-40" />
                                                                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-10">
                                                                    <div className="flex items-center gap-6">
                                                                        <div className="w-16 h-16 bg-white/10 backdrop-blur-xl rounded-3xl flex items-center justify-center border border-white/10 shadow-inner">
                                                                            <RefreshCw size={32} className="text-wa-teal animate-spin-slow" />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            <h3 className="text-xl font-black uppercase tracking-tighter">Global Settlement Hub</h3>
                                                                            <p className="text-xs font-bold text-white/40 uppercase tracking-widest">Consolidated Financial Statement</p>
                                                                        </div>
                                                                    </div>
                                                                    <div className="flex gap-12 text-center md:text-right">
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Total Ad-hoc Debt</span>
                                                                            <span className="text-2xl font-black text-amber-400">৳{dynamicPrevDue.toLocaleString()}</span>
                                                                        </div>
                                                                        <div className="w-px h-12 bg-white/10 hidden md:block" />
                                                                        <div className="flex flex-col">
                                                                            <span className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em]">Net Payable Balance</span>
                                                                            <span className="text-4xl font-black text-wa-teal tracking-tighter">৳{(totalInvoice - paid).toLocaleString()}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* 🕒 LIFETIME FINANCIAL LEDGER (Context Aware) */}
                                                            <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
                                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] flex items-center gap-2"><MessageSquare size={14} /> Unified Financial Ledger</h4>
                                                                    <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest px-3 py-1 bg-indigo-50 rounded-full">Audited Statements</span>
                                                                <div className="max-h-[600px] overflow-y-auto pr-4 pb-32 custom-scrollbar">
                                                                    {loadingMetadata ? (
                                                                        <div className="py-20 text-center opacity-30 animate-pulse"><RefreshCw className="animate-spin mb-4 mx-auto" size={40} /><span className="text-xs font-black uppercase tracking-widest">Syncing Ledger...</span></div>
                                                                    ) : (
                                                                        <FinancialLedger 
                                                                            events={customerFinancialLedger.filter((ev, idx, self) => {
                                                                                const currentOrderId = Number(selectedOrder.id);
                                                                                const ancestorIds = (debtChain || []).map(a => Number(a.id));
                                                                                const eventOrderId = Number(ev.order_id);
                                                                                
                                                                                // 🛡️ ISOLATION
                                                                                const isLocal = eventOrderId === currentOrderId;
                                                                                const isAncestor = ancestorIds.includes(eventOrderId);
                                                                                if (!isLocal && !isAncestor) return false;

                                                                                // 🛡️ DEDUPLICATION is now handled by the Source-Pinned database model.
                                                                                // Each payment exists only in its original order, preventing redundant display.

                                                                                // Hide transfer exits
                                                                                if (ev.type === 'TRANSFER' && Number(ev.source_order_id) === currentOrderId) return false;

                                                                                return true;
                                                                            }).map(ev => {
                                                                                // 🧠 SUPER-SMART CONTEXTUAL MAPPING
                                                                                const currentOrderId = Number(selectedOrder.id);
                                                                                const eventOrderId = Number(ev.order_id);
                                                                                const isLocal = eventOrderId === currentOrderId;
                                                                                
                                                                                // Extract original order ID from [LINKED] note if present
                                                                                const linkedMatch = (ev.note || '').match(/Predecessor\s*Order\s*#(\d+)/);
                                                                                const sourceOrderId = linkedMatch ? Number(linkedMatch[1]) : null;

                                                                                if (ev.type === 'PAYMENT') {
                                                                                    // 🛡️ SOURCE-PINNED MODEL: Always show original order ID as the source
                                                                                    return { 
                                                                                        ...ev, 
                                                                                        display_order_id: eventOrderId,
                                                                                        note: (ev.note || '').replace(/^\[LINKED\]\s*Payment\s*from\s*Predecessor\s*Order\s*#\d+\.\s*/, '')
                                                                                    };
                                                                                }
                                                                                return ev;
                                                                            }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())} 
                                                                            onOrderClick={fetchAndOpenOrder}
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </>
                                                    );
                                                })()}
                                            </motion.div>
                                        )}
                                        {/* 🚚 LOGISTICS TAB (Premium Redesign) */}
                                        {activeDetailTab === 'logistics' && (
                                            <motion.div 
                                                key="tab-logistics"
                                                className="space-y-8"
                                            >
                                                {/* 🏷️ Status Hero Card */}
                                                <div className="bg-slate-900 p-10 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                                                    <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl -mr-32 -mt-32 group-hover:bg-indigo-500/20 transition-all duration-700" />
                                                    <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                                                        <div className="flex items-center gap-6">
                                                            <div className="relative">
                                                                <div className="p-5 bg-indigo-500/20 backdrop-blur-md rounded-[2rem] border border-white/10">
                                                                    {(() => {
                                                                        const Icon = selectedOrder.status === 'delivered' ? CheckCircle2 : 
                                                                                   selectedOrder.status === 'shipped' ? Truck :
                                                                                   selectedOrder.status === 'processing' ? Package : Clock;
                                                                        return <Icon size={40} className="text-wa-teal" />;
                                                                    })()}
                                                                </div>
                                                                {['processing', 'shipped'].includes(selectedOrder.status) && (
                                                                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-wa-teal rounded-full animate-ping border-4 border-slate-900" />
                                                                )}
                                                            </div>
                                                            <div>
                                                                <h3 className="text-xl font-black tracking-tighter uppercase mb-1">
                                                                    {selectedOrder.status === 'delivered' ? 'Item Delivered' :
                                                                     selectedOrder.status === 'shipped' ? 'In Transit' :
                                                                     selectedOrder.status === 'processing' ? 'Processing' : 'Awaiting Action'}
                                                                </h3>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em]">Lifecycle Stage:</span>
                                                                    <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                                                        {selectedOrder.status}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="bg-white/5 backdrop-blur-sm p-6 rounded-3xl border border-white/10 flex-1 md:max-w-[240px]">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <span className="text-[9px] font-black text-white/30 uppercase tracking-[0.2em]">Tracking ID</span>
                                                                <button onClick={() => { navigator.clipboard.writeText(selectedOrder.tracking_id || `#${selectedOrder.id}`); alert("Copied!"); }} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                                                                    <Plus size={10} className="text-wa-teal" />
                                                                </button>
                                                            </div>
                                                            <div className="text-sm font-mono font-black text-indigo-100">{selectedOrder.tracking_id || `WA-${selectedOrder.id}X77`}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                                {/* 🗺️ Location & Action Grid */}
                                                <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
                                                    <div className="md:col-span-3 bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-8">
                                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-2">
                                                            <Truck size={14} /> Delivery Lifecycle
                                                        </h4>
                                                        <div className="space-y-0 relative pl-4 border-l-2 border-gray-50 ml-4">
                                                            <TimelineStep active={true} label="Order Pending" desc="Customer order has been received and is awaiting confirmation." icon={<Clock />} isCompleted={['processing', 'shipped', 'delivered'].includes(selectedOrder.status)} onClick={() => updateStatus(selectedOrder.id, 'pending')} />
                                                            <TimelineStep active={['processing', 'shipped', 'delivered'].includes(selectedOrder.status)} label="Production / Pack" desc="Item is being prepared, packed, and assigned to a courier." icon={<Package />} isCompleted={['shipped', 'delivered'].includes(selectedOrder.status)} onClick={() => updateStatus(selectedOrder.id, 'processing')} />
                                                            <TimelineStep active={['shipped', 'delivered'].includes(selectedOrder.status)} label="Shipping Transit" desc="Parcel has left the warehouse and is currently in transit." icon={<Truck />} isCompleted={selectedOrder.status === 'delivered'} onClick={() => updateStatus(selectedOrder.id, 'shipped')} />
                                                            <TimelineStep active={selectedOrder.status === 'delivered'} label="Successfully Delivered" desc="Recipient has received the package and signed the proof of delivery." icon={<CheckCircle2 />} isCompleted={selectedOrder.status === 'delivered'} onClick={() => updateStatus(selectedOrder.id, 'delivered')} isLast />
                                                        </div>
                                                    </div>
                                                    <div className="md:col-span-2 space-y-6">
                                                        {/* Digital Shipping Label */}
                                                        <div className="bg-white rounded-[2.5rem] border-2 border-gray-101 p-8 shadow-sm relative overflow-hidden flex flex-col gap-6 group">
                                                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                                                <div className="w-16 h-1 bg-gray-900 mb-1" />
                                                                <div className="w-12 h-1 bg-gray-900 mb-1" />
                                                                <div className="w-16 h-1 bg-gray-900" />
                                                            </div>
                                                            <div className="space-y-4">
                                                                <div className="flex items-center justify-between">
                                                                    <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-1.5">
                                                                        <MapPin size={14} /> Shipping Destination
                                                                    </h4>
                                                                    <div className="flex items-center gap-2">
                                                                        {!isEditingAddress && selectedOrder.customer_address && selectedOrder.status !== 'merged' && (
                                                                            <button onClick={() => { setTempAddress(selectedOrder.customer_address || ''); setIsEditingAddress(true); }} className="p-2 text-gray-300 hover:text-indigo-500 transition-all" title="Edit Address">
                                                                                <Edit3 size={14} />
                                                                            </button>
                                                                        )}
                                                                        {selectedOrder.customer_address && (
                                                                            <>
                                                                                <button onClick={() => { navigator.clipboard.writeText(selectedOrder.customer_address || ''); alert("Address Copied!"); }} className="p-2 text-gray-300 hover:text-indigo-500 transition-all font-black uppercase" title="Copy Address">
                                                                                    <Copy size={14} />
                                                                                </button>
                                                                                <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedOrder.customer_address)}`} target="_blank" rel="noreferrer" className="p-2 bg-indigo-50 text-indigo-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center shadow-sm" title="Open in Maps">
                                                                                    <MapPinned size={14} />
                                                                                </a>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                                {isEditingAddress ? (
                                                                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                                                                        <textarea autoFocus value={tempAddress} onChange={e => setTempAddress(e.target.value)} className="w-full p-4 bg-gray-50 border-2 border-indigo-100 rounded-3xl text-sm font-black text-gray-800 outline-none focus:border-indigo-400 transition-all min-h-[100px] resize-none" placeholder="Enter full shipping address..." />
                                                                        <div className="flex gap-2 justify-end">
                                                                            <button onClick={() => setIsEditingAddress(false)} className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
                                                                            <button onClick={() => handleUpdateMeta({ shipping_address: tempAddress })} disabled={isUpdatingMeta} className="px-6 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">
                                                                                {isUpdatingMeta ? 'Saving...' : 'Save Address'}
                                                                            </button>
                                                                        </div>
                                                                    </motion.div>
                                                                ) : (
                                                                    <p className={`text-sm font-black leading-relaxed italic pr-4 cursor-pointer transition-all ${!selectedOrder.customer_address ? 'text-rose-500 bg-rose-50/50 p-4 rounded-2xl border border-rose-100 shadow-sm grow text-center border-dashed' : 'text-gray-800 hover:text-indigo-600'}`} onClick={() => { setTempAddress(selectedOrder.customer_address || ''); setIsEditingAddress(true); }}>
                                                                        {selectedOrder.customer_address || "⚠️ No shipping address provided. Click here to set address for this order and customer profile."}
                                                                    </p>
                                                                )}
                                                                {/* 📞 Contact Intelligence */}
                                                                <div className="space-y-4 pt-4 border-t-2 border-dashed border-gray-100">
                                                                    <div className="flex items-center justify-between">
                                                                        <h4 className="text-[10px] font-black text-emerald-500 uppercase tracking-widest flex items-center gap-1.5">
                                                                            <Phone size={14} /> Contact Information
                                                                        </h4>
                                                                        <div className="flex items-center gap-2">
                                                                            {!isEditingShippingPhone && selectedOrder.status !== 'merged' && (
                                                                                <button onClick={() => { setTempShippingPhone(selectedOrder.shipping_phone || selectedOrder.customer_number); setIsEditingShippingPhone(true); }} className="p-2 text-gray-300 hover:text-emerald-500 transition-all" title="Add/Edit Alternate Phone">
                                                                                    <Edit3 size={14} />
                                                                                </button>
                                                                            )}
                                                                            {selectedOrder.shipping_phone && (
                                                                                <button onClick={() => { navigator.clipboard.writeText(selectedOrder.shipping_phone); alert("Phone Copied!"); }} className="p-2 text-gray-300 hover:text-emerald-500 transition-all font-black uppercase" title="Copy Shipping Phone">
                                                                                    <Copy size={14} />
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                    {isEditingShippingPhone ? (
                                                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                                                                            <input 
                                                                                type="text"
                                                                                autoFocus 
                                                                                value={tempShippingPhone} 
                                                                                onChange={e => setTempShippingPhone(e.target.value)} 
                                                                                className="w-full p-4 bg-gray-50 border-2 border-emerald-100 rounded-[1.5rem] text-sm font-black text-gray-800 outline-none focus:border-emerald-400 transition-all" 
                                                                                placeholder="Enter alternate contact number..." 
                                                                            />
                                                                            <div className="flex gap-2 justify-end">
                                                                                <button onClick={() => setIsEditingShippingPhone(false)} className="px-4 py-2 text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
                                                                                <button onClick={() => handleUpdateMeta({ shipping_phone: tempShippingPhone })} disabled={isUpdatingMeta} className="px-6 py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-100 disabled:opacity-50">
                                                                                    {isUpdatingMeta ? 'Saving...' : 'Update Contact'}
                                                                                </button>
                                                                            </div>
                                                                        </motion.div>
                                                                    ) : (
                                                                        <div className="flex flex-col gap-1">
                                                                            <div className="flex items-center gap-3">
                                                                                <span className="px-3 py-1 bg-gray-100 text-[9px] font-black text-gray-500 rounded-full uppercase border border-gray-200">Primary</span>
                                                                                <span className="text-sm font-black text-gray-800">+{selectedOrder.customer_number}</span>
                                                                            </div>
                                                                            {selectedOrder.shipping_phone && selectedOrder.shipping_phone !== selectedOrder.customer_number && (
                                                                                <div className="flex items-center gap-3">
                                                                                    <span className="px-3 py-1 bg-emerald-50 text-[9px] font-black text-emerald-600 rounded-full uppercase border border-emerald-100">Alternate</span>
                                                                                    <span className="text-sm font-black text-gray-900">+{selectedOrder.shipping_phone}</span>
                                                                                </div>
                                                                            )}
                                                                            {!selectedOrder.shipping_phone && (
                                                                                <button 
                                                                                    onClick={() => { setTempShippingPhone(selectedOrder.customer_number); setIsEditingShippingPhone(true); }}
                                                                                    className="text-[10px] font-black text-emerald-500 hover:text-emerald-700 transition-all uppercase tracking-widest text-left mt-1"
                                                                                >
                                                                                    + Add Alternate Number
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                            <div className="pt-4 border-t-2 border-dashed border-gray-100 flex flex-col gap-3">
                                                                <div className="flex justify-between items-center">
                                                                    <div className="flex flex-col">
                                                                        <span className="text-[8px] font-black text-gray-400 uppercase">Weight / Vol</span>
                                                                        <span className="text-[10px] font-black text-gray-900">1.50 KG (Approx)</span>
                                                                    </div>
                                                                    <div className="flex flex-col text-right">
                                                                        <span className="text-[8px] font-black text-gray-400 uppercase">Service Mode</span>
                                                                        <span className="text-[10px] font-black text-rose-500">EXPRESS DOOR-TO-DOOR</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="bg-indigo-600 p-6 rounded-[2.5rem] shadow-xl shadow-indigo-100 space-y-4">
                                                            <div className="text-center px-4">
                                                                <h4 className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">Status Command Center</h4>
                                                                <p className="text-[8px] font-bold text-indigo-300 uppercase tracking-widest opacity-60">Update parcel lifecycle manually</p>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-3">
                                                                <ActionBtn onClick={() => updateStatus(selectedOrder.id, 'processing')} icon={<Package />} label="Process" />
                                                                <ActionBtn onClick={() => updateStatus(selectedOrder.id, 'shipped')} icon={<Truck />} label="Transit" />
                                                                <ActionBtn onClick={() => updateStatus(selectedOrder.id, 'delivered')} icon={<CheckCircle2 />} label="Finalize" color="bg-emerald-400" />
                                                                <ActionBtn onClick={() => updateStatus(selectedOrder.id, 'cancelled')} icon={<XCircle />} label="Abort" color="bg-rose-400" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </motion.div>
                                        )}
                                        {activeDetailTab === 'customer' && (
                                            <motion.div 
                                                key="tab-customer"
                                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                                                className="space-y-8"
                                            >
                                                {loadingMetadata ? (
                                                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                                                        <div className="w-10 h-10 border-4 border-wa-teal border-t-transparent rounded-full animate-spin" />
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Syncing Customer Intelligence...</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {/* 🏆 Refined Identity & VIP Tiering */}
                                                        <div className="bg-[#0f172a] p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group border border-white/5">
                                                            <div className="absolute -top-24 -right-24 w-64 h-64 bg-wa-teal/20 rounded-full blur-[80px] group-hover:bg-wa-teal/30 transition-all duration-1000" />
                                                            <div className="absolute -bottom-24 -left-24 w-64 h-64 bg-indigo-500/10 rounded-full blur-[80px]" />
                                                            
                                                            <div className="relative z-10 flex flex-wrap items-center justify-between gap-y-6 gap-x-8">
                                                                <div className="flex items-center gap-5 min-w-fit">
                                                                    <div className="relative">
                                                                        <div className="w-20 h-20 bg-gradient-to-br from-wa-teal/20 to-indigo-500/20 backdrop-blur-xl border border-white/10 rounded-3xl flex items-center justify-center text-3xl font-black text-wa-teal shadow-2xl">
                                                                            {selectedOrder.customer_name?.[0].toUpperCase() || 'C'}
                                                                        </div>
                                                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-emerald-500 border-4 border-[#0f172a] rounded-full" title="Active Customer" />
                                                                    </div>
                                                                    <div className="space-y-1.5 text-center md:text-left">
                                                                        <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                                                                            <h3 className="text-xl font-bold tracking-tight">{selectedOrder.customer_name}</h3>
                                                                            {(() => {
                                                                                const ltv = customerMetadata?.lifetime_value || 0;
                                                                                let tier = { label: 'Bronze', color: 'bg-orange-500/10 text-orange-400 border-orange-500/20' };
                                                                                if (ltv > 50000) tier = { label: 'Diamond VIP', color: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' };
                                                                                else if (ltv > 20000) tier = { label: 'Platinum', color: 'bg-wa-teal/20 text-wa-teal border-wa-teal/30' };
                                                                                else if (ltv > 5000) tier = { label: 'Gold Member', color: 'bg-amber-500/20 text-amber-400 border-amber-500/30' };
                                                                                
                                                                                return (
                                                                                    <span className={`px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border ${tier.color}`}>
                                                                                        {tier.label}
                                                                                    </span>
                                                                                );
                                                                            })()}
                                                                        </div>
                                                                        <div className="flex items-center justify-center md:justify-start gap-3 text-white/50">
                                                                            <span className="text-[11px] font-medium font-mono">+{selectedOrder.customer_number}</span>
                                                                            <span className="w-1 h-1 bg-white/20 rounded-full" />
                                                                            <span className="text-[9px] uppercase font-bold tracking-wider">{customerMetadata?.lifecycle_stage || 'Standard Account'}</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                
                                                                <div className="flex items-center gap-3 w-full md:w-auto">
                                                                    <button 
                                                                        onClick={() => {
                                                                            if (window.setActiveTab) window.setActiveTab('messages');
                                                                            if (window.setSelectedChat) window.setSelectedChat(selectedOrder.customer_number);
                                                                            setSelectedOrder(null);
                                                                        }}
                                                                        className="flex-1 md:flex-none p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-wa-teal hover:border-wa-teal transition-all group flex items-center justify-center"
                                                                        title="Message Customer"
                                                                    >
                                                                        <MessageSquare size={18} className="text-wa-teal group-hover:text-white" />
                                                                    </button>
                                                                    <a 
                                                                        href={`tel:${selectedOrder.customer_number}`}
                                                                        className="flex-1 md:flex-none p-4 bg-white/5 border border-white/10 rounded-2xl hover:bg-indigo-500 hover:border-indigo-500 transition-all group flex items-center justify-center"
                                                                        title="Call Customer"
                                                                    >
                                                                        <Phone size={18} className="text-indigo-400 group-hover:text-white" />
                                                                    </a>
                                                                    <button 
                                                                        onClick={async () => {
                                                                            const newStatus = !selectedOrder.human_verified;
                                                                            try {
                                                                                const res = await fetch(`http://localhost:3001/api/oms/orders/${selectedOrder.id}/verify`, {
                                                                                    method: 'PATCH',
                                                                                    headers: { 'Content-Type': 'application/json' },
                                                                                    body: JSON.stringify({ status: newStatus })
                                                                                });
                                                                                const data = await res.json();
                                                                                if (data.success) {
                                                                                    setSelectedOrder({ ...selectedOrder, human_verified: newStatus ? 1 : 0 });
                                                                                    fetchOrders();
                                                                                }
                                                                            } catch (e) {
                                                                                console.error("Verification error:", e);
                                                                            }
                                                                        }}
                                                                        className={`flex-[2] md:flex-none px-6 py-4 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] transition-all shadow-lg flex items-center gap-2 ${
                                                                            selectedOrder.human_verified 
                                                                            ? 'bg-emerald-500 text-white shadow-emerald-500/20' 
                                                                            : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                                                                        }`}
                                                                    >
                                                                        {selectedOrder.human_verified ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
                                                                        {selectedOrder.human_verified ? 'Verified' : 'Verify Order'}
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* 📊 Key Metrics Dashboard */}
                                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-2">Lifetime Value</span>
                                                                <div className="text-lg font-black text-gray-900 leading-none">৳{(customerMetadata?.lifetime_value || 0).toLocaleString()}</div>
                                                            </div>
                                                            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-2">Order Frequency</span>
                                                                <div className="text-lg font-black text-gray-900 leading-none">{customerHistory.length + 1} <span className="text-[10px] text-gray-400">Total</span></div>
                                                            </div>
                                                            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-2">Avg. Order Value</span>
                                                                <div className="text-lg font-black text-emerald-600 leading-none">৳{Math.round((customerMetadata?.lifetime_value || 0) / Math.max(1, customerHistory.length + 1)).toLocaleString()}</div>
                                                            </div>
                                                            <div className="bg-white p-5 rounded-3xl border border-gray-100 shadow-sm transition-all hover:shadow-md">
                                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-2">Account Age</span>
                                                                <div className="text-lg font-black text-indigo-600 leading-none">
                                                                    {customerMetadata?.created_at ? (
                                                                        <>
                                                                            {Math.max(1, Math.ceil((new Date().getTime() - new Date(customerMetadata.created_at).getTime()) / (1000 * 60 * 60 * 24)))} 
                                                                            <span className="text-[10px] text-gray-400 ml-1">Days</span>
                                                                        </>
                                                                    ) : '---'}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* 🧠 Behavioral Intelligence section */}
                                                        <div className="flex flex-col gap-6">
                                                            {/* AI Behavioral Persona */}
                                                            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6 relative overflow-hidden group">
                                                                <div className="absolute top-0 right-0 p-8 text-gray-50/50 group-hover:text-wa-teal/5 transition-colors">
                                                                    <MessageSquare size={100} />
                                                                </div>
                                                                <div className="flex items-center justify-between relative z-10">
                                                                    <h4 className="text-[10px] font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                                                                        <Eye size={14} /> AI Behavioral Report
                                                                    </h4>
                                                                    <span className="text-[8px] font-black text-emerald-500 bg-emerald-50 px-2 py-0.5 rounded-full uppercase tracking-tighter">Live Intelligence</span>
                                                                </div>
                                                                <div className="bg-gray-50/80 p-6 rounded-2xl border border-gray-100/50 relative">
                                                                    <p className="text-[11px] font-medium text-gray-600 leading-relaxed italic">
                                                                        "{customerMetadata?.ai_memory_summary || "Our neural engine is still observing this customer's behavior. Deep behavioral insights will appear as interaction history grows."}"
                                                                    </p>
                                                                </div>
                                                                
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 pt-2">
                                                                    <IntelligenceMeter label="Engagement Pulse" value={customerMetadata?.engagement_score || 0} color="bg-wa-teal" />
                                                                    <IntelligenceMeter label="Loyalty Index" value={customerMetadata?.loyalty_score || 0} color="bg-indigo-500" />
                                                                    <IntelligenceMeter label="Sentiment Score" value={customerMetadata?.sentiment_score || 0} color="bg-emerald-500" />
                                                                    <IntelligenceMeter label="Risk Factor" value={customerMetadata?.price_sensitivity_score || 0} color="bg-rose-400" />
                                                                </div>
                                                            </div>

                                                            {/* Order History Timeline */}
                                                            <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-6">
                                                                <div className="flex items-center justify-between">
                                                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                                        <History size={14} /> Order Timeline
                                                                    </h4>
                                                                    <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{customerHistory.length} Past Record(s)</span>
                                                                </div>
                                                                <div className="space-y-3 max-h-[350px] overflow-y-auto px-3 py-2 custom-scrollbar">
                                                                    {customerHistory.length > 0 ? customerHistory.map((h: any) => (
                                                                        <div 
                                                                            key={h.id} 
                                                                            onClick={() => setSelectedOrder(h)}
                                                                            className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all border group ${
                                                                                selectedOrder?.id === h.id 
                                                                                ? 'bg-wa-teal/[0.05] border-wa-teal shadow-lg shadow-wa-teal/10 scale-[1.02]' 
                                                                                : 'bg-gray-50/50 border-transparent hover:bg-white hover:shadow-xl hover:shadow-gray-100 hover:border-gray-100'
                                                                            }`}
                                                                        >
                                                                            <div className="flex items-center gap-4">
                                                                                <div className="w-10 h-10 bg-white rounded-xl shadow-sm flex items-center justify-center text-gray-400 group-hover:text-indigo-500 transition-colors">
                                                                                    <ShoppingBag size={18} />
                                                                                </div>
                                                                                <div className="flex flex-col">
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="text-[10px] font-black text-gray-900 uppercase">INV-#{h.id}</span>
                                                                                        {h.human_verified === 1 && (
                                                                                            <span className="text-[7px] font-black text-emerald-500 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-1 border border-emerald-100">
                                                                                                <Phone size={8} /> CONFIRMED
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="text-[9px] font-bold text-gray-400 uppercase">{new Date(h.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="text-right">
                                                                                <div className="text-xs font-black text-gray-900">৳{parseFloat(h.total_amount).toLocaleString()}</div>
                                                                                <div className={`mt-1 text-[7px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                                                                    h.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                                                                                    h.status === 'cancelled' ? 'bg-rose-50 text-rose-600 border-rose-100' :
                                                                                    'bg-amber-50 text-amber-600 border-amber-100'
                                                                                }`}>
                                                                                    {h.status}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )) : (
                                                                        <div className="flex flex-col items-center justify-center py-12 opacity-20">
                                                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                                                                <Clock size={32} />
                                                                            </div>
                                                                            <span className="text-[10px] font-black uppercase tracking-widest">No Interaction History</span>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                    </>
                                                )}
                                            </motion.div>
                                        )}
                                        {activeDetailTab === 'timeline' && (
                                            <motion.div 
                                                key="tab-timeline"
                                                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
                                                className="space-y-6"
                                            >
                                                <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm space-y-8">
                                                    <div className="flex items-center justify-between">
                                                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                                            <History size={14} /> Audit Timeline & Evidence
                                                        </h4>
                                                        <span className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">Live Logs</span>
                                                    </div>

                                                    <div className="relative pl-8 space-y-0">
                                                        <div className="absolute left-[1.15rem] top-2 bottom-2 w-0.5 bg-gray-100 border-l border-dashed border-gray-200" />
                                                        
                                                        {loadingLogs ? (
                                                            <div className="py-10 text-center text-gray-400 text-[10px] font-black uppercase">Loading Logs...</div>
                                                        ) : orderLogs.length > 0 ? orderLogs.map((log, idx) => (
                                                            <TimelineStep 
                                                                key={log.id}
                                                                active={idx === 0}
                                                                isCompleted={true}
                                                                label={log.action.replace(/_/g, ' ')}
                                                                desc={log.note || `Status changed from ${log.from_status} to ${log.to_status}`}
                                                                smartDesc={<SmartLogText text={log.note || `Status changed from ${log.from_status} to ${log.to_status}`} onOrderClick={(id) => fetchAndOpenOrder(id)} />}
                                                                icon={getStatusIcon(log.to_status as any)}
                                                                onClick={() => {}}
                                                                isLast={idx === orderLogs.length - 1}
                                                            />
                                                        )) : (
                                                            <div className="py-10 text-center text-gray-400 text-[10px] font-black uppercase">No Audit Logs Found</div>
                                                        )}
                                                    </div>

                                                    {/* Evidence Note Highlight */}
                                                    {selectedOrder.order_notes && (
                                                        <div className="mt-8 p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100/50 space-y-3">
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase">
                                                                <FileText size={14} /> Official Order Notes
                                                            </div>
                                                            <div className="text-[11px] font-medium text-indigo-900/70 whitespace-pre-wrap leading-relaxed">
                                                                <SmartLogText text={selectedOrder.order_notes} onOrderClick={(id) => fetchAndOpenOrder(id)} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>

                                {/* 🏷 Global Sticky Footer (Total) */}
                                <div className="absolute bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-xl border-t border-gray-100 flex items-center justify-between z-20">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Net Payable (Balance)</span>
                                            {selectedOrder.due_added > 0 && <span className="text-[8px] font-black text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded">Incl. Prev Due</span>}
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl font-black text-wa-teal">
                                                {(() => {
                                                    const isTransferred = isCurrentlyTransferred(selectedOrder.order_notes);
                                                    
                                                    // Use the SAME logic as Finance Tab for consistency
                                                    const itemsToCalc = isEditingManifest ? amendedItems : safeParseItems(selectedOrder.items);
                                                    const sub = itemsToCalc.reduce((acc: number, it: any) => {
                                                        const p = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0;
                                                        return acc + (p * (it.qty || 1));
                                                    }, 0);
                                                    const del = isEditingManifest ? tempDeliveryCharge : (selectedOrder.delivery_charge || 0);
                                                    const disc = selectedOrder.discount || 0;
                                                    const currGross = sub + del - disc;
                                                    
                                                    const predGross = (debtChain || []).reduce((sum, o) => {
                                                        if (o.id == selectedOrder.id) return sum;
                                                        if (itemsToCalc.some((it: any) => it.mergedFrom == o.id)) return sum;
                                                        if (parseFloat(selectedOrder.due_added || 0) >= parseFloat(o.total_amount || 0)) return sum;
                                                        const t = parseFloat((o.total_amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                                        const d = parseFloat(o.due_added || 0);
                                                        return sum + (t - d);
                                                    }, 0);
                                                    
                                                    const totalInv = currGross + predGross;
                                                    const balance = totalInv - paid;
                                                    return isTransferred ? '৳0' : `৳${balance.toLocaleString()}`;
                                                })()}
                                            </span>
                                            <div className="flex flex-col border-l border-gray-200 pl-3">
                                                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Invoice Total</span>
                                                <span className="text-[10px] font-black text-gray-600">
                                                    {(() => {
                                                        const itemsToCalc = isEditingManifest ? amendedItems : safeParseItems(selectedOrder.items);
                                                        const sub = itemsToCalc.reduce((acc: number, it: any) => {
                                                            const p = parseFloat(it.price?.toString().replace(/[^0-9.]/g, '')) || 0;
                                                            return acc + (p * (it.qty || 1));
                                                        }, 0);
                                                        const del = isEditingManifest ? tempDeliveryCharge : (selectedOrder.delivery_charge || 0);
                                                        const disc = selectedOrder.discount || 0;
                                                        const currGross = sub + del - disc;
                                                        
                                                        const predGross = (debtChain || []).reduce((sum, o) => {
                                                            if (o.id == selectedOrder.id) return sum;
                                                            if (itemsToCalc.some((it: any) => it.mergedFrom == o.id)) return sum;
                                                            if (parseFloat(selectedOrder.due_added || 0) >= parseFloat(o.total_amount || 0)) return sum;
                                                            const t = parseFloat((o.total_amount || '0').toString().replace(/[^0-9.]/g, '')) || 0;
                                                            const d = parseFloat(o.due_added || 0);
                                                            return sum + (t - d);
                                                        }, 0);
                                                        
                                                        return `৳${(currGross + predGross).toLocaleString()}`;
                                                    })()}
                                                </span>
                                            </div>
                                            {selectedOrder.payment_status === 'paid' && <CheckCircle2 size={16} className="text-emerald-500" />}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {isEditingManifest ? (
                                            <button 
                                                onClick={saveManifest}
                                                className="px-8 py-4 bg-wa-teal text-white rounded-2xl text-xs font-black shadow-xl shadow-wa-teal/20 hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
                                            >
                                                <Save size={18} /> SAVE AMENDMENTS
                                            </button>
                                        ) : (
                                            <button 
                                                onClick={() => setSelectedOrder(null)}
                                                className="px-8 py-4 bg-gray-900 text-white rounded-2xl text-xs font-black shadow-xl shadow-gray-200 hover:bg-black active:scale-95 transition-all"
                                            >
                                                CLOSE DETAIL
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </>
                );
            })()}
        </AnimatePresence>

            {/* Create Order Modal */}
            <CreateOrderModal 
                isOpen={isCreatingOrder} 
                onClose={() => setIsCreatingOrder(false)} 
                onSuccess={() => { fetchOrders(); setIsCreatingOrder(false); }}
            />
            {/* 🛡️ Granular Cancellation Modal */}
            <AnimatePresence>
                {isCancelModalOpen && (
                    <>
                        <motion.div 
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            onClick={() => setIsCancelModalOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100]"
                        />
                        <motion.div 
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl z-[110] overflow-hidden border border-gray-100"
                        >
                            <div className="p-8 space-y-6">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-rose-50 text-rose-500 rounded-2xl shadow-sm">
                                        <XCircle size={32} />
                                    </div>
                                    <div>
                                        <h2 className="text-2xl font-black text-gray-900 leading-tight">Master Cancellation</h2>
                                        <p className="text-sm font-medium text-gray-400">Choose which merged orders to restore or discard.</p>
                                    </div>
                                </div>

                                <div className="bg-gray-50/50 rounded-[2rem] p-6 space-y-4 border border-gray-100">
                                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                        <Layers size={14} /> Merged Predecessors Found ({predecessors.length})
                                    </h3>
                                    
                                    <div className="space-y-2 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                                        {predecessors.map(p => (
                                            <div 
                                                key={p.id}
                                                onClick={() => {
                                                    setSelectedReactivateIds(prev => 
                                                        prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                                    );
                                                }}
                                                className={`flex items-center justify-between p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                                                    selectedReactivateIds.includes(p.id) 
                                                        ? 'bg-indigo-50 border-indigo-200 shadow-sm' 
                                                        : 'bg-white border-transparent hover:border-gray-200'
                                                }`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-md flex items-center justify-center border-2 transition-all ${
                                                        selectedReactivateIds.includes(p.id) ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
                                                    }`}>
                                                        {selectedReactivateIds.includes(p.id) && <Check size={14} className="text-white" />}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-black text-gray-800">Order #{p.id}</p>
                                                        <p className="text-[10px] font-bold text-gray-400">৳{p.total_amount.toLocaleString()} • {new Date(p.created_at).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${
                                                        selectedReactivateIds.includes(p.id) ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-500'
                                                    }`}>
                                                        {selectedReactivateIds.includes(p.id) ? 'Restore to Pending' : 'Permanently Cancel'}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-2">
                                    <button 
                                        onClick={() => setIsCancelModalOpen(false)}
                                        className="py-4 bg-gray-100 text-gray-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-gray-200 transition-all"
                                    >
                                        Back to Safety
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (selectedOrder) {
                                                updateStatus(selectedOrder.id, 'cancelled', undefined, selectedReactivateIds);
                                                setIsCancelModalOpen(false);
                                            }
                                        }}
                                        className="py-4 bg-rose-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-600 shadow-lg shadow-rose-200 transition-all active:scale-95"
                                    >
                                        Execute Cancellation
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}

// 🛒 SMART MANUAL ORDER MODAL
function CreateOrderModal({ isOpen, onClose, onSuccess }: { isOpen: boolean, onClose: () => void, onSuccess: () => void }) {
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);

    // Order Data
    const [customer, setCustomer] = useState({ number: '', name: '', address: '', exists: false });
    const [cart, setCart] = useState<any[]>([]);
    const [deliveryCharge, setDeliveryCharge] = useState(80);
    const [discount, setDiscount] = useState(0);
    const [notes, setNotes] = useState('');
    const [previousDue, setPreviousDue] = useState(0);
    const [addressTag, setAddressTag] = useState('Home');
    const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
    const [deliveryArea, setDeliveryArea] = useState('Inside Dhaka');

    // Constants
    const DELIVERY_AREAS = [
        { name: 'Inside Dhaka', charge: 80, icon: '🏙️' },
        { name: 'Dhaka Suburbs', charge: 100, icon: '🏘️' },
        { name: 'Outside Dhaka', charge: 150, icon: '🚛' },
        { name: 'Point Collection', charge: 0, icon: '📍' }
    ];

    // Selection States
    const [searchProduct, setSearchProduct] = useState('');
    const [searchCustomer, setSearchCustomer] = useState('');
    const [allCustomers, setAllCustomers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [allProducts, setAllProducts] = useState<any[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<any>(null);
    const [selectedVariant, setSelectedVariant] = useState<string>('');
    const [qty, setQty] = useState(1);

    useEffect(() => {
        if (isOpen) {
            // Fetch Products
            fetch('http://localhost:3001/api/ai-brain/products?limit=1000')
                .then(res => res.json())
                .then(data => { if (data.success) setAllProducts(data.products || []); });
            
            // Fetch All Customers for Intelligence
            fetch('http://localhost:3001/customers')
                .then(res => res.json())
                .then(data => { if (Array.isArray(data)) setAllCustomers(data); });
        } else {
            resetForm();
        }
    }, [isOpen]);

    const resetForm = () => {
        setStep(1);
        setCustomer({ number: '', name: '', address: '', exists: false });
        setCart([]);
        setDeliveryCharge(80);
        setDiscount(0);
        setPreviousDue(0);
        setNotes('');
        setAddressTag('Home');
        setDeliveryArea('Inside Dhaka');
        setSavedAddresses([]);
        setSelectedProduct(null);
        setSearchProduct('');
    };

    const handleCustomerSearch = async (num: string) => {
        setCustomer(prev => ({ ...prev, number: num }));
        setSearchCustomer(num);
        if (num.length >= 10) {
            try {
                const res = await fetch(`http://localhost:3001/api/contacts/profile/${num}`);
                const data = await res.json();
                if (data.success && data.contact) {
                    setCustomer({ 
                        number: num, 
                        name: data.contact.name || '', 
                        address: data.contact.address || '', 
                        exists: true 
                    });
                    setPreviousDue(parseFloat(data.contact.previous_due) || 0);
                    
                    // Handle saved addresses
                    let saved = [];
                    try { 
                        saved = typeof data.contact.saved_addresses === 'string' ? JSON.parse(data.contact.saved_addresses) : (data.contact.saved_addresses || []); 
                    } catch (e) { saved = []; }
                    setSavedAddresses(Array.isArray(saved) ? saved : []);

                    setSearchCustomer(''); // Close suggestions on match
                }
            } catch (e) {}
        }
    };

    const selectSuggestedCustomer = (c: any) => {
        console.log(`[DEBUG] Selecting suggested customer: ${c.name} (${c.number})`);
        setCustomer({
            number: c.number || c.phone,
            name: c.name || '',
            address: c.address || '',
            exists: true
        });
        setPreviousDue(parseFloat(c.previous_due) || 0);
        
        console.log(`[DEBUG] Triggering fresh profile fetch for active balance: ${c.number || c.phone}`);
        // Immediately fetch FRESH profile to get real-time active balance
        handleCustomerSearch(c.number || c.phone);
    };


    const addToCart = () => {
        if (!selectedProduct) return;

        // Dynamic price resolution
        let rawPrice = selectedProduct.price;
        if (selectedVariant && selectedProduct.variants?.items) {
            const variant = selectedProduct.variants.items.find((v: any, i: number) => {
                const vName = v.name || (v.type && v.value ? `${v.type}: ${v.value}` : (v.value || v.type || v.sku || `Variant ${i + 1}`));
                return vName === selectedVariant;
            });
            if (variant && variant.price) rawPrice = variant.price;
        }

        // Fix: Smart Price Cleaning (Handles ranges like "800 - 1200" by taking the first number)
        const cleanPriceString = rawPrice.toString().split('-')[0].replace(/[^0-9.]/g, '');
        const finalPrice = parseFloat(cleanPriceString) || 0;

        const item = {
            id: selectedProduct.id,
            name: selectedProduct.name,
            variant: selectedVariant,
            qty: qty,
            price: finalPrice
        };

        setCart([...cart, item]);
        setSelectedProduct(null);
        setSelectedVariant('');
        setQty(1);
        setSearchProduct('');
    };

    const removeFromCart = (idx: number) => {
        setCart(cart.filter((_, i) => i !== idx));
    };

    const subtotal = cart.reduce((acc, item) => acc + (item.price * item.qty), 0);
    const grandTotal = subtotal + deliveryCharge - discount + previousDue;

    const handlePlaceOrder = async () => {
        if (!customer.number || cart.length === 0) {
            console.warn("[DEBUG] Aborting Order Creation: Missing customer number or empty cart.");
            return;
        }

        const payload = {
            customer_number: customer.number,
            customer_name: customer.name,
            total_amount: grandTotal,
            items: cart,
            delivery_charge: deliveryCharge,
            discount: discount,
            order_notes: notes,
            shipping_address: customer.address,
            address_tag: addressTag,
            status: 'pending'
        };

        console.log("%c[DEBUG] SUBMITTING NEW ORDER...", "background: #2db7b7; color: white; padding: 5px; border-radius: 5px;");
        console.table(cart);
        console.log("[DEBUG] Payload Details:", payload);

        setLoading(true);
        try {
            const res = await fetch('http://localhost:3001/api/oms/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            console.log("[DEBUG] Server Response Received:", data);

            if (data.success) {
                // [AUTO-PRESERVATION ENGINE] - Every order address is automatically saved/updated
                if (customer.address) {
                    await fetch(`http://localhost:3001/api/contacts/${customer.number}/addresses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ 
                            action: 'add', 
                            addressData: { 
                                address: customer.address, 
                                tag: addressTag,
                                is_verified: true 
                            } 
                        })
                    });
                }

                console.log("%c[DEBUG] ORDER CREATED SUCCESSFULLY! Clearing state...", "color: #10b981; font-weight: bold;");
                onSuccess();
            } else {
                console.error("[DEBUG] Server rejected order creation:", data.error);
                alert("Error creating order: " + data.error);
            }
        } catch (e) {
            console.error("[DEBUG] NETWORK ERROR during order creation:", e);
            alert("Network error: Could not reach the server.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-8 bg-gray-900/60 backdrop-blur-md">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className="bg-white w-full max-w-4xl h-full max-h-[90vh] rounded-[3rem] shadow-2xl overflow-hidden border border-white/20 flex flex-col"
            >
                {/* Modal Header */}
                <div className="px-10 py-8 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                            <Plus size={24} className="text-wa-teal" /> Create New Order
                        </h2>
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Manual Production Entry Module</p>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white text-gray-400 rounded-2xl hover:text-rose-500 transition-all border border-gray-100">
                        <XCircle size={24} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-10 custom-scrollbar grid grid-cols-1 md:grid-cols-5 gap-10">
                    {/* Left Side: Order Config */}
                    <div className="md:col-span-3 space-y-8">
                        {/* Step 1: Customer */}
                        <div className="space-y-4">
                            <label className="text-[10px] font-black text-wa-teal uppercase tracking-widest flex items-center gap-2">
                                <User size={12} /> 1. Customer Intelligence
                            </label>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        placeholder="Phone Number (Auto-lookup)" 
                                        value={customer.number}
                                        onChange={e => handleCustomerSearch(e.target.value)}
                                        className="w-full p-4 bg-gray-100 border-none rounded-2xl text-sm font-black outline-none focus:ring-4 focus:ring-wa-teal/10 transition-all"
                                    />
                                    {searchCustomer && (
                                        <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-3xl shadow-2xl z-[110] max-h-60 overflow-y-auto custom-scrollbar p-2">
                                            {allCustomers
                                                .filter(c => (c.number || '').includes(searchCustomer) || (c.name || '').toLowerCase().includes(searchCustomer.toLowerCase()))
                                                .slice(0, 10)
                                                .map(c => (
                                                    <button 
                                                        key={c.id}
                                                        onClick={() => selectSuggestedCustomer(c)}
                                                        className="w-full text-left p-4 hover:bg-gray-50 rounded-2xl transition-all flex items-center justify-between group border-b border-gray-50 last:border-0"
                                                    >
                                                        <div className="flex flex-col">
                                                            <span className="text-sm font-black text-gray-800">{c.name}</span>
                                                            <span className="text-[10px] font-bold text-gray-400">{c.number}</span>
                                                            {c.previous_due > 0 && (
                                                                <span className="text-[10px] font-black text-amber-500 bg-amber-50 px-2 py-0.5 rounded w-fit mt-1">Due: ৳{c.previous_due}</span>
                                                            )}
                                                        </div>
                                                        <Plus size={14} className="text-gray-300 group-hover:text-wa-teal" />
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                                <input 
                                    type="text" 
                                    placeholder="Customer Name" 
                                    value={customer.name}
                                    onChange={e => setCustomer({ ...customer, name: e.target.value })}
                                    className="p-4 bg-gray-100 border-none rounded-2xl text-sm font-black outline-none focus:ring-4 focus:ring-wa-teal/10 transition-all font-mono"
                                />
                                <div className="col-span-2 space-y-4 bg-gray-50/50 p-6 rounded-[2rem] border border-gray-100">
                                    <div className="flex items-center justify-between">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Delivery Area</span>
                                            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter">Automates shipping costs</span>
                                        </div>
                                        <div className="flex gap-2 overflow-x-auto no-scrollbar max-w-[250px]">
                                            {DELIVERY_AREAS.map(area => (
                                                <button 
                                                    key={area.name}
                                                    type="button"
                                                    onClick={() => {
                                                        setDeliveryArea(area.name);
                                                        setDeliveryCharge(area.charge);
                                                    }}
                                                    className={`px-3 py-2 rounded-xl text-[10px] font-black transition-all flex items-center gap-1.5 whitespace-nowrap border ${
                                                        deliveryArea === area.name 
                                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100 scale-105' 
                                                        : 'bg-white text-gray-400 border-gray-100 hover:border-indigo-200'
                                                    }`}
                                                >
                                                    <span>{area.icon}</span>
                                                    {area.name}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex gap-1.5 p-1 bg-white border border-gray-100 rounded-xl">
                                                {['Home', 'Office', 'Other'].map(tag => (
                                                    <button 
                                                        key={tag}
                                                        type="button"
                                                        onClick={() => setAddressTag(tag)}
                                                        className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all ${
                                                            addressTag === tag ? 'bg-indigo-500 text-white shadow-sm' : 'text-gray-400 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        {tag}
                                                    </button>
                                                ))}
                                            </div>
                                            {savedAddresses.length > 0 && (
                                                <div className="flex items-center gap-2">
                                                    <MapPinned size={12} className="text-indigo-400" />
                                                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Saved Addresses</span>
                                                </div>
                                            )}
                                        </div>
                                        
                                        {savedAddresses.length > 0 && (
                                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                                {savedAddresses.map((sa, idx) => (
                                                    <div key={idx} className="relative group/card">
                                                        <button 
                                                            type="button"
                                                            title={sa.address} // Native Tooltip for Full Address
                                                            onClick={() => {
                                                                setCustomer({ ...customer, address: sa.address });
                                                                setAddressTag(sa.tag || 'Home');
                                                            }}
                                                            className="px-4 py-3 bg-white border border-indigo-50 rounded-2xl text-[10px] font-black text-indigo-600 hover:border-indigo-400 transition-all flex-shrink-0 flex items-center gap-2 shadow-sm pr-10"
                                                        >
                                                            <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                                                                <MapPin size={12} />
                                                            </div>
                                                            <div className="flex flex-col items-start max-w-[120px]">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="leading-none mb-0.5">{sa.tag || 'Address'}</span>
                                                                    {sa.is_verified && <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" title="Verified Address" />}
                                                                </div>
                                                                <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter truncate w-full">{sa.address}</span>
                                                                {sa.usage_count > 1 && (
                                                                    <span className="text-[7px] text-indigo-300 font-black mt-0.5">USED {sa.usage_count}x</span>
                                                                )}
                                                            </div>
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                if (window.confirm('Delete this saved address?')) {
                                                                    await fetch(`http://localhost:3001/api/contacts/${customer.number}/addresses`, {
                                                                        method: 'POST',
                                                                        headers: { 'Content-Type': 'application/json' },
                                                                        body: JSON.stringify({ action: 'remove', addressData: { address: sa.address } })
                                                                    });
                                                                    // Refresh list
                                                                    setSavedAddresses(prev => prev.filter(a => a.address !== sa.address));
                                                                }
                                                            }}
                                                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover/card:opacity-100"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="relative group">
                                            <textarea 
                                                placeholder="Shipping Address (Full Detail: House, Road, Area...)" 
                                                value={customer.address}
                                                onChange={e => setCustomer({ ...customer, address: e.target.value })}
                                                className="w-full p-5 bg-white border-2 border-transparent rounded-3xl text-sm font-black outline-none focus:border-indigo-200 focus:bg-white transition-all h-28 resize-none shadow-sm placeholder:text-gray-300"
                                            />
                                            {!customer.address && (
                                                <div className="absolute right-4 bottom-4 opacity-20 group-hover:opacity-100 transition-opacity">
                                                    <MapPinned size={40} className="text-gray-300" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Step 2: Product Selector */}
                        <div className="space-y-4 pt-4 border-t border-gray-100">
                            <label className="text-[10px] font-black text-wa-teal uppercase tracking-widest flex items-center gap-2">
                                <Package size={12} /> 2. Add Professional Items
                            </label>
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                <input 
                                    type="text" 
                                    placeholder="Search products in catalog..." 
                                    value={searchProduct}
                                    onChange={e => setSearchProduct(e.target.value)}
                                    className="w-full pl-12 pr-4 py-4 bg-gray-100 border-none rounded-2xl text-sm font-black outline-none focus:ring-4 focus:ring-wa-teal/10 transition-all"
                                />
                                {searchProduct && (
                                    <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-3xl shadow-2xl z-50 max-h-60 overflow-y-auto custom-scrollbar p-2">
                                        {allProducts.filter(p => p.name.toLowerCase().includes(searchProduct.toLowerCase())).map(p => (
                                            <button 
                                                key={p.id}
                                                onClick={() => { setSelectedProduct(p); setSearchProduct(''); }}
                                                className="w-full text-left p-4 hover:bg-gray-50 rounded-2xl transition-all flex items-center justify-between group"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg bg-wa-teal/10 flex items-center justify-center text-wa-teal font-black text-xs uppercase">
                                                        {p.name[0]}
                                                    </div>
                                                    <span className="text-sm font-black text-gray-800">{p.name}</span>
                                                </div>
                                                <span className="text-xs font-black text-gray-400 group-hover:text-wa-teal transition-colors">৳{p.price}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {selectedProduct && (
                                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-6 bg-wa-teal/[0.03] border border-wa-teal/10 rounded-[2rem] space-y-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-black text-wa-teal uppercase tracking-widest">{selectedProduct.name}</span>
                                        <button onClick={() => setSelectedProduct(null)} className="text-[10px] font-black text-gray-400 hover:text-rose-500 uppercase tracking-widest">Cancel</button>
                                    </div>
                                    <div className="flex flex-wrap gap-4 items-end">
                                        {selectedProduct.variants?.items?.length > 0 && (
                                            <div className="flex-1 min-w-[150px]">
                                                <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Select Variant</label>
                                                <select 
                                                    value={selectedVariant}
                                                    onChange={e => setSelectedVariant(e.target.value)}
                                                    className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-black outline-none focus:ring-2 focus:ring-wa-teal transition-all"
                                                >
                                                    <option value="">Default (No Variant)</option>
                                                    {selectedProduct.variants.items.map((v: any, i: number) => {
                                                        const name = v.name || (v.type && v.value ? `${v.type}: ${v.value}` : (v.value || v.type || v.sku || `Variant ${i + 1}`));
                                                        const stock = parseFloat(v.stock?.toString() || "0").toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 3 });
                                                        const isExplicitlyOut = v.stock_status === 0 || selectedProduct.stock_status === 0;
                                                        return (
                                                            <option key={i} value={name} disabled={isExplicitlyOut}>
                                                                {name} — ৳{v.price || selectedProduct.price} (Stock: {stock}){isExplicitlyOut ? " — OUT OF STOCK" : ""}
                                                            </option>
                                                        );
                                                    })}
                                                </select>
                                            </div>
                                        )}
                                        <div className="w-24">
                                            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Quantity</label>
                                            <input 
                                                type="number" 
                                                step="0.001"
                                                value={qty} 
                                                onChange={e => setQty(parseFloat(e.target.value) || 1)}
                                                onFocus={(e) => e.target.select()}
                                                className="w-20 p-3 bg-white border border-gray-200 rounded-xl text-xs font-black text-center outline-none focus:ring-2 focus:ring-wa-teal"
                                                placeholder="0.000"
                                            />
                                        </div>
                                        <button 
                                            onClick={addToCart}
                                            className="px-6 py-3 bg-wa-teal text-white rounded-xl text-xs font-black hover:bg-wa-teal-dark transition-all active:scale-95"
                                        >
                                            ADD TO MANIFEST
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </div>

                        {/* Step 3: Global Notes */}
                        <div className="space-y-4 pt-4 border-t border-gray-100">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                <FileText size={12} /> 3. Additional Manifest Notes
                            </label>
                            <textarea 
                                placeholder="Internal note, special instructions, or delivery requests..." 
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                className="w-full p-4 bg-gray-50 border-none rounded-2xl text-sm font-black outline-none h-20 resize-none"
                            />
                        </div>
                    </div>

                    {/* Right Side: Manifest & Summary */}
                    <div className="md:col-span-2 flex flex-col h-full bg-gray-50/50 rounded-[2.5rem] p-8 border border-gray-100">
                        <div className="flex-1 overflow-y-auto space-y-4 custom-scrollbar">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
                                    <ShoppingBag size={14} className="text-wa-teal" /> Order Manifest
                                </h3>
                                <span className="text-[10px] font-black text-gray-400">{cart.length} SKU(s)</span>
                            </div>

                            <div className="space-y-3">
                                {cart.map((item, idx) => (
                                    <div key={idx} className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm group">
                                        <div className="flex justify-between items-start">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-black text-gray-900 leading-tight">{item.name}</span>
                                                {item.variant && <span className="text-[9px] font-black text-wa-teal uppercase bg-wa-teal/5 px-2 py-0.5 rounded mt-1 w-fit">{item.variant}</span>}
                                                <span className="text-[10px] text-gray-400 font-bold mt-1">{item.qty} × ৳{item.price.toLocaleString()}</span>
                                            </div>
                                            <button onClick={() => removeFromCart(idx)} className="p-2 text-gray-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {cart.length === 0 && (
                                    <div className="py-12 flex flex-col items-center justify-center grayscale opacity-30 text-gray-400 border-2 border-dashed border-gray-200 rounded-[2rem]">
                                        <ShoppingBag size={32} />
                                        <p className="text-[10px] font-black uppercase tracking-widest mt-2 font-mono">Manifest Empty</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Financials Summary */}
                        <div className="mt-8 pt-8 border-t border-gray-200 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 block">Delivery</label>
                                    <input 
                                        type="number" 
                                        value={deliveryCharge} 
                                        onChange={e => setDeliveryCharge(parseFloat(e.target.value) || 0)}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-black outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1.5 block">Discount</label>
                                    <input 
                                        type="number" 
                                        value={discount} 
                                        onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                                        className="w-full p-3 bg-white border border-gray-200 rounded-xl text-xs font-black outline-none"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2 py-4">
                                <div className="flex justify-between text-[11px] font-bold text-gray-400">
                                    <span>SUBTOTAL</span>
                                    <span>৳{subtotal.toLocaleString()}</span>
                                </div>
                                {previousDue > 0 && (
                                    <div className="flex justify-between text-[11px] font-black text-amber-500">
                                        <span>PREVIOUS DUE (ADDED)</span>
                                        <span>+৳{previousDue.toLocaleString()}</span>
                                    </div>
                                )}
                                <div className="flex justify-between text-lg font-black text-gray-900 tracking-tighter">
                                    <span>GRAND TOTAL</span>
                                    <span className="text-wa-teal">৳{grandTotal.toLocaleString()}</span>
                                </div>
                            </div>

                            <button 
                                onClick={handlePlaceOrder}
                                disabled={loading || cart.length === 0 || !customer.number}
                                className="w-full py-5 bg-gray-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest hover:bg-black active:scale-95 transition-all shadow-xl shadow-gray-200 disabled:opacity-30 disabled:grayscale flex items-center justify-center gap-3"
                            >
                                {loading ? <RefreshCw className="animate-spin" size={18} /> : <CreditCard size={18} />}
                                PLACE ORDER NOW
                            </button>
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}

function StatCard({ label, value, icon, color }: any) {
    return (
        <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm relative overflow-hidden group">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${color} opacity-[0.03] group-hover:opacity-10 transition-opacity rounded-bl-full`} />
            <div className="relative z-10 flex flex-col gap-2">
                <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${color} text-white flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform`}>
                    {React.cloneElement(icon, { size: 20 })}
                </div>
                <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{label}</p>
                    <p className="text-2xl font-black text-gray-900">{value}</p>
                </div>
            </div>
        </div>
    );
}


function FilterButton({ children, active, onClick }: any) {
    return (
        <button 
            onClick={onClick}
            className={`px-4 py-1.5 rounded-lg text-xs font-black transition-all whitespace-nowrap active:scale-95 ${active ? 'bg-white shadow-md text-wa-teal' : 'text-gray-400 hover:text-gray-600'}`}
        >
            {children}
        </button>
    );
}

function StatusStep({ active, icon, label, onClick, color = "bg-wa-teal" }: { active: boolean, icon: React.ReactNode, label?: string, onClick?: () => void, color?: string }) {
    return (
        <div 
            onClick={onClick}
            className={`flex flex-col items-center gap-2 flex-1 cursor-pointer group`}
        >
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-500 ${
                active ? `${color} text-white shadow-lg shadow-wa-teal/20 scale-110` : 'bg-gray-100 text-gray-400 grayscale hover:grayscale-0 hover:bg-gray-200'
            }`}>
                {React.cloneElement(icon as React.ReactElement, { size: 18 })}
            </div>
            {label && <span className={`text-[8px] font-black uppercase tracking-tighter ${active ? 'text-gray-900' : 'text-gray-300'}`}>{label}</span>}
        </div>
    );
}


const DetailTabBtn = ({ active, onClick, label, icon }: { active: boolean, onClick: () => void, label: string, icon: React.ReactNode }) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${
            active 
            ? 'bg-wa-teal text-white shadow-lg shadow-wa-teal/20' 
            : 'text-gray-400 hover:bg-gray-50'
        }`}
    >
        {icon}
        {label}
    </button>
);

function ActionBtn({ icon, label, onClick, color = "bg-white/10" }: { icon: React.ReactNode, label: string, onClick: () => void, color?: string }) {
    return (
        <button 
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            className={`flex flex-col items-center justify-center gap-2 p-4 rounded-2xl transition-all hover:scale-105 active:scale-95 ${color} backdrop-blur-md border border-white/10 group`}
        >
            <div className="text-white group-hover:animate-bounce">
                {React.cloneElement(icon as React.ReactElement, { size: 20 })}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/80">{label}</span>
        </button>
    );
}


