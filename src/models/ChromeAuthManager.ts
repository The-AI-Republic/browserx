import { AuthMode } from './types/index.js';
import type { AuthManager, CodexAuth, KnownPlan, PlanType } from './types/index.js';

/**
 * Chrome Extension AuthManager implementation
 * Handles secure storage and management of API keys and authentication data
 */
export class ChromeAuthManager implements AuthManager {
  private static readonly STORAGE_KEYS = {
    AUTH_DATA: 'codex_auth_data',
    API_KEY: 'codex_api_key',
    ENCRYPTED_SUFFIX: '_encrypted',
    CRYPTO_KEY: 'codex_crypto_key'
  } as const;

  private currentAuth: CodexAuth | null = null;
  private initPromise: Promise<void> | null = null;
  private cryptoKey: CryptoKey | null = null;

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
        const apiKey = await this.decrypt(encryptedKey);
        if (apiKey) {
          // Detect API provider from key
          const apiProvider = this.detectApiProvider(apiKey);

          // Create auth data without plaintext token
          this.currentAuth = {
            mode: AuthMode.ApiKey,
            api_provider: apiProvider,
            plan_type: { type: 'unknown', plan: 'api_key' }
          };
          // Save the auth data (without plaintext token)
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
   * For API key mode, retrieves the decrypted key from secure storage
   */
  async auth(): Promise<CodexAuth | null> {
    await this.ensureInitialized();

    if (!this.currentAuth) {
      return null;
    }

    // For API key mode, retrieve the encrypted key and decrypt it
    if (this.currentAuth.mode === AuthMode.ApiKey) {
      const apiKey = await this.retrieveApiKey();
      if (!apiKey) {
        return null;
      }

      // Return auth with decrypted token (but don't store it)
      return {
        ...this.currentAuth,
        token: apiKey
      };
    }

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
   * Store API key securely
   */
  async storeApiKey(apiKey: string): Promise<void> {
    await this.ensureInitialized();

    if (!apiKey || typeof apiKey !== 'string') {
      throw new Error('Invalid API key provided');
    }

    // Encrypt the API key
    const encrypted = await this.encrypt(apiKey);

    // Store encrypted API key
    await chrome.storage.local.set({
      [ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX]: encrypted
    });

    // Detect API provider from key format
    const apiProvider = this.detectApiProvider(apiKey);

    // Update current auth - DO NOT store plaintext token
    this.currentAuth = {
      mode: AuthMode.ApiKey,
      api_provider: apiProvider,
      // Set default plan type for API key users
      plan_type: { type: 'unknown', plan: 'api_key' }
    };

    // Save auth data (without plaintext token)
    await this.saveAuthData();
  }

  /**
   * Retrieve API key
   * Throws error if decryption fails (likely due to old encryption format)
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

      return await this.decrypt(encrypted);
    } catch (error) {
      if (error instanceof Error && error.message === 'DECRYPTION_FAILED') {
        console.error('API key decryption failed - likely old encryption format. User should clear and re-enter API key.');
        // Clear the corrupted data
        await this.clearAuth();
        throw new Error('API_KEY_DECRYPTION_FAILED');
      }
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
   * Detect API provider from key format
   */
  private detectApiProvider(apiKey: string): string {
    if (apiKey.startsWith('sk-ant-')) {
      return 'anthropic';
    } else if (apiKey.startsWith('sk-')) {
      return 'openai';
    }
    return 'unknown';
  }

  /**
   * Remove all stored authentication data
   */
  async clearAuth(): Promise<void> {
    await this.ensureInitialized();

    // Remove from storage
    await chrome.storage.local.remove([
      ChromeAuthManager.STORAGE_KEYS.AUTH_DATA,
      ChromeAuthManager.STORAGE_KEYS.API_KEY + ChromeAuthManager.STORAGE_KEYS.ENCRYPTED_SUFFIX,
      ChromeAuthManager.STORAGE_KEYS.CRYPTO_KEY
    ]);

    // Clear current auth and crypto key
    this.currentAuth = null;
    this.cryptoKey = null;
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
   * Get or generate the encryption key
   * Uses Web Crypto API with AES-GCM algorithm
   */
  private async getCryptoKey(): Promise<CryptoKey> {
    // Return cached key if available
    if (this.cryptoKey) {
      return this.cryptoKey;
    }

    // Try to load existing key from storage
    const result = await chrome.storage.local.get([ChromeAuthManager.STORAGE_KEYS.CRYPTO_KEY]);
    const storedKey = result[ChromeAuthManager.STORAGE_KEYS.CRYPTO_KEY];

    if (storedKey) {
      // Import the stored key
      try {
        this.cryptoKey = await crypto.subtle.importKey(
          'raw',
          this.base64ToArrayBuffer(storedKey),
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        return this.cryptoKey;
      } catch (error) {
        console.error('Failed to import stored crypto key, generating new one:', error);
      }
    }

    // Generate new key if none exists or import failed
    this.cryptoKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true, // extractable (so we can store it)
      ['encrypt', 'decrypt']
    );

    // Export and store the key
    const exportedKey = await crypto.subtle.exportKey('raw', this.cryptoKey);
    const keyBase64 = this.arrayBufferToBase64(exportedKey);
    await chrome.storage.local.set({
      [ChromeAuthManager.STORAGE_KEYS.CRYPTO_KEY]: keyBase64
    });

    return this.cryptoKey;
  }

  /**
   * Encrypt API key using AES-GCM
   * Returns base64-encoded string containing IV + encrypted data
   */
  private async encrypt(value: string): Promise<string> {
    const key = await this.getCryptoKey();

    // Convert string to Uint8Array
    const encoder = new TextEncoder();
    const data = encoder.encode(value);

    // Generate random IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));

    // Encrypt the data
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedBuffer), iv.length);

    // Convert to base64 for storage
    return this.arrayBufferToBase64(combined.buffer);
  }

  /**
   * Decrypt API key using AES-GCM
   * Expects base64-encoded string containing IV + encrypted data
   */
  private async decrypt(encrypted: string): Promise<string | null> {
    try {
      const key = await this.getCryptoKey();

      // Decode base64
      const combined = this.base64ToArrayBuffer(encrypted);
      const combinedArray = new Uint8Array(combined);

      // Extract IV and encrypted data
      const iv = combinedArray.slice(0, 12);
      const data = combinedArray.slice(12);

      // Decrypt the data
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );

      // Convert back to string
      const decoder = new TextDecoder();
      return decoder.decode(decryptedBuffer);
    } catch (error) {
      console.error('Failed to decrypt API key with AES-GCM:', error);
      // Don't return null - throw a specific error so callers can handle it
      throw new Error('DECRYPTION_FAILED');
    }
  }

  /**
   * Convert ArrayBuffer to base64 string
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Convert base64 string to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Check if user is authenticated
   */
  async isAuthenticated(): Promise<boolean> {
    await this.ensureInitialized();

    if (!this.currentAuth) {
      return false;
    }

    // For API key mode, check if encrypted key exists
    if (this.currentAuth.mode === AuthMode.ApiKey) {
      const apiKey = await this.retrieveApiKey();
      return apiKey !== null;
    }

    // For other modes, check for token in currentAuth
    return this.currentAuth.token !== undefined || this.currentAuth.mode === AuthMode.Local;
  }

  /**
   * Get current auth mode
   */
  async getAuthMode(): Promise<AuthMode | null> {
    await this.ensureInitialized();
    return this.currentAuth?.mode || null;
  }
}

// Export singleton instance
export const chromeAuthManager = new ChromeAuthManager();