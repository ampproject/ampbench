/**
 * @fileoverview Contains functions that work on the document
 * such as scanning and parsing the HTML to find supported vendors
 */

/**
 * Callback function that sends a response upon receiving message
 * @param {!Object} request - Message Object
 * @param {!Object} sender - Message sender defined here
 */
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action == 'handleTab') {
    html = document.documentElement.innerHTML;
    findDetectedVendors(html, request.tabId);
  }
});

/**
 * Returns all the 3rd party applications found on the website
 * @param {string} html - String containing all HTML on the page
 * @param {string} tabId - Id of the tab
 */
function findDetectedVendors(html, tabId) {
  vendors = chrome.storage.local.get('vendors', function(vendorsData) {
    vendors = vendorsData.vendors;

    detectedVendors = filteredVendors(html, vendors);

    totalTags =
      detectedVendors.supported.ads.length +
      detectedVendors.supported.analytics.length +
      detectedVendors.notSupported.ads.length +
      detectedVendors.notSupported.analytics.length;

    notSupported =
      detectedVendors.notSupported.ads.length +
      detectedVendors.notSupported.analytics.length;
    supported =
      detectedVendors.supported.ads.length +
      detectedVendors.supported.analytics.length;

    if (notSupported == 0 && supported > 0) {
      color = [122, 186, 122, 255];
    } else if (notSupported > 0 && supported > 0) {
      color = [255, 121, 0, 255];
    } else if (notSupported > 0 && supported == 0) {
      color = [255, 76, 76, 255];
    } else {
      color = [255, 255, 255, 0];
    }

    badge = {
      text: totalTags.toString(),
      color: color,
    };

    data = {};
    data[tabId] = {
      detectedVendors: detectedVendors,
      badge: badge,
    };

    // pass message to background.js
    payload = {};
    payload['action'] = 'updateBadge';
    payload['badge'] = badge;
    chrome.runtime.sendMessage(payload, function(response) {});

    chrome.storage.local.set(data, function() {
      // pass message to background.js (which will be routed to popup)
      payload = {};
      payload['action'] = 'updateDOM';
      chrome.runtime.sendMessage(payload, function(response) {});
    });
  });
}

/**
 * Splits all detected vendors into 'supported' and 'not supported'
 * @param {string} htmlString - String containing all HTML on the page
 * @param {!Object} listAllVendors - JSON of all the 3p vendors
 * @return {Object}
 */
function filteredVendors(htmlString, listAllVendors) {
  let filteredVendors = {
    supported: {
      ads: [],
      analytics: [],
    },
    notSupported: {
      ads: [],
      analytics: [],
    },
  };
  // for all the vendor objects in the vendors.json file
  Object.keys(listAllVendors).forEach(function(vendorName) {
    let vendorConfig = listAllVendors[vendorName];
    // If object has a 'regex' key
    if (vendorConfig.regex) {
      vendorConfig.regex.forEach(function(x) {
        if (vendorConfig.category.length == 0) {
          console.error(
            'The vendor',
            vendorName,
            'does not have a value for "category" in vendors.json'
          );
          return;
        } else if (
          vendorConfig.category != 'Ads' &&
          vendorConfig.category != 'Analytics'
        ) {
          console.error(
            'The vendor',
            vendorName,
            'is not declared as an ads or analytics vendor in vendors.json'
          );
          return;
        }
        addToDict(
          x,
          htmlString,
          filteredVendors,
          vendorName,
          vendorConfig.category
        );
      });
    }
  });
  return filteredVendors;
}

/**
 * Pushes vendor names to the supported or not supported list of the object
 * 'filteredVendors'
 * @param {string} regexString - String representation of regular expression
 * @param {!string} htmlString - String containing all HTML on the page
 * @param {FilteredVendorsDef} filteredVendors - Object separating the
 * 3P services by support
 * @param {string} vendorName - name of third party service
 * @param {string} category - the category that the key belongs to
 */
function addToDict(
  regexString,
  htmlString,
  filteredVendors,
  vendorName,
  category
) {
  let regX = new RegExp(regexString);

  if (regX.test(htmlString)) {
    if (isVendorNameUnique(filteredVendors, vendorName)) {
      switch (category) {
        case 'Analytics':
          if (isSupported(vendorName)) {
            filteredVendors.supported.analytics.push(vendorName);
          } else {
            filteredVendors.notSupported.analytics.push(vendorName);
          }
          break;
        case 'Ads':
          if (isSupported(vendorName)) {
            filteredVendors.supported.ads.push(vendorName);
          } else {
            filteredVendors.notSupported.ads.push(vendorName);
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
    count++;
  }
  if (obj.supported.analytics.includes(vendorName)) {
    count++;
  }
  if (obj.notSupported.ads.includes(vendorName)) {
    count++;
  }
  if (obj.notSupported.analytics.includes(vendorName)) {
    count++;
  }
  return count < 1;
}

/**
 * TODO (alwalton@): get list of supported ads/analytics programatically
 * Check if vendor is in supported list of vendor names
 * @param {string} vendorName - name of vendor
 * @return {boolean}
 */
function isSupported(vendorName) {
  let ampSupported = [
    'A8',
    'A9',
    'AcccessTrade',
    'Adblade',
    'Adform',
    'Adfox',
    'Ad Generation',
    'Adhese',
    'ADITION',
    'Adman',
    'AdmanMedia',
    'AdReactor',
    'AdSense',
    'AdsNative',
    'AdSpirit',
    'AdSpeed',
    'AdStir',
    'AdTech',
    'AdThrive',
    'Ad Up Technology',
    'Adverline',
    'Adverticum',
    'AdvertServe',
    'Affiliate-B',
    'AMoAd',
    'AppNexus',
    'Atomx',
    'Bidtellect',
    'brainy',
    'CA A.J.A. Infeed',
    'CA-ProFit-X',
    'Chargeads',
    'Colombia',
    'Content.ad',
    'Criteo',
    'CSA',
    'CxenseDisplay',
    'Dianomi',
    'DistroScale',
    'Dot and Media',
    'Doubleclick',
    'DoubleClick for Publishers (DFP)',
    'DoubleClick Ad Exchange (AdX)',
    'E-Planning',
    'Ezoic',
    'FlexOneELEPHANT',
    'FlexOneHARRIER',
    'fluct',
    'Felmat',
    'Flite',
    'Fusion',
    'Google AdSense',
    'GenieeSSP',
    'GMOSSP',
    'GumGum',
    'Holder',
    'Imedia',
    'I-Mobile',
    'iBillboard',
    'Improve Digital',
    'Index Exchange',
    'Industrybrains',
    'InMobi',
    'Kargo',
    'Kiosked',
    'Kixer',
    'Ligatus',
    'LOKA',
    'MADS',
    'MANTIS',
    'MediaImpact',
    'Media.net',
    'Mediavine',
    'Meg',
    'MicroAd',
    'Mixpo',
    'myWidget',
    'Nativo',
    'Navegg',
    'Nend',
    'NETLETIX',
    'Nokta',
    'Open AdStream (OAS)',
    'OpenX',
    'plista',
    'polymorphicAds',
    'popin',
    'PubMatic',
    'Pubmine',
    'PulsePoint',
    'Purch',
    'Rambler&Co',
    'Relap',
    'Revcontent',
    'Rubicon Project',
    'Sharethrough',
    'Sklik',
    'SlimCut Media',
    'Smart AdServer',
    'smartclip',
    'Sortable',
    'SOVRN',
    'SpotX',
    'SunMedia',
    'Swoop',
    'Teads',
    'TripleLift',
    'ValueCommerce',
    'Webediads',
    'Weborama',
    'Widespace',
    'Xlift',
    'Yahoo',
    'YahooJP',
    'Yandex',
    'Yieldbot',
    'Yieldmo',
    'Yieldone',
    'Zedo',
    'Zucks',
    'Bringhub',
    'Outbrain',
    'Taboola',
    'ZergNet',
    'Acquia Lift',
    'Adobe Analytics',
    'AFS Analytics',
    'AT Internet',
    'Burt',
    'Baidu Analytics',
    'Chartbeat',
    'Clicky Web Analytics',
    'comScore',
    'Cxense',
    'Dynatrace',
    'Eulerian Analytics',
    'Gemius',
    'Google AdWords',
    'Google Analytics',
    'INFOnline / IVW',
    'Krux',
    'Linkpulse',
    'Lotame',
    'Médiamétrie',
    'mParticle',
    'Nielsen',
    'OEWA',
    'Parsely',
    'Piano',
    'Quantcast',
    'Segment',
    'SOASTA mPulse',
    'SimpleReach',
    'Snowplow Analytics',
    'Webtrekk',
    'Yandex Metrica',
    'Google Tag Manager',
  ];
  // If it is NOT in list of supported vendors
  return ampSupported.includes(vendorName);
}
