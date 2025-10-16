/**
 * Core types for web page action execution
 * Based on data-model.md specification
 */

// Action types
export type ActionType = 'click' | 'input' | 'scroll' | 'verify';

// Element identification and context
export interface ElementTarget {
  selector?: string;
  nodeId?: number;
  semanticDescription?: string;
  context?: ElementContext;
}

export interface ElementContext {
  iframeDepth: number;
  iframePath: string[]; // Array of iframe selectors from root to target
  shadowDomPath: string[]; // Array of shadow host selectors
  frameId?: number; // Chrome frame ID
}

// Action-specific parameters
export interface ClickParameters {
  clickType?: 'left' | 'right' | 'middle' | 'double';
  modifiers?: ('ctrl' | 'shift' | 'alt' | 'meta')[];
  waitForNavigation?: boolean;
}

export interface InputParameters {
  text: string;
  clearFirst?: boolean; // Default: true
  pressEnter?: boolean; // Default: false
  typeSpeed?: number; // Characters per second, 0 = instant
}

export interface ScrollParameters {
  scrollType: 'by-pixels' | 'to-element' | 'to-position';
  pixels?: { x: number; y: number }; // For 'by-pixels'
  position?: 'top' | 'bottom' | 'center'; // For 'to-element'
  smooth?: boolean; // Default: true
  waitForLazyLoad?: boolean; // Default: true
  lazyLoadTimeout?: number; // Default: 2000ms
}

export interface VerifyParameters {
  checkType: 'visible' | 'enabled' | 'exists' | 'value';
  expectedValue?: string; // For 'value' check
}

export type ActionParameters =
  | ClickParameters
  | InputParameters
  | ScrollParameters
  | VerifyParameters;

// Retry configuration
export interface RetryConfig {
  maxAttempts: number;
  delays: number[];
  retryableErrors: ErrorCode[];
  onRetry?: (attempt: number, error: ActionError) => void;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delays: [100, 300, 900],
  retryableErrors: [
    'ELEMENT_NOT_INTERACTABLE',
    'ELEMENT_STALE',
    'ELEMENT_OBSCURED',
    'TIMEOUT'
  ]
};

// Action command
export interface ActionCommand {
  type: ActionType;
  targetElement: ElementTarget;
  parameters: ActionParameters;
  sessionId: string;
  turnId: string;
  timeout?: number;
  retryConfig?: RetryConfig;
}

// Detected changes after action
export interface DetectedChanges {
  navigationOccurred: boolean;
  domMutations: number; // Count of DOM mutations observed
  newUrl?: string; // If navigation occurred
  scrollPositionChanged: boolean;
  scrollPosition?: { x: number; y: number };
  valueChanged: boolean; // For input actions
  newValue?: string;
}

// Error types
export type ErrorCode =
  | 'ELEMENT_NOT_FOUND'
  | 'ELEMENT_NOT_INTERACTABLE'
  | 'ELEMENT_STALE'
  | 'ELEMENT_OBSCURED'
  | 'TIMEOUT'
  | 'NAVIGATION_BLOCKED'
  | 'CROSS_ORIGIN_DENIED'
  | 'VALIDATION_FAILED'
  | 'UNKNOWN_ERROR';

export type ErrorCategory =
  | 'element_location'
  | 'element_state'
  | 'execution'
  | 'validation'
  | 'security';

export interface ActionError {
  code: ErrorCode;
  message: string;
  category: ErrorCategory;
  details?: any;
  suggestion?: string;
  recoverable: boolean;
}

// Action execution result
export interface ActionExecutionResult {
  success: boolean;
  actionCommand: ActionCommand;
  timestamp: string;
  duration: number;
  attemptsCount: number;
  detectedChanges: DetectedChanges;
  error?: ActionError;
  metadata?: Record<string, any>;
}

// Action history entry
export interface ActionHistoryEntry {
  id: string;
  sessionId: string;
  result: ActionExecutionResult;
  timestamp: string;
  sequence: number;
}

// Extended DOM Selector Map
export interface SelectorMapEntry {
  backend_node_id: number;
  node_name: string;
  attributes: {
    selector?: string;
    name?: string;
    role?: string;
  };
  absolute_position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  is_visible: boolean;
}

export interface ContextInfo {
  nodeId: number;
  inIframe: boolean;
  iframeDepth: number;
  iframePath: string[];
  inShadowDom: boolean;
  shadowDomPath: string[];
  frameId?: number;
}

export interface FrameTreeNode {
  frameId: number;
  url: string;
  selector: string;
  children: FrameTreeNode[];
}

export interface ShadowRootInfo {
  hostNodeId: number;
  hostSelector: string;
  mode: 'open' | 'closed';
}

export interface DOMSelectorMap {
  serialized_tree: string;
  selector_map: Record<string, SelectorMapEntry>;
  contextInfo?: Map<number, ContextInfo>;
  frameTree?: FrameTreeNode;
  shadowRoots?: Map<number, ShadowRootInfo>;
  metadata: {
    capture_timestamp: number;
    page_url: string;
    page_title?: string;
    viewport?: any;
    total_nodes: number;
    interactive_elements: number;
    iframe_count?: number;
    shadow_dom_count?: number;
  };
}

// Tool request/response types
export interface PageActionToolRequest {
  action: ActionCommand;
  selectorMap?: DOMSelectorMap;
  tabId?: number;
}

export interface PageActionToolResponse {
  success: boolean;
  data?: {
    result: ActionExecutionResult;
    updatedSelectorMap?: DOMSelectorMap;
  };
  error?: string;
  metadata?: {
    duration: number;
    toolName: string;
    tabId?: number;
    retryCount?: number;
  };
}
