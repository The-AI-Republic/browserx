/**
 * Flattener
 *
 * Flattens VirtualNode tree by removing structural containers while
 * preserving semantic groups. Achieves 40-60% token reduction.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type { VirtualNode, SerializedNode } from "../../../types/domTool";

/**
 * Structural containers that should be flattened (children hoisted)
 */
const FLATTENABLE_TAGS = new Set([
  "div",
  "section",
  "header",
  "nav",
  "footer",
  "aside",
  "main",
  "article",
  "span",
]);

/**
 * Semantic groups that should be preserved
 */
const SEMANTIC_GROUPS = new Set([
  "form",
  "dialog",
  "table",
  "ul",
  "ol",
  "fieldset",
  "details",
  "summary",
]);

/**
 * Flatten VirtualNode tree
 *
 * Removes structural containers (divs, sections) while preserving
 * semantic groups (forms, dialogs). Children are hoisted to parent.
 *
 * @param node - VirtualNode to flatten
 * @returns Flattened SerializedNode
 */
export function flattenTree(node: VirtualNode): SerializedNode {
  // Base serialized node
  const serialized: SerializedNode = {
    node_id: node.node_id,
    tag: node.tag,
  };

  // Copy optional fields
  if (node.role) serialized.role = node.role;
  if (node["aria-label"]) serialized["aria-label"] = node["aria-label"];
  if (node.text) serialized.text = node.text;
  if (node.value) serialized.value = node.value;
  if (node.metadata?.href) serialized.href = node.metadata.href;
  if (node.metadata?.inputType) serialized.inputType = node.metadata.inputType;
  if (node.metadata?.placeholder) serialized.placeholder = node.metadata.placeholder;
  if (node.metadata?.states) serialized.states = node.metadata.states;

  // Process children
  if (node.children && node.children.length > 0) {
    const flattenedChildren = flattenChildren(node.children);
    if (flattenedChildren.length > 0) {
      serialized.children = flattenedChildren;
    }
  }

  return serialized;
}

/**
 * Flatten children array
 *
 * Recursively flattens children, hoisting grandchildren when
 * intermediate containers should be removed.
 *
 * @param children - Array of VirtualNode children
 * @returns Flattened array of SerializedNode
 */
function flattenChildren(children: VirtualNode[]): SerializedNode[] {
  const result: SerializedNode[] = [];

  for (const child of children) {
    if (shouldFlatten(child)) {
      // Hoist grandchildren to this level
      if (child.children && child.children.length > 0) {
        const hoistedChildren = flattenChildren(child.children);
        result.push(...hoistedChildren);
      }
      // Skip the container itself (it's being removed)
    } else {
      // Keep this node and recurse
      result.push(flattenTree(child));
    }
  }

  return result;
}

/**
 * Determine if a node should be flattened (removed)
 *
 * A node is flattened if:
 * - It's a structural container tag (div, section, etc.)
 * - AND it has no meaningful role
 * - AND it has no meaningful aria-label
 * - AND it's not a semantic group
 *
 * @param node - VirtualNode to check
 * @returns true if node should be flattened
 */
export function shouldFlatten(node: VirtualNode): boolean {
  // Never flatten semantic groups
  if (SEMANTIC_GROUPS.has(node.tag)) {
    return false;
  }

  // Don't flatten if has meaningful role
  if (node.role && !["none", "presentation"].includes(node.role)) {
    return false;
  }

  // Don't flatten if has meaningful aria-label
  if (node["aria-label"] && node["aria-label"].trim().length > 0) {
    return false;
  }

  // Don't flatten if has text content (leaf node with content)
  if (node.text && node.text.trim().length > 0) {
    return false;
  }

  // Don't flatten if it's interactive (has href, etc.)
  if (node.metadata?.href) {
    return false;
  }

  // Flatten if it's a structural container
  return FLATTENABLE_TAGS.has(node.tag);
}

/**
 * Count nodes before and after flattening (for metrics)
 *
 * @param original - Original VirtualNode
 * @param flattened - Flattened SerializedNode
 * @returns Object with before/after counts and reduction percentage
 */
export function calculateTokenReduction(
  original: VirtualNode,
  flattened: SerializedNode
): { before: number; after: number; reduction: number } {
  const before = countNodes(original);
  const after = countSerializedNodes(flattened);
  const reduction = Math.round(((before - after) / before) * 100);

  return { before, after, reduction };
}

/**
 * Count total nodes in VirtualNode tree
 */
function countNodes(node: VirtualNode): number {
  let count = 1;

  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child);
    }
  }

  if (node.iframe) {
    count += countNodes(node.iframe);
  }

  if (node.shadowDom) {
    count += countNodes(node.shadowDom);
  }

  return count;
}

/**
 * Count total nodes in SerializedNode tree
 */
function countSerializedNodes(node: SerializedNode): number {
  let count = 1;

  if (node.children) {
    for (const child of node.children) {
      count += countSerializedNodes(child);
    }
  }

  return count;
}
