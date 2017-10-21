/**
 * @fileoverview Description of this file.
 */

var globals = {};
globals.tabToUrl = {};

function handleTab(tab){

  chrome.tabs.sendMessage(tab.id, {
      action: 'handleTab',
      tabId: tab.id
  })

};

fetch('vendors.json').then(function (response) {

  response.json().then(function (data){

    if (response.ok) {

      //alert('setting vendors.json')
      vendors = {'vendors': data.vendors}
      chrome.storage.local.set(vendors)
    }

    else {
      Promise.reject({status: response.status})
    }

  })

})
.catch(error => console.error('vendors.json in the readiness tool is invalid', error))

/**
 * Listen for a new tab being created.
 */
chrome.tabs.onCreated.addListener(function(tab) {
  //alert('onCreated')
  handleTab(tab);
});

/**
 * Listen for a tab being changed.
 */
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  globals.tabToUrl[tabId] = tab.url;

  if(changeInfo.status == 'complete') {
    //alert('onUpdated ' + JSON.stringify(changeInfo))
    handleTab(tab);
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
    alert('onReplaced')
    handleTab(tab);
  });
});
