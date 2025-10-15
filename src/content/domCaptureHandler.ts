/**
 * DOM Capture Handler - Main Integration
 *
 * Integrates all DOM capture helpers to provide complete page snapshot
 * functionality for the content script.
 *
 * This handler is called by the content script when a DOM capture request
 * is received from the background script.
 */

import { traverseDOM, getInteractiveElements, type TraversalResult } from '../tools/dom/chrome/domTraversal';
import { captureElementSnapshot, batchCaptureSnapshots, type ElementSnapshot } from '../tools/dom/chrome/snapshotCapture';
import { StringPool } from '../tools/dom/chrome/stringInterning';
import { extractARIA, batchExtractARIA } from '../tools/dom/chrome/ariaExtraction';
import {
  getAccessibleIframeDocuments,
  type IframePlaceholder,
  traverseIframes,
  type IframeTraversalOptions
} from '../tools/dom/chrome/iframeTraversal';
import {
  getAllShadowRoots,
  mergeWithShadowDOM,
  type ShadowRootInfo
} from '../tools/dom/chrome/shadowDOMTraversal';
import {
  type DOMCaptureOptions,
  type CapturedDocument,
  type CapturedNode,
  type ContentScriptCaptureReturns,
  type ViewportInfo,
  type EnhancedAXNode
} from '../tools/dom/views';

/**
 * Main DOM capture handler
 *
 * Captures complete DOM state including:
 * - DOM tree structure
 * - Element snapshots (bounds, styles, attributes)
 * - Accessibility tree (ARIA attributes)
 * - Iframes (respecting limits)
 * - Shadow DOM
 *
 * @param options - Capture options
 * @returns Capture result with documents and string pool
 */
export function captureDOMSnapshot(options: DOMCaptureOptions = {}): ContentScriptCaptureReturns {
  const {
    includeShadowDOM = true,
    includeIframes = true,
    maxIframeDepth = 3,
    maxIframeCount = 15,
    skipHiddenElements = true
  } = options;

  // Initialize string pool for efficient transfer
  const stringPool = new StringPool();

  // Capture main document
  const mainDocument = captureDocument(
    document,
    'main',
    { includeShadowDOM, skipHiddenElements },
    stringPool
  );
  console.log("The captured main doc:", mainDocument)

  const documents: CapturedDocument[] = [mainDocument];

  // Capture iframe documents if requested
  if (includeIframes) {
    const iframeDocs = getAccessibleIframeDocuments(
      document,
      maxIframeDepth,
      maxIframeCount
    );

    for (const { document: iframeDoc, depth, src } of iframeDocs) {
      const frameId = `iframe-${src}-depth${depth}`;
      const capturedDoc = captureDocument(
        iframeDoc,
        frameId,
        { includeShadowDOM, skipHiddenElements },
        stringPool
      );
      console.log("The captured iframe doc:", capturedDoc)
      documents.push(capturedDoc);
    }
  }

  console.log("the length of documents:", documents.length)
  return {
    documents,
    strings: stringPool.export()
  };
}

/**
 * Capture a single document (main page or iframe)
 *
 * @param doc - Document to capture
 * @param frameId - Frame identifier
 * @param options - Capture options
 * @param stringPool - String pool for interning
 * @returns Captured document
 */
function captureDocument(
  doc: Document,
  frameId: string,
  options: { includeShadowDOM: boolean; skipHiddenElements: boolean },
  stringPool: StringPool
): CapturedDocument {
  // Traverse DOM tree
  const traversalResult = traverseDOM(doc.documentElement, {
    maxDepth: 100,
    includeTextNodes: true,
    includeComments: false,
    skipHiddenElements: options.skipHiddenElements
  });
  // console.log("traverse dom result: ", traversalResult);

  // Collect elements from element map with metadata
  const elementMetadata: Array<{ backendNodeId: number; element: Element }> = [];

  for (const [index, element] of traversalResult.elementMap.entries()) {
    elementMetadata.push({
      backendNodeId: index + 1,
      element
    });
  }
  // console.log("elementMetadata: ", elementMetadata);

  // Batch capture snapshots and ARIA data
  const snapshots = batchCaptureSnapshots(elementMetadata);
  // console.log("snapshots: ", snapshots);
  const axNodes = batchExtractARIA(elementMetadata);
  // console.log("axNodes: ", axNodes);

  // Build captured nodes
  const nodes: CapturedNode[] = traversalResult.nodes.map((node, index) => {
    const capturedNode: CapturedNode = {
      nodeType: node.nodeType,
      nodeName: stringPool.internString(node.nodeName),  // Returns number
      nodeValue: node.nodeValue,
      backendNodeId: index + 1,
      parentIndex: node.parentIndex,
      childIndices: node.childIndices,
      attributes: {}
    };

    // Attach snapshot and ARIA data if element node
    if (node.nodeType === 1) {
      const element = traversalResult.elementMap.get(index);
      if (element) {
        capturedNode.snapshot = snapshots.get(element);
        capturedNode.axNode = axNodes.get(element);

        // Intern attributes
        if (capturedNode.snapshot) {
          const internedAttrs: Record<number, number> = {};
          for (const [key, value] of Object.entries(capturedNode.snapshot.attributes)) {
            const keyIndex = stringPool.internString(key);
            const valueIndex = stringPool.internString(value);
            internedAttrs[keyIndex] = valueIndex;
          }
          capturedNode.attributes = internedAttrs;
        }
      }
    }

    // console.log("the capturedNode", capturedNode);

    return capturedNode;
  });

  // Handle shadow DOM if requested
  if (options.includeShadowDOM) {
    const shadowRoots = getAllShadowRoots(doc.documentElement, false);
    // TODO: Integrate shadow DOM nodes into main tree
    // For now, shadow roots are detected but not merged
  }

  return {
    documentURL: doc.location?.href || '',
    baseURL: doc.baseURI || '',
    title: doc.title || '',
    frameId,
    nodes
  };
}

/**
 * Capture viewport information
 *
 * @returns Viewport info
 */
export function captureViewportInfo(): ViewportInfo {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    visibleWidth: document.documentElement.clientWidth,
    visibleHeight: document.documentElement.clientHeight
  };
}

/**
 * Main handler for DOM capture requests from background script
 *
 * @param options - Capture options from background
 * @returns Complete capture result including viewport
 */
export function handleDOMCaptureRequest(options: DOMCaptureOptions): {
  snapshot: ContentScriptCaptureReturns;
  viewport: ViewportInfo;
  timing: {
    startTime: number;
    traversalTime: number;
    totalTime: number;
  };
} {
  console.log('starting dom capture with options', options);
  const startTime = performance.now();

  // Capture DOM snapshot
  const snapshot = captureDOMSnapshot(options);

  const traversalTime = performance.now() - startTime;

  // Capture viewport
  const viewport = captureViewportInfo();

  const totalTime = performance.now() - startTime;
  console.log('dom capture completed with snapshot', snapshot);
  return {
    snapshot,
    viewport,
    timing: {
      startTime,
      traversalTime,
      totalTime
    }
  };
}
