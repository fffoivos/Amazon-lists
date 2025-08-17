// Store lists in background script to relay to sidebar
let storedLists = [];
let storedProductInfo = null;
try { console.log('[bg] Background script loaded'); } catch(_) {}

browser.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'OPEN_SIDEBAR') {
    console.log('[bg] OPEN_SIDEBAR', { fromTabId: sender.tab && sender.tab.id, windowId: sender.tab && sender.tab.windowId });
    if (!browser.sidebarAction || typeof browser.sidebarAction.open !== 'function') {
      console.error('[bg] sidebarAction.open is not available in this Firefox build/context');
      return Promise.resolve({ success: false, error: 'sidebarAction.open not available' });
    }
    const opts = sender && sender.tab && sender.tab.windowId ? { windowId: sender.tab.windowId } : undefined;
    return browser.sidebarAction.open(opts)
      .then(() => ({ success: true }))
      .catch((e) => {
        console.error('[bg] sidebarAction.open failed:', e);
        return { success: false, error: e?.message || 'sidebar open failed' };
      });
  } else if (message.type === 'UPDATE_LISTS') {
    console.log('[bg] UPDATE_LISTS', { count: (message.lists || []).length });
    storedLists = message.lists || [];
    storedProductInfo = message.productInfo;
    browser.runtime.sendMessage({
      type: 'UPDATE_LISTS',
      lists: storedLists,
      productInfo: storedProductInfo
    }).catch(() => {});
    return Promise.resolve({ success: true });
  } else if (message.type === 'UPDATE_PRODUCT') {
    console.log('[bg] UPDATE_PRODUCT');
    storedProductInfo = message.productInfo;
    browser.runtime.sendMessage({
      type: 'UPDATE_PRODUCT',
      productInfo: storedProductInfo
    }).catch(() => {});
    return Promise.resolve({ success: true });
  } else if (message.type === 'GET_STORED_LISTS') {
    console.log('[bg] GET_STORED_LISTS');
    return Promise.resolve({
      lists: storedLists,
      productInfo: storedProductInfo
    });
  }
});

// Toolbar button fallback: guaranteed user gesture
if (browser.action && typeof browser.action.onClicked?.addListener === 'function') {
  browser.action.onClicked.addListener(async (tab) => {
    try {
      const opts = tab && tab.windowId ? { windowId: tab.windowId } : undefined;
      if (!browser.sidebarAction || typeof browser.sidebarAction.open !== 'function') {
        console.error('[bg] sidebarAction.open not available on toolbar click');
        return;
      }
      await browser.sidebarAction.open(opts);
    } catch (e) {
      console.error('[bg] sidebarAction.open failed on toolbar click:', e);
    }
  });
}

browser.runtime.onInstalled.addListener((details) => {
  try { console.log('[bg] onInstalled', details); } catch(_) {}
});
if (browser.runtime.onStartup) {
  browser.runtime.onStartup.addListener(() => {
    try { console.log('[bg] onStartup'); } catch(_) {}
  });
}