
import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard,
  QrCode,
  Users,
  Send,
  History,
  Settings,
  Menu,
  MessageSquare,
  FileText,
  BarChart3,
  BrainCircuit
} from 'lucide-react';

import { AppTab, Contact, MessageLog, Group } from './types';
import DashboardView from './components/DashboardView';
import ConnectView from './components/ConnectView';
import ContactsView from './components/ContactsView';
import CampaignView from './components/CampaignView';
import HistoryView from './components/HistoryView';
import ChatBox from './components/ChatBox';
import TemplatesView from './components/TemplatesView';
import AnalyticsView from './components/AnalyticsView';
import ProcessModal from './components/ProcessModal';
import { ModalProvider } from './components/ModalProvider';
import SettingsView from './components/SettingsView';
import AIBrainView from './components/AIBrainView';
import FloatingActiveExecutions from './components/FloatingActiveExecutions';

import { io, Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'framer-motion';

import { useAppData } from './hooks/useAppData';
import { useSocketHandlers } from './hooks/useSocketHandlers';
import ScheduledCountdownManager from './components/campaign/ScheduledCountdownManager';
import { ScheduledCampaign } from './components/campaign/types';
import ResumeConfirmModal from './components/campaign/ResumeConfirmModal';

interface ProcessState {
  id?: string;
  isOpen: boolean;
  title: string;
  current: number;
  total: number;
  sentCount: number;
  failCount: number;
  messagePreview?: string;
  status: 'processing' | 'completed' | 'failed';
  logs: { id: string; message: string; type: 'info' | 'success' | 'warning' | 'error'; timestamp: string }[];
  recipients?: { name: string; phone: string; status: string; timestamp: string }[];
  antiBan?: {
    quota?: { sent: number; limit: number; enabled: boolean };
    batch?: { enabled: boolean; batchSize: number; current?: number };
    jitter?: { enabled: boolean; min: number; max: number };
    windows?: { enabled: boolean };
    batchProgress?: { current: number; total: number };
  };
  statusDetail?: 'active' | 'batch_break' | 'window_wait' | 'jitter_wait' | 'quota_reached';
  breakEndsAt?: number;
  resumeAt?: number;
  campaignId?: number;
  source?: string;
}

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<AppTab>(AppTab.DASHBOARD);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const {
    contacts, setContacts,
    groups, setGroups,
    messageLogs, setMessageLogs,
    scheduledCampaigns, setScheduledCampaigns,
    fetchScheduled,
    isConnected, setIsConnected,
    socket,
    selectedChat, setSelectedChat
  } = useAppData();

  const [processState, setProcessState] = useState<ProcessState>({
    isOpen: false,
    title: '',
    current: 0,
    total: 0,
    sentCount: 0,
    failCount: 0,
    status: 'processing',
    logs: [],
    recipients: []
  });

  const [campaignExecution, setCampaignExecution] = useState<any>(null);

  const [resumeModal, setResumeModal] = useState<{ isOpen: boolean; campaignId: number | null; campaignName: string }>({
    isOpen: false,
    campaignId: null,
    campaignName: ''
  });

  // Expose routing setters
  useEffect(() => {
    (window as any).setActiveTab = setActiveTab;
    (window as any).setSelectedChat = setSelectedChat;
  }, [setSelectedChat]);

  // Hook for socket event handlers
  useSocketHandlers({
    socket,
    contacts,
    setMessageLogs,
    setContacts,
    setScheduledCampaigns,
    fetchScheduled,
    setProcessState,
    setIsConnected
  });

  const handlePauseCampaign = async (id: any) => {
    try {
      // Use unified process pause for all types
      const endpoint = `http://localhost:3001/api/processes/${id}/pause`;

      const res = await fetch(endpoint, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) fetchScheduled();
      else console.error('Pause failed', data.error);
    } catch (err) { console.error('Pause error', err); }
  };

  const handleResumeCampaign = async (id: any, additionalMinutes: number = 0) => {
    const isScheduled = !isNaN(Number(id));

    // If we're calling this from the initial "Resume" button click without confirming minutes,
    // and the campaign is currently paused, we should show the modal first (only for scheduled).
    if (isScheduled) {
      const campaign = scheduledCampaigns.find(c => String(c.id) === String(id));
      if (campaign?.status === 'paused' && resumeModal.campaignId !== id && additionalMinutes === 0) {
        setResumeModal({ isOpen: true, campaignId: id, campaignName: campaign.name });
        return;
      }
    }

    try {
      // Unified route for normal resumes, specialized route for scheduled adjustments
      const endpoint = (isScheduled && additionalMinutes > 0)
        ? `http://localhost:3001/api/campaigns/scheduled/${id}/resume`
        : `http://localhost:3001/api/processes/${id}/resume`;

      const res = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additional_minutes: additionalMinutes })
      });
      const data = await res.json();
      if (data.success) {
        fetchScheduled();
        setResumeModal({ isOpen: false, campaignId: null, campaignName: '' });
      } else {
        console.error('Resume failed', data.error);
      }
    } catch (err) { console.error('Resume error', err); }
  };

  const handleCancelCampaign = async (id: any) => {
    try {
      // Use unified process cancel
      const endpoint = `http://localhost:3001/api/processes/${id}/cancel`;
      const res = await fetch(endpoint, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) fetchScheduled();
      else console.error('Cancel failed', data.error);
    } catch (err) { console.error('Cancel error', err); }
  };

  const handleStopProcess = async () => {
    // If it's a scheduled campaign, it has a numeric campaignId. If instant, it has a string id.
    const id = processState.campaignId || processState.id;
    if (!id) return;

    try {
      // Use unified process cancel for all RUNNING campaigns
      const endpoint = `http://localhost:3001/api/processes/${id}/cancel`;
      await fetch(endpoint, { method: 'PATCH' });
    } catch (err) { console.error('Stop process error', err); }
  };

  const handlePauseProcess = async () => {
    const id = (processState.campaignId || processState.id);
    if (!id) return;

    try {
      const endpoint = `http://localhost:3001/api/processes/${id}/pause`;
      await fetch(endpoint, { method: 'PATCH' });
    } catch (err) { console.error('Pause process error', err); }
  };

  const handleResumeProcess = async () => {
    const isScheduled = !isNaN(Number(processState.campaignId)) && processState.source === 'scheduled';
    const id = isScheduled ? processState.campaignId : processState.id;
    if (!id) return;

    try {
      // For scheduled campaigns, we might need the resume confirm modal
      if (isScheduled) {
        // Special case: If we resume from ProcessModal, we usually want 0 additional mins unless specified.
        // But for consistency, let's trigger the same resume logic as handleResumeCampaign
        handleResumeCampaign(id);
        return;
      }

      const endpoint = `http://localhost:3001/api/processes/${id}/resume`;
      await fetch(endpoint, { method: 'PATCH' });
    } catch (err) { console.error('Resume process error', err); }
  };

  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  const handleSendMessage = (phone: string, text: string, mediaUrl?: string, mediaType?: string, quotedMessageId?: string, quotedText?: string, attachments?: any[], templateId?: string | number) => {
    if (socket) {
      socket.emit('send-message', {
        to: phone,
        text: text,
        contactName: contacts.find(c => c.phone === phone)?.name || phone,
        mediaUrl,
        mediaType,
        quotedMessageId,
        quotedText,
        attachments,
        templateId
      });
    }
  };

  const handleSendReaction = (whatsappId: string, reaction: string) => {
    if (socket) {
      socket.emit('send-reaction', { whatsappId, reaction });
    }
  };

  const renderContent = () => {
    return (
      <>
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {(() => {
              switch (activeTab) {
                case AppTab.DASHBOARD:
                  return <DashboardView contacts={contacts} logs={messageLogs} isConnected={isConnected} />;
                case AppTab.CONNECT:
                  return (
                    <ConnectView
                      isConnected={isConnected}
                      setIsConnected={setIsConnected}
                      socket={socket}
                      groups={groups}
                    />
                  );
                case AppTab.CONTACTS:
                  return <ContactsView
                    contacts={contacts}
                    setContacts={setContacts}
                    groups={groups}
                    setGroups={setGroups}
                  />;
                case AppTab.CAMPAIGN:
                  return (
                    <CampaignView
                      contacts={contacts}
                      groups={groups}
                      isConnected={isConnected}
                      socket={socket}
                      scheduledCampaigns={scheduledCampaigns}
                      onPause={handlePauseCampaign}
                      onResume={handleResumeCampaign}
                      onCancel={handleCancelCampaign}
                      campaignExecution={campaignExecution}
                    />
                  );
                case AppTab.HISTORY:
                  return <HistoryView logs={messageLogs} />;
                case AppTab.MESSAGES:
                  return (
                    <ChatBox
                      logs={messageLogs}
                      contacts={contacts}
                      isConnected={isConnected}
                      onSendMessage={handleSendMessage}
                      onSendReaction={handleSendReaction}
                      socket={socket}
                      selectedChat={selectedChat}
                      setSelectedChat={setSelectedChat}
                    />
                  );
                case AppTab.TEMPLATES:
                  return <TemplatesView />;
                case AppTab.ANALYTICS:
                  return <AnalyticsView />;
                case AppTab.SETTINGS:
                  return <SettingsView />;
                case AppTab.AIBRAIN:
                  return <AIBrainView />;
                default:
                  return <DashboardView contacts={contacts} logs={messageLogs} isConnected={isConnected} />;
              }
            })()}
          </motion.div>
        </AnimatePresence>

        {/* Global Process Modal */}
        <ProcessModal
          isOpen={processState.isOpen}
          id={processState.id}
          title={processState.title || ''}
          current={processState.current || 0}
          total={processState.total || 0}
          logs={processState.logs || []}
          status={processState.status || 'pending'}
          antiBan={processState.antiBan}
          statusDetail={processState.statusDetail}
          breakEndsAt={processState.breakEndsAt}
          sentCount={processState.sentCount || 0}
          failCount={processState.failCount || 0}
          messagePreview={processState.messagePreview || ''}
          recipients={processState.recipients || []}
          campaignId={processState.campaignId}
          source={processState.source}
          executionState={processState.executionState}
          resumeAt={processState.resumeAt}
          isScheduled={!!processState.campaignId}
          onClose={() => setProcessState(prev => prev ? { ...prev, isOpen: false } : null)}
          onStop={handleStopProcess}
          onPause={handlePauseProcess}
          onResume={handleResumeProcess}
        />
      </>
    );
  };

  return (
    <ModalProvider>
      <div className="flex h-screen bg-wa-light overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${isSidebarOpen ? 'w-64' : 'w-20'
            } bg-wa-sidebar text-white transition-all duration-300 flex flex-col z-20`}
        >
          <div className="p-6 flex items-center gap-3">
            <div className="bg-wa-teal p-2 rounded-lg">
              <MessageSquare size={24} className="text-white" />
            </div>
            {isSidebarOpen && <span className="font-bold text-xl tracking-tight">WA-Auto</span>}
          </div>

          <nav className="flex-1 mt-4 overflow-y-auto custom-scrollbar">
            <SidebarItem
              icon={<LayoutDashboard size={20} />}
              label="Dashboard"
              active={activeTab === AppTab.DASHBOARD}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.DASHBOARD)}
            />
            <SidebarItem
              icon={<QrCode size={20} />}
              label="Connect"
              active={activeTab === AppTab.CONNECT}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.CONNECT)}
            />
            <SidebarItem
              icon={<Users size={20} />}
              label="Contacts"
              active={activeTab === AppTab.CONTACTS}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.CONTACTS)}
            />
            <SidebarItem
              icon={<Send size={20} />}
              label="Campaigns"
              active={activeTab === AppTab.CAMPAIGN}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.CAMPAIGN)}
            />
            <SidebarItem
              icon={<FileText size={20} />}
              label="Templates"
              active={activeTab === AppTab.TEMPLATES}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.TEMPLATES)}
            />
            <SidebarItem
              icon={<History size={20} />}
              label="History"
              active={activeTab === AppTab.HISTORY}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.HISTORY)}
            />
            <SidebarItem
              icon={<MessageSquare size={20} />}
              label="Messages"
              active={activeTab === AppTab.MESSAGES}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.MESSAGES)}
            />
            <SidebarItem
              icon={<BarChart3 size={20} />}
              label="Analytics"
              active={activeTab === AppTab.ANALYTICS}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.ANALYTICS)}
            />
            <SidebarItem
              icon={<BrainCircuit size={20} />}
              label="AI Brain"
              active={activeTab === AppTab.AIBRAIN}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.AIBRAIN)}
            />
            <SidebarItem
              icon={<Settings size={20} />}
              label="Settings"
              active={activeTab === AppTab.SETTINGS}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.SETTINGS)}
            />
          </nav>


          <div className="p-4 border-t border-gray-700">
            <div className={`flex items-center gap-2 ${isSidebarOpen ? '' : 'justify-center'}`}>
              <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              {isSidebarOpen && <span className="text-sm text-gray-400">{isConnected ? 'Connected' : 'Disconnected'}</span>}
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <header className="h-16 bg-white border-b flex items-center justify-between px-6 z-10">
            <button onClick={toggleSidebar} className="p-2 hover:bg-gray-100 rounded-lg">
              <Menu size={24} className="text-gray-600" />
            </button>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-gray-800">Admin Dashboard</p>
                <p className="text-xs text-gray-400">Manage your daily tasks</p>
              </div>
              <button
                onClick={() => setActiveTab(AppTab.SETTINGS)}
                className="w-10 h-10 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 hover:bg-wa-teal/10 hover:text-wa-teal transition-all cursor-pointer"
              >
                <Settings size={20} />
              </button>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-6 pb-24">
            {renderContent()}
          </div>
        </main>
      </div>
      <ScheduledCountdownManager
        campaigns={scheduledCampaigns}
        onPause={handlePauseCampaign}
        onResume={handleResumeCampaign}
        onCancel={handleCancelCampaign}
        campaignExecution={campaignExecution}
        onClearExecution={() => setCampaignExecution(null)}
      />
      <ResumeConfirmModal
        isOpen={resumeModal.isOpen}
        campaignName={resumeModal.campaignName}
        onClose={() => setResumeModal({ ...resumeModal, isOpen: false })}
        onConfirm={(mins) => handleResumeCampaign(resumeModal.campaignId!, mins)}
      />
    </ModalProvider>
  );
};

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  isOpen: boolean;
  onClick: () => void;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, isOpen, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-6 py-4 transition-colors ${active ? 'bg-wa-hover text-wa-teal border-r-4 border-wa-teal' : 'text-gray-400 hover:bg-wa-card hover:text-white'
      }`}
  >
    {icon}
    {isOpen && <span className="font-medium">{label}</span>}
  </button>
);

export default App;
