# Research & Technical Decisions: DomTool Visual Effects

**Feature**: DomTool Visual Effects
**Date**: 2025-10-25
**Phase**: 0 - Research

## Overview

This document captures technical research and architectural decisions for implementing visual effects that provide user feedback for AI agent DOM operations in the BrowserX Chrome extension.

## Technical Decisions

### 1. Svelte Component Architecture

**Decision**: Use Svelte 4.2.20 with isolated component modules for overlay, cursor animator, and effect controller.

**Rationale**:
- Already in project stack (package.json dependency)
- Reactive state management ideal for dynamic UI updates
- Small bundle size critical for Chrome extension performance
- Compiler-based approach produces vanilla JavaScript output
- Native support for component composition and props

**Alternatives Considered**:
- **Vanilla JavaScript with Web Components**: More control but loses reactivity benefits, more boilerplate
- **React**: Larger bundle size, runtime overhead unnecessary for this use case
- **Vue**: Not in project stack, would introduce new dependency

**Implementation Notes**:
- Create separate .svelte files for each major component
- Use Svelte stores for shared state (cursor position, overlay visibility)
- Leverage Svelte transitions for smooth animations

---

### 2. Shadow DOM Injection Strategy

**Decision**: Inject visual effects into Shadow DOM at top-level document using closed mode with CSS isolation.

**Rationale**:
- Prevents page CSS from interfering with visual effect styling
- Isolates effect components from page JavaScript
- Stays at page level regardless of iframe operations (per spec requirement)
- Closed mode prevents page scripts from accessing shadow root
- Chrome Extension content scripts have necessary permissions

**Alternatives Considered**:
- **Direct DOM injection**: Page styles would conflict with effect styling
- **Iframe injection**: Would require message passing, violates spec requirement to stay at page level
- **Multiple Shadow DOMs per iframe**: Over-complicated, unnecessary given page-level requirement

**Implementation Notes**:
- Create shadow root on injected container div with mode='closed'
- Bundle all styles within shadow DOM
- Use absolute positioning for overlay to cover entire viewport
- Calculate iframe element positions and convert to viewport coordinates

---

### 3. Event Communication Pattern

**Decision**: Fire-and-forget Custom Events from DomTool to VisualEffectController with no response handling.

**Rationale**:
- Async by design per FR-016 (visual effects must not block DomTool)
- CustomEvent API native to browser, no additional dependencies
- Event detail can carry element reference or bounding box
- Error isolation guaranteed - DomTool never waits for response
- Simple debugging via Chrome DevTools event monitoring

**Alternatives Considered**:
- **Promise-based API**: Would require DomTool to await responses, violates async requirement
- **Message Passing (chrome.runtime)**: Unnecessary overhead for same-context communication
- **Shared State/Store**: Creates tight coupling between DomTool and effects

**Event Types**:
```typescript
interface VisualEffectEvent {
  type: 'agent-action' | 'agent-serialize';
  action?: 'click' | 'type' | 'keypress';
  element?: Element;
  boundingBox?: DOMRect;
  timestamp: number;
}
```

**Implementation Notes**:
- DomTool dispatches events on document or custom event target
- VisualEffectController listens and queues events
- All exceptions caught and logged in effect controller
- Failed effects automatically reinitialize on next event

---

### 4. Cursor Animation Technique

**Decision**: Use CSS transforms with JavaScript RAF (requestAnimationFrame) for smooth cursor movement with easing.

**Rationale**:
- CSS transforms trigger GPU acceleration (composite layer)
- RAF syncs with browser repaint cycle (60fps target)
- Easing functions implemented via cubic-bezier timing
- Duration scales with distance (300ms-1500ms per FR-009)
- No library dependencies needed

**Alternatives Considered**:
- **CSS Transitions**: Less control over dynamic timing and queueing
- **GSAP/Animation Library**: Unnecessary dependency for simple path animation
- **Canvas Animation**: Harder to layer with HTML controls, no GPU acceleration benefit

**Implementation Notes**:
- Embed SVG pointing hand as data URI in component
- Position cursor with transform: translate3d() for GPU optimization
- Calculate Euclidean distance for duration scaling
- Queue cursor movements when actions arrive faster than animations complete
- Speed boost (50%) when queue exceeds 3 items per spec

---

### 5. Water Ripple Effect Integration

**Decision**: Integrate existing water_ripple_effect.js using WebGL canvas overlays triggered after cursor arrival.

**Rationale**:
- Pre-existing implementation using WebGL shaders (efficient)
- drop() and undulate() methods match spec requirements
- WebGL provides hardware-accelerated ripple physics
- Graceful degradation when WebGL unavailable (per FR-018)
- No need to reimplement complex water simulation

**Alternatives Considered**:
- **Reimplement with CSS animations**: Cannot achieve realistic water physics
- **SVG filters**: Performance insufficient for real-time simulation
- **Canvas 2D**: Slower than WebGL for physics calculations

**Implementation Notes**:
- WaterRipple instance manages full-screen canvas
- Coordinate conversion: element bounding box → viewport x/y → ripple coordinates
- Cursor animation completion event triggers drop(x, y, radius, strength)
- Serialize events trigger undulate() (20 staggered ripples)
- Catch WebGL initialization errors and log without crashing

---

### 6. Overlay Input Blocking

**Decision**: Full-viewport div with pointer-events and event capture on mousedown/keydown/wheel.

**Rationale**:
- Simple, reliable cross-browser technique
- pointer-events: all captures all user interactions
- Event listeners with capture=true intercept before page handlers
- preventDefault() stops event propagation
- Remove overlay on "Take Over" to restore user input

**Alternatives Considered**:
- **CSS user-select: none**: Only blocks text selection, not clicks
- **Intercepting at browser level**: Not possible from content script
- **Iframe overlay**: Would miss events from iframes on page

**Implementation Notes**:
- z-index high enough to overlay all page content (e.g., 2147483647)
- Semi-transparent background (rgba(0, 0, 0, 0.1) or similar)
- Overlay independent from ripple effect canvas (per FR-006)
- Control buttons positioned absolute within overlay at bottom-center

---

### 7. Control Button Architecture

**Decision**: Svelte button components within overlay container with direct event handlers.

**Rationale**:
- Buttons need to be interactive while overlay blocks page input
- Svelte's on:click handles events within shadow DOM
- Position: absolute with bottom-center alignment
- Direct communication to parent VisualEffectController

**Button Actions**:
- **Take Over**: Remove overlay (display: none), keep ripple effects active
- **Stop Agent**: Send stop signal, remove all effects, clean up

**Implementation Notes**:
- Buttons styled with pointer-events: auto to remain clickable
- Use CSS flexbox for horizontal centering
- "Take Over" button toggles overlay visibility state
- "Stop Agent" button calls cleanup and sends chrome.runtime message to background

---

### 8. Iframe Element Coordinate Calculation

**Decision**: Calculate screen viewport coordinates using getBoundingClientRect() with recursive iframe offset accumulation.

**Rationale**:
- getBoundingClientRect() returns position relative to viewport
- For elements in iframes, need to accumulate iframe offsets
- Works across nested iframes
- Handles scrolling and transforms automatically
- Visual effects stay at page level (per FR-022)

**Algorithm**:
```typescript
function getViewportCoordinates(element: Element): {x: number, y: number} {
  let rect = element.getBoundingClientRect();
  let x = rect.left + rect.width / 2;
  let y = rect.top + rect.height / 2;

  // If element is in iframe, add iframe offsets recursively
  let win = element.ownerDocument.defaultView;
  while (win && win.frameElement) {
    const iframeRect = win.frameElement.getBoundingClientRect();
    x += iframeRect.left;
    y += iframeRect.top;
    win = win.frameElement.ownerDocument.defaultView;
  }

  return {x, y};
}
```

**Implementation Notes**:
- VisualEffectController receives element reference in event
- Calculates coordinates just before cursor animation starts
- Handles cross-origin iframes by using bounding box if element inaccessible
- Recalculates during animation if element moves (e.g., scrolling)

---

### 9. Error Handling and Reinitialziation

**Decision**: Try-catch blocks around all effect operations with automatic reinit on next event.

**Rationale**:
- Per FR-017 and FR-018, effects must not crash or block DomTool
- Errors logged to console for debugging but silently handled
- Reinitilization attempt on next agent action ensures recovery
- Failed WebGL initialization falls back to no-ripple mode

**Error Recovery Strategy**:
```typescript
class VisualEffectController {
  private initialized = false;
  private initializationFailed = false;

  handleEvent(event: VisualEffectEvent) {
    try {
      if (!this.initialized && !this.initializationFailed) {
        this.initialize();
      }

      if (this.initialized) {
        this.processEvent(event);
      }
    } catch (error) {
      console.error('[VisualEffects] Error:', error);
      this.initializationFailed = false; // Retry on next event
    }
  }
}
```

**Implementation Notes**:
- Separate initialization errors from runtime errors
- Log stack traces for debugging
- Ripple effects optional - cursor and overlay continue if WebGL fails
- No error propagation to DomTool or page context

---

### 10. Performance Optimization

**Decision**: Debounce rapid events, use transform/opacity for animations, limit concurrent effects.

**Rationale**:
- SC-010 requires handling 5+ actions/second without blocking
- GPU-accelerated properties (transform, opacity) maintain 60fps
- Queue management prevents memory leaks from rapid events
- Cursor skip-ahead logic when queue > 3 prevents lag

**Optimization Techniques**:
- **Transform over position**: Triggers compositing layer, GPU acceleration
- **requestAnimationFrame**: Syncs with browser repaint cycle
- **Event queue**: Limit to 10 pending events, drop oldest if exceeded
- **Cursor speed boost**: 50% faster animation when queue > 3
- **Ripple pooling**: Reuse ripple effect instances rather than recreating

**Performance Budget**:
- Cursor animation: 60fps (16.67ms per frame)
- Ripple effect: 30fps acceptable (WebGL shader computation)
- Overlay render: Negligible (static div)
- Memory: <5MB for all effect state

---

## Technology Stack Summary

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| UI Framework | Svelte | 4.2.20 | Already in stack, reactive, small bundle |
| Language | TypeScript | 5.9.2 | Type safety, already in stack |
| Build Tool | Vite | 5.4.20 | Fast builds, already in stack |
| Ripple Effects | WebGL (existing) | N/A | Hardware-accelerated, pre-existing |
| Cursor SVG | Embedded Data URI | N/A | No file loading, bundled with code |
| Animation | RAF + CSS Transform | Native | GPU-accelerated, 60fps capable |
| Styling | Shadow DOM CSS | Native | Isolation from page styles |
| Communication | CustomEvent API | Native | Fire-and-forget, no dependencies |

---

## Open Questions & Risks

### Resolved
All technical unknowns from specification have been researched and decisions documented above.

### Risks & Mitigations

**Risk 1**: WebGL not supported in some browsers/contexts
**Mitigation**: Graceful degradation - effects work without ripples, log warning

**Risk 2**: Rapid agent actions (>10/sec) could queue overflow
**Mitigation**: Queue limit + speed boost + skip-ahead logic in cursor animator

**Risk 3**: Cross-origin iframe elements may be inaccessible
**Mitigation**: Use bounding box from event if element reference fails, calculate from that

**Risk 4**: Page JavaScript modifying/removing visual effect elements
**Mitigation**: Closed shadow DOM prevents external access, regenerate if removed

---

## Next Steps (Phase 1)

1. **Data Model**: Define TypeScript interfaces for events, state, configuration
2. **API Contracts**: Define DomTool event emission contract and VisualEffectController public API
3. **Quickstart**: Document how to integrate visual effects with existing DomTool
4. **Implementation**: Proceed to task generation and implementation phases
