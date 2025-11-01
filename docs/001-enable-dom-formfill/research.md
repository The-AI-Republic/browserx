# Research Findings: DOM Tool Form Fill Action

## Decision: Accept `fields` array referencing DOM snapshot node IDs with selector/name fallbacks
- **Rationale**: The DOM Tool already exposes stable `node_id` values via snapshots, ensuring the orchestrator can directly target elements without brittle CSS selectors. Supporting optional `selector` or `name` values (borrowed from the v1 FormAutomationTool) preserves compatibility with existing scripts and provides a fallback when node IDs are not cached.
- **Alternatives considered**: (a) Require CSS selectors only — rejected because snapshots already provide node IDs and selectors alone are fragile across rerenders; (b) Require form-level auto-detection inside the tool — rejected because it reintroduces heavy DOM scanning and contradicts the single-action constraint.

## Decision: Fill inputs through a single CDP Runtime evaluation that sets values and dispatches input/change events
- **Rationale**: Executing a consolidated script with `Runtime.evaluate` allows batched updates within the one-action window, mirrors the event triggering behavior from `FormAutomationTool.fillFieldsInPage`, and avoids repeated `Input.insertText` calls that lack `change` events. It also minimizes round-trips to CDP, reducing overall form completion time.
- **Alternatives considered**: (a) Loop over `DomService.type` per field — rejected because it would clear the field via key events and omit change/blur triggers, undercutting validation flows; (b) Inject a new content script — rejected since CDP access already exists and adding content scripts reintroduces CSP limitations.

## Decision: Return structured per-field outcomes plus aggregate status in the action response
- **Rationale**: Spec requirements call for explicit success/failure feedback per field; mirroring the `FieldOutcome` concept ensures the orchestrator can retry problematic fields while trusting successful ones. Including summary flags keeps the DOM Tool response consistent with existing `ActionResult` metadata expectations.
- **Alternatives considered**: (a) Binary success flag only — rejected because it hides partial failures and violates User Story 2; (b) Throw on first failure — rejected because successful fields would be lost, reducing efficiency.

## Decision: Decommission `FormAutomationTool` after migration and route all structured form fill through DOM Tool
- **Rationale**: Maintaining two form-fill entry points risks diverging behaviors and duplicates maintenance. Folding v1 heuristics into the DOM Tool satisfies FR-007 and keeps the tool registry streamlined.
- **Alternatives considered**: (a) Keep FormAutomationTool as a thin wrapper around the new action — rejected because it adds routing complexity without user-visible value; (b) Deprecate silently without removal — rejected because stale code invites drift and confusion.
