/**
 * Lightweight content script used by Browserx.
 * Provides visual effects for DOM operations performed via CDP.
 */

// VISUAL EFFECTS v3.0
import VisualEffectController from './ui_effect/VisualEffectController.svelte';

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

	// Setup direct message listener for visual effects from DomService
	setupDirectMessageListener();

	// Note: Visual effects are initialized lazily when first SHOW_VISUAL_EFFECT message is received
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
 * Setup direct chrome.runtime.onMessage listener
 * Handles SHOW_VISUAL_EFFECT messages from DomService
 */
function setupDirectMessageListener(): void {
	chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
		// Handle SHOW_VISUAL_EFFECT from DomService
		if (message.type === 'SHOW_VISUAL_EFFECT') {
			try {
				// Lazy initialize visual effects if not already initialized
				if (!visualEffectController) {
					initializeVisualEffects();
				}

				// Extract effect type and coordinates (coordinates may be undefined for undulate)
				const { type, x, y } = message.effect;

				// Dispatch custom event to VisualEffectController
				// For ripple/cursor/highlight: x, y are screen coordinates
				// For undulate: x, y are undefined (full-page effect)
				const customEvent = new CustomEvent('browserx:show-visual-effect', {
					detail: { type, x, y },
					bubbles: false,
					cancelable: false
				});
				document.dispatchEvent(customEvent);

				sendResponse({ success: true });
			} catch (error) {
				console.error('[Browserx] Error handling visual effect:', error);
				sendResponse({ success: false, error: error.message });
			}
			return true; // Keep channel open for async response
		}
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

window.addEventListener('pagehide', () => {
	// Clean up visual effects
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

