/**
 * Content script injected into web pages
 * Provides DOM access and page interaction capabilities
 */

import { MessageRouter, MessageType } from '../core/MessageRouter';
import { handleDOMCaptureRequest } from './domCaptureHandler';
import type { DOMCaptureRequestMessage, DOMCaptureResponseMessage } from '../types/domMessages';
import { captureInteractionContent } from '../tools/dom/interactionCapture';
import type { CaptureRequest } from '../tools/dom/pageModel';

// Router instance
let router: MessageRouter | null = null;

/**
 * Page context information
 */
interface PageContext {
  url: string;
  title: string;
  domain: string;
  protocol: string;
  pathname: string;
  search: string;
  hash: string;
  viewport: {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
  };
  metadata: Record<string, string>;
}

/**
 * Initialize content script
 */
function initialize(): void {
  console.log('[Codex] Content script initialized');

  // Create message router
  router = new MessageRouter('content');

  // Setup message handlers
  setupMessageHandlers();

  // Setup DOM observers
  setupDOMObservers();

  // Setup interaction handlers
  setupInteractionHandlers();

  // Announce presence to background
  announcePresence();
}

/**
 * Setup message handlers
 */
function setupMessageHandlers(): void {
  if (!router) return;

  // Handle ping (for checking if content script is loaded)
  router.on(MessageType.PING, () => {
    return {
      type: MessageType.PONG,
      timestamp: Date.now(),
      initLevel: getInitLevel(),
      readyState: document.readyState,
      version: '1.0.0',
      capabilities: ['dom', 'events', 'forms', 'accessibility'],
    };
  });

  // Handle tab commands
  router.on(MessageType.TAB_COMMAND, async (message) => {
    const { command, args } = message.payload;
    return executeCommand(command, args);
  });

  // Handle tool execution for DOM tools (legacy)
  router.on(MessageType.TOOL_EXECUTE, async (message) => {
    const { toolName, args } = message.payload;
    return executeDOMTool(toolName, args);
  });

  // Handle DOM operations (new unified handler)
  router.on(MessageType.DOM_ACTION, async (message) => {
    try {
      const result = await executeDOMAction(message);
      return {
        success: true,
        data: result,
        requestId: message.id,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId: message.id,
      };
    }
  });

  // Handle DOM queries
  router.on(MessageType.TAB_COMMAND, async (message) => {
    if (message.payload.command === 'query') {
      return queryDOM(message.payload.args);
    }
  });

  // Handle page isolation events
  router.on(MessageType.TAB_COMMAND, async (message) => {
    if (message.payload.command === 'isolate') {
      return setupPageIsolation(message.payload.args);
    }
  });

  // Handle DOM Capture requests (v2.0)
  // Note: Message is sent with frameId: 0, so only main frame receives it
  router.on(MessageType.DOM_CAPTURE_REQUEST, async (message) => {
    console.log('[DOM Capture] Processing request in main frame');
    try {
      const requestMessage = message.payload as DOMCaptureRequestMessage;

      // Convert request options to content-compatible format
      const contentOptions = {
        includeShadowDOM: requestMessage.options.include_shadow_dom,
        includeIframes: requestMessage.options.include_iframes,
        maxIframeDepth: requestMessage.options.max_iframe_depth,
        maxIframeCount: requestMessage.options.max_iframe_count,
        skipHiddenElements: requestMessage.options.bbox_filtering,
      };

      // Call DOM capture handler
      const captureResult = handleDOMCaptureRequest(contentOptions);

      // Build response message
      const response: DOMCaptureResponseMessage = {
        type: 'DOM_CAPTURE_RESPONSE',
        request_id: requestMessage.request_id,
        success: true,
        snapshot: captureResult.snapshot,
        viewport: captureResult.viewport,
        timing: captureResult.timing,
      };

      console.log('[DOM Capture] Returning response with snapshot:', response.snapshot !== undefined);
      return response;
    } catch (error) {
      // Build error response
      console.error('error during dom capture', error);
      const errorResponse: DOMCaptureResponseMessage = {
        type: 'DOM_CAPTURE_RESPONSE',
        request_id: (message.payload as DOMCaptureRequestMessage).request_id,
        success: false,
        error: {
          code: 'CAPTURE_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error during DOM capture',
          details: {
            stack: error instanceof Error ? error.stack : undefined,
          },
        },
      };

      return errorResponse;
    }
  });

}

/**
 * Capture interaction content directly in the page context
 * This runs in the content script where DOMParser is available
 */
async function captureInteractionContentInPage(options: CaptureRequest) {
  try {
    // Get the current page HTML
    const html = document.documentElement.outerHTML;

    // Call the capture function with live document
    const pageModel = await captureInteractionContent(html, {
      ...options,
      baseUrl: options.baseUrl || window.location.href
    });

    return pageModel;
  } catch (error) {
    console.error('[Content Script] Failed to capture interaction content:', error);
    throw error;
  }
}

/**
 * Execute command on the page
 */
function executeCommand(command: string, args?: any): any {
  switch (command) {
    case 'get-context':
      return getPageContext();

    case 'get-page-html':
      return {
        html: document.documentElement.outerHTML,
        success: true
      };

    case 'capture-interaction-content':
      return captureInteractionContentInPage(args);

    case 'select':
      return selectElements(args.selector);

    case 'click':
      return clickElement(args.selector);

    case 'type':
      return typeInElement(args.selector, args.text);

    case 'extract':
      return extractData(args.selector, args.attributes);

    case 'screenshot-element':
      return screenshotElement(args.selector);

    case 'highlight':
      return highlightElements(args.selector, args.style);

    case 'remove-highlight':
      return removeHighlights();

    case 'scroll-to':
      return scrollToElement(args.selector);

    case 'get-form-data':
      return getFormData(args.selector);

    case 'fill-form':
      return fillForm(args.selector, args.data);

    case 'observe':
      return observeElement(args.selector, args.options);

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

/**
 * Get page context information
 */
function getPageContext(): PageContext {
  const location = window.location;
  
  // Extract metadata
  const metadata: Record<string, string> = {};
  
  // Get meta tags
  document.querySelectorAll('meta').forEach(meta => {
    const name = meta.getAttribute('name') || meta.getAttribute('property');
    const content = meta.getAttribute('content');
    if (name && content) {
      metadata[name] = content;
    }
  });
  
  return {
    url: location.href,
    title: document.title,
    domain: location.hostname,
    protocol: location.protocol,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
    },
    metadata,
  };
}

/**
 * Select elements on the page
 */
function selectElements(selector: string): any[] {
  const elements = document.querySelectorAll(selector);
  return Array.from(elements).map(el => ({
    tagName: el.tagName.toLowerCase(),
    id: el.id,
    className: el.className,
    text: (el as HTMLElement).innerText?.substring(0, 100),
    attributes: getElementAttributes(el),
  }));
}

/**
 * Click an element
 */
function clickElement(selector: string): boolean {
  const element = document.querySelector(selector) as HTMLElement;
  if (element) {
    element.click();
    return true;
  }
  return false;
}

/**
 * Type text into an element
 */
function typeInElement(selector: string, text: string): boolean {
  const element = document.querySelector(selector) as HTMLInputElement;
  if (element) {
    element.focus();
    element.value = text;
    
    // Trigger input events
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    
    return true;
  }
  return false;
}

/**
 * Extract data from elements
 */
function extractData(
  selector: string,
  attributes?: string[]
): any[] {
  const elements = document.querySelectorAll(selector);
  return Array.from(elements).map(el => {
    const data: any = {
      text: (el as HTMLElement).innerText,
    };
    
    if (attributes) {
      attributes.forEach(attr => {
        data[attr] = el.getAttribute(attr);
      });
    } else {
      // Get all attributes
      data.attributes = getElementAttributes(el);
    }
    
    return data;
  });
}

/**
 * Get element attributes
 */
function getElementAttributes(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    attrs[attr.name] = attr.value;
  }
  return attrs;
}

/**
 * Take screenshot of element
 */
async function screenshotElement(selector: string): Promise<string | null> {
  const element = document.querySelector(selector) as HTMLElement;
  if (!element) return null;
  
  // Get element bounds
  const rect = element.getBoundingClientRect();
  
  // Return bounds for background script to capture
  return JSON.stringify({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

/**
 * Highlight elements on the page
 */
function highlightElements(
  selector: string,
  style?: Partial<CSSStyleDeclaration>
): number {
  const elements = document.querySelectorAll(selector);
  let count = 0;
  
  elements.forEach(el => {
    const htmlEl = el as HTMLElement;
    
    // Store original style
    htmlEl.setAttribute('data-codex-original-style', htmlEl.getAttribute('style') || '');
    
    // Apply highlight
    htmlEl.style.outline = style?.outline || '2px solid red';
    htmlEl.style.backgroundColor = style?.backgroundColor || 'rgba(255, 255, 0, 0.3)';
    htmlEl.classList.add('codex-highlighted');
    
    count++;
  });
  
  return count;
}

/**
 * Remove all highlights
 */
function removeHighlights(): number {
  const elements = document.querySelectorAll('.codex-highlighted');
  let count = 0;
  
  elements.forEach(el => {
    const htmlEl = el as HTMLElement;
    
    // Restore original style
    const originalStyle = htmlEl.getAttribute('data-codex-original-style');
    if (originalStyle) {
      htmlEl.setAttribute('style', originalStyle);
    } else {
      htmlEl.removeAttribute('style');
    }
    
    htmlEl.removeAttribute('data-codex-original-style');
    htmlEl.classList.remove('codex-highlighted');
    
    count++;
  });
  
  return count;
}

/**
 * Scroll to element
 */
function scrollToElement(selector: string): boolean {
  const element = document.querySelector(selector);
  if (element) {
    element.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    return true;
  }
  return false;
}

/**
 * Get form data
 */
function getFormData(selector: string): Record<string, any> | null {
  const form = document.querySelector(selector) as HTMLFormElement;
  if (!form) return null;
  
  const formData = new FormData(form);
  const data: Record<string, any> = {};
  
  formData.forEach((value, key) => {
    if (data[key]) {
      // Handle multiple values
      if (!Array.isArray(data[key])) {
        data[key] = [data[key]];
      }
      data[key].push(value);
    } else {
      data[key] = value;
    }
  });
  
  return data;
}

/**
 * Fill form with data
 */
function fillForm(
  selector: string,
  data: Record<string, any>
): boolean {
  const form = document.querySelector(selector) as HTMLFormElement;
  if (!form) return false;
  
  for (const [name, value] of Object.entries(data)) {
    const input = form.elements.namedItem(name) as HTMLInputElement;
    if (input) {
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.checked = Boolean(value);
      } else {
        input.value = String(value);
      }
      
      // Trigger events
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  
  return true;
}

/**
 * Query DOM with complex selectors
 */
function queryDOM(args: {
  selector?: string;
  xpath?: string;
  text?: string;
  regex?: string;
}): any[] {
  let elements: Element[] = [];
  
  if (args.selector) {
    elements = Array.from(document.querySelectorAll(args.selector));
  } else if (args.xpath) {
    const result = document.evaluate(
      args.xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    
    for (let i = 0; i < result.snapshotLength; i++) {
      const node = result.snapshotItem(i);
      if (node && node.nodeType === Node.ELEMENT_NODE) {
        elements.push(node as Element);
      }
    }
  } else if (args.text) {
    // Find elements containing text
    const allElements = document.querySelectorAll('*');
    elements = Array.from(allElements).filter(el => {
      return (el as HTMLElement).innerText?.includes(args.text!);
    });
  }
  
  // Apply regex filter if provided
  if (args.regex && elements.length > 0) {
    const regex = new RegExp(args.regex);
    elements = elements.filter(el => {
      return regex.test((el as HTMLElement).innerText || '');
    });
  }
  
  return elements.map(el => ({
    tagName: el.tagName.toLowerCase(),
    id: el.id,
    className: el.className,
    text: (el as HTMLElement).innerText?.substring(0, 100),
  }));
}

/**
 * Setup DOM mutation observers
 */
function setupDOMObservers(): void {
  const observers: Map<string, MutationObserver> = new Map();
  
  // Store observers for cleanup
  (window as any).__codexObservers = observers;
}

/**
 * Observe element changes
 */
function observeElement(
  selector: string,
  options?: MutationObserverInit
): boolean {
  const element = document.querySelector(selector);
  if (!element) return false;
  
  const observers = (window as any).__codexObservers as Map<string, MutationObserver>;
  
  // Stop existing observer for this selector
  if (observers.has(selector)) {
    observers.get(selector)!.disconnect();
  }
  
  // Create new observer
  const observer = new MutationObserver((mutations) => {
    // Send mutations to background
    if (router) {
      router.send(MessageType.TAB_RESULT, {
        type: 'mutation',
        selector,
        mutations: mutations.map(m => ({
          type: m.type,
          target: (m.target as Element).tagName?.toLowerCase(),
          addedNodes: m.addedNodes.length,
          removedNodes: m.removedNodes.length,
        })),
      });
    }
  });
  
  observer.observe(element, options || {
    childList: true,
    attributes: true,
    subtree: true,
  });
  
  observers.set(selector, observer);
  return true;
}

/**
 * Setup interaction handlers
 */
function setupInteractionHandlers(): void {
  // Track user interactions
  let lastInteraction: any = null;
  
  // Click tracking
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    lastInteraction = {
      type: 'click',
      target: getElementSelector(target),
      timestamp: Date.now(),
    };
  }, true);
  
  // Input tracking
  document.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    lastInteraction = {
      type: 'input',
      target: getElementSelector(target),
      value: target.value,
      timestamp: Date.now(),
    };
  }, true);
  
  // Store for access
  (window as any).__codexLastInteraction = () => lastInteraction;
}

/**
 * Get unique selector for element
 */
function getElementSelector(element: Element): string {
  if (element.id) {
    return `#${element.id}`;
  }
  
  const path: string[] = [];
  let current: Element | null = element;
  
  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase();
    
    if (current.className) {
      selector += `.${Array.from(current.classList).join('.')}`;
    }
    
    // Add nth-child if needed
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(current);
      if (siblings.filter(s => s.tagName === current!.tagName).length > 1) {
        selector += `:nth-child(${index + 1})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

/**
 * Execute DOM action (new unified handler for all 25 operations)
 */
async function executeDOMAction(message: any): Promise<any> {
  const { action, selector, xpath, text, attribute, property, value, formData, formSelector, sequence, options } = message;

  switch (action) {
    // Element query operations
    case 'query':
      if (!selector) throw new Error('Selector is required for query action');
      return {
        elements: selectElements(selector),
        count: selectElements(selector).length,
      };

    case 'findByXPath':
      if (!xpath) throw new Error('XPath is required for findByXPath action');
      return {
        elements: queryDOM({ xpath }),
        count: queryDOM({ xpath }).length,
      };

    // Element interaction operations
    case 'click':
      if (!selector) throw new Error('Selector is required for click action');
      const clicked = clickElement(selector);
      return {
        success: clicked,
        element: clicked ? selectElements(selector)[0] : null,
      };

    case 'hover':
      if (!selector) throw new Error('Selector is required for hover action');
      const element = document.querySelector(selector) as HTMLElement;
      if (!element) throw new Error(`Element not found: ${selector}`);

      // Dispatch mouse events for hover
      element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
      element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));

      return {
        success: true,
        element: selectElements(selector)[0],
      };

    case 'type':
      if (!selector) throw new Error('Selector is required for type action');
      if (!text) throw new Error('Text is required for type action');
      const typed = typeInElement(selector, text);
      const typedElement = document.querySelector(selector) as HTMLInputElement;
      return {
        success: typed,
        element: typed ? selectElements(selector)[0] : null,
        finalValue: typedElement?.value,
      };

    case 'focus':
      if (!selector) throw new Error('Selector is required for focus action');
      const focusElement = document.querySelector(selector) as HTMLElement;
      if (!focusElement) throw new Error(`Element not found: ${selector}`);
      focusElement.focus();
      return {
        success: true,
        element: selectElements(selector)[0],
      };

    case 'scroll':
      if (!selector) throw new Error('Selector is required for scroll action');
      const scrolled = scrollToElement(selector);
      return {
        success: scrolled,
        element: scrolled ? selectElements(selector)[0] : null,
      };

    // Attribute operations
    case 'getAttribute':
      if (!selector) throw new Error('Selector is required for getAttribute action');
      if (!attribute) throw new Error('Attribute name is required for getAttribute action');
      const attrElement = document.querySelector(selector);
      if (!attrElement) throw new Error(`Element not found: ${selector}`);
      return {
        value: attrElement.getAttribute(attribute),
        element: selectElements(selector)[0],
      };

    case 'setAttribute':
      if (!selector) throw new Error('Selector is required for setAttribute action');
      if (!attribute) throw new Error('Attribute name is required for setAttribute action');
      if (value === undefined) throw new Error('Value is required for setAttribute action');
      const setAttrElement = document.querySelector(selector);
      if (!setAttrElement) throw new Error(`Element not found: ${selector}`);
      setAttrElement.setAttribute(attribute, value);
      return {
        success: true,
        element: selectElements(selector)[0],
      };

    case 'getProperty':
      if (!selector) throw new Error('Selector is required for getProperty action');
      if (!property) throw new Error('Property name is required for getProperty action');
      const getPropElement = document.querySelector(selector) as any;
      if (!getPropElement) throw new Error(`Element not found: ${selector}`);
      return {
        value: getPropElement[property],
        element: selectElements(selector)[0],
      };

    case 'setProperty':
      if (!selector) throw new Error('Selector is required for setProperty action');
      if (!property) throw new Error('Property name is required for setProperty action');
      if (value === undefined) throw new Error('Value is required for setProperty action');
      const setPropElement = document.querySelector(selector) as any;
      if (!setPropElement) throw new Error(`Element not found: ${selector}`);
      setPropElement[property] = value;
      return {
        success: true,
        element: selectElements(selector)[0],
      };

    // Content operations
    case 'getText':
      if (!selector) throw new Error('Selector is required for getText action');
      const textElement = document.querySelector(selector) as HTMLElement;
      if (!textElement) throw new Error(`Element not found: ${selector}`);
      return {
        text: textElement.innerText || textElement.textContent,
        element: selectElements(selector)[0],
      };

    case 'getHtml':
      if (!selector) throw new Error('Selector is required for getHtml action');
      const htmlElement = document.querySelector(selector) as HTMLElement;
      if (!htmlElement) throw new Error(`Element not found: ${selector}`);
      return {
        html: htmlElement.innerHTML,
        element: selectElements(selector)[0],
      };

    case 'extractLinks':
      const linkSelector = selector || 'a[href]';
      const links = Array.from(document.querySelectorAll(linkSelector)).map(link => ({
        text: (link as HTMLElement).innerText,
        href: link.getAttribute('href') || '',
        title: link.getAttribute('title') || undefined,
      }));
      return {
        links,
        count: links.length,
      };

    // Form operations
    case 'fillForm':
      if (!formData) throw new Error('Form data is required for fillForm action');
      const filled = fillForm(formSelector || 'form', formData);
      return {
        success: filled,
        fieldsSet: Object.keys(formData).length,
        errors: [],
      };

    case 'submit':
    case 'submitForm':
      if (!selector) throw new Error('Selector is required for submit action');
      const submitElement = document.querySelector(selector) as HTMLFormElement;
      if (!submitElement) throw new Error(`Form not found: ${selector}`);
      submitElement.submit();
      return {
        success: true,
        element: selectElements(selector)[0],
      };

    // Advanced operations
    case 'captureSnapshot':
      // Return serialized DOM tree
      return {
        snapshot: {
          html: document.documentElement.outerHTML,
          url: window.location.href,
          title: document.title,
        },
      };

    case 'getAccessibilityTree':
      // Build simplified accessibility tree
      const buildA11yTree = (element: Element): any => {
        return {
          role: element.getAttribute('role') || element.tagName.toLowerCase(),
          name: element.getAttribute('aria-label') || (element as HTMLElement).innerText?.substring(0, 50),
          children: Array.from(element.children).slice(0, 10).map(buildA11yTree),
        };
      };
      return {
        tree: [buildA11yTree(document.body)],
        count: 1,
      };

    case 'getPaintOrder':
      // Return elements in paint order (simplified)
      const allElements = Array.from(document.querySelectorAll('*'));
      const paintOrder = allElements.slice(0, 100).map(el => ({
        tagName: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: el.className || undefined,
        zIndex: window.getComputedStyle(el as Element).zIndex,
      }));
      return {
        order: paintOrder,
        count: paintOrder.length,
      };

    case 'detectClickable':
      // Detect clickable elements
      const clickableSelectors = 'a, button, input[type="button"], input[type="submit"], [onclick], [role="button"]';
      const clickableElements = Array.from(document.querySelectorAll(clickableSelectors)).map(el => ({
        tagName: el.tagName.toLowerCase(),
        id: el.id || undefined,
        className: el.className || undefined,
        text: (el as HTMLElement).innerText?.substring(0, 50),
      }));
      return {
        clickable: clickableElements,
        count: clickableElements.length,
      };

    case 'waitForElement':
      if (!selector) throw new Error('Selector is required for waitForElement action');
      const timeout = options?.timeout || 5000;
      const startTime = Date.now();

      while (Date.now() - startTime < timeout) {
        const waitElement = document.querySelector(selector);
        if (waitElement) {
          return {
            success: true,
            element: selectElements(selector)[0],
          };
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      throw new Error(`Element not found within ${timeout}ms: ${selector}`);

    case 'checkVisibility':
      if (!selector) throw new Error('Selector is required for checkVisibility action');
      const visElement = document.querySelector(selector) as HTMLElement;
      if (!visElement) throw new Error(`Element not found: ${selector}`);

      const rect = visElement.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0 &&
                       window.getComputedStyle(visElement).display !== 'none' &&
                       window.getComputedStyle(visElement).visibility !== 'hidden';

      return {
        visible: isVisible,
        element: selectElements(selector)[0],
      };

    case 'executeSequence':
      if (!sequence || !Array.isArray(sequence)) {
        throw new Error('Sequence array is required for executeSequence action');
      }

      const results = [];
      for (const op of sequence) {
        try {
          const result = await executeDOMAction({ ...op, id: message.id });
          results.push(result);
        } catch (error) {
          results.push({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          if (options?.force !== true) {
            break;
          }
        }
      }

      return {
        sequence: results,
        count: results.length,
      };

    default:
      throw new Error(`Unknown DOM action: ${action}`);
  }
}

/**
 * Execute DOM tool
 */
async function executeDOMTool(toolName: string, args: any): Promise<any> {
  try {
    switch (toolName) {
      case 'dom_query':
        return selectElements(args.selector || args.query);

      case 'dom_click':
        return clickElement(args.selector);

      case 'dom_type':
        return typeInElement(args.selector, args.text);

      case 'dom_extract':
        return extractData(args.selector, args.attributes);

      case 'dom_highlight':
        return highlightElements(args.selector, args.style);

      case 'dom_scroll':
        return scrollToElement(args.selector);

      case 'dom_form_fill':
        return fillForm(args.selector, args.data);

      case 'dom_form_data':
        return getFormData(args.selector);

      case 'dom_screenshot':
        return screenshotElement(args.selector);

      case 'dom_observe':
        return observeElement(args.selector, args.options);

      case 'dom_context':
        return getPageContext();

      default:
        throw new Error(`Unknown DOM tool: ${toolName}`);
    }
  } catch (error) {
    // Send error back to background
    if (router) {
      await router.sendToolError(error instanceof Error ? error.message : 'Unknown error');
    }
    throw error;
  }
}

/**
 * Setup page isolation
 * NOTE: Disabled due to CSP violations in Chrome extensions
 * Inline script injection is blocked by Content Security Policy
 */
function setupPageIsolation(args: any): boolean {
  console.warn('[Codex] setupPageIsolation is disabled due to CSP restrictions');
  console.warn('[Codex] Alternative: Use window.postMessage for page context communication');
  return false;
}

/**
 * Announce presence to background script
 */
function announcePresence(): void {
  if (!router) return;

  // Send initial context
  router.send(MessageType.TAB_RESULT, {
    type: 'content-script-ready',
    context: getPageContext(),
  }).catch(() => {
    // Ignore connection errors on initial announcement
  });

  // Also send tool registration info
  const availableTools = [
    'dom_query',
    'dom_click',
    'dom_type',
    'dom_extract',
    'dom_highlight',
    'dom_scroll',
    'dom_form_fill',
    'dom_form_data',
    'dom_screenshot',
    'dom_observe',
    'dom_context'
  ];

  router.send(MessageType.TOOL_RESULT, {
    type: 'tools-available',
    tools: availableTools,
    tabId: getTabId()
  }).catch(() => {
    // Ignore connection errors
  });
}

/**
 * Get current tab ID if available
 */
function getTabId(): number | undefined {
  // This would typically be injected by the background script
  return (window as any).__codexTabId;
}

/**
 * Cleanup on page hide (replaces deprecated 'unload' event)
 * Uses 'pagehide' which is the modern replacement for 'unload'
 * and is not blocked by Permissions Policy
 */
window.addEventListener('pagehide', () => {
  // Disconnect observers
  const observers = (window as any).__codexObservers as Map<string, MutationObserver>;
  if (observers) {
    observers.forEach(observer => observer.disconnect());
    observers.clear();
  }

  // Clean up router
  if (router) {
    router.cleanup();
  }
});

// Initialize content script
initialize();

// NOTE: Enhancement script injection is DISABLED due to CSP violations
// Content Security Policy blocks inline script execution in Chrome extensions
//
// If page-context utilities are needed, use one of these alternatives:
// 1. Use window.postMessage to communicate with injected scripts
// 2. Create a separate .js file and inject via chrome.scripting.executeScript
// 3. Implement utilities directly in content script context (preferred)
//
// function injectEnhancementScripts(): void {
//   const enhancementScript = document.createElement('script');
//   enhancementScript.textContent = `...`;  // ← BLOCKED BY CSP
//   document.head.appendChild(enhancementScript);
// }
// injectEnhancementScripts();  // ← DISABLED

/**
 * Get content script initialization level
 */
function getInitLevel(): number {
  // 0: NOT_INJECTED (shouldn't happen if this code is running)
  // 1: INJECTED (script loaded but not initialized)
  // 2: HANDLERS_READY (message handlers registered)
  // 3: DOM_READY (DOM is ready for manipulation)
  // 4: FULLY_READY (all features initialized)

  if (!router) return 1;
  if (document.readyState === 'loading') return 2;
  if (document.readyState === 'interactive') return 3;
  return 4; // complete
}

// Export for testing
export { getPageContext, selectElements, executeCommand, executeDOMTool };
