/**
 * Shadow DOM Detection and Traversal
 *
 * Handles shadow DOM traversal for web components.
 * Detects both open and closed shadow roots.
 */

/**
 * Shadow root information
 */
export interface ShadowRootInfo {
  host: Element;
  shadowRoot: ShadowRoot | null;
  type: 'open' | 'closed' | 'user-agent';
  accessible: boolean;
}

/**
 * Shadow DOM traversal options
 */
export interface ShadowDOMTraversalOptions {
  includeUserAgent: boolean;
  maxDepth: number;
}

/**
 * Detect if element has shadow root
 *
 * @param element - Element to check
 * @returns Shadow root information or null
 */
export function detectShadowRoot(element: Element): ShadowRootInfo | null {
  // Check for open shadow root
  if (element.shadowRoot) {
    return {
      host: element,
      shadowRoot: element.shadowRoot,
      type: element.shadowRoot.mode as 'open' | 'closed',
      accessible: true
    };
  }

  // Check for closed shadow root (indirect detection)
  // Closed shadow roots can't be accessed directly, but we can detect them
  // through certain heuristics
  if (hasClosedShadowRoot(element)) {
    return {
      host: element,
      shadowRoot: null,
      type: 'closed',
      accessible: false
    };
  }

  // Check for user-agent shadow root (native elements like <input>, <video>)
  if (hasUserAgentShadowRoot(element)) {
    return {
      host: element,
      shadowRoot: null,
      type: 'user-agent',
      accessible: false
    };
  }

  return null;
}

/**
 * Check if element has a closed shadow root
 *
 * This is a heuristic check since closed shadow roots are intentionally
 * inaccessible. We look for signs like:
 * - Custom element with no children
 * - Has rendered content but no DOM children
 *
 * @param element - Element to check
 * @returns true if element likely has closed shadow root
 */
function hasClosedShadowRoot(element: Element): boolean {
  // Custom elements (with hyphen in tag name) are likely to have shadow DOM
  if (element.tagName.includes('-')) {
    // If element has no children but has rendered content, likely shadow root
    if (element.children.length === 0) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if element has user-agent shadow root
 *
 * User-agent shadow roots are created by the browser for certain
 * native elements (input, video, audio, etc.)
 *
 * @param element - Element to check
 * @returns true if element has user-agent shadow root
 */
function hasUserAgentShadowRoot(element: Element): boolean {
  const NATIVE_SHADOW_ELEMENTS = new Set([
    'INPUT',
    'TEXTAREA',
    'SELECT',
    'VIDEO',
    'AUDIO',
    'DETAILS',
    'PROGRESS',
    'METER'
  ]);

  return NATIVE_SHADOW_ELEMENTS.has(element.tagName);
}

/**
 * Traverse all shadow roots in a tree
 *
 * @param root - Root element to start from
 * @param options - Traversal options
 * @param callback - Callback for each shadow root
 * @param depth - Current depth (internal)
 */
export function traverseShadowRoots(
  root: Element | Document,
  options: ShadowDOMTraversalOptions,
  callback: (info: ShadowRootInfo, depth: number) => void,
  depth: number = 0
): void {
  // Check depth limit
  if (depth >= options.maxDepth) {
    return;
  }

  // Get all elements
  const elements = root instanceof Document
    ? Array.from(root.querySelectorAll('*'))
    : Array.from(root.querySelectorAll('*'));

  // Include root if it's an element
  if (root instanceof Element) {
    elements.unshift(root);
  }

  for (const element of elements) {
    const shadowInfo = detectShadowRoot(element);

    if (shadowInfo) {
      // Skip user-agent shadow roots if not requested
      if (shadowInfo.type === 'user-agent' && !options.includeUserAgent) {
        continue;
      }

      // Call callback
      callback(shadowInfo, depth);

      // Recursively traverse shadow root content
      if (shadowInfo.accessible && shadowInfo.shadowRoot) {
        traverseShadowRoots(
          shadowInfo.shadowRoot as unknown as Element,
          options,
          callback,
          depth + 1
        );
      }
    }
  }
}

/**
 * Get all accessible shadow roots
 *
 * @param root - Root to search from
 * @param includeUserAgent - Include user-agent shadow roots
 * @returns Array of shadow root information
 */
export function getAllShadowRoots(
  root: Element | Document = document,
  includeUserAgent: boolean = false
): ShadowRootInfo[] {
  const shadowRoots: ShadowRootInfo[] = [];

  traverseShadowRoots(
    root,
    { includeUserAgent, maxDepth: 10 },
    (info) => {
      shadowRoots.push(info);
    }
  );

  return shadowRoots;
}

/**
 * Get all nodes from shadow DOM tree
 *
 * @param shadowRoot - Shadow root to traverse
 * @returns Array of nodes from shadow tree
 */
export function getShadowDOMNodes(shadowRoot: ShadowRoot): Node[] {
  const nodes: Node[] = [];
  const walker = document.createTreeWalker(
    shadowRoot,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
    null
  );

  let node: Node | null;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }

  return nodes;
}

/**
 * Check if element is inside a shadow root
 *
 * @param element - Element to check
 * @returns Shadow root if element is inside one, null otherwise
 */
export function getContainingShadowRoot(element: Element): ShadowRoot | null {
  let parent: Node | null = element.parentNode;

  while (parent) {
    if (parent instanceof ShadowRoot) {
      return parent;
    }
    parent = parent.parentNode;
  }

  return null;
}

/**
 * Get the host element of a shadow root
 *
 * @param node - Node to check
 * @returns Host element or null
 */
export function getShadowHost(node: Node): Element | null {
  if (node instanceof ShadowRoot) {
    return node.host;
  }

  const shadowRoot = getContainingShadowRoot(node as Element);
  return shadowRoot ? shadowRoot.host : null;
}

/**
 * Count shadow roots in a tree
 *
 * @param root - Root to search from
 * @param includeUserAgent - Include user-agent shadow roots
 * @returns Total count of shadow roots
 */
export function countShadowRoots(
  root: Element | Document = document,
  includeUserAgent: boolean = false
): number {
  let count = 0;

  traverseShadowRoots(
    root,
    { includeUserAgent, maxDepth: 10 },
    () => {
      count++;
    }
  );

  return count;
}

/**
 * Merge shadow DOM with light DOM for complete tree
 *
 * Creates a unified view of the DOM including shadow roots.
 *
 * @param root - Root element
 * @returns Array of all nodes including shadow DOM
 */
export function mergeWithShadowDOM(root: Element): Node[] {
  const allNodes: Node[] = [];

  function traverse(node: Node) {
    allNodes.push(node);

    // If node is an element with shadow root, traverse it
    if (node instanceof Element && node.shadowRoot) {
      const shadowNodes = getShadowDOMNodes(node.shadowRoot);
      for (const shadowNode of shadowNodes) {
        traverse(shadowNode);
      }
    }

    // Traverse children
    for (const child of Array.from(node.childNodes)) {
      traverse(child);
    }
  }

  traverse(root);
  return allNodes;
}
