/**
 * State Extractor Module
 *
 * Purpose: Extract element-specific state properties (checked, disabled, required, etc.)
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/data-model.md - ControlStates
 */

import type { ControlStates, ControlRole } from './pageModel';
import { CONSTRAINTS } from './pageModel';

/**
 * Extracts state properties from an element
 *
 * @param element - Element to extract states from
 * @param role - Element's control role
 * @param includeValues - Whether to include actual form values (privacy flag)
 * @returns ControlStates object
 *
 * Privacy Rules:
 * - NEVER include password values or lengths
 * - Only include values when includeValues=true
 * - Use value_len for non-password fields (privacy-preserving signal)
 */
export function extractStates(
  element: Element,
  role: ControlRole,
  includeValues: boolean
): ControlStates {
  const states: ControlStates = {};

  // Common states (all elements)
  extractDisabledState(element, states);

  // Role-specific states
  switch (role) {
    case 'checkbox':
    case 'radio':
      extractCheckedState(element, states);
      extractRequiredState(element, states);
      break;

    case 'textbox':
      extractTextboxStates(element, states, includeValues);
      break;

    case 'combobox':
      extractComboboxStates(element, states, includeValues);
      break;

    case 'button':
      extractButtonStates(element, states);
      break;

    case 'link':
      extractLinkStates(element, states);
      break;

    case 'switch':
      extractSwitchStates(element, states);
      break;

    case 'slider':
      extractSliderStates(element, states);
      break;
  }

  return states;
}

/**
 * Extracts disabled state (common to all controls)
 *
 * @param element - Element to check
 * @param states - States object to populate
 */
function extractDisabledState(element: Element, states: ControlStates): void {
  // Check disabled attribute
  if (element.hasAttribute('disabled')) {
    states.disabled = true;
    return;
  }

  // Check aria-disabled
  const ariaDisabled = element.getAttribute('aria-disabled');
  if (ariaDisabled === 'true') {
    states.disabled = true;
  }

  // Only include disabled if true (omit if false)
}

/**
 * Extracts checked state for checkbox/radio
 *
 * @param element - Element to check
 * @param states - States object to populate
 */
function extractCheckedState(element: Element, states: ControlStates): void {
  // Check checked attribute (for input elements)
  if ('checked' in element) {
    states.checked = (element as HTMLInputElement).checked;
    return;
  }

  // Check aria-checked
  const ariaChecked = element.getAttribute('aria-checked');
  if (ariaChecked === 'true') {
    states.checked = true;
  } else if (ariaChecked === 'false') {
    states.checked = false;
  } else if (ariaChecked === 'mixed') {
    states.checked = 'mixed';
  } else {
    states.checked = false; // Default
  }
}

/**
 * Extracts expanded state (for expandable elements)
 *
 * @param element - Element to check
 * @param states - States object to populate
 */
function extractExpandedState(element: Element, states: ControlStates): void {
  const ariaExpanded = element.getAttribute('aria-expanded');
  if (ariaExpanded === 'true') {
    states.expanded = true;
  } else if (ariaExpanded === 'false') {
    states.expanded = false;
  }

  // Check for details element (open attribute)
  if (element.tagName.toLowerCase() === 'details') {
    states.expanded = element.hasAttribute('open');
  }
}

/**
 * Extracts required state (for form fields)
 *
 * @param element - Element to check
 * @param states - States object to populate
 */
function extractRequiredState(element: Element, states: ControlStates): void {
  // Check required attribute
  if (element.hasAttribute('required')) {
    states.required = true;
    return;
  }

  // Check aria-required
  const ariaRequired = element.getAttribute('aria-required');
  if (ariaRequired === 'true') {
    states.required = true;
  }
}

/**
 * Extracts states for textbox inputs
 *
 * @param element - Input element
 * @param states - States object to populate
 * @param includeValues - Whether to include actual values
 */
function extractTextboxStates(
  element: Element,
  states: ControlStates,
  includeValues: boolean
): void {
  const input = element as HTMLInputElement;

  // Required state
  extractRequiredState(element, states);

  // Placeholder text (safe to include)
  if (input.placeholder) {
    let placeholder = input.placeholder.trim();
    if (placeholder.length > CONSTRAINTS.MAX_PLACEHOLDER_LENGTH) {
      placeholder = placeholder.substring(0, CONSTRAINTS.MAX_PLACEHOLDER_LENGTH);
    }
    states.placeholder = placeholder;
  }

  // Password fields: NEVER include value or value_len (privacy)
  if (input.type === 'password') {
    // Do NOT include value or value_len for passwords
    return;
  }

  // Non-password fields: include value or value_len based on includeValues flag
  const value = input.value || '';

  if (includeValues) {
    // Include actual value (privacy risk - user must opt in)
    states.value = value;
  } else {
    // Include value_len only (privacy-preserving signal)
    states.value_len = value.length;
  }
}

/**
 * Extracts states for combobox (select) elements
 *
 * @param element - Select element
 * @param states - States object to populate
 * @param includeValues - Whether to include actual values
 */
function extractComboboxStates(
  element: Element,
  states: ControlStates,
  includeValues: boolean
): void {
  const select = element as HTMLSelectElement;

  // Required state
  extractRequiredState(element, states);

  // Selected value
  const value = select.value || '';

  if (includeValues) {
    states.value = value;
  } else {
    states.value_len = value.length;
  }
}

/**
 * Extracts states for button elements
 *
 * @param element - Button element
 * @param states - States object to populate
 */
function extractButtonStates(element: Element, states: ControlStates): void {
  // Expanded state (for expandable buttons)
  extractExpandedState(element, states);

  // Pressed state (for toggle buttons)
  const ariaPressed = element.getAttribute('aria-pressed');
  if (ariaPressed === 'true') {
    states.checked = true;
  } else if (ariaPressed === 'false') {
    states.checked = false;
  }
}

/**
 * Extracts states for link elements
 *
 * @param element - Link element
 * @param states - States object to populate
 */
function extractLinkStates(element: Element, states: ControlStates): void {
  // Get href attribute (not .href property which returns full URL)
  const href = element.getAttribute('href');

  if (href) {
    states.href = href;
  }
}

/**
 * Extracts states for switch (toggle) elements
 *
 * @param element - Switch element
 * @param states - States object to populate
 */
function extractSwitchStates(element: Element, states: ControlStates): void {
  // Switch uses aria-checked
  const ariaChecked = element.getAttribute('aria-checked');
  if (ariaChecked === 'true') {
    states.checked = true;
  } else if (ariaChecked === 'false') {
    states.checked = false;
  }
}

/**
 * Extracts states for slider (range) elements
 *
 * @param element - Slider element
 * @param states - States object to populate
 */
function extractSliderStates(element: Element, states: ControlStates): void {
  // Value (current position)
  const ariaValueNow = element.getAttribute('aria-valuenow');
  if (ariaValueNow) {
    states.value_len = parseInt(ariaValueNow, 10);
  }

  // For input[type="range"]
  if (element.tagName.toLowerCase() === 'input') {
    const input = element as HTMLInputElement;
    if (input.type === 'range' && input.value) {
      states.value_len = parseInt(input.value, 10);
    }
  }
}

/**
 * Normalizes href to relative path when possible
 *
 * @param href - Absolute or relative URL
 * @param baseUrl - Base URL for comparison
 * @returns Relative path or original href
 *
 * Strategy:
 * - If href matches baseUrl origin, return pathname only
 * - Otherwise return full href
 */
export function normalizeHref(href: string, baseUrl?: string): string {
  if (!baseUrl) {
    return href;
  }

  try {
    const hrefUrl = new URL(href, baseUrl);
    const baseUrlObj = new URL(baseUrl);

    // Same origin: return relative path
    if (hrefUrl.origin === baseUrlObj.origin) {
      return hrefUrl.pathname + hrefUrl.search + hrefUrl.hash;
    }

    // Different origin: return full URL
    return hrefUrl.href;
  } catch {
    // Invalid URL: return as-is
    return href;
  }
}
