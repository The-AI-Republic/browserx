<script lang="ts">
  import { onMount } from 'svelte';
  import { MessageRouter, MessageType } from '../core/MessageRouter';
  import type { Event } from '../protocol/types';
  import type { EventMsg } from '../protocol/events';
  import type { ProcessedEvent } from '../types/ui';
  import TerminalContainer from './components/TerminalContainer.svelte';
  import TerminalMessage from './components/TerminalMessage.svelte';
  import TerminalInput from './components/TerminalInput.svelte';
  import Settings from './Settings.svelte';
  import EventDisplay from './components/event_display/EventDisplay.svelte';
  import { EventProcessor } from './components/event_display/EventProcessor';

  let router: MessageRouter;
  let eventProcessor: EventProcessor;
  let messages: Array<{ type: 'user' | 'agent'; content: string; timestamp: number }> = [];
  let processedEvents: ProcessedEvent[] = [];
  let inputText = '';
  let isConnected = false;
  let isProcessing = false;
  let showSettings = false;
  let showTooltip = false;
  let scrollContainer: HTMLDivElement;

  onMount(async () => {
    // Clear messages from previous session
    messages = [];
    processedEvents = [];

    // Initialize EventProcessor
    eventProcessor = new EventProcessor();

    // Initialize router
    router = new MessageRouter('sidepanel');

    // Request session reset when side panel opens
    try {
      await router.requestSessionReset();
      console.log('Session reset on side panel open');
    } catch (error) {
      console.error('Failed to reset session:', error);
    }

    // Setup event handlers
    router.on(MessageType.EVENT, (message) => {
      const event = message.payload as Event;
      handleEvent(event);
    });

    router.on(MessageType.STATE_UPDATE, (message) => {
      console.log('State update:', message.payload);
    });

    // Check connection
    checkConnection();

    // Periodic connection check
    const interval = setInterval(checkConnection, 5000);

    return () => {
      clearInterval(interval);
      router?.cleanup();
    };
  });

  async function checkConnection() {
    try {
      const response = await router?.send(MessageType.PING);
      isConnected = response?.type === MessageType.PONG;
    } catch {
      isConnected = false;
    }
  }

  function handleEvent(event: Event) {
    const msg = event.msg;

    // Process event through EventProcessor
    const processed = eventProcessor.processEvent(event);

    if (processed) {
      processedEvents = [...processedEvents, processed];

      // Auto-scroll to bottom if user is at bottom
      if (scrollContainer) {
        const isAtBottom =
          scrollContainer.scrollHeight - scrollContainer.scrollTop <=
          scrollContainer.clientHeight + 100;

        if (isAtBottom) {
          setTimeout(() => {
            scrollContainer.scrollTo({
              top: scrollContainer.scrollHeight,
              behavior: 'smooth'
            });
          }, 100);
        }
      }
    }

    // Update processing state
    if (msg.type === 'TaskStarted') {
      isProcessing = true;
      // Clear history on new task
      processedEvents = [];
      eventProcessor.reset();
    } else if (msg.type === 'TaskComplete' || msg.type === 'TaskFailed') {
      isProcessing = false;
    }

    // Keep legacy Error message handling for backward compatibility
    // Note: AgentMessage case removed - agent messages are now handled by EventProcessor
    switch (msg.type) {
      case 'Error':
        if ('data' in msg && msg.data && 'message' in msg.data) {
          messages = [...messages, {
            type: 'agent',
            content: `Error: ${msg.data.message}`,
            timestamp: Date.now(),
          }];
        }
        break;
    }
  }

  async function sendMessage() {
    if (!inputText.trim() || !isConnected) return;

    const text = inputText.trim();
    inputText = '';

    // Add user message
    messages = [...messages, {
      type: 'user',
      content: text,
      timestamp: Date.now(),
    }];

    // Send to agent
    try {
      await router.sendSubmission({
        id: `user_${Date.now()}`,
        op: {
          type: 'UserInput',
          items: [{ type: 'text', text }],
        },
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      messages = [...messages, {
        type: 'agent',
        content: 'Failed to send message. Please try again.',
        timestamp: Date.now(),
      }];
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function getMessageType(message: { type: 'user' | 'agent'; content: string }): 'default' | 'warning' | 'error' | 'input' | 'system' {
    if (message.type === 'user') return 'input';
    if (message.content.toLowerCase().startsWith('error:')) return 'error';
    if (message.content.toLowerCase().includes('warning')) return 'warning';
    if (message.content.toLowerCase().includes('system')) return 'system';
    return 'default';
  }

  function toggleSettings() {
    showSettings = !showSettings;
  }

  function handleSettingsClose() {
    showSettings = false;
  }

  function handleAuthUpdated(event: CustomEvent) {
    // Handle auth updates if needed
    console.log('Auth updated:', event.detail);
  }
</script>

<TerminalContainer>
  <!-- Status Line -->
  <div class="flex justify-between mb-2">
    <TerminalMessage type="system" content="Codex For Chrome v1.0.0 (By AI Republic)" />
    <div class="flex items-center space-x-2">
      {#if isProcessing}
        <TerminalMessage type="warning" content="[PROCESSING]" />
      {/if}
      <TerminalMessage
        type={isConnected ? 'system' : 'error'}
        content={isConnected ? '[CONNECTED]' : '[DISCONNECTED]'}
      />
    </div>
  </div>

  <!-- Messages -->
  <div class="flex-1 overflow-y-auto mb-4 space-y-2" bind:this={scrollContainer}>
    {#if processedEvents.length === 0 && messages.length === 0}
      <TerminalMessage type="system" content="Welcome to Codex Terminal" />
      <TerminalMessage type="default" content="Ready for input. Type a command to begin..." />
    {/if}

    {#each messages as message (message.timestamp)}
      <TerminalMessage type={message.type === 'user' ? 'input' : getMessageType(message)} content={message.content} />
    {/each}

    {#each processedEvents as event (event.id)}
      <EventDisplay {event} />
    {/each}
  </div>

  <!-- Input -->
  <div class="terminal-prompt flex items-center">
    <span class="text-term-dim-green mr-2">&gt;</span>
    <TerminalInput
      bind:value={inputText}
      onSubmit={sendMessage}
      placeholder="Enter command..."
    />
  </div>

  <!-- Settings Gear Icon -->
  <div class="fixed bottom-4 right-4">
    <button
      class="settings-button p-2 rounded-full bg-term-bg-dark border border-term-border hover:bg-term-bg-hover transition-colors relative"
      on:click={toggleSettings}
      on:mouseenter={() => showTooltip = true}
      on:mouseleave={() => showTooltip = false}
      aria-label="Settings"
    >
      <!-- Gear Icon SVG -->
      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-term-dim-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>

      <!-- Tooltip -->
      {#if showTooltip}
        <div class="tooltip absolute bottom-full mb-2 right-0 px-2 py-1 bg-term-bg-dark border border-term-border rounded text-xs text-term-dim-green whitespace-nowrap">
          setting
        </div>
      {/if}
    </button>
  </div>
</TerminalContainer>

<!-- Settings Modal -->
{#if showSettings}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
    <div class="bg-term-bg-dark border border-term-border rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
      <Settings
        on:authUpdated={handleAuthUpdated}
        on:close={handleSettingsClose}
      />
    </div>
  </div>
{/if}

<style>
  /* Component-specific styles */

  .settings-button {
    z-index: 40;
    transition: all 0.2s ease;
  }

  .settings-button:hover {
    transform: rotate(30deg);
  }

  .tooltip {
    animation: fadeIn 0.2s ease;
    z-index: 50;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>