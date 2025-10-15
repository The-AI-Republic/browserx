<script lang="ts">
  export let type: 'default' | 'warning' | 'error' | 'input' | 'system' = 'default';
  export let content: string;

  const colorClasses: Record<typeof type, string> = {
    default: 'text-term-green',
    warning: 'text-term-yellow',
    error: 'text-term-red',
    input: 'text-term-blue',
    system: 'text-term-dim-green'
  };

  $: colorClass = colorClasses[type];
</script>

<div class="terminal-message {colorClass}" aria-live="polite" aria-atomic="true">
  {content}
</div>