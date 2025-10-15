/**
 * Iframe Handler Module
 *
 * Purpose: Process same-origin iframes (1 level deep, extensible)
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/research.md - Decision 2
 *
 * Strategy:
 * - Only process same-origin iframes (security)
 * - Default depth: 1 level
 * - Extensible for future multi-level support
 */

/**
 * Iframe processing result
 */
export interface IframeContent {
  /** iframe elements found */
  elements: Element[];

  /** Total iframes processed */
  processedCount: number;

  /** Iframes skipped (cross-origin or max depth) */
  skippedCount: number;
}

/**
 * Processes iframes in a document
 *
 * @param document - Document to process
 * @param maxDepth - Maximum iframe nesting depth (default: 1)
 * @param currentDepth - Current recursion depth (internal)
 * @returns IframeContent result
 *
 * Strategy:
 * - Queries all iframe elements
 * - Checks same-origin policy
 * - Recursively processes nested iframes (up to maxDepth)
 * - Collects all interactive elements from iframes
 */
export function processIframes(
  document: Document,
  maxDepth: number = 1,
  currentDepth: number = 0
): IframeContent {
  const result: IframeContent = {
    elements: [],
    processedCount: 0,
    skippedCount: 0,
  };

  // Stop if max depth reached
  if (currentDepth >= maxDepth) {
    return result;
  }

  // Find all iframe elements
  const iframes = document.querySelectorAll('iframe');

  for (const iframe of Array.from(iframes)) {
    try {
      // Attempt to access iframe content (will throw if cross-origin)
      const iframeDoc = getIframeDocument(iframe as HTMLIFrameElement);

      if (!iframeDoc) {
        result.skippedCount++;
        continue;
      }

      // Successfully accessed iframe (same-origin)
      result.processedCount++;

      // Extract interactive elements from iframe
      const iframeElements = extractIframeElements(iframeDoc);
      result.elements.push(...iframeElements);

      // Recursively process nested iframes
      if (currentDepth + 1 < maxDepth) {
        const nested = processIframes(iframeDoc, maxDepth, currentDepth + 1);
        result.elements.push(...nested.elements);
        result.processedCount += nested.processedCount;
        result.skippedCount += nested.skippedCount;
      }
    } catch (error) {
      // Cross-origin iframe: skip
      result.skippedCount++;
    }
  }

  return result;
}

/**
 * Gets document from iframe element
 *
 * @param iframe - Iframe element
 * @returns iframe's document or null
 *
 * Throws:
 * - SecurityError if iframe is cross-origin
 */
function getIframeDocument(iframe: HTMLIFrameElement): Document | null {
  try {
    // Try contentDocument first
    if (iframe.contentDocument) {
      return iframe.contentDocument;
    }

    // Try contentWindow.document
    if (iframe.contentWindow && iframe.contentWindow.document) {
      return iframe.contentWindow.document;
    }

    return null;
  } catch (error) {
    // Cross-origin access denied
    throw new Error('Cross-origin iframe access denied');
  }
}

/**
 * Extracts interactive elements from iframe document
 *
 * @param iframeDoc - Iframe's document
 * @returns Array of interactive elements
 */
function extractIframeElements(iframeDoc: Document): Element[] {
  const elements: Element[] = [];

  // Query interactive elements (same as main document)
  const interactiveSelectors = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    'summary',
    '[role="button"]',
    '[role="link"]',
    '[tabindex]',
  ].join(', ');

  const interactiveElements = iframeDoc.querySelectorAll(interactiveSelectors);
  elements.push(...Array.from(interactiveElements));

  return elements;
}

/**
 * Checks if iframe is same-origin
 *
 * @param iframe - Iframe element
 * @param document - Parent document
 * @returns True if iframe is same-origin
 */
export function isSameOriginIframe(iframe: HTMLIFrameElement, document: Document): boolean {
  try {
    // Try to access iframe's origin
    const iframeOrigin = iframe.contentWindow?.location.origin;
    const parentOrigin = document.location.origin;

    return iframeOrigin === parentOrigin;
  } catch {
    // Cross-origin: access denied
    return false;
  }
}

/**
 * Gets iframe source URL
 *
 * @param iframe - Iframe element
 * @returns iframe src attribute or null
 */
export function getIframeSrc(iframe: HTMLIFrameElement): string | null {
  return iframe.getAttribute('src');
}

/**
 * Checks if iframe is loaded
 *
 * @param iframe - Iframe element
 * @returns True if iframe is loaded
 */
export function isIframeLoaded(iframe: HTMLIFrameElement): boolean {
  try {
    return iframe.contentDocument !== null && iframe.contentDocument.readyState === 'complete';
  } catch {
    return false;
  }
}

/**
 * Waits for iframe to load
 *
 * @param iframe - Iframe element
 * @param timeout - Timeout in milliseconds
 * @returns Promise that resolves when iframe is loaded
 */
export function waitForIframeLoad(iframe: HTMLIFrameElement, timeout: number = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isIframeLoaded(iframe)) {
      resolve();
      return;
    }

    const timeoutId = setTimeout(() => {
      iframe.removeEventListener('load', onLoad);
      reject(new Error('Iframe load timeout'));
    }, timeout);

    const onLoad = () => {
      clearTimeout(timeoutId);
      resolve();
    };

    iframe.addEventListener('load', onLoad, { once: true });
  });
}

/**
 * Counts total iframes in document (including nested)
 *
 * @param document - Document to count iframes in
 * @param maxDepth - Maximum depth to search
 * @returns Total iframe count
 */
export function countIframes(document: Document, maxDepth: number = 1): number {
  const result = processIframes(document, maxDepth);
  return result.processedCount + result.skippedCount;
}
