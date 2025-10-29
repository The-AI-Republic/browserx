import type {
  DomSnapshot as IDomSnapshot,
  VirtualNode,
  SerializedDom,
  SerializedNode,
  SnapshotStats,
  PageContext
} from './types';
import { getTextContent } from './utils';

export class DomSnapshot implements IDomSnapshot {
  readonly virtualDom: VirtualNode;
  readonly timestamp: Date;
  readonly pageContext: PageContext;
  readonly stats: SnapshotStats;

  private _serialized?: SerializedDom;
  private _nodeMap?: Map<number, VirtualNode>;
  private _backendNodeMap?: Map<number, VirtualNode>;

  constructor(
    virtualDom: VirtualNode,
    pageContext: PageContext,
    stats: SnapshotStats
  ) {
    this.virtualDom = virtualDom;
    this.pageContext = pageContext;
    this.stats = stats;
    this.timestamp = new Date();
  }

  /**
   * Build a flat map of nodeId -> VirtualNode for quick lookups
   */
  private buildNodeMap(): Map<number, VirtualNode> {
    if (this._nodeMap) return this._nodeMap;

    this._nodeMap = new Map();
    const traverse = (node: VirtualNode) => {
      this._nodeMap!.set(node.nodeId, node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    traverse(this.virtualDom);
    return this._nodeMap;
  }

  /**
   * Build a flat map of backendNodeId -> VirtualNode for quick lookups
   */
  private buildBackendNodeMap(): Map<number, VirtualNode> {
    if (this._backendNodeMap) return this._backendNodeMap;

    this._backendNodeMap = new Map();
    const traverse = (node: VirtualNode) => {
      this._backendNodeMap!.set(node.backendNodeId, node);
      if (node.children) {
        node.children.forEach(traverse);
      }
    };
    traverse(this.virtualDom);
    return this._backendNodeMap;
  }

  /**
   * Get VirtualNode by CDP nodeId
   */
  getNode(nodeId: number): VirtualNode | null {
    return this.buildNodeMap().get(nodeId) ?? null;
  }

  /**
   * Get VirtualNode by backendNodeId (stable ID used in serialization)
   */
  getNodeByBackendId(backendNodeId: number): VirtualNode | null {
    return this.buildBackendNodeMap().get(backendNodeId) ?? null;
  }

  /**
   * Get backendNodeId from nodeId (for CDP commands)
   */
  getBackendId(nodeId: number): number | null {
    const node = this.getNode(nodeId);
    return node?.backendNodeId ?? null;
  }

  isStale(maxAgeMs: number = 30000): boolean {
    return Date.now() - this.timestamp.getTime() > maxAgeMs;
  }

  getStats(): SnapshotStats {
    return { ...this.stats };
  }

  serialize(): SerializedDom {
    if (this._serialized) {
      return this._serialized;
    }

    const start = Date.now();

    // Build flattened tree structure (Pass 2: Remove structural junk)
    const body = this.flattenNode(this.virtualDom);

    this._serialized = {
      page: {
        context: {
          url: this.pageContext.url,
          title: this.pageContext.title
        },
        body,
        stats: this.stats
      }
    };

    this.stats.serializationDuration = Date.now() - start;

    return this._serialized;
  }

  /**
   * Flatten VirtualNode tree to only include semantic/interactive elements.
   * This implements Pass 2 of the two-pass system:
   * - Keep semantic nodes (Tier 1 & 2)
   * - Keep semantic containers (form, table, dialog, etc.)
   * - Hoist children of structural nodes (remove wrapper)
   * - Discard leaf structural nodes
   */
  private flattenNode(node: VirtualNode): SerializedNode {
    // Case 1: Keep semantic and non-semantic nodes (Tier 1 & 2)
    if (this.isSemanticNode(node)) {
      return this.buildSerializedNode(node, true);
    }

    // Case 2: Keep semantic containers (form, table, dialog, navigation, main)
    if (this.isSemanticContainer(node)) {
      return this.buildSerializedNode(node, false);
    }

    // Case 3: Structural node with children - hoist children to parent level
    if (node.children && node.children.length > 0) {
      const flattenedChildren = node.children
        .map(child => this.flattenNode(child))
        .filter((child): child is SerializedNode => child !== null);

      // If only one child, return it directly (hoist)
      if (flattenedChildren.length === 1) {
        return flattenedChildren[0];
      }

      // If multiple children, we need to wrap them somehow
      // Return a minimal structural node to maintain grouping
      if (flattenedChildren.length > 1) {
        return {
          node_id: node.backendNodeId,
          tag: node.localName || node.nodeName.toLowerCase(),
          children: flattenedChildren
        };
      }
    }

    // Case 4: Leaf structural node with no children - discard
    // Return a minimal placeholder that will be filtered out
    return null as any;
  }

  /**
   * Check if node is semantic or non-semantic (interactive)
   */
  private isSemanticNode(node: VirtualNode): boolean {
    return node.tier === 'semantic' || node.tier === 'non-semantic';
  }

  /**
   * Check if node is a semantic container that should be preserved for structure
   */
  private isSemanticContainer(node: VirtualNode): boolean {
    const role = node.accessibility?.role || '';
    const containerRoles = ['form', 'table', 'dialog', 'navigation', 'main', 'region', 'article', 'section'];
    return containerRoles.includes(role);
  }

  /**
   * Build a SerializedNode with metadata
   */
  private buildSerializedNode(node: VirtualNode, includeMetadata: boolean): SerializedNode {
    // Get attributes for additional metadata
    const attrMap = new Map<string, string>();
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i += 2) {
        attrMap.set(node.attributes[i], node.attributes[i + 1]);
      }
    }

    // Build base node
    // Use backendNodeId (stable across snapshots) instead of nodeId (transient)
    const serializedNode: SerializedNode = {
      node_id: node.backendNodeId,
      tag: node.localName || node.nodeName.toLowerCase()
    };

    // Add role if available
    if (node.accessibility?.role) {
      serializedNode.role = node.accessibility.role;
    }

    // Add full metadata for semantic nodes
    if (includeMetadata) {
      // Aria label / name
      if (node.accessibility?.name) {
        serializedNode['aria-label'] = node.accessibility.name;
      }

      // Text content
      const text = getTextContent(node);
      if (text) {
        serializedNode.text = text;
      }

      // Value (for inputs)
      if (typeof node.accessibility?.value === 'string') {
        serializedNode.value = node.accessibility.value;
      }

      // Link href
      if (attrMap.has('href')) {
        serializedNode.href = attrMap.get('href');
      }

      // Input type
      if (attrMap.has('type')) {
        serializedNode.inputType = attrMap.get('type');
      }

      // Placeholder
      if (attrMap.has('placeholder')) {
        serializedNode.placeholder = attrMap.get('placeholder');
      }

      // Build states object from accessibility info
      const states: Record<string, boolean | string> = {};
      if (node.accessibility?.disabled !== undefined) states.disabled = node.accessibility.disabled;
      if (node.accessibility?.checked !== undefined) states.checked = node.accessibility.checked;
      if (node.accessibility?.required !== undefined) states.required = node.accessibility.required;
      if (node.accessibility?.expanded !== undefined) states.expanded = node.accessibility.expanded;

      if (Object.keys(states).length > 0) {
        serializedNode.states = states;
      }
    }

    // Recursively flatten children
    if (node.children && node.children.length > 0) {
      const flattenedChildren = node.children
        .map(child => this.flattenNode(child))
        .filter((child): child is SerializedNode => child !== null);

      if (flattenedChildren.length > 0) {
        serializedNode.children = flattenedChildren;
      }
    }

    return serializedNode;
  }
}
