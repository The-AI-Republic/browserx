/**
 * DOM Tool v2.0 - High-Level DOM Reading
 *
 * Refactored to provide a single high-level `captureDOM()` operation
 * that captures complete page snapshots for AI agent consumption.
 *
 * BREAKING CHANGE: Removed all atomic operations (query, click, type, etc.)
 * in favor of comprehensive DOM capture with selector_map for element lookup.
 */

import { BaseTool, createToolDefinition, type BaseToolRequest, type BaseToolOptions, type ToolDefinition } from './BaseTool';
import { DomService, DOMServiceError, DOMServiceErrorCode } from './dom/service';
import { DOMTreeSerializer } from './dom/serializer/serializer';
import { DEFAULT_INCLUDE_ATTRIBUTES } from './dom/views';
import { z } from 'zod';
import type {
  DOMCaptureRequest,
  DOMCaptureResponse,
  SerializedDOMState
} from '../types/domTool';
import { DOMErrorCode } from '../types/domTool';
import { MessageType } from '../core/MessageRouter';
import type { DOMCaptureRequestMessage, DOMCaptureResponseMessage, toContentOptions } from '../types/domMessages';

/**
 * Cache entry for DOM states
 */
interface CacheEntry {
  state: SerializedDOMState;
  timestamp: number;
  url: string;
}

/**
 * DOM Tool v2.0 Implementation
 *
 * Provides high-level DOM reading through a single captureDOM() method.
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
  private cache: Map<string, CacheEntry> = new Map();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds
  private readonly CACHE_MAX_ENTRIES = 5; // LRU eviction

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
      // Use new implementation
      return await this.captureInteractionContent(request);

      // Old implementation (commented out)
      // return await this.captureDOM(request);
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
   * Capture complete DOM state from a tab
   *
   * This is the primary method of DOMTool v2.0. It captures a comprehensive
   * snapshot of the DOM including structure, styles, accessibility attributes,
   * iframes, and shadow DOM. Returns both a serialized tree (for LLM consumption)
   * and a selector_map (for direct element detail lookup).
   *
   * @param request - Capture options including tab_id, filtering options, and caching
   * @param request.tab_id - Tab ID to capture from (undefined = active tab)
   * @param request.include_shadow_dom - Include shadow DOM trees (default: true)
   * @param request.include_iframes - Include iframe content (default: true)
   * @param request.max_iframe_depth - Maximum iframe nesting depth (default: 3, max: 10)
   * @param request.max_iframe_count - Maximum total iframe count (default: 15, max: 50)
   * @param request.paint_order_filtering - Remove elements occluded by paint order (default: true)
   * @param request.bbox_filtering - Remove off-screen elements (default: true)
   * @param request.timeout_ms - Capture timeout in milliseconds (default: 5000, max: 30000)
   * @param request.use_cache - Use cached DOM state if valid (default: true)
   * @param request.include_timing - Include performance timing information (default: false)
   *
   * @returns Promise resolving to DOMCaptureResponse with success flag and either dom_state or error
   *
   * @throws {Error} Validation error if request parameters are invalid
   * @throws {DOMServiceError} TAB_NOT_FOUND if tab_id doesn't exist
   * @throws {DOMServiceError} CONTENT_SCRIPT_NOT_LOADED if content script injection fails
   * @throws {DOMServiceError} TIMEOUT if capture exceeds timeout_ms
   * @throws {DOMServiceError} PERMISSION_DENIED if required permissions missing
   *
   * @example
   * // Capture DOM from active tab with default settings
   * const result = await domTool.captureDOM({});
   * if (result.success) {
   *   console.log('Captured', result.dom_state.metadata.total_nodes, 'nodes');
   *   console.log('Interactive elements:', Object.keys(result.dom_state.selector_map).length);
   * }
   *
   * @example
   * // Capture specific tab with custom options
   * const result = await domTool.captureDOM({
   *   tab_id: 123,
   *   include_iframes: false,
   *   timeout_ms: 10000,
   *   include_timing: true
   * });
   *
   * @example
   * // Lookup element details using selector_map
   * const result = await domTool.captureDOM({});
   * if (result.success) {
   *   const element = result.dom_state.selector_map[1];
   *   console.log('Element:', element.node_name, element.attributes);
   *   console.log('Position:', element.absolute_position);
   * }
   */
  async captureDOM(request: DOMCaptureRequest): Promise<DOMCaptureResponse> {
    // Validate request
    const validatedRequest = this.validateRequest(request);

    // Get target tab
    const targetTab = validatedRequest.tab_id
      ? await this.validateTabId(validatedRequest.tab_id)
      : await this.getActiveTab();

    const tabId = targetTab.id!;

    // Check cache if enabled
    if (validatedRequest.use_cache !== false) {
      const cached = this.getCachedState(tabId, targetTab.url || '');
      if (cached) {
        this.log('debug', `Returning cached DOM state for tab ${tabId}`);
        return {
          success: true,
          dom_state: cached
        };
      }
    }

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
      validatedRequest.paint_order_filtering !== false,
      validatedRequest.max_iframe_count || 15,
      validatedRequest.max_iframe_depth || 3
    );

    try {
      // Capture DOM state through DomService
      const startTime = performance.now();
      const serializedState = await this.domService.get_serialized_dom_tree();
      const totalTime = performance.now() - startTime;

      // Add timing if requested
      if (validatedRequest.include_timing) {
        (serializedState as any).timing = {
          ...(serializedState as any).timing,
          total_ms: totalTime
        };
      }

      const serialized_tree = DOMTreeSerializer.serialize_tree(
        (serializedState as any)._root || null,
        DEFAULT_INCLUDE_ATTRIBUTES
      );

      return {
        success: true,
        dom_state: {
          serialized_tree,
          selector_map: (serializedState as any).selector_map || {},
          metadata: {
            capture_timestamp: Date.now(),
            page_url: targetTab.url || '',
            page_title: targetTab.title || '',
            viewport: {
              width: 0,
              height: 0,
              device_pixel_ratio: 1,
              scroll_x: 0,
              scroll_y: 0,
              visible_width: 0,
              visible_height: 0
            },
            total_nodes: 0,
            interactive_elements: Object.keys((serializedState as any).selector_map || {}).length,
            iframe_count: 0,
            max_depth: 0
          }
        }
      };
    } catch (error) {
      throw error; // Will be handled by handleCaptureError
    }
  }

  /**
   * Clear cached DOM states
   *
   * Removes cached DOM snapshots to force fresh captures on next request.
   * Useful when you know the page has changed and want to bypass the cache.
   *
   * Cache entries are automatically invalidated after 30 seconds (CACHE_TTL_MS)
   * or when the URL changes, but this method allows manual cache management.
   *
   * @param tab_id - Optional tab ID to clear cache for specific tab (undefined = clear all caches)
   *
   * @example
   * // Clear cache for specific tab
   * domTool.clearCache(123);
   *
   * @example
   * // Clear all caches
   * domTool.clearCache();
   */
  clearCache(tab_id?: number): void {
    if (tab_id !== undefined) {
      // Clear cache for specific tab
      const keysToDelete: string[] = [];
      for (const [key] of this.cache) {
        if (key.startsWith(`${tab_id}_`)) {
          keysToDelete.push(key);
        }
      }
      for (const key of keysToDelete) {
        this.cache.delete(key);
      }
      this.log('debug', `Cleared cache for tab ${tab_id}`);
    } else {
      // Clear entire cache
      this.cache.clear();
      this.log('debug', 'Cleared entire DOM cache');
    }
  }

  /**
   * Validate and parse request
   */
  private validateRequest(request: DOMCaptureRequest): DOMCaptureRequest {
    // Define Zod schema for validation
    const schema = z.object({
      tab_id: z.number().int().nonnegative().optional(),
      include_shadow_dom: z.boolean().optional(),
      include_iframes: z.boolean().optional(),
      max_iframe_depth: z.number().int().min(0).max(10).optional(),
      max_iframe_count: z.number().int().min(0).max(50).optional(),
      paint_order_filtering: z.boolean().optional(),
      bbox_filtering: z.boolean().optional(),
      timeout_ms: z.number().int().min(100).max(30000).optional(),
      use_cache: z.boolean().optional(),
      include_timing: z.boolean().optional()
    });

    try {
      return schema.parse(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ');
        throw new Error(`Invalid request: ${issues}`);
      }
      throw error;
    }
  }

  /**
   * Get cached DOM state if valid
   */
  private getCachedState(tabId: number, url: string): SerializedDOMState | null {
    const cacheKey = this.generateCacheKey(tabId, url);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      return null;
    }

    // Check TTL
    const age = Date.now() - entry.timestamp;
    if (age > this.CACHE_TTL_MS) {
      this.cache.delete(cacheKey);
      return null;
    }

    // Check URL hasn't changed
    if (entry.url !== url) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.state;
  }

  /**
   * Cache DOM state with LRU eviction
   */
  private cacheState(tabId: number, url: string, state: SerializedDOMState): void {
    const cacheKey = this.generateCacheKey(tabId, url);

    // LRU eviction - remove oldest entry if at max capacity
    if (this.cache.size >= this.CACHE_MAX_ENTRIES && !this.cache.has(cacheKey)) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(cacheKey, {
      state,
      timestamp: Date.now(),
      url
    });
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(tabId: number, url: string): string {
    // Simple key: tab_id + URL hash
    const urlHash = url.split('?')[0]; // Ignore query params
    return `${tabId}_${urlHash}`;
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
   * Send DOM capture request to content script with timeout handling
   *
   * Implements T027: Message sender with timeout and error handling
   */
  private async sendCaptureRequest(
    tabId: number,
    request: DOMCaptureRequest,
    timeoutMs: number
  ): Promise<DOMCaptureResponseMessage> {
    // Generate unique request ID for correlation
    const requestId = `dom_capture_${tabId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Build request message
    const requestMessage: DOMCaptureRequestMessage = {
      type: 'DOM_CAPTURE_REQUEST',
      request_id: requestId,
      options: request,
      timeout_ms: timeoutMs,
    };

    // Send message with timeout
    return new Promise<DOMCaptureResponseMessage>((resolve, reject) => {
      // Set timeout
      const timeoutHandle = setTimeout(() => {
        reject(new DOMServiceError(
          DOMServiceErrorCode.TIMEOUT,
          `DOM capture timed out after ${timeoutMs}ms`,
          { tab_id: tabId, request_id: requestId }
        ));
      }, timeoutMs);

      // Send message to content script
      chrome.tabs.sendMessage(
        tabId,
        {
          type: MessageType.DOM_CAPTURE_REQUEST,
          payload: requestMessage,
        },
        (response) => {
          clearTimeout(timeoutHandle);

          // Handle chrome.runtime.lastError
          if (chrome.runtime.lastError) {
            reject(new DOMServiceError(
              DOMServiceErrorCode.CONTENT_SCRIPT_NOT_LOADED,
              chrome.runtime.lastError.message || 'Content script communication failed',
              { tab_id: tabId, request_id: requestId }
            ));
            return;
          }

          // Handle response
          if (!response) {
            reject(new DOMServiceError(
              DOMServiceErrorCode.INVALID_RESPONSE,
              'No response from content script',
              { tab_id: tabId, request_id: requestId }
            ));
            return;
          }

          const captureResponse = response as DOMCaptureResponseMessage;

          // Validate response
          if (captureResponse.request_id !== requestId) {
            reject(new DOMServiceError(
              DOMServiceErrorCode.INVALID_RESPONSE,
              'Response request_id does not match',
              { tab_id: tabId, expected: requestId, received: captureResponse.request_id }
            ));
            return;
          }

          resolve(captureResponse);
        }
      );
    });
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
