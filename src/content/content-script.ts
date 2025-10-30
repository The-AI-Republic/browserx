/**
 * Lightweight content script used by Browserx.
 * Provides visual effects for DOM operations performed via CDP.
 */

import { MessageRouter, MessageType } from '../core/MessageRouter';

// VISUAL EFFECTS v3.0
import VisualEffectController from './ui_effect/VisualEffectController.svelte';

let router: MessageRouter | null = null;
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

	// Note: Visual effects are initialized lazily when DomTool is first used
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
 * Initialize visual effects explicitly
 * This command allows the agent to manually initialize visual effects in the target tab.
 */
function initVisualEffects() {
	try {
		if (!visualEffectController) {
			initializeVisualEffects();
		}

		return {
			success: true,
			message: 'Visual effects initialized successfully',
			tabId: getTabId(),
			initialized: {
				visualEffects: !!visualEffectController,
			}
		};
	} catch (error) {
		console.error('[Browserx] Failed to initialize visual effects:', error);
		throw error;
	}
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
		capabilities: ['visual_effects']
	}));

	router.on(MessageType.TAB_COMMAND, async (message) => {
		const { command, args } = message.payload;

		// INITIALIZATION COMMANDS
		if (command === 'init.visualEffects') {
			return initVisualEffects();
		}

		// SHOW VISUAL EFFECT (for CDP-based DOM actions)
		if (command === 'visual.showEffect') {
			const { type, x, y } = args as { type: string; x: number; y: number };
			// Visual effects are handled via custom events dispatched by DomTool (CDP-based)
			return { success: true };
		}

		throw new Error(`Unknown command: ${command}`);
	});
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
			'init.visualEffects',            // Initialize visual effects
			'visual.showEffect'              // Show visual effect
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

