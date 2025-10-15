/**
 * Role Detector Module
 *
 * Purpose: Detect ARIA role or infer semantic role from HTML elements
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/data-model.md - InteractiveControl.role
 */

import type { ControlRole } from './pageModel';

/**
 * Detects the role of an element
 *
 * @param element - Element to detect role for
 * @returns ControlRole (ARIA role or inferred semantic role)
 *
 * Priority:
 * 1. Explicit role attribute
 * 2. Implicit ARIA role (from tag name)
 * 3. Inferred semantic role
 */
export function detectRole(element: Element): ControlRole {
  // Priority 1: Explicit role attribute
  const explicitRole = element.getAttribute('role');
  if (explicitRole && isValidRole(explicitRole)) {
    return explicitRole as ControlRole;
  }

  // Priority 2: Implicit role from tag name
  const tagName = element.tagName.toLowerCase();
  const implicitRole = getImplicitRole(tagName, element);
  if (implicitRole) {
    return implicitRole;
  }

  // Priority 3: Fallback to generic roles
  return 'region';
}

/**
 * Checks if a role string is a valid ControlRole
 *
 * @param role - Role string to validate
 * @returns True if role is valid
 */
function isValidRole(role: string): boolean {
  const validRoles: ControlRole[] = [
    'button',
    'link',
    'textbox',
    'checkbox',
    'radio',
    'combobox',
    'main',
    'navigation',
    'header',
    'footer',
    'aside',
    'dialog',
    'search',
    'region',
    'menuitem',
    'tab',
    'switch',
    'slider',
    'listitem',
    'option',
    'treeitem',
    'gridcell',
    'row',
    'columnheader',
  ];

  return validRoles.includes(role as ControlRole);
}

/**
 * Gets implicit ARIA role from HTML tag name
 *
 * @param tagName - HTML tag name (lowercase)
 * @param element - Element context (for type checking)
 * @returns Implicit ControlRole or null
 *
 * Reference: https://www.w3.org/TR/html-aria/#docconformance
 */
function getImplicitRole(tagName: string, element: Element): ControlRole | null {
  switch (tagName) {
    case 'button':
      return 'button';

    case 'a':
      // Links must have href to have "link" role
      return element.hasAttribute('href') ? 'link' : null;

    case 'input':
      return getInputRole(element as HTMLInputElement);

    case 'select':
      return 'combobox';

    case 'textarea':
      return 'textbox';

    case 'main':
      return 'main';

    case 'nav':
      return 'navigation';

    case 'header':
      return 'header';

    case 'footer':
      return 'footer';

    case 'aside':
      return 'aside';

    case 'dialog':
      return 'dialog';

    case 'summary':
      return 'button'; // summary elements are expandable buttons

    case 'li':
      return 'listitem';

    case 'option':
      return 'option';

    case 'th':
      return 'columnheader';

    case 'tr':
      return 'row';

    case 'td':
      return 'gridcell';

    default:
      return null;
  }
}

/**
 * Gets role for input elements based on type
 *
 * @param element - Input element
 * @returns ControlRole for input
 */
function getInputRole(element: HTMLInputElement): ControlRole {
  const type = (element.type || 'text').toLowerCase();

  switch (type) {
    case 'button':
    case 'submit':
    case 'reset':
      return 'button';

    case 'checkbox':
      return 'checkbox';

    case 'radio':
      return 'radio';

    case 'range':
      return 'slider';

    case 'text':
    case 'email':
    case 'password':
    case 'search':
    case 'tel':
    case 'url':
    case 'number':
    case 'date':
    case 'time':
    case 'datetime-local':
    case 'month':
    case 'week':
    default:
      return 'textbox';
  }
}

/**
 * Checks if element is an interactive control
 *
 * @param element - Element to check
 * @returns True if element is interactive
 *
 * Interactive elements:
 * - Buttons, links, inputs, selects, textareas
 * - Elements with role="button", role="link", etc.
 * - Elements with tabindex >= 0
 */
export function isInteractiveElement(element: Element): boolean {
  // Check explicit role
  const role = element.getAttribute('role');
  if (role && isInteractiveRole(role)) {
    return true;
  }

  // Check tag name
  const tagName = element.tagName.toLowerCase();
  const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'summary', 'details'];

  if (interactiveTags.includes(tagName)) {
    // Links must have href
    if (tagName === 'a') {
      return element.hasAttribute('href');
    }
    return true;
  }

  // Check tabindex
  const tabindex = element.getAttribute('tabindex');
  if (tabindex !== null) {
    const tabindexNum = parseInt(tabindex, 10);
    if (tabindexNum >= 0) {
      return true;
    }
  }

  // Check for click handlers (elements with onclick are interactive)
  if (element.hasAttribute('onclick') || element.getAttribute('role') === 'button') {
    return true;
  }

  return false;
}

/**
 * Checks if a role is an interactive role
 *
 * @param role - Role string
 * @returns True if role is interactive
 */
function isInteractiveRole(role: string): boolean {
  const interactiveRoles = [
    'button',
    'link',
    'textbox',
    'checkbox',
    'radio',
    'combobox',
    'menuitem',
    'tab',
    'switch',
    'slider',
    'option',
  ];

  return interactiveRoles.includes(role);
}

/**
 * Checks if element is a landmark region
 *
 * @param element - Element to check
 * @returns True if element is a landmark
 */
export function isLandmarkElement(element: Element): boolean {
  const role = detectRole(element);
  const landmarkRoles: ControlRole[] = [
    'main',
    'navigation',
    'header',
    'footer',
    'aside',
    'dialog',
    'search',
    'region',
  ];

  return landmarkRoles.includes(role);
}

/**
 * Gets role prefix for ID generation
 *
 * @param role - ControlRole
 * @returns 2-character prefix
 */
export function getRolePrefix(role: ControlRole): string {
  const prefixes: Record<ControlRole, string> = {
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
    columnheader: 'co',
  };

  return prefixes[role] || 're';
}
