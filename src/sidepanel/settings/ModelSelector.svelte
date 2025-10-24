<script lang="ts">
  /**
   * T022, T023: ModelSelector component for multi-provider system
   * Displays models grouped by provider with "[Model Name] - [Provider Name]" format
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { AgentConfig } from '../../config/AgentConfig';
  import type { IModelConfig, ConfiguredFeatures } from '../../config/types';
  import ModelOption from './ModelOption.svelte';

  export let selectedModel: string;
  export let configuredFeatures: ConfiguredFeatures;
  export let disabled = false;

  const dispatch = createEventDispatcher();

  let isOpen = false;
  let availableModels: Array<{ model: IModelConfig; providerId: string; providerName: string }> = [];
  let focusedIndex = -1;
  let selectorRef: HTMLDivElement;
  let agentConfig: AgentConfig | null = null;

  onMount(async () => {
    agentConfig = AgentConfig.getInstance();
    await agentConfig.initialize();
    availableModels = agentConfig.getAllModels();
  });

  function toggleDropdown() {
    if (disabled) return;
    isOpen = !isOpen;
    if (isOpen) {
      focusedIndex = availableModels.findIndex(m => m.model.id === selectedModel);
    }
  }

  function selectModel(modelId: string) {
    if (disabled) return;

    // Dispatch model change event
    dispatch('modelChange', { modelId });
    isOpen = false;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (disabled) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!isOpen) {
          isOpen = true;
          focusedIndex = availableModels.findIndex(m => m.model.id === selectedModel);
        } else {
          focusedIndex = Math.min(focusedIndex + 1, availableModels.length - 1);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (isOpen) {
          focusedIndex = Math.max(focusedIndex - 1, 0);
        }
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (isOpen && focusedIndex >= 0) {
          selectModel(availableModels[focusedIndex].model.id);
        } else {
          toggleDropdown();
        }
        break;
      case 'Escape':
        event.preventDefault();
        isOpen = false;
        break;
      case 'Home':
        event.preventDefault();
        if (isOpen) focusedIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        if (isOpen) focusedIndex = availableModels.length - 1;
        break;
    }
  }

  function handleClickOutside(event: MouseEvent) {
    if (selectorRef && !selectorRef.contains(event.target as Node)) {
      isOpen = false;
    }
  }

  // T023: Get current model with provider name for display
  $: currentModelData = availableModels.find(m => m.model.id === selectedModel);
  $: currentModelDisplay = currentModelData
    ? `${currentModelData.model.name} - ${currentModelData.providerName}`
    : selectedModel;

  $: if (typeof window !== 'undefined') {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }
  }
</script>

<!-- T023: Model selector with "[Model Name] - [Provider Name]" format -->
<div
  bind:this={selectorRef}
  class="model-selector relative"
  role="listbox"
  aria-expanded={isOpen}
  aria-label="Select model: {currentModelDisplay}"
  aria-disabled={disabled}
  on:keydown={handleKeyDown}
  tabindex={disabled ? -1 : 0}
>
  <!-- Trigger button -->
  <button
    type="button"
    class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-left flex items-center justify-between transition-colors"
    class:opacity-50={disabled}
    class:cursor-not-allowed={disabled}
    class:hover:bg-gray-700={!disabled}
    class:ring-2={isOpen}
    class:ring-cyan-400={isOpen}
    on:click={toggleDropdown}
    disabled={disabled}
  >
    <span class="flex items-center gap-2">
      <span class="font-medium text-gray-100">
        {currentModelDisplay}
      </span>
      {#if currentModelData?.model.deprecated}
        <span class="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
          Deprecated
        </span>
      {/if}
    </span>
    <svg
      class="w-5 h-5 text-gray-400 transition-transform"
      class:rotate-180={isOpen}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
    </svg>
  </button>

  <!-- Dropdown list -->
  {#if isOpen}
    <div
      class="absolute z-50 w-full mt-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl max-h-96 overflow-y-auto"
    >
      {#each availableModels as modelData, index (modelData.model.id)}
        <button
          type="button"
          class="w-full px-4 py-3 text-left transition-colors border-b border-gray-700 last:border-b-0"
          class:bg-gray-700={modelData.model.id === selectedModel}
          class:bg-gray-750={index === focusedIndex && modelData.model.id !== selectedModel}
          class:hover:bg-gray-700={modelData.model.id !== selectedModel}
          on:click={() => selectModel(modelData.model.id)}
        >
          <div class="flex items-center justify-between">
            <span class="font-medium text-gray-100">
              {modelData.model.name} - {modelData.providerName}
            </span>
            {#if modelData.model.deprecated}
              <span class="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-400 rounded">
                Deprecated
              </span>
            {/if}
          </div>
          <div class="mt-1 text-xs text-gray-400">
            {modelData.model.contextWindow.toLocaleString()} tokens
            {#if modelData.model.supportsReasoning}
              • Reasoning
            {/if}
          </div>
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .model-selector:focus {
    outline: none;
  }
</style>
