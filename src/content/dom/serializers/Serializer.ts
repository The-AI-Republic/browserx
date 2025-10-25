/**
 * Serializer
 *
 * Main serialization pipeline. Converts VirtualNode tree to
 * flattened, token-optimized SerializedDom for LLM consumption.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type {
  VirtualNode,
  SerializedDom,
  SerializedNode,
  SerializationOptions,
  PageContext,
} from "../../../types/domTool";
import { DEFAULT_SERIALIZATION_OPTIONS } from "../../../types/domTool";
import { flattenTree } from "./Flattener";
import { optimizeNode, omitDefaults } from "./TokenOptimizer";

/**
 * Serialize VirtualNode tree to SerializedDom
 *
 * Pipeline:
 * 1. Flatten tree (remove structural containers)
 * 2. Optimize tokens (truncate text, omit defaults)
 * 3. Extract iframes and shadow DOMs to separate arrays
 * 4. Return final SerializedDom structure
 *
 * @param virtualDom - Root VirtualNode
 * @param context - Page context
 * @param options - Serialization options
 * @returns SerializedDom (LLM-friendly JSON)
 */
export function serialize(
  virtualDom: VirtualNode,
  context: PageContext,
  options: SerializationOptions = {}
): SerializedDom {
  const opts = { ...DEFAULT_SERIALIZATION_OPTIONS, ...options };

  // Step 1: Flatten tree
  const flattened = flattenTree(virtualDom);

  // Step 2: Optimize tokens
  const optimized = optimizeNode(flattened, opts);

  // Step 3: Apply default omission if enabled
  const final = opts.omitDefaults ? omitDefaults(optimized) : optimized;

  // Step 4: Extract iframes and shadow DOMs
  const iframes = extractIframes(virtualDom);
  const shadowDoms = extractShadowDoms(virtualDom);

  // Step 5: Build SerializedDom
  const result: SerializedDom = {
    page: {
      context: {
        url: context.url,
        title: context.title,
      },
      body: final,
    },
  };

  // Add iframes if present
  if (iframes.length > 0) {
    result.page.iframes = iframes;
  }

  // Add shadow DOMs if present
  if (shadowDoms.length > 0) {
    result.page.shadowDoms = shadowDoms;
  }

  return result;
}

/**
 * Extract iframe contents from VirtualNode tree
 *
 * Iframes are moved to separate array at root level to avoid
 * nesting complexity in the main tree.
 *
 * @param node - VirtualNode to search
 * @returns Array of iframe contents
 */
function extractIframes(
  node: VirtualNode
): Array<{ url: string; title: string; body: SerializedNode }> {
  const iframes: Array<{ url: string; title: string; body: SerializedNode }> = [];

  // Check current node
  if (node.iframe) {
    const flattened = flattenTree(node.iframe);
    const optimized = optimizeNode(flattened);

    iframes.push({
      url: node.metadata?.href || "about:blank",
      title: node["aria-label"] || "Embedded Frame",
      body: optimized,
    });
  }

  // Recursively check children
  if (node.children) {
    for (const child of node.children) {
      const childIframes = extractIframes(child);
      iframes.push(...childIframes);
    }
  }

  return iframes;
}

/**
 * Extract shadow DOM contents from VirtualNode tree
 *
 * Shadow DOMs are moved to separate array at root level with
 * reference to their host element via hostId.
 *
 * @param node - VirtualNode to search
 * @returns Array of shadow DOM contents
 */
function extractShadowDoms(
  node: VirtualNode
): Array<{ hostId: string; body: SerializedNode }> {
  const shadowDoms: Array<{ hostId: string; body: SerializedNode }> = [];

  // Check current node
  if (node.shadowDom) {
    const flattened = flattenTree(node.shadowDom);
    const optimized = optimizeNode(flattened);

    shadowDoms.push({
      hostId: node.node_id, // Reference to host element
      body: optimized,
    });
  }

  // Recursively check children
  if (node.children) {
    for (const child of node.children) {
      const childShadowDoms = extractShadowDoms(child);
      shadowDoms.push(...childShadowDoms);
    }
  }

  return shadowDoms;
}

/**
 * Serialize a single node (helper for testing)
 *
 * @param node - VirtualNode to serialize
 * @param options - Serialization options
 * @returns SerializedNode
 */
export function serializeNode(
  node: VirtualNode,
  options: SerializationOptions = {}
): SerializedNode {
  const opts = { ...DEFAULT_SERIALIZATION_OPTIONS, ...options };

  // Flatten
  const flattened = flattenTree(node);

  // Optimize
  const optimized = optimizeNode(flattened, opts);

  // Omit defaults if enabled
  return opts.omitDefaults ? omitDefaults(optimized) : optimized;
}
