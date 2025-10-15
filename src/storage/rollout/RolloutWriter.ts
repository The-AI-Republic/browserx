/**
 * IndexedDB writer for RolloutRecorder
 * Handles async write operations with batching and sequence management
 */

import type { ConversationId, RolloutItem, RolloutMetadataRecord } from './types';
import { formatTimestamp } from './helpers';

// ============================================================================
// Constants
// ============================================================================

const DB_NAME = 'CodexRollouts';
const DB_VERSION = 1;
const STORE_ROLLOUTS = 'rollouts';
const STORE_ROLLOUT_ITEMS = 'rollout_items';

// ============================================================================
// RolloutWriter Class
// ============================================================================

/**
 * Manages async write operations to IndexedDB for rollout data.
 * Batches writes for performance and maintains sequence numbers.
 */
export class RolloutWriter {
  private db: IDBDatabase | null = null;
  private writeQueue: Promise<void> = Promise.resolve();
  private currentSequence: number;
  private rolloutId: ConversationId;
  private closed = false;

  private constructor(db: IDBDatabase, rolloutId: ConversationId, startSequence: number) {
    this.db = db;
    this.rolloutId = rolloutId;
    this.currentSequence = startSequence;
  }

  /**
   * Create a new RolloutWriter instance.
   * @param rolloutId - Conversation ID for this rollout
   * @param startSequence - Starting sequence number (default 0)
   * @returns Promise resolving to RolloutWriter instance
   */
  static async create(rolloutId: ConversationId, startSequence = 0): Promise<RolloutWriter> {
    const db = await RolloutWriter.openDatabase();
    return new RolloutWriter(db, rolloutId, startSequence);
  }

  /**
   * Open or create the IndexedDB database.
   * @returns Promise resolving to IDBDatabase
   */
  private static openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create rollouts object store
        if (!db.objectStoreNames.contains(STORE_ROLLOUTS)) {
          const rolloutsStore = db.createObjectStore(STORE_ROLLOUTS, { keyPath: 'id' });
          rolloutsStore.createIndex('created', 'created', { unique: false });
          rolloutsStore.createIndex('updated', 'updated', { unique: false });
          rolloutsStore.createIndex('expiresAt', 'expiresAt', { unique: false });
          rolloutsStore.createIndex('status', 'status', { unique: false });
        }

        // Create rollout_items object store
        if (!db.objectStoreNames.contains(STORE_ROLLOUT_ITEMS)) {
          const itemsStore = db.createObjectStore(STORE_ROLLOUT_ITEMS, {
            keyPath: 'id',
            autoIncrement: true,
          });
          itemsStore.createIndex('rolloutId', 'rolloutId', { unique: false });
          itemsStore.createIndex('timestamp', 'timestamp', { unique: false });
          itemsStore.createIndex('rolloutId_sequence', ['rolloutId', 'sequence'], {
            unique: true,
          });
        }
      };
    });
  }

  /**
   * Add items to the write queue.
   * Items will be written in a batched transaction.
   * @param rolloutId - Conversation ID
   * @param items - Array of rollout items to persist
   */
  async addItems(rolloutId: ConversationId, items: RolloutItem[]): Promise<void> {
    if (this.closed) {
      throw new Error('Writer is closed');
    }

    if (items.length === 0) {
      return;
    }

    // Chain this write operation to the queue
    this.writeQueue = this.writeQueue.then(async () => {
      await this.writeItemsBatch(rolloutId, items);
    });

    return this.writeQueue;
  }

  /**
   * Write a batch of items to IndexedDB.
   * @param rolloutId - Conversation ID
   * @param items - Array of items to write
   */
  private async writeItemsBatch(rolloutId: ConversationId, items: RolloutItem[]): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction([STORE_ROLLOUT_ITEMS, STORE_ROLLOUTS], 'readwrite');
      const itemsStore = tx.objectStore(STORE_ROLLOUT_ITEMS);
      const rolloutsStore = tx.objectStore(STORE_ROLLOUTS);

      // Write each item with sequential sequence number
      for (const item of items) {
        const record = {
          rolloutId,
          timestamp: formatTimestamp(),
          sequence: this.currentSequence++,
          type: item.type,
          payload: item.payload,
        };

        itemsStore.add(record);
      }

      // Update rollout metadata
      const getRequest = rolloutsStore.get(rolloutId);
      getRequest.onsuccess = () => {
        const metadata = getRequest.result as RolloutMetadataRecord | undefined;
        if (metadata) {
          metadata.itemCount += items.length;
          metadata.updated = Date.now();
          rolloutsStore.put(metadata);
        }
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Transaction failed: ${tx.error?.message}`));
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  }

  /**
   * Wait for all pending writes to complete.
   */
  async flush(): Promise<void> {
    return this.writeQueue;
  }

  /**
   * Close the database connection.
   */
  async close(): Promise<void> {
    await this.flush();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.closed = true;
  }

  /**
   * Get the current sequence number.
   */
  getCurrentSequence(): number {
    return this.currentSequence;
  }
}
