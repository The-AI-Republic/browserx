# Implementation Plan: DomTool Visual Effects

**Branch**: `003-domtool-visual-effects` | **Date**: 2025-10-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-domtool-visual-effects/spec.md`

## Summary

Implement visual effects system to provide user feedback for AI agent DOM operations in BrowserX Chrome extension. System includes semi-transparent overlay for input blocking, animated cursor using embedded SVG, water ripple effects via WebGL, and control buttons for user takeover. Architecture is fire-and-forget event-driven with complete error isolation from DomTool functionality. Effects injected via Shadow DOM at page level with coordinate calculation for iframe elements.

## Technical Context

**Language/Version**: TypeScript 5.9.2 (ES2020 target)
**Primary Dependencies**: Svelte 4.2.20, Vite 5.4.20, Chrome Extension APIs, WebGL (water_ripple_effect.js)
**Storage**: N/A (ephemeral state only, no persistence)
**Testing**: Vitest 3.2.4, @testing-library/svelte 5.2.8, chrome-mock 0.0.9
**Target Platform**: Chrome Extension (Manifest V3), injected content script
**Project Type**: Chrome Extension (web application with content scripts)
**Performance Goals**: 60fps cursor animation, <100ms queuing delay for 5+ actions/second, <5MB memory budget
**Constraints**: Non-blocking (fire-and-forget), zero impact on DomTool success rate, graceful WebGL degradation, cross-origin iframe support
**Scale/Scope**: Single feature, 5 Svelte components, 3 utility modules, ~2000 LOC

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status**: ✅ PASSED (No constitution file exists - placeholder template present)

The project does not have an active constitution file (`.specify/memory/constitution.md` contains placeholder template). Therefore, no specific gates to validate. If a constitution is established in the future, re-run this check against:

- Technology stack constraints
- Testing requirements
- Code organization principles
- Performance standards

**Post-Phase 1 Status**: ✅ PASSED (Constitution check N/A)

## Project Structure

### Documentation (this feature)

```text
specs/003-domtool-visual-effects/
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 output - technical decisions and architecture
├── data-model.md        # Phase 1 output - data structures and types
├── quickstart.md        # Phase 1 output - integration guide for developers
├── contracts/           # Phase 1 output - TypeScript API contracts
│   ├── domtool-events.ts          # Event emission contract for DomTool
│   ├── visual-effect-controller.ts # Public API for controller
│   └── README.md                   # Contract usage documentation
└── checklists/          # Quality validation checklists
    └── requirements.md  # Specification quality checklist
```

### Source Code (repository root)

```text
src/
├── content/
│   ├── dom/
│   │   ├── DomTool.ts              # MODIFIED: Add IDomToolEventEmitter implementation
│   │   ├── actions/
│   │   │   ├── ClickExecutor.ts    # MODIFIED: Add event emission after click
│   │   │   ├── InputExecutor.ts    # MODIFIED: Add event emission after type
│   │   │   └── KeyPressExecutor.ts # MODIFIED: Add event emission after keypress
│   │   └── ui_effect/              # NEW: Visual effects system
│   │       ├── water_ripple_effect.js  # EXISTING: WebGL ripple effect
│   │       ├── VisualEffectController.svelte  # NEW: Main controller component
│   │       ├── Overlay.svelte               # NEW: Input-blocking overlay
│   │       ├── CursorAnimator.svelte        # NEW: Animated cursor component
│   │       ├── ControlButtons.svelte        # NEW: Take Over / Stop Agent buttons
│   │       ├── stores.ts                    # NEW: Svelte stores for shared state
│   │       ├── utils/
│   │       │   ├── coordinateCalculator.ts  # NEW: Viewport coordinate calculation
│   │       │   ├── easingFunctions.ts       # NEW: Animation easing functions
│   │       │   └── eventQueue.ts            # NEW: Effect event queue management
│   │       └── contracts/                   # NEW: TypeScript contracts (from Phase 1)
│   │           ├── domtool-events.ts
│   │           ├── visual-effect-controller.ts
│   │           └── README.md
│   └── index.ts                  # MODIFIED: Initialize VisualEffectController
├── static/
│   └── pointinghand.svg          # EXISTING: Cursor SVG (to be embedded)
└── types/
    └── visualEffects.ts          # NEW: Type definitions for visual effects

tests/
├── unit/
│   └── content/
│       └── dom/
│           └── ui_effect/
│               ├── VisualEffectController.test.ts  # NEW: Controller unit tests
│               ├── CursorAnimator.test.ts          # NEW: Cursor animation tests
│               ├── Overlay.test.ts                 # NEW: Overlay tests
│               ├── coordinateCalculator.test.ts    # NEW: Coordinate calc tests
│               └── eventQueue.test.ts              # NEW: Queue management tests
└── integration/
    └── visual-effects-integration.test.ts  # NEW: End-to-end integration tests
```

**Structure Decision**: Chrome Extension with content script injection model. Visual effects components live under `src/content/dom/ui_effect/` alongside existing `water_ripple_effect.js`. Svelte components build with Vite using existing build configuration (`vite.config.content.mjs`). Shadow DOM injection occurs at page level from content script. Contracts directory copied from specs into source for type imports.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

N/A - No constitution violations. No active constitution file present.

## Phase 0: Research & Technical Decisions

**Status**: ✅ COMPLETED

**Output**: [research.md](./research.md)

### Key Decisions Made

1. **Svelte Component Architecture**: Use Svelte 4.2.20 (already in stack) with isolated components for overlay, cursor, and controller. Reactive state via Svelte stores.

2. **Shadow DOM Injection**: Inject at page level using closed mode for style isolation. Never inject into iframes - calculate coordinates instead.

3. **Event Communication**: Fire-and-forget CustomEvent API (`browserx:visual-effect`). DomTool dispatches, VisualEffectController listens, no blocking.

4. **Cursor Animation**: CSS transforms + requestAnimationFrame for 60fps GPU-accelerated animation. Duration scales with distance (300-1500ms). Queue with speed boost when >3 events.

5. **Ripple Integration**: Integrate existing `water_ripple_effect.js` WebGL implementation. Graceful degradation when WebGL unavailable.

6. **Overlay Input Blocking**: Full-viewport div with `pointer-events: all` and event capture. Independent from ripple effects per FR-006.

7. **Control Buttons**: Svelte components within overlay at bottom-center. "Take Over" removes overlay, "Stop Agent" terminates session.

8. **Iframe Coordinates**: Calculate viewport coordinates using `getBoundingClientRect()` with recursive iframe offset accumulation.

9. **Error Handling**: Try-catch all operations, log silently, auto-reinitialize on next event. No error propagation to DomTool.

10. **Performance**: Transform/opacity animations, queue limit (10 events), speed boost (1.5x when >3), RAF sync, <5MB memory.

### Technology Stack

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| UI Framework | Svelte | 4.2.20 | Already in stack, reactive, small bundle |
| Language | TypeScript | 5.9.2 | Type safety, existing codebase standard |
| Build Tool | Vite | 5.4.20 | Fast builds, already configured |
| Ripple Effects | WebGL (existing) | N/A | Hardware-accelerated, pre-existing implementation |
| Cursor SVG | Embedded Data URI | N/A | No file loading, bundled with code |
| Animation | RAF + CSS Transform | Native | GPU-accelerated, 60fps capable |
| Styling | Shadow DOM CSS | Native | Isolation from page styles |
| Communication | CustomEvent API | Native | Fire-and-forget, no dependencies |

## Phase 1: Design & Contracts

**Status**: ✅ COMPLETED

### Data Model

**Output**: [data-model.md](./data-model.md)

**Core Entities**:

1. **VisualEffectEvent**: Event payload from DomTool (type, action, element, boundingBox, timestamp)
2. **CursorPosition**: Current/target cursor coordinates (x, y, timestamp)
3. **CursorAnimationState**: In-progress animation state (startPos, targetPos, duration, easing, status)
4. **EffectQueue**: Queued events with FIFO processing and speed boost (items, maxSize, processingRate)
5. **OverlayState**: Overlay visibility and takeover mode (visible, takeoverActive, agentSessionActive)
6. **RippleEffectConfig**: Ripple appearance parameters (radius, strength, resolution, perturbance)
7. **VisualEffectConfig**: Global system configuration (enable flags, durations, queue settings)

**State Management**: Svelte writable stores for component-level state (cursorPosition, overlayState, effectQueue, animationState). No persistence - all ephemeral.

**Validation**: Type guards for event validation, cursor position bounds checking, configuration constraints.

### API Contracts

**Output**: [contracts/](./contracts/)

**Contracts Defined**:

1. **domtool-events.ts**:
   - `VisualEffectEvent` types (agent-action, agent-serialize, agent-start, agent-stop)
   - `IDomToolEventEmitter` interface (DomTool must implement)
   - `dispatchVisualEffectEvent()` helper
   - `isVisualEffectEvent()` type guard
   - Event name constant: `'browserx:visual-effect'`

2. **visual-effect-controller.ts**:
   - `IVisualEffectController` public API
   - `VisualEffectConfig` configuration interface
   - `VisualEffectState` state interface
   - Callback types (StateChangeCallback, CursorUpdateCallback, ErrorCallback)
   - `DEFAULT_CONFIG` constants
   - `PERFORMANCE_CONSTANTS` (TARGET_FPS: 60, SPEED_BOOST_MULTIPLIER: 1.5, MAX_MEMORY: 5MB)

**Integration Pattern**:
```
DomTool (implements IDomToolEventEmitter)
  ↓ dispatchVisualEffectEvent()
CustomEvent ('browserx:visual-effect')
  ↓ document.addEventListener()
VisualEffectController (implements IVisualEffectController)
  ↓ processes async
Cursor Animation + Ripple Effects
```

### Integration Guide

**Output**: [quickstart.md](./quickstart.md)

**Integration Steps**:

1. **Modify DomTool**: Implement `IDomToolEventEmitter`, add emission calls after actions
2. **Initialize Controller**: Create and initialize in content script entry point
3. **Wire Stop Button**: Add chrome.runtime message handler in service worker
4. **Test Integration**: Manual checklist + automated tests
5. **Handle Iframes**: Provide element reference or bounding box for coordinate calculation

**Time to Integrate**: ~30 minutes

## Agent Context Update

**Status**: ✅ COMPLETED

Updated `CLAUDE.md` with:
- Added database information (N/A - no persistence)
- Project type: Chrome Extension (web application)

Script output indicated placeholder values detected in plan.md (expected - will be resolved during implementation).

## Implementation Phases (Next Steps)

### Phase 2: Task Generation

**Command**: `/speckit.tasks`

**Expected Tasks** (preview):

1. **Setup & Configuration**:
   - Copy contracts from specs to src/content/dom/ui_effect/contracts/
   - Create type definitions in src/types/visualEffects.ts
   - Configure Vite build for visual effects components

2. **Core Components**:
   - Implement VisualEffectController.svelte (main orchestrator)
   - Implement Overlay.svelte (input blocking + control buttons)
   - Implement CursorAnimator.svelte (animated cursor)
   - Implement ControlButtons.svelte (Take Over / Stop Agent)

3. **Utilities**:
   - Implement coordinateCalculator.ts (viewport position calculation)
   - Implement easingFunctions.ts (animation curves)
   - Implement eventQueue.ts (FIFO queue with speed boost)
   - Implement stores.ts (Svelte stores for shared state)

4. **DomTool Integration**:
   - Add IDomToolEventEmitter to DomTool.ts
   - Add event emissions to ClickExecutor.ts
   - Add event emissions to InputExecutor.ts
   - Add event emissions to KeyPressExecutor.ts
   - Add session lifecycle event emissions

5. **Content Script Integration**:
   - Initialize VisualEffectController in src/content/index.ts
   - Handle page navigation and reinitialization
   - Add cleanup on unload

6. **Service Worker Integration**:
   - Add STOP_AGENT_SESSION message handler
   - Wire to agent session termination logic

7. **Testing**:
   - Unit tests for VisualEffectController
   - Unit tests for CursorAnimator
   - Unit tests for Overlay and ControlButtons
   - Unit tests for coordinateCalculator
   - Unit tests for eventQueue
   - Integration tests for end-to-end flow
   - Manual testing checklist validation

8. **Documentation**:
   - Embed pointinghand.svg as data URI in CursorAnimator
   - Add JSDoc comments to public APIs
   - Update README with visual effects section

## Success Metrics (From Spec)

- **SC-001**: Users can visually identify every agent action within 300ms
- **SC-002**: Agent operations complete without functionality degradation (zero impact)
- **SC-003**: Visual effect failures result in zero agent operation failures (100% isolation)
- **SC-004**: Users can take over page control within 1 second
- **SC-005**: Users can terminate agent within 500ms
- **SC-006**: Cursor animations complete smoothly across 95% of viewport (60fps)
- **SC-007**: Water ripple effects trigger exactly when cursor arrives (zero premature triggers)
- **SC-008**: DOM serialization shows undulate feedback for full 3.5 second duration
- **SC-009**: Visual effects auto-reinitialize after failures within one action cycle
- **SC-010**: System handles 5+ rapid sequential actions per second without blocking (<100ms queue delay)

## Risk Mitigation

| Risk | Impact | Mitigation | Status |
|------|--------|------------|--------|
| WebGL not supported | Medium | Graceful degradation - effects work without ripples | Addressed in research |
| Rapid actions (>10/sec) | Medium | Queue limit + speed boost + skip-ahead cursor logic | Addressed in design |
| Cross-origin iframe elements | Medium | Use bounding box fallback if element inaccessible | Addressed in contracts |
| Page JS modifying effects | Low | Closed shadow DOM prevents access, regenerate if removed | Addressed in architecture |

## Dependencies

**Internal**:
- Existing `water_ripple_effect.js` (WebGL ripple implementation)
- Existing `DomTool.ts` (requires modification for event emission)
- Existing `pointinghand.svg` (to be embedded)

**External**:
- Svelte 4.2.20 (already installed)
- TypeScript 5.9.2 (already installed)
- Vite 5.4.20 (already configured)
- Chrome Extension APIs (runtime, storage)

**Build Configuration**:
- Use existing `vite.config.content.mjs` for content script builds
- Svelte components compile to vanilla JavaScript
- Shadow DOM injection at runtime (no special build step)

## Timeline Estimate

Based on task complexity and integration points:

- **Phase 2 (Task Generation)**: 1 hour (automated via `/speckit.tasks`)
- **Phase 3 (Implementation)**:
  - Core components: 8-10 hours
  - DomTool integration: 2-3 hours
  - Testing: 4-6 hours
  - Documentation: 1-2 hours
  - **Total**: 15-21 hours

**Critical Path**: VisualEffectController → Overlay → CursorAnimator → DomTool Integration → Testing

## Next Command

Run `/speckit.tasks` to generate dependency-ordered task list in `tasks.md`.

This will create actionable implementation tasks based on the design artifacts produced in this planning phase.
