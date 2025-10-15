/**
 * Service worker for Codex Web Tool Test extension
 * Registers browser tools and handles messages from side panel
 */

import { ToolRegistry } from '@tools/ToolRegistry';
import { registerTools } from '@tools/index';
import { AgentConfig } from '@config/AgentConfig';
import type { ToolDefinition, ToolExecutionRequest, ToolExecutionResponse } from '@tools/BaseTool';

// Global instances
let toolRegistry: ToolRegistry | null = null;
let agentConfig: AgentConfig | null = null;
let isInitialized = false;

/**
 * Initialize tool registry
 */
async function initializeTools(): Promise<void> {
  if (isInitialized) {
    console.log('[Test Tool] Already initialized');
    return;
  }

  console.log('[Test Tool] Initializing...');

  try {
    // Initialize AgentConfig singleton
    agentConfig = AgentConfig.getInstance();
    await agentConfig.initialize();

    // Create ToolRegistry instance
    toolRegistry = new ToolRegistry();

    // Register all tools using main app logic
    await registerTools(toolRegistry, agentConfig.getToolsConfig());

    const toolCount = toolRegistry.listTools().length;
    console.log(`[Test Tool] Initialized with ${toolCount} tools`);

    isInitialized = true;
  } catch (error) {
    console.error('[Test Tool] Initialization failed:', error);
    throw error;
  }
}

/**
 * Handle GET_TOOLS message
 */
async function handleGetTools(): Promise<{ tools: ToolDefinition[] }> {
  if (!toolRegistry) {
    throw new Error('ToolRegistry not initialized');
  }

  const tools = toolRegistry.listTools();
  return { tools };
}

/**
 * Handle EXECUTE_TOOL message
 */
async function handleExecuteTool(request: ToolExecutionRequest): Promise<{ result: ToolExecutionResponse }> {
  if (!toolRegistry) {
    throw new Error('ToolRegistry not initialized');
  }

  const result = await toolRegistry.execute(request);
  return { result };
}

/**
 * Message handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_TOOLS':
          return await handleGetTools();

        case 'EXECUTE_TOOL':
          return await handleExecuteTool(message.request);

        default:
          throw new Error(`Unknown message type: ${message.type}`);
      }
    } catch (error: any) {
      return { error: error.message };
    }
  })().then(sendResponse);

  return true; // Indicates async response
});

/**
 * Set up side panel behavior
 */
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

/**
 * Initialize on install
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('[Test Tool] Extension installed');
  await initializeTools();
});

/**
 * Initialize on startup
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('[Test Tool] Extension started');
  await initializeTools();
});

// Initialize immediately
initializeTools();
