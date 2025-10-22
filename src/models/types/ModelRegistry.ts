/**
 * Model Registry API Contract
 *
 * Defines the TypeScript interfaces and types for the Model Registry system.
 * This contract ensures type safety across model metadata, configuration, and validation.
 *
 * Feature: 001-multi-model-support
 * Date: 2025-10-22
 */

// ============================================================================
// Core Types
// ============================================================================

/**
 * Reasoning effort levels supported by reasoning-capable models
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

/**
 * Verbosity levels supported by verbosity-capable models
 */
export type VerbosityLevel = 'low' | 'medium' | 'high';

/**
 * Reasoning summary options
 */
export type ReasoningSummary = 'auto' | 'concise' | 'detailed' | 'none';

/**
 * Supported model providers
 */
export type ModelProvider = 'openai';

// ============================================================================
// Model Metadata
// ============================================================================

/**
 * Rate limiting configuration for a model
 */
export interface RateLimit {
  /** Maximum requests per minute */
  requestsPerMinute?: number;
  /** Maximum requests per hour */
  requestsPerHour?: number;
  /** Maximum tokens per minute */
  tokensPerMinute?: number;
}

/**
 * Base metadata shared by all models
 */
export interface BaseModelMetadata {
  /** Unique model identifier (e.g., "gpt-5", "gpt-4o") */
  id: string;
  /** Model provider */
  provider: ModelProvider;
  /** Human-readable display name */
  displayName: string;
  /** Maximum context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens per request */
  maxOutputTokens: number;
  /** Whether the model is deprecated */
  deprecated?: boolean;
  /** Message to display for deprecated models */
  deprecationMessage?: string;
  /** ISO 8601 release date */
  releaseDate: string;
  /** Custom API base URL (optional) */
  baseUrl?: string;
  /** Model-specific rate limits (optional) */
  rateLimit?: RateLimit;
}

/**
 * Metadata for models that support reasoning features
 */
export interface ReasoningCapable {
  supportsReasoning: true;
  /** Available reasoning effort levels */
  reasoningEfforts: ReasoningEffort[];
  /** Whether reasoning summaries are supported */
  supportsReasoningSummaries: boolean;
}

/**
 * Metadata for standard models without reasoning support
 */
export interface StandardModel {
  supportsReasoning: false;
}

/**
 * Metadata for models that support verbosity settings
 */
export interface VerbosityCapable {
  supportsVerbosity: true;
  /** Available verbosity levels */
  verbosityLevels: VerbosityLevel[];
}

/**
 * Metadata for models without verbosity support
 */
export interface NoVerbosity {
  supportsVerbosity: false;
}

/**
 * Complete model metadata using discriminated unions for type safety
 *
 * The discriminated union ensures that:
 * - If supportsReasoning is true, reasoningEfforts and supportsReasoningSummaries exist
 * - If supportsVerbosity is true, verbosityLevels exists
 * - TypeScript compiler enforces these constraints at compile time
 */
export type ModelMetadata = BaseModelMetadata &
  (ReasoningCapable | StandardModel) &
  (VerbosityCapable | NoVerbosity);

/**
 * Registry of all available models
 * Keys are model IDs, values are model metadata
 */
export type ModelRegistryMap = Readonly<Record<string, ModelMetadata>>;

// ============================================================================
// Model Registry Interface
// ============================================================================

/**
 * Options for filtering models in getAvailableModels
 */
export interface ModelFilterOptions {
  /** Exclude deprecated models */
  excludeDeprecated?: boolean;
  /** Filter by provider */
  provider?: ModelProvider;
  /** Require specific capability */
  requireCapability?: 'reasoning' | 'verbosity';
}

/**
 * Configured features from IModelConfig
 * Used for validation purposes
 */
export interface ConfiguredFeatures {
  reasoningEffort?: ReasoningEffort | null;
  reasoningSummary?: ReasoningSummary;
  verbosity?: VerbosityLevel | null;
  maxOutputTokens?: number | null;
  contextWindow?: number | null;
}

/**
 * Model Registry API
 *
 * Provides type-safe access to model metadata and validation
 */
export interface IModelRegistry {
  /**
   * Get metadata for a specific model
   * @param id Model identifier
   * @returns Model metadata or null if not found
   */
  getModel(id: string): ModelMetadata | null;

  /**
   * Check if a model supports reasoning features
   * @param modelId Model identifier
   * @returns True if model supports reasoning
   */
  supportsReasoning(modelId: string): boolean;

  /**
   * Check if a model supports verbosity settings
   * @param modelId Model identifier
   * @returns True if model supports verbosity
   */
  supportsVerbosity(modelId: string): boolean;

  /**
   * Get list of available models with optional filtering
   * @param options Filter options
   * @returns Array of model metadata
   */
  getAvailableModels(options?: ModelFilterOptions): ModelMetadata[];

  /**
   * Validate compatibility between a model and configured features
   * @param modelId Model identifier
   * @param features Currently configured features
   * @returns Validation result with errors and suggestions
   */
  validateCompatibility(
    modelId: string,
    features: ConfiguredFeatures
  ): ModelValidationResult;

  /**
   * Get default model ID
   * @returns Default model identifier (typically "gpt-5")
   */
  getDefaultModel(): string;
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Suggested action to resolve validation error
 */
export interface SuggestedAction {
  /** Type of action */
  action: 'disable_feature' | 'select_different_model' | 'update_setting';
  /** Feature to disable (if action is 'disable_feature') */
  feature?: string;
  /** Alternative model ID (if action is 'select_different_model') */
  suggestedModel?: string;
  /** Setting to update (if action is 'update_setting') */
  setting?: string;
  /** Human-readable description */
  description: string;
}

/**
 * Result of model-feature compatibility validation
 */
export interface ModelValidationResult {
  /** Whether the configuration is valid */
  valid: boolean;
  /** Model ID being validated */
  modelId: string;
  /** Non-blocking warnings (e.g., deprecation) */
  warnings?: string[];
  /** Blocking errors preventing selection */
  errors?: string[];
  /** List of incompatible features */
  incompatibleFeatures?: string[];
  /** Suggested actions to resolve issues */
  suggestedActions?: SuggestedAction[];
}

/**
 * Validator function type
 * @param modelId Model identifier
 * @param features Configured features
 * @returns Validation result
 */
export type ModelValidator = (
  modelId: string,
  features: ConfiguredFeatures
) => ModelValidationResult;

// ============================================================================
// Events
// ============================================================================

/**
 * Event emitted when model selection changes
 */
export interface ModelChangeEvent {
  type: 'model-changed';
  /** Previously selected model ID */
  previousModel: string;
  /** Newly selected model ID */
  newModel: string;
  /** Timestamp of change */
  timestamp: number;
}

/**
 * Event emitted when model validation fails
 */
export interface ModelValidationFailedEvent {
  type: 'model-validation-failed';
  /** Model ID that failed validation */
  modelId: string;
  /** Validation result */
  result: ModelValidationResult;
  /** Timestamp of failure */
  timestamp: number;
}

/**
 * Event emitted when session is reinitialized due to model change
 */
export interface SessionReinitializedEvent {
  type: 'session-reinitialized';
  /** Model ID after reinitialization */
  modelId: string;
  /** Reason for reinitialization */
  reason: 'model-changed' | 'api-key-updated';
  /** Timestamp of reinitialization */
  timestamp: number;
}

/**
 * Union of all model-related events
 */
export type ModelEvent =
  | ModelChangeEvent
  | ModelValidationFailedEvent
  | SessionReinitializedEvent;

// ============================================================================
// UI Component Props
// ============================================================================

/**
 * Props for ModelSelector.svelte component
 */
export interface ModelSelectorProps {
  /** Currently selected model ID */
  selectedModel: string;
  /** Configured features for validation */
  configuredFeatures: ConfiguredFeatures;
  /** Whether the selector is disabled */
  disabled?: boolean;
  /** Callback when model is selected */
  onModelChange?: (modelId: string) => void;
}

/**
 * Props for ModelOption.svelte component
 */
export interface ModelOptionProps {
  /** Model metadata */
  model: ModelMetadata;
  /** Whether this model is currently selected */
  isSelected: boolean;
  /** Whether this model option is disabled */
  isDisabled: boolean;
  /** Validation result for this model */
  validationResult?: ModelValidationResult;
  /** Callback when model is clicked */
  onClick?: () => void;
}

/**
 * Props for ModelInfoTooltip.svelte component
 */
export interface ModelInfoTooltipProps {
  /** Model metadata to display */
  model: ModelMetadata;
  /** Whether to show detailed information */
  expanded?: boolean;
}

// ============================================================================
// Storage
// ============================================================================

/**
 * Model configuration stored in chrome.storage.local
 * Extends IModelConfig from src/config/types.ts
 */
export interface StoredModelConfig {
  /** Selected model ID */
  selected: string;
  /** Provider identifier */
  provider: string;
  /** Context window override (null = use model default) */
  contextWindow: number | null;
  /** Max output tokens override (null = use model default) */
  maxOutputTokens: number | null;
  /** Auto-compact token limit (null = calculate as 80% of context window) */
  autoCompactTokenLimit: number | null;
  /** Selected reasoning effort (null if not applicable) */
  reasoningEffort: ReasoningEffort | null;
  /** Reasoning summary preference */
  reasoningSummary: ReasoningSummary;
  /** Selected verbosity level (null if not applicable) */
  verbosity: VerbosityLevel | null;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Configuration for creating a ModelClient
 * Used by ModelClientFactory
 */
export interface ModelClientConfig {
  /** Model ID from registry */
  modelId: string;
  /** API key for authentication */
  apiKey: string | null;
  /** Optional base URL override */
  baseUrl?: string;
  /** Optional organization ID */
  organization?: string;
  /** Conversation/session ID */
  conversationId: string;
  /** Reasoning effort (if applicable) */
  reasoningEffort?: ReasoningEffort;
  /** Reasoning summary (if applicable) */
  reasoningSummary?: ReasoningSummary;
  /** Verbosity level (if applicable) */
  verbosity?: VerbosityLevel;
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Default model ID when no model is explicitly selected
 */
export const DEFAULT_MODEL_ID = 'gpt-5' as const;

/**
 * Minimum context window size (tokens)
 */
export const MIN_CONTEXT_WINDOW = 4096 as const;

/**
 * Maximum reasonable context window size (tokens)
 * Used for validation
 */
export const MAX_CONTEXT_WINDOW = 1000000 as const;

/**
 * Default auto-compact percentage (80% of context window)
 */
export const AUTO_COMPACT_PERCENTAGE = 0.8 as const;
