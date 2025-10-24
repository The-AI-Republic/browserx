<!--
  Settings - Svelte component for managing user settings
  Handles API key configuration and secure storage
-->

<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { AgentConfig } from '../config/AgentConfig.js';
  import { encryptApiKey, decryptApiKey } from '../utils/encryption.js';
  import { AuthMode } from '../models/types/index.js';
  import ModelSelector from './settings/ModelSelector.svelte';
  import type { ConfiguredFeatures } from '../config/types.js';

  // Component state
  let apiKey = '';
  let maskedApiKey = '';
  let showApiKey = false;
  let isInitializing = true;
  let isSaving = false;
  let isTesting = false;
  let isModelSwitching = false;
  let isClearingAuth = false;
  let saveMessage = '';
  let saveMessageType: 'success' | 'error' | 'info' | '' = '';
  let testResult: { valid: boolean; error?: string } | null = null;
  let isAuthenticated = false;
  let currentAuthMode: AuthMode | null = null;

  // T011: Model configuration state
  let selectedModel = 'gpt-5';
  let configuredFeatures: ConfiguredFeatures = {};
  let modelValidationError = '';

  // T022, T023: Provider-aware API key display
  let currentProvider = 'openai';
  let providerValidationWarning = '';

  // T044: Provider status tracking
  let configuredProviders: string[] = [];

  // AgentConfig instance for this component
  let agentConfig: AgentConfig | null = null;

  // Event dispatcher for parent components
  const dispatch = createEventDispatcher<{
    authUpdated: { isAuthenticated: boolean; mode: AuthMode | null };
    close: void;
  }>();

  // Load existing settings on mount
  onMount(async () => {
    // Create and initialize AgentConfig instance
    agentConfig = AgentConfig.getInstance();
    await agentConfig.initialize();

    await loadSettings();
  });

  /**
   * T042: Load existing settings from AgentConfig
   * Updated to use selectedModelId system
   */
  async function loadSettings() {
    try {
      isInitializing = true;

      if (!agentConfig) {
        throw new Error('AgentConfig not initialized');
      }

      // Load selectedModelId and resolve to get model and provider info
      const config = agentConfig.getConfig();
      selectedModel = config.selectedModelId;

      // Get model and provider from registry
      const modelData = agentConfig.getModelById(selectedModel);
      if (modelData) {
        currentProvider = modelData.provider.id;
        configuredFeatures = {
          reasoningEffort: null,
          reasoningSummary: undefined,
          verbosity: null,
          contextWindow: modelData.model.contextWindow,
          maxOutputTokens: modelData.model.maxOutputTokens
        };
      } else {
        // Fallback
        currentProvider = 'openai';
        configuredFeatures = {};
      }

      // Load API key for current provider
      const providerApiKey = await agentConfig.getProviderApiKey(currentProvider);
      if (providerApiKey) {
        apiKey = providerApiKey;
        maskedApiKey = maskApiKey(providerApiKey);
        isAuthenticated = true;
        currentAuthMode = AuthMode.ApiKey;
      } else {
        isAuthenticated = false;
        currentAuthMode = null;
      }

      // Load configured providers
      configuredProviders = agentConfig.getConfiguredProviders();
    } catch (error) {
      console.error('Failed to load settings:', error);
      showMessage('Failed to load settings', 'error');
    } finally {
      isInitializing = false;
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
   * T024, T025, T026: Validate and save API key with provider-aware validation
   */
  async function saveApiKey() {
    if (isSaving) {
      return;
    }

    if (!apiKey.trim()) {
      showMessage('Please enter an API key', 'error');
      return;
    }

    if (!agentConfig) {
      showMessage('Configuration not initialized', 'error');
      return;
    }

    try {
      isSaving = true;

      // T024: Validate API key format using provider-aware validation
      const { validateApiKeyFormat } = await import('../config/validators');
      const validation = validateApiKeyFormat(apiKey, currentProvider);

      if (!validation.isValid) {
        providerValidationWarning = '';
        showMessage(validation.errors.join('. '), 'error');
        return;
      }

      // T025: Display warning if provider mismatch, but allow save
      if (validation.warnings.length > 0) {
        providerValidationWarning = validation.warnings.join(' ');
      } else {
        providerValidationWarning = '';
      }

      await agentConfig.setProviderApiKey(currentProvider, apiKey);

      // Update component state
      isAuthenticated = true;
      currentAuthMode = AuthMode.ApiKey;
      maskedApiKey = maskApiKey(apiKey);

      // T044: Refresh configured providers list
      configuredProviders = agentConfig.getConfiguredProviders();

      showMessage('API key saved successfully!', 'success');

      // Send message to service worker to reload config and recreate BrowserxAgent
      chrome.runtime.sendMessage({
        type: 'CONFIG_UPDATE'
      }).catch(err => {
        console.error('Failed to notify service worker of config update:', err);
      });

      // Notify parent components
      dispatch('authUpdated', {
        isAuthenticated: true,
        mode: AuthMode.ApiKey
      });

    } catch (error) {
      console.error('Failed to save API key:', error);
      showMessage('Failed to save API key', 'error');
    } finally {
      isSaving = false;
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

    // Validate format based on current provider
    const isValidFormat =
      (apiKey.startsWith('sk-') && apiKey.length >= 40) ||
      (apiKey.startsWith('sk-ant-') && apiKey.length >= 40) ||
      (apiKey.startsWith('xai-') && apiKey.length >= 40);

    if (!isValidFormat) {
      showMessage('Invalid API key format. Expected format: ' +
        (currentProvider === 'openai' ? 'sk-...' :
         currentProvider === 'xai' ? 'xai-...' :
         currentProvider === 'anthropic' ? 'sk-ant-...' : 'provider-specific'), 'error');
      testResult = { valid: false, error: 'Invalid format' };
      return;
    }

    try {
      isTesting = true;
      testResult = null;

      // Determine provider and endpoint
      const isAnthropic = apiKey.startsWith('sk-ant-') || currentProvider === 'anthropic';
      const isXAI = apiKey.startsWith('xai-') || currentProvider === 'xai';

      let baseUrl: string;
      if (isAnthropic) {
        baseUrl = 'https://api.anthropic.com/v1/messages';
      } else if (isXAI) {
        baseUrl = 'https://api.x.ai/v1/chat/completions';
      } else {
        baseUrl = 'https://api.openai.com/v1/chat/completions';
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (isAnthropic) {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
      } else {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      // Make a minimal test request using the currently selected model
      const testRequest: any = isAnthropic ? {
        model: selectedModel,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      } : {
        model: selectedModel,
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
        testResult = { valid: true };
        showMessage('Connection test successful!', 'success');
      } else if (response.status === 401) {
        testResult = { valid: false, error: 'Invalid API key' };
        showMessage('Connection test failed: Invalid API key', 'error');
      } else {
        testResult = { valid: false, error: `API error: ${response.status}` };
        showMessage(`Connection test failed: API error ${response.status}`, 'error');
      }

    } catch (error) {
      console.error('Failed to test API key:', error);
      const errorMsg = error instanceof Error ? error.message : 'Network error';
      testResult = { valid: false, error: errorMsg };
      showMessage('Failed to test connection', 'error');
    } finally {
      isTesting = false;
    }
  }

  /**
   * T040: Clear stored authentication for current provider
   */
  async function clearAuth() {
    if (!confirm(`Are you sure you want to remove your ${currentProvider === 'openai' ? 'OpenAI' : currentProvider === 'xai' ? 'xAI' : currentProvider === 'anthropic' ? 'Anthropic' : currentProvider} API key? You will need to enter it again to use this provider.`)) {
      return;
    }

    if (!agentConfig) {
      showMessage('Configuration not initialized', 'error');
      return;
    }

    try {
      isClearingAuth = true;

      // Delete provider-specific API key
      await agentConfig.deleteProviderApiKey(currentProvider);

      // Reset component state
      apiKey = '';
      maskedApiKey = '';
      isAuthenticated = false;
      currentAuthMode = null;
      testResult = null;

      // Update configured providers list
      configuredProviders = agentConfig.getConfiguredProviders();

      showMessage(`${currentProvider === 'openai' ? 'OpenAI' : currentProvider === 'xai' ? 'xAI' : currentProvider === 'anthropic' ? 'Anthropic' : currentProvider} API key removed successfully`, 'info');

      // Send message to service worker to reload config and recreate BrowserxAgent
      chrome.runtime.sendMessage({
        type: 'CONFIG_UPDATE'
      }).catch(err => {
        console.error('Failed to notify service worker of config update:', err);
      });

      // Notify parent components
      dispatch('authUpdated', {
        isAuthenticated: false,
        mode: null
      });

    } catch (error) {
      console.error('Failed to clear auth:', error);
      showMessage('Failed to remove API key', 'error');
    } finally {
      isClearingAuth = false;
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
      if (isSaving || isModelSwitching || isClearingAuth || isInitializing) {
        event.preventDefault();
        return;
      }
      saveApiKey();
    }
  }

  /**
   * T039: Check if there's an active conversation
   */
  async function isConversationActive(): Promise<boolean> {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      return response?.isActiveTurn || false;
    } catch (error) {
      console.error('Failed to check conversation status:', error);
      return false;
    }
  }

  /**
   * T024: Handle model selection change using selectedModelId system
   * T025: Update currentProvider reactively based on selectedModelId
   * T026: Async API key loading to prevent UI freezing
   */
  async function handleModelChange(event: CustomEvent<{ modelId: string }>) {
    if (!agentConfig) return;

    try {
      isModelSwitching = true;
      const { modelId } = event.detail;

      // Check if there's an active conversation
      const conversationActive = await isConversationActive();
      // test>>
      console.log('$$$ conversationActive', conversationActive);
      // test<<
      if (conversationActive) {
        showMessage('Cannot change model during an active conversation. Please end the conversation first.', 'error');
        isModelSwitching = false;
        return;
      }

      // Use new setSelectedModel() method
      await agentConfig.setSelectedModel(modelId);

      // Get model and provider info from registry
      const modelData = agentConfig.getModelById(modelId);
      if (!modelData) {
        throw new Error('Model not found in registry');
      }

      selectedModel = modelId;
      currentProvider = modelData.provider.id;
      modelValidationError = '';
      providerValidationWarning = '';

      // T026: Async load API key for new provider (non-blocking)
      const providerApiKey = await agentConfig.getProviderApiKey(currentProvider);

      if (providerApiKey) {
        // API key exists, update UI
        apiKey = providerApiKey;
        maskedApiKey = maskApiKey(providerApiKey);
        isAuthenticated = true;
        showMessage(`Model changed to ${modelData.model.name}. Session will be reinitialized.`, 'success');
        chrome.runtime.sendMessage({ type: 'CONFIG_UPDATE' });
      } else {
        // No API key, prompt user
        const providerName = modelData.provider.name;
        apiKey = '';
        maskedApiKey = '';
        isAuthenticated = false;
        showMessage(`Model changed to ${modelData.model.name}. Please configure your ${providerName} API key below.`, 'info');
      }

      // Update configured providers list
      configuredProviders = agentConfig.getConfiguredProviders();
    } catch (error) {
      console.error('Failed to change model:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showMessage(`Failed to change model: ${errorMessage}`, 'error');

      // Revert model selection on error
      const config = agentConfig.getConfig();
      selectedModel = config.selectedModelId;
      const modelData = agentConfig.getModelById(selectedModel);
      if (modelData) {
        currentProvider = modelData.provider.id;
      }
    } finally {
      isModelSwitching = false;
    }
  }

  /**
   * T015: Handle validation errors
   */
  function handleValidationError(event: CustomEvent) {
    const { errors, incompatibleFeatures } = event.detail;
    modelValidationError = errors.join('. ');
    showMessage(`Cannot select model: ${modelValidationError}`, 'error');
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
    <!-- T021: Model Selection moved above API Key Section -->
    <div class="settings-section">
      <h3 class="section-title">Model Selection</h3>
      <div class="form-group">
        <label class="form-label">
          Choose AI Model
        </label>
        <ModelSelector
          {selectedModel}
          {configuredFeatures}
          disabled={isInitializing || isSaving}
          on:modelChange={handleModelChange}
          on:validationError={handleValidationError}
        />
        <div class="help-text">
          Select the AI model to use for conversations. Different models have different capabilities and costs.
        </div>

        {#if modelValidationError}
          <div class="message error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
            {modelValidationError}
          </div>
        {/if}

        <!-- T044: Provider status indicators -->
        {#if configuredProviders.length > 0}
          <div class="provider-status-container">
            <div class="provider-status-label">Configured Providers:</div>
            <div class="provider-badges">
              {#each configuredProviders as providerId}
                <span class="provider-badge" class:active={providerId === currentProvider}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="12" r="10"></circle>
                  </svg>
                  {providerId === 'openai' ? 'OpenAI' : providerId === 'xai' ? 'xAI' : providerId === 'anthropic' ? 'Anthropic' : providerId}
                </span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>

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
          {#if currentProvider === 'xai'}
            xAI API Key
          {:else if currentProvider === 'anthropic'}
            Anthropic API Key
          {:else}
            OpenAI API Key
          {/if}
        </label>
        <div class="input-group">
          {#if showApiKey}
            <input
              id="api-key"
              type="text"
              bind:value={apiKey}
              on:input={handleApiKeyInput}
              on:keydown={handleKeydown}
              placeholder={isAuthenticated ? maskedApiKey : (currentProvider === 'xai' ? 'xai-...' : currentProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...')}
              class="api-key-input"
              disabled={isInitializing || isSaving}
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
              placeholder={isAuthenticated ? maskedApiKey : (currentProvider === 'xai' ? 'xai-...' : currentProvider === 'anthropic' ? 'sk-ant-...' : 'sk-...')}
              class="api-key-input"
              disabled={isInitializing || isSaving}
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
          {#if currentProvider === 'xai'}
            Enter your xAI API key (starts with 'xai-')
          {:else if currentProvider === 'anthropic'}
            Enter your Anthropic API key (starts with 'sk-ant-')
          {:else}
            Enter your OpenAI API key (starts with 'sk-' or 'sk-proj-')
          {/if}
        </div>

        {#if !apiKey.trim()}
          <div class="message warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            Please input a valid API key.
          </div>
        {/if}

        {#if providerValidationWarning}
          <div class="message warning">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            {providerValidationWarning}
          </div>
        {/if}
      </div>

      <!-- Action Buttons -->
      <div class="button-group">
        <button
          class="btn btn-primary"
          on:click={saveApiKey}
          disabled={isInitializing || isSaving || !apiKey.trim()}
        >
          {#if isSaving}
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
            disabled={isInitializing || isSaving}
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
    background: var(--browserx-background);
    color: var(--browserx-text);
  }

  .settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    border-bottom: 1px solid var(--browserx-border);
  }

  .settings-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--browserx-text);
  }

  .close-button {
    background: none;
    border: none;
    color: var(--browserx-text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .close-button:hover {
    color: var(--browserx-text);
    background: var(--browserx-surface);
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
    color: var(--browserx-text);
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
    color: var(--browserx-success);
    background: color-mix(in srgb, var(--browserx-success) 10%, transparent);
  }

  .auth-status.not-authenticated {
    color: var(--browserx-error);
    background: color-mix(in srgb, var(--browserx-error) 10%, transparent);
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-label {
    display: block;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--browserx-text);
  }

  .input-group {
    position: relative;
    display: flex;
  }

  .api-key-input {
    flex: 1;
    padding: 0.75rem 3rem 0.75rem 0.75rem;
    border: 1px solid var(--browserx-border);
    border-radius: 0.5rem;
    background: var(--browserx-surface);
    color: var(--browserx-text);
    font-size: 0.875rem;
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Roboto Mono', monospace;
    transition: all 0.2s;
  }

  .api-key-input:focus {
    outline: none;
    border-color: var(--browserx-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--browserx-primary) 10%, transparent);
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
    color: var(--browserx-text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.25rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .visibility-toggle:hover {
    color: var(--browserx-text);
  }

  .help-text {
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: var(--browserx-text-secondary);
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
    background: var(--browserx-primary);
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--browserx-primary) 90%, black);
  }

  .btn-secondary {
    background: var(--browserx-surface);
    color: var(--browserx-text);
    border: 1px solid var(--browserx-border);
  }

  .btn-secondary:hover:not(:disabled) {
    background: color-mix(in srgb, var(--browserx-surface) 80%, var(--browserx-text));
  }

  .btn-danger {
    background: var(--browserx-error);
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: color-mix(in srgb, var(--browserx-error) 90%, black);
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
    color: var(--browserx-success);
    background: color-mix(in srgb, var(--browserx-success) 10%, transparent);
  }

  .test-result.error, .message.error {
    color: var(--browserx-error);
    background: color-mix(in srgb, var(--browserx-error) 10%, transparent);
  }

  .message.info {
    color: var(--browserx-primary);
    background: color-mix(in srgb, var(--browserx-primary) 10%, transparent);
  }

  .message.warning {
    color: #f59e0b;
    background: color-mix(in srgb, #f59e0b 10%, transparent);
  }

  .security-notice {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    border-radius: 0.5rem;
    background: var(--browserx-surface);
    border: 1px solid var(--browserx-border);
  }

  .security-notice svg {
    color: var(--browserx-primary);
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  .security-title {
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: var(--browserx-text);
  }

  .security-text {
    font-size: 0.875rem;
    color: var(--browserx-text-secondary);
    line-height: 1.5;
  }

  /* T044: Provider status indicators */
  .provider-status-container {
    margin-top: 1rem;
    padding: 0.75rem;
    background: var(--browserx-surface);
    border: 1px solid var(--browserx-border);
    border-radius: 0.5rem;
  }

  .provider-status-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--browserx-text-secondary);
    margin-bottom: 0.5rem;
  }

  .provider-badges {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .provider-badge {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem 0.75rem;
    background: var(--browserx-background);
    border: 1px solid var(--browserx-border);
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--browserx-text-secondary);
    transition: all 0.2s;
  }

  .provider-badge svg {
    color: #10b981;
  }

  .provider-badge.active {
    border-color: var(--browserx-primary);
    color: var(--browserx-primary);
    background: color-mix(in srgb, var(--browserx-primary) 10%, transparent);
  }

  .provider-badge.active svg {
    color: var(--browserx-primary);
  }
</style>
