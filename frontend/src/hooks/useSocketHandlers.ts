import React, { useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { MessageLog, Contact, ScheduledCampaign } from '../components/campaign/types';

interface SocketHandlersProps {
    socket: Socket | null;
    contacts: Contact[];
    setMessageLogs: React.Dispatch<React.SetStateAction<MessageLog[]>>;
    setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
    setScheduledCampaigns: React.Dispatch<React.SetStateAction<ScheduledCampaign[]>>;
    setProcessState: (updater: (prev: any) => any) => void;
    setIsConnected: (connected: boolean) => void;
    fetchScheduled: () => Promise<void>;
}

export const useSocketHandlers = ({
    socket,
    contacts,
    setMessageLogs,
    setContacts,
    setScheduledCampaigns,
    setProcessState,
    setIsConnected,
    fetchScheduled
}: SocketHandlersProps) => {
    useEffect(() => {
        if (socket) {
            // ... (message handlers)

            socket.on('scheduled_campaigns_changed', () => {
                fetchScheduled();
            });
            // Keep status update for progress tracking if needed, but remove old status only logic
            socket.on('scheduled_campaign_update', (data: { id: number; status: string; sent_count?: number; fail_count?: number }) => {
                setScheduledCampaigns(prev =>
                    prev.map(c =>
                        c.id === data.id
                            ? {
                                ...c,
                                status: data.status as ScheduledCampaign['status'],
                                sent_count: data.sent_count ?? c.sent_count,
                                fail_count: data.fail_count ?? c.fail_count
                            }
                            : c
                    )
                );
            });
            socket.on('message-sent', (data: any) => {
                setMessageLogs(prev => {
                    const wId = data.whatsappId || data.whatsapp_id;
                    if (wId && prev.some(log => log.whatsappId === wId)) {
                        return prev;
                    }
                    const newLog: MessageLog = {
                        id: data.id || Date.now().toString(),
                        whatsappId: wId,
                        contactId: data.contactId || 'unknown',
                        contactName: data.contactName || data.to,
                        phone: data.to,
                        content: data.text,
                        timestamp: data.timestamp || new Date().toISOString(),
                        status: 'sent',
                        type: 'sent',
                        mediaPath: data.media_path,
                        mediaType: data.media_type,
                        quotedMsg: data.quotedMsg,
                        metadata: data.metadata
                    };
                    return [newLog, ...prev];
                });
            });

            socket.on('message_reaction_update', (data: any) => {
                const wId = data.whatsappId || data.whatsapp_id;
                setMessageLogs(prev => prev.map(log =>
                    log.whatsappId === wId
                        ? { ...log, reaction: data.reaction }
                        : log
                ));
            });

            socket.on('message_status_update', (data: any) => {
                const wId = data.whatsappId || data.whatsapp_id;
                setMessageLogs(prev => prev.map(log =>
                    log.whatsappId === wId
                        ? { ...log, status: data.status, ack: data.ack }
                        : log
                ));
            });

            socket.on('new_message', (data: any) => {
                setMessageLogs(prev => {
                    const wId = data.whatsappId || data.whatsapp_id;
                    if (wId && prev.some(log => log.whatsappId === wId)) {
                        return prev;
                    }
                    const newLog: MessageLog = {
                        id: data.id || Date.now().toString(),
                        whatsappId: wId,
                        contactId: '0',
                        contactName: data.contactName || data.number,
                        phone: data.number,
                        content: data.text,
                        timestamp: data.timestamp || new Date().toISOString(),
                        status: data.status || (data.type === 'sent' ? 'sent' : 'received'),
                        type: data.type as any,
                        mediaPath: data.media_path,
                        mediaType: data.media_type,
                        quotedMsg: data.quotedMsg,
                        metadata: data.metadata
                    };
                    return [newLog, ...prev];
                });
            });

            socket.on('message_deleted', (data: { id: string | number, whatsappId: string }) => {
                setMessageLogs(prev => prev.filter(log =>
                    log.id.toString() !== data.id.toString() && log.whatsappId !== data.whatsappId
                ));
            });

            socket.on('message-error', (data: any) => {
                console.error('WhatsApp Send Error:', data.error);
            });

            socket.on('history_loaded', (data: { chatId: string, messages: any[] }) => {
                setMessageLogs(prev => {
                    const newMessages = data.messages.map((m: any) => ({
                        id: m.id?.toString() || Date.now().toString() + Math.random(),
                        whatsappId: m.whatsappId || m.whatsapp_id,
                        contactId: '0',
                        contactName: prev.find(p => p.phone === data.chatId)?.contactName || data.chatId,
                        phone: data.chatId,
                        content: m.text || m.content,
                        timestamp: m.timestamp,
                        status: 'read',
                        type: m.type as any,
                        mediaPath: m.media_path || m.mediaPath,
                        mediaType: m.media_type || m.mediaType,
                        quotedMsg: m.quotedMsg || m.quoted_msg_body,
                        metadata: m.metadata
                    }));

                    const filteredNew = newMessages.filter(nm => !prev.some(p => p.whatsappId === nm.whatsappId));
                    return [...prev, ...filteredNew].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
                });
            });

            socket.on('sync_status', (data: { type: string, success: boolean, count: number }) => {
                if (data.type === 'contacts' && data.success) {
                    fetch('http://localhost:3001/customers')
                        .then(res => res.json())
                        .then(contactsData => {
                            setContacts(contactsData.map((c: any) => ({
                                id: c.id.toString(),
                                name: c.name,
                                phone: c.number,
                                status: 'active',
                                groupNames: c.groupNames,
                                tags: c.tags ? JSON.parse(c.tags) : [],
                                engagementScore: c.engagement_score || 0
                            })));
                        });
                }
            });

            socket.on('process_start', (data: any) => {
                // Common base state
                const baseState = {
                    isOpen: true,
                    id: data.id,
                    campaignId: data.campaignId,
                    source: data.source,
                    title: data.title,
                    current: 0,
                    total: data.total,
                    sentCount: 0,
                    failCount: 0,
                    messagePreview: data.messageText || data.text,
                    status: 'processing',
                    antiBan: data.antiBan,
                    statusDetail: data.statusDetail || 'active',
                    breakEndsAt: data.breakEndsAt,
                    resumeAt: data.resumeAt,
                    logs: [{
                        id: `init-${Date.now()}-${Math.random()}`,
                        message: `Starting ${data.title}...`,
                        type: 'info',
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                    }],
                    recipients: []
                };

                setProcessState(() => baseState);
            });

            socket.on('process_update', (data: any) => {
                // Unified ProcessState Update
                setProcessState((prev: any) => {
                    if (!prev) return prev;
                    const isNewLog = data.message || data.contactName;
                    return {
                        ...prev,
                        current: data.current !== undefined ? data.current : prev.current,
                        sentCount: data.type === 'success' ? (prev.sentCount || 0) + 1 : (prev.sentCount || 0),
                        failCount: data.type === 'error' ? (prev.failCount || 0) + 1 : (prev.failCount || 0),
                        antiBan: data.antiBan || prev.antiBan,
                        statusDetail: data.statusDetail || prev.statusDetail,
                        breakEndsAt: data.breakEndsAt || prev.breakEndsAt,
                        resumeAt: data.resumeAt || prev.resumeAt,
                        logs: data.message ? [...prev.logs, {
                            id: `log-${Date.now()}-${Math.random()}`,
                            message: data.message,
                            type: (data.type as any) || 'info',
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        }] : prev.logs,
                        recipients: data.contactName ? [...(prev.recipients || []), {
                            name: data.contactName,
                            phone: data.phone || '',
                            status: data.type || 'info',
                            timestamp: new Date().toISOString()
                        }] : prev.recipients
                    };
                });
            });

            socket.on('process_end', (data: any) => {
                setProcessState((prev: any) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        status: data.status,
                        sentCount: data.sent !== undefined ? data.sent : prev.sentCount,
                        failCount: data.failed !== undefined ? data.failed : prev.failCount,
                        logs: [...prev.logs, {
                            id: `end-${Date.now()}-${Math.random()}`,
                            message: data.message || (data.status === 'completed' ? 'Process finished successfully!' : 'Process failed.'),
                            type: data.status === 'completed' ? 'success' : 'error',
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        }]
                    };
                });
            });

            socket.on('execution_state_changed', (data: { campaignId: string | number; state: 'paused' | 'running' | 'cancelled' }) => {
                setProcessState((prev: any) => {
                    if (!prev) return prev;
                    if (String(prev.campaignId) === String(data.campaignId) || String(prev.id) === String(data.campaignId)) {
                        return { ...prev, executionState: data.state };
                    }
                    return prev;
                });
            });

            // v8.5: Modern Process Recovery Engine
            socket.on('active_executions_sync', (data: any[]) => {
                const scraperProcess = data.find(exe => exe.type === 'scraper');
                if (scraperProcess) {
                    setProcessState((prev: any) => {
                        // If we already have this process open, don't reset it
                        if (prev && prev.id === scraperProcess.id) return prev;

                        // Otherwise, recover the skeleton state
                        // The next 'process_update' will fill in the details
                        return {
                            isOpen: true,
                            id: scraperProcess.id,
                            title: scraperProcess.payload?.title || "AI Brain Sync",
                            current: scraperProcess.current_index || 0,
                            total: scraperProcess.total_count || 0,
                            status: 'processing',
                            statusDetail: scraperProcess.status_detail || 'active',
                            sentCount: 0,
                            failCount: 0,
                            logs: [{
                                id: `recovery-${Date.now()}`,
                                message: `📡 Reconnected to active session: ${scraperProcess.id}`,
                                type: 'info',
                                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            }],
                            recipients: []
                        };
                    });
                }
            });

            socket.on('force_refresh_required', () => {
                window.location.reload();
            });

            return () => {
                socket.off('scheduled_campaigns_changed');
                socket.off('scheduled_campaign_update');
                socket.off('message-sent');
                socket.off('message_reaction_update');
                socket.off('message_status_update');
                socket.off('new_message');
                socket.off('message_deleted');
                socket.off('message-error');
                socket.off('history_loaded');
                socket.off('sync_status');
                socket.off('process_start');
                socket.off('process_update');
                socket.off('process_end');
                socket.off('execution_state_changed');
            };
        }
    }, [socket, contacts, setMessageLogs, setContacts, setScheduledCampaigns, setProcessState, fetchScheduled]);
};
