/**
 * DOM Tool v3.0.0 - Main Exports
 *
 * New DOM Tool with VirtualNode architecture, token optimization,
 * and enhanced element mapping.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

// Main DomTool class
export { DomToolImpl as DomTool } from "./DomTool";

// DomSnapshot
export { DomSnapshotImpl as DomSnapshot, capturePageContext } from "./DomSnapshot";

// VirtualNode factory
export { createVirtualNode } from "./VirtualNode";

// Builders
export { TreeBuilder } from "./builders/TreeBuilder";
export { isVisible, isInViewport } from "./builders/VisibilityFilter";
export { isInteractive, isTypeable, isClickable } from "./builders/InteractivityDetector";

// Serializers
export { flattenTree, shouldFlatten } from "./serializers/Flattener";
export { optimizeNode, omitDefaults, estimateTokenCount } from "./serializers/TokenOptimizer";
export { serialize, serializeNode } from "./serializers/Serializer";

// Action Executors
export { executeClick } from "./actions/ClickExecutor";
export { executeType } from "./actions/InputExecutor";
export { executeKeyPress } from "./actions/KeyPressExecutor";

// Re-export types from types/domTool.ts
export type {
  DomTool as IDomTool,
  DomSnapshot as IDomSnapshot,
  VirtualNode,
  VirtualNodeMetadata,
  PageContext,
  SnapshotStats,
  SerializedDom,
  SerializedNode,
  DomToolConfig,
  SerializationOptions,
  ClickOptions,
  TypeOptions,
  KeyPressOptions,
  ActionResult,
} from "../../types/domTool";

export { DEFAULT_CONFIG, DEFAULT_SERIALIZATION_OPTIONS } from "../../types/domTool";
