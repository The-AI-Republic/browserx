<script lang="ts">
  /**
   * Visual Effect Controller
   *
   * Main orchestrator for all visual effects during agent operations.
   * Listens for DomTool events and coordinates cursor animation, ripple effects, and overlay.
   *
   * Architecture:
   * - Fire-and-forget event-driven (no blocking)
   * - Complete error isolation from DomTool
   * - Shadow DOM injection for style isolation
   * - Graceful WebGL degradation
   *
   * @component
   */

  import { onMount, onDestroy } from 'svelte';
  import Overlay from './Overlay.svelte';
  import CursorAnimator from './CursorAnimator.svelte';
  import {
    overlayState,
    effectQueue,
    visualEffectState,
    resetStores,
    syncVisualEffectState,
  } from './stores';
  import {
    isVisualEffectEvent,
    VISUAL_EFFECT_EVENT_NAME,
    type VisualEffectEvent,
    type AgentActionEvent,
  } from './contracts/domtool-events';
  import {
    getViewportCoordinates,
    getViewportCoordinatesFromRect,
  } from './utils/coordinateCalculator';
  import type {
    VisualEffectConfig,
    VisualEffectState,
    StateChangeCallback,
    CursorUpdateCallback,
    ErrorCallback,
  } from './contracts/visual-effect-controller';
  import { DEFAULT_CONFIG } from './contracts/visual-effect-controller';

  // Component refs
  let cursorAnimatorRef: any = null;

  // Water ripple effect instance
  let waterRipple: any = null;

  // Configuration
  let config: VisualEffectConfig = { ...DEFAULT_CONFIG };

  // Callback subscriptions
  const stateChangeCallbacks: StateChangeCallback[] = [];
  const cursorUpdateCallbacks: CursorUpdateCallback[] = [];
  const errorCallbacks: ErrorCallback[] = [];

  // Event listener cleanup
  let eventListenerCleanup: (() => void) | null = null;
  let storeCleanup: (() => void) | null = null;

  onMount(async () => {
    try {
      // Sync stores
      storeCleanup = syncVisualEffectState();

      // Listen for visual effect events
      setupEventListeners();

      // Initialize water ripple effect
      if (config.enableRippleEffects) {
        await initializeWaterRipple();
      }

      // Add viewport resize handler (T039)
      window.addEventListener('resize', handleViewportResize);
    } catch (error) {
      handleError('Initialization error', error);
    }
  });

  onDestroy(() => {
    // Remove viewport resize handler
    window.removeEventListener('resize', handleViewportResize);

    // Clean up event listeners
    if (eventListenerCleanup) {
      eventListenerCleanup();
    }

    // Clean up store sync
    if (storeCleanup) {
      storeCleanup();
    }

    // Destroy water ripple
    if (waterRipple) {
      try {
        waterRipple.destroy();
      } catch (error) {
        console.debug('[VisualEffectController] Error destroying water ripple:', error);
      }
      waterRipple = null;
    }

    // Reset stores
    resetStores();
  });

  /**
   * Initialize water ripple effect
   *
   * Loads WaterRipple class and instantiates with configuration.
   * Gracefully degrades if WebGL is not supported.
   */
  async function initializeWaterRipple() {
    try {
      // Dynamically import water ripple effect
      const { default: WaterRipple } = await import('./water_ripple_effect.js');

      waterRipple = new WaterRipple({
        resolution: config.rippleConfig?.resolution ?? 256,
        dropRadius: config.rippleConfig?.radius ?? 20,
        perturbance: config.rippleConfig?.perturbance ?? 0.03,
      });

      console.debug('[VisualEffectController] Water ripple effect initialized');
    } catch (error) {
      console.warn('[VisualEffectController] Failed to initialize water ripple (WebGL may not be supported):', error);
      // Graceful degradation - effects continue without ripples
    }
  }

  /**
   * Setup event listeners for DomTool events
   */
  function setupEventListeners() {
    // Listen for visual effect events from DomTool
    const visualEffectHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      const effectEvent = customEvent.detail?.event;

      if (!isVisualEffectEvent(effectEvent)) {
        return;
      }

      handleVisualEffectEvent(effectEvent);
    };

    document.addEventListener(VISUAL_EFFECT_EVENT_NAME, visualEffectHandler);

    // Listen for ripple trigger events from cursor animator
    const rippleHandler = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { x, y } = customEvent.detail;

      if (waterRipple && config.enableRippleEffects) {
        try {
          waterRipple.drop(
            x,
            y,
            config.rippleConfig?.radius ?? 20,
            config.rippleConfig?.strength ?? 0.5
          );
        } catch (error) {
          handleError('Ripple effect error', error);
        }
      }
    };

    document.addEventListener('browserx:trigger-ripple', rippleHandler);

    // Listen for stop agent events from control buttons
    const stopAgentHandler = () => {
      handleStopAgentButton();
    };

    document.addEventListener('browserx:stop-agent', stopAgentHandler);

    // Cleanup function
    eventListenerCleanup = () => {
      document.removeEventListener(VISUAL_EFFECT_EVENT_NAME, visualEffectHandler);
      document.removeEventListener('browserx:trigger-ripple', rippleHandler);
      document.removeEventListener('browserx:stop-agent', stopAgentHandler);
    };
  }

  /**
   * Handle visual effect event from DomTool
   *
   * Routes event to appropriate handler based on type.
   * All errors are caught and logged (fire-and-forget).
   */
  function handleVisualEffectEvent(event: VisualEffectEvent) {
    try {
      switch (event.type) {
        case 'agent-start':
          handleAgentStart();
          break;

        case 'agent-stop':
          handleAgentStop();
          break;

        case 'agent-action':
          handleAgentAction(event as AgentActionEvent);
          break;

        case 'agent-serialize':
          handleAgentSerialize();
          break;

        default:
          console.warn('[VisualEffectController] Unknown event type:', (event as any).type);
      }
    } catch (error) {
      handleError('Event handling error', error);
    }
  }

  /**
   * Handle agent start event
   *
   * Shows overlay and initializes cursor position.
   */
  function handleAgentStart() {
    overlayState.update(state => ({
      ...state,
      visible: true,
      agentSessionActive: true,
      takeoverActive: false,
    }));

    notifyStateChange();
  }

  /**
   * Handle agent stop event
   *
   * Hides overlay and resets state.
   */
  function handleAgentStop() {
    overlayState.update(state => ({
      ...state,
      visible: false,
      agentSessionActive: false,
    }));

    resetStores();
    notifyStateChange();
  }

  /**
   * Handle agent action event (click, type, keypress)
   *
   * Enqueues event and triggers cursor animation.
   */
  function handleAgentAction(event: AgentActionEvent) {
    // Calculate viewport coordinates
    let x: number;
    let y: number;

    if (event.element) {
      const coords = getViewportCoordinates(event.element);
      if (!coords) {
        console.warn('[VisualEffectController] Failed to calculate coordinates for element');
        return;
      }
      x = coords.x;
      y = coords.y;
    } else if (event.boundingBox) {
      const coords = getViewportCoordinatesFromRect(event.boundingBox);
      x = coords.x;
      y = coords.y;
    } else {
      console.warn('[VisualEffectController] No element or bounding box provided');
      return;
    }

    // Enqueue event
    let queue: any;
    const unsubscribe = effectQueue.subscribe(q => {
      queue = q;
    });
    unsubscribe();

    queue.enqueue(event);

    // Trigger cursor animation
    if (cursorAnimatorRef && config.enableCursorAnimation) {
      const status = queue.getStatus();

      // Skip animation if queue is very deep (>10 events)
      if (status.size > 10) {
        cursorAnimatorRef.skipTo(x, y);
      } else {
        cursorAnimatorRef.animateTo(x, y);
      }
    }
  }

  /**
   * Handle agent serialize event (DOM analysis)
   *
   * Triggers undulate effect for 3.5 seconds.
   */
  function handleAgentSerialize() {
    if (waterRipple && config.enableRippleEffects) {
      try {
        waterRipple.undulate();
      } catch (error) {
        handleError('Undulate effect error', error);
      }
    }
  }

  /**
   * Stop agent session (internal handler)
   *
   * Sends message to service worker to terminate agent.
   */
  function handleStopAgentButton() {
    try {
      chrome.runtime.sendMessage({ type: 'STOP_AGENT_SESSION' });
    } catch (error) {
      handleError('Stop agent session error', error);
    }

    handleAgentStop();
  }

  /**
   * Handle viewport resize (T039)
   *
   * Recalculates coordinate system for ongoing animations.
   * Water ripple canvas will automatically resize via its own resize handler.
   */
  function handleViewportResize() {
    // Cancel ongoing animations since coordinates may be invalid
    if (cursorAnimatorRef) {
      let state: any;
      const unsubscribe = animationState.subscribe(s => {
        state = s;
      });
      unsubscribe();

      if (state.isAnimating) {
        // Skip to target position to avoid animation to wrong coordinates
        if (state.targetPosition) {
          cursorAnimatorRef.skipTo(state.targetPosition.x, state.targetPosition.y);
        }
      }
    }

    // Water ripple effect handles its own canvas resize
    console.debug('[VisualEffectController] Viewport resized, animations adjusted');
  }

  /**
   * Handle error
   *
   * Logs error and notifies error callbacks.
   * Errors never propagate to DomTool.
   */
  function handleError(context: string, error: any) {
    const errorMessage = `[VisualEffectController] ${context}: ${error?.message ?? error}`;
    console.error(errorMessage, error);

    // Update state with error
    visualEffectState.update(state => ({
      ...state,
      lastError: errorMessage,
    }));

    // Notify error callbacks
    errorCallbacks.forEach(callback => {
      try {
        callback(new Error(errorMessage));
      } catch (cbError) {
        console.error('[VisualEffectController] Error in error callback:', cbError);
      }
    });
  }

  /**
   * Notify state change callbacks
   */
  function notifyStateChange() {
    let state: VisualEffectState;
    const unsubscribe = visualEffectState.subscribe(s => {
      state = s;
    });
    unsubscribe();

    stateChangeCallbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('[VisualEffectController] Error in state change callback:', error);
      }
    });
  }

  // Public API exports (for imperative usage)
  export function initialize(userConfig?: VisualEffectConfig): Promise<void> {
    config = { ...DEFAULT_CONFIG, ...userConfig };
    return Promise.resolve();
  }

  export function destroy(): void {
    // Handled by onDestroy
  }

  export function getState(): Readonly<VisualEffectState> {
    let state: VisualEffectState;
    const unsubscribe = visualEffectState.subscribe(s => {
      state = s;
    });
    unsubscribe();
    return state;
  }

  export function startAgentSession(): void {
    handleAgentStart();
  }

  export function stopAgentSession(): void {
    handleAgentStop();
  }

  export function takeOver(): void {
    overlayState.update(state => ({
      ...state,
      visible: false,
      takeoverActive: true,
    }));
    notifyStateChange();
  }

  export function animateAction(action: string, x: number, y: number): void {
    if (cursorAnimatorRef && config.enableCursorAnimation) {
      cursorAnimatorRef.animateTo(x, y);
    }
  }

  export function undulate(): void {
    handleAgentSerialize();
  }

  export function onStateChange(callback: StateChangeCallback): () => void {
    stateChangeCallbacks.push(callback);
    return () => {
      const index = stateChangeCallbacks.indexOf(callback);
      if (index > -1) {
        stateChangeCallbacks.splice(index, 1);
      }
    };
  }

  export function onCursorUpdate(callback: CursorUpdateCallback): () => void {
    cursorUpdateCallbacks.push(callback);
    return () => {
      const index = cursorUpdateCallbacks.indexOf(callback);
      if (index > -1) {
        cursorUpdateCallbacks.splice(index, 1);
      }
    };
  }

  export function onError(callback: ErrorCallback): () => void {
    errorCallbacks.push(callback);
    return () => {
      const index = errorCallbacks.indexOf(callback);
      if (index > -1) {
        errorCallbacks.splice(index, 1);
      }
    };
  }
</script>

<div class="visual-effect-controller" data-testid="visual-effect-controller">
  <Overlay />
  <CursorAnimator bind:this={cursorAnimatorRef} />
</div>

<style>
  .visual-effect-controller {
    /* Container for all visual effects */
    position: fixed;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
    pointer-events: none;
    z-index: 2147483647;
  }
</style>
