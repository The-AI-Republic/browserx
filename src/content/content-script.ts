/**
 * Lightweight content script used by Browserx.
 * Provides the minimal surface required by DOMTool (captureInteractionContent)
 * and PageActionTool (PAGE_ACTION_EXECUTE).
 */

import { MessageRouter, MessageType } from '../core/MessageRouter';
import { captureInteractionContent } from '../tools/dom/interactionCapture';
import type { CaptureRequest } from '../tools/dom/pageModel';
import type { ActionCommand, ActionExecutionResult } from '../types/page-actions';

let router: MessageRouter | null = null;

interface PageContext {
	url: string;
	title: string;
	domain: string;
	protocol: string;
	pathname: string;
	search: string;
	hash: string;
	viewport: {
		width: number;
		height: number;
		scrollX: number;
		scrollY: number;
	};
	metadata: Record<string, string>;
}

function initialize(): void {
	console.log('[Browserx] Content script initialized');

	router = new MessageRouter('content');
	setupMessageHandlers();
	announcePresence();
}

function setupMessageHandlers(): void {
	if (!router) {
		return;
	}

	router.on(MessageType.PING, () => ({
		type: MessageType.PONG,
		timestamp: Date.now(),
		initLevel: getInitLevel(),
		readyState: document.readyState,
		version: '1.0.0',
		capabilities: ['dom_capture_v2', 'page_actions']
	}));

	router.on(MessageType.TAB_COMMAND, async (message) => {
		const { command, args } = message.payload;

		if (command === 'capture-interaction-content') {
			return captureInteractionContentInPage(args as CaptureRequest);
		}

		throw new Error(`Unknown command: ${command}`);
	});

	router.on('PAGE_ACTION_EXECUTE' as MessageType, async (message) => {
		try {
			return await handlePageAction(message);
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error occurred'
			};
		}
	});
}

async function captureInteractionContentInPage(options: CaptureRequest = {}) {
	try {
		const html = document.documentElement.outerHTML;
		const pageModel = await captureInteractionContent(html, {
			...options,
			baseUrl: options.baseUrl || window.location.href
		});

		return pageModel;
	} catch (error) {
		console.error('[Content Script] Failed to capture interaction content:', error);
		throw error;
	}
}

function getPageContext(): PageContext {
	const location = window.location;
	const metadata: Record<string, string> = {};

	document.querySelectorAll('meta').forEach(meta => {
		const name = meta.getAttribute('name') || meta.getAttribute('property');
		const content = meta.getAttribute('content');
		if (name && content) {
			metadata[name] = content;
		}
	});

	return {
		url: location.href,
		title: document.title,
		domain: location.hostname,
		protocol: location.protocol,
		pathname: location.pathname,
		search: location.search,
		hash: location.hash,
		viewport: {
			width: window.innerWidth,
			height: window.innerHeight,
			scrollX: window.scrollX,
			scrollY: window.scrollY
		},
		metadata
	};
}

function announcePresence(): void {
	if (!router) {
		return;
	}

	router.send(MessageType.TAB_RESULT, {
		type: 'content-script-ready',
		context: getPageContext()
	}).catch(() => {
		/* ignore connection errors */
	});

	router.send(MessageType.TOOL_RESULT, {
		type: 'tools-available',
		tools: ['capture-interaction-content', 'page_action'],
		tabId: getTabId()
	}).catch(() => {
		/* ignore connection errors */
	});
}

function getTabId(): number | undefined {
	return (window as any).__browserxTabId;
}

function getInitLevel(): number {
	if (!router) return 1;
	if (document.readyState === 'loading') return 2;
	if (document.readyState === 'interactive') return 3;
	return 4;
}

window.addEventListener('pagehide', () => {
	if (router) {
		router.cleanup();
	}
});

initialize();

/**
 * Handle page action execution request (from PageActionTool)
 */
async function handlePageAction(message: any): Promise<any> {
	const { action } = message;
	const startTime = Date.now();

	console.log(`[page-actions] Executing ${action.type} action on element:`, action.targetElement);

	try {
		let result: ActionExecutionResult;

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

async function executeClickAction(action: ActionCommand): Promise<ActionExecutionResult> {
	const { ClickExecutor } = await import('../tools/page-action/ActionExecutor');
	const executor = new ClickExecutor();
	return executor.execute(action);
}

async function executeInputAction(action: ActionCommand): Promise<ActionExecutionResult> {
	const { InputExecutor } = await import('../tools/page-action/ActionExecutor');
	const executor = new InputExecutor();
	return executor.execute(action);
}

async function executeScrollAction(action: ActionCommand): Promise<ActionExecutionResult> {
	const { ScrollExecutor } = await import('../tools/page-action/ActionExecutor');
	const executor = new ScrollExecutor();
	return executor.execute(action);
}

async function executeVerifyAction(action: ActionCommand): Promise<ActionExecutionResult> {
	throw new Error('Verify action not yet implemented');
}

export { getPageContext, captureInteractionContentInPage, handlePageAction };

