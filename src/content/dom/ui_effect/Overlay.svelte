<script lang="ts">
  /**
   * Overlay Component
   *
   * Semi-transparent overlay that blocks user input during agent operations.
   * Independent from ripple effects - visibility controlled separately.
   *
   * Features:
   * - Full viewport coverage with pointer-events blocking
   * - Semi-transparent dark background (rgba(0, 0, 0, 0.3))
   * - Hosts control buttons at bottom-center
   * - Removed when user takes over control
   *
   * @component
   */

  import { overlayState } from './stores';
  import ControlButtons from './ControlButtons.svelte';

  // Subscribe to overlay state
  let visible = false;
  let takeoverActive = false;

  overlayState.subscribe(state => {
    visible = state.visible;
    takeoverActive = state.takeoverActive;
  });

  // Handle takeover action from control buttons
  function handleTakeOver() {
    overlayState.update(state => ({
      ...state,
      visible: false,
      takeoverActive: true,
    }));
  }

  // Handle stop agent action from control buttons
  function handleStopAgent() {
    overlayState.update(state => ({
      ...state,
      visible: false,
      agentSessionActive: false,
    }));

    // Dispatch custom event to notify controller to stop agent session
    const event = new CustomEvent('browserx:stop-agent', {
      bubbles: true,
      composed: true, // Cross shadow DOM boundary
    });
    document.dispatchEvent(event);
  }
</script>

{#if visible && !takeoverActive}
  <div class="overlay" data-testid="visual-effect-overlay">
    <ControlButtons
      on:takeover={handleTakeOver}
      on:stopagent={handleStopAgent}
    />
  </div>
{/if}

<style>
  .overlay {
    /* Position and size */
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 2147483646; /* Just below cursor (max is 2147483647) */

    /* Visual appearance */
    background-color: rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(2px);

    /* Input blocking */
    pointer-events: all;

    /* Performance */
    will-change: opacity;
    transition: opacity 200ms ease-out;

    /* Layout for control buttons */
    display: flex;
    align-items: flex-end; /* Bottom alignment */
    justify-content: center; /* Horizontal center */
    padding-bottom: 32px; /* Spacing from bottom */
  }

  /* Fade in animation */
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .overlay {
    animation: fadeIn 200ms ease-out;
  }
</style>
