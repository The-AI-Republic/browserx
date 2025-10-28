# Tasks: DomTool Visual Effects

**Input**: Design documents from `/specs/003-domtool-visual-effects/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are NOT explicitly requested in the specification. Test tasks are included but marked optional.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Chrome Extension structure**: `src/content/`, `src/static/`, `src/types/`, `tests/`
- All paths relative to repository root: `/home/rich/dev/airepublic/open_source/s1/browserx/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and contract copying

- [ ] T001 Copy contracts from specs to source: Copy `specs/003-domtool-visual-effects/contracts/*.ts` to `src/content/dom/ui_effect/contracts/`
- [ ] T002 [P] Copy contracts README: Copy `specs/003-domtool-visual-effects/contracts/README.md` to `src/content/dom/ui_effect/contracts/README.md`
- [ ] T003 [P] Create type definitions file: Create `src/types/visualEffects.ts` with re-exports from contracts
- [ ] T004 [P] Read and embed SVG asset: Read `src/static/pointinghand.svg` content and prepare as data URI string constant for embedding

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core utilities and stores that ALL user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T005 [P] Implement easing functions: Create `src/content/dom/ui_effect/utils/easingFunctions.ts` with easeInOutCubic, easeOutQuad, linear functions
- [ ] T006 [P] Implement coordinate calculator: Create `src/content/dom/ui_effect/utils/coordinateCalculator.ts` with getViewportCoordinates function for element → viewport position (handles iframes)
- [ ] T007 [P] Implement event queue: Create `src/content/dom/ui_effect/utils/eventQueue.ts` with EffectQueue class (FIFO, max 10, speed boost when >3)
- [ ] T008 Create Svelte stores: Create `src/content/dom/ui_effect/stores.ts` with writable stores for cursorPosition, overlayState, effectQueue, animationState

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Passive Agent Observation (Priority: P1) 🎯 MVP

**Goal**: Provide visual feedback for agent DOM operations with overlay, cursor animation, and ripple effects

**Independent Test**: Trigger any agent DOM action (click, type, keypress) on a test page and verify: (1) overlay appears and blocks user input, (2) cursor animates from center/last position to target element, (3) water ripple appears at element location after cursor arrives, (4) effects disappear when agent session ends.

### Tests for User Story 1 (OPTIONAL - include if desired) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T009 [P] [US1] Unit test for coordinate calculator: Create `tests/unit/content/dom/ui_effect/coordinateCalculator.test.ts` testing element → viewport conversion and iframe offset handling
- [ ] T010 [P] [US1] Unit test for event queue: Create `tests/unit/content/dom/ui_effect/eventQueue.test.ts` testing FIFO, max size, speed boost logic
- [ ] T011 [P] [US1] Unit test for cursor animator component: Create `tests/unit/content/dom/ui_effect/CursorAnimator.test.ts` testing animation lifecycle, position updates, easing

### Implementation for User Story 1

- [ ] T012 [P] [US1] Create Overlay component: Create `src/content/dom/ui_effect/Overlay.svelte` with semi-transparent full-viewport div, input blocking (pointer-events: all, event capture), reactive visibility from overlayState store
- [ ] T013 [P] [US1] Create CursorAnimator component: Create `src/content/dom/ui_effect/CursorAnimator.svelte` with embedded SVG cursor (use prepared data URI from T004), RAF-based animation, reads cursorPosition/animationState stores, applies CSS transform for GPU acceleration
- [ ] T014 [US1] Implement ripple effect adapter: In `src/content/dom/ui_effect/VisualEffectController.svelte`, add method to trigger water_ripple_effect.js drop() function with viewport coordinates after cursor animation completes
- [ ] T015 [US1] Create VisualEffectController main component: Create `src/content/dom/ui_effect/VisualEffectController.svelte` implementing IVisualEffectController interface - listens for CustomEvents ('browserx:visual-effect'), manages state stores, orchestrates overlay/cursor/ripple, Shadow DOM injection with closed mode
- [ ] T016 [US1] Implement event listener and queue processing: In VisualEffectController, add document.addEventListener for 'browserx:visual-effect', queue events via effectQueue store, process FIFO with speed boost logic (1.5x when >3 items)
- [ ] T017 [US1] Implement cursor animation logic: In VisualEffectController, add method to start cursor animation (calculate duration from distance 300-1500ms, update animationState store, use RAF loop with easing, update cursorPosition store each frame)
- [ ] T018 [US1] Add error handling and reinitialization: Wrap all VisualEffectController methods in try-catch, log errors silently, set reinitialization flag, retry on next event
- [ ] T019 [US1] Add DomTool event emitter implementation: Modify `src/content/dom/DomTool.ts` to implement IDomToolEventEmitter interface, add emitAgentStart(), emitAgentStop(), emitAgentAction(), emitAgentSerialize() methods using dispatchVisualEffectEvent helper
- [ ] T020 [US1] Add event emission to ClickExecutor: Modify `src/content/dom/actions/ClickExecutor.ts` executeClick function to call emitAgentAction('click', element, boundingBox) AFTER successful click execution
- [ ] T021 [US1] Add event emission to InputExecutor: Modify `src/content/dom/actions/InputExecutor.ts` executeType function to call emitAgentAction('type', element, boundingBox) AFTER successful type execution
- [ ] T022 [US1] Add event emission to KeyPressExecutor: Modify `src/content/dom/actions/KeyPressExecutor.ts` executeKeyPress function to call emitAgentAction('keypress', element, boundingBox) AFTER successful keypress execution
- [ ] T023 [US1] Initialize VisualEffectController in content script: Modify `src/content/index.ts` to create and initialize VisualEffectController instance with default config when content script loads, add cleanup on window unload event
- [ ] T024 [US1] Add agent session lifecycle events: In agent session management code (identify location - likely service-worker or session manager), call domTool.emitAgentStart() when session starts, call domTool.emitAgentStop() when session ends

**Checkpoint**: At this point, User Story 1 should be fully functional - overlay appears on agent start, cursor animates to action locations, ripples trigger after cursor arrives, effects clear on agent stop

---

## Phase 4: User Story 2 - Manual Takeover Control (Priority: P2)

**Goal**: Provide user control to temporarily take over page interaction or permanently stop agent

**Independent Test**: Start agent session, click "Take Over" button and verify overlay disappears but visual effects continue for agent actions (user can interact with page), perform manual user actions and verify no visual effects for them, click "Stop Agent" button and verify agent session terminates and all effects disappear.

### Tests for User Story 2 (OPTIONAL - include if desired) ⚠️

- [ ] T025 [P] [US2] Unit test for ControlButtons component: Create `tests/unit/content/dom/ui_effect/ControlButtons.test.ts` testing button click handlers, state updates, chrome.runtime.sendMessage calls
- [ ] T026 [P] [US2] Unit test for Overlay component takeover mode: Add test cases to `tests/unit/content/dom/ui_effect/Overlay.test.ts` verifying overlay visibility toggles correctly with takeoverActive state

### Implementation for User Story 2

- [ ] T027 [P] [US2] Create ControlButtons component: Create `src/content/dom/ui_effect/ControlButtons.svelte` with "Take Over" and "Stop Agent" buttons, positioned bottom-center, styled with pointer-events: auto, reads overlayState store
- [ ] T028 [US2] Implement "Take Over" button handler: In ControlButtons component, add click handler that updates overlayState store to set visible=false and takeoverActive=true (overlay hidden, effects continue)
- [ ] T029 [US2] Implement "Stop Agent" button handler: In ControlButtons component, add click handler that calls chrome.runtime.sendMessage with type='STOP_AGENT_SESSION' and updates overlayState to agentSessionActive=false, visible=false
- [ ] T030 [US2] Integrate ControlButtons into Overlay: Modify `src/content/dom/ui_effect/Overlay.svelte` to include ControlButtons component as child, ensure buttons remain clickable with proper z-index
- [ ] T031 [US2] Update overlay visibility logic: In VisualEffectController, modify overlay rendering logic to check both overlayState.visible and overlayState.takeoverActive - overlay hidden when takeoverActive=true but visual effects continue
- [ ] T032 [US2] Add service worker message handler: Modify service worker (likely `src/service-worker.ts`) to add chrome.runtime.onMessage listener for type='STOP_AGENT_SESSION', call stopAgentSession() function when received
- [ ] T033 [US2] Wire agent session termination: In agent session management code, ensure stopAgentSession() function calls domTool.emitAgentStop() to trigger visual effects cleanup

**Checkpoint**: At this point, User Stories 1 AND 2 should both work independently - users can observe agent actions AND control/stop the agent

---

## Phase 5: User Story 3 - DOM Analysis Feedback (Priority: P3)

**Goal**: Provide visual feedback (undulate effect) when agent analyzes DOM structure

**Independent Test**: Trigger get_serialized_dom call in DomTool and verify undulate effect (20 random ripples staggered over 0.5 seconds) appears across page, ripples have varied positions/sizes/strengths, effect fades naturally over 3.5 seconds total.

### Tests for User Story 3 (OPTIONAL - include if desired) ⚠️

- [ ] T034 [P] [US3] Integration test for undulate effect: Create `tests/integration/visual-effects-integration.test.ts` testing complete flow - dispatch 'agent-serialize' event, verify WaterRipple.undulate() called, verify timing and fade

### Implementation for User Story 3

- [ ] T035 [US3] Implement undulate effect handler: In VisualEffectController, add event handler for type='agent-serialize' events that calls water_ripple_effect.js undulate() method (20 staggered ripples)
- [ ] T036 [US3] Add event emission to serialization: Modify `src/content/dom/DomTool.ts` getSerializedDom method to call emitAgentSerialize() BEFORE starting DOM serialization (fire-and-forget, doesn't block)
- [ ] T037 [US3] Verify undulate timing parameters: In WaterRipple undulate() integration, confirm ripples stagger over 500ms and fade over 3000ms (total 3.5s duration) as specified in water_ripple_effect.js

**Checkpoint**: All user stories should now be independently functional - full visual feedback system complete

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T038 [P] Add JSDoc comments to contracts: Add comprehensive JSDoc comments to `src/content/dom/ui_effect/contracts/domtool-events.ts` and `visual-effect-controller.ts` documenting all public interfaces
- [ ] T039 [P] Add viewport resize handling: In VisualEffectController, add window.addEventListener('resize') handler that recalculates overlay dimensions and updates coordinate system for ongoing animations
- [ ] T040 [P] Optimize animation performance: Review CursorAnimator RAF loop, ensure transform/opacity only (GPU-accelerated), verify no layout thrashing, confirm 60fps in Chrome DevTools performance panel
- [ ] T041 [P] Additional unit tests if needed: Add any missing unit tests for stores.ts, easingFunctions.ts based on coverage analysis (OPTIONAL)
- [ ] T042 Test WebGL fallback: Manually test on system without WebGL support, verify cursor and overlay work correctly without ripple effects, verify error logged but no crash
- [ ] T043 Test iframe coordinate calculation: Create test page with nested iframes, trigger agent actions on iframe elements, verify cursor animates to correct viewport positions
- [ ] T044 Test rapid action queue: Trigger 10+ agent actions rapidly (<100ms apart), verify queue manages correctly, speed boost activates at >3 items, no dropped events (within queue limit)
- [ ] T045 Validate against quickstart.md: Follow integration steps in `specs/003-domtool-visual-effects/quickstart.md`, ensure all code examples work, update any discrepancies
- [ ] T046 Run manual testing checklist: Execute all test scenarios from quickstart.md section 4.1 (agent start, click action, serialize action, take over button, stop agent button)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-5)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Phase 6)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories ✅ Fully independent
- **User Story 2 (P2)**: Can start after Foundational (Phase 2) - Builds on US1 components (VisualEffectController, Overlay) but adds control buttons independently
- **User Story 3 (P3)**: Can start after Foundational (Phase 2) - Uses VisualEffectController from US1 but adds serialize event handler independently

### Within Each User Story

- Tests (if included) MUST be written and FAIL before implementation
- Utilities before components (coordinateCalculator, eventQueue before CursorAnimator, VisualEffectController)
- Stores before components that use them
- Child components before parent components (CursorAnimator, Overlay before VisualEffectController)
- VisualEffectController before DomTool integration (need event listener ready)
- DomTool integration before content script initialization
- Content script initialization before session lifecycle integration

### Parallel Opportunities

**Phase 1 (Setup)**: T001, T002, T003, T004 can all run in parallel (different files)

**Phase 2 (Foundational)**: T005, T006, T007 can run in parallel (different files), T008 (stores) should run after T006/T007 if stores depend on types from utils

**Phase 3 (US1)**:
- T009, T010, T011 (tests) can run in parallel
- T012 (Overlay), T013 (CursorAnimator), T019 (DomTool interface impl) can run in parallel
- T020, T021, T022 (executor modifications) can run in parallel

**Phase 4 (US2)**:
- T025, T026 (tests) can run in parallel
- T027 (ControlButtons) independent
- T028, T029 (button handlers) can run in parallel

**Phase 5 (US3)**:
- T034 (test) independent
- T035, T036 can run in parallel

**Phase 6 (Polish)**:
- T038, T039, T040, T041 can run in parallel (different files/concerns)

---

## Parallel Example: User Story 1 Core Components

```bash
# Launch all foundational utilities together:
Task: "Implement easing functions in src/content/dom/ui_effect/utils/easingFunctions.ts"
Task: "Implement coordinate calculator in src/content/dom/ui_effect/utils/coordinateCalculator.ts"
Task: "Implement event queue in src/content/dom/ui_effect/utils/eventQueue.ts"

# Launch all US1 tests together (if writing tests):
Task: "Unit test for coordinate calculator in tests/unit/content/dom/ui_effect/coordinateCalculator.test.ts"
Task: "Unit test for event queue in tests/unit/content/dom/ui_effect/eventQueue.test.ts"
Task: "Unit test for cursor animator in tests/unit/content/dom/ui_effect/CursorAnimator.test.ts"

# Launch all US1 core components together:
Task: "Create Overlay component in src/content/dom/ui_effect/Overlay.svelte"
Task: "Create CursorAnimator component in src/content/dom/ui_effect/CursorAnimator.svelte"
Task: "Add DomTool event emitter implementation in src/content/dom/DomTool.ts"

# Launch all executor modifications together:
Task: "Add event emission to ClickExecutor in src/content/dom/actions/ClickExecutor.ts"
Task: "Add event emission to InputExecutor in src/content/dom/actions/InputExecutor.ts"
Task: "Add event emission to KeyPressExecutor in src/content/dom/actions/KeyPressExecutor.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (T001-T004)
2. Complete Phase 2: Foundational (T005-T008) - CRITICAL checkpoint
3. Complete Phase 3: User Story 1 (T009-T024)
4. **STOP and VALIDATE**: Test User Story 1 independently using acceptance scenarios from spec.md
5. Deploy/demo if ready - this delivers core value

### Incremental Delivery

1. **Foundation** (Setup + Foundational) → Can't see visual effects yet but foundation ready
2. **MVP** (+ User Story 1) → Overlay + cursor animation + ripples → Test independently → Deploy/Demo ✅ Core value delivered
3. **Control** (+ User Story 2) → Takeover and Stop buttons → Test independently → Deploy/Demo
4. **Complete** (+ User Story 3) → DOM analysis feedback → Test independently → Deploy/Demo
5. **Polish** (Phase 6) → Performance, edge cases, cross-cutting concerns

Each increment adds value without breaking previous stories.

### Parallel Team Strategy

With multiple developers:

1. **Team completes Setup + Foundational together** (T001-T008)
2. Once Foundational is done:
   - **Developer A**: User Story 1 (T009-T024) - Core visual effects
   - **Developer B**: User Story 2 (T025-T033) - Control buttons
   - **Developer C**: User Story 3 (T034-T037) - DOM analysis feedback
3. Stories complete and integrate independently
4. Team merges and validates all stories work together

---

## Task Statistics

**Total Tasks**: 46

**By Phase**:
- Phase 1 (Setup): 4 tasks
- Phase 2 (Foundational): 4 tasks
- Phase 3 (User Story 1): 16 tasks (3 optional tests + 13 implementation)
- Phase 4 (User Story 2): 9 tasks (2 optional tests + 7 implementation)
- Phase 5 (User Story 3): 4 tasks (1 optional test + 3 implementation)
- Phase 6 (Polish): 9 tasks

**By User Story**:
- US1 (P1): 16 tasks - Core visual feedback system
- US2 (P2): 9 tasks - User control mechanisms
- US3 (P3): 4 tasks - DOM analysis feedback

**Parallelizable Tasks**: 18 tasks marked [P] (39% of total)

**Critical Path**:
1. Setup (Phase 1) → 4 tasks
2. Foundational (Phase 2) → 4 tasks
3. User Story 1 sequential tasks → ~8 tasks (after parallel components complete)
4. **Minimum MVP**: ~16 tasks total on critical path

**Estimated Effort**: 15-21 hours total per plan.md timeline estimate

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable per spec.md
- Tests are OPTIONAL - included but can be skipped if not using TDD approach
- Verify tests fail before implementing (if writing tests)
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Fire-and-forget architecture means DomTool integration never waits for visual effects
- Shadow DOM closed mode prevents page scripts from accessing visual effects
- All errors in visual effects are caught and logged, never propagated to DomTool

**Success Criteria** (from spec.md):
- SC-001: 300ms visual feedback latency ✓
- SC-002: Zero impact on DomTool (fire-and-forget) ✓
- SC-003: 100% error isolation ✓
- SC-006: 60fps cursor animation ✓
- SC-010: Handle 5+ actions/second with <100ms queue delay ✓
