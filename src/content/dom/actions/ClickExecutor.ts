/**
 * Click Executor
 *
 * Executes click actions on DOM elements with change detection.
 * Handles scrolling, event dispatch, and mutation tracking.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type { ClickOptions, ActionResult } from "../../../types/domTool";

/**
 * Execute click action on an element
 *
 * Process:
 * 1. Validate element is clickable
 * 2. Scroll into view (if configured)
 * 3. Capture initial state
 * 4. Dispatch click events
 * 5. Detect changes (navigation, mutations, scroll)
 * 6. Return ActionResult
 *
 * @param element - Element to click
 * @param nodeId - Node ID for tracking
 * @param options - Click options
 * @returns ActionResult with change detection
 */
export async function executeClick(
  element: Element,
  nodeId: string,
  options: ClickOptions = {}
): Promise<ActionResult> {
  const startTime = Date.now();

  // Default options
  const opts: Required<ClickOptions> = {
    button: options.button || "left",
    clickType: options.clickType || "single",
    modifiers: options.modifiers || {},
    waitForNavigation: options.waitForNavigation ?? false,
    scrollIntoView: options.scrollIntoView ?? true,
  };

  try {
    // Step 1: Scroll into view
    if (opts.scrollIntoView) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "center",
        inline: "center",
      });

      // Wait for scroll to complete
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Step 2: Capture initial state
    const initialUrl = window.location.href;
    const initialScrollX = window.scrollX;
    const initialScrollY = window.scrollY;

    // Setup mutation observer
    let mutationCount = 0;
    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length;
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });

    // Step 3: Dispatch click events
    const button = opts.button === "right" ? 2 : opts.button === "middle" ? 1 : 0;

    // MouseEvent sequence: mousedown, mouseup, click
    const mouseDownEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      view: window,
      button,
      ctrlKey: opts.modifiers.ctrl,
      shiftKey: opts.modifiers.shift,
      altKey: opts.modifiers.alt,
      metaKey: opts.modifiers.meta,
    });

    const mouseUpEvent = new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      view: window,
      button,
      ctrlKey: opts.modifiers.ctrl,
      shiftKey: opts.modifiers.shift,
      altKey: opts.modifiers.alt,
      metaKey: opts.modifiers.meta,
    });

    const clickEvent = new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      view: window,
      button,
      detail: opts.clickType === "double" ? 2 : 1,
      ctrlKey: opts.modifiers.ctrl,
      shiftKey: opts.modifiers.shift,
      altKey: opts.modifiers.alt,
      metaKey: opts.modifiers.meta,
    });

    element.dispatchEvent(mouseDownEvent);
    element.dispatchEvent(mouseUpEvent);
    element.dispatchEvent(clickEvent);

    // Double click if requested
    if (opts.clickType === "double") {
      const dblClickEvent = new MouseEvent("dblclick", {
        bubbles: true,
        cancelable: true,
        view: window,
        button,
        ctrlKey: opts.modifiers.ctrl,
        shiftKey: opts.modifiers.shift,
        altKey: opts.modifiers.alt,
        metaKey: opts.modifiers.meta,
      });
      element.dispatchEvent(dblClickEvent);
    }

    // Step 4: Wait for async effects
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 5: Detect changes
    observer.disconnect();

    const navigationOccurred = window.location.href !== initialUrl;
    const scrollChanged = window.scrollX !== initialScrollX || window.scrollY !== initialScrollY;

    const changes = {
      navigationOccurred,
      newUrl: navigationOccurred ? window.location.href : undefined,
      domMutations: mutationCount,
      scrollChanged,
      valueChanged: false, // Not applicable for click
      newValue: undefined,
    };

    return {
      success: true,
      duration: Date.now() - startTime,
      changes,
      nodeId,
      actionType: "click",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
      changes: {
        navigationOccurred: false,
        domMutations: 0,
        scrollChanged: false,
        valueChanged: false,
      },
      nodeId,
      actionType: "click",
      timestamp: new Date().toISOString(),
    };
  }
}
