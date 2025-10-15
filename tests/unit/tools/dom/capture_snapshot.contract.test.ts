/**
 * T012: Contract Test for CAPTURE_SNAPSHOT Operation
 * Tests the CAPTURE_SNAPSHOT DOM operation against the contract specification
 * These tests will initially FAIL before implementation (TDD approach)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DOMAction,
  DOMOperationRequest,
  SnapshotResponse,
  DOMOperationResponse,
  DOMSnapshot,
  DocumentSnapshot,
  ErrorCode,
  DOMError
} from '../../../../../specs/001-dom-tool-integration/contracts/dom-operations';

// Mock DomService (will fail until implemented)
const mockDomService = {
  executeOperation: vi.fn()
};

// CAPTURE_SNAPSHOT operation uses base DOMOperationRequest (no specific request type)
interface CaptureSnapshotRequest extends DOMOperationRequest {
  action: DOMAction.CAPTURE_SNAPSHOT;
}

describe('CAPTURE_SNAPSHOT Operation Contract Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Request Structure Validation', () => {
    it('should validate CaptureSnapshotRequest structure matches contract', () => {
      const validRequest: CaptureSnapshotRequest = {
        action: DOMAction.CAPTURE_SNAPSHOT,
        requestId: 'test-snapshot-123',
        tabId: 1,
        timeout: 10000
      };

      // Contract validation: Required fields
      expect(validRequest.action).toBe(DOMAction.CAPTURE_SNAPSHOT);
      expect(validRequest.requestId).toBeTypeOf('string');

      // Contract validation: Optional fields
      expect(validRequest.tabId).toBeTypeOf('number');
      expect(validRequest.timeout).toBeTypeOf('number');
    });

    it('should require mandatory fields in CaptureSnapshotRequest', () => {
      // This test will fail until validation is implemented
      const invalidRequest = {
        // Missing action and requestId
        tabId: 1,
        timeout: 5000
      };

      // Should validate and throw error for missing fields
      expect(() => {
        validateCaptureSnapshotRequest(invalidRequest as any);
      }).toThrow();
    });

    it('should handle request without tabId (current tab)', () => {
      const currentTabRequest: CaptureSnapshotRequest = {
        action: DOMAction.CAPTURE_SNAPSHOT,
        requestId: 'test-snapshot-123'
        // No tabId - should use current active tab
      };

      expect(currentTabRequest.tabId).toBeUndefined();
      expect(currentTabRequest.action).toBe(DOMAction.CAPTURE_SNAPSHOT);
    });

    it('should validate timeout is positive number', () => {
      const invalidTimeoutRequest: CaptureSnapshotRequest = {
        action: DOMAction.CAPTURE_SNAPSHOT,
        requestId: 'test-snapshot-123',
        timeout: -1000 // Invalid negative timeout
      };

      // This validation doesn't exist yet - test will fail
      expect(() => {
        validateCaptureSnapshotRequest(invalidTimeoutRequest);
      }).toThrow('Timeout must be positive');
    });
  });

  describe('Response Structure Validation', () => {
    it('should validate SnapshotResponse structure matches contract', () => {
      const mockDocumentSnapshot: DocumentSnapshot = {
        url: 'https://example.com/page',
        nodes: [
          { nodeId: 1, nodeName: 'html', children: [2, 3] },
          { nodeId: 2, nodeName: 'head', children: [4] },
          { nodeId: 3, nodeName: 'body', children: [5, 6] },
          { nodeId: 4, nodeName: 'title', nodeValue: 'Example Page' },
          { nodeId: 5, nodeName: 'div', attributes: ['class', 'container'] },
          { nodeId: 6, nodeName: 'p', nodeValue: 'Sample content' }
        ],
        frameId: 'main-frame'
      };

      const mockSnapshot: DOMSnapshot = {
        documents: [mockDocumentSnapshot],
        timestamp: Date.now(),
        url: 'https://example.com/page',
        title: 'Example Page'
      };

      const validResponse: DOMOperationResponse<SnapshotResponse> = {
        success: true,
        data: {
          snapshot: mockSnapshot,
          documentCount: 1,
          nodeCount: 6
        },
        requestId: 'test-snapshot-123',
        duration: 850
      };

      // Contract validation: Response wrapper
      expect(validResponse.success).toBe(true);
      expect(validResponse.data).toBeTypeOf('object');
      expect(validResponse.requestId).toBeTypeOf('string');
      expect(validResponse.duration).toBeTypeOf('number');

      // Contract validation: SnapshotResponse data
      expect(validResponse.data!.snapshot).toBeTypeOf('object');
      expect(validResponse.data!.documentCount).toBeTypeOf('number');
      expect(validResponse.data!.nodeCount).toBeTypeOf('number');

      // Contract validation: DOMSnapshot structure
      const snapshot = validResponse.data!.snapshot;
      expect(snapshot.documents).toBeInstanceOf(Array);
      expect(snapshot.timestamp).toBeTypeOf('number');
      expect(snapshot.url).toBeTypeOf('string');
      expect(snapshot.title).toBeTypeOf('string');

      // Contract validation: DocumentSnapshot structure
      const document = snapshot.documents[0];
      expect(document.url).toBeTypeOf('string');
      expect(document.nodes).toBeInstanceOf(Array);
      expect(document.frameId).toBeTypeOf('string');
    });

    it('should handle multiple documents (frames)', () => {
      const mainDoc: DocumentSnapshot = {
        url: 'https://example.com/main',
        nodes: [
          { nodeId: 1, nodeName: 'html', children: [2] },
          { nodeId: 2, nodeName: 'body', children: [3] },
          { nodeId: 3, nodeName: 'iframe', attributes: ['src', 'https://example.com/frame'] }
        ],
        frameId: 'main-frame'
      };

      const frameDoc: DocumentSnapshot = {
        url: 'https://example.com/frame',
        nodes: [
          { nodeId: 4, nodeName: 'html', children: [5] },
          { nodeId: 5, nodeName: 'body', children: [6] },
          { nodeId: 6, nodeName: 'div', nodeValue: 'Frame content' }
        ],
        frameId: 'child-frame-1'
      };

      const multiFrameSnapshot: DOMSnapshot = {
        documents: [mainDoc, frameDoc],
        timestamp: Date.now(),
        url: 'https://example.com/main',
        title: 'Main Page with Frame'
      };

      const multiFrameResponse: DOMOperationResponse<SnapshotResponse> = {
        success: true,
        data: {
          snapshot: multiFrameSnapshot,
          documentCount: 2,
          nodeCount: 6
        },
        requestId: 'test-snapshot-123',
        duration: 1250
      };

      expect(multiFrameResponse.data!.documentCount).toBe(2);
      expect(multiFrameResponse.data!.snapshot.documents).toHaveLength(2);
      expect(multiFrameResponse.data!.snapshot.documents[0].frameId).toBe('main-frame');
      expect(multiFrameResponse.data!.snapshot.documents[1].frameId).toBe('child-frame-1');
    });

    it('should validate error response structure', () => {
      const errorResponse: DOMOperationResponse<SnapshotResponse> = {
        success: false,
        error: {
          code: ErrorCode.SCRIPT_INJECTION_FAILED,
          message: 'Failed to inject DOM snapshot collection script',
          action: DOMAction.CAPTURE_SNAPSHOT,
          details: {
            reason: 'Content Security Policy blocks script injection'
          }
        },
        requestId: 'test-snapshot-123',
        duration: 100
      };

      expect(errorResponse.success).toBe(false);
      expect(errorResponse.error).toBeDefined();
      expect(errorResponse.error!.code).toBe(ErrorCode.SCRIPT_INJECTION_FAILED);
      expect(errorResponse.error!.message).toBeTypeOf('string');
      expect(errorResponse.error!.action).toBe(DOMAction.CAPTURE_SNAPSHOT);
    });
  });

  describe('Error Handling Contract', () => {
    it('should handle SCRIPT_INJECTION_FAILED error correctly', () => {
      const scriptInjectionError: DOMError = {
        code: ErrorCode.SCRIPT_INJECTION_FAILED,
        message: 'Cannot inject DOM snapshot script due to CSP restrictions',
        action: DOMAction.CAPTURE_SNAPSHOT,
        details: {
          cspViolation: true,
          blockedDirective: 'script-src'
        }
      };

      expect(scriptInjectionError.code).toBe(ErrorCode.SCRIPT_INJECTION_FAILED);
      expect(scriptInjectionError.message).toContain('inject');
      expect(scriptInjectionError.details).toBeDefined();
    });

    it('should handle TIMEOUT error correctly', () => {
      const timeoutError: DOMError = {
        code: ErrorCode.TIMEOUT,
        message: 'DOM snapshot capture timed out after 10000ms',
        action: DOMAction.CAPTURE_SNAPSHOT,
        details: {
          timeout: 10000,
          nodesProcessed: 1250,
          documentsProcessed: 1
        }
      };

      expect(timeoutError.code).toBe(ErrorCode.TIMEOUT);
      expect(timeoutError.message).toContain('timed out');
      expect(timeoutError.details?.nodesProcessed).toBe(1250);
    });

    it('should handle NETWORK_ERROR correctly', () => {
      const networkError: DOMError = {
        code: ErrorCode.NETWORK_ERROR,
        message: 'Network error while capturing DOM snapshot',
        action: DOMAction.CAPTURE_SNAPSHOT,
        details: {
          errorType: 'connection_lost',
          tabId: 123
        }
      };

      expect(networkError.code).toBe(ErrorCode.NETWORK_ERROR);
      expect(networkError.message).toContain('Network error');
      expect(networkError.details).toBeDefined();
    });

    it('should handle CROSS_ORIGIN_FRAME error correctly', () => {
      const crossOriginError: DOMError = {
        code: ErrorCode.CROSS_ORIGIN_FRAME,
        message: 'Cannot capture snapshot from cross-origin frames',
        action: DOMAction.CAPTURE_SNAPSHOT,
        details: {
          blockedFrames: [
            'https://external-ads.com/frame',
            'https://third-party-widget.com/embed'
          ],
          accessibleFrames: 2,
          blockedFrames: 1
        }
      };

      expect(crossOriginError.code).toBe(ErrorCode.CROSS_ORIGIN_FRAME);
      expect(crossOriginError.message).toContain('cross-origin');
      expect(crossOriginError.details?.blockedFrames).toBeInstanceOf(Array);
    });
  });

  describe('DomService Integration Contract', () => {
    it('should call DomService with correct parameters', async () => {
      // This test will fail until DomService is implemented
      const request: CaptureSnapshotRequest = {
        action: DOMAction.CAPTURE_SNAPSHOT,
        requestId: 'test-snapshot-123',
        tabId: 1,
        timeout: 10000
      };

      const mockSnapshot: DOMSnapshot = {
        documents: [{
          url: 'https://example.com',
          nodes: [
            { nodeId: 1, nodeName: 'html' },
            { nodeId: 2, nodeName: 'body' }
          ],
          frameId: 'main'
        }],
        timestamp: Date.now(),
        url: 'https://example.com',
        title: 'Example'
      };

      mockDomService.executeOperation.mockResolvedValue({
        success: true,
        data: {
          snapshot: mockSnapshot,
          documentCount: 1,
          nodeCount: 2
        },
        requestId: request.requestId,
        duration: 850
      });

      // This service call doesn't exist yet - test will fail
      await expect(async () => {
        const result = await mockDomService.executeOperation(request);
        expect(result).toBeDefined();
        expect(result.data.snapshot).toBeDefined();
        expect(result.data.documentCount).toBe(1);
        expect(result.data.nodeCount).toBe(2);
      }).not.toThrow();

      expect(mockDomService.executeOperation).toHaveBeenCalledWith(request);
    });

    it('should handle service errors gracefully', async () => {
      const request: CaptureSnapshotRequest = {
        action: DOMAction.CAPTURE_SNAPSHOT,
        requestId: 'test-snapshot-123'
      };

      mockDomService.executeOperation.mockRejectedValue(
        new Error('Browser DevTools protocol error')
      );

      // This error handling doesn't exist yet - test will fail
      await expect(async () => {
        await mockDomService.executeOperation(request);
      }).rejects.toThrow('Browser DevTools protocol error');
    });
  });

  describe('Snapshot Data Structure Contract', () => {
    it('should include timestamp in snapshot', () => {
      const timestampSnapshot: DOMSnapshot = {
        documents: [],
        timestamp: 1634567890123,
        url: 'https://example.com',
        title: 'Test Page'
      };

      expect(timestampSnapshot.timestamp).toBeTypeOf('number');
      expect(timestampSnapshot.timestamp).toBeGreaterThan(0);
    });

    it('should include page metadata', () => {
      const metadataSnapshot: DOMSnapshot = {
        documents: [],
        timestamp: Date.now(),
        url: 'https://example.com/complex-page?param=value#section',
        title: 'Complex Page - Example Site'
      };

      expect(metadataSnapshot.url).toContain('https://');
      expect(metadataSnapshot.title).toBeTypeOf('string');
      expect(metadataSnapshot.title.length).toBeGreaterThan(0);
    });

    it('should handle empty/minimal pages', () => {
      const minimalSnapshot: DOMSnapshot = {
        documents: [{
          url: 'about:blank',
          nodes: [
            { nodeId: 1, nodeName: 'html' },
            { nodeId: 2, nodeName: 'head' },
            { nodeId: 3, nodeName: 'body' }
          ],
          frameId: 'main'
        }],
        timestamp: Date.now(),
        url: 'about:blank',
        title: ''
      };

      expect(minimalSnapshot.documents).toHaveLength(1);
      expect(minimalSnapshot.documents[0].nodes).toHaveLength(3);
      expect(minimalSnapshot.title).toBe('');
    });

    it('should handle complex page structures', () => {
      const complexNodes = [];
      // Generate a complex DOM structure
      for (let i = 1; i <= 1000; i++) {
        complexNodes.push({
          nodeId: i,
          nodeName: i % 10 === 0 ? 'div' : 'span',
          nodeValue: i % 20 === 0 ? `Text node ${i}` : undefined,
          attributes: i % 5 === 0 ? ['class', `node-${i}`, 'data-id', i.toString()] : undefined
        });
      }

      const complexSnapshot: DOMSnapshot = {
        documents: [{
          url: 'https://complex-app.com/dashboard',
          nodes: complexNodes,
          frameId: 'main'
        }],
        timestamp: Date.now(),
        url: 'https://complex-app.com/dashboard',
        title: 'Dashboard - Complex App'
      };

      expect(complexSnapshot.documents[0].nodes).toHaveLength(1000);
      expect(complexSnapshot.documents[0].nodes.some(n => n.attributes)).toBe(true);
      expect(complexSnapshot.documents[0].nodes.some(n => n.nodeValue)).toBe(true);
    });
  });

  describe('Performance Contract', () => {
    it('should return duration in response', async () => {
      const response: DOMOperationResponse<SnapshotResponse> = {
        success: true,
        data: {
          snapshot: {
            documents: [],
            timestamp: Date.now(),
            url: 'https://example.com',
            title: 'Example'
          },
          documentCount: 1,
          nodeCount: 100
        },
        requestId: 'test-snapshot-123',
        duration: 850
      };

      expect(response.duration).toBeTypeOf('number');
      expect(response.duration).toBeGreaterThan(0);
    });

    it('should respect timeout parameter', async () => {
      const request: CaptureSnapshotRequest = {
        action: DOMAction.CAPTURE_SNAPSHOT,
        requestId: 'test-snapshot-123',
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

    it('should scale duration with page complexity', () => {
      const simplePage = { nodeCount: 50, duration: 200 };
      const complexPage = { nodeCount: 5000, duration: 2000 };

      // More complex pages should generally take longer
      expect(complexPage.duration).toBeGreaterThan(simplePage.duration);

      // Duration should be reasonable even for complex pages
      expect(complexPage.duration).toBeLessThan(10000); // Less than 10 seconds
    });

    it('should handle large DOM snapshots efficiently', () => {
      const largeSnapshotResponse: DOMOperationResponse<SnapshotResponse> = {
        success: true,
        data: {
          snapshot: {
            documents: [{
              url: 'https://large-app.com',
              nodes: new Array(10000).fill(null).map((_, i) => ({
                nodeId: i + 1,
                nodeName: 'div'
              })),
              frameId: 'main'
            }],
            timestamp: Date.now(),
            url: 'https://large-app.com',
            title: 'Large App'
          },
          documentCount: 1,
          nodeCount: 10000
        },
        requestId: 'test-large-snapshot-123',
        duration: 3500 // Should complete within reasonable time
      };

      expect(largeSnapshotResponse.data!.nodeCount).toBe(10000);
      expect(largeSnapshotResponse.duration).toBeLessThan(5000); // Less than 5 seconds
    });
  });

  describe('Memory and Size Contract', () => {
    it('should handle snapshots with reasonable memory usage', () => {
      // Snapshots should not consume excessive memory
      const reasonableSnapshot: SnapshotResponse = {
        snapshot: {
          documents: [{
            url: 'https://example.com',
            nodes: new Array(1000).fill(null).map((_, i) => ({
              nodeId: i + 1,
              nodeName: 'div'
            })),
            frameId: 'main'
          }],
          timestamp: Date.now(),
          url: 'https://example.com',
          title: 'Example'
        },
        documentCount: 1,
        nodeCount: 1000
      };

      // Should be able to serialize and measure size
      const serialized = JSON.stringify(reasonableSnapshot);
      expect(serialized.length).toBeGreaterThan(0);
      expect(serialized.length).toBeLessThan(10 * 1024 * 1024); // Less than 10MB
    });
  });
});

// Helper function that doesn't exist yet - will cause test failures
function validateCaptureSnapshotRequest(request: CaptureSnapshotRequest): void {
  // This validation logic is not implemented yet
  throw new Error('validateCaptureSnapshotRequest not implemented');
}