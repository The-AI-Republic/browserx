/**
 * ElementLocator - Finds elements using selectors from DOM selector map
 * Supports selector-based, nodeId-based, and semantic description-based location
 */

import type { ElementTarget, DOMSelectorMap, ActionError } from '../../types/page-actions';

export class ElementLocator {
  /**
   * Locate an element in the DOM using the provided target specification
   * @param target Element target with selector, nodeId, or semanticDescription
   * @param selectorMap DOM selector map for context
   * @returns The located element or null if not found
   */
  async locateElement(
    target: ElementTarget,
    selectorMap?: DOMSelectorMap
  ): Promise<Element | null> {
    // Try selector first
    if (target.selector) {
      return this.locateBySelector(target.selector);
    }

    // Try backend node ID
    if (target.nodeId && selectorMap) {
      return this.locateByNodeId(target.nodeId, selectorMap);
    }

    // Try semantic description (requires LLM to match against selector map)
    if (target.semanticDescription && selectorMap) {
      return this.locateBySemanticDescription(target.semanticDescription, selectorMap);
    }

    throw this.createError(
      'VALIDATION_FAILED',
      'ElementTarget must provide selector, nodeId, or semanticDescription'
    );
  }

  /**
   * Locate element by CSS selector
   */
  private locateBySelector(selector: string): Element | null {
    try {
      return document.querySelector(selector);
    } catch (error) {
      console.error(`[ElementLocator] Invalid selector: ${selector}`, error);
      return null;
    }
  }

  /**
   * Locate element by backend node ID from selector map
   */
  private locateByNodeId(nodeId: number, selectorMap: DOMSelectorMap): Element | null {
    // Find entry in selector map with matching backend_node_id
    for (const [selector, entry] of Object.entries(selectorMap.selector_map)) {
      if (entry.backend_node_id === nodeId) {
        return this.locateBySelector(selector);
      }
    }

    console.warn(`[ElementLocator] No element found for nodeId: ${nodeId}`);
    return null;
  }

  /**
   * Locate element by semantic description
   * This would typically use LLM to match description against selector map
   * For now, implement basic keyword matching as placeholder
   */
  private locateBySemanticDescription(
    description: string,
    selectorMap: DOMSelectorMap
  ): Element | null {
    console.log(`[ElementLocator] Semantic description matching: "${description}"`);

    // TODO: Integrate with LLM for proper semantic matching
    // For now, do basic keyword matching against selector map attributes

    const descriptionLower = description.toLowerCase();
    let bestMatch: { selector: string; score: number } | null = null;

    for (const [selector, entry] of Object.entries(selectorMap.selector_map)) {
      let score = 0;

      // Check if selector contains keywords from description
      if (selector.toLowerCase().includes(descriptionLower)) {
        score += 10;
      }

      // Check attributes (name, role, etc.)
      if (entry.attributes.name?.toLowerCase().includes(descriptionLower)) {
        score += 8;
      }

      if (entry.attributes.role?.toLowerCase().includes(descriptionLower)) {
        score += 6;
      }

      // Simple word matching
      const words = descriptionLower.split(/\s+/);
      words.forEach(word => {
        if (word.length > 3) { // Skip short words
          if (selector.toLowerCase().includes(word)) score += 2;
          if (entry.attributes.name?.toLowerCase().includes(word)) score += 3;
          if (entry.attributes.role?.toLowerCase().includes(word)) score += 2;
        }
      });

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { selector, score };
      }
    }

    if (bestMatch) {
      console.log(`[ElementLocator] Semantic match found: ${bestMatch.selector} (score: ${bestMatch.score})`);
      return this.locateBySelector(bestMatch.selector);
    }

    console.warn(`[ElementLocator] No semantic match found for: "${description}"`);
    return null;
  }

  /**
   * Check if an element is visible in the viewport
   */
  isVisible(element: Element): boolean {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    // Check basic CSS visibility
    const style = window.getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    ) {
      return false;
    }

    // Check if element has dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      return false;
    }

    return true;
  }

  /**
   * Check if an element is enabled (not disabled)
   */
  isEnabled(element: Element): boolean {
    if (element instanceof HTMLInputElement ||
        element instanceof HTMLButtonElement ||
        element instanceof HTMLSelectElement ||
        element instanceof HTMLTextAreaElement) {
      return !element.disabled;
    }

    // For other elements, check aria-disabled
    return element.getAttribute('aria-disabled') !== 'true';
  }

  /**
   * Check if an element is interactable (visible and enabled)
   */
  isInteractable(element: Element): boolean {
    return this.isVisible(element) && this.isEnabled(element);
  }

  /**
   * Check if an element is obscured by another element
   * Uses elementFromPoint to detect if clicked point would hit the target
   */
  isObscured(element: Element): boolean {
    if (!(element instanceof HTMLElement)) {
      return true;
    }

    const rect = element.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const topElement = document.elementFromPoint(centerX, centerY);

    // Element is obscured if the top element at center point is not the target or its child
    return topElement !== null && !element.contains(topElement);
  }

  /**
   * Validate element is ready for interaction
   * @throws ActionError if element cannot be interacted with
   */
  validateInteractability(element: Element): void {
    if (!this.isVisible(element)) {
      throw this.createError(
        'ELEMENT_NOT_INTERACTABLE',
        'Element is not visible',
        true
      );
    }

    if (!this.isEnabled(element)) {
      throw this.createError(
        'ELEMENT_NOT_INTERACTABLE',
        'Element is disabled',
        false
      );
    }

    if (this.isObscured(element)) {
      throw this.createError(
        'ELEMENT_OBSCURED',
        'Element is obscured by another element',
        true
      );
    }
  }

  /**
   * Create an ActionError
   */
  private createError(
    code: string,
    message: string,
    recoverable: boolean = false
  ): ActionError {
    return {
      code: code as any,
      message,
      category: 'element_state',
      recoverable
    };
  }
}
