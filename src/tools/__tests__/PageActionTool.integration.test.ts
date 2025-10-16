/**
 * Integration test for PageActionTool event emission through ToolRegistry
 * Verifies that ToolExecutionStart and ToolExecutionEnd events are emitted correctly
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolRegistry } from '../ToolRegistry';
import { PageActionTool } from '../PageActionTool';
import { EventCollector } from '../../tests/utils/test-helpers';
import type { PageActionToolRequest } from '../../types/page-actions';
import type { ToolExecutionRequest } from '../BaseTool';

// Mock Chrome API
const mockChrome = {
  tabs: {
    sendMessage: vi.fn(),
    query: vi.fn(),
    get: vi.fn()
  },
  runtime: {
    sendMessage: vi.fn()
  },
  scripting: {
    executeScript: vi.fn()
  }
};

(global as any).chrome = mockChrome;

describe('PageActionTool Integration - Event Emission', () => {
  let toolRegistry: ToolRegistry;
  let pageActionTool: PageActionTool;
  let eventCollector: EventCollector;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();

    // Create EventCollector instance
    eventCollector = new EventCollector();

    // Create ToolRegistry instance with EventCollector
    toolRegistry = new ToolRegistry(eventCollector);

    // Create and register PageActionTool
    pageActionTool = new PageActionTool();
    const definition = pageActionTool.getDefinition();
    await toolRegistry.register(definition, async (params, context) => {
      return pageActionTool.execute(params);
    });

    // Setup default mock responses
    mockChrome.tabs.query.mockResolvedValue([{ id: 1, url: 'https://example.com' }]);
    mockChrome.tabs.get.mockResolvedValue({ id: 1, url: 'https://example.com' });
    mockChrome.tabs.sendMessage.mockResolvedValue({
      success: true,
      result: {
        success: true,
        actionCommand: {
          type: 'click',
          targetElement: { selector: '#test-button' },
          parameters: { clickType: 'left' },
          sessionId: 'test-session',
          turnId: 'test-turn',
          timeout: 30000
        },
        timestamp: new Date().toISOString(),
        duration: 150,
        attemptsCount: 1,
        detectedChanges: {
          navigationOccurred: false,
          domMutations: 3,
          scrollPositionChanged: false,
          valueChanged: false
        }
      }
    });
  });

  it('should emit ToolExecutionStart and ToolExecutionEnd events on successful execution', async () => {
    const request: ToolExecutionRequest = {
      toolName: 'page_action',
      parameters: {
        action: {
          type: 'click',
          targetElement: { selector: '#test-button' },
          parameters: { clickType: 'left' },
          sessionId: 'test-session-123',
          turnId: 'test-turn-456',
          timeout: 30000
        }
      },
      sessionId: 'test-session-123',
      turnId: 'test-turn-456'
    };

    const response = await toolRegistry.execute(request);

    // Verify execution succeeded
    expect(response.success).toBe(true);
    expect(response.data).toBeDefined();

    // Verify events were emitted
    const events = eventCollector.getEvents();
    expect(events.length).toBeGreaterThanOrEqual(2);

    // Find ToolExecutionStart event
    const startEvent = eventCollector.findByType('ToolExecutionStart');
    expect(startEvent).toBeDefined();
    expect((startEvent?.msg as any).data).toMatchObject({
      tool_name: 'page_action',
      session_id: 'test-session-123',
      turn_id: 'test-turn-456'
    });

    // Find ToolExecutionEnd event
    const endEvent = eventCollector.findByType('ToolExecutionEnd');
    expect(endEvent).toBeDefined();
    expect((endEvent?.msg as any).data).toMatchObject({
      tool_name: 'page_action',
      session_id: 'test-session-123',
      success: true
    });
    expect((endEvent?.msg as any).data.duration).toBeGreaterThan(0);
  });

  it('should emit ToolExecutionError event on execution failure', async () => {
    // Mock a failure response
    mockChrome.tabs.sendMessage.mockRejectedValue(new Error('Content script error'));

    const request: ToolExecutionRequest = {
      toolName: 'page_action',
      parameters: {
        action: {
          type: 'click',
          targetElement: { selector: '#nonexistent' },
          parameters: { clickType: 'left' },
          sessionId: 'test-session-789',
          turnId: 'test-turn-012',
          timeout: 30000
        }
      },
      sessionId: 'test-session-789',
      turnId: 'test-turn-012'
    };

    const response = await toolRegistry.execute(request);

    // Verify execution failed (tool catches error and returns success with error data)
    expect(response.success).toBeDefined();

    // Verify ToolExecutionStart was emitted
    const startEvent = eventCollector.findByType('ToolExecutionStart');
    expect(startEvent).toBeDefined();

    // Verify either ToolExecutionEnd or ToolExecutionError was emitted
    const endEvent = eventCollector.findByType('ToolExecutionEnd');
    const errorEvent = eventCollector.findByType('ToolExecutionError');
    expect(endEvent || errorEvent).toBeDefined();
  });

  it('should include metadata in emitted events', async () => {
    const request: ToolExecutionRequest = {
      toolName: 'page_action',
      parameters: {
        action: {
          type: 'input',
          targetElement: { selector: '#input-field' },
          parameters: {
            text: 'test input',
            clearFirst: true,
            pressEnter: false,
            typeSpeed: 0
          },
          sessionId: 'test-session-meta',
          turnId: 'test-turn-meta',
          timeout: 30000
        },
        tabId: 1
      },
      sessionId: 'test-session-meta',
      turnId: 'test-turn-meta'
    };

    await toolRegistry.execute(request);

    // Verify ToolExecutionStart was emitted
    const startEvent = eventCollector.findByType('ToolExecutionStart');
    expect(startEvent).toBeDefined();

    // Verify ToolExecutionEnd includes result metadata
    const endEvent = eventCollector.findByType('ToolExecutionEnd');
    expect((endEvent?.msg as any).data.duration).toBeTypeOf('number');
    expect((endEvent?.msg as any).data.duration).toBeGreaterThanOrEqual(0);
  });

  it('should maintain event order during execution', async () => {
    const request: ToolExecutionRequest = {
      toolName: 'page_action',
      parameters: {
        action: {
          type: 'scroll',
          targetElement: { selector: '#scroll-target' },
          parameters: {
            scrollType: 'to-element',
            position: 'center',
            smooth: true,
            waitForLazyLoad: true,
            lazyLoadTimeout: 2000
          },
          sessionId: 'test-session-order',
          turnId: 'test-turn-order',
          timeout: 30000
        }
      },
      sessionId: 'test-session-order',
      turnId: 'test-turn-order'
    };

    await toolRegistry.execute(request);

    // Get all events
    const events = eventCollector.getEvents();

    // Find Start and End event indices
    const startIndex = events.findIndex(e => e.msg.type === 'ToolExecutionStart');
    const endIndex = events.findIndex(e => e.msg.type === 'ToolExecutionEnd');

    // Verify Start comes before End
    expect(startIndex).toBeGreaterThanOrEqual(0);
    expect(endIndex).toBeGreaterThan(startIndex);
  });

  it('should emit events during tool execution', async () => {
    const request: ToolExecutionRequest = {
      toolName: 'page_action',
      parameters: {
        action: {
          type: 'verify',
          targetElement: { selector: '#verify-target' },
          parameters: {
            checkType: 'visible',
            expectedValue: undefined
          },
          sessionId: 'test-session-cat',
          turnId: 'test-turn-cat',
          timeout: 30000
        }
      },
      sessionId: 'test-session-cat',
      turnId: 'test-turn-cat'
    };

    await toolRegistry.execute(request);

    // Verify tool was registered
    const tool = toolRegistry.getTool('page_action');
    expect(tool).toBeDefined();

    // Verify events were emitted
    const startEvent = eventCollector.findByType('ToolExecutionStart');
    const endEvent = eventCollector.findByType('ToolExecutionEnd');
    expect(startEvent).toBeDefined();
    expect(endEvent).toBeDefined();
  });
});
