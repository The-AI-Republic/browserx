# Feature Specification: DOM Tool Form Fill Action

**Feature Branch**: `001-enable-dom-formfill`  
**Created**: 2025-10-31  
**Status**: Draft  
**Input**: User description: "add fillform action into DomTool, currently the dom tool is following one peek one action unit, for text type, sometimes the form filling can be exception for that, we should allow llm to send a json object to the Dom tool and fill the form all at once instead of type text into different fields one by one. implement the fill form action into dom tool. Also we have v1 version of the form automation tool browserx/src/tools/FormAutomationTool.ts already, absorb the logic from there and delete it. We"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fill multi-field forms in one action (Priority: P1)

The automation orchestrator (LLM agent) wants to populate all required inputs on a web form by issuing a single structured request to the DOM Tool so that tasks complete without manually sequencing field-by-field actions.

**Why this priority**: Multi-field forms are common across workflows; making them a single action unlocks the primary efficiency gain and removes the current bottleneck.

**Independent Test**: Trigger a fill request against a representative five-field form and confirm every mapped field is populated correctly within one DOM Tool action cycle.

**Acceptance Scenarios**:

1. **Given** the DOM Tool has a current view of a form with accessible fields, **When** the orchestrator sends a fill_form action that maps identifiers to values, **Then** the DOM Tool applies every value to the matching fields and returns a success summary in the same response.
2. **Given** the structured payload omits optional fields, **When** the action executes, **Then** the DOM Tool leaves those fields untouched and reports only the fields it modified.

---

### User Story 2 - Surface fill outcomes to the orchestrator (Priority: P2)

The automation orchestrator wants immediate insight into which fields filled successfully and which failed so it can decide whether to retry, adjust values, or stop before form submission.

**Why this priority**: Clear feedback prevents silent failures, reduces false positives, and gives the orchestrator rapid recovery options.

**Independent Test**: Execute a fill_form action where one field is intentionally mismatched and verify the response flags the specific failure while still reporting successful fills.

**Acceptance Scenarios**:

1. **Given** at least one field in the payload cannot be matched or validated, **When** the action runs, **Then** the response lists the failed field, includes a human-readable reason, and marks the overall result as needing attention.
2. **Given** all fields are filled successfully, **When** the action completes, **Then** the response confirms success and exposes the list of populated fields for audit logging.

---

### User Story 3 - Blend structured and granular actions (Priority: P3)

The automation orchestrator wants to mix structured form fills with existing single-field interactions so bespoke edge cases or follow-up tweaks are still possible within the same workflow.

**Why this priority**: Maintaining compatibility with current one-field actions protects existing scripts and lets the orchestrator handle atypical inputs without reauthoring flows.

**Independent Test**: Run a scenario that performs a fill_form action followed by an existing single-field edit and confirm both actions are honored without regression.

**Acceptance Scenarios**:

1. **Given** the orchestrator has already used the fill_form action, **When** it subsequently issues a legacy single-field action, **Then** the DOM Tool applies the new change without re-filling prior fields.
2. **Given** the orchestrator needs to adjust one of the previously filled values, **When** it sends a targeted follow-up action, **Then** the DOM Tool updates only the specified field and indicates the override in its response.

### Edge Cases

- Payload includes a field that does not exist or is hidden; the system reports the mismatch while filling other valid fields.
- Form inputs require specific DOM events (change, blur) to trigger downstream logic; the action fires equivalent events after value entry.
- Page state changes between peek and action (e.g., form rerender); the action detects the change and returns an actionable warning instead of blindly writing.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The DOM Tool MUST expose a `fill_form` action that accepts a structured payload describing the target form and its fields.
- **FR-002**: The action MUST match each requested field using provided identifiers (such as selector, name, or label) and skip fields that cannot be confidently resolved.
- **FR-003**: The action MUST write all resolved values in a single operation and emit the same change events a human user would trigger.
- **FR-004**: The action MUST return a result object that lists every field attempted, indicates success or failure, and includes contextual error messages when needed.
- **FR-005**: The action MUST keep the existing one-peek-one-action contract by performing all writes within the authorized action window and avoiding extra peeks.
- **FR-006**: When one or more fields cannot be filled safely (missing, read-only, validation rejection), the action MUST surface those issues without blocking successful fields and MUST mark the overall action as attention-required.
- **FR-007**: The structured form-fill capability MUST replace the standalone form automation flow so that the DOM Tool is the single entry point for automated form completion.

### Key Entities *(include if feature involves data)*

- **Form Fill Payload**: A structured request containing optional form metadata (e.g., form selector), an ordered list of fields with identifiers and desired values, and preferences like whether to submit after filling.
- **Field Outcome**: A response item for each attempted field noting the identifier, final status (filled, skipped, failed), and any explanatory message.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Internal testing shows that 95% of representative five-field forms are completed through a single `fill_form` action without manual follow-up.
- **SC-002**: Average automation time for multi-field form completion decreases by at least 40% compared with the existing sequential field-entry baseline.
- **SC-003**: At least 90% of detected errors during form fill attempts include actionable messages that enable the orchestrator to recover without manual inspection.
- **SC-004**: Regression runs confirm 100% of previously supported single-field DOM actions behave identically after the new flow is enabled.

## Assumptions

- The automation orchestrator remains the LLM agent coordinating DOM Tool interactions.
- Form submission continues to be a deliberate follow-up action rather than part of the new fill_form action.
- Target forms expose stable identifiers (names, labels, or well-formed selectors) so existing detection heuristics can resolve fields.
