import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    X,
    Send,
    Smile,
    Paperclip,
    MoreVertical,
    Search,
    MessageSquare,
    User,
    MapPin,
    Check,
    CheckCheck,
    Phone,
    Video,
    ArrowLeft,
    Info,
    Bell,
    Ban,
    Trash2,
    Mic,
    Play,
    Pause,
    Clock,
    CornerUpLeft,
    Zap,
    Bold,
    Italic,
    Strikethrough,
    Code,
    Copy,
    Shuffle,
    BarChart3,
    Plus
} from 'lucide-react';
import { MessageLog, Contact, Template } from '../types';
import { useModal } from '../services/useModal';


interface ChatBoxProps {
    logs: MessageLog[];
    contacts: Contact[];
    onSendMessage?: (phone: string, text: string, mediaUrl?: string, mediaType?: string, quotedMessageId?: string, quotedText?: string, attachments?: any[], templateId?: string | number) => void;
    onSendReaction?: (whatsappId: string, reaction: string) => void;
    isConnected: boolean;
    socket: any;
    selectedChat: string | null;
    setSelectedChat: (chat: string | null) => void;
}

const VoiceMessage: React.FC<{ url: string; isSystem: boolean }> = ({ url, isSystem }) => {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [progress, setProgress] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleTimeUpdate = () => {
        if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
            setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100);
        }
    };

    const handleLoadedMetadata = () => {
        if (audioRef.current) {
            setDuration(audioRef.current.duration);
        }
    };

    const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const seekTime = (parseFloat(e.target.value) / 100) * duration;
        if (audioRef.current) {
            audioRef.current.currentTime = seekTime;
            setProgress(parseFloat(e.target.value));
        }
    };

    const formatTime = (time: number) => {
        const mins = Math.floor(time / 60);
        const secs = Math.floor(time % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className={`flex items-center gap-3 p-2 rounded-xl min-w-[200px] sm:min-w-[280px] ${isSystem ? 'bg-wa-teal/10' : 'bg-gray-50'}`}>
            <audio
                ref={audioRef}
                src={url}
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setIsPlaying(false)}
            />

            <button
                onClick={togglePlay}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${isSystem ? 'bg-wa-teal text-white' : 'bg-wa-teal text-white'
                    } hover:scale-105 shadow-sm text-white`}
            >
                {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} className="ml-0.5" fill="currentColor" />}
            </button>

            <div className="flex-1 flex flex-col gap-1">
                <div className="relative w-full h-1 bg-gray-200 rounded-full overflow-hidden group">
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={progress || 0}
                        onChange={handleSeek}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div
                        className="h-full bg-wa-teal rounded-full relative"
                        style={{ width: `${progress}%` }}
                    >
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-wa-teal rounded-full shadow-md scale-0 group-hover:scale-100 transition-transform"></div>
                    </div>
                </div>
                <div className="flex justify-between items-center text-[10px] font-bold text-gray-400">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                </div>
            </div>

            <div className="flex flex-col items-center justify-center opacity-40">
                <Mic size={14} className={isSystem ? 'text-wa-teal' : 'text-gray-400'} />
            </div>
        </div>
    );
};

const ChatBox: React.FC<ChatBoxProps> = ({ logs, contacts, onSendMessage, onSendReaction, isConnected, socket, selectedChat, setSelectedChat }) => {
    const { confirm: showConfirm, alert: showAlert } = useModal();
    const [messageText, setMessageText] = useState('');
    const [showContactInfo, setShowContactInfo] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<{ url: string; type: string; name: string; caption?: string }[]>([]);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingTime, setRecordingTime] = useState(0);
    const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
    const [replyingTo, setReplyingTo] = useState<MessageLog | null>(null);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [showTemplates, setShowTemplates] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [slashActive, setSlashActive] = useState(false);
    const [focusedTemplateIndex, setFocusedTemplateIndex] = useState(0);
    const [showVariables, setShowVariables] = useState(false);
    const [showSpintaxModal, setShowSpintaxModal] = useState(false);
    const [spintaxInput, setSpintaxInput] = useState('');
    const [selection, setSelection] = useState<{ start: number, end: number, text: string } | null>(null);
    const [activeTemplateId, setActiveTemplateId] = useState<string | number | null>(null);
    /* activeButtons state removed */
    const [loadingHistory, setLoadingHistory] = useState(false);
    const [hasMoreHistory, setHasMoreHistory] = useState(true);
    const [aiStatus, setAiStatus] = useState({ ai_paused: 0, handover_requested: 0 });
    const [profileData, setProfileData] = useState<any>(null);
    const [isFetchingProfile, setIsFetchingProfile] = useState(false);
    const [availableTags, setAvailableTags] = useState<string[]>([]);
    const [showTagPicker, setShowTagPicker] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recordingInterval = useRef<any>(null);
    const scrollAnchoringRef = useRef<{ id: string; top: number } | null>(null);
    const recentFetchIdRef = useRef<string | null>(null);

    useEffect(() => {
        const fetchTemplates = async () => {
            try {
                const standardRes = await fetch('http://localhost:3001/api/templates');
                if (standardRes.ok) setTemplates(await standardRes.json());
            } catch (err) {
                console.error('Failed to fetch templates:', err);
            }
        };
        fetchTemplates();
    }, [showTemplates]); // Refresh when opening templates


    // Group logs by phone number to create "chats"
    const chats = logs.reduce((acc: Record<string, MessageLog[]>, log) => {
        if (!acc[log.phone]) acc[log.phone] = [];
        acc[log.phone].push(log);
        return acc;
    }, {});

    // Sort each chat's messages ASC (Oldest to Newest) for the chat display
    Object.keys(chats).forEach(phone => {
        chats[phone].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    });

    const chatList = Object.entries(chats)
        .filter(([phone]) => {
            // Enterprise Grade Filtering: Ignore system numbers, broadcasts, or invalid short IDs
            if (!phone || phone.length < 7) return false; // Minimum length for a valid WhatsApp/Phone ID
            if (phone.includes('status') || phone.includes('broadcast')) return false;
            if (/^[a-zA-Z]$/.test(phone)) return false; // Ignore single letter IDs like 's'
            return chats[phone].length > 0;
        })
        .map(([phone, messagesRaw]) => {
            const messages = messagesRaw as MessageLog[];
            const lastMsg = messages[messages.length - 1]; // Newest message is at the end
            const savedContact = contacts.find(c => c.phone === phone);
            const displayName = savedContact?.name || lastMsg.contactName || phone || 'Unknown';

            return {
                phone,
                name: displayName,
                lastMessage: lastMsg.content,
                time: formatTimeHelper(lastMsg.timestamp),
                unread: 0,
            };
        }).sort((a, b) => {
            const aMsgs = chats[a.phone] as MessageLog[];
            const bMsgs = chats[b.phone] as MessageLog[];
            if (!aMsgs?.length || !bMsgs?.length) return 0;
            const aTime = new Date(aMsgs[aMsgs.length - 1].timestamp).getTime();
            const bTime = new Date(bMsgs[bMsgs.length - 1].timestamp).getTime();
            return bTime - aTime;
        });

    function formatTimeHelper(timestamp: string | number) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // Helper to format date for the sticky headers (e.g., "Today", "Yesterday", "24 Feb 2024")
    function formatDateHeader(timestamp: string | number) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return '';

        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === yesterday.toDateString()) {
            return 'Yesterday';
        } else {
            return date.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' });
        }
    }

    const prevCountRef = useRef(0);
    const prevChatRef = useRef<string | null>(null);
    const prevLastMsgIdRef = useRef<string | null>(null);

    useEffect(() => {
        setLoadingHistory(false);
        setHasMoreHistory(true);
        recentFetchIdRef.current = null;
        scrollAnchoringRef.current = null;
        
        // Fetch AI Status for the selected customer
        if (selectedChat) {
            fetchAIStatus(selectedChat);
        } else {
            setAiStatus({ ai_paused: 0, handover_requested: 0 });
        }
    }, [selectedChat]);

    const fetchAIStatus = async (number: string) => {
        try {
            const res = await fetch(`http://localhost:3001/api/customers/ai-status/${encodeURIComponent(number)}`);
            const data = await res.json();
            if (data.success) {
                setAiStatus(data.status);
            }
        } catch (err) {
            console.error('Failed to fetch AI status:', err);
        }
    };

    const toggleAI = async () => {
        if (!selectedChat) return;
        const newStatus = { 
            ai_paused: aiStatus.ai_paused === 1 ? 0 : 1, 
            handover_requested: 0 // Reset handover when manually toggling
        };
        
        try {
            // Optimistic Update
            setAiStatus(prev => ({ ...prev, ...newStatus }));
            
            const res = await fetch('http://localhost:3001/api/customers/toggle-ai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    number: selectedChat,
                    ...newStatus
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error);
        } catch (err) {
            console.error('Failed to toggle AI:', err);
            // Revert on error
            fetchAIStatus(selectedChat);
        }
    };
    const fetchProfile = async (number: string) => {
        setIsFetchingProfile(true);
        try {
            // Fetch Profile Data
            const res = await fetch(`http://localhost:3001/api/contacts/profile/${encodeURIComponent(number)}`);
            const data = await res.json();
            if (data.success) {
                setProfileData(data);
            }

            // Fetch AI Tagging Rules to extract available tags
            const settingsRes = await fetch('http://localhost:3001/api/settings');
            const settingsData = await settingsRes.json();
            if (settingsData.success && settingsData.settings.ai_tagging_rules) {
                const rules = settingsData.settings.ai_tagging_rules;
                const extractedTags = Array.from(new Set(rules.match(/#(\w+)/g) || [])).map((t: any) => t.replace('#', ''));
                setAvailableTags(extractedTags as string[]);
            }
        } catch (err) {
            console.error('Failed to fetch profile/settings:', err);
        } finally {
            setIsFetchingProfile(false);
        }
    };

    useEffect(() => {
        if (showContactInfo && selectedChat) {
            fetchProfile(selectedChat);
        }
    }, [showContactInfo, selectedChat]);
    useEffect(() => {
        if (!selectedChat || !socket) return;
        const currentMessages = chats[selectedChat] || [];
        
        // If we have very few messages for this chat (e.g. < 20),
        // proactively fetch the latest history from the database to fill the gap.
        // This solves the issue where old messages aren't visible unless you scroll.
        if (currentMessages.length < 20) {
            console.log(`[ChatBox] Proactively fetching history for ${selectedChat} (Current: ${currentMessages.length})`);
            setLoadingHistory(true);
            scrollAnchoringRef.current = null;
            socket.emit('fetch-more-history', { chatId: selectedChat, lastMsgId: undefined, limit: 40 });
        }
    }, [selectedChat, socket]);

    useEffect(() => {
        if (!selectedChat) {
            prevChatRef.current = null;
            prevCountRef.current = 0;
            prevLastMsgIdRef.current = null;
            return;
        }

        const currentMessages = chats[selectedChat] || [];
        const lastMsg = currentMessages[currentMessages.length - 1];
        const lastMsgId = lastMsg?.whatsappId || lastMsg?.id;

        const isNewChat = selectedChat !== prevChatRef.current;
        const isNewMessage = currentMessages.length > prevCountRef.current || (lastMsgId !== prevLastMsgIdRef.current && lastMsgId !== undefined);

        const shouldScroll = (isNewChat || isNewMessage) && scrollRef.current;

        prevCountRef.current = currentMessages.length;
        prevChatRef.current = selectedChat;
        prevLastMsgIdRef.current = lastMsgId || null;

        if (shouldScroll) {
            const scrollToBottom = () => {
                if (scrollRef.current) {
                    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;

                    // IF it's a completely new chat being opened -> ALWAYS scroll to bottom
                    if (isNewChat) {
                        scrollRef.current.scrollTop = scrollHeight;
                        return;
                    }

                    // IF it's just a new message arriving -> ONLY auto-scroll if user is already near the bottom
                    // Threshold: 150px from bottom. If they are scrolled up higher than that (reading old Msgs), DON'T interrupt them.
                    const isNearBottom = scrollHeight - scrollTop - clientHeight < 150;

                    if (isNearBottom) {
                        scrollRef.current.scrollTop = scrollHeight;
                    }
                }
            };

            // Immediate attempt for quick renders
            scrollToBottom();

            // Single delayed attempt to catch late renders (images, etc)
            const t1 = setTimeout(scrollToBottom, 100);

            return () => {
                clearTimeout(t1);
            };
        }
    }, [selectedChat, chats]);

    const fetchMoreHistory = () => {
        if (!selectedChat || loadingHistory || !hasMoreHistory || activeMessages.length === 0) return;

        const firstMsgId = activeMessages[0].whatsappId;
        if (recentFetchIdRef.current !== firstMsgId) {
            console.log('[ChatBox] Triggering fetch-more-history for:', firstMsgId);
            recentFetchIdRef.current = firstMsgId;
            setLoadingHistory(true);

            // Scroll Anchoring: Record the top message's position
            const firstMsgElement = scrollRef.current?.querySelector(`[data-message-id="${firstMsgId}"]`);
            if (firstMsgElement) {
                const rect = firstMsgElement.getBoundingClientRect();
                scrollAnchoringRef.current = {
                    id: firstMsgId,
                    top: rect.top
                };
            }

            socket.emit('fetch-more-history', {
                chatId: selectedChat,
                lastMsgId: firstMsgId
            });
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;

        // Auto-fetch more history when near the top (100px threshold for eager loading)
        if (scrollTop <= 100 && hasMoreHistory && !loadingHistory && activeMessages.length > 0) {
            fetchMoreHistory();
        }
    };

    useEffect(() => {
        if (!socket) return;

        const handleHistoryLoaded = (data: { chatId: string, messages: any[] }) => {
            if (data.chatId === selectedChat) {
                console.log(`[ChatBox] History loaded for ${data.chatId}, received ${data.messages.length} messages`);
                // Ensure we reset too fast to avoid scroll jitter
                setTimeout(() => setLoadingHistory(false), 300);

                // Only set hasMoreHistory to false if we actually got zero or very few messages
                // suggesting the end of history in the cloud/backend.
                if (data.messages.length === 0) {
                    setHasMoreHistory(false);
                }

                // Scroll preservation - wait for render
                setTimeout(() => {
                    if (scrollRef.current && scrollAnchoringRef.current) {
                        const anchoredElement = scrollRef.current.querySelector(`[data-message-id="${scrollAnchoringRef.current.id}"]`);
                        if (anchoredElement) {
                            const newRect = anchoredElement.getBoundingClientRect();
                            const scrollAdjustment = newRect.top - scrollAnchoringRef.current.top;
                            scrollRef.current.scrollTop += scrollAdjustment;
                        }
                        scrollAnchoringRef.current = null; // Clear anchor after adjustment
                    } else if (scrollRef.current && prevCountRef.current === 0) {
                        // Only force scroll to bottom on initial load
                        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
                    }
                }, 100);
            }
        };

        const handleHistoryError = (data: { chatId: string, error: string }) => {
            if (data.chatId === selectedChat) {
                setLoadingHistory(false);
                console.error('History fetch error:', data.error);
            }
        };

        socket.on('history_loaded', handleHistoryLoaded);
        socket.on('history_error', handleHistoryError);

        socket.on('handover_alert', (data: { number: string, name: string }) => {
            if (data.number === selectedChat) {
                setAiStatus(prev => ({ ...prev, handover_requested: 1 }));
            }
            showAlert({
                type: 'warning',
                title: 'AI Handover Requested',
                message: `${data.name || data.number} needs human intervention.`,
                autoDismiss: true,
                dismissAfter: 5000
            });
        });

        return () => {
            socket.off('history_loaded', handleHistoryLoaded);
            socket.off('history_error', handleHistoryError);
            socket.off('handover_alert');
        };
    }, [selectedChat, socket]);

    const handleSend = () => {
        if (!selectedChat || !onSendMessage) return;
        if (!messageText.trim() && selectedFiles.length === 0) return;

        // Extract attachments for the unified API
        const attachments = selectedFiles.map(f => ({ ...f }));

        onSendMessage(
            selectedChat,
            messageText,
            selectedFiles[0]?.url, // Keep first for backward compatibility in arguments
            selectedFiles[0]?.type,
            replyingTo?.whatsappId,
            replyingTo?.content,
            attachments, // Pass full attachments array as new parameter
            activeTemplateId || undefined
        );
        setMessageText('');
        setSelectedFiles([]);
        setReplyingTo(null);
        setActiveTemplateId(null);
    };

    const handleDeleteMessage = async (msg: MessageLog) => {
        if (!msg.id) return;

        // Premium confirmation modal instead of window.confirm
        const confirmed = await showConfirm({
            title: 'Delete Message?',
            message: 'This will permanently delete the message for everyone. This action cannot be undone.',
            confirmLabel: 'Delete for Everyone',
            cancelLabel: 'Cancel',
            type: 'danger',
        });

        if (!confirmed) return;

        try {
            const response = await fetch(`http://localhost:3001/api/messages/${msg.id}`, {
                method: 'DELETE'
            });
            const data = await response.json();
            if (data.success) {
                showAlert({
                    type: 'success',
                    title: 'Message Deleted',
                    message: 'The message has been deleted for everyone.',
                    autoDismiss: true,
                    dismissAfter: 3000,
                });
            } else {
                showAlert({
                    type: 'error',
                    title: 'Delete Failed',
                    message: data.error || 'Failed to delete the message. Please try again.',
                });
            }
        } catch (err) {
            console.error('Delete error:', err);
            showAlert({
                type: 'error',
                title: 'Network Error',
                message: 'Could not connect to the server. Please check your connection.',
            });
        }
    };

    const handleSelectionChange = () => {
        const input = document.getElementById('chat-message-input') as HTMLInputElement;
        if (input && input.selectionStart !== null && input.selectionEnd !== null && input.selectionStart !== input.selectionEnd) {
            setSelection({
                start: input.selectionStart,
                end: input.selectionEnd,
                text: messageText.substring(input.selectionStart, input.selectionEnd)
            });
        } else {
            setSelection(null);
        }
    };

    const applyFormat = (char: string) => {
        if (!selection) return;
        const input = document.getElementById('chat-message-input') as HTMLInputElement;
        const newText = messageText.substring(0, selection.start) + char + selection.text + char + messageText.substring(selection.end);
        setMessageText(newText);
        setSelection(null);
        setTimeout(() => {
            if (input) {
                input.focus();
                input.setSelectionRange(selection.start + char.length, selection.end + char.length);
            }
        }, 0);
    };

    const handleSelectTemplate = (template: Template, fromSlash = false) => {
        if (!selectedChat) return;
        const savedContact = contacts.find(c => c.phone === selectedChat);
        let content = template.content;

        // Variable Replacement
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        content = content.replace(/\[Name\]/gi, savedContact?.name || selectedChat);
        content = content.replace(/\[Phone\]/gi, selectedChat);
        content = content.replace(/\[Date\]/gi, dateStr);
        content = content.replace(/\[Time\]/gi, timeStr);
        content = content.replace(/\[Group\]/gi, savedContact?.groupNames || 'No Group');
        content = content.replace(/\[Email\]/gi, savedContact?.email || 'N/A');
        content = content.replace(/\[Address\]/gi, savedContact?.address || 'N/A');
        content = content.replace(/\[City\]/gi, savedContact?.city || 'N/A');
        content = content.replace(/\[Company\]/gi, savedContact?.companyName || 'N/A');
        content = content.replace(/\[Last\s*Purchase\]/gi, savedContact?.lastPurchase || 'N/A');

        setMessageText(prev => {
            if (fromSlash) {
                const lastSlashIdx = prev.lastIndexOf('/');
                if (lastSlashIdx !== -1) {
                    return prev.substring(0, lastSlashIdx) + content;
                }
            }
            return prev ? `${prev}\n${content}` : content;
        });

        setActiveTemplateId(template.id);

        // Media Integration
        const newAttachments: { url: string; type: string; name: string; phone?: string; lat?: any; lng?: any; caption?: string }[] = [];

        if (template.attachments && template.attachments.length > 0) {
            template.attachments.forEach(attach => {
                const processedName = (attach.name || '').replace(/\[Name\]/gi, savedContact?.name || selectedChat);
                const processedPhone = (attach.phone || '').replace(/\[Phone\]/gi, selectedChat);

                newAttachments.push({
                    ...attach,
                    name: processedName || attach.url.split('/').pop() || 'Attachment',
                    phone: processedPhone || attach.phone
                });
            });
        } else if (template.media_path) {
            newAttachments.push({
                url: template.media_path,
                type: template.media_type || 'image/jpeg',
                name: template.media_path.split('/').pop() || 'Template Attachment'
            });
        }

        if (newAttachments.length > 0) {
            setSelectedFiles(prev => [...prev, ...newAttachments]);
        }

        /* activeButtons setting removed */

        setShowTemplates(false);

        // Record template usage in the background (non-blocking)
        if (template.id) {
            fetch(`http://localhost:3001/api/templates/${template.id}/record-usage`, {
                method: 'POST'
            }).catch(err => console.error('Failed to record template usage:', err));
        }
    };



    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('http://localhost:3001/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            if (data.url) {
                setSelectedFiles(prev => [...prev, {
                    url: data.url,
                    type: data.mimetype,
                    name: file.name
                }]);
            }
        } catch (err) {
            console.error('Upload failed:', err);
        } finally {
            setIsUploading(false);
        }
    };

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Try to use OGG if supported (better for WhatsApp PTT)
            const mimeType = MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
                ? 'audio/ogg; codecs=opus'
                : 'audio/webm';

            const mediaRecorder = new MediaRecorder(stream, { mimeType });
            const chunks: Blob[] = [];

            mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
            mediaRecorder.onstop = async () => {
                const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
                const audioBlob = new Blob(chunks, { type: mimeType });
                const file = new File([audioBlob], `voice-note-${Date.now()}.${extension}`, { type: mimeType });

                // Automatically upload and set as selected file
                setIsUploading(true);
                const formData = new FormData();
                formData.append('file', file);

                try {
                    const response = await fetch('http://localhost:3001/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    if (data.url) {
                        setSelectedFiles(prev => [...prev, {
                            url: data.url,
                            type: mimeType,
                            name: 'Voice Note'
                        }]);
                    }
                } catch (err) {
                    console.error('Voice note upload failed:', err);
                } finally {
                    setIsUploading(false);
                }

                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            setRecorder(mediaRecorder);
            setIsRecording(true);
            setRecordingTime(0);
            recordingInterval.current = setInterval(() => {
                setRecordingTime(prev => prev + 1);
            }, 1000);
        } catch (err) {
            console.error('Microphone access denied:', err);
            showAlert({
                type: 'warning',
                title: 'Microphone Access Denied',
                message: 'Please allow microphone access to record voice messages.',
            });
        }
    };

    const stopRecording = () => {
        if (recorder) {
            recorder.stop();
            setIsRecording(false);
            clearInterval(recordingInterval.current);
        }
    };

    const cancelRecording = () => {
        if (recorder) {
            recorder.onstop = null; // Prevent the upload logic
            recorder.stop();
            setIsRecording(false);
            clearInterval(recordingInterval.current);
            recorder.stream.getTracks().forEach(track => track.stop());
        }
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const activeMessages = selectedChat ? [...(chats[selectedChat] || [])] : [];
    const activeChat = chatList.find(c => c.phone === selectedChat);

    return (
        <div className="w-full h-[calc(100vh-140px)] flex bg-white rounded-[2.5rem] shadow-2xl border border-white overflow-hidden relative">
            {/* Chat List Sidebar */}
            <div className={`w-full md:w-1/3 md:min-w-[320px] md:max-w-[400px] flex flex-col border-r border-gray-100 ${selectedChat ? 'hidden md:flex' : 'flex'}`}>
                <div className="p-6 md:p-8 bg-wa-sidebar text-white">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl md:text-2xl font-black">Messages</h2>
                    </div>
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="text"
                            placeholder="Search chats..."
                            className="w-full bg-wa-card border-none rounded-2xl py-3 pl-12 pr-4 text-sm font-medium outline-none focus:ring-1 focus:ring-wa-teal transition-all"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-wa-light custom-scrollbar">
                    {chatList.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4">
                            <MessageSquare size={48} className="opacity-20" />
                            <p className="font-bold italic">No messages yet</p>
                        </div>
                    ) : (
                        chatList.map((chat) => (
                            <motion.button
                                key={chat.phone}
                                whileHover={{ scale: 1.01, backgroundColor: 'rgba(255,255,255,0.8)' }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setSelectedChat(chat.phone)}
                                className={`w-full p-3 md:p-4 flex items-center gap-3 rounded-xl transition-all text-left relative group ${selectedChat === chat.phone ? 'bg-white shadow-sm ring-1 ring-gray-100' : 'hover:bg-white/60'}`}
                            >
                                <div className="relative">
                                    <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm ${selectedChat === chat.phone ? 'bg-gradient-to-br from-wa-teal to-emerald-600' : 'bg-gray-300'}`}>
                                        <User size={20} className="md:w-6 md:h-6" />
                                    </div>
                                    {chat.unread > 0 && (
                                        <div className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 bg-green-500 rounded-full border-2 border-white flex items-center justify-center">
                                            <span className="text-[9px] md:text-[10px] font-bold text-white leading-none">{chat.unread}</span>
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <span className={`font-bold truncate text-sm ${selectedChat === chat.phone ? 'text-gray-900' : 'text-gray-700'}`}>
                                            {chat.name}
                                        </span>
                                        <span className={`text-[10px] font-medium ${chat.unread > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                                            {chat.time}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <p className="text-xs text-gray-500 truncate max-w-[85%]">
                                            {chat.lastMessage}
                                        </p>
                                    </div>
                                </div>
                            </motion.button>
                        ))
                    )}
                </div>
            </div>

            {/* Main Chat Area */}
            <div className={`flex-1 flex flex-col bg-wa-bg ${!selectedChat ? 'hidden md:flex' : 'flex'} w-full md:w-2/3`}>
                {!selectedChat ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-6 p-10 text-center">
                        <div className="w-32 h-32 bg-white rounded-[2rem] shadow-xl flex items-center justify-center text-wa-teal mb-4">
                            <MessageSquare size={64} />
                        </div>
                        <div>
                            <h3 className="text-2xl font-black text-gray-800 mb-2">Select a Chat</h3>
                            <p className="text-gray-500 font-medium max-w-xs mx-auto italic">Pick someone from the left panel to start messaging with them in real-time.</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Header */}
                        <div className="px-6 py-4 bg-white/80 backdrop-blur-md text-gray-800 flex justify-between items-center shadow-sm border-b border-gray-100 z-10">
                            <div className="flex items-center gap-4 cursor-pointer" onClick={() => setShowContactInfo(!showContactInfo)}>
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedChat(null);
                                    }}
                                    className="p-2 hover:bg-gray-100 rounded-full transition-colors md:hidden mr-1"
                                >
                                    <ArrowLeft size={22} className="text-gray-600" />
                                </button>
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-wa-teal to-emerald-600 flex items-center justify-center text-white shadow-md">
                                    <User size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-lg leading-tight text-gray-900">{activeChat?.name}</h3>
                                    <div className="flex items-center gap-1.5 opacity-80">
                                        <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-400'}`}></span>
                                        <span className="text-xs font-medium text-gray-500">
                                            {isConnected ? 'Online' : 'Offline'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                {/* Smart AI Toggle */}
                                <div className="relative group">
                                    <button
                                        onClick={toggleAI}
                                        className={`p-2.5 rounded-full transition-all duration-300 relative flex items-center justify-center ${aiStatus.ai_paused === 0
                                            ? 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                            }`}
                                        title={aiStatus.ai_paused === 0 ? 'AI Auto-Reply is ON (Click to Pause)' : 'AI Auto-Reply is PAUSED (Click to Resume)'}
                                    >
                                        <Zap size={20} className={aiStatus.ai_paused === 0 ? 'fill-current' : ''} />
                                        
                                        {/* Handover Pulse indicator */}
                                        {aiStatus.handover_requested === 1 && (
                                            <span className="absolute inset-0 rounded-full border-2 border-rose-500 animate-ping opacity-75"></span>
                                        )}
                                        {aiStatus.handover_requested === 1 && (
                                            <span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 rounded-full border-2 border-white"></span>
                                        )}
                                    </button>
                                    
                                    {/* Tooltip hint */}
                                    <div className="absolute top-full right-0 mt-2 p-2 bg-gray-900 text-white text-[10px] font-bold rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                                        {aiStatus.ai_paused === 0 ? 'AI ACTIVE' : 'AI PAUSED (MANUAL MODE)'}
                                        {aiStatus.handover_requested === 1 && ' • HANDOVER REQUESTED'}
                                    </div>
                                </div>

                                <button className="p-2.5 hover:bg-wa-light rounded-full transition-all duration-200 text-wa-teal">
                                    <Video size={20} />
                                </button>
                                <button className="p-2.5 hover:bg-wa-light rounded-full transition-all duration-200 text-wa-teal">
                                    <Phone size={20} />
                                </button>
                                <div className="h-6 w-[1px] bg-gray-200 mx-1"></div>
                                <button
                                    onClick={() => setShowContactInfo(!showContactInfo)}
                                    className={`p-2.5 rounded-full transition-all duration-200 ${showContactInfo ? 'bg-wa-teal text-white shadow-md' : 'hover:bg-wa-light text-gray-500'}`}
                                >
                                    <Info size={20} />
                                </button>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <div
                            ref={scrollRef}
                            onScroll={handleScroll}
                            className="flex-1 overflow-y-auto overflow-x-hidden pl-6 pr-10 py-6 space-y-4 custom-scrollbar"
                        >
                            <div className="flex flex-col items-center justify-center mb-8 gap-3 min-h-[60px]">
                                {loadingHistory ? (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.8 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex flex-col items-center gap-2"
                                    >
                                        <div className="w-8 h-8 border-4 border-wa-teal/20 border-t-wa-teal rounded-full animate-spin shadow-sm"></div>
                                        <span className="text-[10px] font-black text-wa-teal uppercase tracking-widest animate-pulse">Loading history...</span>
                                    </motion.div>
                                ) : (
                                    <button
                                        onClick={fetchMoreHistory}
                                        disabled={loadingHistory || !hasMoreHistory}
                                        className="px-4 py-1.5 bg-white/50 backdrop-blur-md rounded-xl text-[10px] font-black text-gray-400 uppercase tracking-widest border border-white/20 shadow-sm hover:bg-wa-teal/10 hover:text-wa-teal transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                                    >
                                        {hasMoreHistory ? 'Click or Scroll up for more' : 'End-to-End Encrypted'}
                                    </button>
                                )}
                            </div>

                            <AnimatePresence initial={false}>
                                {activeMessages.map((msg, idx) => {
                                    const isSystem = msg.type === 'sent';

                                    // Determine if we need to show a date header
                                    const currentMsgDate = formatDateHeader(msg.timestamp);
                                    let showDateHeader = false;

                                    if (idx === 0) {
                                        showDateHeader = true;
                                    } else {
                                        const prevMsgDate = formatDateHeader(activeMessages[idx - 1].timestamp);
                                        if (currentMsgDate !== prevMsgDate) {
                                            showDateHeader = true;
                                        }
                                    }

                                    return (
                                        <React.Fragment key={msg.whatsappId || idx}>
                                            {/* Floating Date Header */}
                                            {showDateHeader && (
                                                <div className="sticky top-2 z-30 flex justify-center w-full my-6 pointer-events-none">
                                                    <div className="bg-white/80 backdrop-blur-md shadow-sm border border-black/5 text-gray-600 text-[11px] font-bold px-4 py-1.5 rounded-full uppercase tracking-widest pointer-events-auto">
                                                        {currentMsgDate}
                                                    </div>
                                                </div>
                                            )}

                                            <motion.div
                                                data-message-id={msg.whatsappId}
                                                // If bulk messages (initial load), skip animation entirely to save CPU and stop jitter
                                                initial={activeMessages.length > 10 ? false : { opacity: 0, y: 10, scale: 0.95 }}
                                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                                transition={
                                                    activeMessages.length > 10
                                                        ? { duration: 0 } // Completely disable for bulk
                                                        : {
                                                            duration: 0.2,
                                                            ease: "easeOut",
                                                            y: { type: "spring", stiffness: 300, damping: 30 }
                                                        }
                                                }
                                                className={`flex ${isSystem ? 'justify-end' : 'justify-start'} group/msg relative`}
                                            >
                                                <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm relative group ${isSystem
                                                    ? 'bg-wa-message-sent text-wa-sidebar rounded-tr-none'
                                                    : 'bg-white text-wa-sidebar rounded-tl-none'
                                                    }`}>
                                                    {/* Hover Actions (Reply/React) - Positioned ABOVE for stability and no clipping */}
                                                    <div className={`absolute -top-10 ${isSystem ? 'right-0' : 'left-0'} opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 z-20 pointer-events-none group-hover:pointer-events-auto pb-4`}>
                                                        <div className="flex bg-white/95 backdrop-blur-xl shadow-xl rounded-full px-3 py-1.5 border border-white/50 items-center gap-2 ring-1 ring-black/5">
                                                            {!isSystem && (
                                                                <>
                                                                    <div className="flex items-center gap-1">
                                                                        {['❤️', '👍', '😂', '😮', '😢', '🙏'].map(emoji => (
                                                                            <button
                                                                                key={emoji}
                                                                                onClick={() => {
                                                                                    const newReaction = msg.reaction === emoji ? '' : emoji;
                                                                                    onSendReaction?.(msg.whatsappId!, newReaction);
                                                                                }}
                                                                                className={`w-8 h-8 flex items-center justify-center hover:scale-125 rounded-full transition-all text-sm active:scale-95 ${msg.reaction === emoji ? 'bg-wa-teal/20 scale-110 shadow-sm border border-wa-teal/30' : 'hover:bg-gray-100'}`}
                                                                            >
                                                                                {emoji}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                    <div className="w-[1px] h-4 bg-gray-200 mx-1"></div>
                                                                </>
                                                            )}

                                                            <button
                                                                onClick={() => setReplyingTo(msg)}
                                                                className="w-8 h-8 flex items-center justify-center hover:scale-110 hover:bg-gray-100 rounded-full transition-all text-wa-teal active:scale-95"
                                                                title="Reply"
                                                            >
                                                                <CornerUpLeft size={18} />
                                                            </button>

                                                            {isSystem && (
                                                                <>
                                                                    <div className="w-[1px] h-4 bg-gray-200 mx-1"></div>
                                                                    <button
                                                                        onClick={() => handleDeleteMessage(msg)}
                                                                        className="w-8 h-8 flex items-center justify-center hover:scale-110 hover:bg-red-50 rounded-full transition-all text-red-500 active:scale-95"
                                                                        title="Delete for Everyone"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                    <div className="w-[1px] h-4 bg-gray-200 mx-1"></div>
                                                                    <div className="flex items-center gap-1">
                                                                        {['❤️', '👍', '😂', '😮', '😢', '🙏'].map(emoji => (
                                                                            <button
                                                                                key={emoji}
                                                                                onClick={() => {
                                                                                    const newReaction = msg.reaction === emoji ? '' : emoji;
                                                                                    onSendReaction?.(msg.whatsappId!, newReaction);
                                                                                }}
                                                                                className={`w-8 h-8 flex items-center justify-center hover:scale-125 rounded-full transition-all text-sm active:scale-95 ${msg.reaction === emoji ? 'bg-wa-teal/20 scale-110 shadow-sm border border-wa-teal/30' : 'hover:bg-gray-100'}`}
                                                                            >
                                                                                {emoji}
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {msg.quotedMsg && (
                                                        <div className="mb-2 p-3 bg-black/5 rounded-xl border-l-4 border-wa-teal text-xs italic opacity-80 line-clamp-2">
                                                            {msg.quotedMsg}
                                                        </div>
                                                    )}
                                                    {msg.mediaPath && (
                                                        <div className="mb-2 rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                                                            {msg.mediaType?.startsWith('image/') ? (
                                                                <img
                                                                    src={`http://localhost:3001${msg.mediaPath}`}
                                                                    alt="Media"
                                                                    className="max-w-full h-auto object-cover cursor-pointer hover:opacity-95 transition-opacity"
                                                                    onClick={() => window.open(`http://localhost:3001${msg.mediaPath}`, '_blank')}
                                                                />
                                                            ) : msg.mediaType === 'vcard' ? (() => {
                                                                const meta = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
                                                                return (
                                                                    <div className="flex flex-col gap-2 p-4 bg-white border border-gray-100 rounded-xl shadow-sm min-w-[220px]">
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="w-10 h-10 rounded-full bg-wa-teal/10 flex items-center justify-center text-wa-teal shrink-0">
                                                                                <User size={20} />
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <p className="text-sm font-bold truncate text-gray-800">{meta.name || 'Contact'}</p>
                                                                                <p className="text-xs text-gray-500 truncate">{meta.phone || 'No phone'}</p>
                                                                            </div>
                                                                        </div>
                                                                        <button
                                                                            className="w-full py-2 bg-gray-50 hover:bg-wa-teal/5 rounded-lg text-xs font-bold text-wa-teal transition-all border border-gray-100 active:scale-95"
                                                                            onClick={() => {
                                                                                const vcfData = `BEGIN:VCARD\nVERSION:3.0\nFN:${meta.name}\nTEL;type=CELL;waid=${meta.phone}:+${meta.phone}\nEND:VCARD`;
                                                                                const blob = new Blob([vcfData], { type: 'text/vcard' });
                                                                                const url = window.URL.createObjectURL(blob);
                                                                                const link = document.createElement('a');
                                                                                link.href = url;
                                                                                link.setAttribute('download', `${meta.name || 'contact'}.vcf`);
                                                                                document.body.appendChild(link);
                                                                                link.click();
                                                                                document.body.removeChild(link);
                                                                            }}
                                                                        >
                                                                            Download Contact
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })() : msg.mediaType === 'location' ? (() => {
                                                                const meta = msg.metadata ? (typeof msg.metadata === 'string' ? JSON.parse(msg.metadata) : msg.metadata) : {};
                                                                return (
                                                                    <div
                                                                        className="flex flex-col gap-2 p-3 bg-white border border-gray-100 rounded-xl shadow-sm cursor-pointer hover:bg-gray-50 transition-colors max-w-[220px]"
                                                                        onClick={() => window.open(`https://www.google.com/maps?q=${meta.lat},${meta.lng}`, '_blank')}
                                                                    >
                                                                        <div className="flex items-center gap-2 text-wa-teal mb-1">
                                                                            <MapPin size={16} />
                                                                            <span className="text-xs font-bold">Location Shared</span>
                                                                        </div>
                                                                        <div className="text-[10px] text-gray-500 bg-gray-100 p-2 rounded-lg break-all">
                                                                            {meta.name || `Lat: ${meta.lat}, Lng: ${meta.lng}`}
                                                                        </div>
                                                                        <span className="text-[10px] text-blue-500 underline font-medium">View on Google Maps</span>
                                                                    </div>
                                                                );
                                                            })() : msg.mediaType?.startsWith('audio/') ? (
                                                                <VoiceMessage
                                                                    url={`http://localhost:3001${msg.mediaPath}`}
                                                                    isSystem={isSystem}
                                                                />
                                                            ) : (
                                                                <a
                                                                    href={`http://localhost:3001${msg.mediaPath}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex items-center gap-3 p-3 text-xs font-bold text-wa-teal hover:bg-gray-100 transition-colors"
                                                                >
                                                                    <Paperclip size={16} />
                                                                    <span className="truncate max-w-[200px]">{msg.mediaPath.split('-').slice(1).join('-')}</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    )}
                                                    <p className="text-sm font-medium leading-relaxed mb-1">{msg.content}</p>
                                                    <div className={`flex items-center justify-end gap-1 ${isSystem ? 'text-wa-sent' : 'text-gray-400'}`}>
                                                        <span className="text-[9px] font-black uppercase opacity-60">
                                                            {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                        {isSystem && (
                                                            <div className="flex items-center -ml-0.5">
                                                                {msg.status === 'read' ? (
                                                                    <CheckCheck size={13} className="text-[#34B7F1] drop-shadow-sm" />
                                                                ) : msg.status === 'delivered' ? (
                                                                    <CheckCheck size={13} className="text-gray-400 opacity-80" />
                                                                ) : (
                                                                    <Check size={13} className="text-gray-400 opacity-80" />
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                    {msg.reaction && (
                                                        <div className={`absolute -bottom-3 ${isSystem ? 'left-2' : 'right-2'} p-1 bg-white shadow-md rounded-full text-xs animate-bounce`}>
                                                            {msg.reaction}
                                                        </div>
                                                    )}
                                                </div>
                                            </motion.div>
                                        </React.Fragment>
                                    );
                                })}
                            </AnimatePresence>
                        </div>

                        {/* Input Area */}
                        <div className="p-4 bg-wa-light border-t border-gray-200">
                            {replyingTo && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="mb-3 p-4 bg-white rounded-2xl shadow-sm border-l-4 border-wa-teal flex justify-between items-center group/reply"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] font-black text-wa-teal uppercase tracking-widest mb-1">Replying to {replyingTo.contactName}</p>
                                        <p className="text-xs text-gray-500 truncate font-medium">{replyingTo.content}</p>
                                    </div>
                                    <button
                                        onClick={() => setReplyingTo(null)}
                                        className="p-1.5 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                                    >
                                        <X size={16} />
                                    </button>
                                </motion.div>
                            )}
                            <div className="flex items-center gap-4">
                                <div className="flex gap-2 relative">
                                    <Smile size={24} className="text-gray-500 cursor-pointer hover:text-wa-teal transition-colors" />
                                    <Paperclip
                                        size={24}
                                        className={`text-gray-500 cursor-pointer hover:text-wa-teal transition-colors ${isUploading ? 'animate-pulse text-wa-teal' : ''}`}
                                        onClick={() => fileInputRef.current?.click()}
                                    />
                                    <Zap
                                        size={24}
                                        className={`cursor-pointer hover:text-amber-500 transition-colors ${(showTemplates || slashActive) ? 'text-amber-500' : 'text-gray-500'}`}
                                        onClick={() => { setShowTemplates(!showTemplates); setShowVariables(false); }}
                                    />
                                    <div
                                        className={`cursor-pointer hover:text-blue-500 transition-colors flex items-center justify-center w-6 h-6 font-mono font-black text-lg ${showVariables ? 'text-blue-500' : 'text-gray-500'}`}
                                        onClick={() => { setShowVariables(!showVariables); setShowTemplates(false); }}
                                        title="Insert Variable"
                                    >
                                        {'{ }'}
                                    </div>
                                    <input
                                        type="file"
                                        ref={fileInputRef}
                                        onChange={handleFileChange}
                                        className="hidden"
                                    />
                                    {(showTemplates || slashActive) && (
                                        <div className="absolute bottom-12 left-0 w-64 max-h-80 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col z-50">
                                            <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                                                <div className="flex gap-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-wa-teal">Templates</span>
                                                </div>
                                                <X size={14} className="cursor-pointer text-gray-400" onClick={() => { setShowTemplates(false); setSlashActive(false); setFocusedTemplateIndex(0); }} />
                                            </div>
                                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                                {(() => {
                                                    const filteredTemplates = slashActive
                                                        ? templates.filter(t => t.title.toLowerCase().includes(slashQuery.toLowerCase()))
                                                        : templates;

                                                    if (filteredTemplates.length === 0) {
                                                        return <div className="p-4 text-center text-[10px] font-bold text-gray-400">No templates found</div>;
                                                    }

                                                    return filteredTemplates.map((t, idx) => (
                                                        <button
                                                            key={t.id}
                                                            onClick={() => {
                                                                handleSelectTemplate(t, slashActive);
                                                                setShowTemplates(false);
                                                                setSlashActive(false);
                                                                setFocusedTemplateIndex(0);
                                                            }}
                                                            className={`w-full p-3 text-left border-b border-gray-50 last:border-none transition-colors group ${slashActive && idx === focusedTemplateIndex ? 'bg-wa-teal/10' : 'hover:bg-wa-light'}`}
                                                        >
                                                            <p className="text-xs font-black text-gray-800 mb-0.5 group-hover:text-wa-teal">{t.title}</p>
                                                            <p className="text-[10px] text-gray-500 truncate">{t.content}</p>
                                                        </button>
                                                    ));
                                                })()}
                                            </div>
                                        </div>
                                    )}
                                    {showVariables && (
                                        <div className="absolute bottom-12 left-0 w-64 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col z-50">
                                            <div className="p-3 bg-gray-50 border-b flex justify-between items-center">
                                                <div className="flex gap-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Variables</span>
                                                </div>
                                                <X size={14} className="cursor-pointer text-gray-400" onClick={() => setShowVariables(false)} />
                                            </div>
                                            <div className="p-2 grid grid-cols-2 gap-2 custom-scrollbar max-h-60 overflow-y-auto">
                                                {[
                                                    { tag: '[Name]', label: 'Name', color: 'bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:border-blue-300' },
                                                    { tag: '[Phone]', label: 'Phone', color: 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300' },
                                                    { tag: '[Date]', label: 'Date', color: 'bg-amber-50 text-amber-600 border-amber-200 hover:bg-amber-100 hover:border-amber-300' },
                                                    { tag: '[Time]', label: 'Time', color: 'bg-purple-50 text-purple-600 border-purple-200 hover:bg-purple-100 hover:border-purple-300' },
                                                    { tag: '[Group]', label: 'Group', color: 'bg-rose-50 text-rose-600 border-rose-200 hover:bg-rose-100 hover:border-rose-300' },
                                                    { tag: '[Email]', label: 'Email', color: 'bg-cyan-50 text-cyan-600 border-cyan-200 hover:bg-cyan-100 hover:border-cyan-300' },
                                                    { tag: '[Address]', label: 'Address', color: 'bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 hover:border-orange-300' },
                                                    { tag: '[City]', label: 'City', color: 'bg-indigo-50 text-indigo-600 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300' },
                                                    { tag: '[Company]', label: 'Company', color: 'bg-pink-50 text-pink-600 border-pink-200 hover:bg-pink-100 hover:border-pink-300' }
                                                ].map(v => (
                                                    <button
                                                        key={v.tag}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            const input = document.getElementById('chat-message-input') as HTMLInputElement;
                                                            if (input) {
                                                                const start = input.selectionStart || 0;
                                                                const end = input.selectionEnd || 0;
                                                                const newText = messageText.substring(0, start) + v.tag + messageText.substring(end);
                                                                setMessageText(newText);
                                                                setTimeout(() => {
                                                                    input.focus();
                                                                    input.setSelectionRange(start + v.tag.length, start + v.tag.length);
                                                                }, 0);
                                                            } else {
                                                                setMessageText(prev => prev + v.tag);
                                                            }
                                                            setShowVariables(false);
                                                        }}
                                                        className={`py-2 px-1 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center justify-center gap-1 ${v.color}`}
                                                        title={`Click to insert ${v.tag}`}
                                                    >
                                                        <span className="opacity-50 text-[10px] normal-case font-mono font-medium">{'{'}</span>
                                                        {v.label}
                                                        <span className="opacity-50 text-[10px] normal-case font-mono font-medium">{'}'}</span>
                                                    </button>
                                                ))}

                                                <button
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setShowVariables(false);
                                                        setShowSpintaxModal(true);
                                                    }}
                                                    className="col-span-2 py-2.5 px-3 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-50 to-purple-50 text-indigo-600 border-indigo-200 hover:from-indigo-100 hover:to-purple-100"
                                                    title="Open Spintax Builder"
                                                >
                                                    <Shuffle size={14} />
                                                    Spintax Builder
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {selectedFiles.length > 0 && (
                                        <div className="absolute bottom-16 left-0 bg-white p-2 ml-4 mb-2 flex gap-3 overflow-x-auto max-w-lg shadow-2xl rounded-2xl border border-gray-100 z-50 custom-scrollbar">
                                            {selectedFiles.map((f, i) => (
                                                <div key={i} className="flex flex-col gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100 min-w-[180px] max-w-[200px] shrink-0 relative group">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 bg-white shadow-sm border border-gray-100 rounded-lg flex items-center justify-center text-wa-teal shrink-0">
                                                            {f.type.startsWith('image/') ? (
                                                                <img src={f.url.startsWith('http') ? f.url : `http://localhost:3001${f.url}`} alt="Preview" className="w-full h-full object-cover rounded-lg" />
                                                            ) : (
                                                                <Paperclip size={16} />
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] font-bold text-gray-700 truncate flex-1 leading-tight">{f.name}</span>
                                                    </div>
                                                    <input
                                                        type="text"
                                                        placeholder="Add caption..."
                                                        className="w-full bg-white px-2 py-1.5 text-[10px] rounded-md outline-none border-b border-transparent focus:border-wa-teal transition-all text-gray-700 placeholder-gray-400"
                                                        value={f.caption || ''}
                                                        onChange={(e) => {
                                                            const newFiles = [...selectedFiles];
                                                            newFiles[i].caption = e.target.value;
                                                            setSelectedFiles(newFiles);
                                                        }}
                                                    />
                                                    <X
                                                        size={16}
                                                        className="text-red-500 cursor-pointer hover:scale-110 transition-transform bg-white rounded-full p-[3px] shadow-md absolute -top-2 -right-2 opacity-0 group-hover:opacity-100"
                                                        onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {selection && (
                                        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-700 text-white rounded-[1rem] shadow-2xl flex items-center p-1.5 z-[100] gap-1 animate-in fade-in slide-in-from-bottom-2">
                                            <button onMouseDown={(e) => { e.preventDefault(); applyFormat('*'); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="Bold"><Bold size={16} /></button>
                                            <button onMouseDown={(e) => { e.preventDefault(); applyFormat('_'); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="Italic"><Italic size={16} /></button>
                                            <button onMouseDown={(e) => { e.preventDefault(); applyFormat('~'); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="Strikethrough"><Strikethrough size={16} /></button>
                                            <button onMouseDown={(e) => { e.preventDefault(); applyFormat('```'); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors" title="Monospace"><Code size={16} /></button>
                                            <div className="w-px h-5 bg-gray-700 mx-1"></div>
                                            <button onMouseDown={(e) => { e.preventDefault(); navigator.clipboard.writeText(selection.text); setSelection(null); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-blue-400" title="Copy"><Copy size={16} /></button>
                                            <button onMouseDown={(e) => { e.preventDefault(); setMessageText(prev => prev.substring(0, selection.start) + prev.substring(selection.end)); setSelection(null); }} className="p-2 hover:bg-gray-800 rounded-lg transition-colors text-red-400" title="Delete"><Trash2 size={16} /></button>
                                        </div>
                                    )}
                                </div>
                                {isRecording ? (
                                    <div className="flex-1 flex items-center gap-4 bg-wa-teal/10 rounded-2xl px-6 py-3">
                                        <div className="flex items-center gap-2 animate-pulse text-red-500">
                                            <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                            <span className="text-xs font-bold uppercase tracking-widest">{formatDuration(recordingTime)}</span>
                                        </div>
                                        <div className="flex-1 text-sm font-medium text-wa-teal">Recording voice message...</div>
                                        <X
                                            size={20}
                                            className="text-gray-400 cursor-pointer hover:text-red-500 transition-colors"
                                            onClick={cancelRecording}
                                        />
                                    </div>
                                ) : (
                                    <div className="flex-1">
                                        <input
                                            id="chat-message-input"
                                            type="text"
                                            value={messageText}
                                            onMouseUp={handleSelectionChange}
                                            onKeyUp={handleSelectionChange}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setMessageText(val);

                                                const lastSlashIdx = val.lastIndexOf('/');
                                                if (lastSlashIdx !== -1 && (lastSlashIdx === 0 || val[lastSlashIdx - 1] === ' ' || val[lastSlashIdx - 1] === '\n')) {
                                                    const query = val.slice(lastSlashIdx + 1);
                                                    if (!query.includes(' ')) {
                                                        setSlashActive(true);
                                                        setSlashQuery(query);
                                                        setFocusedTemplateIndex(0);

                                                        const exactMatch = templates.find(t =>
                                                            t.title.toLowerCase() === query.toLowerCase() ||
                                                            t.title.toLowerCase().replace(/\s+/g, '') === query.toLowerCase()
                                                        );

                                                        if (query.length > 0 && exactMatch) {
                                                            handleSelectTemplate(exactMatch, true);
                                                            setSlashActive(false);
                                                            setSlashQuery('');
                                                        }
                                                        return;
                                                    }
                                                }
                                                setSlashActive(false);
                                                if (selection) setSelection(null);
                                            }}
                                            onKeyDown={(e) => {
                                                if (slashActive) {
                                                    const filteredTemplates = templates.filter(t => t.title.toLowerCase().includes(slashQuery.toLowerCase()));
                                                    if (e.key === 'ArrowDown') {
                                                        e.preventDefault();
                                                        setFocusedTemplateIndex(prev => Math.min(prev + 1, filteredTemplates.length - 1));
                                                    } else if (e.key === 'ArrowUp') {
                                                        e.preventDefault();
                                                        setFocusedTemplateIndex(prev => Math.max(prev - 1, 0));
                                                    } else if (e.key === 'Enter' && filteredTemplates.length > 0) {
                                                        e.preventDefault();
                                                        handleSelectTemplate(filteredTemplates[focusedTemplateIndex], true);
                                                        setShowTemplates(false);
                                                        setSlashActive(false);
                                                        setSlashQuery('');
                                                        setFocusedTemplateIndex(0);
                                                    } else if (e.key === 'Escape') {
                                                        setSlashActive(false);
                                                    }
                                                } else if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    handleSend();
                                                }
                                            }}
                                            placeholder={selectedFiles.length > 0 ? "Add a caption..." : "Type a message..."}
                                            className="w-full bg-white border-none rounded-2xl py-3 px-6 text-sm font-medium outline-none shadow-sm focus:ring-1 focus:ring-wa-teal transition-all"
                                        />
                                    </div>
                                )}

                                {isRecording ? (
                                    <motion.button
                                        whileHover={{ scale: 1.1 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={stopRecording}
                                        className="p-3 rounded-full shadow-lg bg-red-500 text-white"
                                    >
                                        <Send size={20} />
                                    </motion.button>
                                ) : (
                                    <>
                                        {messageText.trim() || selectedFiles.length > 0 ? (
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={handleSend}
                                                className="p-3 rounded-full shadow-lg bg-wa-teal text-white"
                                            >
                                                <Send size={20} />
                                            </motion.button>
                                        ) : (
                                            <motion.button
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                onClick={startRecording}
                                                className="p-3 rounded-full shadow-lg bg-wa-teal text-white"
                                            >
                                                <Mic size={20} />
                                            </motion.button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* Contact Info Panel - Floating Overlay */}
            <AnimatePresence>
                {selectedChat && showContactInfo && (
                    <>
                        {/* Backdrop Blur Overlay */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowContactInfo(false)}
                            className="absolute inset-0 bg-black/5 backdrop-blur-sm z-20 transition-all"
                        />

                        {/* Floating Panel */}
                        <motion.div
                            initial={{ x: '100%', opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: '100%', opacity: 0 }}
                            transition={{ type: "spring", damping: 25, stiffness: 200 }}
                            className="absolute top-4 right-4 bottom-4 w-[350px] bg-white/90 backdrop-blur-md rounded-[2rem] shadow-2xl border border-white/50 z-30 flex flex-col overflow-hidden"
                        >
                            <div className="p-8 h-full overflow-y-auto custom-scrollbar relative">
                                <button
                                    onClick={() => setShowContactInfo(false)}
                                    className="absolute top-6 right-6 p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400"
                                >
                                    <X size={20} />
                                </button>

                                <div className="text-center mb-8 pt-4">
                                    <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-tr from-wa-teal to-emerald-500 border-4 border-white shadow-xl flex items-center justify-center text-white mb-4">
                                        <User size={48} />
                                    </div>
                                    <h2 className="text-xl font-bold text-gray-800 mb-1">{activeChat?.name}</h2>
                                    <p className="text-wa-teal font-medium">{activeChat?.phone}</p>
                                </div>

                                <div className="space-y-6">
                                    {isFetchingProfile ? (
                                        <div className="flex flex-col items-center justify-center py-12 space-y-4">
                                            <div className="w-8 h-8 border-4 border-wa-teal border-t-transparent rounded-full animate-spin"></div>
                                            <p className="text-xs font-black text-gray-400 uppercase tracking-widest">Fetching Intel...</p>
                                        </div>
                                    ) : profileData?.contact ? (
                                        <>
                                            {/* Intelligence Overview */}
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="bg-wa-teal p-4 rounded-2xl shadow-lg shadow-wa-teal/20 text-white flex flex-col items-center">
                                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-70 mb-1">Funnel Stage</p>
                                                    <span className="text-xs font-black uppercase">{profileData.contact.lifecycle_stage || 'Lead'}</span>
                                                </div>
                                                <div className="bg-white p-4 rounded-2xl border border-wa-teal/20 flex flex-col items-center box-border">
                                                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Sentiment</p>
                                                    <div className="flex items-center gap-2">
                                                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${profileData.contact.sentiment_score > 70 ? 'bg-emerald-500' : 'bg-amber-500'}`}></div>
                                                        <span className={`text-xs font-black ${profileData.contact.sentiment_score > 70 ? 'text-emerald-600' : 'text-amber-600'}`}>{profileData.contact.sentiment_score || 100}%</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* 📊 Behavioral Gauges (Dynamic Indicators) */}
                                            <div className="p-5 bg-gradient-to-br from-slate-50 to-white rounded-3xl border border-gray-100 shadow-sm space-y-5">
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Behavioral Intelligence</h4>
                                                
                                                {/* Interest Meter */}
                                                <div className="space-y-2">
                                                    <div className="flex justify-between items-center px-1">
                                                        <span className="text-[10px] font-bold text-gray-600">Interest Meter</span>
                                                        <span className="text-[10px] font-black text-wa-teal">{profileData.contact.interest_score || 0}%</span>
                                                    </div>
                                                    <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                                                        <motion.div 
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${profileData.contact.interest_score || 0}%` }}
                                                            className="h-full bg-gradient-to-r from-wa-teal to-emerald-400 rounded-full"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-4">
                                                    {/* Trust Score */}
                                                    <div className="space-y-2">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-tight">Trust Score</p>
                                                        <div className="flex items-end gap-1">
                                                            <span className="text-lg font-black text-indigo-600 leading-none">{profileData.contact.loyalty_score || 0}%</span>
                                                            <div className="flex gap-0.5 mb-1">
                                                                {[...Array(5)].map((_, i) => (
                                                                    <div key={i} className={`w-1 h-3 rounded-full ${i < ((profileData.contact.loyalty_score || 0) / 20) ? 'bg-indigo-500' : 'bg-gray-100'}`} />
                                                                ))}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Price Sensitivity */}
                                                    <div className="space-y-2">
                                                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-tight">Price Sensitivity</p>
                                                        <div className="flex items-center gap-2">
                                                            <div className={`px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-tighter ${
                                                                (profileData.contact.price_sensitivity_score || 0) > 60 ? 'bg-rose-50 text-rose-500 border border-rose-100' : 
                                                                (profileData.contact.price_sensitivity_score || 0) > 30 ? 'bg-amber-50 text-amber-600 border border-amber-100' :
                                                                'bg-emerald-50 text-emerald-600 border border-emerald-100'
                                                            }`}>
                                                                {(profileData.contact.price_sensitivity_score || 0) > 60 ? 'Hard Bargainer' : 
                                                                 (profileData.contact.price_sensitivity_score || 0) > 30 ? 'Value Seeker' : 'Premium'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Revenue / LTV */}
                                            <div className="bg-gradient-to-br from-gray-900 to-slate-800 p-5 rounded-2xl shadow-xl border border-slate-700">
                                                <div className="flex justify-between items-center mb-1">
                                                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em]">Customer Lifetime Value</p>
                                                    <Zap size={14} className="text-amber-400 animate-pulse" />
                                                </div>
                                                <p className="text-2xl font-black text-white">৳{profileData.contact.lifetime_value || 0}</p>
                                            </div>

                                            {/* AI Infinite Memory (Summary) */}
                                            {profileData.contact.ai_memory_summary && (
                                                <div className="bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100/50">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <Clock size={12} className="text-emerald-500" />
                                                        <h4 className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">AI Context Memory</h4>
                                                    </div>
                                                    <div className="text-[11px] font-medium text-emerald-800 leading-relaxed italic">
                                                        {profileData.contact.ai_memory_summary.split('\n').map((line: string, i: number) => (
                                                            <div key={i} className="mb-1 last:mb-0 flex gap-2">
                                                                <span className="text-emerald-300">•</span>
                                                                <span>{line.replace(/^[•\-\*]\s*/, '')}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Tag Manager */}
                                            <div className="space-y-3">
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Knowledge Tags</h4>
                                                <div className="flex flex-wrap gap-2 p-2 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 relative">
                                                    {(profileData.contact.tags ? (typeof profileData.contact.tags === 'string' ? JSON.parse(profileData.contact.tags) : profileData.contact.tags) : []).map((tag: string, i: number) => (
                                                        <span key={i} className="flex items-center gap-1.5 bg-white border border-gray-200 px-3 py-1.5 rounded-xl text-[10px] font-black text-gray-600 shadow-sm group">
                                                            #{tag}
                                                            <button 
                                                                onClick={async () => {
                                                                    const currentTags = typeof profileData.contact.tags === 'string' ? JSON.parse(profileData.contact.tags) : profileData.contact.tags;
                                                                    const nextTags = currentTags.filter((t: string) => t !== tag);
                                                                    try {
                                                                        await fetch(`http://localhost:3001/api/contacts/${profileData.contact.id}/tags`, {
                                                                            method: 'PUT',
                                                                            headers: { 'Content-Type': 'application/json' },
                                                                            body: JSON.stringify({ tags: JSON.stringify(nextTags) })
                                                                        });
                                                                        setProfileData({ ...profileData, contact: { ...profileData.contact, tags: JSON.stringify(nextTags) } });
                                                                    } catch (e) {
                                                                        console.error('Failed to remove tag', e);
                                                                    }
                                                                }}
                                                                className="opacity-0 group-hover:opacity-100 text-rose-400 hover:text-rose-600 transition-all"
                                                            >
                                                                <X size={10} />
                                                            </button>
                                                        </span>
                                                    ))}
                                                    
                                                    <div className="relative">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowTagPicker(!showTagPicker);
                                                            }}
                                                            className="flex items-center gap-1.5 bg-wa-teal/5 border border-wa-teal/20 px-3 py-1.5 rounded-xl text-[10px] font-black text-wa-teal hover:bg-wa-teal hover:text-white transition-all shadow-sm"
                                                        >
                                                            <Plus size={10} />
                                                            Add Tag
                                                        </button>

                                                        <AnimatePresence>
                                                            {showTagPicker && (
                                                                <>
                                                                    <div className="fixed inset-0 z-40" onClick={() => setShowTagPicker(false)} />
                                                                    <motion.div
                                                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                                                        exit={{ opacity: 0, scale: 0.95 }}
                                                                        className="absolute left-0 top-full mt-2 w-48 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden py-2"
                                                                    >
                                                                        <div className="px-3 py-2 border-b border-gray-50 mb-1">
                                                                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Available from AI Rules</p>
                                                                        </div>
                                                                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                                                                            {availableTags.length > 0 ? (
                                                                                availableTags
                                                                                    .filter(tag => !(profileData.contact.tags ? (typeof profileData.contact.tags === 'string' ? JSON.parse(profileData.contact.tags) : profileData.contact.tags) : []).includes(tag))
                                                                                    .map((tag, idx) => (
                                                                                        <button
                                                                                            key={idx}
                                                                                            onClick={async () => {
                                                                                                const currentTags = profileData.contact.tags ? (typeof profileData.contact.tags === 'string' ? JSON.parse(profileData.contact.tags) : profileData.contact.tags) : [];
                                                                                                const nextTags = [...currentTags, tag];
                                                                                                try {
                                                                                                    await fetch(`http://localhost:3001/api/contacts/${profileData.contact.id}/tags`, {
                                                                                                        method: 'PUT',
                                                                                                        headers: { 'Content-Type': 'application/json' },
                                                                                                        body: JSON.stringify({ tags: JSON.stringify(nextTags) })
                                                                                                    });
                                                                                                    setProfileData({ ...profileData, contact: { ...profileData.contact, tags: JSON.stringify(nextTags) } });
                                                                                                    setShowTagPicker(false);
                                                                                                } catch (e) {
                                                                                                    console.error('Failed to add tag', e);
                                                                                                }
                                                                                            }}
                                                                                            className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-wa-teal/5 hover:text-wa-teal transition-all flex items-center justify-between group"
                                                                                        >
                                                                                            #{tag}
                                                                                            <Plus size={10} className="opacity-0 group-hover:opacity-100" />
                                                                                        </button>
                                                                                    ))
                                                                            ) : (
                                                                                <p className="px-4 py-3 text-[10px] text-gray-400 italic">No tags found in AI rules.</p>
                                                                            )}
                                                                        </div>
                                                                    </motion.div>
                                                                </>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-3">
                                                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Privacy & Actions</h4>
                                                <div className="space-y-2">
                                                    <button 
                                                        onClick={() => {
                                                            (window as any).setActiveTab('campaign');
                                                        }}
                                                        className="w-full flex items-center justify-between p-4 rounded-2xl bg-white border border-gray-100 hover:border-wa-teal/30 hover:shadow-lg hover:shadow-wa-teal/5 transition-all group"
                                                    >
                                                        <div className="flex items-center gap-3 text-gray-700">
                                                            <div className="p-2 bg-wa-teal/10 rounded-lg text-wa-teal">
                                                                <BarChart3 size={18} />
                                                            </div>
                                                            <span className="text-sm font-bold">View Order history</span>
                                                        </div>
                                                        <Clock size={14} className="text-gray-300" />
                                                    </button>
                                                    <button className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-white transition-all group border border-transparent hover:border-white hover:shadow-sm">
                                                        <div className="flex items-center gap-3 text-gray-700">
                                                            <div className="p-2 bg-blue-50 rounded-lg text-blue-500">
                                                                <Bell size={18} />
                                                            </div>
                                                            <span className="text-sm font-bold">Mute Notifications</span>
                                                        </div>
                                                        <div className="w-10 h-6 bg-gray-200 rounded-full relative p-1 transition-colors group-hover:bg-wa-teal/20">
                                                            <div className="w-4 h-4 bg-white rounded-full shadow-md"></div>
                                                        </div>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="space-y-3 pt-4 border-t border-gray-100">
                                                <button className="w-full flex items-center gap-4 p-4 rounded-2xl text-rose-500 hover:bg-rose-50/50 transition-all font-bold group border border-transparent hover:border-rose-100">
                                                    <div className="p-2 bg-rose-50 rounded-lg text-rose-500 group-hover:scale-110 transition-transform">
                                                        <Ban size={18} />
                                                    </div>
                                                    <span>Block {activeChat?.name}</span>
                                                </button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-center py-12 text-gray-400 font-bold italic">Contact intelligence not found.</div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
            {/* Spintax Builder Modal */}
            <AnimatePresence>
                {showSpintaxModal && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowSpintaxModal(false)}
                            className="absolute inset-0 bg-gray-900/60 backdrop-blur-sm"
                        ></motion.div>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="relative bg-white rounded-[2.5rem] shadow-2xl w-full max-w-lg overflow-hidden border border-white p-8"
                        >
                            <div className="flex justify-between items-center mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-inner">
                                        <Shuffle size={20} />
                                    </div>
                                    <h3 className="text-xl font-black text-gray-800 uppercase tracking-tight">Spintax Builder</h3>
                                </div>
                                <button onClick={() => setShowSpintaxModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                    <X size={24} />
                                </button>
                            </div>

                            <div className="space-y-4">
                                <p className="text-xs font-bold text-gray-500 italic">ব্যবহৃত আইটেমগুলোর মধ্যে বিরতি দিতে (comma) অথবা নতুন লাইন (Enter) ব্যবহার করুন।</p>
                                <textarea
                                    className="w-full h-32 p-4 bg-gray-50 border-2 border-transparent focus:border-indigo-500 rounded-2xl outline-none font-bold text-gray-700 transition-all resize-none shadow-inner"
                                    placeholder="e.g. Hi, Hello, Hey"
                                    value={spintaxInput}
                                    onChange={(e) => setSpintaxInput(e.target.value)}
                                    autoFocus
                                />
                                <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Preview of Spintax Block:</p>
                                    <code className="text-sm font-black text-indigo-600 block truncate">
                                        {'{'}{spintaxInput.split(/[,|\n]+/).map(s => s.trim()).filter(Boolean).join('|')}{'}'}
                                    </code>
                                </div>
                            </div>

                            <div className="flex gap-4 mt-8">
                                <button
                                    onClick={() => setShowSpintaxModal(false)}
                                    className="flex-1 py-4 font-black uppercase tracking-widest text-xs text-gray-400 hover:bg-gray-50 rounded-2xl transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    disabled={!spintaxInput.trim()}
                                    onClick={() => {
                                        const options = spintaxInput.split(/[,|\n]+/).map(s => s.trim()).filter(Boolean);
                                        if (options.length > 0) {
                                            const spintax = `{${options.join('|')}}`;
                                            const input = document.getElementById('chat-message-input') as HTMLInputElement;
                                            if (input) {
                                                const start = input.selectionStart || 0;
                                                const end = input.selectionEnd || 0;
                                                const newText = messageText.substring(0, start) + spintax + messageText.substring(end);
                                                setMessageText(newText);
                                                setTimeout(() => {
                                                    input.focus();
                                                    input.setSelectionRange(start + spintax.length, start + spintax.length);
                                                }, 0);
                                            } else {
                                                setMessageText(prev => prev + spintax);
                                            }
                                        }
                                        setSpintaxInput('');
                                        setShowSpintaxModal(false);
                                    }}
                                    className="flex-[2] py-4 bg-indigo-600 text-white font-black uppercase tracking-widest text-xs rounded-2xl shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 transition-all disabled:opacity-50"
                                >
                                    Insert Spintax
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default ChatBox;
