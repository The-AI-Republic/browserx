/**
 * T030-T032: Chrome storage wrapper for configuration
 */

import type { IAgentConfig, IConfigStorage, IStorageInfo } from '../config/types';
import { ConfigStorageError } from '../config/types';
import { STORAGE_KEYS, CONFIG_LIMITS } from '../config/defaults';

export class ConfigStorage implements IConfigStorage {
  private readonly syncKey = STORAGE_KEYS.CONFIG;
  private readonly versionKey = STORAGE_KEYS.CONFIG_VERSION;
  private cache: IAgentConfig | null = null;
  private cacheTimestamp: number = 0;
  private readonly cacheTTL = 5000; // 5 seconds cache

  /**
   * T030: Get configuration from storage
   */
  async get(): Promise<IAgentConfig | null> {
    // Check cache first
    if (this.cache && Date.now() - this.cacheTimestamp < this.cacheTTL) {
      return this.cache;
    }

    try {
      // T031: Try sync storage first
      const data = await this.getFromSyncStorage();

      if (data) {
        this.cache = data;
        this.cacheTimestamp = Date.now();
        return data;
      }

      // T032: Fallback to local storage for large data
      const localData = await this.getFromLocalStorage();
      if (localData) {
        this.cache = localData;
        this.cacheTimestamp = Date.now();
        return localData;
      }

      return null;
    } catch (error) {
      throw new ConfigStorageError('read', `Failed to read config: ${error}`);
    }
  }

  /**
   * T030: Set configuration in storage
   */
  async set(config: IAgentConfig): Promise<void> {
    try {
      const size = this.calculateSize(config);

      // T031: Check if fits in sync storage
      if (size <= CONFIG_LIMITS.SYNC_ITEM_BYTES) {
        await this.setInSyncStorage(config);
        // Clear any local storage fallback
        await this.clearLocalStorage();
      } else {
        // T032: Use local storage for large configs
        await this.setInLocalStorage(config);
        // Store a marker in sync storage
        await this.setSyncMarker();
      }

      // Update cache
      this.cache = config;
      this.cacheTimestamp = Date.now();

      // Store version
      await this.setVersion(config.version);
    } catch (error) {
      throw new ConfigStorageError('write', `Failed to save config: ${error}`);
    }
  }

  /**
   * T030: Clear all configuration data
   */
  async clear(): Promise<void> {
    try {
      await Promise.all([
        chrome.storage.sync.remove([this.syncKey, this.versionKey]),
        chrome.storage.local.remove([this.syncKey])
      ]);

      this.cache = null;
      this.cacheTimestamp = 0;
    } catch (error) {
      throw new ConfigStorageError('delete', `Failed to clear config: ${error}`);
    }
  }

  /**
   * T031: Get storage usage information
   */
  async getStorageInfo(): Promise<IStorageInfo> {
    try {
      const [syncBytes, localBytes] = await Promise.all([
        chrome.storage.sync.getBytesInUse(this.syncKey),
        chrome.storage.local.getBytesInUse(this.syncKey)
      ]);

      const used = syncBytes + localBytes;
      const quota = syncBytes > 0 ? CONFIG_LIMITS.SYNC_QUOTA_BYTES : CONFIG_LIMITS.LOCAL_QUOTA_BYTES;

      return {
        used,
        quota,
        percentUsed: used / quota
      };
    } catch (error) {
      throw new ConfigStorageError('read', `Failed to get storage info: ${error}`);
    }
  }

  /**
   * T031: Get from sync storage with quota management
   */
  private async getFromSyncStorage(): Promise<IAgentConfig | null> {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.get([this.syncKey], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[this.syncKey] || null);
        }
      });
    });
  }

  /**
   * T032: Get from local storage (fallback)
   */
  private async getFromLocalStorage(): Promise<IAgentConfig | null> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get([this.syncKey], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[this.syncKey] || null);
        }
      });
    });
  }

  /**
   * T031: Set in sync storage with quota check
   */
  private async setInSyncStorage(config: IAgentConfig): Promise<void> {
    // Check quota before writing
    const currentUsage = await chrome.storage.sync.getBytesInUse();
    const configSize = this.calculateSize(config);

    if (currentUsage + configSize > CONFIG_LIMITS.SYNC_QUOTA_BYTES) {
      throw new Error(`Sync storage quota exceeded: ${currentUsage + configSize} > ${CONFIG_LIMITS.SYNC_QUOTA_BYTES}`);
    }

    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [this.syncKey]: config }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * T032: Set in local storage for large data
   */
  private async setInLocalStorage(config: IAgentConfig): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [this.syncKey]: config }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Set a marker in sync storage indicating data is in local storage
   */
  private async setSyncMarker(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set(
        { [this.syncKey]: { useLocalStorage: true } },
        () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve();
          }
        }
      );
    });
  }

  /**
   * Clear local storage
   */
  private async clearLocalStorage(): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([this.syncKey], () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Set version in storage
   */
  private async setVersion(version: string): Promise<void> {
    return new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [this.versionKey]: version }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Calculate size of object in bytes
   */
  private calculateSize(obj: any): number {
    return new Blob([JSON.stringify(obj)]).size;
  }

  /**
   * T031: Monitor storage quota and emit warnings
   */
  async checkQuotaWarning(threshold: number = 0.8): Promise<boolean> {
    const info = await this.getStorageInfo();
    return info.percentUsed >= threshold;
  }

  /**
   * T032: Split large config into chunks if needed
   */
  async setChunked(config: IAgentConfig): Promise<void> {
    const size = this.calculateSize(config);

    if (size <= CONFIG_LIMITS.SYNC_ITEM_BYTES) {
      return this.set(config);
    }

    // Split profiles into separate keys if needed
    if (config.profiles && Object.keys(config.profiles).length > 0) {
      const baseConfig = { ...config, profiles: {} };
      const baseSize = this.calculateSize(baseConfig);

      if (baseSize <= CONFIG_LIMITS.SYNC_ITEM_BYTES) {
        // Store base config in sync
        await this.setInSyncStorage(baseConfig);

        // Store profiles separately
        for (const [name, profile] of Object.entries(config.profiles)) {
          const profileKey = `${STORAGE_KEYS.CONFIG}_profile_${name}`;
          await new Promise((resolve, reject) => {
            chrome.storage.sync.set({ [profileKey]: profile }, () => {
              if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
              } else {
                resolve(undefined);
              }
            });
          });
        }

        return;
      }
    }

    // If still too large, use local storage
    return this.setInLocalStorage(config);
  }
}