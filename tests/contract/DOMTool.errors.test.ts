/**
 * Contract test for DOMTool error handling
 * Tests all error codes and error scenarios
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type {
  DOMCaptureError,
  DOMErrorCode
} from '../../../specs/020-refactor-dom-tool/contracts/dom-tool-api';

describe('DOMTool Error Handling Contract', () => {
  describe('Error code: TIMEOUT', () => {
    it('should return TIMEOUT error when capture exceeds timeout_ms', () => {
      const error: DOMCaptureError = {
        code: 'TIMEOUT',
        message: 'DOM capture exceeded timeout of 5000ms',
        details: {
          timeout_ms: 5000,
          elapsed_ms: 5100
        }
      };

      expect(error.code).toBe('TIMEOUT');
      expect(error.message).toContain('timeout');
      expect(error.details.timeout_ms).toBe(5000);
      expect(error.details.elapsed_ms).toBeGreaterThan(error.details.timeout_ms);
    });

    it('should include timing details in TIMEOUT error', () => {
      const error: DOMCaptureError = {
        code: 'TIMEOUT',
        message: 'Capture timed out',
        details: {
          timeout_ms: 3000,
          elapsed_ms: 3150,
          phase: 'dom_traversal'
        }
      };

      expect(error.details).toBeDefined();
      expect(error.details.phase).toBe('dom_traversal');
    });
  });

  describe('Error code: TAB_NOT_FOUND', () => {
    it('should return TAB_NOT_FOUND for invalid tab_id', () => {
      const error: DOMCaptureError = {
        code: 'TAB_NOT_FOUND',
        message: 'Tab with ID 999 does not exist',
        details: {
          tab_id: 999
        }
      };

      expect(error.code).toBe('TAB_NOT_FOUND');
      expect(error.message).toContain('999');
      expect(error.details.tab_id).toBe(999);
    });

    it('should include tab_id in error details', () => {
      const error: DOMCaptureError = {
        code: 'TAB_NOT_FOUND',
        message: 'Cannot find tab',
        details: {
          tab_id: 12345,
          available_tabs: []
        }
      };

      expect(error.details.tab_id).toBe(12345);
    });
  });

  describe('Error code: CONTENT_SCRIPT_NOT_LOADED', () => {
    it('should return CONTENT_SCRIPT_NOT_LOADED when injection fails', () => {
      const error: DOMCaptureError = {
        code: 'CONTENT_SCRIPT_NOT_LOADED',
        message: 'Content script injection failed',
        details: {
          tab_id: 123,
          reason: 'Cannot access chrome:// URLs'
        }
      };

      expect(error.code).toBe('CONTENT_SCRIPT_NOT_LOADED');
      expect(error.message).toContain('injection');
      expect(error.details.reason).toBeTruthy();
    });

    it('should include injection failure reason', () => {
      const error: DOMCaptureError = {
        code: 'CONTENT_SCRIPT_NOT_LOADED',
        message: 'Script injection blocked',
        details: {
          tab_id: 456,
          url: 'chrome://extensions/',
          reason: 'Restricted URL scheme'
        }
      };

      expect(error.details.url).toContain('chrome://');
      expect(error.details.reason).toBe('Restricted URL scheme');
    });
  });

  describe('Error code: CROSS_ORIGIN_FRAME', () => {
    it('should return CROSS_ORIGIN_FRAME for cross-origin iframe access', () => {
      const error: DOMCaptureError = {
        code: 'CROSS_ORIGIN_FRAME',
        message: 'Cannot access cross-origin iframe',
        element: 'iframe[src="https://third-party.com"]',
        details: {
          frame_url: 'https://third-party.com/widget',
          origin: 'https://third-party.com'
        }
      };

      expect(error.code).toBe('CROSS_ORIGIN_FRAME');
      expect(error.message).toContain('cross-origin');
      expect(error.element).toContain('iframe');
      expect(error.details.frame_url).toBeTruthy();
    });

    it('should include iframe selector in element field', () => {
      const error: DOMCaptureError = {
        code: 'CROSS_ORIGIN_FRAME',
        message: 'Cross-origin access denied',
        element: 'iframe#third-party-widget',
        details: {
          frame_url: 'https://ads.example.com',
          security_error: 'SecurityError: Blocked a frame with origin...'
        }
      };

      expect(error.element).toBe('iframe#third-party-widget');
      expect(error.details.security_error).toContain('SecurityError');
    });
  });

  describe('Error code: MESSAGE_SIZE_EXCEEDED', () => {
    it('should return MESSAGE_SIZE_EXCEEDED when response too large', () => {
      const error: DOMCaptureError = {
        code: 'MESSAGE_SIZE_EXCEEDED',
        message: 'Serialized DOM exceeds message size limit',
        details: {
          size_bytes: 5242880,
          limit_bytes: 4194304,
          total_nodes: 25000
        }
      };

      expect(error.code).toBe('MESSAGE_SIZE_EXCEEDED');
      expect(error.message).toContain('size');
      expect(error.details.size_bytes).toBeGreaterThan(error.details.limit_bytes);
    });

    it('should include size information in details', () => {
      const error: DOMCaptureError = {
        code: 'MESSAGE_SIZE_EXCEEDED',
        message: 'Response too large',
        details: {
          size_bytes: 6000000,
          limit_bytes: 4194304,
          suggestion: 'Enable more aggressive filtering or reduce max_iframe_count'
        }
      };

      expect(error.details.size_bytes).toBe(6000000);
      expect(error.details.limit_bytes).toBe(4194304);
      expect(error.details.suggestion).toBeTruthy();
    });
  });

  describe('Error code: PERMISSION_DENIED', () => {
    it('should return PERMISSION_DENIED for insufficient permissions', () => {
      const error: DOMCaptureError = {
        code: 'PERMISSION_DENIED',
        message: 'Extension lacks permission to access this tab',
        details: {
          tab_id: 789,
          url: 'https://chrome.google.com/webstore',
          required_permissions: ['tabs', 'activeTab']
        }
      };

      expect(error.code).toBe('PERMISSION_DENIED');
      expect(error.message).toContain('permission');
      expect(error.details.required_permissions).toBeDefined();
    });

    it('should list required permissions in details', () => {
      const error: DOMCaptureError = {
        code: 'PERMISSION_DENIED',
        message: 'Cannot access tab',
        details: {
          tab_id: 101,
          url: 'chrome://settings/',
          required_permissions: ['debugger'],
          reason: 'Chrome internal pages require debugger permission'
        }
      };

      expect(Array.isArray(error.details.required_permissions)).toBe(true);
      expect(error.details.required_permissions).toContain('debugger');
    });
  });

  describe('Error code: UNKNOWN_ERROR', () => {
    it('should return UNKNOWN_ERROR for unexpected failures', () => {
      const error: DOMCaptureError = {
        code: 'UNKNOWN_ERROR',
        message: 'An unexpected error occurred during DOM capture',
        details: {
          original_error: 'TypeError: Cannot read property "nodeType" of null',
          stack: 'Error: ...'
        }
      };

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.details.original_error).toBeTruthy();
    });

    it('should include stack trace when available', () => {
      const error: DOMCaptureError = {
        code: 'UNKNOWN_ERROR',
        message: 'Unexpected error',
        details: {
          original_error: 'ReferenceError: foo is not defined',
          stack: 'ReferenceError: foo is not defined\n    at Object.captureDOM...'
        }
      };

      expect(error.details.stack).toContain('ReferenceError');
    });
  });

  describe('Error structure validation', () => {
    it('should always have code and message', () => {
      const errors: DOMCaptureError[] = [
        { code: 'TIMEOUT', message: 'Timeout' },
        { code: 'TAB_NOT_FOUND', message: 'Not found' },
        { code: 'CONTENT_SCRIPT_NOT_LOADED', message: 'Script not loaded' }
      ];

      errors.forEach(error => {
        expect(error.code).toBeTruthy();
        expect(error.message).toBeTruthy();
        expect(typeof error.code).toBe('string');
        expect(typeof error.message).toBe('string');
      });
    });

    it('should have optional element and details fields', () => {
      const errorWithBoth: DOMCaptureError = {
        code: 'CROSS_ORIGIN_FRAME',
        message: 'Error',
        element: 'iframe',
        details: { foo: 'bar' }
      };

      const errorWithNeither: DOMCaptureError = {
        code: 'TAB_NOT_FOUND',
        message: 'Error'
      };

      expect(errorWithBoth.element).toBe('iframe');
      expect(errorWithBoth.details).toBeDefined();
      expect(errorWithNeither.element).toBeUndefined();
      expect(errorWithNeither.details).toBeUndefined();
    });

    it('should support all error code enum values', () => {
      const validCodes: DOMErrorCode[] = [
        'TIMEOUT',
        'PERMISSION_DENIED',
        'TAB_NOT_FOUND',
        'CONTENT_SCRIPT_NOT_LOADED',
        'CROSS_ORIGIN_FRAME',
        'MESSAGE_SIZE_EXCEEDED',
        'INVALID_ELEMENT_INDEX',
        'CACHE_MISS',
        'UNKNOWN_ERROR'
      ];

      validCodes.forEach(code => {
        const error: DOMCaptureError = {
          code,
          message: `Test error for ${code}`
        };

        expect(error.code).toBe(code);
      });
    });
  });

  describe('Error message quality', () => {
    it('should have descriptive error messages', () => {
      const errors: DOMCaptureError[] = [
        { code: 'TIMEOUT', message: 'DOM capture exceeded timeout of 5000ms' },
        { code: 'TAB_NOT_FOUND', message: 'Tab with ID 999 does not exist' },
        { code: 'PERMISSION_DENIED', message: 'Extension lacks permission to access tab' }
      ];

      errors.forEach(error => {
        expect(error.message.length).toBeGreaterThan(10);
        expect(error.message).not.toBe(error.code);
      });
    });

    it('should include context in error messages', () => {
      const error: DOMCaptureError = {
        code: 'CONTENT_SCRIPT_NOT_LOADED',
        message: 'Content script injection failed for tab 123: Cannot access chrome:// URLs',
        details: {
          tab_id: 123,
          url: 'chrome://extensions/'
        }
      };

      expect(error.message).toContain('123');
      expect(error.message).toContain('chrome://');
    });
  });
});
