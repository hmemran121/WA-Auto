import React from 'react';
import { Wallet, Receipt, RotateCcw, ArrowRightLeft, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'framer-motion';

export interface FinancialEvent {
  type: 'BILLING' | 'PAYMENT' | 'RETURN' | 'TRANSFER';
  timestamp: string;
  amount: number;
  order_id?: number;
  source_order_id?: number; // Added for transfer tracking
  method?: string;
  status?: string;
  note: string;
}

interface FinancialLedgerProps {
  events: any[];
  isLoading?: boolean;
  onOrderClick?: (orderId: string) => void;
}

const FinancialLedger: React.FC<FinancialLedgerProps> = ({ events, isLoading, onOrderClick }) => {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 py-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="animate-pulse flex gap-4 items-start">
            <div className="w-10 h-10 bg-gray-200 rounded-full" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/4" />
              <div className="h-3 bg-gray-100 rounded w-full" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
        <AlertCircle className="mx-auto text-gray-300 mb-3" size={32} />
        <p className="text-sm font-bold text-gray-400">No financial history found for this customer.</p>
      </div>
    );
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'BILLING': return <Receipt size={18} className="text-indigo-600" />;
      case 'PAYMENT': return <Wallet size={18} className="text-emerald-600" />;
      case 'RETURN': return <RotateCcw size={18} className="text-rose-600" />;
      case 'TRANSFER': return <ArrowRightLeft size={18} className="text-amber-600" />;
      default: return <Clock size={18} className="text-gray-600" />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'BILLING': return 'bg-indigo-100 border-indigo-200';
      case 'PAYMENT': return 'bg-emerald-100 border-emerald-200';
      case 'RETURN': return 'bg-rose-100 border-rose-200';
      case 'TRANSFER': return 'bg-amber-100 border-amber-200';
      default: return 'bg-gray-100 border-gray-200';
    }
  };

  return (
    <div className="relative pl-8 space-y-6 before:content-[''] before:absolute before:left-[19px] before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
      {events.map((event, idx) => (
        <motion.div 
          key={idx}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: idx * 0.05 }}
          className="relative"
        >
          {/* Timeline Dot */}
          <div className={`absolute -left-[27px] top-1 w-5 h-5 rounded-full border-4 border-white shadow-sm z-10 ${getEventColor(event.type)}`} />
          
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-all group">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl border ${getEventColor(event.type)} group-hover:scale-110 transition-transform`}>
                  {getEventIcon(event.type)}
                </div>
                <div>
                  <h5 className="font-black text-gray-800 text-sm uppercase tracking-tight">
                    {event.type === 'BILLING' ? 'New Invoice' : 
                     event.type === 'PAYMENT' ? 'Payment Received' :
                     event.type === 'RETURN' ? 'Adjustment / Return' : 'Debt Transfer'}
                  </h5>
                  <p className="text-[10px] font-bold text-gray-400">
                    {new Date(event.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-black text-lg ${event.amount >= 0 && event.type !== 'PAYMENT' ? 'text-gray-800' : event.type === 'PAYMENT' ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {event.amount >= 0 ? '' : '-'}{Math.abs(event.amount).toLocaleString()} ৳
                </p>
                {event.order_id && (
                  <button 
                    onClick={() => onOrderClick?.((event.display_order_id || event.order_id).toString())}
                    className="flex items-center gap-1 text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100 uppercase hover:bg-indigo-500 hover:text-white transition-all ml-auto"
                  >
                    Order #{event.display_order_id || event.order_id} <Clock size={10} />
                  </button>
                )}
              </div>
            </div>
            
            <div className="mt-2 flex flex-col gap-2">
              <div className="text-xs font-bold text-gray-500 italic">
                "{(() => {
                  const parts = (event.note || '').split(/(Order\s*#\d+)/g);
                  return parts.map((part, i) => {
                    const match = part.match(/Order\s*#(\d+)/);
                    if (match) {
                      return (
                        <button 
                          key={i}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOrderClick?.(match[1]);
                          }}
                          className="text-indigo-500 hover:underline font-black"
                        >
                          {part}
                        </button>
                      );
                    }
                    return part;
                  });
                })()}"
              </div>
              
              <div className="flex flex-wrap items-center gap-2">
                {event.address && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 rounded-lg border border-gray-100 max-w-full">
                    <div className="p-1 bg-white rounded-md shadow-sm border border-gray-100">
                      <Clock size={10} className="text-gray-400" /> {/* Reusing clock as placeholder for map-pin if not imported */}
                    </div>
                    <span className="text-[9px] font-bold text-gray-600 uppercase tracking-tight truncate">
                      {event.address}
                    </span>
                  </div>
                )}
                
                {event.method && (
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest bg-emerald-50 px-2 py-1 rounded-md border border-emerald-100">
                    via {event.method}
                  </span>
                )}
              </div>
            </div>

            {event.type === 'BILLING' && event.status && (
              <div className="mt-3 pt-3 border-t border-gray-50 flex gap-2">
                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-lg ${
                  event.status === 'delivered' ? 'bg-emerald-100 text-emerald-600' :
                  event.status === 'shipped' ? 'bg-blue-100 text-blue-600' :
                  event.status === 'cancelled' ? 'bg-rose-100 text-rose-600' : 'bg-gray-100 text-gray-600'
                }`}>
                  Status: {event.status}
                </span>
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
};

export default FinancialLedger;
