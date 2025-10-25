/**
 * Token Optimizer
 *
 * Optimizes SerializedNode for minimal token usage.
 * Omits default values, truncates text, compresses output.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type { SerializedNode, SerializationOptions } from "../../../types/domTool";
import { DEFAULT_SERIALIZATION_OPTIONS } from "../../../types/domTool";

/**
 * Optimize SerializedNode for token efficiency
 *
 * @param node - SerializedNode to optimize
 * @param options - Serialization options
 * @returns Optimized SerializedNode
 */
export function optimizeNode(
  node: SerializedNode,
  options: SerializationOptions = {}
): SerializedNode {
  const opts = { ...DEFAULT_SERIALIZATION_OPTIONS, ...options };

  // Start with required fields
  const optimized: SerializedNode = {
    node_id: node.node_id,
    tag: node.tag,
  };

  // Add optional fields (with optimization)
  if (node.role) {
    optimized.role = node.role;
  }

  if (node["aria-label"]) {
    optimized["aria-label"] = truncateText(node["aria-label"], opts.maxLabelLength);
  }

  if (node.text) {
    optimized.text = truncateText(node.text, opts.maxTextLength);
  }

  if (node.value && opts.includeValues) {
    optimized.value = node.value;
  }

  if (node.href) {
    optimized.href = node.href;
  }

  if (node.inputType) {
    optimized.inputType = node.inputType;
  }

  if (node.placeholder) {
    optimized.placeholder = truncateText(node.placeholder, opts.maxLabelLength);
  }

  if (node.states && Object.keys(node.states).length > 0) {
    optimized.states = node.states;
  }

  // Recursively optimize children
  if (node.children && node.children.length > 0) {
    optimized.children = node.children.map((child) => optimizeNode(child, opts));
  }

  return optimized;
}

/**
 * Truncate text to maximum length
 *
 * @param text - Text to truncate
 * @param maxLength - Maximum length
 * @returns Truncated text with ellipsis if needed
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return text.substring(0, maxLength) + "...";
}

/**
 * Omit default values from node
 *
 * Removes fields that have default/empty values to save tokens.
 *
 * @param node - SerializedNode
 * @returns Node with defaults omitted
 */
export function omitDefaults(node: SerializedNode): SerializedNode {
  const result: SerializedNode = {
    node_id: node.node_id,
    tag: node.tag,
  };

  // Only include non-empty optional fields
  if (node.role) result.role = node.role;
  if (node["aria-label"]) result["aria-label"] = node["aria-label"];
  if (node.text) result.text = node.text;
  if (node.value) result.value = node.value;
  if (node.href) result.href = node.href;
  if (node.inputType) result.inputType = node.inputType;
  if (node.placeholder) result.placeholder = node.placeholder;

  if (node.states && Object.keys(node.states).length > 0) {
    result.states = node.states;
  }

  if (node.children && node.children.length > 0) {
    result.children = node.children.map(omitDefaults);
  }

  return result;
}

/**
 * Calculate token count estimate
 *
 * Rough estimate: 1 token ≈ 4 characters
 *
 * @param node - SerializedNode
 * @returns Estimated token count
 */
export function estimateTokenCount(node: SerializedNode): number {
  const json = JSON.stringify(node);
  return Math.ceil(json.length / 4);
}

/**
 * Get size statistics for serialized tree
 *
 * @param node - SerializedNode
 * @returns Size statistics
 */
export function getSizeStats(node: SerializedNode): {
  nodeCount: number;
  jsonSize: number;
  estimatedTokens: number;
} {
  const nodeCount = countNodes(node);
  const jsonSize = JSON.stringify(node).length;
  const estimatedTokens = estimateTokenCount(node);

  return {
    nodeCount,
    jsonSize,
    estimatedTokens,
  };
}

/**
 * Count nodes in serialized tree
 */
function countNodes(node: SerializedNode): number {
  let count = 1;

  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }

  return count;
}
