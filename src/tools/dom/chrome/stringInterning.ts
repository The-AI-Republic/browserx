/**
 * String Interning for Efficient Message Transfer
 *
 * Reduces message size by storing repeated strings once and referencing
 * them by index. Common strings like tag names ("div", "button") and
 * attribute names ("class", "id") appear many times in a DOM tree.
 *
 * String interning can reduce payload size by 60-70%.
 */

/**
 * String pool for interning strings
 */
export class StringPool {
  private strings: string[] = [];
  private stringToIndex: Map<string, number> = new Map();

  /**
   * Create a new string pool
   */
  constructor() {
    this.reset();
  }

  /**
   * Intern a string and return its index
   *
   * If the string has been seen before, returns the existing index.
   * Otherwise, adds the string to the pool and returns a new index.
   *
   * @param str - String to intern
   * @returns Index of the string in the pool
   */
  internString(str: string): number {
    // Check if string already exists
    const existingIndex = this.stringToIndex.get(str);
    if (existingIndex !== undefined) {
      return existingIndex;
    }

    // Add new string to pool
    const index = this.strings.length;
    this.strings.push(str);
    this.stringToIndex.set(str, index);

    return index;
  }

  /**
   * Get string by index
   *
   * @param index - Index of the string
   * @returns String at the index, or undefined if index is out of bounds
   */
  getString(index: number): string | undefined {
    return this.strings[index];
  }

  /**
   * Get all strings in the pool
   *
   * @returns Array of all strings
   */
  getAllStrings(): string[] {
    return [...this.strings];
  }

  /**
   * Get the size of the string pool
   *
   * @returns Number of unique strings in the pool
   */
  size(): number {
    return this.strings.length;
  }

  /**
   * Calculate total bytes used by all strings
   *
   * @returns Total byte size of all strings
   */
  totalBytes(): number {
    return this.strings.reduce((total, str) => total + str.length * 2, 0); // UTF-16
  }

  /**
   * Reset the string pool
   */
  reset(): void {
    this.strings = [];
    this.stringToIndex.clear();
  }

  /**
   * Export the string pool for transfer
   *
   * @returns Array of strings
   */
  export(): string[] {
    return this.getAllStrings();
  }

  /**
   * Import a string pool from transfer
   *
   * @param strings - Array of strings to import
   */
  import(strings: string[]): void {
    this.reset();
    for (let i = 0; i < strings.length; i++) {
      this.strings.push(strings[i]);
      this.stringToIndex.set(strings[i], i);
    }
  }
}

/**
 * Intern an object's string values using a string pool
 *
 * Recursively processes an object and replaces string values with
 * interned indices. The original object is not modified; a new object
 * with interned values is returned.
 *
 * @param obj - Object to intern
 * @param pool - String pool to use
 * @returns New object with interned string values
 */
export function internObject(obj: any, pool: StringPool): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return pool.internString(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => internObject(item, pool));
  }

  if (typeof obj === 'object') {
    const interned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        interned[key] = internObject(obj[key], pool);
      }
    }
    return interned;
  }

  return obj;
}

/**
 * Restore an object's string values from a string pool
 *
 * Reverses the interning process by replacing indices with their
 * corresponding strings from the pool.
 *
 * @param obj - Object with interned values
 * @param pool - String pool to use
 * @returns Object with restored string values
 */
export function restoreObject(obj: any, pool: StringPool): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'number') {
    // Could be an interned string index
    const str = pool.getString(obj);
    return str !== undefined ? str : obj;
  }

  if (typeof obj === 'string' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => restoreObject(item, pool));
  }

  if (typeof obj === 'object') {
    const restored: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        restored[key] = restoreObject(obj[key], pool);
      }
    }
    return restored;
  }

  return obj;
}

/**
 * Calculate size reduction from string interning
 *
 * @param original - Original object
 * @param interned - Interned object
 * @param pool - String pool
 * @returns Size reduction stats
 */
export function calculateSizeReduction(
  original: any,
  interned: any,
  pool: StringPool
): {
  originalSize: number;
  internedSize: number;
  poolSize: number;
  totalSize: number;
  reduction: number;
  reductionPercent: number;
} {
  const originalSize = JSON.stringify(original).length;
  const internedSize = JSON.stringify(interned).length;
  const poolSize = JSON.stringify(pool.export()).length;
  const totalSize = internedSize + poolSize;
  const reduction = originalSize - totalSize;
  const reductionPercent = (reduction / originalSize) * 100;

  return {
    originalSize,
    internedSize,
    poolSize,
    totalSize,
    reduction,
    reductionPercent
  };
}

/**
 * Strategy for selective string interning
 *
 * Only intern strings that appear multiple times and are worth the overhead.
 */
export class SelectiveStringPool extends StringPool {
  private stringCounts: Map<string, number> = new Map();
  private minOccurrences: number;
  private finalized: boolean = false;

  /**
   * Create a selective string pool
   *
   * @param minOccurrences - Minimum number of occurrences before interning
   */
  constructor(minOccurrences: number = 2) {
    super();
    this.minOccurrences = minOccurrences;
  }

  /**
   * Record a string occurrence (first pass)
   *
   * @param str - String to record
   */
  recordString(str: string): void {
    const count = this.stringCounts.get(str) || 0;
    this.stringCounts.set(str, count + 1);
  }

  /**
   * Finalize the pool after recording all strings
   *
   * Only strings that appear at least minOccurrences times will be interned.
   */
  finalize(): void {
    if (this.finalized) {
      return;
    }

    // Pre-populate pool with frequently occurring strings
    for (const [str, count] of this.stringCounts.entries()) {
      if (count >= this.minOccurrences) {
        super.internString(str);
      }
    }

    this.finalized = true;
  }

  /**
   * Intern a string (only if it meets the threshold)
   *
   * @param str - String to intern
   * @returns Index if interned, or the original string
   */
  internString(str: string): number | string {
    if (!this.finalized) {
      throw new Error('Must call finalize() before interning strings');
    }

    const count = this.stringCounts.get(str) || 0;
    if (count >= this.minOccurrences) {
      return super.internString(str);
    }

    // Don't intern - return original string
    return str;
  }
}
