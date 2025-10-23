/**
 * TurnContext implementation - ports TurnContext struct from browserx-rs
 * Manages turn state, context switching, approval policies, and sandbox settings
 *
 * BREAKING CHANGE: Replaced cwd (current working directory) with tabId (current working tab)
 * for session-tab binding feature
 */

import { ModelClient } from '../models/ModelClient';
import { AskForApproval, SandboxPolicy, ReasoningEffortConfig, ReasoningSummaryConfig } from '../protocol/types';
import type { IToolsConfig } from '../config/types';
import { DEFAULT_TOOLS_CONFIG } from '../config/defaults';
import { TabBindingManager } from './TabBindingManager';
import { TabValidationState } from '../types/session';

/**
 * browser environment policy for task execution
 */
export type BrowserEnvironmentPolicy = 'preserve' | 'clean' | 'restricted';

/**
 * Turn configuration that can be updated during execution
 */
export interface TurnContextConfig {
  /** T025: Current working tab ID (replaces cwd) */
  tabId?: number;
  /** T025: Parent session identifier */
  sessionId?: string;
  /** Base instructions override */
  baseInstructions?: string;
  /** User instructions for this turn */
  userInstructions?: string;
  /** Approval policy for commands */
  approvalPolicy?: AskForApproval;
  /** Sandbox policy for tool execution */
  sandboxPolicy?: SandboxPolicy;
  /** Shell environment handling */
  browserEnvironmentPolicy?: BrowserEnvironmentPolicy;
  /** Tools configuration */
  toolsConfig?: IToolsConfig;
  /** Model identifier */
  model?: string;
  /** Reasoning effort configuration */
  effort?: ReasoningEffortConfig;
  /** Reasoning summary configuration */
  summary?: ReasoningSummaryConfig;
  /** Enable review mode */
  reviewMode?: boolean;
}

/**
 * TurnContext manages the context and configuration for a single conversation turn
 * Port of TurnContext struct from browserx-rs/core/src/browserx.rs
 */
export class TurnContext {
  private modelClient: ModelClient;
  private tabId: number; // T024: Replace cwd with tabId
  private sessionId: string; // T025: Add sessionId field
  private baseInstructions?: string;
  private userInstructions?: string;
  private approvalPolicy: AskForApproval;
  private sandboxPolicy: SandboxPolicy;
  private browserEnvironmentPolicy: BrowserEnvironmentPolicy;
  private toolsConfig: IToolsConfig;
  private reviewMode: boolean;

  constructor(
    modelClient: ModelClient,
    config: TurnContextConfig = {}
  ) {
    this.modelClient = modelClient;

    // T026: Initialize with defaults or provided config
    this.tabId = config.tabId !== undefined ? config.tabId : -1; // Default to -1 (no tab attached)
    this.sessionId = config.sessionId || ''; // Default to empty string
    this.baseInstructions = config.baseInstructions;
    this.userInstructions = config.userInstructions;
    this.approvalPolicy = config.approvalPolicy || 'on-request';
    this.sandboxPolicy = config.sandboxPolicy || { mode: 'workspace-write' };
    this.browserEnvironmentPolicy = config.browserEnvironmentPolicy || 'preserve';
    this.reviewMode = config.reviewMode || false;

    // Default tools configuration with all IToolsConfig fields
    this.toolsConfig = {
      ...DEFAULT_TOOLS_CONFIG,
      ...config.toolsConfig,
    };
  }

  /**
   * Update turn context configuration
   */
  update(config: TurnContextConfig): void {
    if (config.tabId !== undefined) {
      this.tabId = config.tabId;
    }
    if (config.sessionId !== undefined) {
      this.sessionId = config.sessionId;
    }
    if (config.baseInstructions !== undefined) {
      this.baseInstructions = config.baseInstructions;
    }
    if (config.userInstructions !== undefined) {
      this.userInstructions = config.userInstructions;
    }
    if (config.approvalPolicy !== undefined) {
      this.approvalPolicy = config.approvalPolicy;
    }
    if (config.sandboxPolicy !== undefined) {
      this.sandboxPolicy = config.sandboxPolicy;
    }
    if (config.browserEnvironmentPolicy !== undefined) {
      this.browserEnvironmentPolicy = config.browserEnvironmentPolicy;
    }
    if (config.toolsConfig !== undefined) {
      this.toolsConfig = { ...this.toolsConfig, ...config.toolsConfig };
    }
    if (config.reviewMode !== undefined) {
      this.reviewMode = config.reviewMode;
    }

    // Update model client if model changed
    if (config.model !== undefined) {
      this.modelClient.setModel(config.model);
    }
    if (config.effort !== undefined) {
      this.modelClient.setReasoningEffort(config.effort);
    }
    if (config.summary !== undefined) {
      this.modelClient.setReasoningSummary(config.summary);
    }
  }

  // T027-T030: Removed getCwd, setCwd, resolvePath, isPathWritable methods
  // These have been replaced with tab-based methods below

  /**
   * T031: Get current working tab ID
   */
  getTabId(): number {
    return this.tabId;
  }

  /**
   * T032: Set current working tab ID
   */
  setTabId(tabId: number): void {
    this.tabId = tabId;
  }

  /**
   * T033: Get parent session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * T034: Validate current tab exists and is accessible
   */
  async validateCurrentTab(): Promise<TabValidationState> {
    const bindingManager = TabBindingManager.getInstance();
    return await bindingManager.validateTab(this.tabId);
  }

  /**
   * T035: Check if tab is currently attached
   */
  hasTabAttached(): boolean {
    return this.tabId !== -1;
  }

  /**
   * Get base instructions override
   */
  getBaseInstructions(): string | undefined {
    return this.baseInstructions;
  }

  /**
   * Set base instructions override
   */
  setBaseInstructions(instructions?: string): void {
    this.baseInstructions = instructions;
  }

  /**
   * Get user instructions
   */
  getUserInstructions(): string | undefined {
    return this.userInstructions;
  }

  /**
   * Set user instructions
   */
  setUserInstructions(instructions?: string): void {
    this.userInstructions = instructions;
  }

  /**
   * Get approval policy
   */
  getApprovalPolicy(): AskForApproval {
    return this.approvalPolicy;
  }

  /**
   * Set approval policy
   */
  setApprovalPolicy(policy: AskForApproval): void {
    this.approvalPolicy = policy;
  }

  /**
   * Check if approval is required for a command
   */
  requiresApproval(command: string, trusted: boolean = false): boolean {
    switch (this.approvalPolicy) {
      case 'never':
        return false;
      case 'untrusted':
        return !trusted;
      case 'on-failure':
        return false; // Only approve after failure
      case 'on-request':
      default:
        return true;
    }
  }

  /**
   * Get sandbox policy
   */
  getSandboxPolicy(): SandboxPolicy {
    return this.sandboxPolicy;
  }

  /**
   * Set sandbox policy
   */
  setSandboxPolicy(policy: SandboxPolicy): void {
    this.sandboxPolicy = policy;
  }

  // T030: Removed isPathWritable method (no longer applicable with tab-based context)

  /**
   * Check if network access is allowed
   */
  isNetworkAllowed(): boolean {
    if (this.sandboxPolicy.mode === 'danger-full-access') {
      return true;
    }

    if (this.sandboxPolicy.mode === 'workspace-write') {
      return this.sandboxPolicy.network_access !== false;
    }

    return false;
  }

  /**
   * Get shell environment policy
   */
  getBrowserEnvironmentPolicy(): BrowserEnvironmentPolicy {
    return this.browserEnvironmentPolicy;
  }

  /**
   * Set browser environment policy
   */
  setBrowserEnvironmentPolicy(policy: BrowserEnvironmentPolicy): void {
    this.browserEnvironmentPolicy = policy;
  }

  /**
   * Get tools configuration
   */
  getToolsConfig(): IToolsConfig {
    return { ...this.toolsConfig };
  }

  /**
   * Update tools configuration
   */
  updateToolsConfig(config: Partial<IToolsConfig>): void {
    this.toolsConfig = { ...this.toolsConfig, ...config };
  }

  /**
   * Check if a specific tool is enabled
   */
  isToolEnabled(toolName: string): boolean {
    switch (toolName) {
      case 'exec_command':
        return this.toolsConfig.execCommand !== false;
      case 'web_search':
        return this.toolsConfig.webSearch !== false;
      case 'file_operations':
        return this.toolsConfig.fileOperations !== false;
      case 'mcp_tools':
        return this.toolsConfig.mcpTools !== false;
      default:
        return this.toolsConfig.customTools?.[toolName] !== false;
    }
  }

  /**
   * Get model client
   */
  getModelClient(): ModelClient {
    return this.modelClient;
  }

  /**
   * Get current model identifier
   */
  getModel(): string {
    return this.modelClient.getModel();
  }

  /**
   * Get model context window size
   */
  getModelContextWindow(): number | undefined {
    return this.modelClient.getModelContextWindow();
  }

  /**
   * Get reasoning effort configuration
   */
  getEffort(): ReasoningEffortConfig | undefined {
    return this.modelClient.getReasoningEffort();
  }

  /**
   * Get reasoning summary configuration
   */
  getSummary(): ReasoningSummaryConfig {
    return this.modelClient.getReasoningSummary() || { enabled: false };
  }

  /**
   * Check if in review mode
   */
  isReviewMode(): boolean {
    return this.reviewMode;
  }

  /**
   * Set review mode
   */
  setReviewMode(enabled: boolean): void {
    this.reviewMode = enabled;
  }

  /**
   * Create a copy of this turn context
   */
  clone(): TurnContext {
    const cloned = new TurnContext(this.modelClient, {
      tabId: this.tabId,
      sessionId: this.sessionId,
      baseInstructions: this.baseInstructions,
      userInstructions: this.userInstructions,
      approvalPolicy: this.approvalPolicy,
      sandboxPolicy: structuredClone(this.sandboxPolicy),
      browserEnvironmentPolicy: this.browserEnvironmentPolicy,
      toolsConfig: structuredClone(this.toolsConfig),
      reviewMode: this.reviewMode,
    });

    return cloned;
  }

  /**
   * T036: Export turn context for serialization
   */
  export(): {
    tabId: number;
    sessionId: string;
    baseInstructions?: string;
    userInstructions?: string;
    approvalPolicy: AskForApproval;
    sandboxPolicy: SandboxPolicy;
    browserEnvironmentPolicy: BrowserEnvironmentPolicy;
    toolsConfig: IToolsConfig;
    model: string;
    effort?: ReasoningEffortConfig;
    summary: ReasoningSummaryConfig;
    reviewMode: boolean;
  } {
    return {
      tabId: this.tabId,
      sessionId: this.sessionId,
      baseInstructions: this.baseInstructions,
      userInstructions: this.userInstructions,
      approvalPolicy: this.approvalPolicy,
      sandboxPolicy: structuredClone(this.sandboxPolicy),
      browserEnvironmentPolicy: this.browserEnvironmentPolicy,
      toolsConfig: structuredClone(this.toolsConfig),
      model: this.getModel(),
      effort: this.getEffort(),
      summary: this.getSummary(),
      reviewMode: this.reviewMode,
    };
  }

  /**
   * T037: Import turn context from serialized data
   */
  static import(
    modelClient: ModelClient,
    data: {
      tabId: number;
      sessionId: string;
      baseInstructions?: string;
      userInstructions?: string;
      approvalPolicy: AskForApproval;
      sandboxPolicy: SandboxPolicy;
      browserEnvironmentPolicy: BrowserEnvironmentPolicy;
      toolsConfig: IToolsConfig;
      model: string;
      effort?: ReasoningEffortConfig;
      summary: ReasoningSummaryConfig;
      reviewMode: boolean;
    }
  ): TurnContext {
    // Set model client configuration
    modelClient.setModel(data.model);
    if (data.effort) {
      modelClient.setReasoningEffort(data.effort);
    }
    modelClient.setReasoningSummary(data.summary);

    return new TurnContext(modelClient, {
      tabId: data.tabId,
      sessionId: data.sessionId,
      baseInstructions: data.baseInstructions,
      userInstructions: data.userInstructions,
      approvalPolicy: data.approvalPolicy,
      sandboxPolicy: data.sandboxPolicy,
      browserEnvironmentPolicy: data.browserEnvironmentPolicy,
      toolsConfig: data.toolsConfig,
      reviewMode: data.reviewMode,
    });
  }

  /**
   * Create a turn context for review mode
   */
  createReviewContext(
    reviewInstructions?: string
  ): TurnContext {
    const reviewContext = this.clone();
    reviewContext.setReviewMode(true);
    reviewContext.setBaseInstructions(reviewInstructions);
    reviewContext.setUserInstructions(undefined);

    return reviewContext;
  }

  /**
   * Validate turn context configuration
   */
  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate tabId
    if (this.tabId !== -1 && (this.tabId < 0 || !Number.isInteger(this.tabId))) {
      errors.push('Tab ID must be -1 (unbound) or a positive integer');
    }

    // Validate sessionId
    if (!this.sessionId) {
      errors.push('Session ID is required');
    }

    // Validate model client
    if (!this.modelClient) {
      errors.push('Model client is required');
    }

    // Validate approval policy
    const validApprovalPolicies: AskForApproval[] = ['untrusted', 'on-failure', 'on-request', 'never'];
    if (!validApprovalPolicies.includes(this.approvalPolicy)) {
      errors.push(`Invalid approval policy: ${this.approvalPolicy}`);
    }

    // Validate sandbox policy
    const validSandboxModes = ['danger-full-access', 'read-only', 'workspace-write'];
    if (!validSandboxModes.includes(this.sandboxPolicy.mode)) {
      errors.push(`Invalid sandbox policy mode: ${this.sandboxPolicy.mode}`);
    }

    // Validate shell environment policy
    const validShellPolicies: BrowserEnvironmentPolicy[] = ['preserve', 'clean', 'restricted'];
    if (!validShellPolicies.includes(this.browserEnvironmentPolicy)) {
      errors.push(`Invalid shell environment policy: ${this.browserEnvironmentPolicy}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get debug information about the turn context
   */
  getDebugInfo(): Record<string, any> {
    return {
      tabId: this.tabId,
      sessionId: this.sessionId,
      hasTabAttached: this.hasTabAttached(),
      model: this.getModel(),
      approvalPolicy: this.approvalPolicy,
      sandboxPolicy: this.sandboxPolicy,
      browserEnvironmentPolicy: this.browserEnvironmentPolicy,
      toolsConfig: this.toolsConfig,
      reviewMode: this.reviewMode,
      modelContextWindow: this.getModelContextWindow(),
      hasBaseInstructions: !!this.baseInstructions,
      hasUserInstructions: !!this.userInstructions,
    };
  }
}
