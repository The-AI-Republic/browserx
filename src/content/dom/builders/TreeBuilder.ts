/**
 * Tree Builder
 *
 * Builds a VirtualNode tree from the real DOM with accurate element mapping.
 * Handles visibility filtering, ID preservation, and iframe/shadow DOM traversal.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type { VirtualNode, DomToolConfig, DomSnapshot } from "../../../types/domTool";
import { DEFAULT_CONFIG } from "../../../types/domTool";
import { isVisible } from "./VisibilityFilter";
import { isInteractive } from "./InteractivityDetector";
import { createVirtualNode } from "../VirtualNode";

/**
 * Tree Builder class
 *
 * Responsible for:
 * - Building VirtualNode tree from real DOM
 * - Generating unique node IDs
 * - Preserving IDs across snapshot rebuilds
 * - Handling iframe and shadow DOM traversal
 */
export class TreeBuilder {
  private config: Required<DomToolConfig>;
  private usedIds: Set<string> = new Set();
  private elementMap: Map<string, Element> = new Map();
  private stats = {
    totalNodes: 0,
    visibleNodes: 0,
    interactiveNodes: 0,
    iframeCount: 0,
    shadowDomCount: 0,
  };

  constructor(config: DomToolConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate unique node_id
   *
   * Format: 8 random alphanumeric characters [A-Za-z0-9]{8}
   * Example: "aB3xZ9k1", "P7mQ2nR4"
   *
   * Uses cryptographically secure random to avoid collisions.
   * Collision probability: 1 in 62^8 (218 trillion) - effectively impossible.
   *
   * @returns Unique node_id string
   */
  generateNodeId(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let id: string;

    // Retry until we get a unique ID (collision extremely unlikely with 62^8 possibilities)
    do {
      const array = new Uint8Array(8);
      window.crypto.getRandomValues(array);
      id = Array.from(array, (byte) => chars[byte % chars.length]).join("");
    } while (this.usedIds.has(id));

    this.usedIds.add(id);
    return id;
  }

  /**
   * Get element mappings for DomSnapshot
   */
  getMappings(): Map<string, Element> {
    return this.elementMap;
  }

  /**
   * Get snapshot statistics
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Build VirtualNode tree from real DOM
   *
   * @param rootElement - Root element to start from (typically document.body)
   * @param oldSnapshot - Previous snapshot for ID preservation
   * @returns Root VirtualNode
   */
  async buildTree(
    rootElement: Element,
    oldSnapshot?: DomSnapshot
  ): Promise<VirtualNode> {
    // Reset state for new tree
    this.usedIds.clear();
    this.elementMap.clear();
    this.stats = {
      totalNodes: 0,
      visibleNodes: 0,
      interactiveNodes: 0,
      iframeCount: 0,
      shadowDomCount: 0,
    };

    // Build tree recursively
    const root = await this.buildNode(rootElement, 0, oldSnapshot);

    return root;
  }

  /**
   * Build a single VirtualNode from an Element
   *
   * @param element - DOM element to convert
   * @param depth - Current tree depth
   * @param oldSnapshot - Previous snapshot for ID preservation
   * @returns VirtualNode
   */
  private async buildNode(
    element: Element,
    depth: number,
    oldSnapshot?: DomSnapshot
  ): Promise<VirtualNode> {
    // Check depth limit
    if (depth > this.config.maxTreeDepth) {
      throw new Error(`Max tree depth ${this.config.maxTreeDepth} exceeded`);
    }

    // Try to preserve node_id from old snapshot
    const nodeId = this.matchElement(element, oldSnapshot) || this.generateNodeId();

    // Check visibility
    const visible = isVisible(element);

    // Create VirtualNode
    const node = createVirtualNode(element, nodeId, visible, {
      includeMetadata: true,
      includeValues: false,
    });

    // Store mapping
    this.elementMap.set(nodeId, element);

    // Update stats
    this.stats.totalNodes++;
    if (visible) this.stats.visibleNodes++;
    if (isInteractive(element)) this.stats.interactiveNodes++;

    // Build children (if visible or should traverse hidden)
    if (visible || this.shouldTraverseHidden(element)) {
      node.children = await this.buildChildren(element, depth, oldSnapshot);
    }

    // Handle iframe (if configured)
    if (this.config.captureIframes && element.tagName === "IFRAME") {
      try {
        node.iframe = await this.buildIframe(element as HTMLIFrameElement, depth, oldSnapshot);
        this.stats.iframeCount++;
      } catch (error) {
        // Cross-origin or inaccessible iframe, skip
      }
    }

    // Handle shadow DOM (if configured)
    if (this.config.captureShadowDom && element.shadowRoot) {
      try {
        node.shadowDom = await this.buildShadowDom(element.shadowRoot, depth, oldSnapshot);
        this.stats.shadowDomCount++;
      } catch (error) {
        // Closed shadow root or error, skip
      }
    }

    return node;
  }

  /**
   * Build children nodes
   */
  private async buildChildren(
    element: Element,
    depth: number,
    oldSnapshot?: DomSnapshot
  ): Promise<VirtualNode[] | undefined> {
    const children: VirtualNode[] = [];

    for (const child of Array.from(element.children)) {
      try {
        const childNode = await this.buildNode(child, depth + 1, oldSnapshot);
        children.push(childNode);
      } catch (error) {
        // Skip problematic children
        continue;
      }
    }

    return children.length > 0 ? children : undefined;
  }

  /**
   * Build iframe content
   */
  private async buildIframe(
    iframe: HTMLIFrameElement,
    depth: number,
    oldSnapshot?: DomSnapshot
  ): Promise<VirtualNode | undefined> {
    // Check depth limit
    if (depth >= this.config.iframeDepth) {
      return undefined;
    }

    try {
      // Try to access iframe content (same-origin only)
      const iframeDoc = iframe.contentDocument;
      if (!iframeDoc || !iframeDoc.body) {
        return undefined;
      }

      // Build tree from iframe body
      return await this.buildNode(iframeDoc.body, depth + 1, oldSnapshot);
    } catch (error) {
      // Cross-origin or inaccessible
      return undefined;
    }
  }

  /**
   * Build shadow DOM content
   */
  private async buildShadowDom(
    shadowRoot: ShadowRoot,
    depth: number,
    oldSnapshot?: DomSnapshot
  ): Promise<VirtualNode | undefined> {
    // Check depth limit
    if (depth >= this.config.shadowDomDepth) {
      return undefined;
    }

    try {
      // Create a virtual container for shadow DOM content
      const nodeId = this.generateNodeId();
      const children: VirtualNode[] = [];

      for (const child of Array.from(shadowRoot.children)) {
        try {
          const childNode = await this.buildNode(child, depth + 1, oldSnapshot);
          children.push(childNode);
        } catch (error) {
          continue;
        }
      }

      // Return a virtual container node
      return {
        node_id: nodeId,
        tag: "shadow-root",
        visible: true,
        children: children.length > 0 ? children : undefined,
      };
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Match element to old snapshot for ID preservation
   *
   * Strategy (priority order):
   * 1. Match by HTML id
   * 2. Match by test ID (data-testid, data-test, data-cy)
   * 3. Match by tree path
   * 4. Match by content similarity (fuzzy)
   *
   * @param element - Element to match
   * @param oldSnapshot - Previous snapshot
   * @returns Preserved node_id or null if no match
   */
  private matchElement(element: Element, oldSnapshot?: DomSnapshot): string | null {
    if (!oldSnapshot) return null;

    // Strategy 1: Match by HTML id
    const htmlId = element.getAttribute("id");
    if (htmlId) {
      const oldNode = this.findNodeByHtmlId(oldSnapshot.virtualDom, htmlId);
      if (oldNode && this.isSimilarElement(oldNode, element)) {
        return oldNode.node_id;
      }
    }

    // Strategy 2: Match by test ID
    const testId =
      element.getAttribute("data-testid") ||
      element.getAttribute("data-test") ||
      element.getAttribute("data-cy");
    if (testId) {
      const oldNode = this.findNodeByTestId(oldSnapshot.virtualDom, testId);
      if (oldNode && this.isSimilarElement(oldNode, element)) {
        return oldNode.node_id;
      }
    }

    // Strategy 3: Match by tree path
    const treePath = this.getTreePath(element);
    if (treePath) {
      const oldNode = this.findNodeByPath(oldSnapshot.virtualDom, treePath);
      if (oldNode && this.isSimilarElement(oldNode, element)) {
        return oldNode.node_id;
      }
    }

    // Strategy 4: Match by content similarity
    const fingerprint = this.getElementFingerprint(element);
    const oldNode = this.findNodeBySimilarity(oldSnapshot.virtualDom, fingerprint);
    if (oldNode && this.isSimilarElement(oldNode, element)) {
      return oldNode.node_id;
    }

    return null;
  }

  /**
   * Find node by HTML id
   */
  private findNodeByHtmlId(node: VirtualNode, htmlId: string): VirtualNode | null {
    if (node.metadata?.htmlId === htmlId) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeByHtmlId(child, htmlId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Find node by test ID
   */
  private findNodeByTestId(node: VirtualNode, testId: string): VirtualNode | null {
    if (node.metadata?.testId === testId) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeByTestId(child, testId);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Find node by tree path
   */
  private findNodeByPath(node: VirtualNode, path: string): VirtualNode | null {
    if (node.metadata?.treePath === path) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeByPath(child, path);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Find node by content similarity
   */
  private findNodeBySimilarity(node: VirtualNode, fingerprint: string): VirtualNode | null {
    // Calculate similarity score
    const nodeFingerprint = this.getNodeFingerprint(node);
    if (this.fingerprintsSimilar(fingerprint, nodeFingerprint)) {
      return node;
    }

    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeBySimilarity(child, fingerprint);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Get element fingerprint for matching
   *
   * Fingerprint: tag + role + aria-label + text + href + id
   */
  private getElementFingerprint(element: Element): string {
    const parts: string[] = [];

    parts.push(element.tagName.toLowerCase());

    const role = element.getAttribute("role");
    if (role) parts.push(`role:${role}`);

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) parts.push(`label:${ariaLabel.substring(0, 50)}`);

    // Text content (first 50 chars)
    const text = element.textContent?.trim().substring(0, 50);
    if (text) parts.push(`text:${text}`);

    // Href for links
    if (element.tagName === "A") {
      const href = (element as HTMLAnchorElement).href;
      if (href) parts.push(`href:${href}`);
    }

    // HTML id
    const htmlId = element.getAttribute("id");
    if (htmlId) parts.push(`id:${htmlId}`);

    return parts.join("|");
  }

  /**
   * Get VirtualNode fingerprint
   */
  private getNodeFingerprint(node: VirtualNode): string {
    const parts: string[] = [];

    parts.push(node.tag);

    if (node.role) parts.push(`role:${node.role}`);
    if (node["aria-label"]) parts.push(`label:${node["aria-label"].substring(0, 50)}`);
    if (node.text) parts.push(`text:${node.text.substring(0, 50)}`);
    if (node.metadata?.href) parts.push(`href:${node.metadata.href}`);
    if (node.metadata?.htmlId) parts.push(`id:${node.metadata.htmlId}`);

    return parts.join("|");
  }

  /**
   * Check if two fingerprints are similar
   */
  private fingerprintsSimilar(fp1: string, fp2: string): boolean {
    // Simple exact match for now (can be enhanced with fuzzy matching)
    return fp1 === fp2;
  }

  /**
   * Check if VirtualNode and Element are similar
   */
  private isSimilarElement(node: VirtualNode, element: Element): boolean {
    // Tag must match
    if (node.tag !== element.tagName.toLowerCase()) {
      return false;
    }

    // Role should match if present
    const role = element.getAttribute("role");
    if (node.role && role && node.role !== role) {
      return false;
    }

    // Elements are similar
    return true;
  }

  /**
   * Get tree path for an element
   */
  private getTreePath(element: Element): string | null {
    const path: string[] = [];
    let current: Element | null = element;

    while (current && current !== document.body) {
      const parent = current.parentElement;
      if (!parent) break;

      // Get index among siblings of same tag
      const siblings = Array.from(parent.children).filter(
        (child) => child.tagName === current!.tagName
      );
      const index = siblings.indexOf(current);

      path.unshift(`${current.tagName.toLowerCase()}[${index}]`);
      current = parent;
    }

    return path.length > 0 ? path.join("/") : null;
  }

  /**
   * Determine if we should traverse hidden elements
   *
   * Some hidden containers (like <dialog>) may contain visible children
   */
  private shouldTraverseHidden(element: Element): boolean {
    const tag = element.tagName.toLowerCase();

    // Traverse dialogs even if hidden (may become visible)
    if (tag === "dialog") return true;

    // Traverse details/summary (collapsible content)
    if (tag === "details") return true;

    return false;
  }
}
