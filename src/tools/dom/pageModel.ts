/**
 * Type Definitions: Page Interaction Model
 *
 * Purpose: TypeScript interfaces matching the JSON schemas for captureInteractionContent()
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/data-model.md
 */

/**
 * Root output structure representing the complete interaction model of a web page
 */
export interface PageModel {
  /** Page document title (from document.title) */
  title: string;

  /** Page URL (optional, from baseUrl or document.location) */
  url?: string;

  /** Extracted headings (h1, h2, h3), max 30 */
  headings: string[];

  /** Unique landmark region types present on page */
  regions: string[];

  /** Actionable elements, max 400 */
  controls: InteractiveControl[];

  /** Mapping of stable IDs to CSS selectors */
  aimap: SelectorMap;

  /** Visible text content from article-like containers (paragraphs, divs, article elements) */
  textContent?: string[];
}

/**
 * Represents a single actionable element with state and metadata
 */
export interface InteractiveControl {
  /** Stable unique ID for LLM reference (format: {role[0:2]}_{counter}) */
  id: string;

  /** ARIA role or inferred semantic role */
  role: ControlRole;

  /** Computed accessible name (WCAG) */
  name: string;

  /** Element-specific state properties */
  states: ControlStates;

  /** CSS selector for element location */
  selector: string;

  /** Containing landmark region type */
  region?: LandmarkRegion;

  /** Element position and dimensions */
  boundingBox?: BoundingBox;

  /** Element visibility (computed styles + bbox) */
  visible: boolean;

  /** Element within current viewport */
  inViewport: boolean;
}

/**
 * Element-specific state properties (varies by role and element type)
 */
export interface ControlStates {
  /** Element is disabled (not actionable) */
  disabled?: boolean;

  /** Checked state (checkbox/radio) */
  checked?: boolean | 'mixed';

  /** Expansion state (accordions, menus) */
  expanded?: boolean;

  /** Field is required */
  required?: boolean;

  /** Placeholder text (max 80 chars) */
  placeholder?: string;

  /** Value length (privacy: not actual value) */
  value_len?: number;

  /** Link destination */
  href?: string;

  /** Actual form value (only when includeValues=true, never for passwords) */
  value?: string;

  /** Allow additional state properties */
  [key: string]: boolean | string | number | undefined;
}

/**
 * Element position and dimensions
 */
export interface BoundingBox {
  /** Left position (pixels from viewport left) */
  x: number;

  /** Top position (pixels from viewport top) */
  y: number;

  /** Element width (pixels) */
  width: number;

  /** Element height (pixels) */
  height: number;
}

/**
 * Mapping from stable IDs to CSS selectors
 */
export type SelectorMap = Record<string, string>;

/**
 * Input parameters for configuring page interaction content capture
 */
export interface CaptureRequest {
  /** Base URL for relative path resolution */
  baseUrl?: string;

  /** Max interactive elements to capture (default: 400) */
  maxControls?: number;

  /** Max headings to capture (default: 30) */
  maxHeadings?: number;

  /** Include form values (default: false, privacy risk) */
  includeValues?: boolean;

  /** Max iframe nesting depth (default: 1) */
  maxIframeDepth?: number;
}

/**
 * Default values for CaptureRequest
 */
export const DEFAULT_CAPTURE_REQUEST: Required<Omit<CaptureRequest, 'baseUrl'>> = {
  maxControls: 400,
  maxHeadings: 30,
  includeValues: false,
  maxIframeDepth: 1,
};

/**
 * Supported control roles (20+ interactive and landmark types)
 */
export type ControlRole =
  // Buttons
  | 'button'
  // Links
  | 'link'
  // Inputs
  | 'textbox'
  | 'checkbox'
  | 'radio'
  | 'combobox'
  // Containers/Landmarks
  | 'main'
  | 'navigation'
  | 'header'
  | 'footer'
  | 'aside'
  | 'dialog'
  | 'search'
  | 'region'
  // Interactive
  | 'menuitem'
  | 'tab'
  | 'switch'
  | 'slider'
  // List/Grid
  | 'listitem'
  | 'option'
  | 'treeitem'
  | 'gridcell'
  | 'row'
  | 'columnheader';

/**
 * Landmark region types
 */
export type LandmarkRegion =
  | 'main'
  | 'navigation'
  | 'header'
  | 'footer'
  | 'aside'
  | 'dialog'
  | 'search'
  | 'nav'
  | 'region';

/**
 * Role prefix mapping for ID generation
 * Maps ControlRole to 2-character prefix
 */
export const ROLE_PREFIXES: Record<ControlRole, string> = {
  button: 'bu',
  link: 'li',
  textbox: 'te',
  checkbox: 'ch',
  radio: 'ra',
  combobox: 'co',
  main: 'ma',
  navigation: 'na',
  header: 'he',
  footer: 'fo',
  aside: 'as',
  dialog: 'di',
  search: 'se',
  region: 're',
  menuitem: 'me',
  tab: 'ta',
  switch: 'sw',
  slider: 'sl',
  listitem: 'ls',
  option: 'op',
  treeitem: 'tr',
  gridcell: 'gc',
  row: 'ro',
  columnheader: 'ch',
};

/**
 * Landmark role mapping (HTML element → ARIA role)
 */
export const LANDMARK_ELEMENTS: Record<string, LandmarkRegion> = {
  'main': 'main',
  'nav': 'navigation',
  'header': 'header',
  'footer': 'footer',
  'aside': 'aside',
  'dialog': 'dialog',
};

/**
 * Interactive element tag names that should be captured
 */
export const INTERACTIVE_TAGS = [
  'a',
  'button',
  'input',
  'select',
  'textarea',
  'summary',
  'details',
] as const;

/**
 * Validation constraints from data model
 */
export const CONSTRAINTS = {
  /** Max characters for accessible name */
  MAX_NAME_LENGTH: 160,

  /** Max characters for placeholder text */
  MAX_PLACEHOLDER_LENGTH: 80,

  /** Max characters for page title */
  MAX_TITLE_LENGTH: 500,

  /** Max characters for heading text */
  MAX_HEADING_LENGTH: 200,

  /** Default max controls */
  DEFAULT_MAX_CONTROLS: 400,

  /** Default max headings */
  DEFAULT_MAX_HEADINGS: 30,

  /** Default max iframe depth */
  DEFAULT_MAX_IFRAME_DEPTH: 1,

  /** Capture timeout (milliseconds) */
  CAPTURE_TIMEOUT_MS: 30000,

  /** Max text content blocks to extract */
  MAX_TEXT_CONTENT_BLOCKS: 100,

  /** Min characters per text block (filter out short text) */
  MIN_TEXT_BLOCK_LENGTH: 20,

  /** Max characters per text block */
  MAX_TEXT_BLOCK_LENGTH: 2000,
} as const;
