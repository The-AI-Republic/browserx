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

  console.log(`[InputExecutor] ========== START TYPE ACTION ==========`);
  console.log(`[InputExecutor] node_id: ${nodeId}`);
  console.log(`[InputExecutor] Text to type: "${text}"`);
  console.log(`[InputExecutor] Element:`, element.tagName, element.className || '(no class)', element.id || '(no id)');
  console.log(`[InputExecutor] Options:`, options);

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
      const error = `Element is not typeable: ${element.tagName} (must be input, textarea, or contenteditable)`;
      console.error(`[InputExecutor] ❌ ${error}`);
      throw new Error(error);
    }
    console.log(`[InputExecutor] ✅ Element is typeable`);

    // Check React state before typing
    const reactTracker = (element as any)._valueTracker;
    if (reactTracker) {
      console.log(`[InputExecutor] 🔍 React _valueTracker detected:`, reactTracker.value);
    } else {
      console.log(`[InputExecutor] 🔍 No React _valueTracker found (not a React component)`);
    }

    // Step 1: Focus element
    console.log(`[InputExecutor] Step 1: Focusing element...`);
    (element as HTMLElement).focus();
    await new Promise((resolve) => setTimeout(resolve, 50));
    console.log(`[InputExecutor] Element focused, activeElement:`, document.activeElement === element ? 'YES' : 'NO');

    // Step 2: Capture initial value
    const initialValue = getElementValue(element);
    console.log(`[InputExecutor] Step 2: Initial value: "${initialValue}"`);

    // Step 3: Clear existing value if configured
    if (opts.clearFirst) {
      console.log(`[InputExecutor] Step 3: Clearing existing value...`);
      resetReactValueTracker(element);
      setElementValue(element, "");
      dispatchInputEvents(element);
      console.log(`[InputExecutor] Value cleared`);
    }

    // Step 4: Type text
    if (opts.speed > 0) {
      console.log(`[InputExecutor] Step 4: Character-by-character typing (speed: ${opts.speed}ms)...`);
      // Character-by-character with delay (realistic typing)
      for (let i = 0; i < text.length; i++) {
        const char = text[i];
        console.log(`[InputExecutor] Typing char ${i + 1}/${text.length}: "${char}"`);

        // Reset React tracker BEFORE changing value
        resetReactValueTracker(element);

        const currentValue = getElementValue(element);
        setElementValue(element, currentValue + char);

        // Dispatch keyboard events for realistic typing
        dispatchKeyboardEvents(element, char);

        // Dispatch input events
        dispatchInputEvents(element);

        await new Promise((resolve) => setTimeout(resolve, opts.speed));
      }
      console.log(`[InputExecutor] Finished character-by-character typing`);
    } else {
      console.log(`[InputExecutor] Step 4: Instant typing (speed: 0)...`);
      // Instant typing
      resetReactValueTracker(element);
      const currentValue = opts.clearFirst ? "" : getElementValue(element);
      setElementValue(element, currentValue + text);
      dispatchInputEvents(element);
      console.log(`[InputExecutor] Instant typing complete`);
    }

    // Step 5: Press Enter if configured
    if (opts.pressEnter) {
      console.log(`[InputExecutor] Step 5: Pressing Enter key...`);
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
      console.log(`[InputExecutor] Enter key pressed`);
    }

    // Step 6: Blur if configured
    if (opts.blur) {
      console.log(`[InputExecutor] Step 6: Blurring element...`);
      (element as HTMLElement).blur();
    }

    // Step 7: Detect changes
    const finalValue = getElementValue(element);
    const valueChanged = finalValue !== initialValue;
    console.log(`[InputExecutor] Step 7: Final value: "${finalValue}"`);
    console.log(`[InputExecutor] Value changed: ${valueChanged ? 'YES' : 'NO'} (from "${initialValue}" to "${finalValue}")`);

    // Check React tracker after typing
    const reactTrackerAfter = (element as any)._valueTracker;
    if (reactTrackerAfter) {
      console.log(`[InputExecutor] 🔍 React _valueTracker after typing:`, reactTrackerAfter.value);
      console.log(`[InputExecutor] React would detect change:`, reactTrackerAfter.value !== finalValue ? 'YES ✅' : 'NO ❌');
    }

    // Setup mutation observer for DOM changes
    console.log(`[InputExecutor] Observing DOM mutations for 100ms...`);
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
    console.log(`[InputExecutor] Detected ${mutationCount} DOM mutations`);

    const changes = {
      navigationOccurred: false, // Typing doesn't typically cause navigation
      domMutations: mutationCount,
      scrollChanged: false,
      valueChanged,
      newValue: valueChanged ? finalValue : undefined,
    };

    console.log(`[InputExecutor] ========== TYPE ACTION SUCCESS ==========`);
    console.log(`[InputExecutor] Duration: ${Date.now() - startTime}ms`);
    console.log(`[InputExecutor] Changes:`, changes);

    return {
      success: true,
      duration: Date.now() - startTime,
      changes,
      nodeId,
      actionType: "type",
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    console.error(`[InputExecutor] ========== TYPE ACTION FAILED ==========`);
    console.error(`[InputExecutor] Error:`, error);
    console.error(`[InputExecutor] Duration: ${Date.now() - startTime}ms`);

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
 * Reset React's internal _valueTracker
 * Required for React to detect value changes
 *
 * This must be called BEFORE setting the value to trick React
 * into thinking the value changed from '' to the new value.
 */
function resetReactValueTracker(element: Element): void {
  try {
    const tracker = (element as any)._valueTracker;
    if (tracker) {
      const oldValue = tracker.value;
      tracker.setValue("");
      console.log(`[InputExecutor] 🔧 Reset React _valueTracker: "${oldValue}" → ""`);
    }
  } catch (error) {
    console.warn(`[InputExecutor] ⚠️ Failed to reset React _valueTracker:`, error);
  }
}

/**
 * Dispatch keyboard events for a character
 * Makes typing more realistic for framework event handlers
 */
function dispatchKeyboardEvents(element: Element, char: string): void {
  // keydown event
  const keydownEvent = new KeyboardEvent("keydown", {
    key: char,
    code: `Key${char.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(keydownEvent);

  // keypress event (deprecated but some frameworks still use it)
  const keypressEvent = new KeyboardEvent("keypress", {
    key: char,
    code: `Key${char.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(keypressEvent);

  // keyup event
  const keyupEvent = new KeyboardEvent("keyup", {
    key: char,
    code: `Key${char.toUpperCase()}`,
    bubbles: true,
    cancelable: true,
  });
  element.dispatchEvent(keyupEvent);
}

/**
 * Dispatch input events for framework compatibility
 *
 * Dispatches both 'input' and 'change' events to trigger
 * React, Vue, Angular, and other framework listeners.
 */
function dispatchInputEvents(element: Element): void {
  console.log(`[InputExecutor] 📡 Dispatching events...`);

  // Input event (for real-time updates)
  // Use InputEvent instead of Event for better framework compatibility
  const inputEvent = new InputEvent("input", {
    bubbles: true,
    cancelable: true,
    composed: true,
    inputType: "insertText", // Tells frameworks this was typing
  });
  const inputDispatched = element.dispatchEvent(inputEvent);
  console.log(`[InputExecutor] 📡 InputEvent dispatched (type: InputEvent, inputType: insertText, prevented: ${!inputDispatched})`);

  // Change event (for frameworks)
  const changeEvent = new Event("change", {
    bubbles: true,
    cancelable: true,
  });
  const changeDispatched = element.dispatchEvent(changeEvent);
  console.log(`[InputExecutor] 📡 Change event dispatched (prevented: ${!changeDispatched})`);
}
