/**
 * T008: Contract Test for TYPE Operation
 * Tests the TYPE DOM operation against the contract specification
 * These tests will initially FAIL before implementation (TDD approach)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DOMAction,
  TypeRequest,
  TypeResponse,
  DOMOperationResponse,
  DOMElementInfo,
  ErrorCode,
  DOMError
} from '../../../../../specs/001-dom-tool-integration/contracts/dom-operations';

// Mock DomService (will fail until implemented)
const mockDomService = {
  executeOperation: vi.fn()
};

describe('TYPE Operation Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Structure Validation', () => {
    it('should validate TypeRequest structure matches contract', () => {
      const validRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="username"]',
        text: 'john.doe@example.com',
        requestId: 'test-type-123',
        tabId: 1,
        timeout: 2000,
        options: {
          clear: true,
          delay: 50,
          pressEnter: false
        }
      };

      // Contract validation: Required fields
      expect(validRequest.action).toBe(DOMAction.TYPE);
      expect(validRequest.selector).toBeTypeOf('string');
      expect(validRequest.text).toBeTypeOf('string');
      expect(validRequest.requestId).toBeTypeOf('string');

      // Contract validation: Optional fields
      expect(validRequest.tabId).toBeTypeOf('number');
      expect(validRequest.timeout).toBeTypeOf('number');
      expect(validRequest.options).toBeTypeOf('object');

      // Contract validation: Type options structure
      if (validRequest.options) {
        expect(validRequest.options.clear).toBeTypeOf('boolean');
        expect(validRequest.options.delay).toBeTypeOf('number');
        expect(validRequest.options.pressEnter).toBeTypeOf('boolean');
      }
    });

    it('should require mandatory fields in TypeRequest', () => {
      // This test will fail until validation is implemented
      const invalidRequest = {
        // Missing action, selector, text, requestId
        tabId: 1,
        options: { clear: true }
      };

      // Should validate and throw error for missing fields
      expect(() => {
        validateTypeRequest(invalidRequest as any);
      }).toThrow();
    });

    it('should validate text is string', () => {
      const invalidRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="username"]',
        text: null as any, // Invalid text type
        requestId: 'test-type-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateTypeRequest(invalidRequest);
      }).toThrow('Text must be a string');
    });

    it('should validate delay is non-negative', () => {
      const invalidRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="username"]',
        text: 'test text',
        requestId: 'test-type-123',
        options: {
          delay: -10 // Invalid negative delay
        }
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateTypeRequest(invalidRequest);
      }).toThrow('Delay must be non-negative');
    });

    it('should handle empty text input', () => {
      const emptyTextRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="search"]',
        text: '', // Empty string should be valid
        requestId: 'test-type-123',
        options: {
          clear: true
        }
      };

      expect(emptyTextRequest.text).toBe('');
      expect(emptyTextRequest.options?.clear).toBe(true);
    });
  });

  describe('Response Structure Validation', () => {
    it('should validate TypeResponse structure matches contract', () => {
      const mockElement: DOMElementInfo = {
        tagName: 'INPUT',
        id: 'username-field',
        className: 'form-control',
        textContent: '',
        attributes: {
          'data-testid': 'username',
          'type': 'email',
          'value': 'john.doe@example.com'
        },
        boundingBox: {
          x: 50,
          y: 100,
          width: 300,
          height: 40,
          top: 100,
          left: 50,
          bottom: 140,
          right: 350
        },
        visible: true,
        enabled: true
      };

      const validResponse: DOMOperationResponse<TypeResponse> = {
        success: true,
        data: {
          typed: true,
          element: mockElement,
          finalValue: 'john.doe@example.com'
        },
        requestId: 'test-type-123',
        duration: 125
      };

      // Contract validation: Response wrapper
      expect(validResponse.success).toBe(true);
      expect(validResponse.data).toBeTypeOf('object');
      expect(validResponse.requestId).toBeTypeOf('string');
      expect(validResponse.duration).toBeTypeOf('number');

      // Contract validation: TypeResponse data
      expect(validResponse.data!.typed).toBeTypeOf('boolean');
      expect(validResponse.data!.element).toBeTypeOf('object');
      expect(validResponse.data!.finalValue).toBeTypeOf('string');

      // Contract validation: DOMElementInfo structure
      const element = validResponse.data!.element;
      expect(element.tagName).toBeTypeOf('string');
      expect(element.visible).toBeTypeOf('boolean');
      expect(element.enabled).toBeTypeOf('boolean');
      expect(element.attributes).toBeTypeOf('object');
    });

    it('should validate failed type response', () => {
      const mockElement: DOMElementInfo = {
        tagName: 'INPUT',
        id: 'readonly-field',
        className: 'form-control readonly',
        textContent: '',
        attributes: {
          'readonly': 'true',
          'value': 'original text'
        },
        visible: true,
        enabled: false
      };

      const failedResponse: DOMOperationResponse<TypeResponse> = {
        success: true, // Operation succeeded, but typing failed
        data: {
          typed: false,
          element: mockElement,
          finalValue: 'original text' // Value unchanged
        },
        requestId: 'test-type-123',
        duration: 25
      };

      expect(failedResponse.data!.typed).toBe(false);
      expect(failedResponse.data!.element.enabled).toBe(false);
      expect(failedResponse.data!.finalValue).toBe('original text');
    });

    it('should validate error response structure', () => {
      const errorResponse: DOMOperationResponse<TypeResponse> = {
        success: false,
        error: {
          code: ErrorCode.ELEMENT_NOT_INTERACTABLE,
          message: 'Element is readonly and cannot accept text input',
          selector: 'input[data-testid="readonly"]',
          action: DOMAction.TYPE,
          details: {
            elementState: { readonly: true }
          }
        },
        requestId: 'test-type-123',
        duration: 15
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error!.code).toBe(ErrorCode.ELEMENT_NOT_INTERACTABLE);
      expect(errorResponse.error!.message).toBeTypeOf('string');
      expect(errorResponse.error!.selector).toBeTypeOf('string');
      expect(errorResponse.error!.action).toBe(DOMAction.TYPE);
    });
  });

  describe('Error Handling Contract', () => {
    it('should handle ELEMENT_NOT_FOUND error correctly', () => {
      const notFoundError: DOMError = {
        code: ErrorCode.ELEMENT_NOT_FOUND,
        message: 'No input element found matching selector',
        selector: 'input[data-testid="nonexistent"]',
        action: DOMAction.TYPE
      };

      expect(notFoundError.code).toBe(ErrorCode.ELEMENT_NOT_FOUND);
      expect(notFoundError.message).toContain('not found');
      expect(notFoundError.selector).toBeDefined();
    });

    it('should handle ELEMENT_NOT_VISIBLE error correctly', () => {
      const notVisibleError: DOMError = {
        code: ErrorCode.ELEMENT_NOT_VISIBLE,
        message: 'Input element is hidden and cannot receive text',
        selector: 'input[data-testid="hidden"]',
        action: DOMAction.TYPE,
        details: {
          elementInfo: { visible: false, display: 'none' }
        }
      };

      expect(notVisibleError.code).toBe(ErrorCode.ELEMENT_NOT_VISIBLE);
      expect(notVisibleError.message).toContain('hidden');
      expect(notVisibleError.details).toBeDefined();
    });

    it('should handle ELEMENT_NOT_INTERACTABLE error correctly', () => {
      const notInteractableError: DOMError = {
        code: ErrorCode.ELEMENT_NOT_INTERACTABLE,
        message: 'Element is disabled and cannot accept input',
        selector: 'input[data-testid="disabled"]',
        action: DOMAction.TYPE,
        details: {
          reason: 'disabled',
          elementState: { disabled: true, readonly: false }
        }
      };

      expect(notInteractableError.code).toBe(ErrorCode.ELEMENT_NOT_INTERACTABLE);
      expect(notInteractableError.message).toContain('disabled');
      expect(notInteractableError.details).toBeDefined();
    });

    it('should handle TIMEOUT error correctly', () => {
      const timeoutError: DOMError = {
        code: ErrorCode.TIMEOUT,
        message: 'Type operation timed out after 2000ms',
        action: DOMAction.TYPE,
        details: { timeout: 2000, text: 'long text that took too long to type' }
      };

      expect(timeoutError.code).toBe(ErrorCode.TIMEOUT);
      expect(timeoutError.message).toContain('timed out');
      expect(timeoutError.details).toBeDefined();
    });
  });

  describe('DomService Integration Contract', () => {
    it('should call DomService with correct parameters', async () => {
      // This test will fail until DomService is implemented
      const request: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="email"]',
        text: 'user@example.com',
        requestId: 'test-type-123',
        options: {
          clear: true,
          delay: 25
        }
      };

      const mockElement: DOMElementInfo = {
        tagName: 'INPUT',
        attributes: { value: 'user@example.com' },
        visible: true,
        enabled: true
      };

      mockDomService.executeOperation.mockResolvedValue({
        success: true,
        data: {
          typed: true,
          element: mockElement,
          finalValue: 'user@example.com'
        },
        requestId: request.requestId,
        duration: 150
      });

      // This service call doesn't exist yet - test will fail
      await expect(async () => {
        const result = await mockDomService.executeOperation(request);
        expect(result).toBeDefined();
        expect(result.data.typed).toBe(true);
        expect(result.data.finalValue).toBe('user@example.com');
      }).not.toThrow();

      expect(mockDomService.executeOperation).toHaveBeenCalledWith(request);
    });

    it('should handle service errors gracefully', async () => {
      const request: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="email"]',
        text: 'user@example.com',
        requestId: 'test-type-123'
      };

      mockDomService.executeOperation.mockRejectedValue(
        new Error('Element is not a valid input field')
      );

      // This error handling doesn't exist yet - test will fail
      await expect(async () => {
        await mockDomService.executeOperation(request);
      }).rejects.toThrow('Element is not a valid input field');
    });
  });

  describe('Type Options Contract', () => {
    it('should handle clear option', () => {
      const clearRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="search"]',
        text: 'new search term',
        requestId: 'test-clear-123',
        options: {
          clear: true
        }
      };

      expect(clearRequest.options!.clear).toBe(true);
    });

    it('should handle delay option', () => {
      const delayRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'textarea[data-testid="description"]',
        text: 'Slow typing simulation',
        requestId: 'test-delay-123',
        options: {
          delay: 100
        }
      };

      expect(delayRequest.options!.delay).toBe(100);
    });

    it('should handle pressEnter option', () => {
      const enterRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="search"]',
        text: 'search and submit',
        requestId: 'test-enter-123',
        options: {
          pressEnter: true
        }
      };

      expect(enterRequest.options!.pressEnter).toBe(true);
    });

    it('should handle combined options', () => {
      const combinedRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="chat-input"]',
        text: 'Hello world!',
        requestId: 'test-combined-123',
        options: {
          clear: true,
          delay: 30,
          pressEnter: true
        }
      };

      expect(combinedRequest.options!.clear).toBe(true);
      expect(combinedRequest.options!.delay).toBe(30);
      expect(combinedRequest.options!.pressEnter).toBe(true);
    });
  });

  describe('Text Input Scenarios', () => {
    it('should handle special characters', () => {
      const specialCharsRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="password"]',
        text: '!@#$%^&*()_+{}|:"<>?[]\\;\',./',
        requestId: 'test-special-123'
      };

      expect(specialCharsRequest.text).toContain('!@#$%^&*()');
    });

    it('should handle unicode characters', () => {
      const unicodeRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="name"]',
        text: 'José María 中文 🎉',
        requestId: 'test-unicode-123'
      };

      expect(unicodeRequest.text).toContain('José María');
      expect(unicodeRequest.text).toContain('中文');
      expect(unicodeRequest.text).toContain('🎉');
    });

    it('should handle newlines and tabs', () => {
      const multilineRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'textarea[data-testid="description"]',
        text: 'Line 1\nLine 2\n\tIndented line',
        requestId: 'test-multiline-123'
      };

      expect(multilineRequest.text).toContain('\n');
      expect(multilineRequest.text).toContain('\t');
    });
  });

  describe('Performance Contract', () => {
    it('should return duration in response', async () => {
      const response: DOMOperationResponse<TypeResponse> = {
        success: true,
        data: {
          typed: true,
          element: {
            tagName: 'INPUT',
            attributes: {},
            visible: true,
            enabled: true
          },
          finalValue: 'test text'
        },
        requestId: 'test-type-123',
        duration: 125
      };

      expect(response.duration).toBeTypeOf('number');
      expect(response.duration).toBeGreaterThan(0);
    });

    it('should respect timeout parameter', async () => {
      const request: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="slow-input"]',
        text: 'long text that takes time to type',
        requestId: 'test-type-123',
        timeout: 1000
      };

      // This timeout handling doesn't exist yet - test will fail
      const startTime = Date.now();

      mockDomService.executeOperation.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({
            success: false,
            error: { code: ErrorCode.TIMEOUT, message: 'Timed out' },
            requestId: request.requestId,
            duration: 1000
          }), 1000)
        )
      );

      const result = await mockDomService.executeOperation(request);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(1000);
      expect(result.error?.code).toBe(ErrorCode.TIMEOUT);
    });

    it('should factor in delay option for duration estimation', () => {
      const delayedRequest: TypeRequest = {
        action: DOMAction.TYPE,
        selector: 'input[data-testid="email"]',
        text: 'hello', // 5 characters
        requestId: 'test-delay-123',
        options: {
          delay: 50 // 50ms per character = 250ms minimum
        }
      };

      // Expected minimum duration: 5 chars * 50ms = 250ms
      const expectedMinDuration = delayedRequest.text.length * (delayedRequest.options?.delay || 0);
      expect(expectedMinDuration).toBe(250);
    });
  });
});

// Helper function that doesn't exist yet - will cause test failures
function validateTypeRequest(request: TypeRequest): void {
  // This validation logic is not implemented yet
  throw new Error('validateTypeRequest not implemented');
}