/**
 * Content script for executing page actions
 * Injected into web pages to perform DOM manipulations
 */

import type {
  ActionCommand,
  ActionExecutionResult,
  DetectedChanges,
  ActionError
} from '../types/page-actions';

// Message types for communication with background script
interface PageActionMessage {
  type: 'PAGE_ACTION_EXECUTE';
  action: ActionCommand;
  selectorMap?: any;
}

interface PageActionResponse {
  success: boolean;
  result?: ActionExecutionResult;
  error?: string;
}

/**
 * Initialize content script message listener
 */
function initializePageActionListener() {
  console.log('[page-actions] Content script initialized');

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PAGE_ACTION_EXECUTE') {
      handlePageAction(message as PageActionMessage)
        .then(response => sendResponse(response))
        .catch(error => {
          sendResponse({
            success: false,
            error: error.message || 'Unknown error occurred'
          });
        });

      // Return true to indicate we'll send response asynchronously
      return true;
    }

    return false;
  });
}

/**
 * Handle page action execution request
 */
async function handlePageAction(message: PageActionMessage): Promise<PageActionResponse> {
  const { action, selectorMap } = message;
  const startTime = Date.now();

  console.log(`[page-actions] Executing ${action.type} action on element:`, action.targetElement);

  try {
    let result: ActionExecutionResult;

    // Route to appropriate action handler
    switch (action.type) {
      case 'click':
        result = await executeClickAction(action);
        break;

      case 'input':
        result = await executeInputAction(action);
        break;

      case 'scroll':
        result = await executeScrollAction(action);
        break;

      case 'verify':
        result = await executeVerifyAction(action);
        break;

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

    console.log(`[page-actions] Action completed in ${Date.now() - startTime}ms`);

    return {
      success: true,
      result
    };
  } catch (error) {
    console.error('[page-actions] Action failed:', error);

    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Execute click action
 */
async function executeClickAction(action: ActionCommand): Promise<ActionExecutionResult> {
  // Import ClickExecutor dynamically to avoid circular dependencies
  // For now, implement inline

  const { ClickExecutor } = await import('../tools/page-action/ActionExecutor');
  const executor = new ClickExecutor();
  return executor.execute(action);
}

/**
 * Execute input action
 */
async function executeInputAction(action: ActionCommand): Promise<ActionExecutionResult> {
  const { InputExecutor } = await import('../tools/page-action/ActionExecutor');
  const executor = new InputExecutor();
  return executor.execute(action);
}

/**
 * Execute scroll action
 */
async function executeScrollAction(action: ActionCommand): Promise<ActionExecutionResult> {
  const { ScrollExecutor } = await import('../tools/page-action/ActionExecutor');
  const executor = new ScrollExecutor();
  return executor.execute(action);
}

/**
 * Execute verify action (placeholder - implemented in Phase 7)
 */
async function executeVerifyAction(action: ActionCommand): Promise<ActionExecutionResult> {
  throw new Error('Verify action not yet implemented');
}

/**
 * Create base action result structure
 */
function createActionResult(
  action: ActionCommand,
  success: boolean,
  duration: number,
  attemptsCount: number = 1,
  detectedChanges?: Partial<DetectedChanges>,
  error?: ActionError
): ActionExecutionResult {
  return {
    success,
    actionCommand: action,
    timestamp: new Date().toISOString(),
    duration,
    attemptsCount,
    detectedChanges: {
      navigationOccurred: false,
      domMutations: 0,
      scrollPositionChanged: false,
      valueChanged: false,
      ...detectedChanges
    },
    error
  };
}

/**
 * Detect changes after action execution
 */
async function detectChanges(beforeState: any): Promise<DetectedChanges> {
  // Placeholder for change detection logic
  // Will be implemented in action-specific handlers

  return {
    navigationOccurred: false,
    domMutations: 0,
    scrollPositionChanged: false,
    valueChanged: false
  };
}

// Initialize when content script loads
if (typeof chrome !== 'undefined' && chrome.runtime) {
  initializePageActionListener();
}

// Export for testing
export {
  initializePageActionListener,
  handlePageAction,
  createActionResult,
  detectChanges
};
