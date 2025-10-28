/**
 * TreeBuilder Incremental Updates Tests
 *
 * Tests for enhanced node ID reuse and incremental updates
 */

import { describe, it, expect, beforeEach } from "vitest";
import { TreeBuilder } from "../TreeBuilder";
import { DomSnapshotImpl } from "../../DomSnapshot";

describe("TreeBuilder - Incremental Updates", () => {
  let builder: TreeBuilder;
  let testContainer: HTMLDivElement;

  beforeEach(() => {
    builder = new TreeBuilder();
    testContainer = document.createElement("div");
    testContainer.id = "test-root";
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    document.body.removeChild(testContainer);
  });

  describe("Node ID Reuse", () => {
    it("should reuse node ID for unchanged element", async () => {
      // Build initial tree
      testContainer.innerHTML = '<div id="my-div">Content</div>';
      const tree1 = await builder.buildTree(testContainer);
      const mappings1 = builder.getMappings();

      // Create snapshot
      const snapshot1 = new DomSnapshotImpl(
        tree1,
        mappings1,
        { url: "test", title: "test", viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 } },
        { totalNodes: 1, visibleNodes: 1, interactiveNodes: 0, iframeCount: 0, shadowDomCount: 0, captureTimeMs: 0 }
      );

      // Build second tree (no changes)
      const builder2 = new TreeBuilder();
      const tree2 = await builder2.buildTree(testContainer, snapshot1);

      // Node IDs should be preserved
      expect(tree2.children?.[0]?.node_id).toBe(tree1.children?.[0]?.node_id);
    });

    it("should reuse node ID when element moves position", async () => {
      // Build initial tree
      testContainer.innerHTML = `
        <div id="first">First</div>
        <div id="second">Second</div>
      `;
      const tree1 = await builder.buildTree(testContainer);
      const mappings1 = builder.getMappings();
      const snapshot1 = new DomSnapshotImpl(
        tree1,
        mappings1,
        { url: "test", title: "test", viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 } },
        { totalNodes: 2, visibleNodes: 2, interactiveNodes: 0, iframeCount: 0, shadowDomCount: 0, captureTimeMs: 0 }
      );

      const firstId = tree1.children?.[0]?.node_id;
      const secondId = tree1.children?.[1]?.node_id;

      // Swap elements
      testContainer.innerHTML = `
        <div id="second">Second</div>
        <div id="first">First</div>
      `;

      // Build second tree
      const builder2 = new TreeBuilder();
      const tree2 = await builder2.buildTree(testContainer, snapshot1);

      // IDs should be preserved (matched by HTML id)
      const newFirstNode = tree2.children?.find((n) => n.metadata?.htmlId === "first");
      const newSecondNode = tree2.children?.find((n) => n.metadata?.htmlId === "second");

      expect(newFirstNode?.node_id).toBe(firstId);
      expect(newSecondNode?.node_id).toBe(secondId);
    });

    it("should reuse node ID when content changes but tag remains", async () => {
      // Build initial tree
      testContainer.innerHTML = '<button id="my-btn">Click Me</button>';
      const tree1 = await builder.buildTree(testContainer);
      const mappings1 = builder.getMappings();
      const snapshot1 = new DomSnapshotImpl(
        tree1,
        mappings1,
        { url: "test", title: "test", viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 } },
        { totalNodes: 1, visibleNodes: 1, interactiveNodes: 0, iframeCount: 0, shadowDomCount: 0, captureTimeMs: 0 }
      );

      const btnId = tree1.children?.[0]?.node_id;

      // Change content but keep ID
      testContainer.innerHTML = '<button id="my-btn">New Text</button>';

      // Build second tree
      const builder2 = new TreeBuilder();
      const tree2 = await builder2.buildTree(testContainer, snapshot1);

      // ID should be preserved (matched by HTML id)
      expect(tree2.children?.[0]?.node_id).toBe(btnId);
    });

    it("should generate new ID when tag changes", async () => {
      // Build initial tree
      testContainer.innerHTML = '<button id="my-element">Click</button>';
      const tree1 = await builder.buildTree(testContainer);
      const mappings1 = builder.getMappings();
      const snapshot1 = new DomSnapshotImpl(
        tree1,
        mappings1,
        { url: "test", title: "test", viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 } },
        { totalNodes: 1, visibleNodes: 1, interactiveNodes: 0, iframeCount: 0, shadowDomCount: 0, captureTimeMs: 0 }
      );

      const oldId = tree1.children?.[0]?.node_id;

      // Change tag
      testContainer.innerHTML = '<div id="my-element">Click</div>';

      // Build second tree
      const builder2 = new TreeBuilder();
      const tree2 = await builder2.buildTree(testContainer, snapshot1);

      // ID should be different (tag changed)
      expect(tree2.children?.[0]?.node_id).not.toBe(oldId);
    });

    it("should match by test ID", async () => {
      // Build initial tree
      testContainer.innerHTML = '<div data-testid="my-test">Content</div>';
      const tree1 = await builder.buildTree(testContainer);
      const mappings1 = builder.getMappings();
      const snapshot1 = new DomSnapshotImpl(
        tree1,
        mappings1,
        { url: "test", title: "test", viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 } },
        { totalNodes: 1, visibleNodes: 1, interactiveNodes: 0, iframeCount: 0, shadowDomCount: 0, captureTimeMs: 0 }
      );

      const testId = tree1.children?.[0]?.node_id;

      // Change content but keep test ID
      testContainer.innerHTML = '<div data-testid="my-test">New Content</div>';

      // Build second tree
      const builder2 = new TreeBuilder();
      const tree2 = await builder2.buildTree(testContainer, snapshot1);

      // ID should be preserved (matched by test ID)
      expect(tree2.children?.[0]?.node_id).toBe(testId);
    });

    it("should match by position when no stable identifiers", async () => {
      // Build initial tree
      testContainer.innerHTML = `
        <div>
          <span>First</span>
          <span>Second</span>
        </div>
      `;
      const tree1 = await builder.buildTree(testContainer);
      const mappings1 = builder.getMappings();
      const snapshot1 = new DomSnapshotImpl(
        tree1,
        mappings1,
        { url: "test", title: "test", viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 } },
        { totalNodes: 3, visibleNodes: 3, interactiveNodes: 0, iframeCount: 0, shadowDomCount: 0, captureTimeMs: 0 }
      );

      const firstSpanId = tree1.children?.[0]?.children?.[0]?.node_id;

      // Change text content but keep structure
      testContainer.innerHTML = `
        <div>
          <span>Changed First</span>
          <span>Changed Second</span>
        </div>
      `;

      // Build second tree
      const builder2 = new TreeBuilder();
      const tree2 = await builder2.buildTree(testContainer, snapshot1);

      // First span should have same ID (matched by position)
      expect(tree2.children?.[0]?.children?.[0]?.node_id).toBe(firstSpanId);
    });
  });

  describe("Enhanced Matching Strategies", () => {
    it("should prioritize HTML id over position", async () => {
      testContainer.innerHTML = `
        <div id="unique-div">Content</div>
        <div>Other</div>
      `;
      const tree1 = await builder.buildTree(testContainer);
      const mappings1 = builder.getMappings();
      const snapshot1 = new DomSnapshotImpl(
        tree1,
        mappings1,
        { url: "test", title: "test", viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 } },
        { totalNodes: 2, visibleNodes: 2, interactiveNodes: 0, iframeCount: 0, shadowDomCount: 0, captureTimeMs: 0 }
      );

      const uniqueId = tree1.children?.find((n) => n.metadata?.htmlId === "unique-div")?.node_id;

      // Swap positions
      testContainer.innerHTML = `
        <div>Other</div>
        <div id="unique-div">Content</div>
      `;

      const builder2 = new TreeBuilder();
      const tree2 = await builder2.buildTree(testContainer, snapshot1);

      // Should match by HTML id, not position
      const matchedNode = tree2.children?.find((n) => n.metadata?.htmlId === "unique-div");
      expect(matchedNode?.node_id).toBe(uniqueId);
    });

    it("should handle deeply nested changes", async () => {
      testContainer.innerHTML = `
        <div id="outer">
          <div id="middle">
            <span id="inner">Deep content</span>
          </div>
        </div>
      `;
      const tree1 = await builder.buildTree(testContainer);
      const mappings1 = builder.getMappings();
      const snapshot1 = new DomSnapshotImpl(
        tree1,
        mappings1,
        { url: "test", title: "test", viewport: { width: 0, height: 0, scrollX: 0, scrollY: 0 } },
        { totalNodes: 3, visibleNodes: 3, interactiveNodes: 0, iframeCount: 0, shadowDomCount: 0, captureTimeMs: 0 }
      );

      // Find inner span ID
      const innerSpan = tree1.children?.[0]?.children?.[0]?.children?.[0];
      const innerId = innerSpan?.node_id;

      // Change only the inner content
      testContainer.innerHTML = `
        <div id="outer">
          <div id="middle">
            <span id="inner">Changed deep content</span>
          </div>
        </div>
      `;

      const builder2 = new TreeBuilder();
      const tree2 = await builder2.buildTree(testContainer, snapshot1);

      // Inner span should keep its ID
      const newInnerSpan = tree2.children?.[0]?.children?.[0]?.children?.[0];
      expect(newInnerSpan?.node_id).toBe(innerId);
    });
  });
});
