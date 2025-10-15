/**
 * Conversation listing with cursor-based pagination
 * Queries IndexedDB for rollout summaries ordered by update time
 */

import type { ConversationsPage, Cursor, ConversationItem, RolloutMetadataRecord } from './types';
import { isValidUUID, createDatabaseError } from './helpers';

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'CodexRollouts';
const STORE_ROLLOUTS = 'rollouts';
const STORE_ROLLOUT_ITEMS = 'rollout_items';
const MAX_SCAN = 100; // Maximum records to scan per query

// ============================================================================
// Public API
// ============================================================================

/**
 * List conversations with cursor-based pagination.
 * @param pageSize - Number of items to return (1-100)
 * @param cursor - Optional cursor for pagination
 * @returns Promise resolving to ConversationsPage
 */
export async function listConversations(
  pageSize: number,
  cursor?: Cursor
): Promise<ConversationsPage> {
  // Validate page size
  if (pageSize < 1 || pageSize > 100) {
    throw new Error('Invalid page size: must be between 1 and 100');
  }

  // Validate cursor if provided
  if (cursor) {
    if (isNaN(cursor.timestamp) || !isValidUUID(cursor.id)) {
      throw new Error('Invalid cursor: timestamp or ID is malformed');
    }
  }

  // Open database
  const db = await openDatabase();

  try {
    const result = await queryConversations(db, pageSize, cursor);
    return result;
  } finally {
    db.close();
  }
}

// ============================================================================
// Internal Implementation
// ============================================================================

/**
 * Open IndexedDB database for reading.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(createDatabaseError('open', request.error?.message || 'unknown error'));
  });
}

/**
 * Query conversations from IndexedDB with pagination.
 */
async function queryConversations(
  db: IDBDatabase,
  pageSize: number,
  cursor?: Cursor
): Promise<ConversationsPage> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_ROLLOUTS, STORE_ROLLOUT_ITEMS], 'readonly');
    const rolloutsStore = tx.objectStore(STORE_ROLLOUTS);
    const itemsStore = tx.objectStore(STORE_ROLLOUT_ITEMS);
    const updatedIndex = rolloutsStore.index('updated');

    const items: ConversationItem[] = [];
    let numScanned = 0;
    let reachedCap = false;

    // Set up key range for cursor-based pagination
    let keyRange: IDBKeyRange | undefined;
    if (cursor) {
      // Query items with updated <= cursor.timestamp
      keyRange = IDBKeyRange.upperBound([cursor.timestamp, cursor.id], true);
    }

    // Open cursor on updated index (descending order)
    const cursorRequest = updatedIndex.openCursor(keyRange, 'prev');

    cursorRequest.onsuccess = async (event) => {
      const idbCursor = (event.target as IDBRequest<IDBCursorWithValue>).result;

      if (!idbCursor || items.length >= pageSize || numScanned >= MAX_SCAN) {
        // Done scanning
        if (numScanned >= MAX_SCAN) {
          reachedCap = true;
        }

        // Build nextCursor from last item
        const nextCursor = buildNextCursor(items);

        resolve({
          items,
          nextCursor,
          numScanned,
          reachedCap,
        });
        return;
      }

      numScanned++;
      const metadata = idbCursor.value as RolloutMetadataRecord;

      // Filter: must have SessionMeta
      if (!metadata.sessionMeta) {
        idbCursor.continue();
        return;
      }

      // Load head and tail records
      const { head, tail } = await loadHeadTail(itemsStore, metadata.id);

      const item: ConversationItem = {
        id: metadata.id,
        rolloutId: metadata.id,
        head,
        tail,
        created: metadata.created,
        updated: metadata.updated,
        sessionMeta: metadata.sessionMeta,
        itemCount: metadata.itemCount,
      };

      items.push(item);
      idbCursor.continue();
    };

    cursorRequest.onerror = () =>
      reject(createDatabaseError('query', cursorRequest.error?.message || 'unknown error'));

    tx.onerror = () => reject(createDatabaseError('transaction', tx.error?.message || 'unknown error'));
  });
}

/**
 * Load head (first N) and tail (last N) records for a rollout.
 */
async function loadHeadTail(
  itemsStore: IDBObjectStore,
  rolloutId: string
): Promise<{ head: any[]; tail: any[] }> {
  return new Promise((resolve, reject) => {
    const index = itemsStore.index('rolloutId_sequence');
    const keyRange = IDBKeyRange.bound([rolloutId, 0], [rolloutId, Number.MAX_SAFE_INTEGER]);
    const request = index.getAll(keyRange, 10); // Get first 10 items

    request.onsuccess = () => {
      const allItems = request.result || [];
      const head = allItems.slice(0, 5); // First 5
      const tail = allItems.slice(-5); // Last 5
      resolve({ head, tail });
    };

    request.onerror = () => reject(createDatabaseError('loadHeadTail', request.error?.message || 'unknown error'));
  });
}

/**
 * Build nextCursor from the last item in results.
 */
function buildNextCursor(items: ConversationItem[]): Cursor | undefined {
  if (items.length === 0) {
    return undefined;
  }

  const lastItem = items[items.length - 1];
  return {
    timestamp: lastItem.updated,
    id: lastItem.id,
  };
}
