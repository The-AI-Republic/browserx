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
      const tab = await chrome.tabs.get(tabId);
      if (!tab) {
        console.error(`Tab ${tabId} not found`);
        return null;
      }

      // If we don't have a group yet, create one
      if (this.groupId === null) {
        await this.createGroup(tabId);
        return this.groupId;
      }

      // Verify the group still exists
      try {
        await chrome.tabGroups.get(this.groupId);
      } catch {
        // Group doesn't exist anymore, create a new one
        console.log('Previous group no longer exists, creating new one');
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
}
