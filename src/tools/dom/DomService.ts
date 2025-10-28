import { DomSnapshot } from './DomSnapshot';
import type {
  VirtualNode,
  ActionResult,
  SerializedDom,
  PageContext,
  SnapshotStats,
  ServiceConfig
} from './types';
import { NODE_ID_WINDOW, NODE_ID_DOCUMENT } from './types';
import { computeHeuristics, classifyNode, determineInteractionType, detectFramework } from './utils';

export class DomService {
  private static instances = new Map<number, DomService>();

  private tabId: number;
  private isAttached: boolean = false;
  private currentSnapshot: DomSnapshot | null = null;
  private config: ServiceConfig;

  private constructor(tabId: number, config?: Partial<ServiceConfig>) {
    this.tabId = tabId;
    this.config = {
      enableVisualEffects: true,
      maxTreeDepth: 100,
      snapshotTimeout: 10000,
      retryAttempts: 2,
      ...config
    };
  }

  static async forTab(tabId: number, config?: Partial<ServiceConfig>): Promise<DomService> {
    if (!this.instances.has(tabId)) {
      const service = new DomService(tabId, config);
      await service.attach();
      this.instances.set(tabId, service);
    }
    return this.instances.get(tabId)!;
  }

  async attach(): Promise<void> {
    if (this.isAttached) return;

    try {
      await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
      this.isAttached = true;

      // Enable required domains
      await this.sendCommand('DOM.enable', {});
      await this.sendCommand('Accessibility.enable', {});

      // Listen for invalidation events
      chrome.debugger.onEvent.addListener(this.handleCdpEvent.bind(this));

      console.log(`[DomService] Attached to tab ${this.tabId}`);
    } catch (error: any) {
      if (error.message?.includes('already attached')) {
        throw new Error('ALREADY_ATTACHED: DevTools is open on this tab. Please close DevTools.');
      }
      throw new Error(`ATTACH_FAILED: ${error.message}`);
    }
  }

  async detach(): Promise<void> {
    if (!this.isAttached) return;

    try {
      await chrome.debugger.detach({ tabId: this.tabId });
      this.isAttached = false;
      this.currentSnapshot = null;
      DomService.instances.delete(this.tabId);

      console.log(`[DomService] Detached from tab ${this.tabId}`);
    } catch (error: any) {
      console.warn(`[DomService] Detach error: ${error.message}`);
    }
  }

  invalidateSnapshot(): void {
    this.currentSnapshot = null;
    console.log('[DomService] Snapshot invalidated');
  }

  getCurrentSnapshot(): DomSnapshot | null {
    return this.currentSnapshot;
  }

  async getSerializedDom(): Promise<SerializedDom> {
    if (!this.currentSnapshot || this.currentSnapshot.isStale()) {
      await this.buildSnapshot();
    }
    return this.currentSnapshot!.serialize();
  }

  /**
   * Build complete VirtualNode tree from CDP DOM and Accessibility APIs
   *
   * CSP COMPATIBILITY (T052): CDP operates at browser level, bypassing Content-Security-Policy
   * restrictions that would block content script injection. This enables DOM access on high-security
   * sites (banking, enterprise apps) where traditional content scripts fail.
   *
   * The pierce: true parameter ensures cross-origin iframe and shadow DOM traversal.
   */
  async buildSnapshot(): Promise<DomSnapshot> {
    if (!this.isAttached) {
      throw new Error('NOT_ATTACHED: Must call attach() first');
    }

    const start = Date.now();
    console.log(`[DomService] Building snapshot for tab ${this.tabId}...`);

    // Parallel fetch: DOM tree + A11y tree
    // Note: A11y fetch may fail on some CSP-restricted pages - we handle this gracefully
    const [domTree, axTree] = await Promise.all([
      this.sendCommand<any>('DOM.getDocument', { depth: -1, pierce: true }),
      this.sendCommand<any>('Accessibility.getFullAXTree', { depth: -1 }).catch(() => null)
    ]);

    // Build enrichment map: backendNodeId → AXNode
    const axMap = new Map<number, any>();
    if (axTree?.nodes) {
      for (const axNode of axTree.nodes) {
        if (axNode.backendDOMNodeId) {
          axMap.set(axNode.backendDOMNodeId, axNode);
        }
      }
    }

    // Build VirtualNode tree
    let nodeCounter = 0;

    const buildVirtualTree = (cdpNode: any, depth: number = 0): VirtualNode | null => {
      if (depth > this.config.maxTreeDepth) {
        console.warn('[DomService] Max tree depth reached');
        return null;
      }

      nodeCounter++;
      const backendNodeId = cdpNode.backendNodeId;
      const axNode = axMap.get(backendNodeId);
      const heuristics = computeHeuristics(cdpNode.attributes);

      const vNode: VirtualNode = {
        nodeId: cdpNode.nodeId,
        backendNodeId,
        nodeType: cdpNode.nodeType,
        nodeName: cdpNode.nodeName,
        localName: cdpNode.localName,
        nodeValue: cdpNode.nodeValue,
        attributes: cdpNode.attributes,
        frameId: cdpNode.frameId,
        shadowRootType: cdpNode.shadowRootType,
        tier: classifyNode(cdpNode, axNode, heuristics),
        interactionType: determineInteractionType(cdpNode, axNode),
        accessibility: axNode
          ? {
              role: axNode.role?.value,
              name: axNode.name?.value,
              description: axNode.description?.value,
              value: axNode.value?.value,
              checked: axNode.checked?.value === 'true',
              disabled: axNode.disabled,
              expanded: axNode.expanded,
              level: axNode.level,
              required: axNode.required
            }
          : undefined,
        heuristics
      };

      // Recurse to children
      if (cdpNode.children) {
        vNode.children = cdpNode.children
          .map((c: any) => buildVirtualTree(c, depth + 1))
          .filter((n: VirtualNode | null) => n !== null) as VirtualNode[];
      }

      return vNode;
    };

    const virtualDom = buildVirtualTree(domTree.root);
    // test>>
    console.log('[DomService] Virtual DOM Tree:');
    console.log(JSON.stringify(virtualDom, null, 2));
    // test<<

    if (!virtualDom) {
      throw new Error('SNAPSHOT_FAILED: Could not build tree');
    }

    // Compute stats
    const stats: SnapshotStats = {
      totalNodes: nodeCounter,
      interactiveNodes: 0,
      semanticNodes: 0,
      nonSemanticNodes: 0,
      structuralNodes: 0,
      frameCount: 0,
      shadowRootCount: 0,
      snapshotDuration: Date.now() - start
    };

    this.computeStats(virtualDom, stats);

    // Detect framework (T068: Framework Compatibility)
    const framework = detectFramework(virtualDom);
    if (framework) {
      console.log(`[DomService] Detected framework: ${framework}`);
    }

    // Get page context
    const tab = await chrome.tabs.get(this.tabId);
    const pageContext: PageContext = {
      url: tab.url || '',
      title: tab.title || '',
      frameId: 'main',
      loaderId: '',
      viewport: { width: tab.width || 0, height: tab.height || 0 },
      frameTree: [],
      frameworkDetected: framework
    };

    this.currentSnapshot = new DomSnapshot(virtualDom, pageContext, stats);

    console.log(
      `[DomService] Snapshot built in ${stats.snapshotDuration}ms (${stats.totalNodes} nodes, ${stats.interactiveNodes} interactive)`
    );

    return this.currentSnapshot;
  }

  private async sendCommand<T>(method: string, params: any): Promise<T> {
    return chrome.debugger.sendCommand({ tabId: this.tabId }, method, params) as Promise<T>;
  }

  private async sendCommandWithRetry<T>(method: string, params: any): Promise<T> {
    for (let i = 0; i < this.config.retryAttempts; i++) {
      try {
        return await this.sendCommand<T>(method, params);
      } catch (error: any) {
        if (i === this.config.retryAttempts - 1) throw error;
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, i) * 100)); // 100ms, 200ms
      }
    }
    throw new Error('Retry exhausted');
  }

  private handleCdpEvent(source: chrome.debugger.Debuggee, method: string, params?: any): void {
    if (source.tabId !== this.tabId) return;

    if (method === 'DOM.documentUpdated') {
      console.log('[DomService] DOM updated, invalidating snapshot');
      this.invalidateSnapshot();
    }
  }

  private computeStats(node: VirtualNode, stats: SnapshotStats): void {
    if (node.tier === 'semantic') stats.semanticNodes++;
    else if (node.tier === 'non-semantic') stats.nonSemanticNodes++;
    else stats.structuralNodes++;

    if (node.interactionType) stats.interactiveNodes++;
    if (node.frameId && node.frameId !== 'main') stats.frameCount++;
    if (node.shadowRootType) stats.shadowRootCount++;

    if (node.children) {
      for (const child of node.children) {
        this.computeStats(child, stats);
      }
    }
  }

  private sendVisualEffect(type: 'ripple' | 'cursor' | 'highlight', x: number, y: number): void {
    if (!this.config.enableVisualEffects) return;

    chrome.tabs.sendMessage(this.tabId, {
      type: 'SHOW_VISUAL_EFFECT',
      effect: { type, x, y }
    }).catch((error) => {
      // Content script not available (CSP-restricted page or not injected) - graceful degradation
      // CSP Detection: If sendMessage fails consistently, page likely has Content-Security-Policy
      // that blocks script injection. Visual effects will be disabled but CDP actions continue to work.
      console.debug(`[DomService] Visual effect unavailable on tab ${this.tabId}: ${error.message || 'Content script not loaded'}. This is expected on CSP-restricted pages.`);
    });
  }

  // Action methods (T037-T045 will implement these)
  async click(nodeId: number): Promise<ActionResult> {
    const start = Date.now();

    try {
      if (!this.currentSnapshot) {
        throw new Error('NODE_NOT_FOUND: No snapshot available');
      }

      const backendNodeId = this.currentSnapshot.getBackendId(nodeId);
      if (!backendNodeId) {
        throw new Error(`NODE_NOT_FOUND: Node ${nodeId} not found in snapshot`);
      }

      // Get box model for coordinates
      const boxModel = await this.sendCommand<any>('DOM.getBoxModel', { backendNodeId });
      const { content } = boxModel.model;
      const centerX = (content[0] + content[2]) / 2;
      const centerY = (content[1] + content[5]) / 2;

      // Scroll into view
      await this.sendCommand('DOM.scrollIntoViewIfNeeded', { backendNodeId }).catch(() => {});

      // Dispatch click
      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: centerX,
        y: centerY,
        button: 'left',
        clickCount: 1
      });

      await this.sendCommand('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: centerX,
        y: centerY,
        button: 'left'
      });

      // Send visual effect
      this.sendVisualEffect('ripple', centerX, centerY);

      this.invalidateSnapshot();

      return {
        success: true,
        duration: Date.now() - start,
        changes: {
          navigationOccurred: false,
          domMutations: 1,
          scrollChanged: false,
          valueChanged: false
        },
        nodeId,
        actionType: 'click',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      this.invalidateSnapshot(); // Always invalidate, even on error

      return {
        success: false,
        duration: Date.now() - start,
        error: error.message,
        changes: {
          navigationOccurred: false,
          domMutations: 0,
          scrollChanged: false,
          valueChanged: false
        },
        nodeId,
        actionType: 'click',
        timestamp: new Date().toISOString()
      };
    }
  }

  async type(nodeId: number, text: string): Promise<ActionResult> {
    const start = Date.now();

    try {
      if (!this.currentSnapshot) {
        throw new Error('NODE_NOT_FOUND: No snapshot available');
      }

      const backendNodeId = this.currentSnapshot.getBackendId(nodeId);
      if (!backendNodeId) {
        throw new Error(`NODE_NOT_FOUND: Node ${nodeId} not found`);
      }

      // Focus element
      await this.sendCommand('DOM.focus', { backendNodeId });

      // Clear existing value
      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'a',
        code: 'KeyA',
        modifiers: 2 // Ctrl
      });
      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: 'Backspace',
        code: 'Backspace'
      });

      // Insert text
      await this.sendCommand('Input.insertText', { text });

      // Press Enter if text ends with newline
      if (text.endsWith('\n')) {
        await this.sendCommand('Input.dispatchKeyEvent', {
          type: 'keyDown',
          key: 'Enter',
          code: 'Enter'
        });
      }

      this.invalidateSnapshot();

      return {
        success: true,
        duration: Date.now() - start,
        changes: {
          navigationOccurred: false,
          domMutations: 1,
          scrollChanged: false,
          valueChanged: true,
          newValue: text
        },
        nodeId,
        actionType: 'type',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      this.invalidateSnapshot();

      return {
        success: false,
        duration: Date.now() - start,
        error: error.message,
        changes: {
          navigationOccurred: false,
          domMutations: 0,
          scrollChanged: false,
          valueChanged: false
        },
        nodeId,
        actionType: 'type',
        timestamp: new Date().toISOString()
      };
    }
  }

  async scroll(nodeId: number | 'window', direction: 'up' | 'down'): Promise<ActionResult> {
    const start = Date.now();

    try {
      const deltaY = direction === 'down' ? 500 : -500;

      if (nodeId === 'window') {
        // Scroll page
        await this.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: 0,
          y: 0,
          deltaX: 0,
          deltaY
        });
      } else {
        // Scroll element
        if (!this.currentSnapshot) {
          throw new Error('NODE_NOT_FOUND: No snapshot available');
        }

        const backendNodeId = this.currentSnapshot.getBackendId(nodeId);
        if (!backendNodeId) {
          throw new Error(`NODE_NOT_FOUND: Node ${nodeId} not found`);
        }

        const boxModel = await this.sendCommand<any>('DOM.getBoxModel', { backendNodeId });
        const { content } = boxModel.model;
        const centerX = (content[0] + content[2]) / 2;
        const centerY = (content[1] + content[5]) / 2;

        await this.sendCommand('Input.dispatchMouseEvent', {
          type: 'mouseWheel',
          x: centerX,
          y: centerY,
          deltaX: 0,
          deltaY
        });
      }

      this.invalidateSnapshot();

      return {
        success: true,
        duration: Date.now() - start,
        changes: {
          navigationOccurred: false,
          domMutations: 1,
          scrollChanged: true,
          valueChanged: false
        },
        nodeId: nodeId === 'window' ? NODE_ID_WINDOW : nodeId,
        actionType: 'scroll',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      this.invalidateSnapshot();

      return {
        success: false,
        duration: Date.now() - start,
        error: error.message,
        changes: {
          navigationOccurred: false,
          domMutations: 0,
          scrollChanged: false,
          valueChanged: false
        },
        nodeId: nodeId === 'window' ? NODE_ID_WINDOW : nodeId,
        actionType: 'scroll',
        timestamp: new Date().toISOString()
      };
    }
  }

  async keypress(key: string, modifiers?: string[]): Promise<ActionResult> {
    const start = Date.now();

    try {
      let modifierBits = 0;
      if (modifiers) {
        if (modifiers.includes('Ctrl')) modifierBits |= 2;
        if (modifiers.includes('Shift')) modifierBits |= 8;
        if (modifiers.includes('Alt')) modifierBits |= 1;
        if (modifiers.includes('Meta')) modifierBits |= 4;
      }

      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code: `Key${key.toUpperCase()}`,
        modifiers: modifierBits
      });

      await this.sendCommand('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key,
        code: `Key${key.toUpperCase()}`,
        modifiers: modifierBits
      });

      this.invalidateSnapshot();

      return {
        success: true,
        duration: Date.now() - start,
        changes: {
          navigationOccurred: false,
          domMutations: 1,
          scrollChanged: false,
          valueChanged: false
        },
        nodeId: NODE_ID_DOCUMENT,
        actionType: 'keypress',
        timestamp: new Date().toISOString()
      };
    } catch (error: any) {
      this.invalidateSnapshot();

      return {
        success: false,
        duration: Date.now() - start,
        error: error.message,
        changes: {
          navigationOccurred: false,
          domMutations: 0,
          scrollChanged: false,
          valueChanged: false
        },
        nodeId: NODE_ID_DOCUMENT,
        actionType: 'keypress',
        timestamp: new Date().toISOString()
      };
    }
  }
}
