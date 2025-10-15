/**
 * ModelClient Contract Tests
 * Reference: contracts/ModelClient.contract.md
 * Rust Reference: codex-rs/core/src/client.rs:85-445
 *
 * These tests verify that the TypeScript ModelClient implementation
 * matches the Rust ModelClient signatures and behavior.
 *
 * EXPECTED: These tests should FAIL initially (TDD red phase)
 * until the implementation is updated to match the contract.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAIResponsesClient } from '../OpenAIResponsesClient';
import { ResponseStream } from '../ResponseStream';
import { ModelClientError } from '../ModelClientError';
import type { Prompt, ModelFamily, ModelProviderInfo } from '../types/ResponsesAPI';
import type { ResponseEvent } from '../types/ResponseEvent';

describe('ModelClient Contract', () => {
  let client: OpenAIResponsesClient;
  let mockModelFamily: ModelFamily;
  let mockProvider: ModelProviderInfo;

  beforeEach(() => {
    mockModelFamily = {
      family: 'gpt-4',
      base_instructions: 'You are a helpful assistant.',
      supports_reasoning_summaries: false,
      needs_special_apply_patch_instructions: false,
    };

    mockProvider = {
      name: 'openai',
      base_url: 'https://api.openai.com/v1',
      wire_api: 'Responses' as const,
      request_max_retries: 3,
      stream_idle_timeout_ms: 60000,
      requires_openai_auth: true,
    };

    client = new OpenAIResponsesClient(
      {
        apiKey: 'test-api-key',
        conversationId: 'test-conversation-id',
        modelFamily: mockModelFamily,
        provider: mockProvider,
      },
      { maxRetries: 3, baseDelayMs: 100 }
    );
  });

  describe('stream() method - Rust client.rs:124', () => {
    it('returns Promise<ResponseStream> matching Rust Result<ResponseStream>', async () => {
      // This test will FAIL if stream() returns AsyncGenerator instead of ResponseStream
      const prompt: Prompt = {
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
        tools: [],
      };

      // Mock fetch to prevent actual API calls
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"type":"response.created","response":{"id":"test"}}\n\n')
            );
            controller.enqueue(
              new TextEncoder().encode('data: {"type":"response.completed","response":{"id":"test"}}\n\n')
            );
            controller.close();
          },
        }),
      } as Response);

      const result = await client.stream(prompt);

      // Contract: stream() must return ResponseStream instance
      expect(result).toBeInstanceOf(ResponseStream);

      // Contract: ResponseStream must be async iterable
      expect(result[Symbol.asyncIterator]).toBeDefined();
      expect(typeof result[Symbol.asyncIterator]).toBe('function');
    });

    it('throws ModelClientError on empty input array', async () => {
      const prompt: Prompt = {
        input: [],
        tools: [],
      };

      // Contract: Must validate input and throw on empty array
      await expect(client.stream(prompt)).rejects.toThrow();
    });
  });

  describe('getModel() method - Rust client.rs:423', () => {
    it('returns string matching Rust signature', () => {
      const model = client.getModel();

      // Contract: Must return string
      expect(typeof model).toBe('string');
      expect(model).toBe('gpt-4');
    });
  });

  describe('getModelFamily() method - Rust client.rs:428', () => {
    it('returns ModelFamily matching Rust signature', () => {
      const family = client.getModelFamily();

      // Contract: Must return ModelFamily object
      expect(family).toBeDefined();
      expect(typeof family.family).toBe('string');
      expect(typeof family.base_instructions).toBe('string');
      expect(typeof family.supports_reasoning_summaries).toBe('boolean');
    });
  });

  describe('getModelContextWindow() method - Rust client.rs:109', () => {
    it('returns number | undefined matching Rust Option<u64>', () => {
      const contextWindow = client.getModelContextWindow();

      // Contract: Must return number or undefined (Option<u64>)
      expect(contextWindow === undefined || typeof contextWindow === 'number').toBe(true);

      // For gpt-4, should return known context window
      if (contextWindow !== undefined) {
        expect(contextWindow).toBeGreaterThan(0);
      }
    });
  });

  describe('getAutoCompactTokenLimit() method - Rust client.rs:115', () => {
    it('returns number | undefined matching Rust Option<i64>', () => {
      const autoCompact = client.getAutoCompactTokenLimit();

      // Contract: Must return number or undefined (Option<i64>)
      expect(autoCompact === undefined || typeof autoCompact === 'number').toBe(true);

      // Should be ~80% of context window
      const contextWindow = client.getModelContextWindow();
      if (autoCompact !== undefined && contextWindow !== undefined) {
        expect(autoCompact).toBeLessThan(contextWindow);
        expect(autoCompact).toBeGreaterThan(contextWindow * 0.7); // At least 70%
      }
    });
  });

  describe('getProvider() method - Rust client.rs:414', () => {
    it('returns ModelProviderInfo matching Rust signature', () => {
      const provider = client.getProvider();

      // Contract: Must return ModelProviderInfo
      expect(provider).toBeDefined();
      expect(typeof provider.name).toBe('string');
      expect(provider.name).toBe('openai');
      expect(provider.wire_api).toBe('Responses');
    });
  });

  describe('getReasoningEffort() method - Rust client.rs:433', () => {
    it('returns ReasoningEffortConfig | undefined matching Rust Option', () => {
      const effort = client.getReasoningEffort();

      // Contract: Must return string or undefined (Option<ReasoningEffortConfig>)
      expect(effort === undefined || typeof effort === 'string').toBe(true);
    });
  });

  describe('getReasoningSummary() method - Rust client.rs:437', () => {
    it('returns ReasoningSummaryConfig matching Rust signature', () => {
      const summary = client.getReasoningSummary();

      // Contract: Must return ReasoningSummaryConfig (not optional in Rust)
      expect(summary).toBeDefined();
    });
  });

  describe('getAuthManager() method - Rust client.rs:442', () => {
    it('returns undefined in browser environment', () => {
      const authManager = client.getAuthManager();

      // Contract: Always undefined in browser (no file-based auth)
      expect(authManager).toBeUndefined();
    });
  });

  describe('Type compatibility with ResponseEvent', () => {
    it('ResponseStream yields ResponseEvent types matching Rust enum', async () => {
      // Mock SSE stream with multiple event types
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: new Headers(),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"type":"response.created","response":{"id":"test"}}\n\n')
            );
            controller.enqueue(
              new TextEncoder().encode('data: {"type":"response.output_text.delta","delta":"Hi"}\n\n')
            );
            controller.enqueue(
              new TextEncoder().encode(
                'data: {"type":"response.completed","response":{"id":"test","usage":{"input_tokens":10,"output_tokens":5,"total_tokens":15}}}\n\n'
              )
            );
            controller.close();
          },
        }),
      } as Response);

      const prompt: Prompt = {
        input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'Test' }] }],
        tools: [],
      };

      const stream = await client.stream(prompt);
      const events: ResponseEvent[] = [];

      for await (const event of stream) {
        events.push(event);
      }

      // Contract: All events must be valid ResponseEvent variants
      const validTypes = [
        'Created',
        'OutputItemDone',
        'Completed',
        'OutputTextDelta',
        'ReasoningSummaryDelta',
        'ReasoningContentDelta',
        'ReasoningSummaryPartAdded',
        'WebSearchCallBegin',
        'RateLimits',
      ];

      for (const event of events) {
        expect(validTypes).toContain(event.type);
      }

      // Should have at least Created and Completed
      expect(events.some((e) => e.type === 'Created')).toBe(true);
      expect(events.some((e) => e.type === 'Completed')).toBe(true);
    });
  });

  describe('Error handling matches Rust behavior', () => {
    it('throws on 401 authentication error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ error: { message: 'Invalid API key' } }),
        headers: new Headers(),
      } as Response);

      const prompt: Prompt = {
        input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'Test' }] }],
        tools: [],
      };

      // Contract: 401 errors should not retry, should throw immediately
      await expect(client.stream(prompt)).rejects.toThrow();
    });

    it('retries on 429 rate limit with exponential backoff', async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return {
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
            text: async () => JSON.stringify({ error: { message: 'Rate limit exceeded' } }),
            headers: new Headers({ 'retry-after': '1' }),
          } as Response;
        }
        return {
          ok: true,
          headers: new Headers(),
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('data: {"type":"response.created","response":{"id":"test"}}\n\n')
              );
              controller.enqueue(
                new TextEncoder().encode('data: {"type":"response.completed","response":{"id":"test"}}\n\n')
              );
              controller.close();
            },
          }),
        } as Response;
      });

      const prompt: Prompt = {
        input: [{ type: 'message', role: 'user', content: [{ type: 'text', text: 'Test' }] }],
        tools: [],
      };

      // Contract: Should retry 429 errors
      const stream = await client.stream(prompt);
      expect(stream).toBeInstanceOf(ResponseStream);
      expect(callCount).toBeGreaterThan(1); // Should have retried
    });
  });
});
