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
   * Get VirtualNode by CDP nodeId
   */
  getNode(nodeId: number): VirtualNode | null {
    return this.buildNodeMap().get(nodeId) ?? null;
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

    // Build hierarchical tree structure
    const body = this.buildSerializedTree(this.virtualDom);

    // test>>
    console.log('[DomSnapshot] Serialized Tree:');
    console.log(JSON.stringify(this._serialized, null, 2));
    // test<<

    this._serialized = {
      page: {
        context: {
          url: this.pageContext.url,
          title: this.pageContext.title
        },
        body
      }
    };

    this.stats.serializationDuration = Date.now() - start;

    return this._serialized;
  }

  private buildSerializedTree(node: VirtualNode): SerializedNode {
    // Get attributes for additional metadata
    const attrMap = new Map<string, string>();
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i += 2) {
        attrMap.set(node.attributes[i], node.attributes[i + 1]);
      }
    }

    // Build states object from accessibility info
    const states: Record<string, boolean | string> = {};
    if (node.accessibility?.disabled !== undefined) states.disabled = node.accessibility.disabled;
    if (node.accessibility?.checked !== undefined) states.checked = node.accessibility.checked;
    if (node.accessibility?.required !== undefined) states.required = node.accessibility.required;
    if (node.accessibility?.expanded !== undefined) states.expanded = node.accessibility.expanded;

    const serializedNode: SerializedNode = {
      node_id: node.nodeId,
      tag: node.localName || node.nodeName.toLowerCase(),
      role: node.accessibility?.role,
      "aria-label": node.accessibility?.name,
      text: getTextContent(node),
      value: typeof node.accessibility?.value === 'string' ? node.accessibility.value : undefined,
      href: attrMap.get('href'),
      inputType: attrMap.get('type'),
      placeholder: attrMap.get('placeholder'),
      states: Object.keys(states).length > 0 ? states : undefined
    };

    // Recursively build children
    if (node.children && node.children.length > 0) {
      serializedNode.children = node.children
        .map(child => this.buildSerializedTree(child))
        .filter(child => child !== null);
    }

    return serializedNode;
  }
}
