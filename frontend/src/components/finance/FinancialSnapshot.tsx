import React from 'react';
import { TrendingUp, CreditCard, ShieldCheck, Info } from 'lucide-react';
import { motion } from 'framer-motion';

export interface FinancialDNA {
  totalOrders: number;
  ltv: number;
  totalDue: number;
  returnRate: number;
  trustScore: number;
}

interface FinancialSnapshotProps {
  dna: FinancialDNA;
  isLoading?: boolean;
}

const FinancialSnapshot: React.FC<FinancialSnapshotProps> = ({ dna, isLoading }) => {
  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-3xl border border-gray-200" />
        ))}
      </div>
    );
  }

  const getTrustColor = (score: number) => {
    if (score >= 80) return 'text-emerald-500 bg-emerald-50 border-emerald-100';
    if (score >= 50) return 'text-amber-500 bg-amber-50 border-amber-100';
    return 'text-rose-500 bg-rose-50 border-rose-100';
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      {/* LTV Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-indigo-50 to-white p-4 rounded-[2rem] border border-indigo-100 shadow-sm relative overflow-hidden group"
      >
        <div className="relative z-10">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1 flex items-center gap-1">
            <TrendingUp size={12} /> Lifetime Value
          </p>
          <p className="text-xl font-black text-gray-800">{dna.ltv.toLocaleString()} ৳</p>
          <p className="text-[10px] font-bold text-gray-400 mt-1">{dna.totalOrders} Successful Orders</p>
        </div>
        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-125 transition-transform">
          <TrendingUp size={80} className="text-indigo-600" />
        </div>
      </motion.div>

      {/* Due Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className={`p-4 rounded-[2rem] border shadow-sm relative overflow-hidden group ${dna.totalDue > 0 ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'}`}
      >
        <div className="relative z-10">
          <p className={`text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1 ${dna.totalDue > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            <CreditCard size={12} /> Total Outstanding
          </p>
          <p className={`text-xl font-black ${dna.totalDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
            {dna.totalDue.toLocaleString()} ৳
          </p>
          <p className="text-[10px] font-bold text-gray-400 mt-1">Current Unpaid Balance</p>
        </div>
        <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:scale-125 transition-transform">
          <CreditCard size={80} className={dna.totalDue > 0 ? 'text-rose-600' : 'text-emerald-600'} />
        </div>
      </motion.div>

      {/* Trust Card */}
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className={`p-4 rounded-[2rem] border shadow-sm relative overflow-hidden group ${getTrustColor(dna.trustScore)}`}
      >
        <div className="relative z-10">
          <div className="flex justify-between items-start">
            <p className="text-[10px] font-black uppercase tracking-widest mb-1 flex items-center gap-1">
              <ShieldCheck size={12} /> Trust Score
            </p>
            <div className="group/info relative">
              <Info size={12} className="opacity-40 cursor-help" />
              <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-[9px] rounded-xl opacity-0 group-hover/info:opacity-100 transition-opacity pointer-events-none z-50 shadow-2xl font-medium leading-relaxed">
                Calculated based on purchase history, repeat orders, and return rate ({dna.returnRate}%).
              </div>
            </div>
          </div>
          <p className="text-xl font-black">{dna.trustScore}%</p>
          <div className="w-full bg-black/5 h-1.5 rounded-full mt-2 overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${dna.trustScore}%` }}
              className={`h-full rounded-full ${dna.trustScore >= 80 ? 'bg-emerald-500' : dna.trustScore >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default FinancialSnapshot;
