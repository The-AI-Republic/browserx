/**
 * DOM Tool v2.0 - High-Level DOM Reading
 *
 * Refactored to provide a single high-level interaction capture operation
 * that captures page models for AI agent consumption.
 *
 * BREAKING CHANGE: Removed all atomic operations (query, click, type, etc.)
 * in favor of comprehensive DOM capture with selector_map for element lookup.
 */

import { BaseTool, createToolDefinition, type BaseToolRequest, type BaseToolOptions, type ToolDefinition } from './BaseTool';
import { MessageType } from '../core/MessageRouter';
import type {
  SerializationOptions,
  SerializedDom,
  ClickOptions,
  TypeOptions,
  KeyPressOptions,
  ActionResult,
} from '../types/domTool';

// ============================================================================
// Type Definitions for v3.0 Wrapper
// ============================================================================

/**
 * Unified DOM tool request (discriminated union by action type)
 */
export interface DOMToolRequest {
  action: 'snapshot' | 'click' | 'type' | 'keypress';
  tab_id?: number;
  node_id?: string;
  text?: string;
  key?: string;
  options?: any;
}

/**
 * Unified DOM tool response
 */
export interface DOMToolResponse {
  success: boolean;
  data?: SerializedDom | ActionResult;
  error?: {
    code: string;
    message: string;
    details: Record<string, any>;
  };
  metadata: {
    duration: number;
    toolName: 'browser_dom';
    tabId: number;
    retryCount?: number;
  };
}

/**
 * DOM Tool error codes
 */
export enum DOMToolErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TAB_NOT_FOUND = 'TAB_NOT_FOUND',
  CONTENT_SCRIPT_NOT_LOADED = 'CONTENT_SCRIPT_NOT_LOADED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  ACTION_FAILED = 'ACTION_FAILED',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}
/**
 * DOM Tool v2.0 Implementation
 *
 * Provides high-level DOM reading through captureInteractionContent().
 */
export class DOMTool extends BaseTool {
  protected toolDefinition: ToolDefinition = createToolDefinition(
    'browser_dom',
    'Unified DOM inspection and action tool. Capture page DOM snapshots with token-optimized serialization, and execute actions (click, type, keypress) on elements using persistent node IDs. Combines DOM capture with page interaction in a single tool.',
    {
      action: {
        type: 'string',
        description: 'Action type: snapshot (capture DOM), click (click element), type (input text), keypress (keyboard input)',
        enum: ['snapshot', 'click', 'type', 'keypress'],
      },
      tab_id: {
        type: 'number',
        description: 'Target tab ID (optional, defaults to active tab)',
      },
      node_id: {
        type: 'string',
        description: 'Target element node ID - 8-character alphanumeric identifier from snapshot (required for click and type actions). Expected format: 8 alphanumeric characters.',
      },
      text: {
        type: 'string',
        description: 'Text to type into element (required for type action)',
      },
      key: {
        type: 'string',
        description: 'Key to press (required for keypress action). Examples: Enter, Escape, Tab, ArrowDown',
      },
      options: {
        type: 'object',
        description: 'Action-specific options (SerializationOptions for snapshot, ClickOptions for click, TypeOptions for type, KeyPressOptions for keypress)',
      },
    },
    {
      required: ['action'],
      category: 'dom',
      version: '3.0.0',
      metadata: {
        capabilities: [
          'dom_snapshot',
          'dom_serialization',
          'page_click',
          'page_input',
          'page_keypress',
          'change_detection',
          'iframe_support',
          'shadow_dom_support',
          'node_id_preservation',
          'auto_invalidation',
          'incremental_virtual_dom_updates',
        ],
        permissions: ['activeTab', 'scripting', 'tabs'],
      },
    }
  );

  constructor() {
    super();
  }

  /**
   * Execute DOM tool action - routes to v3.0 implementation
   */
  protected async executeImpl(
    request: BaseToolRequest,
    options?: BaseToolOptions
  ): Promise<DOMToolResponse> {
    // Validate Chrome context
    this.validateChromeContext();

    // Validate required permissions
    await this.validatePermissions(['activeTab', 'scripting']);

    // Validate request
    const validationError = this.validateRequest(request);
    if (validationError) {
      throw new Error(validationError);
    }

    const typedRequest = request as DOMToolRequest;

    // Get target tab
    const targetTab = typedRequest.tab_id
      ? await this.validateTabId(typedRequest.tab_id)
      : await this.getActiveTab();

    const tabId = targetTab.id!;

    // Ensure content script is injected
    await this.ensureContentScriptInjected(tabId);

    // Route by action type
    const startTime = Date.now();
    try {
      let data: SerializedDom | ActionResult;

      switch (typedRequest.action) {
        case 'snapshot':
          data = await this.executeSnapshot(tabId, typedRequest.options);
          break;
        case 'click':
          data = await this.executeClick(tabId, typedRequest.node_id!, typedRequest.options);
          break;
        case 'type':
          data = await this.executeType(tabId, typedRequest.node_id!, typedRequest.text!, typedRequest.options);
          break;
        case 'keypress':
          data = await this.executeKeypress(tabId, typedRequest.key!, typedRequest.options);
          break;
        default:
          throw new Error(`Unknown action: ${typedRequest.action}`);
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        data,
        metadata: {
          duration,
          toolName: 'browser_dom',
          tabId,
          retryCount: 0,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return this.handleError(error, typedRequest.action, tabId, duration);
    }
  }

  // ============================================================================
  // v3.0 Action Execution Methods
  // ============================================================================

  /**
   * Execute snapshot action
   */
  private async executeSnapshot(
    tabId: number,
    options?: SerializationOptions
  ): Promise<SerializedDom> {
    this.log('debug', 'Executing snapshot', { tabId, options });

    const response = await chrome.tabs.sendMessage(tabId, {
      type: MessageType.TAB_COMMAND,
      command: 'dom.getSnapshot',
      args: options || {},
    });

    if (!response) {
      throw new Error('No response from content script');
    }

    return response as SerializedDom;
  }

  /**
   * Execute click action
   */
  private async executeClick(
    tabId: number,
    nodeId: string,
    options?: ClickOptions
  ): Promise<ActionResult> {
    this.log('debug', 'Executing click', { tabId, nodeId, options });

    const response = await this.executeWithRetry(
      async () => {
        return await chrome.tabs.sendMessage(tabId, {
          type: MessageType.TAB_COMMAND,
          command: 'dom.click',
          args: { nodeId, options: options || {} },
        });
      },
      3, // maxRetries
      100 // baseDelayMs
    );

    if (!response) {
      throw new Error('No response from content script');
    }

    const result = response as ActionResult;

    // Check if action succeeded
    if (!result.success) {
      throw new Error(result.error || 'Click action failed');
    }

    return result;
  }

  /**
   * Execute type action
   */
  private async executeType(
    tabId: number,
    nodeId: string,
    text: string,
    options?: TypeOptions
  ): Promise<ActionResult> {
    this.log('debug', 'Executing type', { tabId, nodeId, text, options });

    const response = await this.executeWithRetry(
      async () => {
        return await chrome.tabs.sendMessage(tabId, {
          type: MessageType.TAB_COMMAND,
          command: 'dom.type',
          args: { nodeId, text, options: options || {} },
        });
      },
      3,
      100
    );

    if (!response) {
      throw new Error('No response from content script');
    }

    const result = response as ActionResult;

    if (!result.success) {
      throw new Error(result.error || 'Type action failed');
    }

    return result;
  }

  /**
   * Execute keypress action
   */
  private async executeKeypress(
    tabId: number,
    key: string,
    options?: KeyPressOptions
  ): Promise<ActionResult> {
    this.log('debug', 'Executing keypress', { tabId, key, options });

    const response = await this.executeWithRetry(
      async () => {
        return await chrome.tabs.sendMessage(tabId, {
          type: MessageType.TAB_COMMAND,
          command: 'dom.keypress',
          args: { key, options: options || {} },
        });
      },
      3,
      100
    );

    if (!response) {
      throw new Error('No response from content script');
    }

    const result = response as ActionResult;

    if (!result.success) {
      throw new Error(result.error || 'Keypress action failed');
    }

    return result;
  }

  /**
   * Ensure content script is injected into the tab
   */
  private async ensureContentScriptInjected(tabId: number): Promise<void> {
    const maxRetries = 5;
    const baseDelay = 100;

    // Try to ping existing content script
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: MessageType.PING,
          payload: {},
          timestamp: Date.now()
        });
        if (response && response.success && response.data && response.data.type === MessageType.PONG) {
          this.log('debug', `Content script ready in tab ${tabId}`);
          return;
        }
      } catch (error) {
        // Content script not responsive, continue to injection
      }

      // Try injecting the script
      if (attempt === 0) {
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['/content.js'],
          });
          this.log('info', `Content script injected into tab ${tabId}`);
          await new Promise(resolve => setTimeout(resolve, 300));
        } catch (injectionError) {
          throw new Error(`Failed to inject content script: ${injectionError}`);
        }
      }

      // Wait with exponential backoff
      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    throw new Error(`Content script failed to respond after ${maxRetries} attempts`);
  }

  // ============================================================================
  // v3.0 Request Validation & Error Handling
  // ============================================================================

  /**
   * Validate DOMToolRequest
   */
  private validateRequest(request: unknown): string | null {
    if (!request || typeof request !== 'object') {
      return 'Request must be an object';
    }

    const req = request as any;

    // Validate action
    if (!['snapshot', 'click', 'type', 'keypress'].includes(req.action)) {
      return `Invalid action: ${req.action}. Must be one of: snapshot, click, type, keypress`;
    }

    // Validate tab_id if provided
    if (req.tab_id !== undefined && typeof req.tab_id !== 'number') {
      return 'tab_id must be a number';
    }

    // Action-specific validation
    switch (req.action) {
      case 'snapshot':
        return null; // Only action is required

      case 'click':
        if (!req.node_id || typeof req.node_id !== 'string') {
          return 'node_id is required for click action';
        }
        if (!/^[A-Za-z0-9]{8}$/.test(req.node_id)) {
          return 'node_id must be 8 alphanumeric characters';
        }
        return null;

      case 'type':
        if (!req.node_id || typeof req.node_id !== 'string') {
          return 'node_id is required for type action';
        }
        if (!/^[A-Za-z0-9]{8}$/.test(req.node_id)) {
          return 'node_id must be 8 alphanumeric characters';
        }
        if (!req.text || typeof req.text !== 'string') {
          return 'text is required for type action';
        }
        return null;

      case 'keypress':
        if (!req.key || typeof req.key !== 'string') {
          return 'key is required for keypress action';
        }
        return null;

      default:
        return `Unknown action: ${req.action}`;
    }
  }

  /**
   * Handle errors from action execution
   */
  private handleError(
    error: any,
    action: string,
    tabId: number,
    duration: number
  ): DOMToolResponse {
    const errorMessage = error?.message || String(error);

    this.log('error', `DOM tool action failed: ${errorMessage}`, { action, tabId });

    // Map error to code
    let code = DOMToolErrorCode.UNKNOWN_ERROR;
    if (errorMessage.includes('not found') || errorMessage.includes('No tab with id')) {
      code = DOMToolErrorCode.TAB_NOT_FOUND;
    } else if (errorMessage.includes('Could not establish connection')) {
      code = DOMToolErrorCode.CONTENT_SCRIPT_NOT_LOADED;
    } else if (errorMessage.includes('Element') && errorMessage.includes('not found')) {
      code = DOMToolErrorCode.ELEMENT_NOT_FOUND;
    } else if (errorMessage.includes('action failed')) {
      code = DOMToolErrorCode.ACTION_FAILED;
    } else if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      code = DOMToolErrorCode.TIMEOUT;
    } else if (errorMessage.includes('permission')) {
      code = DOMToolErrorCode.PERMISSION_DENIED;
    } else if (errorMessage.includes('Invalid action') || errorMessage.includes('is required')) {
      code = DOMToolErrorCode.VALIDATION_ERROR;
    }

    return {
      success: false,
      error: {
        code,
        message: errorMessage,
        details: {
          action,
          tabId,
          stack: error instanceof Error ? error.stack : undefined,
        },
      },
      metadata: {
        duration,
        toolName: 'browser_dom',
        tabId,
      },
    };
  }
}
