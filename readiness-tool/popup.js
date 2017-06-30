
/**
   * Callback function that sends a response upon receiving message
   * @param {!Object} request - Message Object
   * @param {!Object} sender - Message sender defined here
   */
chrome.runtime.onMessage.addListener(function (request, sender) {
    if (request.action == "getSource") {
        // htmlOfTab contains the page source as a string
        htmlOfTab = request.source;
        findDetectedApps(htmlOfTab);

    }
});


/** Event called when window is loaded */
function onWindowLoad() {
    var htmlOfTab;
    // When page is loaded, display "Loading..." so the user expects content
    var loading1 = document.getElementById("supported");
    var loading2 = document.getElementById("notSupported");
    loading1.innerHTML = 'Loading...';
    loading2.innerHTML = "Loading...";
    
    // Gets the DOM of the current web page and converts it to a string
    chrome.tabs.executeScript(null, {
        file: "getPagesSource.js"
    }, function () {

    });
}

/**
   * Returns all the 3rd party applications found on the website
   * @param {String} html - String containing all HTML on the page
   * @return {Object} 
   */
function findDetectedApps(html) {
    var htmlString = html;
    let linkToApps = (chrome.runtime.getURL('apps.json'));
    var xhr = new XMLHttpRequest();
    var detectedApps;
    let listAllApps;

    xhr.open("GET", linkToApps, true);
    xhr.onreadystatechange = function () {
        // Wait until the response is done (onload or onerror).
        if (xhr.readyState === 4) {
            listAllApps = JSON.parse(xhr.response).apps;
            detectedApps = specifySupport(listAllApps, htmlString);
            showSupportedAppsInView(detectedApps);
            
        }
    }
    xhr.send();
    return detectedApps;
}

/**
   * Add supported and unsupported applications to the view
   * @param {Objected} detectedApps - All 3rd Party Applications found on page
   */

function showSupportedAppsInView(detectedApps) {
    var loading1 = document.getElementById("supported");
    var loading2 = document.getElementById("notSupported");
    loading1.innerHTML = "";
    loading2.innerHTML = "";
    document.getElementById('supported').appendChild(makeList(detectedApps.supported));
    document.getElementById('notSupported').appendChild(makeList(detectedApps.notSupported));
}

/**
   * Splits all detected apps into 'supported' and 'not supported'
   * @param {Object} apps - All possible services that could exist on the page
   * @param {String} htmlString - String containing all HTML on the page
   * @return {Object} 
   */
function specifySupport(apps, htmlString) {
    let obj = apps;
    let foundThis = {
        "supported": [],
        "notSupported": []
    };
    
    //for all the app objects in the apps.JSON file
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            let val = obj[key];
            //If object has a 'script' key
            if (val.script != null) {
                // Sometimes val.script contains an array of regular expressions to check
                if (typeof (val.script) == 'object') {
                    for (let x in val.script) {
                        let tempScript = val.script[x].split('\\;');
                        let regX = new RegExp(tempScript[0]);
                        if (doesRegexExist(regX, htmlString)) {
                            if (foundThis.supported.indexOf(key) == -1 && foundThis.notSupported.indexOf(key) == -1) {

                                if (isSupported(key)) {
                                    foundThis.supported.push(key);
                                } else {
                                    foundThis.notSupported.push(key);
                                }
                            }
                        }
                    }
                } else {
                    let tempScript = val.script.split('\\;');
                    let regX = new RegExp(tempScript[0]);
                    if (doesRegexExist(regX, htmlString)) {
                        if (foundThis.supported.indexOf(key) == -1 && foundThis.notSupported.indexOf(key) == -1) {
                            if (isSupported(key)) {
                                foundThis.supported.push(key);
                            } else {
                                foundThis.notSupported.push(key);
                            }
                        }
                    }
                }
            }
        }
    }
    return foundThis;
}

/**
   * Determines if regular expression exists within the HTML of the page
   * @param {String} regexString - Regular expression of app
   * @param {String} htmlString - String containing all HTML on the page
   * @return {boolean} 
   */
function doesRegexExist(regexString, htmlString) {
    let value = regexString.test(htmlString)
    return (value);
}

/**
   * TODO (alwalton@): find a way to get list of supported ads and analytics w/o hardcoding the values
   * Check if app is in supported list of app names
   * @param {String} key - name of app
   * @return {boolean} 
   */
function isSupported(key) {
    var ampSupported = ["A8", "A9", "AcccessTrade", "Adblade", "Adform", "Adfox", "Ad Generation", "Adhese", "ADITION", "Adman", "AdmanMedia", "AdReactor", "AdSense", "AdsNative", "AdSpirit", "AdSpeed", "AdStir", "AdTech", "AdThrive", "Ad Up Technology", "Adverline", "Adverticum", "AdvertServe", "Affiliate-B", "AMoAd", "AppNexus", "Atomx", "Bidtellect", "brainy", "CA A.J.A. Infeed", "CA-ProFit-X", "Chargeads", "Colombia", "Content.ad", "Criteo", "CSA", "CxenseDisplay", "Dianomi", "DistroScale", "Dot and Media", "Doubleclick", "DoubleClick for Publishers (DFP)", "DoubleClick Ad Exchange (AdX)", "E-Planning", "Ezoic", "FlexOneELEPHANT", "FlexOneHARRIER", "fluct", "Felmat", "Flite", "Fusion", "Google AdSense", "GenieeSSP", "GMOSSP", "GumGum", "Holder", "Imedia", "I-Mobile", "iBillboard", "Improve Digital", "Index Exchange", "Industrybrains", "InMobi", "Kargo", "Kiosked", "Kixer", "Ligatus", "LOKA", "MADS", "MANTIS", "MediaImpact", "Media.net", "Mediavine", "Meg", "MicroAd", "Mixpo", "myWidget", "Nativo", "Navegg", "Nend", "NETLETIX", "Nokta", "Open AdStream (OAS)", "OpenX", "plista", "polymorphicAds", "popin", "PubMatic", "Pubmine", "PulsePoint", "Purch", "Rambler&Co", "Relap", "Revcontent", "Rubicon Project", "Sharethrough", "Sklik", "SlimCut Media", "Smart AdServer", "smartclip", "Sortable", "SOVRN", "SpotX", "SunMedia", "Swoop", "Teads", "TripleLift", "ValueCommerce", "Webediads", "Weborama", "Widespace", "Xlift", "Yahoo", "YahooJP", "Yandex", "Yieldbot", "Yieldmo", "Yieldone", "Zedo", "Zucks", "Bringhub", "Outbrain", "Taboola", "ZergNet", "Acquia Lift", "Adobe Analytics", "AFS Analytics", "AT Internet", "Baidu Analytics", "Burt", "Chartbeat", "Clicky Web Analytics", "comScore", "Cxense", "Dynatrace", "Eulerian Analytics", "Gemius", "Google AdWords", "Google Analytics", "INFOnline / IVW", "Krux", "Linkpulse", "Lotame", "Médiamétrie", "mParticle", "Nielsen", "OEWA", "Parsely", "Piano", "Quantcast Measurement", "Segment", "SOASTA mPulse", "SimpleReach", "Snowplow Analytics", "Webtrekk", "Yandex Metrica"];
    
    //If it is NOT in list of supported apps
    if (ampSupported.indexOf(key) == -1) {
        return false;
    }
    return true;
}

/**
   * Make list of supported/unsupported apps into an unordered list
   * @param {Array[String]} array - array of app names
   * @return {Element} 
   */
function makeList(array) {
    // Create the list element:
    var list = document.createElement('ul');

    for (var i = 0; i < array.length; i++) {
        // Create the list item:
        var item = document.createElement('li');
        // Set its contents:
        item.appendChild(document.createTextNode(array[i]));
        // Add it to the list:
        list.appendChild(item);
    }
    // Finally, return the constructed list:
    return list;
}

window.onload = onWindowLoad;
