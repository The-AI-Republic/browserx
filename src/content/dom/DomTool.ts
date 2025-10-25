/**
 * DomTool - Main Entry Point
 *
 * Integrates all DOM tool components:
 * - TreeBuilder: Virtual DOM tree construction
 * - DomSnapshot: Immutable snapshot management
 * - Serializer: LLM-friendly output
 * - Action Executors: Click, Type, Keypress
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type {
  DomTool,
  DomSnapshot,
  DomToolConfig,
  SerializedDom,
  SerializationOptions,
  ClickOptions,
  TypeOptions,
  KeyPressOptions,
  ActionResult,
  PageContext,
  SnapshotStats,
} from "../../types/domTool";
import { DEFAULT_CONFIG } from "../../types/domTool";
import { TreeBuilder } from "./builders/TreeBuilder";
import { DomSnapshotImpl, capturePageContext } from "./DomSnapshot";
import { executeClick } from "./actions/ClickExecutor";
import { executeType } from "./actions/InputExecutor";
import { executeKeyPress } from "./actions/KeyPressExecutor";

/**
 * DomTool implementation
 *
 * Singleton per page (instantiated in content script).
 * Manages DOM snapshots and executes actions.
 */
export class DomToolImpl implements DomTool {
  private _domSnapshot: DomSnapshot | null = null;
  readonly config: Required<DomToolConfig>;
  private mutationObserver?: MutationObserver;
  private treeBuilder: TreeBuilder;
  private mutationThrottleTimeout?: ReturnType<typeof setTimeout>;
  private isRebuilding = false;

  constructor(config: DomToolConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.treeBuilder = new TreeBuilder(this.config);

    // Setup auto-invalidation if enabled
    if (this.config.autoInvalidate) {
      this.setupMutationObserver();
    }
  }

  /**
   * Get current DOM snapshot (null if not yet built)
   */
  get domSnapshot(): DomSnapshot | null {
    return this._domSnapshot;
  }

  /**
   * Build or rebuild DOM snapshot
   *
   * @param trigger - What triggered the rebuild
   * @returns Promise resolving to new snapshot
   */
  async buildSnapshot(
    trigger: "action" | "navigation" | "manual" | "mutation" = "manual"
  ): Promise<DomSnapshot> {
    // Prevent concurrent rebuilds
    if (this.isRebuilding) {
      console.warn("[DomTool] Snapshot rebuild already in progress, waiting...");
      // Wait for current rebuild to complete
      while (this.isRebuilding) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return this._domSnapshot!;
    }

    this.isRebuilding = true;

    try {
      const startTime = Date.now();

      // Build virtual tree
      const virtualDom = await this.treeBuilder.buildTree(
        document.body,
        this._domSnapshot || undefined
      );

      // Capture page context
      const context = capturePageContext();

      // Get statistics
      const builderStats = this.treeBuilder.getStats();
      const stats: SnapshotStats = {
        ...builderStats,
        captureTimeMs: Date.now() - startTime,
      };

      // Create new snapshot
      const snapshot = new DomSnapshotImpl(
        virtualDom,
        this.treeBuilder.getMappings(),
        context,
        stats
      );

      // Replace old snapshot
      this._domSnapshot = snapshot;

      console.log(
        `[DomTool] Snapshot built (trigger: ${trigger}, time: ${stats.captureTimeMs}ms, nodes: ${stats.totalNodes})`
      );

      return snapshot;
    } finally {
      this.isRebuilding = false;
    }
  }

  /**
   * Get current snapshot or build if not exists
   *
   * @returns Promise resolving to snapshot
   */
  async getSnapshot(): Promise<DomSnapshot> {
    // Build if no snapshot exists
    if (!this._domSnapshot) {
      return this.buildSnapshot("manual");
    }

    // Rebuild if snapshot is stale/invalid
    if (!this._domSnapshot.isValid()) {
      console.log("[DomTool] Snapshot is stale, rebuilding...");
      return this.buildSnapshot("manual");
    }

    return this._domSnapshot;
  }

  /**
   * Get serialized DOM for LLM consumption
   *
   * @param options - Serialization options
   * @returns Promise resolving to serialized DOM
   */
  async get_serialized_dom(options?: SerializationOptions): Promise<SerializedDom> {
    const snapshot = await this.getSnapshot();
    return snapshot.serialize(options);
  }

  /**
   * Click on an element
   *
   * @param nodeId - Element node ID
   * @param options - Click options
   * @returns Promise resolving to action result
   */
  async click(nodeId: string, options?: ClickOptions): Promise<ActionResult> {
    const snapshot = await this.getSnapshot();
    const element = snapshot.getRealElement(nodeId);

    if (!element) {
      throw new Error(`Element not found: ${nodeId}`);
    }

    if (!element.isConnected) {
      throw new Error(`Element is not connected to DOM: ${nodeId}`);
    }

    // Execute click
    const result = await executeClick(element, nodeId, options);

    // Trigger async rebuild (don't wait)
    this.buildSnapshot("action").catch((error) => {
      console.error("[DomTool] Failed to rebuild snapshot after click:", error);
    });

    return result;
  }

  /**
   * Type text into an element
   *
   * @param nodeId - Element node ID
   * @param text - Text to type
   * @param options - Type options
   * @returns Promise resolving to action result
   */
  async type(
    nodeId: string,
    text: string,
    options?: TypeOptions
  ): Promise<ActionResult> {
    const snapshot = await this.getSnapshot();
    const element = snapshot.getRealElement(nodeId);

    if (!element) {
      throw new Error(`Element not found: ${nodeId}`);
    }

    if (!element.isConnected) {
      throw new Error(`Element is not connected to DOM: ${nodeId}`);
    }

    // Execute type
    const result = await executeType(element, nodeId, text, options);

    // Trigger async rebuild (don't wait)
    this.buildSnapshot("action").catch((error) => {
      console.error("[DomTool] Failed to rebuild snapshot after type:", error);
    });

    return result;
  }

  /**
   * Simulate keyboard key press
   *
   * @param key - Key to press
   * @param options - Keypress options
   * @returns Promise resolving to action result
   */
  async keypress(key: string, options?: KeyPressOptions): Promise<ActionResult> {
    let element: Element | null = null;
    let nodeId = "document";

    // Get target element if specified
    if (options?.targetNodeId) {
      const snapshot = await this.getSnapshot();
      element = snapshot.getRealElement(options.targetNodeId);

      if (!element) {
        throw new Error(`Element not found: ${options.targetNodeId}`);
      }

      if (!element.isConnected) {
        throw new Error(`Element is not connected to DOM: ${options.targetNodeId}`);
      }

      nodeId = options.targetNodeId;
    }

    // Execute keypress
    const result = await executeKeyPress(key, nodeId, element, options);

    // Trigger async rebuild (don't wait)
    this.buildSnapshot("action").catch((error) => {
      console.error("[DomTool] Failed to rebuild snapshot after keypress:", error);
    });

    return result;
  }

  /**
   * Invalidate current snapshot (force refresh)
   * @deprecated Use buildSnapshot() instead
   */
  invalidateSnapshot(): void {
    console.warn("[DomTool] invalidateSnapshot() is deprecated, use buildSnapshot() instead");
    this._domSnapshot = null;
  }

  /**
   * Clean up resources (observers, references)
   */
  destroy(): void {
    // Disconnect mutation observer
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = undefined;
    }

    // Clear throttle timeout
    if (this.mutationThrottleTimeout) {
      clearTimeout(this.mutationThrottleTimeout);
      this.mutationThrottleTimeout = undefined;
    }

    // Clear snapshot
    this._domSnapshot = null;

    console.log("[DomTool] Destroyed");
  }

  /**
   * Setup mutation observer for auto-invalidation
   * @private
   */
  private setupMutationObserver(): void {
    this.mutationObserver = new MutationObserver((mutations) => {
      // Check if mutations are significant
      const significantMutations = mutations.filter((mutation) => {
        // Ignore style/class changes (usually not structural)
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "style" || mutation.attributeName === "class")
        ) {
          return false;
        }

        // Ignore text changes in non-interactive elements
        if (mutation.type === "characterData") {
          return false;
        }

        return true;
      });

      if (significantMutations.length === 0) {
        return;
      }

      // Throttle rebuild
      if (this.mutationThrottleTimeout) {
        clearTimeout(this.mutationThrottleTimeout);
      }

      this.mutationThrottleTimeout = setTimeout(() => {
        console.log(
          `[DomTool] ${significantMutations.length} significant mutations detected, rebuilding snapshot...`
        );
        // Trigger async rebuild (don't wait)
        this.buildSnapshot("mutation").catch((error) => {
          console.error("[DomTool] Failed to rebuild snapshot after mutations:", error);
        });
      }, this.config.mutationThrottle);
    });

    // Observe entire document
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
      characterData: false,
      characterDataOldValue: false,
    });

    console.log(
      `[DomTool] MutationObserver started (throttle: ${this.config.mutationThrottle}ms)`
    );
  }
}
