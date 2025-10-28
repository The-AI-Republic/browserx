/**
 * Mutation Tracker
 *
 * Tracks DOM changes using MutationObserver to enable incremental snapshot updates.
 * Identifies "dirty" elements that need rebuilding in the virtual DOM tree.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

/**
 * Information about changed elements in the DOM
 */
export interface MutationInfo {
  /** Set of elements that were added to the DOM */
  addedElements: Set<Element>;

  /** Set of elements that were removed from the DOM */
  removedElements: Set<Element>;

  /** Set of elements whose attributes changed */
  modifiedElements: Set<Element>;

  /** Set of elements that are ancestors of changed elements (need rebuild) */
  dirtyAncestors: Set<Element>;

  /** Whether a structural change occurred (add/remove) */
  hasStructuralChanges: boolean;

  /** Total mutation count */
  mutationCount: number;
}

/**
 * MutationTracker class
 *
 * Responsible for:
 * - Observing DOM mutations via MutationObserver
 * - Collecting affected elements
 * - Identifying dirty subtrees for incremental rebuild
 */
export class MutationTracker {
  private observer?: MutationObserver;
  private mutations: MutationRecord[] = [];
  private isObserving = false;

  /**
   * Start tracking mutations
   *
   * @param root - Root element to observe (typically document.body)
   */
  startTracking(root: Element): void {
    if (this.isObserving) {
      return;
    }

    this.mutations = [];

    this.observer = new MutationObserver((mutationsList) => {
      this.mutations.push(...mutationsList);
    });

    // Observe all types of changes
    this.observer.observe(root, {
      childList: true, // Track added/removed nodes
      subtree: true, // Track entire tree
      attributes: true, // Track attribute changes
      attributeOldValue: false, // Don't need old values
      characterData: true, // Track text content changes
      characterDataOldValue: false, // Don't need old values
    });

    this.isObserving = true;
  }

  /**
   * Stop tracking mutations
   */
  stopTracking(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = undefined;
    }
    this.isObserving = false;
  }

  /**
   * Get mutation information since last collection
   *
   * @returns MutationInfo with all changes
   */
  collectMutations(): MutationInfo {

    const addedElements = new Set<Element>();
    const removedElements = new Set<Element>();
    const modifiedElements = new Set<Element>();
    const dirtyAncestors = new Set<Element>();

    let hasStructuralChanges = false;
    let childListCount = 0;
    let attributeCount = 0;
    let characterDataCount = 0;

    // Process all mutations
    for (const mutation of this.mutations) {
      if (mutation.type === "childList") {
        hasStructuralChanges = true;
        childListCount++;

        // Track added nodes
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof Element) {
            addedElements.add(node);
            // Mark parent as dirty
            if (mutation.target instanceof Element) {
              dirtyAncestors.add(mutation.target);
            }
          }
        }

        // Track removed nodes
        for (const node of Array.from(mutation.removedNodes)) {
          if (node instanceof Element) {
            removedElements.add(node);
            // Mark parent as dirty
            if (mutation.target instanceof Element) {
              dirtyAncestors.add(mutation.target);
            }
          }
        }
      } else if (mutation.type === "attributes") {
        attributeCount++;
        // Track attribute changes
        if (mutation.target instanceof Element) {
          // Skip insignificant attribute changes
          if (!this.isInsignificantAttributeChange(mutation)) {
            modifiedElements.add(mutation.target);
          }
        }
      } else if (mutation.type === "characterData") {
        characterDataCount++;
        // Track text content changes
        if (mutation.target.parentElement) {
          modifiedElements.add(mutation.target.parentElement);
        }
      }
    }

    // Add ancestors of all changed elements to dirty set
    this.collectAncestors(addedElements, dirtyAncestors);
    this.collectAncestors(modifiedElements, dirtyAncestors);

    const mutationCount = this.mutations.length;


    // Clear collected mutations
    this.mutations = [];

    return {
      addedElements,
      removedElements,
      modifiedElements,
      dirtyAncestors,
      hasStructuralChanges,
      mutationCount,
    };
  }

  /**
   * Check if there are any tracked mutations
   *
   * @returns true if mutations have been collected
   */
  hasMutations(): boolean {
    return this.mutations.length > 0;
  }

  /**
   * Clear all tracked mutations without processing
   */
  clearMutations(): void {
    this.mutations = [];
  }

  /**
   * Check if an attribute change is insignificant
   *
   * Some attribute changes (like style, class) don't affect virtual DOM structure
   *
   * @param mutation - Mutation record to check
   * @returns true if insignificant
   */
  private isInsignificantAttributeChange(mutation: MutationRecord): boolean {
    const attr = mutation.attributeName;

    // Style changes are usually visual only
    if (attr === "style") {
      return true;
    }

    // Class changes might affect visibility, so we keep them
    // (could be optimized further by checking if visibility changed)
    return false;
  }

  /**
   * Collect all ancestors of a set of elements
   *
   * @param elements - Elements to get ancestors for
   * @param ancestorSet - Set to add ancestors to
   */
  private collectAncestors(elements: Set<Element>, ancestorSet: Set<Element>): void {
    for (const element of elements) {
      let current = element.parentElement;
      while (current && current !== document.body) {
        ancestorSet.add(current);
        current = current.parentElement;
      }
    }
  }
}
