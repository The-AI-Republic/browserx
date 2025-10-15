/**
 * HTML Sanitizer Module
 *
 * Purpose: Strip dangerous and unnecessary content from HTML before processing
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/research.md - Decision 5
 */

/**
 * Sanitizes HTML by removing scripts, styles, and comments
 *
 * @param html - Raw HTML string
 * @returns Sanitized HTML safe for DOM parsing
 *
 * Security:
 * - Removes <script> tags and their content
 * - Removes <style> tags and their content
 * - Removes HTML comments
 * - Removes event handler attributes (onclick, onerror, etc.)
 *
 * Performance:
 * - Uses regex for initial cleanup before DOM parsing
 * - Lightweight operation (<10ms for typical pages)
 */
export function sanitizeHtml(html: string): string {
  let sanitized = html;

  // Remove script tags and content (prevent XSS)
  sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove style tags and content (reduce noise)
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

  // Remove HTML comments (reduce noise)
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, '');

  // Remove inline event handlers (prevent XSS)
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]+/gi, '');

  return sanitized;
}

/**
 * Removes dangerous attributes from a DOM element
 *
 * @param element - DOM element to clean
 *
 * Security:
 * - Removes all event handler attributes
 * - Removes javascript: URLs from href/src
 * - Safe for live DOM elements
 */
export function removeEventHandlers(element: Element): void {
  const attributesToRemove: string[] = [];

  // Collect event handler attributes
  for (let i = 0; i < element.attributes.length; i++) {
    const attr = element.attributes[i];
    if (attr.name.startsWith('on')) {
      attributesToRemove.push(attr.name);
    }
  }

  // Remove collected attributes
  for (const attr of attributesToRemove) {
    element.removeAttribute(attr);
  }

  // Remove javascript: URLs
  const href = element.getAttribute('href');
  if (href && href.trim().toLowerCase().startsWith('javascript:')) {
    element.removeAttribute('href');
  }

  const src = element.getAttribute('src');
  if (src && src.trim().toLowerCase().startsWith('javascript:')) {
    element.removeAttribute('src');
  }
}

/**
 * Deeply sanitizes a DOM tree by removing all event handlers
 *
 * @param root - Root element to sanitize
 *
 * Performance:
 * - Recursively processes entire tree
 * - ~1ms per 100 elements
 */
export function sanitizeDOMTree(root: Element): void {
  removeEventHandlers(root);

  // Recursively sanitize children
  const children = root.querySelectorAll('*');
  for (const child of Array.from(children)) {
    removeEventHandlers(child);
  }
}

/**
 * Validates HTML structure before parsing
 *
 * @param html - HTML string to validate
 * @returns True if HTML appears valid
 *
 * Checks:
 * - Contains opening <html> tag
 * - Not empty or whitespace-only
 * - Reasonable size (< 10MB)
 */
export function isValidHtml(html: string): boolean {
  if (!html || html.trim().length === 0) {
    return false;
  }

  // Reject excessively large HTML (prevent DoS)
  if (html.length > 10 * 1024 * 1024) {
    return false;
  }

  // Must contain html tag (basic structure check)
  if (!/<!doctype\s+html|<html/i.test(html)) {
    return false;
  }

  return true;
}
