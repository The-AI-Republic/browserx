# Data Model: DomTool Visual Effects

**Feature**: DomTool Visual Effects
**Date**: 2025-10-25
**Phase**: 1 - Design

## Overview

This document defines the data structures, types, and state models for the visual effects system that provides user feedback for AI agent DOM operations.

## Core Entities

### 1. VisualEffectEvent

Represents a signal from DomTool to the visual effects system indicating an agent action has occurred.

**Purpose**: Event payload dispatched by DomTool when agent performs actions

**Properties**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `'agent-action' \| 'agent-serialize' \| 'agent-start' \| 'agent-stop'` | Yes | Type of agent activity |
| `action` | `'click' \| 'type' \| 'keypress' \| null` | No | Specific DOM action (required if type='agent-action') |
| `element` | `Element \| null` | No | Reference to target DOM element (null if inaccessible) |
| `boundingBox` | `DOMRect \| null` | No | Element bounding box fallback when element inaccessible |
| `timestamp` | `number` | Yes | Event creation timestamp (Date.now()) |

**Validation Rules**:
- If `type === 'agent-action'`, `action` must be non-null
- At least one of `element` or `boundingBox` must be non-null for agent-action events
- If `element` provided, `boundingBox` can be calculated; if only `boundingBox`, use that

**State Transitions**: N/A (stateless event)

**Example**:
```typescript
{
  type: 'agent-action',
  action: 'click',
  element: document.getElementById('login-button'),
  boundingBox: null,
  timestamp: 1730000000000
}
```

---

### 2. CursorPosition

Represents the current and target positions of the animated cursor.

**Purpose**: Track cursor location for animation calculations

**Properties**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `x` | `number` | Yes | X coordinate in viewport pixels |
| `y` | `number` | Yes | Y coordinate in viewport pixels |
| `timestamp` | `number` | Yes | When position was set/reached |

**Validation Rules**:
- `x` and `y` must be within viewport bounds (0 to window.innerWidth/innerHeight)
- `timestamp` must be valid Date.now() timestamp

**State Transitions**:
1. **Initial**: `{ x: window.innerWidth / 2, y: window.innerHeight / 2, timestamp }` (center of screen)
2. **Moving**: Updated via requestAnimationFrame during animation
3. **Arrived**: Set to target position when animation completes

---

### 3. CursorAnimationState

Represents the state of an in-progress cursor animation.

**Purpose**: Manage cursor movement from current position to target position

**Properties**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `startPos` | `CursorPosition` | Yes | Starting position of animation |
| `targetPos` | `CursorPosition` | Yes | Target position to reach |
| `startTime` | `number` | Yes | Animation start timestamp |
| `duration` | `number` | Yes | Animation duration in milliseconds |
| `easingFunction` | `EasingFunction` | Yes | Easing function for smooth motion |
| `status` | `'pending' \| 'active' \| 'completed'` | Yes | Current animation status |

**Validation Rules**:
- `duration` must be between 300ms and 1500ms per FR-009
- `startTime` + `duration` determines completion time
- `status` transitions: pending → active → completed

**State Transitions**:
1. **Pending**: Created when event queued, not yet started
2. **Active**: Animation started, updating via RAF
3. **Completed**: Target position reached, ripple triggered

---

### 4. EffectQueue

Manages pending visual effect events to prevent overload and maintain smooth animations.

**Purpose**: Queue agent actions when they arrive faster than effects can display

**Properties**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `items` | `VisualEffectEvent[]` | Yes | Queued events waiting to process |
| `maxSize` | `number` | Yes | Maximum queue size (10) |
| `processingRate` | `number` | Yes | Events processed per second |

**Validation Rules**:
- `items.length <= maxSize` (drop oldest if exceeded)
- `processingRate` adjusts based on queue length: >3 items → 50% faster
- Events processed in FIFO order

**State Transitions**:
- **Empty**: No pending events, ready for new items
- **Normal**: 1-3 items, process at normal speed
- **Overloaded**: >3 items, process at 150% speed (50% boost)

**Methods**:
- `enqueue(event: VisualEffectEvent): void` - Add event, drop oldest if full
- `dequeue(): VisualEffectEvent | null` - Remove and return next event
- `peek(): VisualEffectEvent | null` - View next without removing
- `clear(): void` - Remove all items

---

### 5. OverlayState

Represents the visibility and interaction state of the input-blocking overlay.

**Purpose**: Track whether user input is blocked or allowed (takeover mode)

**Properties**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `visible` | `boolean` | Yes | Whether overlay is currently displayed |
| `takeoverActive` | `boolean` | Yes | Whether user has taken control |
| `agentSessionActive` | `boolean` | Yes | Whether agent session is running |

**Validation Rules**:
- If `agentSessionActive === false`, overlay should not be visible
- If `takeoverActive === true`, overlay should be hidden
- `visible === false` does not affect ripple effects (independent per FR-006)

**State Transitions**:

```
Agent Start → agentSessionActive=true, visible=true, takeoverActive=false
User Takeover → takeoverActive=true, visible=false, agentSessionActive=true
Agent Stop → agentSessionActive=false, visible=false, takeoverActive=false
```

---

### 6. RippleEffectConfig

Configuration for water ripple effect parameters.

**Purpose**: Configure ripple effect appearance and behavior

**Properties**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `radius` | `number` | Yes | Ripple radius in pixels (default: 20) |
| `strength` | `number` | Yes | Ripple intensity (0.0-1.0, default: 0.14) |
| `resolution` | `number` | Yes | WebGL texture resolution (default: 256) |
| `perturbance` | `number` | Yes | Wave perturbation factor (default: 0.03) |

**Validation Rules**:
- `radius >= 10 && radius <= 100`
- `strength >= 0.0 && strength <= 1.0`
- `resolution` must be power of 2 (128, 256, 512, etc.)
- `perturbance >= 0.0 && perturbance <= 0.1`

**Defaults**: See water_ripple_effect.js existing implementation

---

### 7. VisualEffectConfig

Global configuration for the entire visual effects system.

**Purpose**: Central configuration for initialization and behavior tuning

**Properties**:

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `enableCursorAnimation` | `boolean` | No | `true` | Enable/disable cursor animations |
| `enableRippleEffects` | `boolean` | No | `true` | Enable/disable ripple effects |
| `enableOverlay` | `boolean` | No | `true` | Enable/disable input-blocking overlay |
| `cursorMinDuration` | `number` | No | `300` | Minimum cursor animation duration (ms) |
| `cursorMaxDuration` | `number` | No | `1500` | Maximum cursor animation duration (ms) |
| `queueMaxSize` | `number` | No | `10` | Maximum event queue size |
| `queueSpeedBoostThreshold` | `number` | No | `3` | Queue size that triggers speed boost |
| `rippleConfig` | `RippleEffectConfig` | No | (defaults) | Ripple effect configuration |

**Validation Rules**:
- `cursorMinDuration < cursorMaxDuration`
- `queueMaxSize >= queueSpeedBoostThreshold`
- All duration values >= 0

---

## Type Definitions

### EasingFunction

Function signature for animation easing calculations.

```typescript
type EasingFunction = (t: number) => number;

// Where t is normalized time [0, 1], returns eased value [0, 1]
// Example: easeInOutCubic = (t) => t < 0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2
```

**Common Easing Functions**:
- `easeInOutCubic`: Smooth acceleration and deceleration
- `easeOutQuad`: Fast start, slow end
- `linear`: Constant speed (t => t)

---

### ViewportCoordinates

Represents x/y position in viewport coordinate space.

```typescript
interface ViewportCoordinates {
  x: number; // Horizontal position from left edge
  y: number; // Vertical position from top edge
}
```

---

### AgentActionType

Union type for agent DOM actions.

```typescript
type AgentActionType = 'click' | 'type' | 'keypress';
```

---

### EffectEventType

Union type for visual effect event types.

```typescript
type EffectEventType = 'agent-action' | 'agent-serialize' | 'agent-start' | 'agent-stop';
```

---

## State Management

### Component-Level State (Svelte Stores)

**cursorPosition** (writable store)
- Type: `CursorPosition`
- Purpose: Current cursor position for rendering
- Subscribers: CursorAnimator component

**overlayState** (writable store)
- Type: `OverlayState`
- Purpose: Overlay visibility and takeover mode
- Subscribers: Overlay component, ControlButtons component

**effectQueue** (writable store)
- Type: `EffectQueue`
- Purpose: Pending effect events
- Subscribers: VisualEffectController

**animationState** (writable store)
- Type: `CursorAnimationState | null`
- Purpose: Current animation progress
- Subscribers: CursorAnimator component

---

### Store Interactions

```typescript
// Example: User clicks "Take Over" button
overlayState.update(state => ({
  ...state,
  visible: false,
  takeoverActive: true
}));

// Example: New agent action event
effectQueue.update(queue => {
  queue.enqueue(event);
  return queue;
});

// Example: Cursor animation completes
cursorPosition.set(targetPos);
animationState.set(null);
// Trigger ripple effect via RippleEffectAdapter
```

---

## Relationships

```
VisualEffectEvent
  ↓ (dispatched by DomTool)
EffectQueue
  ↓ (dequeued by)
VisualEffectController
  ↓ (creates)
CursorAnimationState
  ↓ (updates)
CursorPosition
  ↓ (on completion, triggers)
RippleEffect (via water_ripple_effect.js)
```

```
OverlayState
  ↑ (controlled by)
ControlButtons component
  ↓ (Take Over → visible=false)
  ↓ (Stop Agent → agentSessionActive=false)
```

---

## Persistence

**No persistence required**. All state is ephemeral and exists only during active agent sessions.

- Overlay state resets when page reloads
- Queue clears on agent stop
- Cursor position resets to center on next session
- No storage API usage needed

---

## Error States

### InitializationError

```typescript
interface InitializationError {
  component: 'VisualEffectController' | 'RippleEffect' | 'ShadowDOM';
  error: Error;
  timestamp: number;
  canRetry: boolean;
}
```

**Handling**: Log to console, set `canRetry=true`, attempt reinitialize on next event

### RippleEffectUnavailable

Special case when WebGL not supported.

```typescript
interface RippleEffectUnavailable {
  reason: 'WebGL not supported' | 'Initialization failed';
  timestamp: number;
}
```

**Handling**: Continue with cursor animations and overlay, skip ripple effects

---

## Performance Considerations

### Memory Budget
- **EffectQueue**: Max 10 events × ~200 bytes = 2KB
- **CursorAnimationState**: ~500 bytes
- **RippleEffect**: ~2-4MB (WebGL textures and shaders)
- **Total**: <5MB for all state

### Update Frequency
- **cursorPosition**: 60 updates/second (RAF)
- **effectQueue**: Updated on event arrival (variable, ~1-5/sec typical)
- **overlayState**: Updated on user interaction (rare, ~0.1/sec)

---

## Validation Functions

```typescript
// Validate VisualEffectEvent
function isValidEffectEvent(event: any): event is VisualEffectEvent {
  if (!event.type || !['agent-action', 'agent-serialize', 'agent-start', 'agent-stop'].includes(event.type)) {
    return false;
  }

  if (event.type === 'agent-action') {
    if (!event.action || !['click', 'type', 'keypress'].includes(event.action)) {
      return false;
    }
    if (!event.element && !event.boundingBox) {
      return false;
    }
  }

  return typeof event.timestamp === 'number';
}

// Validate cursor position within viewport
function isValidCursorPosition(pos: CursorPosition): boolean {
  return (
    pos.x >= 0 && pos.x <= window.innerWidth &&
    pos.y >= 0 && pos.y <= window.innerHeight &&
    typeof pos.timestamp === 'number'
  );
}
```

---

## Next Steps

1. **API Contracts**: Define event emission contract for DomTool and public API for VisualEffectController
2. **Quickstart**: Integration guide for adding visual effects to existing DomTool
3. **Implementation**: Use these data models to generate type definitions and implement components
