/**
 * Input Executor
 *
 * Executes type actions on form elements with framework compatibility.
 * Handles focus, typing, and framework-specific event dispatch.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type { TypeOptions, ActionResult } from "../../../types/domTool";

/**
 * Execute type action on a form element
 *
 * Process:
 * 1. Validate element is typeable
 * 2. Focus element
 * 3. Clear existing value (if configured)
 * 4. Type text character-by-character or instant
 * 5. Press Enter (if configured)
 * 6. Blur (if configured)
 * 7. Detect value changes
 * 8. Return ActionResult
 *
 * @param element - Element to type into
 * @param nodeId - Node ID for tracking
 * @param text - Text to type
 * @param options - Type options
 * @returns ActionResult with value change detection
 */
export async function executeType(
  element: Element,
  nodeId: string,
  text: string,
  options: TypeOptions = {}
): Promise<ActionResult> {
  const startTime = Date.now();

  // Default options
  const opts: Required<TypeOptions> = {
    clearFirst: options.clearFirst ?? false,
    speed: options.speed ?? 0,
    pressEnter: options.pressEnter ?? false,
    blur: options.blur ?? false,
  };

  try {
    // Validate element is typeable
    if (!isTypeableElement(element)) {
      throw new Error(
        `Element is not typeable: ${element.tagName} (must be input, textarea, or contenteditable)`
      );
    }

    // Step 1: Focus element
    (element as HTMLElement).focus();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Step 2: Capture initial value
    const initialValue = getElementValue(element);

    // Step 3: Clear existing value if configured
    if (opts.clearFirst) {
      setElementValue(element, "");
      dispatchInputEvents(element);
    }

    // Step 4: Type text
    if (opts.speed > 0) {
      // Character-by-character with delay
      for (const char of text) {
        const currentValue = getElementValue(element);
        setElementValue(element, currentValue + char);
        dispatchInputEvents(element);
        await new Promise((resolve) => setTimeout(resolve, opts.speed));
      }
    } else {
      // Instant typing
      const currentValue = opts.clearFirst ? "" : getElementValue(element);
      setElementValue(element, currentValue + text);
      dispatchInputEvents(element);
    }

    // Step 5: Press Enter if configured
    if (opts.pressEnter) {
      const enterEvent = new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(enterEvent);

      const enterUpEvent = new KeyboardEvent("keyup", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      });
      element.dispatchEvent(enterUpEvent);
    }

    // Step 6: Blur if configured
    if (opts.blur) {
      (element as HTMLElement).blur();
    }

    // Step 7: Detect changes
    const finalValue = getElementValue(element);
    const valueChanged = finalValue !== initialValue;

    // Setup mutation observer for DOM changes
    let mutationCount = 0;
    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length;
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    observer.disconnect();

    const changes = {
      navigationOccurred: false, // Typing doesn't typically cause navigation
      domMutations: mutationCount,
      scrollChanged: false,
      valueChanged,
      newValue: valueChanged ? finalValue : undefined,
    };

    return {
      success: true,
      duration: Date.now() - startTime,
      changes,
      nodeId,
      actionType: "type",
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
      actionType: "type",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check if element is typeable
 */
function isTypeableElement(element: Element): boolean {
  const tag = element.tagName.toLowerCase();

  // Textarea
  if (tag === "textarea") {
    const textarea = element as HTMLTextAreaElement;
    return !textarea.disabled && !textarea.readOnly;
  }

  // Input elements
  if (tag === "input") {
    const input = element as HTMLInputElement;
    if (input.disabled || input.readOnly) return false;

    const textInputTypes = new Set([
      "text",
      "search",
      "email",
      "password",
      "tel",
      "url",
      "number",
    ]);

    return textInputTypes.has(input.type);
  }

  // Contenteditable
  const contenteditable = element.getAttribute("contenteditable");
  return contenteditable === "true" || contenteditable === "";
}

/**
 * Get element value
 */
function getElementValue(element: Element): string {
  const tag = element.tagName.toLowerCase();

  if (tag === "input" || tag === "textarea") {
    return (element as HTMLInputElement | HTMLTextAreaElement).value;
  }

  if (element.getAttribute("contenteditable")) {
    return element.textContent || "";
  }

  return "";
}

/**
 * Set element value
 */
function setElementValue(element: Element, value: string): void {
  const tag = element.tagName.toLowerCase();

  if (tag === "input" || tag === "textarea") {
    (element as HTMLInputElement | HTMLTextAreaElement).value = value;
  } else if (element.getAttribute("contenteditable")) {
    element.textContent = value;
  }
}

/**
 * Dispatch input events for framework compatibility
 *
 * Dispatches both 'input' and 'change' events to trigger
 * React, Vue, Angular, and other framework listeners.
 */
function dispatchInputEvents(element: Element): void {
  // Input event (for real-time updates)
  const inputEvent = new Event("input", {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(inputEvent);

  // Change event (for frameworks)
  const changeEvent = new Event("change", {
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(changeEvent);

  // React-specific: Update the value descriptor
  // This is necessary for React's synthetic event system
  try {
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value"
    )?.set;

    if (nativeInputValueSetter) {
      const inputElement = element as HTMLInputElement;
      nativeInputValueSetter.call(inputElement, inputElement.value);

      const reactEvent = new Event("input", { bubbles: true });
      element.dispatchEvent(reactEvent);
    }
  } catch (error) {
    // Ignore React-specific errors
  }
}
