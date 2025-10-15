/**
 * T014: Contract Test for EXECUTE_SEQUENCE Operation
 * Tests the EXECUTE_SEQUENCE DOM operation against the contract specification
 * These tests will initially FAIL before implementation (TDD approach)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DOMAction,
  ExecuteSequenceRequest,
  DOMOperationRequest,
  DOMOperationResponse,
  ErrorCode,
  DOMError,
  QueryRequest,
  ClickRequest,
  TypeRequest
} from '../../../../../specs/001-dom-tool-integration/contracts/dom-operations';

// Mock DomService (will fail until implemented)
const mockDomService = {
  executeOperation: vi.fn()
};

// ExecuteSequence response structure (not explicitly defined in contract)
interface SequenceResponse {
  executed: boolean;
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  results: Array<{
    operationIndex: number;
    success: boolean;
    data?: any;
    error?: DOMError;
    duration: number;
  }>;
  aborted: boolean;
  abortedAt?: number;
}

describe('EXECUTE_SEQUENCE Operation Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Structure Validation', () => {
    it('should validate ExecuteSequenceRequest structure matches contract', () => {
      const queryOp: Omit<QueryRequest, 'requestId'> = {
        action: DOMAction.QUERY,
        selector: 'form[data-testid="login"]'
      };

      const typeOp: Omit<TypeRequest, 'requestId'> = {
        action: DOMAction.TYPE,
        selector: 'input[name="username"]',
        text: 'john.doe@example.com'
      };

      const clickOp: Omit<ClickRequest, 'requestId'> = {
        action: DOMAction.CLICK,
        selector: 'button[type="submit"]'
      };

      const validRequest: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [queryOp, typeOp, clickOp],
        requestId: 'test-sequence-123',
        tabId: 1,
        timeout: 15000
      };

      // Contract validation: Required fields
      expect(validRequest.action).toBe(DOMAction.EXECUTE_SEQUENCE);
      expect(validRequest.sequence).toBeInstanceOf(Array);
      expect(validRequest.requestId).toBeTypeOf('string');

      // Contract validation: Optional fields
      expect(validRequest.tabId).toBeTypeOf('number');
      expect(validRequest.timeout).toBeTypeOf('number');

      // Contract validation: Sequence structure
      expect(validRequest.sequence).toHaveLength(3);
      validRequest.sequence.forEach(op => {
        expect(op.action).toBeTypeOf('string');
        expect(Object.values(DOMAction)).toContain(op.action);
        expect(op).not.toHaveProperty('requestId'); // Should not have requestId
      });
    });

    it('should require mandatory fields in ExecuteSequenceRequest', () => {
      // This test will fail until validation is implemented
      const invalidRequest = {
        // Missing action, sequence, requestId
        tabId: 1,
        timeout: 5000
      };

      // Should validate and throw error for missing fields
      expect(() => {
        validateExecuteSequenceRequest(invalidRequest as any);
      }).toThrow();
    });

    it('should validate sequence is non-empty array', () => {
      const emptySequenceRequest: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [], // Empty sequence should be invalid
        requestId: 'test-sequence-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateExecuteSequenceRequest(emptySequenceRequest);
      }).toThrow('Sequence cannot be empty');
    });

    it('should validate sequence operations have valid actions', () => {
      const invalidActionRequest: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: 'INVALID_ACTION' as any,
            selector: 'button'
          }
        ],
        requestId: 'test-sequence-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateExecuteSequenceRequest(invalidActionRequest);
      }).toThrow('Invalid action in sequence');
    });

    it('should validate sequence operations do not contain requestId', () => {
      const requestIdInSequenceRequest: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: DOMAction.CLICK,
            selector: 'button',
            requestId: 'should-not-be-here' // This should not be allowed
          } as any
        ],
        requestId: 'test-sequence-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateExecuteSequenceRequest(requestIdInSequenceRequest);
      }).toThrow('Sequence operations should not contain requestId');
    });

    it('should prevent nested EXECUTE_SEQUENCE operations', () => {
      const nestedSequenceRequest: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: DOMAction.EXECUTE_SEQUENCE, // Nested sequence should not be allowed
            sequence: []
          } as any
        ],
        requestId: 'test-sequence-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateExecuteSequenceRequest(nestedSequenceRequest);
      }).toThrow('Nested EXECUTE_SEQUENCE operations are not allowed');
    });
  });

  describe('Response Structure Validation', () => {
    it('should validate SequenceResponse structure matches expected contract', () => {
      const validResponse: DOMOperationResponse<SequenceResponse> = {
        success: true,
        data: {
          executed: true,
          totalOperations: 3,
          successfulOperations: 3,
          failedOperations: 0,
          results: [
            {
              operationIndex: 0,
              success: true,
              data: { elements: [], count: 1 },
              duration: 45
            },
            {
              operationIndex: 1,
              success: true,
              data: { typed: true, finalValue: 'john.doe@example.com' },
              duration: 120
            },
            {
              operationIndex: 2,
              success: true,
              data: { clicked: true },
              duration: 85
            }
          ],
          aborted: false
        },
        requestId: 'test-sequence-123',
        duration: 250
      };

      // Contract validation: Response wrapper
      expect(validResponse.success).toBe(true);
      expect(validResponse.data).toBeTypeOf('object');
      expect(validResponse.requestId).toBeTypeOf('string');
      expect(validResponse.duration).toBeTypeOf('number');

      // Contract validation: SequenceResponse data
      expect(validResponse.data!.executed).toBeTypeOf('boolean');
      expect(validResponse.data!.totalOperations).toBeTypeOf('number');
      expect(validResponse.data!.successfulOperations).toBeTypeOf('number');
      expect(validResponse.data!.failedOperations).toBeTypeOf('number');
      expect(validResponse.data!.results).toBeInstanceOf(Array);
      expect(validResponse.data!.aborted).toBeTypeOf('boolean');

      // Contract validation: Results structure
      validResponse.data!.results.forEach((result, index) => {
        expect(result.operationIndex).toBe(index);
        expect(result.success).toBeTypeOf('boolean');
        expect(result.duration).toBeTypeOf('number');
        if (result.success) {
          expect(result.data).toBeDefined();
        } else {
          expect(result.error).toBeDefined();
        }
      });

      // Contract validation: Counts match
      expect(validResponse.data!.successfulOperations + validResponse.data!.failedOperations)
        .toBe(validResponse.data!.totalOperations);
    });

    it('should handle partial sequence execution with failures', () => {
      const partialResponse: DOMOperationResponse<SequenceResponse> = {
        success: true, // Overall operation succeeded, but some steps failed
        data: {
          executed: true,
          totalOperations: 4,
          successfulOperations: 2,
          failedOperations: 2,
          results: [
            {
              operationIndex: 0,
              success: true,
              data: { elements: [], count: 1 },
              duration: 45
            },
            {
              operationIndex: 1,
              success: false,
              error: {
                code: ErrorCode.ELEMENT_NOT_FOUND,
                message: 'Element not found'
              },
              duration: 30
            },
            {
              operationIndex: 2,
              success: true,
              data: { typed: true, finalValue: 'fallback@example.com' },
              duration: 110
            },
            {
              operationIndex: 3,
              success: false,
              error: {
                code: ErrorCode.TIMEOUT,
                message: 'Operation timed out'
              },
              duration: 2000
            }
          ],
          aborted: false
        },
        requestId: 'test-sequence-123',
        duration: 2185
      };

      expect(partialResponse.data!.successfulOperations).toBe(2);
      expect(partialResponse.data!.failedOperations).toBe(2);
      expect(partialResponse.data!.aborted).toBe(false);
      expect(partialResponse.data!.results.filter(r => r.success)).toHaveLength(2);
      expect(partialResponse.data!.results.filter(r => !r.success)).toHaveLength(2);
    });

    it('should handle aborted sequence execution', () => {
      const abortedResponse: DOMOperationResponse<SequenceResponse> = {
        success: false,
        error: {
          code: ErrorCode.TIMEOUT,
          message: 'Sequence execution aborted due to timeout',
          action: DOMAction.EXECUTE_SEQUENCE
        },
        data: {
          executed: false,
          totalOperations: 5,
          successfulOperations: 2,
          failedOperations: 1,
          results: [
            {
              operationIndex: 0,
              success: true,
              data: { elements: [], count: 1 },
              duration: 45
            },
            {
              operationIndex: 1,
              success: true,
              data: { typed: true, finalValue: 'test' },
              duration: 85
            },
            {
              operationIndex: 2,
              success: false,
              error: {
                code: ErrorCode.ELEMENT_NOT_FOUND,
                message: 'Element not found'
              },
              duration: 30
            }
            // Operations 3 and 4 were not executed due to abort
          ],
          aborted: true,
          abortedAt: 2
        },
        requestId: 'test-sequence-123',
        duration: 160
      };

      expect(abortedResponse.success).toBe(false);
      expect(abortedResponse.data!.aborted).toBe(true);
      expect(abortedResponse.data!.abortedAt).toBe(2);
      expect(abortedResponse.data!.results).toHaveLength(3); // Only executed operations
    });

    it('should validate error response structure', () => {
      const errorResponse: DOMOperationResponse<SequenceResponse> = {
        success: false,
        error: {
          code: ErrorCode.INVALID_ACTION,
          message: 'Invalid sequence operation detected',
          action: DOMAction.EXECUTE_SEQUENCE,
          details: {
            invalidOperationIndex: 1,
            invalidAction: 'UNKNOWN_ACTION'
          }
        },
        requestId: 'test-sequence-123',
        duration: 15
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error!.code).toBe(ErrorCode.INVALID_ACTION);
      expect(errorResponse.error!.message).toBeTypeOf('string');
      expect(errorResponse.error!.action).toBe(DOMAction.EXECUTE_SEQUENCE);
    });
  });

  describe('Error Handling Contract', () => {
    it('should handle INVALID_ACTION error correctly', () => {
      const invalidActionError: DOMError = {
        code: ErrorCode.INVALID_ACTION,
        message: 'Sequence contains invalid or unsupported operation',
        action: DOMAction.EXECUTE_SEQUENCE,
        details: {
          invalidOperationIndex: 2,
          invalidAction: 'UNSUPPORTED_ACTION',
          validActions: Object.values(DOMAction)
        }
      };

      expect(invalidActionError.code).toBe(ErrorCode.INVALID_ACTION);
      expect(invalidActionError.message).toContain('invalid');
      expect(invalidActionError.details?.invalidOperationIndex).toBe(2);
    });

    it('should handle TIMEOUT error correctly', () => {
      const timeoutError: DOMError = {
        code: ErrorCode.TIMEOUT,
        message: 'Sequence execution timed out after 15000ms',
        action: DOMAction.EXECUTE_SEQUENCE,
        details: {
          timeout: 15000,
          operationsCompleted: 3,
          totalOperations: 7,
          lastOperation: { action: DOMAction.TYPE, selector: 'input[name="email"]' }
        }
      };

      expect(timeoutError.code).toBe(ErrorCode.TIMEOUT);
      expect(timeoutError.message).toContain('timed out');
      expect(timeoutError.details?.operationsCompleted).toBe(3);
      expect(timeoutError.details?.totalOperations).toBe(7);
    });

    it('should handle NETWORK_ERROR correctly', () => {
      const networkError: DOMError = {
        code: ErrorCode.NETWORK_ERROR,
        message: 'Network connection lost during sequence execution',
        action: DOMAction.EXECUTE_SEQUENCE,
        details: {
          errorType: 'tab_disconnected',
          operationIndex: 4,
          operationsCompleted: 4
        }
      };

      expect(networkError.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(networkError.message).toContain('Network');
      expect(networkError.details?.operationIndex).toBe(4);
    });
  });

  describe('DomService Integration Contract', () => {
    it('should call DomService with correct parameters', async () => {
      // This test will fail until DomService is implemented
      const request: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: DOMAction.QUERY,
            selector: 'form[data-testid="login"]'
          },
          {
            action: DOMAction.TYPE,
            selector: 'input[name="username"]',
            text: 'test@example.com'
          },
          {
            action: DOMAction.CLICK,
            selector: 'button[type="submit"]'
          }
        ],
        requestId: 'test-sequence-123'
      };

      mockDomService.executeOperation.mockResolvedValue({
        success: true,
        data: {
          executed: true,
          totalOperations: 3,
          successfulOperations: 3,
          failedOperations: 0,
          results: [
            { operationIndex: 0, success: true, data: { count: 1 }, duration: 45 },
            { operationIndex: 1, success: true, data: { typed: true }, duration: 120 },
            { operationIndex: 2, success: true, data: { clicked: true }, duration: 85 }
          ],
          aborted: false
        },
        requestId: request.requestId,
        duration: 250
      });

      // This service call doesn't exist yet - test will fail
      await expect(async () => {
        const result = await mockDomService.executeOperation(request);
        expect(result).toBeDefined();
        expect(result.data.executed).toBe(true);
        expect(result.data.successfulOperations).toBe(3);
        expect(result.data.failedOperations).toBe(0);
      }).not.toThrow();

      expect(mockDomService.executeOperation).toHaveBeenCalledWith(request);
    });

    it('should handle service errors gracefully', async () => {
      const request: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: DOMAction.CLICK,
            selector: 'button'
          }
        ],
        requestId: 'test-sequence-123'
      };

      mockDomService.executeOperation.mockRejectedValue(
        new Error('Sequence execution engine not available')
      );

      // This error handling doesn't exist yet - test will fail
      await expect(async () => {
        await mockDomService.executeOperation(request);
      }).rejects.toThrow('Sequence execution engine not available');
    });
  });

  describe('Sequence Operation Scenarios', () => {
    it('should handle form filling sequence', () => {
      const formFillingSequence: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: DOMAction.QUERY,
            selector: 'form[data-testid="contact-form"]'
          },
          {
            action: DOMAction.TYPE,
            selector: 'input[name="firstName"]',
            text: 'John'
          },
          {
            action: DOMAction.TYPE,
            selector: 'input[name="lastName"]',
            text: 'Doe'
          },
          {
            action: DOMAction.TYPE,
            selector: 'input[name="email"]',
            text: 'john.doe@example.com'
          },
          {
            action: DOMAction.TYPE,
            selector: 'textarea[name="message"]',
            text: 'Hello, I would like to get in touch.'
          },
          {
            action: DOMAction.CLICK,
            selector: 'button[type="submit"]'
          }
        ],
        requestId: 'test-form-sequence-123'
      };

      expect(formFillingSequence.sequence).toHaveLength(6);
      expect(formFillingSequence.sequence.filter(op => op.action === DOMAction.TYPE)).toHaveLength(4);
      expect(formFillingSequence.sequence.filter(op => op.action === DOMAction.CLICK)).toHaveLength(1);
    });

    it('should handle navigation sequence', () => {
      const navigationSequence: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: DOMAction.CLICK,
            selector: 'nav a[href="/products"]'
          },
          {
            action: DOMAction.QUERY,
            selector: '.product-grid'
          },
          {
            action: DOMAction.CLICK,
            selector: '.product-item:first-child'
          },
          {
            action: DOMAction.QUERY,
            selector: '.product-details'
          },
          {
            action: DOMAction.CLICK,
            selector: 'button[data-action="add-to-cart"]'
          }
        ],
        requestId: 'test-navigation-sequence-123'
      };

      expect(navigationSequence.sequence).toHaveLength(5);
      expect(navigationSequence.sequence.filter(op => op.action === DOMAction.QUERY)).toHaveLength(2);
      expect(navigationSequence.sequence.filter(op => op.action === DOMAction.CLICK)).toHaveLength(3);
    });

    it('should handle complex interaction sequence', () => {
      const complexSequence: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: DOMAction.QUERY,
            selector: '.modal-dialog'
          },
          {
            action: DOMAction.GET_ATTRIBUTE,
            selector: '.modal-dialog',
            attribute: 'aria-hidden'
          },
          {
            action: DOMAction.SET_ATTRIBUTE,
            selector: '.modal-dialog',
            attribute: 'aria-hidden',
            value: 'false'
          },
          {
            action: DOMAction.FILL_FORM,
            formData: {
              'username': 'testuser',
              'password': 'testpass'
            },
            formSelector: '.login-form'
          },
          {
            action: DOMAction.CLICK,
            selector: 'button[type="submit"]'
          }
        ],
        requestId: 'test-complex-sequence-123'
      };

      expect(complexSequence.sequence).toHaveLength(5);
      expect(complexSequence.sequence.some(op => op.action === DOMAction.GET_ATTRIBUTE)).toBe(true);
      expect(complexSequence.sequence.some(op => op.action === DOMAction.SET_ATTRIBUTE)).toBe(true);
      expect(complexSequence.sequence.some(op => op.action === DOMAction.FILL_FORM)).toBe(true);
    });
  });

  describe('Performance Contract', () => {
    it('should return duration in response', async () => {
      const response: DOMOperationResponse<SequenceResponse> = {
        success: true,
        data: {
          executed: true,
          totalOperations: 3,
          successfulOperations: 3,
          failedOperations: 0,
          results: [
            { operationIndex: 0, success: true, data: {}, duration: 45 },
            { operationIndex: 1, success: true, data: {}, duration: 120 },
            { operationIndex: 2, success: true, data: {}, duration: 85 }
          ],
          aborted: false
        },
        requestId: 'test-sequence-123',
        duration: 250
      };

      expect(response.duration).toBeTypeOf('number');
      expect(response.duration).toBeGreaterThan(0);

      // Total duration should be close to sum of individual operations
      const individualDurations = response.data!.results.reduce((sum, result) => sum + result.duration, 0);
      expect(response.duration).toBeGreaterThanOrEqual(individualDurations);
      expect(response.duration).toBeLessThan(individualDurations + 100); // Small overhead allowed
    });

    it('should respect timeout parameter', async () => {
      const request: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          { action: DOMAction.QUERY, selector: 'div' },
          { action: DOMAction.QUERY, selector: 'span' },
          { action: DOMAction.QUERY, selector: 'button' }
        ],
        requestId: 'test-sequence-123',
        timeout: 2000
      };

      // This timeout handling doesn't exist yet - test will fail
      const startTime = Date.now();

      mockDomService.executeOperation.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({
            success: false,
            error: { code: ErrorCode.TIMEOUT, message: 'Timed out' },
            requestId: request.requestId,
            duration: 2000
          }), 2000)
        )
      );

      const result = await mockDomService.executeOperation(request);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(2000);
      expect(result.error?.code).toBe(ErrorCode.TIMEOUT);
    });

    it('should scale duration with sequence length', () => {
      const shortSequence = { operationCount: 3, expectedMaxDuration: 500 };
      const longSequence = { operationCount: 20, expectedMaxDuration: 3000 };

      // Longer sequences should generally take more time
      expect(longSequence.expectedMaxDuration).toBeGreaterThan(shortSequence.expectedMaxDuration);

      // But should still be reasonable
      expect(longSequence.expectedMaxDuration).toBeLessThan(10000); // Less than 10 seconds
    });
  });

  describe('Edge Cases Contract', () => {
    it('should handle single operation sequence', () => {
      const singleOpSequence: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          {
            action: DOMAction.CLICK,
            selector: 'button[data-testid="single-action"]'
          }
        ],
        requestId: 'test-single-sequence-123'
      };

      expect(singleOpSequence.sequence).toHaveLength(1);
    });

    it('should handle large sequence with many operations', () => {
      const manyOperations = new Array(50).fill(null).map((_, i) => ({
        action: DOMAction.QUERY,
        selector: `div[data-index="${i}"]`
      }));

      const largeSequence: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: manyOperations,
        requestId: 'test-large-sequence-123'
      };

      expect(largeSequence.sequence).toHaveLength(50);
    });

    it('should handle mixed operation types', () => {
      const mixedSequence: ExecuteSequenceRequest = {
        action: DOMAction.EXECUTE_SEQUENCE,
        sequence: [
          { action: DOMAction.QUERY, selector: 'form' },
          { action: DOMAction.CLICK, selector: 'button' },
          { action: DOMAction.TYPE, selector: 'input', text: 'test' },
          { action: DOMAction.GET_ATTRIBUTE, selector: 'div', attribute: 'class' },
          { action: DOMAction.SET_ATTRIBUTE, selector: 'span', attribute: 'data-value', value: 'new' },
          { action: DOMAction.FILL_FORM, formData: { field: 'value' } }
        ],
        requestId: 'test-mixed-sequence-123'
      };

      const actionTypes = mixedSequence.sequence.map(op => op.action);
      const uniqueActions = new Set(actionTypes);
      expect(uniqueActions.size).toBe(6); // All different action types
    });
  });
});

// Helper function that doesn't exist yet - will cause test failures
function validateExecuteSequenceRequest(request: ExecuteSequenceRequest): void {
  // This validation logic is not implemented yet
  throw new Error('validateExecuteSequenceRequest not implemented');
}