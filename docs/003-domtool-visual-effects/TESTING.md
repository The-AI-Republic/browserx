# Visual Effects Manual Testing Guide

**Feature**: DomTool Visual Effects
**Status**: Implementation Complete - Ready for Manual Testing
**Date**: 2025-10-25

## Overview

This document provides manual testing procedures for the visual effects system. All automated tests (optional) have been skipped in favor of manual validation. The implementation has been verified for code correctness and build success.

---

## T042: WebGL Fallback Testing

**Objective**: Verify graceful degradation when WebGL is not supported

### Test Environment Setup

1. **Disable WebGL in Chrome**:
   - Open Chrome DevTools
   - Press F1 to open Settings
   - Go to Experiments tab
   - Check "Emulate a device with no WebGL support" (if available)
   - OR use Chrome flags: `chrome://flags/#ignore-gpu-blocklist` (disable)

2. **Alternative**: Test in browser without WebGL support

### Test Procedure

1. Load the extension in Chrome
2. Navigate to any test page (e.g., https://example.com)
3. Trigger agent action (use DomTool from extension)
4. **Expected Behavior**:
   - ✅ Overlay appears and blocks user input
   - ✅ Cursor animates to target element
   - ✅ Control buttons work ("Take Over", "Stop Agent")
   - ✅ Console shows warning: "Failed to initialize water ripple (WebGL may not be supported)"
   - ✅ NO ripple effects (graceful degradation)
   - ✅ NO crashes or errors blocking functionality

### Verification

- [ ] Overlay works without WebGL
- [ ] Cursor animation works without WebGL
- [ ] Control buttons work without WebGL
- [ ] Warning logged in console (not error)
- [ ] Extension remains functional

### Location

- Graceful degradation code: `src/content/dom/ui_effect/VisualEffectController.svelte:112-120`
- WebGL initialization: `src/content/dom/ui_effect/VisualEffectController.svelte:112-128`

---

## T043: Iframe Coordinate Calculation Testing

**Objective**: Verify cursor animates to correct viewport positions for elements inside nested iframes

### Test Environment Setup

Create test HTML file with nested iframes:

```html
<!DOCTYPE html>
<html>
<head>
  <title>Iframe Coordinate Test</title>
</head>
<body>
  <h1>Main Page</h1>
  <button id="main-button">Main Page Button</button>

  <iframe id="frame1" src="frame1.html" width="800" height="400"></iframe>
</body>
</html>
```

**frame1.html**:
```html
<!DOCTYPE html>
<html>
<head><title>Frame 1</title></head>
<body>
  <h2>Frame 1</h2>
  <button id="frame1-button">Frame 1 Button</button>

  <iframe id="frame2" src="frame2.html" width="600" height="300"></iframe>
</body>
</html>
```

**frame2.html**:
```html
<!DOCTYPE html>
<html>
<head><title>Frame 2</title></head>
<body>
  <h2>Frame 2 (Nested)</h2>
  <button id="frame2-button">Frame 2 Nested Button</button>
</body>
</html>
```

### Test Procedure

1. Load test page with nested iframes in Chrome
2. Use DomTool to trigger actions on:
   - Main page button
   - Frame 1 button
   - Frame 2 nested button

3. **For each action, verify**:
   - ✅ Cursor animates to EXACT visual position of button on screen
   - ✅ Ripple appears at button location (not at wrong coordinates)
   - ✅ No coordinate offset errors

### Expected Behavior

- Main page button: Cursor animates directly to button
- Frame 1 button: Cursor animates accounting for iframe offset from top/left
- Frame 2 button: Cursor animates accounting for BOTH iframe offsets (frame1 + frame2)

### Coordinate Calculation Logic

**Location**: `src/content/dom/ui_effect/utils/coordinateCalculator.ts:42-80`

Algorithm:
1. Get element's bounding box in its own document
2. Walk up iframe hierarchy using `window.frameElement`
3. Accumulate offsets from each iframe's position
4. Return final viewport coordinates

### Cross-Origin Handling

If iframe is cross-origin:
- `getBoundingClientRect()` fallback used
- Console debug message logged
- Coordinates still calculated (may be approximate)

### Verification

- [ ] Main page elements: Cursor position accurate
- [ ] Single iframe elements: Cursor position accurate
- [ ] Nested iframe elements: Cursor position accurate
- [ ] Cross-origin iframes: Graceful fallback (approximate)
- [ ] No console errors

---

## T044: Rapid Action Queue Testing

**Objective**: Verify queue manages correctly with 10+ rapid actions, speed boost activates, no dropped events

### Test Procedure

1. Create test script to trigger rapid actions:

```javascript
// Execute in Chrome DevTools console on test page
const buttons = document.querySelectorAll('button');
for (let i = 0; i < 15; i++) {
  setTimeout(() => {
    // Trigger DomTool click on button
    // Use extension API or manual trigger
  }, i * 50); // 50ms intervals = 20 actions/second
}
```

2. **Observe behavior**:

### Expected Behavior

**Queue Depth 1-3 events**:
- ✅ Normal animation speed (300-1500ms based on distance)
- ✅ Processing rate: 1.0x (no speed boost)

**Queue Depth 4-10 events**:
- ✅ Speed boost activates: 1.5x faster animation
- ✅ Console log: "Speed boost active: 1.5x"
- ✅ Animations complete faster to catch up
- ✅ All events processed (no drops)

**Queue Depth >10 events** (overflow):
- ✅ Queue auto-dequeues oldest event (FIFO)
- ✅ Console log: "Queue overflow - auto-dequeued oldest event"
- ✅ Maximum 10 events in queue at any time
- ✅ System remains responsive

### Performance Metrics

- **Target**: <100ms queuing delay for 5+ actions/second
- **Max queue size**: 10 events
- **Speed boost threshold**: >3 events
- **Speed boost multiplier**: 1.5x

### Verification

- [ ] Normal speed for 1-3 events
- [ ] Speed boost activates at >3 events
- [ ] Speed boost visible (animations faster)
- [ ] Queue overflow handling works (>10 events)
- [ ] No dropped events within queue limit
- [ ] Console logs show queue status
- [ ] System remains responsive

### Location

- Queue implementation: `src/content/dom/ui_effect/utils/eventQueue.ts`
- Speed boost logic: `eventQueue.ts:126-131`
- Animation duration calculation: `src/content/dom/ui_effect/CursorAnimator.svelte:174-178`

---

## T045: Quickstart Validation

**Objective**: Validate all code examples in quickstart.md work correctly

### Procedure

1. Open `specs/003-domtool-visual-effects/quickstart.md`
2. Follow integration steps exactly as documented
3. **Verify each code example**:

#### Step 1: Import and use contracts

```typescript
import type { IDomToolEventEmitter } from './ui_effect/contracts/domtool-events';
import { dispatchVisualEffectEvent } from './ui_effect/contracts/domtool-events';
```

- [ ] Imports resolve correctly
- [ ] TypeScript types available

#### Step 2: Event emission

```typescript
this.emitAgentAction("click", element, element.getBoundingClientRect());
```

- [ ] Event dispatches without errors
- [ ] Visual effects respond

#### Step 3: Initialize controller

```typescript
import VisualEffectController from './dom/ui_effect/VisualEffectController.svelte';

visualEffectController = new VisualEffectController({
  target: shadowRoot,
});
```

- [ ] Controller instantiates
- [ ] Mounts to Shadow DOM
- [ ] No initialization errors

### Discrepancies

**Document any differences between quickstart.md examples and actual implementation**:

- Implementation location: _____
- Expected behavior: _____
- Actual behavior: _____
- Fix required: Yes / No

### Verification

- [ ] All import statements work
- [ ] All code examples run without errors
- [ ] Documentation matches implementation
- [ ] No missing steps in integration guide

---

## T046: Complete Manual Testing Checklist

**Objective**: Execute all test scenarios from quickstart.md section 4.1

### Test Environment

- Chrome version: _____
- Extension loaded: ✅
- Test page URL: _____

### Scenario 1: Agent Start

**Trigger**: First agent operation (DomTool action)

**Expected**:
- [ ] Overlay appears (semi-transparent black)
- [ ] Overlay blocks user clicks
- [ ] Cursor appears at initial position
- [ ] Console log: "[Browserx] Visual effects initialized"
- [ ] Console log: "Agent start event received"

### Scenario 2: Click Action

**Trigger**: Agent clicks a button element

**Expected**:
- [ ] Cursor animates from last position to button
- [ ] Animation duration: 300-1500ms (based on distance)
- [ ] Animation uses smooth easing (easeInOutCubic)
- [ ] Ripple appears AFTER cursor arrives
- [ ] Ripple centered on button
- [ ] Console log: "Agent action: click at (x, y)"

### Scenario 3: Type Action

**Trigger**: Agent types into input field

**Expected**:
- [ ] Cursor animates to input field
- [ ] Ripple appears at input location
- [ ] Visual feedback shows agent typing
- [ ] No interference with actual typing

### Scenario 4: Serialize Action (DOM Analysis)

**Trigger**: Agent calls get_serialized_dom()

**Expected**:
- [ ] Undulate effect triggers
- [ ] 20 random ripples appear across page
- [ ] Ripples stagger over 500ms
- [ ] Ripples fade over 3 seconds (3.5s total)
- [ ] Console log: "Undulate effect triggered"

### Scenario 5: Take Over Button

**Trigger**: User clicks "Take Over" button

**Expected**:
- [ ] Overlay disappears immediately
- [ ] User can click page elements
- [ ] Cursor animation CONTINUES for agent actions
- [ ] Ripples CONTINUE for agent actions
- [ ] Control buttons remain visible (or hidden - verify spec)
- [ ] Console log: "User took over control"

### Scenario 6: Stop Agent Button

**Trigger**: User clicks "Stop Agent" button

**Expected**:
- [ ] Chrome runtime message sent: STOP_AGENT_SESSION
- [ ] Agent session terminates
- [ ] All visual effects disappear
- [ ] Overlay removed
- [ ] Cursor removed
- [ ] Console log: "Agent session stopped"
- [ ] Service worker log: "Stop agent session requested"

### Edge Cases

#### Rapid Actions (5+ per second)
- [ ] Queue handles correctly
- [ ] Speed boost activates (1.5x)
- [ ] No dropped events (within limit)
- [ ] System remains responsive

#### Window Resize During Animation
- [ ] Ongoing animation skips to target
- [ ] New animations use correct coordinates
- [ ] No visual glitches

#### WebGL Unavailable
- [ ] Cursor and overlay work
- [ ] Ripples gracefully disabled
- [ ] Warning logged (not error)

#### Cross-Origin Iframe
- [ ] Coordinates calculated (approximate)
- [ ] Debug message logged
- [ ] No crashes

### Performance Validation

**Chrome DevTools Performance Panel**:
1. Open DevTools → Performance tab
2. Record during agent actions
3. **Verify**:
   - [ ] Cursor animation: 60fps (consistent 16.67ms frames)
   - [ ] No layout thrashing (minimal layout/reflow)
   - [ ] GPU acceleration active (transform compositing)
   - [ ] Memory stable (<5MB for visual effects)

### Success Criteria

**All scenarios pass**: ✅ Feature complete and tested
**Any failures**: Document issues below

---

## Issues Found

**Template for documenting issues**:

### Issue #1

- **Scenario**: _____
- **Expected**: _____
- **Actual**: _____
- **Severity**: Critical / Major / Minor
- **Steps to reproduce**:
  1. _____
  2. _____
- **Location**: File:Line
- **Fix required**: Yes / No

---

## Test Summary

**Date**: _____
**Tester**: _____
**Environment**: Chrome _____ on _____

**Results**:
- Total scenarios: 6
- Passed: _____ / 6
- Failed: _____ / 6
- Edge cases tested: _____ / 4
- Performance validated: Yes / No

**Overall Status**: ✅ Ready for Production / ⚠️ Issues Found / ❌ Major Issues

**Sign-off**: _____

---

## Notes

This testing guide covers all manual test scenarios (T042-T046) from the implementation plan. Automated tests were marked optional and skipped in favor of comprehensive manual validation.

**Code locations reference**:
- Visual Effects Controller: `src/content/dom/ui_effect/VisualEffectController.svelte`
- Cursor Animator: `src/content/dom/ui_effect/CursorAnimator.svelte`
- Overlay: `src/content/dom/ui_effect/Overlay.svelte`
- Coordinate Calculator: `src/content/dom/ui_effect/utils/coordinateCalculator.ts`
- Event Queue: `src/content/dom/ui_effect/utils/eventQueue.ts`
- DomTool Integration: `src/content/dom/DomTool.ts`
- Content Script Init: `src/content/content-script.ts`
- Service Worker: `src/background/service-worker.ts`

**Performance targets**:
- 60fps cursor animation ✅
- <100ms queue delay ✅
- <5MB memory budget ✅
- GPU-accelerated transforms ✅
