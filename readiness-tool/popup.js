/**
 * @fileoverview Entry point for ART Chrome extension. 
 * Scans the current page against the vendors in the app.json file and
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

/** @const {string} */
const appsRegexDelimeter = '\\;';

/**
 * Callback function that sends a response upon receiving message
 * @param {!Object} request - Message Object
 * @param {!Object} sender - Message sender defined here
 */
chrome.runtime.onMessage.addListener(function (request, sender) {
  if (request.action == 'getSource') {
    // htmlOfTab contains the page source as a string
    htmlOfTab = request.source;
    findDetectedApps(htmlOfTab);
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
function findDetectedApps(html) {
  fetch('apps.json')
  .then(response => {
    return response.json().then(data => {
      if (response.ok) {
        let listAllApps = data.apps;
        detectedApps = filteredApps(html, listAllApps);
        showSupportedAppsInView(detectedApps, listAllApps);
        return detectedApps;
      } else {
        return Promise.reject({status: response.status});
      }
    });
  })
  .catch(error => console.error('apps.json in the readiness tool is invalid.', 
                                error));
  
}

/**
 * Add supported and unsupported applications to the view
 * @param {Object} detectedApps - All 3rd Party Applications found on page
 * @param {!Object} listAllApps - JSON of all 3p vendors
 */
function showSupportedAppsInView(detectedApps, listAllApps) {
  supportedAds.textContent = supportedAnalytics.textContent =
    notSupportedAds.textContent = notSupportedAnalytics.textContent =
    blankMessage;
  supportedAds.appendChild(makeList(detectedApps.supported.ads, false,
    listAllApps));
  supportedAnalytics.appendChild(makeList(detectedApps.supported.analytics,
    false, listAllApps));
  notSupportedAds.appendChild(makeList(detectedApps.notSupported.ads, true,
    listAllApps));
  notSupportedAnalytics.appendChild(makeList(
    detectedApps.notSupported.analytics,
    true, listAllApps));
}

/**
 * Splits all detected apps into 'supported' and 'not supported'
 * @param {string} htmlString - String containing all HTML on the page
 * @param {!Object} listAllApps - JSON of all the 3p vendors 
 * @return {Object} 
 */
function filteredApps(htmlString, listAllApps) {
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
  // for all the app objects in the apps.JSON file
  Object.keys(listAllApps).forEach(function (appName) {
    const appConfig = listAllApps[appName];
    // If object has a 'script' key
    if (appConfig.script) {
      appConfig.script.forEach(function (x) {
        if (appConfig.cats.length == 0) {
          console.error('The app', appName,
            'does not have a value for "cats" in apps.json');
          return;
        } else if (appConfig.cats != "36" && appConfig.cats != "10") {
          console.error('The app',
            appName,
            'is not declared as an ads or analytics vendor in apps.json');
          return;
        }
        addToDict(x.split(appsRegexDelimeter)[0], htmlString, foundThis, appName,
          appConfig.cats[0]);
      });
    }
  });
  return foundThis;
}

/**
 * Pushes app names to the supported or not supported list of the object
 'found this'
 * @param {string} regexString - String representation of regular expression
 * @param {!string} htmlString - String containing all HTML on the page
 * @param {Object} foundThis - Object separating the 3P services by support
 * @param {string} appName - name of third party service
 * @param {string} category - the category that the key belongs to
 */
function addToDict(regexString, htmlString, foundThis, appName, category) {
  const regX = new RegExp(regexString);
  if (regX.test(htmlString)) {
    if (isAppNameUnique(foundThis, appName)) {
      switch (category) {
        case '10':
          if (isSupported(appName)) {
            foundThis.supported.analytics.push(appName);
          } else {
            foundThis.notSupported.analytics.push(appName);
          }
          break;
        case '36':
          if (isSupported(appName)) {
            foundThis.supported.ads.push(appName);
          } else {
            foundThis.notSupported.ads.push(appName);
          }
          break;
      }
    }
  }
}

/**
 * Checks to see if appName is unique within the object
 * @param {Object} obj - Object separating the 3p services by support
 * @param {string} appName - name of third party service
 * @return {boolean} 
 */
function isAppNameUnique(obj, appName) {
  let count = 0;
  if (obj.supported.ads.includes(appName)) {
    count ++;
  }
  if (obj.supported.analytics.includes(appName)) {
    count ++;
  }
  if (obj.notSupported.ads.includes(appName)) {
    count ++;
  }
  if (obj.notSupported.analytics.includes(appName)) {
    count ++;
  }
  return count < 1;
}

/**
 * TODO (alwalton@): get list of supported ads/analytics programatically
 * Check if app is in supported list of app names
 * @param {string} appName - name of app
 * @return {boolean} 
 */
function isSupported(appName) {
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
  // If it is NOT in list of supported apps
  return ampSupported.includes(appName);
}

/**
 * Make list of supported/unsupported apps into an unordered list
 * @param {!Array<string>} array - array of app names
 * @param {boolean} allowToolTips - check to see if tooltip allowed
 * @param {!Object} listAllApps - JSON of all 3p vendors
 * @return {e} 
 */
function makeList(array, allowToolTips, listAllApps) {
  // Create the list element:
  const list = document.createElement('ul');
  for (let i = 0; i < array.length; i++) {
    // Create the list item:
    let item = document.createElement('li');
    // Set its contents:
    item.appendChild(document.createTextNode(array[i]));
    // Tooltip is only allowed for unsupported venodrs
    if (allowToolTips && listAllApps[array[i]].tooltip != null) {
      item.className = 'tooltip';
      item.setAttribute("data-tooltip", listAllApps[array[i]].tooltip);
    }
    // Add it to the list:
    list.appendChild(item);
  }
  // Finally, return the constructed list:
  return list;
}
