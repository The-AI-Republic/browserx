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
import { DomService, DOMServiceError, DOMServiceErrorCode } from './dom/service';
import type { DOMCaptureRequest, DOMCaptureResponse } from '../types/domTool';
import { DOMErrorCode } from '../types/domTool';
import { MessageType } from '../core/MessageRouter';
/**
 * DOM Tool v2.0 Implementation
 *
 * Provides high-level DOM reading through captureInteractionContent().
 */
export class DOMTool extends BaseTool {
  protected toolDefinition: ToolDefinition = createToolDefinition(
    'browser_dom',
    'Capture complete DOM state from web pages - high-level DOM reading for AI agents',
    {
      tab_id: {
        type: 'number',
        description: 'Tab ID to capture from (undefined = active tab)',
      },
      include_shadow_dom: {
        type: 'boolean',
        description: 'Include shadow DOM trees (default: true)',
      },
      include_iframes: {
        type: 'boolean',
        description: 'Include iframe content (default: true)',
      },
      max_iframe_depth: {
        type: 'number',
        description: 'Maximum iframe nesting depth (default: 3, max: 10)',
      },
      max_iframe_count: {
        type: 'number',
        description: 'Maximum total iframe count (default: 15, max: 50)',
      },
      paint_order_filtering: {
        type: 'boolean',
        description: 'Remove elements occluded by paint order (default: true)',
      },
      bbox_filtering: {
        type: 'boolean',
        description: 'Remove off-screen elements (default: true)',
      },
      timeout_ms: {
        type: 'number',
        description: 'Capture timeout in milliseconds (default: 5000, max: 30000)',
      },
      use_cache: {
        type: 'boolean',
        description: 'Use cached DOM state if valid (default: true)',
      },
      include_timing: {
        type: 'boolean',
        description: 'Include performance timing information (default: false)',
      },
    },
    {
      required: [],
      category: 'dom',
      version: '2.0.0',
      metadata: {
        capabilities: [
          'dom_capture',
          'serialized_tree',
          'selector_map',
          'accessibility_tree',
          'iframe_support',
          'shadow_dom_support',
          'caching'
        ],
        permissions: ['activeTab', 'scripting', 'webNavigation'],
      },
    }
  );

  private domService: DomService | null = null;

  constructor() {
    super();
  }

  /**
   * Execute DOM tool action - now uses captureInteractionContent
   */
  protected async executeImpl(request: DOMCaptureRequest, options?: BaseToolOptions): Promise<DOMCaptureResponse> {
    // Validate Chrome context
    this.validateChromeContext();

    // Validate required permissions
    await this.validatePermissions(['activeTab', 'scripting']);

    this.log('debug', 'Executing captureInteractionContent', request);

    try {
      return await this.captureInteractionContent(request);
    } catch (error) {
      return this.handleCaptureError(error, request);
    }
  }

  /**
   * Capture page interaction content using new captureInteractionContent() method
   *
   * This method uses the privacy-first, LLM-optimized interaction capture system
   * instead of the legacy full DOM tree capture.
   */
  private async captureInteractionContent(request: DOMCaptureRequest): Promise<DOMCaptureResponse> {
    // Get target tab
    const targetTab = request.tab_id
      ? await this.validateTabId(request.tab_id)
      : await this.getActiveTab();

    const tabId = targetTab.id!;

    // Ensure content script is injected
    await this.ensureContentScriptInjected(tabId);

    // Create DomService instance for this tab
    this.domService = new DomService(
      { tab_id: tabId },
      {
        log: (msg: string) => this.log('info', msg),
        error: (msg: string) => this.log('error', msg),
        warn: (msg: string) => this.log('warn', msg)
      },
      false, // cross_origin_iframes
      request.paint_order_filtering !== false,
      request.max_iframe_count || 15,
      request.max_iframe_depth || 3
    );

    // Capture interaction content
    const pageModel = await this.domService.captureInteractionContent({
      maxControls: 400,
      maxHeadings: 30,
      includeValues: false,
      maxIframeDepth: request.max_iframe_depth || 1
    });

    // Convert PageModel to DOMCaptureResponse format
    return this.convertPageModelToResponse(pageModel, targetTab);
  }

  /**
   * Convert PageModel to DOMCaptureResponse format
   *
   * Transforms the LLM-optimized PageModel into the expected DOMCaptureResponse
   * format used by the DOMTool interface.
   */
  private convertPageModelToResponse(pageModel: any, targetTab: chrome.tabs.Tab): DOMCaptureResponse {
    // Build serialized tree as a formatted string
    const serializedLines = [
      `Page: ${pageModel.title}`,
      `URL: ${pageModel.url || 'unknown'}`,
      '',
      '=== Headings ===',
      ...pageModel.headings.map((h: string, i: number) => `${i + 1}. ${h}`),
      '',
      '=== Regions ===',
      `Regions: ${pageModel.regions.join(', ')}`,
      '',
    ];

    // Add text content if available
    if (pageModel.textContent && pageModel.textContent.length > 0) {
      serializedLines.push('=== Text Content ===');
      pageModel.textContent.forEach((text: string, i: number) => {
        serializedLines.push(`[${i + 1}] ${text}`);
        serializedLines.push(''); // Empty line between blocks
      });
    }

    // Add interactive controls
    serializedLines.push('=== Interactive Controls ===');
    serializedLines.push(...pageModel.controls.map((ctrl: any) => {
      const states = [];
      if (ctrl.states.disabled) states.push('disabled');
      if (ctrl.states.checked) states.push('checked');
      if (ctrl.states.required) states.push('required');
      const stateStr = states.length > 0 ? ` [${states.join(', ')}]` : '';
      const region = ctrl.region ? ` (in ${ctrl.region})` : '';
      return `${ctrl.id}: ${ctrl.role} "${ctrl.name}"${stateStr}${region}`;
    }));

    // Build selector map from aimap
    const selectorMap: { [index: number]: any } = {};
    for (const [id, selector] of Object.entries(pageModel.aimap)) {
      const control = pageModel.controls.find((c: any) => c.id === id);
      if (control) {
        const index = parseInt(id.split('_')[1]);
        selectorMap[index] = {
          backend_node_id: index,
          node_name: control.role.toUpperCase(),
          attributes: {
            selector: selector,
            name: control.name,
            role: control.role,
            ...(control.states.placeholder && { placeholder: control.states.placeholder }),
            ...(control.states.href && { href: control.states.href })
          },
          absolute_position: control.boundingBox || { x: 0, y: 0, width: 0, height: 0 },
          is_visible: control.visible
        };
      }
    }

    // Return formatted response
    return {
      success: true,
      dom_state: {
        serialized_tree: serializedLines.join('\n'),
        selector_map: selectorMap,
        metadata: {
          capture_timestamp: Date.now(),
          page_url: pageModel.url || targetTab.url || '',
          page_title: pageModel.title,
          viewport: {
            width: 0,
            height: 0,
            device_pixel_ratio: 1,
            scroll_x: 0,
            scroll_y: 0,
            visible_width: 0,
            visible_height: 0
          },
          total_nodes: pageModel.controls.length,
          interactive_elements: pageModel.controls.length,
          iframe_count: 0,
          max_depth: 0
        }
      }
    };
  }

  /**
   * Handle capture errors
   */
  private handleCaptureError(error: any, request: DOMCaptureRequest): DOMCaptureResponse {
    // Safely extract error message to avoid circular reference issues
    let errorMessage = 'Unknown error';
    try {
      errorMessage = error?.message || String(error);
    } catch (e) {
      errorMessage = 'Error with circular references';
    }

    this.log('error', `DOM capture failed: ${errorMessage}`);

    // Map DOMServiceError to DOMCaptureError
    if (error instanceof DOMServiceError) {
      return {
        success: false,
        error: {
          code: this.mapServiceErrorCode(error.code),
          message: error.message,
          details: error.details
        }
      };
    }

    // Generic error
    return {
      success: false,
      error: {
        code: DOMErrorCode.UNKNOWN_ERROR,
        message: errorMessage,
        details: { error_type: error?.constructor?.name || 'unknown' }
      }
    };
  }

  /**
   * Map DOMServiceErrorCode to public error code
   */
  private mapServiceErrorCode(code: DOMServiceErrorCode): DOMErrorCode {
    const mapping: Record<DOMServiceErrorCode, DOMErrorCode> = {
      [DOMServiceErrorCode.TAB_NOT_FOUND]: DOMErrorCode.TAB_NOT_FOUND,
      [DOMServiceErrorCode.CONTENT_SCRIPT_NOT_LOADED]: DOMErrorCode.CONTENT_SCRIPT_NOT_LOADED,
      [DOMServiceErrorCode.TIMEOUT]: DOMErrorCode.TIMEOUT,
      [DOMServiceErrorCode.PERMISSION_DENIED]: DOMErrorCode.PERMISSION_DENIED,
      [DOMServiceErrorCode.INVALID_RESPONSE]: DOMErrorCode.UNKNOWN_ERROR,
      [DOMServiceErrorCode.UNKNOWN_ERROR]: DOMErrorCode.UNKNOWN_ERROR
    };

    return mapping[code] || DOMErrorCode.UNKNOWN_ERROR;
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
}
