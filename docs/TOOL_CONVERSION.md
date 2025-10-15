# Tool Registry to OpenAI API Conversion

## Overview

This document describes the tool conversion system in `codex-chrome` that converts internal `ToolDefinition` types to OpenAI API-compatible format.

## Problem

The tool registry uses a Rust-aligned `ToolDefinition` type that supports multiple tool types:
- `function` - Standard function tools with parameters
- `local_shell` - Shell command execution
- `web_search` - Web search capability
- `custom` - Custom/freeform tools

OpenAI's Chat Completions API only accepts tools in a specific format with `type: "function"` and a `function` object containing `name`, `description`, and `parameters`.

## Solution

The `OpenAIClient` class includes a conversion layer that transforms all `ToolDefinition` types to OpenAI-compatible format before sending requests.

### Key Components

#### 1. `convertToolsToOpenAIFormat(tools: any[]): OpenAITool[]`

Main conversion function that handles all tool types:

```typescript
// Function tools - direct conversion
{ type: 'function', function: { name, description, parameters } }
  → { type: 'function', function: { name, description, parameters } }

// local_shell - converts to function with command parameter
{ type: 'local_shell' }
  → { type: 'function', function: { name: 'local_shell', parameters: {...} } }

// web_search - converts to function with query parameter
{ type: 'web_search' }
  → { type: 'function', function: { name: 'web_search', parameters: {...} } }

// custom - converts to function with flexible parameters
{ type: 'custom', custom: { name, description, format } }
  → { type: 'function', function: { name, description, parameters: {...} } }
```

#### 2. `convertJsonSchemaToOpenAI(schema: any): any`

Recursively processes JSON schemas to ensure OpenAI compatibility:
- Preserves `type`, `description`, `required`, `additionalProperties`
- Handles nested objects recursively
- Handles array items recursively
- Supports `enum` values

### Usage

The conversion happens automatically in `convertToOpenAIRequest()`:

```typescript
const openaiRequest = {
  model: request.model,
  messages: request.messages,
  tools: request.tools ? this.convertToolsToOpenAIFormat(request.tools) : undefined,
  // ...
};
```

## Examples

### Example 1: Browser Tab Tool

**Input (ToolDefinition):**
```typescript
{
  type: 'function',
  function: {
    name: 'browser_tab',
    description: 'Manage browser tabs',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action to perform' },
        tabId: { type: 'number', description: 'Tab ID' }
      },
      required: ['action'],
      additionalProperties: false
    }
  }
}
```

**Output (OpenAI Format):**
```json
{
  "type": "function",
  "function": {
    "name": "browser_tab",
    "description": "Manage browser tabs",
    "parameters": {
      "type": "object",
      "properties": {
        "action": { "type": "string", "description": "Action to perform" },
        "tabId": { "type": "number", "description": "Tab ID" }
      },
      "required": ["action"],
      "additionalProperties": false
    }
  }
}
```

### Example 2: Shell Tool

**Input:**
```typescript
{ type: 'local_shell' }
```

**Output:**
```json
{
  "type": "function",
  "function": {
    "name": "local_shell",
    "description": "Execute local shell commands in the browser environment",
    "parameters": {
      "type": "object",
      "properties": {
        "command": {
          "type": "string",
          "description": "The shell command to execute"
        }
      },
      "required": ["command"]
    }
  }
}
```

### Example 3: Mixed Tools

**Input:**
```typescript
[
  {
    type: 'function',
    function: { name: 'browser_tab', /* ... */ }
  },
  { type: 'local_shell' },
  { type: 'web_search' }
]
```

**Output:**
```json
[
  { "type": "function", "function": { "name": "browser_tab", /* ... */ } },
  { "type": "function", "function": { "name": "local_shell", /* ... */ } },
  { "type": "function", "function": { "name": "web_search", /* ... */ } }
]
```

## Testing

Tests are located in `src/tests/unit/models/tool-conversion.test.ts` and cover:
- ✅ Function tool conversion
- ✅ local_shell conversion
- ✅ web_search conversion
- ✅ Custom tool conversion
- ✅ Nested object schemas
- ✅ Array type schemas
- ✅ Unknown tool type filtering
- ✅ Multiple mixed tool types

Run tests:
```bash
npm test -- tool-conversion
```

## Rust Alignment

This implementation aligns with the Rust codebase (`codex-rs/core/src/openai_tools.rs`) by:
1. Using the same `ToolDefinition` type structure (ported from Rust's `OpenAiTool` enum)
2. Supporting all tool types: `function`, `local_shell`, `web_search`, `custom`
3. Converting to OpenAI format only at the API boundary (preserving internal types)

## Error Handling

- Unknown tool types are filtered out with a console warning
- Null/undefined tools are skipped
- Invalid schemas are preserved as-is (OpenAI will validate and reject if needed)

## Future Enhancements

- Add validation before conversion to catch errors early
- Support for additional tool types as they're added to the protocol
- Schema optimization (removing unused fields, minifying descriptions)
