/**
 * Prompt Helper Functions
 *
 * Utility functions for working with Prompt structures, aligned with Rust implementation.
 *
 * **Rust Reference**: `codex-rs/core/src/client_common.rs:42-68`
 */

import type { Prompt, ModelFamily, ResponseItem } from './types/ResponsesAPI';

/**
 * Get full instructions by combining base instructions with user instructions.
 *
 * Matches Rust's `impl Prompt::get_full_instructions(&self, model: &ModelFamily)`
 *
 * **Rust Reference**: `codex-rs/core/src/client_common.rs:42-64`
 *
 * @param prompt - The prompt containing optional instruction overrides
 * @param model - The model family configuration with base instructions
 * @returns Combined instructions string (base + user instructions)
 *
 * @example
 * ```typescript
 * const prompt: Prompt = {
 *   input: [],
 *   tools: [],
 *   user_instructions: 'Follow coding best practices.',
 * };
 *
 * const model: ModelFamily = {
 *   family: 'gpt-5',
 *   base_instructions: 'You are a helpful coding assistant.',
 *   supports_reasoning_summaries: true,
 *   needs_special_apply_patch_instructions: false,
 * };
 *
 * const instructions = get_full_instructions(prompt, model);
 * // Result: "You are a helpful coding assistant.\nFollow coding best practices."
 * ```
 */
export function get_full_instructions(prompt: Prompt, model: ModelFamily): string {
  // Use base_instructions_override if present, otherwise use model's base_instructions
  const base = prompt.base_instructions_override || model.base_instructions;

  // Build parts array for joining
  const parts = [base];

  // Add user_instructions if present
  if (prompt.user_instructions) {
    parts.push(prompt.user_instructions);
  }

  // TODO: Add apply_patch tool instructions if needed (future enhancement)
  // This matches Rust's logic at client_common.rs:47-60
  // if (!prompt.base_instructions_override && model.needs_special_apply_patch_instructions) {
  //   const hasApplyPatchTool = prompt.tools.some(tool =>
  //     tool.type === 'function' && tool.function.name === 'apply_patch'
  //   );
  //   if (!hasApplyPatchTool) {
  //     parts.push(APPLY_PATCH_TOOL_INSTRUCTIONS);
  //   }
  // }

  return parts.join('\n');
}

/**
 * Get formatted input for API request.
 *
 * Returns a cloned copy of the input array to prevent mutations.
 *
 * Matches Rust's `impl Prompt::get_formatted_input(&self)`
 *
 * **Rust Reference**: `codex-rs/core/src/client_common.rs:66-68`
 *
 * @param prompt - The prompt containing input items
 * @returns Cloned array of ResponseItem
 *
 * @example
 * ```typescript
 * const prompt: Prompt = {
 *   input: [
 *     { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Hello' }] },
 *     { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Hi!' }] },
 *   ],
 *   tools: [],
 * };
 *
 * const formattedInput = get_formatted_input(prompt);
 * // Returns cloned array (not same reference as prompt.input)
 * console.log(formattedInput !== prompt.input); // true
 * console.log(formattedInput.length); // 2
 * ```
 */
export function get_formatted_input(prompt: Prompt): ResponseItem[] {
  // Clone the input array to prevent mutations
  // In Rust, this is `self.input.clone()`
  return [...prompt.input];
}
