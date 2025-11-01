# Research: LLM Runtime Data Cache

**Feature**: 011-storage-cache
**Date**: 2025-10-31
**Status**: Complete

## Research Questions Resolved

### 1. IndexedDB API Design Patterns for Chrome Extensions

**Decision**: Use Promised-based IndexedDB wrapper pattern with explicit database versioning and object store management.

**Rationale**:
- IndexedDB's native callback-based API is cumbersome; Promise wrappers are standard practice
- Chrome extensions run in isolated contexts (service worker + sidepanel), each needing DB access
- Object stores provide natural namespacing by sessionId without complex key prefixes
- Transaction-based operations ensure atomicity for concurrent access scenarios

**Alternatives Considered**:
- **Raw IndexedDB API**: Rejected due to callback complexity and poor TypeScript integration
- **Third-party library (Dexie.js, idb)**: Rejected to avoid external dependencies; IndexedDB is simple enough to abstract directly
- **Chrome Storage API**: Already evaluated and rejected in spec - insufficient for 50MB+ quotas and lacks structured querying

**Implementation Pattern**:
```typescript
// Database: browserx_llm_cache
// Object Stores: sessions (keyPath: sessionId), cache_items (keyPath: storageKey)
// Indexes: cache_items by sessionId for efficient session-scoped queries
```

### 2. Storage Key Generation Strategy

**Decision**: Composite key format `{sessionId}_{taskId}_{turnId}` with 8-character alphanumeric random strings for missing IDs, generated using crypto.getRandomValues for uniqueness.

**Rationale**:
- Session.conversationId already follows `conv_{uuid}` format (verified in Session.ts:63)
- taskId and turnId may not exist in all execution contexts (per spec requirements)
- crypto.getRandomValues provides cryptographically strong randomness, preventing collisions
- 8-character alphanumeric provides 62^8 = 218 trillion combinations, sufficient for session scope
- Underscore separator allows easy parsing without regex overhead

**Alternatives Considered**:
- **UUID v4 for all IDs**: Rejected as overkill; 8-char strings sufficient for session-scoped uniqueness
- **Sequential counters**: Rejected due to concurrency risks (multiple tabs/workers)
- **Timestamp-based**: Rejected due to potential collision in rapid operations

**Implementation**:
```typescript
function generateId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(8);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}
```

### 3. Metadata Schema Design

**Decision**: Separate `CachedItem` (full data) and `CacheMetadata` (lightweight) interfaces with JSON serialization for data blobs.

**Rationale**:
- Metadata must stay under 500 bytes to meet SC-003 (10% of 5KB budget for 10 items)
- LLM needs to reason about cached content without loading full data
- JSON serialization handles all LLM data types (summaries, structured results, lists)
- Timestamp enables TTL-based cleanup and staleness detection
- dataSize enables quota enforcement before actual storage

**Schema**:
```typescript
interface CacheMetadata {
  storageKey: string;      // ~50 bytes
  description: string;     // max 300 bytes
  timestamp: number;       // 8 bytes
  dataSize: number;        // 8 bytes
  sessionId: string;       // ~40 bytes
  taskId: string;          // 8 bytes
  turnId: string;          // 8 bytes
  // Total: ~422 bytes, under 500 byte target
}

interface CachedItem extends CacheMetadata {
  data: any;               // JSON blob, up to 5MB
  customMetadata?: Record<string, any>;  // Optional LLM annotations
}
```

**Alternatives Considered**:
- **Binary serialization (MessagePack)**: Rejected for simplicity; JSON meets size requirements
- **Compressed metadata**: Rejected as premature optimization; 500 byte limit is comfortable
- **Embedded metadata in data blob**: Rejected; prevents metadata-only queries

### 4. Session Cleanup Mechanism

**Decision**: Two-phase cleanup: immediate cleanup on session end (triggered by Session lifecycle) + periodic orphan cleanup (24-hour window).

**Rationale**:
- Session.ts already has lifecycle hooks (verified in codebase)
- Normal termination (user closes tab, session ends) triggers immediate cleanup
- Abnormal termination (crash, force-close) leaves orphaned data
- 24-hour orphan detection window balances storage hygiene vs. recovery scenarios
- Periodic cleanup runs on service worker startup (Chrome extension pattern)

**Implementation Strategy**:
1. Hook into Session destructor/cleanup method to call `SessionCacheManager.clearSession(sessionId)`
2. Store session `lastAccessedAt` timestamp in IndexedDB sessions object store
3. Service worker startup scans sessions object store for entries >24 hours old
4. Delete orphaned cache_items where sessionId matches expired session

**Alternatives Considered**:
- **Aggressive cleanup (<1 hour)**: Rejected; may delete recoverable sessions after temporary crashes
- **Manual cleanup only**: Rejected; violates FR-012 automatic cleanup requirement
- **Browser Storage API quota exceeded events**: Rejected; reactive rather than proactive

### 5. Quota Enforcement Strategy

**Decision**: Per-session tracking with pre-write validation; reject writes exceeding 50MB quota with actionable error messages.

**Rationale**:
- IndexedDB quota is per-origin (~several GB), not per-session
- Must track session quotas manually in SessionCacheManager
- Pre-write validation prevents partial writes and quota violations
- Actionable error messages guide LLM to cleanup strategy (delete old items, chunk data)
- 50MB per-session allows ~100 items at 500KB average (aligns with spec assumptions)

**Implementation**:
```typescript
class SessionCacheManager {
  private sessionQuotas: Map<string, number> = new Map();

  async write(item: CachedItem): Promise<CacheMetadata> {
    const currentSize = this.sessionQuotas.get(item.sessionId) ?? 0;
    if (currentSize + item.dataSize > 52_428_800) { // 50MB
      throw new QuotaExceededError(
        `Session cache quota exceeded: ${currentSize + item.dataSize} bytes > 50MB. ` +
        `Consider deleting old cache entries or chunking large data.`
      );
    }
    // proceed with write...
  }
}
```

**Alternatives Considered**:
- **LRU eviction**: Rejected; LLM must explicitly manage cache lifecycle (per spec scope)
- **Dynamic quotas based on available storage**: Rejected as too complex; fixed quota is predictable
- **Per-turn quotas**: Rejected; session scope aligns with natural cache lifetime

### 6. System Prompt Integration

**Decision**: Add tool usage guidance to TurnManager system prompt explaining cache purpose, when to use, and metadata interpretation.

**Rationale**:
- TurnManager.ts loads prompts from `loadPrompt()` and `loadUserInstructions()` (verified in code)
- Tool descriptions alone insufficient; LLM needs strategic guidance
- Prompt should explain: (1) cache purpose, (2) when to cache (multi-step, large data), (3) how to use metadata for reasoning
- FR-014 mandates this prompt update

**Prompt Addition** (to be integrated):
```
## Storage Cache Tool

The `llm_cache` tool provides persistent storage for intermediate results during complex multi-step operations. Use this tool to:

1. **Avoid context overflow**: When processing 20+ items (emails, documents, records), cache summarized results rather than keeping everything in context
2. **Cache strategy**: Store processed chunks with descriptive metadata (max 300 chars) - you'll receive only the metadata, not full data, allowing you to track what's cached without consuming context
3. **Retrieval**: Use cache keys from metadata to selectively retrieve cached items when needed for downstream processing
4. **Multi-turn workflows**: Cached data persists across turns within a session, enabling pause/resume patterns

**When to use**:
- Processing 20+ similar items (emails, files, records)
- Intermediate results exceed 10KB total
- Multi-step workflows requiring aggregation

**Metadata interpretation**: Each cache write returns metadata showing the storage key, description, size, and timestamp. Use this to decide what to retrieve later without loading full content into context.
```

**Alternatives Considered**:
- **Tool description only**: Rejected; insufficient for strategic guidance
- **Example-based prompting**: Considered complementary; guidance text provides principles, examples can be added later
- **Separate caching agent**: Rejected as over-engineering; single tool with good docs sufficient

## Best Practices Applied

### IndexedDB in Chrome Extensions
- Use persistent storage (not memory-only) for cross-context access
- Handle database version migrations gracefully (onupgradeneeded)
- Use indexes for session-scoped queries (avoid full scans)
- Wrap all operations in try-catch for graceful IndexedDB errors (FR-015)

### TypeScript Strict Mode Compliance
- All interfaces defined with explicit types (no `any` except for data blob)
- Promise-based APIs for async operations
- Discriminated unions for error types (QuotaExceededError, StorageUnavailableError, etc.)
- Exported interfaces for testability and type safety

### Testing with fake-indexeddb
- Already in devDependencies (version 6.2.2)
- Provides in-memory IndexedDB for unit tests without mocking
- Supports full IndexedDB spec including indexes and transactions
- Reset database between tests for isolation

### Performance Optimization
- Batch metadata queries use compound indexes (sessionId + timestamp)
- Avoid loading full data for list operations (index-only scans)
- Use transaction batching for multi-item operations
- Lazy-load session quotas (compute on first access, cache in memory)

## Open Questions

None - all technical unknowns resolved through research and codebase analysis.

## References

- IndexedDB API: https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API
- Chrome Extension Storage: https://developer.chrome.com/docs/extensions/reference/storage/
- Existing codebase patterns: src/storage/CacheManager.ts, src/core/Session.ts
- fake-indexeddb documentation: https://github.com/dumbmatter/fakeIndexedDB
