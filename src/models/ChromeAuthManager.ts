import { AuthManager, AuthMode, CodexAuth, KnownPlan, PlanType } from './types/index.js';

/**
 * Chrome Extension AuthManager implementation
 * Handles secure storage and management of API keys and authentication data
 */
export class ChromeAuthManager implements AuthManager {
  private static readonly STORAGE_KEYS = {
    AUTH_DATA: 'codex_auth_data',
    API_KEY: 'codex_api_key',
    ENCRYPTED_SUFFIX: '_encrypted'
  } as const;

  private currentAuth: CodexAuth | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize auth manager asynchronously
    this.initPromise = this.initialize();
  }

  /**
   * Initialize auth manager by loading stored data
   */
  private async initialize(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        ChromeAuthManager.STORAGE_KEYS.AUTH_DATA,
        ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX
      ]);

      // Load existing auth data if available
      if (result[ChromeAuthManager.STORAGE_KEYS.AUTH_DATA]) {
        this.currentAuth = result[ChromeAuthManager.STORAGE_KEYS.AUTH_DATA] as CodexAuth;
      }

      // If no auth data but encrypted API key exists, create auth from API key
      if (!this.currentAuth && result[ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX]) {
        const encryptedKey = result[ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX];
        const apiKey = this.decrypt(encryptedKey);
        if (apiKey) {
          this.currentAuth = {
            mode: AuthMode.ApiKey,
            token: apiKey
          };
          // Save the auth data
          await this.saveAuthData();
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
  auth(): CodexAuth | null {
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
  get_account_id(): string | null {
    return this.currentAuth?.account_id || null;
  }

  /**
   * Get plan type if available
   */
  get_plan_type(): PlanType | null {
    return this.currentAuth?.plan_type || null;
  }

  /**
   * Store API key securely
   */
  async storeApiKey(apiKey: string): Promise<void> {
    await this.ensureInitialized();

    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid API key provided');
    }

    // Encrypt the API key
    const encrypted = this.encrypt(apiKey);

    // Store encrypted API key
    await chrome.storage.local.set({
      [ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX]: encrypted
    });

    // Update current auth
    this.currentAuth = {
      mode: AuthMode.ApiKey,
      token: apiKey,
      // Set default plan type for API key users
      plan_type: { type: 'unknown', plan: 'api_key' }
    };

    // Save auth data
    await this.saveAuthData();
  }

  /**
   * Retrieve API key
   */
  async retrieveApiKey(): Promise<string | null> {
    await this.ensureInitialized();

    try {
      const result = await chrome.storage.local.get([
        ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX
      ]);

      const encrypted = result[ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX];
      if (!encrypted) {
        return null;
      }

      return this.decrypt(encrypted);
    } catch (error) {
      console.error('Failed to retrieve API key:', error);
      return null;
    }
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
   * Remove all stored authentication data
   */
  async clearAuth(): Promise<void> {
    await this.ensureInitialized();

    // Remove from storage
    await chrome.storage.local.remove([
      ChromeAuthManager.STORAGE_KEYS.AUTH_DATA,
      ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX
    ]);

    // Clear current auth
    this.currentAuth = null;
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
   * Save current auth data to storage
   */
  private async saveAuthData(): Promise<void> {
    if (!this.currentAuth) {
      return;
    }

    await chrome.storage.local.set({
      [ChromeAuthManager.STORAGE_KEYS.AUTH_DATA]: this.currentAuth
    });
  }

  /**
   * Basic encryption for API keys (base64 encoding with simple obfuscation)
   * Note: This is not cryptographically secure, just basic obfuscation
   * For production, consider using Web Crypto API
   */
  private encrypt(value: string): string {
    // Simple obfuscation: reverse string and base64 encode
    const reversed = value.split('').reverse().join('');
    return btoa(reversed);
  }

  /**
   * Decrypt obfuscated API key
   */
  private decrypt(encrypted: string): string | null {
    try {
      const decoded = atob(encrypted);
      // Reverse the string back
      return decoded.split('').reverse().join('');
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return null;
    }
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return this.currentAuth !== null &&
           (this.currentAuth.token !== undefined || this.currentAuth.mode === AuthMode.Local);
  }

  /**
   * Get current auth mode
   */
  getAuthMode(): AuthMode | null {
    return this.currentAuth?.mode || null;
  }
}

// Export singleton instance
export const chromeAuthManager = new ChromeAuthManager();