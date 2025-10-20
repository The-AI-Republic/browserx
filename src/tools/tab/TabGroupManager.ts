/**
 * Tab Group Manager
 *
 * Manages tab grouping for BrowserX-created tabs.
 * All tabs created by the program are automatically grouped into a "browserx" group
 * with a blue color for easy identification and organization.
 */

/**
 * Tab Group Manager
 * Handles automatic grouping of tabs created by BrowserX
 */
export class TabGroupManager {
  private static instance: TabGroupManager | null = null;
  private groupId: number | null = null;
  private readonly groupTitle = 'browserx';
  private readonly groupColor: chrome.tabGroups.ColorEnum = 'blue';
  private initializationPromise: Promise<void> | null = null;
  private isInitialized = false;

  private constructor() {}

  /**
   * Get singleton instance
   */
  static getInstance(): TabGroupManager {
    if (!TabGroupManager.instance) {
      TabGroupManager.instance = new TabGroupManager();
    }
    return TabGroupManager.instance;
  }

  /**
   * Initialize the tab group manager
   * Creates or finds the BrowserX tab group
   */
  async initialize(): Promise<void> {
    // If already initialized, return immediately
    if (this.isInitialized) {
      return;
    }

    // If initialization is in progress, wait for it
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    // Start initialization
    this.initializationPromise = this.doInitialize();
    await this.initializationPromise;
    this.isInitialized = true;
    this.initializationPromise = null;
  }

  /**
   * Actual initialization logic
   */
  private async doInitialize(): Promise<void> {
    try {
      // Try to find existing BrowserX group
      const groups = await chrome.tabGroups.query({ title: this.groupTitle });

      if (groups.length > 0) {
        // Use existing group
        this.groupId = groups[0].id;
        console.log(`Found existing BrowserX tab group: ${this.groupId}`);

        // Ensure it has the correct color
        await chrome.tabGroups.update(this.groupId, {
          title: this.groupTitle,
          color: this.groupColor,
        });
      } else {
        console.log('No existing BrowserX tab group found, will create on first tab');
      }
    } catch (error) {
      console.error('Failed to initialize TabGroupManager:', error);
      this.groupId = null;
    }
  }

  /**
   * Add a tab to the BrowserX group
   * @param tabId - The ID of the tab to add to the group
   * @returns The group ID the tab was added to
   */
  async addTabToGroup(tabId: number): Promise<number | null> {
    try {
      // Ensure initialization is complete before proceeding
      await this.initialize();

      // Validate tab exists
      let tab = await chrome.tabs.get(tabId);
      if (!tab) {
        console.error(`Tab ${tabId} not found`);
        return null;
      }

      let targetWindowId: number | undefined;

      if (this.groupId !== null) {
        try {
          const groupInfo = await chrome.tabGroups.get(this.groupId);
          targetWindowId = groupInfo.windowId;
        } catch {
          // Group doesn't exist anymore, create a new one
          console.log('Previous group no longer exists, creating new one');
          this.groupId = null;
        }
      }

      const normalizedTab = await this.ensureTabInNormalWindow(tab, targetWindowId);
      if (!normalizedTab) {
        console.warn(`Tab ${tabId} could not be aligned to a normal window; skipping grouping`);
        return null;
      }
      tab = normalizedTab;
      tabId = tab.id!;

      // If we don't have a group yet, create one
      if (this.groupId === null) {
        await this.createGroup(tabId);
        return this.groupId;
      }

      // Add tab to existing group
      await chrome.tabs.group({
        tabIds: tabId,
        groupId: this.groupId,
      });

      console.log(`Added tab ${tabId} to BrowserX group ${this.groupId}`);
      return this.groupId;
    } catch (error) {
      console.error(`Failed to add tab ${tabId} to group:`, error);
      return null;
    }
  }

  /**
   * Create a new BrowserX tab group
   * @param tabId - Initial tab to add to the group
   */
  private async createGroup(tabId: number): Promise<void> {
    try {
      // Double-check tab is groupable before creating the group
      let tab = await chrome.tabs.get(tabId);
      if (!tab) {
        console.error(`Unable to create group: tab ${tabId} not found`);
        return;
      }

      const normalizedTab = await this.ensureTabInNormalWindow(tab);
      if (!normalizedTab) {
        console.warn(`Cannot create BrowserX group: tab ${tabId} could not be moved to a normal window`);
        return;
      }
      tab = normalizedTab;
      tabId = tab.id!;

      // Group the tab (this creates a new group)
      const groupId = await chrome.tabs.group({ tabIds: tabId });

      // Configure the group
      await chrome.tabGroups.update(groupId, {
        title: this.groupTitle,
        color: this.groupColor,
        collapsed: false,
      });

      this.groupId = groupId;
      console.log(`Created BrowserX tab group: ${this.groupId}`);
    } catch (error) {
      console.error('Failed to create tab group:', error);
      this.groupId = null;
    }
  }

  /**
   * Get the current BrowserX group ID
   */
  getGroupId(): number | null {
    return this.groupId;
  }

  /**
   * Remove a tab from the BrowserX group
   * @param tabId - The ID of the tab to remove from the group
   */
  async removeTabFromGroup(tabId: number): Promise<void> {
    try {
      await chrome.tabs.ungroup(tabId);
      console.log(`Removed tab ${tabId} from BrowserX group`);
    } catch (error) {
      console.error(`Failed to remove tab ${tabId} from group:`, error);
    }
  }

  /**
   * Get all tabs in the BrowserX group
   */
  async getGroupedTabs(): Promise<chrome.tabs.Tab[]> {
    if (this.groupId === null) {
      return [];
    }

    try {
      const tabs = await chrome.tabs.query({ groupId: this.groupId });
      return tabs;
    } catch (error) {
      console.error('Failed to get grouped tabs:', error);
      return [];
    }
  }

  /**
   * Close all tabs in the BrowserX group
   */
  async closeAllGroupedTabs(): Promise<void> {
    const tabs = await this.getGroupedTabs();
    if (tabs.length === 0) {
      return;
    }

    try {
      const tabIds = tabs.map(tab => tab.id).filter((id): id is number => id !== undefined);
      await chrome.tabs.remove(tabIds);
      console.log(`Closed ${tabIds.length} tabs from BrowserX group`);

      // Reset group ID since all tabs are closed
      this.groupId = null;
    } catch (error) {
      console.error('Failed to close grouped tabs:', error);
    }
  }

  /**
   * Cleanup - called when service worker is shutting down
   */
  async cleanup(): Promise<void> {
    // Nothing to clean up - groups persist across service worker restarts
    console.log('TabGroupManager cleanup complete');
  }

  /**
   * Reset singleton instance (mainly for testing)
   */
  static resetInstance(): void {
    TabGroupManager.instance = null;
  }

  /**
   * Determine whether the tab resides in a normal window that supports grouping
   */
  private async isTabInNormalWindow(tab: chrome.tabs.Tab): Promise<boolean> {
    if (tab.windowId === undefined || tab.id === undefined) {
      console.warn('Tab is missing window or tab ID, cannot determine group eligibility');
      return false;
    }

    try {
      const windowInfo = await chrome.windows.get(tab.windowId);
      if (!windowInfo || windowInfo.type !== 'normal') {
        console.warn(
          `Window ${tab.windowId} is not groupable (type: ${windowInfo?.type ?? 'unknown'})`,
        );
        return false;
      }
      return true;
    } catch (error) {
      console.warn(`Failed to determine window type for tab ${tab.id}:`, error);
      return false;
    }
  }

  /**
   * Ensure the tab is in a normal window, moving or creating one if necessary
   */
  private async ensureTabInNormalWindow(
    tab: chrome.tabs.Tab,
    targetWindowId?: number,
  ): Promise<chrome.tabs.Tab | null> {
    if (tab.id === undefined) {
      console.warn('Cannot normalize tab without a valid ID');
      return null;
    }

    try {
      if (targetWindowId !== undefined) {
        try {
          const targetWindow = await chrome.windows.get(targetWindowId);
          if (targetWindow?.type === 'normal') {
            if (tab.windowId !== targetWindowId) {
              const moved = await this.moveTabToWindow(tab.id, targetWindowId);
              if (moved) {
                return moved;
              }
              console.warn(`Failed to move tab ${tab.id} to target window ${targetWindowId}`);
              return null;
            }

            if (await this.isTabInNormalWindow(tab)) {
              return tab;
            }
          } else {
            console.warn(
              `Target window ${targetWindowId} is not normal (type: ${targetWindow?.type ?? 'unknown'})`,
            );
            targetWindowId = undefined;
          }
        } catch (error) {
          console.warn(`Unable to retrieve target window ${targetWindowId}:`, error);
          targetWindowId = undefined;
        }
      }

      if (await this.isTabInNormalWindow(tab)) {
        // Already in a normal window and no specific target required
        return tab;
      }

      const normalWindows = await chrome.windows.getAll({ windowTypes: ['normal'] });
      let candidateWindowId = normalWindows.find(win => !win.incognito)?.id ?? normalWindows[0]?.id;

      if (candidateWindowId === undefined) {
        const newWindow = await chrome.windows.create({ focused: true });
        candidateWindowId = newWindow.id ?? undefined;
      }

      if (candidateWindowId === undefined) {
        console.warn('Unable to find or create a normal window for grouping');
        return null;
      }

      return await this.moveTabToWindow(tab.id, candidateWindowId);
    } catch (error) {
      console.error(`Failed to ensure tab ${tab.id} is in a normal window:`, error);
      return null;
    }
  }

  /**
   * Move the tab to the specified window and return the updated tab details
   */
  private async moveTabToWindow(tabId: number, windowId: number): Promise<chrome.tabs.Tab | null> {
    try {
      const moved = await chrome.tabs.move(tabId, { windowId, index: -1 });
      const movedTab = Array.isArray(moved) ? moved[0] : moved;
      if (movedTab) {
        return movedTab;
      }
      // Fallback: fetch the tab directly
      return await chrome.tabs.get(tabId);
    } catch (error) {
      console.error(`Failed to move tab ${tabId} to window ${windowId}:`, error);
      return null;
    }
  }
}
