/**
 * RetryStrategy - Exponential backoff retry logic for page actions
 * Implements automatic retry with configurable delays for transient failures
 */

import type { ActionError, ErrorCode, RetryConfig } from '../../types/page-actions';
import { DEFAULT_RETRY_CONFIG } from '../../types/page-actions';

export class RetryStrategy {
  private config: RetryConfig;

  constructor(config?: Partial<RetryConfig>) {
    this.config = {
      ...DEFAULT_RETRY_CONFIG,
      ...config
    };
  }

  /**
   * Execute an action with automatic retry on transient failures
   * @param action Function to execute
   * @param actionName Name of the action (for logging)
   * @returns Promise resolving to action result
   */
  async executeWithRetry<T>(
    action: () => Promise<T>,
    actionName: string = 'action'
  ): Promise<T> {
    let lastError: ActionError | undefined;
    let attempt = 0;

    while (attempt < this.config.maxAttempts) {
      try {
        console.log(`[RetryStrategy] Executing ${actionName}, attempt ${attempt + 1}/${this.config.maxAttempts}`);
        const result = await action();

        if (attempt > 0) {
          console.log(`[RetryStrategy] ${actionName} succeeded after ${attempt} retries`);
        }

        return result;
      } catch (error) {
        lastError = this.normalizeError(error);

        // Check if error is retryable
        if (!this.isRetryable(lastError.code)) {
          console.log(`[RetryStrategy] ${actionName} failed with non-retryable error: ${lastError.code}`);
          throw lastError;
        }

        attempt++;

        // If we have more attempts, wait before retrying
        if (attempt < this.config.maxAttempts) {
          const delay = this.getDelay(attempt - 1);
          console.log(`[RetryStrategy] ${actionName} failed (${lastError.code}), retrying in ${delay}ms...`);

          // Call retry callback if provided
          if (this.config.onRetry) {
            this.config.onRetry(attempt, lastError);
          }

          await this.sleep(delay);
        } else {
          console.log(`[RetryStrategy] ${actionName} failed after ${this.config.maxAttempts} attempts`);
        }
      }
    }

    // All retries exhausted
    throw lastError || new Error(`${actionName} failed after ${this.config.maxAttempts} attempts`);
  }

  /**
   * Check if an error code is retryable
   */
  private isRetryable(errorCode: ErrorCode): boolean {
    return this.config.retryableErrors.includes(errorCode);
  }

  /**
   * Get delay for specific attempt (0-indexed)
   */
  private getDelay(attemptIndex: number): number {
    if (attemptIndex < this.config.delays.length) {
      return this.config.delays[attemptIndex];
    }
    // If we've exhausted the delays array, use the last delay value
    return this.config.delays[this.config.delays.length - 1] || 0;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Normalize any error to ActionError format
   */
  private normalizeError(error: any): ActionError {
    if (this.isActionError(error)) {
      return error;
    }

    // Convert unknown errors to ActionError format
    return {
      code: 'UNKNOWN_ERROR',
      message: error?.message || String(error),
      category: 'execution',
      recoverable: false,
      details: error
    };
  }

  /**
   * Type guard for ActionError
   */
  private isActionError(error: any): error is ActionError {
    return (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      'message' in error &&
      'category' in error &&
      'recoverable' in error
    );
  }

  /**
   * Get current retry configuration
   */
  getConfig(): RetryConfig {
    return { ...this.config };
  }

  /**
   * Update retry configuration
   */
  updateConfig(config: Partial<RetryConfig>): void {
    this.config = {
      ...this.config,
      ...config
    };
  }
}
