// Store lists in background script to relay to sidebar
let storedLists = [];
let storedProductInfo = null;

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  if (message.type === 'OPEN_SIDEBAR') {
    browser.sidebarAction.open();
    sendResponse({ success: true });
  } else if (message.type === 'UPDATE_LISTS') {
    // Store the lists from content script
    storedLists = message.lists || [];
    storedProductInfo = message.productInfo;
    
    // Forward to all extension pages (including sidebar)
    browser.runtime.sendMessage({
      type: 'UPDATE_LISTS',
      lists: storedLists,
      productInfo: storedProductInfo
    }).catch(() => {
      // If sidebar isn't open, that's okay
    });
    
    sendResponse({ success: true });
  } else if (message.type === 'UPDATE_PRODUCT') {
    // Update just the product info
    storedProductInfo = message.productInfo;
    
    // Forward to sidebar
    browser.runtime.sendMessage({
      type: 'UPDATE_PRODUCT',
      productInfo: storedProductInfo
    }).catch(() => {
      // If sidebar isn't open, that's okay
    });
    
    sendResponse({ success: true });
  } else if (message.type === 'GET_STORED_LISTS') {
    // Allow sidebar to request stored lists
    sendResponse({
      lists: storedLists,
      productInfo: storedProductInfo
    });
  }
  
  return true;
});

browser.runtime.onInstalled.addListener(() => {
});