/**
 * @fileoverview Description of this file.
 */

var globals = {};
globals.tabToUrl = {};

function handleTab(tab){



  //
  // Delay everything by 2seconds, so that
  // we are sure that javascript is ready to go.
  //

  setTimeout(callFn, 2000)

  function callFn() {
      chrome.tabs.sendMessage(tab.id, {
          action: 'handleTab',
          tabId: tab.id
      })
  }

};

function displayLoadingInDOM(tab){

  chrome.runtime.sendMessage({
      action: 'displayLoading',
      tabId: tab.id
  })

};


function updateDOM(tab) {

  chrome.runtime.sendMessage({
      action: 'updateDOM',
      tabId: tab.id
  })

}

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
  chrome.browserAction.setBadgeText({text:  ''})
  chrome.browserAction.setBadgeBackgroundColor({ color: '' })
  //handleTab(tab);
});

/**
 * Listen for a tab being changed.
 */
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  globals.tabToUrl[tabId] = tab.url;

  if(changeInfo.status == 'complete') {

    badge = {
      'text': '..',
      'color': [160, 160, 160, 255]

      }
    updateBadge(badge)

    handleTab(tab);
  }
  else if (changeInfo.status == 'loading') {

    badge = {
      'text': '..',
      'color': [160, 160, 160, 255]

      }
    updateBadge(badge)

    displayLoadingInDOM(tab)

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
    //alert('onReplaced')
    handleTab(tab);
  });
});

/**
 * Listen for a tab being focused
 */
chrome.tabs.onActivated.addListener(function(info) {

      query = {}
      query['' + info.tabId] = ''

      chrome.storage.local.get(query, function(response){


        badge = response['' + info.tabId].badge
        //alert('foo' + JSON.stringify(badge))
        //
        //
        updateBadge(badge)


      })
});


function updateBadge(badge) {

  console.log(badge)

  chrome.browserAction.setBadgeText({text:  badge.text})
  chrome.browserAction.setBadgeBackgroundColor({ color: badge.color })

}


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse){

  if (request.action == 'updateBadge') {

    updateBadge(request.badge)

  }

  else if (request.action == 'updateDOM') {

    updateDOM(sender.tab)

  }

})
