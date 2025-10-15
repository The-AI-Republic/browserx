/**
 * Integration Test: DOM Capture Complete Flow
 *
 * This test verifies end-to-end DOM capture functionality including:
 * - DOM traversal with element mapping
 * - Snapshot capture and attachment
 * - ARIA data extraction
 * - String interning
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { captureDOMSnapshot } from '../domCaptureHandler';

describe('DOM Capture Integration', () => {
  beforeEach(() => {
    // Clean up document
    document.body.innerHTML = '';
  });

  it('captures complete page snapshot with all data', () => {
    // Set up test DOM
    document.body.innerHTML = `
      <div id="root" class="container">
        <h1>Test</h1>
        <button type="button">Click</button>
      </div>
    `;

    // Capture DOM
    const result = captureDOMSnapshot({});

    // Verify structure
    expect(result.documents).toBeDefined();
    expect(result.documents.length).toBeGreaterThan(0);
    expect(result.documents[0].nodes.length).toBeGreaterThan(0);

    // Verify element nodes have snapshots
    const elements = result.documents[0].nodes.filter(n => n.nodeType === 1);
    expect(elements.length).toBeGreaterThan(0);

    elements.forEach(el => {
      expect(el.snapshot).toBeDefined();
      expect(el.axNode).toBeDefined();
    });

    // Verify string interning
    expect(result.strings.length).toBeGreaterThan(0);
    elements.forEach(el => {
      expect(typeof el.nodeName).toBe('number');
      expect(el.nodeName).toBeLessThan(result.strings.length);
    });
  });

  it('captures multiple elements with correct hierarchy', () => {
    document.body.innerHTML = `
      <div id="parent">
        <span class="child1">Text 1</span>
        <span class="child2">Text 2</span>
      </div>
    `;

    const result = captureDOMSnapshot({});
    const nodes = result.documents[0].nodes;

    // Find parent div
    const parentDiv = nodes.find(n => {
      if (n.nodeType !== 1) return false;
      const nodeName = result.strings[n.nodeName];
      return nodeName === 'DIV';
    });

    expect(parentDiv).toBeDefined();
    expect(parentDiv!.childIndices.length).toBeGreaterThan(0);
  });

  it('string interning deduplicates repeated strings', () => {
    document.body.innerHTML = `
      <div class="repeated">Item 1</div>
      <div class="repeated">Item 2</div>
      <div class="repeated">Item 3</div>
    `;

    const result = captureDOMSnapshot({});

    // Verify "repeated" appears only once in strings array
    const repeatedOccurrences = result.strings.filter(s => s === 'repeated');
    expect(repeatedOccurrences.length).toBe(1);

    // Verify "DIV" appears only once
    const divOccurrences = result.strings.filter(s => s === 'DIV');
    expect(divOccurrences.length).toBe(1);
  });

  it('handles empty document', () => {
    // Document with just HTML and BODY
    const result = captureDOMSnapshot({});

    expect(result.documents[0].nodes.length).toBeGreaterThan(0);
    // Should at least have HTML and BODY elements
    const htmlNode = result.documents[0].nodes.find(n =>
      result.strings[n.nodeName] === 'HTML'
    );
    expect(htmlNode).toBeDefined();
  });

  it('captures element attributes correctly', () => {
    document.body.innerHTML = `
      <button id="test-btn" class="primary" data-action="submit">Click</button>
    `;

    const result = captureDOMSnapshot({});
    const buttonNode = result.documents[0].nodes.find(n => {
      if (n.nodeType !== 1) return false;
      return result.strings[n.nodeName] === 'BUTTON';
    });

    expect(buttonNode).toBeDefined();
    expect(buttonNode!.attributes).toBeDefined();

    // Attributes should use string indices
    Object.entries(buttonNode!.attributes).forEach(([key, value]) => {
      expect(typeof parseInt(key)).toBe('number');
      expect(typeof value).toBe('number');
    });
  });
});
