/**
 * Keypress Executor
 *
 * Executes keyboard key press actions with modifier support.
 * Handles special keys (Enter, Escape, Arrow keys, etc.).
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

import type { KeyPressOptions, ActionResult } from "../../../types/domTool";

/**
 * Execute keypress action
 *
 * Process:
 * 1. Determine target (element or document)
 * 2. Create KeyboardEvent with modifiers
 * 3. Dispatch keydown, keypress, keyup events
 * 4. Detect changes triggered by keypress
 * 5. Return ActionResult
 *
 * @param key - Key to press (e.g., "Enter", "Escape", "ArrowDown", "a")
 * @param nodeId - Node ID for tracking (optional, uses document if omitted)
 * @param targetElement - Target element (optional, uses document if omitted)
 * @param options - Keypress options
 * @returns ActionResult with change detection
 */
export async function executeKeyPress(
  key: string,
  nodeId: string,
  targetElement: Element | null,
  options: KeyPressOptions = {}
): Promise<ActionResult> {
  const startTime = Date.now();

  // Default options
  const opts: Required<Omit<KeyPressOptions, "targetNodeId">> = {
    modifiers: options.modifiers || {},
    repeat: options.repeat ?? 1,
  };

  try {
    // Step 1: Determine target
    const target = targetElement || document.activeElement || document.body;

    // Step 2: Setup mutation observer
    let mutationCount = 0;
    const observer = new MutationObserver((mutations) => {
      mutationCount += mutations.length;
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
    });

    // Step 3: Capture initial state
    const initialUrl = window.location.href;
    const initialScrollX = window.scrollX;
    const initialScrollY = window.scrollY;

    // Step 4: Dispatch key events (repeat if configured)
    for (let i = 0; i < opts.repeat; i++) {
      // Get key information
      const keyInfo = getKeyInfo(key);

      // Keydown event
      const keydownEvent = new KeyboardEvent("keydown", {
        key: keyInfo.key,
        code: keyInfo.code,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        ctrlKey: opts.modifiers.ctrl,
        shiftKey: opts.modifiers.shift,
        altKey: opts.modifiers.alt,
        metaKey: opts.modifiers.meta,
        bubbles: true,
        cancelable: true,
      });

      target.dispatchEvent(keydownEvent);

      // Keypress event (deprecated but some apps still use it)
      const keypressEvent = new KeyboardEvent("keypress", {
        key: keyInfo.key,
        code: keyInfo.code,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        ctrlKey: opts.modifiers.ctrl,
        shiftKey: opts.modifiers.shift,
        altKey: opts.modifiers.alt,
        metaKey: opts.modifiers.meta,
        bubbles: true,
        cancelable: true,
      });

      target.dispatchEvent(keypressEvent);

      // Keyup event
      const keyupEvent = new KeyboardEvent("keyup", {
        key: keyInfo.key,
        code: keyInfo.code,
        keyCode: keyInfo.keyCode,
        which: keyInfo.keyCode,
        ctrlKey: opts.modifiers.ctrl,
        shiftKey: opts.modifiers.shift,
        altKey: opts.modifiers.alt,
        metaKey: opts.modifiers.meta,
        bubbles: true,
        cancelable: true,
      });

      target.dispatchEvent(keyupEvent);

      // Small delay between repeats
      if (i < opts.repeat - 1) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }

    // Step 5: Wait for async effects
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Step 6: Detect changes
    observer.disconnect();

    const navigationOccurred = window.location.href !== initialUrl;
    const scrollChanged = window.scrollX !== initialScrollX || window.scrollY !== initialScrollY;

    const changes = {
      navigationOccurred,
      newUrl: navigationOccurred ? window.location.href : undefined,
      domMutations: mutationCount,
      scrollChanged,
      valueChanged: false, // Not tracked for keypress
      newValue: undefined,
    };

    return {
      success: true,
      duration: Date.now() - startTime,
      changes,
      nodeId: nodeId || "document",
      actionType: "keypress",
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
      nodeId: nodeId || "document",
      actionType: "keypress",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Key information for KeyboardEvent
 */
interface KeyInfo {
  key: string;
  code: string;
  keyCode: number;
}

/**
 * Get key information for KeyboardEvent
 *
 * Maps common key names to their key, code, and keyCode values.
 *
 * @param key - Key name (e.g., "Enter", "Escape", "a")
 * @returns KeyInfo object
 */
function getKeyInfo(key: string): KeyInfo {
  // Special keys mapping
  const specialKeys: Record<string, KeyInfo> = {
    Enter: { key: "Enter", code: "Enter", keyCode: 13 },
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
    Backspace: { key: "Backspace", code: "Backspace", keyCode: 8 },
    Tab: { key: "Tab", code: "Tab", keyCode: 9 },
    Space: { key: " ", code: "Space", keyCode: 32 },
    ArrowUp: { key: "ArrowUp", code: "ArrowUp", keyCode: 38 },
    ArrowDown: { key: "ArrowDown", code: "ArrowDown", keyCode: 40 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    Home: { key: "Home", code: "Home", keyCode: 36 },
    End: { key: "End", code: "End", keyCode: 35 },
    PageUp: { key: "PageUp", code: "PageUp", keyCode: 33 },
    PageDown: { key: "PageDown", code: "PageDown", keyCode: 34 },
    Delete: { key: "Delete", code: "Delete", keyCode: 46 },
    Insert: { key: "Insert", code: "Insert", keyCode: 45 },
  };

  // Check special keys
  if (specialKeys[key]) {
    return specialKeys[key];
  }

  // Regular character key
  const char = key.length === 1 ? key : key.toLowerCase();
  const charCode = char.charCodeAt(0);

  return {
    key: char,
    code: `Key${char.toUpperCase()}`,
    keyCode: charCode,
  };
}
