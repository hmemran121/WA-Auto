import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Socket } from 'socket.io-client';
import { motion } from 'framer-motion';

// Shared Components
import AIGenerator from './campaign/AIGenerator';
import TemplateCampaign from './campaign/TemplateCampaign';
import SmartBulkDelete from './campaign/SmartBulkDelete';
import ScheduledQueue from './campaign/ScheduledQueue';
import UnifiedCampaignTracker from './campaign/UnifiedCampaignTracker';

// Types
import { Contact, Group, MessageLog } from './campaign/types';

interface CampaignViewProps {
  contacts: Contact[];
  groups: Group[];
  isConnected: boolean;
  socket: Socket | null;
  scheduledCampaigns: any[];
  onPause: (id: number) => Promise<void>;
  onResume: (id: number) => Promise<void>;
  onCancel: (id: number) => Promise<void>;
  campaignExecution?: any;
}



// ─── Main Component ───────────────────────────────────────────────────────────

const CampaignView: React.FC<CampaignViewProps> = ({
  contacts, groups, isConnected, socket, scheduledCampaigns,
  onPause, onResume, onCancel, campaignExecution
}) => {
  const [showAiPanel, setShowAiPanel] = useState(true);
  const [showTemplateCampaign, setShowTemplateCampaign] = useState(false);
  const [showDeletePanel, setShowDeletePanel] = useState(false);
  const [showScheduleQueue, setShowScheduleQueue] = useState(false);

  if (!isConnected) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-2xl mx-auto mt-20 p-12 glass-card bg-white/80 backdrop-blur-xl rounded-[2.5rem] border border-amber-100 text-center shadow-2xl">
        <div className="relative inline-block mb-8">
          <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.4, 0.2, 0.4] }} transition={{ repeat: Infinity, duration: 2 }} className="absolute inset-0 bg-amber-200 blur-3xl rounded-full" />
          <div className="relative w-24 h-24 bg-amber-500 rounded-full flex items-center justify-center text-white shadow-xl"><AlertTriangle size={48} /></div>
        </div>
        <h3 className="text-3xl font-black text-gray-800 mb-4">WhatsApp Not Connected</h3>
        <p className="text-gray-500 font-medium leading-relaxed">Please scan your WhatsApp QR code from the 'Connect' menu before sending messages.</p>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10 max-w-7xl mx-auto pb-24"
    >
      <AIGenerator
        showAiPanel={showAiPanel}
        setShowAiPanel={setShowAiPanel}
        contacts={contacts}
        groups={groups}
        isConnected={isConnected}
        socket={socket}
      />

      <TemplateCampaign
        showTemplateCampaign={showTemplateCampaign}
        setShowTemplateCampaign={setShowTemplateCampaign}
        contacts={contacts}
        groups={groups}
        isConnected={isConnected}
        socket={socket}
      />

      <SmartBulkDelete
        showDeletePanel={showDeletePanel}
        setShowDeletePanel={setShowDeletePanel}
      />

      <UnifiedCampaignTracker
        socket={socket}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        campaignExecution={campaignExecution}
      />

      {/* Legacy/Specific Queue maintained if needed, or Unified acts as super-set */}
      <ScheduledQueue
        showScheduleQueue={showScheduleQueue}
        setShowScheduleQueue={setShowScheduleQueue}
        socket={socket}
        scheduledCampaigns={scheduledCampaigns}
        onPause={onPause}
        onResume={onResume}
        onCancel={onCancel}
        campaignExecution={campaignExecution}
      />
    </motion.div>
  );
};

export default CampaignView;
