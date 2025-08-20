/**
 * Enhanced Sidebar Panel using modular architecture
 * Maintains 100% backward compatibility
 */

// Configuration
const CONFIG = {
  CACHE: {
    TTL_MINUTES: 60
  },
  QUICK_ACCESS: {
    MAX_ITEMS: 5,
    STORAGE_KEY: 'recentLists'
  },
  FEEDBACK: {
    DEFAULT_DURATION_MS: 3000
  },
  STATE: {
    PRESERVE_KEYS: ['searchTerm', 'currentTab']
  },
  STORAGE: {
    KEYS: {
      LISTS: 'storedLists',
      RECENT_LISTS: 'recentLists',
      PERSIST_DROPDOWN: 'persistDropdownSearch',
      LAST_UPDATED: 'lastUpdated'
    }
  }
};

// HybridStorage class (simplified inline version)
class HybridStorage {
  async get(key) {
    try {
      let result = await browser.storage.sync.get(key);
      if (!result || !result[key]) {
        result = await browser.storage.local.get(key);
      }
      return result ? result[key] : undefined;
    } catch (error) {
      console.error('Storage get error:', error);
      return undefined;
    }
  }

  async set(key, value) {
    try {
      try {
        await browser.storage.sync.set({ [key]: value });
        return true;
      } catch (syncError) {
        if (syncError.message?.includes('QUOTA')) {
          await browser.storage.local.set({ [key]: value });
          return true;
        }
        throw syncError;
      }
    } catch (error) {
      console.error('Storage set error:', error);
      return false;
    }
  }

  async remove(key) {
    try {
      await Promise.all([
        browser.storage.sync.remove(key).catch(() => {}),
        browser.storage.local.remove(key).catch(() => {})
      ]);
      return true;
    } catch (error) {
      console.error('Storage remove error:', error);
      return false;
    }
  }
}

// QuickAccessManager class
class QuickAccessManager {
  constructor(storage) {
    this.storage = storage;
    this.maxItems = CONFIG.QUICK_ACCESS.MAX_ITEMS;
    this.storageKey = CONFIG.QUICK_ACCESS.STORAGE_KEY;
    this.items = [];
  }

  async load() {
    const stored = await this.storage.get(this.storageKey);
    if (stored && Array.isArray(stored)) {
      this.items = stored.slice(0, this.maxItems);
    }
    return this.items;
  }

  async add(itemId) {
    this.items = this.items.filter(id => id !== itemId);
    this.items.unshift(itemId);
    this.items = this.items.slice(0, this.maxItems);
    await this.storage.set(this.storageKey, this.items);
    return true;
  }

  getItems() {
    return [...this.items];
  }
}

// UserFeedback class
class UserFeedback {
  constructor(statusElement) {
    this.statusElement = statusElement;
    this.defaultDuration = CONFIG.FEEDBACK.DEFAULT_DURATION_MS;
    this.currentTimer = null;
  }

  show(message, type = 'info', duration = null) {
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }

    this.statusElement.textContent = message;
    this.statusElement.className = `status-${type}`;
    this.statusElement.classList.remove('hidden');

    if (type !== 'loading') {
      const displayDuration = duration || this.defaultDuration;
      this.currentTimer = setTimeout(() => {
        this.statusElement.classList.add('hidden');
        this.currentTimer = null;
      }, displayDuration);
    }
  }

  hide() {
    if (this.currentTimer) {
      clearTimeout(this.currentTimer);
      this.currentTimer = null;
    }
    this.statusElement.classList.add('hidden');
  }
}

// StatePreserver class
class StatePreserver {
  constructor() {
    this.state = new Map();
  }

  preserve(key, value) {
    this.state.set(key, value);
    return value;
  }

  restore(key, defaultValue = null) {
    return this.state.has(key) ? this.state.get(key) : defaultValue;
  }
}

// CacheManager class
class CacheManager {
  getAgeString(timestamp) {
    const now = Date.now();
    const ageMs = now - timestamp;
    const minutes = Math.floor(ageMs / (1000 * 60));
    const hours = Math.floor(ageMs / (1000 * 60 * 60));
    
    if (hours > 0) {
      return `${(minutes / 60).toFixed(1)} hours ago`;
    } else {
      return `${minutes} min ago`;
    }
  }
}

// Main Sidebar Controller
class SidebarController {
  constructor() {
    // Initialize modules
    this.storage = new HybridStorage();
    this.quickAccess = new QuickAccessManager(this.storage);
    this.statePreserver = new StatePreserver();
    this.cacheManager = new CacheManager();
    
    // Get DOM elements
    this.elements = this.initElements();
    
    // Initialize feedback
    this.feedback = new UserFeedback(this.elements.statusMessage);
    
    // State
    this.allLists = [];
    this.filteredLists = [];
    this.currentProduct = null;
    this.currentTab = 'all';
    this.persistDropdownSearch = true;
    
    // Initialize
    this.initialize();
  }

  initElements() {
    return {
      searchInput: document.getElementById('search-input'),
      clearSearch: document.getElementById('clear-search'),
      listsContainer: document.getElementById('lists-container'),
      loadingMessage: document.getElementById('loading-message'),
      noListsMessage: document.getElementById('no-lists-message'),
      listsWrapper: document.getElementById('lists-wrapper'),
      listItems: document.getElementById('list-items'),
      recentLists: document.getElementById('recent-lists'),
      recentListItems: document.getElementById('recent-list-items'),
      listCount: document.getElementById('list-count'),
      totalLists: document.getElementById('total-lists'),
      statusMessage: document.getElementById('status-message'),
      productInfo: document.getElementById('product-info'),
      productImage: document.getElementById('product-image'),
      productTitle: document.getElementById('product-title'),
      productPrice: document.getElementById('product-price'),
      tabAll: document.getElementById('tab-all'),
      tabRecent: document.getElementById('tab-recent'),
      allLists: document.getElementById('all-lists'),
      noRecent: document.getElementById('no-recent'),
      settingsBtn: document.getElementById('settings-btn'),
      settingsPanel: document.getElementById('settings-panel'),
      persistToggle: document.getElementById('persist-search-toggle'),
      createListBtn: document.getElementById('create-list-btn'),
      createListForm: document.getElementById('create-list-form'),
      newListName: document.getElementById('new-list-name'),
      createListSubmit: document.getElementById('create-list-submit'),
      createListCancel: document.getElementById('create-list-cancel'),
      duplicateWarning: document.getElementById('duplicate-warning')
    };
  }

  async initialize() {
    await this.quickAccess.load();
    await this.loadSettings();
    this.setupEventListeners();
    this.setupMessageListeners();
    this.setupSettingsUI();
    
    // Load cached lists
    const listsLoaded = await this.loadCachedLists();
    
    // Try to get lists from background
    await this.loadFromBackground();
    
    // Only show loading if no lists were loaded from cache
    if (!listsLoaded) {
      this.elements.loadingMessage.classList.remove('hidden');
    }
    
    // Request fresh lists from content
    this.requestListsFromContent();
  }

  async loadCachedLists() {
    try {
      // Try sync first
      let stored = await browser.storage.sync.get([
        CONFIG.STORAGE.KEYS.LISTS,
        CONFIG.STORAGE.KEYS.LAST_UPDATED
      ]);
      
      // Fallback to local if sync is empty
      if (!stored.storedLists || stored.storedLists.length === 0) {
        stored = await browser.storage.local.get([
          CONFIG.STORAGE.KEYS.LISTS,
          CONFIG.STORAGE.KEYS.LAST_UPDATED
        ]);
        
        // Migrate to sync if found in local
        if (stored.storedLists && stored.storedLists.length > 0) {
          browser.storage.sync.set({
            [CONFIG.STORAGE.KEYS.LISTS]: stored.storedLists,
            [CONFIG.STORAGE.KEYS.LAST_UPDATED]: stored.lastUpdated
          }).catch(() => {});
        }
      }
      
      if (stored.storedLists && stored.storedLists.length > 0) {
        const ageStr = this.cacheManager.getAgeString(stored.lastUpdated || 0);
        
        this.allLists = stored.storedLists;
        this.filteredLists = this.allLists;
        this.displayLists(this.filteredLists);
        
        // Show cache age
        this.feedback.show(`Lists cached ${ageStr}`, 'info');
        return true;
      }
    } catch (error) {
      console.error('Error loading cached lists:', error);
    }
    
    return false;
  }

  async loadFromBackground() {
    try {
      const response = await browser.runtime.sendMessage({ 
        type: 'GET_STORED_LISTS' 
      });
      
      if (response) {
        if (response.lists && response.lists.length > 0) {
          this.allLists = response.lists;
          this.filteredLists = this.allLists;
          this.displayLists(this.filteredLists);
          
          // Store in cache
          browser.storage.sync.set({
            [CONFIG.STORAGE.KEYS.LISTS]: this.allLists,
            [CONFIG.STORAGE.KEYS.LAST_UPDATED]: Date.now()
          }).catch(() => {
            browser.storage.local.set({
              [CONFIG.STORAGE.KEYS.LISTS]: this.allLists,
              [CONFIG.STORAGE.KEYS.LAST_UPDATED]: Date.now()
            });
          });
        }
        
        if (response.productInfo) {
          this.updateProductDisplay(response.productInfo);
        }
      }
    } catch (error) {
      console.error('Error loading from background:', error);
    }
  }

  async loadSettings() {
    try {
      const res = await browser.storage.sync.get(CONFIG.STORAGE.KEYS.PERSIST_DROPDOWN);
      const persist = res?.persistDropdownSearch !== false;
      this.persistDropdownSearch = persist;
      if (this.elements.persistToggle) {
        this.elements.persistToggle.checked = persist;
      }
    } catch (_) {
      this.persistDropdownSearch = true;
      if (this.elements.persistToggle) {
        this.elements.persistToggle.checked = true;
      }
    }
  }

  setupEventListeners() {
    // Search input
    this.elements.searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value;
      this.statePreserver.preserve('searchTerm', searchTerm);
      
      if (searchTerm) {
        this.elements.clearSearch.classList.remove('hidden');
      } else {
        this.elements.clearSearch.classList.add('hidden');
      }
      
      this.filterLists(searchTerm);
    });

    // Clear search
    this.elements.clearSearch.addEventListener('click', () => {
      this.elements.searchInput.value = '';
      this.elements.clearSearch.classList.add('hidden');
      this.statePreserver.preserve('searchTerm', '');
      this.filterLists('');
    });

    // Tab switching
    this.elements.tabAll.addEventListener('click', () => this.switchTab('all'));
    this.elements.tabRecent.addEventListener('click', () => this.switchTab('recent'));

    // Create list button
    this.elements.createListBtn.addEventListener('click', () => {
      this.elements.createListBtn.classList.add('hidden');
      this.elements.createListForm.classList.remove('hidden');
      this.elements.newListName.focus();
    });

    // Create list submit
    this.elements.createListSubmit.addEventListener('click', async () => {
      const listName = this.elements.newListName.value.trim();
      if (!listName) {
        this.feedback.show('Please enter a list name', 'warning');
        this.elements.newListName.classList.add('input-error');
        setTimeout(() => {
          this.elements.newListName.classList.remove('input-error');
        }, 2000);
        return;
      }

      // Check for duplicate list name
      const duplicateList = this.allLists.find(list => 
        list.name.toLowerCase() === listName.toLowerCase()
      );
      
      if (duplicateList) {
        this.feedback.show(`A list named "${duplicateList.name}" already exists`, 'error');
        this.elements.newListName.classList.add('input-error');
        this.elements.createListForm.classList.add('form-error');
        
        // Remove error styling after 3 seconds
        setTimeout(() => {
          this.elements.newListName.classList.remove('input-error');
          this.elements.createListForm.classList.remove('form-error');
        }, 3000);
        return;
      }

      // Disable form during creation
      this.elements.createListSubmit.disabled = true;
      this.elements.createListCancel.disabled = true;
      this.elements.newListName.disabled = true;
      
      this.feedback.show('Creating list...', 'loading');

      try {
        // Send message to content script to create the list
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const response = await browser.tabs.sendMessage(tabs[0].id, {
          type: 'CREATE_LIST',
          listName: listName
        });

        if (response && response.success) {
          this.feedback.show(`List "${listName}" created successfully!`, 'success');
          
          // Reset form
          this.elements.newListName.value = '';
          this.elements.createListForm.classList.add('hidden');
          this.elements.createListBtn.classList.remove('hidden');
          
          // Request updated lists
          setTimeout(() => {
            this.requestListsFromContent();
          }, 500);
        } else {
          throw new Error(response?.error || 'Failed to create list');
        }
      } catch (error) {
        console.error('Create list error:', error);
        this.feedback.show('Failed to create list. Please try again.', 'error');
      } finally {
        // Re-enable form
        this.elements.createListSubmit.disabled = false;
        this.elements.createListCancel.disabled = false;
        this.elements.newListName.disabled = false;
      }
    });

    // Create list cancel
    this.elements.createListCancel.addEventListener('click', () => {
      this.elements.newListName.value = '';
      this.elements.newListName.classList.remove('input-error', 'input-warning');
      this.elements.createListForm.classList.remove('form-error');
      this.elements.duplicateWarning.classList.add('hidden');
      this.elements.createListForm.classList.add('hidden');
      this.elements.createListBtn.classList.remove('hidden');
    });

    // Enter key to submit
    this.elements.newListName.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.elements.createListSubmit.click();
      }
    });

    // Real-time validation as user types
    this.elements.newListName.addEventListener('input', (e) => {
      const listName = e.target.value.trim();
      
      // Remove any existing error states
      this.elements.newListName.classList.remove('input-error', 'input-warning');
      this.elements.createListForm.classList.remove('form-error');
      this.elements.duplicateWarning.classList.add('hidden');
      
      if (listName) {
        // Check for duplicate
        const duplicateList = this.allLists.find(list => 
          list.name.toLowerCase() === listName.toLowerCase()
        );
        
        if (duplicateList) {
          this.elements.newListName.classList.add('input-warning');
          this.elements.duplicateWarning.classList.remove('hidden');
          this.elements.duplicateWarning.querySelector('.warning-text').textContent = 
            `⚠️ List "${duplicateList.name}" already exists`;
        }
      }
    });
  }

  setupMessageListeners() {
    browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'UPDATE_LISTS') {
        // Preserve current search filter
        const currentSearch = this.statePreserver.restore('searchTerm', '');
        
        this.allLists = message.lists || [];
        
        // Store lists in cache
        browser.storage.sync.set({
          [CONFIG.STORAGE.KEYS.LISTS]: this.allLists,
          [CONFIG.STORAGE.KEYS.LAST_UPDATED]: Date.now()
        }).catch(err => {
          browser.storage.local.set({
            [CONFIG.STORAGE.KEYS.LISTS]: this.allLists,
            [CONFIG.STORAGE.KEYS.LAST_UPDATED]: Date.now()
          });
        });
        
        if (message.productInfo) {
          this.updateProductDisplay(message.productInfo);
        }
        
        if (currentSearch) {
          this.filterLists(currentSearch);
        } else {
          this.filteredLists = this.allLists;
          this.displayLists(this.filteredLists);
        }
        
        sendResponse({ success: true });
      } else if (message.type === 'UPDATE_PRODUCT') {
        if (message.productInfo) {
          this.updateProductDisplay(message.productInfo);
        }
        sendResponse({ success: true });
      }
      
      return true;
    });
  }

  setupSettingsUI() {
    if (this.elements.settingsBtn && this.elements.settingsPanel) {
      this.elements.settingsBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.elements.settingsPanel.classList.toggle('hidden');
      });
      
      document.addEventListener('click', (e) => {
        const within = e.target.closest?.('#settings-panel');
        const isBtn = e.target === this.elements.settingsBtn;
        if (!within && !isBtn) {
          this.elements.settingsPanel.classList.add('hidden');
        }
      });
    }
    
    if (this.elements.persistToggle) {
      this.elements.persistToggle.addEventListener('change', async (e) => {
        this.persistDropdownSearch = !!e.target.checked;
        await browser.storage.sync.set({ 
          [CONFIG.STORAGE.KEYS.PERSIST_DROPDOWN]: this.persistDropdownSearch 
        });
      });
    }
  }

  updateProductDisplay(productInfo) {
    if (!productInfo) return;
    
    this.currentProduct = productInfo;
    
    if (productInfo.image) {
      this.elements.productImage.src = productInfo.image;
      this.elements.productImage.style.display = 'block';
    } else {
      this.elements.productImage.style.display = 'none';
    }
    
    this.elements.productTitle.textContent = productInfo.title || 'Current Product';
    this.elements.productPrice.textContent = productInfo.price || '';
    this.elements.productInfo.classList.remove('hidden');
  }

  createListItem(list, isRecent = false) {
    const li = document.createElement('li');
    li.className = 'list-item';
    if (isRecent) li.classList.add('recent');
    
    const button = document.createElement('button');
    button.className = 'list-button';
    button.dataset.listId = list.id;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'list-name';
    nameSpan.textContent = list.name;
    
    const addIcon = document.createElement('span');
    addIcon.className = 'add-icon';
    addIcon.textContent = '+';
    
    button.appendChild(nameSpan);
    button.appendChild(addIcon);
    
    button.addEventListener('click', () => this.addToList(list.id, list.name));
    
    li.appendChild(button);
    return li;
  }

  async addToList(listId, listName) {
    this.feedback.show(`Adding to "${listName}"...`, 'loading');
    
    try {
      const tabsArr = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabsArr?.[0];
      
      if (!activeTab) {
        this.feedback.show('No active tab', 'error');
        return;
      }
      
      const resp = await browser.tabs.sendMessage(activeTab.id, {
        type: 'ADD_TO_LIST',
        listId
      });
      
      if (!resp || !resp.success) {
        throw new Error(resp?.error || 'Unknown add error');
      }
      
      this.feedback.show(`✓ Added to "${listName}"`, 'success');
      await this.quickAccess.add(listId);
      this.updateRecentListsDisplay();
    } catch (error) {
      console.error('Error adding to list:', error);
      const msg = error?.message || '';
      
      if (/Receiving end does not exist|Could not establish connection/i.test(msg)) {
        this.feedback.show('Could not connect to Amazon page. Open a product page and try again.', 'error');
      } else if (msg === 'not_on_product_page') {
        this.feedback.show('Please open an Amazon product page.', 'info');
      } else {
        this.feedback.show(`Failed to add to "${listName}"`, 'error');
      }
    }
  }

  displayLists(lists) {
    if (this.currentTab === 'all') {
      this.elements.listItems.innerHTML = '';
      
      if (lists.length === 0) {
        this.elements.noListsMessage.classList.remove('hidden');
        this.elements.listsWrapper.classList.add('hidden');
        this.elements.loadingMessage.classList.add('hidden');
        return;
      }
      
      lists.forEach(list => {
        this.elements.listItems.appendChild(this.createListItem(list));
      });
      
      this.elements.totalLists.textContent = `${lists.length} lists`;
    } else {
      this.updateRecentListsDisplay();
    }
    
    this.elements.loadingMessage.classList.add('hidden');
    this.elements.noListsMessage.classList.add('hidden');
    this.elements.listsWrapper.classList.remove('hidden');
  }

  updateRecentListsDisplay() {
    this.elements.recentListItems.innerHTML = '';
    
    const recentIds = this.quickAccess.getItems();
    
    if (recentIds.length === 0 || this.allLists.length === 0) {
      this.elements.noRecent.classList.remove('hidden');
      return;
    }
    
    this.elements.noRecent.classList.add('hidden');
    
    const recentLists = recentIds
      .map(id => this.allLists.find(list => list.id === id))
      .filter(Boolean);
    
    if (recentLists.length > 0) {
      recentLists.forEach(list => {
        this.elements.recentListItems.appendChild(this.createListItem(list, true));
      });
    }
  }

  switchTab(tab) {
    this.currentTab = tab;
    this.statePreserver.preserve('currentTab', tab);
    
    const searchContainer = document.getElementById('search-container');
    
    if (tab === 'all') {
      this.elements.tabAll.classList.add('active');
      this.elements.tabRecent.classList.remove('active');
      this.elements.allLists.classList.remove('hidden');
      this.elements.recentLists.classList.add('hidden');
      searchContainer.style.display = 'block';
      this.displayLists(this.filteredLists);
    } else {
      this.elements.tabAll.classList.remove('active');
      this.elements.tabRecent.classList.add('active');
      this.elements.allLists.classList.add('hidden');
      this.elements.recentLists.classList.remove('hidden');
      searchContainer.style.display = 'none';
      this.updateRecentListsDisplay();
    }
  }

  filterLists(searchTerm) {
    if (!searchTerm) {
      this.filteredLists = this.allLists;
    } else {
      const term = searchTerm.toLowerCase();
      this.filteredLists = this.allLists.filter(list => 
        list.name.toLowerCase().includes(term)
      );
    }
    
    this.displayLists(this.filteredLists);
  }

  async requestListsFromContent() {
    try {
      const tabsArr = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabsArr?.[0];
      
      if (!activeTab) {
        this.feedback.show('No active tab', 'error');
        return;
      }
      
      const resp = await browser.tabs.sendMessage(activeTab.id, { 
        type: 'REQUEST_LISTS' 
      });
      
      if (resp?.success) {
        const count = resp.listCount ?? this.allLists.length;
        if (count > 0) {
          this.feedback.show(`Found ${count} lists`, 'info');
        } else {
          this.feedback.show('No lists found yet. Opening dropdown...', 'info');
        }
      } else {
        if (resp?.error === 'not_on_product_page') {
          this.feedback.show('Please open an Amazon product page.', 'info');
        } else {
          this.feedback.show('Scanning page for lists...', 'loading');
        }
      }
    } catch (error) {
      console.error('Error requesting lists:', error);
      this.feedback.show('Could not connect to Amazon page', 'error');
    }
  }
}

// Initialize the sidebar controller
const sidebarController = new SidebarController();