/**
 * Heading Extractor Module
 *
 * Purpose: Extract h1/h2/h3 headings from page
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/data-model.md - PageModel.headings
 */

import { CONSTRAINTS } from './pageModel';
import { checkVisibility } from './visibilityFilter';

/**
 * Extracts headings from a document
 *
 * @param document - Document to extract from
 * @param window - Window context (for visibility checks)
 * @param maxHeadings - Maximum number of headings to extract
 * @returns Array of heading texts (max 30)
 *
 * Strategy:
 * - Extracts h1, h2, h3 elements
 * - Filters out hidden headings
 * - Preserves document order
 * - Truncates to maxHeadings limit
 * - Cleans and trims text content
 */
export function extractHeadings(
  document: Document,
  window: Window,
  maxHeadings: number = CONSTRAINTS.DEFAULT_MAX_HEADINGS
): string[] {
  const headings: string[] = [];

  // Query all h1, h2, h3 elements
  const headingElements = document.querySelectorAll('h1, h2, h3');

  for (const heading of Array.from(headingElements)) {
    // Stop if reached max
    if (headings.length >= maxHeadings) {
      break;
    }

    // Skip hidden headings
    const visibility = checkVisibility(heading, window);
    if (!visibility.visible) {
      continue;
    }

    // Extract and clean text
    const text = extractHeadingText(heading);
    if (text && text.length > 0) {
      headings.push(text);
    }
  }

  return headings;
}

/**
 * Extracts text content from a heading element
 *
 * @param heading - Heading element
 * @returns Cleaned heading text (max 200 chars)
 *
 * Cleaning:
 * - Gets innerText (respects visibility)
 * - Trims whitespace
 * - Collapses multiple spaces
 * - Truncates to max length
 */
function extractHeadingText(heading: Element): string {
  let text = '';

  // Try innerText first (respects CSS visibility)
  if ('innerText' in heading) {
    text = (heading as HTMLElement).innerText;
  } else {
    text = heading.textContent || '';
  }

  // Clean whitespace
  text = text.replace(/\s+/g, ' ').trim();

  // Truncate to max length
  if (text.length > CONSTRAINTS.MAX_HEADING_LENGTH) {
    text = text.substring(0, CONSTRAINTS.MAX_HEADING_LENGTH);
  }

  return text;
}

/**
 * Gets heading level (1, 2, or 3)
 *
 * @param heading - Heading element
 * @returns Heading level (1-3)
 */
export function getHeadingLevel(heading: Element): number {
  const tagName = heading.tagName.toLowerCase();

  switch (tagName) {
    case 'h1':
      return 1;
    case 'h2':
      return 2;
    case 'h3':
      return 3;
    default:
      // Check aria-level
      const ariaLevel = heading.getAttribute('aria-level');
      if (ariaLevel) {
        const level = parseInt(ariaLevel, 10);
        if (level >= 1 && level <= 3) {
          return level;
        }
      }
      return 0;
  }
}

/**
 * Checks if element is a heading element
 *
 * @param element - Element to check
 * @returns True if element is h1, h2, or h3
 */
export function isHeadingElement(element: Element): boolean {
  const tagName = element.tagName.toLowerCase();
  return ['h1', 'h2', 'h3'].includes(tagName);
}

/**
 * Extracts heading hierarchy (nested structure)
 *
 * @param document - Document to extract from
 * @param window - Window context
 * @returns Hierarchical heading structure
 *
 * Note: This is for potential future enhancement
 * Current implementation uses flat list
 */
export interface HeadingNode {
  level: number;
  text: string;
  children: HeadingNode[];
}

export function extractHeadingHierarchy(document: Document, window: Window): HeadingNode[] {
  const headingElements = document.querySelectorAll('h1, h2, h3');
  const roots: HeadingNode[] = [];
  const stack: HeadingNode[] = [];

  for (const heading of Array.from(headingElements)) {
    const visibility = checkVisibility(heading, window);
    if (!visibility.visible) {
      continue;
    }

    const level = getHeadingLevel(heading);
    const text = extractHeadingText(heading);

    if (!text) {
      continue;
    }

    const node: HeadingNode = {
      level,
      text,
      children: [],
    };

    // Find parent in stack
    while (stack.length > 0 && stack[stack.length - 1].level >= level) {
      stack.pop();
    }

    if (stack.length === 0) {
      roots.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }

    stack.push(node);
  }

  return roots;
}
