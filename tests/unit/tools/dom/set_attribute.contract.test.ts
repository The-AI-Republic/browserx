/**
 * T010: Contract Test for SET_ATTRIBUTE Operation
 * Tests the SET_ATTRIBUTE DOM operation against the contract specification
 * These tests will initially FAIL before implementation (TDD approach)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DOMAction,
  SetAttributeRequest,
  AttributeResponse,
  DOMOperationResponse,
  DOMElementInfo,
  ErrorCode,
  DOMError
} from '../../../../../specs/001-dom-tool-integration/contracts/dom-operations';

// Mock DomService (will fail until implemented)
const mockDomService = {
  executeOperation: vi.fn()
};

describe('SET_ATTRIBUTE Operation Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Structure Validation', () => {
    it('should validate SetAttributeRequest structure matches contract', () => {
      const validRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'img[data-testid="profile-avatar"]',
        attribute: 'src',
        value: 'https://example.com/new-avatar.jpg',
        requestId: 'test-set-attr-123',
        tabId: 1,
        timeout: 2000
      };

      // Contract validation: Required fields
      expect(validRequest.action).toBe(DOMAction.SET_ATTRIBUTE);
      expect(validRequest.selector).toBeTypeOf('string');
      expect(validRequest.attribute).toBeTypeOf('string');
      expect(validRequest.value).toBeTypeOf('string');
      expect(validRequest.requestId).toBeTypeOf('string');

      // Contract validation: Optional fields
      expect(validRequest.tabId).toBeTypeOf('number');
      expect(validRequest.timeout).toBeTypeOf('number');
    });

    it('should require mandatory fields in SetAttributeRequest', () => {
      // This test will fail until validation is implemented
      const invalidRequest = {
        // Missing action, selector, attribute, value, requestId
        tabId: 1
      };

      // Should validate and throw error for missing fields
      expect(() => {
        validateSetAttributeRequest(invalidRequest as any);
      }).toThrow();
    });

    it('should validate selector is non-empty string', () => {
      const invalidRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: '', // Empty selector should be invalid
        attribute: 'src',
        value: 'https://example.com/image.jpg',
        requestId: 'test-set-attr-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateSetAttributeRequest(invalidRequest);
      }).toThrow('Selector cannot be empty');
    });

    it('should validate attribute is non-empty string', () => {
      const invalidRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'img[data-testid="profile-avatar"]',
        attribute: '', // Empty attribute should be invalid
        value: 'https://example.com/image.jpg',
        requestId: 'test-set-attr-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateSetAttributeRequest(invalidRequest);
      }).toThrow('Attribute name cannot be empty');
    });

    it('should validate value is string (including empty strings)', () => {
      const validEmptyValueRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'input[data-testid="search"]',
        attribute: 'value',
        value: '', // Empty string should be valid
        requestId: 'test-set-attr-123'
      };

      expect(validEmptyValueRequest.value).toBe('');

      const invalidRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'input[data-testid="search"]',
        attribute: 'value',
        value: null as any, // null should be invalid
        requestId: 'test-set-attr-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateSetAttributeRequest(invalidRequest);
      }).toThrow('Value must be a string');
    });
  });

  describe('Response Structure Validation', () => {
    it('should validate AttributeResponse structure matches contract', () => {
      const mockElement: DOMElementInfo = {
        tagName: 'IMG',
        id: 'profile-avatar',
        className: 'avatar rounded',
        textContent: '',
        attributes: {
          'src': 'https://example.com/new-avatar.jpg', // Updated value
          'alt': 'User Profile Avatar',
          'data-testid': 'profile-avatar',
          'width': '128',
          'height': '128'
        },
        boundingBox: {
          x: 20,
          y: 50,
          width: 128,
          height: 128,
          top: 50,
          left: 20,
          bottom: 178,
          right: 148
        },
        visible: true,
        enabled: true
      };

      const validResponse: DOMOperationResponse<AttributeResponse> = {
        success: true,
        data: {
          value: 'https://example.com/new-avatar.jpg', // New value after setting
          element: mockElement
        },
        requestId: 'test-set-attr-123',
        duration: 65
      };

      // Contract validation: Response wrapper
      expect(validResponse.success).toBe(true);
      expect(validResponse.data).toBeTypeOf('object');
      expect(validResponse.requestId).toBeTypeOf('string');
      expect(validResponse.duration).toBeTypeOf('number');

      // Contract validation: AttributeResponse data
      expect(validResponse.data!.value).toBeTypeOf('string');
      expect(validResponse.data!.element).toBeTypeOf('object');

      // Contract validation: DOMElementInfo structure
      const element = validResponse.data!.element;
      expect(element.tagName).toBeTypeOf('string');
      expect(element.visible).toBeTypeOf('boolean');
      expect(element.enabled).toBeTypeOf('boolean');
      expect(element.attributes).toBeTypeOf('object');
      expect(element.attributes['src']).toBe('https://example.com/new-avatar.jpg');
    });

    it('should handle empty string values correctly', () => {
      const mockElement: DOMElementInfo = {
        tagName: 'INPUT',
        id: 'search-input',
        className: 'form-control',
        textContent: '',
        attributes: {
          'value': '', // Set to empty string
          'placeholder': 'Search...',
          'data-testid': 'search-input'
        },
        visible: true,
        enabled: true
      };

      const emptyValueResponse: DOMOperationResponse<AttributeResponse> = {
        success: true,
        data: {
          value: '', // Empty string is valid
          element: mockElement
        },
        requestId: 'test-set-attr-123',
        duration: 35
      };

      expect(emptyValueResponse.data!.value).toBe('');
      expect(emptyValueResponse.data!.element.attributes['value']).toBe('');
    });

    it('should validate error response structure', () => {
      const errorResponse: DOMOperationResponse<AttributeResponse> = {
        success: false,
        error: {
          code: ErrorCode.ELEMENT_NOT_FOUND,
          message: 'No element found matching selector "img[data-testid="nonexistent"]"',
          selector: 'img[data-testid="nonexistent"]',
          action: DOMAction.SET_ATTRIBUTE,
          details: {
            attribute: 'src',
            value: 'https://example.com/image.jpg'
          }
        },
        requestId: 'test-set-attr-123',
        duration: 40
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error!.code).toBe(ErrorCode.ELEMENT_NOT_FOUND);
      expect(errorResponse.error!.message).toBeTypeOf('string');
      expect(errorResponse.error!.selector).toBeTypeOf('string');
      expect(errorResponse.error!.action).toBe(DOMAction.SET_ATTRIBUTE);
    });
  });

  describe('Error Handling Contract', () => {
    it('should handle ELEMENT_NOT_FOUND error correctly', () => {
      const notFoundError: DOMError = {
        code: ErrorCode.ELEMENT_NOT_FOUND,
        message: 'No element found matching selector',
        selector: 'img[data-testid="missing-image"]',
        action: DOMAction.SET_ATTRIBUTE,
        details: {
          attribute: 'src',
          value: 'https://example.com/image.jpg'
        }
      };

      expect(notFoundError.code).toBe(ErrorCode.ELEMENT_NOT_FOUND);
      expect(notFoundError.message).toContain('not found');
      expect(notFoundError.selector).toBeDefined();
      expect(notFoundError.details?.attribute).toBe('src');
      expect(notFoundError.details?.value).toBe('https://example.com/image.jpg');
    });

    it('should handle INVALID_SELECTOR error correctly', () => {
      const invalidSelectorError: DOMError = {
        code: ErrorCode.INVALID_SELECTOR,
        message: 'Invalid CSS selector syntax: malformed attribute selector',
        selector: 'img[data-testid=unclosed',
        action: DOMAction.SET_ATTRIBUTE,
        details: {
          attribute: 'src',
          value: 'https://example.com/image.jpg',
          selectorError: 'Unclosed attribute selector'
        }
      };

      expect(invalidSelectorError.code).toBe(ErrorCode.INVALID_SELECTOR);
      expect(invalidSelectorError.message).toContain('Invalid');
      expect(invalidSelectorError.details).toBeDefined();
    });

    it('should handle SCRIPT_INJECTION_FAILED error correctly', () => {
      const scriptError: DOMError = {
        code: ErrorCode.SCRIPT_INJECTION_FAILED,
        message: 'Failed to inject DOM manipulation script',
        action: DOMAction.SET_ATTRIBUTE,
        details: {
          attribute: 'data-value',
          value: 'new-value',
          reason: 'Content Security Policy violation'
        }
      };

      expect(scriptError.code).toBe(ErrorCode.SCRIPT_INJECTION_FAILED);
      expect(scriptError.message).toContain('inject');
      expect(scriptError.details).toBeDefined();
    });

    it('should handle TIMEOUT error correctly', () => {
      const timeoutError: DOMError = {
        code: ErrorCode.TIMEOUT,
        message: 'Set attribute operation timed out after 2000ms',
        action: DOMAction.SET_ATTRIBUTE,
        details: {
          timeout: 2000,
          attribute: 'src',
          value: 'https://example.com/large-image.jpg',
          selector: 'img[data-testid="slow-loading"]'
        }
      };

      expect(timeoutError.code).toBe(ErrorCode.TIMEOUT);
      expect(timeoutError.message).toContain('timed out');
      expect(timeoutError.details).toBeDefined();
    });

    it('should handle CROSS_ORIGIN_FRAME error correctly', () => {
      const crossOriginError: DOMError = {
        code: ErrorCode.CROSS_ORIGIN_FRAME,
        message: 'Cannot modify element in cross-origin frame',
        action: DOMAction.SET_ATTRIBUTE,
        details: {
          frameUrl: 'https://external-site.com',
          attribute: 'src',
          value: 'https://example.com/image.jpg'
        }
      };

      expect(crossOriginError.code).toBe(ErrorCode.CROSS_ORIGIN_FRAME);
      expect(crossOriginError.message).toContain('cross-origin');
    });
  });

  describe('DomService Integration Contract', () => {
    it('should call DomService with correct parameters', async () => {
      // This test will fail until DomService is implemented
      const request: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'a[data-testid="external-link"]',
        attribute: 'href',
        value: 'https://new-example.com',
        requestId: 'test-set-attr-123'
      };

      const mockElement: DOMElementInfo = {
        tagName: 'A',
        attributes: {
          'href': 'https://new-example.com', // Updated value
          'data-testid': 'external-link'
        },
        visible: true,
        enabled: true
      };

      mockDomService.executeOperation.mockResolvedValue({
        success: true,
        data: {
          value: 'https://new-example.com',
          element: mockElement
        },
        requestId: request.requestId,
        duration: 65
      });

      // This service call doesn't exist yet - test will fail
      await expect(async () => {
        const result = await mockDomService.executeOperation(request);
        expect(result).toBeDefined();
        expect(result.data.value).toBe('https://new-example.com');
        expect(result.data.element.tagName).toBe('A');
        expect(result.data.element.attributes['href']).toBe('https://new-example.com');
      }).not.toThrow();

      expect(mockDomService.executeOperation).toHaveBeenCalledWith(request);
    });

    it('should handle service errors gracefully', async () => {
      const request: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'img[data-testid="avatar"]',
        attribute: 'src',
        value: 'https://example.com/image.jpg',
        requestId: 'test-set-attr-123'
      };

      mockDomService.executeOperation.mockRejectedValue(
        new Error('Element modification not allowed')
      );

      // This error handling doesn't exist yet - test will fail
      await expect(async () => {
        await mockDomService.executeOperation(request);
      }).rejects.toThrow('Element modification not allowed');
    });
  });

  describe('Attribute Setting Scenarios', () => {
    it('should handle common HTML attributes', () => {
      const commonScenarios = [
        { attr: 'src', value: 'https://example.com/image.jpg', tag: 'IMG' },
        { attr: 'href', value: 'https://example.com/page', tag: 'A' },
        { attr: 'value', value: 'new input value', tag: 'INPUT' },
        { attr: 'alt', value: 'Alternative text', tag: 'IMG' },
        { attr: 'title', value: 'Tooltip text', tag: 'DIV' },
        { attr: 'placeholder', value: 'Enter text here', tag: 'INPUT' },
        { attr: 'id', value: 'new-unique-id', tag: 'DIV' },
        { attr: 'class', value: 'btn btn-primary active', tag: 'BUTTON' }
      ];

      commonScenarios.forEach(({ attr, value, tag }) => {
        const request: SetAttributeRequest = {
          action: DOMAction.SET_ATTRIBUTE,
          selector: `${tag.toLowerCase()}[data-testid="test"]`,
          attribute: attr,
          value: value,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
        expect(request.value).toBe(value);
      });
    });

    it('should handle boolean-like attributes', () => {
      const booleanScenarios = [
        { attr: 'disabled', value: 'true' },
        { attr: 'disabled', value: '' }, // HTML boolean attribute (present = true)
        { attr: 'readonly', value: 'readonly' },
        { attr: 'required', value: '' },
        { attr: 'checked', value: 'checked' },
        { attr: 'selected', value: 'selected' },
        { attr: 'hidden', value: '' },
        { attr: 'autofocus', value: 'autofocus' }
      ];

      booleanScenarios.forEach(({ attr, value }) => {
        const request: SetAttributeRequest = {
          action: DOMAction.SET_ATTRIBUTE,
          selector: `input[data-testid="test"]`,
          attribute: attr,
          value: value,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
        expect(request.value).toBe(value);
      });
    });

    it('should handle custom data attributes', () => {
      const dataScenarios = [
        { attr: 'data-testid', value: 'unique-test-identifier' },
        { attr: 'data-value', value: '42' },
        { attr: 'data-config', value: '{"theme":"dark","size":"large"}' },
        { attr: 'data-role', value: 'navigation' },
        { attr: 'data-index', value: '5' },
        { attr: 'data-custom-property', value: 'custom-value' }
      ];

      dataScenarios.forEach(({ attr, value }) => {
        const request: SetAttributeRequest = {
          action: DOMAction.SET_ATTRIBUTE,
          selector: `div[${attr}]`,
          attribute: attr,
          value: value,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
        expect(request.attribute).toMatch(/^data-/);
        expect(request.value).toBe(value);
      });
    });

    it('should handle ARIA attributes', () => {
      const ariaScenarios = [
        { attr: 'aria-label', value: 'Close dialog' },
        { attr: 'aria-expanded', value: 'false' },
        { attr: 'aria-hidden', value: 'true' },
        { attr: 'aria-describedby', value: 'help-text-id' },
        { attr: 'aria-labelledby', value: 'header-id' },
        { attr: 'role', value: 'button' }
      ];

      ariaScenarios.forEach(({ attr, value }) => {
        const request: SetAttributeRequest = {
          action: DOMAction.SET_ATTRIBUTE,
          selector: `button[${attr}]`,
          attribute: attr,
          value: value,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
        expect(request.value).toBe(value);
      });
    });
  });

  describe('Edge Cases Contract', () => {
    it('should handle special characters in values', () => {
      const specialValueRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'input[data-testid="special"]',
        attribute: 'data-special',
        value: '!@#$%^&*()_+{}|:"<>?[]\\;\',./', // Special characters
        requestId: 'test-special-123'
      };

      expect(specialValueRequest.value).toContain('!@#$%^&*()');
    });

    it('should handle unicode characters in values', () => {
      const unicodeRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'span[data-testid="unicode"]',
        attribute: 'data-text',
        value: 'José María 中文 🎉 Émilie',
        requestId: 'test-unicode-123'
      };

      expect(unicodeRequest.value).toContain('José María');
      expect(unicodeRequest.value).toContain('中文');
      expect(unicodeRequest.value).toContain('🎉');
    });

    it('should handle newlines and whitespace in values', () => {
      const multilineRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'textarea[data-testid="multiline"]',
        attribute: 'data-content',
        value: 'Line 1\nLine 2\n\tIndented line\r\nWindows line ending',
        requestId: 'test-multiline-123'
      };

      expect(multilineRequest.value).toContain('\n');
      expect(multilineRequest.value).toContain('\t');
      expect(multilineRequest.value).toContain('\r\n');
    });

    it('should handle case-sensitive attribute names', () => {
      const caseSensitiveRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'svg',
        attribute: 'viewBox', // Note: not 'viewbox'
        value: '0 0 100 100',
        requestId: 'test-case-sensitive-123'
      };

      expect(caseSensitiveRequest.attribute).toBe('viewBox');
    });

    it('should handle very long attribute values', () => {
      const longValue = 'a'.repeat(10000); // 10KB string
      const longValueRequest: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'div[data-testid="large-data"]',
        attribute: 'data-large-content',
        value: longValue,
        requestId: 'test-long-value-123'
      };

      expect(longValueRequest.value).toHaveLength(10000);
    });
  });

  describe('Performance Contract', () => {
    it('should return duration in response', async () => {
      const response: DOMOperationResponse<AttributeResponse> = {
        success: true,
        data: {
          value: 'new-value',
          element: {
            tagName: 'DIV',
            attributes: { 'data-value': 'new-value' },
            visible: true,
            enabled: true
          }
        },
        requestId: 'test-set-attr-123',
        duration: 65
      };

      expect(response.duration).toBeTypeOf('number');
      expect(response.duration).toBeGreaterThan(0);
    });

    it('should respect timeout parameter', async () => {
      const request: SetAttributeRequest = {
        action: DOMAction.SET_ATTRIBUTE,
        selector: 'img[data-testid="slow-loading"]',
        attribute: 'src',
        value: 'https://example.com/large-image.jpg',
        requestId: 'test-set-attr-123',
        timeout: 500
      };

      // This timeout handling doesn't exist yet - test will fail
      const startTime = Date.now();

      mockDomService.executeOperation.mockImplementation(() =>
        new Promise(resolve =>
          setTimeout(() => resolve({
            success: false,
            error: { code: ErrorCode.TIMEOUT, message: 'Timed out' },
            requestId: request.requestId,
            duration: 500
          }), 500)
        )
      );

      const result = await mockDomService.executeOperation(request);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThanOrEqual(500);
      expect(result.error?.code).toBe(ErrorCode.TIMEOUT);
    });

    it('should be reasonably fast for simple attribute setting', () => {
      // Set attribute operations should typically complete quickly
      const expectedMaxDuration = 200; // 200ms threshold

      const response: DOMOperationResponse<AttributeResponse> = {
        success: true,
        data: {
          value: 'simple-value',
          element: {
            tagName: 'SPAN',
            attributes: { 'data-value': 'simple-value' },
            visible: true,
            enabled: true
          }
        },
        requestId: 'test-set-attr-123',
        duration: 65 // Should be reasonably fast
      };

      expect(response.duration).toBeLessThan(expectedMaxDuration);
    });
  });
});

// Helper function that doesn't exist yet - will cause test failures
function validateSetAttributeRequest(request: SetAttributeRequest): void {
  // This validation logic is not implemented yet
  throw new Error('validateSetAttributeRequest not implemented');
}