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
import type {
  SerializationOptions,
  SerializedDom,
  ClickOptions,
  TypeOptions,
  KeyPressOptions,
  ActionResult,
  FillFormFieldInstruction,
  FillFormResult,
} from '../types/domTool';
import { DomService } from './dom/DomService';

// ============================================================================
// Type Definitions for v3.0 Wrapper
// ============================================================================

/**
 * Unified DOM tool request (discriminated union by action type)
 */
export interface DOMToolRequest {
  action: 'snapshot' | 'click' | 'type' | 'keypress' | 'fill_form';
  tab_id?: number;
  node_id?: number; // Numeric CDP nodeId
  text?: string;
  key?: string;
  options?: any;
  form_selector?: string;
  fields?: FillFormFieldInstruction[];
  metadata?: Record<string, any>;
  submit?: {
    mode?: 'none' | 'click' | 'commit';
    delay_ms?: number;
  };
}

/**
 * Unified DOM tool response
 */
export interface DOMToolResponse {
  success: boolean;
  data?: SerializedDom | ActionResult | FillFormResult;
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
 * DOM Tool v3.0 Implementation
 *
 * CDP-based DOM operations with visual effects support.
 * All DOM operations use Chrome DevTools Protocol for cross-origin/shadow DOM support.
 */
export class DOMTool extends BaseTool {
  protected toolDefinition: ToolDefinition = createToolDefinition(
    'browser_dom',
    'Unified DOM inspection and action tool. Capture page DOM snapshots with token-optimized serialization, execute interactions (click, type, keypress), and fill complex forms in a single batched action using persistent node IDs.',
    {
      action: {
        type: 'string',
        description: 'Action type: snapshot (capture DOM), click (click element), type (input text), keypress (keyboard input), fill_form (batch form fill)',
        enum: ['snapshot', 'click', 'type', 'keypress', 'fill_form'],
      },
      tab_id: {
        type: 'number',
        description: 'Target tab ID (optional, defaults to active tab)',
      },
      node_id: {
        type: 'number',
        description: 'Target element node ID from snapshot (required for click and type actions). This is a numeric identifier corresponding to the node_id field in the serialized DOM. Example: 1469, 1537, etc. Special values: -1 for window-level scroll, -2 for document-level keypress.',
      },
      text: {
        type: 'string',
        description: 'Text to type into element (required for type action). Use options.commit to control finalization: "change" (default, fires change event) or "enter" (appends Enter keystroke for search/chat inputs).',
      },
      key: {
        type: 'string',
        description: 'Key to press (required for keypress action). Examples: Enter, Escape, Tab, ArrowDown',
      },
      options: {
        type: 'object',
        description: 'Action-specific options. For type action: { clearFirst?: boolean, speed?: number, commit?: "change"|"enter", blur?: boolean }. commit controls input finalization: "change" (default, fires change event) or "enter" (appends Enter keystroke). For click: { button?: "left"|"right"|"middle", scrollIntoView?: boolean }. For keypress: { modifiers?: { ctrl?: boolean, shift?: boolean, alt?: boolean, meta?: boolean } }. For snapshot: { includeValues?: boolean, metadata?: { includeAriaLabel?: boolean, includeText?: boolean, includeValue?: boolean, includeInputType?: boolean, includeHint?: boolean, includeBbox?: boolean, includeStates?: boolean, includeHref?: boolean } }.',
      },
      form_selector: {
        type: 'string',
        description: 'Optional CSS selector to scope fill_form lookups to a specific form element.',
      },
      fields: {
        type: 'array',
        description: 'Structured instructions for fill_form action. Each entry must include a value and at least one identifier (node_id, selector, or name).',
        items: {
          type: 'object',
          properties: {
            node_id: { type: 'number', description: 'Snapshot node identifier for the field.' },
            selector: { type: 'string', description: 'CSS selector fallback when node_id is unavailable.' },
            name: { type: 'string', description: 'Name attribute fallback.' },
            label: { type: 'string', description: 'Human-readable label for logging and responses.' },
            type: {
              type: 'string',
              enum: ['text', 'email', 'password', 'tel', 'number', 'date', 'checkbox', 'radio', 'select', 'textarea'],
              description: 'Optional hint for input handling.',
            },
            value: { description: 'Value to apply to the field; must be JSON-serializable.' },
            trigger: { type: 'string', enum: ['input', 'change', 'blur'], description: 'Event to dispatch after applying the value.' },
            commit: { type: 'string', enum: ['none', 'enter'], description: 'Whether to append an Enter keystroke after filling.' },
          },
          required: ['value'],
        },
      },
      metadata: {
        type: 'object',
        description: 'Free-form metadata echoed back in the fill_form response.',
        additionalProperties: true,
      },
      submit: {
        type: 'object',
        description: 'Optional instructions for post-fill submission behaviour.',
        properties: {
          mode: { type: 'string', enum: ['none', 'click', 'commit'] },
          delay_ms: { type: 'number', description: 'Optional delay before triggering submission.' },
        },
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
          'form_fill',
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
   * Override execute to inject action into metadata
   */
  async execute(request: BaseToolRequest, options?: BaseToolOptions): Promise<any> {
    const typedRequest = request as DOMToolRequest;

    // Inject action into metadata so it's available in the response
    const enrichedOptions = {
      ...options,
      metadata: {
        ...options?.metadata,
        action: typedRequest.action,
      },
    };

    return super.execute(request, enrichedOptions);
  }

  /**
   * Execute DOM tool action - routes to v3.0 implementation
   */
  protected async executeImpl(
    request: BaseToolRequest,
    options?: BaseToolOptions
  ): Promise<SerializedDom | ActionResult | FillFormResult> {
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

    // Route by action type - return raw data, BaseTool.execute() will wrap it
    switch (typedRequest.action) {
      case 'snapshot':
        return await this.executeSnapshot(tabId, typedRequest.options);
      case 'click':
        return await this.executeClick(tabId, typedRequest.node_id!, typedRequest.options);
      case 'type':
        return await this.executeType(tabId, typedRequest.node_id!, typedRequest.text!, typedRequest.options);
      case 'keypress':
        return await this.executeKeypress(tabId, typedRequest.key!, typedRequest.options);
      case 'fill_form':
        return await this.executeFillForm(tabId, typedRequest);
      default:
        throw new Error(`Unknown action: ${typedRequest.action}`);
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

    // Always use CDP-based implementation (content-script implementation removed)
    const domService = await DomService.forTab(tabId);
    return await domService.getSerializedDom();
  }

  /**
   * Execute click action
   */
  private async executeClick(
    tabId: number,
    nodeId: number,
    options?: ClickOptions
  ): Promise<ActionResult> {
    this.log('debug', 'Executing click', { tabId, nodeId, options });

    // Always use CDP-based implementation (content-script implementation removed)
    const domService = await DomService.forTab(tabId);
    return await domService.click(nodeId);
  }

  /**
   * Execute type action
   */
  private async executeType(
    tabId: number,
    nodeId: number,
    text: string,
    options?: TypeOptions
  ): Promise<ActionResult> {
    this.log('debug', 'Executing type', { tabId, nodeId, text, options });

    // Always use CDP-based implementation (content-script implementation removed)
    const domService = await DomService.forTab(tabId);
    return await domService.type(nodeId, text);
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

    // Always use CDP-based implementation (content-script implementation removed)
    const domService = await DomService.forTab(tabId);
    // Extract modifiers from options if present
    const modifiers = options?.modifiers
      ? Object.entries(options.modifiers)
          .filter(([_, enabled]) => enabled)
          .map(([mod]) => mod.charAt(0).toUpperCase() + mod.slice(1))
      : undefined;
    return await domService.keypress(key, modifiers);
  }

  /**
   * Execute fill_form action
   */
  private async executeFillForm(
    tabId: number,
    request: DOMToolRequest
  ): Promise<FillFormResult> {
    this.log('debug', 'Executing fill_form', {
      tabId,
      fieldCount: request.fields?.length ?? 0,
      scoped: Boolean(request.form_selector),
    });

    const domService = await DomService.forTab(tabId);
    return await domService.fillForm({
      fields: request.fields ?? [],
      formSelector: request.form_selector,
      submit: request.submit,
      metadata: request.metadata,
    });
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
    if (!['snapshot', 'click', 'type', 'keypress', 'fill_form'].includes(req.action)) {
      return `Invalid action: ${req.action}. Must be one of: snapshot, click, type, keypress, fill_form`;
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
        if (req.node_id === undefined || typeof req.node_id !== 'number') {
          return 'node_id is required for click action and must be a number';
        }
        if (!Number.isInteger(req.node_id)) {
          return 'node_id must be an integer';
        }
        return null;

      case 'type':
        if (req.node_id === undefined || typeof req.node_id !== 'number') {
          return 'node_id is required for type action and must be a number';
        }
        if (!Number.isInteger(req.node_id)) {
          return 'node_id must be an integer';
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

      case 'fill_form':
        if (!Array.isArray(req.fields) || req.fields.length === 0) {
          return 'fields is required for fill_form action and must contain at least one entry';
        }

        for (const [index, field] of req.fields.entries()) {
          if (field == null || typeof field !== 'object') {
            return `fields[${index}] must be an object`;
          }

          if (!('value' in field)) {
            return `fields[${index}] is missing value property`;
          }

          const hasIdentifier =
            typeof field.node_id === 'number' ||
            typeof field.selector === 'string' ||
            typeof field.name === 'string';

          if (!hasIdentifier) {
            return `fields[${index}] must include node_id, selector, or name`;
          }

          if (
            field.trigger !== undefined &&
            !['input', 'change', 'blur'].includes(field.trigger)
          ) {
            return `fields[${index}].trigger must be one of: input, change, blur`;
          }

          if (
            field.commit !== undefined &&
            !['none', 'enter'].includes(field.commit)
          ) {
            return `fields[${index}].commit must be one of: none, enter`;
          }
        }

        if (req.submit) {
          if (typeof req.submit !== 'object') {
            return 'submit must be an object when provided';
          }

          if (
            req.submit.mode !== undefined &&
            !['none', 'click', 'commit'].includes(req.submit.mode)
          ) {
            return 'submit.mode must be one of: none, click, commit';
          }

          if (
            req.submit.delay_ms !== undefined &&
            (typeof req.submit.delay_ms !== 'number' || req.submit.delay_ms < 0)
          ) {
            return 'submit.delay_ms must be a non-negative number';
          }
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
