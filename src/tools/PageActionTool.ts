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
import { ActionCommandSchema, PageActionToolRequestSchema, PageActionErrorCode } from './page-action/types';
import { ActionHistory } from './page-action/ActionHistory';

/**
 * PageActionTool - Execute actions on web page elements
 *
 * Architecture follows DOMTool pattern for consistency with ToolRegistry:
 * - Tool definition includes category, version, and metadata (DOMTool.ts:47-85)
 * - Validation uses private validateRequest() method (DOMTool.ts:455-479)
 * - Errors use structured ToolError with error codes (DOMTool.ts:578-589)
 * - Retry logic uses BaseTool.executeWithRetry() (BaseTool.ts:445-485)
 * - Event emission through ToolRegistry.execute()
 */
export class PageActionTool extends BaseTool {
  protected toolDefinition: ToolDefinition;
  private actionHistory: ActionHistory;

  constructor() {
    super();

    // Pattern matches DOMTool constructor (DOMTool.ts:47-85)
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
        required: ['action'],
        // Tool metadata for ToolRegistry discovery (pattern matches DOMTool.ts:83-85)
        category: 'action',
        version: '1.0.0',
        metadata: {
          capabilities: [
            'page_click',
            'page_input',
            'page_scroll',
            'element_verify',
            'iframe_support',
            'shadow_dom_support',
            'stale_element_recovery',
            'action_history'
          ],
          permissions: ['activeTab', 'scripting', 'tabs']
        }
      }
    );

    this.actionHistory = ActionHistory.getInstance();
  }

  /**
   * Execute the page action tool
   *
   * Pattern matches DOMTool.executeImpl (DOMTool.ts:148-238)
   * - Uses private validateRequest() for parameter validation
   * - Returns structured ToolExecutionResponse via executeWithRetry()
   */
  protected async executeImpl(
    request: BaseToolRequest,
    options?: BaseToolOptions
  ): Promise<any> {
    this.log('info', 'Executing page action', request);

    // Validate request using private method (pattern matches DOMTool.ts:455-479)
    const validationError = this.validateRequest(request);
    if (validationError) {
      throw new Error(validationError);
    }

    const typedRequest = request as PageActionToolRequest;
    const { action, selectorMap, tabId } = typedRequest;

    // Get target tab - use session-aware validation if sessionId provided
    let targetTab: chrome.tabs.Tab;
    if (request.sessionId) {
      targetTab = await this.validateSessionTab(request.sessionId);
    } else {
      targetTab = tabId ? await this.validateTabId(tabId) : await this.getActiveTab();
    }

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
   *
   * Pattern matches DOMTool retry approach (DOMTool.ts:370-450)
   * - Uses BaseTool.executeWithRetry() instead of custom RetryStrategy
   * - Handles stale element errors with selector map refresh
   * - Returns structured ToolExecutionResponse with ToolError
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
      // Send action to content script with retry (using BaseTool.executeWithRetry - BaseTool.ts:445-485)
      const response = await this.executeWithRetry(
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
              throw error; // Will be caught by retry logic
            }

            throw error;
          }
        },
        3,  // maxRetries
        100 // delayMs (base delay for exponential backoff)
      );

      const duration = Date.now() - startTime;

      // Check if action succeeded
      if (!response.success) {
        const errorCode = this.mapErrorToCode(response.error || 'Action execution failed');
        return {
          success: false,
          error: this.createError(
            errorCode,
            response.error || 'Action execution failed',
            { actionType: action.type, tabId }
          ),
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

      const errorCode = this.mapErrorToCode(error);
      return {
        success: false,
        error: this.createError(
          errorCode,
          error instanceof Error ? error.message : String(error),
          {
            actionType: action.type,
            tabId,
            stack: error instanceof Error ? error.stack : undefined
          }
        ),
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
   * Override retry delay calculation to provide exponential backoff
   * Produces delays: 100ms, 300ms, 900ms (matching original RetryStrategy)
   * @override
   */
  protected calculateRetryDelay(attempt: number, baseDelayMs: number): number {
    // Exponential backoff: baseDelay * 3^(attempt-1)
    // attempt=1: 100 * 3^0 = 100ms
    // attempt=2: 100 * 3^1 = 300ms
    // attempt=3: 100 * 3^2 = 900ms
    return baseDelayMs * Math.pow(3, attempt - 1);
  }

  /**
   * Check if content script is injected in a tab
   * Migrated from message-handlers.ts (message-handlers.ts:82-89)
   * @private
   */
  private async isContentScriptInjected(tabId: number): Promise<boolean> {
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'PING' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ensure content script is injected into the tab
   * Migrated from message-handlers.ts (message-handlers.ts:95-114)
   * @private
   */
  private async ensureContentScriptInjected(tabId: number): Promise<void> {
    try {
      // Check if already injected
      if (await this.isContentScriptInjected(tabId)) {
        this.log('debug', `Content script already injected in tab ${tabId}`);
        return;
      }

      // Inject content script (unified content-script.ts handles all tools)
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content/content-script.js']
      });

      this.log('info', `Content script injected into tab ${tabId}`);
    } catch (error) {
      this.log('error', `Failed to inject script into tab ${tabId}`, error);
      throw new Error(`Failed to inject page action script: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate request parameters using Zod schema
   * Pattern matches DOMTool.validateRequest (DOMTool.ts:455-479)
   * @private
   */
  private validateRequest(parameters: unknown): string | null {
    const validationResult = PageActionToolRequestSchema.safeParse(parameters);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
      return `Validation failed: ${errors.join(', ')}`;
    }
    return null;
  }

  /**
   * Map internal errors to PageActionErrorCode
   * Pattern matches DOMTool.mapServiceErrorCode (DOMTool.ts:578-589)
   * @private
   */
  private mapErrorToCode(error: any): PageActionErrorCode {
    const errorMessage = error?.message || String(error);

    if (errorMessage.includes('not found') || errorMessage.includes('no element')) {
      return PageActionErrorCode.ELEMENT_NOT_FOUND;
    }
    if (errorMessage.includes('stale')) {
      return PageActionErrorCode.ELEMENT_STALE;
    }
    if (errorMessage.includes('not interactable') || errorMessage.includes('obscured')) {
      return PageActionErrorCode.ELEMENT_NOT_INTERACTABLE;
    }
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return PageActionErrorCode.ACTION_TIMEOUT;
    }
    if (errorMessage.includes('invalid') && errorMessage.includes('action')) {
      return PageActionErrorCode.INVALID_ACTION_TYPE;
    }
    if (errorMessage.includes('selector map')) {
      return PageActionErrorCode.SELECTOR_MAP_REFRESH_FAILED;
    }
    if (errorMessage.includes('content script') || errorMessage.includes('Could not establish connection')) {
      return PageActionErrorCode.CONTENT_SCRIPT_ERROR;
    }

    return PageActionErrorCode.UNKNOWN_ERROR;
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
