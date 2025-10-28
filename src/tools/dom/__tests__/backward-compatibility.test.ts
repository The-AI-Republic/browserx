import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DomService } from '../DomService';
import type { SerializedDom, ActionResult } from '../types';

/**
 * T094: Backward Compatibility Verification Tests
 *
 * These tests ensure that the CDP-based implementation maintains the same
 * interface and behavior as the original content-script-based implementation.
 *
 * Key compatibility checks:
 * 1. SerializedDom structure matches expected format
 * 2. ActionResult structure matches expected format
 * 3. Node ID format is consistent
 * 4. Error messages follow established patterns
 * 5. LLM function interface remains unchanged
 */

describe('Backward Compatibility', () => {
  let mockTabId: number;

  beforeEach(() => {
    mockTabId = 123;

    // Mock chrome APIs
    global.chrome = {
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        sendCommand: vi.fn(),
        onEvent: { addListener: vi.fn() },
        onDetach: { addListener: vi.fn() }
      },
      tabs: {
        get: vi.fn().mockResolvedValue({
          id: mockTabId,
          url: 'https://example.com',
          title: 'Example Page',
          width: 1920,
          height: 1080
        }),
        sendMessage: vi.fn().mockResolvedValue(undefined)
      }
    } as any;
  });

  describe('SerializedDom Structure', () => {
    it('should maintain expected SerializedDom interface', async () => {
      const mockSnapshot = {
        root: {
          nodeId: 1,
          backendNodeId: 100,
          nodeType: 1,
          nodeName: 'HTML',
          localName: 'html',
          children: [
            {
              nodeId: 2,
              backendNodeId: 101,
              nodeType: 1,
              nodeName: 'BUTTON',
              localName: 'button',
              attributes: ['id', 'submit-btn', 'class', 'btn']
            }
          ]
        }
      };

      const sendCommand = vi.fn()
        .mockResolvedValueOnce(undefined) // DOM.enable
        .mockResolvedValueOnce(undefined) // Accessibility.enable
        .mockResolvedValueOnce({ root: mockSnapshot.root }) // DOM.getDocument
        .mockResolvedValueOnce(null); // Accessibility.getFullAXTree

      (global.chrome.debugger.sendCommand as any) = sendCommand;

      const service = await DomService.forTab(mockTabId);
      const serialized: SerializedDom = await service.getSerializedDom();

      // Verify top-level structure
      expect(serialized).toHaveProperty('page');
      expect(serialized.page).toHaveProperty('context');
      expect(serialized.page).toHaveProperty('body');
      expect(serialized.page).toHaveProperty('stats');

      // Verify context structure
      expect(serialized.page.context).toHaveProperty('url');
      expect(serialized.page.context).toHaveProperty('title');
      expect(serialized.page.context).toHaveProperty('viewport');
      expect(serialized.page.context.url).toBe('https://example.com');

      // Verify stats structure
      expect(serialized.page.stats).toHaveProperty('totalNodes');
      expect(serialized.page.stats).toHaveProperty('interactiveNodes');
      expect(serialized.page.stats).toHaveProperty('snapshotDuration');
      expect(typeof serialized.page.stats.totalNodes).toBe('number');
    });

    it('should serialize nodes with expected properties', async () => {
      const mockSnapshot = {
        root: {
          nodeId: 1,
          backendNodeId: 100,
          nodeType: 1,
          nodeName: 'BUTTON',
          localName: 'button',
          attributes: ['id', 'submit', 'aria-label', 'Submit Button']
        }
      };

      const sendCommand = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ root: mockSnapshot.root })
        .mockResolvedValueOnce({
          nodes: [{
            backendDOMNodeId: 100,
            role: { value: 'button' },
            name: { value: 'Submit Button' }
          }]
        });

      (global.chrome.debugger.sendCommand as any) = sendCommand;

      const service = await DomService.forTab(mockTabId);
      const serialized = await service.getSerializedDom();

      // Find button in tree
      const buttonNode = serialized.page.body;

      // Verify node structure
      expect(buttonNode).toHaveProperty('node_id');
      expect(buttonNode).toHaveProperty('tag');
      expect(buttonNode).toHaveProperty('role');
      expect(typeof buttonNode.node_id).toBe('number');
      expect(buttonNode.tag).toBe('button');
    });
  });

  describe('ActionResult Structure', () => {
    it('should maintain expected ActionResult interface', async () => {
      const mockSnapshot = {
        root: {
          nodeId: 1,
          backendNodeId: 100,
          nodeType: 1,
          nodeName: 'BUTTON',
          localName: 'button'
        }
      };

      const sendCommand = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ root: mockSnapshot.root })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ // getBoxModel
          model: {
            content: [100, 100, 200, 100, 200, 200, 100, 200]
          }
        })
        .mockResolvedValueOnce(undefined) // scrollIntoViewIfNeeded
        .mockResolvedValueOnce(undefined) // mousePressed
        .mockResolvedValueOnce(undefined); // mouseReleased

      (global.chrome.debugger.sendCommand as any) = sendCommand;

      const service = await DomService.forTab(mockTabId);
      await service.buildSnapshot();

      const result: ActionResult = await service.click(1);

      // Verify required properties
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('actionType');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('changes');
      expect(result).toHaveProperty('nodeId');

      // Verify types
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.duration).toBe('number');
      expect(typeof result.actionType).toBe('string');
      expect(typeof result.timestamp).toBe('string');

      // Verify changes structure
      expect(result.changes).toHaveProperty('navigationOccurred');
      expect(result.changes).toHaveProperty('domMutations');
      expect(result.changes).toHaveProperty('scrollChanged');
      expect(result.changes).toHaveProperty('valueChanged');
    });

    it('should include error message on failure', async () => {
      const mockSnapshot = {
        root: {
          nodeId: 1,
          backendNodeId: 100,
          nodeType: 1,
          nodeName: 'BUTTON'
        }
      };

      const sendCommand = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ root: mockSnapshot.root })
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('Element not found'));

      (global.chrome.debugger.sendCommand as any) = sendCommand;

      const service = await DomService.forTab(mockTabId);
      await service.buildSnapshot();

      const result = await service.click(1);

      expect(result.success).toBe(false);
      expect(result).toHaveProperty('error');
      expect(typeof result.error).toBe('string');
      expect(result.error).toBeTruthy();
    });
  });

  describe('Node ID Format', () => {
    it('should use numeric node IDs', async () => {
      const mockSnapshot = {
        root: {
          nodeId: 1,
          backendNodeId: 100,
          nodeType: 1,
          nodeName: 'HTML',
          children: [
            {
              nodeId: 2,
              backendNodeId: 101,
              nodeType: 1,
              nodeName: 'DIV'
            }
          ]
        }
      };

      const sendCommand = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ root: mockSnapshot.root })
        .mockResolvedValueOnce(null);

      (global.chrome.debugger.sendCommand as any) = sendCommand;

      const service = await DomService.forTab(mockTabId);
      const serialized = await service.getSerializedDom();

      // Node IDs should be numbers (CDP nodeId)
      expect(typeof serialized.page.body.node_id).toBe('number');
    });
  });

  describe('Error Messages', () => {
    it('should use consistent error code format', async () => {
      (global.chrome.debugger.attach as any).mockRejectedValueOnce(
        new Error('Cannot attach to this target because it already attached')
      );

      try {
        await DomService.forTab(mockTabId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Error code should be at start, followed by colon
        expect(error.message).toMatch(/^[A-Z_]+:/);
        expect(error.message).toContain('ALREADY_ATTACHED');
      }
    });

    it('should provide actionable error messages', async () => {
      (global.chrome.debugger.attach as any).mockRejectedValueOnce(
        new Error('Cannot attach to this target because it already attached')
      );

      try {
        await DomService.forTab(mockTabId);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        // Error should explain what to do
        expect(error.message.toLowerCase()).toContain('devtools');
        expect(error.message.toLowerCase()).toContain('close');
      }
    });
  });

  describe('LLM Function Interface', () => {
    it('should maintain getSerializedDom() method signature', async () => {
      const mockSnapshot = {
        root: {
          nodeId: 1,
          backendNodeId: 100,
          nodeType: 1,
          nodeName: 'HTML'
        }
      };

      const sendCommand = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ root: mockSnapshot.root })
        .mockResolvedValueOnce(null);

      (global.chrome.debugger.sendCommand as any) = sendCommand;

      const service = await DomService.forTab(mockTabId);

      // Method should exist and be callable
      expect(service.getSerializedDom).toBeDefined();
      expect(typeof service.getSerializedDom).toBe('function');

      // Should return SerializedDom
      const result = await service.getSerializedDom();
      expect(result).toHaveProperty('page');
    });

    it('should maintain action method signatures', async () => {
      const service = await DomService.forTab(mockTabId);

      // All action methods should exist
      expect(service.click).toBeDefined();
      expect(service.type).toBeDefined();
      expect(service.scroll).toBeDefined();
      expect(service.keypress).toBeDefined();

      // Check function signatures
      expect(typeof service.click).toBe('function');
      expect(typeof service.type).toBe('function');
      expect(typeof service.scroll).toBe('function');
      expect(typeof service.keypress).toBe('function');
    });
  });

  describe('Snapshot Caching Behavior', () => {
    it('should cache snapshots between calls', async () => {
      const mockSnapshot = {
        root: {
          nodeId: 1,
          backendNodeId: 100,
          nodeType: 1,
          nodeName: 'HTML'
        }
      };

      const sendCommand = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ root: mockSnapshot.root })
        .mockResolvedValueOnce(null);

      (global.chrome.debugger.sendCommand as any) = sendCommand;

      const service = await DomService.forTab(mockTabId);

      // First call builds snapshot
      await service.getSerializedDom();

      // Second call should use cache (sendCommand not called again)
      await service.getSerializedDom();

      // Should only have called sendCommand for initial setup + first snapshot
      expect(sendCommand).toHaveBeenCalledTimes(4); // DOM.enable, Accessibility.enable, getDocument, getFullAXTree
    });

    it('should invalidate cache after actions', async () => {
      const mockSnapshot = {
        root: {
          nodeId: 1,
          backendNodeId: 100,
          nodeType: 1,
          nodeName: 'BUTTON'
        }
      };

      const sendCommand = vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ root: mockSnapshot.root })
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ model: { content: [100, 100, 200, 100, 200, 200, 100, 200] } })
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);

      (global.chrome.debugger.sendCommand as any) = sendCommand;

      const service = await DomService.forTab(mockTabId);
      await service.buildSnapshot();

      const snapshot1 = service.getCurrentSnapshot();

      // Perform action
      await service.click(1);

      // Snapshot should be invalidated
      const snapshot2 = service.getCurrentSnapshot();
      expect(snapshot2).toBeNull();
    });
  });
});
