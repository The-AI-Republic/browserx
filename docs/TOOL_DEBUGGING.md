# Tool Conversion Debugging Guide

## Common Error: Missing 'tools[0].function.name'

### Error Message
```
ModelClientError: OpenAI API error: Missing required parameter: 'tools[0].function.name'
```

### Root Cause
This error occurs when tools are not properly converted to OpenAI's required format before being sent to the API.

### OpenAI Required Format
OpenAI requires tools to have this exact structure:
```json
{
  "type": "function",
  "function": {
    "name": "tool_name",         // REQUIRED
    "description": "...",         // REQUIRED
    "parameters": {               // REQUIRED
      "type": "object",
      "properties": {...}
    }
  }
}
```

## How Tool Conversion Works

### 1. Internal Format (ToolDefinition)
The codebase uses a Rust-aligned `ToolDefinition` type that supports multiple tool types:

```typescript
type ToolDefinition =
  | { type: 'function'; function: ResponsesApiTool }
  | { type: 'local_shell' }
  | { type: 'web_search' }
  | { type: 'custom'; custom: FreeformTool };
```

### 2. Conversion Layer
The `OpenAIClient` automatically converts all tool types to OpenAI format:

**Location**: `src/models/OpenAIClient.ts`
**Methods**:
- `convertToolsToOpenAIFormat()` - Main conversion
- `convertJsonSchemaToOpenAI()` - Schema conversion
- `convertToOpenAIRequest()` - Request assembly

### 3. Conversion Examples

#### Function Tool (Direct)
```typescript
// Input
{
  type: 'function',
  function: {
    name: 'browser_tab',
    description: 'Manage browser tabs',
    strict: false,
    parameters: { type: 'object', properties: {...} }
  }
}

// Output (strict field removed, schema normalized)
{
  type: 'function',
  function: {
    name: 'browser_tab',
    description: 'Manage browser tabs',
    parameters: { type: 'object', properties: {...} }
  }
}
```

#### Built-in Tool (Converted)
```typescript
// Input
{ type: 'local_shell' }

// Output (converted to function with parameters)
{
  type: 'function',
  function: {
    name: 'local_shell',
    description: 'Execute local shell commands in the browser environment',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' }
      },
      required: ['command']
    }
  }
}
```

## Debugging Tools

### 1. Console Logs
The OpenAIClient includes debug logging:

```javascript
// When converting tools
[OpenAIClient] Converting tools: {
  inputCount: 3,
  outputCount: 3,
  inputSample: {...},
  outputSample: {...}
}

// When making requests
[OpenAIClient] makeStreamRequest: {
  model: 'gpt-4',
  messages: 2,
  tools: 3,
  toolsSample: '{"type":"function",...}'
}

// On errors
[OpenAIClient] Request failed: {
  status: 400,
  error: 'Missing required parameter...',
  requestTools: [...]
}
```

### 2. Validation Checks
The code includes validation to catch issues early:

```typescript
// In convertToOpenAIRequest()
if (!tool.function || !tool.function.name) {
  throw new ModelClientError(
    `Tool at index ${i} is missing required field 'function.name'`
  );
}
```

### 3. Test Files
Run these tests to verify tool conversion:

```bash
# Basic conversion tests
npm test -- tool-conversion

# Debug tests with detailed logging
npm test -- openai-stream-debug
```

## Common Issues and Solutions

### Issue 1: Tools Array is Empty After Conversion

**Symptom**: Input has tools, but output has 0 tools

**Possible Causes**:
1. Unknown tool type being filtered out
2. Tool missing required fields
3. Tool structure doesn't match any known type

**Solution**:
```typescript
// Check console for warnings:
"Unknown tool type: xyz, skipping"
"convertToolsToOpenAIFormat: function tool missing required fields"

// Fix by ensuring tools match ToolDefinition type
```

### Issue 2: Tool Missing Name or Description

**Symptom**: Error "Missing required parameter: 'tools[0].function.name'"

**Possible Causes**:
1. Tool definition incomplete
2. Conversion logic has bug
3. Tool type not handled correctly

**Solution**:
```typescript
// Verify tool structure before passing to stream()
const tool = {
  type: 'function',
  function: {
    name: 'my_tool',           // Must be present
    description: 'My tool',     // Must be present
    strict: false,
    parameters: {
      type: 'object',
      properties: {}
    }
  }
};
```

### Issue 3: Parameters Schema Invalid

**Symptom**: OpenAI rejects the request with schema error

**Possible Causes**:
1. Schema doesn't match OpenAI requirements
2. Nested schemas not properly converted
3. Invalid type in schema

**Solution**:
```typescript
// Use proper JsonSchema format
const parameters = {
  type: 'object',               // Must be 'object' for root
  properties: {
    param1: {
      type: 'string',           // Supported: string, number, boolean, array, object
      description: 'Param 1'
    }
  },
  required: ['param1']          // Optional array of required param names
};
```

## Best Practices

### 1. Always Use Helper Functions
```typescript
import { createFunctionTool, createObjectSchema } from '@/tools/BaseTool';

const tool = createFunctionTool(
  'tool_name',
  'Tool description',
  createObjectSchema({
    param1: { type: 'string', description: 'Param 1' }
  }, {
    required: ['param1']
  })
);
```

### 2. Register Tools Properly
```typescript
const registry = new ToolRegistry();

// Get definition from BaseTool subclass
const tabTool = new TabTool();
await registry.register(
  tabTool.getDefinition(),  // Already in correct ToolDefinition format
  async (params, context) => tabTool.execute(params)
);
```

### 3. Validate Tools Before Using
```typescript
// Check tool structure
const tool = registry.getTool('browser_tab');
if (tool && tool.type === 'function') {
  console.log('Tool:', tool.function.name, tool.function.description);
}

// List all tools
const tools = registry.listTools();
console.log(`Registered ${tools.length} tools`);
```

### 4. Handle Conversion Errors
```typescript
try {
  const stream = await client.stream({ input, tools });
} catch (error) {
  if (error instanceof ModelClientError) {
    console.error('OpenAI API Error:', error.message);
    // Check console logs for tool conversion details
  }
}
```

## Troubleshooting Checklist

When you encounter tool-related errors:

- [ ] Check console for `[OpenAIClient]` debug logs
- [ ] Verify tools array is not empty: `tools.length > 0`
- [ ] Verify each tool has `type` field
- [ ] For function tools, verify `function.name` exists
- [ ] For function tools, verify `function.description` exists
- [ ] For function tools, verify `function.parameters` is an object
- [ ] Check for "Unknown tool type" warnings
- [ ] Check for "missing required fields" errors
- [ ] Run `npm test -- tool-conversion` to verify conversion logic
- [ ] Add temporary logging to see tool structure: `console.log(JSON.stringify(tools, null, 2))`

## Example: Complete Flow

```typescript
// 1. Create tool definition
const tool: ToolDefinition = {
  type: 'function',
  function: {
    name: 'browser_tab',
    description: 'Manage browser tabs',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action to perform' }
      },
      required: ['action']
    }
  }
};

// 2. Register with ToolRegistry
await registry.register(tool, async (params) => {
  // Handler implementation
});

// 3. Get all tools for prompt
const tools = registry.listTools();

// 4. Create prompt
const prompt = {
  input: [{ type: 'message', role: 'user', content: 'Create a tab' }],
  tools  // Will be converted automatically
};

// 5. Stream with OpenAI
const stream = await client.stream(prompt);
// Tools are converted in convertToOpenAIRequest()
// Validation happens before API call
// Detailed logs show conversion process

// 6. Check logs if error occurs
// [OpenAIClient] Converting tools: {...}
// [OpenAIClient] makeStreamRequest: {...}
// [OpenAIClient] Request failed: {...} (if error)
```

## Additional Resources

- OpenAI API Documentation: https://platform.openai.com/docs/api-reference/chat/create
- Tool Registry Tests: `src/tests/contracts/tool-registry.test.ts`
- Conversion Tests: `src/tests/unit/models/tool-conversion.test.ts`
- Debug Tests: `src/tests/unit/models/openai-stream-debug.test.ts`
- Tool Conversion Docs: `docs/TOOL_CONVERSION.md`
