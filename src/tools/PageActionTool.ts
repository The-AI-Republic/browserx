/**
 * PageActionTool - Execute actions on web page elements
 * Enables click, input, scroll, and verify operations with automatic retry
 */

import { BaseTool, createToolDefinition, type ToolDefinition, type BaseToolRequest, type BaseToolOptions } from './BaseTool';
import type {
  PageActionToolRequest,
  PageActionToolResponse,
  ActionCommand,
  ActionExecutionResult,
  DOMSelectorMap
} from '../types/page-actions';
import { ActionCommandSchema, PageActionToolRequestSchema } from './page-action/types';
import { ActionHistory } from './page-action/ActionHistory';
import { RetryStrategy } from './page-action/RetryStrategy';

export class PageActionTool extends BaseTool {
  protected toolDefinition: ToolDefinition;
  private actionHistory: ActionHistory;
  private retryStrategy: RetryStrategy;

  constructor() {
    super();

    this.toolDefinition = createToolDefinition(
      'page_action',
      'Execute actions on web page elements (click, input text, scroll). Supports elements in iframes and shadow DOM with automatic retry on transient failures. Actions are verified and changes are detected automatically.',
      {
        action: {
          type: 'object',
          description: 'Action command to execute',
          properties: {
            type: {
              type: 'string',
              description: 'Action type: click, input, scroll, or verify'
            },
            targetElement: {
              type: 'object',
              description: 'Element target specification with selector, nodeId, or semanticDescription'
            },
            parameters: {
              type: 'object',
              description: 'Action-specific parameters'
            },
            sessionId: {
              type: 'string',
              description: 'Session identifier for tracking'
            },
            turnId: {
              type: 'string',
              description: 'Turn/request identifier within session'
            },
            timeout: {
              type: 'number',
              description: 'Maximum execution time in milliseconds (default: 30000)'
            }
          }
        },
        selectorMap: {
          type: 'object',
          description: 'Optional DOM selector map; will be fetched if not provided'
        },
        tabId: {
          type: 'number',
          description: 'Target tab ID; defaults to active tab if not specified'
        }
      },
      {
        required: ['action']
      }
    );

    this.actionHistory = ActionHistory.getInstance();
    this.retryStrategy = new RetryStrategy();
  }

  /**
   * Execute the page action tool
   */
  protected async executeImpl(
    request: BaseToolRequest,
    options?: BaseToolOptions
  ): Promise<any> {
    this.log('info', 'Executing page action', request);

    // Validate request with Zod schema
    const validationResult = PageActionToolRequestSchema.safeParse(request);
    if (!validationResult.success) {
      throw new Error(`Invalid page action request: ${validationResult.error.message}`);
    }

    const typedRequest = request as PageActionToolRequest;
    const { action, selectorMap, tabId } = typedRequest;

    // Get target tab
    const targetTab = tabId ? await this.validateTabId(tabId) : await this.getActiveTab();

    if (!targetTab.id) {
      throw new Error('Tab ID not available');
    }

    // Execute action via content script
    const result = await this.executeAction(targetTab.id, action, selectorMap);

    // Record in history
    if (result.result) {
      this.actionHistory.addEntry(result.result, action.sessionId);
    }

    return result;
  }

  /**
   * Execute action via content script with retry
   */
  private async executeAction(
    tabId: number,
    action: ActionCommand,
    selectorMap?: DOMSelectorMap
  ): Promise<PageActionToolResponse> {
    const startTime = Date.now();
    let attemptCount = 0;
    let updatedSelectorMap: DOMSelectorMap | undefined = undefined;

    try {
      // Send action to content script with stale element handling
      const response = await this.retryStrategy.executeWithRetry(
        async () => {
          attemptCount++;

          try {
            return await chrome.tabs.sendMessage(tabId, {
              type: 'PAGE_ACTION_EXECUTE',
              action,
              selectorMap: updatedSelectorMap || selectorMap
            });
          } catch (error: any) {
            // Check if it's a stale element error
            if (error.code === 'ELEMENT_STALE' && attemptCount === 1) {
              this.log('warn', 'Stale element detected, refreshing selector map');

              // Request selector map refresh
              updatedSelectorMap = await this.refreshSelectorMap(tabId);

              // Notify side panel about refresh
              await this.notifySelectorMapRefresh(action.sessionId, action.turnId);

              // Retry with updated selector map
              throw error; // Will be caught by retry strategy
            }

            throw error;
          }
        },
        `page_action:${action.type}`
      );

      const duration = Date.now() - startTime;

      // Check if action succeeded
      if (!response.success) {
        return {
          success: false,
          error: response.error || 'Action execution failed',
          metadata: {
            duration,
            toolName: 'page_action',
            tabId,
            retryCount: attemptCount - 1
          }
        };
      }

      return {
        success: true,
        data: {
          result: response.result,
          updatedSelectorMap
        },
        metadata: {
          duration,
          toolName: 'page_action',
          tabId,
          retryCount: attemptCount - 1
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      this.log('error', 'Action execution failed', error);

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metadata: {
          duration,
          toolName: 'page_action',
          tabId,
          retryCount: attemptCount - 1
        }
      };
    }
  }

  /**
   * Refresh selector map for a tab
   */
  private async refreshSelectorMap(tabId: number): Promise<DOMSelectorMap | undefined> {
    try {
      // Request DOMTool to generate new selector map
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'DOM_GET_SELECTOR_MAP'
      });

      this.log('info', 'Selector map refreshed successfully');
      return response.selectorMap;
    } catch (error) {
      this.log('error', 'Failed to refresh selector map', error);
      return undefined;
    }
  }

  /**
   * Notify side panel about selector map refresh
   */
  private async notifySelectorMapRefresh(sessionId: string, turnId: string): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'PAGE_UPDATE_NOTIFICATION',
        payload: {
          sessionId,
          turnId,
          reason: 'Stale element detected - selector map refreshed',
          timestamp: Date.now()
        }
      });

      this.log('info', 'Side panel notified of selector map refresh');
    } catch (error) {
      this.log('warn', 'Failed to notify side panel', error);
    }
  }

  /**
   * Get action history for a session
   */
  getSessionHistory(sessionId: string): any[] {
    return this.actionHistory.getBySession(sessionId);
  }

  /**
   * Get recent action history
   */
  getRecentHistory(count: number = 10): any[] {
    return this.actionHistory.getRecent(count);
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): any {
    return this.actionHistory.getSessionStats(sessionId);
  }

  /**
   * Clear action history
   */
  clearHistory(): void {
    this.actionHistory.clear();
  }
}
