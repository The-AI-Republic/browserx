# Implementation Plan: LLM Runtime Data Cache

**Branch**: `011-storage-cache` | **Date**: 2025-10-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-storage-cache/spec.md`

**Note**: This plan addresses the refactoring of StorageTool to provide LLM-focused caching for intermediate results during complex multi-step operations.

## ⚠️ IMPORTANT UPDATES

**SEE [UPDATES.md](./UPDATES.md) FOR COMPLETE CHANGE SUMMARY**

**Key Changes from Original Plan**:
1. **Quota Changes**: Per-session 200MB (was 50MB), Global 5GB (new), Auto-eviction of oldest 50% when quota reached
2. **Description Length**: 500 chars (was 300), system prompt updated with conciseness guidance
3. **Outdated Cleanup**: Configurable cleanup (default 30 days, -1 = disabled)
4. **No Backward Compatibility**: Direct StorageTool refactoring, no dual-mode complexity
5. **Reuse Existing Code**: Refactor CacheManager.ts and ConfigStorage.ts to use IndexedDB, make general-purpose for rollout + LLM cache

## Summary

Refactor the existing StorageTool to an IndexedDB-based LLM runtime cache by building on existing CacheManager.ts and ConfigStorage.ts. The system will enable the LLM to cache intermediate results (e.g., email summaries) with lightweight metadata, preventing context window overflow during complex multi-step tasks. Key innovations: (1) metadata-first responses, (2) auto-eviction of oldest 50% when session reaches 200MB quota, (3) global 5GB quota across all sessions, (4) configurable outdated cleanup (default 30 days).

**Technical Approach**: Refactor existing CacheManager.ts and ConfigStorage.ts to use IndexedDB instead of Chrome Storage, making them general-purpose for both rollout and LLM cache. Add session-scoped namespacing, metadata-first API design, automatic quota management with eviction, and configurable cleanup policies. Direct replacement of StorageTool with cache-focused operations (write, read, list, delete, update) - no backward compatibility needed.

## Technical Context

**Language/Version**: TypeScript 5.9.2 (strict mode, ES2020 target)
**Primary Dependencies**: IndexedDB (native browser API), uuid (v13.0.0 - existing), chrome types (@types/chrome 0.1.12)
**Storage**: IndexedDB (browser-native, session-scoped, **200MB per-session quota, 5GB global quota**)
**Testing**: Vitest 3.2.4 with fake-indexeddb 6.2.2 (already in devDependencies)
**Target Platform**: Chrome Extension (Manifest V3 context)
**Project Type**: Single TypeScript project (Chrome extension with service worker + sidepanel)
**Performance Goals**: Cache write <100ms (1MB data), metadata <**700 bytes**/item, list operations <50ms
**Constraints**: 5MB max per cached item, **200MB per-session quota with auto-eviction**, **5GB global quota**, IndexedDB availability required
**Scale/Scope**: Support **400+ cached items per session** (200MB / 500KB avg), 50+ concurrent sessions, metadata-first design, **auto-eviction** of oldest 50% when quota reached
**Code Reuse**: Refactor existing **CacheManager.ts** (eviction, compression, TTL) and **ConfigStorage.ts** (config persistence) to use IndexedDB, make general-purpose for rollout + LLM cache

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: ⚠️ CONSTITUTION FILE IS TEMPLATE - No specific project principles defined yet.

The constitution file (`.specify/memory/constitution.md`) contains only placeholder content. This means:
- No project-specific principles to validate against
- No mandatory quality gates defined
- No architecture constraints from constitution

**Default Quality Standards Applied**:
- ✅ Test-first development (unit + integration tests required)
- ✅ Backward compatibility maintained (existing StorageTool uses preserved)
- ✅ Clear separation of concerns (IndexedDB layer separate from tool layer)
- ✅ Error handling with actionable messages for LLM
- ✅ Performance targets explicitly defined (FR-002, SC-002)

**Note**: If project constitution is established later, this plan should be re-evaluated for compliance.

## Project Structure

### Documentation (this feature)

```text
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
src/
├── storage/
│   ├── CacheManager.ts              # REFACTORED: IndexedDB backend, general-purpose for rollout + LLM cache
│   ├── ConfigStorage.ts             # REFACTORED: IndexedDB backend for config + cache config
│   ├── SessionCacheManager.ts       # NEW: Session-scoped LLM cache management
│   ├── StorageQuotaManager.ts       # EXISTING: Quota management utilities (may be merged with SessionCacheManager)
│   └── IndexedDBAdapter.ts          # NEW: IndexedDB wrapper/adapter layer
│
├── tools/
│   ├── StorageTool.ts               # REFACTORED: Direct replacement, LLM cache operations only
│   └── BaseTool.ts                  # EXISTING: Base tool infrastructure
│
├── core/
│   ├── Session.ts                   # EXISTING: Session management (provides conversationId)
│   ├── TurnManager.ts               # MODIFIED: System prompt update for cache guidance
│   └── AgentTask.ts                 # EXISTING: Task management
│
└── protocol/
    └── types.ts                     # EXISTING: Protocol type definitions

tests/
├── unit/
│   ├── storage/
│   │   ├── CacheManager.test.ts          # REFACTORED: Update for IndexedDB backend
│   │   ├── ConfigStorage.test.ts         # REFACTORED: Update for IndexedDB backend
│   │   ├── SessionCacheManager.test.ts   # NEW: Session management + auto-eviction tests
│   │   └── IndexedDBAdapter.test.ts      # NEW: IndexedDB adapter tests
│   └── tools/
│       └── StorageTool.test.ts           # REFACTORED: LLM cache operations
│
└── integration/
    ├── cache-rollout-compatibility.test.ts  # NEW: Ensure rollout still works
    ├── storage-tool-cache.test.ts           # NEW: End-to-end LLM cache workflow
    ├── session-cleanup.test.ts              # NEW: Session cleanup integration
    └── auto-eviction.test.ts                # NEW: Auto-eviction scenarios
```

**Structure Decision**: Single TypeScript project structure matches existing browserx architecture. **Refactor existing storage components** (CacheManager.ts, ConfigStorage.ts) to use IndexedDB, making them general-purpose for both rollout and LLM cache. Add new SessionCacheManager.ts for session-specific logic. StorageTool.ts is directly replaced with LLM cache operations (no backward compatibility). Tests updated to validate IndexedDB migration and new features.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

**Status**: N/A - No constitution violations. No complexity justification required.

---

## Implementation Phases

### Phase 0: Research & Design ✅ COMPLETE

**Deliverables**:
- [x] [research.md](./research.md) - Technical decisions, patterns, and best practices
- [x] All NEEDS CLARIFICATION items resolved
- [x] Technology choices justified

**Key Decisions**:
1. **IndexedDB Pattern**: Promise-based wrapper with explicit database versioning
2. **Storage Key Format**: `{sessionId}_{taskId}_{turnId}` with 8-char alphanumeric IDs
3. **Metadata Schema**: Separate CachedItem/CacheMetadata for context efficiency
4. **Session Cleanup**: Two-phase (immediate + 24h orphan detection)
5. **Quota Enforcement**: Pre-write validation with 50MB per-session limit
6. **System Prompt**: Integration guidance for TurnManager prompts

### Phase 1: Design Artifacts ✅ COMPLETE

**Deliverables**:
- [x] [data-model.md](./data-model.md) - Entity definitions, IndexedDB schema, data flows
- [x] [contracts/storage-tool-api.ts](./contracts/storage-tool-api.ts) - TypeScript API contracts
- [x] [contracts/README.md](./contracts/README.md) - Contract documentation
- [x] [quickstart.md](./quickstart.md) - Implementation guide for developers
- [x] Agent context updated ([CLAUDE.md](../../CLAUDE.md))

**Artifacts Summary**:
- **Data Model**: 5 entities (CachedItem, CacheMetadata, StorageKey, SessionCache, SessionCacheStats)
- **IndexedDB Schema**: 2 object stores (sessions, cache_items), 2 indexes
- **API Contracts**: 5 request types, 5 response types, 7 error types, 2 interfaces
- **Size Calculations**: Metadata ~422 bytes (under 500 byte target), quota examples
- **Data Flows**: 4 operation flows (write, read, list, cleanup) with diagrams

### Phase 2: Implementation Planning 🔄 NEXT STEP

**Deliverable**: `tasks.md` (generated by `/speckit.tasks` command)

**Expected Task Breakdown** (preview):
1. **Storage Layer** (6-8 tasks)
   - IndexedDB schema setup
   - CRUD operations implementation
   - Session management logic
   - Error handling and validation

2. **Session Cache Manager** (4-6 tasks)
   - Storage key generation
   - Quota enforcement
   - Session cleanup hooks
   - Orphan detection

3. **Tool Layer** (3-4 tasks)
   - StorageTool refactoring
   - Tool definition update
   - Request/response handling
   - Error conversion

4. **System Prompt** (1-2 tasks)
   - TurnManager prompt update
   - Cache usage guidance
   - Example scenarios

5. **Testing** (8-10 tasks)
   - Unit tests (storage, manager, tool)
   - Integration tests (workflows, cleanup)
   - Performance validation
   - Error scenario testing

**Total Estimated Tasks**: 22-30 tasks across 6 implementation phases

**Next Command**: Run `/speckit.tasks` to generate detailed task breakdown with dependencies and acceptance criteria.

---

## Architecture Decisions

### Layer Separation

```
┌─────────────────────────────────────────┐
│         LLM Tool Interface              │
│        (StorageTool.ts)                 │
│  - Request routing                      │
│  - Session context extraction           │
│  - Error conversion to tool responses   │
└────────────────┬────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────┐
│    Session Cache Manager                │
│  (SessionCacheManager.ts)               │
│  - Storage key generation               │
│  - Quota enforcement (50MB)             │
│  - Session lifecycle hooks              │
│  - Orphan cleanup orchestration         │
└────────────────┬────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────┐
│       Storage Abstraction               │
│    (LLMCacheStorage.ts)                 │
│  - IndexedDB operations                 │
│  - Transaction management               │
│  - Metadata projections                 │
│  - Database schema versioning           │
└────────────────┬────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────┐
│          IndexedDB                      │
│  - sessions object store                │
│  - cache_items object store             │
│  - Indexes: by_session, by_timestamp    │
└─────────────────────────────────────────┘
```

**Rationale**:
- **Tool Layer**: Focuses on LLM interaction, session context, tool schema
- **Manager Layer**: Enforces business rules (quota, key generation, cleanup)
- **Storage Layer**: Pure data operations, no business logic
- **Clear boundaries**: Each layer has single responsibility, testable in isolation

### Metadata-First Design

**Problem**: Loading full cached data into LLM context defeats purpose of caching.

**Solution**: Return only metadata (description, size, timestamp) after write operations.

**Benefits**:
- LLM can reason about 50+ cached items using only ~25KB context
- Selective retrieval: LLM fetches only needed items
- Quota awareness: LLM sees remaining space before writes

**Implementation**:
- `CacheWriteResponse` returns `CacheMetadata` (not full data)
- `CacheListResponse` projects metadata fields only (excludes data blob)
- `CacheReadResponse` is only operation returning full `CachedItem`

### Session-Scoped Isolation

**Problem**: Cache data from different sessions must not leak or interfere.

**Solution**: All operations filtered by sessionId with IndexedDB indexes.

**Guarantees**:
- Session A cannot read/delete Session B's cached items
- Session cleanup is atomic (all or nothing)
- Concurrent sessions share IndexedDB but logically isolated

**Implementation**:
- `by_session` index enables O(log n) session filtering
- Composite keys include sessionId prefix
- Quota tracking per-session via sessions object store

### Automatic Cleanup Strategy

**Problem**: Abandoned sessions leave orphaned cache data (storage bloat).

**Solution**: Two-phase cleanup for normal and abnormal termination.

**Phase 1 - Immediate Cleanup**:
- Triggered by Session.cleanup() lifecycle hook
- Runs when session ends normally (user closes, task completes)
- Target: Complete within 5 minutes (SC-004)

**Phase 2 - Orphan Detection**:
- Runs on service worker startup
- Detects sessions idle >24 hours (lastAccessedAt timestamp)
- Cleans up crashed/abandoned sessions
- Background process, doesn't block active operations

**Tradeoffs**:
- 24-hour window allows session recovery after temporary crashes
- Balances storage hygiene vs. data preservation

---

## Risk Mitigation

### IndexedDB Availability

**Risk**: IndexedDB disabled by browser policy or private mode.

**Mitigation**:
- Early detection: Check IndexedDB availability on tool initialization
- Graceful degradation: Return StorageUnavailableError with clear message
- LLM fallback: Error message guides LLM to in-context processing
- No silent failures: All operations explicitly check DB availability

### Quota Violations

**Risk**: LLM attempts to cache more than 50MB per session.

**Mitigation**:
- Pre-write validation: Check quota before IndexedDB write
- Atomic updates: Quota and data updated in single transaction
- Actionable errors: QuotaExceededError includes current size, limit, suggestions
- LLM guidance: System prompt explains quota management strategies

### Concurrent Access

**Risk**: Multiple tabs/workers accessing same session cache simultaneously.

**Mitigation**:
- IndexedDB transactions: ACID guarantees at database level
- Read-modify-write: Use transactions for quota updates
- Last-write-wins: Timestamp-based conflict resolution
- No distributed locks needed: IndexedDB handles concurrency

### Data Corruption

**Risk**: JSON serialization failures or corrupted IndexedDB entries.

**Mitigation**:
- Validation on write: Ensure data is JSON-serializable before storage
- Try-catch on read: Catch JSON parse errors, throw CorruptedDataError
- Actionable recovery: Error message suggests deleting corrupted entry
- Logging: Corruption events logged for debugging

### Performance Degradation

**Risk**: Large sessions (100+ items) slow down list/cleanup operations.

**Mitigation**:
- Indexed queries: Use by_session index, avoid full table scans
- Metadata projections: List operations exclude data field (lighter payloads)
- Cursor-based iteration: Never load all items into memory at once
- Performance tests: Validate <100ms writes, <50ms lists in test suite

---

## Success Criteria Mapping

| Success Criterion | Implementation Strategy | Validation Method |
|-------------------|------------------------|-------------------|
| SC-001: Enable 50+ item processing | Metadata-first design, 50MB quota | Integration tests with 50-item scenario |
| SC-002: Write <100ms (1MB) | Indexed writes, minimal overhead | Performance benchmarks in test suite |
| SC-003: Metadata <500 bytes | CacheMetadata schema design | Size calculation validation (422 bytes) |
| SC-004: Cleanup <5 minutes | Batch deletion in single transaction | Timed cleanup tests |
| SC-005: 95%+ reliability | Comprehensive error handling | Integration tests with error injection |
| SC-006: 100% quota enforcement | Pre-write validation | Quota violation tests |
| SC-007: 99%+ operation success | Graceful error handling | Error scenario tests |

---

## Backward Compatibility

### Existing StorageTool Uses

**Concern**: Current code may depend on StorageTool's Chrome Storage API operations.

**Strategy**:
1. **Audit Phase**: Search codebase for StorageTool usage before refactoring
2. **Deprecation Path**: Mark old operations as deprecated, maintain temporarily
3. **Migration Window**: Both APIs available during transition period
4. **Clear Communication**: Update documentation, warn on deprecated calls

**If conflicts found**: Create new `LLMCacheTool` instead of refactoring existing tool.

### Chrome Storage API Preservation

**Option 1 - Dual Mode**: StorageTool supports both cache and Chrome Storage operations
**Option 2 - Separate Tools**: New LLMCacheTool, existing StorageTool unchanged
**Option 3 - Full Migration**: Refactor all usage to cache operations

**Decision**: Determine during `/speckit.tasks` implementation planning based on codebase audit results.

---

## Testing Strategy

### Unit Tests (Isolation)

- **LLMCacheStorage**: IndexedDB operations, schema, CRUD, session management
- **SessionCacheManager**: Key generation, quota enforcement, cleanup logic
- **StorageTool**: Request routing, error conversion, session context extraction
- **Coverage Target**: 90%+ for all new code

### Integration Tests (End-to-End)

- **Cache Workflows**: Write-list-read-delete cycles
- **Session Cleanup**: Integration with Session lifecycle
- **Concurrent Operations**: Multiple sessions, concurrent writes
- **Error Scenarios**: Quota exceeded, storage unavailable, corrupted data

### Performance Tests (Benchmarks)

- **Write Operations**: 1MB data in <100ms
- **Metadata Size**: Validate <500 bytes per item
- **List Operations**: 50 items in <50ms
- **Cleanup Operations**: 100 items in <5 minutes

### Contract Tests

- **Interface Compliance**: LLMCacheStorage implements ILLMCacheStorage
- **Type Safety**: All operations match contract signatures
- **Error Types**: Errors match CacheErrorResponse unions

---

## Documentation Updates

### Agent Context (CLAUDE.md)

✅ **Complete** - Updated with:
- TypeScript 5.9.2 (strict mode, ES2020 target)
- IndexedDB as storage technology
- Session-scoped caching feature summary

### System Prompts

⏳ **Pending Implementation** - TurnManager update with:
- Cache tool purpose and usage guidance
- When to use caching (multi-step, large datasets)
- Metadata interpretation for reasoning
- Quota management strategies

### API Documentation

📝 **Generated** - Contracts package includes:
- Complete TypeScript interface definitions
- Usage patterns and examples
- Validation rules and constraints
- Error types and recovery strategies

---

## Next Steps

1. **Run `/speckit.tasks`** to generate detailed task breakdown
   - Dependencies between tasks
   - Acceptance criteria per task
   - Estimated complexity per task

2. **Conduct codebase audit** for existing StorageTool usage
   - Determine backward compatibility strategy
   - Update plan if conflicts found

3. **Begin implementation** following TDD workflow from quickstart.md
   - Start with Phase 1: Storage Layer
   - Write tests first, implement to pass
   - Validate performance at each phase

4. **Run `/speckit.analyze`** after tasks.md generation
   - Validate cross-artifact consistency
   - Check for gaps in coverage
   - Ensure all requirements mapped to tasks

---

## References

- **Specification**: [spec.md](./spec.md)
- **Research**: [research.md](./research.md)
- **Data Model**: [data-model.md](./data-model.md)
- **Contracts**: [contracts/storage-tool-api.ts](./contracts/storage-tool-api.ts)
- **Quickstart**: [quickstart.md](./quickstart.md)
- **Agent Context**: [CLAUDE.md](../../CLAUDE.md)

---

**Plan Status**: ✅ **COMPLETE** - Ready for `/speckit.tasks` phase

**Constitution Check**: ⚠️ Constitution template only - default quality standards applied

**Phase 0 (Research)**: ✅ Complete - All technical decisions documented
**Phase 1 (Design)**: ✅ Complete - All artifacts generated and validated
