# Feature Specification: DomTool Visual Effects

**Feature Branch**: `003-domtool-visual-effects`
**Created**: 2025-10-25
**Status**: Draft
**Input**: User description: "Create visual UI effect for the Domtool. Currently, browserx/ is a in browser AI agent chrome extension app, browserx use AI to control dom to perfom user's task. For example, if a user says: \"in the linkedin.com home page, help me post a new post 'this is AI agent post'\" . Then AI agent will operate the dom to finish the task. We have a domTool src/content/dom/DomTool.ts that actually do the dom oepration. Now we want to create UI visual effect for it. Some requirements:
1. when the target tab is under active operation by the agent, we default disable user's operation on the page (disable human user's mouse click, scroll, keypress) by bring a slight opaque conver on top of the page.
2. On top of the page, provide 2 buttons: a. take over (which allow both agent and human to operate in the page, this will affect agent running because dom change will come from both agent and human, that why we default disable human and have button allow user to take over). b. stop agent run (this will totally turn down the current agent running)
3. Bring cursor move animation on top of the page. It uses an embedded pointing hand SVG to represent the virtual mouse cursor for agent operations. when an element is clicked, the cursor moves from the last point to the target element's screen location (It firstly appeared in the center of the page screen). The moving process should be animated smoothly
4. Bring water ripple effect click, after the cursor move animation finished (the cursor reached to target element's screen location), use src/content/dom/ui_effect/water_ripple_effect.js drop() method to create ripple effect in the target element screen location to represent the target element is clicked. The ripple effect has to be triggered AFTER the cursor moving effect
5. Create undulate effect when get_serialized_dom is called src/content/dom/DomTool.ts
6. use svelte to build related html element
7. use shadow dom to do inject to the target page
8. The UI effect should be async, not blocking the functionality in src/content/dom/DomTool.ts. Which means's the dom tool works relatively indepdently from the visual effect, once it send a signal to trigger the visual animation effect, it doesn't wait for its response. The error or exception in the UI effect performing is low importance and can be ignore currently
9. The current DOMTool should handle element information (which is respenting where the element is in user's screen) to the vsiual effect component to caculate the x, y coordiation of the target element in user screen. This requirement means we want to make such x, y coordiation calculation in the visual component side so that it reduce the dom tool processing burden.
10. Any of the exception of the visual effect shoudn't not affect the agent running in functioanlity way, but we might need to re-initilize the visual effect when it has exception or error cause it cannot continue running.
let me know if you have further questions during the design and implementation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Passive Agent Observation (Priority: P1)

When the AI agent is performing DOM operations (clicking, typing, navigating) on a web page, users need clear visual feedback showing what actions the agent is taking and where on the page these actions occur. The page should be protected from accidental human interference during agent operations.

**Why this priority**: This is the core feature value - without visual feedback, users cannot understand what the agent is doing, creating confusion and trust issues. The page protection prevents users from accidentally disrupting agent workflows.

**Independent Test**: Can be fully tested by triggering any agent DOM action (click, type, keypress) on a test page and verifying that the overlay appears, user input is disabled, and the cursor animation + ripple effect display correctly at the action location. Delivers immediate value by making agent actions visible and protecting them from interference.

**Acceptance Scenarios**:

1. **Given** agent is idle, **When** agent starts a DOM operation (click/type/keypress), **Then** a semi-transparent overlay appears over the page blocking all user input (mouse clicks, scrolls, keypresses)
2. **Given** agent performs a click action on an element, **When** the action executes, **Then** an animated pointing hand cursor smoothly moves from its last position (or screen center if first action) to the target element's screen location
3. **Given** the cursor animation completes, **When** cursor reaches target element location, **Then** a water ripple effect appears at that exact location indicating the click
4. **Given** agent performs multiple sequential actions, **When** each action executes, **Then** the cursor animates from the previous action's end position to the new action's target location
5. **Given** agent completes all operations, **When** agent session ends, **Then** the overlay, cursor, and effects disappear and normal user input is restored

---

### User Story 2 - Manual Takeover Control (Priority: P2)

Users may need to intervene during agent operation to correct issues, provide additional input, or manually complete steps the agent cannot handle. Users must be able to temporarily take control while keeping the agent session active, and permanently stop the agent if needed.

**Why this priority**: Essential safety and control mechanism, but secondary to basic visualization. Users should first understand what the agent is doing (P1) before needing intervention controls.

**Independent Test**: Can be tested by starting an agent session, clicking the "Take Over" button to verify the overlay is removed and user input is enabled while agent visual effects (cursor and ripples) continue for agent actions, performing manual actions, then clicking "Stop Agent" to verify the session terminates completely.

**Acceptance Scenarios**:

1. **Given** agent is running with input blocked, **When** user clicks "Take Over" button, **Then** the semi-transparent overlay is removed, user mouse clicks/scrolls/keypresses are re-enabled, and agent session remains active with visual effects (cursor and ripples) continuing to show for agent actions
2. **Given** user has taken over (overlay removed), **When** user performs manual DOM actions, **Then** both user and agent actions are possible (no visual effects for user actions, only agent actions show cursor and ripple effects)
3. **Given** agent is running (with or without takeover), **When** user clicks "Stop Agent" button, **Then** agent session terminates immediately, all visual effects disappear, and normal page interaction is fully restored
4. **Given** overlay is active, **When** user sees the control buttons, **Then** buttons are clearly visible, positioned non-intrusively (bottom center of screen), and labeled "Take Over" and "Stop Agent"

---

### User Story 3 - DOM Analysis Feedback (Priority: P3)

When the agent performs DOM analysis operations (capturing and serializing the DOM tree), users need visual feedback indicating the analysis is in progress. This helps users understand when the agent is "thinking" versus when it is acting.

**Why this priority**: Nice-to-have feedback for completeness. Less critical than action visualization (P1) or control mechanisms (P2) since DOM analysis happens quickly and doesn't change page state.

**Independent Test**: Can be tested by triggering a `get_serialized_dom` call in DomTool and verifying that the undulate effect (random ripples across the page) appears, plays for the expected duration, then fades out naturally.

**Acceptance Scenarios**:

1. **Given** agent needs to analyze page structure, **When** `get_serialized_dom` is called on DomTool, **Then** an undulate effect (20 random ripples staggered over 0.5 seconds) appears across the page
2. **Given** undulate effect is triggered, **When** ripples are generated, **Then** they have varied positions, sizes (20-50px radius), and strengths (0.08-0.16) creating a natural wave pattern
3. **Given** undulate effect completes, **When** 3.5 seconds pass (0.5s generation + 3s fade), **Then** all ripples fade naturally and the effect stops without abrupt cutoff

---

### Edge Cases

- What happens when agent actions occur faster than animation can complete (e.g., rapid sequential clicks)?
  - Cursor animations should queue intermediate positions to keep up with agent actions while maintaining visual continuity
  - The cursor move speed will increase if more than 3 events are queued (50% speek increase, come back to normal when less than 3 elements are queued)
  - Ripple effects trigger must be queued as well, each ripple effect should reflect the cursor click (after the cursor reach to its place)

- What happens when the target element moves or scrolls out of view during cursor animation?
  - DomTool ensures elements are stable and visible before triggering click actions (simulating human behavior - humans don't click on moving/scrolling elements)
  - DomTool handles scrolling element into view and waiting for scroll completion before emitting action signal
  - Visual effect component animates cursor to the stable target coordinates provided by DomTool
  - If element becomes unstable after signal emission, visual effect completes animation to last known coordinates

- What happens when visual effect initialization fails (e.g., WebGL not supported, Shadow DOM blocked)?
  - DomTool functionality continues unaffected (fire-and-forget architecture)
  - Visual effect component logs error silently without throwing exceptions
  - System attempts to reinitialize visual effects on next agent action

- What happens when user clicks "Take Over" and both user and agent try to interact with same element simultaneously?
  - The semi-transparent overlay is removed, restoring user input capability
  - Visual effects (cursor animations and water ripple effects) continue to display for agent actions only, not for user actions
  - User input takes precedence (browser native behavior)
  - Agent actions may fail or produce unexpected results (documented limitation when takeover is active)

- What happens when the page dynamically changes size (browser resize, mobile orientation change)?
  - Visual effect overlay automatically resizes to match viewport
  - Cursor and ripple positions recalculate based on new viewport dimensions
  - Existing animations adjust to new coordinate system without disruption

- What happens when agent operates within an iframe?
  - Visual effects DO NOT inject into iframes - they always stay at the browser page level (top-level document)
  - Visual effect component calculates iframe element positions relative to the user's screen viewport
  - Cursor animations and ripple effects display at calculated screen coordinates, overlaying the iframe content
  - This ensures consistent visual feedback regardless of iframe nesting depth or cross-origin restrictions

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST render a semi-transparent overlay covering the entire viewport when agent begins DOM operations, with z-index high enough to capture all user input events
- **FR-002**: Overlay MUST block all user input events (mousedown, mouseup, click, dblclick, scroll, wheel, keydown, keyup, keypress) and prevent event propagation to underlying page
- **FR-003**: System MUST display two control buttons on the overlay positioned at the bottom center of the screen: "Take Over" button and "Stop Agent" button
- **FR-004**: "Take Over" button MUST remove the semi-transparent overlay to restore user input while keeping agent session active and continuing to display visual effects (cursor animations and ripple effects) for agent actions
- **FR-005**: "Stop Agent" button MUST send termination signal to agent session, remove overlay, remove all visual effects, and restore full user input control
- **FR-006**: Semi-transparent overlay and visual effects (cursor animations, ripple effects) MUST operate independently - visual effects continue to display for agent actions regardless of overlay presence or absence
- **FR-007**: System MUST render an animated pointing hand cursor (using embedded SVG) that smoothly moves from its current position to target element's screen coordinates when agent performs click action
- **FR-008**: Cursor's initial appearance position MUST be the center of the viewport, subsequent movements MUST start from the previous action's end position
- **FR-009**: Cursor animation MUST use smooth easing function (e.g., ease-in-out) with duration proportional to distance traveled (minimum 300ms, maximum 1500ms)
- **FR-010**: System MUST trigger water ripple effect at target element's screen location immediately after cursor animation completes (ripple MUST NOT trigger before cursor arrival)
- **FR-011**: Water ripple effect MUST use existing `water_ripple_effect.js` `drop(x, y, radius, strength)` method with screen coordinates
- **FR-012**: System MUST trigger undulate effect (20 staggered random ripples) when DomTool's `get_serialized_dom` method is called
- **FR-013**: Undulate effect MUST use existing `water_ripple_effect.js` `undulate()` method and run independently without blocking DOM serialization
- **FR-014**: All visual effect components MUST be implemented using Svelte framework for reactive UI management
- **FR-015**: Visual effect components MUST inject into target page using Shadow DOM for style encapsulation and isolation from page CSS
- **FR-016**: Visual effect system MUST operate asynchronously via fire-and-forget event signaling from DomTool (DomTool does not wait for visual effect responses)
- **FR-017**: DomTool MUST emit events containing element reference or bounding box information; visual effect component MUST calculate screen x/y coordinates from this information to reduce DomTool processing burden
- **FR-018**: Visual effect component MUST catch and silently log all exceptions without propagating errors to DomTool or interrupting agent operations
- **FR-019**: System MUST detect visual effect failures (initialization errors, rendering exceptions) and automatically attempt reinitialization on next agent action
- **FR-020**: System MUST hide visual effects and restore normal page interaction when agent session ends (either by completion or user stop action)
- **FR-021**: System MUST handle viewport resize events by recalculating overlay dimensions and adjusting coordinate system for ongoing animations
- **FR-022**: Visual effect components MUST always inject at the browser page level (top-level document), never into iframes, and MUST calculate screen coordinates for elements within iframes to display effects at correct viewport positions

### Key Entities

- **Visual Effect Controller**: Central coordinator that receives signals from DomTool, manages overlay state, orchestrates cursor animations, triggers ripple effects, and handles control button interactions
- **Overlay Component**: Semi-transparent full-viewport layer that blocks user input, displays control buttons, and provides visual container for cursor and effects
- **Cursor Animator**: Manages animated pointing hand cursor movement including position tracking, smooth interpolation between positions, easing functions, and timing calculations
- **Ripple Effect Adapter**: Wrapper for existing water_ripple_effect.js that converts element positions to screen coordinates and manages ripple lifecycle
- **Event Signal**: Message passed from DomTool to Visual Effect Controller containing action type (click/type/keypress/serialize) and element information (reference or bounding box)

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can visually identify every agent action (click, type, keypress) within 300ms of action execution through cursor animation and ripple effects
- **SC-002**: Agent operations complete without functionality degradation when visual effects are active (zero impact on action success rate)
- **SC-003**: Visual effect failures (exceptions, initialization errors) result in zero agent operation failures (100% isolation between visual system and agent functionality)
- **SC-004**: Users can successfully take over page control within 1 second of clicking "Take Over" button (all user input events immediately enabled)
- **SC-005**: Users can terminate agent session within 500ms of clicking "Stop Agent" button (overlay removed, input restored, agent stopped)
- **SC-006**: Cursor animations complete smoothly across 95% of viewport distances without visible jank or frame drops (60fps target)
- **SC-007**: Water ripple effects trigger exactly when cursor reaches target element location with zero premature triggers
- **SC-008**: DOM serialization operations complete with undulate visual feedback visible to user for full 3.5 second duration (stagger + fade)
- **SC-009**: Visual effects automatically reinitialize after failures within one agent action cycle (next action triggers fresh initialization attempt)
- **SC-010**: System handles rapid sequential agent actions (5+ actions per second) without blocking, queuing delays under 100ms per action

## Assumptions

- Browser supports ES2020 JavaScript features required by Svelte 4.2.20 compilation target
- Browser supports Shadow DOM v1 specification for style encapsulation
- Browser supports WebGL for water ripple effects (if not supported, effects fail gracefully per FR-018)
- Extension has permissions to inject content scripts into target pages where agent operates
- Existing `water_ripple_effect.js` is stable and correctly implements `drop()` and `undulate()` methods
- Pointing hand cursor SVG content is embedded in the visual effect component code (hard-coded, not loaded from external file)
- Agent actions occur sequentially with sufficient spacing (>50ms) between actions for animation system to keep pace under normal operation
- DomTool can be modified to emit event signals without breaking existing functionality
- DomTool ensures target elements are stable (not moving/scrolling) and visible before emitting action signals to visual effects (simulates human behavior)
- DomTool handles scrolling elements into view and waiting for scroll completion before triggering actions
- DomTool provides sufficient element information (bounding box or element reference) for visual effects to calculate screen coordinates, including for elements within iframes
- Visual effect component can calculate screen viewport coordinates from iframe element positions accounting for iframe offset, scroll, and transformations
- Chrome Extension content script context allows Shadow DOM injection and event listener attachment at the top-level document
- Page performance is sufficient to handle 60fps animations without impacting user experience
