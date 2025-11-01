# Quickstart Guide: CDP Screenshot Tool

**Feature**: 006-cdp-screenshot-tool
**Audience**: Developers implementing the PageScreenShotTool feature
**Est. Reading Time**: 10 minutes

## Overview

This guide provides a practical introduction to implementing and using the PageScreenShotTool feature in browserx Chrome extension. The tool enables AI agents to capture visual screenshots and perform coordinate-based interactions as a complement to DOM-based page operations.

---

## What You'll Build

1. **DOMTool Enhancement** - Add explicit `scroll` action to DOMTool
2. **PageScreenShotTool** - Main tool interface exposed to LLM
3. **ScreenshotService** - CDP-based screenshot capture
4. **CoordinateActionService** - Coordinate-based click, type, scroll, keypress
5. **ScreenshotFileManager** - Temporary file storage and cleanup
6. **ViewportDetector** - Viewport visibility detection for DOM nodes
7. **OpenAI Integration** - Image upload to vision API

---

## Prerequisites

- TypeScript 5.9.2+ development environment
- Existing browserx Chrome extension codebase
- Familiarity with Chrome DevTools Protocol (CDP)
- Chrome browser with debugger permission enabled
- OpenAI API key with GPT-4 Vision access

---

## Project Structure

```
src/tools/
├── PageScreenShotTool.ts           # ← Start here (tool interface)
├── screenshot/
│   ├── ScreenshotService.ts        # ← Then implement this
│   ├── CoordinateActionService.ts  # ← Coordinate-based actions
│   ├── ScreenshotFileManager.ts    # ← File management
│   ├── ViewportDetector.ts         # ← Viewport detection
│   └── types.ts                    # ← Type definitions
src/types/
└── domTool.ts                      # ← Extend SerializedNode with inViewport
src/models/
└── OpenAIResponsesClient.ts        # ← Add image upload support
src/prompts/
└── agent_prompt.md                 # ← Add tool usage guidance

tests/tools/
├── PageScreenShotTool.test.ts
└── screenshot/
    ├── ScreenshotService.test.ts
    ├── CoordinateActionService.test.ts
    ├── ScreenshotFileManager.test.ts
    └── ViewportDetector.test.ts
```

---

## Implementation Sequence

### Phase 0: DOMTool Scroll Action (45 min)

**Goal**: Add explicit scroll action to DOMTool for viewport management

#### Step 1: Update DOMTool Types (15 min)

Edit `src/tools/DOMTool.ts`:

```typescript
export interface DOMToolRequest {
  action: 'snapshot' | 'click' | 'type' | 'keypress' | 'scroll';  // Add 'scroll'
  tab_id?: number;
  node_id?: number;
  text?: string;
  key?: string;
  options?: any;
}
```

#### Step 2: Implement Scroll Action (20 min)

Add to `DOMTool` class:

```typescript
// In DOMTool.executeImpl()
switch (typedRequest.action) {
  case 'snapshot':
    return await this.executeSnapshot(tabId, typedRequest.options);
  case 'click':
    return await this.executeClick(tabId, typedRequest.node_id!, typedRequest.options);
  case 'type':
    return await this.executeType(tabId, typedRequest.node_id!, typedRequest.text!, typedRequest.options);
  case 'keypress':
    return await this.executeKeypress(tabId, typedRequest.key!, typedRequest.options);
  case 'scroll':  // NEW
    return await this.executeScroll(tabId, typedRequest.node_id!, typedRequest.options);
  default:
    throw new Error(`Unknown action: ${typedRequest.action}`);
}

// New method
private async executeScroll(
  tabId: number,
  nodeId: number,
  options?: { block?: string; inline?: string }
): Promise<ActionResult> {
  this.log('debug', 'Executing scroll', { tabId, nodeId, options });

  const domService = await DomService.forTab(tabId);

  // Scroll element into view (uses existing DomService method)
  // Note: DomService already has scrollIntoView logic at line 660
  await domService.scrollIntoView(nodeId);

  return {
    success: true,
    duration: 0, // Filled by wrapper
    changes: {
      navigationOccurred: false,
      newUrl: undefined,
      domMutations: 0,
      scrollChanged: true,
      valueChanged: false,
    },
    nodeId: nodeId,
    actionType: 'scroll',
    timestamp: new Date().toISOString(),
  };
}
```

#### Step 3: Update Tool Definition (10 min)

Update the tool definition in `DOMTool` constructor:

```typescript
protected toolDefinition: ToolDefinition = createToolDefinition(
  'browser_dom',
  'Unified DOM inspection and action tool. NEW: scroll action brings elements into viewport before screenshot capture.',
  {
    action: {
      type: 'string',
      description: 'Action type: snapshot, click, type, keypress, scroll (NEW: scroll element into viewport)',
      enum: ['snapshot', 'click', 'type', 'keypress', 'scroll'],  // Add 'scroll'
    },
    // ... existing fields ...
  },
  // ... rest of definition
);
```

#### Step 4: Test DOMTool Scroll (Optional)

Create test in `tests/tools/DOMTool.test.ts`:

```typescript
it('should scroll element into viewport', async () => {
  const domTool = new DOMTool();

  const result = await domTool.execute({
    action: 'scroll',
    tab_id: 123,
    node_id: 1537
  });

  expect(result.success).toBe(true);
  expect(result.data.actionType).toBe('scroll');
  expect(result.data.changes.scrollChanged).toBe(true);
});
```

---

### Phase 1: Core Screenshot Capability (2-3 hours)

#### Step 1: Define Types (15 min)

Create `src/tools/screenshot/types.ts`:

```typescript
// Screenshot tool request/response types
export interface ScreenshotToolRequest {
  action: 'screenshot' | 'click' | 'type' | 'scroll' | 'keypress';
  tab_id?: number;
  coordinates?: { x: number; y: number };
  text?: string;
  key?: string;
  scroll_offset?: { x: number; y: number };
  options?: ActionOptions;
}

export interface ScreenshotToolResponse {
  success: boolean;
  action: string;
  data?: ScreenshotResponseData | ActionResponseData;
  error?: ErrorDetails;
  metadata: ResponseMetadata;
}

// ... (see data-model.md for complete type definitions)
```

#### Step 2: Implement ScreenshotService (45 min)

Create `src/tools/screenshot/ScreenshotService.ts`:

```typescript
export class ScreenshotService {
  private constructor(private tabId: number) {}

  static async forTab(tabId: number): Promise<ScreenshotService> {
    // Attach debugger if not already attached
    const isAttached = await this.checkDebuggerAttached(tabId);
    if (!isAttached) {
      await chrome.debugger.attach({ tabId }, '1.3');
    }
    return new ScreenshotService(tabId);
  }

  async captureViewport(): Promise<string> {
    const result = await chrome.debugger.sendCommand(
      { tabId: this.tabId },
      'Page.captureScreenshot',
      { format: 'png' }
    );
    return result.data; // base64 PNG
  }

  async captureWithScroll(scrollOffset: { x: number; y: number }): Promise<string> {
    // Scroll page first
    if (scrollOffset.x !== 0 || scrollOffset.y !== 0) {
      await this.scrollPage(scrollOffset);
      await new Promise(resolve => setTimeout(resolve, 100)); // Wait for scroll
    }

    // Capture screenshot
    return await this.captureViewport();
  }

  private async scrollPage(offset: { x: number; y: number }): Promise<void> {
    await chrome.debugger.sendCommand(
      { tabId: this.tabId },
      'Input.dispatchMouseEvent',
      {
        type: 'mouseWheel',
        x: 0,
        y: 0,
        deltaX: offset.x,
        deltaY: offset.y
      }
    );
  }

  private static async checkDebuggerAttached(tabId: number): Promise<boolean> {
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: '1+1'
      });
      return true;
    } catch {
      return false;
    }
  }
}
```

#### Step 3: Implement ScreenshotFileManager (30 min)

Create `src/tools/screenshot/ScreenshotFileManager.ts`:

```typescript
const SCREENSHOT_CACHE_KEY = 'screenshot_cache';

export class ScreenshotFileManager {
  async saveScreenshot(base64Data: string): Promise<string> {
    // Validate size (10MB chrome.storage.local limit)
    const sizeInMB = (base64Data.length * 0.75) / (1024 * 1024); // Base64 to bytes
    if (sizeInMB > 10) {
      throw new Error(`Screenshot too large: ${sizeInMB.toFixed(2)}MB exceeds 10MB limit`);
    }

    // Store new screenshot (automatically replaces old one)
    await chrome.storage.local.set({
      [SCREENSHOT_CACHE_KEY]: base64Data
    });

    return SCREENSHOT_CACHE_KEY; // Return storage key as file ID
  }

  async getScreenshot(): Promise<string | null> {
    const result = await chrome.storage.local.get(SCREENSHOT_CACHE_KEY);
    return result[SCREENSHOT_CACHE_KEY] || null;
  }

  async deleteScreenshot(): Promise<void> {
    await chrome.storage.local.remove(SCREENSHOT_CACHE_KEY);
  }

  async cleanupAll(): Promise<void> {
    // Same as delete for single-key strategy
    await chrome.storage.local.remove(SCREENSHOT_CACHE_KEY);
  }
}
```

#### Step 4: Implement PageScreenShotTool Interface (45 min)

Create `src/tools/PageScreenShotTool.ts`:

```typescript
import { BaseTool, createToolDefinition, type BaseToolRequest, type BaseToolOptions, type ToolDefinition } from './BaseTool';
import { ScreenshotService } from './screenshot/ScreenshotService';
import { ScreenshotFileManager } from './screenshot/ScreenshotFileManager';
import type { ScreenshotToolRequest, ScreenshotToolResponse } from './screenshot/types';

export class PageScreenShotTool extends BaseTool {
  protected toolDefinition: ToolDefinition = createToolDefinition(
    'browser_screenshot',
    'Visual screenshot capture and coordinate-based interaction tool. Captures viewport screenshots as PNG images and performs coordinate-based actions (click, type, scroll, keypress). Use as complement to DOMTool when visual analysis is needed.',
    {
      action: {
        type: 'string',
        description: 'Action type: screenshot (capture viewport), click (click coordinates), type (input text at coordinates), scroll (scroll to coordinates), keypress (press key)',
        enum: ['screenshot', 'click', 'type', 'scroll', 'keypress'],
      },
      tab_id: {
        type: 'number',
        description: 'Target tab ID (optional, defaults to active tab)',
      },
      coordinates: {
        type: 'object',
        description: 'Screen coordinates {x: number, y: number} in CSS pixels (viewport-relative). Required for click, type, scroll actions.',
        properties: {
          x: { type: 'number', description: 'X coordinate (0 = left edge)' },
          y: { type: 'number', description: 'Y coordinate (0 = top edge)' },
        },
      },
      text: {
        type: 'string',
        description: 'Text to type (required for type action)',
      },
      key: {
        type: 'string',
        description: 'Keyboard key to press (required for keypress action). Examples: Enter, Escape, Tab',
      },
      scroll_offset: {
        type: 'object',
        description: 'Scroll offset before screenshot {x: number, y: number}. Positive y = down, negative = up.',
        properties: {
          x: { type: 'number', description: 'Horizontal scroll' },
          y: { type: 'number', description: 'Vertical scroll' },
        },
      },
      options: {
        type: 'object',
        description: 'Action options: { button?: "left"|"right"|"middle", modifiers?: { ctrl?: boolean, shift?: boolean, alt?: boolean, meta?: boolean } }',
      },
    },
    {
      required: ['action'],
      category: 'screenshot',
      version: '1.0.0',
    }
  );

  constructor() {
    super();
  }

  protected async executeImpl(
    request: BaseToolRequest,
    options?: BaseToolOptions
  ): Promise<ScreenshotToolResponse> {
    this.validateChromeContext();
    await this.validatePermissions(['debugger', 'tabs', 'storage']);

    const req = request as ScreenshotToolRequest;

    // Get target tab
    const tab = req.tab_id
      ? await this.validateTabId(req.tab_id)
      : await this.getActiveTab();
    const tabId = tab.id!;

    // Route by action
    switch (req.action) {
      case 'screenshot':
        return await this.executeScreenshot(tabId, req.scroll_offset);
      case 'click':
        return await this.executeClick(tabId, req.coordinates!);
      case 'type':
        return await this.executeType(tabId, req.coordinates!, req.text!);
      case 'scroll':
        return await this.executeScroll(tabId, req.coordinates!);
      case 'keypress':
        return await this.executeKeypress(tabId, req.key!);
      default:
        throw new Error(`Unknown action: ${req.action}`);
    }
  }

  private async executeScreenshot(
    tabId: number,
    scrollOffset?: { x: number; y: number }
  ): Promise<ScreenshotToolResponse> {
    const service = await ScreenshotService.forTab(tabId);
    const fileManager = new ScreenshotFileManager();

    // Capture screenshot
    const base64Data = scrollOffset
      ? await service.captureWithScroll(scrollOffset)
      : await service.captureViewport();

    // Save to temporary storage
    const fileId = await fileManager.saveScreenshot(base64Data);

    // Get viewport bounds
    const viewportBounds = await this.getViewportBounds(tabId);

    // Prepare response data
    // Note: Image upload to LLM happens in OpenAIResponsesClient
    return {
      success: true,
      action: 'screenshot',
      data: {
        image_file_id: fileId,
        width: viewportBounds.width,
        height: viewportBounds.height,
        format: 'png',
        viewport_bounds: viewportBounds,
      },
      metadata: {
        duration_ms: 0, // Filled by BaseTool
        tab_id: tabId,
        timestamp: new Date().toISOString(),
        tool_version: '1.0.0',
      },
    };
  }

  private async getViewportBounds(tabId: number) {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: '({ width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY })',
        returnByValue: true,
      }
    );
    return result.result.value;
  }

  // ... (implement other action methods - see research.md for examples)
}
```

#### Step 5: Write Tests (45 min)

Create `tests/tools/screenshot/ScreenshotService.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenshotService } from '../../../src/tools/screenshot/ScreenshotService';

// Mock chrome.debugger API
global.chrome = {
  debugger: {
    attach: vi.fn(),
    sendCommand: vi.fn(),
  },
} as any;

describe('ScreenshotService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should capture viewport screenshot', async () => {
    const mockBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    (chrome.debugger.sendCommand as any).mockResolvedValue({
      data: mockBase64,
    });

    const service = await ScreenshotService.forTab(123);
    const screenshot = await service.captureViewport();

    expect(screenshot).toBe(mockBase64);
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 123 },
      'Page.captureScreenshot',
      { format: 'png' }
    );
  });

  // ... more tests
});
```

---

### Phase 2: Coordinate-Based Actions (2 hours)

#### Step 1: Implement CoordinateActionService (60 min)

Follow the patterns from `src/tools/dom/DomService.ts:684-786` (existing click/type logic).

#### Step 2: Integrate with PageScreenShotTool (30 min)

Add coordinate action execution methods to PageScreenShotTool.

#### Step 3: Write Tests (30 min)

---

### Phase 3: Viewport Detection (1.5 hours)

#### Step 1: Implement ViewportDetector (45 min)

Create `src/tools/screenshot/ViewportDetector.ts` using algorithm from research.md.

#### Step 2: Extend SerializedNode Type (15 min)

Edit `src/types/domTool.ts`:

```typescript
export interface SerializedNode {
  node_id: number;
  tag: string;
  // ... existing fields
  inViewport?: boolean;  // NEW: >50% visible in viewport
}
```

#### Step 3: Integrate with DomService (30 min)

Modify `src/tools/dom/DomService.ts` serialization to call ViewportDetector.

---

### Phase 4: OpenAI Vision Integration (1.5 hours)

#### Step 1: Extend Message Format (30 min)

Edit `src/models/OpenAIResponsesClient.ts` to support image content blocks.

#### Step 2: Image Upload Logic (45 min)

Add image data URL construction and upload to vision API.

#### Step 3: Cleanup Integration (15 min)

Trigger ScreenshotFileManager cleanup after API response.

---

### Phase 5: System Prompt Update (30 min)

Edit `src/prompts/agent_prompt.md` to add tool usage guidance (see research.md for draft).

---

## Testing Workflow

### Unit Tests

```bash
npm run test -- tests/tools/screenshot
```

### Integration Tests

```bash
npm run test -- tests/integration/screenshot-workflow.test.ts
```

### Manual Testing

1. Load extension in Chrome
2. Open DevTools → Network tab
3. Navigate to test page
4. Trigger PageScreenShotTool via agent command
5. Verify screenshot captured, stored, uploaded, cleaned up

---

## Common Pitfalls & Solutions

### Issue: "Debugger already attached"

**Solution**: Check if debugger is attached before calling `chrome.debugger.attach()`.

```typescript
const isAttached = await checkDebuggerAttached(tabId);
if (!isAttached) {
  await chrome.debugger.attach({ tabId }, '1.3');
}
```

### Issue: Coordinates out of bounds

**Solution**: Validate coordinates against viewport dimensions before dispatching.

```typescript
if (x >= viewportWidth || y >= viewportHeight) {
  throw new Error('INVALID_COORDINATES: Coordinates exceed viewport bounds');
}
```

### Issue: Orphaned screenshot files

**Solution**: Always cleanup before new capture AND after request completion.

```typescript
await fileManager.cleanupAll(); // Before capture
// ... capture and upload ...
await fileManager.deleteScreenshot(); // After upload
```

### Issue: Base64 data exceeds storage limit

**Solution**: Implement fallback to IndexedDB for large screenshots.

```typescript
if (base64Data.length > 10 * 1024 * 1024) { // 10MB limit
  // Use IndexedDB instead of chrome.storage.local
  await indexedDBStore.put('screenshots', base64Data);
}
```

---

## Performance Optimization Tips

1. **Use low-quality JPEGs for initial analysis**:
   ```typescript
   format: 'jpeg', quality: 60
   ```

2. **Batch viewport detection calculations**:
   ```typescript
   // Get all bounding boxes in one DOMSnapshot call
   const snapshot = await chrome.debugger.sendCommand(
     { tabId },
     'DOMSnapshot.captureSnapshot',
     { includeDOMRects: true }
   );
   ```

3. **Debounce screenshot requests**:
   ```typescript
   // Prevent rapid-fire screenshot requests
   const lastScreenshotTime = Date.now();
   if (Date.now() - lastScreenshotTime < 500) {
     throw new Error('Rate limited: wait 500ms between screenshots');
   }
   ```

---

## Next Steps

After completing this quickstart:

1. Review [research.md](./research.md) for detailed CDP patterns
2. Study [data-model.md](./data-model.md) for complete type definitions
3. Read [contracts/PageScreenShotTool.openapi.yaml](./contracts/PageScreenShotTool.openapi.yaml) for API contract
4. Proceed to [tasks.md](./tasks.md) for implementation task breakdown (generated by `/speckit.tasks`)

---

## Support & Resources

- **CDP Documentation**: https://chromedevtools.github.io/devtools-protocol/
- **Existing DomService**: `src/tools/dom/DomService.ts` (reference implementation)
- **OpenAI Vision API**: https://platform.openai.com/docs/guides/vision
- **Chrome Extension Debugger**: https://developer.chrome.com/docs/extensions/reference/debugger/

---

## Estimated Timeline

| Phase | Time | Cumulative |
|-------|------|------------|
| DOMTool Scroll Action | 0.5-1 hour | 0.5-1 hour |
| Core Screenshot | 2-3 hours | 2.5-4 hours |
| Coordinate Actions | 2 hours | 4.5-6 hours |
| Viewport Detection | 1.5 hours | 6-7.5 hours |
| OpenAI Integration | 1.5 hours | 7.5-9 hours |
| System Prompt Update | 0.5 hours | 8-9.5 hours |
| Testing & Debugging | 2-3 hours | 10-12.5 hours |

**Total**: 10-12.5 hours for complete implementation
