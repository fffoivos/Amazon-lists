/**
 * Privacy Guardian Module
 * Enforces privacy and security policies throughout the extension
 */

class ContextValidator {
  constructor(allowedDomains = [], options = {}) {
    this.allowedDomains = allowedDomains;
    this.requireHTTPS = options.requireHTTPS !== false;
    this.topFrameOnly = options.topFrameOnly !== false;
    this.domainPattern = this._buildDomainPattern(allowedDomains);
  }

  _buildDomainPattern(domains) {
    if (!domains || domains.length === 0) return null;
    const escapedDomains = domains.map(d => d.replace(/\./g, '\\.'));
    return new RegExp(`^(?:[^.]+\\.)*(?:${escapedDomains.join('|')})$`, 'i');
  }

  isValidContext() {
    try {
      if (this.topFrameOnly && window.top !== window) {
        return false;
      }
      
      if (this.requireHTTPS && location.protocol !== 'https:') {
        return false;
      }
      
      if (this.domainPattern) {
        const host = location.hostname.toLowerCase();
        return this.domainPattern.test(host);
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }

  validateOrigin(origin) {
    if (!origin) return false;
    
    try {
      const url = new URL(origin);
      
      if (this.requireHTTPS && url.protocol !== 'https:') {
        return false;
      }
      
      if (this.domainPattern) {
        return this.domainPattern.test(url.hostname.toLowerCase());
      }
      
      return true;
    } catch (e) {
      return false;
    }
  }
}

class MessageGatekeeper {
  constructor(options = {}) {
    this.allowedMessageTypes = options.allowedMessageTypes || [];
    this.requireExtensionOrigin = options.requireExtensionOrigin !== false;
    this.requireAmazonOrigin = options.requireAmazonOrigin !== false;
    this.amazonPattern = /(?:^|\.)amazon\./i;
  }

  validateMessage(message, sender) {
    if (!message || !message.type) return false;
    
    if (this.allowedMessageTypes.length > 0 && 
        !this.allowedMessageTypes.includes(message.type)) {
      return false;
    }
    
    if (!sender) return false;
    
    const fromExtension = this._isFromExtension(sender);
    const fromAmazon = this._isFromAmazon(sender);
    
    if (this.requireExtensionOrigin && !fromExtension && !fromAmazon) {
      return false;
    }
    
    if (this.requireAmazonOrigin && !fromAmazon && !fromExtension) {
      return false;
    }
    
    return fromExtension || fromAmazon;
  }

  _isFromExtension(sender) {
    try {
      if (typeof browser === 'undefined' || !browser.runtime) return false;
      const base = browser.runtime.getURL('');
      return !!(sender && sender.url && sender.url.startsWith(base));
    } catch (e) {
      return false;
    }
  }

  _isFromAmazon(sender) {
    if (!sender || !sender.tab || !sender.tab.url) return false;
    
    try {
      const url = new URL(sender.tab.url);
      return this.amazonPattern.test(url.hostname);
    } catch (e) {
      return false;
    }
  }
}

class DataMinimizer {
  constructor(options = {}) {
    this.stripDOMReferences = options.stripDOMReferences !== false;
    this.maxStringLength = options.maxStringLength || 1000;
    this.allowedFields = options.allowedFields || null;
  }

  sanitize(data) {
    if (!data) return data;
    
    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item));
    }
    
    if (typeof data === 'object' && data !== null) {
      const sanitized = {};
      
      for (const [key, value] of Object.entries(data)) {
        if (this.allowedFields && !this.allowedFields.includes(key)) {
          continue;
        }
        
        if (this.stripDOMReferences && this._isDOMElement(value)) {
          continue;
        }
        
        sanitized[key] = this.sanitize(value);
      }
      
      return sanitized;
    }
    
    if (typeof data === 'string' && data.length > this.maxStringLength) {
      return data.substring(0, this.maxStringLength) + '...';
    }
    
    return data;
  }

  _isDOMElement(obj) {
    try {
      return obj instanceof Element || obj instanceof Document || 
             (typeof HTMLElement !== 'undefined' && obj instanceof HTMLElement);
    } catch (e) {
      return false;
    }
  }

  stripSensitive(data, sensitiveFields = []) {
    if (!data || typeof data !== 'object') return data;
    
    const cleaned = { ...data };
    
    for (const field of sensitiveFields) {
      delete cleaned[field];
    }
    
    return cleaned;
  }
}

class PermissionManager {
  constructor() {
    this.cache = new Map();
  }

  async hasPermission(permission) {
    if (this.cache.has(permission)) {
      return this.cache.get(permission);
    }
    
    try {
      if (typeof browser === 'undefined' || !browser.permissions) {
        return false;
      }
      
      const result = await browser.permissions.contains({ 
        permissions: [permission] 
      });
      
      this.cache.set(permission, result);
      return result;
    } catch (e) {
      this.cache.set(permission, false);
      return false;
    }
  }

  async requestPermission(permission) {
    try {
      if (typeof browser === 'undefined' || !browser.permissions) {
        return false;
      }
      
      const granted = await browser.permissions.request({ 
        permissions: [permission] 
      });
      
      if (granted) {
        this.cache.set(permission, true);
      }
      
      return granted;
    } catch (e) {
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ContextValidator,
    MessageGatekeeper,
    DataMinimizer,
    PermissionManager
  };
}