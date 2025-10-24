import { MessageType } from '../../core/MessageRouter';
import type { CaptureRequest, PageModel } from './pageModel';

/**
 * DOM Service error codes surfaced to callers.
 * Maintained to preserve tooling contracts with DOMTool.
 */
export enum DOMServiceErrorCode {
	TAB_NOT_FOUND = 'TAB_NOT_FOUND',
	CONTENT_SCRIPT_NOT_LOADED = 'CONTENT_SCRIPT_NOT_LOADED',
	TIMEOUT = 'TIMEOUT',
	PERMISSION_DENIED = 'PERMISSION_DENIED',
	INVALID_RESPONSE = 'INVALID_RESPONSE',
	UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * Structured error surfaced from DomService.
 */
export class DOMServiceError extends Error {
	constructor(
		public code: DOMServiceErrorCode,
		message: string,
		public details?: any
	) {
		super(message);
		this.name = 'DOMServiceError';
	}
}

interface BrowserSession {
	tab_id?: number;
}

interface Logger {
	log(message: string): void;
	error(message: string): void;
	warn(message: string): void;
}

/**
 * Lightweight service wrapper that delegates DOM operations to the content script.
 * The only supported operation is captureInteractionContent which backs DOMTool.executeImpl.
 */
export class DomService {
	constructor(
		private browser_session: BrowserSession,
		private logger?: Logger
	) {}

	/**
	 * Capture interaction-focused page model by delegating to the content script.
	 */
	async captureInteractionContent(options: CaptureRequest = {}): Promise<PageModel> {
		const tab_id = this.browser_session.tab_id;
		if (!tab_id) {
			throw new DOMServiceError(
				DOMServiceErrorCode.TAB_NOT_FOUND,
				'Tab ID is required to capture interaction content',
				{}
			);
		}

		try {
			const tab = await chrome.tabs.get(tab_id);
			const baseUrl = options.baseUrl || tab.url;

			const response = await chrome.tabs.sendMessage(
				tab_id,
				{
					type: MessageType.TAB_COMMAND,
					payload: {
						command: 'capture-interaction-content',
						args: {
							...options,
							baseUrl
						}
					},
					timestamp: Date.now()
				},
				{ frameId: 0 }
			);

			if (!response || !response.success || !response.data) {
				throw new DOMServiceError(
					DOMServiceErrorCode.INVALID_RESPONSE,
					'Failed to capture interaction content from content script',
					{ tab_id, response }
				);
			}

			return response.data;
		} catch (error: any) {
			// chrome.tabs.sendMessage throws an Error when content script is missing.
			if (error instanceof DOMServiceError) {
				throw error;
			}

			const message = error?.message || String(error);
			this.logger?.error?.('Failed to capture interaction content: ' + message);

			if (message.includes('receiving end') || message.includes('No tab')) {
				throw new DOMServiceError(
					DOMServiceErrorCode.CONTENT_SCRIPT_NOT_LOADED,
					'Content script is not available in the target tab',
					{ tab_id, original_error: message }
				);
			}

			if (message.includes('permission')) {
				throw new DOMServiceError(
					DOMServiceErrorCode.PERMISSION_DENIED,
					`Permission denied to access tab ${tab_id}`,
					{ tab_id, original_error: message }
				);
			}

			throw new DOMServiceError(
				DOMServiceErrorCode.UNKNOWN_ERROR,
				'Failed to capture interaction content',
				{ tab_id, original_error: message }
			);
		}
	}
}

