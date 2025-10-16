# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Codex Chrome Extension** is an AI-powered browser automation agent that runs entirely in-browser via a Chrome extension. The architecture uses the SQ/EQ (Submission Queue/Event Queue) pattern for managing user requests and agent responses.

## Essential Commands

### Build & Development
- `npm run build` - Production build (runs `scripts/build.js` which invokes Vite, copies manifest, fixes HTML paths, copies prompts)
- `npm run build:watch` - Development build with auto-rebuild on file changes
- `npm run dev` - Start Vite dev server for live reloading the side panel and content scripts
- `npm run build:testtool` - Build the e2e helper app in `tests/tools/e2e`

### Testing
- `npm run test` - Run all Vitest tests
- `npm run test -- --config vitest.dom.config.ts` - Run DOM-specific tests
- `npm run test -- --config vitest.contract.config.ts` - Run contract tests
- `npm run test -- <pattern>` - Run tests matching a pattern (e.g., `npm run test -- tool-conversion`)

### Code Quality
- `npm run type-check` - TypeScript type checking without building
- `npm run lint` - Run ESLint on TypeScript and Svelte files
- `npm run format` - Auto-format code with Prettier

### Loading Extension in Chrome
After `npm run build`, load the `dist/` directory (not the project root) as an unpacked extension at `chrome://extensions/` with Developer mode enabled.

## Development Workflow

- Never use the `git commit` command after a task is finished without explicit user confirmation.

## Core Architecture

### SQ/EQ Pattern (Submission Queue/Event Queue)
The extension uses a queue-based architecture:

- **Submission Queue (SQ)**: User requests as `Op` operations (e.g., `UserInput`, `UserTurn`, `Interrupt`)
- **Event Queue (EQ)**: Agent responses as `EventMsg` (e.g., `TaskStarted`, `AgentMessage`, `ToolCall`)
- **CodexAgent** (`src/core/CodexAgent.ts`): Main coordinator class that processes submissions and emits events
- **Session** (`src/core/Session.ts`): Manages conversation state, history, and task lifecycle
- **TurnContext** (`src/core/TurnContext.ts`): Per-turn execution context with model client, approval policy, sandbox policy, etc.

### Protocol Types
Protocol types in `src/protocol/types.ts` define the core data structures:
- Discriminated union types for operations and events
- Type guards in `src/protocol/guards.ts` for runtime validation
- Event types defined in `src/protocol/events.ts`

### Task Execution Model
- **RegularTask** (`src/core/tasks/RegularTask.ts`): Standard user interaction tasks
- **AgentTask** (`src/core/AgentTask.ts`): Coordinates between Session and TaskRunner
- **TaskRunner** (`src/core/TaskRunner.ts`): Executes the agent loop (streaming LLM responses, tool calls, approvals)
- **Session.spawnTask()**: Fire-and-forget task spawning with automatic lifecycle management

### Browser Tools System
Tools are located in `src/tools/` with a registry-based architecture:

- **ToolRegistry** (`src/tools/ToolRegistry.ts`): Central tool management, registration, and execution dispatch
- **BaseTool** (`src/tools/BaseTool.ts`): Abstract base class with validation, error handling, retry logic
- **Individual Tools**: `TabTool`, `DOMTool`, `StorageTool`, `NavigationTool`, `PageActionTool`, `FormAutomationTool`, `WebScrapingTool`, `DataExtractionTool`, `NetworkInterceptTool`

See `src/tools/README.md` for detailed tool capabilities and architecture.

### Tool Conversion for OpenAI API
The `OpenAIResponsesClient` (`src/models/OpenAIResponsesClient.ts`) converts internal `ToolDefinition` types (which support `function`, `local_shell`, `web_search`, `custom`) to OpenAI-compatible format. This conversion happens at the API boundary. See `docs/TOOL_CONVERSION.md` for details.

### Model Client Architecture
- **ModelClientFactory** (`src/models/ModelClientFactory.ts`): Creates model clients based on configuration
- **OpenAIResponsesClient** (`src/models/OpenAIResponsesClient.ts`): OpenAI Responses API client with streaming support
- **SSEEventParser** (`src/models/SSEEventParser.ts`): Optimized SSE parsing with memory pooling and hot path optimization
- **RequestQueue** (`src/models/RequestQueue.ts`): Priority-based FIFO queue with rate limiting, persistence, and retry logic

### Chrome Extension Components
- **Background Service Worker** (`src/background/service-worker.ts`): Hosts the CodexAgent, handles message routing
- **Content Scripts** (`src/content/content-script.ts`): Injected into web pages for DOM access
- **Side Panel UI** (`src/sidepanel/App.svelte`): Svelte-based chat interface with terminal-style display
- **Message Router** (`src/core/MessageRouter.ts`): Chrome extension message passing between components

### Storage & Configuration
- **ConfigStorage** (`src/storage/ConfigStorage.ts`): Persistent configuration via chrome.storage.local
- **RolloutRecorder/RolloutWriter** (`src/storage/rollout/`): Conversation history persistence and replay
- **AgentConfig** (`src/config/AgentConfig.ts`): Singleton configuration manager with validation

## Path Aliases

Both TypeScript and Vitest configs use these path aliases:
```typescript
'@/*': ['src/*']
'@/config': ['src/config']
'@/storage': ['src/storage']
'@/models': ['src/models']
'@/core': ['src/core']
'@/tools': ['src/tools']
'@/protocol': ['src/protocol']
'@/types': ['src/types']
```

Always use these aliases in imports (e.g., `import { CodexAgent } from '@/core/CodexAgent'`).

## Testing Strategy

### Test Organization
- **Unit Tests**: `tests/unit/` - Mirror src/ structure
- **Integration Tests**: `tests/integration/` - Cross-component tests
- **Contract Tests**: `tests/contract/` - Verify interface compliance
- **DOM Tests**: `tests/integration/dom-operations/` - Browser API and DOM manipulation tests
- **Fixtures**: `tests/fixtures/` - Shared test data (e.g., mock selector maps, test pages)

### Test Patterns
- Contract tests verify interface compliance and API contracts
- Use `vitest.contract.config.ts` for contract tests (fast, no network)
- Use `vitest.dom.config.ts` for DOM-specific tests
- Tests are colocated in `src/**/__tests__/` or in the `tests/` directory

## Coding Conventions

### TypeScript & Svelte
- 2-space indentation (configured in Prettier)
- PascalCase for components and classes (e.g., `CodexAgent`, `Settings.svelte`)
- camelCase for functions and variables
- UPPERCASE for module constants
- Schema definitions suffixed with `Schema`
- Use discriminated unions with type guards for type-safe operation handling

### File Naming
- Components: `ComponentName.svelte`
- Classes: `ClassName.ts`
- Tests: `<feature>.spec.ts` (unit) or `<feature>.test.ts` (integration)
- Config files: `vitest.*.config.ts` for specialized test suites

## Key Implementation Details

### Prompts are Runtime Assets
- Agent prompts stored in `src/prompts/` (agent_prompt.md, user_instruction.md)
- Build script copies prompts to `dist/prompts/`
- Loaded at runtime via `PromptLoader.ts` using `chrome.runtime.getURL()`
- These are NOT bundled into JS - they're web-accessible resources

### Content Script Build Quirk
- Content scripts MUST be built as IIFE (not ES modules)
- Separate Vite config: `vite.config.content.mjs`
- Build script runs this separately: `vite build --config vite.config.content.mjs`

### HTML Path Fixing
- Vite generates absolute paths (`/assets/...`) in HTML
- Chrome extensions require relative paths
- Build script (`scripts/build.js`) post-processes HTML to remove leading slashes

### API Key Management
- API keys stored in chrome.storage.local (encrypted by Chrome)
- Validation happens when making API requests, not during initialization
- Model client can be created with null API key - errors surface at request time

### Event Flow
1. User submits input → `CodexAgent.submitOperation(op)`
2. CodexAgent processes submission → calls handlers (e.g., `handleUserInput`)
3. Task spawned via `Session.spawnTask(task, context, items)`
4. TaskRunner executes agent loop (stream LLM, handle tools)
5. Events emitted via `CodexAgent.emitEvent(msg)` → added to event queue
6. UI polls events or listens via Chrome runtime messages

### Approval System
- **ApprovalManager** (`src/core/ApprovalManager.ts`): Manages pending approvals (command execution, file patches)
- Approval policies: `untrusted`, `on-failure`, `on-request`, `never`
- UI displays approval dialogs in side panel (`ApprovalDialog.svelte`)
- Decisions submitted as `ExecApproval` or `PatchApproval` operations

## Performance Optimizations (Phase 9)

### SSE Event Parser
- Memory pooling for event objects (reduces GC pressure)
- Hot path optimization with cached event type mappings
- Lazy parsing (early exit for ignored events)
- Target: <10ms per event processing

### Request Queue System
- Priority-based FIFO: Urgent > High > Normal > Low
- Rate limiting (per-minute and per-hour configurable limits)
- Queue persistence via chrome.storage (survives extension restarts)
- Exponential backoff retry logic
- Built-in analytics (success rate, wait times, queue trends)

## Common Pitfalls

### Don't Use Bash Echo for Communication
Tools like Bash should ONLY be used for actual system commands. Never use bash echo or command-line tools to communicate with the user. Output all communication directly in response text.

### Path Aliases in Tests
Ensure test configs include path alias resolution. All Vitest configs already have this configured in the `resolve.alias` section.

### Chrome Extension Context
Some browser APIs are only available in specific contexts:
- Background service worker: `chrome.tabs`, `chrome.storage`, `chrome.runtime`
- Content scripts: DOM access, limited Chrome APIs
- Side panel: UI rendering, Chrome APIs via background proxy

### Source Maps
Source maps are generated for debugging. They're referenced in web_accessible_resources but excluded from git.

## External References

- **OpenAI Responses API**: Used for streaming chat completions
- **Chrome Extension Manifest V3**: Architecture follows MV3 patterns

## Configuration Files

- **manifest.json**: Chrome extension manifest (permissions, background worker, content scripts)
- **tsconfig.json**: TypeScript compiler config with strict mode
- **vite.config.mjs**: Main Vite build (background, sidepanel)
- **vite.config.content.mjs**: Content script build (IIFE format)
- **vitest.config.mjs**: Default test config
- **vitest.dom.config.ts**: DOM-specific tests
- **vitest.contract.config.ts**: Contract tests (interface compliance)
- **.eslintrc.json**: ESLint rules for TypeScript and Svelte
- **.prettierrc**: Prettier formatting (2-space indent)
- **tailwind.config.js**: Tailwind CSS for UI components

## Verification Scripts

- **verify-config-integration.ts**: Validate configuration settings
- **test-api-key-integration.ts**: Test API key management
