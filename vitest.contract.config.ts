import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest configuration for contract tests
 *
 * Contract tests verify interface compliance with Rust implementation.
 * These tests are written first (TDD) and MUST FAIL before implementation.
 */
export default defineConfig({
  plugins: [],
  test: {
    globals: true,
    environment: 'jsdom', // DOM environment for browser APIs (fetch, ReadableStream)
    setupFiles: [],

    // Contract tests only
    include: [
      'tests/contract/**/*.{test,spec}.{ts,tsx}'
    ],

    // Ensure clean test environment
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,

    // Contract tests should be fast (no real network calls)
    testTimeout: 5000,

    // Coverage for contract tests (optional)
    coverage: {
      reporter: ['text', 'json'],
      include: ['src/models/**/*.ts'],
      exclude: [
        'src/models/**/*.d.ts',
        'src/models/**/__tests__/**',
        'src/models/types/**', // Types covered by TypeScript
      ],
    },
  },

  // Resolve aliases to match main config
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@config': resolve(__dirname, 'src/config'),
      '@storage': resolve(__dirname, 'src/storage'),
      '@models': resolve(__dirname, 'src/models'),
      '@core': resolve(__dirname, 'src/core'),
      '@tools': resolve(__dirname, 'src/tools'),
      '@protocol': resolve(__dirname, 'src/protocol'),
      '@types': resolve(__dirname, 'src/types')
    }
  }
});
