<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  /**
   * TabContext Component
   *
   * Displays the current tab title for the session with:
   * - 25-character truncation with ellipsis
   * - Full title on hover tooltip
   * - "No tab attached" state for tabId = -1
   * - Real-time updates when tab title changes
   * - Graceful handling of missing/empty titles
   */

  export let tabId: number = -1;

  let tabTitle: string = '';
  let fullTitle: string = '';
  let displayTitle: string = '';
  let isLoading: boolean = false;
  let error: string | null = null;

  // Tab update listener reference for cleanup
  let tabUpdateListener: ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab) => void) | null = null;

  // Reactive statement: fetch tab when tabId changes
  $: {
    if (tabId !== -1) {
      fetchTabTitle(tabId);
    } else {
      tabTitle = 'No tab attached';
      fullTitle = 'No tab attached';
      displayTitle = 'No tab attached';
      error = null;
    }
  }

  /**
   * Fetch tab title from Chrome API
   */
  async function fetchTabTitle(id: number): Promise<void> {
    if (id === -1) return;

    isLoading = true;
    error = null;

    try {
      const tab = await chrome.tabs.get(id);
      updateTitle(tab);
    } catch (err) {
      console.error(`[TabContext] Failed to fetch tab ${id}:`, err);
      error = 'Tab unavailable';
      tabTitle = 'Tab unavailable';
      fullTitle = 'Tab unavailable';
      displayTitle = 'Tab unavailable';
    } finally {
      isLoading = false;
    }
  }

  /**
   * Update title from tab object
   */
  function updateTitle(tab: chrome.tabs.Tab): void {
    let title: string;

    // Handle missing or empty title
    if (!tab.title || tab.title.trim() === '') {
      if (tab.url) {
        // Extract hostname or use full URL
        try {
          const url = new URL(tab.url);
          title = url.hostname || tab.url;
        } catch {
          title = 'Untitled';
        }
      } else {
        title = 'Untitled';
      }
    } else {
      title = tab.title;
    }

    fullTitle = title;
    tabTitle = title;

    // Truncate to 25 characters with ellipsis
    if (title.length > 25) {
      displayTitle = title.substring(0, 25) + '...';
    } else {
      displayTitle = title;
    }
  }

  /**
   * Handle tab updates
   */
  function handleTabUpdate(updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo, tab: chrome.tabs.Tab): void {
    // Only update if it's our tab and title changed
    if (updatedTabId === tabId && changeInfo.title !== undefined) {
      updateTitle(tab);
    }
  }

  /**
   * Setup tab update listener
   */
  onMount(() => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
      tabUpdateListener = handleTabUpdate;
      chrome.tabs.onUpdated.addListener(tabUpdateListener);
    }
  });

  /**
   * Cleanup tab update listener
   */
  onDestroy(() => {
    if (tabUpdateListener && typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.onUpdated) {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
    }
  });
</script>

<div
  class="tab-context"
  title={fullTitle}
  data-testid="tab-context-display"
  aria-label="Current tab context"
>
  {#if isLoading}
    <span class="tab-context-loading">Loading...</span>
  {:else if error}
    <span class="tab-context-error">{error}</span>
  {:else}
    <span class="tab-context-title">{displayTitle}</span>
  {/if}
</div>

<style>
  .tab-context {
    display: inline-block;
    max-width: 300px;
    padding: 4px 8px;
    font-size: 12px;
    font-family: 'Courier New', monospace;
    color: var(--color-term-dim-green, #00cc00);
    background-color: var(--color-term-black, #000000);
    border: 1px solid var(--color-term-dim-green, #00cc00);
    border-radius: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: default;
  }

  .tab-context-title {
    display: inline-block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tab-context-loading {
    color: var(--color-term-dim-yellow, #cccc00);
    font-style: italic;
  }

  .tab-context-error {
    color: var(--color-term-dim-red, #cc0000);
  }

  .tab-context:hover {
    border-color: var(--color-term-green, #00ff00);
  }
</style>
