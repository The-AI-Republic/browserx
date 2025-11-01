/**
 * Storage Tool - LLM Runtime Data Cache
 *
 * Enables LLMs to cache intermediate results during complex multi-step operations.
 * Provides session-scoped caching with metadata-first responses to optimize context usage.
 *
 * Feature: 011-storage-cache
 * Refactored: Complete replacement of Chrome Storage API with IndexedDB-based cache
 */

import { BaseTool, type BaseToolRequest, type BaseToolOptions } from './BaseTool';
import { SessionCacheManager } from '../storage/SessionCacheManager';
import { IndexedDBAdapter } from '../storage/IndexedDBAdapter';
import type {
  CacheToolRequest,
  CacheWriteRequest,
  CacheReadRequest,
  CacheListRequest,
  CacheDeleteRequest,
  CacheUpdateRequest,
  CacheWriteResponse,
  CacheReadResponse,
  CacheListResponse,
  CacheDeleteResponse,
  CacheUpdateResponse,
  CacheErrorResponse,
  QuotaExceededError,
  ItemNotFoundError,
  DataTooLargeError
} from '../../specs/011-storage-cache/contracts/storage-tool-api';
import { CACHE_TOOL_DEFINITION, CacheErrorType } from '../../specs/011-storage-cache/contracts/storage-tool-api';
import {
  QuotaExceededError as SessionQuotaExceededError,
  DataTooLargeError as SessionDataTooLargeError,
  ItemNotFoundError as SessionItemNotFoundError,
  CorruptedDataError as SessionCorruptedDataError
} from '../storage/SessionCacheManager';
import { CACHE_CONSTANTS } from '../storage/SessionCacheManager';

/**
 * Storage Tool Request Interface
 * Extends BaseToolRequest with cache-specific fields
 */
export interface StorageToolRequest extends BaseToolRequest, CacheToolRequest {}

/**
 * Storage Tool Response
 * Union of all possible cache responses
 */
export type StorageToolResponse =
  | CacheWriteResponse
  | CacheReadResponse
  | CacheListResponse
  | CacheDeleteResponse
  | CacheUpdateResponse
  | CacheErrorResponse;

/**
 * Storage Tool Implementation
 *
 * Provides LLM-optimized caching with:
 * - Session-scoped isolation (200MB quota per session)
 * - Metadata-first responses (<700 bytes)
 * - Auto-eviction (oldest 50% when quota reached)
 * - Global 5GB quota across all sessions
 */
export class StorageTool extends BaseTool {
  private cacheManager: SessionCacheManager;

  constructor(dbAdapter?: IndexedDBAdapter) {
    super();
    this.cacheManager = new SessionCacheManager(dbAdapter);
  }

  /**
   * Tool definition for LLM discovery
   * Uses the contract-defined CACHE_TOOL_DEFINITION
   */
  protected toolDefinition = {
    type: 'function' as const,
    function: {
      name: CACHE_TOOL_DEFINITION.name,
      description: CACHE_TOOL_DEFINITION.description,
      strict: false,
      parameters: CACHE_TOOL_DEFINITION.inputSchema as any
    }
  };

  /**
   * Override parameter validation to allow any JSON-serializable data
   * BaseTool's default validation is too strict for the 'data' field
   */
  protected validateParameters(parameters: Record<string, any>): { valid: boolean; errors: any[] } {
    // Minimal validation - just check that action is present
    if (!parameters.action) {
      return {
        valid: false,
        errors: [{
          parameter: 'action',
          message: 'action parameter is required',
          code: 'REQUIRED_PARAMETER'
        }]
      };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Initialize the cache manager
   * Should be called once on startup
   */
  async initialize(): Promise<void> {
    await this.cacheManager.initialize();
  }

  /**
   * Close the cache manager
   * Should be called on cleanup
   */
  async close(): Promise<void> {
    await this.cacheManager.close();
  }

  /**
   * Execute cache operation
   * Routes to appropriate handler based on action
   */
  protected async executeImpl(
    request: StorageToolRequest,
    options?: BaseToolOptions
  ): Promise<StorageToolResponse> {
    try {
      // Extract sessionId from request or options metadata
      const sessionId = request.sessionId || options?.metadata?.sessionId;
      if (!sessionId) {
        return this.createErrorResponse(
          CacheErrorType.VALIDATION_ERROR,
          'Session ID is required but was not provided in request or context',
          { providedRequest: request }
        );
      }

      // Inject sessionId into request if not present
      const requestWithSession = { ...request, sessionId };

      // Route to appropriate handler
      switch (request.action) {
        case 'write':
          return await this.handleWrite(requestWithSession as CacheWriteRequest);

        case 'read':
          return await this.handleRead(requestWithSession as CacheReadRequest);

        case 'list':
          return await this.handleList(requestWithSession as CacheListRequest);

        case 'delete':
          return await this.handleDelete(requestWithSession as CacheDeleteRequest);

        case 'update':
          return await this.handleUpdate(requestWithSession as CacheUpdateRequest);

        default:
          return this.createErrorResponse(
            CacheErrorType.VALIDATION_ERROR,
            `Unsupported cache action: ${(request as any).action}`,
            { action: (request as any).action }
          );
      }
    } catch (error: any) {
      // Convert unexpected errors to error responses
      return this.convertErrorToResponse(error);
    }
  }

  /**
   * Handle write operation
   * Stores data and returns metadata only
   */
  private async handleWrite(request: CacheWriteRequest): Promise<CacheWriteResponse | CacheErrorResponse> {
    try {
      // Validate required fields
      if (!request.data) {
        return this.createErrorResponse(
          CacheErrorType.VALIDATION_ERROR,
          'data field is required for write operation'
        );
      }

      if (!request.description) {
        return this.createErrorResponse(
          CacheErrorType.VALIDATION_ERROR,
          'description field is required for write operation (max 500 chars)'
        );
      }

      // Call SessionCacheManager.write()
      const metadata = await this.cacheManager.write(
        request.sessionId!,
        request.data,
        request.description,
        request.taskId,
        request.turnId,
        request.customMetadata
      );

      return {
        success: true,
        metadata,
        message: `Cached item stored successfully. Key: ${metadata.storageKey}. Use this key to retrieve later. Description: "${metadata.description.substring(0, 100)}${metadata.description.length > 100 ? '...' : ''}"`
      };
    } catch (error: any) {
      return this.convertErrorToResponse(error);
    }
  }

  /**
   * Handle read operation
   * Retrieves full item with data
   */
  private async handleRead(request: CacheReadRequest): Promise<CacheReadResponse | CacheErrorResponse> {
    try {
      // Validate required fields
      if (!request.storageKey) {
        return this.createErrorResponse(
          CacheErrorType.VALIDATION_ERROR,
          'storageKey field is required for read operation'
        );
      }

      // Call SessionCacheManager.read()
      const item = await this.cacheManager.read(request.storageKey);

      return {
        success: true,
        item
      };
    } catch (error: any) {
      return this.convertErrorToResponse(error);
    }
  }

  /**
   * Handle list operation
   * Returns metadata for all items in session
   */
  private async handleList(request: CacheListRequest): Promise<CacheListResponse | CacheErrorResponse> {
    try {
      // Call SessionCacheManager.list()
      const items = await this.cacheManager.list(request.sessionId!);

      // Get session stats for quota information
      const stats = await this.cacheManager.getStats(request.sessionId!);

      return {
        success: true,
        items,
        totalCount: items.length,
        totalSize: stats.totalSize,
        sessionQuotaUsed: stats.totalSize,
        sessionQuotaRemaining: CACHE_CONSTANTS.MAX_SESSION_QUOTA - stats.totalSize
      };
    } catch (error: any) {
      return this.convertErrorToResponse(error);
    }
  }

  /**
   * Handle delete operation
   * Removes item from cache
   */
  private async handleDelete(request: CacheDeleteRequest): Promise<CacheDeleteResponse | CacheErrorResponse> {
    try {
      // Validate required fields
      if (!request.storageKey) {
        return this.createErrorResponse(
          CacheErrorType.VALIDATION_ERROR,
          'storageKey field is required for delete operation'
        );
      }

      // Call SessionCacheManager.delete()
      const deleted = await this.cacheManager.delete(request.storageKey);

      if (!deleted) {
        return this.createErrorResponse(
          CacheErrorType.ITEM_NOT_FOUND,
          `Item with key "${request.storageKey}" not found`,
          { storageKey: request.storageKey }
        );
      }

      return {
        success: true,
        storageKey: request.storageKey,
        message: `Item "${request.storageKey}" deleted successfully`
      };
    } catch (error: any) {
      return this.convertErrorToResponse(error);
    }
  }

  /**
   * Handle update operation
   * Updates existing item with new data and description
   */
  private async handleUpdate(request: CacheUpdateRequest): Promise<CacheUpdateResponse | CacheErrorResponse> {
    try {
      // Validate required fields
      if (!request.storageKey) {
        return this.createErrorResponse(
          CacheErrorType.VALIDATION_ERROR,
          'storageKey field is required for update operation'
        );
      }

      if (!request.data) {
        return this.createErrorResponse(
          CacheErrorType.VALIDATION_ERROR,
          'data field is required for update operation'
        );
      }

      if (!request.description) {
        return this.createErrorResponse(
          CacheErrorType.VALIDATION_ERROR,
          'description field is required for update operation (max 500 chars)'
        );
      }

      // Call SessionCacheManager.update()
      const metadata = await this.cacheManager.update(
        request.storageKey,
        request.data,
        request.description,
        request.customMetadata
      );

      return {
        success: true,
        metadata,
        message: `Item "${request.storageKey}" updated successfully`
      };
    } catch (error: any) {
      return this.convertErrorToResponse(error);
    }
  }

  /**
   * Convert SessionCacheManager errors to CacheErrorResponse
   */
  private convertErrorToResponse(error: any): CacheErrorResponse {
    // Handle SessionCacheManager-specific errors
    if (error instanceof SessionQuotaExceededError) {
      const quotaError: QuotaExceededError = {
        success: false,
        error: error.message,
        errorType: CacheErrorType.QUOTA_EXCEEDED,
        message: `Session quota exceeded. Current: ${Math.round(error.currentSize / 1024 / 1024)}MB, Attempted: +${Math.round(error.attemptedSize / 1024 / 1024)}MB, Limit: ${Math.round(error.quotaLimit / 1024 / 1024)}MB. Auto-eviction triggered - oldest 50% of items removed. Please retry the operation.`,
        currentSize: error.currentSize,
        attemptedSize: error.attemptedSize,
        quotaLimit: error.quotaLimit
      };
      return quotaError;
    }

    if (error instanceof SessionDataTooLargeError) {
      const dataError: DataTooLargeError = {
        success: false,
        error: error.message,
        errorType: CacheErrorType.DATA_TOO_LARGE,
        message: `Data too large for caching. Size: ${Math.round(error.dataSize / 1024 / 1024)}MB, Max: ${Math.round(error.maxSize / 1024 / 1024)}MB. Consider splitting into smaller chunks or summarizing the data.`,
        dataSize: error.dataSize,
        maxSize: error.maxSize
      };
      return dataError;
    }

    if (error instanceof SessionItemNotFoundError) {
      const notFoundError: ItemNotFoundError = {
        success: false,
        error: error.message,
        errorType: CacheErrorType.ITEM_NOT_FOUND,
        message: `Item not found. Key: "${error.storageKey}". Use the list action to see available cached items.`,
        storageKey: error.storageKey
      };
      return notFoundError;
    }

    if (error instanceof SessionCorruptedDataError) {
      const corruptedError: CacheErrorResponse = {
        success: false,
        error: error.message,
        errorType: CacheErrorType.CORRUPTED_DATA,
        message: `Cache item corrupted and cannot be parsed. Key: "${error.storageKey}". Recovery: Delete this item using the delete action and recreate it with fresh data. Original error: ${error.originalError.message}`,
        details: { storageKey: error.storageKey, originalError: error.originalError.message }
      };
      return corruptedError;
    }

    // Handle generic errors
    return this.createErrorResponse(
      CacheErrorType.UNKNOWN_ERROR,
      error.message || 'An unexpected error occurred',
      { errorType: error.constructor.name, stack: error.stack }
    );
  }

  /**
   * Create a generic error response
   */
  private createErrorResponse(
    errorType: CacheErrorType,
    message: string,
    details?: any
  ): CacheErrorResponse {
    return {
      success: false,
      error: message,
      errorType,
      message,
      details
    };
  }

  /**
   * Get cache statistics for debugging
   */
  async getStats(sessionId: string) {
    return await this.cacheManager.getStats(sessionId);
  }

  /**
   * Get global cache statistics
   */
  async getGlobalStats() {
    return await this.cacheManager.getGlobalStats();
  }

  /**
   * Cleanup operations
   */
  async cleanupOrphans(maxAgeMs: number = CACHE_CONSTANTS.ORPHAN_CLEANUP_THRESHOLD_MS) {
    return await this.cacheManager.cleanupOrphans(maxAgeMs);
  }

  async cleanupOutdated(maxAgeDays?: number) {
    return await this.cacheManager.cleanupOutdated(maxAgeDays);
  }
}
