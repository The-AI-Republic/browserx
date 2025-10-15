export type ConversationStatus = 'active' | 'inactive' | 'archived';

export interface ConversationData {
  id: string;
  title: string;
  status: ConversationStatus;
  created: number;
  updated: number;
  messageCount: number;
  tokenUsage: {
    input: number;
    output: number;
    total: number;
  };
  metadata: Record<string, any>;
  tags?: string[];
  summary?: string;
}

export interface MessageRecord {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  tokenUsage?: {
    input?: number;
    output?: number;
  };
  metadata?: Record<string, any>;
  toolCallId?: string;
  parentMessageId?: string;
}

export interface ToolCallRecord {
  id: string;
  messageId: string;
  toolName: string;
  arguments: any;
  result?: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: number;
  duration?: number;
  error?: string;
}

export interface SearchResult {
  conversationId: string;
  messageId: string;
  timestamp: number;
  relevanceScore: number;
  snippet: string;
  conversationTitle: string;
}

export interface CacheEntry {
  key: string;
  value: any;
  timestamp: number;
  ttl: number;
  hits: number;
  size: number;
  compressed?: boolean;
  tags?: string[];
}

export interface CacheConfig {
  maxSize: number;
  defaultTTL: number;
  evictionPolicy: 'lru' | 'lfu' | 'fifo';
  compressionThreshold: number;
  persistToStorage: boolean;
}

export interface StorageQuota {
  usage: number;
  quota: number;
  percentage: number;
  persistent?: boolean;
}

export interface StorageStats {
  conversations: {
    count: number;
    sizeEstimate: number;
  };
  messages: {
    count: number;
    sizeEstimate: number;
  };
  cache: {
    entries: number;
    sizeEstimate: number;
  };
  totalUsage: number;
  quota: number;
  percentageUsed: number;
}

export interface BackupData {
  version: string;
  timestamp: number;
  conversations: ConversationData[];
  messages: MessageRecord[];
  toolCalls: ToolCallRecord[];
}

export interface ImportOptions {
  overwrite: boolean;
  merge: boolean;
  deduplicate: boolean;
}

export interface ExportOptions {
  format: 'json' | 'csv' | 'markdown';
  includeMessages: boolean;
  includeToolCalls: boolean;
  dateRange?: {
    start: number;
    end: number;
  };
  conversationIds?: string[];
}