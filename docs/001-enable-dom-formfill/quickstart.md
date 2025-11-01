# Quickstart: DOM Tool Form Fill Action

## Prerequisites
- Branch `001-enable-dom-formfill` checked out.
- Review the feature spec (`specs/001-enable-dom-formfill/spec.md`) and research summary (`research.md`).
- Familiarity with existing DOM Tool snapshot workflow (`src/tools/DOMTool.ts`) and v1 form automation logic (`src/tools/FormAutomationTool.ts`).

## Implementation Steps
1. **Introduce the `fill_form` action**  
   - Extend the DOM Tool request union with a new `fill_form` variant that accepts the payload described in `data-model.md`.  
   - Update validation so `fields` arrays require at least one locator (`node_id`, `selector`, or `name`).

2. **Execute fills via CDP runtime evaluation**  
   - Add a helper in `DomService` that resolves node IDs to backend IDs, applies values in a single injected script, and dispatches `input` + configured trigger events.  
   - Capture per-field success/failure and aggregate into the response format outlined in the contract.

3. **Replace and remove `FormAutomationTool`**  
   - Migrate reusable heuristics (field typing, selector generation, trigger defaults) into shared utilities under `src/tools/dom`.  
   - Delete `FormAutomationTool.ts` and unregister it from any registries or tests once parity is confirmed.

4. **Adjust tool registry and orchestrator integrations**  
   - Ensure the agent now references the DOM Tool’s `fill_form` action instead of the deprecated tool.  
   - Update documentation and analytics hooks so a single action name is recorded for form automation.

## Testing & Validation
- Add or update Vitest suites under `tests/integration/content/` to cover: successful multi-field fill, partial failures, and compatibility with follow-up single-field actions.
- Regression-test existing DOM Tool actions (`snapshot`, `click`, `type`, `keypress`) to confirm no behavioral changes.
- Manually verify on a sample multi-field form that the payload completes in one action and error messaging surfaces as expected.

### Verification Notes
- ⚠️ Attempted `npm test -- tests/integration/dom-operations/form_automation.test.ts`; blocked because `vitest` binary was unavailable (esbuild install denied in sandbox). Run locally after installing dependencies.
- ✅ Fixture `tests/fixtures/test-pages/multi-field-form.html` renders expected controls for manual validation.
- ✅ DOM tool snapshot rebuild now executes automatically after `fill_form`, keeping node IDs valid for subsequent actions.

## Rollout Considerations
- Communicate the removal of `FormAutomationTool` to any consumers relying on the old API before merging.
- Monitor post-deployment telemetry for increased `attention_required` responses that may signal unforeseen field-matching gaps.
