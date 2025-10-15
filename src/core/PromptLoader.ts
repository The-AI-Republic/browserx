export async function loadPrompt(): Promise<string> {
  const response = await fetch(chrome.runtime.getURL('prompts/agent_prompt.md'));
  return response.text();
}

export async function loadUserInstructions(): Promise<string> {
  const response = await fetch(chrome.runtime.getURL('prompts/user_instruction.md'));
  return response.text();
}