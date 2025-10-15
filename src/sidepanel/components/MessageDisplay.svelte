<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import type { UIUpdate } from '../../core/StreamProcessor';

  export let message: {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    streaming?: boolean;
  };

  let content = message.content || '';
  let isStreaming = message.streaming || false;
  let streamBuffer = '';
  let updateTimer: number | null = null;

  function handleStreamUpdate(event: CustomEvent<UIUpdate>) {
    const update = event.detail;

    if (update.type === 'append') {
      streamBuffer += update.content;
    } else if (update.type === 'replace') {
      streamBuffer = update.content;
    } else if (update.type === 'clear') {
      streamBuffer = '';
      content = '';
    }

    // Batch UI updates for performance
    if (!updateTimer) {
      updateTimer = window.setTimeout(() => {
        content = streamBuffer;
        updateTimer = null;
      }, 50); // Update UI every 50ms max
    }

    isStreaming = true;
  }

  function handleStreamComplete(event: CustomEvent) {
    isStreaming = false;

    // Flush any remaining buffer
    if (updateTimer) {
      clearTimeout(updateTimer);
      updateTimer = null;
    }
    content = streamBuffer || content;
  }

  function handleStreamError(event: CustomEvent<{ error: string }>) {
    isStreaming = false;
    console.error('Stream error:', event.detail.error);

    // Add error indicator to content
    content += '\n\n[Error: Stream interrupted]';
  }

  onMount(() => {
    // Listen for stream events if this is a streaming message
    if (message.streaming) {
      window.addEventListener('stream-update', handleStreamUpdate as EventListener);
      window.addEventListener('stream-complete', handleStreamComplete as EventListener);
      window.addEventListener('stream-error', handleStreamError as EventListener);
    }
  });

  onDestroy(() => {
    // Cleanup event listeners
    if (message.streaming) {
      window.removeEventListener('stream-update', handleStreamUpdate as EventListener);
      window.removeEventListener('stream-complete', handleStreamComplete as EventListener);
      window.removeEventListener('stream-error', handleStreamError as EventListener);
    }

    // Clear any pending timer
    if (updateTimer) {
      clearTimeout(updateTimer);
    }
  });

  // Format timestamp
  function formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Parse content for code blocks and markdown
  function parseContent(text: string): string {
    // Simple markdown parsing - in production, use a proper markdown parser
    let parsed = text;

    // Code blocks
    parsed = parsed.replace(
      /```(\w+)?\n([\s\S]*?)```/g,
      '<pre><code class="language-$1">$2</code></pre>'
    );

    // Inline code
    parsed = parsed.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Bold
    parsed = parsed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Italic
    parsed = parsed.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Links
    parsed = parsed.replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );

    // Line breaks
    parsed = parsed.replace(/\n/g, '<br>');

    return parsed;
  }
</script>

<div class="message message-{message.role}" class:streaming={isStreaming}>
  <div class="message-header">
    <span class="role">
      {#if message.role === 'user'}
        You
      {:else if message.role === 'assistant'}
        Codex
      {:else}
        System
      {/if}
    </span>
    {#if message.timestamp}
      <span class="timestamp">{formatTime(message.timestamp)}</span>
    {/if}
  </div>

  <div class="message-content">
    {#if isStreaming}
      <div class="content-text">
        {@html parseContent(content)}
        <span class="cursor-blink">▊</span>
      </div>
    {:else}
      <div class="content-text">
        {@html parseContent(content)}
      </div>
    {/if}
  </div>

  {#if isStreaming}
    <div class="streaming-indicator">
      <span class="dot"></span>
      <span class="dot"></span>
      <span class="dot"></span>
    </div>
  {/if}
</div>

<style>
  .message {
    padding: 12px 16px;
    margin: 8px 0;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .message-user {
    background: #e3f2fd;
    margin-left: 20px;
  }

  .message-assistant {
    background: #f5f5f5;
    margin-right: 20px;
  }

  .message-system {
    background: #fff3e0;
    font-size: 0.9em;
    opacity: 0.8;
  }

  .message.streaming {
    background: linear-gradient(
      90deg,
      var(--bg-color) 0%,
      rgba(66, 165, 245, 0.1) 50%,
      var(--bg-color) 100%
    );
    background-size: 200% 100%;
    animation: streaming-bg 2s ease-in-out infinite;
  }

  @keyframes streaming-bg {
    0% {
      background-position: 200% 0;
    }
    100% {
      background-position: -200% 0;
    }
  }

  .message-header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
    font-size: 0.85em;
  }

  .role {
    font-weight: 600;
    color: #666;
  }

  .timestamp {
    color: #999;
  }

  .message-content {
    line-height: 1.5;
  }

  .content-text {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .content-text code {
    background: rgba(0, 0, 0, 0.05);
    padding: 2px 4px;
    border-radius: 3px;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.9em;
  }

  .content-text pre {
    background: #282c34;
    color: #abb2bf;
    padding: 12px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 8px 0;
  }

  .content-text pre code {
    background: transparent;
    padding: 0;
    color: inherit;
  }

  .content-text strong {
    font-weight: 600;
  }

  .content-text em {
    font-style: italic;
  }

  .content-text a {
    color: #2196f3;
    text-decoration: none;
  }

  .content-text a:hover {
    text-decoration: underline;
  }

  .cursor-blink {
    animation: blink 1s infinite;
    color: #2196f3;
    font-weight: normal;
  }

  @keyframes blink {
    0%, 50% {
      opacity: 1;
    }
    51%, 100% {
      opacity: 0;
    }
  }

  .streaming-indicator {
    display: flex;
    gap: 4px;
    margin-top: 8px;
  }

  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #2196f3;
    animation: pulse 1.5s ease-in-out infinite;
  }

  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }

  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }

  @keyframes pulse {
    0%, 60%, 100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    30% {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .message-user {
      background: #1e3a5f;
      color: #e0e0e0;
    }

    .message-assistant {
      background: #2c2c2c;
      color: #e0e0e0;
    }

    .message-system {
      background: #3e2723;
      color: #ffccbc;
    }

    .content-text code {
      background: rgba(255, 255, 255, 0.1);
    }

    .role {
      color: #aaa;
    }

    .timestamp {
      color: #777;
    }
  }
</style>