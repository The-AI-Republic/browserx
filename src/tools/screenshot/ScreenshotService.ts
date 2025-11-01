/**
 * ScreenshotService - CDP-based screenshot capture
 *
 * Captures viewport screenshots using Chrome DevTools Protocol Page.captureScreenshot
 */

import type { ScreenshotCaptureOptions, ViewportBounds, ScrollOffset } from './types';

export class ScreenshotService {
  private tabId: number;
  private sendCommand: <T = any>(method: string, params?: any) => Promise<T>;

  constructor(
    tabId: number,
    sendCommand: <T = any>(method: string, params?: any) => Promise<T>
  ) {
    this.tabId = tabId;
    this.sendCommand = sendCommand;
  }

  /**
   * Capture current viewport as PNG screenshot
   *
   * @param options - Screenshot capture options
   * @returns Base64-encoded PNG screenshot data
   * @throws Error if screenshot capture fails
   */
  async captureViewport(options?: ScreenshotCaptureOptions): Promise<{
    base64Data: string;
    viewport: ViewportBounds;
  }> {
    try {
      // Get viewport bounds before capture
      const viewport = await this.getViewportBounds();

      // Capture screenshot using CDP
      const screenshot = await this.sendCommand<{ data: string }>('Page.captureScreenshot', {
        format: options?.format || 'png',
        quality: options?.quality,
        captureBeyondViewport: false // Only capture visible viewport
      });

      console.log(`[ScreenshotService] Captured viewport screenshot (${viewport.width}x${viewport.height})`);

      return {
        base64Data: screenshot.data,
        viewport
      };
    } catch (error: any) {
      console.error('[ScreenshotService] Failed to capture viewport:', error);
      throw new Error(`SCREENSHOT_FAILED: ${error.message}`);
    }
  }

  /**
   * Capture viewport after scrolling to specified position
   *
   * @param scrollOffset - Scroll offset (x, y) before capture
   * @param options - Screenshot capture options
   * @returns Base64-encoded PNG screenshot data
   * @throws Error if scroll or screenshot capture fails
   */
  async captureWithScroll(
    scrollOffset: ScrollOffset,
    options?: ScreenshotCaptureOptions
  ): Promise<{
    base64Data: string;
    viewport: ViewportBounds;
  }> {
    try {
      // Scroll to specified position
      await this.scrollTo(scrollOffset);

      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture viewport after scroll
      return await this.captureViewport(options);
    } catch (error: any) {
      console.error('[ScreenshotService] Failed to capture with scroll:', error);
      throw new Error(`SCREENSHOT_FAILED: ${error.message}`);
    }
  }

  /**
   * Scroll page to specified offset
   */
  private async scrollTo(offset: ScrollOffset): Promise<void> {
    const expression = `
      window.scrollTo({
        left: ${offset.x ?? 'window.scrollX'},
        top: ${offset.y ?? 'window.scrollY'},
        behavior: 'smooth'
      });
    `;

    await this.sendCommand('Runtime.evaluate', {
      expression,
      returnByValue: true
    });
  }

  /**
   * Get current viewport bounds
   */
  private async getViewportBounds(): Promise<ViewportBounds> {
    const result = await this.sendCommand<any>('Runtime.evaluate', {
      expression: '({ width: window.innerWidth, height: window.innerHeight, scroll_x: window.scrollX, scroll_y: window.scrollY })',
      returnByValue: true
    });

    const { width, height, scroll_x, scroll_y } = result.result.value;

    return {
      width,
      height,
      scroll_x,
      scroll_y
    };
  }

  /**
   * Create ScreenshotService for a specific tab
   * Uses chrome.debugger to send CDP commands
   */
  static async forTab(tabId: number): Promise<ScreenshotService> {
    // Verify debugger is attached
    try {
      await chrome.debugger.sendCommand({ tabId }, 'Page.enable', {});
    } catch (error: any) {
      if (error.message?.includes('No target')) {
        throw new Error('CDP_CONNECTION_LOST: Debugger not attached to tab. Ensure DomService.forTab() was called first.');
      }
      throw error;
    }

    // Create send command wrapper
    const sendCommand = async <T = any>(method: string, params?: any): Promise<T> => {
      return await chrome.debugger.sendCommand({ tabId }, method, params);
    };

    return new ScreenshotService(tabId, sendCommand);
  }
}
