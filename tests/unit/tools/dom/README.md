# DOM Operations Contract Tests

This directory contains comprehensive contract tests for DOM operations following Test-Driven Development (TDD) principles.

## Test Files Created

The following contract test files have been created and **will initially FAIL** as per TDD methodology:

1. **T006: query.contract.test.ts** - Tests for QUERY operation
2. **T007: click.contract.test.ts** - Tests for CLICK operation
3. **T008: type.contract.test.ts** - Tests for TYPE operation
4. **T009: get_attribute.contract.test.ts** - Tests for GET_ATTRIBUTE operation
5. **T010: set_attribute.contract.test.ts** - Tests for SET_ATTRIBUTE operation
6. **T011: fill_form.contract.test.ts** - Tests for FILL_FORM operation
7. **T012: capture_snapshot.contract.test.ts** - Tests for CAPTURE_SNAPSHOT operation
8. **T013: accessibility.contract.test.ts** - Tests for GET_ACCESSIBILITY_TREE operation
9. **T014: execute_sequence.contract.test.ts** - Tests for EXECUTE_SEQUENCE operation

## Test Coverage

Each contract test validates:

### Request Structure Validation
- Required fields (action, requestId, etc.)
- Optional fields (tabId, timeout, etc.)
- Operation-specific parameters
- Input validation and error handling

### Response Structure Validation
- Success response structure matching contract
- Data field structure and types
- Error response structure
- Duration tracking

### Error Handling Contract
- All defined error codes (ELEMENT_NOT_FOUND, TIMEOUT, etc.)
- Error message format and content
- Error details structure
- Appropriate error context

### DomService Integration Contract
- Service method calls with correct parameters
- Graceful error handling
- Proper async/await patterns

### Performance Contract
- Duration reporting
- Timeout respect
- Reasonable performance expectations

## Test Framework

- **Framework**: Vitest with jsdom environment
- **Mocking**: vi.fn() for DomService mocking
- **Assertions**: expect() with comprehensive validation
- **Configuration**: Custom vitest.dom.config.ts to avoid Svelte dependencies

## Running Tests

```bash
# Run all DOM contract tests
npx vitest run tests/unit/tools/dom/ --config vitest.dom.config.ts

# Run specific test file
npx vitest run tests/unit/tools/dom/query.contract.test.ts --config vitest.dom.config.ts

# Run with watch mode
npx vitest watch tests/unit/tools/dom/ --config vitest.dom.config.ts
```

## TDD Status

✅ **RED Phase**: All tests currently FAIL as expected

The tests are designed to fail initially with messages like:
- "validateQueryRequest not implemented"
- "validateClickRequest not implemented"
- Other missing implementation errors

This is the correct TDD RED phase. The next steps would be:

1. **GREEN Phase**: Implement minimal code to make tests pass
2. **REFACTOR Phase**: Improve code quality while keeping tests green

## Contract Validation

Tests import contract types from:
```typescript
import {
  DOMAction,
  QueryRequest,
  ClickRequest,
  // ... other types
} from '../../../../../specs/001-dom-tool-integration/contracts/dom-operations';
```

This ensures tests validate against the actual contract specifications.

## Implementation Notes

The tests assume:
- A `DomService` class with `executeOperation()` method
- Validation functions for each operation type
- Proper error handling and timeout mechanisms
- Contract-compliant request/response structures

All tests follow consistent patterns and comprehensive validation to ensure robust DOM operation implementations.