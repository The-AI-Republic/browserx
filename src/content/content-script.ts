/**
 * Lightweight content script used by Browserx.
 * Provides the minimal surface required by DOMTool (captureInteractionContent)
 * and PageActionTool (PAGE_ACTION_EXECUTE).
 */

import { MessageRouter, MessageType } from '../core/MessageRouter';
import { captureInteractionContent } from '../tools/dom/interactionCapture';
import type { CaptureRequest } from '../tools/dom/pageModel';
import type { ActionCommand, ActionExecutionResult } from '../types/page-actions';

// NEW DOM TOOL v3.0
import { DomTool } from './dom';
import type { DomToolConfig, SerializationOptions } from '../types/domTool';

let router: MessageRouter | null = null;
let domTool: DomTool | null = null;

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

/**
 * Get or create DomTool singleton instance
 * NEW DOM TOOL v3.0
 */
function getDomTool(config?: Partial<DomToolConfig>): DomTool {
	if (!domTool) {
		domTool = new DomTool({
			autoInvalidate: true,
			mutationThrottle: 500,
			maxInteractiveElements: 400,
			maxTreeDepth: 50,
			captureIframes: true,
			captureShadowDom: true,
			snapshotTimeout: 30000,
			...config,
		});
		console.log('[Browserx] DomTool v3.0 initialized');
	}
	return domTool;
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
		version: '3.0.0',
		capabilities: ['dom_capture_v2', 'dom_tool_v3', 'page_actions']
	}));

	router.on(MessageType.TAB_COMMAND, async (message) => {
		const { command, args } = message.payload;

		// OLD DOM TOOL (v2.0) - DEPRECATED
		if (command === 'capture-interaction-content') {
			return captureInteractionContentInPage(args as CaptureRequest);
		}

		if (command === 'build-snapshot') {
			return buildSnapshotInPage(args as CaptureRequest);
		}

		// NEW DOM TOOL (v3.0)
		if (command === 'dom.getSnapshot') {
			return domGetSnapshot(args as SerializationOptions);
		}

		if (command === 'dom.click') {
			const { nodeId, options } = args as { nodeId: string; options?: any };
			return domClick(nodeId, options);
		}

		if (command === 'dom.type') {
			const { nodeId, text, options } = args as { nodeId: string; text: string; options?: any };
			return domType(nodeId, text, options);
		}

		if (command === 'dom.keypress') {
			const { key, options } = args as { key: string; options?: any };
			return domKeypress(key, options);
		}

		if (command === 'dom.buildSnapshot') {
			const { trigger } = args as { trigger?: 'action' | 'navigation' | 'manual' | 'mutation' };
			return domBuildSnapshot(trigger);
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
		// IMPORTANT: Capture the entire document starting from <html> (including <head> and <body>)
		// This ensures we have full page context (title, meta tags, all content)
		// Serialization for LLM will extract only relevant parts (title, headings, body controls)
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

/**
 * Builds a new snapshot of the page
 *
 * This is typically called:
 * - After page actions (click, type, keypress) to capture DOM changes
 * - After navigation events (popstate, pushstate)
 * - On manual trigger from external tools
 * - After significant DOM mutations
 *
 * @param options - Capture configuration options
 * @returns PageModel snapshot
 */
async function buildSnapshotInPage(options: CaptureRequest = {}) {
	try {
		console.log('[Content Script] Building new DOM snapshot');

		// Build snapshot by capturing current DOM state
		const html = document.documentElement.outerHTML;
		const pageModel = await captureInteractionContent(html, {
			...options,
			baseUrl: options.baseUrl || window.location.href
		});

		console.log('[Content Script] Snapshot built successfully', {
			controls: pageModel.controls.length,
			headings: pageModel.headings.length,
			regions: pageModel.regions.length
		});

		return pageModel;
	} catch (error) {
		console.error('[Content Script] Failed to build snapshot:', error);
		throw error;
	}
}

/**
 * NEW DOM TOOL v3.0 - Message Handler Functions
 */

/**
 * Get serialized DOM snapshot for LLM consumption
 */
async function domGetSnapshot(options?: SerializationOptions) {
	try {
		const tool = getDomTool();
		const serialized = await tool.get_serialized_dom(options);

		console.log('[Browserx] DOM snapshot generated', {
			nodes: serialized.page.body ? countNodes(serialized.page.body) : 0,
			iframes: serialized.page.iframes?.length || 0,
			shadowDoms: serialized.page.shadowDoms?.length || 0,
		});

		return serialized;
	} catch (error) {
		console.error('[Browserx] Failed to get DOM snapshot:', error);
		throw error;
	}
}

/**
 * Execute click action on an element
 */
async function domClick(nodeId: string, options?: any) {
	try {
		const tool = getDomTool();
		const result = await tool.click(nodeId, options);

		console.log('[Browserx] Click executed', {
			nodeId,
			success: result.success,
			duration: result.duration,
			changes: result.changes,
		});

		return result;
	} catch (error) {
		console.error('[Browserx] Click failed:', error);
		throw error;
	}
}

/**
 * Execute type action on an element
 */
async function domType(nodeId: string, text: string, options?: any) {
	try {
		const tool = getDomTool();
		const result = await tool.type(nodeId, text, options);

		console.log('[Browserx] Type executed', {
			nodeId,
			text: text.substring(0, 50),
			success: result.success,
			duration: result.duration,
			valueChanged: result.changes.valueChanged,
		});

		return result;
	} catch (error) {
		console.error('[Browserx] Type failed:', error);
		throw error;
	}
}

/**
 * Execute keypress action
 */
async function domKeypress(key: string, options?: any) {
	try {
		const tool = getDomTool();
		const result = await tool.keypress(key, options);

		console.log('[Browserx] Keypress executed', {
			key,
			success: result.success,
			duration: result.duration,
			changes: result.changes,
		});

		return result;
	} catch (error) {
		console.error('[Browserx] Keypress failed:', error);
		throw error;
	}
}

/**
 * Build/rebuild DOM snapshot
 */
async function domBuildSnapshot(trigger: 'action' | 'navigation' | 'manual' | 'mutation' = 'manual') {
	try {
		const tool = getDomTool();
		const snapshot = await tool.buildSnapshot(trigger);

		console.log('[Browserx] Snapshot built', {
			trigger,
			stats: snapshot.stats,
			timestamp: snapshot.timestamp,
		});

		return {
			success: true,
			timestamp: snapshot.timestamp,
			stats: snapshot.stats,
		};
	} catch (error) {
		console.error('[Browserx] Snapshot build failed:', error);
		throw error;
	}
}

/**
 * Count nodes in serialized tree (for logging)
 */
function countNodes(node: any): number {
	let count = 1;
	if (node.children) {
		for (const child of node.children) {
			count += countNodes(child);
		}
	}
	return count;
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
		tools: [
			'capture-interaction-content',  // OLD - v2.0 (deprecated)
			'build-snapshot',                // OLD - v2.0 (deprecated)
			'dom.getSnapshot',               // NEW - v3.0
			'dom.click',                     // NEW - v3.0
			'dom.type',                      // NEW - v3.0
			'dom.keypress',                  // NEW - v3.0
			'dom.buildSnapshot',             // NEW - v3.0
			'page_action'                    // Page actions
		],
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
	if (domTool) {
		domTool.destroy();
		domTool = null;
		console.log('[Browserx] DomTool v3.0 destroyed');
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

export { getPageContext, captureInteractionContentInPage, buildSnapshotInPage, handlePageAction };

