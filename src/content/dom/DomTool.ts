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
import { MutationTracker } from "./builders/MutationTracker";
import { DomSnapshotImpl, capturePageContext } from "./DomSnapshot";
import { executeClick } from "./actions/ClickExecutor";
import { executeType } from "./actions/InputExecutor";
import { executeKeyPress } from "./actions/KeyPressExecutor";
import type { IDomToolEventEmitter, AgentActionType } from "./ui_effect/contracts/domtool-events";
import { dispatchVisualEffectEvent } from "./ui_effect/contracts/domtool-events";

/**
 * DomTool implementation
 *
 * Singleton per page (instantiated in content script).
 * Manages DOM snapshots and executes actions.
 * Implements IDomToolEventEmitter for visual effects integration.
 * Supports incremental updates via MutationTracker.
 */
export class DomToolImpl implements DomTool, IDomToolEventEmitter {
  private _domSnapshot: DomSnapshot | null = null;
  readonly config: Required<DomToolConfig>;
  private mutationObserver?: MutationObserver;
  private treeBuilder: TreeBuilder;
  private mutationTracker: MutationTracker;
  private mutationThrottleTimeout?: ReturnType<typeof setTimeout>;
  private isRebuilding = false;
  private useIncrementalUpdates = true; // Enable incremental updates by default

  constructor(config: DomToolConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.treeBuilder = new TreeBuilder(this.config);
    this.mutationTracker = new MutationTracker();

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
      console.warn("[DomTool] ⚠️ Snapshot rebuild already in progress, waiting...");
      // Wait for current rebuild to complete
      while (this.isRebuilding) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      return this._domSnapshot!;
    }

    this.isRebuilding = true;

    try {
      const startTime = Date.now();

      // Collect mutations for incremental update (if enabled and mutations exist)
      let dirtyElements: Set<Element> | undefined;
      if (this.useIncrementalUpdates && this.mutationTracker.hasMutations()) {
        const mutationInfo = this.mutationTracker.collectMutations();

        // Build set of all affected elements
        dirtyElements = new Set([
          ...mutationInfo.addedElements,
          ...mutationInfo.modifiedElements,
          ...mutationInfo.dirtyAncestors,
        ]);

        // console.log(
        //   `[DomTool] Incremental update: ${dirtyElements.size} dirty elements (${mutationInfo.mutationCount} mutations)`
        // );
      } else {
      }

      // Build virtual tree (with incremental support)
      const virtualDom = await this.treeBuilder.buildTree(
        document.body,
        this._domSnapshot || undefined,
        dirtyElements
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

      // Start tracking mutations for next rebuild (if enabled)
      if (this.useIncrementalUpdates && !this.mutationTracker.hasMutations()) {
        this.mutationTracker.startTracking(document.body);
      }


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
    // Emit serialize event for visual effects (fire-and-forget)
    this.emitAgentSerialize();

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

    // Emit action event for visual effects BEFORE execution (fire-and-forget)
    this.emitAgentAction("click", element, element.getBoundingClientRect());

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
      const error = `Element not found: ${nodeId}`;
      console.error(`[DomTool] ❌ ${error}`);
      throw new Error(error);
    }

    if (!element.isConnected) {
      const error = `Element is not connected to DOM: ${nodeId}`;
      console.error(`[DomTool] ❌ ${error}`);
      console.error(`[DomTool] Element details:`, element.tagName, element.className, element.id);
      throw new Error(error);
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

    // Emit action event for visual effects BEFORE execution (fire-and-forget)
    this.emitAgentAction("keypress", element, element ? element.getBoundingClientRect() : null);

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
    // Emit stop event for visual effects
    this.emitAgentStop();

    // Disconnect mutation observer
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = undefined;
    }

    // Stop mutation tracker
    this.mutationTracker.stopTracking();

    // Clear throttle timeout
    if (this.mutationThrottleTimeout) {
      clearTimeout(this.mutationThrottleTimeout);
      this.mutationThrottleTimeout = undefined;
    }

    // Clear snapshot
    this._domSnapshot = null;

  }

  /**
   * IDomToolEventEmitter Implementation
   * Fire-and-forget visual effect events (no blocking, no await)
   */

  emitAgentStart(): void {
    try {
      dispatchVisualEffectEvent({
        type: "agent-start",
        timestamp: Date.now(),
      });
    } catch (error) {
      // Silently fail - visual effects never block DomTool
      console.debug("[DomTool] Visual effect event emission failed:", error);
    }
  }

  emitAgentStop(): void {
    try {
      dispatchVisualEffectEvent({
        type: "agent-stop",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.debug("[DomTool] Visual effect event emission failed:", error);
    }
  }

  emitAgentAction(
    action: AgentActionType,
    element: Element | null,
    boundingBox: DOMRect | null
  ): void {
    try {
      dispatchVisualEffectEvent({
        type: "agent-action",
        action,
        element,
        boundingBox,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.debug("[DomTool] Visual effect event emission failed:", error);
    }
  }

  emitAgentSerialize(): void {
    try {
      dispatchVisualEffectEvent({
        type: "agent-serialize",
        timestamp: Date.now(),
      });
    } catch (error) {
      console.debug("[DomTool] Visual effect event emission failed:", error);
    }
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
        // console.log(
        //   `[DomTool] ${significantMutations.length} significant mutations detected, rebuilding snapshot...`
        // );
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

  }
}
