/**
 * Zod validation schemas for page action parameters
 * Runtime type checking for ActionCommand and related types
 */

import { z } from 'zod';

// Action type schema
export const ActionTypeSchema = z.enum(['click', 'input', 'scroll', 'verify']);

// Element context schema
export const ElementContextSchema = z.object({
  iframeDepth: z.number().min(0),
  iframePath: z.array(z.string()),
  shadowDomPath: z.array(z.string()),
  frameId: z.number().optional()
});

// Element target schema
export const ElementTargetSchema = z.object({
  selector: z.string().optional(),
  nodeId: z.number().optional(),
  semanticDescription: z.string().optional(),
  context: ElementContextSchema.optional()
}).refine(
  data => data.selector || data.nodeId || data.semanticDescription,
  { message: "At least one identification method required (selector, nodeId, or semanticDescription)" }
);

// Click parameters schema
export const ClickParametersSchema = z.object({
  clickType: z.enum(['left', 'right', 'middle', 'double']).default('left'),
  modifiers: z.array(z.enum(['ctrl', 'shift', 'alt', 'meta'])).optional(),
  waitForNavigation: z.boolean().default(false)
});

// Input parameters schema
export const InputParametersSchema = z.object({
  text: z.string(),
  clearFirst: z.boolean().default(true),
  pressEnter: z.boolean().default(false),
  typeSpeed: z.number().min(0).default(0)
});

// Scroll parameters schema
export const ScrollParametersSchema = z.object({
  scrollType: z.enum(['by-pixels', 'to-element', 'to-position']),
  pixels: z.object({
    x: z.number(),
    y: z.number()
  }).optional(),
  position: z.enum(['top', 'bottom', 'center']).optional(),
  smooth: z.boolean().default(true),
  waitForLazyLoad: z.boolean().default(true),
  lazyLoadTimeout: z.number().default(2000)
});

// Verify parameters schema
export const VerifyParametersSchema = z.object({
  checkType: z.enum(['visible', 'enabled', 'exists', 'value']),
  expectedValue: z.string().optional()
});

// Action parameters union schema
export const ActionParametersSchema = z.union([
  ClickParametersSchema,
  InputParametersSchema,
  ScrollParametersSchema,
  VerifyParametersSchema
]);

// Error code schema
export const ErrorCodeSchema = z.enum([
  'ELEMENT_NOT_FOUND',
  'ELEMENT_NOT_INTERACTABLE',
  'ELEMENT_STALE',
  'ELEMENT_OBSCURED',
  'TIMEOUT',
  'NAVIGATION_BLOCKED',
  'CROSS_ORIGIN_DENIED',
  'VALIDATION_FAILED',
  'UNKNOWN_ERROR'
]);

/**
 * Page action error codes for standardized error handling
 * Maps to ToolError interface used by ToolRegistry
 */
export enum PageActionErrorCode {
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',
  ELEMENT_STALE = 'ELEMENT_STALE',
  ELEMENT_NOT_INTERACTABLE = 'ELEMENT_NOT_INTERACTABLE',
  ACTION_TIMEOUT = 'ACTION_TIMEOUT',
  INVALID_ACTION_TYPE = 'INVALID_ACTION_TYPE',
  SELECTOR_MAP_REFRESH_FAILED = 'SELECTOR_MAP_REFRESH_FAILED',
  CONTENT_SCRIPT_ERROR = 'CONTENT_SCRIPT_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// Retry config schema
export const RetryConfigSchema = z.object({
  maxAttempts: z.number().min(1).max(10).default(3),
  delays: z.array(z.number().min(0)).default([100, 300, 900]),
  retryableErrors: z.array(ErrorCodeSchema)
});

// Action command schema
export const ActionCommandSchema = z.object({
  type: ActionTypeSchema,
  targetElement: ElementTargetSchema,
  parameters: ActionParametersSchema,
  sessionId: z.string().uuid(),
  turnId: z.string(),
  timeout: z.number().min(1000).max(60000).default(30000),
  retryConfig: RetryConfigSchema.optional()
});

// Page action tool request schema
export const PageActionToolRequestSchema = z.object({
  action: ActionCommandSchema,
  selectorMap: z.any().optional(), // DOMSelectorMap - complex type, validated separately
  tabId: z.number().optional()
});

// Helper function to validate action parameters based on action type
export function validateActionParameters(type: string, parameters: any): boolean {
  switch (type) {
    case 'click':
      return ClickParametersSchema.safeParse(parameters).success;
    case 'input':
      return InputParametersSchema.safeParse(parameters).success;
    case 'scroll':
      return ScrollParametersSchema.safeParse(parameters).success;
    case 'verify':
      return VerifyParametersSchema.safeParse(parameters).success;
    default:
      return false;
  }
}
