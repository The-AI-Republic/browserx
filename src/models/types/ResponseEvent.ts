// Import types from their respective modules
import type { TokenUsage } from './TokenUsage';
import type { RateLimitSnapshot } from './RateLimits';
import type { ResponseItem } from '../../protocol/types';

/**
 * Response events emitted during model streaming
 *
 * This is a discriminated union matching Rust's ResponseEvent enum exactly.
 * Each variant preserves the PascalCase naming from Rust.
 *
 * **Rust Reference**: `codex-rs/core/src/client_common.rs` Lines 71-87
 *
 * **Type Mapping**:
 * - Rust `enum ResponseEvent` → TypeScript discriminated union with `type` field
 * - Rust tuple variants (e.g., `OutputTextDelta(String)`) → object with `delta` field
 * - Rust struct variants → object with named fields
 *
 * **Field Name Convention**:
 * - Event type names: PascalCase (matches Rust)
 * - Field names: camelCase for identifiers (e.g., `responseId`, `callId`)
 * - Field names: snake_case for data structures (e.g., `tokenUsage` contains snake_case fields)
 *
 * @see TokenUsage for token usage field structure
 * @see RateLimitSnapshot for rate limit structure
 */
export type ResponseEvent =
  | { type: 'Created' }  // Rust: Created
  | { type: 'OutputItemDone'; item: ResponseItem }  // Rust: OutputItemDone(ResponseItem)
  | { type: 'Completed'; responseId: string; tokenUsage?: TokenUsage }  // Rust: Completed { response_id: String, usage: Option<TokenUsage> }
  | { type: 'OutputTextDelta'; delta: string }  // Rust: OutputTextDelta(String)
  | { type: 'ReasoningSummaryDelta'; delta: string }  // Rust: ReasoningSummaryDelta(String)
  | { type: 'ReasoningContentDelta'; delta: string }  // Rust: ReasoningContentDelta(String)
  | { type: 'ReasoningSummaryPartAdded' }  // Rust: ReasoningSummaryPartAdded
  | { type: 'WebSearchCallBegin'; callId: string }  // Rust: WebSearchCallBegin(String)
  | { type: 'RateLimits'; snapshot: RateLimitSnapshot };  // Rust: RateLimits(RateLimitSnapshot)


// Type guards for ResponseEvent variants
export function isResponseEvent(obj: any): obj is ResponseEvent {
  return obj && typeof obj.type === 'string';
}

export function isCreated(event: ResponseEvent): event is { type: 'Created' } {
  return event.type === 'Created';
}

export function isOutputItemDone(event: ResponseEvent): event is { type: 'OutputItemDone'; item: ResponseItem } {
  return event.type === 'OutputItemDone';
}

export function isCompleted(event: ResponseEvent): event is { type: 'Completed'; responseId: string; tokenUsage?: TokenUsage } {
  return event.type === 'Completed';
}

export function isOutputTextDelta(event: ResponseEvent): event is { type: 'OutputTextDelta'; delta: string } {
  return event.type === 'OutputTextDelta';
}

export function isReasoningSummaryDelta(event: ResponseEvent): event is { type: 'ReasoningSummaryDelta'; delta: string } {
  return event.type === 'ReasoningSummaryDelta';
}

export function isReasoningContentDelta(event: ResponseEvent): event is { type: 'ReasoningContentDelta'; delta: string } {
  return event.type === 'ReasoningContentDelta';
}

export function isReasoningSummaryPartAdded(event: ResponseEvent): event is { type: 'ReasoningSummaryPartAdded' } {
  return event.type === 'ReasoningSummaryPartAdded';
}

export function isWebSearchCallBegin(event: ResponseEvent): event is { type: 'WebSearchCallBegin'; callId: string } {
  return event.type === 'WebSearchCallBegin';
}

export function isRateLimits(event: ResponseEvent): event is { type: 'RateLimits'; snapshot: RateLimitSnapshot } {
  return event.type === 'RateLimits';
}