
export interface Contact {
    id: string;
    name: string;
    phone: string;
    email?: string;
    address?: string;
    city?: string;
    companyName?: string;
    lastPurchase?: string;
    tags?: string[];
    engagementScore?: number;
}
export interface Group { id: number; name: string; }
export interface TemplateOption {
    id: number;
    title: string;
    content: string;
    created_at: string;
    category?: string;
    media_path?: string;
    media_type?: string;
}

export interface ScheduledCampaign {
    id: number;
    name: string;
    message: string;
    target_type: 'contact' | 'group';
    target_id: string; // Added target_id
    target_name: string | null;
    scheduled_at: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
    total_recipients: number;
    sent_count: number;
    fail_count: number;
    template_id?: number;
    template_title?: string;
    created_at: string;
    is_adjusted?: number;
    original_scheduled_at?: string;
}

export type StatusFilter = 'not_read' | 'not_delivered' | 'not_replied' | 'all';

// Recipient from send-groups API
export interface SendGroupRecipient { number: string; name: string | null; whatsappId: string; }
export interface SendGroup { sendDate: string; recipients: SendGroupRecipient[]; }
export interface TemplateSendGroup { templateId: number; templateTitle: string; sendGroups: SendGroup[]; }

export interface DeleteCandidate {
    whatsapp_id: string;
    status: string;
    responded: number;
    number: string;
    message_preview: string;
    message_id: number;
    contact_name: string;
    template_title: string;
}

export interface MessageLog {
    id: string;
    whatsappId?: string;
    contactId: string;
    contactName: string;
    phone: string;
    content: string;
    timestamp: string;
    status: 'sent' | 'failed' | 'pending' | 'received' | 'delivered' | 'read';
    type: 'sent' | 'received';
    ack?: number;
    mediaPath?: string;
    mediaType?: string;
    reaction?: string;
    quotedMsg?: string;
    templateId?: string | number;
    metadata?: string;
}
