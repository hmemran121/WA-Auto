import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search, Download, Clock, CheckCircle2, Smartphone,
  Calendar, MessageSquare, ShieldCheck, History, FileText,
  User, MapPin, Trash2, Filter, ChevronLeft, ChevronRight,
  RefreshCcw, XCircle, AlertCircle, CheckSquare, Square, MoreVertical,
  RotateCcw, X, Info, Tag, Activity, ArrowRight, CornerDownRight
} from 'lucide-react';
import { MessageLog } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import PremiumSelect from './common/PremiumSelect';
import PremiumDateTimePicker from './common/PremiumDateTimePicker';

const containerVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      staggerChildren: 0.05
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -10 },
  visible: { opacity: 1, x: 0 }
};

const HistoryView: React.FC = () => {
  // Data State
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [liveSync, setLiveSync] = useState(true);

  // Filter State
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [mediaType, setMediaType] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [showDatePickerFrom, setShowDatePickerFrom] = useState(false);
  const [showDatePickerTo, setShowDatePickerTo] = useState(false);

  // Meta Data for Filters
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<any[]>([]);

  // Selection State
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBulkDeleting, setIsBulkDeleting] = useState(false);

  // Journal Sidebar State
  const [selectedLogForSidebar, setSelectedLogForSidebar] = useState<MessageLog | null>(null);
  const [journalData, setJournalData] = useState<{ contact: any, history: any[] } | null>(null);
  const [loadingJournal, setLoadingJournal] = useState(false);
  const timelineEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        paginated: 'true',
        page: page.toString(),
        limit: limit.toString(),
        search,
        status,
        dateFrom,
        dateTo,
        campaignId,
        templateId,
        mediaType
      });

      const response = await fetch(`http://localhost:3001/messages?${params.toString()}`);
      const result = await response.json();

      const mappedLogs = result.data.map((m: any) => ({
        id: m.id.toString(),
        whatsappId: m.whatsapp_id || m.whatsappId,
        contactId: '0',
        contactName: m.contactName || m.number,
        phone: m.number,
        content: m.text || m.content,
        timestamp: m.timestamp,
        status: m.status as any,
        type: m.type as any,
        mediaPath: m.media_path || m.mediaPath,
        mediaType: m.media_type || m.mediaType,
        reaction: m.reaction,
        quotedMsg: m.quoted_msg_body || m.quotedMsg,
        metadata: m.metadata
      }));

      setLogs(mappedLogs);
      setTotal(result.total);
    } catch (err) {
      console.error('Fetch logs error:', err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, status, dateFrom, dateTo, campaignId, templateId, mediaType]);

  const fetchMetaData = useCallback(async () => {
    try {
      // Fetch Campaigns
      const campsRes = await fetch('http://localhost:3001/api/campaigns/scheduled?all=true');
      const campsData = await campsRes.json();
      if (campsData.success) {
        setCampaigns(campsData.campaigns);
      }

      // Fetch Templates
      const tempsRes = await fetch('http://localhost:3001/api/templates');
      const tempsData = await tempsRes.json();
      setTemplates(tempsData);
      setFilteredTemplates(tempsData); // Initially show all
    } catch (err) {
      console.error('Meta data fetch error:', err);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    fetchMetaData();
  }, [fetchMetaData]);

  // Ultra-Hybrid Logic: Filter templates based on campaign
  useEffect(() => {
    if (campaignId) {
      const selectedCamp = campaigns.find(c => c.id.toString() === campaignId);
      if (selectedCamp && selectedCamp.template_id) {
        const linkedTemplate = templates.filter(t => t.id.toString() === selectedCamp.template_id.toString());
        setFilteredTemplates(linkedTemplate);
        // If the current templateId is not the linked one, reset it
        if (templateId && !linkedTemplate.find(t => t.id.toString() === templateId)) {
          setTemplateId('');
        }
      } else {
        setFilteredTemplates([]); // No template linked to this campaign
        setTemplateId('');
      }
    } else {
      setFilteredTemplates(templates); // Show all if no campaign selected
    }
  }, [campaignId, campaigns, templates]);

  const fetchJournal = async (phone: string) => {
    setLoadingJournal(true);
    try {
      const response = await fetch(`http://localhost:3001/api/contacts/history-by-phone/${phone}`);
      const data = await response.json();
      setJournalData(data);
    } catch (err) {
      console.error('Failed to fetch journal data:', err);
    } finally {
      setLoadingJournal(false);
    }
  };

  useEffect(() => {
    if (selectedLogForSidebar) {
      fetchJournal(selectedLogForSidebar.phone);
    } else {
      setJournalData(null);
    }
  }, [selectedLogForSidebar]);


  const handleOpenChat = (phone: string) => {
    // Use the global setters from App.tsx
    if ((window as any).setActiveTab && (window as any).setSelectedChat) {
      (window as any).setSelectedChat(phone);
      (window as any).setActiveTab('messages');
    }
  };

  // Socket Integration for Live Sync
  useEffect(() => {
    if (!liveSync) return;

    const socket = (window as any).socket; // Assuming socket is attached to window in App.tsx or similar
    if (!socket) return;

    const handleNewMessage = (newMsg: any) => {
      // Only prepend if we are on the first page and it matches search/filters (simplified: refetch if on page 1)
      if (page === 1) {
        fetchLogs();
      }
    };

    const handleStatusUpdate = (update: any) => {
      setLogs(prev => prev.map(log =>
        log.whatsappId === update.whatsapp_id ? { ...log, status: update.status } : log
      ));
    };

    const handleMessagesDeleted = () => {
      fetchLogs();
    };

    const handleMetaUpdate = () => {
      fetchMetaData();
    };

    socket.on('new_message', handleNewMessage);
    socket.on('message-sent', handleNewMessage);
    socket.on('message_status_update', handleStatusUpdate);
    socket.on('messages_deleted', handleMessagesDeleted);
    socket.on('templates_updated', handleMetaUpdate);
    socket.on('campaigns_updated', handleMetaUpdate);
    socket.on('scheduled_campaigns_changed', handleMetaUpdate);

    return () => {
      socket.off('new_message', handleNewMessage);
      socket.off('message-sent', handleNewMessage);
      socket.off('message_status_update', handleStatusUpdate);
      socket.off('messages_deleted', handleMessagesDeleted);
      socket.off('templates_updated', handleMetaUpdate);
      socket.off('campaigns_updated', handleMetaUpdate);
      socket.off('scheduled_campaigns_changed', handleMetaUpdate);
    };
  }, [liveSync, page, fetchLogs]);

  // Handle Search Debounce (Simple)
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1); // Reset to first page on search
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const handleDeleteMessage = async (msg: MessageLog) => {
    if (!msg.id) return;
    if (!window.confirm('Are you sure you want to delete this specific log?')) return;

    try {
      const response = await fetch(`http://localhost:3001/api/messages/${msg.id}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (data.success) {
        fetchLogs();
      } else {
        alert(data.error || 'Failed to delete message');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Failed to delete message');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} logs?`)) return;

    setIsBulkDeleting(true);
    try {
      const response = await fetch(`http://localhost:3001/api/messages/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds: selectedIds })
      });
      const data = await response.json();
      if (data.success) {
        setSelectedIds([]);
        fetchLogs();
      } else {
        alert('Bulk delete failed');
      }
    } catch (err) {
      console.error('Bulk delete error:', err);
    } finally {
      setIsBulkDeleting(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === logs.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(logs.map(l => l.id));
    }
  };

  const toggleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const downloadCSV = () => {
    const headers = ['Recipient', 'Phone', 'Message', 'Timestamp', 'Status', 'Media Type'];
    const rows = logs.map(l => [
      l.contactName,
      l.phone,
      `"${l.content?.replace(/"/g, '""') || ''}"`,
      new Date(l.timestamp).toLocaleString(),
      l.status,
      l.mediaType || 'text'
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `message_history_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6 max-w-[1600px] mx-auto pb-24"
    >
      {/* Header Panel */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-wa-teal/10 rounded-2xl text-wa-teal">
              <History size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-black text-gray-800">Message Memory</h2>
              <p className="text-gray-500 text-sm font-medium">Managing {total} total records with high-fidelity filtering</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          <button
            onClick={() => setLiveSync(!liveSync)}
            className={`flex items-center gap-2 px-5 py-3 rounded-2xl font-bold text-xs transition-all border ${liveSync
              ? 'bg-emerald-50 text-emerald-600 border-emerald-100 shadow-sm'
              : 'bg-gray-50 text-gray-400 border-gray-100'
              }`}
          >
            <RefreshCcw size={16} className={liveSync ? 'animate-spin-slow' : ''} />
            {liveSync ? 'Live Sync Active' : 'Live Sync Paused'}
          </button>

          <button
            onClick={downloadCSV}
            className="flex-1 lg:flex-none bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-2xl font-black flex items-center justify-center gap-3 shadow-lg transition-all text-xs uppercase tracking-widest"
          >
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      {/* Control & Filter Logic */}
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Search & Main Filter Trigger */}
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-wa-teal transition-colors" size={20} />
            <input
              type="text"
              placeholder="Search recipient, number or message..."
              className="w-full bg-white border-2 border-gray-100/50 focus:border-wa-teal rounded-2xl py-4 pl-14 pr-6 font-bold text-sm outline-none shadow-sm transition-all placeholder:text-gray-300"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`px-6 rounded-2xl flex items-center gap-3 font-black text-xs uppercase tracking-widest transition-all ${isFilterOpen || status || dateFrom || dateTo || mediaType
              ? 'bg-wa-teal text-white shadow-wa-teal/20'
              : 'bg-white text-gray-800 border-2 border-gray-100 shadow-sm hover:border-wa-teal'
              }`}
          >
            <Filter size={18} /> Filters
            {liveSync && (
              <span className="flex h-2 w-2 relative ml-1">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
          </button>

          <button
            onClick={() => {
              setSearch('');
              setStatus('');
              setDateFrom('');
              setDateTo('');
              setMediaType('');
              setCampaignId('');
              setTemplateId('');
              setPage(1);
            }}
            title="Reset Filters"
            className="p-4 bg-white border-2 border-gray-100 rounded-2xl text-gray-400 hover:text-red-500 hover:border-red-100 transition-all shadow-sm"
          >
            <RotateCcw size={20} />
          </button>
        </div>
      </div>

      {/* Advanced Filter Panel */}
      <AnimatePresence mode="wait">
        {isFilterOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="relative z-50"
          >
            <div className="bg-white border-2 border-gray-50 rounded-[2.5rem] p-8 shadow-xl mt-4 space-y-8 overflow-visible">
              {/* Ultra-Hybrid Filter Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-30">
                <PremiumSelect
                  label="Campaign (Ultra)"
                  icon={ShieldCheck}
                  className="z-[40]"
                  options={[
                    { value: '', label: 'All Campaigns', description: 'Show all activity' },
                    ...campaigns.map(c => ({
                      value: c.id.toString(),
                      label: c.name,
                      description: `Campaign ID: ${c.id}`
                    }))
                  ]}
                  value={campaignId}
                  onChange={(val) => {
                    setCampaignId(val);
                    setPage(1);
                  }}
                  searchable={true}
                  variant="emerald"
                />

                <PremiumSelect
                  label="Template (Hybrid)"
                  icon={FileText}
                  className="z-[30]"
                  options={[
                    { value: '', label: 'All Templates', description: 'Filter by any template' },
                    ...(filteredTemplates || []).map(t => ({
                      value: t.id.toString(),
                      label: t.title,
                      description: t.category
                    }))
                  ]}
                  value={templateId}
                  onChange={(val) => {
                    setTemplateId(val);
                    setPage(1);
                  }}
                  searchable={true}
                  variant="blue"
                />

                <PremiumSelect
                  label="Message Status"
                  icon={CheckCircle2}
                  className="z-[20]"
                  options={[
                    { value: '', label: 'All Statuses' },
                    { value: 'sent', label: 'Sent' },
                    { value: 'delivered', label: 'Delivered' },
                    { value: 'read', label: 'Read' },
                    { value: 'failed', label: 'Failed' },
                    { value: 'received', label: 'Received' },
                    { value: 'replied', label: 'Replied' }
                  ]}
                  value={status}
                  onChange={(val) => {
                    setStatus(val);
                    setPage(1);
                  }}
                  searchable={false}
                  variant="indigo"
                />

                <PremiumSelect
                  label="Media Type"
                  icon={Smartphone}
                  className="z-[10]"
                  options={[
                    { value: '', label: 'All Media' },
                    { value: 'text', label: 'Plain Text' },
                    { value: 'image', label: 'Image' },
                    { value: 'video', label: 'Video' },
                    { value: 'audio', label: 'Audio' },
                    { value: 'document', label: 'Document' },
                    { value: 'vcard', label: 'VCard' },
                    { value: 'location', label: 'Location' }
                  ]}
                  value={mediaType}
                  onChange={(val) => {
                    setMediaType(val);
                    setPage(1);
                  }}
                  searchable={false}
                  variant="purple"
                />
              </div>

              {/* Date Range Row */}
              <div className="pt-8 border-t border-gray-100/60 grid grid-cols-1 md:grid-cols-2 gap-8 relative z-20">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Date Range: From</label>
                  <button
                    onClick={() => setShowDatePickerFrom(true)}
                    className="w-full flex items-center justify-between p-5 bg-gray-50/50 hover:bg-white rounded-[1.5rem] border border-gray-100 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-500/5 transition-all group relative overflow-hidden"
                  >
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-400 group-hover:text-emerald-500 transition-colors">
                        <Calendar size={18} />
                      </div>
                      <div className="text-left">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Start Point</p>
                        <p className="font-bold text-sm text-gray-700">
                          {dateFrom ? new Date(dateFrom).toLocaleDateString() : 'Select Start Date'}
                        </p>
                      </div>
                    </div>
                    {dateFrom && (
                      <div
                        className="p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all relative z-20"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDateFrom('');
                          setPage(1);
                        }}
                      >
                        <XCircle size={16} />
                      </div>
                    )}
                  </button>
                </div>

                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Date Range: To</label>
                  <button
                    onClick={() => setShowDatePickerTo(true)}
                    className="w-full flex items-center justify-between p-5 bg-gray-50/50 hover:bg-white rounded-[1.5rem] border border-gray-100 hover:border-wa-teal/30 hover:shadow-lg hover:shadow-wa-teal/5 transition-all group relative overflow-hidden"
                  >
                    <div className="flex items-center gap-4 relative z-10">
                      <div className="w-10 h-10 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-400 group-hover:text-wa-teal transition-colors">
                        <Calendar size={18} />
                      </div>
                      <div className="text-left">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">End Point</p>
                        <p className="font-bold text-sm text-gray-700">
                          {dateTo ? new Date(dateTo).toLocaleDateString() : 'Select End Date'}
                        </p>
                      </div>
                    </div>
                    {dateTo && (
                      <div
                        className="p-2 bg-rose-50 text-rose-500 rounded-lg hover:bg-rose-500 hover:text-white transition-all relative z-20"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDateTo('');
                          setPage(1);
                        }}
                      >
                        <XCircle size={16} />
                      </div>
                    )}
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {showDatePickerFrom && (
                  <PremiumDateTimePicker
                    mode="date"
                    value={dateFrom}
                    onChange={(val) => {
                      setDateFrom(val);
                      setPage(1);
                    }}
                    onClose={() => setShowDatePickerFrom(false)}
                    label="Strategic Start Date"
                  />
                )}
                {showDatePickerTo && (
                  <PremiumDateTimePicker
                    mode="date"
                    value={dateTo}
                    onChange={(val) => {
                      setDateTo(val);
                      setPage(1);
                    }}
                    onClose={() => setShowDatePickerTo(false)}
                    label="Strategic End Date"
                  />
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Action Header */}
      <AnimatePresence>
        {selectedIds.length > 0 && (
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -20, opacity: 0 }}
            className="bg-red-50/50 border-2 border-red-100 rounded-2xl p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                <AlertCircle size={20} />
              </div>
              <p className="text-red-900 font-black text-sm">{selectedIds.length} logs selected for bulk action</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedIds([])}
                className="text-gray-500 font-bold text-xs hover:text-gray-800 transition-colors"
              >
                Clear Selection
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="bg-red-600 hover:bg-red-700 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-200 disabled:opacity-50 flex items-center gap-2"
              >
                {isBulkDeleting ? <RefreshCcw size={14} className="animate-spin" /> : <Trash2 size={16} />}
                Delete Selected
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="glass-card bg-white/80 backdrop-blur-xl rounded-[2.5rem] shadow-2xl border border-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/30 text-left">
                <th className="px-8 py-6 w-16">
                  <button
                    onClick={toggleSelectAll}
                    className="p-2 hover:bg-white rounded-lg transition-all text-gray-400 hover:text-wa-teal"
                  >
                    {selectedIds.length === logs.length && logs.length > 0 ? <CheckSquare size={20} className="text-wa-teal" /> : <Square size={20} />}
                  </button>
                </th>
                <th className="px-4 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Recipient</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Message Memory</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Temporal Log</th>
                <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Verification</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 italic font-medium">
              <AnimatePresence mode="popLayout">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-32">
                      <div className="flex flex-col items-center gap-4">
                        <div className="w-12 h-12 border-4 border-wa-teal/20 border-t-wa-teal rounded-full animate-spin" />
                        <p className="text-wa-teal font-black animate-pulse">Syncing Memory...</p>
                      </div>
                    </td>
                  </tr>
                ) : logs.length === 0 ? (
                  <motion.tr
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <td colSpan={5} className="px-8 py-32 text-center">
                      <div className="flex flex-col items-center gap-6 group">
                        <div className="p-8 bg-gray-50 rounded-[2.5rem] text-gray-200 group-hover:scale-110 group-hover:text-gray-300 transition-all duration-700">
                          <XCircle size={64} strokeWidth={1.5} />
                        </div>
                        <div className="space-y-1">
                          <p className="text-gray-800 font-black text-lg">No records matched your search</p>
                          <p className="text-gray-400 text-sm">Try adjusting your filters or search keywords</p>
                        </div>
                      </div>
                    </td>
                  </motion.tr>
                ) : (
                  logs.map((log) => (
                    <motion.tr
                      key={log.id}
                      variants={itemVariants}
                      layout
                      initial="hidden"
                      animate="visible"
                      exit={{ opacity: 0, x: 20 }}
                      onClick={() => setSelectedLogForSidebar(log)}
                      className={`transition-all group cursor-pointer ${selectedIds.includes(log.id) ? 'bg-wa-teal/[0.03]' : 'hover:bg-gray-50/50'} ${selectedLogForSidebar?.id === log.id ? 'bg-wa-teal/5' : ''}`}
                    >
                      <td className="px-8 py-6">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(log.id);
                          }}
                          className={`p-2 rounded-lg transition-all ${selectedIds.includes(log.id) ? 'text-wa-teal' : 'text-gray-200 group-hover:text-gray-300'}`}
                        >
                          {selectedIds.includes(log.id) ? <CheckSquare size={18} /> : <Square size={18} />}
                        </button>
                      </td>

                      <td className="px-4 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center text-gray-400 group-hover:text-wa-teal group-hover:scale-110 transition-all duration-500 shadow-sm">
                            <Smartphone size={20} />
                          </div>
                          <div className="min-w-[120px]">
                            <p className="text-sm font-black text-gray-800 leading-none mb-1.5">{log.contactName || 'Anonymous'}</p>
                            <p className="text-[10px] text-gray-400 font-bold tracking-widest">{log.phone}</p>
                          </div>
                        </div>
                      </td>

                      <td className="px-8 py-6">
                        <div className="max-w-md">
                          {log.mediaType === 'vcard' ? (() => {
                            const meta = log.metadata ? (typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata) : {};
                            return (
                              <div className="flex items-center gap-3 text-wa-teal font-black text-xs bg-wa-teal/5 p-3 rounded-2xl border border-wa-teal/10 shadow-sm">
                                <User size={16} /> Contact Card: {meta.name || 'Shared'}
                              </div>
                            );
                          })() : log.mediaType === 'location' ? (() => {
                            const meta = log.metadata ? (typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata) : {};
                            return (
                              <div className="flex items-center gap-3 text-blue-600 font-black text-xs bg-blue-50 p-3 rounded-2xl border border-blue-100 shadow-sm">
                                <MapPin size={16} /> Location: {(meta.name && meta.name !== 'Location') ? meta.name : `${meta.lat}, ${meta.lng}`}
                              </div>
                            );
                          })() : (
                            <p className="text-sm text-gray-600 line-clamp-2 leading-relaxed font-medium">
                              {log.content || <span className="text-gray-300 italic">No text content</span>}
                            </p>
                          )}
                        </div>
                      </td>

                      <td className="px-8 py-6">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2 text-xs font-black text-gray-700">
                            <Calendar size={13} className="text-wa-teal" />
                            {formatDate(log.timestamp)}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase tracking-[0.15em]">
                            <Clock size={11} className="text-gray-300" />
                            {formatTime(log.timestamp)}
                          </div>
                        </div>
                      </td>

                      <td className="px-8 py-6 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteMessage(log);
                            }}
                            className="p-2.5 bg-white hover:bg-red-50 text-gray-300 hover:text-red-500 rounded-xl transition-all opacity-0 group-hover:opacity-100 shadow-sm border border-gray-100 hover:border-red-100"
                            title="Delete Record"
                          >
                            <Trash2 size={16} />
                          </button>

                          <div className={`flex items-center gap-3 px-5 py-2.5 rounded-full border-2 transition-all ${log.status === 'read' ? 'bg-emerald-50 text-emerald-600 border-emerald-100/50' :
                            log.status === 'error' || log.status?.includes('error') ? 'bg-rose-50 text-rose-600 border-rose-100/50' :
                              'bg-gray-50 text-gray-500 border-gray-100/50'
                            }`}>
                            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
                              {log.status === 'read' ? 'Read' :
                                log.status === 'delivered' ? 'Dlvrd' :
                                  log.status === 'sent' ? 'Sent' :
                                    log.status === 'received' ? 'Recvd' :
                                      log.status?.includes('error') ? 'Fail' : log.status}
                            </span>
                            <div className="flex items-center">
                              {log.status === 'read' ? <CheckCircle2 size={14} className="text-[#34B7F1] fill-[#34B7F1]/10" /> :
                                log.status === 'delivered' ? <CheckCircle2 size={14} className="text-emerald-500" /> :
                                  log.status?.includes('error') ? <AlertCircle size={14} className="text-rose-500" /> :
                                    <ShieldCheck size={14} />}
                            </div>
                          </div>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                )}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {/* Dynamic Pagination Overlay */}
        {!loading && total > 0 && (
          <div className="bg-gray-50/50 p-6 flex flex-col md:flex-row items-center justify-between gap-6 border-t border-gray-100">
            <div className="flex items-center gap-4">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                Displaying {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} of {total} records
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
                className="p-3 bg-white border-2 border-gray-100 rounded-2xl text-gray-800 disabled:opacity-30 hover:border-wa-teal transition-all shadow-sm"
              >
                <ChevronLeft size={20} />
              </button>
              <div className="flex items-center gap-1 mx-2">
                {[...Array(totalPages)].map((_, i) => {
                  const p = i + 1;
                  // Only show current, first, last and +/- 2
                  if (p === 1 || p === totalPages || (p >= page - 2 && p <= page + 2)) {
                    return (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`w-10 h-10 rounded-xl font-bold text-xs transition-all ${page === p ? 'bg-wa-teal text-white shadow-lg shadow-wa-teal/20' : 'text-gray-400 hover:text-wa-teal hover:bg-wa-teal/5'}`}
                      >
                        {p}
                      </button>
                    );
                  }
                  if (p === page - 3 || p === page + 3) return <span key={p} className="text-gray-300">...</span>;
                  return null;
                })}
              </div>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(page + 1)}
                className="p-3 bg-white border-2 border-gray-100 rounded-2xl text-gray-800 disabled:opacity-30 hover:border-wa-teal transition-all shadow-sm"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Journal Sidebar Component */}
      <AnimatePresence>
        {selectedLogForSidebar && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedLogForSidebar(null)}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-xl h-full bg-white shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Sidebar Header */}
              <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50/50 to-white">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-wa-teal/10 flex items-center justify-center text-wa-teal shadow-inner">
                    <History size={24} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-gray-800">Contact Journal</h3>
                    <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">Temporal Metadata Analysis</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleOpenChat(selectedLogForSidebar.phone)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-wa-teal text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-wa-teal/20 hover:scale-105 transition-all"
                  >
                    <MessageSquare size={14} /> Open Chat
                  </button>
                  <button
                    onClick={() => setSelectedLogForSidebar(null)}
                    className="p-3 hover:bg-gray-100 rounded-2xl text-gray-400 hover:text-gray-800 transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              {/* Sidebar Content */}
              <div className="flex-1 overflow-y-auto p-8 space-y-8 custom-scrollbar">
                {/* Contact Quick Info */}
                <div className="bg-gray-50/50 rounded-[2rem] p-6 border border-gray-100 space-y-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 rounded-[1.5rem] bg-white shadow-sm flex items-center justify-center text-wa-teal text-2xl font-black border border-gray-100">
                        {selectedLogForSidebar.contactName?.charAt(0) || 'A'}
                      </div>
                      <div>
                        <h4 className="text-lg font-black text-gray-800 leading-none mb-1">{selectedLogForSidebar.contactName || 'Anonymous'}</h4>
                        <p className="text-sm font-bold text-gray-400 flex items-center gap-1.5">
                          <Smartphone size={14} className="text-wa-teal" /> {selectedLogForSidebar.phone}
                        </p>
                      </div>
                    </div>
                    {journalData?.contact?.tags && (
                      <div className="flex flex-wrap gap-2 justify-end max-w-[200px]">
                        {(() => {
                          try {
                            const tags = JSON.parse(journalData.contact.tags || '[]');
                            return tags.map((tag: string, idx: number) => (
                              <span key={idx} className="px-3 py-1 bg-wa-teal/10 text-wa-teal text-[9px] font-black uppercase tracking-widest rounded-full border border-wa-teal/20">
                                {tag}
                              </span>
                            ));
                          } catch (e) { return null; }
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-3 text-gray-400 mb-2">
                        <Activity size={16} className="text-emerald-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Enagement Level</span>
                      </div>
                      <p className="text-lg font-black text-gray-800">{journalData?.contact?.engagement_score || 0}%</p>
                    </div>
                    <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                      <div className="flex items-center gap-3 text-gray-400 mb-2">
                        <Calendar size={16} className="text-indigo-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Last Interaction</span>
                      </div>
                      <p className="text-lg font-black text-gray-800">
                        {selectedLogForSidebar.timestamp ? new Date(selectedLogForSidebar.timestamp).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Message Details Section */}
                <div className="space-y-4">
                  <h4 className="flex items-center gap-2 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] ml-2">
                    <Info size={14} className="text-wa-teal" /> Incident Details
                  </h4>
                  <div className="bg-white border-2 border-gray-100 rounded-[2rem] p-6 space-y-6 shadow-sm">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest block">Core Content</label>
                      <div className="p-5 bg-gray-50 rounded-2xl text-gray-700 text-sm font-medium leading-relaxed italic border border-gray-100">
                        {selectedLogForSidebar.content}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-50">
                      <div>
                        <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest block mb-2">Media Type</label>
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          <FileText size={16} className="text-purple-500" />
                          {selectedLogForSidebar.mediaType || 'Text Only'}
                        </div>
                      </div>
                      <div>
                        <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest block mb-2">Status</label>
                        <div className="flex items-center gap-2 text-sm font-bold text-gray-700">
                          {selectedLogForSidebar.status === 'read' ? <CheckCircle2 size={16} className="text-[#34B7F1]" /> : <Clock size={16} className="text-gray-400" />}
                          <span className="capitalize">{selectedLogForSidebar.status}</span>
                        </div>
                      </div>
                    </div>

                    {selectedLogForSidebar.whatsappId && (
                      <div className="pt-4 border-t border-gray-50">
                        <label className="text-[9px] font-black text-gray-300 uppercase tracking-widest block mb-2">External Reference ID</label>
                        <p className="text-[10px] font-mono text-gray-400 break-all bg-gray-50 p-3 rounded-xl border border-gray-100">
                          {selectedLogForSidebar.whatsappId}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Conversation Timeline */}
                <div className="space-y-6 pb-12">
                  <div className="flex items-center justify-between ml-2">
                    <h4 className="flex items-center gap-2 text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">
                      <MessageSquare size={14} className="text-wa-teal" /> Timeline History
                    </h4>
                    {loadingJournal && <RefreshCcw size={14} className="animate-spin text-wa-teal" />}
                  </div>

                  <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-gradient-to-b before:from-wa-teal before:via-gray-100 before:to-transparent">
                    {loadingJournal ? (
                      <div className="py-12 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-wa-teal/20 border-t-wa-teal rounded-full animate-spin" />
                        <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Rewinding Time...</p>
                      </div>
                    ) : !journalData?.history || journalData.history.length === 0 ? (
                      <div className="p-8 bg-gray-50 rounded-2xl text-center">
                        <p className="text-sm font-bold text-gray-400 italic">No historical data available</p>
                      </div>
                    ) : (
                      journalData.history.map((msg: any, idx: number) => (
                        <div key={idx} className="relative group">
                          <div className={`absolute -left-[30px] top-1 w-3 h-3 rounded-full border-2 border-white shadow-sm z-10 transition-transform group-hover:scale-125 ${msg.type === 'sent' ? 'bg-wa-teal' : 'bg-gray-400'}`} />
                          <div className={`p-5 rounded-[1.5rem] border shadow-sm transition-all group-hover:shadow-md ${msg.type === 'sent' ? 'bg-white border-wa-teal/10 hover:border-wa-teal/30' : 'bg-gray-50 border-gray-200/50 hover:border-gray-300'}`}>
                            <div className="flex justify-between items-start mb-2">
                              <span className={`text-[9px] font-black uppercase tracking-widest ${msg.type === 'sent' ? 'text-wa-teal' : 'text-gray-400'}`}>
                                {msg.type === 'sent' ? 'Dispatched' : 'Received'}
                              </span>
                              <span className="text-[9px] font-bold text-gray-400">
                                {new Date(msg.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-sm text-gray-700 font-medium leading-relaxed">
                              {msg.text || msg.content}
                            </p>
                            {msg.status && msg.type === 'sent' && (
                              <div className="flex items-center justify-end gap-1 mt-2">
                                {msg.status === 'read' ? <CheckCircle2 size={12} className="text-[#34B7F1]" /> : <CheckCircle2 size={12} className="text-gray-300" />}
                                <span className="text-[8px] font-black uppercase text-gray-300 tracking-tighter">{msg.status}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar Footer */}
              <div className="p-8 border-t border-gray-100 bg-gray-50/30">
                <button
                  onClick={() => setSelectedLogForSidebar(null)}
                  className="w-full py-4 bg-gray-900 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3"
                >
                  Close Archive
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default HistoryView;
