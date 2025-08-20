/**
 * Enhanced Content Script using modular architecture
 * Maintains 100% backward compatibility while using new modules
 */

// Since we're in a content script context, we need to inline the modules
// In a future iteration, we could use a build process to properly import

// Load configuration
const CONFIG = {
  PRIVACY: {
    ALLOWED_DOMAINS: ['amazon.com', 'amazon.ca', 'amazon.co.uk', 'amazon.de', 'amazon.fr', 'amazon.es', 'amazon.it', 'amazon.co.jp'],
    REQUIRE_HTTPS: true,
    TOP_FRAME_ONLY: true
  },
  INTERACTION: {
    RETRY: { MAX_ATTEMPTS: 10, BASE_DELAY_MS: 200 },
    SELECTORS: {
      PRODUCT_TITLE: ['xpath://*[@id="productTitle"]', '#productTitle'],
      ADD_TO_LIST_BUTTON: ['#add-to-wishlist-button', 'a[data-action="a-dropdown-button"]', 'span[data-action="a-dropdown-button"]', '.a-button-dropdown'],
      LIST_POPOVER: ['.a-popover[aria-hidden="false"]', '#atwl-popover-inner', '.a-dropdown'],
      CREATE_LIST_MODAL: ['.a-popover-modal[aria-label*="Create a new list"]', '.a-popover-modal']
    },
    TIMING: {
      POPOVER_WAIT_TIMEOUT_MS: 5000,
      CONFIRMATION_WAIT_TIMEOUT_MS: 1500
    }
  },
  CONVENIENCE: {
    AUTO_UPDATE: { DELAY_MS: 50, URL_POLL_INTERVAL_MS: 100 },
    FILTER: { SESSION_STORAGE_KEY: 'als_list_filter' }
  },
  MESSAGING: { DEBOUNCE_LIST_UPDATE_MS: 150 }
};

// Import module classes (inlined for content script)
class ContextValidator {
  constructor(allowedDomains = [], options = {}) {
    this.allowedDomains = allowedDomains;
    this.requireHTTPS = options.requireHTTPS !== false;
    this.topFrameOnly = options.topFrameOnly !== false;
    const escapedDomains = allowedDomains.map(d => d.replace(/\./g, '\\.'));
    this.domainPattern = new RegExp(`^(?:[^.]+\\.)*(?:${escapedDomains.join('|')})$`, 'i');
  }

  isValidContext() {
    try {
      if (this.topFrameOnly && window.top !== window) return false;
      if (this.requireHTTPS && location.protocol !== 'https:') return false;
      const host = location.hostname.toLowerCase();
      return this.domainPattern.test(host);
    } catch (_) {
      return false;
    }
  }
}

class ElementFinder {
  constructor(selectorMap = {}) {
    this.selectorMap = selectorMap;
  }

  find(elementType, container = document) {
    const selectors = this.selectorMap[elementType] || [];
    const selectorArray = typeof selectors === 'string' ? [selectors] : selectors;
    
    for (const selector of selectorArray) {
      if (selector.startsWith('xpath:')) {
        const result = document.evaluate(selector.substring(6), container, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        if (result.singleNodeValue) return result.singleNodeValue;
      } else {
        try {
          const element = container.querySelector(selector);
          if (element) return element;
        } catch (_) {}
      }
    }
    return null;
  }

  async waitFor(elementType, options = {}) {
    const container = options.container || document;
    const timeout = options.timeout || 3000;
    const condition = options.condition || ((el) => true);
    const start = Date.now();
    
    return new Promise((resolve, reject) => {
      const check = () => {
        const element = this.find(elementType, container);
        if (element && condition(element)) {
          observer.disconnect();
          return resolve(element);
        }
        if (Date.now() - start >= timeout) {
          observer.disconnect();
          return reject(new Error(`Timeout waiting for ${elementType}`));
        }
      };
      
      const observer = new MutationObserver(() => {
        try { check(); } catch (_) {}
      });
      check();
      observer.observe(container === document ? document.body : container, {
        childList: true, subtree: true, attributes: true
      });
      setTimeout(() => { try { observer.disconnect(); } catch(_) {} }, timeout);
    });
  }
}

class EventSimulator {
  click(element) {
    if (!element) return false;
    const opts = { bubbles: true, cancelable: true, view: window, buttons: 1 };
    try {
      element.scrollIntoView({ block: 'center' });
      if (typeof PointerEvent === 'function') {
        element.dispatchEvent(new PointerEvent('pointerover', opts));
        element.dispatchEvent(new PointerEvent('pointerdown', opts));
        element.dispatchEvent(new PointerEvent('pointerup', opts));
      }
      element.dispatchEvent(new MouseEvent('mouseover', opts));
      element.dispatchEvent(new MouseEvent('mousedown', opts));
      element.dispatchEvent(new MouseEvent('mouseup', opts));
      element.dispatchEvent(new MouseEvent('click', opts));
      return true;
    } catch (_) {
      return false;
    }
  }
}

class RetryManager {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.baseDelay = options.baseDelay || 1000;
  }

  async retry(operation, options = {}) {
    const maxAttempts = options.maxAttempts || this.maxAttempts;
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation(attempt);
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts) throw error;
        await new Promise(r => setTimeout(r, options.baseDelay || this.baseDelay));
      }
    }
    throw lastError;
  }
}

class AutoUpdateManager {
  constructor(options = {}) {
    this.updateDelay = options.updateDelay || 50;
    this.callbacks = new Map();
    this.lastUrl = null;
    this.lastTitle = null;
  }

  initialize() {
    this.lastUrl = window.location.href;
    this.lastTitle = document.title;
    
    // URL polling
    setInterval(() => {
      const currentUrl = window.location.href;
      const currentTitle = document.title;
      if (currentUrl !== this.lastUrl || currentTitle !== this.lastTitle) {
        this.lastUrl = currentUrl;
        this.lastTitle = currentTitle;
        this.triggerUpdate('url_change');
      }
    }, CONFIG.CONVENIENCE.AUTO_UPDATE.URL_POLL_INTERVAL_MS);
    
    // Visibility change
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.triggerUpdate('visibility_change', true);
    });
    
    // Focus events
    window.addEventListener('focus', () => this.triggerUpdate('focus', true));
    document.addEventListener('focusin', () => this.triggerUpdate('focusin', true));
    
    // Popstate
    window.addEventListener('popstate', () => this.triggerUpdate('popstate'));
    
    // Click interception
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/gp/aw/d/"]');
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

  onUpdate(id, callback) {
    this.callbacks.set(id, callback);
  }

  triggerUpdate(reason, immediate = false) {
    const delay = immediate ? 0 : this.updateDelay;
    for (const [id, callback] of this.callbacks) {
      setTimeout(() => {
        try { callback({ reason }); } catch (e) {}
      }, delay);
    }
  }
}

class FilterPersistence {
  save(value) {
    try { sessionStorage.setItem(CONFIG.CONVENIENCE.FILTER.SESSION_STORAGE_KEY, value || ''); } catch (_) {}
  }
  
  restore() {
    try { return sessionStorage.getItem(CONFIG.CONVENIENCE.FILTER.SESSION_STORAGE_KEY) || ''; } catch (_) { return ''; }
  }
  
  clear() {
    try { sessionStorage.removeItem(CONFIG.CONVENIENCE.FILTER.SESSION_STORAGE_KEY); } catch (_) {}
  }
}

// Main content script class using modules
class AmazonListSidebarContent {
  constructor() {
    // Initialize modules
    this.contextValidator = new ContextValidator(CONFIG.PRIVACY.ALLOWED_DOMAINS, {
      requireHTTPS: CONFIG.PRIVACY.REQUIRE_HTTPS,
      topFrameOnly: CONFIG.PRIVACY.TOP_FRAME_ONLY
    });
    
    this.elementFinder = new ElementFinder(CONFIG.INTERACTION.SELECTORS);
    this.eventSimulator = new EventSimulator();
    this.retryManager = new RetryManager(CONFIG.INTERACTION.RETRY);
    this.updateManager = new AutoUpdateManager(CONFIG.CONVENIENCE.AUTO_UPDATE);
    this.filterPersistence = new FilterPersistence();
    
    // State
    this.productInfo = null;
    this.userLists = [];
    this.persistDropdownSearch = true;
    this.sendListsTimer = null;
    
    // Only initialize if in valid context
    if (this.contextValidator.isValidContext()) {
      this.initialize();
    }
  }

  initialize() {
    if (this.detectProductPage()) {
      this.loadSettings();
      this.productInfo = this.extractProductInfo();
      this.interceptListData();
      this.watchProductTitle();
      this.sendProductUpdate(true);
      
      // Setup auto-update
      this.updateManager.initialize();
      this.updateManager.onUpdate('product', () => {
        if (this.detectProductPage()) {
          this.productInfo = this.extractProductInfo();
          this.sendProductUpdate(true);
        }
      });
      
      console.log('[content] Amazon List Sidebar initialized on product page:', window.location.href);
    }
  }

  detectProductPage() {
    const path = window.location.pathname.toLowerCase();
    const hasPath = /(?:^|\/)(?:dp\/|gp\/product\/|gp\/aw\/d\/)/i.test(path);
    const hasTitle = document.querySelector('#productTitle') !== null;
    const hasAsinInput = !!document.querySelector('input#ASIN, input[name="ASIN" i], meta[name="ASIN" i], [data-asin]');
    let hasCanonical = false;
    try {
      const canonHref = document.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
      if (canonHref) {
        const canonPath = new URL(canonHref, location.href).pathname.toLowerCase();
        hasCanonical = /(?:^|\/)(?:dp\/|gp\/product\/|gp\/aw\/d\/)/i.test(canonPath);
      }
    } catch (_) {}
    const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute('content') || '';
    const hasOgProduct = /product/i.test(ogType || '');
    return hasPath || hasTitle || hasAsinInput || hasCanonical || hasOgProduct;
  }

  extractProductInfo() {
    const info = {};
    
    const titleElement = this.elementFinder.find('PRODUCT_TITLE');
    info.title = titleElement ? titleElement.textContent.trim() : 'Unknown Product';
    
    const asinMatch = window.location.pathname.match(/(?:\/dp\/|\/gp\/product\/|\/gp\/aw\/d\/)([A-Z0-9]{10})/i);
    if (asinMatch) {
      info.asin = asinMatch[1];
    } else {
      const asinInput = document.querySelector('input#ASIN, input[name="ASIN" i]');
      info.asin = asinInput ? asinInput.value : (
        document.querySelector('meta[name="ASIN" i]')?.content ||
        document.querySelector('[data-asin]')?.getAttribute('data-asin') ||
        null
      );
    }
    
    const priceElement = document.querySelector('.a-price-whole, .a-price-range, .a-price.a-text-price, .a-price-value');
    info.price = priceElement ? priceElement.textContent.trim().replace(/\s+/g, ' ') : '';
    
    const imageElement = document.querySelector('#landingImage, #imgBlkFront, .a-dynamic-image');
    info.image = imageElement ? imageElement.src : '';
    
    return info;
  }

  findAddToListButton() {
    return this.elementFinder.find('ADD_TO_LIST_BUTTON');
  }

  async openListDropdownAndWait(forceNew = false) {
    const existing = document.querySelector('.a-popover[aria-hidden="false"], #atwl-popover-inner');
    if (existing && !forceNew) return existing;
    
    // If forceNew and there's an existing dropdown, close it first
    if (existing && forceNew) {
      document.body.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    }

    const btn = this.findAddToListButton();
    if (!btn) throw new Error('Add-to-list dropdown button not found');
    
    // Click the button repeatedly until dropdown appears
    let popover = null;
    const maxClickAttempts = 10;
    const startTime = Date.now();
    const timeout = CONFIG.INTERACTION.TIMING.POPOVER_WAIT_TIMEOUT_MS;
    
    for (let i = 0; i < maxClickAttempts; i++) {
      this.eventSimulator.click(btn);
      
      // Small delay between clicks
      await new Promise(r => setTimeout(r, 200));
      
      // Check if popover appeared
      popover = document.querySelector('.a-popover[aria-hidden="false"]') ||
                document.querySelector('#atwl-popover-inner') ||
                document.querySelector('.a-dropdown[aria-hidden="false"]');
      
      if (popover) {
        break;
      }
      
      // Check timeout
      if (Date.now() - startTime > timeout) {
        throw new Error('Timeout waiting for dropdown to open');
      }
    }
    
    if (!popover) {
      throw new Error('Dropdown did not open after multiple attempts');
    }
    
    await new Promise(r => setTimeout(r, 100));
    this.filterPersistence.clear();
    this.setListFilterValue(popover, '');
    this.extractListsFromDropdown(popover);
    
    return popover;
  }

  extractListsFromDropdown(container) {
    const lists = [];
    const seenIds = new Set();
    
    const listNameElements = container.querySelectorAll('span[id^="atwl-list-name-"]');
    
    listNameElements.forEach(nameElement => {
      const listId = nameElement.id.replace('atwl-list-name-', '');
      if (seenIds.has(listId)) return;
      seenIds.add(listId);
      
      const listName = nameElement.textContent.trim();
      const linkElement = container.querySelector(`#atwl-link-to-list-${listId}`);
      const privacyElement = container.querySelector(`#atwl-list-privacy-${listId}`);
      const privacy = privacyElement ? privacyElement.textContent.trim() : '';
      
      if (listName && listName !== 'Create a List') {
        lists.push({
          id: listId,
          name: listName,
          privacy: privacy,
          element: linkElement || nameElement.closest('a') || nameElement
        });
      }
    });
    
    if (lists.length > 0) {
      this.userLists = lists;
      this.queueSendListsUpdate();
    }
  }

  queueSendListsUpdate(delay = CONFIG.MESSAGING.DEBOUNCE_LIST_UPDATE_MS) {
    if (this.sendListsTimer) clearTimeout(this.sendListsTimer);
    this.sendListsTimer = setTimeout(() => {
      this.sendListsTimer = null;
      this.sendListsToSidebar();
    }, delay);
  }

  sendListsToSidebar() {
    const cleanLists = this.userLists.map(list => ({
      id: list.id,
      name: list.name,
      privacy: list.privacy
    }));

    browser.runtime.sendMessage({
      type: 'UPDATE_LISTS',
      lists: cleanLists,
      productInfo: this.productInfo
    }).catch(err => {
      console.error('Failed to send lists to sidebar:', err);
    });
  }

  sendProductUpdate(forceUpdate = false) {
    if (this.detectProductPage()) {
      const newProductInfo = this.extractProductInfo();
      
      if (forceUpdate || !this.productInfo || this.productInfo.asin !== newProductInfo.asin) {
        this.productInfo = newProductInfo;
        
        browser.runtime.sendMessage({
          type: 'UPDATE_PRODUCT',
          productInfo: this.productInfo
        }).catch(err => {});
      }
    }
  }

  async handleAddToListAction(listId) {
    return await this.retryManager.retry(async (attempt) => {
      const popover = await this.openListDropdownAndWait();
      if (!popover) throw new Error('Could not open dropdown');

      let linkElement = popover.querySelector(`#atwl-link-to-list-${listId}`);
      
      if (!linkElement) {
        this.extractListsFromDropdown(popover);
        linkElement = popover.querySelector(`#atwl-link-to-list-${listId}`);
      }
      
      if (!linkElement) throw new Error('List element not found');
      
      this.eventSimulator.click(linkElement);
      
      if (!this.persistDropdownSearch) {
        this.filterPersistence.clear();
        this.setListFilterValue(popover, '');
      }
      
      const confirmed = await this.waitForAddConfirmation(popover);
      if (confirmed) {
        if (!this.persistDropdownSearch) {
          this.filterPersistence.clear();
        }
        return true;
      }
      
      throw new Error('Confirmation not received');
    }, {
      maxAttempts: CONFIG.INTERACTION.RETRY.MAX_ATTEMPTS,
      baseDelay: CONFIG.INTERACTION.RETRY.BASE_DELAY_MS
    });
  }

  async waitForAddConfirmation(popover, timeout = CONFIG.INTERACTION.TIMING.CONFIRMATION_WAIT_TIMEOUT_MS) {
    const start = Date.now();
    return new Promise((resolve) => {
      const check = () => {
        const header = document.querySelector('.huc-atwl-header-main');
        if (header && /added|moved|already/i.test(header.textContent || '')) return resolve(true);
        
        const regions = document.querySelectorAll('.a-popover[aria-hidden="false"], #atwl-popover-inner, .a-dropdown, [role="alert"]');
        for (const el of regions) {
          const txt = (el.textContent || '').toLowerCase();
          if (/\b(item|items)\s+(added|moved)\s+to\b/.test(txt) || /already in/.test(txt) || /view your list/.test(txt)) {
            return resolve(true);
          }
        }
        
        if (Date.now() - start >= timeout) return resolve(false);
      };
      
      const observer = new MutationObserver(() => check());
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
      check();
      setTimeout(() => { observer.disconnect(); resolve(false); }, timeout);
    });
  }

  findListSearchInput(scopeEl) {
    const container = scopeEl || document.querySelector('.a-popover[aria-hidden="false"], #atwl-popover-inner, .a-dropdown') || document;
    const input = container.querySelector('input[type="search"], input[placeholder*="Search" i], input[aria-label*="Search" i], input[type="text"]');
    
    if (input && !input.dataset.alsFilterListenerAttached) {
      input.addEventListener('input', () => {
        this.filterPersistence.save(input.value);
      });
      input.dataset.alsFilterListenerAttached = '1';
    }
    
    return input;
  }

  getListFilterValue(scopeEl) {
    const input = this.findListSearchInput(scopeEl);
    return input ? input.value : '';
  }

  setListFilterValue(scopeEl, value) {
    const input = this.findListSearchInput(scopeEl);
    if (!input) return false;
    
    if (input.value !== value) {
      input.value = value || '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  interceptListData() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 1) {
            if (node.classList?.contains('a-popover') || 
                node.querySelector?.('.a-popover') ||
                node.querySelector?.('#atwl-popover-inner') ||
                node.querySelector?.('span[id^="atwl-list-name-"]')) {
              setTimeout(() => { 
                try { this.extractListsFromDropdown(node); } catch(_) {} 
              }, 100);
            }
          }
        }
        
        if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
          const target = mutation.target;
          if (target.classList?.contains('a-popover') && target.getAttribute('aria-hidden') === 'false') {
            setTimeout(() => { 
              try { this.extractListsFromDropdown(target); } catch(_) {} 
            }, 100);
          }
        }
      }
    });
    
    observer.observe(document.body, { 
      childList: true, 
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-hidden']
    });
  }

  watchProductTitle() {
    const titleElement = document.getElementById('productTitle');
    if (titleElement) {
      const observer = new MutationObserver(() => {
        this.sendProductUpdate();
      });
      
      observer.observe(titleElement, {
        childList: true,
        characterData: true,
        subtree: true
      });
    }
  }

  async loadSettings() {
    try {
      const res = await browser.storage.sync.get('persistDropdownSearch');
      this.persistDropdownSearch = (res && typeof res.persistDropdownSearch === 'boolean') 
        ? res.persistDropdownSearch 
        : true;
    } catch (_) {
      this.persistDropdownSearch = true;
    }
  }

  async createNewList(listName) {
    return await this.retryManager.retry(async (attempt) => {
      // Close any existing dropdown first to get a fresh one
      const existingDropdown = document.querySelector('.a-popover[aria-hidden="false"], #atwl-popover-inner');
      if (existingDropdown) {
        // Try to close it by clicking outside or ESC key
        document.body.click();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
      }

      // Now open a fresh dropdown (force new = true to ensure fresh dropdown)
      const dropdown = await this.openListDropdownAndWait(true);
      if (!dropdown) {
        throw new Error('Could not open list dropdown');
      }

      // Wait a bit for dropdown to fully render
      await new Promise(r => setTimeout(r, 300));

      // Find the "Create a List" link - search in document, not just dropdown
      let createLink = document.querySelector('#atwl-dd-create-list');
      if (!createLink) {
        // Sometimes the link is outside the main dropdown container
        createLink = dropdown.querySelector('#atwl-dd-create-list');
      }
      if (!createLink) {
        throw new Error('Could not find Create List link');
      }

      // Click the create link repeatedly until modal appears
      let modal = null;
      const maxClickAttempts = 10;
      for (let i = 0; i < maxClickAttempts; i++) {
        this.eventSimulator.click(createLink);
        
        // Small delay between clicks
        await new Promise(r => setTimeout(r, 200));
        
        // Check if modal appeared
        modal = document.querySelector('.a-popover-modal[aria-label*="Create a new list"]') ||
                document.querySelector('.a-popover-modal');
        
        if (modal && modal.getAttribute('aria-hidden') !== 'true') {
          break;
        }
      }

      if (!modal || modal.getAttribute('aria-hidden') === 'true') {
        throw new Error('Create list modal did not appear after multiple attempts');
      }

      // Wait a bit for modal to fully render
      await new Promise(r => setTimeout(r, 500));

      // Find and set the list name input field with retry
      const nameInput = modal.querySelector('#list-name');
      if (!nameInput) {
        throw new Error('Could not find list name input');
      }

      // Set the input value with multiple methods to ensure it takes
      for (let i = 0; i < 3; i++) {
        nameInput.focus();
        nameInput.value = '';
        nameInput.value = listName;
        
        // Dispatch multiple events to ensure the value is registered
        nameInput.dispatchEvent(new Event('focus', { bubbles: true }));
        nameInput.dispatchEvent(new Event('click', { bubbles: true }));
        nameInput.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        nameInput.dispatchEvent(new Event('change', { bubbles: true }));
        nameInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        nameInput.dispatchEvent(new Event('blur', { bubbles: true }));
        
        await new Promise(r => setTimeout(r, 100));
        
        // Verify the value was set
        if (nameInput.value === listName) {
          break;
        }
      }

      if (nameInput.value !== listName) {
        throw new Error('Could not set list name in input field');
      }

      // Find the create button
      const createButton = modal.querySelector('#wl-redesigned-create-list .a-button-input') ||
                          modal.querySelector('.a-button-input[type="submit"]') ||
                          modal.querySelector('.a-button-primary .a-button-input');
      
      if (!createButton) {
        throw new Error('Could not find create button');
      }

      // Click the create button only ONCE to avoid creating multiple lists
      this.eventSimulator.click(createButton);

      // Wait for success confirmation or modal to close
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Check if modal closed (success indicator)
      const modalStillOpen = document.querySelector('.a-popover-modal[aria-hidden="false"]');
      if (modalStillOpen) {
        // Modal still open might mean error or still processing
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Extract lists again to get the new list
      const popover = document.querySelector('.a-popover[aria-hidden="false"]') || 
                      document.querySelector('#atwl-popover-inner');
      if (popover) {
        this.extractListsFromDropdown(popover);
      }

      return { success: true, listName: listName };
    }, {
      maxAttempts: 3,
      baseDelay: 1000
    }).catch(error => {
      console.error('Failed to create list after retries:', error);
      return { success: false, error: error.message };
    });
  }
}

// Message listener
browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'ADD_TO_LIST') {
    return (async () => {
      try {
        if (!contentScript.detectProductPage()) {
          return { success: false, error: 'not_on_product_page' };
        }
        const ok = await contentScript.handleAddToListAction(message.listId);
        return { success: !!ok };
      } catch (e) {
        return { success: false, error: e?.message || 'ADD_TO_LIST failed' };
      }
    })();
  } else if (message.type === 'REQUEST_LISTS') {
    return (async () => {
      try {
        if (!contentScript.detectProductPage()) {
          return { success: false, listCount: contentScript.userLists.length, error: 'not_on_product_page' };
        }
        await contentScript.openListDropdownAndWait();
        return { success: true, listCount: contentScript.userLists.length };
      } catch (e) {
        return { success: false, listCount: contentScript.userLists.length, error: e?.message || 'REQUEST_LISTS failed' };
      }
    })();
  } else if (message.type === 'CREATE_LIST') {
    return (async () => {
      try {
        if (!contentScript.detectProductPage()) {
          return { success: false, error: 'not_on_product_page' };
        }
        const result = await contentScript.createNewList(message.listName);
        return result;
      } catch (e) {
        return { success: false, error: e?.message || 'CREATE_LIST failed' };
      }
    })();
  }
});

// Storage change listener
try {
  if (browser && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes && changes.persistDropdownSearch) {
        const nv = changes.persistDropdownSearch.newValue;
        contentScript.persistDropdownSearch = (typeof nv === 'boolean') ? nv : true;
      }
    });
  }
} catch (_) {}

// Initialize
const contentScript = new AmazonListSidebarContent();