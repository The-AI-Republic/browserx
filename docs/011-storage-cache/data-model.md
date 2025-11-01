# Data Model: LLM Runtime Data Cache

**Feature**: 011-storage-cache
**Date**: 2025-10-31
**Status**: Complete

## Entity Definitions

### CachedItem

**Purpose**: Represents a complete cached data object with full content and metadata.

**Attributes**:
| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| storageKey | string | Primary key, format: `{sessionId}_{taskId}_{turnId}` | Unique identifier for cached item |
| data | any (JSON-serializable) | Max 5MB serialized size | The actual cached content (summaries, results, etc.) |
| description | string | Max 300 characters | Human-readable description for LLM reasoning |
| timestamp | number | Unix timestamp (ms) | When the item was created/updated |
| dataSize | number | Positive integer (bytes) | Serialized size of data field |
| sessionId | string | References Session.conversationId | Session owning this cached item |
| taskId | string | 8-char alphanumeric | Task context identifier |
| turnId | string | 8-char alphanumeric | Turn context identifier |
| customMetadata | Record<string, any> | Optional, JSON-serializable | Additional LLM-provided annotations |

**Relationships**:
- Belongs to one Session (many-to-one via sessionId)
- No direct relationships to Task/Turn (context identifiers only)

**Validation Rules**:
- storageKey must match format `{sessionId}_{taskId}_{turnId}`
- data must be JSON-serializable (JSON.stringify succeeds)
- dataSize must equal actual serialized size of data
- description must be ≤300 characters (truncate with ellipsis if exceeded)
- timestamp must be valid Unix timestamp
- sessionId must match existing session (checked on write)

**State Transitions**:
```
[New] --write()--> [Stored]
[Stored] --update()--> [Stored] (with new timestamp)
[Stored] --delete()--> [Deleted]
[Stored] --session cleanup--> [Deleted]
```

---

### CacheMetadata

**Purpose**: Lightweight representation of cached item for efficient LLM context usage. Contains descriptive information without the actual data payload.

**Attributes**:
| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| storageKey | string | Matches CachedItem.storageKey | Reference to full cached item |
| description | string | Max 300 characters | Human-readable description |
| timestamp | number | Unix timestamp (ms) | When item was created/updated |
| dataSize | number | Positive integer (bytes) | Size of cached data |
| sessionId | string | Matches CachedItem.sessionId | Session identifier |
| taskId | string | 8-char alphanumeric | Task identifier |
| turnId | string | 8-char alphanumeric | Turn identifier |

**Relationships**:
- Derived from CachedItem (subset of fields)
- One-to-one correspondence with CachedItem

**Validation Rules**:
- All fields must match corresponding CachedItem
- Metadata total size target: <500 bytes (for context efficiency)

**Usage Pattern**:
- Returned to LLM after write operations (not full data)
- Returned by list operations for session-wide cache visibility
- LLM uses metadata to decide which items to retrieve

---

### StorageKey

**Purpose**: Composite identifier ensuring unique cache item identification within and across sessions.

**Format**: `{sessionId}_{taskId}_{turnId}`

**Components**:
| Component | Type | Source | Example |
|-----------|------|--------|---------|
| sessionId | string | Session.conversationId | `conv_a3f8e2b4-5c6d-7e8f-9g0h-1i2j3k4l5m6n` |
| taskId | string | Task context or generated | `a7b3c9d2` (8 chars) |
| turnId | string | Turn context or generated | `f4e8g1h6` (8 chars) |

**Generation Rules**:
1. Extract sessionId from Session.conversationId
2. If taskId exists in context, use it; else generate 8-char alphanumeric string
3. If turnId exists in context, use it; else generate 8-char alphanumeric string
4. Join with underscores: `${sessionId}_${taskId}_${turnId}`

**Validation**:
- Must contain exactly 2 underscores (3 components)
- sessionId must match `conv_` UUID format
- taskId and turnId must be alphanumeric (a-z, 0-9)

**Example**:
```
conv_a3f8e2b4-5c6d-7e8f-9g0h-1i2j3k4l5m6n_a7b3c9d2_f4e8g1h6
|<------------- sessionId -------------->|<-taskId->|<-turnId->|
```

---

### SessionCache

**Purpose**: Aggregate view of all cached items for a single session, used for quota enforcement and cleanup operations.

**Attributes**:
| Attribute | Type | Constraints | Description |
|-----------|------|-------------|-------------|
| sessionId | string | Primary key, matches Session.conversationId | Session identifier |
| totalSize | number | Positive integer, max 50MB | Cumulative size of all cached items |
| itemCount | number | Non-negative integer | Number of cached items in session |
| createdAt | number | Unix timestamp (ms) | When first item was cached |
| lastAccessedAt | number | Unix timestamp (ms) | Last read/write operation timestamp |

**Relationships**:
- Owns zero or more CachedItems (one-to-many)
- Corresponds to one Session (one-to-one conceptual, no enforced FK)

**Validation Rules**:
- totalSize must equal sum of CachedItem.dataSize for all items in session
- totalSize must not exceed 52,428,800 bytes (50MB quota)
- itemCount must equal count of CachedItems for this sessionId
- lastAccessedAt must be >= createdAt

**State Transitions**:
```
[Non-existent] --first write()--> [Active]
[Active] --write/read()--> [Active] (update lastAccessedAt)
[Active] --session end()--> [Cleanup Pending]
[Cleanup Pending] --cleanup complete()--> [Non-existent]
[Active] --24h idle()--> [Orphaned]
[Orphaned] --orphan cleanup()--> [Non-existent]
```

**Quota Enforcement**:
- Before each write: check `totalSize + newItemSize <= 52,428,800`
- If exceeded: reject write with QuotaExceededError
- On delete: decrement totalSize and itemCount

---

## IndexedDB Schema

**Database Name**: `browserx_llm_cache`
**Version**: 1

### Object Stores

#### 1. `sessions` Object Store

**Purpose**: Track session-level cache metadata for quota enforcement and cleanup.

**Schema**:
```typescript
{
  keyPath: 'sessionId',
  autoIncrement: false
}
```

**Record Structure**:
```typescript
{
  sessionId: string;        // Primary key
  totalSize: number;
  itemCount: number;
  createdAt: number;
  lastAccessedAt: number;
}
```

**Indexes**: None (direct lookup by sessionId only)

#### 2. `cache_items` Object Store

**Purpose**: Store individual cached items with full data and metadata.

**Schema**:
```typescript
{
  keyPath: 'storageKey',
  autoIncrement: false
}
```

**Record Structure**:
```typescript
{
  storageKey: string;           // Primary key
  data: any;                    // JSON blob
  description: string;
  timestamp: number;
  dataSize: number;
  sessionId: string;            // Foreign key (conceptual)
  taskId: string;
  turnId: string;
  customMetadata?: Record<string, any>;
}
```

**Indexes**:
- `by_session`: `sessionId` (non-unique) - Enables efficient session-scoped queries
- `by_session_timestamp`: `[sessionId, timestamp]` (non-unique) - Enables ordered listing within session

---

## Data Flow Diagrams

### Write Operation Flow

```
LLM Tool Call (write)
    |
    v
StorageTool.write(data, description, metadata)
    |
    v
SessionCacheManager.write(item)
    |
    +-- Check session quota (totalSize + dataSize <= 50MB)
    |   |-- Exceeded? --> throw QuotaExceededError
    |   |-- OK? --> Continue
    |
    v
LLMCacheStorage.put(item)
    |
    +-- Serialize data to JSON
    +-- Calculate dataSize
    +-- Store in IndexedDB cache_items
    +-- Update IndexedDB sessions (totalSize, itemCount, lastAccessedAt)
    |
    v
Return CacheMetadata (not full data) to LLM
```

### Read Operation Flow

```
LLM Tool Call (read, storageKey)
    |
    v
StorageTool.read(storageKey)
    |
    v
SessionCacheManager.read(storageKey)
    |
    v
LLMCacheStorage.get(storageKey)
    |
    +-- Retrieve from IndexedDB cache_items by storageKey
    +-- Update sessions.lastAccessedAt
    |   |-- Not found? --> throw ItemNotFoundError
    |
    v
Return full CachedItem to LLM
```

### List Operation Flow

```
LLM Tool Call (list, optional sessionId)
    |
    v
StorageTool.list(sessionId)
    |
    v
SessionCacheManager.list(sessionId)
    |
    v
LLMCacheStorage.listMetadata(sessionId)
    |
    +-- Query IndexedDB cache_items by_session index
    +-- Project only metadata fields (exclude data)
    +-- Order by timestamp descending
    |
    v
Return CacheMetadata[] (lightweight) to LLM
```

### Session Cleanup Flow

```
Session End Event
    |
    v
Session.cleanup() [existing hook]
    |
    v
SessionCacheManager.clearSession(sessionId)
    |
    v
LLMCacheStorage.deleteBySession(sessionId)
    |
    +-- Query cache_items by_session index
    +-- Delete all matching items (batch transaction)
    +-- Delete session record from sessions store
    |
    v
Cleanup complete (5-minute target)
```

---

## Size Calculations

### Metadata Size Breakdown

```typescript
interface CacheMetadata {
  storageKey: string;      // ~50 bytes (avg session ID + 16 char suffix)
  description: string;     // 300 bytes max (enforced)
  timestamp: number;       // 8 bytes
  dataSize: number;        // 8 bytes
  sessionId: string;       // ~40 bytes (UUID format)
  taskId: string;          // 8 bytes
  turnId: string;          // 8 bytes
}
// Total: ~422 bytes per metadata item
// Target: <500 bytes (88 bytes margin for JSON overhead)
```

### Quota Calculations

```
Per-session quota: 50MB = 52,428,800 bytes

Example capacity scenarios:
- 100 items @ 500KB each = 50MB (full quota)
- 1000 items @ 50KB each = 50MB (high-volume scenario)
- 10 items @ 5MB each = 50MB (large-item scenario)

Metadata-only context cost for 50 items:
- 50 items × 500 bytes = 25KB (negligible vs. data size)
```

---

## Error Handling

### Error Types

| Error Type | When Thrown | Recovery Action |
|------------|-------------|-----------------|
| QuotaExceededError | totalSize + newSize > 50MB | LLM should delete old items or chunk data |
| ItemNotFoundError | read(nonexistent_key) | LLM should verify key or list available keys |
| StorageUnavailableError | IndexedDB blocked/unsupported | LLM falls back to in-context processing |
| InvalidKeyFormatError | malformed storageKey | LLM should regenerate key or use tool correctly |
| DataTooLargeError | single item > 5MB | LLM should chunk data into multiple items |
| CorruptedDataError | JSON parse failure on read | LLM should delete corrupted item |

### Validation Errors

All validation errors include:
- Clear description of what failed
- Expected format/value
- Actual value provided
- Suggested corrective action

Example:
```typescript
throw new InvalidKeyFormatError(
  `Storage key must follow format {sessionId}_{taskId}_{turnId}, ` +
  `got: "${key}". Expected 3 components separated by underscores.`
);
```

---

## Migration Strategy

**Version 1 (Initial)**: No migrations needed - new feature with no existing data.

**Future Versions**: If schema changes required:
1. IndexedDB `onupgradeneeded` handler manages version migrations
2. Preserve existing data during upgrades (add fields, don't delete)
3. Provide backward compatibility for older schema versions if needed

---

## Performance Considerations

### Indexing Strategy

- `by_session` index enables O(log n) session-scoped queries (not full table scan)
- Compound `[sessionId, timestamp]` index supports ordered listing without sorting
- No full-text search indexes (description is metadata only, not searchable)

### Batch Operations

- Session cleanup uses single transaction for all deletes (atomic)
- Multi-item writes can use batch transactions (future optimization)
- Read operations are individual (metadata is lightweight, batching not needed)

### Memory Management

- Never load all items into memory; use cursor-based iteration for large sessions
- Metadata projections avoid loading full data field for list operations
- Session quotas cached in memory (Map) to avoid repeated IndexedDB reads

---

## Compliance with Requirements

| Requirement | Data Model Support |
|-------------|-------------------|
| FR-001: IndexedDB storage layer | ✅ Full schema defined with object stores and indexes |
| FR-002: Key format `{sessionId}_{taskId}_{turnId}` | ✅ StorageKey entity with generation rules |
| FR-003: Cache write with description | ✅ CachedItem includes description field (max 300 chars) |
| FR-004: Metadata includes all required fields | ✅ CacheMetadata schema matches spec |
| FR-005: Return metadata only after writes | ✅ CacheMetadata separate from CachedItem |
| FR-009: 5MB max per item | ✅ Validation rule enforced in CachedItem |
| FR-010: 50MB per-session quota | ✅ SessionCache tracks totalSize with enforcement |
| FR-011: 300-char description limit | ✅ Validation with truncation rule |
| FR-012: Automatic session cleanup | ✅ SessionCache state transitions and cleanup flow |
| SC-002: Write <100ms | ✅ Indexed writes with minimal overhead |
| SC-003: Metadata <500 bytes | ✅ CacheMetadata size calculation: ~422 bytes |
