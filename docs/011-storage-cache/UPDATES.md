# Planning Updates: LLM Runtime Data Cache

**Date**: 2025-10-31
**Status**: Updated requirements incorporated

## Summary of Changes

This document captures significant updates to the original plan based on refined requirements.

## Updated Requirements

### 1. Quota Adjustments

**Original**:
- Per-session quota: 50MB
- No global quota limit
- Hard reject on quota exceeded

**Updated**:
- **Per-session quota: 200MB** (4x increase)
- **Global cache quota: 5GB** (across all sessions)
- **Auto-eviction on session quota**: Remove oldest 50% of items when session reaches 200MB
- Session quota violations now trigger automatic cleanup instead of hard rejection

**Rationale**:
- Larger quotas accommodate more complex workflows (e.g., processing 100+ emails vs. 50)
- Auto-eviction prevents hard failures, provides graceful degradation
- Global quota prevents unbounded storage growth across all sessions

### 2. Description Length Increase

**Original**:
- Maximum description: 300 characters
- Target metadata size: 500 bytes

**Updated**:
- **Maximum description: 500 characters** (67% increase)
- **Target metadata size: 700 bytes** (adjusted for longer descriptions)
- **System prompt guidance**: Explicitly instruct LLM to generate concise <500 char descriptions

**Rationale**:
- 300 chars too restrictive for complex data summaries
- 500 chars allows more context while staying compact
- System prompt update ensures LLM generates appropriately concise descriptions

### 3. Outdated Cache Cleanup

**Original**:
- Only session-based cleanup (immediate + 24h orphan detection)
- No time-based expiration beyond orphan threshold

**Updated**:
- **Configurable outdated cleanup**: Default 30 days
- **Setting of -1**: Disables outdated cleanup entirely
- **Complementary mechanism**: Catches cache items not cleaned up on session end

**Rationale**:
- Additional safety net for failed session cleanups
- Prevents indefinite storage bloat from edge cases
- Configurable to accommodate different use cases (development vs. production)

### 4. Automatic Eviction on Quota

**Original**:
- Session quota exceeded → throw QuotaExceededError
- LLM must manually delete items to free space

**Updated**:
- **Auto-eviction**: Remove oldest 50% of items when session quota (200MB) is reached
- **Transparent to LLM**: Write succeeds after eviction, no error thrown
- **Eviction strategy**: FIFO (oldest items by timestamp)

**Rationale**:
- Better UX: LLM doesn't need to handle quota management manually
- Graceful degradation: Workflow continues without interruption
- 50% eviction provides significant headroom for continued operations

### 5. No Backward Compatibility Needed

**Original**:
- Preserve existing Chrome Storage API operations
- Support dual mode or create separate LLMCacheTool
- Migration path for existing StorageTool usage

**Updated**:
- **Direct refactoring**: No backward compatibility required
- **IndexedDB implementation doesn't exist yet**: Can fully replace StorageTool
- **No migration needed**: Clean slate implementation

**Rationale**:
- Simplifies implementation (no dual-mode complexity)
- Faster development timeline
- Cleaner codebase without legacy support

### 6. Reuse Existing Storage Infrastructure

**Original**:
- Create new LLMCacheStorage.ts from scratch
- New IndexedDB implementation independent of existing code

**Updated**:
- **Refactor existing CacheManager.ts**: Make it general-purpose for both rollout and LLM cache
- **Refactor existing ConfigStorage.ts**: Use for cache configuration persistence
- **Migrate from Chrome Storage to IndexedDB**: Update existing implementations to use IndexedDB backend

**Rationale**:
- Reuse battle-tested code (CacheManager has compression, eviction, TTL)
- Consistency across browserx codebase
- Leverage existing features (LRU/LFU/FIFO eviction, compression worker)

## Updated Architecture

### Refactored Component Stack

```
┌─────────────────────────────────────────┐
│         LLM Tool Interface              │
│        (StorageTool.ts)                 │
│  - REFACTORED: Direct replacement       │
│  - No backward compatibility layer      │
└────────────────┬────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────┐
│    Session Cache Manager                │
│  (SessionCacheManager.ts)               │
│  - NEW: Session scoping                 │
│  - NEW: Auto-eviction (50% oldest)      │
│  - NEW: Outdated cleanup (30d default)  │
│  - NEW: Global quota tracking (5GB)     │
└────────────────┬────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────┐
│       Cache Manager                     │
│    (CacheManager.ts - REFACTORED)       │
│  - EXISTING: Eviction policies          │
│  - EXISTING: Compression worker         │
│  - EXISTING: TTL management             │
│  - UPDATED: IndexedDB backend           │
│  - UPDATED: General-purpose (rollout+cache) │
└────────────────┬────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────┐
│       Config Storage                    │
│    (ConfigStorage.ts - REFACTORED)      │
│  - UPDATED: IndexedDB instead of Chrome Storage │
│  - NEW: Cache config persistence        │
└────────────────┬────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────┐
│          IndexedDB                      │
│  - sessions object store                │
│  - cache_items object store             │
│  - config object store (NEW)            │
│  - Indexes: by_session, by_timestamp    │
└─────────────────────────────────────────┘
```

## Updated Data Model

### New/Modified Entities

#### CacheConfig (NEW)
```typescript
interface CacheConfig {
  outdatedCleanupDays: number;  // Default 30, -1 = disabled
  sessionEvictionPercentage: number;  // Default 0.5 (50%)
}
```

#### GlobalCacheStats (NEW)
```typescript
interface GlobalCacheStats {
  totalSize: number;  // Across all sessions
  totalItems: number;
  sessionCount: number;
  quotaUsed: number;  // % of 5GB used
  oldestItemAge: number;  // ms
}
```

#### SessionCache (UPDATED)
- Remove: Hard quota rejection logic
- Add: Auto-eviction trigger at 200MB
- Add: Eviction history tracking

### Updated IndexedDB Schema

**Database**: `browserx_cache` (renamed from `browserx_llm_cache`)

**Object Stores**:
1. `sessions` - Session metadata (existing, quota updated to 200MB)
2. `cache_items` - Cached data (existing)
3. `config` - Cache configuration (NEW)

**Indexes**:
1. `by_session` - Session-scoped queries (existing)
2. `by_session_timestamp` - Ordered session queries (existing)
3. `by_timestamp` - Global timestamp queries for outdated cleanup (NEW)

## Updated Constants

```typescript
MAX_SESSION_QUOTA: 200MB (was 50MB)
MAX_TOTAL_QUOTA: 5GB (NEW)
MAX_DESCRIPTION_LENGTH: 500 chars (was 300)
TARGET_METADATA_SIZE: 700 bytes (was 500)
DEFAULT_OUTDATED_CLEANUP_DAYS: 30 (NEW)
NO_OUTDATED_CLEANUP: -1 (NEW)
SESSION_EVICTION_PERCENTAGE: 0.5 (NEW)
DB_NAME: 'browserx_cache' (was 'browserx_llm_cache')
```

## Updated Success Criteria

| Criterion | Original | Updated |
|-----------|----------|---------|
| SC-001 | 50+ items under 50MB | 50+ items under 200MB |
| SC-002 | Write <100ms (1MB) | Write <100ms (1MB) - unchanged |
| SC-003 | Metadata <500 bytes | Metadata <700 bytes |
| SC-004 | Cleanup <5 min | Cleanup <5 min - unchanged |
| SC-005 | 95%+ reliability | 99%+ reliability (auto-eviction reduces errors) |
| SC-006 | 100% quota enforcement | 100% quota enforcement via auto-eviction |
| SC-007 | 99%+ operation success | 99%+ operation success - unchanged |
| SC-008 | N/A | **NEW**: Global quota (5GB) never exceeded |
| SC-009 | N/A | **NEW**: Outdated cleanup runs daily, removes items >30 days old |

## Updated Requirements

### Modified Functional Requirements

- **FR-009**: System MUST enforce a maximum cached object size of 5MB per entry *(unchanged)*
- **FR-010**: System MUST enforce a per-session cache quota of **200MB** *(was 50MB)* and automatically evict oldest **50% of items** when quota is reached *(added auto-eviction)*
- **FR-010b** *(NEW)*: System MUST enforce a global cache quota of **5GB across all sessions**
- **FR-011**: StorageTool MUST validate that descriptions are under **500 characters** *(was 300)* and truncate with ellipsis if exceeded
- **FR-012**: System MUST automatically clean up cache entries when their associated session is completed or expired *(unchanged)*
- **FR-012b** *(NEW)*: System MUST provide configurable outdated cache cleanup (default **30 days**, **-1 to disable**)
- **FR-014**: StorageTool description in system prompt MUST explain the caching purpose and include **guidance to generate concise <500 character descriptions** *(updated)*
- **FR-016**: ~~StorageTool MUST replace current Chrome Storage API operations while maintaining backward compatibility~~ → **StorageTool MUST be fully refactored; no backward compatibility needed**

### New Functional Requirements

- **FR-017**: System MUST automatically evict oldest 50% of cached items when session reaches 200MB quota
- **FR-018**: System MUST track global cache usage across all sessions and prevent exceeding 5GB total quota
- **FR-019**: System MUST allow configuration of outdated cleanup threshold (in days, -1 = disabled)
- **FR-020**: System MUST reuse existing CacheManager.ts and ConfigStorage.ts, refactoring them to use IndexedDB instead of Chrome Storage
- **FR-021**: System MUST use IndexedDB as the unified storage backend for both rollout and LLM cache functionality

## Updated Implementation Strategy

### Phase 1: Refactor Existing Storage Components (3-4 days)

**1.1 IndexedDB Backend for CacheManager**
- Replace chrome.storage.local calls with IndexedDB operations
- Maintain existing eviction policies (LRU/LFU/FIFO)
- Keep compression worker functionality
- Add session scoping support

**1.2 IndexedDB Backend for ConfigStorage**
- Migrate from Chrome Storage to IndexedDB config object store
- Add cache configuration persistence (outdatedCleanupDays, sessionEvictionPercentage)
- Maintain in-memory caching for performance

**1.3 Test Refactored Components**
- Update existing tests to use fake-indexeddb
- Verify rollout functionality still works
- Ensure backward compatibility for rollout use cases

### Phase 2: Implement Session Cache Manager (2-3 days)

**2.1 Session Scoping Layer**
- Build on refactored CacheManager
- Add session-specific quota tracking (200MB per session)
- Implement global quota tracking (5GB total)

**2.2 Auto-Eviction Logic**
- Detect when session quota reached
- Evict oldest 50% of items by timestamp
- Update session stats after eviction

**2.3 Outdated Cleanup**
- Configurable cleanup threshold (days)
- Periodic scan for items older than threshold
- Skip cleanup if threshold = -1

### Phase 3: Refactor StorageTool (1-2 days)

**3.1 Direct Replacement**
- Remove Chrome Storage API operations entirely
- Implement cache-focused operations (write, read, list, delete, update)
- Integrate with SessionCacheManager

**3.2 Tool Definition Update**
- Update description with 500-char limit guidance
- Add quota info (200MB/session, 5GB global, auto-eviction)
- Include concise description examples

### Phase 4: System Prompt Update (1 day)

**4.1 Cache Usage Guidance**
- Explain when to use cache (complex multi-step, large datasets)
- **NEW**: Emphasize generating concise <500 char descriptions
- **NEW**: Explain auto-eviction behavior (oldest 50% removed at quota)
- Provide description examples

### Phase 5: Testing & Validation (2-3 days)

**5.1 Refactoring Validation**
- Verify rollout still works with IndexedDB CacheManager
- Test ConfigStorage migration
- Ensure no regressions in existing functionality

**5.2 New Feature Testing**
- Auto-eviction scenarios (session quota reached)
- Outdated cleanup (30 days, -1 disabled)
- Global quota enforcement (5GB limit)
- Description length validation (500 chars)

**5.3 Integration Testing**
- End-to-end cache workflows
- Multi-session scenarios
- Performance validation with updated quotas

## Migration Notes

### For Rollout

- CacheManager refactoring should be transparent
- IndexedDB backend provides same API
- Existing rollout tests should pass with minimal changes
- Performance may improve (IndexedDB often faster than Chrome Storage)

### For StorageTool Users (if any)

- No backward compatibility - direct migration
- Any existing StorageTool usage must be updated to new cache API
- If no existing usage, clean implementation path

## System Prompt Update

```markdown
## Storage Cache Tool (`llm_cache`)

The `llm_cache` tool provides persistent storage for intermediate results during complex multi-step operations.

### Key Features

- **Session Quota**: 200MB per session
- **Global Quota**: 5GB across all sessions
- **Auto-Eviction**: When session reaches 200MB, oldest 50% of items automatically removed
- **Outdated Cleanup**: Items older than 30 days automatically cleaned up (configurable)

### When to Use

1. **Processing 20+ similar items** (emails, documents, records, etc.)
2. **Intermediate results exceed 10KB total**
3. **Multi-step workflows** requiring aggregation or pause/resume

### Description Guidelines ⚠️ IMPORTANT

**MUST keep descriptions under 500 characters.** Focus on:

- **What**: Type of data cached
- **Why**: Purpose/context (e.g., "customer support tickets re: pricing")
- **Size**: Approximate data size

**Good Examples**:
- ✅ "Email summaries batch 1-20: customer support tickets re pricing, 15KB total"
- ✅ "Processed order data for Q4 2024 analysis, contains 50 order objects with metadata, 120KB"
- ✅ "Gmail thread summaries (unread), filtered for action items, 8 threads, 22KB"

**Bad Examples**:
- ❌ "Email summaries" (too vague, no context)
- ❌ "This contains a bunch of email data that I processed earlier including subject lines, senders, timestamps, body previews, and categorization labels for customer support, sales inquiries, and technical issues..." (too verbose, >500 chars)

### Auto-Eviction Behavior

When you write data and session reaches 200MB:
1. System automatically removes oldest 50% of cached items
2. Your write succeeds after eviction
3. You receive metadata for the newly cached item
4. No error thrown - eviction is transparent

### Metadata Interpretation

After `write`, you receive metadata showing:
- `storageKey`: Use for later retrieval
- `description`: What you cached
- `dataSize`: Size in bytes
- `timestamp`: When cached

Use metadata to decide what to retrieve later **without loading full content into context**.

### Example Workflow

```
# Step 1: Cache first batch of email summaries
llm_cache(
  action="write",
  data={ summaries: [...] },
  description="Email summaries 1-20: support tickets re pricing, 15KB"
)
→ Returns: { storageKey: "conv_abc...123_def456_ghi789", dataSize: 15360, ... }

# Step 2: Cache second batch
llm_cache(
  action="write",
  data={ summaries: [...] },
  description="Email summaries 21-40: support tickets re features, 18KB"
)
→ Returns: { storageKey: "conv_abc...123_jkl012_mno345", dataSize: 18432, ... }

# Step 3: List what's cached (metadata only)
llm_cache(action="list")
→ Returns: [
  { storageKey: "...", description: "Email summaries 1-20...", dataSize: 15360 },
  { storageKey: "...", description: "Email summaries 21-40...", dataSize: 18432 }
]

# Step 4: Retrieve specific batch for final processing
llm_cache(action="read", storageKey="conv_abc...123_def456_ghi789")
→ Returns: Full data with all email summaries
```

### Quota Management

- **Per-session**: 200MB max, auto-evicts oldest 50% when reached
- **Global**: 5GB across all sessions
- **Outdated cleanup**: Items >30 days old automatically removed

You don't need to manually manage quota - auto-eviction handles it transparently.
```

## Files Updated

1. **contracts/storage-tool-api.ts**:
   - Updated `CACHE_CONSTANTS` (quotas, description length, cleanup thresholds)
   - Updated `CACHE_TOOL_DEFINITION` (description guidance, quota info)
   - Added `GlobalCacheStats` interface
   - Added `CacheConfig` interface
   - Updated `ISessionCacheManager` interface (new methods for global quota, outdated cleanup, config)

2. **UPDATES.md** (this file):
   - Comprehensive documentation of all changes

## Next Steps

1. Update `spec.md` with new requirements (quotas, auto-eviction, outdated cleanup)
2. Update `research.md` with decisions on auto-eviction strategy and outdated cleanup design
3. Update `data-model.md` with new entities (CacheConfig, GlobalCacheStats), updated quota flows
4. Update `quickstart.md` with refactoring guidance for CacheManager and ConfigStorage
5. Update `plan.md` summary and architecture sections
6. Re-run `/speckit.tasks` to regenerate task breakdown with updated requirements

## Impact Summary

| Area | Change Level | Notes |
|------|--------------|-------|
| Quotas | **Major** | 4x session quota, new global quota, auto-eviction |
| Description Length | **Minor** | +67% limit, system prompt update |
| Cleanup | **Major** | New outdated cleanup mechanism |
| Auto-Eviction | **Major** | Fundamental behavior change (no hard errors) |
| Backward Compatibility | **Major** | Removed - direct refactoring |
| Code Reuse | **Major** | Refactor existing components vs. new implementation |
| Testing | **Moderate** | Additional scenarios for eviction, outdated cleanup |
| Performance | **Moderate** | IndexedDB migration, larger quotas |

**Overall Complexity**: Moderate increase due to auto-eviction and global quota tracking, but simplified by removing backward compatibility requirements.
