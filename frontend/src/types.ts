export interface Group {
  id: string;
  name: string;
  description?: string;
  contactCount?: number;
}

export interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  media_path?: string;
  media_type?: string;
  attachments?: { url: string; type: string; caption?: string; name?: string; phone?: string; lat?: string | number; lng?: string | number }[];
  is_pinned?: boolean;
  usage_count?: number;
  created_at?: string;
}


export interface Contact {
  id: string;
  name: string;
  phone: string;
  lastMessage?: string;
  status: 'active' | 'inactive';
  groupNames?: string;
  tags?: string[];
  engagementScore?: number;
  email?: string;
  address?: string;
  city?: string;
  companyName?: string;
  lastPurchase?: string;
  interest_score?: number;
  price_sensitivity_score?: number;
  loyalty_score?: number;
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

export enum AppTab {
  DASHBOARD = 'dashboard',
  CONNECT = 'connect',
  CONTACTS = 'contacts',
  CAMPAIGN = 'campaign',
  HISTORY = 'history',
  MESSAGES = 'messages',
  TEMPLATES = 'templates',
  ANALYTICS = 'analytics',
  SETTINGS = 'settings',
  AIBRAIN = 'aibrain',
  INTELLIGENCE = 'intelligence',
  AI_FAILOVER = 'ai-failover',
  OMS = 'oms',
  PURCHASES = 'purchases',
  SUPPLIERS = 'suppliers',
  FINANCE = 'finance'
}


export interface AIConfig {
  tone: string;
  language: string;
  purpose: string;
}

export interface ConnectionConfig {
  bridgeUrl: string;
  apiKey: string;
  useExternalBridge: boolean;
}
