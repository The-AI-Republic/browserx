/**
 * Interactivity Detector
 *
 * Determines if a DOM element is interactive (clickable, typeable, etc.).
 * Uses multi-heuristic approach beyond semantic HTML to detect modern
 * JavaScript-based interactive elements.
 *
 * @version 3.0.0
 * @date 2025-10-24
 */

/**
 * Semantic clickable tags
 */
const SEMANTIC_CLICKABLE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "option",
]);

/**
 * Interactive ARIA roles
 */
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "checkbox",
  "switch",
  "tab",
  "textbox",
  "searchbox",
  "combobox",
  "slider",
  "spinbutton",
  "scrollbar",
]);

/**
 * Check if an element is interactive
 *
 * Detection strategy (multi-heuristic):
 * 1. Semantic tags (button, a, input, select, textarea)
 * 2. Explicit event handlers (onclick attribute)
 * 3. CSS heuristics (cursor: pointer, cursor: grab)
 * 4. ARIA roles (button, link, menuitem, etc.)
 * 5. Tabindex >= 0 (keyboard accessible)
 * 6. Framework patterns (data-action, data-click, etc.)
 *
 * @param element - DOM element to check
 * @returns true if element is interactive
 */
export function isInteractive(element: Element): boolean {
  // 1. Semantic clickable tags
  const tag = element.tagName.toLowerCase();
  if (SEMANTIC_CLICKABLE_TAGS.has(tag)) {
    // Skip disabled form elements
    if (tag === "input" || tag === "button" || tag === "select" || tag === "textarea") {
      const formElement = element as HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement;
      if (formElement.disabled) {
        return false;
      }
    }
    return true;
  }

  // 2. Explicit onclick attribute
  if (element.hasAttribute("onclick")) {
    return true;
  }

  // 3. CSS cursor heuristics
  try {
    const cursor = window.getComputedStyle(element).cursor;
    if (cursor === "pointer" || cursor === "grab") {
      return true;
    }
  } catch (error) {
    // Ignore style computation errors
  }

  // 4. ARIA role
  const role = element.getAttribute("role");
  if (role && INTERACTIVE_ROLES.has(role)) {
    return true;
  }

  // 5. Tabindex >= 0 (keyboard accessible)
  const tabindex = element.getAttribute("tabindex");
  if (tabindex !== null) {
    const tabValue = parseInt(tabindex, 10);
    if (!isNaN(tabValue) && tabValue >= 0) {
      return true;
    }
  }

  // 6. Framework patterns (data attributes)
  if (
    element.hasAttribute("data-action") ||
    element.hasAttribute("data-click") ||
    element.hasAttribute("data-clickable") ||
    element.hasAttribute("ng-click") || // Angular
    element.hasAttribute("v-on:click") || // Vue
    element.hasAttribute("@click") // Vue shorthand
  ) {
    return true;
  }

  // 7. Class-based heuristics (common patterns)
  const className = element.className;
  if (typeof className === "string") {
    const clickableClassPatterns = [
      /\bclickable\b/i,
      /\bbtn\b/i,
      /\bbutton\b/i,
      /\blink\b/i,
      /\binteractive\b/i,
    ];

    for (const pattern of clickableClassPatterns) {
      if (pattern.test(className)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Check if element is a form input (typeable)
 *
 * @param element - DOM element to check
 * @returns true if element accepts text input
 */
export function isTypeable(element: Element): boolean {
  const tag = element.tagName.toLowerCase();

  // Textarea
  if (tag === "textarea") {
    const textarea = element as HTMLTextAreaElement;
    return !textarea.disabled && !textarea.readOnly;
  }

  // Input elements (text, search, email, password, etc.)
  if (tag === "input") {
    const input = element as HTMLInputElement;

    // Skip disabled or readonly inputs
    if (input.disabled || input.readOnly) {
      return false;
    }

    // Text input types
    const textInputTypes = new Set([
      "text",
      "search",
      "email",
      "password",
      "tel",
      "url",
      "number",
      "date",
      "time",
      "datetime-local",
      "month",
      "week",
    ]);

    return textInputTypes.has(input.type);
  }

  // Contenteditable elements
  const contenteditable = element.getAttribute("contenteditable");
  if (contenteditable === "true" || contenteditable === "") {
    return true;
  }

  // ARIA textbox
  const role = element.getAttribute("role");
  if (role === "textbox" || role === "searchbox") {
    return true;
  }

  return false;
}

/**
 * Check if element is clickable (for action execution)
 *
 * More permissive than isInteractive - includes elements that may not
 * be semantically interactive but can receive click events.
 *
 * @param element - DOM element to check
 * @returns true if element can be clicked
 */
export function isClickable(element: Element): boolean {
  // All interactive elements are clickable
  if (isInteractive(element)) {
    return true;
  }

  // Elements with event listeners (we can't detect these directly in content scripts,
  // but we can check for common patterns)

  // Divs and spans are often used as clickable elements in modern SPAs
  const tag = element.tagName.toLowerCase();
  if (tag === "div" || tag === "span") {
    // Check if it has cursor: pointer
    try {
      const cursor = window.getComputedStyle(element).cursor;
      if (cursor === "pointer") {
        return true;
      }
    } catch (error) {
      // Ignore
    }

    // Check for role
    const role = element.getAttribute("role");
    if (role && INTERACTIVE_ROLES.has(role)) {
      return true;
    }
  }

  return false;
}

/**
 * Get interactivity type for an element
 *
 * @param element - DOM element to check
 * @returns "none", "click", "type", or "both"
 */
export function getInteractivityType(
  element: Element
): "none" | "click" | "type" | "both" {
  const clickable = isClickable(element);
  const typeable = isTypeable(element);

  if (clickable && typeable) return "both";
  if (clickable) return "click";
  if (typeable) return "type";
  return "none";
}
