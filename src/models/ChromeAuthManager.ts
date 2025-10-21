import { AuthMode } from './types/index.js';
import type { AuthManager, BrowserxAuth, KnownPlan, PlanType } from './types/index.js';
import { AgentConfig } from '../config/AgentConfig.js';
import { encryptApiKey, decryptApiKey } from '../utils/encryption.js';

/**
 * Chrome Extension AuthManager implementation
 * Handles secure storage and management of API keys and authentication data
 */
export class ChromeAuthManager implements AuthManager {
  private currentAuth: BrowserxAuth | null = null;
  private initPromise: Promise<void> | null = null;
  private agentConfig: AgentConfig;

  constructor(agentConfig: AgentConfig) {
    if (!agentConfig) {
      throw new Error('AgentConfig is required for ChromeAuthManager');
    }
    this.agentConfig = agentConfig;
    // Initialize auth manager asynchronously
    this.initPromise = this.initialize();
  }

  /**
   * Initialize auth manager by loading stored data
   * Note: Assumes AgentConfig is already initialized at application startup
   */
  private async initialize(): Promise<void> {
    try {
      // Load auth config from AgentConfig (assumes already initialized)
      const authConfig = this.agentConfig.getAuthConfig();

      if (authConfig.apiKey) {
        // Decrypt the API key
        const apiKey = decryptApiKey(authConfig.apiKey);
        if (apiKey) {
          this.currentAuth = {
            mode: authConfig.authMode,
            token: apiKey,
            account_id: authConfig.accountId || undefined,
            plan_type: authConfig.planType || undefined
          };
        }
      }
    } catch (error) {
      console.error('Failed to initialize ChromeAuthManager:', error);
    }
  }

  /**
   * Ensure initialization is complete
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  /**
   * Get current authentication data
   */
  async auth(): Promise<BrowserxAuth | null> {
    await this.ensureInitialized();
    return this.currentAuth;
  }

  /**
   * Refresh the authentication token
   * For API key mode, this is a no-op
   * For ChatGPT mode, this would refresh the OAuth token
   */
  async refresh_token(): Promise<void> {
    await this.ensureInitialized();

    if (!this.currentAuth) {
      return;
    }

    switch (this.currentAuth.mode) {
      case AuthMode.ApiKey:
        // API keys don't need refresh
        break;

      case AuthMode.ChatGPT:
        // TODO: Implement OAuth token refresh in future
        console.warn('ChatGPT token refresh not yet implemented');
        break;

      case AuthMode.Local:
        // Local mode doesn't need refresh
        break;

      default:
        console.warn('Unknown auth mode for token refresh');
    }
  }

  /**
   * Get account ID if available
   */
  async get_account_id(): Promise<string | null> {
    await this.ensureInitialized();
    return this.currentAuth?.account_id || null;
  }

  /**
   * Get plan type if available
   */
  async get_plan_type(): Promise<PlanType | null> {
    await this.ensureInitialized();
    return this.currentAuth?.plan_type || null;
  }

  /**
   * Retrieve API key
   */
  async retrieveApiKey(): Promise<string | null> {
    await this.ensureInitialized();
    return this.currentAuth?.token || null;
  }

  /**
   * Validate API key format
   */
  validateApiKey(apiKey: string): boolean {
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }

    // Basic OpenAI API key validation
    // OpenAI keys start with 'sk-' and have specific length patterns
    if (apiKey.startsWith('sk-') && apiKey.length >= 40) {
      return true;
    }

    // Anthropic keys start with 'sk-ant-'
    if (apiKey.startsWith('sk-ant-') && apiKey.length >= 40) {
      return true;
    }

    return false;
  }

  /**
   * Test API key by making a simple API call
   */
  async testApiKey(apiKey: string): Promise<{ valid: boolean; error?: string }> {
    if (!this.validateApiKey(apiKey)) {
      return { valid: false, error: 'Invalid API key format' };
    }

    try {
      // Determine provider based on key format
      const isAnthropic = apiKey.startsWith('sk-ant-');
      const baseUrl = isAnthropic
        ? 'https://api.anthropic.com/v1/messages'
        : 'https://api.openai.com/v1/chat/completions';

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (isAnthropic) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // Make a minimal test request
      const testRequest = isAnthropic ? {
        model: 'claude-3-haiku-20240307',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      } : {
        model: 'gpt-5',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      };

      const response = await fetch(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(testRequest)
      });

      if (response.ok || response.status === 400) {
        // 400 is OK for test - means auth worked but request was invalid
        return { valid: true };
      } else if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      } else {
        return { valid: false, error: `API error: ${response.status}` };
      }
    } catch (error) {
      return { valid: false, error: `Network error: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }


  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    await this.ensureInitialized();
    return this.currentAuth !== null &&
           (this.currentAuth.token !== undefined || this.currentAuth.mode === AuthMode.Local);
  }

  /**
   * Get current auth mode
   */
  async getAuthMode(): Promise<AuthMode | null> {
    await this.ensureInitialized();
    return this.currentAuth?.mode || null;
  }
}