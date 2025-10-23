/**
 * Model Registry
 *
 * Centralized registry of OpenAI model metadata.
 * Provides type-safe access to model information and validation.
 *
 * Feature: 001-multi-model-support
 * Tasks: T004, T005
 */

import type {
  ModelMetadata,
  ModelFilterOptions,
  ModelValidationResult,
  ConfiguredFeatures,
  SuggestedAction
} from './types/ModelRegistry';

/**
 * Static registry of all supported models
 * Implementation of MODEL_REGISTRY constant
 * Added grok-4-fast-reasoning model
 */
export const MODEL_REGISTRY: Readonly<Record<string, ModelMetadata>> = {
  'gpt-5': {
    id: 'gpt-5',
    provider: 'openai',
    displayName: 'GPT-5',
    contextWindow: 200000,
    maxOutputTokens: 16384,
    supportsReasoning: true,
    reasoningEfforts: ['minimal', 'low', 'medium', 'high'],
    supportsReasoningSummaries: true,
    supportsVerbosity: true,
    verbosityLevels: ['low', 'medium', 'high'],
    releaseDate: '2025-01-15',
    baseUrl: 'https://api.openai.com/v1'
  },
  'grok-4-fast-reasoning': {
    id: 'grok-4-fast-reasoning',
    provider: 'xai',
    displayName: 'Grok-4-Fast-Reasoning',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsReasoning: true,
    reasoningEfforts: ['low', 'medium', 'high'],
    supportsReasoningSummaries: true,
    supportsVerbosity: false,
    releaseDate: '2025-01-01',
    baseUrl: 'https://api.x.ai/v1'
  }
} as const;

/**
 * ModelRegistry class with static methods
 * Implementation of ModelRegistry class
 */
export class ModelRegistry {
  /**
   * Get metadata for a specific model
   * @param id Model identifier
   * @returns Model metadata or null if not found
   */
  static getModel(id: string): ModelMetadata | null {
    return MODEL_REGISTRY[id] || null;
  }

  /**
   * Check if a model supports reasoning features
   * @param modelId Model identifier
   * @returns True if model supports reasoning
   */
  static supportsReasoning(modelId: string): boolean {
    const model = this.getModel(modelId);
    return model?.supportsReasoning === true;
  }

  /**
   * Check if a model supports verbosity settings
   * @param modelId Model identifier
   * @returns True if model supports verbosity
   */
  static supportsVerbosity(modelId: string): boolean {
    const model = this.getModel(modelId);
    return model?.supportsVerbosity === true;
  }

  /**
   * Get list of available models with optional filtering
   * @param options Filter options
   * @returns Array of model metadata
   */
  static getAvailableModels(options?: ModelFilterOptions): ModelMetadata[] {
    let models = Object.values(MODEL_REGISTRY);

    if (options?.excludeDeprecated) {
      models = models.filter(m => !m.deprecated);
    }

    if (options?.provider) {
      models = models.filter(m => m.provider === options.provider);
    }

    if (options?.requireCapability === 'reasoning') {
      models = models.filter(m => m.supportsReasoning);
    } else if (options?.requireCapability === 'verbosity') {
      models = models.filter(m => m.supportsVerbosity);
    }

    return models;
  }

  /**
   * Validate compatibility between a model and configured features
   * @param modelId Model identifier
   * @param features Currently configured features
   * @returns Validation result with errors and suggestions
   */
  static validateCompatibility(
    modelId: string,
    features: ConfiguredFeatures
  ): ModelValidationResult {
    const model = this.getModel(modelId);

    if (!model) {
      return {
        valid: false,
        modelId,
        errors: [`Unknown model: ${modelId}`],
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const incompatibleFeatures: string[] = [];
    const suggestedActions: SuggestedAction[] = [];

    // Check deprecation
    if (model.deprecated) {
      warnings.push(
        model.deprecationMessage ||
        `Model ${modelId} is deprecated and may be removed in the future`
      );

      // Find suggested alternative
      const alternatives = this.getAvailableModels({
        excludeDeprecated: true,
        provider: model.provider
      });
      if (alternatives.length > 0) {
        suggestedActions.push({
          action: 'select_different_model',
          suggestedModel: alternatives[0].id,
          description: `Switch to ${alternatives[0].displayName} for continued support`
        });
      }
    }

    // Check reasoning effort compatibility
    // NOTE: Missing reasoning support is a WARNING not an ERROR - allow model selection
    if (features.reasoningEffort && !model.supportsReasoning) {
      warnings.push(`Model ${modelId} does not support reasoning features - reasoning effort will be ignored`);
      incompatibleFeatures.push('reasoningEffort');
      suggestedActions.push({
        action: 'disable_feature',
        feature: 'reasoningEffort',
        description: 'Reasoning effort setting will be ignored for this model'
      });
    }

    // Check verbosity compatibility
    // NOTE: Missing verbosity support is a WARNING not an ERROR - allow model selection
    if (features.verbosity && !model.supportsVerbosity) {
      warnings.push(`Model ${modelId} does not support verbosity settings - verbosity will be ignored`);
      incompatibleFeatures.push('verbosity');
      suggestedActions.push({
        action: 'disable_feature',
        feature: 'verbosity',
        description: 'Verbosity setting will be ignored for this model'
      });
    }

    // Check context window override
    if (features.contextWindow && features.contextWindow > model.contextWindow) {
      errors.push(
        `Context window override (${features.contextWindow}) exceeds model maximum (${model.contextWindow})`
      );
      incompatibleFeatures.push('contextWindow');
      suggestedActions.push({
        action: 'update_setting',
        setting: 'contextWindow',
        description: `Reduce context window to ${model.contextWindow} or less`
      });
    }

    // Check max output tokens override
    if (features.maxOutputTokens && features.maxOutputTokens > model.maxOutputTokens) {
      errors.push(
        `Max output tokens (${features.maxOutputTokens}) exceeds model maximum (${model.maxOutputTokens})`
      );
      incompatibleFeatures.push('maxOutputTokens');
      suggestedActions.push({
        action: 'update_setting',
        setting: 'maxOutputTokens',
        description: `Reduce max output tokens to ${model.maxOutputTokens} or less`
      });
    }

    // Suggest alternative model that supports all features
    if (incompatibleFeatures.length > 0) {
      const compatibleModels = this.getAvailableModels().filter(m => {
        if (features.reasoningEffort && !m.supportsReasoning) return false;
        if (features.verbosity && !m.supportsVerbosity) return false;
        if (features.contextWindow && features.contextWindow > m.contextWindow) return false;
        if (features.maxOutputTokens && features.maxOutputTokens > m.maxOutputTokens) return false;
        return true;
      });

      if (compatibleModels.length > 0) {
        suggestedActions.push({
          action: 'select_different_model',
          suggestedModel: compatibleModels[0].id,
          description: `Switch to ${compatibleModels[0].displayName} which supports all configured features`
        });
      }
    }

    return {
      valid: errors.length === 0,
      modelId,
      warnings: warnings.length > 0 ? warnings : undefined,
      errors: errors.length > 0 ? errors : undefined,
      incompatibleFeatures: incompatibleFeatures.length > 0 ? incompatibleFeatures : undefined,
      suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
    };
  }

  /**
   * Get default model ID
   * @returns Default model identifier (gpt-5)
   */
  static getDefaultModel(): string {
    return 'gpt-5';
  }
}
