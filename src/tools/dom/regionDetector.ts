/**
 * Region Detector Module
 *
 * Purpose: Detect landmark regions (main, nav, header, footer, aside, dialog, search)
 *
 * Feature: 038-implement-captureinteractioncontent-request
 * Reference: specs/038-implement-captureinteractioncontent-request/data-model.md - PageModel.regions
 */

import type { LandmarkRegion } from './pageModel';

/**
 * Detects landmark regions present in document
 *
 * @param document - Document to analyze
 * @returns Unique list of landmark region types
 *
 * Strategy:
 * - Queries for landmark elements (main, nav, header, footer, aside)
 * - Queries for elements with landmark roles
 * - Returns unique list of region types (no duplicates)
 */
export function detectRegions(document: Document): LandmarkRegion[] {
  const regions = new Set<LandmarkRegion>();

  // HTML5 landmark elements
  const landmarkElements = document.querySelectorAll('main, nav, header, footer, aside, dialog');

  for (const element of Array.from(landmarkElements)) {
    const region = getRegionFromElement(element);
    if (region) {
      regions.add(region);
    }
  }

  // Elements with explicit role attributes
  const roleElements = document.querySelectorAll('[role]');

  for (const element of Array.from(roleElements)) {
    const role = element.getAttribute('role');
    if (role && isLandmarkRole(role)) {
      regions.add(role as LandmarkRegion);
    }
  }

  return Array.from(regions);
}

/**
 * Gets landmark region from an element
 *
 * @param element - Element to check
 * @returns LandmarkRegion or null
 *
 * Priority:
 * 1. Explicit role attribute
 * 2. Implicit role from tag name
 */
export function getRegionFromElement(element: Element): LandmarkRegion | null {
  // Priority 1: Explicit role
  const role = element.getAttribute('role');
  if (role && isLandmarkRole(role)) {
    return role as LandmarkRegion;
  }

  // Priority 2: Implicit role from tag name
  const tagName = element.tagName.toLowerCase();
  return getImplicitRegion(tagName);
}

/**
 * Gets implicit landmark region from tag name
 *
 * @param tagName - HTML tag name (lowercase)
 * @returns LandmarkRegion or null
 */
function getImplicitRegion(tagName: string): LandmarkRegion | null {
  switch (tagName) {
    case 'main':
      return 'main';
    case 'nav':
      return 'navigation';
    case 'header':
      return 'header';
    case 'footer':
      return 'footer';
    case 'aside':
      return 'aside';
    case 'dialog':
      return 'dialog';
    default:
      return null;
  }
}

/**
 * Checks if a role is a landmark role
 *
 * @param role - Role string
 * @returns True if role is a landmark
 */
function isLandmarkRole(role: string): boolean {
  const landmarkRoles: LandmarkRegion[] = [
    'main',
    'navigation',
    'header',
    'footer',
    'aside',
    'dialog',
    'search',
    'nav',
    'region',
  ];

  return landmarkRoles.includes(role as LandmarkRegion);
}

/**
 * Finds the containing landmark region for an element
 *
 * @param element - Element to find region for
 * @returns Containing LandmarkRegion or null
 *
 * Strategy:
 * - Walks up the DOM tree
 * - Returns first landmark ancestor
 * - Prioritizes most specific landmark (e.g., search > main)
 */
export function findContainingRegion(element: Element): LandmarkRegion | null {
  let current = element.parentElement;

  while (current) {
    const region = getRegionFromElement(current);
    if (region) {
      return region;
    }

    current = current.parentElement;
  }

  return null;
}

/**
 * Gets the most specific landmark region for an element
 *
 * @param element - Element to check
 * @returns Most specific LandmarkRegion
 *
 * Precedence (most specific first):
 * 1. search
 * 2. navigation
 * 3. dialog
 * 4. aside
 * 5. main
 * 6. header
 * 7. footer
 * 8. region
 */
export function getMostSpecificRegion(element: Element): LandmarkRegion | null {
  const ancestors: LandmarkRegion[] = [];
  let current: Element | null = element;

  // Collect all landmark ancestors
  while (current) {
    const region = getRegionFromElement(current);
    if (region) {
      ancestors.push(region);
    }

    current = current.parentElement;
  }

  // Return most specific (first in precedence order)
  const precedence: LandmarkRegion[] = [
    'search',
    'navigation',
    'dialog',
    'aside',
    'main',
    'header',
    'footer',
    'region',
  ];

  for (const region of precedence) {
    if (ancestors.includes(region)) {
      return region;
    }
  }

  return null;
}

/**
 * Checks if element is inside a specific region type
 *
 * @param element - Element to check
 * @param regionType - Region type to check for
 * @returns True if element is inside region
 */
export function isInsideRegion(element: Element, regionType: LandmarkRegion): boolean {
  let current = element.parentElement;

  while (current) {
    const region = getRegionFromElement(current);
    if (region === regionType) {
      return true;
    }

    current = current.parentElement;
  }

  return false;
}
