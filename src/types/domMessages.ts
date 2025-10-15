/**
 * DOM Capture Message Protocol Types
 *
 * Defines message structure for background ↔ content script communication
 * during DOM capture operations.
 */

import type { DOMCaptureRequest } from './domTool';
import type { ContentScriptCaptureReturns, ViewportInfo } from '../tools/dom/views';

/**
 * DOM Capture Request Message
 *
 * Sent from background script (DOMTool) to content script to request DOM capture.
 */
export interface DOMCaptureRequestMessage {
  type: 'DOM_CAPTURE_REQUEST';
  request_id: string;
  options: DOMCaptureRequest;
  timeout_ms?: number;
}

/**
 * DOM Capture Response Message
 *
 * Sent from content script back to background script with captured DOM data.
 */
export interface DOMCaptureResponseMessage {
  type: 'DOM_CAPTURE_RESPONSE';
  request_id: string;
  success: boolean;
  snapshot?: ContentScriptCaptureReturns;
  viewport?: ViewportInfo;
  timing?: {
    startTime: number;
    traversalTime: number;
    totalTime: number;
  };
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  warnings?: Array<{
    code: string;
    message: string;
    element?: string;
  }>;
}

/**
 * DOM Capture Request Options
 *
 * Subset of DOMCaptureRequest used for content script capture logic.
 */
export interface DOMCaptureContentOptions {
  includeShadowDOM?: boolean;
  includeIframes?: boolean;
  maxIframeDepth?: number;
  maxIframeCount?: number;
  skipHiddenElements?: boolean;
}

/**
 * Convert DOMCaptureRequest to content-compatible options
 */
export function toContentOptions(request: DOMCaptureRequest): DOMCaptureContentOptions {
  return {
    includeShadowDOM: request.include_shadow_dom,
    includeIframes: request.include_iframes,
    maxIframeDepth: request.max_iframe_depth,
    maxIframeCount: request.max_iframe_count,
    skipHiddenElements: request.bbox_filtering, // bbox filtering implies skipping hidden elements
  };
}
