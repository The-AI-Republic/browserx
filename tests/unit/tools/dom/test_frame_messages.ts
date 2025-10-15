import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MessageType,
  BaseMessage,
  FrameMessage,
  BroadcastMessage,
  FrameNavigatedMessage,
  MessageSource,
  BackgroundScriptAPI,
  MessageErrorCode
} from '../../../../specs/001-dom-tool-integration/contracts/message-protocol';

describe('Frame Messaging Contract Tests', () => {
  let mockBackgroundAPI: BackgroundScriptAPI;
  let mockSender: chrome.runtime.MessageSender;

  beforeEach(() => {
    // Mock Chrome runtime sender
    mockSender = {
      tab: { id: 123, url: 'https://example.com', active: true },
      frameId: 0,
      url: 'https://example.com',
      id: 'extension-id'
    } as chrome.runtime.MessageSender;

    // Mock Background Script API
    mockBackgroundAPI = {
      sendToTab: vi.fn(),
      sendToFrame: vi.fn(),
      broadcast: vi.fn(),
      executeScript: vi.fn(),
      injectContentScript: vi.fn()
    };
  });

  describe('Frame Message Structure', () => {
    it('should create valid frame message', () => {
      const frameMessage: FrameMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: {
          context: 'background',
          tabId: 123
        },
        targetFrameId: 'frame-456',
        payload: {
          action: 'click',
          selector: '#button'
        }
      };

      expect(frameMessage.type).toBe(MessageType.FRAME_MESSAGE);
      expect(frameMessage.targetFrameId).toBe('frame-456');
      expect(frameMessage.payload).toHaveProperty('action');
    });

    it('should validate required frame ID', () => {
      const isValidFrameMessage = (msg: any): msg is FrameMessage => {
        return msg.type === MessageType.FRAME_MESSAGE &&
               msg.targetFrameId !== undefined &&
               msg.payload !== undefined;
      };

      const invalidMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'background' },
        // Missing targetFrameId
        payload: {}
      };

      expect(isValidFrameMessage(invalidMessage)).toBe(false);
    });

    it('should handle nested frame targeting', () => {
      const nestedFrameMessage: FrameMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: {
          context: 'background',
          tabId: 123
        },
        targetFrameId: 'parent.child.grandchild',
        payload: {
          action: 'query',
          selector: 'iframe'
        }
      };

      expect(nestedFrameMessage.targetFrameId).toContain('.');
      const framePath = nestedFrameMessage.targetFrameId.split('.');
      expect(framePath).toHaveLength(3);
    });
  });

  describe('Broadcast Message Structure', () => {
    it('should create valid broadcast message', () => {
      const broadcastMessage: BroadcastMessage = {
        type: MessageType.BROADCAST_MESSAGE,
        timestamp: Date.now(),
        source: {
          context: 'background'
        },
        includeFrames: true,
        payload: {
          command: 'refresh',
          data: { force: true }
        }
      };

      expect(broadcastMessage.type).toBe(MessageType.BROADCAST_MESSAGE);
      expect(broadcastMessage.includeFrames).toBe(true);
      expect(broadcastMessage.payload).toHaveProperty('command');
    });

    it('should handle broadcast without frames', () => {
      const broadcastMessage: BroadcastMessage = {
        type: MessageType.BROADCAST_MESSAGE,
        timestamp: Date.now(),
        source: {
          context: 'background'
        },
        includeFrames: false,
        payload: {
          notification: 'update'
        }
      };

      expect(broadcastMessage.includeFrames).toBe(false);
    });

    it('should validate broadcast payload', () => {
      const broadcastMessage: BroadcastMessage = {
        type: MessageType.BROADCAST_MESSAGE,
        timestamp: Date.now(),
        source: {
          context: 'popup'
        },
        includeFrames: true,
        payload: {
          type: 'state-change',
          state: {
            enabled: true,
            mode: 'active'
          }
        }
      };

      expect(broadcastMessage.payload).toBeDefined();
      expect(broadcastMessage.payload.type).toBe('state-change');
      expect(broadcastMessage.payload.state).toHaveProperty('enabled');
    });
  });

  describe('Frame Navigation Events', () => {
    it('should create frame navigated message', () => {
      const navigatedMessage: FrameNavigatedMessage = {
        type: MessageType.FRAME_NAVIGATED,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123,
          frameId: 1
        },
        frameId: 'frame-1',
        url: 'https://example.com/page2',
        parentFrameId: 'frame-0'
      };

      expect(navigatedMessage.type).toBe(MessageType.FRAME_NAVIGATED);
      expect(navigatedMessage.frameId).toBe('frame-1');
      expect(navigatedMessage.url).toBe('https://example.com/page2');
      expect(navigatedMessage.parentFrameId).toBe('frame-0');
    });

    it('should handle top-level frame navigation', () => {
      const topFrameNavigated: FrameNavigatedMessage = {
        type: MessageType.FRAME_NAVIGATED,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123,
          frameId: 0
        },
        frameId: 'frame-0',
        url: 'https://example.com/new'
        // No parentFrameId for top frame
      };

      expect(topFrameNavigated.parentFrameId).toBeUndefined();
      expect(topFrameNavigated.frameId).toBe('frame-0');
    });

    it('should track navigation history', () => {
      const navigations: FrameNavigatedMessage[] = [
        {
          type: MessageType.FRAME_NAVIGATED,
          timestamp: Date.now(),
          source: { context: 'content', tabId: 123, frameId: 1 },
          frameId: 'frame-1',
          url: 'https://example.com/page1'
        },
        {
          type: MessageType.FRAME_NAVIGATED,
          timestamp: Date.now() + 1000,
          source: { context: 'content', tabId: 123, frameId: 1 },
          frameId: 'frame-1',
          url: 'https://example.com/page2'
        },
        {
          type: MessageType.FRAME_NAVIGATED,
          timestamp: Date.now() + 2000,
          source: { context: 'content', tabId: 123, frameId: 1 },
          frameId: 'frame-1',
          url: 'https://example.com/page3'
        }
      ];

      // Verify navigation sequence
      for (let i = 1; i < navigations.length; i++) {
        expect(navigations[i].timestamp).toBeGreaterThan(navigations[i - 1].timestamp);
        expect(navigations[i].frameId).toBe(navigations[i - 1].frameId);
      }
    });
  });

  describe('Frame Targeting', () => {
    it('should send message to specific frame', async () => {
      const frameMessage: FrameMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        targetFrameId: 'frame-1',
        payload: { action: 'highlight' }
      };

      mockBackgroundAPI.sendToFrame.mockResolvedValue({ success: true });

      const result = await mockBackgroundAPI.sendToFrame(
        123,
        1,
        frameMessage
      );

      expect(result.success).toBe(true);
      expect(mockBackgroundAPI.sendToFrame).toHaveBeenCalledWith(123, 1, frameMessage);
    });

    it('should handle frame not found error', async () => {
      const frameMessage: FrameMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        targetFrameId: 'non-existent-frame',
        payload: {}
      };

      mockBackgroundAPI.sendToFrame.mockRejectedValue({
        code: MessageErrorCode.FRAME_NOT_FOUND,
        message: 'Frame not found: non-existent-frame'
      });

      await expect(mockBackgroundAPI.sendToFrame(123, 999, frameMessage))
        .rejects.toMatchObject({
          code: MessageErrorCode.FRAME_NOT_FOUND
        });
    });

    it('should handle cross-origin frame restrictions', async () => {
      const frameMessage: FrameMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        targetFrameId: 'cross-origin-frame',
        payload: { action: 'read' }
      };

      mockBackgroundAPI.sendToFrame.mockRejectedValue({
        code: MessageErrorCode.PERMISSION_DENIED,
        message: 'Cannot access cross-origin frame'
      });

      await expect(mockBackgroundAPI.sendToFrame(123, 2, frameMessage))
        .rejects.toMatchObject({
          code: MessageErrorCode.PERMISSION_DENIED
        });
    });
  });

  describe('Broadcast Operations', () => {
    it('should broadcast to all tabs', async () => {
      const broadcastMessage: BroadcastMessage = {
        type: MessageType.BROADCAST_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'background' },
        includeFrames: false,
        payload: { update: 'config' }
      };

      mockBackgroundAPI.broadcast.mockResolvedValue(undefined);

      await mockBackgroundAPI.broadcast(broadcastMessage);

      expect(mockBackgroundAPI.broadcast).toHaveBeenCalledWith(broadcastMessage);
    });

    it('should broadcast to all frames in all tabs', async () => {
      const broadcastMessage: BroadcastMessage = {
        type: MessageType.BROADCAST_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'background' },
        includeFrames: true,
        payload: { command: 'reset' }
      };

      mockBackgroundAPI.broadcast.mockResolvedValue(undefined);

      await mockBackgroundAPI.broadcast(
        broadcastMessage,
        tab => tab.active === true
      );

      expect(mockBackgroundAPI.broadcast).toHaveBeenCalled();
      expect(broadcastMessage.includeFrames).toBe(true);
    });

    it('should filter broadcast recipients', async () => {
      const broadcastMessage: BroadcastMessage = {
        type: MessageType.BROADCAST_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'popup' },
        includeFrames: false,
        payload: { notification: 'test' }
      };

      const filterFn = (tab: chrome.tabs.Tab) => {
        return tab.url?.startsWith('https://') === true;
      };

      mockBackgroundAPI.broadcast.mockResolvedValue(undefined);

      await mockBackgroundAPI.broadcast(broadcastMessage, filterFn);

      expect(mockBackgroundAPI.broadcast).toHaveBeenCalledWith(
        broadcastMessage,
        expect.any(Function)
      );
    });
  });

  describe('Frame Hierarchy', () => {
    it('should handle frame parent-child relationships', () => {
      interface FrameInfo {
        frameId: string;
        parentFrameId?: string;
        depth: number;
      }

      const frames: FrameInfo[] = [
        { frameId: 'frame-0', depth: 0 },
        { frameId: 'frame-1', parentFrameId: 'frame-0', depth: 1 },
        { frameId: 'frame-2', parentFrameId: 'frame-1', depth: 2 },
        { frameId: 'frame-3', parentFrameId: 'frame-0', depth: 1 }
      ];

      // Build frame tree
      const getFrameChildren = (parentId: string): FrameInfo[] => {
        return frames.filter(f => f.parentFrameId === parentId);
      };

      const topFrameChildren = getFrameChildren('frame-0');
      expect(topFrameChildren).toHaveLength(2);
      expect(topFrameChildren.map(f => f.frameId)).toContain('frame-1');
      expect(topFrameChildren.map(f => f.frameId)).toContain('frame-3');
    });

    it('should calculate frame depth', () => {
      const calculateDepth = (frameId: string, frames: Map<string, string>): number => {
        let depth = 0;
        let currentFrame = frameId;

        while (frames.has(currentFrame)) {
          currentFrame = frames.get(currentFrame)!;
          depth++;
        }

        return depth;
      };

      const frameParents = new Map<string, string>([
        ['frame-1', 'frame-0'],
        ['frame-2', 'frame-1'],
        ['frame-3', 'frame-2']
      ]);

      expect(calculateDepth('frame-1', frameParents)).toBe(1);
      expect(calculateDepth('frame-2', frameParents)).toBe(2);
      expect(calculateDepth('frame-3', frameParents)).toBe(3);
    });

    it('should detect circular frame references', () => {
      const detectCircular = (frames: Map<string, string>): boolean => {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        const hasCycle = (frame: string): boolean => {
          if (recursionStack.has(frame)) return true;
          if (visited.has(frame)) return false;

          visited.add(frame);
          recursionStack.add(frame);

          const parent = frames.get(frame);
          if (parent && hasCycle(parent)) return true;

          recursionStack.delete(frame);
          return false;
        };

        for (const frame of frames.keys()) {
          if (hasCycle(frame)) return true;
        }

        return false;
      };

      const validFrames = new Map([
        ['frame-1', 'frame-0'],
        ['frame-2', 'frame-1']
      ]);

      const circularFrames = new Map([
        ['frame-1', 'frame-2'],
        ['frame-2', 'frame-1']
      ]);

      expect(detectCircular(validFrames)).toBe(false);
      expect(detectCircular(circularFrames)).toBe(true);
    });
  });

  describe('Frame Isolation', () => {
    it('should respect same-origin policy', () => {
      const canAccessFrame = (frameOrigin: string, parentOrigin: string): boolean => {
        try {
          const frameUrl = new URL(frameOrigin);
          const parentUrl = new URL(parentOrigin);
          return frameUrl.origin === parentUrl.origin;
        } catch {
          return false;
        }
      };

      expect(canAccessFrame('https://example.com/page', 'https://example.com/')).toBe(true);
      expect(canAccessFrame('https://other.com/page', 'https://example.com/')).toBe(false);
      expect(canAccessFrame('http://example.com/', 'https://example.com/')).toBe(false);
    });

    it('should handle sandboxed frames', () => {
      interface SandboxedFrame {
        frameId: string;
        sandboxFlags: string[];
      }

      const frame: SandboxedFrame = {
        frameId: 'sandboxed-frame',
        sandboxFlags: ['allow-scripts', 'allow-same-origin']
      };

      const canExecuteScript = (f: SandboxedFrame): boolean => {
        return f.sandboxFlags.includes('allow-scripts');
      };

      const canAccessParent = (f: SandboxedFrame): boolean => {
        return f.sandboxFlags.includes('allow-same-origin');
      };

      expect(canExecuteScript(frame)).toBe(true);
      expect(canAccessParent(frame)).toBe(true);

      const restrictedFrame: SandboxedFrame = {
        frameId: 'restricted-frame',
        sandboxFlags: []
      };

      expect(canExecuteScript(restrictedFrame)).toBe(false);
      expect(canAccessParent(restrictedFrame)).toBe(false);
    });
  });

  describe('Frame Communication Patterns', () => {
    it('should implement request-response pattern', async () => {
      const request: FrameMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        targetFrameId: 'frame-1',
        requestId: 'req-123',
        payload: { query: 'status' }
      };

      const response: BaseMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now() + 10,
        source: { context: 'content', tabId: 123, frameId: 1 },
        requestId: 'req-123'
      };

      expect(request.requestId).toBe(response.requestId);
    });

    it('should support frame-to-frame messaging', () => {
      const message: FrameMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123,
          frameId: 1
        },
        targetFrameId: 'frame-2',
        payload: {
          type: 'peer-message',
          data: 'Hello from frame 1'
        }
      };

      expect(message.source.frameId).toBe(1);
      expect(message.targetFrameId).toBe('frame-2');
    });

    it('should handle frame message timeouts', async () => {
      const frameMessage: FrameMessage = {
        type: MessageType.FRAME_MESSAGE,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        targetFrameId: 'slow-frame',
        payload: { action: 'complex-operation' }
      };

      mockBackgroundAPI.sendToFrame.mockRejectedValue({
        code: MessageErrorCode.TIMEOUT,
        message: 'Frame did not respond within timeout'
      });

      await expect(mockBackgroundAPI.sendToFrame(123, 1, frameMessage))
        .rejects.toMatchObject({
          code: MessageErrorCode.TIMEOUT
        });
    });
  });
});