/**
 * CompactTask - History compaction task
 *
 * Implements conversation history compaction to reduce token usage.
 * This task is triggered automatically when token limits are approached
 * or manually via the Compact operation.
 */

import type { SessionTask } from './SessionTask';
import type { Session } from '../Session';
import type { TurnContext } from '../TurnContext';
import type { InputItem } from '../../protocol/types';
import type { TaskKind } from '../session/state/types';

/**
 * CompactTask implementation
 * Handles history compaction to stay within token limits
 */
export class CompactTask implements SessionTask {
  /**
   * Return task kind
   */
  kind(): TaskKind {
    return 'Compact';
  }

  /**
   * Execute compaction task
   *
   * Calls session.compact() to reduce history size
   * Emits compaction events for monitoring
   */
  async run(
    session: Session,
    context: TurnContext,
    subId: string,
    input: InputItem[]
  ): Promise<string | null> {
    try {
      // Emit background event indicating compaction started
      await session.notifyBackgroundEvent?.(
        'History compaction started',
        'info'
      );

      // Get history size before compaction
      const historyBefore = session.getConversationHistory().items.length;

      // Perform compaction
      await session.compact();

      // Get history size after compaction
      const historyAfter = session.getConversationHistory().items.length;

      // Emit background event indicating compaction completed
      await session.notifyBackgroundEvent?.(
        `History compaction completed: ${historyBefore} → ${historyAfter} items`,
        'info'
      );

      // Compaction tasks don't produce assistant messages
      return null;
    } catch (error) {
      console.error('CompactTask execution error:', error);

      // Emit error event
      await session.notifyBackgroundEvent?.(
        `History compaction failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error'
      );

      throw error;
    }
  }

  /**
   * Abort compaction
   * Compaction is atomic, so abort is minimal cleanup
   */
  async abort(session: Session, subId: string): Promise<void> {
    // Compaction is atomic - no cleanup needed
    // Just log that compaction was aborted
    console.log(`CompactTask aborted for submission ${subId}`);
  }
}
