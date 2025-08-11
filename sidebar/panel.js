let allLists = [];
let filteredLists = [];
let currentProduct = null;
let recentListIds = [];

const elements = {
  searchInput: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),
  refreshBtn: document.getElementById('refresh-btn'),
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
  noRecent: document.getElementById('no-recent')
};

let currentTab = 'all';

async function loadRecentLists() {
  try {
    // Try sync storage first, fallback to local
    const result = await browser.storage.sync.get('recentLists');
    recentListIds = result.recentLists || [];
    
    // Migrate from local to sync if needed
    if (recentListIds.length === 0) {
      const localResult = await browser.storage.local.get('recentLists');
      if (localResult.recentLists && localResult.recentLists.length > 0) {
        recentListIds = localResult.recentLists;
        await browser.storage.sync.set({ recentLists: recentListIds });
        await browser.storage.local.remove('recentLists');
      }
    }
  } catch (error) {
    console.error('Error loading recent lists:', error);
    recentListIds = [];
  }
}

async function saveRecentList(listId) {
  recentListIds = recentListIds.filter(id => id !== listId);
  recentListIds.unshift(listId);
  recentListIds = recentListIds.slice(0, 5);
  
  try {
    await browser.storage.sync.set({ recentLists: recentListIds });
  } catch (error) {
    console.error('Error saving recent lists:', error);
  }
}

function updateProductDisplay(productInfo) {
  if (!productInfo) return;
  
  currentProduct = productInfo;
  
  if (productInfo.image) {
    elements.productImage.src = productInfo.image;
    elements.productImage.style.display = 'block';
  } else {
    elements.productImage.style.display = 'none';
  }
  
  elements.productTitle.textContent = productInfo.title || 'Current Product';
  elements.productPrice.textContent = productInfo.price || '';
  elements.productInfo.classList.remove('hidden');
}

function createListItem(list, isRecent = false) {
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
  
  button.addEventListener('click', () => addToList(list.id, list.name));
  
  li.appendChild(button);
  return li;
}

async function addToList(listId, listName) {
  showStatus(`Adding to "${listName}"...`, 'loading');
  
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    await browser.tabs.sendMessage(tabs[0].id, {
      type: 'ADD_TO_LIST',
      listId: listId
    });
    
    showStatus(`✓ Added to "${listName}"`, 'success');
    await saveRecentList(listId);
    updateRecentListsDisplay();
  } catch (error) {
    console.error('Error adding to list:', error);
    showStatus(`Failed to add to "${listName}"`, 'error');
  }
}

function showStatus(message, type = 'info') {
  elements.statusMessage.textContent = message;
  elements.statusMessage.className = `status-${type}`;
  elements.statusMessage.classList.remove('hidden');
  
  if (type !== 'loading') {
    setTimeout(() => {
      elements.statusMessage.classList.add('hidden');
    }, 3000);
  }
}

function updateRecentListsDisplay() {
  elements.recentListItems.innerHTML = '';
  
  if (recentListIds.length === 0 || allLists.length === 0) {
    elements.noRecent.classList.remove('hidden');
    return;
  }
  
  elements.noRecent.classList.add('hidden');
  
  const recentLists = recentListIds
    .map(id => allLists.find(list => list.id === id))
    .filter(Boolean);
  
  if (recentLists.length > 0) {
    recentLists.forEach(list => {
      elements.recentListItems.appendChild(createListItem(list, true));
    });
  }
}

function displayLists(lists) {
  if (currentTab === 'all') {
    elements.listItems.innerHTML = '';
    
    if (lists.length === 0) {
      elements.noListsMessage.classList.remove('hidden');
      elements.listsWrapper.classList.add('hidden');
      elements.loadingMessage.classList.add('hidden');
      return;
    }
    
    lists.forEach(list => {
      elements.listItems.appendChild(createListItem(list));
    });
    
    elements.totalLists.textContent = `${lists.length} lists`;
  } else {
    updateRecentListsDisplay();
  }
  
  elements.loadingMessage.classList.add('hidden');
  elements.noListsMessage.classList.add('hidden');
  elements.listsWrapper.classList.remove('hidden');
}

function switchTab(tab) {
  currentTab = tab;
  const searchContainer = document.getElementById('search-container');
  
  if (tab === 'all') {
    elements.tabAll.classList.add('active');
    elements.tabRecent.classList.remove('active');
    elements.allLists.classList.remove('hidden');
    elements.recentLists.classList.add('hidden');
    searchContainer.style.display = 'block';
    displayLists(filteredLists);
  } else {
    elements.tabAll.classList.remove('active');
    elements.tabRecent.classList.add('active');
    elements.allLists.classList.add('hidden');
    elements.recentLists.classList.remove('hidden');
    searchContainer.style.display = 'none';
    updateRecentListsDisplay();
  }
}

function filterLists(searchTerm) {
  if (!searchTerm) {
    filteredLists = allLists;
  } else {
    const term = searchTerm.toLowerCase();
    filteredLists = allLists.filter(list => 
      list.name.toLowerCase().includes(term)
    );
  }
  displayLists(filteredLists);
}

async function requestListsFromContent() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url.includes('amazon.')) {
      await browser.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_LISTS' });
    } else {
      showStatus('Please navigate to an Amazon product page', 'info');
    }
  } catch (error) {
    console.error('Error requesting lists:', error);
    showStatus('Could not connect to Amazon page', 'error');
  }
}

elements.searchInput.addEventListener('input', (e) => {
  const searchTerm = e.target.value;
  if (searchTerm) {
    elements.clearSearch.classList.remove('hidden');
  } else {
    elements.clearSearch.classList.add('hidden');
  }
  filterLists(searchTerm);
});

elements.clearSearch.addEventListener('click', () => {
  elements.searchInput.value = '';
  elements.clearSearch.classList.add('hidden');
  filterLists('');
});

elements.refreshBtn.addEventListener('click', async () => {
  elements.refreshBtn.classList.add('spinning');
  showStatus('Scanning page for lists...', 'loading');
  
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs[0] && tabs[0].url.includes('amazon.')) {
      // Send request to content script
      await browser.tabs.sendMessage(tabs[0].id, { type: 'REQUEST_LISTS' });
      
      // Also inject a direct scan attempt
      const results = await browser.tabs.executeScript(tabs[0].id, {
        code: `
          (function() {
            const listElements = document.querySelectorAll('span[id^="atwl-list-name-"]');
            
            // Check for visible popover
            const popover = document.querySelector('.a-popover[aria-hidden="false"]');
            
            // Return count for debugging
            return {
              listCount: listElements.length,
              popoverVisible: !!popover
            };
          })();
        `
      });
      
      if (results && results[0]) {
        if (results[0].listCount === 0) {
          showStatus('No lists found. Open the dropdown first!', 'error');
        } else {
          showStatus(`Found ${results[0].listCount} lists`, 'info');
        }
      }
    }
  } catch (error) {
    console.error('Error:', error);
    showStatus('Error scanning page', 'error');
  }
  
  setTimeout(() => {
    elements.refreshBtn.classList.remove('spinning');
  }, 1000);
});

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'UPDATE_LISTS') {
    allLists = message.lists || [];
    filteredLists = allLists;
    
    // Store lists in sync storage for cross-device persistence
    browser.storage.sync.set({ 
      storedLists: allLists,
      lastUpdated: Date.now()
    }).catch(err => {
      // Fallback to local if sync fails (size limit)
      browser.storage.local.set({ 
        storedLists: allLists,
        lastUpdated: Date.now()
      });
    });
    
    if (message.productInfo) {
      updateProductDisplay(message.productInfo);
    }
    
    displayLists(filteredLists);
    sendResponse({ success: true });
  } else if (message.type === 'UPDATE_PRODUCT') {
    // Handle product-only updates
    if (message.productInfo) {
      updateProductDisplay(message.productInfo);
    }
    sendResponse({ success: true });
  }
  return true;
});

// Add tab click handlers
elements.tabAll.addEventListener('click', () => switchTab('all'));
elements.tabRecent.addEventListener('click', () => switchTab('recent'));

async function initialize() {
  await loadRecentLists();
  
  let listsLoaded = false;
  
  // First try to load stored lists from sync storage - IMMEDIATELY
  try {
    // Try sync first
    let stored = await browser.storage.sync.get(['storedLists', 'lastUpdated']);
    
    // Fallback to local if sync is empty
    if (!stored.storedLists || stored.storedLists.length === 0) {
      stored = await browser.storage.local.get(['storedLists', 'lastUpdated']);
      
      // Migrate to sync if found in local
      if (stored.storedLists && stored.storedLists.length > 0) {
        browser.storage.sync.set({ 
          storedLists: stored.storedLists,
          lastUpdated: stored.lastUpdated 
        }).catch(() => {});
      }
    }
    
    if (stored.storedLists && stored.storedLists.length > 0) {
      const minutesSinceUpdate = (Date.now() - (stored.lastUpdated || 0)) / (1000 * 60);
      const timeStr = minutesSinceUpdate < 60 
        ? `${Math.floor(minutesSinceUpdate)} min ago`
        : `${(minutesSinceUpdate / 60).toFixed(1)} hours ago`;
      
      allLists = stored.storedLists;
      filteredLists = allLists;
      displayLists(filteredLists);
      listsLoaded = true;
      
      // Show cache age in status
      showStatus(`Lists cached ${timeStr}`, 'info');
    }
  } catch (error) {
  }
  
  // Then try to get any stored lists from background
  try {
    const response = await browser.runtime.sendMessage({ type: 'GET_STORED_LISTS' });
    if (response) {
      if (response.lists && response.lists.length > 0) {
        allLists = response.lists;
        filteredLists = allLists;
        displayLists(filteredLists);
        listsLoaded = true;
        
        // Store in sync storage
        browser.storage.sync.set({ 
          storedLists: allLists,
          lastUpdated: Date.now()
        }).catch(() => {
          // Fallback to local if sync fails
          browser.storage.local.set({ 
            storedLists: allLists,
            lastUpdated: Date.now()
          });
        });
      }
      
      // Always update product info if available
      if (response.productInfo) {
        updateProductDisplay(response.productInfo);
      }
    }
  } catch (error) {
  }
  
  // Only show loading if no lists were loaded from cache
  if (!listsLoaded) {
    elements.loadingMessage.classList.remove('hidden');
  }
  
  // Request fresh lists from content (this will update in background)
  requestListsFromContent();
}

initialize();