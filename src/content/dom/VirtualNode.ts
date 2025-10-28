/**
 * VirtualNode Factory
 *
 * Factory functions for creating VirtualNode instances from DOM elements.
 * VirtualNode represents a snapshot of a DOM element with semantic metadata.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type { VirtualNode, VirtualNodeMetadata } from "../../types/domTool";
import { computeAccessibleName } from "dom-accessibility-api";

/**
 * Options for building VirtualNode
 */
export interface BuilderOptions {
  /** Maximum text length before truncation */
  maxTextLength?: number;
  /** Maximum aria-label length before truncation */
  maxLabelLength?: number;
  /** Include form input values (privacy-controlled) */
  includeValues?: boolean;
  /** Include full metadata (bbox, viewport, etc.) */
  includeMetadata?: boolean;
}

/**
 * Default builder options
 */
const DEFAULT_BUILDER_OPTIONS: Required<BuilderOptions> = {
  maxTextLength: 500,
  maxLabelLength: 250,
  includeValues: false,
  includeMetadata: true,
};

/**
 * Create a VirtualNode from a DOM element
 *
 * @param element - DOM element to convert
 * @param nodeId - Unique node ID (assigned by TreeBuilder)
 * @param visible - Visibility status (computed by VisibilityFilter)
 * @param options - Builder options
 * @returns VirtualNode instance
 */
export function createVirtualNode(
  element: Element,
  nodeId: string,
  visible: boolean,
  options: BuilderOptions = {}
): VirtualNode {
  const opts = { ...DEFAULT_BUILDER_OPTIONS, ...options };

  const node: VirtualNode = {
    node_id: nodeId,
    tag: element.tagName.toLowerCase(),
    visible,
  };

  // Extract ARIA role (explicit or implicit)
  const role = extractRole(element);
  if (role) {
    node.role = role;
  }

  // Extract accessible name (ARIA label)
  const ariaLabel = extractAccessibleName(element, opts.maxLabelLength);
  if (ariaLabel) {
    node["aria-label"] = ariaLabel;
  }

  // Extract text content
  const text = extractTextContent(element, opts.maxTextLength);
  if (text) {
    node.text = text;
  }

  // Extract form value (if enabled and applicable)
  if (opts.includeValues) {
    const value = extractValue(element);
    if (value !== null) {
      node.value = value;
    }
  }

  // Add metadata if enabled
  if (opts.includeMetadata) {
    const metadata = extractMetadata(element);
    if (Object.keys(metadata).length > 0) {
      node.metadata = metadata;
    }
  }

  return node;
}

/**
 * Extract ARIA role (explicit or implicit)
 */
function extractRole(element: Element): string | null {
  // Explicit ARIA role
  const explicitRole = element.getAttribute("role");
  if (explicitRole) {
    return explicitRole;
  }

  // Implicit roles based on HTML semantics
  const tag = element.tagName.toLowerCase();
  const implicitRoles: Record<string, string> = {
    a: "link",
    button: "button",
    nav: "navigation",
    main: "main",
    header: "banner",
    footer: "contentinfo",
    aside: "complementary",
    form: "form",
    img: "img",
    article: "article",
    section: "region",
    dialog: "dialog",
  };

  // Handle input elements with type-specific roles
  if (tag === "input") {
    const type = (element as HTMLInputElement).type;
    if (type === "checkbox") return "checkbox";
    if (type === "radio") return "radio";
    if (type === "button" || type === "submit") return "button";
    return "textbox";
  }

  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";

  return implicitRoles[tag] || null;
}

/**
 * Extract accessible name using dom-accessibility-api
 */
function extractAccessibleName(
  element: Element,
  maxLength: number
): string | null {
  try {
    const name = computeAccessibleName(element);
    if (!name) return null;

    // Truncate if exceeds max length
    if (name.length > maxLength) {
      return name.substring(0, maxLength) + "...";
    }

    return name;
  } catch (error) {
    // Fallback to aria-label attribute if computation fails
    return element.getAttribute("aria-label") || null;
  }
}

/**
 * Extract visible text content
 */
function extractTextContent(element: Element, maxLength: number): string | null {
  // Get direct text content (not from descendants)
  let text = "";

  // For text inputs, get the value
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    text = (element as HTMLInputElement | HTMLTextAreaElement).value || "";
  } else {
    // Get text from direct text nodes
    for (const node of Array.from(element.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      }
    }
  }

  // Trim whitespace
  text = text.trim();

  if (!text) return null;

  // Truncate if exceeds max length
  if (text.length > maxLength) {
    return text.substring(0, maxLength) + "...";
  }

  return text;
}

/**
 * Extract form input value (privacy-controlled)
 */
function extractValue(element: Element): string | null {
  // Never capture password values
  if (element.tagName === "INPUT" && (element as HTMLInputElement).type === "password") {
    return null;
  }

  // Extract value from form elements
  if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
    const value = (element as HTMLInputElement | HTMLTextAreaElement).value;
    return value || null;
  }

  if (element.tagName === "SELECT") {
    return (element as HTMLSelectElement).value || null;
  }

  return null;
}

/**
 * Extract additional metadata
 */
function extractMetadata(element: Element): VirtualNodeMetadata {
  const metadata: VirtualNodeMetadata = {};

  // Bounding box
  const rect = element.getBoundingClientRect();
  if (rect.width > 0 && rect.height > 0) {
    metadata.boundingBox = {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };

    // Check if in viewport
    metadata.inViewport =
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth;
  }

  // HTML id attribute (for stable matching)
  const htmlId = element.getAttribute("id");
  if (htmlId) {
    metadata.htmlId = htmlId;
  }

  // Test ID attributes
  const testId =
    element.getAttribute("data-testid") ||
    element.getAttribute("data-test") ||
    element.getAttribute("data-cy") ||
    null;
  if (testId) {
    metadata.testId = testId;
  }

  // Link href (for anchors)
  if (element.tagName === "A") {
    const href = (element as HTMLAnchorElement).href;
    if (href) {
      metadata.href = href;
    }
  }

  // Input type
  if (element.tagName === "INPUT") {
    const inputType = (element as HTMLInputElement).type;
    if (inputType) {
      metadata.inputType = inputType;
    }
  }

  // Placeholder
  const placeholder = element.getAttribute("placeholder");
  if (placeholder) {
    metadata.placeholder = placeholder;
  }

  // Element states
  const states = extractStates(element);
  if (Object.keys(states).length > 0) {
    metadata.states = states;
  }

  // Landmark region (containing landmark)
  const region = findContainingLandmark(element);
  if (region) {
    metadata.region = region;
  }

  // Tree path (for ID preservation)
  const treePath = getTreePath(element);
  if (treePath) {
    metadata.treePath = treePath;
  }

  return metadata;
}

/**
 * Get tree path for element
 */
function getTreePath(element: Element): string | null {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current !== document.body) {
    const parent = current.parentElement;
    if (!parent) break;

    // Get index among siblings of same tag
    const siblings = Array.from(parent.children).filter(
      (child) => child.tagName === current!.tagName
    );
    const index = siblings.indexOf(current);

    path.unshift(`${current.tagName.toLowerCase()}[${index}]`);
    current = parent;
  }

  return path.length > 0 ? path.join("/") : null;
}

/**
 * Extract element states (checked, disabled, expanded, etc.)
 */
function extractStates(element: Element): Record<string, boolean | string> {
  const states: Record<string, boolean | string> = {};

  // ARIA states
  const ariaExpanded = element.getAttribute("aria-expanded");
  if (ariaExpanded) {
    states.expanded = ariaExpanded === "true";
  }

  const ariaSelected = element.getAttribute("aria-selected");
  if (ariaSelected) {
    states.selected = ariaSelected === "true";
  }

  const ariaDisabled = element.getAttribute("aria-disabled");
  if (ariaDisabled) {
    states.disabled = ariaDisabled === "true";
  }

  // Form element states
  if (element.tagName === "INPUT" || element.tagName === "BUTTON") {
    const input = element as HTMLInputElement | HTMLButtonElement;

    if (input.disabled) {
      states.disabled = true;
    }

    if ("checked" in input && input.checked) {
      states.checked = true;
    }
  }

  // Select element
  if (element.tagName === "SELECT") {
    if ((element as HTMLSelectElement).disabled) {
      states.disabled = true;
    }
  }

  return states;
}

/**
 * Find containing landmark region
 */
function findContainingLandmark(element: Element): string | null {
  let current: Element | null = element.parentElement;

  while (current) {
    const role = current.getAttribute("role") || getImplicitRole(current);

    if (role) {
      const landmarks = ["main", "navigation", "banner", "contentinfo", "complementary", "region", "form"];
      if (landmarks.includes(role)) {
        return role;
      }
    }

    current = current.parentElement;
  }

  return null;
}

/**
 * Get implicit role for landmark detection
 */
function getImplicitRole(element: Element): string | null {
  const tag = element.tagName.toLowerCase();
  const landmarks: Record<string, string> = {
    main: "main",
    nav: "navigation",
    header: "banner",
    footer: "contentinfo",
    aside: "complementary",
    form: "form",
  };

  return landmarks[tag] || null;
}
