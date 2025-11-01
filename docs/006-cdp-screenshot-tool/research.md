# Research Document: CDP Screenshot Tool

**Feature**: 006-cdp-screenshot-tool
**Date**: 2025-10-31
**Status**: Completed

## Overview

This document consolidates technical research and design decisions for implementing the PageScreenShotTool feature in browserx Chrome extension. All decisions are based on Chrome DevTools Protocol (CDP) capabilities, existing codebase patterns, and OpenAI API vision capabilities.

---

## Research Areas

### 0. DOMTool Enhancement - Explicit Scroll Action

**Decision**: Add explicit `scroll` action to DOMTool to bring elements into viewport

**Rationale**:
- Makes LLM workflow explicit: "scroll element into view, then screenshot"
- Currently DOMTool auto-scrolls as side effect of click/type actions (DOM.scrollIntoViewIfNeeded)
- Explicit scroll action allows LLM to prepare viewport before screenshot without performing other actions
- Provides better control over scroll behavior (alignment options)

**DOMTool Scroll Action Interface**:
```typescript
// New action added to DOMTool
{
  action: 'scroll',
  node_id: 1537,  // Element to scroll into view
  options?: {
    block?: 'start' | 'center' | 'end' | 'nearest',  // Vertical alignment
    inline?: 'start' | 'center' | 'end' | 'nearest'  // Horizontal alignment
  }
}
```

**CDP Implementation** (already exists in DomService.ts:660):
```typescript
await chrome.debugger.sendCommand(
  { tabId: tabId },
  'DOM.scrollIntoViewIfNeeded',
  {
    backendNodeId: nodeId
    // Note: CDP doesn't support alignment options directly
    // For alignment, would need to use Runtime.evaluate with element.scrollIntoView()
  }
);
```

**Workflow Integration**:
```typescript
// LLM discovers element out of viewport
const domSnapshot = await DOMTool.snapshot();
const submitButton = domSnapshot.page.body.kids.find(
  n => n.text === "Submit" && n.inViewport === false
);

// Step 1: Explicitly scroll element into view
await DOMTool.execute({
  action: 'scroll',
  node_id: submitButton.node_id,
  options: { block: 'center' }  // Center element in viewport
});

// Step 2: Capture screenshot with element now visible
const screenshot = await PageScreenShotTool.execute({
  action: 'screenshot'
});

// Step 3: Use visual analysis or coordinate-based actions
await PageScreenShotTool.execute({
  action: 'click',
  coordinates: { x: 350, y: 450 }  // From visual analysis
});
```

**Alternatives Considered**:
- **Keep auto-scroll only**: Rejected because LLM cannot scroll without performing action (click/type)
- **Use PageScreenShotTool scroll_offset**: Rejected because requires LLM to calculate pixel offsets (imprecise)
- **Runtime.evaluate with JavaScript**: Rejected to maintain CDP-only approach (bypasses CSP)

**Impact on Existing DOMTool**:
- Add 'scroll' to action enum
- Add scroll-specific validation (node_id required)
- Reuse existing DOM.scrollIntoViewIfNeeded implementation
- No breaking changes to existing actions (they continue auto-scrolling)

---

### 1. Screenshot Capture via CDP

**Decision**: Use `Page.captureScreenshot` CDP command with PNG format and viewport-only capture

**Rationale**:
- `Page.captureScreenshot` is the standard CDP screenshot method used across Chrome ecosystem
- Supports PNG format (lossless) suitable for LLM vision analysis
- Returns base64-encoded image data (easily transferred to OpenAI API)
- Supports clip regions for capturing specific viewport areas
- Can capture full page with `captureBeyondViewport: true` (future enhancement)

**Implementation Details**:
```typescript
// Viewport screenshot (default)
const result = await chrome.debugger.sendCommand(
  { tabId: tabId },
  'Page.captureScreenshot',
  {
    format: 'png',
    fromSurface: true  // Capture from rendering surface
  }
);
// Returns: { data: string } // base64-encoded PNG
```

**Alternatives Considered**:
- **Chrome Extension screenshot API** (`chrome.tabs.captureVisibleTab`): Rejected because it cannot capture content outside visible tab, less flexible than CDP
- **JPEG format**: Rejected for default format due to compression artifacts affecting vision analysis, but can be option for performance optimization
- **Full page screenshot by default**: Rejected to maintain focus on viewport-only (spec requirement), can be added as optional parameter

---

### 2. Coordinate-Based Interactions

**Decision**: Use `Input.dispatchMouseEvent` and `Input.dispatchKeyEvent` CDP commands for all coordinate-based actions

**Rationale**:
- Existing codebase (DomService.ts) already implements these patterns successfully
- Bypasses Content Security Policy restrictions (unlike content scripts)
- Provides precise coordinate control in CSS pixels
- Works on any page regardless of JavaScript frameworks or shadow DOM

**Click Implementation**:
```typescript
// Click at coordinates (x, y in CSS pixels, viewport-relative)
await chrome.debugger.sendCommand(
  { tabId: tabId },
  'Input.dispatchMouseEvent',
  {
    type: 'mousePressed',
    x: coordinateX,
    y: coordinateY,
    button: 'left',
    clickCount: 1
  }
);

await chrome.debugger.sendCommand(
  { tabId: tabId },
  'Input.dispatchMouseEvent',
  {
    type: 'mouseReleased',
    x: coordinateX,
    y: coordinateY,
    button: 'left'
  }
);
```

**Type Implementation Strategy**:
```typescript
// 1. Dispatch click to focus element at coordinates
await dispatchMouseClick(x, y);

// 2. Wait for focus event
await new Promise(resolve => setTimeout(resolve, 50));

// 3. Use Input.insertText for efficiency (existing pattern from DomService.ts:764)
await chrome.debugger.sendCommand(
  { tabId: tabId },
  'Input.insertText',
  { text: inputText }
);
```

**Scroll Implementation**:
```typescript
// Scroll using mouse wheel event at coordinates
await chrome.debugger.sendCommand(
  { tabId: tabId },
  'Input.dispatchMouseEvent',
  {
    type: 'mouseWheel',
    x: coordinateX,
    y: coordinateY,
    deltaX: 0,
    deltaY: scrollDelta  // Positive = down, Negative = up
  }
);
```

**Keypress Implementation**:
```typescript
// Dispatch keyboard event (e.g., Enter)
await chrome.debugger.sendCommand(
  { tabId: tabId },
  'Input.dispatchKeyEvent',
  {
    type: 'keyDown',
    key: 'Enter',
    code: 'Enter',
    modifiers: 0  // Bitfield: Alt=1, Ctrl=2, Meta=4, Shift=8
  }
);
```

**Alternatives Considered**:
- **DOM.focus + element-based typing**: Rejected because coordinate-based approach is more flexible and doesn't require DOM node lookup
- **Runtime.evaluate with JavaScript injection**: Rejected due to CSP restrictions and less reliable event simulation
- **Content script message passing**: Rejected due to CSP and cross-origin limitations

---

### 3. Viewport Visibility Detection

**Decision**: Calculate intersection percentage between element bounding box and viewport dimensions, mark `inViewport: true` if >50% visible

**Rationale**:
- Aligns with web standard Intersection Observer API behavior
- 50% threshold balances precision vs. practical utility (element is "substantially visible")
- Efficient calculation using existing CDP commands (DOM.getBoxModel + Runtime.evaluate)
- Existing codebase (DomService.ts:649-674) already has viewport detection logic we can extend

**Algorithm**:
```typescript
// 1. Get viewport dimensions and scroll position
const viewportResult = await chrome.debugger.sendCommand(
  { tabId: tabId },
  'Runtime.evaluate',
  {
    expression: '({ width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY })',
    returnByValue: true
  }
);
const viewport = viewportResult.result.value;

// 2. Get element bounding box (document coordinates)
const boxModel = await chrome.debugger.sendCommand(
  { tabId: tabId },
  'DOM.getBoxModel',
  { backendNodeId }
);

const { content } = boxModel.model;
const elemX = content[0];
const elemY = content[1];
const elemWidth = Math.abs(content[2] - content[0]);
const elemHeight = Math.abs(content[5] - content[1]);

// 3. Convert to viewport coordinates
const elemLeft = elemX - viewport.scrollX;
const elemTop = elemY - viewport.scrollY;
const elemRight = elemLeft + elemWidth;
const elemBottom = elemTop + elemHeight;

// 4. Calculate intersection with viewport bounds
const intersectLeft = Math.max(elemLeft, 0);
const intersectTop = Math.max(elemTop, 0);
const intersectRight = Math.min(elemRight, viewport.width);
const intersectBottom = Math.min(elemBottom, viewport.height);

// 5. Compute visibility percentage
const hasIntersection = intersectRight > intersectLeft && intersectBottom > intersectTop;
if (!hasIntersection) {
  return { inViewport: false, visibilityPercent: 0 };
}

const intersectArea = (intersectRight - intersectLeft) * (intersectBottom - intersectTop);
const elementArea = elemWidth * elemHeight;
const visibilityPercent = (intersectArea / elementArea) * 100;

return {
  inViewport: visibilityPercent > 50,  // >50% threshold
  visibilityPercent: visibilityPercent
};
```

**Integration Point**: Extend `DomService.getSerializedDom()` serialization pipeline to compute `inViewport` for each SerializedNode during traversal.

**Alternatives Considered**:
- **DOMSnapshot.captureSnapshot with includeDOMRects**: Rejected for incremental implementation; this gets all rects at once but requires refactoring entire serialization pipeline
- **Simple center-point check**: Rejected as insufficiently accurate (element could be 90% off-screen but center visible)
- **>0% threshold**: Rejected as too permissive (1px visible shouldn't count as "in viewport")
- **>80% threshold**: Rejected as too strict (partially visible elements are still useful context)

---

### 4. Screenshot File Management

**Decision**: Use `chrome.storage.local` ONLY with key `"screenshot_cache"` for screenshot storage

**Rationale**:
- Chrome extensions have direct access to chrome.storage.local API
- No filesystem permissions needed (extension sandbox)
- Simple key-value storage with automatic serialization
- 10MB per-value limit is sufficient (viewport screenshots typically 500KB-2MB)
- Single key strategy with replace-on-update ensures zero orphaned files
- Automatic cleanup: new screenshot overwrites old one

**Storage Pattern**:
```typescript
// Storage key (consistent throughout application)
const SCREENSHOT_CACHE_KEY = 'screenshot_cache';

// 1. Save new screenshot (automatically replaces old one)
await chrome.storage.local.set({
  [SCREENSHOT_CACHE_KEY]: base64Data  // New screenshot replaces old
});

// 2. Retrieve screenshot
const result = await chrome.storage.local.get(SCREENSHOT_CACHE_KEY);
const screenshotData = result[SCREENSHOT_CACHE_KEY];

// 3. Delete screenshot after use
await chrome.storage.local.remove(SCREENSHOT_CACHE_KEY);
```

**Cleanup Strategy**:
```typescript
// No explicit cleanup needed before new capture - chrome.storage.local.set()
// automatically replaces the value at the key.

// After successful LLM request or final failure:
async function deleteScreenshot() {
  await chrome.storage.local.remove(SCREENSHOT_CACHE_KEY);
}

// Optional: Verify cleanup
async function ensureCleanState() {
  const result = await chrome.storage.local.get(SCREENSHOT_CACHE_KEY);
  if (result[SCREENSHOT_CACHE_KEY]) {
    console.warn('Old screenshot found, cleaning up');
    await chrome.storage.local.remove(SCREENSHOT_CACHE_KEY);
  }
}
```

**Key Benefits**:
- **Atomic updates**: Setting new value at key automatically replaces old value
- **Zero orphans**: Only one screenshot exists at key "screenshot_cache" at any time
- **No directory management**: No need to create/manage tmp/ folders
- **Simple API**: Async get/set/remove operations

**Alternatives Considered**:
- **Filesystem tmp/screenshot/ directory**: Rejected - no native filesystem access in Chrome extensions, requires complex workarounds
- **IndexedDB**: Rejected - unnecessary complexity for single-item cache
- **Multiple keys with timestamps**: Rejected - increases risk of orphaned files
- **Data URLs in memory only**: Rejected - OpenAI API requires persistent reference

**Size Limits**:
- chrome.storage.local: 10MB per item, unlimited items
- Typical viewport screenshot: 500KB-2MB (PNG, base64)
- Fallback: If screenshot exceeds 10MB (rare), throw clear error and suggest reducing viewport size

---

### 5. OpenAI Vision API Integration

**Decision**: Extend `OpenAIResponsesClient.ts` to support image content blocks in message format

**Rationale**:
- OpenAI's `/v1/responses` API (used by browserx) supports vision via image content blocks
- Images must be provided as base64-encoded data URLs or public URLs
- Message format: `{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,...' } }] }`

**Implementation Pattern**:
```typescript
// Extend Prompt type to support image content
interface ImageContent {
  type: 'image_url';
  image_url: {
    url: string;  // data:image/png;base64,... or https://...
    detail?: 'auto' | 'low' | 'high';  // Resolution preference
  };
}

interface TextContent {
  type: 'text';
  text: string;
}

type ContentBlock = TextContent | ImageContent;

interface MessageInput {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];  // String or array of content blocks
}
```

**Message Construction**:
```typescript
// Screenshot message with context
const messages = [
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'I have taken a screenshot of the current page. Please analyze it and identify the location of the "Submit" button.'
      },
      {
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${screenshotBase64}`,
          detail: 'high'  // High resolution for better coordinate precision
        }
      }
    ]
  }
];
```

**OpenAI API Request**:
```typescript
// In OpenAIResponsesClient.stream() method
const payload = {
  model: this.currentModel,  // Must be vision-capable (gpt-4-vision, gpt-4o, etc.)
  instructions: fullInstructions,
  input: formatInputWithImages(prompt.input),  // NEW: Support image blocks
  tools: toolsJson,
  // ... other params
};
```

**Cleanup Integration**:
```typescript
// After stream completes (in processSSEToStream)
stream.addEvent({ type: 'Completed', responseId, tokenUsage });

// Trigger cleanup
await screenshotFileManager.deleteCurrentScreenshot();
```

**Alternatives Considered**:
- **Public URL hosting**: Rejected due to complexity and privacy concerns (would need temp server)
- **Separate vision API call**: Rejected to maintain single request flow
- **Always include screenshots**: Rejected due to token cost (only when PageScreenShotTool invoked)

---

### 6. Tool Architecture & Separation of Concerns

**Decision**: Implement PageScreenShotTool as thin interface layer, delegate to specialized services in `src/tools/screenshot/`

**Rationale**:
- Follows existing DOMTool pattern (`DOMTool.ts` → `dom/DomService.ts`)
- Single Responsibility Principle: tool handles LLM interface, services handle implementation
- Easier to test services independently
- Facilitates future enhancements (e.g., screenshot caching, batch operations)

**Architecture Layers**:
```
PageScreenShotTool (extends BaseTool)
├── validates request parameters
├── wraps responses in ToolResult format
└── delegates to implementation services:
    ├── ScreenshotService
    │   ├── captureViewport()
    │   ├── captureWithScroll()
    │   └── captureRegion()
    ├── CoordinateActionService
    │   ├── clickAt(x, y)
    │   ├── typeAt(x, y, text)
    │   ├── scrollTo(x, y)
    │   └── keypressAt(key)
    ├── ScreenshotFileManager
    │   ├── saveScreenshot(base64)
    │   ├── getScreenshot()
    │   ├── deleteScreenshot()
    │   └── cleanupAll()
    └── ViewportDetector
        ├── isInViewport(backendNodeId)
        ├── getVisibilityPercent(backendNodeId)
        └── getViewportBounds()
```

**Service Instantiation Pattern** (following DomService pattern):
```typescript
export class ScreenshotService {
  private constructor(private tabId: number) {}

  static async forTab(tabId: number): Promise<ScreenshotService> {
    // Attach debugger if needed
    const isAttached = await checkDebuggerAttached(tabId);
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
    return result.data;
  }
}
```

**Alternatives Considered**:
- **Monolithic PageScreenShotTool**: Rejected due to code complexity and poor testability
- **Shared service instance**: Rejected to avoid state management issues (each tab needs isolated service)
- **Static utility functions**: Rejected because services need tab context and debugger attachment lifecycle

---

### 7. System Prompt Integration

**Decision**: Add PageScreenShotTool guidance to `agent_prompt.md` emphasizing complementary usage pattern

**Rationale**:
- Agents need explicit guidance to avoid overusing expensive vision API calls
- DOM analysis should be primary method (faster, cheaper, more structured)
- Screenshots serve as fallback for visual-only content (canvas, complex layouts)
- `inViewport` field provides decision signal

**Prompt Addition** (draft):
```markdown
## Screenshot Tool Usage

You have access to PageScreenShotTool for visual page analysis. Use this tool **only** as a complement to DOMTool when:

1. **Visual analysis required**: Canvas elements, SVG graphics, image-heavy content where DOM doesn't convey visual layout
2. **Complex visual layouts**: When DOM structure doesn't clearly indicate spatial relationships (e.g., CSS Grid, Flexbox, absolute positioning)
3. **Visual verification needed**: When you need to see the actual rendered appearance of elements

**Usage Pattern**:
1. Always use DOMTool first to analyze page structure
2. Check `inViewport` field in SerializedNode to see what's visible
3. If target elements have `inViewport: false`, use **DOMTool scroll action** to bring them into view
4. Then use PageScreenShotTool screenshot to capture visual context
5. Use coordinate-based actions (click, type) only when DOM-based actions fail

**Handling Out-of-Viewport Elements**:

When you find an element with `inViewport: false`:

**Step 1: Scroll element into view using DOMTool**
```json
{
  "action": "scroll",
  "node_id": 1537
}
```

**Step 2: Capture screenshot (if visual analysis needed)**
```json
{
  "action": "screenshot"
}
```

**Step 3: Perform action**
- Preferred: Use DOMTool actions (click, type) on the now-visible element
- Alternative: Use PageScreenShotTool coordinate-based actions if DOM actions fail

**Cost Awareness**: Screenshots consume significantly more tokens (~1000-2000 tokens per image). Use judiciously.

**Decision Flow Examples**:

**Example 1: Standard element in viewport**
- Task: Click "Submit" button
- Step 1: DOMTool.snapshot() → Find button with `inViewport: true`
- Step 2: DOMTool.click(node_id) → Done ✓

**Example 2: Element below the fold**
- Task: Click "Subscribe" button
- Step 1: DOMTool.snapshot() → Find button with `inViewport: false`
- Step 2: DOMTool.scroll(node_id) → Scroll button into view
- Step 3: DOMTool.click(node_id) → Done ✓

**Example 3: Element below fold + visual verification needed**
- Task: Click "Subscribe" button and verify appearance
- Step 1: DOMTool.snapshot() → Find button with `inViewport: false`
- Step 2: DOMTool.scroll(node_id) → Scroll button into view
- Step 3: PageScreenShotTool.screenshot() → Capture visual context
- Step 4: Analyze screenshot → Verify button appearance
- Step 5: DOMTool.click(node_id) OR PageScreenShotTool.click(coordinates) → Done ✓

**Example 4: Canvas-based UI**
- Task: Click drawing tool icon
- Step 1: DOMTool.snapshot() → Find canvas element
- Step 2: PageScreenShotTool.screenshot() → Capture canvas visual
- Step 3: Analyze screenshot → Identify icon coordinates
- Step 4: PageScreenShotTool.click(x, y) → Done ✓
```

**Alternatives Considered**:
- **No prompt guidance**: Rejected because agents would overuse screenshots (token cost issue)
- **Always require screenshot**: Rejected per spec (complementary tool, not primary)
- **Automatic screenshot on every DOM snapshot**: Rejected due to performance and cost

---

## Technology Stack Summary

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| Language | TypeScript | 5.9.2 | Existing codebase standard |
| Target | ES2020 | - | tsconfig.json setting |
| CDP Commands | Chrome DevTools Protocol | - | Screenshot + input capabilities |
| Image Format | PNG (base64) | - | Lossless quality for vision analysis |
| Storage | chrome.storage.local | - | Extension sandboxed storage, <10MB per value |
| Testing | Vitest | 3.2.4 | Existing test framework |
| Build | Vite | 5.4.20 | Existing build system |

---

## Integration Points

### 1. DOMTool Extension (inViewport field)

**File**: `src/types/domTool.ts`
```typescript
export interface SerializedNode {
  node_id: number;
  tag: string;
  role?: string;
  aria_label?: string;
  text?: string;
  value?: string;
  kids?: SerializedNode[];
  href?: string;
  input_type?: string;
  hint?: string;
  bbox?: number[];
  states?: Record<string, boolean | string>;
  inViewport?: boolean;  // NEW: Viewport visibility flag
}
```

**Implementation**: Modify `DomService.getSerializedDom()` to call `ViewportDetector.isInViewport(backendNodeId)` during node serialization.

### 2. OpenAIResponsesClient Extension (image upload)

**File**: `src/models/OpenAIResponsesClient.ts`

**Changes Needed**:
- Extend `Prompt` type to support image content blocks
- Modify `get_formatted_input()` helper to handle image URLs
- Ensure vision-capable model is selected (gpt-4-vision, gpt-4o)
- Add cleanup hook after stream completion

**Vision Capability Check**:
```typescript
const visionCapableModels = ['gpt-4-vision-preview', 'gpt-4o', 'gpt-4o-mini'];
if (hasImageContent && !visionCapableModels.includes(this.currentModel)) {
  throw new ModelClientError('Current model does not support vision capabilities');
}
```

### 3. Tool Registry Registration

**File**: `src/tools/ToolRegistry.ts`

**Registration**:
```typescript
import { PageScreenShotTool } from './PageScreenShotTool';

export class ToolRegistry {
  private tools: Map<string, BaseTool> = new Map();

  constructor() {
    // ... existing tools
    this.registerTool(new PageScreenShotTool());
  }
}
```

---

## Performance Considerations

### Screenshot Capture Time
- **Expected**: 100-300ms for viewport screenshot (based on CDP benchmarks)
- **Factors**: Page complexity, image resolution, encoding time
- **Optimization**: Use `optimizeForSpeed: true` if quality trade-off acceptable

### Token Costs
- **Viewport screenshot**: ~1000-2000 tokens (varies by image detail setting)
- **Recommendation**: Use `detail: 'low'` for initial analysis, `detail: 'high'` only when precision needed

### File Storage Limits
- **chrome.storage.local**: 10MB per item, unlimited items
- **Viewport PNG base64**: Typically 500KB-2MB (well under limit)
- **Fallback**: If >10MB, use IndexedDB (no per-item limit)

### Coordinate Action Latency
- **Expected**: <50ms per action (Input.dispatchMouseEvent is synchronous)
- **Bottleneck**: CDP command round-trip time over debugger protocol
- **Mitigation**: Batch independent actions where possible

---

## Risk Mitigation

### 1. CDP Connection Failure
**Risk**: Debugger not attached or tab closed
**Mitigation**: Validate connection before commands, return clear error to agent

### 2. Screenshot Capture Failure
**Risk**: Page crashes, too large, CDP timeout
**Mitigation**: Wrap in try-catch, return error, let agent fall back to DOM-only

### 3. Vision API Quota Limits
**Risk**: Excessive screenshot usage hits rate limits
**Mitigation**: System prompt guidance + `inViewport` signal to reduce usage

### 4. Coordinate Accuracy on Responsive Pages
**Risk**: Layout changes between screenshot and action
**Mitigation**: Document as known limitation, suggest fresh screenshot if action fails

### 5. File Cleanup Failure
**Risk**: Orphaned screenshots accumulate
**Mitigation**: Cleanup before new capture + after request completion (double-check pattern)

---

## Testing Strategy

### Unit Tests
- ScreenshotService: Mock CDP commands, verify parameters
- CoordinateActionService: Mock Input.dispatch* commands
- ScreenshotFileManager: Mock storage APIs
- ViewportDetector: Test intersection calculation math

### Integration Tests
- End-to-end workflow: Capture → Store → Upload → Cleanup
- Viewport detection accuracy on test pages
- Coordinate action precision on known elements

### Manual Testing
- Screenshot quality on various page types
- Coordinate click/type accuracy
- Performance profiling (capture time, token usage)

---

## Open Questions

None - all technical decisions finalized based on research.

---

## References

- Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- OpenAI Vision API: https://platform.openai.com/docs/guides/vision
- Chrome Extension APIs: https://developer.chrome.com/docs/extensions/reference/
- Existing DomService implementation: `src/tools/dom/DomService.ts`
- Existing BaseTool pattern: `src/tools/BaseTool.ts`

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2025-10-31 | Initial research completed | Feature planning phase |
