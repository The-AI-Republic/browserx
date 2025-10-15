/**
 * Iframe Detection and Traversal
 *
 * Handles recursive iframe traversal with depth and count limits.
 * Respects same-origin policy and creates placeholders for
 * cross-origin iframes.
 */

/**
 * Iframe traversal options
 */
export interface IframeTraversalOptions {
  maxDepth: number;
  maxCount: number;
  currentDepth: number;
  currentCount: number;
}

/**
 * Iframe information
 */
export interface IframeInfo {
  element: HTMLIFrameElement;
  src: string;
  accessible: boolean;
  crossOrigin: boolean;
  document: Document | null;
}

/**
 * Placeholder node for inaccessible iframes
 */
export interface IframePlaceholder {
  type: 'IFRAME_PLACEHOLDER';
  reason: 'CROSS_ORIGIN_IFRAME' | 'IFRAME_DEPTH_LIMIT' | 'IFRAME_COUNT_LIMIT';
  src: string;
  message: string;
}

/**
 * Detect all iframes in a document
 *
 * @param root - Root element to search from
 * @returns Array of iframe information
 */
export function detectIframes(root: Document | Element = document): IframeInfo[] {
  const iframes: IframeInfo[] = [];
  const iframeElements = root.querySelectorAll('iframe');

  for (const iframe of Array.from(iframeElements)) {
    const info = getIframeInfo(iframe);
    iframes.push(info);
  }

  return iframes;
}

/**
 * Get information about an iframe
 *
 * @param iframe - Iframe element
 * @returns Iframe information
 */
export function getIframeInfo(iframe: HTMLIFrameElement): IframeInfo {
  const info: IframeInfo = {
    element: iframe,
    src: iframe.src || '',
    accessible: false,
    crossOrigin: false,
    document: null
  };

  // Try to access iframe content
  try {
    const iframeDoc = iframe.contentDocument;
    if (iframeDoc) {
      info.accessible = true;
      info.document = iframeDoc;
      info.crossOrigin = false;
    } else {
      // contentDocument is null - likely cross-origin
      info.crossOrigin = true;
    }
  } catch (err) {
    // SecurityError or DOMException - definitely cross-origin
    info.crossOrigin = true;
    info.accessible = false;
  }

  return info;
}

/**
 * Check if iframe is same-origin and accessible
 *
 * @param iframe - Iframe element
 * @returns true if iframe is accessible
 */
export function isIframeAccessible(iframe: HTMLIFrameElement): boolean {
  try {
    // Try to access contentDocument
    const doc = iframe.contentDocument;
    if (!doc) {
      return false;
    }

    // Try to access document.body (further verification)
    const body = doc.body;
    return body !== null;
  } catch (err) {
    // SecurityError or DOMException
    return false;
  }
}

/**
 * Traverse iframes recursively with limits
 *
 * @param root - Root document or element
 * @param options - Traversal options
 * @param callback - Callback for each accessible iframe
 * @returns Array of warnings for inaccessible iframes
 */
export function traverseIframes(
  root: Document | Element,
  options: IframeTraversalOptions,
  callback: (iframe: IframeInfo, depth: number) => void
): IframePlaceholder[] {
  const placeholders: IframePlaceholder[] = [];
  const iframes = detectIframes(root);

  for (const iframeInfo of iframes) {
    // Check depth limit
    if (options.currentDepth >= options.maxDepth) {
      placeholders.push({
        type: 'IFRAME_PLACEHOLDER',
        reason: 'IFRAME_DEPTH_LIMIT',
        src: iframeInfo.src,
        message: `Iframe depth limit reached (max: ${options.maxDepth})`
      });
      continue;
    }

    // Check count limit
    if (options.currentCount >= options.maxCount) {
      placeholders.push({
        type: 'IFRAME_PLACEHOLDER',
        reason: 'IFRAME_COUNT_LIMIT',
        src: iframeInfo.src,
        message: `Iframe count limit reached (max: ${options.maxCount})`
      });
      continue;
    }

    // Check if iframe is accessible
    if (!iframeInfo.accessible || iframeInfo.crossOrigin) {
      placeholders.push({
        type: 'IFRAME_PLACEHOLDER',
        reason: 'CROSS_ORIGIN_IFRAME',
        src: iframeInfo.src,
        message: `Cannot access cross-origin iframe: ${iframeInfo.src}`
      });
      continue;
    }

    // Accessible iframe - process it
    options.currentCount++;
    callback(iframeInfo, options.currentDepth);

    // Recursively traverse nested iframes
    if (iframeInfo.document) {
      const nestedPlaceholders = traverseIframes(
        iframeInfo.document,
        {
          ...options,
          currentDepth: options.currentDepth + 1
        },
        callback
      );
      placeholders.push(...nestedPlaceholders);
    }
  }

  return placeholders;
}

/**
 * Get all accessible iframe documents
 *
 * @param root - Root document
 * @param maxDepth - Maximum depth
 * @param maxCount - Maximum count
 * @returns Array of iframe documents with metadata
 */
export function getAccessibleIframeDocuments(
  root: Document = document,
  maxDepth: number = 3,
  maxCount: number = 15
): Array<{ document: Document; depth: number; src: string }> {
  const documents: Array<{ document: Document; depth: number; src: string }> = [];
  const placeholders: IframePlaceholder[] = [];

  const options: IframeTraversalOptions = {
    maxDepth,
    maxCount,
    currentDepth: 0,
    currentCount: 0
  };

  traverseIframes(
    root,
    options,
    (iframeInfo, depth) => {
      if (iframeInfo.document) {
        documents.push({
          document: iframeInfo.document,
          depth: depth + 1,
          src: iframeInfo.src
        });
      }
    }
  );

  return documents;
}

/**
 * Create placeholder element for cross-origin iframe
 *
 * @param iframe - Iframe element
 * @param reason - Reason for placeholder
 * @returns Placeholder description
 */
export function createIframePlaceholder(
  iframe: HTMLIFrameElement,
  reason: IframePlaceholder['reason']
): IframePlaceholder {
  const messages = {
    CROSS_ORIGIN_IFRAME: `Cannot access cross-origin iframe: ${iframe.src}`,
    IFRAME_DEPTH_LIMIT: `Iframe depth limit reached`,
    IFRAME_COUNT_LIMIT: `Iframe count limit reached`
  };

  return {
    type: 'IFRAME_PLACEHOLDER',
    reason,
    src: iframe.src || '',
    message: messages[reason]
  };
}

/**
 * Get iframe count in a document tree
 *
 * @param root - Root document
 * @param maxDepth - Maximum depth to search
 * @returns Total iframe count
 */
export function getIframeCount(root: Document = document, maxDepth: number = 3): number {
  let count = 0;

  const options: IframeTraversalOptions = {
    maxDepth,
    maxCount: Infinity,
    currentDepth: 0,
    currentCount: 0
  };

  traverseIframes(
    root,
    options,
    () => {
      count++;
    }
  );

  return count;
}
