# Quickstart Guide: LLM Runtime Data Cache

**Feature**: 011-storage-cache
**Date**: 2025-10-31
**Target Audience**: Developers implementing this feature

## Prerequisites

Before starting implementation, ensure you have:

- [x] Read [spec.md](./spec.md) - Understand user requirements and success criteria
- [x] Read [research.md](./research.md) - Understand technical decisions and alternatives
- [x] Read [data-model.md](./data-model.md) - Understand data structures and flows
- [x] Read [contracts/storage-tool-api.ts](./contracts/storage-tool-api.ts) - Understand API contracts
- [x] TypeScript 5.9.2 environment configured
- [x] Vitest test runner available (already in project)
- [x] fake-indexeddb installed (already in devDependencies)

## Implementation Order

Follow this sequence for test-driven development:

### Phase 1: Storage Layer (2-3 days)

**Goal**: Implement IndexedDB persistence with full test coverage.

#### 1.1 Setup IndexedDB Schema

**File**: `src/storage/LLMCacheStorage.ts`

```typescript
import { CACHE_CONSTANTS } from '../../specs/011-storage-cache/contracts/storage-tool-api';

// Create database connection
// Define object stores: sessions, cache_items
// Create indexes: by_session, by_session_timestamp
```

**Test**: `tests/unit/storage/LLMCacheStorage.test.ts`

```typescript
describe('LLMCacheStorage initialization', () => {
  it('should create database with correct schema');
  it('should handle database version upgrades');
  it('should fail gracefully when IndexedDB unavailable');
});
```

**Success Criteria**:
- Database initializes with correct object stores
- Indexes created for efficient queries
- Handles IndexedDB disabled scenario

#### 1.2 Implement Core CRUD Operations

**File**: `src/storage/LLMCacheStorage.ts`

```typescript
class LLMCacheStorage implements ILLMCacheStorage {
  async put(item: CachedItem): Promise<CacheMetadata> {
    // Validate item size (<= 5MB)
    // Serialize data to JSON
    // Store in cache_items object store
    // Update sessions object store (totalSize, itemCount, lastAccessedAt)
    // Return metadata only
  }

  async get(storageKey: string): Promise<CachedItem> {
    // Retrieve from cache_items by storageKey
    // Update sessions.lastAccessedAt
    // Throw ItemNotFoundError if not found
    // Throw CorruptedDataError if JSON parse fails
  }

  async listMetadata(sessionId: string): Promise<CacheMetadata[]> {
    // Query cache_items using by_session index
    // Project only metadata fields (exclude data)
    // Order by timestamp descending
  }

  async delete(storageKey: string): Promise<boolean> {
    // Delete from cache_items
    // Update sessions object store (decrement totalSize, itemCount)
  }
}
```

**Tests**: `tests/unit/storage/LLMCacheStorage.test.ts`

```typescript
describe('LLMCacheStorage CRUD operations', () => {
  it('should store item and return metadata only');
  it('should enforce 5MB item size limit');
  it('should retrieve full item by storage key');
  it('should throw ItemNotFoundError for invalid key');
  it('should list metadata without loading full data');
  it('should delete item and update session stats');
  it('should handle JSON serialization errors gracefully');
});
```

**Success Criteria**:
- All CRUD operations work correctly
- Errors thrown per contract specifications
- Metadata-only projections for list operations
- Session stats updated atomically

#### 1.3 Implement Session Management

**File**: `src/storage/LLMCacheStorage.ts`

```typescript
async deleteBySession(sessionId: string): Promise<number> {
  // Query cache_items using by_session index
  // Delete all matching items in single transaction
  // Delete session record from sessions store
  // Return count of deleted items
}

async getSessionStats(sessionId: string): Promise<SessionCacheStats> {
  // Retrieve session record from sessions store
  // Calculate quotaUsed percentage
  // Return stats object
}
```

**Tests**: `tests/unit/storage/LLMCacheStorage.test.ts`

```typescript
describe('LLMCacheStorage session management', () => {
  it('should delete all items for a session atomically');
  it('should return accurate session statistics');
  it('should handle non-existent session gracefully');
});
```

**Success Criteria**:
- Batch deletions are atomic (all or nothing)
- Session stats accurately reflect cache state
- Meets SC-004 (cleanup within 5 minutes)

### Phase 2: Session Cache Manager (1-2 days)

**Goal**: Implement quota enforcement and key generation logic.

#### 2.1 Storage Key Generation

**File**: `src/storage/SessionCacheManager.ts`

```typescript
private generateStorageKey(
  sessionId: string,
  taskId?: string,
  turnId?: string
): string {
  const task = taskId || this.generateId();
  const turn = turnId || this.generateId();
  return `${sessionId}_${task}_${turn}`;
}

private generateId(): string {
  // Use crypto.getRandomValues for 8-char alphanumeric string
}
```

**Test**: `tests/unit/storage/SessionCacheManager.test.ts`

```typescript
describe('SessionCacheManager key generation', () => {
  it('should generate key with provided sessionId, taskId, turnId');
  it('should auto-generate taskId and turnId when not provided');
  it('should produce unique keys across multiple calls');
  it('should validate key format on operations');
});
```

**Success Criteria**:
- Keys follow `{sessionId}_{taskId}_{turnId}` format (FR-002)
- Auto-generation produces unique IDs
- Key validation prevents malformed keys

#### 2.2 Quota Enforcement

**File**: `src/storage/SessionCacheManager.ts`

```typescript
async write(
  sessionId: string,
  data: any,
  description: string,
  taskId?: string,
  turnId?: string
): Promise<CacheMetadata> {
  // Calculate data size
  // Check session quota: currentSize + dataSize <= 50MB
  // If exceeded: throw QuotaExceededError with actionable message
  // Generate storage key
  // Truncate description to 300 chars if needed
  // Call storage.put()
  // Update in-memory quota tracking
}
```

**Tests**: `tests/unit/storage/SessionCacheManager.test.ts`

```typescript
describe('SessionCacheManager quota enforcement', () => {
  it('should reject writes exceeding 50MB session quota');
  it('should allow writes under quota');
  it('should track quota across multiple writes');
  it('should update quota on deletes');
  it('should provide actionable error messages');
});
```

**Success Criteria**:
- Quota violations prevented 100% of time (SC-006)
- Error messages guide LLM to corrective action
- Quota tracking stays synchronized with storage

#### 2.3 Session Cleanup

**File**: `src/storage/SessionCacheManager.ts`

```typescript
async clearSession(sessionId: string): Promise<number> {
  // Call storage.deleteBySession()
  // Clear in-memory quota tracking
  // Return count of deleted items
}

async cleanupOrphans(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
  // Query sessions store for lastAccessedAt > maxAgeMs ago
  // For each orphaned session: call clearSession()
  // Return total count of deleted sessions
}
```

**Tests**: `tests/unit/storage/SessionCacheManager.test.ts`

```typescript
describe('SessionCacheManager cleanup', () => {
  it('should clear all cache items for a session');
  it('should identify orphaned sessions (>24h idle)');
  it('should cleanup orphaned sessions');
  it('should not cleanup active sessions');
  it('should complete cleanup within 5 minutes for typical sessions');
});
```

**Success Criteria**:
- Session cleanup completes within 5 minutes (SC-004)
- Orphan detection accurately identifies stale sessions
- No data leaks between sessions

### Phase 3: Tool Layer Integration (1-2 days)

**Goal**: Refactor StorageTool to use cache manager and integrate with BaseTool.

#### 3.1 Refactor StorageTool

**File**: `src/tools/StorageTool.ts`

```typescript
import { SessionCacheManager } from '../storage/SessionCacheManager';
import type { CacheRequest, CacheResponse } from '../specs/011-storage-cache/contracts/storage-tool-api';

class StorageTool extends BaseTool {
  private cacheManager: SessionCacheManager;

  protected async executeImpl(
    request: CacheRequest
  ): Promise<CacheResponse | CacheErrorResponse> {
    // Extract sessionId from session context (or request)
    // Route to appropriate cache operation
    // Handle errors and convert to CacheErrorResponse
  }

  private async handleWrite(request: CacheWriteRequest): Promise<CacheWriteResponse> {
    // Validate description length
    // Call cacheManager.write()
    // Return metadata only (not full data) - FR-005
  }

  private async handleRead(request: CacheReadRequest): Promise<CacheReadResponse> {
    // Call cacheManager.read()
    // Return full CachedItem
  }

  // ... other operation handlers
}
```

**Tests**: `tests/unit/tools/StorageTool.test.ts`

```typescript
describe('StorageTool operations', () => {
  it('should handle write requests and return metadata only');
  it('should handle read requests and return full item');
  it('should handle list requests and return all session metadata');
  it('should handle delete requests');
  it('should handle update requests');
  it('should convert storage errors to tool errors');
  it('should auto-extract sessionId from context');
  it('should auto-generate taskId and turnId when missing');
});
```

**Success Criteria**:
- All cache operations accessible via tool
- Metadata-only responses for writes (FR-005)
- Session context automatically extracted
- Error messages actionable for LLM (FR-015)

#### 3.2 Tool Definition

**File**: `src/tools/StorageTool.ts`

```typescript
protected toolDefinition: ToolDefinition = createToolDefinition(
  'llm_cache',
  'Cache intermediate results during complex multi-step operations...',
  // Use schema from CACHE_TOOL_DEFINITION in contracts
);
```

**Tests**: `tests/unit/tools/StorageTool.test.ts`

```typescript
describe('StorageTool definition', () => {
  it('should expose correct tool name and description');
  it('should define all required input parameters');
  it('should enforce action enum validation');
});
```

**Success Criteria**:
- Tool discoverable by LLM
- Schema matches contract specification
- Validation rules enforced

### Phase 4: System Prompt Integration (1 day)

**Goal**: Update TurnManager to include cache usage guidance.

#### 4.1 Prompt Update

**File**: `src/core/TurnManager.ts` (or prompt files if separate)

```typescript
// Add to system prompt:
const CACHE_TOOL_GUIDANCE = `
## Storage Cache Tool

The 'llm_cache' tool provides persistent storage for intermediate results...
[See research.md for full prompt text]
`;
```

**Tests**: Integration tests

```typescript
describe('System prompt includes cache guidance', () => {
  it('should include cache tool description in system prompt');
  it('should explain when to use caching');
  it('should explain metadata interpretation');
});
```

**Success Criteria**:
- Prompt clearly explains cache purpose (FR-014)
- Guidance covers when to use cache
- Examples illustrate metadata-first pattern

### Phase 5: Integration Testing (1-2 days)

**Goal**: Validate end-to-end workflows across all layers.

#### 5.1 Cache Workflow Tests

**File**: `tests/integration/storage-tool-cache.test.ts`

```typescript
describe('End-to-end cache workflows', () => {
  it('should complete full write-list-read-delete cycle');
  it('should handle 50-item caching scenario (email processing)');
  it('should enforce quota across multiple writes');
  it('should preserve metadata across turns');
  it('should handle concurrent operations from same session');
  it('should isolate cache data between different sessions');
});
```

**Success Criteria**:
- All user stories (P1-P3) validated
- Performance targets met (SC-002, SC-003)
- No data corruption or leaks
- Quota enforcement reliable (SC-006)

#### 5.2 Session Cleanup Integration

**File**: `tests/integration/session-cleanup.test.ts`

```typescript
describe('Session cleanup integration', () => {
  it('should trigger cleanup when session ends normally');
  it('should cleanup orphaned sessions after 24 hours');
  it('should not affect active sessions during cleanup');
  it('should complete cleanup within 5 minutes');
});
```

**Success Criteria**:
- Cleanup hooks integrate with Session lifecycle
- Orphan detection runs on service worker startup
- No cache leaks between sessions
- Meets SC-004 timing requirement

### Phase 6: Performance Validation (1 day)

**Goal**: Verify performance targets from success criteria.

#### 6.1 Performance Tests

**File**: `tests/performance/cache-performance.test.ts`

```typescript
describe('Cache performance benchmarks', () => {
  it('should complete write operations in <100ms (1MB data)');
  it('should keep metadata under 500 bytes per item');
  it('should list 50 items in <50ms');
  it('should retrieve single item in <50ms');
  it('should cleanup session in <5 minutes (100 items)');
});
```

**Success Criteria**:
- SC-002: Cache write <100ms for 1MB data
- SC-003: Metadata <500 bytes per item
- SC-004: Session cleanup <5 minutes
- All operations meet timing requirements

## Development Workflow

### 1. Write Tests First (TDD)

For each implementation phase:

```bash
# 1. Write failing tests
npm test -- LLMCacheStorage.test.ts

# 2. Implement minimum code to pass tests
# Edit src/storage/LLMCacheStorage.ts

# 3. Run tests until green
npm test -- LLMCacheStorage.test.ts

# 4. Refactor if needed (tests still green)

# 5. Move to next phase
```

### 2. Use fake-indexeddb for Tests

```typescript
import 'fake-indexeddb/auto'; // At top of test file

describe('IndexedDB operations', () => {
  beforeEach(() => {
    // fake-indexeddb provides in-memory IndexedDB
    // No mocking needed!
  });
});
```

### 3. Type-Safe Development

```typescript
import type {
  ILLMCacheStorage,
  CachedItem,
  CacheMetadata
} from '../specs/011-storage-cache/contracts/storage-tool-api';

// TypeScript ensures implementation matches contract
class LLMCacheStorage implements ILLMCacheStorage {
  // Compiler error if methods don't match interface
}
```

### 4. Error Handling Pattern

```typescript
import {
  CacheErrorType,
  QuotaExceededError
} from '../specs/011-storage-cache/contracts/storage-tool-api';

// Throw typed errors
throw {
  success: false,
  errorType: CacheErrorType.QUOTA_EXCEEDED,
  message: 'Session cache quota exceeded: 52MB > 50MB. ' +
           'Consider deleting old cache entries or chunking large data.',
  currentSize: 52 * 1024 * 1024,
  attemptedSize: 2 * 1024 * 1024,
  quotaLimit: 50 * 1024 * 1024
} as QuotaExceededError;
```

## Testing Checklist

Before marking a phase complete:

- [ ] All unit tests passing
- [ ] Test coverage >= 90% for new code
- [ ] Integration tests passing (if applicable)
- [ ] Performance benchmarks meet success criteria
- [ ] Error scenarios tested and validated
- [ ] TypeScript compilation succeeds with no errors
- [ ] Linter passes (npm run lint)

## Common Pitfalls

### 1. IndexedDB Asynchrony

**Problem**: IndexedDB operations are async; forgetting await leads to race conditions.

**Solution**: Always use `async/await`, never callbacks.

```typescript
// ❌ Wrong
const request = store.get(key);
request.onsuccess = () => { /* ... */ };

// ✅ Correct
const result = await store.get(key);
```

### 2. Transaction Scope

**Problem**: IndexedDB transactions auto-commit when callback completes.

**Solution**: Keep all operations within transaction scope.

```typescript
const tx = db.transaction(['cache_items', 'sessions'], 'readwrite');
const itemStore = tx.objectStore('cache_items');
const sessionStore = tx.objectStore('sessions');

// Both operations in same transaction
await itemStore.put(item);
await sessionStore.put(sessionData);

await tx.complete; // Explicit commit
```

### 3. JSON Serialization Size

**Problem**: JSON.stringify adds overhead; actual size != data size.

**Solution**: Calculate size after serialization.

```typescript
const serialized = JSON.stringify(data);
const dataSize = new Blob([serialized]).size;
// Now use dataSize for quota checks
```

### 4. Metadata Bloat

**Problem**: Including full data in metadata responses.

**Solution**: Project only metadata fields in list operations.

```typescript
// ❌ Wrong - returns full items
async listMetadata(sessionId: string): Promise<CacheMetadata[]> {
  const items = await this.getAllItems(sessionId);
  return items; // Includes data field!
}

// ✅ Correct - projects metadata only
async listMetadata(sessionId: string): Promise<CacheMetadata[]> {
  const items = await this.getAllItems(sessionId);
  return items.map(({ data, customMetadata, ...metadata }) => metadata);
}
```

### 5. Quota Tracking Drift

**Problem**: In-memory quota cache gets out of sync with IndexedDB.

**Solution**: Update quota atomically with data writes.

```typescript
// Always update both in single transaction
const tx = db.transaction(['cache_items', 'sessions'], 'readwrite');
await tx.objectStore('cache_items').put(item);
await tx.objectStore('sessions').put({
  ...sessionData,
  totalSize: sessionData.totalSize + item.dataSize
});
await tx.complete;
```

## Debugging Tips

### 1. Inspect IndexedDB in Chrome DevTools

- Open DevTools > Application > IndexedDB
- View `browserx_llm_cache` database
- Inspect `cache_items` and `sessions` object stores
- Verify indexes and data structure

### 2. Enable Verbose Logging

```typescript
const DEBUG = true; // Toggle for debugging

if (DEBUG) {
  console.log('[LLMCache] Writing item:', {
    storageKey,
    dataSize,
    description
  });
}
```

### 3. Use fake-indexeddb Debugging

```typescript
import FDBFactory from 'fake-indexeddb/lib/FDBFactory';

// Access underlying fake DB for inspection
const fakeDB = (indexedDB as any)._databases;
console.log('All databases:', fakeDB);
```

## Next Steps

After completing implementation:

1. Run `/speckit.tasks` to generate detailed task breakdown
2. Run `/speckit.analyze` to validate cross-artifact consistency
3. Create pull request with implementation
4. Update CLAUDE.md with new cache storage technology

## Resources

- [IndexedDB API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [fake-indexeddb GitHub](https://github.com/dumbmatter/fakeIndexedDB)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [Vitest Documentation](https://vitest.dev/)

## Questions?

Refer back to:
- [spec.md](./spec.md) for requirements
- [research.md](./research.md) for technical decisions
- [data-model.md](./data-model.md) for data structures
- [contracts/](./contracts/) for API contracts
