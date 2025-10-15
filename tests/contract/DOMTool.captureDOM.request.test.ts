/**
 * Contract test for DOMCaptureRequest validation
 * Tests the request interface for captureDOM() method
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Schema for DOMCaptureRequest validation
const DOMCaptureRequestSchema = z.object({
  tab_id: z.number().int().nonnegative().optional(),
  include_shadow_dom: z.boolean().optional(),
  include_iframes: z.boolean().optional(),
  max_iframe_depth: z.number().int().min(0).max(10).optional(),
  max_iframe_count: z.number().int().min(0).max(50).optional(),
  paint_order_filtering: z.boolean().optional(),
  bbox_filtering: z.boolean().optional(),
  timeout_ms: z.number().int().min(100).max(30000).optional(),
  use_cache: z.boolean().optional(),
  include_timing: z.boolean().optional()
});

describe('DOMCaptureRequest Contract', () => {
  describe('Valid requests', () => {
    it('should accept empty object (all fields optional)', () => {
      const request = {};
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept request with all optional fields', () => {
      const request = {
        tab_id: 123,
        include_shadow_dom: true,
        include_iframes: true,
        max_iframe_depth: 3,
        max_iframe_count: 15,
        paint_order_filtering: true,
        bbox_filtering: true,
        timeout_ms: 5000,
        use_cache: true,
        include_timing: false
      };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept partial request with some fields', () => {
      const request = {
        tab_id: 456,
        timeout_ms: 3000,
        use_cache: false
      };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should accept boundary values for max_iframe_depth', () => {
      expect(DOMCaptureRequestSchema.safeParse({ max_iframe_depth: 0 }).success).toBe(true);
      expect(DOMCaptureRequestSchema.safeParse({ max_iframe_depth: 10 }).success).toBe(true);
    });

    it('should accept boundary values for max_iframe_count', () => {
      expect(DOMCaptureRequestSchema.safeParse({ max_iframe_count: 0 }).success).toBe(true);
      expect(DOMCaptureRequestSchema.safeParse({ max_iframe_count: 50 }).success).toBe(true);
    });

    it('should accept boundary values for timeout_ms', () => {
      expect(DOMCaptureRequestSchema.safeParse({ timeout_ms: 100 }).success).toBe(true);
      expect(DOMCaptureRequestSchema.safeParse({ timeout_ms: 30000 }).success).toBe(true);
    });
  });

  describe('Invalid requests', () => {
    it('should reject negative tab_id', () => {
      const request = { tab_id: -1 };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['tab_id']);
      }
    });

    it('should reject float tab_id', () => {
      const request = { tab_id: 123.45 };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject max_iframe_depth > 10', () => {
      const request = { max_iframe_depth: 11 };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['max_iframe_depth']);
      }
    });

    it('should reject negative max_iframe_depth', () => {
      const request = { max_iframe_depth: -1 };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject max_iframe_count > 50', () => {
      const request = { max_iframe_count: 51 };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['max_iframe_count']);
      }
    });

    it('should reject negative max_iframe_count', () => {
      const request = { max_iframe_count: -1 };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject timeout_ms < 100', () => {
      const request = { timeout_ms: 99 };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['timeout_ms']);
      }
    });

    it('should reject timeout_ms > 30000', () => {
      const request = { timeout_ms: 30001 };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toEqual(['timeout_ms']);
      }
    });

    it('should reject non-boolean include_shadow_dom', () => {
      const request = { include_shadow_dom: 'true' as any };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject non-number tab_id', () => {
      const request = { tab_id: '123' as any };
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should reject invalid field types', () => {
      const request = {
        tab_id: '123',
        include_iframes: 'yes',
        max_iframe_depth: '3',
        timeout_ms: true
      } as any;
      const result = DOMCaptureRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });

  describe('Type safety', () => {
    it('should provide proper TypeScript types', () => {
      type RequestType = z.infer<typeof DOMCaptureRequestSchema>;

      const validRequest: RequestType = {
        tab_id: 123,
        include_shadow_dom: true
      };

      expect(DOMCaptureRequestSchema.safeParse(validRequest).success).toBe(true);
    });
  });
});
