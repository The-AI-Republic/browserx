# Implementation Plan: CDP Screenshot Tool

**Branch**: `006-cdp-screenshot-tool` | **Date**: 2025-10-31 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-cdp-screenshot-tool/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/commands/plan.md` for the execution workflow.

## Summary

Implement a CDP-based screenshot tool (PageScreenShotTool) that enables the AI agent to capture visual screenshots and perform coordinate-based interactions as a complementary approach to DOM-based page analysis. The feature includes:

1. **DOMTool Enhancement**: Add explicit `scroll` action to enable LLM to bring out-of-viewport elements into view before screenshot capture
2. **PageScreenShotTool**: New tool extending BaseTool with 5 actions (screenshot, click, type, scroll, keypress)
3. **CDP Integration**: Uses Chrome DevTools Protocol for screenshot capture and coordinate-based input
4. **File Management**: Temporary screenshot storage in chrome.storage.local with automatic cleanup
5. **OpenAI Vision**: Extends OpenAIResponsesClient to support image content blocks for vision analysis
6. **Viewport Detection**: Enhances DOM serialization with `inViewport` field to indicate element visibility

**Workflow**: LLM checks `inViewport` field → uses DOMTool.scroll to bring elements into view → captures screenshot → performs visual analysis → executes coordinate-based or DOM-based actions.

## Technical Context

**Language/Version**: TypeScript 5.9.2 (target: ES2020)
**Primary Dependencies**: Chrome Extension APIs (Manifest V3), Chrome DevTools Protocol (CDP), Vite 5.4.20, Svelte 4.2.20
**Storage**: chrome.storage.local (key: "screenshot_cache" for temporary base64 PNG storage)
**Testing**: Vitest 3.2.4 with JSDOM environment
**Target Platform**: Chrome/Chromium browser extension (Manifest V3)
**Project Type**: Single project (Chrome extension with TypeScript)
**Performance Goals**: Screenshot capture + upload within 3 seconds, coordinate action latency <200ms
**Constraints**: Chrome extension sandbox permissions, CDP connection availability, OpenAI API vision capability required, chrome.storage.local 10MB per-item limit
**Scale/Scope**: Single tool class with 5 actions (screenshot, click, type, scroll, keypress), viewport detection for all DOM nodes, single-key cache management

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: PASS (No constitution file present - project does not have established architectural principles yet)

Note: The constitution.md file is currently a template. This feature follows existing patterns from the codebase:
- Extends BaseTool following established tool architecture pattern (DOMTool, NavigationTool, etc.)
- Uses Vitest for testing (consistent with existing test setup)
- Follows TypeScript/ES2020 standards already in use
- Uses existing CDP infrastructure (DomService pattern)
- Maintains separation of concerns (tool interface vs. implementation services)

## Project Structure

### Documentation (this feature)

```
specs/[###-feature]/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```
src/
├── tools/
│   ├── DOMTool.ts                   # (MODIFIED - add scroll action)
│   ├── PageScreenShotTool.ts       # Main tool interface (NEW - extends BaseTool)
│   ├── screenshot/                  # Implementation services (NEW directory)
│   │   ├── ScreenshotService.ts     # CDP-based screenshot capture
│   │   ├── CoordinateActionService.ts # Coordinate-based actions (click, type, etc.)
│   │   ├── ScreenshotFileManager.ts   # File storage and cleanup
│   │   ├── ViewportDetector.ts        # Viewport visibility calculation
│   │   └── types.ts                   # Screenshot-specific types
│   ├── dom/
│   │   ├── DomService.ts            # (MODIFIED - integrate viewport detection)
│   │   └── serializers/             # (MODIFIED - add inViewport field)
│   └── BaseTool.ts                  # (existing - base class)
├── types/
│   └── domTool.ts                   # (MODIFIED - extend SerializedNode with inViewport field)
├── models/
│   └── OpenAIResponsesClient.ts     # (MODIFIED - add image upload support)
└── prompts/
    └── agent_prompt.md              # (MODIFIED - add PageScreenShotTool and DOMTool.scroll usage guidance)

tests/
├── tools/
│   ├── PageScreenShotTool.test.ts   # Tool interface tests
│   └── screenshot/                  # Service-level tests
│       ├── ScreenshotService.test.ts
│       ├── CoordinateActionService.test.ts
│       ├── ScreenshotFileManager.test.ts
│       └── ViewportDetector.test.ts
└── integration/
    └── screenshot-workflow.test.ts  # End-to-end workflow tests
```

**Note**: No filesystem tmp/ directory needed - screenshots stored in chrome.storage.local with key `"screenshot_cache"`

**Structure Decision**: Single project structure following existing browserx Chrome extension architecture. The feature adds a new `screenshot/` subdirectory under `src/tools/` to house implementation services, while the main `PageScreenShotTool.ts` serves as the thin interface layer exposed to the LLM. This maintains consistency with the existing DOMTool pattern where `DOMTool.ts` delegates to `dom/DomService.ts` for implementation.

## Complexity Tracking

*Fill ONLY if Constitution Check has violations that must be justified*

N/A - No constitutional violations. This feature follows established patterns and does not introduce unnecessary complexity.

---

## Planning Status

### Phase 0: Research ✓ COMPLETE

**Artifacts Generated**:
- [research.md](./research.md) - Technical research on CDP screenshot capabilities, coordinate-based input, viewport detection, file management, and OpenAI vision integration

**Key Decisions**:
1. **Add explicit `scroll` action to DOMTool** for viewport management (enables LLM to scroll elements into view before screenshot)
2. Use `Page.captureScreenshot` CDP command with PNG format
3. Use `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent` for coordinate actions
4. Calculate viewport visibility with >50% intersection threshold
5. Store screenshots in chrome.storage.local (base64 PNG)
6. Extend OpenAIResponsesClient to support image content blocks
7. Architecture: Thin tool interface + specialized service classes

### Phase 1: Design & Contracts ✓ COMPLETE

**Artifacts Generated**:
- [data-model.md](./data-model.md) - Complete data structures, entity definitions, state models, and validation rules (includes DOMTool scroll action specification)
- [contracts/PageScreenShotTool.openapi.yaml](./contracts/PageScreenShotTool.openapi.yaml) - OpenAPI 3.1 contract for PageScreenShotTool interface
- [contracts/DOMTool-scroll-extension.openapi.yaml](./contracts/DOMTool-scroll-extension.openapi.yaml) - OpenAPI 3.1 contract for DOMTool scroll action extension
- [quickstart.md](./quickstart.md) - Developer quickstart guide with implementation sequence including DOMTool enhancement (Phase 0)

**Agent Context Updated**:
- CLAUDE.md updated with new technologies from this feature (TypeScript 5.9.2, CDP, chrome.storage)

### Post-Phase-1 Constitution Check ✓ PASS

No new complexity introduced. All design decisions align with existing codebase patterns:
- Tool extends BaseTool (same as DOMTool, NavigationTool, etc.)
- Service layer pattern (ScreenshotService mirrors DomService)
- CDP command usage (consistent with existing DomService.ts patterns)
- Testing with Vitest (existing test framework)

### Next Phase

**Phase 2: Tasks Generation**
- Run `/speckit.tasks` to generate implementation task breakdown in `tasks.md`
- Tasks will be dependency-ordered based on research and design artifacts

---

