# Data Model: DOM Tool Form Fill Action

## Overview

The DOM Tool receives structured requests from the automation orchestrator to populate multiple form fields within a single action. The payload must precisely identify target inputs, while the response returns granular outcomes per field alongside aggregate status so the orchestrator can decide on retries or follow-up actions.

## Entities

### FormFillRequest
- **Purpose**: Describes a single batched fill operation against the active DOM snapshot.
- **Fields**:
  | Name | Type | Required | Constraints | Notes |
  |------|------|----------|-------------|-------|
  | `action` | string | yes | Fixed value `fill_form` | Differentiates from existing DOM Tool actions |
  | `tab_id` | integer | no | Must reference an attached tab when provided | Defaults to active tab |
  | `form_selector` | string | no | Valid CSS selector scoped to document | Used to scope lookups when node IDs absent |
  | `fields` | array<FieldInstruction> | yes | Minimum length 1 | Each entry describes one target input |
  | `submit` | object | no | If present, may specify `mode: none\|click\|commit` | Submit remains optional per assumptions |
  | `metadata` | object | no | Free-form key/value pairs | Allows orchestrator trace data |

### FieldInstruction
- **Purpose**: Identifies a single field and the value/event behavior to apply.
- **Fields**:
  | Name | Type | Required | Constraints | Notes |
  |------|------|----------|-------------|-------|
  | `node_id` | integer | no | Must correspond to a node present in latest snapshot | Preferred targeting mechanism |
  | `selector` | string | no | Valid CSS selector | Used when `node_id` missing; scoped by `form_selector` when supplied |
  | `name` | string | no | Matches `name` attribute in DOM | Fallback identifier mirroring v1 tool |
  | `label` | string | no | Human-readable label | Used only for logging/error messaging |
  | `type` | string | no | Allowed values: text, email, password, tel, number, date, checkbox, radio, select, textarea | Defaults inferred from DOM node when omitted |
  | `value` | any | yes | Must be serializable to JSON | Represents intended field value |
  | `trigger` | string | no | Allowed values: input, change, blur | Defaults to `change` |
  | `commit` | string | no | Allowed values: none, enter | Signals whether to append Enter keystroke |

### FormFillResult
- **Purpose**: Summarizes the outcome of the fill operation.
- **Fields**:
  | Name | Type | Required | Constraints | Notes |
  |------|------|----------|-------------|-------|
  | `success` | boolean | yes | — | Indicates whether all fields completed without attention |
  | `status` | string | yes | Enum: `ok`, `attention_required`, `failed` | Provides quick triage signal |
  | `filled_fields` | array<string> | yes | — | Ordered list of field identifiers successfully updated |
  | `failed_fields` | array<FieldOutcome> | yes | — | Contains detailed error records |
  | `duration_ms` | integer | yes | Non-negative | Total execution time |
  | `warnings` | array<string> | no | — | Surfaced when partial concerns detected |

### FieldOutcome
- **Purpose**: Captures the per-field status that powers orchestration decisions.
- **Fields**:
  | Name | Type | Required | Constraints | Notes |
  |------|------|----------|-------------|-------|
  | `target` | string | yes | Resolved identifier (node_id or selector) | Enables mapping back to snapshot |
  | `status` | string | yes | Enum: `filled`, `skipped`, `failed` | Aligns with spec’s success/failure expectations |
  | `message` | string | no | — | Human-readable reason, required when status ≠ `filled` |
  | `applied_value` | any | no | Mirrors value actually written | Helps confirm conversions/coercions |

## Relationships

- A `FormFillRequest` aggregates one or more `FieldInstruction` entries.
- Each `FieldInstruction` produces exactly one `FieldOutcome` in the `FormFillResult`.
- `FormFillResult.status` is derived from the collection of `FieldOutcome.status` values.

## State & Transitions

1. **Received** → request accepted from orchestrator.
2. **Validated** → identifiers resolved (node IDs, selectors) and triggers/commit values checked.
3. **Executed** → DOM mutations applied atomically within the action window.
4. **Aggregated** → per-field outcomes compiled, status derived, execution time measured.
5. **Responded** → result returned to orchestrator; if errors occurred, status transitions to `attention_required` or `failed`.

Failures during validation short-circuit to `failed` with an empty `filled_fields` list. Execution-time failures record partial results and downgrade to `attention_required`.

## Validation Rules

- Requests must include at least one `FieldInstruction` with a non-null `value`.
- Each `FieldInstruction` must provide at least one locator (`node_id`, `selector`, or `name`); omission triggers validation failure.
- Checkbox and radio instructions may coerce `value` to boolean/string but must reflect the applied state in `FieldOutcome.applied_value`.
- File inputs are disallowed; attempting to fill them yields a `failed` outcome with a descriptive message.
- Trigger values default to `change` but must be respected when explicitly set to `input` or `blur`.
