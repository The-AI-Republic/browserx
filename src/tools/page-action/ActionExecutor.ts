/**
 * ActionExecutor - Concrete implementations for action execution
 * Contains ClickExecutor, InputExecutor, ScrollExecutor, and VerifyExecutor
 */

import type {
  ActionCommand,
  ActionExecutionResult,
  ClickParameters,
  InputParameters,
  ScrollParameters,
  VerifyParameters,
  DetectedChanges
} from '../../types/page-actions';
import { ElementLocator } from './ElementLocator';
import { ContextNavigator } from './ContextNavigator';

/**
 * ClickExecutor - Handles click action execution
 */
export class ClickExecutor {
  private elementLocator: ElementLocator;
  private contextNavigator: ContextNavigator;

  constructor() {
    this.elementLocator = new ElementLocator();
    this.contextNavigator = new ContextNavigator();
  }

  /**
   * Execute click action
   */
  async execute(action: ActionCommand): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const parameters = action.parameters as ClickParameters;

    console.log('[ClickExecutor] Executing click action', action.targetElement);

    try {
      // Navigate to target context (iframe/shadow DOM)
      const targetContext = await this.contextNavigator.navigateToContext(
        action.targetElement.context
      );

      // Locate element
      const element = await this.elementLocator.locateElement(action.targetElement);

      if (!element) {
        throw new Error('Element not found');
      }

      // Validate element is interactable
      this.elementLocator.validateInteractability(element);

      // Setup change detection
      const beforeState = this.captureBeforeState();

      // Perform click
      await this.performClick(element, parameters);

      // Detect changes
      const detectedChanges = await this.detectChanges(
        beforeState,
        parameters.waitForNavigation
      );

      const duration = Date.now() - startTime;

      return {
        success: true,
        actionCommand: action,
        timestamp: new Date().toISOString(),
        duration,
        attemptsCount: 1,
        detectedChanges
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        actionCommand: action,
        timestamp: new Date().toISOString(),
        duration,
        attemptsCount: 1,
        detectedChanges: {
          navigationOccurred: false,
          domMutations: 0,
          scrollPositionChanged: false,
          valueChanged: false
        },
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          category: 'execution',
          recoverable: false
        }
      };
    }
  }

  /**
   * Perform the actual click operation
   */
  private async performClick(
    element: Element,
    parameters: ClickParameters
  ): Promise<void> {
    const htmlElement = element as HTMLElement;

    // Apply modifiers if specified
    const modifierState = this.createModifierState(parameters.modifiers);

    // Determine click type
    const clickType = parameters.clickType || 'left';

    switch (clickType) {
      case 'left':
        // Use native click() for best compatibility
        htmlElement.click();
        break;

      case 'double':
        // Double click requires dispatching events
        this.dispatchClickEvent(htmlElement, 'dblclick', modifierState);
        break;

      case 'right':
        // Right click (context menu)
        this.dispatchClickEvent(htmlElement, 'contextmenu', modifierState);
        break;

      case 'middle':
        // Middle click
        this.dispatchMouseEvent(htmlElement, 'click', { ...modifierState, button: 1 });
        break;
    }

    // Wait for navigation if requested
    if (parameters.waitForNavigation) {
      await this.waitForNavigation();
    }
  }

  /**
   * Dispatch click event with modifiers
   */
  private dispatchClickEvent(
    element: HTMLElement,
    eventType: string,
    modifiers: any
  ): void {
    const event = new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
      ...modifiers
    });

    element.dispatchEvent(event);
  }

  /**
   * Dispatch mouse event with custom options
   */
  private dispatchMouseEvent(
    element: HTMLElement,
    eventType: string,
    options: any
  ): void {
    const event = new MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: window,
      ...options
    });

    element.dispatchEvent(event);
  }

  /**
   * Create modifier state object for mouse events
   */
  private createModifierState(modifiers?: string[]): any {
    return {
      ctrlKey: modifiers?.includes('ctrl') || false,
      shiftKey: modifiers?.includes('shift') || false,
      altKey: modifiers?.includes('alt') || false,
      metaKey: modifiers?.includes('meta') || false
    };
  }

  /**
   * Capture state before action
   */
  private captureBeforeState(): any {
    const mutationObserver = new MutationObserver((mutations) => {
      // Count mutations
    });

    // Start observing DOM mutations
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    });

    return {
      url: window.location.href,
      scrollY: window.scrollY,
      scrollX: window.scrollX,
      mutationObserver,
      mutationCount: 0
    };
  }

  /**
   * Detect changes after action
   */
  private async detectChanges(
    beforeState: any,
    waitForNavigation?: boolean
  ): Promise<DetectedChanges> {
    // Wait a bit for changes to settle
    await new Promise(resolve => setTimeout(resolve, 100));

    // Stop observing and count mutations
    const mutations = beforeState.mutationObserver.takeRecords();
    beforeState.mutationObserver.disconnect();
    const mutationCount = mutations.length;

    const navigationOccurred = window.location.href !== beforeState.url;
    const scrollPositionChanged =
      window.scrollY !== beforeState.scrollY ||
      window.scrollX !== beforeState.scrollX;

    return {
      navigationOccurred,
      newUrl: navigationOccurred ? window.location.href : undefined,
      domMutations: mutationCount,
      scrollPositionChanged,
      scrollPosition: scrollPositionChanged
        ? { x: window.scrollX, y: window.scrollY }
        : undefined,
      valueChanged: false
    };
  }

  /**
   * Wait for navigation to complete
   */
  private async waitForNavigation(timeout: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const checkNavigation = () => {
        if (document.readyState === 'complete') {
          resolve();
        } else if (Date.now() - startTime > timeout) {
          reject(new Error('Navigation timeout'));
        } else {
          setTimeout(checkNavigation, 100);
        }
      };

      // If page is already loaded, resolve immediately
      if (document.readyState === 'complete') {
        resolve();
      } else {
        // Otherwise, wait for load event
        window.addEventListener('load', () => resolve(), { once: true });

        // Start checking
        checkNavigation();
      }
    });
  }
}

/**
 * InputExecutor - Handles text input action execution
 */
export class InputExecutor {
  private elementLocator: ElementLocator;
  private contextNavigator: ContextNavigator;

  constructor() {
    this.elementLocator = new ElementLocator();
    this.contextNavigator = new ContextNavigator();
  }

  /**
   * Execute input action
   */
  async execute(action: ActionCommand): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const parameters = action.parameters as InputParameters;

    console.log('[InputExecutor] Executing input action', action.targetElement);

    try {
      // Navigate to target context
      const targetContext = await this.contextNavigator.navigateToContext(
        action.targetElement.context
      );

      // Locate element
      const element = await this.elementLocator.locateElement(action.targetElement);

      if (!element) {
        throw new Error('Element not found');
      }

      // Validate element is interactable
      this.elementLocator.validateInteractability(element);

      // Capture before state
      const beforeValue = this.getElementValue(element);

      // Perform input
      await this.performInput(element, parameters);

      // Verify input
      const afterValue = this.getElementValue(element);
      const valueChanged = afterValue !== beforeValue;

      const duration = Date.now() - startTime;

      return {
        success: true,
        actionCommand: action,
        timestamp: new Date().toISOString(),
        duration,
        attemptsCount: 1,
        detectedChanges: {
          navigationOccurred: false,
          domMutations: 0,
          scrollPositionChanged: false,
          valueChanged,
          newValue: afterValue
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        actionCommand: action,
        timestamp: new Date().toISOString(),
        duration,
        attemptsCount: 1,
        detectedChanges: {
          navigationOccurred: false,
          domMutations: 0,
          scrollPositionChanged: false,
          valueChanged: false
        },
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          category: 'execution',
          recoverable: false
        }
      };
    }
  }

  /**
   * Perform the actual input operation
   */
  private async performInput(
    element: Element,
    parameters: InputParameters
  ): Promise<void> {
    const inputElement = element as HTMLInputElement | HTMLTextAreaElement;

    // Focus element
    inputElement.focus();

    // Clear first if requested
    if (parameters.clearFirst !== false) {
      inputElement.value = '';
      this.dispatchInputEvent(inputElement);
    }

    // Set value (hybrid approach for framework compatibility)
    if (parameters.typeSpeed && parameters.typeSpeed > 0) {
      // Simulate typing character by character
      await this.simulateTyping(inputElement, parameters.text, parameters.typeSpeed);
    } else {
      // Instant input (set value + dispatch events)
      this.setValueWithEvents(inputElement, parameters.text);
    }

    // Press Enter if requested
    if (parameters.pressEnter) {
      this.pressEnterKey(inputElement);
    }

    // Blur element
    inputElement.blur();
  }

  /**
   * Set value and dispatch events for framework compatibility
   */
  private setValueWithEvents(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ): void {
    // Set the value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    )?.set;

    if (nativeInputValueSetter) {
      nativeInputValueSetter.call(element, value);
    } else {
      element.value = value;
    }

    // Dispatch input event
    this.dispatchInputEvent(element);

    // Dispatch change event
    this.dispatchChangeEvent(element);

    // React-specific: Update _valueTracker
    this.updateReactValueTracker(element, value);
  }

  /**
   * Simulate typing character by character
   */
  private async simulateTyping(
    element: HTMLInputElement | HTMLTextAreaElement,
    text: string,
    charsPerSecond: number
  ): Promise<void> {
    const delayMs = 1000 / charsPerSecond;

    for (const char of text) {
      // Add character
      element.value += char;

      // Dispatch events
      this.dispatchInputEvent(element);

      // Wait before next character
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }

    // Final change event after typing complete
    this.dispatchChangeEvent(element);

    // Update React value tracker
    this.updateReactValueTracker(element, text);
  }

  /**
   * Dispatch input event
   */
  private dispatchInputEvent(element: HTMLInputElement | HTMLTextAreaElement): void {
    const event = new Event('input', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
  }

  /**
   * Dispatch change event
   */
  private dispatchChangeEvent(element: HTMLInputElement | HTMLTextAreaElement): void {
    const event = new Event('change', { bubbles: true, cancelable: true });
    element.dispatchEvent(event);
  }

  /**
   * Press Enter key
   */
  private pressEnterKey(element: HTMLInputElement | HTMLTextAreaElement): void {
    const keyboardEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });

    element.dispatchEvent(keyboardEvent);

    // Also dispatch keyup
    const keyupEvent = new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true
    });

    element.dispatchEvent(keyupEvent);
  }

  /**
   * Update React _valueTracker (for React compatibility)
   */
  private updateReactValueTracker(
    element: HTMLInputElement | HTMLTextAreaElement,
    value: string
  ): void {
    try {
      // React attaches a _valueTracker to input elements
      const tracker = (element as any)._valueTracker;
      if (tracker) {
        tracker.setValue(value);
      }
    } catch (error) {
      // Ignore errors - not all elements have React trackers
    }
  }

  /**
   * Get element value
   */
  private getElementValue(element: Element): string {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element.value;
    }
    return '';
  }
}

/**
 * ScrollExecutor - Handles scroll action execution
 */
export class ScrollExecutor {
  private elementLocator: ElementLocator;
  private contextNavigator: ContextNavigator;

  constructor() {
    this.elementLocator = new ElementLocator();
    this.contextNavigator = new ContextNavigator();
  }

  /**
   * Execute scroll action
   */
  async execute(action: ActionCommand): Promise<ActionExecutionResult> {
    const startTime = Date.now();
    const parameters = action.parameters as ScrollParameters;

    console.log('[ScrollExecutor] Executing scroll action', action.targetElement);

    try {
      // Navigate to target context
      const targetContext = await this.contextNavigator.navigateToContext(
        action.targetElement.context
      );

      // Capture before state
      const beforeScrollY = window.scrollY;
      const beforeScrollX = window.scrollX;

      // Perform scroll based on scroll type
      await this.performScroll(action.targetElement, parameters);

      // Wait for lazy-load if requested
      if (parameters.waitForLazyLoad !== false) {
        await this.waitForLazyLoad(parameters.lazyLoadTimeout || 2000);
      }

      // Detect changes
      const scrollPositionChanged =
        window.scrollY !== beforeScrollY ||
        window.scrollX !== beforeScrollX;

      const duration = Date.now() - startTime;

      return {
        success: true,
        actionCommand: action,
        timestamp: new Date().toISOString(),
        duration,
        attemptsCount: 1,
        detectedChanges: {
          navigationOccurred: false,
          domMutations: 0,
          scrollPositionChanged,
          scrollPosition: {
            x: window.scrollX,
            y: window.scrollY
          },
          valueChanged: false
        }
      };

    } catch (error) {
      const duration = Date.now() - startTime;

      return {
        success: false,
        actionCommand: action,
        timestamp: new Date().toISOString(),
        duration,
        attemptsCount: 1,
        detectedChanges: {
          navigationOccurred: false,
          domMutations: 0,
          scrollPositionChanged: false,
          valueChanged: false
        },
        error: {
          code: 'UNKNOWN_ERROR',
          message: error instanceof Error ? error.message : String(error),
          category: 'execution',
          recoverable: false
        }
      };
    }
  }

  /**
   * Perform scroll operation
   */
  private async performScroll(
    targetElement: any,
    parameters: ScrollParameters
  ): Promise<void> {
    const scrollType = parameters.scrollType;
    const smooth = parameters.smooth !== false;

    switch (scrollType) {
      case 'by-pixels':
        await this.scrollByPixels(parameters.pixels!, smooth);
        break;

      case 'to-element':
        await this.scrollToElement(targetElement, parameters.position, smooth);
        break;

      case 'to-position':
        await this.scrollToPosition(parameters.position!, smooth);
        break;
    }
  }

  /**
   * Scroll by specified pixels
   */
  private async scrollByPixels(
    pixels: { x: number; y: number },
    smooth: boolean
  ): Promise<void> {
    window.scrollBy({
      left: pixels.x,
      top: pixels.y,
      behavior: smooth ? 'smooth' : 'auto'
    });

    // Wait for smooth scroll to complete
    if (smooth) {
      await this.waitForScrollComplete();
    }
  }

  /**
   * Scroll to element
   */
  private async scrollToElement(
    targetElement: any,
    position: string | undefined,
    smooth: boolean
  ): Promise<void> {
    // Locate the element
    const element = await this.elementLocator.locateElement(targetElement);

    if (!element) {
      throw new Error('Element not found for scroll');
    }

    // Determine scroll block position
    let block: ScrollLogicalPosition = 'nearest';
    if (position === 'top') {
      block = 'start';
    } else if (position === 'bottom') {
      block = 'end';
    } else if (position === 'center') {
      block = 'center';
    }

    // Scroll element into view
    element.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block,
      inline: 'nearest'
    });

    // Wait for smooth scroll to complete
    if (smooth) {
      await this.waitForScrollComplete();
    }
  }

  /**
   * Scroll to position (top/bottom/center of page)
   */
  private async scrollToPosition(
    position: string,
    smooth: boolean
  ): Promise<void> {
    let targetY = 0;

    switch (position) {
      case 'top':
        targetY = 0;
        break;

      case 'bottom':
        targetY = document.documentElement.scrollHeight - window.innerHeight;
        break;

      case 'center':
        targetY = (document.documentElement.scrollHeight - window.innerHeight) / 2;
        break;
    }

    window.scrollTo({
      top: targetY,
      left: 0,
      behavior: smooth ? 'smooth' : 'auto'
    });

    // Wait for smooth scroll to complete
    if (smooth) {
      await this.waitForScrollComplete();
    }
  }

  /**
   * Wait for smooth scroll to complete
   */
  private async waitForScrollComplete(): Promise<void> {
    return new Promise(resolve => {
      let lastScrollY = window.scrollY;
      let sameCount = 0;

      const checkScroll = () => {
        if (window.scrollY === lastScrollY) {
          sameCount++;
          if (sameCount >= 3) {
            // Scroll position stable for 3 checks
            resolve();
            return;
          }
        } else {
          sameCount = 0;
          lastScrollY = window.scrollY;
        }

        setTimeout(checkScroll, 50);
      };

      checkScroll();
    });
  }

  /**
   * Wait for lazy-loaded content
   */
  private async waitForLazyLoad(timeout: number): Promise<void> {
    return new Promise(resolve => {
      const startTime = Date.now();
      let lastMutationTime = startTime;

      // Set up mutation observer
      const observer = new MutationObserver(() => {
        lastMutationTime = Date.now();
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Check for stability
      const checkStability = () => {
        const now = Date.now();
        const timeSinceLastMutation = now - lastMutationTime;

        // If DOM stable for 500ms, or timeout reached
        if (timeSinceLastMutation >= 500 || (now - startTime) >= timeout) {
          observer.disconnect();
          resolve();
        } else {
          setTimeout(checkStability, 100);
        }
      };

      checkStability();
    });
  }
}

export class VerifyExecutor {
  async execute(action: ActionCommand): Promise<ActionExecutionResult> {
    throw new Error('VerifyExecutor not yet implemented');
  }
}
