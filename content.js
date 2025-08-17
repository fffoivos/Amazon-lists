let productInfo = null;
let userLists = [];
let addToListButton = null;
let persistDropdownSearch = true; // default: persist search results after click

function detectProductPage() {
  const isProductPage = 
    window.location.pathname.includes('/dp/') || 
    window.location.pathname.includes('/gp/product/') ||
    document.querySelector('#productTitle') !== null;
  
  return isProductPage;
}

// Load user setting for whether Amazon dropdown search should persist after click
async function loadPersistSetting() {
  try {
    const res = await browser.storage.sync.get('persistDropdownSearch');
    persistDropdownSearch = (res && typeof res.persistDropdownSearch === 'boolean') ? res.persistDropdownSearch : true;
  } catch (_) {
    persistDropdownSearch = true;
  }
}

function extractProductInfo() {
  const info = {};
  
  // Use XPath to get the exact product title element
  const titleXPath = document.evaluate('//*[@id="productTitle"]', document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
  const titleElement = titleXPath.singleNodeValue || document.querySelector('#productTitle');
  info.title = titleElement ? titleElement.textContent.trim() : 'Unknown Product';
  
  const asinMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
  info.asin = asinMatch ? asinMatch[1] : null;
  
  // Get price but ensure it's clean
  const priceElement = document.querySelector('.a-price-whole, .a-price-range, .a-price.a-text-price, .a-price-value');
  if (priceElement) {
    // Clean up the price text
    info.price = priceElement.textContent.trim().replace(/\s+/g, ' ');
  } else {
    info.price = '';
  }
  
  const imageElement = document.querySelector('#landingImage, #imgBlkFront, .a-dynamic-image');
  info.image = imageElement ? imageElement.src : '';
  
  return info;
}

function findAddToListButton() {
  // IMPORTANT: We need the dropdown arrow button, NOT the submit button
  // The dropdown arrow opens the list selection, the submit adds to default wishlist
  
  // First, try to find the dropdown arrow/trigger button specifically
  const dropdownSelectors = [
    '#add-to-wishlist-button', // The dropdown button (not submit)
    'a[data-action="a-dropdown-button"]',
    'span[data-action="a-dropdown-button"]',
    '.a-button-dropdown',
    '[aria-label*="Add to List"] .a-dropdown-button',
    '[data-action="add-to-registry-baby-button"]', // For baby registry
    'span.a-button-dropdown',
    'a.a-button-dropdown'
  ];
  
  for (const selector of dropdownSelectors) {
    const element = document.querySelector(selector);
    if (element) {
      return element;
    }
  }
  
  // Look for elements with the dropdown arrow icon
  const arrowButtons = document.querySelectorAll('.a-button-icon, .a-icon-dropdown');
  for (const arrow of arrowButtons) {
    const parent = arrow.closest('a, button, span[role="button"]');
    if (parent && parent.id && parent.id.includes('wishlist')) {
      return parent;
    }
  }
  
  // Avoid these selectors as they submit directly to wishlist
  const avoidSelectors = [
    '#add-to-wishlist-button-submit',
    'input[name="submit.add-to-registry.wishlist"]'
  ];
  
  // Last resort: look for any wishlist-related button that's NOT a submit
  const fallbackElements = document.querySelectorAll('[id*="wishlist"]:not([id*="submit"])');
  for (const elem of fallbackElements) {
    if (elem.tagName === 'A' || elem.tagName === 'BUTTON' || elem.getAttribute('role') === 'button') {
      return elem;
    }
  }
  
  return null;
}

// Helper: wait for an element matching selector to appear/meet condition
async function waitForElement(selector, { root = document, timeout = 3000, condition = (el) => true } = {}) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const el = root.querySelector(selector);
      if (el && condition(el)) {
        observer.disconnect();
        return resolve(el);
      }
      if (Date.now() - start >= timeout) {
        observer.disconnect();
        return reject(new Error(`Timeout waiting for ${selector}`));
      }
    };
    const observer = new MutationObserver(() => {
      try { check(); } catch (_) {}
    });
    // Initial check
    try { check(); } catch (_) {}
    observer.observe(root === document ? document.body : root, { childList: true, subtree: true, attributes: true });
    setTimeout(() => { try { observer.disconnect(); } catch(_) {} }, timeout);
  });
}

// Helper: dispatch a robust mouse interaction sequence on a target element
function dispatchMouseSequence(target) {
  if (!target) return;
  const opts = { bubbles: true, cancelable: true, view: window, buttons: 1 };
  const hasPointer = typeof window.PointerEvent === 'function';
  try { if (hasPointer) target.dispatchEvent(new PointerEvent('pointerover', opts)); } catch(_) {}
  try { target.dispatchEvent(new MouseEvent('mouseover', opts)); } catch(_) {}
  try { if (hasPointer) target.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch(_) {}
  try { target.dispatchEvent(new MouseEvent('mousedown', opts)); } catch(_) {}
  try { if (hasPointer) target.dispatchEvent(new PointerEvent('pointerup', opts)); } catch(_) {}
  try { target.dispatchEvent(new MouseEvent('mouseup', opts)); } catch(_) {}
  try { target.dispatchEvent(new MouseEvent('click', opts)); } catch(_) {}
}

// Persist the user's list search filter across reopens/navigation until success
function setPersistentListFilter(value) {
  try { sessionStorage.setItem('als_list_filter', value || ''); } catch (_) {}
}
function getPersistentListFilter() {
  try { return sessionStorage.getItem('als_list_filter') || ''; } catch (_) { return ''; }
}
function clearPersistentListFilter() {
  try { sessionStorage.removeItem('als_list_filter'); } catch (_) {}
}

// Helpers: list popover search filter handling
function findListSearchInput(scopeEl) {
  const pop = (scopeEl && scopeEl.querySelector) ? scopeEl : document.querySelector('.a-popover[aria-hidden="false"], #atwl-popover-inner, .a-dropdown');
  const container = pop || document;
  const input = container.querySelector('input[type="search"], input[placeholder*="Search" i], input[aria-label*="Search" i], input[type="text"]');
  if (input && !input.dataset.alsFilterListenerAttached) {
    input.addEventListener('input', () => { try { setPersistentListFilter(input.value); } catch (_) {} });
    input.dataset.alsFilterListenerAttached = '1';
  }
  return input;
}

function getListFilterValue(scopeEl) {
  try {
    const input = findListSearchInput(scopeEl);
    return (input && typeof input.value === 'string') ? input.value : '';
  } catch (_) {
    return '';
  }
}

function setListFilterValue(scopeEl, value) {
  try {
    const input = findListSearchInput(scopeEl);
    if (!input) return false;
    if ((input.value || '') === (value || '')) return true;
    input.value = value || '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (_) {
    return false;
  }
}

// Helper: wait for amazon list popover to be visible
async function waitForPopoverVisible(timeout = 4000) {
  const condition = (el) => el.getAttribute('aria-hidden') !== 'true';
  try {
    const pop = await waitForElement('.a-popover', { timeout, condition });
    return pop;
  } catch (e) {
    // Fallback: inner container appears without aria-hidden
    try {
      await waitForElement('#atwl-popover-inner, .a-dropdown', { timeout });
      return document.querySelector('.a-popover[aria-hidden="false"], #atwl-popover-inner, .a-dropdown');
    } catch (_) {
      throw e;
    }
  }
}

// Open the add-to-list dropdown reliably and wait for it to be interactive
async function openListDropdownAndWait() {
  // If already visible, return it
  const existing = document.querySelector('.a-popover[aria-hidden="false"], #atwl-popover-inner');
  if (existing) return existing;

  const btn = findAddToListButton();
  if (!btn) throw new Error('Add-to-list dropdown button not found');
  try { btn.scrollIntoView({ block: 'center' }); } catch(_) {}
  dispatchMouseSequence(btn);
  const popover = await waitForPopoverVisible(5000);
  // Small delay to let content render
  await new Promise(r => setTimeout(r, 100));
  // Restore any persisted filter if present
  const persisted = getPersistentListFilter();
  if (persistDropdownSearch && persisted) {
    try { setListFilterValue(popover, persisted); } catch (_) {}
  }
  extractListsFromDropdown(popover);
  return popover;
}

// Wait for confirmation after clicking a list entry
async function waitForAddConfirmation(popover, timeout = 5000) {
  const start = Date.now();
  function isSuccessVisible() {
    const header = document.querySelector('.huc-atwl-header-main');
    if (header && /added|moved|already/i.test((header.textContent || ''))) return true;
    const regions = document.querySelectorAll('.a-popover[aria-hidden="false"], #atwl-popover-inner, .a-dropdown, [role="alert"]');
    for (const el of regions) {
      const txt = (el.textContent || '').toLowerCase();
      if (/\b(item|items)\s+(added|moved)\s+to\b/.test(txt) || /already in/.test(txt) || /view your list/.test(txt)) {
        return true;
      }
    }
    return false;
  }
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => { if (settled) return; settled = true; try { observer.disconnect(); } catch(_) {}; resolve(ok); };
    const observer = new MutationObserver(() => {
      if (isSuccessVisible()) done(true);
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    if (isSuccessVisible()) return done(true);
    const remaining = Math.max(1000, timeout - (Date.now() - start));
    setTimeout(() => done(false), remaining);
  });
}

function interceptListData() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Check for added nodes
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) {
          // Check if it's a popover or contains list elements
          if (node.classList?.contains('a-popover') || 
              node.querySelector?.('.a-popover') ||
              node.querySelector?.('#atwl-popover-inner') ||
              node.querySelector?.('span[id^="atwl-list-name-"]')) {
            setTimeout(() => extractListsFromDropdown(node), 100);
          }
        }
      }
      
      // Also check for attribute changes (like aria-hidden)
      if (mutation.type === 'attributes' && mutation.attributeName === 'aria-hidden') {
        const target = mutation.target;
        if (target.classList?.contains('a-popover') && target.getAttribute('aria-hidden') === 'false') {
          setTimeout(() => extractListsFromDropdown(target), 100);
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

function extractListsFromDropdown(container) {
  const lists = [];
  const seenIds = new Set();
  
  
  // Look for the specific Amazon list structure: span[id^="atwl-list-name-"]
  const listNameElements = container.querySelectorAll('span[id^="atwl-list-name-"]');
  
  listNameElements.forEach(nameElement => {
    // Extract list ID from the span's id attribute (atwl-list-name-LISTID)
    const listId = nameElement.id.replace('atwl-list-name-', '');
    
    if (seenIds.has(listId)) return;
    seenIds.add(listId);
    
    // Get the list name text
    const listName = nameElement.textContent.trim();
    
    // Find the associated link element for clicking
    const linkElement = container.querySelector(`#atwl-link-to-list-${listId}`);
    
    // Get privacy status if available
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
  
  // Fallback: If no lists found with the above method, try the dropdown items
  if (lists.length === 0) {
    
    const dropdownItems = container.querySelectorAll('.a-dropdown-item');
    
    dropdownItems.forEach(item => {
      // Look for any link with list data
      const link = item.querySelector('a[id^="atwl-link-to-list-"]');
      if (link) {
        const listId = link.id.replace('atwl-link-to-list-', '');
        
        if (seenIds.has(listId)) return;
        seenIds.add(listId);
        
        // Find the list name within this item
        const nameSpan = item.querySelector('.atwl-hz-dd-list-name');
        const listName = nameSpan ? nameSpan.textContent.trim() : '';
        
        // Find privacy
        const privacySpan = item.querySelector('.atwl-hz-dd-list-privacy');
        const privacy = privacySpan ? privacySpan.textContent.trim() : '';
        
        if (listName && listName !== 'Create a List') {
          lists.push({
            id: listId,
            name: listName,
            privacy: privacy,
            element: link
          });
        }
      }
    });
  }
  
  
  if (lists.length > 0) {
    userLists = lists;
    sendListsToSidebar();
  } else {
  }
}

function sendListsToSidebar() {
  
  // Create a clean version of lists without DOM elements
  const cleanLists = userLists.map(list => ({
    id: list.id,
    name: list.name,
    privacy: list.privacy
    // Don't include the 'element' property as it can't be serialized
  }));
  
  browser.runtime.sendMessage({
    type: 'UPDATE_LISTS',
    lists: cleanLists,
    productInfo: productInfo
  }).then(() => {
  }).catch(err => {
    console.error('Failed to send lists to sidebar:', err);
  });
}

function sendProductUpdate(forceUpdate = false) {
  if (detectProductPage()) {
    // Always extract fresh info when called
    const newProductInfo = extractProductInfo();
    
    // Send if forced OR if product changed
    if (forceUpdate || !productInfo || productInfo.asin !== newProductInfo.asin) {
      productInfo = newProductInfo;
      
      browser.runtime.sendMessage({
        type: 'UPDATE_PRODUCT',
        productInfo: productInfo
      }).catch(err => {
      });
    }
  }
}

function triggerAddToListPopup() {
  // Open (or detect) the popover and extract lists
  openListDropdownAndWait().catch(() => {
    // Best-effort fallback: if lists already in DOM, try to extract
    const container = document.querySelector('.a-popover[aria-hidden="false"], #atwl-popover-inner, .a-dropdown') || document.body;
    extractListsFromDropdown(container);
  });
}

function addSidebarToggleButton() {
  // Disabled per user preference: user will open sidebar via Firefox menu
}

// Observe buy box containers and reinject button when DOM changes
function observeBuyBoxContainers() {
  // No-op: button injection removed
}

async function handleAddToListAction(listId) {
  // Ensure dropdown is open and interactive
  let popover = await openListDropdownAndWait().catch(() => null);
  if (!popover) return false;

  const asinAtStart = productInfo?.asin || null;
  const initialFilter = getListFilterValue(popover);
  if (persistDropdownSearch && initialFilter) setPersistentListFilter(initialFilter);

  const maxAttempts = 10;
  const attemptDelayMs = 200;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Scope all lookups to the currently open popover
    let linkElement = popover.querySelector(`#atwl-link-to-list-${listId}`);

    if (!linkElement) {
      extractListsFromDropdown(popover);
      linkElement = popover.querySelector(`#atwl-link-to-list-${listId}`);
    }

    if (!linkElement) {
      const targetName = (userLists.find(l => l.id === listId)?.name || '').toLowerCase();
      const candidates = Array.from(popover.querySelectorAll('.a-dropdown-item, a, button, [role="button"]'));
      linkElement = candidates.find(n => (n.textContent || '').trim().toLowerCase().includes(targetName)) || null;
    }

    if (!linkElement) {
      // Could not find the element; try reopen and restore, then retry
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, attemptDelayMs));
        popover = await openListDropdownAndWait().catch(() => null);
        if (!popover) return false;
        if (persistDropdownSearch) {
          const persisted = getPersistentListFilter() || initialFilter;
          if (persisted) try { setListFilterValue(popover, persisted); } catch (_) {}
        } else {
          try { setListFilterValue(popover, ''); } catch (_) {}
        }
        continue;
      }
      return false;
    }

    try { linkElement.scrollIntoView({ block: 'center' }); } catch(_) {}
    dispatchMouseSequence(linkElement);

    // If user disabled persistence, clear the filter immediately after click
    if (!persistDropdownSearch) {
      try {
        clearPersistentListFilter();
        setListFilterValue(popover, '');
      } catch (_) {}
    }

    const ok = await waitForAddConfirmation(popover, 1500).catch(() => false);
    if (ok) {
      // Success: clear persisted filter only if persistence is disabled
      if (!persistDropdownSearch) {
        clearPersistentListFilter();
      }
      return true;
    }

    // If navigation occurred mid-flow, stop retrying to avoid unintended clicks
    if (asinAtStart && productInfo?.asin && productInfo.asin !== asinAtStart) {
      return false;
    }

    // Retry: reopen popover and restore filter before trying again
    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, attemptDelayMs));
      popover = await openListDropdownAndWait().catch(() => null);
      if (!popover) return false;
      if (persistDropdownSearch) {
        const persisted = getPersistentListFilter() || initialFilter;
        if (persisted) try { setListFilterValue(popover, persisted); } catch (_) {}
      } else {
        try { setListFilterValue(popover, ''); } catch (_) {}
      }
      try { extractListsFromDropdown(popover); } catch (_) {}
    }
  }
  return false;
}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'ADD_TO_LIST') {
    return (async () => {
      try {
        const ok = await handleAddToListAction(message.listId);
        return { success: !!ok };
      } catch (e) {
        return { success: false, error: e?.message || 'ADD_TO_LIST failed' };
      }
    })();
  } else if (message.type === 'REQUEST_LISTS') {
    return (async () => {
      try {
        await openListDropdownAndWait();
        return { success: true, listCount: userLists.length };
      } catch (e) {
        // Best effort fallback
        triggerAddToListPopup();
        return { success: false, listCount: userLists.length, error: e?.message || 'REQUEST_LISTS failed' };
      }
    })();
  }
});

let currentUrl = window.location.href;

function watchProductTitle() {
  // Watch specifically for product title changes
  const titleElement = document.getElementById('productTitle');
  if (titleElement) {
    const observer = new MutationObserver(() => {
      sendProductUpdate();
    });
    
    observer.observe(titleElement, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }
}

function initialize() {
  if (detectProductPage()) {
    // load user setting up-front
    loadPersistSetting();
    productInfo = extractProductInfo();
    addToListButton = findAddToListButton();
    
    interceptListData();
    watchProductTitle();
    
    // Send initial product info IMMEDIATELY
    sendProductUpdate(true); // Force initial update - no delay
    
    try { console.log('[content] Amazon List Sidebar initialized on product page:', window.location.href); } catch(_) {}
  }
}

// Watch for URL changes (single-page navigation) - OPTIMIZED
function watchForUrlChanges() {
  let updateTimer = null;
  
  // Method 1: Listen for popstate (back/forward navigation)
  window.addEventListener('popstate', () => {
    if (detectProductPage()) {
      sendProductUpdate();
    }
  });
  
  // Method 2: Intercept clicks on product links - INSTANT
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="/dp/"], a[href*="/gp/product/"]');
    if (link && link.href) {
      // Clear any pending update
      if (updateTimer) clearTimeout(updateTimer);
      // Schedule update with minimal delay
      updateTimer = setTimeout(() => {
        if (detectProductPage()) {
          productInfo = extractProductInfo(); // Re-extract info
          sendProductUpdate(true); // Force update
        }
      }, 50); // Reduced to 50ms
    }
  }, true);
  
  // Method 3: Fast URL monitoring - check every 100ms
  let lastUrl = window.location.href;
  let lastTitle = document.title;
  
  setInterval(() => {
    const currentUrl = window.location.href;
    const currentTitle = document.title;
    
    // Check both URL and title changes
    if (currentUrl !== lastUrl || currentTitle !== lastTitle) {
      lastUrl = currentUrl;
      lastTitle = currentTitle;
      if (detectProductPage()) {
        // Immediate forced update
        productInfo = extractProductInfo();
        sendProductUpdate(true);
      }
    }
  }, 100); // Check every 100ms for faster response
}

// Watch for tab visibility changes - IMMEDIATE UPDATE
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && detectProductPage()) {
    // Extract fresh info immediately
    productInfo = extractProductInfo();
    sendProductUpdate(true); // Force update
  }
});

// Also listen for focus events as backup - IMMEDIATE UPDATE
window.addEventListener('focus', () => {
  if (detectProductPage()) {
    // Extract fresh info immediately
    productInfo = extractProductInfo();
    sendProductUpdate(true); // Force update
  }
});

// Also update when page gains focus through any means
document.addEventListener('focusin', () => {
  if (detectProductPage()) {
    productInfo = extractProductInfo();
    sendProductUpdate(true);
  }
});

// Update persist setting live if changed from the sidebar
try {
  if (browser && browser.storage && browser.storage.onChanged) {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes && changes.persistDropdownSearch) {
        const nv = changes.persistDropdownSearch.newValue;
        persistDropdownSearch = (typeof nv === 'boolean') ? nv : true;
      }
    });
  }
} catch (_) {}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize();
    watchForUrlChanges();
  });
} else {
  initialize();
  watchForUrlChanges();
}