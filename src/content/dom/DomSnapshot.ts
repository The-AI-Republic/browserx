/**
 * DOM Snapshot
 *
 * Immutable snapshot of page DOM at a specific point in time.
 * Provides virtual DOM tree and bidirectional mapping to real DOM.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

/// <reference lib="es2021.weakref" />

import type {
  DomSnapshot,
  VirtualNode,
  PageContext,
  SnapshotStats,
  SerializedDom,
  SerializationOptions,
} from "../../types/domTool";
import { serialize } from "./serializers/Serializer";

/**
 * DomSnapshot implementation
 *
 * Lifecycle:
 * 1. Created by DomTool.buildSnapshot()
 * 2. Stored in DomTool.domSnapshot field
 * 3. Replaced when snapshot is rebuilt (after actions, mutations)
 * 4. Garbage collected when no longer referenced
 *
 * Memory management:
 * - Uses WeakRef for element mappings (allows GC of detached elements)
 * - WeakMap for reverse mapping (automatic cleanup)
 */
export class DomSnapshotImpl implements DomSnapshot {
  readonly virtualDom: VirtualNode;
  readonly timestamp: string;
  readonly context: PageContext;
  readonly stats: SnapshotStats;

  private forwardMap: Map<string, WeakRef<Element>>;
  private reverseMap: WeakMap<Element, string>;

  /**
   * Create a new DomSnapshot
   *
   * @param virtualDom - Root of virtual DOM tree
   * @param mappings - Map of node_id to Element
   * @param context - Page context (URL, title, viewport)
   * @param stats - Snapshot statistics
   */
  constructor(
    virtualDom: VirtualNode,
    mappings: Map<string, Element>,
    context: PageContext,
    stats: SnapshotStats
  ) {
    this.virtualDom = virtualDom;
    this.timestamp = new Date().toISOString();
    this.context = context;
    this.stats = stats;

    // Build bidirectional mappings
    this.forwardMap = new Map();
    this.reverseMap = new WeakMap();

    for (const [nodeId, element] of mappings) {
      this.forwardMap.set(nodeId, new WeakRef(element));
      this.reverseMap.set(element, nodeId);
    }
  }

  /**
   * Get real DOM element by node_id
   *
   * @param nodeId - Node ID to look up
   * @returns Element or null if not found/detached
   */
  getRealElement(nodeId: string): Element | null {

    const ref = this.forwardMap.get(nodeId);
    if (!ref) {
      console.error(`[DomSnapshot] ❌ node_id "${nodeId}" not found in forwardMap`);
      return null;
    }

    const element = ref.deref();
    if (!element) {
      // Element was garbage collected
      console.error(`[DomSnapshot] ❌ node_id "${nodeId}" element was garbage collected (detached from DOM)`);
      return null;
    }

    if (!element.isConnected) {
      console.warn(`[DomSnapshot] ⚠️ node_id "${nodeId}" element exists but is NOT connected to DOM`);
    } else {
    }

    return element;
  }

  /**
   * Get node_id for a real DOM element
   *
   * @param element - Element to look up
   * @returns node_id or null if not in snapshot
   */
  getNodeId(element: Element): string | null {
    return this.reverseMap.get(element) ?? null;
  }

  /**
   * Check if snapshot is still valid
   *
   * Performs sampling check on random subset of elements.
   * Verifies that elements are still connected to the DOM.
   *
   * @returns true if snapshot is still valid
   */
  isValid(): boolean {

    // Sampling check: verify 10 random elements still connected
    const sampleSize = Math.min(10, this.forwardMap.size);
    const entries = Array.from(this.forwardMap.entries());

    if (entries.length === 0) {
      // Empty snapshot is valid
      return true;
    }

    let validCount = 0;
    let gcCount = 0;
    let disconnectedCount = 0;

    for (let i = 0; i < sampleSize; i++) {
      const randomIndex = Math.floor(Math.random() * entries.length);
      const [nodeId, ref] = entries[randomIndex];
      const element = ref.deref();

      if (!element) {
        // Element was garbage collected (detached)
        console.warn(`[DomSnapshot] ⚠️ Sample element "${nodeId}" was garbage collected`);
        gcCount++;
        return false;
      }

      if (!element.isConnected) {
        // Element not in DOM anymore
        console.warn(`[DomSnapshot] ⚠️ Sample element "${nodeId}" is NOT connected:`, element.tagName);
        disconnectedCount++;
        return false;
      }

      validCount++;
    }

    // If all sampled elements are valid, snapshot is likely valid
    return validCount === sampleSize;
  }

  /**
   * Serialize virtual DOM to LLM-friendly JSON
   *
   * @param options - Serialization options
   * @returns SerializedDom (flattened, token-optimized)
   */
  serialize(options?: SerializationOptions): SerializedDom {
    // Use Serializer to convert VirtualNode tree to SerializedDom
    return serialize(this.virtualDom, this.context, options);
  }

  /**
   * Get snapshot age in milliseconds
   *
   * @returns Age in milliseconds
   */
  getAge(): number {
    return Date.now() - new Date(this.timestamp).getTime();
  }

  /**
   * Check if snapshot is stale (older than threshold)
   *
   * @param maxAgeMs - Maximum age in milliseconds (default: 30 seconds)
   * @returns true if snapshot is stale
   */
  isStale(maxAgeMs: number = 30000): boolean {
    return this.getAge() > maxAgeMs;
  }

  /**
   * Get statistics summary
   *
   * @returns Human-readable statistics
   */
  getSummary(): string {
    return `DomSnapshot {
  timestamp: ${this.timestamp}
  age: ${this.getAge()}ms
  url: ${this.context.url}
  totalNodes: ${this.stats.totalNodes}
  visibleNodes: ${this.stats.visibleNodes}
  interactiveNodes: ${this.stats.interactiveNodes}
  iframeCount: ${this.stats.iframeCount}
  shadowDomCount: ${this.stats.shadowDomCount}
  captureTime: ${this.stats.captureTimeMs}ms
}`;
  }
}

/**
 * Helper to capture current page context
 *
 * @returns PageContext object
 */
export function capturePageContext(): PageContext {
  return {
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
  };
}
