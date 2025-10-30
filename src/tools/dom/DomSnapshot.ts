import type {
  DomSnapshot as IDomSnapshot,
  VirtualNode,
  SerializedDom,
  SerializedNode,
  SnapshotStats,
  PageContext
} from './types';
import { getTextContent } from './utils';
import { SerializationPipeline } from './serializers/SerializationPipeline';
import { IIdRemapper } from './types';

export class DomSnapshot implements IDomSnapshot {
  readonly virtualDom: VirtualNode;
  readonly timestamp: Date;
  readonly pageContext: PageContext;
  readonly stats: SnapshotStats;

  private _serialized?: SerializedDom;
  private _backendNodeMap?: Map<number, VirtualNode>;
  private _idRemapper?: IIdRemapper;

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
   * Get VirtualNode by backendNodeId (stable ID used in serialization)
   */
  getNodeByBackendId(backendNodeId: number): VirtualNode | null {
    return this.buildBackendNodeMap().get(backendNodeId) ?? null;
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

    // T012: Use SerializationPipeline for compaction
    const pipeline = new SerializationPipeline();
    const result = pipeline.execute(this.virtualDom);

    // Store IdRemapper for later use
    this._idRemapper = result.idRemapper;

    // T031: Build flattened tree structure from pipeline result with v3 schema
    const body = this.flatternNode(result.tree);

    // T031: Build v3 SerializedDom with normalized field names
    this._serialized = {
      version: 3, // T030: Schema version
      page: {
        context: {
          url: this.pageContext.url,
          title: this.pageContext.title
        },
        body,
        // T031: Include compaction metrics (optional, for debugging)
        ...(result.metrics && {
          metrics: {
            total_nodes: result.metrics.totalNodes,
            serialized_nodes: result.metrics.serializedNodes,
            token_reduction_rate: result.metrics.tokenReductionRate,
            compaction_score: result.metrics.compactionScore
          }
        })
        // Note: Collection-level states from MetadataBucketer would go here
        // This is deferred to future optimization as it requires refactoring
        // the serialization to separate node data from state data
      }
    };

    this.stats.serializationDuration = Date.now() - start;

    // test>>
    console.log("[DomSnapshot Test] SerializedDom:", JSON.stringify(this._serialized, null, 2));
    // <<test

    return this._serialized;
  }

  /**
   * T031: Flatten VirtualNode tree to v3 SerializedNode with normalized field names
   *
   * Normalized field mappings:
   * - aria-label → aria_label
   * - children → kids
   * - placeholder → hint
   * - inputType → input_type
   * - boundingBox → bbox (as [x, y, w, h] array)
   * - node IDs → sequential IDs via IdRemapper
   */
  private flatternNode(node: VirtualNode): SerializedNode {
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
        .map(child => this.flatternNode(child))
        .filter((child): child is SerializedNode => child !== null);

      // If only one child, return it directly (hoist)
      if (flattenedChildren.length === 1) {
        return flattenedChildren[0];
      }

      // If multiple children, return minimal structural node to maintain grouping
      if (flattenedChildren.length > 1) {
        const sequentialId = this._idRemapper?.toSequentialId(node.backendNodeId) ?? node.backendNodeId;
        return {
          node_id: sequentialId,
          tag: node.localName || node.nodeName.toLowerCase(),
          kids: flattenedChildren
        };
      }
    }

    // Case 4: Leaf structural node with no children - discard
    return null as any;
  }

  /**
   * T031: Build SerializedNode with v3 schema (normalized field names)
   */
  private buildSerializedNode(node: VirtualNode, includeMetadata: boolean): SerializedNode {
    // Get sequential ID from IdRemapper
    const sequentialId = this._idRemapper?.toSequentialId(node.backendNodeId) ?? node.backendNodeId;

    // Get attributes for metadata extraction
    const attrMap = new Map<string, string>();
    if (node.attributes) {
      for (let i = 0; i < node.attributes.length; i += 2) {
        attrMap.set(node.attributes[i], node.attributes[i + 1]);
      }
    }

    // Build base node with v3 field names
    const serializedNode: SerializedNode = {
      node_id: sequentialId,
      tag: node.localName || node.nodeName.toLowerCase()
    };

    // Add role if available
    if (node.accessibility?.role) {
      serializedNode.role = node.accessibility.role;
    }

    // Add full metadata for semantic nodes
    if (includeMetadata) {
      // aria_label (normalized from aria-label)
      if (node.accessibility?.name) {
        serializedNode.aria_label = node.accessibility.name;
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

      // input_type (normalized from inputType)
      if (attrMap.has('type')) {
        serializedNode.input_type = attrMap.get('type');
      }

      // hint (normalized from placeholder)
      if (attrMap.has('placeholder')) {
        serializedNode.hint = attrMap.get('placeholder');
      }

      // bbox (compact array format [x, y, w, h])
      if (node.boundingBox) {
        serializedNode.bbox = [
          Math.round(node.boundingBox.x),
          Math.round(node.boundingBox.y),
          Math.round(node.boundingBox.width),
          Math.round(node.boundingBox.height)
        ];
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

    // Recursively flatten children (with v3 field name: kids)
    if (node.children && node.children.length > 0) {
      const flattenedChildren = node.children
        .map(child => this.flatternNode(child))
        .filter((child): child is SerializedNode => child !== null);

      if (flattenedChildren.length > 0) {
        serializedNode.kids = flattenedChildren; // v3: kids instead of children
      }
    }

    return serializedNode;
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
}
