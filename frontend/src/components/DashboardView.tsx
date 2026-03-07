
import React from 'react';
import { Users, Send, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import { Contact, MessageLog } from '../types';
import { motion } from 'framer-motion';

interface DashboardViewProps {
  contacts: Contact[];
  logs: MessageLog[];
  isConnected: boolean;
}

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1
  }
};

const DashboardView: React.FC<DashboardViewProps> = ({ contacts, logs, isConnected }) => {
  const totalSent = logs.filter(l => l.status === 'sent').length;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-24"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Users className="text-blue-500" />}
          label="Total Contacts"
          value={contacts.length.toString()}
          color="bg-blue-50/50"
          delay={0}
        />
        <StatCard
          icon={<Send className="text-purple-500" />}
          label="Sent Messages"
          value={totalSent.toString()}
          color="bg-purple-50/50"
          delay={0.1}
        />
        <StatCard
          icon={<CheckCircle2 className="text-emerald-500" />}
          label="Server Status"
          value={isConnected ? "Active" : "Offline"}
          color="bg-emerald-50/50"
          delay={0.2}
        />
        <StatCard
          icon={<AlertCircle className="text-amber-500" />}
          label="Pending Messages"
          value="0"
          color="bg-amber-50/50"
          delay={0.3}
        />
      </div>

      <motion.div
        variants={itemVariants}
        className="glass-card rounded-2xl shadow-sm border border-white/20 p-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Clock className="text-wa-teal" size={22} /> Recent Activity
          </h3>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Last 5 Messages</span>
        </div>

        {logs.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-gray-100">
              <Send size={24} className="opacity-20" />
            </div>
            <p className="font-medium text-gray-500 italic">No messages sent yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">
                  <th className="pb-4 pr-4 font-bold">Name & Phone</th>
                  <th className="pb-4 pr-4 font-bold">Time</th>
                  <th className="pb-4 font-bold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.slice(0, 5).map((log, index) => (
                  <motion.tr
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + (index * 0.05) }}
                    key={log.id}
                    className="text-sm group hover:bg-gray-50/50 transition-colors"
                  >
                    <td className="py-4 pr-4">
                      <div className="font-bold text-gray-800">{log.contactName}</div>
                      <div className="text-xs text-gray-400">{log.phone}</div>
                    </td>
                    <td className="py-4 pr-4 font-medium text-gray-500">
                      {new Date(log.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-4 text-right">
                      <span className="inline-flex items-center px-3 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-100">
                        Sent Successfully
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const StatCard = ({ icon, label, value, color, delay }: { icon: React.ReactNode, label: string, value: string, color: string, delay: number }) => (
  <motion.div
    variants={itemVariants}
    whileHover={{ y: -5, transition: { duration: 0.2 } }}
    className="glass-card p-6 rounded-2xl border border-white/20 shadow-sm flex items-center gap-5 cursor-default group"
  >
    <div className={`p-4 rounded-xl ${color} transition-transform group-hover:scale-110 duration-300`}>
      {icon}
    </div>
    <div>
      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black text-gray-800">{value}</p>
    </div>
  </motion.div>
);

export default DashboardView;
