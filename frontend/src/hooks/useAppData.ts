import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Contact, Group, MessageLog, ScheduledCampaign } from '../components/campaign/types';

export interface AppData {
    contacts: Contact[];
    setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
    groups: Group[];
    setGroups: React.Dispatch<React.SetStateAction<Group[]>>;
    messageLogs: MessageLog[];
    setMessageLogs: React.Dispatch<React.SetStateAction<MessageLog[]>>;
    scheduledCampaigns: ScheduledCampaign[];
    setScheduledCampaigns: React.Dispatch<React.SetStateAction<ScheduledCampaign[]>>;
    isConnected: boolean;
    setIsConnected: React.Dispatch<React.SetStateAction<boolean>>;
    socket: Socket | null;
    selectedChat: string | null;
    setSelectedChat: (chatId: string | null) => void;
    fetchScheduled: () => Promise<void>;
}

export const useAppData = () => {
    const [contacts, setContacts] = useState<Contact[]>([]);
    const [groups, setGroups] = useState<Group[]>([]);
    const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
    const [scheduledCampaigns, setScheduledCampaigns] = useState<ScheduledCampaign[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);
    const [selectedChat, setSelectedChat] = useState<string | null>(null);

    const fetchScheduled = useCallback(async () => {
        try {
            const res = await fetch('http://localhost:3001/api/campaigns/scheduled');
            const data = await res.json();
            if (data.success) setScheduledCampaigns(data.campaigns);
        } catch (err) {
            console.error('Failed to fetch scheduled campaigns:', err);
        }
    }, []);

    useEffect(() => {
        const fetchLogs = async () => {
            try {
                const response = await fetch('http://localhost:3001/messages');
                const data = await response.json();
                setMessageLogs(data.slice(0, 500).map((m: any) => ({
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
                })));
            } catch (err) {
                console.error('Failed to fetch logs:', err);
            }
        };

        const fetchData = async () => {
            try {
                const [contactsRes, groupsRes] = await Promise.all([
                    fetch('http://localhost:3001/customers'),
                    fetch('http://localhost:3001/api/groups')
                ]);
                const contactsData = await contactsRes.json();
                const groupsData = await groupsRes.json();

                setContacts(contactsData.map((c: any) => ({
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
                    city: c.city,
                    companyName: c.company_name || c.companyName,
                    address: c.address,
                    email: c.email,
                    lastPurchase: c.last_purchase || c.lastPurchase
                })));
                setGroups(groupsData.map((g: any) => ({
                    id: g.id.toString(),
                    name: g.name,
                    description: g.description,
                    contactCount: g.contactCount || 0
                })));
            } catch (err) {
                console.error('Failed to fetch contacts/groups:', err);
            }
        };

        fetchLogs();
        fetchData();
        fetchScheduled();

        const socketInstance = io('http://localhost:3001');
        setSocket(socketInstance);
        // Expose socket for components that need it globally (Legacy support)
        (window as any).socket = socketInstance;

        socketInstance.on('connect', () => {
            console.log('Connected to socket server');
            socketInstance.emit('get_status');
        });

        socketInstance.on('status_update', (status: any) => {
            if (status.state === 'ready') {
                setIsConnected(true);
            } else if (status.state === 'qr' || status.state === 'auth_failure' || status.state === 'initial') {
                setIsConnected(false);
            }
        });

        return () => {
            socketInstance.disconnect();
        };
    }, [fetchScheduled]);

    return {
        contacts, setContacts,
        groups, setGroups,
        messageLogs, setMessageLogs,
        scheduledCampaigns, setScheduledCampaigns,
        fetchScheduled,
        isConnected, setIsConnected,
        socket,
        selectedChat, setSelectedChat
    };
};
