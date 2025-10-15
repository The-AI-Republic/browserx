/**
 * Contract test for API key management UI events
 * Verifies the UI events contract for adding/updating API keys
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import Settings from '../../src/sidepanel/Settings.svelte';

// Mock ChromeAuthManager
vi.mock('../../src/models/ChromeAuthManager', () => ({
  chromeAuthManager: {
    isAuthenticated: vi.fn().mockReturnValue(false),
    getAuthMode: vi.fn().mockReturnValue(null),
    retrieveApiKey: vi.fn().mockResolvedValue(null),
    setApiKey: vi.fn().mockResolvedValue(true),
    clearAuth: vi.fn().mockResolvedValue(undefined),
    testConnection: vi.fn()
  },
  ChromeAuthManager: vi.fn(),
  AuthMode: {
    ApiKey: 'ApiKey'
  }
}));

// Mock Chrome APIs
global.chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    lastError: null
  }
};

describe('UI Events Contract - API Key Management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addApiKey event', () => {
    it('should show input form when no API key exists', async () => {
      const { container, getByText, getByPlaceholderText } = render(Settings);
      await tick();

      // Should show Save API Key button
      const saveButton = getByText('Save API Key');
      expect(saveButton).toBeTruthy();

      // Should show input field
      const input = getByPlaceholderText('sk-...');
      expect(input).toBeTruthy();
    });

    it('should validate API key format on input', async () => {
      const { getByPlaceholderText, getByText } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');

      // Test invalid format
      await fireEvent.input(input, { target: { value: 'invalid-key' } });
      await tick();

      // Save button should be enabled but validation will happen on save
      const saveButton = getByText('Save API Key');
      expect(saveButton.disabled).toBe(false); // Button enabled when input has text
    });
  });

  describe('saveApiKey event', () => {
    it('should save valid API key and show success state', async () => {
      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.setApiKey.mockResolvedValue(true);

      const { getByPlaceholderText, getByText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');
      const validApiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz123';

      // Enter valid API key
      await fireEvent.input(input, { target: { value: validApiKey } });
      await tick();

      // Click save button
      const saveButton = getByText('Save API Key');
      await fireEvent.click(saveButton);

      // Wait for save operation
      await waitFor(() => {
        expect(chromeAuthManager.setApiKey).toHaveBeenCalledWith(validApiKey);
      });

      // Check for success message
      await waitFor(() => {
        const message = container.querySelector('.message.success');
        expect(message).toBeTruthy();
      });
    });

    it('should show error for invalid API key format', async () => {
      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.setApiKey.mockRejectedValue(new Error('Invalid API key format'));

      const { getByPlaceholderText, getByText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');

      // Enter invalid API key
      await fireEvent.input(input, { target: { value: 'invalid' } });
      await tick();

      // Click save button
      const saveButton = getByText('Save API Key');
      await fireEvent.click(saveButton);

      // Wait for error message
      await waitFor(() => {
        const message = container.querySelector('.message.error');
        expect(message).toBeTruthy();
      });
    });

    it('should mask API key after successful save', async () => {
      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      const apiKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz123';

      chromeAuthManager.isAuthenticated.mockReturnValue(true);
      chromeAuthManager.getAuthMode.mockReturnValue('ApiKey');
      chromeAuthManager.retrieveApiKey.mockResolvedValue(apiKey);

      const { container } = render(Settings);
      await tick();

      // Wait for component to load existing key
      await waitFor(() => {
        const inputs = container.querySelectorAll('input[type="password"]');
        const hasApiKey = Array.from(inputs).some(input =>
          input.placeholder === 'sk-123***'
        );
        expect(hasApiKey).toBe(true);
      });
    });
  });

  describe('updateApiKey event', () => {
    it('should allow updating existing API key', async () => {
      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');

      // Setup existing key
      chromeAuthManager.isAuthenticated.mockReturnValue(true);
      chromeAuthManager.getAuthMode.mockReturnValue('ApiKey');
      chromeAuthManager.retrieveApiKey.mockResolvedValue('sk-oldkey1234567890');

      const { getByText, container } = render(Settings);
      await tick();

      // Should show Remove API Key button when authenticated
      await waitFor(() => {
        const removeButton = getByText('Remove API Key');
        expect(removeButton).toBeTruthy();
      });

      // Can enter new key in input field
      const inputs = container.querySelectorAll('input');
      const apiKeyInput = Array.from(inputs).find(input =>
        input.id === 'api-key'
      );
      expect(apiKeyInput).toBeTruthy();

      // Update with new key
      const newKey = 'sk-newkey1234567890abcdefghijklmnopqrstuvwxyz';
      await fireEvent.input(apiKeyInput, { target: { value: newKey } });
      await tick();

      // Save new key
      const saveButton = getByText('Save API Key');
      await fireEvent.click(saveButton);

      await waitFor(() => {
        expect(chromeAuthManager.setApiKey).toHaveBeenCalledWith(newKey);
      });
    });
  });

  describe('deleteApiKey event', () => {
    it('should remove API key when Remove button is clicked', async () => {
      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');

      // Setup existing key
      chromeAuthManager.isAuthenticated.mockReturnValue(true);
      chromeAuthManager.getAuthMode.mockReturnValue('ApiKey');
      chromeAuthManager.retrieveApiKey.mockResolvedValue('sk-test1234567890');
      chromeAuthManager.clearAuth.mockResolvedValue(undefined);

      const { getByText, container } = render(Settings);
      await tick();

      // Wait for Remove button to appear
      await waitFor(() => {
        const removeButton = getByText('Remove API Key');
        expect(removeButton).toBeTruthy();
      });

      // Click Remove button
      const removeButton = getByText('Remove API Key');
      await fireEvent.click(removeButton);

      // Verify clearAuth was called
      await waitFor(() => {
        expect(chromeAuthManager.clearAuth).toHaveBeenCalled();
      });

      // Check for success message
      await waitFor(() => {
        const message = container.querySelector('.message');
        expect(message).toBeTruthy();
      });
    });

    it('should return to "add key" state after deletion', async () => {
      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');

      // Start with authenticated state
      chromeAuthManager.isAuthenticated.mockReturnValue(true);
      chromeAuthManager.clearAuth.mockImplementation(() => {
        // After clearing, update mock to return false
        chromeAuthManager.isAuthenticated.mockReturnValue(false);
        chromeAuthManager.getAuthMode.mockReturnValue(null);
        return Promise.resolve();
      });

      const { getByText } = render(Settings);
      await tick();

      // Click Remove button
      const removeButton = getByText('Remove API Key');
      await fireEvent.click(removeButton);

      // Should transition back to add key state
      await waitFor(() => {
        const saveButton = getByText('Save API Key');
        expect(saveButton).toBeTruthy();
      });
    });
  });
});