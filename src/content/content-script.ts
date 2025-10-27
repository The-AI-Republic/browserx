/**
 * Lightweight content script used by Browserx.
 * Provides DOM Tool v3.0 (snapshot, click, type, keypress).
 */

import { MessageRouter, MessageType } from '../core/MessageRouter';

// NEW DOM TOOL v3.0
import { DomTool } from './dom';
import type { DomToolConfig, SerializationOptions } from '../types/domTool';

// VISUAL EFFECTS v3.0
import VisualEffectController from './dom/ui_effect/VisualEffectController.svelte';

let router: MessageRouter | null = null;
let domTool: DomTool | null = null;
let visualEffectController: any = null;
let visualEffectShadowHost: HTMLElement | null = null;

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

	// Initialize visual effects controller
	initializeVisualEffects();
}

/**
 * Initialize Visual Effect Controller
 * Mounts Svelte component in Shadow DOM for style isolation
 */
function initializeVisualEffects(): void {
	try {
		// Create shadow host element
		visualEffectShadowHost = document.createElement('div');
		visualEffectShadowHost.id = 'browserx-visual-effects-host';
		visualEffectShadowHost.style.cssText = 'position: fixed; top: 0; left: 0; width: 0; height: 0; z-index: 2147483647;';

		// Attach shadow DOM (closed mode for isolation)
		const shadowRoot = visualEffectShadowHost.attachShadow({ mode: 'closed' });

		// Mount Visual Effect Controller Svelte component
		visualEffectController = new VisualEffectController({
			target: shadowRoot,
		});

		// Append to document body
		document.body.appendChild(visualEffectShadowHost);

		console.log('[Browserx] Visual effects initialized');
	} catch (error) {
		// Graceful degradation - visual effects failure never blocks content script
		console.error('[Browserx] Failed to initialize visual effects:', error);
	}
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

		// Emit agent start event for visual effects (T024)
		domTool.emitAgentStart();
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
		capabilities: ['dom_tool_v3']
	}));

	router.on(MessageType.TAB_COMMAND, async (message) => {
		const { command, args } = message.payload;

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
}

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
			'dom.getSnapshot',               // v3.0
			'dom.click',                     // v3.0
			'dom.type',                      // v3.0
			'dom.keypress',                  // v3.0
			'dom.buildSnapshot'              // v3.0
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
	if (visualEffectController) {
		visualEffectController.$destroy();
		visualEffectController = null;
		console.log('[Browserx] Visual effects destroyed');
	}
	if (visualEffectShadowHost && visualEffectShadowHost.parentNode) {
		visualEffectShadowHost.parentNode.removeChild(visualEffectShadowHost);
		visualEffectShadowHost = null;
	}
});

initialize();

export { getPageContext };

