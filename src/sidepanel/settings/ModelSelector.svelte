<script lang="ts">
  /**
   * T009: ModelSelector component
   * Feature: 001-multi-model-support
   * User Story 1: Model Selection in Settings
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { ModelRegistry } from '../../models/ModelRegistry';
  import type { ModelMetadata, ConfiguredFeatures } from '../../models/types/ModelRegistry';
  import ModelOption from './ModelOption.svelte';

  export let selectedModel: string;
  export let configuredFeatures: ConfiguredFeatures;
  export let disabled = false;

  const dispatch = createEventDispatcher();

  let isOpen = false;
  let availableModels: ModelMetadata[] = [];
  let focusedIndex = -1;
  let selectorRef: HTMLDivElement;

  onMount(() => {
    availableModels = ModelRegistry.getAvailableModels();
  });

  function toggleDropdown() {
    if (disabled) return;
    isOpen = !isOpen;
    if (isOpen) {
      focusedIndex = availableModels.findIndex(m => m.id === selectedModel);
    }
  }

  function selectModel(modelId: string) {
    if (disabled) return;

    // T012: Validate before selection
    const validation = ModelRegistry.validateCompatibility(modelId, configuredFeatures);

    if (!validation.valid) {
      // T014, T015: Block selection and show error
      dispatch('validationError', {
        modelId,
        errors: validation.errors,
        incompatibleFeatures: validation.incompatibleFeatures,
        suggestedActions: validation.suggestedActions
      });
      return;
    }

    // T016: Dispatch model change event
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
          focusedIndex = availableModels.findIndex(m => m.id === selectedModel);
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
          selectModel(availableModels[focusedIndex].id);
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

  $: currentModel = ModelRegistry.getModel(selectedModel);
  $: if (typeof window !== 'undefined') {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
    } else {
      document.removeEventListener('click', handleClickOutside);
    }
  }
</script>

<!-- T013: ARIA attributes -->
<div
  bind:this={selectorRef}
  class="model-selector relative"
  role="listbox"
  aria-expanded={isOpen}
  aria-label="Select model: {currentModel?.displayName || selectedModel}"
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
        {currentModel?.displayName || selectedModel}
      </span>
      {#if currentModel?.deprecated}
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
      {#each availableModels as model, index (model.id)}
        <ModelOption
          {model}
          isSelected={model.id === selectedModel}
          isFocused={index === focusedIndex}
          {configuredFeatures}
          on:click={() => selectModel(model.id)}
        />
      {/each}
    </div>
  {/if}
</div>

<style>
  .model-selector:focus {
    outline: none;
  }
</style>
