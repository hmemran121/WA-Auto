import React, { useState, useEffect } from 'react';
import { Plus, Search, Trash2, Edit2, X, UserPlus, Users, Phone, ShieldCheck, MoreVertical, Upload, FileText, CheckCircle2, ChevronRight, Filter, Zap, GripVertical, UserMinus, AlertTriangle, LogOut } from 'lucide-react';
import { Contact, Group } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import * as XLSX from 'xlsx';

interface ContactsViewProps {
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  groups: Group[];
  setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
}

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



const ContactsView: React.FC<ContactsViewProps> = ({ contacts, setContacts, groups, setGroups }) => {
  // Main Utility State
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newContact, setNewContact] = useState<Partial<Contact>>({ name: '', phone: '', email: '', address: '', city: '', companyName: '', lastPurchase: '' });
  const [importGroupId, setImportGroupId] = useState<string>('');

  // Selection & Sorting State
  const [selectedContacts, setSelectedContacts] = useState<string[]>([]);
  const [isFullDatasetSelected, setIsFullDatasetSelected] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'phone'; direction: 'asc' | 'desc' } | null>(null);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15; // Increased for better visibility on larger table height

  // Import Wizard State
  const [isImporting, setIsImporting] = useState(false);
  const [importStep, setImportStep] = useState(1);
  const [importMethod, setImportMethod] = useState<'text' | 'file'>('text');
  const [manualList, setManualList] = useState('');

  // Group Management State
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [showManageGroupModal, setShowManageGroupModal] = useState(false);
  const [managingGroupId, setManagingGroupId] = useState<string | null>(null);
  const [selectedContactsForGroup, setSelectedContactsForGroup] = useState<string[]>([]);
  const [groupManageSearch, setGroupManageSearch] = useState('');

  // Duplicates State
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [isMerging, setIsMerging] = useState(false);

  const fetchDuplicates = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/contacts/duplicates');
      const data = await response.json();
      setDuplicates(data);
    } catch (err) {
      console.error('Failed to fetch duplicates', err);
    }
  };

  const handleMerge = async (primaryId: string, duplicateIds: string[]) => {
    if (!window.confirm('Are you sure you want to merge these contacts? All other duplicates will be deleted and their data merged into the primary contact.')) return;
    setIsMerging(true);
    try {
      const res = await fetch('http://localhost:3001/api/contacts/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ primaryId, duplicateIds })
      });
      if (res.ok) {
        await fetchDuplicates();
        await loadContacts();
        await fetchContactStats();
        if (!selectedGroup) await fetchAllContacts();
      }
    } catch (err) {
      console.error('Merge failed', err);
    } finally {
      setIsMerging(false);
    }
  };

  useEffect(() => {
    fetchDuplicates();
  }, []);

  // Slide-over Profile State
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [profileData, setProfileData] = useState<any>(null);
  const [isProfileLoading, setIsProfileLoading] = useState(false);

  // Inline Editing State
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Partial<Contact>>({});

  const handleUpdateContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingContact.id) return;
    try {
      const response = await fetch(`http://localhost:3001/customers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingContact)
      });
      if (response.ok) {
        await loadContacts();
        await fetchAllContacts();
        if (String(activeProfileId) === String(editingContact.id)) {
          await fetchContactProfile(String(editingContact.id));
        }
        setShowEditModal(false);
      }
    } catch (err) {
      console.error('Failed to update contact:', err);
    }
  };

  const updateContactName = async (id: string) => {
    if (!editingName.trim()) {
      setEditingContactId(null);
      return;
    }
    try {
      await fetch(`http://localhost:3001/customers`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: editingName })
      });
      await loadContacts();
      await fetchAllContacts();
    } catch (e) {
      console.error('Failed to update name:', e);
    }
    setEditingContactId(null);
  };

  const fetchContactProfile = async (id: string) => {
    setActiveProfileId(id);
    setIsProfileLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/contacts/${id}/history`);
      const data = await response.json();
      setProfileData(data);
    } catch (err) {
      console.error('Failed to fetch profile history:', err);
    } finally {
      setIsProfileLoading(false);
    }
  };

  // Context Menu State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, contactId: string | null }>({ x: 0, y: 0, contactId: null });

  useEffect(() => {
    const handleClick = () => setContextMenu({ x: 0, y: 0, contactId: null });
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  const fetchAllContacts = async () => {
    try {
      const response = await fetch('http://localhost:3001/customers');
      const data = await response.json();
      setAllContacts(data.map((c: any) => ({
        id: c.id.toString(),
        name: c.name,
        phone: c.number,
        status: 'active',
        groupNames: c.groupNames || [],
        tags: (() => {
          if (!c.tags) return [];
          try { return JSON.parse(c.tags); }
          catch { return typeof c.tags === 'string' ? c.tags.split(',').map((t: string) => t.trim()) : []; }
        })(),
        engagementScore: c.engagement_score || 0,
        email: c.email,
        address: c.address,
        city: c.city,
        companyName: c.company_name,
        lastPurchase: c.last_purchase
      })));
    } catch (err) {
      console.error('Failed to fetch all contacts:', err);
    }
  };

  const loadContacts = async () => {
    const url = selectedGroup
      ? `http://localhost:3001/api/groups/${selectedGroup}/contacts`
      : `http://localhost:3001/customers`;
    try {
      const response = await fetch(url);
      const data = await response.json();
      const mapped = data.map((c: any) => ({
        id: c.id.toString(),
        name: c.name,
        phone: c.number,
        status: 'active',
        groupNames: c.groupNames || [],
        tags: (() => {
          if (!c.tags) return [];
          try { return JSON.parse(c.tags); }
          catch { return typeof c.tags === 'string' ? c.tags.split(',').map((t: string) => t.trim()) : []; }
        })(),
        engagementScore: c.engagement_score || 0,
        email: c.email,
        address: c.address,
        city: c.city,
        companyName: c.company_name,
        lastPurchase: c.last_purchase
      }));
      setContacts(mapped);
      // If we are showing all contacts, also update allContacts state
      if (!selectedGroup) setAllContacts(mapped);
    } catch (err) {
      console.error('Failed to fetch filtered contacts:', err);
    }
  };

  useEffect(() => {
    loadContacts();
    if (selectedGroup) fetchAllContacts(); // Keep allContacts fresh if we are in a group view
  }, [selectedGroup, setContacts]);

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const response = await fetch('http://localhost:3001/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newGroupName.trim() })
      });
      if (response.ok) {
        const data = await fetch('http://localhost:3001/api/groups').then(res => res.json());
        setGroups(data.map((g: any) => ({
          id: g.id.toString(),
          name: g.name,
          description: g.description,
          contactCount: g.contactCount || 0
        })));
        setNewGroupName('');
        setIsAddingGroup(false);
      }
    } catch (err) {
      console.error('Failed to add group:', err);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this group?')) return;
    try {
      const response = await fetch(`http://localhost:3001/api/groups/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        setGroups(groups.filter(g => g.id !== id));
        if (selectedGroup === id) setSelectedGroup(null);
      }
    } catch (err) {
      console.error('Failed to delete group:', err);
    }
  };

  // Advanced Filtering State
  const [showFilters, setShowFilters] = useState(false);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [minEngagement, setMinEngagement] = useState<number>(0);

  const availableTags = Array.from(new Set(allContacts.flatMap(c => c.tags || [])));

  const toggleFilterTag = (tag: string) => {
    setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  // Filter contacts based on search, group, and advanced filters
  const filteredContacts = React.useMemo(() => {
    return contacts.filter(contact => {
      const matchesSearch =
        contact.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.phone?.includes(searchTerm);

      const matchesTags = filterTags.length === 0 || filterTags.every(tag => (contact.tags || []).includes(tag));
      const matchesScore = (contact.engagementScore || 0) >= minEngagement;

      return matchesSearch && matchesTags && matchesScore;
    });
  }, [contacts, searchTerm, filterTags, minEngagement]);

  const sortedAndFilteredContacts = [...filteredContacts]
    .sort((a, b) => {
      if (!sortConfig) return 0;
      const { key, direction } = sortConfig;
      if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
      if (a[key] > b[key]) return direction === 'asc' ? 1 : 1;
      return 0;
    });

  const totalPages = Math.ceil(sortedAndFilteredContacts.length / itemsPerPage);
  const paginatedContacts = sortedAndFilteredContacts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  useEffect(() => {
    setCurrentPage(1); // Reset to first page on search or sort change
  }, [searchTerm, sortConfig]);

  const toggleSort = (key: 'name' | 'phone') => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedContacts(paginatedContacts.map(c => c.id));
      // Reset full selection whenever we toggle the header checkbox
      setIsFullDatasetSelected(false);
    } else {
      setSelectedContacts([]);
      setIsFullDatasetSelected(false);
    }
  };

  const handleSelectFullDataset = () => {
    const allFilteredIds = sortedAndFilteredContacts.map(c => c.id);
    setSelectedContacts(allFilteredIds);
    setIsFullDatasetSelected(true);
  };

  const handleSelectContact = (id: string) => {
    setSelectedContacts(prev => {
      const isDeselecting = prev.includes(id);
      if (isDeselecting) {
        setIsFullDatasetSelected(false);
        return prev.filter(cid => cid !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleBulkDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete ${selectedContacts.length} contacts?`)) return;
    try {
      await fetch('http://localhost:3001/api/contacts/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: selectedContacts })
      });
      setSelectedContacts([]);
      // The list will be refreshed by the sync_status event processed in App.tsx
    } catch (err) {
      console.error('Bulk delete failed:', err);
    }
  };

  const handleBulkAssignGroup = async (groupId: string) => {
    if (!groupId) return;
    try {
      await fetch(`http://localhost:3001/api/groups/${groupId}/contacts/bulk-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: selectedContacts })
      });
      setSelectedContacts([]);
      await loadContacts();
      await fetchAllContacts();
      // Re-fetch groups to update counts
      const groupsRes = await fetch('http://localhost:3001/api/groups');
      const groupsData = await groupsRes.json();
      setGroups(groupsData.map((g: any) => ({
        id: g.id.toString(),
        name: g.name,
        description: g.description,
        contactCount: g.contactCount
      })));
    } catch (err) {
      console.error('Bulk group assignment failed:', err);
    }
  };

  const getAvatarGradient = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `linear-gradient(135deg, hsl(${h}, 70%, 60%), hsl(${(h + 40) % 360}, 70%, 50%))`;
  };

  const handleSyncGroupMembership = async () => {
    if (!managingGroupId) return;
    try {
      const response = await fetch(`http://localhost:3001/api/groups/${managingGroupId}/contacts/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactIds: selectedContactsForGroup })
      });
      if (response.ok) {
        await loadContacts();
        const groupsRes = await fetch('http://localhost:3001/api/groups');
        const groupsData = await groupsRes.json();
        setGroups(groupsData.map((g: any) => ({
          id: g.id.toString(),
          name: g.name,
          description: g.description,
          contactCount: g.contactCount || 0
        })));
        setShowManageGroupModal(false);
      }
    } catch (err) {
      console.error('Failed to sync group membership:', err);
    }
  };

  const openManageGroup = async (groupId: string) => {
    setManagingGroupId(groupId);
    // Ensure we have current contact list
    await fetchAllContacts();

    // Fetch actual members for pre-selection
    const groupRes = await fetch(`http://localhost:3001/api/groups/${groupId}/contacts`);
    const groupMembers: any[] = await groupRes.json();
    setSelectedContactsForGroup(groupMembers.map(m => m.id.toString()));
    setShowManageGroupModal(true);
  };

  const downloadSampleFile = () => {
    const data = [
      ["Name", "Number"],
      ["Rahim Khan", "01712345678"],
      ["Karim Uddin", "01812345679"],
      ["Contact 007", "01912345670"]
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sample Contacts");
    XLSX.writeFile(wb, "Sample_Contacts_Format.xlsx");
  };

  const parseSmartContacts = (text: string) => {
    // Split by comma, semicolon, or newline
    const tokens = text.split(/[,\n;]+/).map(t => t.trim()).filter(t => t);
    const parsed: { name: string; number: string }[] = [];

    const isNumber = (s: string) => /^(\+?[\d\s-]{5,15})$/.test(s.replace(/\s/g, ''));

    for (let i = 0; i < tokens.length; i++) {
      const current = tokens[i];
      const next = tokens[i + 1];

      if (!isNumber(current) && next && isNumber(next)) {
        // Pair Name + Number
        parsed.push({ name: current, number: next });
        i++; // Skip next as it's paired
      } else if (isNumber(current)) {
        // Standalone Number
        parsed.push({ name: `Contact ${current.slice(-4)}`, number: current });
      }
      // If it's a lone name with no number following, we skip it for now
    }
    return parsed;
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      let allContent = '';

      wb.SheetNames.forEach(sheetName => {
        const worksheet = wb.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        allContent += data.map((row: any) => row.join(', ')).join('\n') + '\n';
      });

      setManualList(allContent);
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkImport = async () => {
    const contactsToImport = parseSmartContacts(manualList);

    if (contactsToImport.length === 0) return;

    setIsImporting(true);
    try {
      const response = await fetch('http://localhost:3001/api/contacts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: contactsToImport, groupId: importGroupId })
      });
      if (response.ok) {
        // Refresh contacts
        await loadContacts(); // Force immediate reload
        await fetchAllContacts(); // Keep allContacts fresh
        setSelectedGroup(importGroupId || null);
        setShowImportModal(false);
        setManualList('');
        setImportStep(1);
      }
    } catch (err) {
      console.error('Bulk import failed:', err);
    } finally {
      setIsImporting(false);
    }
  };

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.name || !newContact.phone) return;

    try {
      const response = await fetch('http://localhost:3001/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContact)
      });
      if (response.ok) {
        await loadContacts();
        await fetchAllContacts();
        setNewContact({ name: '', phone: '', email: '', address: '', city: '', companyName: '', lastPurchase: '' });
        setShowModal(false);
      }
    } catch (err) {
      console.error('Failed to add contact:', err);
    }
  };

  const deleteContact = async (id: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/contacts/${id}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await loadContacts();
        await fetchAllContacts();
      }
    } catch (err) {
      console.error('Failed to delete contact:', err);
    }
  };

  // ── Remove from Group State & Handler ────────────────────────────────────────
  const [removeModalContact, setRemoveModalContact] = useState<Contact | null>(null);
  const [isRemovingContact, setIsRemovingContact] = useState(false);

  const handleRemoveFromGroup = async (mode: 'group_only' | 'full_delete') => {
    if (!removeModalContact || !selectedGroup) return;
    setIsRemovingContact(true);
    try {
      const res = await fetch(
        `http://localhost:3001/api/groups/${selectedGroup}/contacts/${removeModalContact.id}?mode=${mode}`,
        { method: 'DELETE' }
      );
      if (res.ok) {
        await loadContacts();
        await fetchAllContacts();
        // Refresh group contact counts in sidebar
        const groupsRes = await fetch('http://localhost:3001/api/groups');
        const groupsData = await groupsRes.json();
        setGroups(groupsData.map((g: any) => ({
          id: g.id.toString(),
          name: g.name,
          description: g.description,
          contactCount: g.contactCount || 0
        })));
      }
    } catch (err) {
      console.error('[ContactsView] Remove from group failed:', err);
    } finally {
      setIsRemovingContact(false);
      setRemoveModalContact(null);
    }
  };

  const [stats, setStats] = useState({ total: 0, active: 0, newThisWeek: 0 });

  const fetchContactStats = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/contacts/stats');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  useEffect(() => {
    fetchContactStats();
  }, [contacts]); // Refresh stats when contacts change

  // ... (keeping existing layout structures)

  return (
    <>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="max-w-[1600px] mx-auto pb-24 px-4"
      >
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left Sidebar - Groups & Segments */}
          <aside className="w-full lg:w-72 space-y-6">
            <div className="glass-card bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-xl border border-white p-6">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest flex items-center gap-2">
                  <Users size={16} className="text-wa-teal" /> Groups
                </h3>
                <button
                  onClick={() => setIsAddingGroup(true)}
                  className="p-2 hover:bg-wa-teal/10 rounded-xl text-wa-teal transition-all active:scale-95"
                >
                  <Plus size={18} />
                </button>
              </div>

              <div className="space-y-1">
                <button
                  onClick={() => setSelectedGroup(null)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all font-bold text-sm ${selectedGroup === null ? 'bg-wa-teal text-white shadow-lg shadow-wa-teal/20' : 'text-gray-600 hover:bg-gray-50'}`}
                >
                  <span className="flex items-center gap-3"><Filter size={16} /> All Contacts</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${selectedGroup === null ? 'bg-white/20' : 'bg-gray-100'}`}>{contacts.length}</span>
                </button>

                {groups.map(group => (
                  <div key={group.id} className="w-full transition-all duration-300 ease-out rounded-2xl border-2 border-transparent">
                    <div className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl font-bold text-sm transition-all duration-300 ease-out cursor-pointer ${selectedGroup === group.id ? 'bg-wa-teal text-white shadow-lg shadow-wa-teal/20 border-transparent' : 'text-gray-600 hover:bg-gray-50/80 hover:scale-[1.01] hover:shadow-sm border-transparent'}`}>
                      <button
                        onClick={() => setSelectedGroup(group.id)}
                        className="flex-1 flex items-center gap-3 truncate text-left"
                      >
                        <Users size={16} /> {group.name}
                      </button>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${selectedGroup === group.id ? 'bg-white/20' : 'bg-gray-100'} font-black`}>
                          {(group as any).contactCount || 0}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openManageGroup(group.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/20 rounded-md transition-all"
                          title="Manage Contacts"
                        >
                          <UserPlus size={14} className={selectedGroup === group.id ? 'text-white' : 'text-wa-teal'} />
                        </button>
                        <Trash2
                          size={14}
                          className={`opacity-0 group-hover:opacity-100 transition-all hover:text-rose-500 ${selectedGroup === group.id ? 'text-white/60' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(group.id);
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {isAddingGroup && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mt-4 p-4 bg-wa-teal/5 rounded-2xl border border-wa-teal/20"
                >
                  <input
                    autoFocus
                    placeholder="Group Name..."
                    className="w-full px-4 py-2 bg-white rounded-xl outline-none text-sm font-bold text-gray-700 border border-wa-teal/10 focus:border-wa-teal/40"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => {
                        setIsAddingGroup(false);
                        setNewGroupName('');
                      }}
                      className="flex-1 py-1.5 text-[10px] font-black uppercase text-gray-400 hover:bg-white rounded-lg transition-all"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleAddGroup}
                      className="flex-2 py-1.5 px-4 bg-wa-teal text-white text-[10px] font-black uppercase rounded-lg shadow-md shadow-wa-teal/10 hover:bg-emerald-600"
                    >
                      Add
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* New Sidebar Bulk Import Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card bg-gradient-to-br from-indigo-600/90 to-purple-700/90 backdrop-blur-xl rounded-[2rem] p-6 text-white border border-white/20 shadow-xl overflow-hidden relative group"
            >
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                    <Upload size={20} className="text-white" />
                  </div>
                  <h4 className="font-black text-sm uppercase tracking-widest leading-none">Bulk Import</h4>
                </div>
                <p className="text-[10px] text-white/70 font-bold mb-5 leading-relaxed">
                  হাজার হাজার কন্টাক্ট এক ক্লিকে ইমপোর্ট করুন। CSV বা Excel ফাইল সাপোর্ট করে।
                </p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setImportStep(1);
                    setShowImportModal(true);
                  }}
                  className="w-full bg-white text-indigo-600 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-gray-50 transition-all border-b-2 border-indigo-100 active:border-b-0"
                >
                  Start Wizard
                </motion.button>
              </div>
              {/* Design Decorations */}
              <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
              <div className="absolute -bottom-10 -left-10 w-20 h-20 bg-indigo-400/20 rounded-full blur-2xl"></div>
            </motion.div>

            {/* Duplicate Resolver Card */}
            {duplicates.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card bg-gradient-to-br from-amber-500/90 to-orange-600/90 backdrop-blur-xl rounded-[2rem] p-6 text-white border border-white/20 shadow-xl overflow-hidden relative group mt-6"
              >
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-xl flex items-center justify-center border border-white/20">
                      <ShieldCheck size={20} className="text-white" />
                    </div>
                    <h4 className="font-black text-sm uppercase tracking-widest leading-none">Duplicates</h4>
                  </div>
                  <p className="text-[10px] text-white/90 font-bold mb-5 leading-relaxed">
                    Found {duplicates.length} duplicate groups. Merge them to clean up your CRM.
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowDuplicateModal(true)}
                    className="w-full bg-white text-orange-600 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-orange-50 transition-all border-b-2 border-orange-200 active:border-b-0"
                  >
                    Resolve Now
                  </motion.button>
                </div>
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
              </motion.div>
            )}
          </aside>

          {/* Main Content Area */}
          <div className="flex-1 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-3xl font-black text-gray-800 flex items-center gap-3">
                  <Users className="text-wa-teal" size={32} />
                  {selectedGroup ? groups.find(g => g.id === selectedGroup)?.name : 'All Contacts'}
                </h2>
                <p className="text-gray-500 mt-1 font-medium italic">
                  {selectedGroup ? 'Managing specialized group segment' : 'Manage all your WhatsApp contacts from here'}
                </p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowModal(true)}
                  className="bg-wa-teal hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-black flex items-center gap-3 shadow-xl shadow-wa-teal/20 transition-all uppercase tracking-widest text-xs"
                >
                  <UserPlus size={18} /> Single Add
                </motion.button>
              </div>
            </div>

            {/* Analytics Widget (Premium CRM Feature) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-md p-6 rounded-[2rem] shadow-xl border border-gray-100 flex items-center justify-between group">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total Audience</p>
                  <h3 className="text-3xl font-black text-gray-800 transition-colors group-hover:text-wa-teal">{stats.total}</h3>
                </div>
                <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                  <Users size={24} />
                </div>
              </motion.div>
              <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-md p-6 rounded-[2rem] shadow-xl border border-gray-100 flex items-center justify-between group">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Highly Active</p>
                  <h3 className="text-3xl font-black text-gray-800 transition-colors group-hover:text-wa-teal">{stats.active}</h3>
                </div>
                <div className="w-14 h-14 bg-emerald-50 text-emerald-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                  <Zap size={24} />
                </div>
              </motion.div>
              <motion.div variants={itemVariants} className="bg-white/80 backdrop-blur-md p-6 rounded-[2rem] shadow-xl border border-gray-100 flex items-center justify-between group">
                <div>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">New This Week</p>
                  <h3 className="text-3xl font-black text-gray-800 transition-colors group-hover:text-wa-teal">+{stats.newThisWeek}</h3>
                </div>
                <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                  <Search size={24} />
                </div>
              </motion.div>
            </div>

            <div className="glass-card bg-white/80 backdrop-blur-xl rounded-3xl shadow-2xl border border-white overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4 relative">
                <div className="relative w-full md:w-80 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Quick search..."
                      className="w-full pl-10 pr-4 py-2 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-xl outline-none transition-all font-bold text-gray-700 text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`p-2 rounded-xl border-2 transition-all flex items-center justify-center ${showFilters || filterTags.length > 0 || minEngagement > 0 ? 'bg-wa-teal border-wa-teal text-white shadow-md' : 'bg-gray-50 border-transparent text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                  >
                    <Filter size={18} />
                  </button>
                </div>

                {/* Advanced Filters Dropdown */}
                <AnimatePresence>
                  {showFilters && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      className="absolute top-full left-6 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 z-[50]"
                    >
                      <div className="mb-4">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Filter by Tags</label>
                        <div className="flex flex-wrap gap-2">
                          {availableTags.length > 0 ? availableTags.map(tag => {
                            const tagStr = String(tag);
                            return (
                              <button
                                key={tagStr}
                                onClick={() => toggleFilterTag(tagStr)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${filterTags.includes(tagStr) ? 'bg-indigo-100 text-indigo-700 border-indigo-200 border' : 'bg-gray-50 text-gray-500 hover:bg-gray-100 border border-transparent'}`}
                              >
                                {tagStr}
                              </button>
                            );
                          }) : (
                            <span className="text-xs text-gray-400 italic font-medium">No tags available yet</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 flex justify-between">
                          <span>Min. Engagement Score</span>
                          <span className="text-wa-teal">{minEngagement}</span>
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={minEngagement}
                          onChange={(e) => setMinEngagement(parseInt(e.target.value))}
                          className="w-full accent-wa-teal"
                        />
                      </div>

                      {(filterTags.length > 0 || minEngagement > 0) && (
                        <button
                          onClick={() => { setFilterTags([]); setMinEngagement(0); }}
                          className="w-full mt-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          Clear Filters
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center gap-4 text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-50 px-4 py-2 rounded-xl">
                  <span>Total: <span className="text-wa-teal text-sm">{sortedAndFilteredContacts.length}</span></span>
                </div>
              </div>

              <div className="overflow-x-auto flex-1 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 320px)' }}>
                {/* Dynamic Selection Banner */}
                <AnimatePresence>
                  {selectedContacts.length > 0 && selectedContacts.length >= paginatedContacts.length && sortedAndFilteredContacts.length > paginatedContacts.length && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="bg-wa-teal/10 border-b border-wa-teal/20 overflow-hidden"
                    >
                      <div className="px-6 py-3 flex items-center justify-center gap-4">
                        <span className="text-xs font-bold text-wa-teal-dark">
                          {isFullDatasetSelected
                            ? `All ${sortedAndFilteredContacts.length} contacts selected.`
                            : `All ${selectedContacts.length} contacts on this page are selected.`}
                        </span>
                        {!isFullDatasetSelected ? (
                          <button
                            onClick={handleSelectFullDataset}
                            className="text-xs font-black uppercase tracking-wider text-wa-teal hover:underline decoration-2 underline-offset-4"
                          >
                            Select all {sortedAndFilteredContacts.length} contacts
                          </button>
                        ) : (
                          <button
                            onClick={() => {
                              setSelectedContacts([]);
                              setIsFullDatasetSelected(false);
                            }}
                            className="text-xs font-black uppercase tracking-wider text-rose-500 hover:underline decoration-2 underline-offset-4"
                          >
                            Clear selection
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <table className="w-full border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
                    <tr className="bg-gray-50/50 text-left border-b border-gray-100">
                      <th className="px-6 py-4 w-12">
                        <div className="flex items-center justify-center">
                          <input
                            type="checkbox"
                            className="w-4 h-4 rounded-md border-2 border-gray-200 text-wa-teal focus:ring-wa-teal transition-all cursor-pointer accent-wa-teal"
                            checked={selectedContacts.length === paginatedContacts.length && paginatedContacts.length > 0}
                            onChange={handleSelectAll}
                          />
                        </div>
                      </th>
                      <th
                        className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] cursor-pointer hover:text-wa-teal transition-colors"
                        onClick={() => toggleSort('name')}
                      >
                        <div className="flex items-center gap-2">
                          Personal Info
                          {sortConfig?.key === 'name' && (
                            <ChevronRight size={12} className={`transform transition-transform ${sortConfig.direction === 'desc' ? 'rotate-90' : '-rotate-90'}`} />
                          )}
                        </div>
                      </th>
                      <th
                        className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] cursor-pointer hover:text-wa-teal transition-colors"
                        onClick={() => toggleSort('phone')}
                      >
                        <div className="flex items-center gap-2">
                          Contact
                          {sortConfig?.key === 'phone' && (
                            <ChevronRight size={12} className={`transform transition-transform ${sortConfig.direction === 'desc' ? 'rotate-90' : '-rotate-90'}`} />
                          )}
                        </div>
                      </th>
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    <AnimatePresence mode="popLayout">
                      {paginatedContacts.length === 0 ? (
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                        >
                          <td colSpan={4} className="px-8 py-20 text-center">
                            <div className="flex flex-col items-center gap-4 group">
                              <div className="p-6 bg-gray-50 rounded-full text-gray-300">
                                <Search size={48} />
                              </div>
                              <p className="text-gray-400 font-bold">No contacts found!</p>
                            </div>
                          </td>
                        </motion.tr>
                      ) : (
                        paginatedContacts.map((contact, index) => {
                          const isSelected = selectedContacts.includes(contact.id);
                          return (
                            <tr
                              key={contact.id}
                              className={`hover:bg-emerald-50/20 transition-all duration-200 group ${isSelected ? 'bg-emerald-50/50' : ''} z-10`}
                            >
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                  <div className="flex items-center justify-center pl-2">
                                    <input
                                      type="checkbox"
                                      className="w-4 h-4 rounded-md border-2 border-gray-200 text-wa-teal focus:ring-wa-teal transition-all cursor-pointer accent-wa-teal"
                                      checked={isSelected}
                                      onChange={(e) => {
                                        e.stopPropagation();
                                        handleSelectContact(contact.id);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4" onClick={() => fetchContactProfile(contact.id)} onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({ x: e.clientX, y: e.clientY, contactId: contact.id });
                              }}>
                                <div className="flex items-center gap-4 text-left">
                                  <div
                                    className="w-10 h-10 rounded-xl text-white flex items-center justify-center font-black text-lg shadow-lg relative overflow-hidden group/avatar"
                                    style={{ background: getAvatarGradient(contact.name) }}
                                  >
                                    {contact.name.charAt(0)}
                                    <div className="absolute inset-0 bg-black/0 group-hover/avatar:bg-black/10 transition-colors" />
                                  </div>
                                  <div className="text-left">
                                    {editingContactId === contact.id ? (
                                      <input
                                        type="text"
                                        autoFocus
                                        className="font-black text-gray-800 text-sm bg-white border-2 border-wa-teal/50 rounded-md px-2 py-0.5 outline-none w-32 shadow-sm"
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        onBlur={() => updateContactName(contact.id)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') updateContactName(contact.id);
                                          if (e.key === 'Escape') setEditingContactId(null);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                    ) : (
                                      <p
                                        onDoubleClick={(e) => {
                                          e.stopPropagation();
                                          setEditingName(contact.name);
                                          setEditingContactId(contact.id);
                                        }}
                                        className="font-black text-gray-800 text-sm group-hover:text-wa-teal transition-colors flex items-center gap-2 leading-none"
                                      >
                                        {contact.name || 'Unknown'}
                                        {isSelected && <CheckCircle2 size={12} className="text-wa-teal" />}
                                      </p>
                                    )}
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {contact.groupNames ? contact.groupNames.split(',').map((gn, idx) => (
                                        <span key={idx} className="text-[8px] font-black bg-indigo-50/50 text-indigo-500 px-1.5 py-0.5 rounded-md uppercase tracking-tighter border border-indigo-100/30">
                                          {gn}
                                        </span>
                                      )) : (
                                        <span className="text-[8px] font-bold text-gray-300 italic">No Group</span>
                                      )}
                                      {contact.tags && contact.tags.map((tag, idx) => (
                                        <span key={'tag-' + idx} className="text-[8px] font-black bg-fuchsia-50/50 text-fuchsia-600 px-1.5 py-0.5 rounded-md uppercase tracking-tighter border border-fuchsia-100/30">
                                          #{tag}
                                        </span>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4" onClick={() => fetchContactProfile(contact.id)} onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({ x: e.clientX, y: e.clientY, contactId: contact.id });
                              }}>
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center gap-2 font-bold text-gray-600 text-xs">
                                    <Phone size={12} className="text-wa-teal/50" />
                                    {contact.phone}
                                  </div>
                                  {contact.engagementScore !== undefined && contact.engagementScore > 0 && (
                                    <div className="flex items-center gap-1 mt-1" title={`Engagement Score: ${contact.engagementScore}`}>
                                      <div className="flex gap-0.5">
                                        {[...Array(5)].map((_, i) => (
                                          <div key={i} className={`w-1 h-3 rounded-full ${i < Math.min(5, Math.ceil(contact.engagementScore! / 20)) ? 'bg-amber-400' : 'bg-gray-200'}`} />
                                        ))}
                                      </div>
                                      <span className="text-[8px] font-black text-amber-500">{contact.engagementScore}</span>
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4" onClick={() => fetchContactProfile(contact.id)} onContextMenu={(e) => {
                                e.preventDefault();
                                setContextMenu({ x: e.clientX, y: e.clientY, contactId: contact.id });
                              }}>
                                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest bg-emerald-100/50 text-wa-teal border border-emerald-200/50">
                                  <ShieldCheck size={10} /> Active
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Pagination Footer */}
              <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  Page <span className="text-wa-teal">{currentPage}</span> of <span className="text-wa-teal">{totalPages || 1}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white border border-transparent hover:border-gray-200 text-gray-500"
                  >
                    Previous
                  </button>
                  <div className="flex items-center gap-1">
                    {[...Array(totalPages)].map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setCurrentPage(i + 1)}
                        className={`w-8 h-8 rounded-xl font-black text-[10px] transition-all ${currentPage === i + 1 ? 'bg-wa-teal text-white shadow-lg shadow-wa-teal/20' : 'text-gray-400 hover:bg-white hover:text-wa-teal'}`}
                      >
                        {i + 1}
                      </button>
                    )).slice(Math.max(0, currentPage - 3), Math.min(totalPages, currentPage + 2))}
                  </div>
                  <button
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                    className="px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white border border-transparent hover:border-gray-200 text-gray-500"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.div >

      <AnimatePresence>
        {selectedContacts.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[150] w-[95%] max-w-xl"
          >
            <div className="bg-gray-900/95 backdrop-blur-3xl px-6 py-4 rounded-[2rem] shadow-2xl border border-white/10 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-wa-teal rounded-xl flex items-center justify-center text-white font-black text-sm shadow-inner shadow-black/10">
                  {selectedContacts.length}
                </div>
                <div>
                  <p className="text-white font-black text-[10px] uppercase tracking-widest leading-none mb-1">Items Selected</p>
                  <button
                    onClick={() => setSelectedContacts([])}
                    className="text-wa-teal hover:text-emerald-400 font-bold text-[8px] uppercase tracking-widest transition-colors leading-none"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Quick Group Assign Dropdown */}
                <div className="relative group/dropdown">
                  <button
                    className="flex items-center gap-2 px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                  >
                    <Users size={14} /> Assign
                  </button>
                  {/* Dropdown Container with Hover Bridge */}
                  <div className="absolute bottom-full right-0 pb-3 opacity-0 translate-y-2 pointer-events-none group-hover/dropdown:opacity-100 group-hover/dropdown:translate-y-0 group-hover/dropdown:pointer-events-auto transition-all duration-300 ease-out z-[200]">
                    <div className="bg-gray-800 rounded-2xl shadow-2xl border border-white/10 py-2 min-w-[180px] overflow-hidden">
                      <p className="px-4 py-2 text-[8px] font-black text-gray-500 uppercase tracking-widest border-b border-white/5 mb-1 flex items-center gap-2">
                        <Users size={10} /> Target Group
                      </p>
                      <div className="max-h-[200px] overflow-y-auto custom-scrollbar">
                        {groups.map(g => (
                          <button
                            key={g.id}
                            onClick={() => handleBulkAssignGroup(g.id)}
                            className="w-full text-left px-5 py-2.5 text-white hover:bg-wa-teal text-[9px] font-black uppercase tracking-widest transition-colors flex items-center justify-between group/item"
                          >
                            {g.name}
                            <Plus size={10} className="opacity-0 group-hover/item:opacity-100 transition-opacity" />
                          </button>
                        ))}
                        {groups.length === 0 && (
                          <p className="px-5 py-3 text-[8px] text-gray-500 italic font-bold">No groups found</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-5 py-2.5 bg-rose-500/10 hover:bg-rose-500 text-rose-500 hover:text-white rounded-xl font-black text-[9px] uppercase tracking-widest transition-all border border-rose-500/20"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Import Wizard Modal */}
      {/* Group Membership Manager Modal */}
      <AnimatePresence>
        {showManageGroupModal && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowManageGroupModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            ></motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-wa-teal/5 to-white">
                <div>
                  <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                    <Users className="text-wa-teal" size={24} />
                    Manage Group: <span className="text-wa-teal">{groups.find(g => g.id === managingGroupId)?.name}</span>
                  </h3>
                  <p className="text-xs text-gray-500 font-bold mt-1 uppercase tracking-widest">Select members from All Contacts</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      setShowManageGroupModal(false);
                      setShowModal(true);
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-wa-teal/10 text-wa-teal rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-wa-teal hover:text-white transition-all"
                  >
                    <Plus size={14} /> Add New
                  </button>
                  <button
                    onClick={() => setShowManageGroupModal(false)}
                    className="p-3 hover:bg-gray-50 rounded-2xl text-gray-400 transition-all"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
                <div className="relative mb-6">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type="text"
                    placeholder="Search all contacts..."
                    className="w-full pl-12 pr-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700 text-sm"
                    value={groupManageSearch}
                    onChange={(e) => setGroupManageSearch(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  {allContacts
                    .filter(c => c.name.toLowerCase().includes(groupManageSearch.toLowerCase()) || c.phone.includes(groupManageSearch))
                    .map(contact => {
                      const isSelected = selectedContactsForGroup.includes(contact.id);
                      return (
                        <div
                          key={contact.id}
                          onClick={() => {
                            if (isSelected) {
                              setSelectedContactsForGroup(prev => prev.filter(id => id !== contact.id));
                            } else {
                              setSelectedContactsForGroup(prev => [...prev, contact.id]);
                            }
                          }}
                          className={`flex items-center justify-between p-4 rounded-2xl border-2 cursor-pointer transition-all ${isSelected ? 'border-wa-teal bg-wa-teal/5' : 'border-gray-50 hover:border-gray-100'}`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-xs ${isSelected ? 'bg-wa-teal' : 'bg-gray-200'}`}>
                              {contact.name.charAt(0)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800 text-sm">{contact.name}</p>
                              <p className="text-[10px] text-gray-400 font-bold">{contact.phone}</p>
                              {contact.groupNames && (
                                <p className="text-[8px] text-indigo-400/60 font-medium uppercase tracking-tighter mt-0.5 leading-none">
                                  Existing: {contact.groupNames.split(',').join(' • ')}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${isSelected ? 'bg-wa-teal border-wa-teal' : 'border-gray-200'}`}>
                            {isSelected && <CheckCircle2 size={14} className="text-white" />}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="p-8 border-t border-gray-100 bg-gray-50 flex gap-4">
                <button
                  onClick={() => setShowManageGroupModal(false)}
                  className="flex-1 py-4 border-2 border-gray-200 rounded-2xl font-black text-gray-400 hover:bg-white transition-all uppercase tracking-widest text-[10px]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSyncGroupMembership}
                  className="flex-2 py-4 bg-wa-teal text-white rounded-2xl font-black shadow-lg shadow-wa-teal/20 hover:bg-emerald-600 transition-all uppercase tracking-widest text-[10px] px-12"
                >
                  Save Changes ({selectedContactsForGroup.length})
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Single Add Modal (Restored) */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            ></motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white"
            >
              <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-wa-teal/5 to-white">
                <h3 className="text-3xl font-black text-gray-800 flex items-center gap-3">
                  <UserPlus className="text-wa-teal" size={32} /> Single Add
                </h3>
                <button onClick={() => setShowModal(false)} className="p-3 hover:bg-gray-50 rounded-2xl text-gray-400">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={addContact} className="p-10 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahim Khan"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={newContact.name}
                      onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Phone Number</label>
                    <input
                      type="text"
                      required
                      placeholder="017xxxxxxxx"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={newContact.phone}
                      onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">City</label>
                    <input
                      type="text"
                      placeholder="e.g. Dhaka"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={newContact.city || ''}
                      onChange={(e) => setNewContact({ ...newContact, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Company</label>
                    <input
                      type="text"
                      placeholder="e.g. Acme Corp"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={newContact.companyName || ''}
                      onChange={(e) => setNewContact({ ...newContact, companyName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="rahim@example.com"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={newContact.email || ''}
                      onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Full Address</label>
                    <input
                      type="text"
                      placeholder="123 Street, Area"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={newContact.address || ''}
                      onChange={(e) => setNewContact({ ...newContact, address: e.target.value })}
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="w-full py-5 bg-wa-teal text-white rounded-2xl font-black shadow-xl shadow-wa-teal/20 hover:bg-emerald-600 transition-all uppercase tracking-widest text-xs mt-4"
                >
                  Create Contact
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isImporting && setShowImportModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            ></motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-white"
            >
              <div className="p-10 border-b border-gray-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                      <Upload size={20} />
                    </div>
                    <h3 className="text-3xl font-black text-gray-800">Bulk Import Wizard</h3>
                  </div>
                  <div className="flex items-center gap-2 mt-3 overflow-hidden">
                    {[1, 2, 3].map(step => (
                      <div key={step} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${importStep >= step ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                          {step}
                        </div>
                        {step < 3 && <div className={`w-8 h-0.5 ${importStep > step ? 'bg-indigo-600' : 'bg-gray-100'}`}></div>}
                      </div>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => !isImporting && setShowImportModal(false)}
                  className="p-3 hover:bg-white rounded-2xl text-gray-400 hover:text-gray-800 transition-all shadow-sm"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="p-10 flex-1 overflow-y-auto custom-scrollbar">
                {importStep === 1 && (
                  <div className="space-y-8">
                    <div className="flex bg-gray-50 p-2 rounded-2xl">
                      <button
                        onClick={() => setImportMethod('text')}
                        className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${importMethod === 'text' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-400'}`}
                      >
                        Smart Paste
                      </button>
                      <button
                        onClick={() => setImportMethod('file')}
                        className={`flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${importMethod === 'file' ? 'bg-white text-indigo-600 shadow-md' : 'text-gray-400'}`}
                      >
                        Upload File
                      </button>
                    </div>

                    {importMethod === 'text' ? (
                      <div className="space-y-4">
                        <div className="p-6 rounded-[2rem] bg-indigo-50/30 border border-indigo-100">
                          <p className="text-xs text-indigo-600 font-bold leading-relaxed">
                            <Zap size={14} className="inline mr-1 mb-1" />
                            <b>Smart Logic:</b> আপনি নাম এবং নাম্বার যেকোনো ভাবে দিতে পারেন (যেমন: <code>Name, Number, Name, Number</code> অথবা শুধু <code>Number</code>)। আমাদের প্রো-পার্সার অটোমেটিক্যালি সেগুলোকে জোড়া লাগিয়ে নিবে।
                          </p>
                        </div>
                        <div className="flex justify-between items-center ml-1">
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            Smart Input Data
                          </label>
                          <span className="text-[10px] font-black text-wa-teal uppercase bg-wa-teal/10 px-2 py-0.5 rounded-md">Pro Parser</span>
                        </div>
                        <textarea
                          className="w-full h-32 p-6 bg-gray-50 border-2 border-transparent focus:border-indigo-500/20 focus:bg-white rounded-3xl outline-none transition-all font-bold text-gray-700 text-sm resize-none"
                          placeholder="e.g. Rahim, 01700..., Karim, 01800..., 01900..."
                          value={manualList}
                          onChange={(e) => setManualList(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-4">
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Select CSV or Excel File</label>
                        <div className="relative group">
                          <input
                            type="file"
                            accept=".csv, .xlsx, .xls"
                            onChange={handleFileChange}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <div className="w-full py-12 border-2 border-dashed border-gray-200 rounded-[2rem] bg-gray-50 flex flex-col items-center justify-center gap-4 group-hover:bg-indigo-50 group-hover:border-indigo-200 transition-all">
                            <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-indigo-600">
                              <FileText size={32} />
                            </div>
                            <div className="text-center">
                              <p className="font-black text-gray-800 text-sm">Click to browse or drag & drop</p>
                              <p className="text-[10px] text-gray-400 font-bold uppercase mt-1 tracking-widest">Supports .xlsx, .csv, .xls</p>
                            </div>
                          </div>
                        </div>
                        <button
                          onClick={downloadSampleFile}
                          className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-indigo-100 text-indigo-600 font-bold text-xs hover:bg-indigo-50 transition-all"
                        >
                          <Upload size={14} className="rotate-180" />
                          Download Sample CSV/Excel
                        </button>
                      </div>
                    )}

                    {manualList.trim() && (
                      <div className="bg-gray-50/50 rounded-3xl p-6 border border-dashed border-gray-200">
                        <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                          <ShieldCheck size={14} className="text-emerald-500" /> Parsed Preview ({parseSmartContacts(manualList).length})
                        </h4>
                        <div className="max-h-32 overflow-y-auto custom-scrollbar space-y-2">
                          {parseSmartContacts(manualList).map((c, i) => (
                            <div key={i} className="flex justify-between items-center bg-white p-2 px-4 rounded-xl border border-gray-100">
                              <span className="text-xs font-bold text-gray-700 truncate max-w-[120px]">{c.name}</span>
                              <span className="text-[10px] text-wa-teal font-black">{c.number}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => setImportStep(2)}
                      disabled={!manualList.trim() || parseSmartContacts(manualList).length === 0}
                      className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next: Choose Group
                    </button>
                  </div>
                )}

                {importStep === 2 && (
                  <div className="space-y-8 text-center">
                    <div className="p-8 bg-wa-teal/5 rounded-[2rem] border border-wa-teal/10">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6">Assign to a Group (Optional)</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          onClick={() => setImportGroupId('')}
                          className={`px-4 py-3 rounded-2xl border-2 font-bold text-xs transition-all ${importGroupId === '' ? 'border-wa-teal bg-wa-teal text-white' : 'border-gray-100 text-gray-500 hover:border-wa-teal/30'}`}
                        >
                          None (Individual)
                        </button>
                        {groups.map(group => (
                          <button
                            key={group.id}
                            onClick={() => setImportGroupId(group.id)}
                            className={`px-4 py-3 rounded-2xl border-2 font-bold text-xs transition-all truncate ${importGroupId === group.id ? 'border-wa-teal bg-wa-teal text-white' : 'border-gray-100 text-gray-500 hover:border-wa-teal/30'}`}
                          >
                            {group.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button
                        onClick={() => setImportStep(1)}
                        className="flex-1 py-5 border-2 border-gray-100 rounded-2xl font-black text-gray-400 hover:bg-gray-50 transition-all uppercase tracking-widest text-xs"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => setImportStep(3)}
                        className="flex-2 py-5 bg-indigo-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all uppercase tracking-widest text-xs px-12"
                      >
                        Review Import
                      </button>
                    </div>
                  </div>
                )}

                {importStep === 3 && (
                  <div className="space-y-8 text-center pb-4">
                    <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 size={40} />
                    </div>
                    <div>
                      <h3 className="text-2xl font-black text-gray-800">Ready to Import</h3>
                      <p className="text-gray-500 font-medium italic mt-2">You are about to add {parseSmartContacts(manualList).length} contacts.</p>
                    </div>

                    <div className="bg-gray-50 p-6 rounded-3xl flex justify-around items-center">
                      <div className="text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Method</p>
                        <p className="font-bold text-indigo-600 uppercase text-xs">Smart Parser</p>
                      </div>
                      <div className="w-[1px] h-8 bg-gray-200"></div>
                      <div className="text-center">
                        <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Target Group</p>
                        <p className="font-bold text-wa-teal uppercase text-xs">
                          {importGroupId ? groups.find(g => g.id === importGroupId)?.name : 'None'}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-4 pt-4">
                      <button
                        onClick={() => setImportStep(2)}
                        disabled={isImporting}
                        className="flex-1 py-5 border-2 border-gray-100 rounded-2xl font-black text-gray-400 hover:bg-gray-50 transition-all uppercase tracking-widest text-xs"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleBulkImport}
                        disabled={isImporting}
                        className="flex-2 py-5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-2xl font-black shadow-xl shadow-indigo-600/20 hover:scale-[1.02] transition-all uppercase tracking-widest text-xs px-12 flex items-center justify-center gap-3"
                      >
                        {isImporting ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            Importing...
                          </>
                        ) : (
                          'Confirm & Launch'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Slide-over Contact Profile Preview */}
      <AnimatePresence>
        {activeProfileId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveProfileId(null)}
              className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[120]"
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-[130] flex flex-col border-l border-white overflow-hidden"
            >
              {isProfileLoading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-wa-teal">
                  <div className="w-8 h-8 border-4 border-emerald-100 border-t-wa-teal rounded-full animate-spin mb-4" />
                  <p className="text-xs font-black uppercase tracking-widest text-emerald-600/50">Loading Profile...</p>
                </div>
              ) : profileData ? (
                <>
                  <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
                    <div className="p-8 bg-gradient-to-br from-wa-teal/10 to-emerald-50 relative shrink-0">
                      <button
                        onClick={() => setActiveProfileId(null)}
                        className="absolute top-6 right-6 p-2 bg-white/50 hover:bg-white text-gray-500 rounded-xl transition-all shadow-sm"
                      >
                        <X size={20} />
                      </button>
                      <div className="flex flex-col items-center text-center mt-4">
                        <div
                          className="w-24 h-24 rounded-3xl text-white flex items-center justify-center font-black text-4xl shadow-2xl mb-4 border-4 border-white"
                          style={{ background: getAvatarGradient(profileData.contact.name || 'U') }}
                        >
                          {profileData.contact.name ? profileData.contact.name.charAt(0) : '?'}
                        </div>
                        <h3 className="text-2xl font-black text-gray-800">{profileData.contact.name}</h3>
                        <p className="text-wa-teal font-bold flex items-center justify-center gap-2 mt-1 bg-white px-3 py-1 rounded-full shadow-sm text-sm border border-emerald-100">
                          <Phone size={14} /> {profileData.contact.number}
                        </p>

                        <div className="flex flex-col items-center justify-center gap-2 mt-4">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {profileData.contact.groupNames ? profileData.contact.groupNames.split(',').map((gn: string, idx: number) => (
                              <span key={idx} className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-indigo-100 shadow-sm">
                                <Users size={10} className="inline mr-1 mb-0.5" /> {gn}
                              </span>
                            )) : (
                              <span className="bg-gray-100 text-gray-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-gray-200">No Groups</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                            {profileData.contact.tags && JSON.parse(profileData.contact.tags).map((tag: string, idx: number) => (
                              <span key={idx} className="bg-fuchsia-50 text-fuchsia-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border border-fuchsia-100 shadow-sm flex items-center gap-1 group">
                                #{tag}
                                <button
                                  onClick={async () => {
                                    let currentTags = JSON.parse(profileData.contact.tags);
                                    currentTags = currentTags.filter((t: string) => t !== tag);
                                    try {
                                      await fetch(`http://localhost:3001/api/contacts/${profileData.contact.id}/tags`, {
                                        method: 'PUT',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ tags: currentTags })
                                      });
                                      setProfileData({ ...profileData, contact: { ...profileData.contact, tags: JSON.stringify(currentTags) } });
                                      await loadContacts();
                                      await fetchAllContacts();
                                    } catch (e) {
                                      console.error('Failed to remove tag', e);
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all p-0.5"
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                            <div className="relative flex items-center">
                              <input
                                type="text"
                                placeholder="+ Add Tag"
                                className="text-[10px] font-black uppercase tracking-widest px-3 py-1 bg-white border border-dashed border-gray-300 rounded-lg outline-none w-24 focus:w-32 focus:border-wa-teal focus:ring-2 focus:ring-wa-teal/20 transition-all placeholder:text-gray-400"
                                onKeyDown={async (e) => {
                                  if (e.key === 'Enter') {
                                    const inputField = e.currentTarget;
                                    const newTag = inputField.value.trim();

                                    if (newTag) {
                                      let currentTags = profileData.contact.tags ? JSON.parse(profileData.contact.tags) : [];
                                      if (!currentTags.includes(newTag)) {
                                        currentTags.push(newTag);
                                        try {
                                          await fetch(`http://localhost:3001/api/contacts/${profileData.contact.id}/tags`, {
                                            method: 'PUT',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ tags: currentTags })
                                          });
                                          setProfileData({ ...profileData, contact: { ...profileData.contact, tags: JSON.stringify(currentTags) } });
                                          await loadContacts();
                                          await fetchAllContacts();
                                        } catch (err) {
                                          console.error('Failed to add tag', err);
                                        }
                                      }
                                    }
                                    // Clear the input field regardless of whether the tag was new or already existed
                                    inputField.value = '';
                                  }
                                }}
                              />
                            </div>
                          </div>
                          {profileData.contact.engagement_score !== undefined && (
                            <div className="mt-2 bg-white/50 px-4 py-2 rounded-xl flex items-center gap-3">
                              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Engagement</span>
                              <div className="flex gap-1" title={`${profileData.contact.engagement_score}`}>
                                {[...Array(5)].map((_, i) => (
                                  <div key={i} className={`w-2 h-4 rounded-full ${i < Math.min(5, Math.ceil(profileData.contact.engagement_score / 20)) ? 'bg-amber-400' : 'bg-gray-300'}`} />
                                ))}
                              </div>
                              <span className="text-sm font-black text-amber-500">{profileData.contact.engagement_score}</span>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-4 w-full mt-8 px-2 text-left">
                          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm transition-all hover:bg-emerald-50/30">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">City</p>
                            <p className="text-sm font-bold text-gray-700">{profileData.contact.city || 'Not Set'}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm transition-all hover:bg-emerald-50/30">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Company</p>
                            <p className="text-sm font-bold text-gray-700">{profileData.contact.companyName || profileData.contact.company_name || 'Not Set'}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm transition-all hover:bg-emerald-50/30 col-span-2">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Email</p>
                            <p className="text-sm font-bold text-gray-700 truncate">{profileData.contact.email || 'Not Set'}</p>
                          </div>
                          <div className="bg-white p-4 rounded-2xl border border-emerald-100 shadow-sm transition-all hover:bg-emerald-50/30 col-span-2">
                            <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Address</p>
                            <p className="text-sm font-bold text-gray-700">{profileData.contact.address || 'Not Set'}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 bg-gray-50 p-6">
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-6 flex items-center gap-2">
                        <FileText size={14} /> Recent Interaction History
                      </h4>

                      <div className="space-y-4">
                        {profileData.history && profileData.history.length > 0 ? (
                          profileData.history.map((msg: any) => (
                            <div key={msg.id} className={`p-4 rounded-2xl relative ${msg.type === 'sent' ? 'bg-wa-teal/10 ml-8 rounded-tr-none border border-wa-teal/20' : 'bg-white mr-8 rounded-tl-none border border-gray-200 shadow-sm'}`}>
                              <div className="flex justify-between items-start mb-2">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                  {new Date(msg.timestamp).toLocaleDateString()}
                                </span>
                                {msg.type === 'sent' && (
                                  <span className={`text-[10px] font-black uppercase ${msg.status === 'read' ? 'text-blue-500' : 'text-gray-400'}`}>
                                    {msg.status}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm font-medium text-gray-700 break-words">{msg.text || (msg.media_path ? '[Media]' : '[Empty]')}</p>
                            </div>
                          ))
                        ) : (
                          <div className="text-center p-8 bg-white rounded-3xl border border-dashed border-gray-200">
                            <p className="text-sm font-bold text-gray-400">No message history found.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-white border-t border-gray-100 flex gap-3 shrink-0">
                    <button
                      onClick={() => {
                        setEditingContact(profileData.contact);
                        setShowEditModal(true);
                      }}
                      className="flex-1 bg-gray-50 hover:bg-gray-100 text-gray-600 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                    >
                      <Edit2 size={14} /> Edit Profile
                    </button>
                    <button
                      onClick={() => {
                        (window as any).setSelectedChat(profileData.contact.number);
                        (window as any).setActiveTab('messages');
                      }}
                      className="flex-2 bg-wa-teal hover:bg-emerald-600 text-white py-3 px-6 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-wa-teal/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Zap size={14} /> Start Chat
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 font-bold">Failed to load profile.</div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Custom Context Menu */}
      <AnimatePresence>
        {contextMenu.contactId && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            style={{ top: contextMenu.y, left: contextMenu.x }}
            className="fixed bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 z-[150] w-52 flex flex-col gap-1 overflow-hidden"
          >
            <button
              onClick={() => {
                fetchContactProfile(contextMenu.contactId!);
                setContextMenu({ x: 0, y: 0, contactId: null });
              }}
              className="w-full text-left px-4 py-2 hover:bg-emerald-50 text-gray-700 hover:text-wa-teal rounded-xl text-sm font-bold transition-all flex items-center gap-2"
            >
              <FileText size={14} /> Quick View
            </button>
            <div className="h-px bg-gray-100 my-1 mx-2" />
            <button
              onClick={() => {
                const contact = contacts.find(c => c.id === contextMenu.contactId);
                if (contact) {
                  setEditingName(contact.name);
                  setEditingContactId(contact.id);
                }
                setContextMenu({ x: 0, y: 0, contactId: null });
              }}
              className="w-full text-left px-4 py-2 hover:bg-gray-50 text-gray-700 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
            >
              <Edit2 size={14} /> Rename
            </button>
            {selectedGroup && (
              <>
                <div className="h-px bg-gray-100 my-1 mx-2" />
                <button
                  onClick={() => {
                    const contact = contacts.find(c => c.id === contextMenu.contactId);
                    if (contact) setRemoveModalContact(contact);
                    setContextMenu({ x: 0, y: 0, contactId: null });
                  }}
                  className="w-full text-left px-4 py-2 hover:bg-rose-50 text-gray-700 hover:text-rose-500 rounded-xl text-sm font-bold transition-all flex items-center gap-2 group"
                >
                  <UserMinus size={14} className="group-hover:text-rose-500 text-gray-400" /> Remove from Group
                </button>
              </>
            )}
            <div className="h-px bg-gray-100 my-1 mx-2" />
            <button
              onClick={async () => {
                const contact = contacts.find(c => c.id === contextMenu.contactId);
                if (contact && window.confirm('Delete this contact?')) {
                  try {
                    await fetch(`http://localhost:3001/api/contacts/${contextMenu.contactId}`, { method: 'DELETE' });
                    await loadContacts();
                  } catch (e) {
                    console.error('Error deleting contact', e);
                  }
                }
                setContextMenu({ x: 0, y: 0, contactId: null });
              }}
              className="w-full text-left px-4 py-2 hover:bg-red-50 text-gray-700 hover:text-red-500 rounded-xl text-sm font-bold transition-all flex items-center gap-2 group"
            >
              <Trash2 size={14} className="group-hover:text-red-500 text-gray-400" /> Delete
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate Resolver Modal */}
      <AnimatePresence>
        {showDuplicateModal && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDuplicateModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            ></motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-orange-100 flex justify-between items-center bg-gradient-to-r from-orange-50 to-white">
                <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                  <ShieldCheck className="text-orange-500" size={32} /> Resolution Center
                </h3>
                <button onClick={() => setShowDuplicateModal(false)} className="p-3 hover:bg-orange-100 rounded-2xl text-gray-400 hover:text-orange-600 transition-colors">
                  <X size={24} />
                </button>
              </div>
              <div className="p-8 flex-1 overflow-y-auto custom-scrollbar bg-gray-50/50 space-y-6">
                {duplicates.length === 0 ? (
                  <div className="text-center py-20">
                    <div className="w-20 h-20 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-6">
                      <CheckCircle2 size={40} />
                    </div>
                    <h4 className="text-xl font-black text-gray-800 mb-2">Clean CRM!</h4>
                    <p className="text-sm font-bold text-gray-400">No duplicate contacts found.</p>
                  </div>
                ) : (
                  duplicates.map((dupGroup, idx) => (
                    <div key={idx} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden group">
                      <div className="flex justify-between items-center mb-6">
                        <span className="px-3 py-1 bg-orange-100 text-orange-600 text-[10px] font-black uppercase tracking-widest rounded-lg">
                          {dupGroup.reason}
                        </span>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest text-right">
                          Choose the Primary Contact
                        </p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {dupGroup.contacts.map((contact: any) => (
                          <div key={contact.id} className="p-5 rounded-2xl border-2 border-gray-100 hover:border-wa-teal/30 bg-gray-50 flex flex-col gap-3 transition-colors relative">
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className="font-black text-gray-800 text-lg">{contact.name}</h5>
                                <p className="text-wa-teal font-black text-sm">{contact.number}</p>
                              </div>
                              <button
                                disabled={isMerging}
                                onClick={() => handleMerge(contact.id, dupGroup.contacts.filter((c: any) => c.id !== contact.id).map((c: any) => c.id))}
                                className="px-4 py-2 bg-wa-teal hover:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md shadow-wa-teal/20 disabled:opacity-50"
                              >
                                {isMerging ? 'Merging...' : 'Keep as Primary'}
                              </button>
                            </div>
                            <div className="h-px bg-gray-200 my-1" />
                            <div className="flex gap-4">
                              <div className="flex-1">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Tags</p>
                                <p className="text-xs font-bold text-gray-700 truncate">{contact.tags || 'None'}</p>
                              </div>
                              <div className="flex-1">
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Groups</p>
                                <p className="text-xs font-bold text-gray-700 truncate">{contact.groupNames || 'None'}</p>
                              </div>
                              <div>
                                <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Score</p>
                                <p className="text-xs font-black text-amber-500 text-center">{contact.engagement_score || 0}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Contact Modal */}
      <AnimatePresence>
        {showEditModal && (
          <div className="fixed inset-0 z-[160] flex items-center justify-center p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="absolute inset-0 bg-gray-900/60 backdrop-blur-md"
            ></motion.div>
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden border border-white"
            >
              <div className="p-8 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                  <Edit2 className="text-wa-teal" size={24} /> Edit Contact
                </h3>
                <button onClick={() => setShowEditModal(false)} className="p-3 hover:bg-gray-100 rounded-2xl text-gray-400 hover:text-wa-teal transition-colors">
                  <X size={24} />
                </button>
              </div>
              <form onSubmit={handleUpdateContact} className="p-10 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahim Khan"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={editingContact.name || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Phone Number</label>
                    <input
                      type="text"
                      required
                      placeholder="017xxxxxxxx"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={editingContact.phone || editingContact.number || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, number: e.target.value, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">City</label>
                    <input
                      type="text"
                      placeholder="e.g. Dhaka"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={editingContact.city || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Company</label>
                    <input
                      type="text"
                      placeholder="e.g. Acme Corp"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={editingContact.companyName || editingContact.company_name || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, companyName: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="rahim@example.com"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={editingContact.email || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Full Address</label>
                    <input
                      type="text"
                      placeholder="123 Street, Area"
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-wa-teal/30 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-700"
                      value={editingContact.address || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, address: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="flex-1 py-5 border-2 border-gray-100 rounded-2xl font-black text-gray-400 hover:bg-gray-50 transition-all uppercase tracking-widest text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-2 py-5 bg-wa-teal text-white rounded-2xl font-black shadow-xl shadow-wa-teal/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs px-12"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Remove from Group Modal ── */}
      <AnimatePresence>
        {removeModalContact && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
            onClick={() => !isRemovingContact && setRemoveModalContact(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.85, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 30 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 p-6 relative overflow-hidden">
                <div className="absolute -top-6 -right-6 w-24 h-24 bg-white/5 rounded-full blur-2xl" />
                <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-rose-500/10 rounded-full blur-xl" />
                <div className="relative z-10 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-2xl bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                        <UserMinus size={18} className="text-rose-400" />
                      </div>
                      <div>
                        <h3 className="text-white font-black text-sm uppercase tracking-widest">Remove Contact</h3>
                        <p className="text-white/50 text-[10px] font-bold">Choose removal method</p>
                      </div>
                    </div>
                    <div className="mt-3 p-3 bg-white/10 rounded-xl border border-white/10 flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-xl text-white flex items-center justify-center font-black text-base shadow-lg flex-shrink-0"
                        style={{ background: getAvatarGradient(removeModalContact.name) }}
                      >
                        {removeModalContact.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-white font-black text-sm leading-none">{removeModalContact.name}</p>
                        <p className="text-white/60 text-[10px] font-bold mt-0.5">{removeModalContact.phone}</p>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => !isRemovingContact && setRemoveModalContact(null)}
                    className="text-white/40 hover:text-white/80 transition-colors p-1 rounded-lg hover:bg-white/10"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Option Cards */}
              <div className="p-6 space-y-3">
                {/* Option 1: Group only */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleRemoveFromGroup('group_only')}
                  disabled={isRemovingContact}
                  className="w-full text-left p-4 rounded-2xl border-2 border-emerald-100 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-200 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <LogOut size={18} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="font-black text-sm text-gray-800 leading-none mb-1">Remove from Group Only</p>
                      <p className="text-[10px] font-bold text-gray-400 leading-tight">
                        Contact leaves this group but{' '}
                        <span className="text-emerald-600">stays in All Contacts</span>
                      </p>
                    </div>
                    <div className="ml-auto flex-shrink-0">
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-emerald-100 text-emerald-600">Safe</span>
                    </div>
                  </div>
                </motion.button>

                {/* Option 2: Full delete */}
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleRemoveFromGroup('full_delete')}
                  disabled={isRemovingContact}
                  className="w-full text-left p-4 rounded-2xl border-2 border-rose-100 bg-rose-50/50 hover:bg-rose-50 hover:border-rose-200 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                      <AlertTriangle size={18} className="text-rose-600" />
                    </div>
                    <div>
                      <p className="font-black text-sm text-gray-800 leading-none mb-1">Delete Permanently</p>
                      <p className="text-[10px] font-bold text-gray-400 leading-tight">
                        Contact will be{' '}
                        <span className="text-rose-600">permanently removed</span>
                        {' '}— from all groups and the system
                      </p>
                    </div>
                    <div className="ml-auto flex-shrink-0">
                      <span className="text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-rose-100 text-rose-600">Danger</span>
                    </div>
                  </div>
                </motion.button>

                {/* Cancel */}
                <button
                  onClick={() => setRemoveModalContact(null)}
                  disabled={isRemovingContact}
                  className="w-full py-3 text-[11px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-xl transition-all disabled:opacity-50"
                >
                  {isRemovingContact ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Processing...
                    </span>
                  ) : 'Cancel'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ContactsView;
