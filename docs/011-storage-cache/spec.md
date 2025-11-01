# Feature Specification: LLM Runtime Data Cache

**Feature Branch**: `011-storage-cache`
**Created**: 2025-10-31
**Status**: Draft
**Input**: User description: "Refactor browserx/src/tools/StorageTool.ts to make it as key - object storage for llm to cache some run data.
User story: sometime, if user send a complex command, when there is no cache, and all the data are on the fly, llm will easily excceed the context window. For example if user send commands: "read all my unread gmail and summarize each of them for me, then output the results into a google doc", if we don't provide Storage tool as cache to store those email summaries, it is hard for llm to finish the tasks successfully.

1. use indexdb, create a interface layer in browserx/src/storage
2. the key should contain sessionId + underscore + taskid + underscore + turnId (if no task id or turn id currently in project, then generate 8 characters random string as turn id)
3. the storage object should contain metadata include the stored data description (less 300 characters) as well as other metadata, the metadata will show up in reasoning history for llm
4. the function call of the StorageTool should return metadata to llm for it convient to reasoning and decide when to read the data
5. refactor browserx/src/tools/StorageTool.ts to better catch up the new mission of the storage tool
6. update the system prompt to reflect the Storage tool usage"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Store Intermediate Results During Complex Multi-Step Operations (Priority: P1)

When the LLM processes complex, multi-step commands that generate large intermediate datasets (e.g., processing 50 emails), it needs a way to cache intermediate results to avoid context window overflow. The LLM stores processed chunks with descriptive metadata, allowing it to reason about what's been cached without loading full content into context.

**Why this priority**: This is the core problem that blocks LLM from completing complex tasks. Without caching, tasks like "read 50 emails and summarize each" will fail due to context overflow. This provides immediate value by enabling previously impossible workflows.

**Independent Test**: Can be fully tested by having the LLM execute a command like "read 20 emails and cache each summary" - the test passes when summaries are stored with metadata and can be referenced later without loading full content into context.

**Acceptance Scenarios**:

1. **Given** the LLM is processing 50 unread emails, **When** it summarizes the first 10 emails, **Then** it can store each summary with descriptive metadata (e.g., "Email from John re: Q4 budget - 150 words") and receive confirmation with storage keys
2. **Given** the LLM has cached 30 email summaries, **When** it needs to reference what's been processed, **Then** it can list all cached items and see only the metadata (not full content) to understand what's stored
3. **Given** the LLM cached intermediate results with 200-character descriptions, **When** it continues the task in a new turn, **Then** it can see the cached metadata in its context and decide which items to retrieve

---

### User Story 2 - Retrieve Cached Data for Downstream Processing (Priority: P1)

After caching intermediate results, the LLM needs to selectively retrieve specific cached items for downstream processing (e.g., combining email summaries into a single document). The retrieval should be efficient and only load requested items into context.

**Why this priority**: Storage without retrieval is useless. This completes the core caching workflow and must be part of the MVP. Together with P1, this enables the complete "cache and process" pattern.

**Independent Test**: Can be tested by pre-populating the cache with test data, then having the LLM retrieve specific items by key - the test passes when correct data is returned and context is not overwhelmed.

**Acceptance Scenarios**:

1. **Given** the LLM has 20 cached email summaries, **When** it needs to combine them into a report, **Then** it can retrieve summaries 1-10 by their storage keys and process them without exceeding context limits
2. **Given** a storage key points to a 5KB cached result, **When** the LLM retrieves it, **Then** the full content is returned and ready for downstream processing
3. **Given** the LLM retrieves 5 cached items in sequence, **When** each retrieval completes, **Then** the system maintains stability and doesn't accumulate leaked context

---

### User Story 3 - Session-Scoped Cache Management (Priority: P2)

The browserx agent should automatically organize cached data by session, ensuring data isolation and automatic cleanup. When a session ends, its cached data should be cleanly removed to prevent storage bloat.

**Why this priority**: While not required for the basic caching workflow, proper session management prevents storage pollution and ensures cache data doesn't leak between unrelated tasks. This is important for long-term system health but doesn't block the core P1 functionality.

**Independent Test**: Can be tested by creating cache entries in session A, verifying they're isolated from session B, then ending session A and confirming its cache is cleaned up.

**Acceptance Scenarios**:

1. **Given** two concurrent sessions are running, **When** each caches data, **Then** session A cannot access session B's cached items
2. **Given** a session has 15 cached items totaling 2MB, **When** the session completes normally, **Then** all associated cache entries are removed within 5 minutes
3. **Given** a session crashes mid-execution, **When** the system detects the abandoned session after 24 hours, **Then** its orphaned cache entries are cleaned up

---

### User Story 4 - Update Cached Items with Progressive Results (Priority: P3)

For long-running operations where results accumulate progressively (e.g., streaming data processing), the LLM should be able to update existing cache entries with new data while maintaining the same storage key and metadata structure.

**Why this priority**: This enables advanced progressive processing patterns but isn't required for the basic cache-and-retrieve workflow. Most use cases work fine with write-once cache entries. This is a nice-to-have for optimization.

**Independent Test**: Can be tested by caching an initial result, then updating it with additional data - the test passes when the same key returns the updated content and metadata reflects the update.

**Acceptance Scenarios**:

1. **Given** a cache entry contains partial results from 10 processed items, **When** the LLM processes 5 more items, **Then** it can update the same cache entry with the combined 15-item result
2. **Given** an updated cache entry, **When** retrieved, **Then** the metadata reflects the last update timestamp and description
3. **Given** a cache entry is being updated, **When** a concurrent read request arrives, **Then** the system returns the previous stable version without corruption

---

### Edge Cases

- What happens when the cache storage quota is exceeded? (System should reject new writes with clear error indicating quota exceeded, suggest cleanup)
- How does the system handle corrupted cache entries? (Returns error on read, allows deletion, logs corruption for debugging)
- What happens if the LLM tries to cache data larger than maximum entry size (5MB)? (Reject with clear error indicating size limit, suggest chunking strategy)
- How does the system handle concurrent writes to the same cache key from the same session? (Last write wins, metadata includes write timestamp)
- What happens when IndexedDB is unavailable or disabled by the browser? (Tool returns error indicating storage unavailable, LLM can fall back to in-context processing)
- How does the system handle cache keys that are malformed or excessively long? (Validate key format on write, reject with descriptive error)

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide an IndexedDB-based storage interface layer in `src/storage` that abstracts persistence operations
- **FR-002**: System MUST generate storage keys in the format `{sessionId}_{taskId}_{turnId}` where taskId and turnId are 8-character random strings if not provided by the session context
- **FR-003**: StorageTool MUST accept cache write operations with parameters: key, data (any JSON-serializable object), description (max 300 chars), and optional metadata
- **FR-004**: StorageTool MUST store cached objects with metadata including: description, timestamp, data size, turnId, taskId, sessionId, and optional custom metadata
- **FR-005**: StorageTool MUST return only metadata (not full data) to the LLM after successful cache writes, enabling efficient context management
- **FR-006**: StorageTool MUST provide cache read operations that accept a storage key and return the full cached object with metadata
- **FR-007**: StorageTool MUST provide cache list operations that return all cached keys and their metadata for a given session without loading full data
- **FR-008**: StorageTool MUST provide cache delete operations that remove specific cached items by key
- **FR-009**: System MUST enforce a maximum cached object size of 5MB per entry to prevent excessive memory usage
- **FR-010**: System MUST enforce a per-session cache quota of 50MB to prevent storage bloat
- **FR-011**: StorageTool MUST validate that descriptions are under 300 characters and truncate with ellipsis if exceeded
- **FR-012**: System MUST automatically clean up cache entries when their associated session is completed or expired
- **FR-013**: System MUST provide cache update operations that modify existing entries while preserving session/task/turn identifiers
- **FR-014**: StorageTool description in system prompt MUST explain the caching purpose and include guidance on when to use cache (multi-step operations, large datasets, intermediate results)
- **FR-015**: System MUST handle IndexedDB errors gracefully and return actionable error messages to the LLM
- **FR-016**: StorageTool MUST replace current Chrome Storage API operations with new caching-focused operations while maintaining backward compatibility for any existing storage uses

### Key Entities *(include if feature involves data)*

- **CachedItem**: Represents a stored data object with metadata
  - Attributes: storageKey, data (JSON blob), description (string, max 300 chars), timestamp, dataSize, sessionId, taskId, turnId, customMetadata (optional)
  - Relationships: Belongs to a session, associated with a specific task and turn

- **CacheMetadata**: Lightweight representation of cached item for LLM context
  - Attributes: storageKey, description, timestamp, dataSize, sessionId, taskId, turnId
  - Purpose: Allows LLM to reason about cached content without loading full data into context

- **StorageKey**: Composite identifier for cached items
  - Format: `{sessionId}_{taskId}_{turnId}`
  - Constraints: sessionId from Session.conversationId, taskId/turnId are 8-char alphanumeric strings

- **SessionCache**: Collection of cached items for a single session
  - Attributes: sessionId, totalSize, itemCount, createdAt, lastAccessedAt
  - Purpose: Tracks cache usage per session for quota enforcement and cleanup

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: LLM can successfully complete complex multi-step tasks (e.g., processing 50+ items) that previously failed due to context overflow, with cached intermediate results staying under 50MB per session
- **SC-002**: Cache write operations complete in under 100ms for data up to 1MB, enabling responsive multi-step workflows
- **SC-003**: Cache metadata returned to LLM is under 500 bytes per item, ensuring efficient context usage when referencing 50+ cached items
- **SC-004**: Session cleanup removes all associated cache entries within 5 minutes of session completion, maintaining storage hygiene
- **SC-005**: LLM successfully retrieves and processes cached data across turn boundaries 95%+ of the time without errors or data corruption
- **SC-006**: System prevents cache quota violations 100% of the time by rejecting writes that would exceed 50MB per session with clear error messages
- **SC-007**: Cache operations work reliably in 99%+ of cases when IndexedDB is available, with graceful degradation when unavailable

## Assumptions

- IndexedDB is the standard browser storage mechanism and is available in all target Chrome versions
- Session IDs (conversationId) are unique and available from the Session object
- Task IDs may not exist in all contexts, defaulting to generated 8-character random strings
- Turn IDs follow the same pattern as task IDs when not available from context
- The LLM system prompt is centrally managed and can be updated to include tool usage guidance
- Cache entries do not need to persist across browser restarts or profile changes (session storage model)
- 50MB per-session quota is sufficient for typical complex workflows (based on 100 cached items averaging 500KB each)
- Maximum 5MB per cached item accommodates most intermediate results (e.g., 50 email summaries at ~100KB each)
- Cache description limit of 300 characters provides enough context for LLM reasoning while staying compact
- JSON serialization is sufficient for all cached data types the LLM needs to store

## Dependencies

- IndexedDB browser API availability
- Existing Session class with conversationId property
- Existing BaseTool infrastructure for tool definition and execution
- System prompt update mechanism (referenced in requirement FR-014)
- UUID generation for turnId/taskId when not provided (consider using existing uuid library from project)

## Out of Scope

- Cross-session cache sharing or global cache namespace
- Cache encryption or security beyond standard IndexedDB permissions
- Cache compression or optimization algorithms
- Cache analytics or usage tracking dashboards
- Migration of existing Chrome Storage data to new caching system
- Automatic cache eviction strategies beyond session-based cleanup
- Cache replication or backup mechanisms
- Support for non-JSON data types (binary data, streams, etc.)
