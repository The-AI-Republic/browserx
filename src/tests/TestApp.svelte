<script lang="ts">
  import TerminalContainer from '../sidepanel/components/TerminalContainer.svelte';
  import TerminalMessage from '../sidepanel/components/TerminalMessage.svelte';
  import TerminalInput from '../sidepanel/components/TerminalInput.svelte';

  let inputValue = '';

  function handleSubmit(value: string) {
    console.log('Submitted:', value);
  }
</script>

<TerminalContainer>
  <TerminalMessage type="system" content="System initialized" />
  <TerminalMessage type="default" content="Welcome to Codex Terminal" />
  <TerminalMessage type="warning" content="Warning: Limited resources" />
  <TerminalMessage type="error" content="Error: Connection failed" />
  <TerminalMessage type="input" content="> user command" />
  <TerminalInput bind:value={inputValue} onSubmit={handleSubmit} placeholder="Enter command..." />
</TerminalContainer>