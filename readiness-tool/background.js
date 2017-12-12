/**
 * @fileoverview background.js provides a persistant background for the extension
 * which individual extension instances that run on different tabs use to communicate.
 */

let globals = {};

globals.tabToUrl = {};

/**
 * Send a message to page to do parse and process the DOM.
 * @param {Tab} tab - Tab that needs to be processed
 */
function handleTab(tab) {
  /**
   * Delay everything by 2 seconds, so that
   * we are sure that javascript is loaded ready to go.
   */
  setTimeout(callFn, 2000);
  /**
   * Sends a message to all tabs
   */
  function callFn() {
    chrome.tabs.sendMessage(tab.id, {
      action: 'handleTab',
      tabId: tab.id,
    });
  }
}

/**
 * Send a message to display a loading message in the extension
 * @param {Tab} tab - Tab that needs to be processed
 */
function displayLoadingInDOM(tab) {
  chrome.runtime.sendMessage({
    action: 'displayLoading',
    tabId: tab.id,
  });
}

/**
 * Send a message to update DOM of the extension with results related to the tab
 * @param {Tab} tab - Tab that needs to be processed
 */
function updateDOM(tab) {
  chrome.runtime.sendMessage({
    action: 'updateDOM',
    tabId: tab.id,
  });
}

/**
 * Load the list of vendors and associated regexes as soon as the extension comes alive.
 * We cache this in chrome local storage.
 */
fetch('vendors.json')
  .then(function(response) {
    response.json().then(function(data) {
      if (response.ok) {
        vendors = {
          vendors: data.vendors,
        };
        chrome.storage.local.set(vendors);
      } else {
        Promise.reject({
          status: response.status,
        });
      }
    });
  })
  .catch(function(error) {
    console.error('vendors.json in the readiness tool is invalid', error);
  });

/**
 * Listen for a new tab being created.
 */
chrome.tabs.onCreated.addListener(function(tab) {
  chrome.browserAction.setBadgeText({
    text: '',
  });
  chrome.browserAction.setBadgeBackgroundColor({
    color: '',
  });
});

/**
 * Listen for a tab being changed.
 */
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  globals.tabToUrl[tabId] = tab.url;

  if (changeInfo.status == 'complete') {
    badge = {
      text: '..',
      color: [160, 160, 160, 255],
    };
    updateBadge();

    handleTab(tab);
  } else if (changeInfo.status == 'loading') {
    badge = {
      text: '..',
      color: [160, 160, 160, 255],
    };
    updateBadge();

    displayLoadingInDOM(tab);
  }
});

/**
 * Listen for a tab being removed.
 */
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  window.sessionStorage.removeItem(globals.tabToUrl[tabId]);
});

/**
 * Listen for a tab being replaced (due to prerendering or instant).
 */
chrome.tabs.onReplaced.addListener(function(addedTabId, removedTabId) {
  window.sessionStorage.removeItem(globals.tabToUrl[removedTabId]);

  chrome.tabs.get(addedTabId, function(tab) {
    handleTab(tab);
  });
});

/**
 * Listen for a tab being focused
 */
chrome.tabs.onActivated.addListener(function(info) {
  query = {};
  query['' + info.tabId] = '';

  chrome.storage.local.get(query, function(response) {
    badge = response['' + info.tabId].badge;

    updateBadge(badge);
  });
});

/**
 * Utility functoin to update the badge of the extension
 * @param {Object} badge - Badge information
 */
function updateBadge(badge) {
  if (badge) {
    chrome.browserAction.setBadgeText({
      text: badge.text,
    });
    chrome.browserAction.setBadgeBackgroundColor({
      color: badge.color,
    });
    chrome.browserAction.setIcon({
      path: 'amp-readiness.png',
    });
  } else {
    chrome.browserAction.setBadgeText({
      text: '',
    });
    chrome.browserAction.setIcon({
      path: 'amp-readiness-grey.png',
    });
  }
}

/**
 * Listen for messages
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action == 'updateBadge') {
    updateBadge(request.badge);
  } else if (request.action == 'updateDOM') {
    updateDOM(sender.tab);
  }
});
