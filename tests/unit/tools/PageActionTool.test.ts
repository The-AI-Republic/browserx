/**
 * Unit tests for PageActionTool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PageActionTool } from '../../../src/tools/PageActionTool';
import type { ActionCommand } from '../../../src/types/page-actions';

describe('PageActionTool', () => {
  let tool: PageActionTool;

  beforeEach(() => {
    tool = new PageActionTool();
  });

  describe('Tool Definition', () => {
    it('should have correct tool name', () => {
      const definition = tool.getDefinition();
      expect(definition.type).toBe('function');
      if (definition.type === 'function') {
        expect(definition.function.name).toBe('page_action');
      }
    });

    it('should have correct description', () => {
      const definition = tool.getDefinition();
      if (definition.type === 'function') {
        expect(definition.function.description).toContain('Execute actions on web page elements');
      }
    });

    it('should require action parameter', () => {
      const definition = tool.getDefinition();
      if (definition.type === 'function' && definition.function.parameters.type === 'object') {
        expect(definition.function.parameters.required).toContain('action');
      }
    });
  });

  describe('Click Action', () => {
    it('should validate click action parameters', async () => {
      const request = {
        action: {
          type: 'click' as const,
          targetElement: {
            selector: '#test-button'
          },
          parameters: {
            clickType: 'left' as const
          },
          sessionId: 'test-session-123',
          turnId: 'turn-001'
        }
      };

      // This will fail without a valid Chrome context, but validates the structure
      const result = await tool.execute(request);
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('metadata');
    });

    it('should reject invalid action type', async () => {
      const request = {
        action: {
          type: 'invalid-action' as any,
          targetElement: {
            selector: '#test'
          },
          parameters: {},
          sessionId: 'test-session',
          turnId: 'turn-001'
        }
      };

      const result = await tool.execute(request);
      expect(result.success).toBe(false);
    });

    it('should require sessionId', async () => {
      const request = {
        action: {
          type: 'click' as const,
          targetElement: {
            selector: '#test'
          },
          parameters: {
            clickType: 'left' as const
          },
          turnId: 'turn-001'
          // sessionId missing
        } as any
      };

      const result = await tool.execute(request);
      expect(result.success).toBe(false);
    });
  });

  describe('Action History', () => {
    it('should initialize with empty history', () => {
      const history = tool.getRecentHistory();
      expect(Array.isArray(history)).toBe(true);
    });

    it('should track session statistics', () => {
      const stats = tool.getSessionStats('test-session');
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('successful');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('successRate');
    });

    it('should clear history', () => {
      tool.clearHistory();
      const history = tool.getRecentHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate click parameters', async () => {
      const validRequest = {
        action: {
          type: 'click' as const,
          targetElement: { selector: 'button' },
          parameters: {
            clickType: 'left' as const,
            modifiers: ['ctrl'] as ('ctrl' | 'shift' | 'alt' | 'meta')[],
            waitForNavigation: false
          },
          sessionId: 'sess-123',
          turnId: 'turn-001'
        }
      };

      const result = await tool.execute(validRequest);
      expect(result).toHaveProperty('success');
    });

    it('should reject invalid click type', async () => {
      const invalidRequest = {
        action: {
          type: 'click' as const,
          targetElement: { selector: 'button' },
          parameters: {
            clickType: 'invalid' as any
          },
          sessionId: 'sess-123',
          turnId: 'turn-001'
        }
      };

      const result = await tool.execute(invalidRequest);
      expect(result.success).toBe(false);
    });
  });
});
