<script lang="ts">
  import type { CodexAgent } from '../../src/core/CodexAgent';

  export let agent: CodexAgent;
  export let reactive = false;
  export let showStatus = false;

  let agentModel = 'claude-3-5-sonnet-20241022';
  let approvalPolicy = 'on-request';
  let agentStatus = 'ready';

  $: if (agent && reactive) {
    const config = agent.getConfig();
    agentModel = config.model;
    approvalPolicy = config.approval_policy;

    if (config.sandbox_policy?.mode === 'read-only') {
      agentStatus = 'restricted';
    }
  }
</script>

<div class="agent-status">
  <div data-testid="agent-model">{agentModel}</div>
  <div data-testid="approval-policy">{approvalPolicy}</div>

  {#if showStatus}
    <div data-testid="agent-status">{agentStatus}</div>
  {/if}
</div>