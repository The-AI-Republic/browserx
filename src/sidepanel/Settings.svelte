<!--
  Settings - Svelte component for managing user settings
  Handles API key configuration and secure storage
-->

<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { chromeAuthManager, ChromeAuthManager } from '../models/ChromeAuthManager.js';
  import { AuthMode } from '../models/types/index.js';

  // Component state
  let apiKey = '';
  let maskedApiKey = '';
  let showApiKey = false;
  let isLoading = false;
  let isTesting = false;
  let saveMessage = '';
  let saveMessageType: 'success' | 'error' | 'info' | '' = '';
  let testResult: { valid: boolean; error?: string } | null = null;
  let isAuthenticated = false;
  let currentAuthMode: AuthMode | null = null;

  // Event dispatcher for parent components
  const dispatch = createEventDispatcher<{
    authUpdated: { isAuthenticated: boolean; mode: AuthMode | null };
    close: void;
  }>();

  // Load existing settings on mount
  onMount(async () => {
    await loadSettings();
  });

  /**
   * Load existing settings from auth manager
   */
  async function loadSettings() {
    try {
      isLoading = true;

      // Check if already authenticated
      isAuthenticated = chromeAuthManager.isAuthenticated();
      currentAuthMode = chromeAuthManager.getAuthMode();

      // If authenticated with API key, load masked version
      if (isAuthenticated && currentAuthMode === AuthMode.ApiKey) {
        const storedKey = await chromeAuthManager.retrieveApiKey();
        if (storedKey) {
          apiKey = storedKey;
          maskedApiKey = maskApiKey(storedKey);
        }
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      showMessage('Failed to load settings', 'error');
    } finally {
      isLoading = false;
    }
  }

  /**
   * Mask API key for display
   */
  function maskApiKey(key: string): string {
    if (!key || key.length < 6) {
      return key;
    }

    // Show only first 6 characters followed by ***
    const start = key.substring(0, 6);
    return `${start}***`;
  }

  /**
   * Handle API key input changes
   */
  function handleApiKeyInput(event: Event) {
    const target = event.target as HTMLInputElement;
    apiKey = target.value;
    maskedApiKey = maskApiKey(apiKey);

    // Clear any previous messages when user starts typing
    clearMessage();
    testResult = null;
  }

  /**
   * Toggle API key visibility
   */
  function toggleApiKeyVisibility() {
    showApiKey = !showApiKey;
  }

  /**
   * Validate and save API key
   */
  async function saveApiKey() {
    if (!apiKey.trim()) {
      showMessage('Please enter an API key', 'error');
      return;
    }

    // Validate format
    if (!chromeAuthManager.validateApiKey(apiKey)) {
      showMessage('Invalid API key format. Keys should start with "sk-" or "sk-ant-"', 'error');
      return;
    }

    try {
      isLoading = true;

      // Store the API key
      await chromeAuthManager.storeApiKey(apiKey);

      // Update component state
      isAuthenticated = true;
      currentAuthMode = AuthMode.ApiKey;
      maskedApiKey = maskApiKey(apiKey);

      showMessage('API key saved successfully!', 'success');

      // Notify parent components
      dispatch('authUpdated', {
        isAuthenticated: true,
        mode: AuthMode.ApiKey
      });

    } catch (error) {
      console.error('Failed to save API key:', error);
      showMessage('Failed to save API key', 'error');
    } finally {
      isLoading = false;
    }
  }

  /**
   * Test API key connection
   */
  async function testConnection() {
    if (!apiKey.trim()) {
      showMessage('Please enter an API key first', 'error');
      return;
    }

    try {
      isTesting = true;
      testResult = null;

      const result = await chromeAuthManager.testApiKey(apiKey);
      testResult = result;

      if (result.valid) {
        showMessage('Connection test successful!', 'success');
      } else {
        showMessage(`Connection test failed: ${result.error}`, 'error');
      }

    } catch (error) {
      console.error('Failed to test API key:', error);
      showMessage('Failed to test connection', 'error');
      testResult = { valid: false, error: 'Network error' };
    } finally {
      isTesting = false;
    }
  }

  /**
   * Clear stored authentication
   */
  async function clearAuth() {
    if (!confirm('Are you sure you want to remove your API key? You will need to enter it again to use the extension.')) {
      return;
    }

    try {
      isLoading = true;

      await chromeAuthManager.clearAuth();

      // Reset component state
      apiKey = '';
      maskedApiKey = '';
      isAuthenticated = false;
      currentAuthMode = null;
      testResult = null;

      showMessage('API key removed successfully', 'info');

      // Notify parent components
      dispatch('authUpdated', {
        isAuthenticated: false,
        mode: null
      });

    } catch (error) {
      console.error('Failed to clear auth:', error);
      showMessage('Failed to remove API key', 'error');
    } finally {
      isLoading = false;
    }
  }

  /**
   * Show temporary message
   */
  function showMessage(message: string, type: 'success' | 'error' | 'info') {
    saveMessage = message;
    saveMessageType = type;

    // Auto-clear after 5 seconds
    setTimeout(clearMessage, 5000);
  }

  /**
   * Clear message
   */
  function clearMessage() {
    saveMessage = '';
    saveMessageType = '';
  }

  /**
   * Close settings panel
   */
  function closeSettings() {
    dispatch('close');
  }

  /**
   * Handle Enter key in input
   */
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      saveApiKey();
    }
  }
</script>

<div class="settings-container">
  <div class="settings-header">
    <h2 class="settings-title">Settings</h2>
    <button class="close-button" on:click={closeSettings} aria-label="Close settings">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
      </svg>
    </button>
  </div>

  <div class="settings-content">
    <!-- API Key Section -->
    <div class="settings-section">
      <div class="section-header">
        <h3 class="section-title">API Key Configuration</h3>
        {#if isAuthenticated}
          <span class="auth-status authenticated">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="20,6 9,17 4,12"></polyline>
            </svg>
            Connected
          </span>
        {:else}
          <span class="auth-status not-authenticated">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            Not Connected
          </span>
        {/if}
      </div>

      <div class="form-group">
        <label for="api-key" class="form-label">
          OpenAI or Anthropic API Key
        </label>
        <div class="input-group">
          {#if showApiKey}
            <input
              id="api-key"
              type="text"
              bind:value={apiKey}
              on:input={handleApiKeyInput}
              on:keydown={handleKeydown}
              placeholder={isAuthenticated ? maskedApiKey : 'sk-...'}
              class="api-key-input"
              disabled={isLoading}
              autocomplete="off"
              spellcheck="false"
            />
          {:else}
            <input
              id="api-key"
              type="password"
              bind:value={apiKey}
              on:input={handleApiKeyInput}
              on:keydown={handleKeydown}
              placeholder={isAuthenticated ? maskedApiKey : 'sk-...'}
              class="api-key-input"
              disabled={isLoading}
              autocomplete="off"
              spellcheck="false"
            />
          {/if}
          <button
            type="button"
            class="visibility-toggle"
            on:click={toggleApiKeyVisibility}
            aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
          >
            {#if showApiKey}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
              </svg>
            {:else}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            {/if}
          </button>
        </div>
        <div class="help-text">
          Enter your API key from OpenAI (starts with 'sk-') or Anthropic (starts with 'sk-ant-')
        </div>
      </div>

      <!-- Action Buttons -->
      <div class="button-group">
        <button
          class="btn btn-primary"
          on:click={saveApiKey}
          disabled={isLoading || !apiKey.trim()}
        >
          {#if isLoading}
            <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
              </circle>
            </svg>
            Saving...
          {:else}
            Save API Key
          {/if}
        </button>

        <button
          class="btn btn-secondary"
          on:click={testConnection}
          disabled={isTesting || !apiKey.trim()}
        >
          {#if isTesting}
            <svg class="spinner" width="16" height="16" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="31.416" stroke-dashoffset="31.416">
                <animate attributeName="stroke-dasharray" dur="2s" values="0 31.416;15.708 15.708;0 31.416" repeatCount="indefinite"/>
                <animate attributeName="stroke-dashoffset" dur="2s" values="0;-15.708;-31.416" repeatCount="indefinite"/>
              </circle>
            </svg>
            Testing...
          {:else}
            Test Connection
          {/if}
        </button>

        {#if isAuthenticated}
          <button
            class="btn btn-danger"
            on:click={clearAuth}
            disabled={isLoading}
          >
            Remove API Key
          </button>
        {/if}
      </div>

      <!-- Test Result -->
      {#if testResult}
        <div class="test-result {testResult.valid ? 'success' : 'error'}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {#if testResult.valid}
              <polyline points="20,6 9,17 4,12"></polyline>
            {:else}
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            {/if}
          </svg>
          {testResult.valid ? 'Connection successful!' : `Connection failed: ${testResult.error}`}
        </div>
      {/if}

      <!-- Save Message -->
      {#if saveMessage}
        <div class="message {saveMessageType}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            {#if saveMessageType === 'success'}
              <polyline points="20,6 9,17 4,12"></polyline>
            {:else if saveMessageType === 'error'}
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            {:else}
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            {/if}
          </svg>
          {saveMessage}
        </div>
      {/if}
    </div>

    <!-- Security Notice -->
    <div class="settings-section">
      <h3 class="section-title">Security & Privacy</h3>
      <div class="security-notice">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
        <div>
          <div class="security-title">Your API key is encrypted</div>
          <div class="security-text">
            API keys are encrypted and stored locally in your browser.
            They are never sent to external servers except for API calls to OpenAI/Anthropic.
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .settings-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--codex-background);
    color: var(--codex-text);
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--codex-border);
  }

  .settings-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--codex-text);
  }

  .close-button {
    background: none;
    border: none;
    color: var(--codex-text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .close-button:hover {
    color: var(--codex-text);
    background: var(--codex-surface);
  }

  .settings-content {
    flex: 1;
    padding: 1.5rem;
    overflow-y: auto;
  }

  .settings-section {
    margin-bottom: 2rem;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .section-title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--codex-text);
  }

  .auth-status {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    padding: 0.25rem 0.75rem;
    border-radius: 9999px;
    font-weight: 500;
  }

  .auth-status.authenticated {
    color: var(--codex-success);
    background: color-mix(in srgb, var(--codex-success) 10%, transparent);
  }

  .auth-status.not-authenticated {
    color: var(--codex-error);
    background: color-mix(in srgb, var(--codex-error) 10%, transparent);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--codex-text);
  }

  .input-group {
    position: relative;
    display: flex;
  }

  .api-key-input {
    flex: 1;
    padding: 0.75rem 3rem 0.75rem 0.75rem;
    border: 1px solid var(--codex-border);
    border-radius: 0.5rem;
    background: var(--codex-surface);
    color: var(--codex-text);
    font-size: 0.875rem;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    transition: all 0.2s;
  }

  .api-key-input:focus {
    outline: none;
    border-color: var(--codex-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--codex-primary) 10%, transparent);
  }

  .api-key-input:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .visibility-toggle {
    position: absolute;
    right: 0.75rem;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: var(--codex-text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .visibility-toggle:hover {
    color: var(--codex-text);
  }

  .help-text {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--codex-text-secondary);
  }

  .button-group {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: var(--codex-primary);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--codex-primary) 90%, black);
  }

  .btn-secondary {
    background: var(--codex-surface);
    color: var(--codex-text);
    border: 1px solid var(--codex-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--codex-surface) 80%, var(--codex-text));
  }

  .btn-danger {
    background: var(--codex-error);
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--codex-error) 90%, black);
  }

  .spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .test-result, .message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    margin-top: 1rem;
  }

  .test-result.success, .message.success {
    color: var(--codex-success);
    background: color-mix(in srgb, var(--codex-success) 10%, transparent);
  }

  .test-result.error, .message.error {
    color: var(--codex-error);
    background: color-mix(in srgb, var(--codex-error) 10%, transparent);
  }

  .message.info {
    color: var(--codex-primary);
    background: color-mix(in srgb, var(--codex-primary) 10%, transparent);
  }

  .security-notice {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 0.5rem;
    background: var(--codex-surface);
    border: 1px solid var(--codex-border);
  }

  .security-notice svg {
    color: var(--codex-primary);
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .security-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: var(--codex-text);
  }

  .security-text {
    font-size: 0.875rem;
    color: var(--codex-text-secondary);
    line-height: 1.5;
  }
</style>