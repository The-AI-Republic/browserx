# API Contracts: LLM Runtime Data Cache

**Feature**: 011-storage-cache
**Date**: 2025-10-31

## Overview

This directory contains TypeScript interface definitions (contracts) for the LLM Runtime Data Cache feature. These contracts define the API boundaries between components and serve as the specification for implementation.

## Files

### `storage-tool-api.ts`

Complete TypeScript contract definitions for:

1. **Tool Request/Response Types** - Types for LLM tool calls (write, read, list, delete, update)
2. **Data Models** - CacheMetadata, CachedItem, SessionCacheStats
3. **Error Types** - Comprehensive error handling with actionable messages
4. **Storage Layer Interface** - Contract for IndexedDB persistence (ILLMCacheStorage)
5. **Manager Interface** - Contract for session-scoped cache management (ISessionCacheManager)
6. **Tool Definition** - Schema for BaseTool integration and LLM discovery
7. **Constants** - Quota limits, sizes, database configuration

## Contract Guarantees

### Type Safety

All contracts use TypeScript strict mode:
- No implicit `any` (except for data payloads, which are JSON-serializable)
- Required vs. optional fields explicitly marked
- Discriminated unions for request/response types
- Enum-based error types for exhaustive error handling

### API Stability

Once implemented, these contracts should remain stable. Breaking changes require:
1. Version increment in IndexedDB schema
2. Migration path for existing cached data
3. Backward compatibility layer if needed

### Performance Contracts

The interfaces encode performance requirements:
- **CacheMetadata**: Designed to stay under 500 bytes (SC-003)
- **SessionCacheStats**: Includes quota tracking for 50MB limit enforcement (FR-010)
- **listMetadata()**: Returns metadata only, not full data (context efficiency)

### Error Contracts

All errors include:
- `success: false` discriminator for easy type guards
- `errorType` enum for programmatic error handling
- `message` field with actionable guidance for LLM
- Type-specific fields (e.g., currentSize, quotaLimit for QuotaExceededError)

## Usage Patterns

### Tool Layer (StorageTool)

```typescript
import type { CacheRequest, CacheResponse, CacheErrorResponse } from './contracts/storage-tool-api';

async function execute(request: CacheRequest): Promise<CacheResponse | CacheErrorResponse> {
  // Implement tool logic using contracts
}
```

### Storage Layer (LLMCacheStorage)

```typescript
import type { ILLMCacheStorage, CachedItem, CacheMetadata } from './contracts/storage-tool-api';

class LLMCacheStorage implements ILLMCacheStorage {
  async put(item: CachedItem): Promise<CacheMetadata> {
    // IndexedDB implementation
  }
  // ... other interface methods
}
```

### Manager Layer (SessionCacheManager)

```typescript
import type { ISessionCacheManager } from './contracts/storage-tool-api';

class SessionCacheManager implements ISessionCacheManager {
  async write(sessionId: string, data: any, description: string): Promise<CacheMetadata> {
    // Quota enforcement + key generation
  }
  // ... other interface methods
}
```

## Validation Rules

Contracts encode validation rules as TypeScript constraints:

- **Description**: `maxLength: 300` (FR-011)
- **Data Size**: Max 5MB per item (FR-009, enforced via DataTooLargeError)
- **Session Quota**: Max 50MB per session (FR-010, enforced via QuotaExceededError)
- **Storage Key Format**: `{sessionId}_{taskId}_{turnId}` (FR-002, validated via InvalidKeyFormatError)

## Testing Contracts

The contracts serve as test fixtures:

```typescript
import { CacheWriteRequest, CacheWriteResponse } from './contracts/storage-tool-api';

describe('StorageTool write operation', () => {
  it('should return metadata only (not full data)', async () => {
    const request: CacheWriteRequest = {
      action: 'write',
      data: { summary: 'Email from John...' },
      description: 'Email summary - 150 words'
    };

    const response = await storageTool.execute(request);

    // TypeScript ensures response matches contract
    expect(response.success).toBe(true);
    expect(response.metadata).toBeDefined();
    expect(response.metadata.description).toBe('Email summary - 150 words');
    // Response should NOT include full data
  });
});
```

## Extension Points

Future features can extend contracts without breaking existing implementations:

1. **Optional Fields**: Add optional properties to existing interfaces
2. **New Actions**: Extend action enums (e.g., `bulk_write`, `search`)
3. **Custom Metadata**: `customMetadata: Record<string, any>` allows LLM extensions
4. **Error Types**: Add new error types to CacheErrorType enum

## Compliance Matrix

| Requirement | Contract Support |
|-------------|------------------|
| FR-001: IndexedDB storage layer | ✅ ILLMCacheStorage interface |
| FR-002: Key format `{sessionId}_{taskId}_{turnId}` | ✅ Validated via InvalidKeyFormatError |
| FR-003: Cache write with description | ✅ CacheWriteRequest.description (required) |
| FR-004: Metadata includes all fields | ✅ CacheMetadata interface |
| FR-005: Return metadata only | ✅ CacheWriteResponse.metadata (not full data) |
| FR-006: Cache read operations | ✅ CacheReadRequest/Response |
| FR-007: Cache list operations | ✅ CacheListRequest/Response |
| FR-008: Cache delete operations | ✅ CacheDeleteRequest/Response |
| FR-009: 5MB max per item | ✅ CACHE_CONSTANTS.MAX_ITEM_SIZE, DataTooLargeError |
| FR-010: 50MB session quota | ✅ CACHE_CONSTANTS.MAX_SESSION_QUOTA, QuotaExceededError |
| FR-011: 300-char description limit | ✅ CACHE_CONSTANTS.MAX_DESCRIPTION_LENGTH |
| FR-012: Session cleanup | ✅ ISessionCacheManager.clearSession(), cleanupOrphans() |
| FR-013: Cache update operations | ✅ CacheUpdateRequest/Response |
| FR-015: Graceful error handling | ✅ CacheErrorResponse with actionable messages |

## Notes

- These contracts are **specifications**, not implementations
- Actual implementations should import and implement these interfaces
- Tests should validate that implementations conform to contracts
- Breaking changes to contracts require careful migration planning
