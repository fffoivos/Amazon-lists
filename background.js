/**
 * Enhanced Background Script using modular architecture
 * Maintains 100% backward compatibility
 */

// Configuration
const CONFIG = {
  MESSAGE_TYPES: ['UPDATE_LISTS', 'UPDATE_PRODUCT', 'GET_STORED_LISTS', 'OPEN_SIDEBAR'],
  LOG_PREFIX: '[bg]'
};

// MessageGatekeeper class (simplified inline version)
class MessageGatekeeper {
  constructor() {
    this.allowedTypes = CONFIG.MESSAGE_TYPES;
  }

  validateMessage(message, sender) {
    if (!message || !message.type) return false;
    if (!this.allowedTypes.includes(message.type)) return false;
    if (!sender) return false;
    
    const fromExtension = this._isFromExtension(sender);
    const fromAmazon = this._isFromAmazon(sender);
    
    return fromExtension || fromAmazon;
  }

  _isFromExtension(sender) {
    try {
      const base = browser.runtime.getURL('');
      return !!(sender && sender.url && sender.url.startsWith(base));
    } catch (_) {
      return false;
    }
  }

  _isFromAmazon(sender) {
    if (!sender || !sender.tab || !sender.tab.url) return false;
    try {
      const url = new URL(sender.tab.url);
      return /(^|\.)amazon\./i.test(url.hostname);
    } catch (_) {
      return false;
    }
  }
}

// Main background script coordinator
class BackgroundCoordinator {
  constructor() {
    this.gatekeeper = new MessageGatekeeper();
    this.storedLists = [];
    this.storedProductInfo = null;
    this.setupListeners();
    console.log(`${CONFIG.LOG_PREFIX} Background script loaded`);
  }

  setupListeners() {
    // Message listener
    browser.runtime.onMessage.addListener((message, sender) => 
      this.handleMessage(message, sender)
    );

    // Toolbar button listener
    if (browser.action && typeof browser.action.onClicked?.addListener === 'function') {
      browser.action.onClicked.addListener((tab) => this.handleToolbarClick(tab));
    }

    // Installation listener
    browser.runtime.onInstalled.addListener((details) => {
      console.log(`${CONFIG.LOG_PREFIX} onInstalled`, details);
    });

    // Startup listener
    if (browser.runtime.onStartup) {
      browser.runtime.onStartup.addListener(() => {
        console.log(`${CONFIG.LOG_PREFIX} onStartup`);
      });
    }
  }

  handleMessage(message, sender) {
    // Validate message
    if (!this.gatekeeper.validateMessage(message, sender)) {
      return Promise.resolve({ success: false, error: 'unauthorized_origin' });
    }
    // Handle message based on type
    switch (message.type) {
      case 'OPEN_SIDEBAR':
        return this.handleOpenSidebar(sender);
      
      case 'UPDATE_LISTS':
        return this.handleUpdateLists(message);
      
      case 'UPDATE_PRODUCT':
        return this.handleUpdateProduct(message);
      
      case 'GET_STORED_LISTS':
        return this.handleGetStoredLists();
      
      default:
        return Promise.resolve({ success: false, error: 'unknown_message_type' });
    }
  }

  handleOpenSidebar(sender) {
    console.log(`${CONFIG.LOG_PREFIX} OPEN_SIDEBAR`, { 
      fromTabId: sender.tab?.id, 
      windowId: sender.tab?.windowId 
    });
    
    if (!browser.sidebarAction || typeof browser.sidebarAction.open !== 'function') {
      console.error(`${CONFIG.LOG_PREFIX} sidebarAction.open is not available`);
      return Promise.resolve({ 
        success: false, 
        error: 'sidebarAction.open not available' 
      });
    }
    
    const opts = sender?.tab?.windowId ? { windowId: sender.tab.windowId } : undefined;
    
    return browser.sidebarAction.open(opts)
      .then(() => ({ success: true }))
      .catch((e) => {
        console.error(`${CONFIG.LOG_PREFIX} sidebarAction.open failed:`, e);
        return { 
          success: false, 
          error: e?.message || 'sidebar open failed' 
        };
      });
  }

  handleUpdateLists(message) {
    console.log(`${CONFIG.LOG_PREFIX} UPDATE_LISTS`, { 
      count: (message.lists || []).length 
    });
    
    this.storedLists = message.lists || [];
    this.storedProductInfo = message.productInfo;
    
    // Broadcast to sidebar
    browser.runtime.sendMessage({
      type: 'UPDATE_LISTS',
      lists: this.storedLists,
      productInfo: this.storedProductInfo
    }).catch(() => {});
    
    return Promise.resolve({ success: true });
  }

  handleUpdateProduct(message) {
    console.log(`${CONFIG.LOG_PREFIX} UPDATE_PRODUCT`);
    
    this.storedProductInfo = message.productInfo;
    
    // Broadcast to sidebar
    browser.runtime.sendMessage({
      type: 'UPDATE_PRODUCT',
      productInfo: this.storedProductInfo
    }).catch(() => {});
    
    return Promise.resolve({ success: true });
  }

  handleGetStoredLists() {
    console.log(`${CONFIG.LOG_PREFIX} GET_STORED_LISTS`);
    
    return Promise.resolve({
      lists: this.storedLists,
      productInfo: this.storedProductInfo
    });
  }

  async handleToolbarClick(tab) {
    try {
      const opts = tab?.windowId ? { windowId: tab.windowId } : undefined;
      
      if (!browser.sidebarAction || typeof browser.sidebarAction.open !== 'function') {
        console.error(`${CONFIG.LOG_PREFIX} sidebarAction.open not available on toolbar click`);
        return;
      }
      
      await browser.sidebarAction.open(opts);
    } catch (e) {
      console.error(`${CONFIG.LOG_PREFIX} sidebarAction.open failed on toolbar click:`, e);
    }
  }
}

// Initialize the background coordinator
const coordinator = new BackgroundCoordinator();