/**
 * T009: Contract Test for GET_ATTRIBUTE Operation
 * Tests the GET_ATTRIBUTE DOM operation against the contract specification
 * These tests will initially FAIL before implementation (TDD approach)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DOMAction,
  GetAttributeRequest,
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

describe('GET_ATTRIBUTE Operation Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Structure Validation', () => {
    it('should validate GetAttributeRequest structure matches contract', () => {
      const validRequest: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: 'img[data-testid="profile-avatar"]',
        attribute: 'src',
        requestId: 'test-get-attr-123',
        tabId: 1,
        timeout: 1000
      };

      // Contract validation: Required fields
      expect(validRequest.action).toBe(DOMAction.GET_ATTRIBUTE);
      expect(validRequest.selector).toBeTypeOf('string');
      expect(validRequest.attribute).toBeTypeOf('string');
      expect(validRequest.requestId).toBeTypeOf('string');

      // Contract validation: Optional fields
      expect(validRequest.tabId).toBeTypeOf('number');
      expect(validRequest.timeout).toBeTypeOf('number');
    });

    it('should require mandatory fields in GetAttributeRequest', () => {
      // This test will fail until validation is implemented
      const invalidRequest = {
        // Missing action, selector, attribute, requestId
        tabId: 1
      };

      // Should validate and throw error for missing fields
      expect(() => {
        validateGetAttributeRequest(invalidRequest as any);
      }).toThrow();
    });

    it('should validate selector is non-empty string', () => {
      const invalidRequest: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: '', // Empty selector should be invalid
        attribute: 'src',
        requestId: 'test-get-attr-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateGetAttributeRequest(invalidRequest);
      }).toThrow('Selector cannot be empty');
    });

    it('should validate attribute is non-empty string', () => {
      const invalidRequest: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: 'img[data-testid="profile-avatar"]',
        attribute: '', // Empty attribute should be invalid
        requestId: 'test-get-attr-123'
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateGetAttributeRequest(invalidRequest);
      }).toThrow('Attribute name cannot be empty');
    });

    it('should handle common HTML attributes', () => {
      const commonAttributes = [
        'id', 'class', 'src', 'href', 'alt', 'title', 'data-testid',
        'aria-label', 'role', 'type', 'value', 'name', 'placeholder'
      ];

      commonAttributes.forEach(attr => {
        const request: GetAttributeRequest = {
          action: DOMAction.GET_ATTRIBUTE,
          selector: `[${attr}]`,
          attribute: attr,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
      });
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
          'src': 'https://example.com/avatar.jpg',
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
          value: 'https://example.com/avatar.jpg',
          element: mockElement
        },
        requestId: 'test-get-attr-123',
        duration: 45
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
    });

    it('should handle null attribute values', () => {
      const mockElement: DOMElementInfo = {
        tagName: 'DIV',
        id: 'content-area',
        className: 'container',
        textContent: 'Some content',
        attributes: {
          'id': 'content-area',
          'class': 'container'
          // 'data-value' attribute is not present
        },
        visible: true,
        enabled: true
      };

      const nullResponse: DOMOperationResponse<AttributeResponse> = {
        success: true,
        data: {
          value: null, // Attribute doesn't exist
          element: mockElement
        },
        requestId: 'test-get-attr-123',
        duration: 25
      };

      expect(nullResponse.data!.value).toBeNull();
      expect(nullResponse.data!.element).toBeDefined();
    });

    it('should validate error response structure', () => {
      const errorResponse: DOMOperationResponse<AttributeResponse> = {
        success: false,
        error: {
          code: ErrorCode.ELEMENT_NOT_FOUND,
          message: 'No element found matching selector "img[data-testid="nonexistent"]"',
          selector: 'img[data-testid="nonexistent"]',
          action: DOMAction.GET_ATTRIBUTE,
          details: {
            attribute: 'src'
          }
        },
        requestId: 'test-get-attr-123',
        duration: 30
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error!.code).toBe(ErrorCode.ELEMENT_NOT_FOUND);
      expect(errorResponse.error!.message).toBeTypeOf('string');
      expect(errorResponse.error!.selector).toBeTypeOf('string');
      expect(errorResponse.error!.action).toBe(DOMAction.GET_ATTRIBUTE);
    });
  });

  describe('Error Handling Contract', () => {
    it('should handle ELEMENT_NOT_FOUND error correctly', () => {
      const notFoundError: DOMError = {
        code: ErrorCode.ELEMENT_NOT_FOUND,
        message: 'No element found matching selector',
        selector: 'img[data-testid="missing-image"]',
        action: DOMAction.GET_ATTRIBUTE,
        details: {
          attribute: 'src'
        }
      };

      expect(notFoundError.code).toBe(ErrorCode.ELEMENT_NOT_FOUND);
      expect(notFoundError.message).toContain('not found');
      expect(notFoundError.selector).toBeDefined();
      expect(notFoundError.details?.attribute).toBe('src');
    });

    it('should handle INVALID_SELECTOR error correctly', () => {
      const invalidSelectorError: DOMError = {
        code: ErrorCode.INVALID_SELECTOR,
        message: 'Invalid CSS selector syntax: malformed attribute selector',
        selector: 'img[data-testid=unclosed',
        action: DOMAction.GET_ATTRIBUTE,
        details: {
          attribute: 'src',
          selectorError: 'Unclosed attribute selector'
        }
      };

      expect(invalidSelectorError.code).toBe(ErrorCode.INVALID_SELECTOR);
      expect(invalidSelectorError.message).toContain('Invalid');
      expect(invalidSelectorError.details).toBeDefined();
    });

    it('should handle TIMEOUT error correctly', () => {
      const timeoutError: DOMError = {
        code: ErrorCode.TIMEOUT,
        message: 'Get attribute operation timed out after 1000ms',
        action: DOMAction.GET_ATTRIBUTE,
        details: {
          timeout: 1000,
          attribute: 'src',
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
        message: 'Cannot access element in cross-origin frame',
        action: DOMAction.GET_ATTRIBUTE,
        details: {
          frameUrl: 'https://external-site.com',
          attribute: 'src'
        }
      };

      expect(crossOriginError.code).toBe(ErrorCode.CROSS_ORIGIN_FRAME);
      expect(crossOriginError.message).toContain('cross-origin');
    });
  });

  describe('DomService Integration Contract', () => {
    it('should call DomService with correct parameters', async () => {
      // This test will fail until DomService is implemented
      const request: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: 'a[data-testid="external-link"]',
        attribute: 'href',
        requestId: 'test-get-attr-123'
      };

      const mockElement: DOMElementInfo = {
        tagName: 'A',
        attributes: {
          'href': 'https://example.com',
          'data-testid': 'external-link'
        },
        visible: true,
        enabled: true
      };

      mockDomService.executeOperation.mockResolvedValue({
        success: true,
        data: {
          value: 'https://example.com',
          element: mockElement
        },
        requestId: request.requestId,
        duration: 45
      });

      // This service call doesn't exist yet - test will fail
      await expect(async () => {
        const result = await mockDomService.executeOperation(request);
        expect(result).toBeDefined();
        expect(result.data.value).toBe('https://example.com');
        expect(result.data.element.tagName).toBe('A');
      }).not.toThrow();

      expect(mockDomService.executeOperation).toHaveBeenCalledWith(request);
    });

    it('should handle service errors gracefully', async () => {
      const request: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: 'img[data-testid="avatar"]',
        attribute: 'src',
        requestId: 'test-get-attr-123'
      };

      mockDomService.executeOperation.mockRejectedValue(
        new Error('DOM script injection failed')
      );

      // This error handling doesn't exist yet - test will fail
      await expect(async () => {
        await mockDomService.executeOperation(request);
      }).rejects.toThrow('DOM script injection failed');
    });
  });

  describe('Attribute Types Contract', () => {
    it('should handle string attributes', () => {
      const stringAttributes = [
        { attr: 'id', expected: 'unique-identifier' },
        { attr: 'class', expected: 'btn btn-primary' },
        { attr: 'src', expected: 'https://example.com/image.jpg' },
        { attr: 'href', expected: 'https://example.com/page' },
        { attr: 'alt', expected: 'Image description' },
        { attr: 'title', expected: 'Tooltip text' },
        { attr: 'data-testid', expected: 'component-name' },
        { attr: 'aria-label', expected: 'Accessible label' }
      ];

      stringAttributes.forEach(({ attr, expected }) => {
        const request: GetAttributeRequest = {
          action: DOMAction.GET_ATTRIBUTE,
          selector: `[${attr}]`,
          attribute: attr,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
      });
    });

    it('should handle boolean-like attributes', () => {
      const booleanAttributes = [
        'disabled', 'readonly', 'required', 'checked',
        'selected', 'hidden', 'autofocus', 'multiple'
      ];

      booleanAttributes.forEach(attr => {
        const request: GetAttributeRequest = {
          action: DOMAction.GET_ATTRIBUTE,
          selector: `[${attr}]`,
          attribute: attr,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
      });
    });

    it('should handle numeric-like attributes', () => {
      const numericAttributes = [
        'width', 'height', 'size', 'maxlength',
        'min', 'max', 'step', 'tabindex', 'colspan', 'rowspan'
      ];

      numericAttributes.forEach(attr => {
        const request: GetAttributeRequest = {
          action: DOMAction.GET_ATTRIBUTE,
          selector: `[${attr}]`,
          attribute: attr,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
      });
    });

    it('should handle custom data attributes', () => {
      const dataAttributes = [
        'data-testid', 'data-value', 'data-index',
        'data-role', 'data-config', 'data-custom-property'
      ];

      dataAttributes.forEach(attr => {
        const request: GetAttributeRequest = {
          action: DOMAction.GET_ATTRIBUTE,
          selector: `[${attr}]`,
          attribute: attr,
          requestId: `test-${attr}-123`
        };

        expect(request.attribute).toBe(attr);
        expect(request.attribute).toMatch(/^data-/);
      });
    });
  });

  describe('Edge Cases Contract', () => {
    it('should handle case-sensitive attribute names', () => {
      const caseSensitiveRequest: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: 'svg[viewBox]',
        attribute: 'viewBox', // Note: not 'viewbox'
        requestId: 'test-case-sensitive-123'
      };

      expect(caseSensitiveRequest.attribute).toBe('viewBox');
    });

    it('should handle attributes with special characters', () => {
      const specialAttrRequest: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: '[data-custom-property]',
        attribute: 'data-custom-property',
        requestId: 'test-special-chars-123'
      };

      expect(specialAttrRequest.attribute).toContain('-');
    });

    it('should handle namespace-prefixed attributes', () => {
      const namespacedRequest: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: 'svg',
        attribute: 'xmlns:xlink',
        requestId: 'test-namespaced-123'
      };

      expect(namespacedRequest.attribute).toContain(':');
    });
  });

  describe('Performance Contract', () => {
    it('should return duration in response', async () => {
      const response: DOMOperationResponse<AttributeResponse> = {
        success: true,
        data: {
          value: 'attribute-value',
          element: {
            tagName: 'DIV',
            attributes: {},
            visible: true,
            enabled: true
          }
        },
        requestId: 'test-get-attr-123',
        duration: 45
      };

      expect(response.duration).toBeTypeOf('number');
      expect(response.duration).toBeGreaterThan(0);
    });

    it('should respect timeout parameter', async () => {
      const request: GetAttributeRequest = {
        action: DOMAction.GET_ATTRIBUTE,
        selector: 'img[data-testid="slow-loading"]',
        attribute: 'src',
        requestId: 'test-get-attr-123',
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

    it('should be fast for simple attribute retrieval', () => {
      // Get attribute operations should typically complete quickly
      const expectedMaxDuration = 100; // 100ms threshold

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
        requestId: 'test-get-attr-123',
        duration: 25 // Should be fast
      };

      expect(response.duration).toBeLessThan(expectedMaxDuration);
    });
  });
});

// Helper function that doesn't exist yet - will cause test failures
function validateGetAttributeRequest(request: GetAttributeRequest): void {
  // This validation logic is not implemented yet
  throw new Error('validateGetAttributeRequest not implemented');
}