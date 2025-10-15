/**
 * Chrome messaging utilities for side panel
 */

/**
 * Send message to service worker and wait for response
 */
export async function sendToBackground<T>(message: any): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (response?.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Get list of all registered tools
 */
export async function getTools(): Promise<any[]> {
  const response = await sendToBackground<{ tools: any[] }>({ type: 'GET_TOOLS' });
  return response.tools;
}

/**
 * Execute a tool with given parameters
 */
export async function executeTool(toolName: string, parameters: Record<string, any>): Promise<any> {
  const request = {
    toolName,
    parameters,
    sessionId: 'test-session',
    turnId: `test-turn-${Date.now()}`,
  };

  const response = await sendToBackground<{ result: any }>({
    type: 'EXECUTE_TOOL',
    request,
  });

  return response.result;
}
