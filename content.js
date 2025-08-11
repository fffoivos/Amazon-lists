let productInfo = null;
let userLists = [];
let addToListButton = null;

function detectProductPage() {
  const isProductPage = 
    window.location.pathname.includes('/dp/') || 
    window.location.pathname.includes('/gp/product/') ||
    document.querySelector('#productTitle') !== null;
  
  return isProductPage;
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
  
  // Don't click anything - just look for existing dropdown
  // Multiple attempts with different timings
  const attempts = [0, 500, 1000, 2000];
  
  attempts.forEach(delay => {
    setTimeout(() => {
      
      // Look for any visible popover or dropdown
      const selectors = [
        '.a-popover[aria-hidden="false"]',
        '#a-popover-3', // The specific popover from your HTML
        '.a-popover:not([aria-hidden="true"])',
        '#atwl-popover-inner',
        '#atwl-dd-ul',
        '.a-dropdown',
        '[id^="atwl-list-name-"]'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          // If we found list names directly, use their parent
          if (selector.includes('atwl-list-name')) {
            const container = element.closest('.a-popover, .a-dropdown, #atwl-popover-inner') || document.body;
            extractListsFromDropdown(container);
          } else {
            extractListsFromDropdown(element);
          }
          break;
        }
      }
      
      // Also just try scanning the whole document
      if (userLists.length === 0) {
        const listElements = document.querySelectorAll('span[id^="atwl-list-name-"]');
        if (listElements.length > 0) {
          extractListsFromDropdown(document.body);
        }
      }
    }, delay);
  });
}

function addSidebarToggleButton() {
  const targetContainer = document.querySelector('#rightCol, #desktop_buybox, #buybox');
  
  if (targetContainer && !document.querySelector('#open-sidebar-btn')) {
    const button = document.createElement('button');
    button.id = 'open-sidebar-btn';
    button.textContent = '📚 Open List Sidebar';
    button.style.cssText = `
      background: #ff9900;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      margin: 10px 0;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
      width: 100%;
      max-width: 300px;
    `;
    
    button.addEventListener('click', () => {
      browser.runtime.sendMessage({ type: 'OPEN_SIDEBAR' });
      setTimeout(triggerAddToListPopup, 500);
    });
    
    targetContainer.insertBefore(button, targetContainer.firstChild);
  }
}

function handleAddToListAction(listId) {
  
  // First, make sure dropdown is open
  const visiblePopover = document.querySelector('.a-popover[aria-hidden="false"]');
  if (!visiblePopover) {
    const dropdownBtn = document.querySelector('#add-to-wishlist-button');
    if (dropdownBtn) {
      dropdownBtn.click();
      setTimeout(() => handleAddToListAction(listId), 500);
      return;
    }
  }
  
  // Find the list element directly in the DOM by its ID
  const linkElement = document.querySelector(`#atwl-link-to-list-${listId}`);
  
  if (linkElement) {
    const list = userLists.find(l => l.id === listId);
    linkElement.click();
    
    // The click should trigger Amazon's own add-to-list action
  } else {
    // Try to re-scan for lists
    const popover = document.querySelector('.a-popover[aria-hidden="false"], #atwl-popover-inner');
    if (popover) {
      extractListsFromDropdown(popover);
      // Try again after re-scanning
      setTimeout(() => {
        const retryElement = document.querySelector(`#atwl-link-to-list-${listId}`);
        if (retryElement) {
          retryElement.click();
        }
      }, 100);
    }
  }
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ADD_TO_LIST') {
    handleAddToListAction(message.listId);
    sendResponse({ success: true });
  } else if (message.type === 'REQUEST_LISTS') {
    if (userLists.length === 0) {
      triggerAddToListPopup();
    } else {
      sendListsToSidebar();
    }
    sendResponse({ success: true });
  }
  return true;
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
    productInfo = extractProductInfo();
    addToListButton = findAddToListButton();
    
    addSidebarToggleButton();
    interceptListData();
    watchProductTitle();
    
    // Send initial product info IMMEDIATELY
    sendProductUpdate(true); // Force initial update - no delay
    
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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initialize();
    watchForUrlChanges();
  });
} else {
  initialize();
  watchForUrlChanges();
}