import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MessageType,
  BaseMessage,
  DOMActionMessage,
  DOMResponseMessage,
  MessageSource,
  MessageHandler,
  MessageRouter,
  MessageErrorCode
} from '../../../../specs/001-dom-tool-integration/contracts/message-protocol';

describe('DOM Action Message Contract Tests', () => {
  let mockRouter: MessageRouter;
  let mockHandler: MessageHandler<DOMActionMessage>;
  let mockSender: chrome.runtime.MessageSender;

  beforeEach(() => {
    // Mock Chrome runtime sender
    mockSender = {
      tab: { id: 123, url: 'https://example.com', active: true },
      frameId: 0,
      url: 'https://example.com',
      id: 'extension-id'
    } as chrome.runtime.MessageSender;

    // Mock message handler
    mockHandler = {
      handle: vi.fn(),
      canHandle: vi.fn()
    };

    // Mock message router
    mockRouter = {
      registerHandler: vi.fn(),
      unregisterHandler: vi.fn(),
      route: vi.fn()
    };
  });

  describe('DOMActionMessage Structure', () => {
    it('should create valid DOM action message', () => {
      const message: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: {
          context: 'background',
          tabId: 123,
          frameId: 0,
          url: 'https://example.com'
        },
        requestId: 'req-123',
        action: 'click',
        data: { selector: '#button' },
        options: {
          timeout: 5000,
          retries: 3
        }
      };

      expect(message.type).toBe(MessageType.DOM_ACTION);
      expect(message.action).toBe('click');
      expect(message.data).toHaveProperty('selector');
      expect(message.options?.timeout).toBe(5000);
    });

    it('should validate required fields', () => {
      const invalidMessage = {
        type: MessageType.DOM_ACTION,
        // Missing required fields
      };

      // Test validation function
      const isValid = (msg: any): msg is DOMActionMessage => {
        return msg.type === MessageType.DOM_ACTION &&
               msg.timestamp !== undefined &&
               msg.source !== undefined &&
               msg.action !== undefined &&
               msg.data !== undefined;
      };

      expect(isValid(invalidMessage)).toBe(false);
    });

    it('should handle optional request ID', () => {
      const message: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123
        },
        action: 'query',
        data: { selector: 'div' }
        // requestId is optional
      };

      expect(message.requestId).toBeUndefined();
      expect(message.type).toBe(MessageType.DOM_ACTION);
    });
  });

  describe('DOMResponseMessage Structure', () => {
    it('should create successful response message', () => {
      const response: DOMResponseMessage = {
        type: MessageType.DOM_RESPONSE,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123,
          frameId: 0
        },
        requestId: 'req-123',
        success: true,
        data: {
          elements: [],
          count: 0
        }
      };

      expect(response.type).toBe(MessageType.DOM_RESPONSE);
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.error).toBeUndefined();
    });

    it('should create error response message', () => {
      const response: DOMResponseMessage = {
        type: MessageType.DOM_RESPONSE,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123
        },
        requestId: 'req-123',
        success: false,
        error: {
          code: 'ELEMENT_NOT_FOUND',
          message: 'No elements matching selector'
        }
      };

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
      expect(response.error?.code).toBe('ELEMENT_NOT_FOUND');
      expect(response.data).toBeUndefined();
    });
  });

  describe('Message Source Validation', () => {
    it('should validate background source', () => {
      const source: MessageSource = {
        context: 'background',
        tabId: 123
      };

      expect(source.context).toBe('background');
      expect(source.tabId).toBeDefined();
    });

    it('should validate content script source', () => {
      const source: MessageSource = {
        context: 'content',
        tabId: 123,
        frameId: 0,
        url: 'https://example.com'
      };

      expect(source.context).toBe('content');
      expect(source.frameId).toBeDefined();
      expect(source.url).toBeDefined();
    });

    it('should validate popup source', () => {
      const source: MessageSource = {
        context: 'popup'
      };

      expect(source.context).toBe('popup');
      expect(source.tabId).toBeUndefined();
    });

    it('should validate devtools source', () => {
      const source: MessageSource = {
        context: 'devtools',
        tabId: 123
      };

      expect(source.context).toBe('devtools');
      expect(source.tabId).toBeDefined();
    });
  });

  describe('Message Handler Integration', () => {
    it('should handle DOM action message', async () => {
      const message: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        action: 'click',
        data: { selector: '#button' }
      };

      mockHandler.canHandle.mockReturnValue(true);
      mockHandler.handle.mockResolvedValue({ success: true });

      const canHandle = mockHandler.canHandle(message);
      const result = await mockHandler.handle(message, mockSender);

      expect(canHandle).toBe(true);
      expect(mockHandler.handle).toHaveBeenCalledWith(message, mockSender);
      expect(result).toHaveProperty('success');
    });

    it('should reject invalid message type', () => {
      const message: BaseMessage = {
        type: MessageType.PING,
        timestamp: Date.now(),
        source: { context: 'background' }
      };

      mockHandler.canHandle.mockReturnValue(false);

      const canHandle = mockHandler.canHandle(message);
      expect(canHandle).toBe(false);
    });
  });

  describe('Message Router Integration', () => {
    it('should register handler for DOM_ACTION type', () => {
      mockRouter.registerHandler(MessageType.DOM_ACTION, mockHandler);

      expect(mockRouter.registerHandler).toHaveBeenCalledWith(
        MessageType.DOM_ACTION,
        mockHandler
      );
    });

    it('should route DOM action message to handler', async () => {
      const message: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        action: 'query',
        data: { selector: 'button' }
      };

      mockRouter.route.mockResolvedValue({ success: true });

      const result = await mockRouter.route(message, mockSender);

      expect(mockRouter.route).toHaveBeenCalledWith(message, mockSender);
      expect(result).toHaveProperty('success');
    });

    it('should handle routing errors', async () => {
      const message: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        action: 'invalid',
        data: {}
      };

      mockRouter.route.mockRejectedValue(new Error('Handler not found'));

      await expect(mockRouter.route(message, mockSender))
        .rejects.toThrow('Handler not found');
    });

    it('should unregister handler', () => {
      mockRouter.unregisterHandler(MessageType.DOM_ACTION);

      expect(mockRouter.unregisterHandler).toHaveBeenCalledWith(
        MessageType.DOM_ACTION
      );
    });
  });

  describe('Message Options Validation', () => {
    it('should validate timeout option', () => {
      const message: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        action: 'waitForElement',
        data: { selector: '#async-element' },
        options: {
          timeout: 10000,
          retries: 0
        }
      };

      expect(message.options?.timeout).toBe(10000);
      expect(message.options?.timeout).toBeGreaterThan(0);
      expect(message.options?.timeout).toBeLessThanOrEqual(30000);
    });

    it('should validate retries option', () => {
      const message: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        action: 'click',
        data: { selector: '#button' },
        options: {
          retries: 3
        }
      };

      expect(message.options?.retries).toBe(3);
      expect(message.options?.retries).toBeGreaterThanOrEqual(0);
      expect(message.options?.retries).toBeLessThanOrEqual(5);
    });
  });

  describe('Request ID Tracking', () => {
    it('should generate unique request IDs', () => {
      const requestIds = new Set<string>();

      for (let i = 0; i < 10; i++) {
        const message: DOMActionMessage = {
          type: MessageType.DOM_ACTION,
          timestamp: Date.now(),
          source: { context: 'background', tabId: 123 },
          requestId: `req-${Date.now()}-${Math.random()}`,
          action: 'query',
          data: { selector: 'div' }
        };

        requestIds.add(message.requestId!);
      }

      expect(requestIds.size).toBe(10);
    });

    it('should match request and response IDs', () => {
      const requestId = 'req-unique-123';

      const request: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        requestId,
        action: 'click',
        data: { selector: '#button' }
      };

      const response: DOMResponseMessage = {
        type: MessageType.DOM_RESPONSE,
        timestamp: Date.now(),
        source: { context: 'content', tabId: 123 },
        requestId,
        success: true,
        data: { clicked: true }
      };

      expect(request.requestId).toBe(response.requestId);
    });
  });

  describe('Error Code Validation', () => {
    it('should handle all message error codes', () => {
      const errorCodes = [
        MessageErrorCode.INVALID_MESSAGE,
        MessageErrorCode.HANDLER_NOT_FOUND,
        MessageErrorCode.TAB_NOT_FOUND,
        MessageErrorCode.FRAME_NOT_FOUND,
        MessageErrorCode.SCRIPT_INJECTION_FAILED,
        MessageErrorCode.TIMEOUT,
        MessageErrorCode.PERMISSION_DENIED
      ];

      errorCodes.forEach(code => {
        const response: DOMResponseMessage = {
          type: MessageType.DOM_RESPONSE,
          timestamp: Date.now(),
          source: { context: 'content', tabId: 123 },
          success: false,
          error: {
            code,
            message: `Error: ${code}`
          }
        };

        expect(response.error?.code).toBe(code);
        expect(Object.values(MessageErrorCode)).toContain(code);
      });
    });
  });

  describe('Message Timestamp Validation', () => {
    it('should include valid timestamp', () => {
      const before = Date.now();
      const message: DOMActionMessage = {
        type: MessageType.DOM_ACTION,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        action: 'query',
        data: { selector: 'div' }
      };
      const after = Date.now();

      expect(message.timestamp).toBeGreaterThanOrEqual(before);
      expect(message.timestamp).toBeLessThanOrEqual(after);
    });

    it('should order messages by timestamp', () => {
      const messages: DOMActionMessage[] = [];

      for (let i = 0; i < 5; i++) {
        messages.push({
          type: MessageType.DOM_ACTION,
          timestamp: Date.now() + i * 100,
          source: { context: 'background', tabId: 123 },
          action: 'query',
          data: { selector: 'div' }
        });
      }

      for (let i = 1; i < messages.length; i++) {
        expect(messages[i].timestamp).toBeGreaterThan(messages[i - 1].timestamp);
      }
    });
  });
});