# Data Model: CDP Screenshot Tool

**Feature**: 006-cdp-screenshot-tool
**Date**: 2025-10-31
**Status**: Approved

## Overview

This document defines the data structures, types, and state models for the PageScreenShotTool feature. All types are defined from a user/agent perspective without implementation details.

---

## Core Entities

### 1. PageScreenShotTool Request

Represents a request from the LLM to perform a screenshot or coordinate-based action.

**Entity**: ScreenshotToolRequest

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| action | string | Yes | Action type to perform | Must be one of: 'screenshot', 'click', 'type', 'scroll', 'keypress' |
| tab_id | number | No | Target tab identifier | Must be valid Chrome tab ID (positive integer). Defaults to active tab if omitted |
| coordinates | Coordinates | Conditional | Screen position for actions | Required for: click, type, scroll. Format: {x: number, y: number} |
| text | string | Conditional | Text to input | Required for 'type' action only. Max length: 10,000 characters |
| key | string | Conditional | Keyboard key to press | Required for 'keypress' action. Must be valid DOM key string (e.g., 'Enter', 'Escape') |
| scroll_offset | ScrollOffset | No | Scroll parameters for screenshot | Optional for 'screenshot' action. Format: {x: number, y: number} |
| options | ActionOptions | No | Action-specific configuration | Optional. See ActionOptions schema |

**Relationships**:
- One request produces one ScreenshotToolResponse
- Request is validated against action-specific requirements

---

### 2. Coordinates

Represents a screen position in CSS pixels (viewport-relative).

**Entity**: Coordinates

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| x | number | Yes | Horizontal position | Non-negative integer. 0 = left edge of viewport |
| y | number | Yes | Vertical position | Non-negative integer. 0 = top edge of viewport |

**Constraints**:
- Coordinates are viewport-relative (not document-relative)
- Origin (0, 0) is top-left corner of visible viewport
- Maximum values bounded by viewport dimensions

---

### 3. ScrollOffset

Represents scroll parameters for positioning before screenshot capture.

**Entity**: ScrollOffset

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| x | number | No | Horizontal scroll amount | Integer. Positive = right, Negative = left. Default: 0 |
| y | number | No | Vertical scroll amount | Integer. Positive = down, Negative = up. Default: 0 |

**Behavior**:
- Scroll is performed before screenshot capture
- Scroll amount is relative to current position (not absolute)
- Scroll respects page boundaries (won't scroll beyond document edges)

---

### 4. ActionOptions

Configuration options for action execution.

**Entity**: ActionOptions

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| button | string | No | Mouse button for click action | One of: 'left', 'right', 'middle'. Default: 'left' |
| modifiers | KeyModifiers | No | Keyboard modifiers | See KeyModifiers schema. Default: no modifiers |
| wait_after_action | number | No | Delay after action (ms) | Non-negative integer. Default: 100ms |

---

### 5. KeyModifiers

Keyboard modifier keys state.

**Entity**: KeyModifiers

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| ctrl | boolean | No | Control key pressed | Default: false |
| shift | boolean | No | Shift key pressed | Default: false |
| alt | boolean | No | Alt key pressed | Default: false |
| meta | boolean | No | Meta/Command key pressed | Default: false |

---

### 6. ScreenshotToolResponse

Response returned to the LLM after action execution.

**Entity**: ScreenshotToolResponse

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| success | boolean | Yes | Whether action succeeded |
| action | string | Yes | Action that was executed |
| data | ResponseData | Conditional | Action-specific result data. Present if success=true |
| error | ErrorDetails | Conditional | Error information. Present if success=false |
| metadata | ResponseMetadata | Yes | Execution metadata |

**State Transitions**:
```
Initial → Executing → (Success | Failure) → Response Returned
```

---

### 7. ResponseData

Action-specific result data (discriminated union by action type).

**Entity**: ResponseData

**For action='screenshot'**:

| Field | Type | Description |
|-------|------|-------------|
| image_file_id | string | Identifier for uploaded image in LLM context |
| width | number | Screenshot width in pixels |
| height | number | Screenshot height in pixels |
| format | string | Image format ('png') |
| viewport_bounds | ViewportBounds | Captured viewport boundaries |

**For action='click' | 'type' | 'scroll' | 'keypress'**:

| Field | Type | Description |
|-------|------|-------------|
| coordinates_used | Coordinates | Actual coordinates where action was performed |
| action_timestamp | string | ISO 8601 timestamp of action execution |

---

### 8. ViewportBounds

Current viewport dimensions and scroll position.

**Entity**: ViewportBounds

| Field | Type | Description | Validation Rules |
|-------|------|-------------|------------------|
| width | number | Viewport width | Positive integer (pixels) |
| height | number | Viewport height | Positive integer (pixels) |
| scroll_x | number | Horizontal scroll position | Non-negative integer (document coordinates) |
| scroll_y | number | Vertical scroll position | Non-negative integer (document coordinates) |

**Usage**: Provides context about what portion of the page is visible in the screenshot.

---

### 9. ErrorDetails

Error information when action fails.

**Entity**: ErrorDetails

| Field | Type | Description |
|-------|------|-------------|
| code | string | Error code identifier (e.g., 'SCREENSHOT_FAILED', 'INVALID_COORDINATES') |
| message | string | Human-readable error description |
| details | object | Additional error context (optional, varies by error type) |

**Error Codes**:

| Code | Description | Recovery Action |
|------|-------------|----------------|
| SCREENSHOT_FAILED | Screenshot capture failed | Retry or use DOM-only approach |
| INVALID_COORDINATES | Coordinates out of viewport bounds | Verify coordinates are within current viewport |
| CDP_CONNECTION_LOST | Debugger connection failed | Reconnect or restart tool |
| TAB_NOT_FOUND | Target tab does not exist | Verify tab ID or use active tab |
| FILE_STORAGE_ERROR | Screenshot file save/delete failed | Check storage permissions |
| UPLOAD_FAILED | Image upload to LLM failed | Retry or check network connectivity |

---

### 10. ResponseMetadata

Execution metadata for observability and debugging.

**Entity**: ResponseMetadata

| Field | Type | Description |
|-------|------|-------------|
| duration_ms | number | Total action execution time in milliseconds |
| tab_id | number | Tab where action was executed |
| timestamp | string | ISO 8601 timestamp of response |
| tool_version | string | PageScreenShotTool version identifier |

---

## DOMTool Extension

### 11. DOMTool Scroll Action (New)

Enhancement to existing DOMTool to support explicit element scrolling.

**Entity**: DOMToolScrollRequest (extends existing DOMToolRequest)

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| action | string | Yes | Action type | Must be 'scroll' |
| tab_id | number | No | Target tab identifier | Must be valid Chrome tab ID. Defaults to active tab if omitted |
| node_id | number | Yes | Element to scroll into view | Must be valid backendNodeId from DOM snapshot |
| options | ScrollOptions | No | Scroll behavior options | See ScrollOptions schema |

**ScrollOptions**:

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| block | string | No | Vertical alignment | One of: 'start', 'center', 'end', 'nearest'. Default: 'start' |
| inline | string | No | Horizontal alignment | One of: 'start', 'center', 'end', 'nearest'. Default: 'nearest' |

**Response**: Standard DOMToolResponse with success/error

**Usage Example**:
```typescript
// Scroll element into view (centered vertically)
{
  action: 'scroll',
  node_id: 1537,
  options: {
    block: 'center',
    inline: 'nearest'
  }
}

// Response
{
  success: true,
  action: 'scroll',
  data: {
    node_id: 1537,
    scrolled: true,
    new_viewport_position: {
      scroll_x: 0,
      scroll_y: 1200
    }
  },
  metadata: {
    duration_ms: 150,
    tab_id: 123,
    timestamp: "2025-10-31T12:00:00Z"
  }
}
```

**Relationship to PageScreenShotTool**:
- LLM uses DOMTool.scroll to bring out-of-viewport elements into view
- Then uses PageScreenShotTool.screenshot to capture visual context
- Provides explicit workflow: scroll → screenshot → analyze → act

**CDP Implementation**: Uses existing `DOM.scrollIntoViewIfNeeded` command (already implemented in DomService.ts:660)

---

## Extended DOM Model

### 12. SerializedNode (Extension)

Extends existing DOM serialization with viewport visibility information.

**Entity**: SerializedNode (extended from src/types/domTool.ts)

**New Field Added**:

| Field | Type | Required | Description | Validation Rules |
|-------|------|----------|-------------|------------------|
| inViewport | boolean | No | Whether node is currently visible in viewport | Default: false. True if >50% of element area is within viewport bounds |

**Calculation Logic**:
```
Element is considered "in viewport" if:
1. Element has non-zero dimensions (width > 0 AND height > 0)
2. Element intersects with current viewport rectangle
3. Intersection area ≥ 50% of element's total area
```

**Relationship to Screenshot Tool**:
- LLM checks `inViewport: false` to decide if screenshot needed
- Viewport visibility indicates which elements are in current screenshot
- Complements bbox (bounding box) field with visibility context

---

## State Management

### Screenshot File Lifecycle

**States**:

1. **None**: No screenshot exists
2. **Capturing**: Screenshot being captured via CDP
3. **Stored**: Screenshot saved to temporary storage
4. **Uploading**: Screenshot being uploaded to LLM
5. **Uploaded**: Screenshot successfully uploaded, file pending deletion
6. **Deleted**: Screenshot file removed

**State Transitions**:

```
None --[screenshot action invoked]--> Capturing
Capturing --[CDP returns data]--> Stored
Stored --[LLM request sent]--> Uploading
Uploading --[API responds success]--> Uploaded
Uploaded --[cleanup triggered]--> Deleted --[ready for next]--> None

Error paths:
Capturing --[CDP fails]--> None (cleanup)
Uploading --[API fails after retries]--> Deleted (cleanup)
```

**Invariants**:
- At most ONE screenshot file exists at any time
- Before creating new screenshot, old screenshots are deleted
- After LLM request completes (success or final failure), screenshot is deleted
- System never accumulates orphaned screenshot files

---

## Data Flow Diagrams

### Screenshot Action Flow

```
[LLM]
  ↓ (1) Screenshot request
[PageScreenShotTool]
  ↓ (2) Capture command
[ScreenshotService]
  ↓ (3) CDP: Page.captureScreenshot
[Chrome CDP]
  ↓ (4) base64 PNG data
[ScreenshotService]
  ↓ (5) Save to storage
[ScreenshotFileManager]
  ↓ (6) Image file ID
[PageScreenShotTool]
  ↓ (7) Upload to LLM context
[OpenAIResponsesClient]
  ↓ (8) Vision API request with image
[OpenAI API]
  ↓ (9) Success response
[OpenAIResponsesClient]
  ↓ (10) Trigger cleanup
[ScreenshotFileManager]
  ↓ (11) Delete file
[PageScreenShotTool]
  ↓ (12) Response with image_file_id
[LLM]
```

### Coordinate-Based Action Flow

```
[LLM]
  ↓ (1) Click/Type/Scroll request with coordinates
[PageScreenShotTool]
  ↓ (2) Validate coordinates
[CoordinateActionService]
  ↓ (3) CDP: Input.dispatchMouseEvent / Input.dispatchKeyEvent
[Chrome CDP]
  ↓ (4) Action performed on page
[CoordinateActionService]
  ↓ (5) Action confirmation
[PageScreenShotTool]
  ↓ (6) Response with action metadata
[LLM]
```

### Viewport Detection Flow

```
[DOMTool]
  ↓ (1) getSerializedDom() request
[DomService]
  ↓ (2) For each node during traversal
[ViewportDetector]
  ↓ (3) Get viewport bounds (Runtime.evaluate)
  ↓ (4) Get element box model (DOM.getBoxModel)
  ↓ (5) Calculate intersection percentage
  ↓ (6) Return inViewport: boolean
[DomService]
  ↓ (7) Add inViewport to SerializedNode
  ↓ (8) Continue traversal
[DomService]
  ↓ (9) Return complete SerializedDom with inViewport fields
[LLM]
```

---

## Validation Rules Summary

### Request Validation

| Action | Required Fields | Optional Fields | Constraints |
|--------|----------------|-----------------|-------------|
| screenshot | action, (tab_id) | scroll_offset | scroll_offset values must be integers |
| click | action, coordinates | tab_id, options.button | coordinates must be within viewport |
| type | action, coordinates, text | tab_id, options | text max length 10,000 chars |
| scroll | action, coordinates | tab_id, scroll_offset | coordinates + scroll_offset define target |
| keypress | action, key | tab_id, options.modifiers | key must be valid DOM key string |

### Data Integrity Rules

1. **Screenshot Uniqueness**: Maximum one screenshot file exists at any time
2. **Coordinate Bounds**: coordinates.x < viewport.width AND coordinates.y < viewport.height
3. **Action-Data Consistency**: ResponseData schema matches action type
4. **Error Exclusivity**: Response has either data OR error, never both
5. **Viewport Consistency**: ViewportBounds dimensions match actual browser state

---

## Storage Specifications

### Temporary Screenshot Storage

**Storage Medium**: chrome.storage.local (Chrome Extension API)

**Schema**:

| Key | Value Type | Max Size | TTL |
|-----|-----------|----------|-----|
| `screenshot_cache` | string (base64 PNG) | 10MB | Until explicit deletion |

**Operations**:

| Operation | API Call | Trigger | Behavior |
|-----------|----------|---------|----------|
| Store | `chrome.storage.local.set({ screenshot_cache: base64 })` | After screenshot capture | Automatically replaces old screenshot |
| Retrieve | `chrome.storage.local.get('screenshot_cache')` | Before LLM upload | Returns current cached screenshot |
| Delete | `chrome.storage.local.remove('screenshot_cache')` | After LLM request complete or final failure | Clears cache |

**Constraints**:
- **Single key strategy**: Only one screenshot exists at `"screenshot_cache"` key at any time
- **Atomic replace**: `set()` operation automatically overwrites old value (no explicit cleanup needed before capture)
- **No directory management**: No filesystem tmp/ folder required
- **Ephemeral by design**: Screenshot exists only for single LLM request lifecycle
- **Size validation**: Reject screenshots >10MB with clear error (rare edge case)

---

## Performance Characteristics

### Expected Latencies

| Operation | Expected Time | Factors |
|-----------|---------------|---------|
| Screenshot capture | 100-300ms | Page complexity, image size |
| Coordinate click | 50-100ms | CDP round-trip time |
| Coordinate type | 50ms + (5ms per char) | Text length |
| Viewport detection (per node) | 1-2ms | Calculation complexity |
| File storage | 10-50ms | Data size, storage API latency |
| LLM image upload | 500-2000ms | Network speed, image size, API latency |

### Resource Usage

| Resource | Usage | Limit |
|----------|-------|-------|
| Storage per screenshot | 500KB - 2MB | 10MB per chrome.storage.local item |
| Token cost per screenshot | 1000-2000 tokens | OpenAI vision API pricing |
| Memory (base64 string) | Same as storage | Garbage collected after upload |

---

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2025-10-31 | Initial data model defined | Feature design phase |
