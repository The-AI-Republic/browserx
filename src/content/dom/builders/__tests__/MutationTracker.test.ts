/**
 * MutationTracker Tests
 *
 * Tests for the MutationTracker class
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { MutationTracker } from "../MutationTracker";

describe("MutationTracker", () => {
  let tracker: MutationTracker;
  let testContainer: HTMLDivElement;

  beforeEach(() => {
    tracker = new MutationTracker();
    testContainer = document.createElement("div");
    testContainer.id = "test-container";
    document.body.appendChild(testContainer);
  });

  afterEach(() => {
    tracker.stopTracking();
    document.body.removeChild(testContainer);
  });

  it("should start and stop tracking", () => {
    tracker.startTracking(testContainer);
    expect(tracker.hasMutations()).toBe(false);

    tracker.stopTracking();
    expect(tracker.hasMutations()).toBe(false);
  });

  it("should track added elements", async () => {
    tracker.startTracking(testContainer);

    // Add element
    const newDiv = document.createElement("div");
    newDiv.textContent = "New element";
    testContainer.appendChild(newDiv);

    // Wait for mutation observer
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(tracker.hasMutations()).toBe(true);

    const mutations = tracker.collectMutations();
    expect(mutations.addedElements.has(newDiv)).toBe(true);
    expect(mutations.hasStructuralChanges).toBe(true);
    expect(mutations.mutationCount).toBeGreaterThan(0);
  });

  it("should track removed elements", async () => {
    const childDiv = document.createElement("div");
    childDiv.textContent = "Child";
    testContainer.appendChild(childDiv);

    tracker.startTracking(testContainer);

    // Remove element
    testContainer.removeChild(childDiv);

    // Wait for mutation observer
    await new Promise((resolve) => setTimeout(resolve, 10));

    const mutations = tracker.collectMutations();
    expect(mutations.removedElements.has(childDiv)).toBe(true);
    expect(mutations.hasStructuralChanges).toBe(true);
  });

  it("should track attribute changes", async () => {
    const childDiv = document.createElement("div");
    testContainer.appendChild(childDiv);

    tracker.startTracking(testContainer);

    // Change attribute
    childDiv.setAttribute("data-test", "value");

    // Wait for mutation observer
    await new Promise((resolve) => setTimeout(resolve, 10));

    const mutations = tracker.collectMutations();
    expect(mutations.modifiedElements.has(childDiv)).toBe(true);
  });

  it("should ignore style attribute changes", async () => {
    const childDiv = document.createElement("div");
    testContainer.appendChild(childDiv);

    tracker.startTracking(testContainer);

    // Change style (should be ignored)
    childDiv.style.color = "red";

    // Wait for mutation observer
    await new Promise((resolve) => setTimeout(resolve, 10));

    const mutations = tracker.collectMutations();
    expect(mutations.modifiedElements.has(childDiv)).toBe(false);
  });

  it("should track dirty ancestors", async () => {
    const parent = document.createElement("div");
    testContainer.appendChild(parent);

    tracker.startTracking(testContainer);

    // Add nested element
    const child = document.createElement("span");
    parent.appendChild(child);

    // Wait for mutation observer
    await new Promise((resolve) => setTimeout(resolve, 10));

    const mutations = tracker.collectMutations();
    expect(mutations.dirtyAncestors.has(parent)).toBe(true);
  });

  it("should clear mutations", async () => {
    tracker.startTracking(testContainer);

    const newDiv = document.createElement("div");
    testContainer.appendChild(newDiv);

    // Wait for mutation observer
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(tracker.hasMutations()).toBe(true);

    tracker.clearMutations();
    expect(tracker.hasMutations()).toBe(false);
  });

  it("should collect mutations only once", async () => {
    tracker.startTracking(testContainer);

    const newDiv = document.createElement("div");
    testContainer.appendChild(newDiv);

    // Wait for mutation observer
    await new Promise((resolve) => setTimeout(resolve, 10));

    const mutations1 = tracker.collectMutations();
    expect(mutations1.addedElements.size).toBeGreaterThan(0);

    // Second collection should be empty
    const mutations2 = tracker.collectMutations();
    expect(mutations2.addedElements.size).toBe(0);
    expect(mutations2.mutationCount).toBe(0);
  });
});
