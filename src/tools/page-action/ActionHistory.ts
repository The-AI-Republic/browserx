/**
 * ActionHistory - Session-based circular buffer for action tracking
 * Stores up to 100 most recent action execution results
 */

import { v4 as uuidv4 } from 'uuid';
import type { ActionHistoryEntry, ActionExecutionResult } from '../../types/page-actions';

export class ActionHistory {
  private static instance: ActionHistory;
  private history: ActionHistoryEntry[] = [];
  private readonly maxEntries: number = 100;
  private sequenceCounter: Map<string, number> = new Map();

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance
   */
  static getInstance(): ActionHistory {
    if (!ActionHistory.instance) {
      ActionHistory.instance = new ActionHistory();
    }
    return ActionHistory.instance;
  }

  /**
   * Add an action result to history
   * @param result Action execution result
   * @param sessionId Session identifier
   * @returns The created history entry
   */
  addEntry(result: ActionExecutionResult, sessionId: string): ActionHistoryEntry {
    // Get next sequence number for this session
    const currentSequence = this.sequenceCounter.get(sessionId) || 0;
    const nextSequence = currentSequence + 1;
    this.sequenceCounter.set(sessionId, nextSequence);

    const entry: ActionHistoryEntry = {
      id: uuidv4(),
      sessionId,
      result,
      timestamp: new Date().toISOString(),
      sequence: nextSequence
    };

    // Add to history
    this.history.push(entry);

    // Evict oldest entries if we exceed maxEntries
    if (this.history.length > this.maxEntries) {
      const removed = this.history.shift();
      console.log(`[ActionHistory] Evicted oldest entry: ${removed?.id}`);
    }

    console.log(`[ActionHistory] Added entry ${entry.id} (session: ${sessionId}, sequence: ${nextSequence})`);

    return entry;
  }

  /**
   * Get all entries for a specific session
   * @param sessionId Session identifier
   * @returns Array of history entries for the session
   */
  getBySession(sessionId: string): ActionHistoryEntry[] {
    return this.history.filter(entry => entry.sessionId === sessionId);
  }

  /**
   * Get the most recent N entries across all sessions
   * @param count Number of entries to retrieve
   * @returns Array of most recent entries
   */
  getRecent(count: number = 10): ActionHistoryEntry[] {
    const startIndex = Math.max(0, this.history.length - count);
    return this.history.slice(startIndex);
  }

  /**
   * Get entry by ID
   * @param id Entry identifier
   * @returns History entry or undefined
   */
  getById(id: string): ActionHistoryEntry | undefined {
    return this.history.find(entry => entry.id === id);
  }

  /**
   * Get all entries (entire history)
   * @returns Array of all history entries
   */
  getAll(): ActionHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Get entries that failed
   * @param sessionId Optional session filter
   * @returns Array of failed action entries
   */
  getFailures(sessionId?: string): ActionHistoryEntry[] {
    let entries = sessionId ? this.getBySession(sessionId) : this.history;
    return entries.filter(entry => !entry.result.success);
  }

  /**
   * Get entries that succeeded
   * @param sessionId Optional session filter
   * @returns Array of successful action entries
   */
  getSuccesses(sessionId?: string): ActionHistoryEntry[] {
    let entries = sessionId ? this.getBySession(sessionId) : this.history;
    return entries.filter(entry => entry.result.success);
  }

  /**
   * Get statistics for a session
   * @param sessionId Session identifier
   * @returns Session statistics
   */
  getSessionStats(sessionId: string): {
    total: number;
    successful: number;
    failed: number;
    successRate: number;
    avgDuration: number;
  } {
    const entries = this.getBySession(sessionId);

    if (entries.length === 0) {
      return {
        total: 0,
        successful: 0,
        failed: 0,
        successRate: 0,
        avgDuration: 0
      };
    }

    const successful = entries.filter(e => e.result.success).length;
    const failed = entries.length - successful;
    const totalDuration = entries.reduce((sum, e) => sum + e.result.duration, 0);

    return {
      total: entries.length,
      successful,
      failed,
      successRate: (successful / entries.length) * 100,
      avgDuration: totalDuration / entries.length
    };
  }

  /**
   * Clear all history (called on browser/extension restart)
   */
  clear(): void {
    console.log('[ActionHistory] Clearing all history');
    this.history = [];
    this.sequenceCounter.clear();
  }

  /**
   * Clear history for a specific session
   * @param sessionId Session identifier
   */
  clearSession(sessionId: string): void {
    console.log(`[ActionHistory] Clearing session: ${sessionId}`);
    this.history = this.history.filter(entry => entry.sessionId !== sessionId);
    this.sequenceCounter.delete(sessionId);
  }

  /**
   * Get current history size
   * @returns Number of entries in history
   */
  getSize(): number {
    return this.history.length;
  }

  /**
   * Get maximum capacity
   * @returns Maximum number of entries
   */
  getMaxSize(): number {
    return this.maxEntries;
  }

  /**
   * Check if history is at capacity
   * @returns true if history has reached max entries
   */
  isFull(): boolean {
    return this.history.length >= this.maxEntries;
  }

  /**
   * Get entries within a time range
   * @param startTime Start timestamp (ISO string or Date)
   * @param endTime End timestamp (ISO string or Date)
   * @returns Array of entries within time range
   */
  getByTimeRange(startTime: string | Date, endTime: string | Date): ActionHistoryEntry[] {
    const start = typeof startTime === 'string' ? new Date(startTime) : startTime;
    const end = typeof endTime === 'string' ? new Date(endTime) : endTime;

    return this.history.filter(entry => {
      const entryTime = new Date(entry.timestamp);
      return entryTime >= start && entryTime <= end;
    });
  }
}
