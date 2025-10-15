/**
 * Model clients for codex-chrome extension
 * Exports all model client components
 */

// Base classes and interfaces
export {
  ModelClient,
  ModelClientError,
  type CompletionRequest,
  type CompletionResponse,
  type StreamChunk,
  type Message,
  type Choice,
  type Usage,
  type ToolCall,
  type RetryConfig,
} from './ModelClient';

// Re-export ToolDefinition from tools/BaseTool.ts
export type { ToolDefinition } from '../tools/BaseTool';

// Provider implementations
// Note: AnthropicClient removed - not supported in Rust codex-rs implementation
// Note: OpenAIClient removed - replaced by OpenAIResponsesClient (Responses API)
export { OpenAIResponsesClient, type OpenAIResponsesConfig } from './OpenAIResponsesClient';

// Factory and utilities
export {
  ModelClientFactory,
  getModelClientFactory,
  type ModelProvider,
  type ModelClientConfig,
} from './ModelClientFactory';

// Legacy files removed - not in Rust codex-rs implementation
// RateLimitManager - rate limiting handled inline in ModelClient
// TokenUsageTracker - token tracking not in Rust client.rs

// Authentication management
export {
  ChromeAuthManager,
  chromeAuthManager,
} from './ChromeAuthManager';

// Performance optimizations (Phase 9)
export {
  SSEEventParser,
} from './SSEEventParser';

// Note: RequestQueue kept for performance optimizations (Phase 9)
// Not in Rust, but used for browser-specific rate limiting
export {
  RequestQueue,
  RequestPriority,
  type QueuedRequest,
  type RateLimitConfig as RequestQueueRateLimitConfig,
  type QueueMetrics,
} from './RequestQueue';