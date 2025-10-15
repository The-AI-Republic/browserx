/**
 * Accessible Name Utility Module
 *
 * Purpose: Compute WCAG-compliant accessible names using dom-accessibility-api
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/research.md - Decision 1
 */

import { computeAccessibleName } from 'dom-accessibility-api';
import { CONSTRAINTS } from './pageModel';

/**
 * Computes accessible name for an element
 *
 * @param element - Element to compute name for
 * @returns Accessible name (max 160 chars, trimmed)
 *
 * Strategy:
 * - Uses dom-accessibility-api for WCAG compliance
 * - Falls back to text content if no accessible name
 * - Truncates to max length (160 chars)
 * - Returns empty string if no name found
 */
export function getAccessibleName(element: Element): string {
  try {
    // Use dom-accessibility-api for WCAG-compliant name
    let name = computeAccessibleName(element);

    // Fallback: try text content if no accessible name
    if (!name || name.trim().length === 0) {
      name = getTextContentFallback(element);
    }

    // Trim and truncate
    name = name.trim();
    if (name.length > CONSTRAINTS.MAX_NAME_LENGTH) {
      name = name.substring(0, CONSTRAINTS.MAX_NAME_LENGTH);
    }

    return name;
  } catch (error) {
    // Fallback on error
    return getTextContentFallback(element);
  }
}

/**
 * Fallback: extract text content from element
 *
 * @param element - Element to extract text from
 * @returns Text content (trimmed, max 160 chars)
 *
 * Strategy:
 * - Gets innerText if available
 * - Falls back to textContent
 * - Cleans whitespace
 */
function getTextContentFallback(element: Element): string {
  let text = '';

  // Try innerText (respects visibility)
  if ('innerText' in element) {
    text = (element as HTMLElement).innerText;
  } else {
    text = element.textContent || '';
  }

  // Clean whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Truncate
  if (text.length > CONSTRAINTS.MAX_NAME_LENGTH) {
    text = text.substring(0, CONSTRAINTS.MAX_NAME_LENGTH);
  }

  return text;
}

/**
 * Gets accessible name from aria-label attribute
 *
 * @param element - Element to check
 * @returns aria-label value or null
 */
export function getAriaLabel(element: Element): string | null {
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.trim().length > 0) {
    return ariaLabel.trim();
  }
  return null;
}

/**
 * Gets accessible name from aria-labelledby reference
 *
 * @param element - Element to check
 * @param document - Document context
 * @returns Referenced element's text or null
 */
export function getAriaLabelledBy(element: Element, document: Document): string | null {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (!labelledBy) {
    return null;
  }

  const ids = labelledBy.split(/\s+/);
  const texts: string[] = [];

  for (const id of ids) {
    const labelElement = document.getElementById(id);
    if (labelElement) {
      texts.push(labelElement.textContent?.trim() || '');
    }
  }

  const combined = texts.join(' ').trim();
  return combined.length > 0 ? combined : null;
}

/**
 * Gets accessible name from associated label element
 *
 * @param element - Form element to check
 * @param document - Document context
 * @returns Label text or null
 *
 * Strategy:
 * - Checks for label with matching "for" attribute
 * - Checks for wrapping label element
 */
export function getAssociatedLabel(element: Element, document: Document): string | null {
  // Strategy 1: label[for="id"]
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) {
      return label.textContent?.trim() || null;
    }
  }

  // Strategy 2: Wrapping label
  const labelParent = element.closest('label');
  if (labelParent) {
    return labelParent.textContent?.trim() || null;
  }

  return null;
}

/**
 * Gets accessible name from placeholder attribute
 *
 * @param element - Input element to check
 * @returns Placeholder text or null
 *
 * Note: Placeholder is lowest priority for accessible name
 */
export function getPlaceholder(element: Element): string | null {
  const placeholder = element.getAttribute('placeholder');
  if (placeholder && placeholder.trim().length > 0) {
    return placeholder.trim();
  }
  return null;
}

/**
 * Gets accessible name from title attribute
 *
 * @param element - Element to check
 * @returns Title text or null
 */
export function getTitle(element: Element): string | null {
  const title = element.getAttribute('title');
  if (title && title.trim().length > 0) {
    return title.trim();
  }
  return null;
}

/**
 * Validates accessible name quality
 *
 * @param name - Accessible name to validate
 * @returns True if name is meaningful (not empty, not just whitespace)
 */
export function isValidAccessibleName(name: string): boolean {
  if (!name) {
    return false;
  }

  const trimmed = name.trim();

  if (trimmed.length === 0) {
    return false;
  }

  // Reject names that are just punctuation or special chars
  if (/^[^a-z0-9]+$/i.test(trimmed)) {
    return false;
  }

  return true;
}

/**
 * Gets accessible description from aria-describedby
 *
 * @param element - Element to check
 * @param document - Document context
 * @returns Description text or null
 *
 * Note: This is for description, not name (lower priority)
 */
export function getAriaDescription(element: Element, document: Document): string | null {
  const describedBy = element.getAttribute('aria-describedby');
  if (!describedBy) {
    return null;
  }

  const ids = describedBy.split(/\s+/);
  const texts: string[] = [];

  for (const id of ids) {
    const descElement = document.getElementById(id);
    if (descElement) {
      texts.push(descElement.textContent?.trim() || '');
    }
  }

  const combined = texts.join(' ').trim();
  return combined.length > 0 ? combined : null;
}
