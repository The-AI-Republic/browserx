/**
 * ARIA Attribute Extraction for Accessibility Information
 *
 * Since Chrome extensions don't have access to the full Accessibility API
 * for web content, we extract ARIA attributes and infer accessibility
 * information from semantic HTML.
 */

/**
 * Enhanced accessibility node information
 */
export interface EnhancedAXNode {
  backendNodeId: number;
  ax_node_id: string;
  ignored: boolean;
  role: string | null;
  name: string | null;
  description: string | null;
  properties: Array<{ name: string; value: any }> | null;
  child_ids: string[] | null;
}

/**
 * Mapping of HTML tags to implicit ARIA roles
 */
const IMPLICIT_ROLES: Record<string, string> = {
  A: 'link',
  BUTTON: 'button',
  INPUT: 'textbox', // Default, can vary by type
  TEXTAREA: 'textbox',
  SELECT: 'combobox',
  OPTION: 'option',
  IMG: 'img',
  NAV: 'navigation',
  MAIN: 'main',
  HEADER: 'banner',
  FOOTER: 'contentinfo',
  ASIDE: 'complementary',
  ARTICLE: 'article',
  SECTION: 'region',
  FORM: 'form',
  TABLE: 'table',
  TR: 'row',
  TH: 'columnheader',
  TD: 'cell',
  UL: 'list',
  OL: 'list',
  LI: 'listitem',
  H1: 'heading',
  H2: 'heading',
  H3: 'heading',
  H4: 'heading',
  H5: 'heading',
  H6: 'heading',
  DIALOG: 'dialog',
  FIGURE: 'figure',
  HR: 'separator'
};

/**
 * Input type to role mapping
 */
const INPUT_TYPE_ROLES: Record<string, string> = {
  button: 'button',
  checkbox: 'checkbox',
  radio: 'radio',
  range: 'slider',
  search: 'searchbox',
  email: 'textbox',
  tel: 'textbox',
  url: 'textbox',
  number: 'spinbutton'
};

/**
 * Extract accessibility information from an element
 *
 * @param element - Element to extract from
 * @param backendNodeId - Backend node identifier
 * @returns Enhanced accessibility node
 */
export function extractARIA(element: Element, backendNodeId: number): EnhancedAXNode {
  const axNode: EnhancedAXNode = {
    backendNodeId,
    ax_node_id: `ax-${backendNodeId}`,
    ignored: false,
    role: null,
    name: null,
    description: null,
    properties: [],
    child_ids: null
  };

  // Determine role
  axNode.role = getElementRole(element);

  // Extract accessible name
  axNode.name = getAccessibleName(element);

  // Extract accessible description
  axNode.description = getAccessibleDescription(element);

  // Extract ARIA properties
  axNode.properties = extractARIAProperties(element);

  // Check if element should be ignored
  axNode.ignored = shouldIgnoreElement(element);

  return axNode;
}

/**
 * Get the role of an element
 *
 * Priority:
 * 1. Explicit role attribute
 * 2. Implicit role from tag name
 * 3. null if no role
 *
 * @param element - Element to check
 * @returns Role string or null
 */
function getElementRole(element: Element): string | null {
  // Check explicit role attribute
  const explicitRole = element.getAttribute('role');
  if (explicitRole) {
    return explicitRole;
  }

  // Check input type-specific roles
  if (element instanceof HTMLInputElement) {
    const type = element.type.toLowerCase();
    return INPUT_TYPE_ROLES[type] || 'textbox';
  }

  // Check implicit role from tag name
  const implicitRole = IMPLICIT_ROLES[element.tagName];
  if (implicitRole) {
    return implicitRole;
  }

  return null;
}

/**
 * Get the accessible name of an element
 *
 * Priority (per ARIA spec):
 * 1. aria-labelledby
 * 2. aria-label
 * 3. Label element (for form inputs)
 * 4. alt attribute (for images)
 * 5. title attribute
 * 6. placeholder (for inputs)
 * 7. Text content (truncated)
 *
 * @param element - Element to check
 * @returns Accessible name or null
 */
function getAccessibleName(element: Element): string | null {
  // 1. aria-labelledby
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/);
    const texts = ids
      .map(id => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (texts.length > 0) {
      return texts.join(' ');
    }
  }

  // 2. aria-label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel;
  }

  // 3. Label element (for form inputs)
  if (element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement ||
      element instanceof HTMLSelectElement) {
    // Check for associated label
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        return label.textContent?.trim() || null;
      }
    }

    // Check for wrapping label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      return parentLabel.textContent?.trim() || null;
    }
  }

  // 4. alt attribute (for images)
  if (element instanceof HTMLImageElement) {
    const alt = element.alt;
    if (alt) {
      return alt;
    }
  }

  // 5. title attribute
  const title = element.getAttribute('title');
  if (title) {
    return title;
  }

  // 6. placeholder (for inputs)
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const placeholder = element.placeholder;
    if (placeholder) {
      return placeholder;
    }
  }

  // 7. Text content (truncated to 100 chars)
  const textContent = element.textContent?.trim();
  if (textContent && textContent.length > 0) {
    return textContent.length > 100
      ? textContent.substring(0, 100) + '...'
      : textContent;
  }

  return null;
}

/**
 * Get the accessible description of an element
 *
 * Priority:
 * 1. aria-describedby
 * 2. aria-description
 *
 * @param element - Element to check
 * @returns Accessible description or null
 */
function getAccessibleDescription(element: Element): string | null {
  // 1. aria-describedby
  const describedBy = element.getAttribute('aria-describedby');
  if (describedBy) {
    const ids = describedBy.split(/\s+/);
    const texts = ids
      .map(id => document.getElementById(id)?.textContent?.trim())
      .filter(Boolean);
    if (texts.length > 0) {
      return texts.join(' ');
    }
  }

  // 2. aria-description
  const ariaDescription = element.getAttribute('aria-description');
  if (ariaDescription) {
    return ariaDescription;
  }

  return null;
}

/**
 * Extract all ARIA properties from an element
 *
 * @param element - Element to extract from
 * @returns Array of ARIA properties
 */
function extractARIAProperties(element: Element): Array<{ name: string; value: any }> {
  const properties: Array<{ name: string; value: any }> = [];

  // Extract all aria-* attributes
  for (const attr of element.attributes) {
    if (attr.name.startsWith('aria-')) {
      let value: any = attr.value;

      // Parse boolean values
      if (value === 'true' || value === 'false') {
        value = value === 'true';
      }

      // Parse numeric values
      if (/^-?\d+$/.test(value)) {
        value = parseInt(value, 10);
      }

      properties.push({
        name: attr.name,
        value
      });
    }
  }

  // Add implicit properties based on element type
  if (element instanceof HTMLInputElement) {
    properties.push({
      name: 'type',
      value: element.type
    });

    if (element.disabled) {
      properties.push({
        name: 'disabled',
        value: true
      });
    }

    if (element.required) {
      properties.push({
        name: 'required',
        value: true
      });
    }

    if (element.readOnly) {
      properties.push({
        name: 'readonly',
        value: true
      });
    }

    if (element.type === 'checkbox' || element.type === 'radio') {
      properties.push({
        name: 'checked',
        value: element.checked
      });
    }
  }

  // Add expanded state for elements with aria-expanded
  if (element.hasAttribute('aria-expanded')) {
    const expanded = element.getAttribute('aria-expanded') === 'true';
    properties.push({
      name: 'expanded',
      value: expanded
    });
  }

  // Add level for headings
  if (element.tagName.match(/^H[1-6]$/)) {
    const level = parseInt(element.tagName[1], 10);
    properties.push({
      name: 'level',
      value: level
    });
  }

  return properties;
}

/**
 * Check if element should be ignored by accessibility tree
 *
 * An element is ignored if:
 * - It has aria-hidden="true"
 * - It's not visible (display: none, visibility: hidden)
 * - It has no accessible name or role
 *
 * @param element - Element to check
 * @returns true if element should be ignored
 */
function shouldIgnoreElement(element: Element): boolean {
  // Check aria-hidden
  if (element.getAttribute('aria-hidden') === 'true') {
    return true;
  }

  // Check visibility
  try {
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return true;
    }
  } catch {
    // Ignore style errors
  }

  return false;
}

/**
 * Batch extract ARIA information for multiple elements
 *
 * @param elementData - Array of elements with metadata
 * @returns Map of element to ARIA node
 */
export function batchExtractARIA(
  elementData: Array<{ backendNodeId: number; element: Element }>
): Map<Element, EnhancedAXNode> {
  const axNodes = new Map<Element, EnhancedAXNode>();

  for (const { backendNodeId, element } of elementData) {
    const axNode = extractARIA(element, backendNodeId);
    axNodes.set(element, axNode);
  }

  return axNodes;
}
