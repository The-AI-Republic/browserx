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
  const opts = {
    clearFirst: options.clearFirst ?? false,
    speed: options.speed ?? 0,
    commit: options.commit ?? "change",
    blur: options.blur ?? false,
  };

  try {
    // Validate element is typeable
    if (!isTypeableElement(element)) {
      const error = `Element is not typeable: ${element.tagName} (must be input, textarea, or contenteditable)`;
      console.error(`[InputExecutor] ❌ ${error}`);
      throw new Error(error);
    }

    // Check React state before typing
    const reactTracker = (element as any)._valueTracker;
    if (reactTracker) {
    } else {
    }

    // Step 1: Focus element
    (element as HTMLElement).focus();
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Step 2: Capture initial value
    const initialValue = getElementValue(element);

    // Step 3: Clear existing value if configured
    if (opts.clearFirst) {
      resetReactValueTracker(element);
      setElementValue(element, "");
      dispatchInputEvent(element); // Only input event, not change
    }

    // Step 4: Type text (framework-aware)
    // Detect which framework/editor we're dealing with
    const framework = detectFramework(element);

    if (opts.speed > 0) {
      // Character-by-character with delay (realistic typing)
      for (let i = 0; i < text.length; i++) {
        const char = text[i];

        resetReactValueTracker(element);
        typeCharByFramework(element, char, framework);

        await new Promise((resolve) => setTimeout(resolve, opts.speed));
      }
    } else {

      // For rich text editors, always type character-by-character with small delays
      if (framework === 'draft' || framework === 'quill' || framework === 'contenteditable') {
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          resetReactValueTracker(element);
          typeCharByFramework(element, char, framework);

          // Small delay for realism and event processing
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      } else {
        // Native input/textarea - can set all at once
        resetReactValueTracker(element);
        const currentValue = opts.clearFirst ? "" : getElementValue(element);
        dispatchKeyEvent(element, 'keydown', text[0] || '');
        setElementValue(element, currentValue + text);
        dispatchInputEvent(element, text);
        dispatchKeyEvent(element, 'keyup', text[text.length - 1] || '');
      }
    }

    // Step 5: Handle commit mode
    if (opts.commit === "enter") {
      dispatchKeyEvent(element, 'keydown', 'Enter');
      dispatchKeyEvent(element, 'keypress', 'Enter');
      dispatchKeyEvent(element, 'keyup', 'Enter');

      // Dispatch change event after Enter
      dispatchChangeEvent(element);
    }

    // Step 6: Blur if configured
    if (opts.blur) {
      (element as HTMLElement).blur();

      // Dispatch change event on blur if not already dispatched by Enter
      if (opts.commit !== "enter") {
        dispatchChangeEvent(element);
      }
    } else if (opts.commit !== "enter") {
      // If no blur and no enter, still dispatch change for compatibility
      dispatchChangeEvent(element);
    }

    // Step 7: Detect changes
    const finalValue = getElementValue(element);
    const valueChanged = finalValue !== initialValue;

    // Check React tracker after typing
    const reactTrackerAfter = (element as any)._valueTracker;
    if (reactTrackerAfter) {
    }

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
    }
  } catch (error) {
    console.warn(`[InputExecutor] ⚠️ Failed to reset React _valueTracker:`, error);
  }
}

/**
 * Detect which framework/editor type the element is using
 * This determines which event sequence to use for typing
 *
 * @returns 'draft' | 'quill' | 'contenteditable' | 'native'
 */
function detectFramework(element: Element): string {
  const className = element.className || '';
  const parentClassName = element.parentElement?.className || '';

  // Draft.js (X.com, Meta apps, Substack)
  // Look for "DraftEditor" in class names
  if (className.includes('DraftEditor') || parentClassName.includes('DraftEditor')) {
    return 'draft';
  }

  // Quill (Notion-like editors, HubSpot)
  // Look for "ql-editor" in class names
  if (className.includes('ql-editor') || className.includes('quill')) {
    return 'quill';
  }

  // ProseMirror (newer rich text editors)
  if (className.includes('ProseMirror')) {
    return 'contenteditable'; // Use contenteditable strategy for now
  }

  // Generic contenteditable
  if (element.getAttribute('contenteditable') === 'true' || element.getAttribute('contenteditable') === '') {
    return 'contenteditable';
  }

  // Native input/textarea
  return 'native';
}

/**
 * Framework-aware character typing dispatcher
 * Routes to the appropriate typing function based on framework
 */
function typeCharByFramework(element: Element, char: string, framework: string): void {
  switch (framework) {
    case 'draft':
      simulateDraftJsInput(element, char);
      break;
    case 'quill':
      simulateQuillInput(element, char);
      break;
    case 'contenteditable':
      simulateContentEditableInput(element, char);
      break;
    case 'native':
    default:
      simulateNativeInput(element, char);
      break;
  }
}

/**
 * Draft.js typing simulation (X.com, Meta apps)
 * Event sequence: keydown → keypress → beforeinput → textInput → modify DOM → keyup
 */
function simulateDraftJsInput(element: Element, char: string): void {
  // 1. keydown
  dispatchKeyEvent(element, 'keydown', char);

  // 2. keypress (deprecated but some frameworks still use it)
  dispatchKeyEvent(element, 'keypress', char);

  // 3. beforeinput (signals intent to modify)
  const beforeEvt = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    composed: true,
    inputType: 'insertText',
    data: char,
  });
  element.dispatchEvent(beforeEvt);

  // 4. textInput (CRITICAL - Draft.js listens for this!)
  const textEvt = new InputEvent('textInput', {
    bubbles: true,
    cancelable: true,
    composed: true,
    data: char,
  });
  element.dispatchEvent(textEvt);

  // 5. Modify DOM
  const currentValue = getElementValue(element);
  setElementValue(element, currentValue + char);

  // 6. keyup
  dispatchKeyEvent(element, 'keyup', char);

}

/**
 * Quill typing simulation (Notion-like editors)
 * Event sequence: keydown → keypress → modify DOM → input → keyup
 */
function simulateQuillInput(element: Element, char: string): void {
  // 1. keydown
  dispatchKeyEvent(element, 'keydown', char);

  // 2. keypress
  dispatchKeyEvent(element, 'keypress', char);

  // 3. Modify DOM
  const currentValue = getElementValue(element);
  setElementValue(element, currentValue + char);

  // 4. input event (Quill listens to standard input)
  const inputEvt = new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    composed: true,
    inputType: 'insertText',
    data: char,
  });
  element.dispatchEvent(inputEvt);

  // 5. keyup
  dispatchKeyEvent(element, 'keyup', char);

}

/**
 * Generic contenteditable typing simulation
 * Event sequence: keydown → keypress → beforeinput → modify DOM → input → keyup
 */
function simulateContentEditableInput(element: Element, char: string): void {
  // 1. keydown
  dispatchKeyEvent(element, 'keydown', char);

  // 2. keypress
  dispatchKeyEvent(element, 'keypress', char);

  // 3. beforeinput
  const beforeEvt = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    composed: true,
    inputType: 'insertText',
    data: char,
  });
  element.dispatchEvent(beforeEvt);

  // 4. Modify DOM
  const currentValue = getElementValue(element);
  setElementValue(element, currentValue + char);

  // 5. input event
  const inputEvt = new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    composed: true,
    inputType: 'insertText',
    data: char,
  });
  element.dispatchEvent(inputEvt);

  // 6. keyup
  dispatchKeyEvent(element, 'keyup', char);

}

/**
 * Native input/textarea typing simulation
 * Simpler event sequence for standard form elements
 */
function simulateNativeInput(element: Element, char: string): void {
  // 1. keydown
  dispatchKeyEvent(element, 'keydown', char);

  // 2. Modify DOM
  const currentValue = getElementValue(element);
  setElementValue(element, currentValue + char);

  // 3. input event
  const inputEvt = new InputEvent('input', {
    bubbles: true,
    cancelable: false,
    composed: true,
    inputType: 'insertText',
    data: char,
  });
  element.dispatchEvent(inputEvt);

  // 4. keyup
  dispatchKeyEvent(element, 'keyup', char);

}

/**
 * Get the correct keyboard event code for a character
 * Handles letters, numbers, spaces, and special characters
 */
function getKeyCode(char: string): string {
  // Special keys
  if (char === 'Enter') return 'Enter';
  if (char === ' ') return 'Space';
  if (char === '\t') return 'Tab';

  // Numbers
  if (/^\d$/.test(char)) return `Digit${char}`;

  // Letters
  if (/^[a-zA-Z]$/.test(char)) return `Key${char.toUpperCase()}`;

  // For other characters, use generic code
  return 'Unidentified';
}

/**
 * Dispatch a single keyboard event (keydown, keypress, or keyup)
 * Creates proper keyboard events that match browser behavior
 */
function dispatchKeyEvent(element: Element, eventType: 'keydown' | 'keypress' | 'keyup', char: string): void {
  const code = getKeyCode(char);

  const keyEvent = new KeyboardEvent(eventType, {
    key: char,
    code: code,
    bubbles: true,
    cancelable: true,
    composed: true,
  });

  element.dispatchEvent(keyEvent);
}

/**
 * Dispatch input event for real-time value updates
 * Legacy function - now mainly used for clearing values
 * For actual typing, use the framework-specific functions
 */
function dispatchInputEvent(element: Element, char?: string): void {
  const inputEvent = new InputEvent("input", {
    bubbles: true,
    cancelable: false,
    composed: true,
    inputType: "insertText",
    data: char,
  });

  const dispatched = element.dispatchEvent(inputEvent);
}

/**
 * Dispatch change event for form submission
 * This typically fires on blur or Enter, not during typing
 */
function dispatchChangeEvent(element: Element): void {
  const changeEvent = new Event("change", {
    bubbles: true,
    cancelable: true,
  });

  const dispatched = element.dispatchEvent(changeEvent);
}

/**
 * Legacy function for backwards compatibility
 * Now just dispatches input event (change should be called separately)
 * @deprecated Use dispatchInputEvent() and dispatchChangeEvent() separately
 */
function dispatchInputEvents(element: Element): void {
  dispatchInputEvent(element);
  dispatchChangeEvent(element);
}
