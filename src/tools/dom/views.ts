/**
 * TypeScript interfaces and types converted from Python dataclasses in browser_use/dom/views.py
 * This file contains all DOM-related data structures and CDP type definitions.
 */

// =============================================================================
// ENUMS
// =============================================================================

/**
 * DOM Node types following the W3C specification
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

// =============================================================================
// TYPE ALIASES
// =============================================================================

// Maps XPath (string) to interactive element index (number)
export type DOMSelectorMap = { [xpath: string]: number };
export type TargetID = string;
export type SessionID = string;
export type ShadowRootType = 'open' | 'closed' | 'user-agent';
export type AXPropertyName = string;  // CDP defined type
export type ArrayOfStrings = string[];

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default attributes to include in serialization */
export const DEFAULT_INCLUDE_ATTRIBUTES = ['class', 'aria-label', 'placeholder', 'value', 'href'];

/** Static attributes that can be cached */
export const STATIC_ATTRIBUTES = ['id', 'class', 'role', 'type', 'name', 'placeholder', 'aria-role'];

/** Elements to skip during processing */
export const DISABLED_ELEMENTS = ['head', 'style', 'script', 'noscript', '#comment'];

/** Required computed styles from enhanced_snapshot.py */
export const REQUIRED_COMPUTED_STYLES = [
  'display',
  'visibility',
  'opacity',
  'overflow',
  'overflow-x',
  'overflow-y',
  'cursor',
  'pointer-events',
  'position',
  'background-color'
];

/** Propagating elements from serializer.py */
export const PROPAGATING_ELEMENTS: Array<{ tag: string; role?: string | null }> = [
  { tag: 'a', role: null },
  { tag: 'button', role: null }
];

/** Default containment threshold */
export const DEFAULT_CONTAINMENT_THRESHOLD = 0.99;

// =============================================================================
// CDP TYPE DEFINITIONS
// =============================================================================

/**
 * Target information from CDP
 */
export interface TargetInfo {
  targetId: string;
  type: string;
  title: string;
  url: string;
  attached: boolean;
  canAccessOpener?: boolean;
  browserContextId?: string;
}

/**
 * CDP CaptureSnapshotReturns interface
 */
export interface CaptureSnapshotReturns {
  documents: DocumentSnapshot[];
  strings: string[];
}

/**
 * CDP GetDocumentReturns interface
 */
export interface GetDocumentReturns {
  root: Node;
}

/**
 * CDP GetFullAXTreeReturns interface
 */
export interface GetFullAXTreeReturns {
  nodes?: AXNode[];
}

/**
 * CDP Node interface
 */
export interface Node {
  nodeId: number;
  parentId?: number;
  backendNodeId: number;
  nodeType: number;
  nodeName: string;
  nodeValue: string;
  childNodeCount?: number;
  children?: Node[];
  attributes?: string[];
  documentURL?: string;
  publicId?: string;
  systemId?: string;
  frameId?: string;
  contentDocument?: Node;
  shadowRoots?: Node[];
  pseudoType?: string;
  shadowRootType?: string;
}

/**
 * CDP AXNode interface
 */
export interface AXNode {
  nodeId: string;
  ignored: boolean;
  ignoredReasons?: AXProperty[];
  role?: AXValue;
  chromeRole?: AXValue;
  name?: AXValue;
  description?: AXValue;
  value?: AXValue;
  properties?: AXProperty[];
  childIds?: string[];
  backendDOMNodeId?: number;
  frameId?: string;
}

/**
 * CDP AXValue interface
 */
export interface AXValue {
  type: string;
  value?: any;
  relatedNodes?: AXRelatedNode[];
  sources?: AXValueSource[];
}

/**
 * CDP AXProperty interface
 */
export interface AXProperty {
  name: string;
  value: AXValue;
}

/**
 * CDP AXRelatedNode interface
 */
export interface AXRelatedNode {
  backendDOMNodeId: number;
  idref?: string;
  text?: string;
}

/**
 * CDP AXValueSource interface
 */
export interface AXValueSource {
  type: string;
  value?: AXValue;
  attribute?: string;
  attributeValue?: AXValue;
  superseded?: boolean;
  nativeSource?: string;
  nativeSourceValue?: AXValue;
  invalid?: boolean;
  invalidReason?: string;
}

/**
 * CDP DocumentSnapshot interface
 */
export interface DocumentSnapshot {
  documentURL: string;
  title: string;
  baseURL: string;
  contentLanguage: string;
  encodingName: string;
  publicId: string;
  systemId: string;
  frameId: string;
  nodes: NodeTreeSnapshot;
  layout: LayoutTreeSnapshot;
  textBoxes: TextBoxSnapshot;
  scrollOffsetX?: number;
  scrollOffsetY?: number;
  contentWidth?: number;
  contentHeight?: number;
}

/**
 * CDP NodeTreeSnapshot interface
 */
export interface NodeTreeSnapshot {
  parentIndex?: number[];
  nodeType?: number[];
  shadowRootType?: RareStringData;
  nodeName?: string[];
  nodeValue?: string[];
  backendNodeId?: number[];
  attributes?: ArrayOfStrings[];
  textValue?: RareStringData;
  inputValue?: RareStringData;
  inputChecked?: RareBooleanData;
  optionSelected?: RareBooleanData;
  contentDocumentIndex?: RareIntegerData;
  pseudoType?: RareStringData;
  pseudoIdentifier?: RareStringData;
  isClickable?: RareBooleanData;
  currentSourceURL?: RareStringData;
  originURL?: RareStringData;
}

/**
 * CDP LayoutTreeSnapshot interface
 */
export interface LayoutTreeSnapshot {
  nodeIndex: number[];
  styles: ArrayOfStrings[];
  bounds: number[][];
  text: string[];
  stackingContexts: RareBooleanData;
  paintOrders?: number[];
  offsetRects?: number[][];
  scrollRects?: number[][];
  clientRects?: number[][];
  blendedBackgroundColors?: string[];
  textColorOpacitiess?: number[];
}

/**
 * CDP RareStringData interface
 */
export interface RareStringData {
  index: number[];
  value: string[];
}

/**
 * CDP RareBooleanData interface
 */
export interface RareBooleanData {
  index: number[];
}

/**
 * CDP RareIntegerData interface
 */
export interface RareIntegerData {
  index: number[];
  value: number[];
}

/**
 * CDP TextBoxSnapshot interface
 */
export interface TextBoxSnapshot {
  layoutIndex: number[];
  bounds: number[][];
  start: number[];
  length: number[];
}

// =============================================================================
// CORE INTERFACES
// =============================================================================

/**
 * Current page targets information
 */
export interface CurrentPageTargets {
  page_session: TargetInfo;
  iframe_sessions: TargetInfo[];
}

/**
 * All trees for a target
 * Note: In Chrome extension context, uses ContentScriptCaptureReturns instead of CDP CaptureSnapshotReturns
 */
export interface TargetAllTrees {
  snapshot: ContentScriptCaptureReturns;  // Content script format (not CDP format)
  dom_tree: GetDocumentReturns;
  ax_tree: GetFullAXTreeReturns;
  device_pixel_ratio: number;
  dom_tool_timing: { [key: string]: number };
}

/**
 * Bounds propagation information
 */
export interface PropagatingBounds {
  tag: string;  // The tag that started propagation ('a' or 'button')
  bounds: DOMRect;  // The bounding box
  node_id: number;  // Node ID for debugging
  depth: number;  // How deep in tree this started
}

/**
 * DOM rectangle with position and dimensions
 */
export interface DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Enhanced accessibility property
 */
export interface EnhancedAXProperty {
  name: AXPropertyName;
  value: string | boolean | null;
}

/**
 * Enhanced accessibility node
 */
export interface EnhancedAXNode {
  ax_node_id: string;
  ignored: boolean;
  role: string | null;
  name: string | null;
  description: string | null;
  properties: EnhancedAXProperty[] | null;
  child_ids: string[] | null;
}

/**
 * Enhanced snapshot node with layout and styling information
 */
export interface EnhancedSnapshotNode {
  is_clickable: boolean | null;
  cursor_style: string | null;
  bounds: DOMRect | null;
  clientRects: DOMRect | null;
  scrollRects: DOMRect | null;
  computed_styles: { [key: string]: string } | null;
  paint_order: number | null;
  stacking_contexts: number | null;
}

/**
 * Main DOM tree node with all enhancement data
 */
export interface EnhancedDOMTreeNode {
  // DOM Node data
  node_id: number;
  backend_node_id: number;
  node_type: NodeType;
  node_name: string;
  node_value: string;
  attributes: { [key: string]: string };
  is_scrollable: boolean | null;
  is_visible: boolean | null;
  absolute_position: DOMRect | null;

  // Frames
  target_id: TargetID;
  frame_id: string | null;
  session_id: SessionID | null;
  content_document: EnhancedDOMTreeNode | null;

  // Shadow DOM
  shadow_root_type: ShadowRootType | null;
  shadow_roots: EnhancedDOMTreeNode[] | null;

  // Navigation
  parent_node: EnhancedDOMTreeNode | null;
  children_nodes: EnhancedDOMTreeNode[] | null;

  // AX Node data
  ax_node: EnhancedAXNode | null;

  // Snapshot Node data
  snapshot_node: EnhancedSnapshotNode | null;

  // Interactive element index
  element_index: number | null;

  // Compound control child components
  _compound_children: { [key: string]: any }[];

  // Unique identifier
  uuid: string;

  // Computed properties and helpers (implemented by EnhancedDOMTreeNodeImpl)
  // These are widely used by serializer and detectors; declare them on the interface
  readonly parent: EnhancedDOMTreeNode | null;
  readonly children: EnhancedDOMTreeNode[];
  readonly children_and_shadow_roots: EnhancedDOMTreeNode[];
  readonly tag_name: string;
  readonly xpath: string;
  readonly is_actually_scrollable: boolean;
  readonly should_show_scroll_info: boolean;
  readonly scroll_info: { [key: string]: any } | null;
  readonly element_hash: number;

  _get_element_position(element: EnhancedDOMTreeNode): number;
  __json__(): object;
  get_all_children_text(max_depth?: number): string;
  llm_representation(max_text_length?: number): string;
  get_meaningful_text_for_llm(): string;
  _find_html_in_content_document(): EnhancedDOMTreeNode | null;
  get_scroll_info_text(): string;
  parent_branch_hash(): number;
  _get_parent_branch_path(): string[];
}

/**
 * Simplified node for serialization
 */
export interface SimplifiedNode {
  original_node: EnhancedDOMTreeNode;
  children: SimplifiedNode[];
  should_display: boolean;
  interactive_index: number | null;
  is_new: boolean;
  ignored_by_paint_order: boolean;
  excluded_by_parent: boolean;
  is_shadow_host: boolean;
  is_compound_component: boolean;
}

/**
 * Serialized DOM state for LLM consumption
 */
export interface SerializedDOMState {
  _root: SimplifiedNode | null;
  selector_map: DOMSelectorMap;
}

/**
 * DOM element that was interacted with
 */
export interface DOMInteractedElement {
  node_id: number;
  backend_node_id: number;
  frame_id: string | null;
  node_type: NodeType;
  node_value: string;
  node_name: string;
  attributes: { [key: string]: string } | null;
  bounds: DOMRect | null;
  x_path: string;
  element_hash: number;
}

// =============================================================================
// ABSTRACT CLASSES / IMPLEMENTATIONS
// =============================================================================

/**
 * Implementation class for EnhancedDOMTreeNode with computed properties
 */
export abstract class EnhancedDOMTreeNodeImpl implements EnhancedDOMTreeNode {
  // Interface fields
  node_id!: number;
  backend_node_id!: number;
  node_type!: NodeType;
  node_name!: string;
  node_value!: string;
  attributes!: { [key: string]: string };
  is_scrollable!: boolean | null;
  is_visible!: boolean | null;
  absolute_position!: DOMRect | null;
  target_id!: TargetID;
  frame_id!: string | null;
  session_id!: SessionID | null;
  content_document!: EnhancedDOMTreeNode | null;
  shadow_root_type!: ShadowRootType | null;
  shadow_roots!: EnhancedDOMTreeNode[] | null;
  parent_node!: EnhancedDOMTreeNode | null;
  children_nodes!: EnhancedDOMTreeNode[] | null;
  ax_node!: EnhancedAXNode | null;
  snapshot_node!: EnhancedSnapshotNode | null;
  element_index!: number | null;
  _compound_children!: { [key: string]: any }[];
  uuid!: string;

  // Computed properties from Python @property decorators
  abstract get parent(): EnhancedDOMTreeNode | null;
  abstract get children(): EnhancedDOMTreeNode[];
  abstract get children_and_shadow_roots(): EnhancedDOMTreeNode[];
  abstract get tag_name(): string;
  abstract get xpath(): string;
  abstract get is_actually_scrollable(): boolean;
  abstract get should_show_scroll_info(): boolean;
  abstract get scroll_info(): { [key: string]: any } | null;
  abstract get element_hash(): number;

  // Abstract methods to implement
  abstract _get_element_position(element: EnhancedDOMTreeNode): number;
  abstract __json__(): object;
  abstract get_all_children_text(max_depth?: number): string;
  abstract llm_representation(max_text_length?: number): string;
  abstract get_meaningful_text_for_llm(): string;
  abstract _find_html_in_content_document(): EnhancedDOMTreeNode | null;
  abstract get_scroll_info_text(): string;
  abstract parent_branch_hash(): number;
  abstract _get_parent_branch_path(): string[];
}

// =============================================================================
// UTILITY INTERFACES
// =============================================================================

/**
 * Rectangle for geometry calculations
 */
export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Paint order filtering configuration
 */
export interface PaintOrderConfig {
  enabled: boolean;
  threshold: number;
}

/**
 * Serialization options
 */
export interface SerializationOptions {
  include_attributes?: string[];
  max_text_length?: number;
  paint_order_filtering?: boolean;
  containment_threshold?: number;
}

/**
 * Browser session configuration for DOM operations
 */
export interface DOMServiceConfig {
  cross_origin_iframes?: boolean;
  paint_order_filtering?: boolean;
  max_iframes?: number;
  max_iframe_depth?: number;
}

// =============================================================================
// METHOD SIGNATURES FOR SERVICE CLASSES
// =============================================================================

/**
 * Interface for DomService methods
 */
export interface IDomService {
  _get_targets_for_page(target_id: string): Promise<CurrentPageTargets>;
  _build_enhanced_ax_node(ax_node: any): EnhancedAXNode;
  _get_viewport_ratio(target_id: string): Promise<number>;
  is_element_visible_according_to_all_parents(
    node: EnhancedDOMTreeNode,
    html_frames: Map<string, any>
  ): boolean;
  _get_ax_tree_for_all_frames(target_id: string): Promise<Map<string, any>>;
  _get_all_trees(target_id: string): Promise<TargetAllTrees>;
  get_dom_tree(
    target_id: string,
    initial_html_frames?: Map<string, any>,
    initial_total_frame_offset?: {x: number, y: number},
    iframe_depth?: number
  ): Promise<EnhancedDOMTreeNode>;
  get_serialized_dom_tree(
    previous_cached_state?: SerializedDOMState
  ): Promise<SerializedDOMState>;
}

/**
 * Interface for DOMTreeSerializer methods
 */
export interface IDOMTreeSerializer {
  serialize_accessible_elements(
    dom_root: EnhancedDOMTreeNode,
    paint_order_filtering?: boolean,
    previous_cached_state?: SerializedDOMState
  ): SerializedDOMState;

  _create_simplified_tree(
    node: EnhancedDOMTreeNode,
    depth?: number
  ): SimplifiedNode;

  _optimize_tree(node: SimplifiedNode): SimplifiedNode;

  _apply_bounding_box_filtering(node: SimplifiedNode): void;

  _assign_interactive_indices_and_mark_new_nodes(
    node: SimplifiedNode,
    previous_cached_state?: SerializedDOMState
  ): DOMSelectorMap;

  serialize_tree(
    node: SimplifiedNode,
    include_attributes: string[],
    depth?: number
  ): string;

  _add_compound_components(
    simplified: SimplifiedNode,
    node: EnhancedDOMTreeNode
  ): void;

  _extract_select_options(select_node: EnhancedDOMTreeNode): SimplifiedNode[];
}

/**
 * Interface for ClickableElementDetector methods
 */
export interface IClickableElementDetector {
  is_interactive(
    node: EnhancedDOMTreeNode,
    include_element_index?: boolean
  ): boolean;
}

// =============================================================================
// CONTENT SCRIPT CAPTURE TYPES
// =============================================================================

/**
 * DOM capture options for content script
 */
export interface DOMCaptureOptions {
  includeShadowDOM?: boolean;
  includeIframes?: boolean;
  maxIframeDepth?: number;
  maxIframeCount?: number;
  skipHiddenElements?: boolean;
}

/**
 * Captured DOM document structure (content script format)
 */
export interface CapturedDocument {
  documentURL: string;
  baseURL: string;
  title: string;
  frameId: string;
  nodes: CapturedNode[];
}

/**
 * Captured node structure (content script format)
 */
export interface CapturedNode {
  nodeType: number;
  nodeName: number;  // String pool index
  nodeValue: string | null;
  backendNodeId: number;
  parentIndex: number | null;
  childIndices: number[];
  attributes: Record<number, number>;  // Both key and value are string pool indices
  snapshot?: any;  // ElementSnapshot type from snapshotCapture
  axNode?: EnhancedAXNode;
}

/**
 * Complete capture result (content script format)
 * Note: This differs from CDP CaptureSnapshotReturns which uses DocumentSnapshot[]
 */
export interface ContentScriptCaptureReturns {
  documents: CapturedDocument[];
  strings: string[];
}

/**
 * Viewport information captured by content script
 */
export interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX: number;
  scrollY: number;
  visibleWidth: number;
  visibleHeight: number;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Cap text length utility function
 */
export function cap_text_length(text: string, max_length: number = 100): string {
  if (text.length <= max_length) {
    return text;
  }
  return text.substring(0, max_length) + '...';
}

/**
 * Enhanced snapshot utility functions
 */
// Note: This function is implemented in enhancedSnapshot.ts
// Signature kept here for reference - actual implementation uses CDP format
export function build_snapshot_lookup(
  snapshot: CaptureSnapshotReturns,  // CDP format only
  device_pixel_ratio: number
): Record<number, EnhancedSnapshotNode> {
  // Implementation in enhancedSnapshot.ts
  throw new Error('Use import from enhancedSnapshot.ts');
}

export function _parse_rare_boolean_data(
  rare_data: RareBooleanData | undefined,
  index: number
): boolean {
  if (!rare_data || !rare_data.index.includes(index)) {
    return false;
  }
  return true;
}

export function _parse_computed_styles(
  strings: string[],
  style_indices: ArrayOfStrings
): { [key: string]: string } {
  const styles: { [key: string]: string } = {};
  for (let i = 0; i < style_indices.length; i += 2) {
    const key_index = parseInt(style_indices[i]);
    const value_index = parseInt(style_indices[i + 1]);
    if (key_index < strings.length && value_index < strings.length) {
      styles[strings[key_index]] = strings[value_index];
    }
  }
  return styles;
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

/**
 * Validation result for DOM operations
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * DOM tree validation configuration
 */
export interface ValidationConfig {
  check_unique_node_ids?: boolean;
  check_positive_backend_node_ids?: boolean;
  check_valid_node_types?: boolean;
  check_shadow_root_consistency?: boolean;
  check_scrollable_elements?: boolean;
}