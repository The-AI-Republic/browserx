/**
 * ContextNavigator - Handles iframe and shadow DOM traversal
 * Enables cross-context element location and action execution
 */

import type { ElementContext, ActionError } from '../../types/page-actions';

export class ContextNavigator {
  /**
   * Navigate to the target context (iframe or shadow DOM)
   * @param context Element context specification
   * @returns Document or ShadowRoot in the target context
   */
  async navigateToContext(
    context?: ElementContext
  ): Promise<Document | ShadowRoot> {
    // No context means main document
    if (!context || context.iframeDepth === 0) {
      return document;
    }

    let currentDocument: Document | null = document;

    // Traverse iframe path
    if (context.iframeDepth > 0 && context.iframePath.length > 0) {
      currentDocument = await this.traverseIframes(context.iframePath);

      if (!currentDocument) {
        throw this.createError(
          'ELEMENT_NOT_FOUND',
          `Failed to navigate to iframe at depth ${context.iframeDepth}`,
          false
        );
      }
    }

    // Traverse shadow DOM path if specified
    if (context.shadowDomPath.length > 0) {
      return this.traverseShadowDOM(currentDocument, context.shadowDomPath);
    }

    return currentDocument;
  }

  /**
   * Traverse through nested iframes
   * @param iframePath Array of iframe selectors from root to target
   * @returns Document in the target iframe
   */
  private async traverseIframes(iframePath: string[]): Promise<Document | null> {
    let currentWindow: Window = window;

    for (let i = 0; i < iframePath.length; i++) {
      const iframeSelector = iframePath[i];

      try {
        const iframe = currentWindow.document.querySelector(iframeSelector);

        if (!iframe || !(iframe instanceof HTMLIFrameElement)) {
          console.error(`[ContextNavigator] Iframe not found: ${iframeSelector}`);
          return null;
        }

        const iframeWindow = iframe.contentWindow;
        if (!iframeWindow) {
          console.error(`[ContextNavigator] Cannot access iframe content window: ${iframeSelector}`);

          // Check if it's a cross-origin issue
          try {
            // This will throw if cross-origin
            const _test = iframe.contentDocument;
          } catch (crossOriginError) {
            throw this.createError(
              'CROSS_ORIGIN_DENIED',
              `Cannot access cross-origin iframe: ${iframeSelector}`,
              false
            );
          }

          return null;
        }

        currentWindow = iframeWindow;
      } catch (error) {
        console.error(`[ContextNavigator] Error traversing iframe ${iframeSelector}:`, error);

        // Check if it's a cross-origin security error
        if (error instanceof DOMException && error.name === 'SecurityError') {
          throw this.createError(
            'CROSS_ORIGIN_DENIED',
            `Cross-origin access denied for iframe: ${iframeSelector}`,
            false
          );
        }

        throw error;
      }
    }

    return currentWindow.document;
  }

  /**
   * Traverse through shadow DOM hierarchy
   * @param root Starting document or shadow root
   * @param shadowDomPath Array of shadow host selectors
   * @returns ShadowRoot at the target location
   */
  private traverseShadowDOM(
    root: Document | ShadowRoot,
    shadowDomPath: string[]
  ): ShadowRoot {
    let currentRoot: Document | ShadowRoot = root;

    for (const hostSelector of shadowDomPath) {
      const host = currentRoot.querySelector(hostSelector);

      if (!host) {
        throw this.createError(
          'ELEMENT_NOT_FOUND',
          `Shadow host not found: ${hostSelector}`,
          false
        );
      }

      if (!(host instanceof Element) || !host.shadowRoot) {
        throw this.createError(
          'ELEMENT_NOT_FOUND',
          `Element does not have a shadow root: ${hostSelector}`,
          false
        );
      }

      currentRoot = host.shadowRoot;
    }

    return currentRoot as ShadowRoot;
  }

  /**
   * Check if an iframe is same-origin (accessible)
   * @param iframe The iframe element
   * @returns true if same-origin and accessible
   */
  isSameOriginIframe(iframe: HTMLIFrameElement): boolean {
    try {
      // Try to access contentDocument - will throw if cross-origin
      const doc = iframe.contentDocument;
      return doc !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get frame ID from iframe element (for Chrome DevTools Protocol)
   * @param iframe The iframe element
   * @returns Frame ID or undefined
   */
  getFrameId(iframe: HTMLIFrameElement): number | undefined {
    // This would typically use Chrome DevTools Protocol
    // For now, return undefined as placeholder
    // TODO: Integrate with CDP to get actual frame ID
    return undefined;
  }

  /**
   * Check if element is inside an iframe
   * @param element The element to check
   * @returns true if element is in iframe context
   */
  isInIframe(element: Element): boolean {
    // Check if window is available (not in service worker context)
    if (typeof window === 'undefined') {
      return false;
    }
    return window !== window.top;
  }

  /**
   * Check if element is inside a shadow DOM
   * @param element The element to check
   * @returns true if element is in shadow DOM
   */
  isInShadowDOM(element: Element): boolean {
    let current: Node | null = element;

    while (current) {
      if (current instanceof ShadowRoot) {
        return true;
      }
      current = current.parentNode;
    }

    return false;
  }

  /**
   * Get iframe depth for current context
   * @returns Number of iframe levels deep (0 = main frame)
   */
  getIframeDepth(): number {
    let depth = 0;
    let currentWindow = window;

    while (currentWindow !== currentWindow.top) {
      depth++;
      currentWindow = currentWindow.parent;

      // Safety check to prevent infinite loop
      if (depth > 10) {
        console.warn('[ContextNavigator] Maximum iframe depth exceeded');
        break;
      }
    }

    return depth;
  }

  /**
   * Create an ActionError
   */
  private createError(
    code: string,
    message: string,
    recoverable: boolean = false
  ): ActionError {
    return {
      code: code as any,
      message,
      category: 'element_location',
      recoverable,
      suggestion: this.getSuggestion(code as any)
    };
  }

  /**
   * Get suggestion for error code
   */
  private getSuggestion(code: string): string {
    switch (code) {
      case 'CROSS_ORIGIN_DENIED':
        return 'Cannot access cross-origin iframe due to browser security restrictions. Ensure iframe is same-origin or has appropriate permissions.';
      case 'ELEMENT_NOT_FOUND':
        return 'Element not found in specified context. Verify selector path and ensure element exists.';
      default:
        return 'Check element context and try again.';
    }
  }
}
