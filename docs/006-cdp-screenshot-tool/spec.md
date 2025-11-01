# Feature Specification: CDP Screenshot Tool

**Feature Branch**: `006-cdp-screenshot-tool`
**Created**: 2025-10-31
**Status**: Draft
**Input**: User description: "mplement cdp (chrome devtool protocol) based target page screenshot tool named PageScreenShotTool. browserx/ is a chrome extension AI agent app that enable llm to perform user commands in web page. We currently have cdp based dom tool: browserx/src/tools/DOMTool.ts to enable llm to "see" and perfom action to the page. However, the modern web page is very complex and sometimes reading dom of the page cannot help llm to understand the web page well. So we need to offer a complementary visual screen shot of the target web page. This is to implement such visual page tool named PageScreenShotTool with following rquirements 1. PageScreenShotTool should inherit the architect of the browserx/src/tools extends from BaseTool 2. it offers following actions: 2.1 screenshot, because the screenshot capture the visual screen pixel image, we need to care about if a web page is too long that out of user's screen or not (whether or not user needs to scroll in browser to view the whole page). So the llm can only use it as complementary tool for DomTool, which means we always use dom tool to let llm "see" the page first and when the llm realize it cannot perform the action only based on dom analyzing, it invoke  PageScreenShotTool to capture the visual screen shot of the page. So this action needs to also accept a scroll params (to target page section, and it can be default, means no scoll needed) then do a scroll before taking screen shot 2.2 click(), this click is based on llm's visual understand of the page screenshort and give out the screen x, y coordination information, then the tool perform click action on the real target page 2.3 type(), this is also based on llm's visual understand of the page screenshort and give out the screen x, y coordiatnion information to focus, then input (similar to type logic of browserx/src/tools/DOMTool.ts, only different input params) 2.4 scroll() also accept llm's visual coordination info to scroll to target section of the page 2.5 key press() also based on llm's visual understanding 3. we also should create browserx/src/tools/screenshot/ and put all the functional implementation there, leaving PageScreenShotTool a interface expose to llm and call the real functionality from browserx/src/tools/screenshot/ 4. In DomTool browserx/src/types/domTool.ts, in SerializedNode, we need to add one more field inViewPort to indicate whether or not the given node is current within the screen from user's perspective. So that help llm to make the decision of using PageScreenShotTool or not. 5. After screen shot is taken, we should have a tmp/screenshot/ folder to store the screen shot as a image file, and also upload it as image file in browserx/src/models/OpenAIResponsesClient.ts. Alway delete the file (previous screenshot files) after the request is successfully sent(even the request failed after retry, we needs to delete the file and let llm to initiate a new screen shot) 6. When the new screenshot is taken and store as file, double check if any old screenshot image stored as tmp files, delete them before storing as a new image file 7. change the system prompt browserx/src/prompts/agent_prompt.md to use PageScreenShotTool only as complementary of DomTool and only if necessary"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Visual Inspection of Viewport Content (Priority: P1)

The AI agent needs to visually inspect what is currently shown in the browser viewport when DOM analysis alone is insufficient to understand the page layout or visual presentation.

**Why this priority**: This is the core value proposition - enabling visual understanding when DOM structure doesn't provide enough context. This enables the agent to handle visually complex pages, canvas elements, SVG graphics, and styled content where semantic meaning is lost in DOM representation.

**Independent Test**: Can be fully tested by having the agent take a screenshot of any webpage and verifying the image captures the current viewport content accurately.

**Acceptance Scenarios**:

1. **Given** the agent has analyzed a page's DOM and cannot determine element positions or visual layout, **When** the agent invokes PageScreenShotTool with screenshot action, **Then** a PNG image of the current viewport is captured and stored in chrome.storage.local at key "screenshot_cache"
2. **Given** a webpage is longer than the viewport height, **When** the agent requests a screenshot without scroll parameters, **Then** only the currently visible viewport content is captured
3. **Given** the agent needs to see content below the fold, **When** the agent requests a screenshot with scroll position parameters, **Then** the page scrolls to the specified position before capturing the screenshot

---

### User Story 2 - Coordinate-Based Interaction on Captured Screenshots (Priority: P2)

The AI agent needs to perform click, type, and keyboard actions based on visual coordinate analysis of a captured screenshot, enabling interactions when DOM node identification is unreliable or impossible.

**Why this priority**: This enables interaction with complex UI elements (canvas, WebGL, shadow DOM, heavily obfuscated elements) where traditional DOM-based selection fails. Builds upon P1's screenshot capability.

**Independent Test**: Can be fully tested by capturing a screenshot, having the agent identify coordinates of a button visually, and verifying that clicking those coordinates triggers the expected action on the actual page.

**Acceptance Scenarios**:

1. **Given** the agent has analyzed a screenshot and identified a button at coordinates (x, y), **When** the agent invokes click action with those coordinates, **Then** a mouse click is performed at that exact screen position on the live page
2. **Given** the agent has identified an input field at coordinates (x, y) in a screenshot, **When** the agent invokes type action with coordinates and text, **Then** the element at those coordinates is focused and the text is typed
3. **Given** the agent needs to scroll to a specific visual area, **When** the agent invokes scroll action with target coordinates, **Then** the page scrolls to bring that screen region into view
4. **Given** the agent needs to press a keyboard key while viewing screenshot context, **When** the agent invokes keypress action, **Then** the specified key event is sent to the page

---

### User Story 3 - Viewport Visibility Detection in DOM (Priority: P1)

The AI agent needs to know which DOM nodes are currently visible in the viewport to make intelligent decisions about when to use visual screenshot tools versus DOM-based tools.

**Why this priority**: This is a critical decision-making signal for the agent. Without knowing what's in the viewport, the agent cannot efficiently choose between DOM analysis and visual screenshot analysis. This prevents unnecessary screenshot operations and improves performance.

**Independent Test**: Can be fully tested by serializing a page's DOM, checking the `inViewport` field on various nodes, and verifying it matches the actual visibility of those elements in the browser viewport.

**Acceptance Scenarios**:

1. **Given** a DOM node is fully visible in the current viewport, **When** the agent captures a DOM snapshot, **Then** the SerializedNode for that element has `inViewport: true`
2. **Given** a DOM node is completely outside the viewport (above, below, or off-screen), **When** the agent captures a DOM snapshot, **Then** the SerializedNode has `inViewport: false`
3. **Given** a DOM node is partially visible (e.g., top half in viewport, bottom half scrolled out), **When** the agent captures a DOM snapshot, **Then** the SerializedNode indicates viewport status based on visibility threshold (default: >50% visible = true)

---

### User Story 4 - Screenshot Image Management and LLM Integration (Priority: P2)

The system needs to manage screenshot image files efficiently by cleaning up old screenshots, storing new ones temporarily, and uploading them as image attachments to the LLM for visual analysis.

**Why this priority**: Essential for the screenshot tool to function in production, but depends on P1 (screenshot capture) being completed first. Prevents disk clutter and ensures the LLM receives screenshots for analysis.

**Independent Test**: Can be fully tested by taking multiple screenshots in sequence and verifying that old screenshots are automatically replaced in chrome.storage.local (atomic update at key "screenshot_cache"), and images are successfully uploaded to OpenAI's API.

**Acceptance Scenarios**:

1. **Given** an old screenshot exists at chrome.storage.local key "screenshot_cache", **When** a new screenshot is captured, **Then** the new screenshot automatically replaces the old one (atomic update)
2. **Given** a screenshot has been successfully captured and saved, **When** the screenshot is sent to the LLM via OpenAIResponsesClient, **Then** the image is uploaded as a vision-capable message attachment
3. **Given** a screenshot image has been successfully sent to the LLM, **When** the API request completes (success or final failure after retries), **Then** the screenshot is deleted from chrome.storage.local
4. **Given** a screenshot upload fails and will be retried, **When** the retry occurs, **Then** the same screenshot is retrieved from chrome.storage.local and reused until final success or failure

---

### User Story 5 - Updated Agent Prompt for Tool Selection (Priority: P3)

The AI agent needs clear instructions in the system prompt about when to use PageScreenShotTool as a complementary tool to DOMTool, ensuring it's only used when DOM analysis is insufficient.

**Why this priority**: This is a configuration/prompt engineering task that ensures proper tool usage patterns. It can be implemented independently and tested by observing agent behavior with various page types.

**Independent Test**: Can be fully tested by providing the agent with various web pages and verifying it attempts DOM analysis first and only resorts to screenshots when encountering visual complexity or when DOM analysis fails.

**Acceptance Scenarios**:

1. **Given** the agent encounters a standard web form with clear DOM structure, **When** the agent analyzes the page, **Then** it uses only DOMTool without invoking PageScreenShotTool
2. **Given** the agent encounters a complex visual layout or canvas-based UI, **When** DOM analysis reveals nodes are present but visual layout is unclear, **Then** the agent invokes PageScreenShotTool to supplement understanding
3. **Given** the agent has `inViewport: false` for target elements in DOM snapshot, **When** deciding on next action, **Then** the agent considers using PageScreenShotTool to visually locate elements

---

### Edge Cases

- What happens when a screenshot capture fails due to Chrome permissions or CDP connection issues?
  - Return clear error message to agent indicating screenshot unavailable and fallback to DOM-only analysis
- How does the system handle very large pages that exceed screenshot dimension limits?
  - Screenshot only captures the visible viewport; agent can request multiple screenshots with different scroll positions if needed
- What happens if tmp/screenshot/ directory doesn't exist or lacks write permissions?
  - Create the directory if missing; fail gracefully with clear error if permissions are insufficient
- How are coordinate-based actions handled on responsive pages where layout changes between screenshot and action?
  - Accept this as a known limitation; agent should capture fresh screenshots if layout changes are detected
- What happens when clicking coordinates that land on an unclickable element or empty space?
  - CDP will dispatch click event at those coordinates; if no interactive element exists, the click has no effect (same as user clicking blank area)
- How does the system handle screenshots on pages with animations or video content?
  - Screenshot captures a single frame at the moment of capture; agent should be aware content may be transient

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a PageScreenShotTool class that extends BaseTool following the existing tool architecture
- **FR-002**: PageScreenShotTool MUST support a `screenshot` action that captures the current viewport as a PNG image file
- **FR-003**: The `screenshot` action MUST accept optional scroll parameters to scroll the page before capturing
- **FR-004**: PageScreenShotTool MUST support a `click` action that accepts screen coordinates (x, y) and performs a click at that position
- **FR-005**: PageScreenShotTool MUST support a `type` action that accepts screen coordinates (x, y) and text, focusing the element at those coordinates before typing
- **FR-006**: PageScreenShotTool MUST support a `scroll` action that accepts coordinate parameters to scroll to a specific screen region
- **FR-007**: PageScreenShotTool MUST support a `keypress` action that sends keyboard events based on visual context
- **FR-008**: All screenshot functionality implementation MUST reside in a separate `src/tools/screenshot/` directory, with PageScreenShotTool serving as a thin interface layer
- **FR-009**: SerializedNode interface MUST be extended with an `inViewport` boolean field indicating whether the node is currently visible in the viewport
- **FR-010**: System MUST store captured screenshot images in chrome.storage.local at key "screenshot_cache" as base64-encoded PNG strings
- **FR-011**: System MUST replace existing screenshot when saving new screenshot (atomic update at key "screenshot_cache")
- **FR-012**: OpenAIResponsesClient MUST be extended to support uploading screenshot images as vision-capable message attachments
- **FR-013**: System MUST delete screenshot files after successful LLM request completion or final failure after retries
- **FR-014**: System MUST use Chrome DevTools Protocol (CDP) for all screenshot capture and coordinate-based interaction operations
- **FR-015**: Agent system prompt MUST be updated to instruct the agent to use PageScreenShotTool only as a complementary tool when DOM analysis is insufficient

### Key Entities

- **PageScreenShotTool**: The main tool class exposed to the LLM, inheriting from BaseTool, providing screenshot capture and coordinate-based interaction actions
- **ScreenshotService**: Core service class in `src/tools/screenshot/` that implements CDP-based screenshot capture logic
- **CoordinateActionService**: Service class in `src/tools/screenshot/` that implements coordinate-based click, type, scroll, and keypress actions via CDP
- **ScreenshotFileManager**: Utility class in `src/tools/screenshot/` that handles screenshot storage, retrieval, and deletion in chrome.storage.local (key: "screenshot_cache")
- **ViewportDetector**: Service class that calculates and determines which DOM nodes are within the current viewport boundaries
- **Screenshot Cache**: Base64-encoded PNG string stored temporarily in chrome.storage.local at key "screenshot_cache", containing viewport capture
- **SerializedNode (extended)**: Existing DOM serialization interface extended with `inViewport` field

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Agent can successfully capture and analyze screenshots of web pages that cannot be understood through DOM structure alone (canvas-based UIs, complex visual layouts, heavily styled elements)
- **SC-002**: Agent correctly identifies which DOM elements are in the viewport, with >95% accuracy for standard web pages
- **SC-003**: Coordinate-based click actions successfully trigger the intended UI interactions with >90% accuracy on static layouts
- **SC-004**: Screenshot files are properly cleaned up with zero orphaned files remaining after each agent session completes
- **SC-005**: Agent uses PageScreenShotTool only when necessary (after attempting DOM analysis first), reducing unnecessary screenshot operations by >80% compared to always-screenshot approach
- **SC-006**: Screenshot capture and upload operations complete within 3 seconds for standard viewport sizes on typical network conditions
- **SC-007**: System gracefully handles screenshot failures without crashing, providing clear error context to enable the agent to fall back to DOM-only analysis

## Assumptions

- The Chrome extension has necessary permissions to use Chrome DevTools Protocol (CDP) for screenshot capture
- The `tmp/` directory is writable and available in the extension's execution context
- OpenAI's API supports vision-capable messages with image uploads (GPT-4 Vision or equivalent model)
- Screenshot images are reasonably sized (viewport dimensions, not full page) to avoid exceeding file size limits
- The agent has access to coordinate information from screenshot analysis (either through vision-capable model or external analysis)
- Viewport detection accuracy threshold defaults to >50% of element area visible to consider `inViewport: true`
- Coordinate-based actions assume the page layout remains static between screenshot capture and action execution
- The existing DOMTool and CDP infrastructure in browserx already provides necessary CDP connection and debugging capabilities

## Dependencies

- Existing BaseTool infrastructure in `src/tools/BaseTool.ts`
- Existing DOMTool implementation in `src/tools/DOMTool.ts`
- Existing CDP integration (DomService and related CDP utilities)
- Existing OpenAIResponsesClient in `src/models/OpenAIResponsesClient.ts`
- Chrome DevTools Protocol support in the target browser
- OpenAI API with vision capabilities (GPT-4 Vision or later models)
- File system access for temporary file storage (tmp/screenshot/ directory)

## Non-Goals

This feature intentionally does NOT include:

- Full-page screenshot capture (scrolling through entire page to capture all content) - only viewport screenshots
- OCR or text extraction from screenshots - relies on LLM's native vision capabilities
- Screenshot comparison or diff detection between captures
- Video recording or animated GIF capture
- Screenshot annotation or markup tools
- Support for non-CDP browsers (Firefox, Safari)
- Screenshot compression or format conversion (only PNG output)
- Persistent screenshot storage or history management beyond single-use temporary files
- Automatic screenshot quality optimization or resolution adjustment
