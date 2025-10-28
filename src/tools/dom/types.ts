// Special nodeId constants for non-element targets
export const NODE_ID_WINDOW = -1;
export const NODE_ID_DOCUMENT = -2;

/**
 * DOM Node Type Constants (from W3C DOM specification)
 * https://developer.mozilla.org/en-US/docs/Web/API/Node/nodeType
 */
export const NODE_TYPE_ELEMENT = 1;
export const NODE_TYPE_ATTRIBUTE = 2;
export const NODE_TYPE_TEXT = 3;
export const NODE_TYPE_CDATA_SECTION = 4;
export const NODE_TYPE_ENTITY_REFERENCE = 5; // Deprecated
export const NODE_TYPE_ENTITY = 6; // Deprecated
export const NODE_TYPE_PROCESSING_INSTRUCTION = 7;
export const NODE_TYPE_COMMENT = 8;
export const NODE_TYPE_DOCUMENT = 9;
export const NODE_TYPE_DOCUMENT_TYPE = 10;
export const NODE_TYPE_DOCUMENT_FRAGMENT = 11;
export const NODE_TYPE_NOTATION = 12; // Deprecated

// Core tree node
export interface VirtualNode {
  nodeId: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  localName?: string;
  nodeValue?: string;
  attributes?: string[];
  children?: VirtualNode[];
  frameId?: string;
  shadowRootType?: 'open' | 'closed';

  accessibility?: {
    role: string;
    name?: string;
    description?: string;
    value?: string | number;
    checked?: boolean;
    disabled?: boolean;
    expanded?: boolean;
    level?: number;
    required?: boolean;
  };

  tier: 'semantic' | 'non-semantic' | 'structural';
  interactionType?: 'click' | 'input' | 'select' | 'link';

  heuristics?: {
    hasOnClick: boolean;
    hasDataTestId: boolean;
    hasCursorPointer: boolean;
    isVisuallyInteractive: boolean;
  };

  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Snapshot cache
export interface DomSnapshot {
  virtualDom: VirtualNode;
  timestamp: Date;
  pageContext: PageContext;
  stats: SnapshotStats;
}

export interface PageContext {
  url: string;
  title: string;
  frameId: string;
  loaderId: string;
  viewport: { width: number; height: number };
  frameTree: FrameNode[];
  frameworkDetected?: string | null; // T069: Detected framework (react, vue, angular, etc.)
}

export interface FrameNode {
  frameId: string;
  url: string;
  parentFrameId?: string;
  childFrames?: FrameNode[];
}

export interface SnapshotStats {
  totalNodes: number;
  interactiveNodes: number;
  semanticNodes: number;
  nonSemanticNodes: number;
  structuralNodes: number;
  frameCount: number;
  shadowRootCount: number;
  snapshotDuration: number;
  serializationDuration?: number;
}

// Re-export types from canonical location for compatibility
export type {
  SerializedDom,
  SerializedNode,
  ActionResult
} from '../../types/domTool';

export interface FrameInfo {
  frameId: string;
  url: string;
  isMainFrame: boolean;
  parentFrameId?: string;
}

// Service config
export interface ServiceConfig {
  enableVisualEffects: boolean;
  maxTreeDepth: number;
  snapshotTimeout: number;
  retryAttempts: number;
}
