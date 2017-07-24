/**
 * @fileoverview Entry point for ART Chrome extension. 
 * Scans the current page against the vendors in the app.json file and
 * specifies them as either supported or not supported.
 */
self.popups = {};
self.popups.isSupported = isSupported;

/* @const {!Element} */
let supportedAds;

/* @const {!Element} */
let supportedAnalytics;

/* @const {!Element} */
let notSupportedAds;

/* @const {!Element} */
let notSupportedAnalytics;

/* @const {!Element} */
let notSupportedOther;

/* @const {string} */
const loadingMessage = 'Loading...';

/* @const {string} */
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
    findDetectedApps(htmlOfTab);
  }
});
window.onload = function onWindowLoad() {
  // When page is loaded, display 'Loading...' so the user expects content
  supportedAds = document.getElementById('ads-supported');
  supportedAnalytics = document.getElementById('analytics-supported');
  notSupportedAds = document.getElementById('ads-notSupported');
  notSupportedAnalytics = document.getElementById('analytics-notSupported');
  notSupportedOther = document.getElementById('other-notSupported');
  supportedAds.innerHTML = supportedAnalytics.innerHTML = notSupportedAds.innerHTML = notSupportedAnalytics.innerHTML = notSupportedOther.innerHTML = loadingMessage;
  // Gets the DOM of the current web page and converts it to a string
  chrome.tabs.executeScript(null, {
    file: 'getPagesSource.js',
  }, function () {});
};
/**
 * Returns all the 3rd party applications found on the website
 * @param {String} html - String containing all HTML on the page
 * @return {Object} 
 */
function findDetectedApps(html) {
  fetch('apps.json')
    .then(
      function (response) {
        if (response.status !== 200) {
          console.log('Looks like there was a problem. Status Code: ' +
            response.status);
          return;
        }
        // Examine the text in the response  
        response.json().then(function (data) {
          listAllApps = data.apps;
          detectedApps = filterApps(listAllApps, html);
          showSupportedAppsInView(detectedApps);
          return detectedApps;
        });
      }
    )
    .catch(function (err) {
      console.log('Fetch Error :-S', err);
    });
}
/**
 * Add supported and unsupported applications to the view
 * @param {Objected} detectedApps - All 3rd Party Applications found on page
 */
function showSupportedAppsInView(detectedApps) {
  supportedAds.innerHTML = supportedAnalytics.innerHTML = notSupportedAds.innerHTML = notSupportedAnalytics.innerHTML = notSupportedOther.innerHTML = blankMessage;
  supportedAds.appendChild(makeList(detectedApps.supported.ads));
  supportedAnalytics.appendChild(makeList(detectedApps.supported.analytics));
  notSupportedAds.appendChild(makeList(detectedApps.notSupported.ads));
  notSupportedAnalytics.appendChild(makeList(detectedApps.notSupported.analytics));
  notSupportedOther.appendChild(makeList(detectedApps.notSupported.other));
}
/**
 * Splits all detected apps into 'supported' and 'not supported'
 * @param {Object} apps - All possible services that could exist on the page
 * @param {String} htmlString - String containing all HTML on the page
 * @return {Object} 
 */
function filterApps(apps, htmlString) {
  const foundThis = {
    'supported': {
      'ads': [],
      'analytics': [],
    },
    'notSupported': {
      'ads': [],
      'analytics': [],
      'other': [],
    },
  };
  // for all the app objects in the apps.JSON file
  Object.keys(apps).forEach(function (key) {
    let val = apps[key];
    // If object has a 'script' key
    if (val.script != null) {
      Object.keys(val.script).forEach(function (x) {
        addToDict(val.script[x], htmlString, foundThis, key, val.cats);
      });
    }
  });
  return foundThis;
}
/**
 * Pushes keys to the supported or not supported list of the object 'found this'
 * @param {String} tempScript - String representation of regular expression
 * @param {!String} htmlString - String containing all HTML on the page
 * @param {Object} foundThis - Object separating the 3P services by support
 * @param {String} key - name of third party service
 * @param {String} category - the category that the key belongs to
 */
function addToDict(tempScript, htmlString, foundThis, key, category) {
  tempScript = tempScript.split('\\;');
  let regX = new RegExp(tempScript[0]);
  if (regX.test(htmlString)) {
    if (isKeyUnique(foundThis, key)) {
      isSupported(key) ? 
        (category == 10 ? foundThis.supported.analytics.push(key) :
         foundThis.supported.ads.push(key)) : 
      (category == 10 ? foundThis.notSupportedd.analytics.push(key) :
       foundThis.notSupported.ads.push(key));
    }
  }
}
/**
 * Checks to see if key is unique within the object
 * @param {Object} obj - Object separating the 3p services by support
 * @param {String} key - name of third party service
 * @return {boolean} 
 */
function isKeyUnique(obj, key) {
  let truthValue = obj.supported.ads.indexOf(key) + obj.supported.analytics.indexOf(key) + obj.notSupported.ads.indexOf(key) + obj.notSupported.analytics.indexOf(key);
  return truthValue == -4;
}


/**
 * TODO (alwalton@): get list of supported ads/analytics programatically
 * Check if app is in supported list of app names
 * @param {String} key - name of app
 * @return {boolean} 
 */
function isSupported(key) {
  const ampSupported = [
    'A8', 'A9', 'AcccessTrade', 'Adblade', 'Adform', 'Adfox', 'Ad Generation'
    , 'Adhese', 'ADITION', 'Adman', 'AdmanMedia', 'AdReactor', 'AdSense'
    , 'AdsNative', 'AdSpirit', 'AdSpeed', 'AdStir', 'AdTech', 'AdThrive'
    , 'Ad Up Technology', 'Adverline', 'Adverticum', 'AdvertServe'
    , 'Affiliate-B', 'AMoAd', 'AppNexus', 'Atomx', 'Bidtellect', 'brainy'
    , 'CA A.J.A. Infeed', 'CA-ProFit-X', 'Chargeads', 'Colombia', 'Content.ad'
    , 'Criteo', 'CSA', 'CxenseDisplay', 'Dianomi', 'DistroScale', 'Dot and Media'
    , 'Doubleclick', 'DoubleClick for Publishers (DFP)'
    , 'DoubleClick Ad Exchange (AdX)', 'E-Planning', 'Ezoic', 'FlexOneELEPHANT'
    , 'FlexOneHARRIER', 'fluct', 'Felmat', 'Flite', 'Fusion', 'Google AdSense'
    , 'GenieeSSP', 'GMOSSP', 'GumGum', 'Holder', 'Imedia', 'I-Mobile'
    , 'iBillboard', 'Improve Digital', 'Index Exchange', 'Industrybrains'
    , 'InMobi', 'Kargo', 'Kiosked', 'Kixer', 'Ligatus', 'LOKA', 'MADS', 'MANTIS'
    , 'MediaImpact', 'Media.net', 'Mediavine', 'Meg', 'MicroAd', 'Mixpo'
    , 'myWidget', 'Nativo', 'Navegg', 'Nend', 'NETLETIX', 'Nokta'
    , 'Open AdStream (OAS)', 'OpenX', 'plista', 'polymorphicAds', 'popin'
    , 'PubMatic', 'Pubmine', 'PulsePoint', 'Purch', 'Rambler&Co', 'Relap'
    , 'Revcontent', 'Rubicon Project', 'Sharethrough', 'Sklik', 'SlimCut Media'
    , 'Smart AdServer', 'smartclip', 'Sortable', 'SOVRN', 'SpotX', 'SunMedia'
    , 'Swoop', 'Teads', 'TripleLift', 'ValueCommerce', 'Webediads', 'Weborama'
    , 'Widespace', 'Xlift', 'Yahoo', 'YahooJP', 'Yandex', 'Yieldbot', 'Yieldmo'
    , 'Yieldone', 'Zedo', 'Zucks', 'Bringhub', 'Outbrain', 'Taboola', 'ZergNet'
    , 'Acquia Lift', 'Adobe Analytics', 'AFS Analytics', 'AT Internet'
    , 'Baidu Analytics', 'Burt', 'Chartbeat', 'Clicky Web Analytics', 'comScore'
    , 'Cxense', 'Dynatrace', 'Eulerian Analytics', 'Gemius', 'Google AdWords'
    , 'Google Analytics', 'INFOnline / IVW', 'Krux', 'Linkpulse', 'Lotame'
    , 'Médiamétrie', 'mParticle', 'Nielsen', 'OEWA', 'Parsely', 'Piano'
    , 'Quantcast Measurement', 'Segment', 'SOASTA mPulse', 'SimpleReach'
    , 'Snowplow Analytics', 'Webtrekk', 'Yandex Metrica'
  , ];
  // If it is NOT in list of supported apps
  if (ampSupported.indexOf(key) == -1) {
    return false;
  }
  return true;
}
/**
 * Make list of supported/unsupported apps into an unordered list
 * @param {[String]} array - array of app names
 * @return {e} 
 */
function makeList(array) {
  // Create the list element:
  const list = document.createElement('ul');
  for (let i = 0; i < array.length; i++) {
    // Create the list item:
    let item = document.createElement('li');
    // Set its contents:
    item.appendChild(document.createTextNode(array[i]));
    // Add it to the list:
    list.appendChild(item);
  }
  // Finally, return the constructed list:
  return list;
}
