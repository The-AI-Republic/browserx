# Codex Web Tool Test

A standalone Chrome extension for manually testing Codex browser tools without running the full AI agent.

## Features

- **Tool Discovery**: Lists all available browser tools from the ToolRegistry
- **Interactive Testing**: Execute individual tools with custom parameters
- **Parameter Validation**: Type-aware input forms (string, number, boolean, object, array)
- **Result Visualization**: Formatted JSON output with syntax highlighting
- **Error Handling**: Clear error messages and status codes
- **Minimal UI**: Clean side panel interface with <100KB total size

## Building

From the `codex-chrome` directory:

```bash
npm run build:testtool
```

This builds the extension to `tests/tools/e2e/dist/`.

## Installation

1. Build the extension using the command above
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked"
5. Select the `tests/tools/e2e/dist/` directory
6. Click the extension icon to open the side panel

## Usage

### Tool List View

- View all available browser tools
- See tool descriptions and types
- Click any tool to view details

### Tool Detail View

- View tool description and parameter schema
- See example request format
- Fill in parameter values using type-appropriate inputs
- Execute the tool and view results
- Navigate back to tool list

### Parameter Types

- **string**: Text input field
- **number/integer**: Numeric input field
- **boolean**: Dropdown (true/false)
- **object/array**: JSON textarea (must be valid JSON)

### Example Test Scenarios

1. **Navigate Tool**
   - Select "navigate" from tool list
   - Enter URL: `https://example.com`
   - Click Execute
   - View success response

2. **DOM Query**
   - Select DOM query tool
   - Enter CSS selector: `.main-content`
   - View matching elements

3. **Screenshot**
   - Select screenshot tool
   - Execute without parameters
   - View base64 image data

## Architecture

- **Service Worker** (`service-worker.ts`): Initializes ToolRegistry, handles tool execution
- **Side Panel UI** (`sidepanel/`): Lists tools, renders forms, displays results
- **Utilities** (`utils/`): Chrome messaging, JSON formatting, result display
- **Build System**: Vite with TypeScript, path aliases to parent `src/` directory

## File Structure

```
tests/tools/e2e/
├── manifest.json           # Extension manifest (Manifest V3)
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite build configuration
├── src/
│   ├── service-worker.ts  # Background service worker
│   ├── utils/
│   │   ├── messaging.ts   # Chrome runtime messaging
│   │   └── formatting.ts  # Result formatting utilities
│   └── sidepanel/
│       ├── index.html     # Side panel HTML
│       ├── styles.css     # Minimal CSS (<5KB)
│       └── main.ts        # Main application logic
└── dist/                  # Build output (gitignored)
```

## Development

The test tool reuses production code from the parent `codex-chrome` directory:

- `@tools/ToolRegistry`: Tool management and execution
- `@tools/index`: Tool registration logic
- `@config/AgentConfig`: Configuration management

This ensures the test environment matches production behavior.

## Requirements

- Chrome 114+ (for Side Panel API)
- Node.js and npm (for building)
- Parent `codex-chrome` codebase (for tool implementations)

## Troubleshooting

**Extension won't load**
- Ensure you built the extension first (`npm run build:testtool`)
- Check that you're selecting the `dist/` directory, not `src/`
- Verify Chrome version is 114+

**Tools not appearing**
- Open Chrome DevTools (F12) on the side panel
- Check console for initialization errors
- Verify ToolRegistry is initializing correctly

**Tool execution fails**
- Check parameter format matches schema
- For object/array parameters, ensure valid JSON
- View error details in result section

## Size Metrics

- **Total dist size**: ~870KB (includes source maps)
- **CSS size**: 5.1KB (target: <5KB)
- **Minification**: Disabled for easier debugging
- **Source maps**: Enabled for development

## Related Documentation

- Feature Spec: `specs/034-codex-web-tool-test/spec.md`
- Implementation Plan: `specs/034-codex-web-tool-test/plan.md`
- Tasks: `specs/034-codex-web-tool-test/tasks.md`
