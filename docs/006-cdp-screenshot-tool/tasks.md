# Tasks: CDP Screenshot Tool

**Input**: Design documents from `/specs/006-cdp-screenshot-tool/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Tests are NOT explicitly requested in the specification. Test tasks are omitted per guidelines.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions
- Single project structure at repository root
- Source: `src/tools/`, `src/types/`, `src/models/`, `src/prompts/`
- Tests: `tests/tools/`, `tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Create directory structure and type definitions for the feature

- [X] T001 Create screenshot services directory at src/tools/screenshot/
- [X] T002 [P] Create types file at src/tools/screenshot/types.ts with ScreenshotToolRequest, ScreenshotToolResponse, Coordinates, ScrollOffset, ActionOptions interfaces
- [X] T003 [P] Create test directory at tests/tools/screenshot/ for service-level tests

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core enhancements that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [X] T004 Add scroll action to DOMTool in src/tools/DOMTool.ts (add 'scroll' to action enum, implement executeScroll method using existing DOM.scrollIntoViewIfNeeded)
- [X] T005 Update DOMTool definition in src/tools/DOMTool.ts to document scroll action in tool description
- [X] T006 Extend SerializedNode interface in src/types/domTool.ts with inViewport optional boolean field
- [X] T007 Implement ViewportDetector service at src/tools/screenshot/ViewportDetector.ts (calculate intersection percentage between element bbox and viewport bounds)
- [X] T008 Integrate ViewportDetector into DomService serialization at src/tools/dom/DomService.ts (call ViewportDetector.isInViewport during node serialization to populate inViewport field)

**Checkpoint**: Foundation ready - DOMTool scroll action works, inViewport field available in DOM snapshots

---

## Phase 3: User Story 1 - Visual Inspection of Viewport Content (Priority: P1) 🎯 MVP

**Goal**: Enable agent to capture visual screenshots of the current viewport as PNG images stored temporarily

**Independent Test**: Agent invokes PageScreenShotTool with screenshot action on any webpage, verify PNG file is created in chrome.storage.local and contains viewport content

### Implementation for User Story 1

- [X] T009 [P] [US1] Implement ScreenshotFileManager at src/tools/screenshot/ScreenshotFileManager.ts (save/get/delete methods using chrome.storage.local with key 'screenshot_cache', saveScreenshot atomically replaces old screenshot)
- [X] T010 [P] [US1] Implement ScreenshotService at src/tools/screenshot/ScreenshotService.ts (captureViewport and captureWithScroll methods using CDP Page.captureScreenshot)
- [X] T011 [US1] Create PageScreenShotTool class at src/tools/PageScreenShotTool.ts extending BaseTool with screenshot action implementation
- [X] T012 [US1] Implement executeScreenshot method in PageScreenShotTool calling ScreenshotService and ScreenshotFileManager
- [X] T013 [US1] Add viewport bounds detection helper in PageScreenShotTool using Runtime.evaluate to get window dimensions and scroll position
- [X] T014 [US1] Register PageScreenShotTool in src/tools/ToolRegistry.ts
- [X] T015 [US1] Update tool definition in PageScreenShotTool with proper schema for screenshot action parameters (scroll_offset optional)

**Checkpoint**: Agent can capture screenshots, screenshots stored in chrome.storage.local, file cleanup works

---

## Phase 4: User Story 3 - Viewport Visibility Detection in DOM (Priority: P1)

**Goal**: Populate inViewport field in all SerializedNodes so agent knows which elements are visible

**Independent Test**: Agent calls DOMTool.snapshot() and receives DOM tree with accurate inViewport field for all nodes (verify with elements at top/middle/bottom of long page)

**Note**: This story was already implemented in Phase 2 (T006-T008) as a foundational prerequisite. This phase serves as the validation checkpoint.

### Validation for User Story 3

- [X] T016 [US3] Verify ViewportDetector accuracy by testing on sample page with elements in/out of viewport (manual validation - check inViewport values match visual state)
- [X] T017 [US3] Verify DomService integration populates inViewport field for all nodes in DOM snapshot

**Checkpoint**: All DOM snapshots include accurate inViewport boolean field for every SerializedNode

---

## Phase 5: User Story 2 - Coordinate-Based Interaction on Captured Screenshots (Priority: P2)

**Goal**: Enable agent to perform click, type, scroll, keypress actions at specific screen coordinates

**Independent Test**: Agent captures screenshot, identifies button coordinates visually, invokes PageScreenShotTool.click(x, y), verify click action triggers on actual page

### Implementation for User Story 2

- [X] T018 [P] [US2] Implement CoordinateActionService at src/tools/screenshot/CoordinateActionService.ts with clickAt method using Input.dispatchMouseEvent CDP command
- [X] T019 [P] [US2] Add typeAt method to CoordinateActionService (dispatch mouse click to focus, then use Input.insertText for text input)
- [X] T020 [P] [US2] Add scrollTo method to CoordinateActionService using Input.dispatchMouseEvent with type 'mouseWheel'
- [X] T021 [P] [US2] Add keypressAt method to CoordinateActionService using Input.dispatchKeyEvent CDP command
- [X] T022 [US2] Implement executeClick method in PageScreenShotTool calling CoordinateActionService.clickAt
- [X] T023 [US2] Implement executeType method in PageScreenShotTool calling CoordinateActionService.typeAt
- [X] T024 [US2] Implement executeScroll method in PageScreenShotTool calling CoordinateActionService.scrollTo
- [X] T025 [US2] Implement executeKeypress method in PageScreenShotTool calling CoordinateActionService.keypressAt
- [X] T026 [US2] Update PageScreenShotTool definition with schemas for click, type, scroll, keypress actions
- [X] T027 [US2] Add coordinate validation in PageScreenShotTool (verify x, y are within viewport bounds before dispatching)

**Checkpoint**: Agent can perform coordinate-based actions (click, type, scroll, keypress) on live pages using visual coordinate analysis

---

## Phase 6: User Story 4 - Screenshot Image Management and LLM Integration (Priority: P2)

**Goal**: Upload screenshots to OpenAI vision API and implement automatic file cleanup after LLM requests

**Independent Test**: Take multiple screenshots in sequence, verify old files deleted before new capture, images successfully uploaded to OpenAI API, files cleaned up after request completion

### Implementation for User Story 4

- [X] T028 [US4] Extend OpenAIResponsesClient message format at src/models/OpenAIResponsesClient.ts to support image content blocks (add ImageContent and ContentBlock type definitions)
- [X] T029 [US4] Implement image upload logic in OpenAIResponsesClient to construct data URL from base64 screenshot and add to message content array
- [X] T030 [US4] Add vision capability check in OpenAIResponsesClient (verify current model supports vision, throw error if not)
- [X] T031 [US4] Integrate screenshot retrieval in OpenAIResponsesClient (call ScreenshotFileManager.getScreenshot when screenshot action response detected)
- [X] T032 [US4] Implement cleanup hook in OpenAIResponsesClient stream completion handler (call ScreenshotFileManager.deleteScreenshot after successful API response or final failure)
- [X] T033 [US4] Update PageScreenShotTool executeScreenshot to save screenshot via ScreenshotFileManager and return file_id in response
- [X] T034 [US4] Add size validation in ScreenshotFileManager.saveScreenshot (check base64 size < 10MB, throw error if exceeded)

**Checkpoint**: Screenshots uploaded to OpenAI vision API, automatic cleanup works (zero orphaned files), vision-capable messages work end-to-end

---

## Phase 7: User Story 5 - Updated Agent Prompt for Tool Selection (Priority: P3)

**Goal**: Add clear guidance to agent system prompt about when and how to use PageScreenShotTool and DOMTool.scroll

**Independent Test**: Provide agent with various web pages (standard forms, canvas UIs, elements below fold), verify agent uses DOMTool first, scrolls elements into view when needed, only uses screenshots for visual analysis

### Implementation for User Story 5

- [X] T035 [US5] Add PageScreenShotTool usage section to src/prompts/agent_prompt.md with tool usage pattern guidelines
- [X] T036 [US5] Add out-of-viewport element workflow to agent_prompt.md (step-by-step: check inViewport → DOMTool.scroll → screenshot if needed → act)
- [X] T037 [US5] Add decision flow examples to agent_prompt.md (4 examples: element in viewport, element below fold, element below fold + visual verification, canvas-based UI)
- [X] T038 [US5] Add cost awareness guidance to agent_prompt.md (screenshots consume 1000-2000 tokens, use judiciously)
- [X] T039 [US5] Document DOMTool.scroll action usage in agent_prompt.md (how to bring elements into view with node_id and options)

**Checkpoint**: Agent system prompt provides complete workflow guidance for PageScreenShotTool and DOMTool.scroll integration

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, validation, and documentation improvements

- [X] T040 [P] Add error handling for CDP connection failures in ScreenshotService (wrap CDP commands in try-catch, return clear error messages)
- [X] T041 [P] Add error handling for storage failures in ScreenshotFileManager (handle chrome.storage.local errors gracefully)
- [X] T042 [P] Add error handling for coordinate validation in PageScreenShotTool (check coordinates within viewport bounds, return validation errors)
- [X] T043 Add request validation in PageScreenShotTool executeImpl (validate required fields per action type before execution)
- [X] T044 [P] Add logging for screenshot operations in PageScreenShotTool (debug logs for capture, upload, cleanup lifecycle)
- [X] T045 [P] Add performance logging in ScreenshotService (track screenshot capture duration, log if exceeds 3-second threshold)
- [X] T046 Update quickstart.md with final implementation notes if any deviations from original design

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational (Phase 2) - Core screenshot capability
- **User Story 3 (Phase 4)**: Validation of Phase 2 work - Depends on Foundational (Phase 2)
- **User Story 2 (Phase 5)**: Depends on User Story 1 (needs screenshot capability for context) - Coordinate-based actions
- **User Story 4 (Phase 6)**: Depends on User Story 1 (needs screenshot files to upload) - LLM integration
- **User Story 5 (Phase 7)**: Depends on all other stories (needs complete feature to document) - Prompt guidance
- **Polish (Phase 8)**: Depends on all user stories being complete

### User Story Dependencies

```
Phase 2 (Foundational)
├── Phase 3 (US1: Screenshot Capture) ✓ No dependencies on other stories
│   ├── Phase 5 (US2: Coordinate Actions) ✓ Needs US1 for screenshots
│   └── Phase 6 (US4: LLM Integration) ✓ Needs US1 for screenshot files
├── Phase 4 (US3: Viewport Detection) ✓ Validation of foundational work
└── Phase 7 (US5: Prompt Update) ✓ Needs all stories complete
```

**Critical Path**: Phase 1 → Phase 2 → Phase 3 (US1) → Phase 5 (US2) & Phase 6 (US4) → Phase 7 (US5) → Phase 8

### Within Each Phase

#### Phase 2 (Foundational) - Sequential dependencies:
- T004-T005 (DOMTool scroll) → T006 (type extension) → T007 (ViewportDetector) → T008 (integration)

#### Phase 3 (US1) - Parallel opportunities:
- T009 (ScreenshotFileManager) and T010 (ScreenshotService) can run in parallel
- T011-T015 sequential (tool implementation)

#### Phase 5 (US2) - Parallel opportunities:
- T018-T021 (all CoordinateActionService methods) can run in parallel
- T022-T025 (PageScreenShotTool action methods) can run in parallel after T018-T021
- T026-T027 sequential after actions

#### Phase 6 (US4) - Some parallelism:
- T028-T030 (OpenAIResponsesClient extensions) somewhat sequential
- T033-T034 can be done in parallel with T028-T032

#### Phase 8 (Polish) - High parallelism:
- T040, T041, T042, T044, T045, T046 all can run in parallel (different files/concerns)

### Parallel Opportunities

- **Phase 1**: T002, T003 can run in parallel with T001 complete
- **Phase 2**: Sequential (each task depends on previous)
- **Phase 3 (US1)**: T009 ‖ T010, then T011-T015 sequential
- **Phase 5 (US2)**: T018 ‖ T019 ‖ T020 ‖ T021, then T022 ‖ T023 ‖ T024 ‖ T025
- **Phase 7 (US5)**: T035 ‖ T036 ‖ T037 ‖ T038 ‖ T039 (all parallel - same file, different sections)
- **Phase 8 (Polish)**: T040 ‖ T041 ‖ T042 ‖ T044 ‖ T045 ‖ T046

---

## Parallel Example: User Story 1 (Screenshot Capture)

```bash
# Launch services in parallel (different files, no dependencies):
Task T009: "Implement ScreenshotFileManager at src/tools/screenshot/ScreenshotFileManager.ts"
Task T010: "Implement ScreenshotService at src/tools/screenshot/ScreenshotService.ts"

# After both complete, implement tool interface sequentially:
Task T011: "Create PageScreenShotTool class at src/tools/PageScreenShotTool.ts"
Task T012: "Implement executeScreenshot method in PageScreenShotTool"
# ... etc
```

---

## Parallel Example: User Story 2 (Coordinate Actions)

```bash
# Launch all CoordinateActionService methods in parallel (same file, independent methods):
Task T018: "Implement clickAt method in CoordinateActionService"
Task T019: "Add typeAt method to CoordinateActionService"
Task T020: "Add scrollTo method to CoordinateActionService"
Task T021: "Add keypressAt method to CoordinateActionService"

# After all complete, implement PageScreenShotTool actions in parallel:
Task T022: "Implement executeClick in PageScreenShotTool"
Task T023: "Implement executeType in PageScreenShotTool"
Task T024: "Implement executeScroll in PageScreenShotTool"
Task T025: "Implement executeKeypress in PageScreenShotTool"
```

---

## Implementation Strategy

### MVP First (User Stories 1 + 3 Only)

1. Complete Phase 1: Setup (T001-T003)
2. Complete Phase 2: Foundational (T004-T008) → **DOMTool.scroll + inViewport work**
3. Complete Phase 3: User Story 1 (T009-T015) → **Screenshot capture works**
4. Complete Phase 4: User Story 3 (T016-T017) → **Validate inViewport accuracy**
5. **STOP and VALIDATE**: Test screenshot capture end-to-end
6. Deploy/demo MVP: Agent can check inViewport, scroll elements into view, capture screenshots

**MVP Scope**: 17 tasks (T001-T017)
**Value Delivered**: Core visual inspection capability with viewport management

### Incremental Delivery

1. **Foundation** (Phases 1-2): Setup + DOMTool enhancements + viewport detection → ~8 tasks
2. **MVP** (Phases 3-4): Screenshot capture + validation → +9 tasks → **Deploy v0.1**
3. **Coordinate Actions** (Phase 5): Visual coordinate-based interactions → +10 tasks → **Deploy v0.2**
4. **LLM Integration** (Phase 6): OpenAI vision upload + cleanup → +7 tasks → **Deploy v0.3**
5. **Complete** (Phases 7-8): Prompt guidance + polish → +12 tasks → **Deploy v1.0**

### Parallel Team Strategy

With multiple developers after Foundational phase completes:

1. **Team completes Phase 1-2 together** (foundational work must be sequential)
2. Once Phase 2 done:
   - **Developer A**: Phase 3 (US1 - Screenshot Capture)
   - **Developer B**: Can start Phase 7 (US5 - Prompt documentation) in parallel
3. After Phase 3 (US1) complete:
   - **Developer A**: Phase 5 (US2 - Coordinate Actions)
   - **Developer B**: Phase 6 (US4 - LLM Integration)
4. **Developer C** (if available): Phase 4 (US3 - Validation) and Phase 8 (Polish)

**Note**: Most user stories have dependencies on US1, so true parallelism limited until screenshot capture (US1) complete.

---

## Task Count Summary

- **Phase 1 (Setup)**: 3 tasks
- **Phase 2 (Foundational)**: 5 tasks (CRITICAL - blocks all stories)
- **Phase 3 (US1 - P1)**: 7 tasks 🎯 MVP
- **Phase 4 (US3 - P1)**: 2 tasks (validation)
- **Phase 5 (US2 - P2)**: 10 tasks
- **Phase 6 (US4 - P2)**: 7 tasks
- **Phase 7 (US5 - P3)**: 5 tasks
- **Phase 8 (Polish)**: 7 tasks

**Total**: 46 tasks

**MVP Scope** (Phases 1-4): 17 tasks
**Full Feature**: 46 tasks

**Parallel Opportunities**: 18 tasks marked [P] can run concurrently with others in their phase

---

## Notes

- **[P] tasks**: Different files or independent methods, no dependencies
- **[Story] labels**: Map tasks to user stories (US1-US5) from spec.md
- **MVP = User Story 1 + User Story 3**: Core screenshot capability with viewport detection (17 tasks)
- **No tests included**: Specification does not explicitly request test implementation
- **DOMTool enhancement**: T004-T005 add scroll action to existing DOMTool (foundational prerequisite)
- **Viewport detection**: T006-T008 implement inViewport field (foundational prerequisite)
- **File paths**: All paths use src/tools/, src/types/, src/models/, src/prompts/ per plan.md structure
- **Critical dependencies**: Phase 2 must complete before any user story work begins
- **Storage approach**: Using chrome.storage.local with key "screenshot_cache" (unified storage, no filesystem tmp/ directory)
- **Atomic updates**: chrome.storage.local.set() automatically replaces old screenshot (no explicit cleanup needed before save)
- **Size limit**: 10MB per chrome.storage.local item (sufficient for viewport screenshots, typically 500KB-2MB)
- **CDP commands**: All implementation uses Chrome DevTools Protocol per research.md patterns

**Commit Strategy**: Commit after each task or logical task group (e.g., T009+T010 together)

**Validation Checkpoints**: Stop after Phases 3, 5, 6, 7 to validate each story independently
