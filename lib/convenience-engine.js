/**
 * Convenience Engine Module
 * Provides user experience enhancements and automatic behaviors
 */

class AutoUpdateManager {
  constructor(options = {}) {
    this.updateDelay = options.updateDelay || 50;
    this.debounceDelay = options.debounceDelay || 150;
    this.triggers = new Set(options.triggers || ['url', 'visibility', 'focus']);
    this.callbacks = new Map();
    this.timers = new Map();
    this.lastUrl = null;
    this.lastTitle = null;
    this.isInitialized = false;
  }

  initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    
    if (this.triggers.has('url')) {
      this._watchUrlChanges();
    }
    
    if (this.triggers.has('visibility')) {
      this._watchVisibility();
    }
    
    if (this.triggers.has('focus')) {
      this._watchFocus();
    }
    
    if (this.triggers.has('popstate')) {
      this._watchPopstate();
    }
  }

  onUpdate(id, callback) {
    this.callbacks.set(id, callback);
  }

  offUpdate(id) {
    this.callbacks.delete(id);
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(id);
    }
  }

  triggerUpdate(reason, immediate = false) {
    const delay = immediate ? 0 : this.updateDelay;
    
    for (const [id, callback] of this.callbacks) {
      const existingTimer = this.timers.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      
      const timer = setTimeout(() => {
        try {
          callback({ reason, timestamp: Date.now() });
        } catch (error) {
          console.error('Update callback error:', error);
        }
        this.timers.delete(id);
      }, delay);
      
      this.timers.set(id, timer);
    }
  }

  _watchUrlChanges() {
    if (typeof window === 'undefined') return;
    
    this.lastUrl = window.location.href;
    this.lastTitle = document.title;
    
    setInterval(() => {
      const currentUrl = window.location.href;
      const currentTitle = document.title;
      
      if (currentUrl !== this.lastUrl || currentTitle !== this.lastTitle) {
        this.lastUrl = currentUrl;
        this.lastTitle = currentTitle;
        this.triggerUpdate('url_change');
      }
    }, 100);
    
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href]');
      if (link && link.href) {
        setTimeout(() => {
          if (window.location.href !== this.lastUrl) {
            this.lastUrl = window.location.href;
            this.triggerUpdate('navigation');
          }
        }, this.updateDelay);
      }
    }, true);
  }

  _watchVisibility() {
    if (typeof document === 'undefined') return;
    
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.triggerUpdate('visibility_change', true);
      }
    });
  }

  _watchFocus() {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('focus', () => {
      this.triggerUpdate('focus', true);
    });
    
    document.addEventListener('focusin', () => {
      this.triggerUpdate('focusin', true);
    });
  }

  _watchPopstate() {
    if (typeof window === 'undefined') return;
    
    window.addEventListener('popstate', () => {
      this.triggerUpdate('popstate');
    });
  }

  destroy() {
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
    this.callbacks.clear();
    this.isInitialized = false;
  }
}

class StatePreserver {
  constructor(options = {}) {
    this.storage = options.storage || new Map();
    this.preserveKeys = new Set(options.preserveKeys || []);
    this.autoSave = options.autoSave !== false;
    this.saveDelay = options.saveDelay || 500;
    this.saveTimer = null;
  }

  preserve(key, value) {
    this.storage.set(key, value);
    
    if (this.autoSave) {
      this._scheduleSave();
    }
    
    return value;
  }

  restore(key, defaultValue = null) {
    return this.storage.has(key) ? this.storage.get(key) : defaultValue;
  }

  preserveMultiple(state) {
    for (const [key, value] of Object.entries(state)) {
      if (this.preserveKeys.size === 0 || this.preserveKeys.has(key)) {
        this.storage.set(key, value);
      }
    }
    
    if (this.autoSave) {
      this._scheduleSave();
    }
  }

  restoreMultiple(keys) {
    const state = {};
    
    for (const key of keys) {
      if (this.storage.has(key)) {
        state[key] = this.storage.get(key);
      }
    }
    
    return state;
  }

  clear(key = null) {
    if (key) {
      this.storage.delete(key);
    } else {
      this.storage.clear();
    }
  }

  _scheduleSave() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    
    this.saveTimer = setTimeout(() => {
      this._save();
      this.saveTimer = null;
    }, this.saveDelay);
  }

  async _save() {
    if (typeof browser !== 'undefined' && browser.storage) {
      const state = {};
      
      for (const [key, value] of this.storage) {
        state[`state_${key}`] = value;
      }
      
      try {
        await browser.storage.local.set(state);
      } catch (error) {
        console.error('State save error:', error);
      }
    }
  }

  async load() {
    if (typeof browser !== 'undefined' && browser.storage) {
      try {
        const stored = await browser.storage.local.get(null);
        
        for (const [key, value] of Object.entries(stored)) {
          if (key.startsWith('state_')) {
            const stateKey = key.substring(6);
            this.storage.set(stateKey, value);
          }
        }
      } catch (error) {
        console.error('State load error:', error);
      }
    }
  }
}

class QuickAccessManager {
  constructor(options = {}) {
    this.maxItems = options.maxItems || 5;
    this.storage = options.storage;
    this.storageKey = options.storageKey || 'quickAccess';
    this.items = [];
    this.callbacks = new Set();
  }

  async load() {
    if (this.storage) {
      const stored = await this.storage.get(this.storageKey);
      if (stored && Array.isArray(stored)) {
        this.items = stored.slice(0, this.maxItems);
      }
    }
    return this.items;
  }

  async add(item) {
    if (!item || !item.id) return false;
    
    this.items = this.items.filter(i => i.id !== item.id);
    
    this.items.unshift({
      ...item,
      timestamp: Date.now()
    });
    
    this.items = this.items.slice(0, this.maxItems);
    
    await this._save();
    this._notifyChange();
    
    return true;
  }

  async remove(itemId) {
    const initialLength = this.items.length;
    this.items = this.items.filter(i => i.id !== itemId);
    
    if (this.items.length < initialLength) {
      await this._save();
      this._notifyChange();
      return true;
    }
    
    return false;
  }

  async clear() {
    this.items = [];
    await this._save();
    this._notifyChange();
  }

  getItems() {
    return [...this.items];
  }

  getItem(itemId) {
    return this.items.find(i => i.id === itemId);
  }

  onChange(callback) {
    this.callbacks.add(callback);
    
    return () => {
      this.callbacks.delete(callback);
    };
  }

  async _save() {
    if (this.storage) {
      await this.storage.set(this.storageKey, this.items);
    }
  }

  _notifyChange() {
    for (const callback of this.callbacks) {
      try {
        callback(this.items);
      } catch (error) {
        console.error('QuickAccess callback error:', error);
      }
    }
  }
}

class UserFeedback {
  constructor(options = {}) {
    this.defaultDuration = options.defaultDuration || 3000;
    this.types = options.types || ['info', 'success', 'warning', 'error', 'loading'];
    this.queue = [];
    this.current = null;
    this.callbacks = new Map();
    this.timers = new Map();
  }

  show(message, type = 'info', options = {}) {
    const feedback = {
      id: this._generateId(),
      message,
      type: this.types.includes(type) ? type : 'info',
      duration: type === 'loading' ? 0 : (options.duration || this.defaultDuration),
      timestamp: Date.now(),
      ...options
    };
    
    if (options.immediate) {
      this._clearCurrent();
      this._display(feedback);
    } else {
      this.queue.push(feedback);
      this._processQueue();
    }
    
    return feedback.id;
  }

  hide(id) {
    if (this.current && this.current.id === id) {
      this._clearCurrent();
      this._processQueue();
      return true;
    }
    
    const index = this.queue.findIndex(f => f.id === id);
    if (index !== -1) {
      this.queue.splice(index, 1);
      return true;
    }
    
    return false;
  }

  clear() {
    this._clearCurrent();
    this.queue = [];
  }

  onShow(callback) {
    const id = this._generateId();
    this.callbacks.set(id, callback);
    return () => this.callbacks.delete(id);
  }

  _display(feedback) {
    this.current = feedback;
    
    for (const callback of this.callbacks.values()) {
      try {
        callback(feedback);
      } catch (error) {
        console.error('Feedback callback error:', error);
      }
    }
    
    if (feedback.duration > 0) {
      const timer = setTimeout(() => {
        if (this.current && this.current.id === feedback.id) {
          this._clearCurrent();
          this._processQueue();
        }
      }, feedback.duration);
      
      this.timers.set(feedback.id, timer);
    }
  }

  _clearCurrent() {
    if (this.current) {
      const timer = this.timers.get(this.current.id);
      if (timer) {
        clearTimeout(timer);
        this.timers.delete(this.current.id);
      }
      
      for (const callback of this.callbacks.values()) {
        try {
          callback(null);
        } catch (error) {
          console.error('Feedback callback error:', error);
        }
      }
      
      this.current = null;
    }
  }

  _processQueue() {
    if (!this.current && this.queue.length > 0) {
      const feedback = this.queue.shift();
      this._display(feedback);
    }
  }

  _generateId() {
    return `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

class FilterPersistence {
  constructor(options = {}) {
    this.storage = options.storage || (
      typeof sessionStorage !== 'undefined' ? sessionStorage : new Map()
    );
    this.prefix = options.prefix || 'filter_';
    this.autoRestore = options.autoRestore !== false;
  }

  save(key, value) {
    const fullKey = `${this.prefix}${key}`;
    
    try {
      if (this.storage === sessionStorage) {
        this.storage.setItem(fullKey, value);
      } else {
        this.storage.set(fullKey, value);
      }
      return true;
    } catch (error) {
      console.error('Filter save error:', error);
      return false;
    }
  }

  restore(key, defaultValue = '') {
    const fullKey = `${this.prefix}${key}`;
    
    try {
      if (this.storage === sessionStorage) {
        return this.storage.getItem(fullKey) || defaultValue;
      } else {
        return this.storage.get(fullKey) || defaultValue;
      }
    } catch (error) {
      console.error('Filter restore error:', error);
      return defaultValue;
    }
  }

  clear(key = null) {
    try {
      if (key) {
        const fullKey = `${this.prefix}${key}`;
        if (this.storage === sessionStorage) {
          this.storage.removeItem(fullKey);
        } else {
          this.storage.delete(fullKey);
        }
      } else {
        if (this.storage === sessionStorage) {
          const keys = [];
          for (let i = 0; i < this.storage.length; i++) {
            const k = this.storage.key(i);
            if (k && k.startsWith(this.prefix)) {
              keys.push(k);
            }
          }
          keys.forEach(k => this.storage.removeItem(k));
        } else {
          for (const k of this.storage.keys()) {
            if (k.startsWith(this.prefix)) {
              this.storage.delete(k);
            }
          }
        }
      }
      return true;
    } catch (error) {
      console.error('Filter clear error:', error);
      return false;
    }
  }

  attachToInput(input, key) {
    if (!input) return;
    
    if (this.autoRestore) {
      const restored = this.restore(key);
      if (restored) {
        input.value = restored;
      }
    }
    
    input.addEventListener('input', () => {
      this.save(key, input.value);
    });
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    AutoUpdateManager,
    StatePreserver,
    QuickAccessManager,
    UserFeedback,
    FilterPersistence
  };
}