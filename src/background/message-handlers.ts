/**
 * Message handlers for page action execution
 * Routes messages between PageActionTool and content scripts
 */

import type { MessageRouter } from '../core/MessageRouter';
import type { PageActionToolRequest, PageActionToolResponse } from '../types/page-actions';

/**
 * Setup page action message handlers
 * @param router Message router instance
 */
export function setupPageActionHandlers(router: MessageRouter): void {
  // Handle page action execution requests
  router.on('PAGE_ACTION_EXECUTE' as any, async (message) => {
    const request = message.payload as PageActionToolRequest;
    const tabId = request.tabId || message.tabId;

    if (!tabId) {
      throw new Error('Tab ID required for page action execution');
    }

    console.log(`[PageActionHandlers] Executing ${request.action.type} action on tab ${tabId}`);

    try {
      // Forward message to content script in target tab
      const response = await chrome.tabs.sendMessage(tabId, {
        type: 'PAGE_ACTION_EXECUTE',
        action: request.action,
        selectorMap: request.selectorMap
      });

      console.log(`[PageActionHandlers] Action completed:`, response);

      return response;
    } catch (error) {
      console.error('[PageActionHandlers] Action failed:', error);

      // Check if it's a connection error (content script not injected)
      if (error instanceof Error && error.message.includes('Could not establish connection')) {
        throw new Error('Content script not loaded in target tab. Please refresh the page and try again.');
      }

      throw error;
    }
  });

  // Handle selector map refresh notifications from content scripts
  router.on('PAGE_ACTION_SELECTOR_MAP_REFRESH' as any, async (message) => {
    const { sessionId, turnId, reason } = message.payload;

    console.log(`[PageActionHandlers] Selector map refresh requested: ${reason}`);

    // Broadcast notification to side panel
    await router.broadcast('PAGE_UPDATE_NOTIFICATION' as any, {
      type: 'selector_map_refresh',
      sessionId,
      turnId,
      reason,
      timestamp: Date.now()
    });
  });

  // Handle page update notifications
  router.on('PAGE_UPDATE_NOTIFICATION' as any, async (message) => {
    console.log('[PageActionHandlers] Page update notification:', message.payload);

    // Broadcast to side panel for user notification
    await router.broadcast('SIDE_PANEL_NOTIFICATION' as any, {
      type: 'page_updated',
      message: 'Page has been updated. Selector map was refreshed.',
      ...message.payload
    });
  });
}

/**
 * Check if content script is injected in a tab
 * @param tabId Tab identifier
 * @returns true if content script is loaded
 */
export async function isContentScriptInjected(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Inject page action content script into a tab
 * @param tabId Tab identifier
 */
export async function injectPageActionScript(tabId: number): Promise<void> {
  try {
    // Check if already injected
    if (await isContentScriptInjected(tabId)) {
      console.log(`[PageActionHandlers] Content script already injected in tab ${tabId}`);
      return;
    }

    // Inject content script
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ['content/page-actions.js']
    });

    console.log(`[PageActionHandlers] Page action script injected into tab ${tabId}`);
  } catch (error) {
    console.error(`[PageActionHandlers] Failed to inject script into tab ${tabId}:`, error);
    throw new Error(`Failed to inject page action script: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Send message to content script with automatic retry
 * @param tabId Tab identifier
 * @param message Message to send
 * @param retries Number of retries
 * @returns Response from content script
 */
export async function sendToContentScript(
  tabId: number,
  message: any,
  retries: number = 3
): Promise<any> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      console.warn(`[PageActionHandlers] Send attempt ${attempt + 1}/${retries} failed:`, error);

      // If content script not loaded, try to inject it
      if (error instanceof Error && error.message.includes('Could not establish connection')) {
        try {
          await injectPageActionScript(tabId);
          // Wait a bit for injection to complete
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (injectError) {
          console.error('[PageActionHandlers] Failed to inject script:', injectError);
        }
      }

      // Wait before retrying (exponential backoff)
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
      }
    }
  }

  throw lastError || new Error('Failed to send message to content script after retries');
}
