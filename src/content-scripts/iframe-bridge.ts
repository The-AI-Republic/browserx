/**
 * IframeBridge - Cross-frame communication helper
 * Enables secure message passing between parent and iframe contexts
 */

interface IframeBridgeMessage {
  type: 'IFRAME_ACTION_REQUEST' | 'IFRAME_ACTION_RESPONSE';
  requestId: string;
  payload: any;
  origin: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

class IframeBridge {
  private static instance: IframeBridge;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private messageHandler: ((event: MessageEvent) => void) | null = null;
  private allowedOrigins: Set<string> = new Set();
  private readonly defaultTimeout = 10000; // 10 seconds

  private constructor() {
    this.initializeMessageListener();
  }

  /**
   * Get singleton instance
   */
  static getInstance(): IframeBridge {
    if (!IframeBridge.instance) {
      IframeBridge.instance = new IframeBridge();
    }
    return IframeBridge.instance;
  }

  /**
   * Initialize window message listener for cross-frame communication
   */
  private initializeMessageListener() {
    this.messageHandler = (event: MessageEvent) => {
      this.handleMessage(event);
    };

    window.addEventListener('message', this.messageHandler);
    console.log('[IframeBridge] Message listener initialized');
  }

  /**
   * Handle incoming postMessage events
   */
  private handleMessage(event: MessageEvent) {
    const message = event.data as IframeBridgeMessage;

    // Validate message format
    if (!message || !message.type || !message.requestId) {
      return;
    }

    // Validate origin if we have restrictions
    if (this.allowedOrigins.size > 0 && !this.allowedOrigins.has(event.origin)) {
      console.warn(`[IframeBridge] Rejected message from unauthorized origin: ${event.origin}`);
      return;
    }

    if (message.type === 'IFRAME_ACTION_RESPONSE') {
      this.handleResponse(message);
    } else if (message.type === 'IFRAME_ACTION_REQUEST') {
      this.handleRequest(message, event.source as Window, event.origin);
    }
  }

  /**
   * Handle response to a request we sent
   */
  private handleResponse(message: IframeBridgeMessage) {
    const pending = this.pendingRequests.get(message.requestId);

    if (!pending) {
      console.warn(`[IframeBridge] Received response for unknown request: ${message.requestId}`);
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeout);

    // Remove from pending
    this.pendingRequests.delete(message.requestId);

    // Resolve or reject based on payload
    if (message.payload.error) {
      pending.reject(new Error(message.payload.error));
    } else {
      pending.resolve(message.payload.result);
    }
  }

  /**
   * Handle request from another frame
   */
  private async handleRequest(
    message: IframeBridgeMessage,
    source: Window,
    origin: string
  ) {
    console.log(`[IframeBridge] Received request from ${origin}:`, message.requestId);

    try {
      // Process the request (placeholder - actual implementation depends on action type)
      const result = await this.processRequest(message.payload);

      // Send response back
      this.sendResponse(source, origin, message.requestId, result);
    } catch (error) {
      // Send error response
      this.sendResponse(
        source,
        origin,
        message.requestId,
        null,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  /**
   * Process a request (placeholder for actual action execution)
   */
  private async processRequest(payload: any): Promise<any> {
    // This would delegate to the appropriate action handler
    // For now, just echo back the payload
    console.log('[IframeBridge] Processing request:', payload);
    return { success: true, payload };
  }

  /**
   * Send a request to an iframe
   * @param targetWindow Target iframe window
   * @param targetOrigin Target origin (use '*' for any, but not recommended)
   * @param payload Request payload
   * @param timeout Timeout in milliseconds
   * @returns Promise resolving to response
   */
  sendRequest(
    targetWindow: Window,
    targetOrigin: string,
    payload: any,
    timeout: number = this.defaultTimeout
  ): Promise<any> {
    const requestId = this.generateRequestId();

    const message: IframeBridgeMessage = {
      type: 'IFRAME_ACTION_REQUEST',
      requestId,
      payload,
      origin: window.location.origin
    };

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutHandle = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestId} timed out after ${timeout}ms`));
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutHandle
      });

      // Send message
      targetWindow.postMessage(message, targetOrigin);

      console.log(`[IframeBridge] Sent request ${requestId} to ${targetOrigin}`);
    });
  }

  /**
   * Send a response to a request
   */
  private sendResponse(
    targetWindow: Window,
    targetOrigin: string,
    requestId: string,
    result: any = null,
    error: string | null = null
  ) {
    const message: IframeBridgeMessage = {
      type: 'IFRAME_ACTION_RESPONSE',
      requestId,
      payload: { result, error },
      origin: window.location.origin
    };

    targetWindow.postMessage(message, targetOrigin);

    console.log(`[IframeBridge] Sent response ${requestId} to ${targetOrigin}`);
  }

  /**
   * Add an allowed origin for incoming messages
   * @param origin Origin to allow (e.g., 'https://example.com')
   */
  addAllowedOrigin(origin: string) {
    this.allowedOrigins.add(origin);
    console.log(`[IframeBridge] Added allowed origin: ${origin}`);
  }

  /**
   * Remove an allowed origin
   * @param origin Origin to remove
   */
  removeAllowedOrigin(origin: string) {
    this.allowedOrigins.delete(origin);
    console.log(`[IframeBridge] Removed allowed origin: ${origin}`);
  }

  /**
   * Clear all allowed origins (allow all)
   */
  clearAllowedOrigins() {
    this.allowedOrigins.clear();
    console.log('[IframeBridge] Cleared all allowed origins');
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `iframe-req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Clean up resources
   */
  destroy() {
    if (this.messageHandler) {
      window.removeEventListener('message', this.messageHandler);
      this.messageHandler = null;
    }

    // Reject all pending requests
    this.pendingRequests.forEach((pending, requestId) => {
      clearTimeout(pending.timeout);
      pending.reject(new Error('IframeBridge destroyed'));
    });

    this.pendingRequests.clear();

    console.log('[IframeBridge] Destroyed');
  }
}

// Export singleton instance
export const iframeBridge = IframeBridge.getInstance();
export { IframeBridge };
