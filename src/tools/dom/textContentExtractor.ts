/**
 * Text Content Extractor
 *
 * Purpose: Extract visible text content from article-like containers
 *
 * Feature: 038-implement-captureinteractioncontent-request (enhancement)
 */

import { CONSTRAINTS } from './pageModel';

/**
 * Extracts visible text content from article-like containers
 *
 * Prioritizes content from:
 * - <article> elements
 * - <main> elements
 * - <p> elements with substantial text
 * - <div> elements with substantial text
 *
 * @param doc - Document to extract text from
 * @param windowContext - Window context for visibility checks
 * @returns Array of text content blocks
 */
export function extractTextContent(doc: Document, windowContext: Window): string[] {
  const textBlocks: string[] = [];
  const seenTexts = new Set<string>(); // Deduplicate text

  // Priority 1: Look for article elements first
  const articles = doc.querySelectorAll('article');
  for (const article of Array.from(articles)) {
    if (isVisible(article, windowContext)) {
      extractTextFromContainer(article, textBlocks, seenTexts);
    }
  }

  // Priority 2: Look for main content area
  const mainElements = doc.querySelectorAll('main, [role="main"]');
  for (const main of Array.from(mainElements)) {
    if (isVisible(main, windowContext)) {
      extractTextFromContainer(main, textBlocks, seenTexts);
    }
  }

  // Priority 3: Look for content-heavy divs and sections
  const contentContainers = doc.querySelectorAll(
    'div.content, div.article, div.post, section.content, section.article, div[class*="article"], div[class*="content"]'
  );
  for (const container of Array.from(contentContainers)) {
    if (isVisible(container, windowContext)) {
      extractTextFromContainer(container, textBlocks, seenTexts);
    }
  }

  // Priority 4: Collect all paragraph elements
  const paragraphs = doc.querySelectorAll('p');
  for (const p of Array.from(paragraphs)) {
    if (isVisible(p, windowContext)) {
      const text = cleanText(p.textContent || '');
      if (text &&
          text.length >= CONSTRAINTS.MIN_TEXT_BLOCK_LENGTH &&
          !seenTexts.has(text)) {
        seenTexts.add(text);
        textBlocks.push(truncateText(text));
      }
    }
  }

  // Cap at max blocks
  if (textBlocks.length > CONSTRAINTS.MAX_TEXT_CONTENT_BLOCKS) {
    return textBlocks.slice(0, CONSTRAINTS.MAX_TEXT_CONTENT_BLOCKS);
  }

  return textBlocks;
}

/**
 * Extract text from a container element
 * Looks for paragraphs and text-heavy divs within the container
 */
function extractTextFromContainer(
  container: Element,
  textBlocks: string[],
  seenTexts: Set<string>
): void {
  // Find all text-bearing elements within this container
  const textElements = container.querySelectorAll('p, div, section, li');

  for (const element of Array.from(textElements)) {
    // Skip if element contains other structural elements (likely a wrapper)
    if (element.querySelector('article, main, section, div')) {
      continue;
    }

    const text = cleanText(element.textContent || '');
    if (text &&
        text.length >= CONSTRAINTS.MIN_TEXT_BLOCK_LENGTH &&
        !seenTexts.has(text)) {
      seenTexts.add(text);
      textBlocks.push(truncateText(text));

      // Stop if we've collected enough
      if (textBlocks.length >= CONSTRAINTS.MAX_TEXT_CONTENT_BLOCKS) {
        break;
      }
    }
  }
}

/**
 * Check if element is visible
 */
function isVisible(element: Element, windowContext: Window): boolean {
  try {
    // Check computed styles
    const styles = windowContext.getComputedStyle(element);

    if (styles.display === 'none') return false;
    if (styles.visibility === 'hidden') return false;
    if (styles.visibility === 'collapse') return false;

    const opacity = parseFloat(styles.opacity || '1');
    if (opacity === 0) return false;

    // Check bounding box
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      // Could be JSDOM - check if ALL elements have zero bounds
      const body = element.ownerDocument?.body;
      if (body) {
        const bodyRect = body.getBoundingClientRect();
        // If body also has zero bounds, we're in JSDOM - treat as visible
        if (bodyRect.width === 0 && bodyRect.height === 0) {
          return true;
        }
      }
      return false;
    }

    return true;
  } catch (error) {
    // If we can't determine visibility, assume visible
    return true;
  }
}

/**
 * Clean text by removing extra whitespace and normalizing
 */
function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ') // Replace multiple whitespace with single space
    .replace(/\n+/g, ' ') // Replace newlines with space
    .trim();
}

/**
 * Truncate text to max length
 */
function truncateText(text: string): string {
  if (text.length <= CONSTRAINTS.MAX_TEXT_BLOCK_LENGTH) {
    return text;
  }

  // Truncate at word boundary
  const truncated = text.substring(0, CONSTRAINTS.MAX_TEXT_BLOCK_LENGTH);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > CONSTRAINTS.MAX_TEXT_BLOCK_LENGTH * 0.8) {
    return truncated.substring(0, lastSpace) + '...';
  }

  return truncated + '...';
}
