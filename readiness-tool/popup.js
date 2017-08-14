/**
 * @fileoverview Entry point for ART Chrome extension. 
 * Scans the current page against the vendors in the vendors.json file and
 * specifies them as either supported or not supported.
 */
self.popups = {};
self.popups.isSupported = isSupported;
self.popups.addToDict = addToDict;
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

/**
 * Callback function that sends a response upon receiving message
 * @param {!Object} request - Message Object
 * @param {!Object} sender - Message sender defined here
 */
chrome.runtime.onMessage.addListener(function (request, sender) {
  if (request.action == 'getSource') {
    // htmlOfTab contains the page source as a string
    htmlOfTab = request.source;
    findDetectedVendors(htmlOfTab);
  }
});
window.onload = function onWindowLoad() {
  // When page is loaded, display 'Loading...' so the user expects content
  supportedAds = document.getElementById('ads-supported');
  supportedAnalytics = document.getElementById('analytics-supported');
  notSupportedAds = document.getElementById('ads-notSupported');
  notSupportedAnalytics = document.getElementById('analytics-notSupported');
  supportedAds.textContent = supportedAnalytics.textContent =
    notSupportedAds.textContent = notSupportedAnalytics.textContent =
    loadingMessage;
  // Gets the DOM of the current web page and converts it to a string
  chrome.tabs.executeScript(null, {
    file: 'getPagesSource.js',
  }, function () {});
};
/**
 * Returns all the 3rd party applications found on the website
 * @param {string} html - String containing all HTML on the page
 * @return {Object} 
 */
function findDetectedVendors(html) {
  fetch('vendors.json').then(function (response) {
      response.json().then(function (data) {
        let listAllVendors = data.vendors;
        detectedVendors = filteredVendors(html, listAllVendors);
        showSupportedVendorsInView(detectedVendors, listAllVendors);
        return detectedVendors;
      });
    }).then(data => console.log('data is', data))
    .catch(error => console.log('error is', error))
}
/**
 * Add supported and unsupported applications to the view
 * @param {Object} detectedVendors - All 3rd Party Applications found on page
 * @param {!Object} listAllVendors - JSON of all 3p vendors
 */
function showSupportedVendorsInView(detectedVendors, listAllVendors) {
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
}
/**
 * Splits all detected vendors into 'supported' and 'not supported'
 * @param {string} htmlString - String containing all HTML on the page
 * @param {!Object} listAllVendors - JSON of all the 3p vendors 
 * @return {Object} 
 */
function filteredVendors(htmlString, listAllVendors) {
  const foundThis = {
    'supported': {
      'ads': [],
      'analytics': []
    },
    'notSupported': {
      'ads': [],
      'analytics': []
    }
  };
  // for all the vendor objects in the vendors.json file
  Object.keys(listAllVendors).forEach(function (vendorName) {
    const vendorConfig = listAllVendors[vendorName];
    // If object has a 'uniqueRegExp' key
    if (vendorConfig.uniqueRegExp) {
      vendorConfig.uniqueRegExp.forEach(function (x) {
        if (vendorConfig.category.length == 0) {
          console.error('The vendor', vendorName,
            'does not have a value for "category" in vendors.json');
          return;
        } else if (vendorConfig.category != "Ads" && vendorConfig.category != "Analytics") {
          console.error('The vendor',
            vendorName,
            'is not declared as an ads or analytics vendor in vendors.json');
          return;
        }
        addToDict(x, htmlString, foundThis, vendorName,
          vendorConfig.category[0]);
      });
    }
  });
  return foundThis;
}
/**
 * Pushes vendor names to the supported or not supported list of the object
 'found this'
 * @param {string} regexString - String representation of regular expression
 * @param {!string} htmlString - String containing all HTML on the page
 * @param {Object} foundThis - Object separating the 3P services by support
 * @param {string} vendorName - name of third party service
 * @param {string} category - the category that the key belongs to
 */
function addToDict(regexString, htmlString, foundThis, vendorName, category) {
  const regX = new RegExp(regexString);
  if (regX.test(htmlString)) {
    if (isVendorNameUnique(foundThis, vendorName)) {
      switch (category) {
        case 'Analytics':
          if (isSupported(vendorName)) {
            foundThis.supported.analytics.push(vendorName);
          } else {
            foundThis.notSupported.analytics.push(vendorName);
          }
          break;
        case 'Ads':
          if (isSupported(vendorName)) {
            foundThis.supported.ads.push(vendorName);
          } else {
            foundThis.notSupported.ads.push(vendorName);
          }
          break;
      }
    }
  }
}
/**
 * Checks to see if vendorName is unique within the object
 * @param {Object} obj - Object separating the 3p services by support
 * @param {string} vendorName - name of third party service
 * @return {boolean} 
 */
function isVendorNameUnique(obj, vendorName) {
  let count = 0;
  if (obj.supported.ads.includes(vendorName)) {
    count ++;
  }
  if (obj.supported.analytics.includes(vendorName)) {
    count ++;
  }
  if (obj.notSupported.ads.includes(vendorName)) {
    count ++;
  }
  if (obj.notSupported.analytics.includes(vendorName)) {
    count ++;
  }
  
  return count <= 1;
}
/**
 * TODO (alwalton@): get list of supported ads/analytics programatically
 * Check if vendor is in supported list of vendor names
 * @param {string} vendorName - name of vendor
 * @return {boolean} 
 */
function isSupported(vendorName) {
  const ampSupported = [
    'A8', 'A9', 'AcccessTrade', 'Adblade', 'Adform', 'Adfox', 'Ad Generation',
    'Adhese', 'ADITION', 'Adman', 'AdmanMedia', 'AdReactor', 'AdSense',
    'AdsNative', 'AdSpirit', 'AdSpeed', 'AdStir', 'AdTech', 'AdThrive',
    'Ad Up Technology', 'Adverline', 'Adverticum', 'AdvertServe',
    'Affiliate-B', 'AMoAd', 'AppNexus', 'Atomx', 'Bidtellect',
    'brainy', 'CA A.J.A. Infeed', 'CA-ProFit-X', 'Chargeads', 'Colombia',
    'Content.ad', 'Criteo', 'CSA', 'CxenseDisplay', 'Dianomi', 'DistroScale',
    'Dot and Media', 'Doubleclick', 'DoubleClick for Publishers (DFP)',
    'DoubleClick Ad Exchange (AdX)', 'E-Planning', 'Ezoic', 'FlexOneELEPHANT',
    'FlexOneHARRIER', 'fluct', 'Felmat', 'Flite', 'Fusion', 'Google AdSense',
    'GenieeSSP', 'GMOSSP', 'GumGum', 'Holder', 'Imedia', 'I-Mobile',
    'iBillboard', 'Improve Digital', 'Index Exchange', 'Industrybrains',
    'InMobi', 'Kargo', 'Kiosked', 'Kixer', 'Ligatus', 'LOKA', 'MADS',
    'MANTIS', 'MediaImpact', 'Media.net', 'Mediavine', 'Meg', 'MicroAd',
    'Mixpo', 'myWidget', 'Nativo', 'Navegg', 'Nend', 'NETLETIX', 'Nokta',
    'Open AdStream (OAS)', 'OpenX', 'plista', 'polymorphicAds', 'popin',
    'PubMatic', 'Pubmine', 'PulsePoint', 'Purch', 'Rambler&Co', 'Relap',
    'Revcontent', 'Rubicon Project', 'Sharethrough', 'Sklik', 'SlimCut Media',
    'Smart AdServer', 'smartclip', 'Sortable', 'SOVRN', 'SpotX', 'SunMedia',
    'Swoop', 'Teads', 'TripleLift', 'ValueCommerce', 'Webediads', 'Weborama',
    'Widespace', 'Xlift', 'Yahoo', 'YahooJP', 'Yandex', 'Yieldbot', 'Yieldmo',
    'Yieldone', 'Zedo', 'Zucks', 'Bringhub', 'Outbrain', 'Taboola', 'ZergNet',
    'Acquia Lift', 'Adobe Analytics', 'AFS Analytics', 'AT Internet', 'Burt',
    'Baidu Analytics', 'Chartbeat', 'Clicky Web Analytics', 'comScore',
    'Cxense', 'Dynatrace', 'Eulerian Analytics', 'Gemius', 'Google AdWords',
    'Google Analytics', 'INFOnline / IVW', 'Krux', 'Linkpulse', 'Lotame',
    'Médiamétrie', 'mParticle', 'Nielsen', 'OEWA', 'Parsely', 'Piano',
    'Quantcast Measurement', 'Segment', 'SOASTA mPulse', 'SimpleReach',
    'Snowplow Analytics', 'Webtrekk', 'Yandex Metrica'
  , ];
  // If it is NOT in list of supported vendors
  return ampSupported.includes(vendorName);
}
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
  for (let i = 0; i < array.length; i++) {
    // Create the list item:
    let item = document.createElement('li');
    // Set its contents:
    item.appendChild(document.createTextNode(array[i]));
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
