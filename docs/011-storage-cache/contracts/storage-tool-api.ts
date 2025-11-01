/**
 * StorageTool API Contract - LLM Runtime Data Cache
 *
 * Feature: 011-storage-cache
 * Date: 2025-10-31
 *
 * This contract defines the TypeScript interfaces for the refactored StorageTool,
 * focusing on LLM-optimized caching operations. These types ensure type safety
 * between the tool layer and the underlying storage implementation.
 */

// ============================================================================
// Tool Request/Response Types
// ============================================================================

/**
 * Base request for all StorageTool cache operations
 */
export interface CacheToolRequest {
  /** The cache operation to perform */
  action: 'write' | 'read' | 'list' | 'delete' | 'update';

  /** Session ID (auto-extracted from context if not provided) */
  sessionId?: string;

  /** Task ID (auto-generated if not provided) */
  taskId?: string;

  /** Turn ID (auto-generated if not provided) */
  turnId?: string;
}

/**
 * Write operation request - store new cached item
 */
export interface CacheWriteRequest extends CacheToolRequest {
  action: 'write';

  /** The data to cache (any JSON-serializable value) */
  data: any;

  /** Human-readable description for LLM reasoning (max 300 chars) */
  description: string;

  /** Optional custom metadata for LLM annotations */
  customMetadata?: Record<string, any>;
}

/**
 * Read operation request - retrieve cached item by key
 */
export interface CacheReadRequest extends CacheToolRequest {
  action: 'read';

  /** Storage key of item to retrieve */
  storageKey: string;
}

/**
 * List operation request - get all cached items metadata for session
 */
export interface CacheListRequest extends CacheToolRequest {
  action: 'list';

  /** Optional session ID filter (defaults to current session) */
  sessionId?: string;
}

/**
 * Delete operation request - remove cached item by key
 */
export interface CacheDeleteRequest extends CacheToolRequest {
  action: 'delete';

  /** Storage key of item to delete */
  storageKey: string;
}

/**
 * Update operation request - modify existing cached item
 */
export interface CacheUpdateRequest extends CacheToolRequest {
  action: 'update';

  /** Storage key of item to update */
  storageKey: string;

  /** New data (replaces existing data) */
  data: any;

  /** New description (replaces existing description) */
  description: string;

  /** Optional custom metadata (replaces existing metadata) */
  customMetadata?: Record<string, any>;
}

/**
 * Union type for all cache operation requests
 */
export type CacheRequest =
  | CacheWriteRequest
  | CacheReadRequest
  | CacheListRequest
  | CacheDeleteRequest
  | CacheUpdateRequest;

// ============================================================================
// Response Types
// ============================================================================

/**
 * Lightweight metadata returned to LLM (not full data)
 * Designed to stay under 500 bytes for context efficiency
 */
export interface CacheMetadata {
  /** Composite storage key */
  storageKey: string;

  /** Human-readable description */
  description: string;

  /** Timestamp when created/updated (Unix ms) */
  timestamp: number;

  /** Serialized size of data field (bytes) */
  dataSize: number;

  /** Session identifier */
  sessionId: string;

  /** Task identifier */
  taskId: string;

  /** Turn identifier */
  turnId: string;
}

/**
 * Full cached item (includes data payload)
 * Only returned on explicit read operations
 */
export interface CachedItem extends CacheMetadata {
  /** The actual cached data (JSON-serializable) */
  data: any;

  /** Optional custom metadata */
  customMetadata?: Record<string, any>;
}

/**
 * Response for write operations
 * Returns only metadata to keep LLM context efficient
 */
export interface CacheWriteResponse {
  success: true;
  metadata: CacheMetadata;
  message: string; // Human-readable confirmation
}

/**
 * Response for read operations
 * Returns full item with data payload
 */
export interface CacheReadResponse {
  success: true;
  item: CachedItem;
}

/**
 * Response for list operations
 * Returns array of metadata (not full data)
 */
export interface CacheListResponse {
  success: true;
  items: CacheMetadata[];
  totalCount: number;
  totalSize: number; // Total bytes across all items
  sessionQuotaUsed: number; // Bytes used out of 50MB quota
  sessionQuotaRemaining: number; // Bytes remaining
}

/**
 * Response for delete operations
 */
export interface CacheDeleteResponse {
  success: true;
  storageKey: string;
  message: string;
}

/**
 * Response for update operations
 * Returns updated metadata
 */
export interface CacheUpdateResponse {
  success: true;
  metadata: CacheMetadata;
  message: string;
}

/**
 * Union type for all successful cache responses
 */
export type CacheResponse =
  | CacheWriteResponse
  | CacheReadResponse
  | CacheListResponse
  | CacheDeleteResponse
  | CacheUpdateResponse;

// ============================================================================
// Error Types
// ============================================================================

/**
 * Base error for all cache operations
 */
export interface CacheError {
  success: false;
  error: string;
  errorType: CacheErrorType;
  message: string; // Actionable guidance for LLM
  details?: any;
}

/**
 * Specific error types for different failure scenarios
 */
export enum CacheErrorType {
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  ITEM_NOT_FOUND = 'ITEM_NOT_FOUND',
  STORAGE_UNAVAILABLE = 'STORAGE_UNAVAILABLE',
  INVALID_KEY_FORMAT = 'INVALID_KEY_FORMAT',
  DATA_TOO_LARGE = 'DATA_TOO_LARGE',
  CORRUPTED_DATA = 'CORRUPTED_DATA',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Quota exceeded error (session over 50MB limit)
 */
export interface QuotaExceededError extends CacheError {
  errorType: CacheErrorType.QUOTA_EXCEEDED;
  currentSize: number;
  attemptedSize: number;
  quotaLimit: number;
}

/**
 * Item not found error (invalid storage key)
 */
export interface ItemNotFoundError extends CacheError {
  errorType: CacheErrorType.ITEM_NOT_FOUND;
  storageKey: string;
}

/**
 * Storage unavailable error (IndexedDB disabled/blocked)
 */
export interface StorageUnavailableError extends CacheError {
  errorType: CacheErrorType.STORAGE_UNAVAILABLE;
  reason: string;
}

/**
 * Invalid key format error
 */
export interface InvalidKeyFormatError extends CacheError {
  errorType: CacheErrorType.INVALID_KEY_FORMAT;
  providedKey: string;
  expectedFormat: string;
}

/**
 * Data too large error (single item exceeds 5MB)
 */
export interface DataTooLargeError extends CacheError {
  errorType: CacheErrorType.DATA_TOO_LARGE;
  dataSize: number;
  maxSize: number;
}

/**
 * Union type for all cache errors
 */
export type CacheErrorResponse =
  | QuotaExceededError
  | ItemNotFoundError
  | StorageUnavailableError
  | InvalidKeyFormatError
  | DataTooLargeError
  | CacheError;

// ============================================================================
// Storage Layer Interface
// ============================================================================

/**
 * Contract for the underlying IndexedDB storage implementation
 * Implemented by LLMCacheStorage class
 */
export interface ILLMCacheStorage {
  /**
   * Initialize the IndexedDB database
   * Should be called once on startup
   */
  initialize(): Promise<void>;

  /**
   * Store a cached item
   * @throws QuotaExceededError if session quota exceeded
   * @throws DataTooLargeError if item exceeds 5MB
   * @throws StorageUnavailableError if IndexedDB unavailable
   */
  put(item: CachedItem): Promise<CacheMetadata>;

  /**
   * Retrieve a cached item by storage key
   * @throws ItemNotFoundError if key doesn't exist
   * @throws CorruptedDataError if data cannot be deserialized
   */
  get(storageKey: string): Promise<CachedItem>;

  /**
   * List all cached items for a session (metadata only)
   * @param sessionId Session to query
   * @returns Array of metadata, ordered by timestamp descending
   */
  listMetadata(sessionId: string): Promise<CacheMetadata[]>;

  /**
   * Delete a cached item by storage key
   * @param storageKey Key to delete
   * @returns true if deleted, false if not found
   */
  delete(storageKey: string): Promise<boolean>;

  /**
   * Delete all cached items for a session
   * Used for session cleanup
   */
  deleteBySession(sessionId: string): Promise<number>;

  /**
   * Get session cache statistics
   */
  getSessionStats(sessionId: string): Promise<SessionCacheStats>;

  /**
   * Close the database connection
   * Should be called on cleanup
   */
  close(): Promise<void>;
}

/**
 * Session cache statistics
 */
export interface SessionCacheStats {
  sessionId: string;
  totalSize: number; // Total bytes used
  itemCount: number; // Number of cached items
  quotaUsed: number; // Percentage of 200MB quota used (0-100)
  createdAt: number; // Unix timestamp
  lastAccessedAt: number; // Unix timestamp
}

/**
 * Global cache statistics across all sessions
 */
export interface GlobalCacheStats {
  totalSize: number; // Total bytes used across all sessions
  totalItems: number; // Total cached items across all sessions
  sessionCount: number; // Number of active sessions
  quotaUsed: number; // Percentage of 5GB total quota used (0-100)
  oldestItemAge: number; // Age in ms of oldest cached item
}

/**
 * Cache configuration for cleanup and eviction
 */
export interface CacheConfig {
  /** Outdated cache cleanup in days (-1 = disabled, default 30) */
  outdatedCleanupDays: number;

  /** Session quota eviction percentage (0-1, default 0.5 = 50%) */
  sessionEvictionPercentage: number;
}

// ============================================================================
// Session Cache Manager Interface
// ============================================================================

/**
 * Contract for session-scoped cache management
 * Implemented by SessionCacheManager class
 */
export interface ISessionCacheManager {
  /**
   * Write a new cached item
   * Handles session quota enforcement, auto-eviction, and key generation
   * If session quota (200MB) is reached, automatically removes oldest 50% of items
   */
  write(
    sessionId: string,
    data: any,
    description: string,
    taskId?: string,
    turnId?: string,
    customMetadata?: Record<string, any>
  ): Promise<CacheMetadata>;

  /**
   * Read a cached item by storage key
   */
  read(storageKey: string): Promise<CachedItem>;

  /**
   * List all cached items for a session (metadata only)
   */
  list(sessionId: string): Promise<CacheMetadata[]>;

  /**
   * Delete a cached item
   */
  delete(storageKey: string): Promise<boolean>;

  /**
   * Update an existing cached item
   */
  update(
    storageKey: string,
    data: any,
    description: string,
    customMetadata?: Record<string, any>
  ): Promise<CacheMetadata>;

  /**
   * Clear all cached items for a session
   * Used for session cleanup
   */
  clearSession(sessionId: string): Promise<number>;

  /**
   * Get session cache statistics
   */
  getStats(sessionId: string): Promise<SessionCacheStats>;

  /**
   * Get global cache statistics across all sessions
   */
  getGlobalStats(): Promise<GlobalCacheStats>;

  /**
   * Cleanup orphaned sessions (>24 hours idle)
   * Called periodically by service worker
   */
  cleanupOrphans(maxAgeMs: number): Promise<number>;

  /**
   * Cleanup outdated cache items older than configured days
   * Called periodically by service worker
   * @param maxAgeDays Maximum age in days (default from config, -1 = no cleanup)
   * @returns Number of items deleted
   */
  cleanupOutdated(maxAgeDays?: number): Promise<number>;

  /**
   * Get cache configuration
   */
  getConfig(): Promise<CacheConfig>;

  /**
   * Update cache configuration
   */
  setConfig(config: Partial<CacheConfig>): Promise<void>;

  /**
   * Check if total cache quota (5GB) is exceeded
   * Used for global quota enforcement
   */
  checkGlobalQuota(): Promise<boolean>;
}

// ============================================================================
// Tool Definition Schema
// ============================================================================

/**
 * Tool definition for BaseTool integration
 * This is the schema passed to the LLM for tool discovery
 */
export const CACHE_TOOL_DEFINITION = {
  name: 'llm_cache',
  description: 'Cache intermediate results during complex multi-step operations to avoid context overflow. Store processed data with concise metadata (max 500 chars), retrieve selectively, and manage session-scoped cache lifecycle. Session quota: 200MB. Auto-evicts oldest 50% when quota reached.',
  inputSchema: {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        description: 'Cache operation to perform',
        enum: ['write', 'read', 'list', 'delete', 'update']
      },
      data: {
        type: 'object',
        description: 'Data to cache (JSON-serializable value, max 5MB) - required for write/update. Can be object, array, string, number, or boolean.'
      },
      description: {
        type: 'string',
        description: 'Concise description for reasoning - MUST be under 500 chars. Focus on key details: what, why, size. Example: "Email summaries batch 1-20: customer support tickets re pricing, 15KB total" - required for write/update',
        maxLength: 500
      },
      storageKey: {
        type: 'string',
        description: 'Storage key for read/delete/update operations'
      },
      customMetadata: {
        type: 'object',
        description: 'Optional custom metadata for LLM annotations'
      },
      sessionId: {
        type: 'string',
        description: 'Session ID (auto-detected if not provided)'
      },
      taskId: {
        type: 'string',
        description: 'Task ID (auto-generated if not provided)'
      },
      turnId: {
        type: 'string',
        description: 'Turn ID (auto-generated if not provided)'
      }
    },
    required: ['action']
  }
} as const;

// ============================================================================
// Constants
// ============================================================================

export const CACHE_CONSTANTS = {
  /** Maximum size per cached item (5MB) */
  MAX_ITEM_SIZE: 5 * 1024 * 1024,

  /** Maximum session quota (200MB) */
  MAX_SESSION_QUOTA: 200 * 1024 * 1024,

  /** Maximum total cache quota across all sessions (5GB) */
  MAX_TOTAL_QUOTA: 5 * 1024 * 1024 * 1024,

  /** Maximum description length (500 chars) */
  MAX_DESCRIPTION_LENGTH: 500,

  /** Target metadata size (700 bytes with 500 char description) */
  TARGET_METADATA_SIZE: 700,

  /** Orphan cleanup threshold (24 hours) */
  ORPHAN_CLEANUP_THRESHOLD_MS: 24 * 60 * 60 * 1000,

  /** Outdated cache cleanup threshold (30 days default, -1 = no cleanup) */
  DEFAULT_OUTDATED_CLEANUP_DAYS: 30,
  NO_OUTDATED_CLEANUP: -1,

  /** Session quota eviction percentage (remove oldest 50% when quota reached) */
  SESSION_EVICTION_PERCENTAGE: 0.5,

  /** IndexedDB database name */
  DB_NAME: 'browserx_cache',

  /** IndexedDB version */
  DB_VERSION: 1,

  /** Object store names */
  STORE_NAMES: {
    SESSIONS: 'sessions',
    CACHE_ITEMS: 'cache_items',
    CONFIG: 'config'
  },

  /** Index names */
  INDEX_NAMES: {
    BY_SESSION: 'by_session',
    BY_SESSION_TIMESTAMP: 'by_session_timestamp',
    BY_TIMESTAMP: 'by_timestamp'
  }
} as const;
