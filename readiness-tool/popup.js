/**
 * @fileoverview Entry point for ART Chrome extension.
 * Scans the current page against the vendors in the vendors.json file and
 * specifies them as either supported or not supported.
 */

/** @const {!Element} */
let supportedAds;

/* @const {!Element} */
let supportedAnalytics;

/** @const {!Element} */
let notSupportedAds;

/** @const {!Element} */
let notSupportedAnalytics;

/* @const {string} */
const loadingMessage = 'Loading...';

/** @const {string} */
const blankMessage = '';

console.log('storage listener being setup')
chrome.storage.onChanged.addListener(function(changes, namespace) {

  tabId = Object.keys(changes)[0]

  console.log('storage changed, updating DOM')

  //updateDOM(tabId)
})


function showLoading() {

  supportedAds                  = document.getElementById('ads-supported');
  supportedAnalytics            = document.getElementById('analytics-supported');
  notSupportedAds               = document.getElementById('ads-notSupported');
  notSupportedAnalytics         = document.getElementById('analytics-notSupported');


  supportedAds.textContent = supportedAnalytics.textContent =
    notSupportedAds.textContent = notSupportedAnalytics.textContent =
      loadingMessage;

}

window.onload = function onWindowLoad() {
  // When page is loaded, display 'Loading...' so the user expects content
  //
  //
  //showLoading()

  supportedAds                  = document.getElementById('ads-supported');
  supportedAnalytics            = document.getElementById('analytics-supported');
  notSupportedAds               = document.getElementById('ads-notSupported');
  notSupportedAnalytics         = document.getElementById('analytics-notSupported');


};

function updateDOM(tabId) {

  tabId = '' + tabId

  query = {}
  query[tabId] = ''
  query['vendors'] = ''

  chrome.storage.local.get(query, function (response){

    data = response[tabId]
    vendors = response['vendors']

    detectedVendors = data.detectedVendors

    showSupportedVendorsInView(detectedVendors, vendors);

  })


}


chrome.tabs.query({active: true, currentWindow: true}, function (tabs){

  currentTab = tabs[0]
  console.log(currentTab.status)

  if (currentTab.status == 'complete') {
    console.log('current status is complete, showing DOM')
    updateDOM(currentTab.id)
  }
  else {
    console.log('current status is something else, showing loading', currentTab.status)
    showLoading()
  }

})

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse){

  if (request.action == 'displayLoading') {

    console.log('display loading ..')

    showLoading()

  }

  else if (request.action == 'updateDOM') {

    console.log('updating DOM ..', request.tabId)

    if (request.tabId) {
      updateDOM(request.tabId)
    }

  }


})



/**
 * Add supported and unsupported applications to the view
 * @param {Object} detectedVendors - All 3rd Party Applications found on page
 * @param {!Object} listAllVendors - JSON of all 3p vendors
 */
function showSupportedVendorsInView(detectedVendors, listAllVendors) {



  console.log(detectedVendors, listAllVendors)

  if (!detectedVendors) {
    return
  }

  supportedAds.textContent = supportedAnalytics.textContent =
    notSupportedAds.textContent = notSupportedAnalytics.textContent =
    blankMessage;
  supportedAds.appendChild(makeList(detectedVendors.supported.ads, false,
    listAllVendors));
  supportedAnalytics.appendChild(makeList(detectedVendors.supported.analytics,
    false, listAllVendors));
  notSupportedAds.appendChild(makeList(detectedVendors.notSupported.ads, true,
    listAllVendors));
  notSupportedAnalytics.appendChild(makeList(
    detectedVendors.notSupported.analytics,
    true, listAllVendors));

  totalTags = detectedVendors.supported.ads.length +
              detectedVendors.supported.analytics.length +
              detectedVendors.notSupported.ads.length +
              detectedVendors.notSupported.analytics.length


}

/** @typedef {{ads: !Array<string>, analytics: !Array<string>}} */
let CategorizedVendorsDef;

/** @typedef {{supported: CategorizedVendorsDef, notSupported: CategorizedVendorsDef}} */
let FilteredVendorsDef;


/**
 * Make list of supported/unsupported vendors into an unordered list
 * @param {!Array<string>} array - array of vendor names
 * @param {boolean} allowToolTips - check to see if tooltip allowed
 * @param {!Object} listAllVendors - JSON of all 3p vendors
 * @return {e}
 */
function makeList(array, allowToolTips, listAllVendors) {
  // Create the list element:
  const list = document.createElement('ul');


  if (array.length == 0) {

    // Create the list item:
    let item = document.createElement('li');
    // Set its contents:
    item.appendChild(document.createTextNode("None"));
    item.className = "empty";
    list.appendChild(item);
  }

  for (let i = 0; i < array.length; i++) {
    // Create the list item:
    let item = document.createElement('li');
    // Set its contents:
    //
    img = document.createElement('img');
    img.src = "icons/" + array[i] + '.png'
    img.style = "width: 15px; position: relative; top: 2px;"
    item.appendChild(img)

    img = document.createElement('img');
    img.src = "icons/" + array[i] + '.svg'
    img.style = "width: 15px; position: relative; top: 2px;"
    item.appendChild(img)

    text = document.createElement('span')
    text.innerHTML = array[i]
    text.style = "margin-left: 8px;"
    item.appendChild(text)

    // Tooltip is only allowed for unsupported vendors

    if (allowToolTips && listAllVendors[array[i]].tooltip != null) {
      item.className = 'tooltip';
      item.setAttribute("data-tooltip", listAllVendors[array[i]].tooltip);
    }
    // Add it to the list:
    list.appendChild(item);
  }

  // Finally, return the constructed list:
  return list;
}

//module.exports = {isSupported, addToDict};
