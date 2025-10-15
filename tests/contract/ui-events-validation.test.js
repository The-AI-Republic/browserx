/**
 * Contract test for validation feedback UI events
 * Verifies the UI events contract for input validation and feedback
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
    setApiKey: vi.fn(),
    clearAuth: vi.fn(),
    testConnection: vi.fn()
  },
  ChromeAuthManager: vi.fn(),
  AuthMode: {
    ApiKey: 'ApiKey'
  }
}));

global.chrome = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined)
    }
  },
  runtime: {
    lastError: null
  }
};

describe('UI Events Contract - Validation Feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateInput event', () => {
    it('should show error for invalid API key prefix', async () => {
      const { getByPlaceholderText, getByText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');

      // Enter invalid prefix
      await fireEvent.input(input, { target: { value: 'invalid-prefix-key' } });
      await tick();

      // Try to save
      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.setApiKey.mockRejectedValue(
        new Error('Invalid API key format')
      );

      const saveButton = getByText('Save API Key');
      await fireEvent.click(saveButton);

      // Should show validation error
      await waitFor(() => {
        const errorMessage = container.querySelector('.message.error');
        expect(errorMessage).toBeTruthy();
        expect(errorMessage.textContent).toContain('Invalid');
      });
    });

    it('should show error for API key too short', async () => {
      const { getByPlaceholderText, getByText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');

      // Enter too short key
      await fireEvent.input(input, { target: { value: 'sk-short' } });
      await tick();

      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.setApiKey.mockRejectedValue(
        new Error('API key must be at least 43 characters')
      );

      const saveButton = getByText('Save API Key');
      await fireEvent.click(saveButton);

      // Should show validation error
      await waitFor(() => {
        const errorMessage = container.querySelector('.message.error');
        expect(errorMessage).toBeTruthy();
      });
    });

    it('should clear error when valid input is entered', async () => {
      const { getByPlaceholderText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');

      // First enter invalid
      await fireEvent.input(input, { target: { value: 'invalid' } });
      await tick();

      // Then enter valid
      const validKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz123';
      await fireEvent.input(input, { target: { value: validKey } });
      await tick();

      // Error should be cleared when typing new input
      const errorMessage = container.querySelector('.message.error');
      expect(errorMessage).toBeFalsy();
    });

    it('should show success feedback on valid save', async () => {
      const { getByPlaceholderText, getByText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');
      const validKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz123';

      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.setApiKey.mockResolvedValue(true);

      await fireEvent.input(input, { target: { value: validKey } });
      await tick();

      const saveButton = getByText('Save API Key');
      await fireEvent.click(saveButton);

      // Should show success message
      await waitFor(() => {
        const successMessage = container.querySelector('.message.success');
        expect(successMessage).toBeTruthy();
        expect(successMessage.textContent).toContain('successfully');
      });
    });

    it('should disable save button when input is empty', async () => {
      const { getByPlaceholderText, getByText } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');
      const saveButton = getByText('Save API Key');

      // Initially with empty input
      expect(saveButton.disabled).toBe(true);

      // Add text
      await fireEvent.input(input, { target: { value: 'sk-test' } });
      await tick();
      expect(saveButton.disabled).toBe(false);

      // Clear text
      await fireEvent.input(input, { target: { value: '' } });
      await tick();
      expect(saveButton.disabled).toBe(true);
    });
  });

  describe('Test Connection validation', () => {
    it('should show success when connection test passes', async () => {
      const { getByPlaceholderText, getByText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');
      const validKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz123';

      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.testConnection.mockResolvedValue({
        valid: true
      });

      await fireEvent.input(input, { target: { value: validKey } });
      await tick();

      const testButton = getByText('Test Connection');
      await fireEvent.click(testButton);

      // Should show test success
      await waitFor(() => {
        const successResult = container.querySelector('.test-result.success');
        expect(successResult).toBeTruthy();
        expect(successResult.textContent).toContain('successful');
      });
    });

    it('should show error when connection test fails', async () => {
      const { getByPlaceholderText, getByText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');
      const invalidKey = 'sk-invalid1234567890abcdefghijklmnopqr';

      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.testConnection.mockResolvedValue({
        valid: false,
        error: 'Invalid API key'
      });

      await fireEvent.input(input, { target: { value: invalidKey } });
      await tick();

      const testButton = getByText('Test Connection');
      await fireEvent.click(testButton);

      // Should show test error
      await waitFor(() => {
        const errorResult = container.querySelector('.test-result.error');
        expect(errorResult).toBeTruthy();
        expect(errorResult.textContent).toContain('failed');
      });
    });

    it('should disable test button during testing', async () => {
      const { getByPlaceholderText, getByText } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');
      await fireEvent.input(input, { target: { value: 'sk-test' } });
      await tick();

      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.testConnection.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve({ valid: true }), 100))
      );

      const testButton = getByText('Test Connection');
      expect(testButton.disabled).toBe(false);

      // Click test - button should become disabled
      fireEvent.click(testButton);
      await tick();

      // Button text should change to "Testing..."
      await waitFor(() => {
        const testingButton = getByText('Testing...');
        expect(testingButton).toBeTruthy();
        expect(testingButton.disabled).toBe(true);
      });
    });
  });

  describe('Loading states', () => {
    it('should show loading state during save', async () => {
      const { getByPlaceholderText, getByText } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');
      await fireEvent.input(input, {
        target: { value: 'sk-1234567890abcdefghijklmnopqrstuvwxyz123' }
      });
      await tick();

      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.setApiKey.mockImplementation(() =>
        new Promise(resolve => setTimeout(() => resolve(true), 100))
      );

      const saveButton = getByText('Save API Key');
      fireEvent.click(saveButton);
      await tick();

      // Should show "Saving..." during operation
      await waitFor(() => {
        const savingButton = getByText('Saving...');
        expect(savingButton).toBeTruthy();
        expect(savingButton.disabled).toBe(true);
      });
    });

    it('should clear messages after timeout', async () => {
      vi.useFakeTimers();

      const { getByPlaceholderText, getByText, container } = render(Settings);
      await tick();

      const input = getByPlaceholderText('sk-...');
      const validKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz123';

      const { chromeAuthManager } = await import('../../src/models/ChromeAuthManager');
      chromeAuthManager.setApiKey.mockResolvedValue(true);

      await fireEvent.input(input, { target: { value: validKey } });
      await tick();

      const saveButton = getByText('Save API Key');
      await fireEvent.click(saveButton);
      await tick();

      // Message should appear
      await waitFor(() => {
        const message = container.querySelector('.message.success');
        expect(message).toBeTruthy();
      });

      // Fast-forward time (messages auto-clear after 5 seconds)
      vi.advanceTimersByTime(5000);
      await tick();

      // Message should be gone
      const message = container.querySelector('.message');
      expect(message).toBeFalsy();

      vi.useRealTimers();
    });
  });
});