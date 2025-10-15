/**
 * Selector Generator Module
 *
 * Purpose: Generate stable, short CSS selectors for interactive elements
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/research.md - Decision 7
 *
 * Priority Order:
 * 1. ID selector (#element-id)
 * 2. Test ID attributes (data-testid, data-test, etc.)
 * 3. Short path with classes (div.class > button)
 * 4. Nth-child selectors (as last resort)
 */

/**
 * CSS.escape polyfill for environments where it's not available
 */
function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && CSS.escape) {
    return CSS.escape(value);
  }

  // Simple polyfill for CSS.escape
  return value.replace(/(["\\#$!^&*()+=\[\]{};:'"`<>,.\/? ])/g, '\\$1');
}

/**
 * Generates a CSS selector for an element
 *
 * @param element - Target element
 * @param document - Document context (for uniqueness verification)
 * @returns CSS selector string
 *
 * Strategy:
 * - Prioritizes ID selectors (most stable)
 * - Falls back to test IDs (data-testid, data-test)
 * - Generates short class-based paths
 * - Uses nth-child only as last resort
 */
export function generateSelector(element: Element, document: Document): string {
  // Strategy 1: ID selector (highest priority)
  if (element.id) {
    const idSelector = `#${cssEscape(element.id)}`;
    if (isUniqueSelector(idSelector, element, document)) {
      return idSelector;
    }
  }

  // Strategy 2: Test ID attributes
  const testIdSelector = getTestIdSelector(element);
  if (testIdSelector && isUniqueSelector(testIdSelector, element, document)) {
    return testIdSelector;
  }

  // Strategy 3: Class-based selector
  const classSelector = getClassSelector(element);
  if (classSelector && isUniqueSelector(classSelector, element, document)) {
    return classSelector;
  }

  // Strategy 4: Short path with classes
  const pathSelector = generateShortPath(element, document);
  if (pathSelector && isUniqueSelector(pathSelector, element, document)) {
    return pathSelector;
  }

  // Strategy 5: Nth-child selector (last resort)
  return generateNthChildSelector(element);
}

/**
 * Checks if a selector uniquely identifies the element
 *
 * @param selector - CSS selector to test
 * @param element - Expected target element
 * @param document - Document context
 * @returns True if selector is unique
 */
function isUniqueSelector(selector: string, element: Element, document: Document): boolean {
  try {
    const matches = document.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === element;
  } catch {
    return false;
  }
}

/**
 * Generates selector from test ID attributes
 *
 * @param element - Target element
 * @returns Test ID selector or null
 *
 * Supported attributes:
 * - data-testid
 * - data-test
 * - data-test-id
 */
function getTestIdSelector(element: Element): string | null {
  const testIdAttrs = ['data-testid', 'data-test', 'data-test-id'];

  for (const attr of testIdAttrs) {
    const value = element.getAttribute(attr);
    if (value) {
      return `[${attr}="${cssEscape(value)}"]`;
    }
  }

  return null;
}

/**
 * Generates selector from element's classes
 *
 * @param element - Target element
 * @returns Class-based selector or null
 *
 * Strategy:
 * - Uses tag name + first significant class
 * - Filters out utility classes (e.g., "hidden", "active")
 */
function getClassSelector(element: Element): string | null {
  const tagName = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).filter(cls => !isUtilityClass(cls));

  if (classes.length === 0) {
    return null;
  }

  // Use first significant class
  const className = classes[0];
  return `${tagName}.${cssEscape(className)}`;
}

/**
 * Checks if a class name is a utility class (should be ignored)
 *
 * @param className - Class name to check
 * @returns True if utility class
 *
 * Utility classes:
 * - State classes: active, disabled, hidden, visible
 * - Layout classes: flex, grid, block
 * - Tailwind-style: text-*, bg-*, p-*, m-*
 */
function isUtilityClass(className: string): boolean {
  const utilityPatterns = [
    /^(active|disabled|hidden|visible|open|closed)$/,
    /^(flex|grid|block|inline|relative|absolute)$/,
    /^(text|bg|p|m|w|h|border)-/,
  ];

  return utilityPatterns.some(pattern => pattern.test(className));
}

/**
 * Generates a short path selector (tag > tag.class)
 *
 * @param element - Target element
 * @param document - Document context
 * @param maxDepth - Maximum path depth (default: 3)
 * @returns Short path selector
 *
 * Strategy:
 * - Walks up the DOM tree
 * - Includes classes for specificity
 * - Stops at unique selector or maxDepth
 */
function generateShortPath(element: Element, document: Document, maxDepth = 3): string {
  const path: string[] = [];
  let current: Element | null = element;
  let depth = 0;

  while (current && depth < maxDepth) {
    const segment = getElementSegment(current);
    path.unshift(segment);

    const pathSelector = path.join(' > ');
    if (isUniqueSelector(pathSelector, element, document)) {
      return pathSelector;
    }

    current = current.parentElement;
    depth++;
  }

  return path.join(' > ');
}

/**
 * Gets a selector segment for an element
 *
 * @param element - Element to describe
 * @returns Selector segment (tag or tag.class)
 */
function getElementSegment(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const classes = Array.from(element.classList).filter(cls => !isUtilityClass(cls));

  if (classes.length > 0) {
    return `${tagName}.${cssEscape(classes[0])}`;
  }

  return tagName;
}

/**
 * Generates nth-child selector (last resort)
 *
 * @param element - Target element
 * @returns Nth-child selector
 *
 * Strategy:
 * - Uses tag:nth-child(n) format
 * - Walks up tree for uniqueness
 */
function generateNthChildSelector(element: Element): string {
  const path: string[] = [];
  let current: Element | null = element;

  while (current && current.parentElement) {
    const parent = current.parentElement;
    const siblings = Array.from(parent.children).filter(
      child => child.tagName === current!.tagName
    );

    const index = siblings.indexOf(current) + 1;
    const tagName = current.tagName.toLowerCase();

    if (siblings.length > 1) {
      path.unshift(`${tagName}:nth-child(${index})`);
    } else {
      path.unshift(tagName);
    }

    current = parent;
  }

  return path.join(' > ');
}

/**
 * Shortens a selector by removing redundant parts
 *
 * @param selector - Original selector
 * @param element - Target element
 * @param document - Document context
 * @returns Shortened selector
 *
 * Strategy:
 * - Removes redundant ancestor selectors
 * - Preserves uniqueness
 */
export function shortenSelector(selector: string, element: Element, document: Document): string {
  const parts = selector.split(' > ');

  // Try removing parts from the beginning
  for (let i = 0; i < parts.length - 1; i++) {
    const shortened = parts.slice(i).join(' > ');
    if (isUniqueSelector(shortened, element, document)) {
      return shortened;
    }
  }

  return selector;
}
