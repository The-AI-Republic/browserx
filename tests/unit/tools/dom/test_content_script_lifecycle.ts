import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MessageType,
  PingMessage,
  PongMessage,
  InjectScriptMessage,
  ScriptReadyMessage,
  TabReadyMessage,
  TabUnloadMessage,
  ContentScriptAPI,
  BackgroundScriptAPI,
  MessageErrorCode
} from '../../../../specs/001-dom-tool-integration/contracts/message-protocol';

describe('Content Script Lifecycle Contract Tests', () => {
  let mockContentScriptAPI: ContentScriptAPI;
  let mockBackgroundScriptAPI: BackgroundScriptAPI;
  let mockTab: chrome.tabs.Tab;

  beforeEach(() => {
    // Mock Chrome Tab
    mockTab = {
      id: 123,
      url: 'https://example.com',
      active: true,
      title: 'Test Page'
    } as chrome.tabs.Tab;

    // Mock Content Script API
    mockContentScriptAPI = {
      querySelector: vi.fn(),
      querySelectorAll: vi.fn(),
      click: vi.fn(),
      type: vi.fn(),
      focus: vi.fn(),
      scroll: vi.fn(),
      getAttribute: vi.fn(),
      setAttribute: vi.fn(),
      getText: vi.fn(),
      getHTML: vi.fn(),
      waitForElement: vi.fn(),
      isVisible: vi.fn(),
      isEnabled: vi.fn()
    };

    // Mock Background Script API
    mockBackgroundScriptAPI = {
      sendToTab: vi.fn(),
      sendToFrame: vi.fn(),
      broadcast: vi.fn(),
      executeScript: vi.fn(),
      injectContentScript: vi.fn()
    };
  });

  describe('Ping/Pong Protocol', () => {
    it('should create valid ping message', () => {
      const ping: PingMessage = {
        type: MessageType.PING,
        timestamp: Date.now(),
        source: {
          context: 'background',
          tabId: 123
        }
      };

      expect(ping.type).toBe(MessageType.PING);
      expect(ping.source.context).toBe('background');
      expect(ping.timestamp).toBeDefined();
    });

    it('should create valid pong response', () => {
      const pong: PongMessage = {
        type: MessageType.PONG,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123,
          frameId: 0,
          url: 'https://example.com'
        },
        version: '1.0.0',
        capabilities: ['dom', 'events', 'storage']
      };

      expect(pong.type).toBe(MessageType.PONG);
      expect(pong.version).toBe('1.0.0');
      expect(pong.capabilities).toContain('dom');
      expect(pong.capabilities).toHaveLength(3);
    });

    it('should validate ping-pong round trip', async () => {
      // Simulate ping from background
      const ping: PingMessage = {
        type: MessageType.PING,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 },
        requestId: 'ping-123'
      };

      // Mock content script response
      mockBackgroundScriptAPI.sendToTab.mockResolvedValue({
        type: MessageType.PONG,
        timestamp: Date.now(),
        source: { context: 'content', tabId: 123, frameId: 0 },
        requestId: 'ping-123',
        version: '1.0.0',
        capabilities: ['dom']
      });

      const response = await mockBackgroundScriptAPI.sendToTab(123, ping);

      expect(response.type).toBe(MessageType.PONG);
      expect(response.requestId).toBe(ping.requestId);
      expect(response.version).toBeDefined();
    });

    it('should handle ping timeout', async () => {
      const ping: PingMessage = {
        type: MessageType.PING,
        timestamp: Date.now(),
        source: { context: 'background', tabId: 123 }
      };

      mockBackgroundScriptAPI.sendToTab.mockRejectedValue({
        code: MessageErrorCode.TIMEOUT,
        message: 'Content script did not respond'
      });

      await expect(mockBackgroundScriptAPI.sendToTab(123, ping))
        .rejects.toMatchObject({
          code: MessageErrorCode.TIMEOUT
        });
    });

    it('should validate capabilities list', () => {
      const validCapabilities = [
        'dom',
        'events',
        'storage',
        'messaging',
        'observers',
        'xhr',
        'websocket'
      ];

      const pong: PongMessage = {
        type: MessageType.PONG,
        timestamp: Date.now(),
        source: { context: 'content', tabId: 123 },
        version: '1.0.0',
        capabilities: validCapabilities
      };

      pong.capabilities.forEach(capability => {
        expect(validCapabilities).toContain(capability);
      });
    });
  });

  describe('Script Injection', () => {
    it('should create inject script message', () => {
      const injectMessage: InjectScriptMessage = {
        type: MessageType.INJECT_SCRIPT,
        timestamp: Date.now(),
        source: { context: 'background' },
        script: 'console.log("Injected");',
        runAt: 'document_idle'
      };

      expect(injectMessage.type).toBe(MessageType.INJECT_SCRIPT);
      expect(injectMessage.script).toBeDefined();
      expect(['document_start', 'document_end', 'document_idle'])
        .toContain(injectMessage.runAt);
    });

    it('should handle script ready confirmation', () => {
      const readyMessage: ScriptReadyMessage = {
        type: MessageType.SCRIPT_READY,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123,
          frameId: 0
        },
        scriptId: 'script-abc-123'
      };

      expect(readyMessage.type).toBe(MessageType.SCRIPT_READY);
      expect(readyMessage.scriptId).toBe('script-abc-123');
    });

    it('should validate injection timing options', () => {
      const timings: Array<'document_start' | 'document_end' | 'document_idle'> = [
        'document_start',
        'document_end',
        'document_idle'
      ];

      timings.forEach(runAt => {
        const message: InjectScriptMessage = {
          type: MessageType.INJECT_SCRIPT,
          timestamp: Date.now(),
          source: { context: 'background' },
          script: 'void(0);',
          runAt
        };

        expect(message.runAt).toBe(runAt);
      });
    });

    it('should handle injection failure', async () => {
      const injectMessage: InjectScriptMessage = {
        type: MessageType.INJECT_SCRIPT,
        timestamp: Date.now(),
        source: { context: 'background' },
        script: 'malformed {{script',
        runAt: 'document_idle'
      };

      mockBackgroundScriptAPI.executeScript.mockRejectedValue({
        code: MessageErrorCode.SCRIPT_INJECTION_FAILED,
        message: 'Script injection failed: Syntax error'
      });

      await expect(mockBackgroundScriptAPI.executeScript(123, injectMessage.script))
        .rejects.toMatchObject({
          code: MessageErrorCode.SCRIPT_INJECTION_FAILED
        });
    });
  });

  describe('Tab Lifecycle Events', () => {
    it('should handle tab ready event', () => {
      const readyMessage: TabReadyMessage = {
        type: MessageType.TAB_READY,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123,
          url: 'https://example.com'
        },
        url: 'https://example.com',
        title: 'Example Page',
        readyState: 'complete'
      };

      expect(readyMessage.type).toBe(MessageType.TAB_READY);
      expect(readyMessage.readyState).toBe('complete');
      expect(['loading', 'interactive', 'complete']).toContain(readyMessage.readyState);
    });

    it('should handle tab unload event', () => {
      const unloadMessage: TabUnloadMessage = {
        type: MessageType.TAB_UNLOAD,
        timestamp: Date.now(),
        source: {
          context: 'content',
          tabId: 123
        },
        reason: 'navigation'
      };

      expect(unloadMessage.type).toBe(MessageType.TAB_UNLOAD);
      expect(['navigation', 'close', 'reload']).toContain(unloadMessage.reason);
    });

    it('should track ready state transitions', () => {
      const states: Array<'loading' | 'interactive' | 'complete'> = [
        'loading',
        'interactive',
        'complete'
      ];

      const messages = states.map(readyState => ({
        type: MessageType.TAB_READY,
        timestamp: Date.now(),
        source: { context: 'content', tabId: 123 },
        url: 'https://example.com',
        title: 'Test',
        readyState
      } as TabReadyMessage));

      // Validate state progression
      expect(messages[0].readyState).toBe('loading');
      expect(messages[1].readyState).toBe('interactive');
      expect(messages[2].readyState).toBe('complete');
    });

    it('should validate unload reasons', () => {
      const reasons: Array<'navigation' | 'close' | 'reload'> = [
        'navigation',
        'close',
        'reload'
      ];

      reasons.forEach(reason => {
        const message: TabUnloadMessage = {
          type: MessageType.TAB_UNLOAD,
          timestamp: Date.now(),
          source: { context: 'content', tabId: 123 },
          reason
        };

        expect(message.reason).toBe(reason);
      });
    });
  });

  describe('Content Script API Contract', () => {
    it('should handle querySelector operation', async () => {
      mockContentScriptAPI.querySelector.mockResolvedValue({
        tagName: 'DIV',
        id: 'test-div'
      });

      const result = await mockContentScriptAPI.querySelector('#test-div');

      expect(result).toHaveProperty('tagName');
      expect(result.tagName).toBe('DIV');
    });

    it('should handle querySelectorAll operation', async () => {
      mockContentScriptAPI.querySelectorAll.mockResolvedValue([
        { tagName: 'BUTTON' },
        { tagName: 'BUTTON' }
      ]);

      const results = await mockContentScriptAPI.querySelectorAll('button');

      expect(results).toHaveLength(2);
      expect(results[0].tagName).toBe('BUTTON');
    });

    it('should handle click operation', async () => {
      mockContentScriptAPI.click.mockResolvedValue(true);

      const result = await mockContentScriptAPI.click('#button', {
        force: true
      });

      expect(result).toBe(true);
      expect(mockContentScriptAPI.click).toHaveBeenCalledWith('#button', { force: true });
    });

    it('should handle type operation', async () => {
      mockContentScriptAPI.type.mockResolvedValue(true);

      const result = await mockContentScriptAPI.type('#input', 'test text', {
        clear: true,
        delay: 50
      });

      expect(result).toBe(true);
      expect(mockContentScriptAPI.type).toHaveBeenCalledWith(
        '#input',
        'test text',
        { clear: true, delay: 50 }
      );
    });

    it('should handle waitForElement operation', async () => {
      mockContentScriptAPI.waitForElement.mockResolvedValue(true);

      const result = await mockContentScriptAPI.waitForElement('#async-div', 5000);

      expect(result).toBe(true);
      expect(mockContentScriptAPI.waitForElement).toHaveBeenCalledWith('#async-div', 5000);
    });

    it('should handle visibility check', async () => {
      mockContentScriptAPI.isVisible.mockResolvedValue(true);

      const result = await mockContentScriptAPI.isVisible('#element');

      expect(result).toBe(true);
    });

    it('should handle enabled check', async () => {
      mockContentScriptAPI.isEnabled.mockResolvedValue(false);

      const result = await mockContentScriptAPI.isEnabled('#disabled-button');

      expect(result).toBe(false);
    });
  });

  describe('Background Script API Contract', () => {
    it('should send message to specific tab', async () => {
      const message: PingMessage = {
        type: MessageType.PING,
        timestamp: Date.now(),
        source: { context: 'background' }
      };

      mockBackgroundScriptAPI.sendToTab.mockResolvedValue({ success: true });

      const result = await mockBackgroundScriptAPI.sendToTab(123, message);

      expect(result.success).toBe(true);
      expect(mockBackgroundScriptAPI.sendToTab).toHaveBeenCalledWith(123, message);
    });

    it('should send message to specific frame', async () => {
      const message: PingMessage = {
        type: MessageType.PING,
        timestamp: Date.now(),
        source: { context: 'background' }
      };

      mockBackgroundScriptAPI.sendToFrame.mockResolvedValue({ success: true });

      const result = await mockBackgroundScriptAPI.sendToFrame(123, 1, message);

      expect(result.success).toBe(true);
      expect(mockBackgroundScriptAPI.sendToFrame).toHaveBeenCalledWith(123, 1, message);
    });

    it('should broadcast to all tabs', async () => {
      const message: PingMessage = {
        type: MessageType.PING,
        timestamp: Date.now(),
        source: { context: 'background' }
      };

      mockBackgroundScriptAPI.broadcast.mockResolvedValue(undefined);

      await mockBackgroundScriptAPI.broadcast(message, tab => tab.active === true);

      expect(mockBackgroundScriptAPI.broadcast).toHaveBeenCalled();
    });

    it('should inject content script', async () => {
      mockBackgroundScriptAPI.injectContentScript.mockResolvedValue(undefined);

      await mockBackgroundScriptAPI.injectContentScript(123);

      expect(mockBackgroundScriptAPI.injectContentScript).toHaveBeenCalledWith(123);
    });

    it('should handle tab not found error', async () => {
      mockBackgroundScriptAPI.sendToTab.mockRejectedValue({
        code: MessageErrorCode.TAB_NOT_FOUND,
        message: 'Tab 999 not found'
      });

      await expect(mockBackgroundScriptAPI.sendToTab(999, {} as any))
        .rejects.toMatchObject({
          code: MessageErrorCode.TAB_NOT_FOUND
        });
    });

    it('should handle frame not found error', async () => {
      mockBackgroundScriptAPI.sendToFrame.mockRejectedValue({
        code: MessageErrorCode.FRAME_NOT_FOUND,
        message: 'Frame 999 not found in tab 123'
      });

      await expect(mockBackgroundScriptAPI.sendToFrame(123, 999, {} as any))
        .rejects.toMatchObject({
          code: MessageErrorCode.FRAME_NOT_FOUND
        });
    });
  });

  describe('Version Compatibility', () => {
    it('should validate protocol version format', () => {
      const pong: PongMessage = {
        type: MessageType.PONG,
        timestamp: Date.now(),
        source: { context: 'content', tabId: 123 },
        version: '1.2.3',
        capabilities: []
      };

      const versionRegex = /^\d+\.\d+\.\d+$/;
      expect(pong.version).toMatch(versionRegex);
    });

    it('should handle version mismatch', () => {
      const backgroundVersion = '2.0.0';
      const contentVersion = '1.0.0';

      const isCompatible = (bgVer: string, contentVer: string) => {
        const [bgMajor] = bgVer.split('.');
        const [contentMajor] = contentVer.split('.');
        return bgMajor === contentMajor;
      };

      expect(isCompatible(backgroundVersion, contentVersion)).toBe(false);
    });
  });

  describe('Lifecycle State Machine', () => {
    it('should follow correct state transitions', () => {
      enum LifecycleState {
        UNINITIALIZED = 'uninitialized',
        INJECTING = 'injecting',
        READY = 'ready',
        ACTIVE = 'active',
        UNLOADING = 'unloading',
        UNLOADED = 'unloaded'
      }

      const validTransitions: Map<LifecycleState, LifecycleState[]> = new Map([
        [LifecycleState.UNINITIALIZED, [LifecycleState.INJECTING]],
        [LifecycleState.INJECTING, [LifecycleState.READY, LifecycleState.UNLOADED]],
        [LifecycleState.READY, [LifecycleState.ACTIVE, LifecycleState.UNLOADING]],
        [LifecycleState.ACTIVE, [LifecycleState.UNLOADING]],
        [LifecycleState.UNLOADING, [LifecycleState.UNLOADED]],
        [LifecycleState.UNLOADED, []]
      ]);

      const isValidTransition = (from: LifecycleState, to: LifecycleState): boolean => {
        return validTransitions.get(from)?.includes(to) || false;
      };

      expect(isValidTransition(LifecycleState.UNINITIALIZED, LifecycleState.INJECTING)).toBe(true);
      expect(isValidTransition(LifecycleState.READY, LifecycleState.UNLOADED)).toBe(false);
      expect(isValidTransition(LifecycleState.ACTIVE, LifecycleState.UNLOADING)).toBe(true);
    });
  });
});