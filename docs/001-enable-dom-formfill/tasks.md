# Tasks: DOM Tool Form Fill Action

**Input**: Design documents from `/specs/001-enable-dom-formfill/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Integration coverage is required to validate end-to-end automation flows and confirm independent test criteria per user story.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Provide shared fixtures for upcoming integration scenarios.

- [X] T001 Create multi-field form fixture for automation tests in tests/fixtures/test-pages/multi-field-form.html

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Establish shared types and helpers required by every user story before implementing the new action.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Define fill-form request/response interfaces in src/types/domTool.ts
- [X] T003 Extract field type inference and selector utilities from src/tools/FormAutomationTool.ts into src/tools/dom/FormFillHelpers.ts

**Checkpoint**: Foundation ready – user story implementation can now begin in parallel.

---

## Phase 3: User Story 1 - Fill multi-field forms in one action (Priority: P1) 🎯 MVP

**Goal**: Allow the orchestrator to populate all mapped inputs through a single `fill_form` DOM Tool request.

**Independent Test**: Execute a `fill_form` payload targeting five inputs on tests/fixtures/test-pages/multi-field-form.html and confirm every mapped field is populated in one action response.

### Implementation for User Story 1

- [X] T004 [US1] Extend DOM tool definition and validation to accept `fill_form` in src/tools/DOMTool.ts
- [X] T005 [US1] Route `fill_form` execution to DomService with unified metadata in src/tools/DOMTool.ts
- [X] T006 [US1] Implement batched field population via Runtime.evaluate in src/tools/dom/DomService.ts
- [X] T007 [US1] Rewrite multi-field success integration scenario in tests/integration/dom-operations/form_automation.test.ts

**Checkpoint**: User Story 1 delivers a single-action multi-field fill and is independently verifiable.

---

## Phase 4: User Story 2 - Surface fill outcomes to the orchestrator (Priority: P2)

**Goal**: Provide granular success/failure feedback per field so the orchestrator can react to mismatches immediately.

**Independent Test**: Submit a payload with one mismatched field and confirm the response flags the specific failure while listing successful fields.

### Implementation for User Story 2

- [X] T008 [US2] Add `FieldOutcome` structures and status enums to src/types/domTool.ts
- [X] T009 [US2] Capture per-field outcomes and aggregate status inside src/tools/dom/DomService.ts
- [X] T010 [US2] Return structured fill-form results from src/tools/DOMTool.ts
- [X] T011 [US2] Add partial failure coverage to tests/integration/dom-operations/form_automation.test.ts

**Checkpoint**: User Story 2 exposes actionable per-field diagnostics without regressing the primary flow.

---

## Phase 5: User Story 3 - Blend structured and granular actions (Priority: P3)

**Goal**: Ensure the new `fill_form` action coexists with legacy single-field interactions and replaces the standalone FormAutomationTool.

**Independent Test**: Perform a `fill_form` action followed by a traditional `type` action within the same workflow and confirm values persist without side effects.

### Implementation for User Story 3

- [X] T012 [US3] Maintain snapshot consistency after fill_form so follow-up actions reuse node mappings in src/tools/dom/DomService.ts
- [X] T013 [US3] Add compatibility scenario (fill_form then single-field edit) to tests/integration/dom-operations/form_automation.test.ts
- [X] T014 [US3] Remove FormAutomationTool and update registrations in src/tools/FormAutomationTool.ts, src/tools/index.ts, and src/tools/ToolRegistry.ts

**Checkpoint**: User Story 3 confirms compatibility and decommissions the legacy tool path.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, telemetry, and validation updates that affect multiple user stories.

- [X] T015 Document the new fill_form action in DOM-TOOL-DEBUG-GUIDE.md
- [X] T016 Update form automation references to point to DOM Tool in BROWSER_USE_QUICK_REFERENCE.md
- [X] T017 Record changelog entry summarizing the tool migration in CHANGELOG.md
- [X] T018 Verify quickstart steps and note outcomes in specs/001-enable-dom-formfill/quickstart.md
- [X] T019 Capture final regression run results in docs/FINAL_REPORT.md

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)** → prerequisite for fixture-dependent integration tests.
- **Phase 2 (Foundational)** → depends on Phase 1 and blocks all user story phases.
- **Phase 3 (US1)** → starts after Phase 2; delivers MVP.
- **Phase 4 (US2)** → starts after Phase 3 to reuse the working fill logic while extending response detail.
- **Phase 5 (US3)** → starts after Phase 4 to validate compatibility and retire the legacy tool.
- **Phase 6 (Polish)** → runs after all targeted user stories are complete.

### User Story Dependencies

- **US1 (P1)** → no story dependencies once foundational tasks are done.
- **US2 (P2)** → depends on US1’s form-fill implementation.
- **US3 (P3)** → depends on US1 and US2 to ensure compatibility and retirement occur against the finalized flow.

### Within Each User Story

- Update TypeScript types before modifying service/tool logic.
- Implement DomService functionality before wiring DOMTool responses.
- Refresh integration tests after implementation changes to lock in behavior.

### Parallel Opportunities

- T002 can run in parallel with preparation work because it only touches src/types/domTool.ts.
- After Phase 2, documentation tasks in Phase 6 marked with different files can run in parallel while integration tests execute.
- Within US3, removal of the legacy tool (T014) should wait until tests (T013) confirm compatibility, but documentation updates (T015–T017) can proceed once functionality stabilizes.

---

## Parallel Example: User Story 1

```bash
# Parallelizable TypeScript updates before integration testing:
# (Run once foundational helpers exist.)
Task: "Extend DOM tool definition and validation to accept `fill_form` in src/tools/DOMTool.ts"
Task: "Implement batched field population via Runtime.evaluate in src/tools/dom/DomService.ts"

# Follow with the integration test to validate end-to-end behavior:
Task: "Rewrite multi-field success integration scenario in tests/integration/dom-operations/form_automation.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1 and Phase 2 to unlock shared fixtures and helpers.
2. Implement User Story 1 tasks (T004–T007) and run the integration test.
3. Demonstrate the single-action multi-field fill capability as the MVP.

### Incremental Delivery

1. Deliver US1 (multi-field fill) for immediate value.
2. Add US2 to surface granular outcomes without disrupting the MVP.
3. Add US3 to ensure legacy compatibility and retire the old tool.
4. Apply polish tasks for documentation and validation after functional work stabilizes.

### Parallel Team Strategy

- Developer A: Focus on DomService internals (T006, T009, T012).
- Developer B: Handle DOMTool request/response wiring (T004, T005, T010).
- Developer C: Own integration tests and legacy tool removal (T007, T011, T013, T014).
- Shared documentation and validation (Phase 6) can be distributed once core stories are complete.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Story] label maps tasks to a specific user story for traceability.
- Each user story should remain independently completable and testable.
- Commit after each task or cohesive group; stop at checkpoints to validate stories independently.
