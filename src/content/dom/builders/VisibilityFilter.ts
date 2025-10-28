/**
 * Visibility Filter
 *
 * Determines if a DOM element is visible to the user.
 * Uses comprehensive visibility checks based on computed styles and bounding boxes.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

/**
 * Check if an element is visible to the user
 *
 * An element is considered hidden if ANY of the following is true:
 * - display: none (computed style)
 * - visibility: hidden (computed style)
 * - opacity: 0 (computed style)
 * - Zero-size bounding box (width === 0 || height === 0)
 * - aria-hidden="true" attribute
 * - inert attribute (modern HTML)
 *
 * @param element - DOM element to check
 * @returns true if element is visible, false if hidden
 */
export function isVisible(element: Element): boolean {
  try {
    const computed = window.getComputedStyle(element);

    // Check display: none
    if (computed.display === "none") {
      return false;
    }

    // Check visibility: hidden
    if (computed.visibility === "hidden") {
      return false;
    }

    // Check opacity: 0
    if (computed.opacity === "0") {
      return false;
    }

    // Check zero-size bounding box
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    // Check aria-hidden attribute
    if (element.getAttribute("aria-hidden") === "true") {
      return false;
    }

    // Check inert attribute (modern HTML)
    if (element.hasAttribute("inert")) {
      return false;
    }

    return true;
  } catch (error) {
    // If we can't determine visibility, assume visible
    // (conservative approach to avoid missing elements)
    return true;
  }
}

/**
 * Check if element is within the current viewport
 *
 * @param element - DOM element to check
 * @returns true if element intersects viewport
 */
export function isInViewport(element: Element): boolean {
  try {
    const rect = element.getBoundingClientRect();

    return (
      rect.top < window.innerHeight &&
      rect.bottom > 0 &&
      rect.left < window.innerWidth &&
      rect.right > 0
    );
  } catch (error) {
    return false;
  }
}

/**
 * Check if element is effectively hidden by parent
 *
 * Recursively checks parent elements for visibility issues.
 * This is a more expensive check, use sparingly.
 *
 * @param element - DOM element to check
 * @returns true if any parent is hidden
 */
export function isHiddenByParent(element: Element): boolean {
  let current: Element | null = element.parentElement;

  while (current && current !== document.body) {
    if (!isVisible(current)) {
      return true;
    }
    current = current.parentElement;
  }

  return false;
}

/**
 * Check if element is occluded by another element
 *
 * Uses paint order to determine if element is visible at its center point.
 * More expensive check, use sparingly.
 *
 * @param element - DOM element to check
 * @returns true if element is not occluded
 */
export function isNotOccluded(element: Element): boolean {
  try {
    const rect = element.getBoundingClientRect();

    // Get center point
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    // Check if element at center point
    const topElement = document.elementFromPoint(centerX, centerY);

    if (!topElement) return false;

    // Element is visible if it's the top element or contains the top element
    return topElement === element || element.contains(topElement);
  } catch (error) {
    return true; // Conservative: assume visible if check fails
  }
}
