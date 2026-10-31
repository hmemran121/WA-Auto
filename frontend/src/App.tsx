
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
  BrainCircuit,
  Zap,
  PackageCheck,
  ShoppingCart
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
import PurchaseView from './components/PurchaseView';
import IntelligenceHubView from './components/IntelligenceHubView';
import AIFailoverView from './components/AIFailoverView';
import OMSView from './components/OMSView';
import SuppliersView from './components/SuppliersView';
import FinanceView from './components/FinanceView';
import FloatingActiveExecutions from './components/FloatingActiveExecutions';
import { ShieldCheck, Truck, Wallet } from 'lucide-react';

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
  const [backOrderCount, setBackOrderCount] = useState(0);
  const [preSelectedProcurement, setPreSelectedProcurement] = useState<any>(null);

  const checkBackOrders = useRef(async () => {
    try {
      const res = await fetch('http://localhost:3001/api/ai-brain/products?limit=1000');
      const data = await res.json();
      if (data.success) {
        const count = data.products.filter((p: any) => p.stock_quantity < 0).length;
        setBackOrderCount(count);
      }
    } catch (e) { }
  }).current;

  useEffect(() => {
    checkBackOrders();
    const timer = setInterval(checkBackOrders, 30000); // Check every 30s
    return () => clearInterval(timer);
  }, [checkBackOrders]);

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

  // Global procurement logging listener
  useEffect(() => {
    if (!socket) return;
    socket.on('procurement_log', (msg: string) => {
      console.log('%c' + msg, 'color: #8b5cf6; font-weight: bold; background: #f5f3ff; padding: 2px 5px; border-radius: 4px;');
    });
    return () => { socket.off('procurement_log'); };
  }, [socket]);

  const [incomingToast, setIncomingToast] = useState<{ name: string; number: string; text: string; time: string } | null>(null);

  useEffect(() => {
    if (incomingToast) {
      const timer = setTimeout(() => setIncomingToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [incomingToast]);

  // Hook for socket event handlers
  useSocketHandlers({
    socket,
    contacts,
    setMessageLogs,
    setContacts,
    setScheduledCampaigns,
    fetchScheduled,
    setProcessState,
    setIsConnected,
    onNewIncomingMessage: (msg) => {
      setIncomingToast({ ...msg, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
    }
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
      if (!phone || phone.length < 5 || phone === '@c.us') {
        console.warn('[App] Blocked send attempt to invalid phone number:', phone);
        return;
      }
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
                    setActiveTab={setActiveTab}
                    setSelectedChat={setSelectedChat}
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
                  return <AIBrainView onProcurementRequest={(p) => {
                    setPreSelectedProcurement(p);
                    setActiveTab(AppTab.PURCHASES);
                  }} />;
                case AppTab.PURCHASES:
                  return <PurchaseView 
                    preSelected={preSelectedProcurement} 
                    clearPreSelected={() => setPreSelectedProcurement(null)} 
                  />;
                case AppTab.INTELLIGENCE:
                  return <IntelligenceHubView />;
                case AppTab.AI_FAILOVER:
                  return <AIFailoverView />;
                case AppTab.OMS:
                  return <OMSView />;
                case AppTab.SUPPLIERS:
                  return <SuppliersView />;
                case AppTab.FINANCE:
                  return <FinanceView />;
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
              icon={<PackageCheck size={20} />}
              label="OMS (Orders)"
              active={activeTab === AppTab.OMS}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.OMS)}
              alert={backOrderCount > 0 ? backOrderCount : undefined}
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
              icon={<Zap size={20} />}
              label="Intelligence"
              active={activeTab === AppTab.INTELLIGENCE}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.INTELLIGENCE)}
            />
            <SidebarItem
              icon={<ShieldCheck size={20} />}
              label="AI Failover"
              active={activeTab === AppTab.AI_FAILOVER}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.AI_FAILOVER)}
            />
            <SidebarItem
              icon={<ShoppingCart size={20} />}
              label="Purchases"
              active={activeTab === AppTab.PURCHASES}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.PURCHASES)}
            />
            <SidebarItem
              icon={<Truck size={20} />}
              label="Suppliers"
              active={activeTab === AppTab.SUPPLIERS}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.SUPPLIERS)}
            />
            <SidebarItem
              icon={<Wallet size={20} />}
              label="Finance"
              active={activeTab === AppTab.FINANCE}
              isOpen={isSidebarOpen}
              onClick={() => setActiveTab(AppTab.FINANCE)}
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
      <AnimatePresence>
        {incomingToast && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className="fixed top-6 right-6 z-50 bg-gray-900/90 text-white backdrop-blur-xl border border-emerald-500/30 p-4 rounded-2xl shadow-2xl flex items-center gap-4 max-w-sm"
          >
            <div className="w-10 h-10 bg-emerald-500/20 text-emerald-400 rounded-xl flex items-center justify-center font-bold text-lg">
              💬
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="flex items-center justify-between">
                <p className="text-xs font-black text-emerald-400 truncate">{incomingToast.name}</p>
                <span className="text-[10px] text-gray-400 ml-2">{incomingToast.time}</span>
              </div>
              <p className="text-xs text-gray-200 truncate mt-0.5">{incomingToast.text}</p>
            </div>
            <button onClick={() => setIncomingToast(null)} className="text-gray-400 hover:text-white font-bold text-xs p-1 cursor-pointer">✕</button>
          </motion.div>
        )}
      </AnimatePresence>
    </ModalProvider>
  );
};

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  isOpen: boolean;
  onClick: () => void;
  alert?: number | string;
}

const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, active, isOpen, onClick, alert }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-6 py-4 transition-all relative ${active ? 'bg-wa-hover text-wa-teal border-r-4 border-wa-teal' : 'text-gray-400 hover:bg-wa-card hover:text-white'
      }`}
  >
    <div className="flex-shrink-0">{icon}</div>
    {isOpen && <span className="font-medium">{label}</span>}
    {alert && (
      <div className={`absolute ${isOpen ? 'right-4' : 'right-4 top-2'} flex items-center justify-center min-w-[20px] h-[20px] bg-rose-500 text-white text-[10px] font-black rounded-full px-1 shadow-sm border-2 border-wa-sidebar animate-pulse z-10`}>
        {alert}
      </div>
    )}
  </button>
);

export default App;
