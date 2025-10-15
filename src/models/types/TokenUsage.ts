/**
 * Token usage statistics matching Rust's TokenUsage struct
 *
 * Rust Reference: codex-rs/protocol/src/protocol.rs TokenUsage struct
 * ✅ ALIGNED: All field names use snake_case matching Rust exactly
 */
export interface TokenUsage {
  input_tokens: number;  // Rust: input_tokens: u64
  cached_input_tokens: number;  // Rust: cached_input_tokens: u64
  output_tokens: number;  // Rust: output_tokens: u64
  reasoning_output_tokens: number;  // Rust: reasoning_output_tokens: u64
  total_tokens: number;  // Rust: total_tokens: u64
}

/**
 * Session-level token usage aggregation
 */
export interface TokenUsageInfo {
  total_token_usage: TokenUsage;
  last_token_usage: TokenUsage;
  model_context_window?: number;
  auto_compact_token_limit?: number;
}

/**
 * Creates a zero-initialized TokenUsage instance
 */
export function createEmptyTokenUsage(): TokenUsage {
  return {
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
  };
}

/**
 * Creates a zero-initialized TokenUsageInfo instance
 */
export function createEmptyTokenUsageInfo(
  contextWindow?: number,
  autoCompactLimit?: number
): TokenUsageInfo {
  return {
    total_token_usage: createEmptyTokenUsage(),
    last_token_usage: createEmptyTokenUsage(),
    model_context_window: contextWindow,
    auto_compact_token_limit: autoCompactLimit,
  };
}

/**
 * Aggregates token usage by adding values from multiple TokenUsage objects
 */
export function aggregateTokenUsage(usages: TokenUsage[]): TokenUsage {
  const aggregated = createEmptyTokenUsage();

  for (const usage of usages) {
    aggregated.input_tokens += usage.input_tokens;
    aggregated.cached_input_tokens += usage.cached_input_tokens;
    aggregated.output_tokens += usage.output_tokens;
    aggregated.reasoning_output_tokens += usage.reasoning_output_tokens;
    aggregated.total_tokens += usage.total_tokens;
  }

  return aggregated;
}

/**
 * Adds two TokenUsage objects together
 */
export function addTokenUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    input_tokens: a.input_tokens + b.input_tokens,
    cached_input_tokens: a.cached_input_tokens + b.cached_input_tokens,
    output_tokens: a.output_tokens + b.output_tokens,
    reasoning_output_tokens: a.reasoning_output_tokens + b.reasoning_output_tokens,
    total_tokens: a.total_tokens + b.total_tokens,
  };
}

/**
 * Updates TokenUsageInfo with new usage data
 */
export function updateTokenUsageInfo(
  info: TokenUsageInfo,
  newUsage: TokenUsage
): TokenUsageInfo {
  return {
    ...info,
    total_token_usage: addTokenUsage(info.total_token_usage, newUsage),
    last_token_usage: newUsage,
  };
}

/**
 * Type guard to check if object is a valid TokenUsage
 */
export function isTokenUsage(obj: any): obj is TokenUsage {
  return obj &&
    typeof obj.input_tokens === 'number' &&
    typeof obj.cached_input_tokens === 'number' &&
    typeof obj.output_tokens === 'number' &&
    typeof obj.reasoning_output_tokens === 'number' &&
    typeof obj.total_tokens === 'number';
}

/**
 * Type guard to check if object is a valid TokenUsageInfo
 */
export function isTokenUsageInfo(obj: any): obj is TokenUsageInfo {
  return obj &&
    isTokenUsage(obj.total_token_usage) &&
    isTokenUsage(obj.last_token_usage) &&
    (obj.model_context_window === undefined || typeof obj.model_context_window === 'number') &&
    (obj.auto_compact_token_limit === undefined || typeof obj.auto_compact_token_limit === 'number');
}