/**
 * DOM Tool API Types
 *
 * This file defines the types for the refactored DOMTool v2.0.
 * These types define the public API for high-level DOM reading operations.
 *
 * Version: 2.0.0
 * Breaking changes from 1.x: Removed atomic operations (query, click, type, etc.)
 */

// =============================================================================
// REQUEST TYPES
// =============================================================================

/**
 * Request to capture complete DOM state from a tab
 */
export interface DOMCaptureRequest {
  /** Tab ID to capture from (undefined = active tab) */
  tab_id?: number;

  /** Include shadow DOM trees (default: true) */
  include_shadow_dom?: boolean;

  /** Include iframe content (default: true) */
  include_iframes?: boolean;

  /** Maximum iframe nesting depth (default: 3, max: 10) */
  max_iframe_depth?: number;

  /** Maximum total iframe count (default: 15, max: 50) */
  max_iframe_count?: number;

  /** Remove elements occluded by paint order (default: true) */
  paint_order_filtering?: boolean;

  /** Remove off-screen elements (default: true) */
  bbox_filtering?: boolean;

  /** Capture timeout in milliseconds (default: 5000, max: 30000) */
  timeout_ms?: number;

  /** Use cached DOM state if valid (default: true) */
  use_cache?: boolean;

  /** Include performance timing information (default: false) */
  include_timing?: boolean;
}

// =============================================================================
// RESPONSE TYPES
// =============================================================================

/**
 * Response from DOM capture operation
 */
export interface DOMCaptureResponse {
  /** Whether capture succeeded */
  success: boolean;

  /** Serialized DOM state (present on success) */
  dom_state?: SerializedDOMState;

  /** Error details (present on failure) */
  error?: DOMCaptureError;

  /** Non-fatal warnings */
  warnings?: DOMCaptureWarning[];
}

// =============================================================================
// CORE DATA STRUCTURES
// =============================================================================

/**
 * Complete serialized DOM state suitable for LLM consumption
 */
export interface SerializedDOMState {
  /**
   * Serialized tree as formatted string with element indices
   * Example:
   *   [1] <button class="primary">Submit</button>
   *   [2] <input type="text" placeholder="Name" />
   *   <div>
   *     [3] <a href="/home">Home</a>
   *   </div>
   */
  serialized_tree: string;

  /**
   * Mapping from element index to full node details
   * Allows agent to look up details for interactive elements
   */
  selector_map: { [index: number]: EnhancedDOMTreeNode };

  /** Metadata about the captured page */
  metadata: DOMCaptureMetadata;

  /** Performance timing information (if requested) */
  timing?: DOMCaptureTiming;

  /** Errors encountered during capture */
  errors?: DOMCaptureError[];

  /** Non-fatal warnings */
  warnings?: DOMCaptureWarning[];
}

/**
 * Metadata about a captured DOM state
 */
export interface DOMCaptureMetadata {
  /** When the DOM was captured (Unix timestamp ms) */
  capture_timestamp: number;

  /** Page URL */
  page_url: string;

  /** Page title */
  page_title: string;

  /** Viewport information */
  viewport: ViewportInfo;

  /** Total number of DOM nodes captured */
  total_nodes: number;

  /** Number of interactive elements (with indices) */
  interactive_elements: number;

  /** Number of iframes included */
  iframe_count: number;

  /** Maximum tree depth encountered */
  max_depth: number;
}

/**
 * Performance timing information
 */
export interface DOMCaptureTiming {
  /** Time spent traversing DOM in content script */
  dom_traversal_ms: number;

  /** Time spent serializing tree */
  serialization_ms: number;

  /** Total capture time */
  total_ms: number;

  /** Individual phase timings */
  phases?: {
    create_simplified_tree?: number;
    calculate_paint_order?: number;
    optimize_tree?: number;
    bbox_filtering?: number;
    assign_indices?: number;
    serialize_tree?: number;
  };
}

/**
 * Rich representation of a single DOM node
 */
export interface EnhancedDOMTreeNode {
  // Core DOM properties
  node_id: number;
  backend_node_id: number;
  node_type: NodeType;
  node_name: string;
  node_value: string;
  attributes: Record<string, string>;

  // Computed properties
  is_visible: boolean | null;
  is_scrollable: boolean | null;
  absolute_position: DOMRect | null;

  // Context
  target_id: string;
  frame_id: string | null;
  session_id: string | null;

  // Tree structure
  parent_node: EnhancedDOMTreeNode | null;
  children_nodes: EnhancedDOMTreeNode[] | null;
  content_document: EnhancedDOMTreeNode | null;
  shadow_roots: EnhancedDOMTreeNode[] | null;
  shadow_root_type: ShadowRootType | null;

  // Enrichment
  ax_node: EnhancedAXNode | null;
  snapshot_node: EnhancedSnapshotNode | null;

  // Indexing
  element_index: number | null;

  // Internal
  uuid: string;
}

/**
 * Accessibility information for a DOM element
 */
export interface EnhancedAXNode {
  ax_node_id: string;
  ignored: boolean;
  role: string | null;
  name: string | null;
  description: string | null;
  properties: Array<{ name: string; value: any }> | null;
  child_ids: string[] | null;
}

/**
 * Snapshot data captured from live DOM
 */
export interface EnhancedSnapshotNode {
  bounds: DOMRect | null;
  computed_styles: Record<string, string>;
  text_value: string | null;
  input_value: string | null;
  is_clickable: boolean;
  current_source_url: string | null;
  scroll_offset_x: number | null;
  scroll_offset_y: number | null;
  layout_node_index: number | null;
  paint_order: number | null;
}

/**
 * Viewport dimensions and device information
 */
export interface ViewportInfo {
  width: number;
  height: number;
  device_pixel_ratio: number;
  scroll_x: number;
  scroll_y: number;
  visible_width: number;
  visible_height: number;
}

/**
 * Bounding box coordinates
 */
export interface DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// =============================================================================
// ERROR AND WARNING TYPES
// =============================================================================

/**
 * Error from DOM capture operation
 */
export interface DOMCaptureError {
  code: DOMErrorCode;
  message: string;
  element?: string;
  details?: any;
}

/**
 * Non-fatal warning from DOM capture
 */
export interface DOMCaptureWarning {
  type: DOMWarningType;
  message: string;
  element?: string;
}

/**
 * Error codes for DOM capture failures
 */
export enum DOMErrorCode {
  TIMEOUT = 'TIMEOUT',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TAB_NOT_FOUND = 'TAB_NOT_FOUND',
  CONTENT_SCRIPT_NOT_LOADED = 'CONTENT_SCRIPT_NOT_LOADED',
  CROSS_ORIGIN_FRAME = 'CROSS_ORIGIN_FRAME',
  MESSAGE_SIZE_EXCEEDED = 'MESSAGE_SIZE_EXCEEDED',
  INVALID_ELEMENT_INDEX = 'INVALID_ELEMENT_INDEX',
  CACHE_MISS = 'CACHE_MISS',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Warning types for non-fatal issues
 */
export enum DOMWarningType {
  DEPTH_LIMIT_REACHED = 'DEPTH_LIMIT_REACHED',
  COUNT_LIMIT_REACHED = 'COUNT_LIMIT_REACHED',
  SIZE_LIMIT_REACHED = 'SIZE_LIMIT_REACHED',
  CROSS_ORIGIN_IFRAME_SKIPPED = 'CROSS_ORIGIN_IFRAME_SKIPPED',
  PARTIAL_ACCESSIBILITY_DATA = 'PARTIAL_ACCESSIBILITY_DATA'
}

// =============================================================================
// ENUMS
// =============================================================================

/**
 * DOM node types (W3C specification)
 */
export enum NodeType {
  ELEMENT_NODE = 1,
  ATTRIBUTE_NODE = 2,
  TEXT_NODE = 3,
  CDATA_SECTION_NODE = 4,
  ENTITY_REFERENCE_NODE = 5,
  ENTITY_NODE = 6,
  PROCESSING_INSTRUCTION_NODE = 7,
  COMMENT_NODE = 8,
  DOCUMENT_NODE = 9,
  DOCUMENT_TYPE_NODE = 10,
  DOCUMENT_FRAGMENT_NODE = 11,
  NOTATION_NODE = 12
}

/**
 * Shadow root types
 */
export type ShadowRootType = 'open' | 'closed' | 'user-agent';

// =============================================================================
// CONSTANTS
// =============================================================================

export const DOM_TOOL_CONSTANTS = {
  /** Default configuration values */
  DEFAULTS: {
    MAX_IFRAME_DEPTH: 3,
    MAX_IFRAME_COUNT: 15,
    TIMEOUT_MS: 5000,
    CACHE_TTL_MS: 30000,
    CACHE_MAX_ENTRIES: 5
  },

  /** Limits */
  LIMITS: {
    MAX_SERIALIZED_SIZE_MB: 5,
    MAX_SELECTOR_MAP_ENTRIES: 10000,
    MAX_MESSAGE_SIZE_MB: 4,
    MAX_STRING_POOL_SIZE: 100000
  },

  /** Performance targets */
  PERFORMANCE_TARGETS: {
    SIMPLE_PAGE_MS: 500,    // <1000 nodes
    MEDIUM_PAGE_MS: 1000,   // 1000-5000 nodes
    COMPLEX_PAGE_MS: 2000,  // 5000-20000 nodes
    CACHE_HIT_MS: 100
  }
};
