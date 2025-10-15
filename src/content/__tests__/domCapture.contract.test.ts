/**
 * Contract Test: DOM Capture Functionality
 *
 * This contract defines the expected behavior of the DOM capture system.
 * Tests will FAIL until the bug fixes are implemented.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { captureDOMSnapshot } from '../domCaptureHandler';
import {
  type ContentScriptCaptureReturns,
  type CapturedDocument,
  type CapturedNode
} from '../../tools/dom/views';
import { traverseDOM } from '../../tools/dom/chrome/domTraversal';

describe('DOM Capture Contract', () => {
  beforeEach(() => {
    // Set up test DOM
    document.body.innerHTML = `
      <div id="root" class="container">
        <h1>Test Page</h1>
        <p class="text">Paragraph text</p>
        <button id="btn" type="button">Click me</button>
      </div>
    `;
  });

  describe('FR-001: System MUST capture all DOM nodes during traversal', () => {
    it('should return non-empty nodes array', () => {
      const result = captureDOMSnapshot({});

      expect(result.documents).toHaveLength(1);
      expect(result.documents[0].nodes.length).toBeGreaterThan(0);
    });

    it('should capture all element nodes in test DOM', () => {
      const result = captureDOMSnapshot({});
      const elementNodes = result.documents[0].nodes.filter(n => n.nodeType === 1);

      // Expect: HTML, BODY, DIV, H1, P, BUTTON = 6 elements minimum
      expect(elementNodes.length).toBeGreaterThanOrEqual(6);
    });

    it('should capture text nodes when included', () => {
      const result = captureDOMSnapshot({ includeTextNodes: true });
      const textNodes = result.documents[0].nodes.filter(n => n.nodeType === 3);

      // Expect: "Test Page", "Paragraph text", "Click me" = 3 text nodes minimum
      expect(textNodes.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('FR-002: System MUST populate nodes array with all traversed nodes', () => {
    it('should have nodes array length matching stats.totalNodes', () => {
      const traversalResult = traverseDOM(document.documentElement);

      expect(traversalResult.nodes.length).toBe(traversalResult.stats.totalNodes);
      expect(traversalResult.nodes.length).toBeGreaterThan(0);
    });

    it('should maintain parent-child relationships', () => {
      const result = captureDOMSnapshot({});
      const nodes = result.documents[0].nodes;

      // Root node (HTML) should have no parent
      const rootNode = nodes.find(n => n.parentIndex === null);
      expect(rootNode).toBeDefined();
      expect(rootNode!.nodeType).toBe(1); // ELEMENT_NODE

      // All non-root nodes should have valid parent indices
      const childNodes = nodes.filter(n => n.parentIndex !== null);
      childNodes.forEach(child => {
        expect(child.parentIndex).toBeGreaterThanOrEqual(0);
        expect(child.parentIndex!).toBeLessThan(nodes.length);

        // Parent should list this child
        const parent = nodes[child.parentIndex!];
        expect(parent.childIndices).toContain(nodes.indexOf(child));
      });
    });
  });

  describe('FR-003: System MUST attach element snapshots to each element node', () => {
    it('should attach snapshot to all element nodes', () => {
      const result = captureDOMSnapshot({});
      const elementNodes = result.documents[0].nodes.filter(n => n.nodeType === 1);

      elementNodes.forEach(node => {
        expect(node.snapshot).toBeDefined();
        expect(node.snapshot!.backendNodeId).toBe(node.backendNodeId);
        expect(node.snapshot!.tagName).toBeDefined();
        expect(node.snapshot!.boundingBox).toBeDefined();
      });
    });

    it('should capture element bounding boxes', () => {
      const result = captureDOMSnapshot({});
      const buttonNode = result.documents[0].nodes.find(n =>
        n.nodeType === 1 &&
        result.strings[n.nodeName] === 'BUTTON'
      );

      expect(buttonNode).toBeDefined();
      expect(buttonNode!.snapshot).toBeDefined();
      expect(buttonNode!.snapshot!.boundingBox).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        width: expect.any(Number),
        height: expect.any(Number)
      });
    });

    it('should mark visibility correctly', () => {
      const result = captureDOMSnapshot({});
      const visibleNodes = result.documents[0].nodes.filter(n =>
        n.snapshot?.isVisible === true
      );

      // Most nodes in test DOM should be visible
      expect(visibleNodes.length).toBeGreaterThan(0);
    });
  });

  describe('FR-004: System MUST attach accessibility information to each element node', () => {
    it('should attach axNode to all element nodes', () => {
      const result = captureDOMSnapshot({});
      const elementNodes = result.documents[0].nodes.filter(n => n.nodeType === 1);

      elementNodes.forEach(node => {
        expect(node.axNode).toBeDefined();
        expect(node.axNode!.backendNodeId).toBe(node.backendNodeId);
        expect(node.axNode!.role).toBeDefined();
      });
    });

    it('should extract ARIA role for button', () => {
      const result = captureDOMSnapshot({});
      const buttonNode = result.documents[0].nodes.find(n =>
        n.nodeType === 1 &&
        result.strings[n.nodeName] === 'BUTTON'
      );

      expect(buttonNode).toBeDefined();
      expect(buttonNode!.axNode).toBeDefined();
      expect(buttonNode!.axNode!.role).toBe('button');
    });
  });

  describe('FR-005: System MUST correctly map traversal indices to actual DOM elements', () => {
    it('should have elementMap with correct size', () => {
      const traversalResult = traverseDOM(document.documentElement);

      expect(traversalResult.elementMap).toBeDefined();
      expect(traversalResult.elementMap.size).toBe(traversalResult.stats.elementNodes);
    });

    it('should map indices to correct elements', () => {
      const traversalResult = traverseDOM(document.documentElement);

      traversalResult.elementMap.forEach((element, index) => {
        expect(element).toBeInstanceOf(Element);
        expect(traversalResult.nodes[index].nodeType).toBe(1); // ELEMENT_NODE
      });
    });

    it('should retrieve element by id through map', () => {
      const traversalResult = traverseDOM(document.documentElement);

      const btnIndex = traversalResult.nodes.findIndex(n =>
        n.nodeType === 1 &&
        traversalResult.elementMap.get(traversalResult.nodes.indexOf(n))?.id === 'btn'
      );

      expect(btnIndex).toBeGreaterThanOrEqual(0);
      const element = traversalResult.elementMap.get(btnIndex);
      expect(element).toBeDefined();
      expect(element!.tagName).toBe('BUTTON');
    });
  });

  describe('FR-006: System MUST intern repeated strings into string pool', () => {
    it('should have non-empty strings array', () => {
      const result = captureDOMSnapshot({});

      expect(result.strings.length).toBeGreaterThan(0);
    });

    it('should use string indices in nodeName', () => {
      const result = captureDOMSnapshot({});

      result.documents[0].nodes.forEach(node => {
        expect(typeof node.nodeName).toBe('number');
        expect(node.nodeName).toBeGreaterThanOrEqual(0);
        expect(node.nodeName).toBeLessThan(result.strings.length);
      });
    });

    it('should use string indices in attributes', () => {
      const result = captureDOMSnapshot({});
      const divNode = result.documents[0].nodes.find(n =>
        n.nodeType === 1 &&
        result.strings[n.nodeName] === 'DIV'
      );

      expect(divNode).toBeDefined();
      expect(divNode!.attributes).toBeDefined();

      Object.entries(divNode!.attributes).forEach(([key, value]) => {
        expect(typeof parseInt(key)).toBe('number');
        expect(typeof value).toBe('number');
        expect(parseInt(key)).toBeLessThan(result.strings.length);
        expect(value).toBeLessThan(result.strings.length);
      });
    });

    it('should reuse strings (interning)', () => {
      const result = captureDOMSnapshot({});
      const divIndex = result.strings.indexOf('DIV');

      expect(divIndex).toBeGreaterThanOrEqual(0);

      // Count DIV elements
      const divNodes = result.documents[0].nodes.filter(n => n.nodeName === divIndex);

      // Should have exactly 1 DIV in test DOM
      expect(divNodes.length).toBe(1);

      // Verify string is only stored once
      const divOccurrences = result.strings.filter(s => s === 'DIV');
      expect(divOccurrences.length).toBe(1);
    });
  });

  describe('FR-013: System MUST preserve node relationships', () => {
    it('should build valid tree structure', () => {
      const result = captureDOMSnapshot({});
      const nodes = result.documents[0].nodes;

      // Every child's parent should list that child
      nodes.forEach((node, index) => {
        node.childIndices.forEach(childIndex => {
          expect(childIndex).toBeLessThan(nodes.length);
          expect(nodes[childIndex].parentIndex).toBe(index);
        });
      });
    });
  });

  describe('FR-014: System MUST capture element attributes', () => {
    it('should capture id attribute', () => {
      const result = captureDOMSnapshot({});
      const buttonNode = result.documents[0].nodes.find(n => {
        if (n.nodeType !== 1) return false;
        const idKey = Object.keys(n.attributes).find(k =>
          result.strings[parseInt(k)] === 'id'
        );
        return idKey && result.strings[n.attributes[parseInt(idKey)]] === 'btn';
      });

      expect(buttonNode).toBeDefined();
    });

    it('should capture class attribute', () => {
      const result = captureDOMSnapshot({});
      const divNode = result.documents[0].nodes.find(n => {
        if (n.nodeType !== 1) return false;
        const classKey = Object.keys(n.attributes).find(k =>
          result.strings[parseInt(k)] === 'class'
        );
        return classKey && result.strings[n.attributes[parseInt(classKey)]] === 'container';
      });

      expect(divNode).toBeDefined();
    });
  });
});

describe('Edge Cases', () => {
  describe('Empty document', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
    });

    it('should handle empty body', () => {
      const result = captureDOMSnapshot({});

      // Should still have HTML and BODY elements
      expect(result.documents[0].nodes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Hidden elements', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <div id="visible">Visible</div>
        <div id="hidden" style="display: none;">Hidden</div>
      `;
    });

    it('should skip hidden elements when skipHiddenElements is true', () => {
      const result = captureDOMSnapshot({ skipHiddenElements: true });
      const hiddenDiv = result.documents[0].nodes.find(n => {
        if (!n.snapshot) return false;
        return n.snapshot.attributes.id === 'hidden';
      });

      expect(hiddenDiv).toBeUndefined();
    });

    it('should include hidden elements when skipHiddenElements is false', () => {
      const result = captureDOMSnapshot({ skipHiddenElements: false });
      const hiddenDiv = result.documents[0].nodes.find(n => {
        if (!n.snapshot) return false;
        return n.snapshot.attributes.id === 'hidden';
      });

      expect(hiddenDiv).toBeDefined();
      expect(hiddenDiv!.snapshot!.isVisible).toBe(false);
    });
  });
});
