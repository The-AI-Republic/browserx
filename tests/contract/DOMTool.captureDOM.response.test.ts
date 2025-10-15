/**
 * Contract test for DOMCaptureResponse structure
 * Tests the response interface from captureDOM() method
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  DOMCaptureResponse,
  SerializedDOMState,
  DOMCaptureMetadata,
  DOMCaptureError,
  DOMCaptureWarning
} from '../../../specs/020-refactor-dom-tool/contracts/dom-tool-api';

describe('DOMCaptureResponse Contract', () => {
  describe('Successful response structure', () => {
    it('should have success=true and dom_state present', () => {
      const response: DOMCaptureResponse = {
        success: true,
        dom_state: {
          serialized_tree: '[1] <button>Click me</button>',
          selector_map: {
            1: {} as any
          },
          metadata: {
            capture_timestamp: Date.now(),
            page_url: 'https://example.com',
            page_title: 'Test Page',
            viewport: {
              width: 1920,
              height: 1080,
              device_pixel_ratio: 2,
              scroll_x: 0,
              scroll_y: 0,
              visible_width: 1920,
              visible_height: 1080
            },
            total_nodes: 100,
            interactive_elements: 10,
            iframe_count: 0,
            max_depth: 5
          }
        }
      };

      expect(response.success).toBe(true);
      expect(response.dom_state).toBeDefined();
      expect(response.dom_state?.serialized_tree).toBeTruthy();
      expect(response.dom_state?.selector_map).toBeDefined();
      expect(response.dom_state?.metadata).toBeDefined();
    });

    it('should have valid dom_state with all required fields', () => {
      const response: DOMCaptureResponse = {
        success: true,
        dom_state: {
          serialized_tree: '[1] <div>Content</div>',
          selector_map: {},
          metadata: {
            capture_timestamp: 1696176000000,
            page_url: 'https://test.com',
            page_title: 'Test',
            viewport: {
              width: 1024,
              height: 768,
              device_pixel_ratio: 1,
              scroll_x: 0,
              scroll_y: 100,
              visible_width: 1024,
              visible_height: 668
            },
            total_nodes: 50,
            interactive_elements: 5,
            iframe_count: 0,
            max_depth: 3
          }
        }
      };

      const state = response.dom_state!;
      expect(typeof state.serialized_tree).toBe('string');
      expect(state.serialized_tree.length).toBeGreaterThan(0);
      expect(typeof state.selector_map).toBe('object');
      expect(state.metadata).toBeDefined();
      expect(state.metadata.capture_timestamp).toBeGreaterThan(0);
      expect(state.metadata.total_nodes).toBeGreaterThan(0);
    });

    it('should have selector_map as object with numeric keys', () => {
      const response: DOMCaptureResponse = {
        success: true,
        dom_state: {
          serialized_tree: '[1] <button>A</button>\n[2] <input />',
          selector_map: {
            1: {
              node_id: 1,
              backend_node_id: 101,
              node_type: 1,
              node_name: 'BUTTON',
              node_value: '',
              attributes: {},
              is_visible: true,
              is_scrollable: false,
              absolute_position: { x: 10, y: 20, width: 100, height: 40 },
              target_id: 'page',
              frame_id: null,
              session_id: null,
              parent_node: null,
              children_nodes: null,
              content_document: null,
              shadow_roots: null,
              shadow_root_type: null,
              ax_node: null,
              snapshot_node: null,
              element_index: 1,
              uuid: 'uuid-1'
            },
            2: {
              node_id: 2,
              backend_node_id: 102,
              node_type: 1,
              node_name: 'INPUT',
              node_value: '',
              attributes: {},
              is_visible: true,
              is_scrollable: false,
              absolute_position: { x: 10, y: 70, width: 200, height: 30 },
              target_id: 'page',
              frame_id: null,
              session_id: null,
              parent_node: null,
              children_nodes: null,
              content_document: null,
              shadow_roots: null,
              shadow_root_type: null,
              ax_node: null,
              snapshot_node: null,
              element_index: 2,
              uuid: 'uuid-2'
            }
          },
          metadata: {
            capture_timestamp: Date.now(),
            page_url: 'https://example.com',
            page_title: 'Form',
            viewport: {
              width: 1920,
              height: 1080,
              device_pixel_ratio: 1,
              scroll_x: 0,
              scroll_y: 0,
              visible_width: 1920,
              visible_height: 1080
            },
            total_nodes: 2,
            interactive_elements: 2,
            iframe_count: 0,
            max_depth: 1
          }
        }
      };

      const selectorMap = response.dom_state!.selector_map;

      // Check keys are numeric
      const keys = Object.keys(selectorMap).map(Number);
      expect(keys).toEqual([1, 2]);

      // Check values are EnhancedDOMTreeNode
      expect(selectorMap[1]).toBeDefined();
      expect(selectorMap[1].node_name).toBe('BUTTON');
      expect(selectorMap[1].element_index).toBe(1);

      expect(selectorMap[2]).toBeDefined();
      expect(selectorMap[2].node_name).toBe('INPUT');
      expect(selectorMap[2].element_index).toBe(2);
    });

    it('should have valid metadata with all required fields', () => {
      const metadata: DOMCaptureMetadata = {
        capture_timestamp: 1696176000000,
        page_url: 'https://example.com/page',
        page_title: 'Example Page',
        viewport: {
          width: 1440,
          height: 900,
          device_pixel_ratio: 2,
          scroll_x: 0,
          scroll_y: 50,
          visible_width: 1440,
          visible_height: 850
        },
        total_nodes: 1000,
        interactive_elements: 50,
        iframe_count: 2,
        max_depth: 8
      };

      expect(metadata.capture_timestamp).toBeGreaterThan(0);
      expect(metadata.page_url).toMatch(/^https?:\/\//);
      expect(typeof metadata.page_title).toBe('string');
      expect(metadata.viewport.width).toBeGreaterThan(0);
      expect(metadata.viewport.height).toBeGreaterThan(0);
      expect(metadata.viewport.device_pixel_ratio).toBeGreaterThan(0);
      expect(metadata.total_nodes).toBeGreaterThanOrEqual(metadata.interactive_elements);
      expect(metadata.iframe_count).toBeGreaterThanOrEqual(0);
      expect(metadata.max_depth).toBeGreaterThan(0);
    });

    it('should optionally include timing information', () => {
      const response: DOMCaptureResponse = {
        success: true,
        dom_state: {
          serialized_tree: '[1] <div>Test</div>',
          selector_map: {},
          metadata: {
            capture_timestamp: Date.now(),
            page_url: 'https://example.com',
            page_title: 'Test',
            viewport: {
              width: 1920,
              height: 1080,
              device_pixel_ratio: 1,
              scroll_x: 0,
              scroll_y: 0,
              visible_width: 1920,
              visible_height: 1080
            },
            total_nodes: 10,
            interactive_elements: 1,
            iframe_count: 0,
            max_depth: 2
          },
          timing: {
            dom_traversal_ms: 145,
            serialization_ms: 32,
            total_ms: 177
          }
        }
      };

      expect(response.dom_state?.timing).toBeDefined();
      expect(response.dom_state!.timing!.dom_traversal_ms).toBeGreaterThan(0);
      expect(response.dom_state!.timing!.serialization_ms).toBeGreaterThan(0);
      expect(response.dom_state!.timing!.total_ms).toBeGreaterThan(0);
    });

    it('should optionally include warnings array', () => {
      const warning: DOMCaptureWarning = {
        type: 'CROSS_ORIGIN_IFRAME_SKIPPED',
        message: 'Cannot access cross-origin iframe',
        element: 'iframe[src="https://third-party.com"]'
      };

      const response: DOMCaptureResponse = {
        success: true,
        dom_state: {
          serialized_tree: '[1] <div>Content</div>',
          selector_map: {},
          metadata: {
            capture_timestamp: Date.now(),
            page_url: 'https://example.com',
            page_title: 'Test',
            viewport: {
              width: 1920,
              height: 1080,
              device_pixel_ratio: 1,
              scroll_x: 0,
              scroll_y: 0,
              visible_width: 1920,
              visible_height: 1080
            },
            total_nodes: 10,
            interactive_elements: 1,
            iframe_count: 1,
            max_depth: 2
          }
        },
        warnings: [warning]
      };

      expect(response.warnings).toBeDefined();
      expect(Array.isArray(response.warnings)).toBe(true);
      expect(response.warnings!.length).toBe(1);
      expect(response.warnings![0].type).toBe('CROSS_ORIGIN_IFRAME_SKIPPED');
      expect(response.warnings![0].message).toBeTruthy();
    });
  });

  describe('Error response structure', () => {
    it('should have success=false and error present', () => {
      const response: DOMCaptureResponse = {
        success: false,
        error: {
          code: 'TAB_NOT_FOUND',
          message: 'Tab with ID 999 not found'
        }
      };

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.dom_state).toBeUndefined();
    });

    it('should have valid error with code and message', () => {
      const error: DOMCaptureError = {
        code: 'TIMEOUT',
        message: 'DOM capture exceeded timeout of 5000ms',
        details: { timeout_ms: 5000, elapsed_ms: 5100 }
      };

      const response: DOMCaptureResponse = {
        success: false,
        error
      };

      expect(response.error!.code).toBe('TIMEOUT');
      expect(typeof response.error!.message).toBe('string');
      expect(response.error!.message.length).toBeGreaterThan(0);
      expect(response.error!.details).toBeDefined();
    });

    it('should support optional error element field', () => {
      const response: DOMCaptureResponse = {
        success: false,
        error: {
          code: 'CROSS_ORIGIN_FRAME',
          message: 'Cannot access cross-origin frame',
          element: 'iframe#third-party'
        }
      };

      expect(response.error!.element).toBe('iframe#third-party');
    });

    it('should support optional error details field', () => {
      const response: DOMCaptureResponse = {
        success: false,
        error: {
          code: 'MESSAGE_SIZE_EXCEEDED',
          message: 'Serialized DOM exceeds message size limit',
          details: {
            size_bytes: 5242880,
            limit_bytes: 4194304
          }
        }
      };

      expect(response.error!.details).toBeDefined();
      expect(response.error!.details.size_bytes).toBe(5242880);
      expect(response.error!.details.limit_bytes).toBe(4194304);
    });
  });

  describe('Warnings array structure', () => {
    it('should support multiple warnings', () => {
      const warnings: DOMCaptureWarning[] = [
        {
          type: 'DEPTH_LIMIT_REACHED',
          message: 'Stopped at iframe depth 3'
        },
        {
          type: 'CROSS_ORIGIN_IFRAME_SKIPPED',
          message: 'Skipped cross-origin iframe',
          element: 'iframe[src="https://ads.example.com"]'
        },
        {
          type: 'PARTIAL_ACCESSIBILITY_DATA',
          message: 'Some accessibility information unavailable'
        }
      ];

      const response: DOMCaptureResponse = {
        success: true,
        dom_state: {
          serialized_tree: '[1] <div>Content</div>',
          selector_map: {},
          metadata: {
            capture_timestamp: Date.now(),
            page_url: 'https://example.com',
            page_title: 'Test',
            viewport: {
              width: 1920,
              height: 1080,
              device_pixel_ratio: 1,
              scroll_x: 0,
              scroll_y: 0,
              visible_width: 1920,
              visible_height: 1080
            },
            total_nodes: 100,
            interactive_elements: 10,
            iframe_count: 5,
            max_depth: 4
          }
        },
        warnings
      };

      expect(response.warnings!.length).toBe(3);
      expect(response.warnings![0].type).toBe('DEPTH_LIMIT_REACHED');
      expect(response.warnings![1].type).toBe('CROSS_ORIGIN_IFRAME_SKIPPED');
      expect(response.warnings![2].type).toBe('PARTIAL_ACCESSIBILITY_DATA');
    });
  });

  describe('Type constraints', () => {
    it('should enforce selector_map keys as numbers', () => {
      const selectorMap: { [index: number]: any } = {
        1: { node_name: 'DIV' },
        2: { node_name: 'BUTTON' }
      };

      expect(typeof Object.keys(selectorMap)[0]).toBe('string'); // JS quirk
      expect(Number.isInteger(Number(Object.keys(selectorMap)[0]))).toBe(true);
    });

    it('should validate metadata.total_nodes >= metadata.interactive_elements', () => {
      const metadata: DOMCaptureMetadata = {
        capture_timestamp: Date.now(),
        page_url: 'https://example.com',
        page_title: 'Test',
        viewport: {
          width: 1920,
          height: 1080,
          device_pixel_ratio: 1,
          scroll_x: 0,
          scroll_y: 0,
          visible_width: 1920,
          visible_height: 1080
        },
        total_nodes: 100,
        interactive_elements: 25,
        iframe_count: 0,
        max_depth: 5
      };

      expect(metadata.total_nodes).toBeGreaterThanOrEqual(metadata.interactive_elements);
    });
  });
});
