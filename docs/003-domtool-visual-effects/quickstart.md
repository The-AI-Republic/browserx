# Quickstart: Integrating DomTool Visual Effects

**Feature**: DomTool Visual Effects
**Date**: 2025-10-25
**Target Audience**: Developers integrating visual effects with existing DomTool

## Overview

This guide walks through integrating the visual effects system with the existing DomTool to provide user feedback for AI agent DOM operations.

**Time to integrate**: ~30 minutes

**Prerequisites**:
- Existing DomTool implementation in `src/content/dom/DomTool.ts`
- Svelte 4.2.20 installed (already in package.json)
- TypeScript 5.9.2 (already in project)
- Content script environment (Chrome Extension)

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│               Content Script Context                │
│                                                     │
│  ┌─────────────┐           ┌─────────────────────┐ │
│  │   DomTool   │──events──▶│ VisualEffectControl││
│  │             │           │                     ││
│  │ - click()   │           │ - Overlay           ││
│  │ - type()    │           │ - Cursor Animation  ││
│  │ - serialize()│           │ - Ripple Effects    ││
│  └─────────────┘           └─────────────────────┘ │
│                                    │                │
│                                    ▼                │
│                            ┌─────────────┐          │
│                            │ Shadow DOM  │          │
│                            │ (isolated)  │          │
│                            └─────────────┘          │
└─────────────────────────────────────────────────────┘
```

## Step 1: Add Event Emission to DomTool

### 1.1: Implement Event Emitter Interface

Modify `src/content/dom/DomTool.ts` to implement event emission:

```typescript
import {
  type IDomToolEventEmitter,
  type AgentActionType,
  dispatchVisualEffectEvent,
} from '../visual-effects/contracts/domtool-events';

export class DomToolImpl implements DomTool, IDomToolEventEmitter {
  // ... existing code ...

  // Add event emitter methods
  emitAgentStart(): void {
    dispatchVisualEffectEvent({
      type: 'agent-start',
      timestamp: Date.now(),
    });
  }

  emitAgentStop(): void {
    dispatchVisualEffectEvent({
      type: 'agent-stop',
      timestamp: Date.now(),
    });
  }

  emitAgentAction(
    action: AgentActionType,
    element: Element | null,
    boundingBox: DOMRect | null
  ): void {
    dispatchVisualEffectEvent({
      type: 'agent-action',
      action,
      element,
      boundingBox,
      timestamp: Date.now(),
    });
  }

  emitAgentSerialize(): void {
    dispatchVisualEffectEvent({
      type: 'agent-serialize',
      timestamp: Date.now(),
    });
  }
}
```

### 1.2: Add Emission Calls to Action Methods

Emit events AFTER actions execute (fire-and-forget):

```typescript
async click(options: ClickOptions): Promise<ActionResult> {
  try {
    const element = this.getElementFromSnapshot(options.selector);
    const result = await executeClick(element, options);

    // Emit event AFTER click succeeds (fire-and-forget)
    this.emitAgentAction(
      'click',
      element,
      element.getBoundingClientRect()
    );

    return result;
  } catch (error) {
    return { success: false, error };
  }
}

async type(options: TypeOptions): Promise<ActionResult> {
  try {
    const element = this.getElementFromSnapshot(options.selector);
    const result = await executeType(element, options);

    // Emit event AFTER typing succeeds
    this.emitAgentAction(
      'type',
      element,
      element.getBoundingClientRect()
    );

    return result;
  } catch (error) {
    return { success: false, error };
  }
}

getSerializedDom(options?: SerializationOptions): SerializedDom {
  // Emit BEFORE serialization (async, doesn't block)
  this.emitAgentSerialize();

  // Continue with serialization
  return this.serializer.serialize(this.domSnapshot, options);
}
```

### 1.3: Add Session Lifecycle Calls

Call emit methods when agent starts/stops:

```typescript
// In your agent session management code (e.g., service-worker.ts or session manager)

function startAgentSession() {
  const domTool = new DomToolImpl();

  // Emit agent start
  domTool.emitAgentStart();

  // ... continue session ...
}

function stopAgentSession() {
  // Emit agent stop (clears all visual effects)
  domTool.emitAgentStop();

  // ... cleanup ...
}
```

## Step 2: Initialize Visual Effect Controller

### 2.1: Create Controller Instance in Content Script

In your content script entry point (e.g., `src/content/index.ts`):

```typescript
import { createVisualEffectController } from './visual-effects/VisualEffectController';

// Initialize visual effects when content script loads
let visualEffectController: IVisualEffectController | null = null;

async function initializeVisualEffects() {
  try {
    visualEffectController = createVisualEffectController(document);

    await visualEffectController.initialize({
      enableCursorAnimation: true,
      enableRippleEffects: true,
      enableOverlay: true,
      cursorMinDuration: 300,
      cursorMaxDuration: 1500,
    });

    console.log('[VisualEffects] Initialized successfully');
  } catch (error) {
    console.error('[VisualEffects] Initialization failed:', error);
    // Visual effects will auto-retry on next event
  }
}

// Initialize on content script load
initializeVisualEffects();

// Cleanup on unload
window.addEventListener('unload', () => {
  visualEffectController?.destroy();
});
```

### 2.2: Handle Page Navigation

Reinitialize effects on SPA navigation or dynamic content changes:

```typescript
// Listen for navigation events
let lastUrl = location.href;

new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;

    // Cleanup old controller
    visualEffectController?.destroy();

    // Reinitialize for new page
    initializeVisualEffects();
  }
}).observe(document, { subtree: true, childList: true });
```

## Step 3: Handle "Stop Agent" Button

### 3.1: Wire Up Stop Button to Background Script

The "Stop Agent" button in the visual effects overlay needs to communicate with your background script to terminate the agent session.

Add message handler in `src/service-worker.ts`:

```typescript
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'STOP_AGENT_SESSION') {
    // Terminate the current agent session
    stopAgentSession();

    sendResponse({ success: true });
    return true;
  }
});
```

The visual effect controller will automatically send this message when the stop button is clicked.

## Step 4: Test Integration

### 4.1: Manual Testing Checklist

1. **Agent Start**:
   - Start agent session
   - ✓ Semi-transparent overlay appears
   - ✓ User input blocked (can't click page elements)
   - ✓ Control buttons visible at bottom center

2. **Click Action**:
   - Agent clicks an element
   - ✓ Cursor animates from center to element
   - ✓ Water ripple appears at element location
   - ✓ Ripple triggers AFTER cursor arrives

3. **Serialize Action**:
   - Agent calls get_serialized_dom
   - ✓ Undulate effect (20 random ripples) appears
   - ✓ Effect fades naturally over 3.5 seconds

4. **Take Over Button**:
   - Click "Take Over" button
   - ✓ Overlay disappears
   - ✓ User can interact with page
   - ✓ Agent actions still show cursor/ripple effects

5. **Stop Agent Button**:
   - Click "Stop Agent" button
   - ✓ All effects disappear
   - ✓ Agent session terminates
   - ✓ User input fully restored

### 4.2: Automated Test Example

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createVisualEffectController } from './VisualEffectController';
import { dispatchVisualEffectEvent } from './contracts/domtool-events';

describe('Visual Effects Integration', () => {
  it('should show overlay on agent start', async () => {
    const controller = createVisualEffectController(document);
    await controller.initialize();

    dispatchVisualEffectEvent({
      type: 'agent-start',
      timestamp: Date.now(),
    });

    const state = controller.getState();
    expect(state.agentSessionActive).toBe(true);
    expect(state.overlayVisible).toBe(true);
  });

  it('should animate cursor on click action', async () => {
    const controller = createVisualEffectController(document);
    await controller.initialize();

    const element = document.createElement('button');
    element.style.position = 'absolute';
    element.style.left = '500px';
    element.style.top = '300px';
    document.body.appendChild(element);

    dispatchVisualEffectEvent({
      type: 'agent-start',
      timestamp: Date.now(),
    });

    const cursorUpdateSpy = vi.fn();
    controller.onCursorUpdate(cursorUpdateSpy);

    dispatchVisualEffectEvent({
      type: 'agent-action',
      action: 'click',
      element,
      boundingBox: element.getBoundingClientRect(),
      timestamp: Date.now(),
    });

    // Wait for animation frame
    await new Promise(resolve => requestAnimationFrame(resolve));

    expect(cursorUpdateSpy).toHaveBeenCalled();
  });
});
```

## Step 5: Iframe Handling (Advanced)

If your agent operates within iframes, visual effects stay at page level but calculate iframe element positions:

### 5.1: Provide Element Reference When Possible

```typescript
// For same-origin iframes
const iframeDoc = iframe.contentDocument;
const iframeButton = iframeDoc.getElementById('button');

domTool.emitAgentAction('click', iframeButton, null);
// Visual effects will calculate viewport coordinates automatically
```

### 5.2: Provide Bounding Box for Cross-Origin Iframes

```typescript
// For cross-origin iframes (element inaccessible)
const iframeBounds = iframe.getBoundingClientRect();
const elementBounds = { /* element bounds relative to iframe */ };

// Calculate viewport position manually
const viewportX = iframeBounds.left + elementBounds.left;
const viewportY = iframeBounds.top + elementBounds.top;

const syntheticBoundingBox = new DOMRect(
  viewportX,
  viewportY,
  elementBounds.width,
  elementBounds.height
);

domTool.emitAgentAction('click', null, syntheticBoundingBox);
```

## Troubleshooting

### Problem: Visual effects don't appear

**Solution**:
1. Check browser console for initialization errors
2. Verify `createVisualEffectController()` was called
3. Ensure `initialize()` completed successfully
4. Check that events are being dispatched: `console.log` in `emitAgentAction`

### Problem: Cursor doesn't animate to correct position

**Solution**:
1. Verify element or boundingBox is provided in event
2. Check element is visible and within viewport
3. Ensure coordinates are in viewport space, not document space
4. For iframes, verify offset calculation is correct

### Problem: Ripple effects don't work

**Solution**:
1. Check WebGL support: `!!document.createElement('canvas').getContext('webgl')`
2. Look for initialization warnings in console
3. Verify water_ripple_effect.js is loaded
4. Effects gracefully degrade - cursor still works without ripples

### Problem: Overlay blocks visual effect buttons

**Solution**:
- Buttons should have `pointer-events: auto` in Shadow DOM CSS
- Verify buttons are rendered inside Shadow DOM overlay
- Check z-index of buttons > overlay

### Problem: Effects lag with rapid actions

**Solution**:
- Queue automatically speeds up (50% faster) when >3 events queued
- Verify queue isn't dropping events (check max size)
- Monitor performance with: `controller.getState().queuedEventCount`

## Performance Tips

1. **Minimize Event Frequency**: Only emit on significant actions, not intermediate states
2. **Batch Operations**: Group rapid actions if possible before emitting
3. **Monitor Queue**: Watch `queuedEventCount` - sustained high values indicate overload
4. **Disable Ripples on Low-End Devices**: Check GPU tier and disable ripples if necessary

## Advanced Configuration

### Custom Ripple Appearance

```typescript
visualEffectController.initialize({
  rippleConfig: {
    radius: 30,           // Larger ripples
    strength: 0.2,        // More intense
    resolution: 512,      // Higher quality (more GPU load)
    perturbance: 0.05,    // More distortion
  },
});
```

### Custom Cursor Duration

```typescript
visualEffectController.initialize({
  cursorMinDuration: 200,  // Faster minimum
  cursorMaxDuration: 1000, // Faster maximum
});
```

### Disable Specific Effects

```typescript
visualEffectController.initialize({
  enableCursorAnimation: true,
  enableRippleEffects: false,  // Disable ripples only
  enableOverlay: true,
});
```

## Next Steps

1. **Implement Components**: See `tasks.md` (generated by `/speckit.tasks`)
2. **Run Tests**: `npm test` to verify integration
3. **Build Extension**: `npm run build` to compile with effects
4. **Load in Chrome**: Test in live extension environment

## Support

For issues or questions:
- Check `research.md` for technical decisions
- Review `data-model.md` for state structures
- Examine `contracts/` for API definitions
- See spec.md for requirements and success criteria
