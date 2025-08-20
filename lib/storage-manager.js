/**
 * Storage Manager Module
 * Provides unified storage abstraction with automatic sync/local fallback
 */

class HybridStorage {
  constructor(options = {}) {
    this.preferSync = options.preferSync !== false;
    this.syncSizeLimit = options.syncSizeLimit || 100 * 1024; // 100KB default
    this.namespace = options.namespace || '';
    this.cache = new Map();
    this.cacheEnabled = options.cacheEnabled !== false;
  }

  async get(key) {
    const fullKey = this._getFullKey(key);
    
    if (this.cacheEnabled && this.cache.has(fullKey)) {
      return this.cache.get(fullKey);
    }
    
    try {
      let result = null;
      
      if (this.preferSync && browser.storage.sync) {
        result = await browser.storage.sync.get(fullKey);
      }
      
      if ((!result || !result[fullKey]) && browser.storage.local) {
        result = await browser.storage.local.get(fullKey);
      }
      
      const value = result ? result[fullKey] : undefined;
      
      if (this.cacheEnabled && value !== undefined) {
        this.cache.set(fullKey, value);
      }
      
      return value;
    } catch (error) {
      console.error('Storage get error:', error);
      return undefined;
    }
  }

  async set(key, value) {
    const fullKey = this._getFullKey(key);
    const data = { [fullKey]: value };
    
    if (this.cacheEnabled) {
      this.cache.set(fullKey, value);
    }
    
    try {
      if (this.preferSync && browser.storage.sync) {
        const size = this._estimateSize(data);
        
        if (size <= this.syncSizeLimit) {
          try {
            await browser.storage.sync.set(data);
            return true;
          } catch (syncError) {
            if (syncError.message && syncError.message.includes('QUOTA')) {
              console.warn('Sync storage quota exceeded, falling back to local');
            } else {
              throw syncError;
            }
          }
        }
      }
      
      if (browser.storage.local) {
        await browser.storage.local.set(data);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  }

  async remove(key) {
    const fullKey = this._getFullKey(key);
    
    if (this.cacheEnabled) {
      this.cache.delete(fullKey);
    }
    
    try {
      const promises = [];
      
      if (browser.storage.sync) {
        promises.push(browser.storage.sync.remove(fullKey).catch(() => {}));
      }
      
      if (browser.storage.local) {
        promises.push(browser.storage.local.remove(fullKey).catch(() => {}));
      }
      
      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }

  async clear() {
    this.cache.clear();
    
    try {
      const promises = [];
      
      if (this.namespace) {
        const allKeys = await this.getAllKeys();
        const namespaceKeys = allKeys.filter(key => 
          key.startsWith(this.namespace + '_')
        );
        
        if (browser.storage.sync) {
          promises.push(browser.storage.sync.remove(namespaceKeys).catch(() => {}));
        }
        
        if (browser.storage.local) {
          promises.push(browser.storage.local.remove(namespaceKeys).catch(() => {}));
        }
      } else {
        if (browser.storage.sync) {
          promises.push(browser.storage.sync.clear().catch(() => {}));
        }
        
        if (browser.storage.local) {
          promises.push(browser.storage.local.clear().catch(() => {}));
        }
      }
      
      await Promise.all(promises);
      return true;
    } catch (error) {
      console.error('Storage clear error:', error);
      return false;
    }
  }

  async getAllKeys() {
    const keys = new Set();
    
    try {
      if (browser.storage.sync) {
        const syncData = await browser.storage.sync.get(null);
        Object.keys(syncData).forEach(key => keys.add(key));
      }
      
      if (browser.storage.local) {
        const localData = await browser.storage.local.get(null);
        Object.keys(localData).forEach(key => keys.add(key));
      }
    } catch (error) {
      console.error('Storage getAllKeys error:', error);
    }
    
    return Array.from(keys);
  }

  _getFullKey(key) {
    return this.namespace ? `${this.namespace}_${key}` : key;
  }

  _estimateSize(obj) {
    try {
      return JSON.stringify(obj).length;
    } catch (e) {
      return Infinity;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

class CacheManager {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.defaultTTL = options.defaultTTL || 60 * 60 * 1000; // 1 hour default
    this.checkInterval = options.checkInterval || 5 * 60 * 1000; // 5 minutes
    this.autoCleanup = options.autoCleanup !== false;
    
    if (this.autoCleanup) {
      this._startCleanupTimer();
    }
  }

  async get(key, options = {}) {
    const cacheKey = this._getCacheKey(key);
    const cached = await this.storage.get(cacheKey);
    
    if (!cached) return null;
    
    const now = Date.now();
    const ttl = options.ttl || this.defaultTTL;
    
    if (cached.timestamp && (now - cached.timestamp) > ttl) {
      await this.storage.remove(cacheKey);
      return null;
    }
    
    return {
      data: cached.data,
      timestamp: cached.timestamp,
      age: now - cached.timestamp,
      expired: false
    };
  }

  async set(key, data, options = {}) {
    const cacheKey = this._getCacheKey(key);
    const ttl = options.ttl || this.defaultTTL;
    
    const cacheEntry = {
      data: data,
      timestamp: Date.now(),
      ttl: ttl
    };
    
    return await this.storage.set(cacheKey, cacheEntry);
  }

  async remove(key) {
    const cacheKey = this._getCacheKey(key);
    return await this.storage.remove(cacheKey);
  }

  async cleanup() {
    const keys = await this.storage.getAllKeys();
    const now = Date.now();
    const promises = [];
    
    for (const key of keys) {
      if (!key.includes('_cache_')) continue;
      
      const cached = await this.storage.get(key);
      if (cached && cached.timestamp && cached.ttl) {
        if ((now - cached.timestamp) > cached.ttl) {
          promises.push(this.storage.remove(key));
        }
      }
    }
    
    await Promise.all(promises);
    return promises.length;
  }

  getAgeString(timestamp) {
    const now = Date.now();
    const ageMs = now - timestamp;
    const minutes = Math.floor(ageMs / (1000 * 60));
    const hours = Math.floor(ageMs / (1000 * 60 * 60));
    const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} min${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'just now';
    }
  }

  _getCacheKey(key) {
    return `cache_${key}`;
  }

  _startCleanupTimer() {
    setInterval(() => {
      this.cleanup().catch(console.error);
    }, this.checkInterval);
  }

  destroy() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
  }
}

class MigrationHelper {
  constructor(storage) {
    this.storage = storage;
    this.migrations = [];
  }

  addMigration(version, migration) {
    this.migrations.push({ version, migration });
    this.migrations.sort((a, b) => a.version - b.version);
  }

  async migrate() {
    const currentVersion = await this.storage.get('_migration_version') || 0;
    let newVersion = currentVersion;
    
    for (const { version, migration } of this.migrations) {
      if (version > currentVersion) {
        try {
          await migration(this.storage);
          newVersion = version;
          console.log(`Migration ${version} completed`);
        } catch (error) {
          console.error(`Migration ${version} failed:`, error);
          throw error;
        }
      }
    }
    
    if (newVersion > currentVersion) {
      await this.storage.set('_migration_version', newVersion);
    }
    
    return newVersion;
  }

  async migrateFromLocalToSync(keys) {
    if (!browser.storage.local || !browser.storage.sync) {
      return { success: false, error: 'Storage APIs not available' };
    }
    
    const migrated = [];
    const failed = [];
    
    for (const key of keys) {
      try {
        const localData = await browser.storage.local.get(key);
        if (localData && localData[key] !== undefined) {
          await browser.storage.sync.set({ [key]: localData[key] });
          await browser.storage.local.remove(key);
          migrated.push(key);
        }
      } catch (error) {
        failed.push({ key, error: error.message });
      }
    }
    
    return {
      success: failed.length === 0,
      migrated,
      failed
    };
  }
}

class CrossDeviceSync {
  constructor(storage, options = {}) {
    this.storage = storage;
    this.conflictResolver = options.conflictResolver || this._defaultResolver;
    this.syncKey = options.syncKey || '_sync_metadata';
  }

  async sync(key, data) {
    const metadata = await this._getMetadata(key);
    const newMetadata = {
      timestamp: Date.now(),
      deviceId: await this._getDeviceId(),
      version: (metadata?.version || 0) + 1,
      checksum: this._calculateChecksum(data)
    };
    
    await this.storage.set(key, data);
    await this.storage.set(`${key}${this.syncKey}`, newMetadata);
    
    return newMetadata;
  }

  async resolve(key) {
    const localData = await this.storage.get(key);
    const localMetadata = await this._getMetadata(key);
    
    if (!browser.storage.sync) {
      return localData;
    }
    
    try {
      const syncResult = await browser.storage.sync.get([key, `${key}${this.syncKey}`]);
      const syncData = syncResult[key];
      const syncMetadata = syncResult[`${key}${this.syncKey}`];
      
      if (!syncData || !syncMetadata) {
        return localData;
      }
      
      if (!localData || !localMetadata) {
        await this.storage.set(key, syncData);
        await this.storage.set(`${key}${this.syncKey}`, syncMetadata);
        return syncData;
      }
      
      if (localMetadata.checksum === syncMetadata.checksum) {
        return localData;
      }
      
      const resolved = await this.conflictResolver(
        { data: localData, metadata: localMetadata },
        { data: syncData, metadata: syncMetadata }
      );
      
      await this.sync(key, resolved);
      return resolved;
    } catch (error) {
      console.error('Sync resolution error:', error);
      return localData;
    }
  }

  async _getMetadata(key) {
    return await this.storage.get(`${key}${this.syncKey}`);
  }

  async _getDeviceId() {
    let deviceId = await this.storage.get('_device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await this.storage.set('_device_id', deviceId);
    }
    return deviceId;
  }

  _calculateChecksum(data) {
    const str = JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  _defaultResolver(local, remote) {
    return local.metadata.timestamp > remote.metadata.timestamp 
      ? local.data 
      : remote.data;
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    HybridStorage,
    CacheManager,
    MigrationHelper,
    CrossDeviceSync
  };
}