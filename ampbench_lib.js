// Copyright 2015-2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// imports
//

const os = require('os');

// const http = require('http');
// const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const http = require('follow-redirects').http;
const https = require('follow-redirects').https;
require('follow-redirects').maxRedirects = 15; // 3X the default!!! we want to know when there *really* is many
const url = require('url');
const request = require('request');
const fetch = require('node-fetch');
// https://github.com/wdavidw/node-http-status/blob/master/lib/index.js
const http_status = require('http-status');
const valid_url = require('valid-url');
// https://www.npmjs.com/package/wget-improved
const wget = require('wget-improved');
const robots_parser = require('robots-parser');
const util = require('util');
const inspect_obj = (obj) => {return util.inspect(obj, { showHidden: true, depth: null })};
const cheerio = require('cheerio');
const S = require('string');
const hasBom = require('has-bom');
// const {URL} = require('url');
const URL = require('url-parse');
const mime = require('mime-types');
const punycode = require('punycode');
const createCacheUrl = require('amp-toolbox-cache-url');

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// convenient aliases
//

const puts = console.log;

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// HTTP response class
//

class HttpResponse {
    constructor(url) {
        this._url = null;
        this._url_error = '';
        this._is_https = null;
        this._http_client = null;
        this._stamp_on_begin = 0;
        this._stamp_on_end = 0;
        this._response = null;
        this._http_response_code = 0;
        this._http_response_text = '';
        this._http_response_body = '';
        this._redirects_count = 0;
        this._redirects_urls = [];
        this.is_https_cert_authorized = null;
        this.is_https_cert_certificate = null;
        this._is_https_cert_ssl_error = '';
        if (url) {
            this._url = url;
            if (check_url_is_valid(this._url)) {
                this._url_error = ''; // url seems ok
            } else {
                this._url_error =
                    'URL Error: URL string appears invalid or malformed';
            }
            if (this._url.indexOf('http://') === 0 ||
                this._url.indexOf('https://') === 0) {
                // protocol seems OK
                // this._url = str_rtrim_char(this._url, '/'); // ignore trailing slashes //TODO: PROBLEMATIC
            } else {
                this._url_error =
                    'URL Error: no valid transport protocol was found in the URL string';
            }
            this._is_https = (url.indexOf('https://') === 0);
            this._http_client = (this._is_https) ? https : http;
        } else {
            this._url_error =
                'URL Error: URL string appears blank, invalid or malformed';
        }
    }
    setResponse(res) {
        if (res) {
            this._stamp_on_begin = new Date(); // set beginning timestamp
            this._response = res;
            this._http_response_code = res.statusCode;
            this._http_response_text = 'HTTP Status: ' + res.statusCode + ' - ' + http_status[res.statusCode];
            try { // best attempt at getting SSL cert info
                this._redirects_count = res.fetchedUrls.length;
                this._redirects_urls = res.fetchedUrls;
            } catch (err) { /* pass: as a rule we want to avoid breaking */ }
            if (this.statusIsOK()) {
                if (this.is_https) {
                    try { // best attempt at getting SSL cert info - as a rule we want to avoid breaking
                        this.is_https_cert_authorized = res.socket.authorized;
                        this.is_https_cert_certificate = res.socket.getPeerCertificate();
                    } catch (err) { /* pass: as a rule we want to avoid breaking */ }
                }
            }
        } else {
            this._url_error =
                'Response Error: HttpResponse setResponse(res) requires a valid HTTP Response parameter: this was not supplied or is invalid';
        }
    }
    setResponseEnded() { // tel us when the response ended delivering content
        this._stamp_on_end = new Date(); // set ending timestamp
    }
    get duration_in_milliseconds() {
        return this._stamp_on_end - this._stamp_on_begin;
    }
    get response() {
        return this._response;
    }
    get url() { // read-only - can only be set during instantiation!
        return this._url;
    }
    get url_error() { // read-only - can only be set during instantiation!
        return this._url_error;
    }
    get is_https() { // read-only!
        return this._is_https;
    }
    get http_client() { // read-only - set during instantiation!
        return this._http_client;
    }
    get http_response_code() {
        return this._http_response_code;
    }
    get http_response_text() { // read-only - set in http_response_code()!
        return this._http_response_text;
    }
    get http_response_body() {
        return this._http_response_body;
    }
    set http_response_body(body) {
        if (body) {
            this._http_response_body = body;
        }
    }
    get redirects_count() { // read-only!
        return this._redirects_count;
    }
    get redirects_urls() { // read-only!
        return this._redirects_urls;
    }
    get is_https_cert_ssl_error() {
        return this._is_https_cert_ssl_error;
    }
    set is_https_cert_ssl_error(err) {
        if (err) {
            if ('DEPTH_ZERO_SELF_SIGNED_CERT' === err.code) {
                // "[Error: self signed certificate[DEPTH_ZERO_SELF_SIGNED_CERT]]"
                // We probably want to know this, so maybe do *not* set the following?
                // .. process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
                this.is_https_cert_authorized = false;
                // Force a 403: https://en.wikipedia.org/wiki/HTTP_403 ???
                // this._http_response_code = 403;
                this._http_response_text = 'Server SSL Certificate rejected';
            }
            this._is_https_cert_ssl_error = err.toString() + '[' + err.code + ']';
            this._http_response_text += '[' + this._is_https_cert_ssl_error + ']';
        }
    }
    urlIsOK() {
        return ('' === this.url_error);
    }
    urlIsGoogleAmpFeed() {
        return (-1 < this.url.indexOf('googleusercontent.com/amphtml'));
    }
    statusIsOK() {
        return (200 == this.http_response_code);
    }
    bodyIsNotEmpty() {
        return ('' !== this.http_response_body.trim());
    }
    wasRedirected() {
        return (1 < this.redirects_count);
    }
    print() {
        puts('=> url                      : '   + this.url);
        puts('=> url_error                : '   + this.url_error);
        puts('=> is_https                 : '   + this.is_https);
        puts('=> http_response_code       : '   + this.http_response_code);
        puts('=> http_response_text       : '   + this.http_response_text);
        puts('=> duration_in_milliseconds : '   + this.duration_in_milliseconds);
        puts('=> wasRedirected            : '   + this.wasRedirected());
        puts('=> redirects_count          : '   + this.redirects_count);
        puts('=> redirects_urls           :\n'  + this.redirects_urls.join('\n'));
        // puts('=> redirects_urls (inspect) : '   + util.inspect(this.redirects_urls));
        puts('=> is_https_cert_authorized : '   + this.is_https_cert_authorized);
        puts('=> is_https_cert_ssl_error  : '   + this.is_https_cert_ssl_error);
    }
    printWithBody() {
        this.print();
        puts('=> http_response_body       :\n'  + this.http_response_body);
    }
    printWithCert() {
        this.print();
        puts('=> is_https_cert_certificate:\n'  + util.inspect(this.is_https_cert_certificate));
    }
    printWithResponse() {
        this.print();
        puts('=> response:\n' + util.inspect(this._response));
    }
    printInspect() {
        puts('=> HttpResponse:\n' + util.inspect(this));
    }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// app validation check status constants
//

const
    CHECK_FAIL = 'FAIL',
    CHECK_PASS = 'PASS',
    CHECK_INFO = 'INFO',
    CHECK_WARN = 'WARNING',
    CHECK_NONE = 'UNKNOWN';

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// HTTP User Agent constants
// https://support.google.com/webmasters/answer/1061943?hl=en
// https://developer.chrome.com/multidevice/user-agent
// https://webmasters.googleblog.com/2016/03/updating-smartphone-user-agent-of.html
// https://deviceatlas.com/blog/list-of-user-agent-strings
// https://deviceatlas.com/blog/list-of-web-crawlers-user-agents
//

// desktop + server-side CURL
const UA_CURL = 'curl/7.43.0'; //!!! we use this User-Agent for non-crawler Googlebots
// mobile
const UA_MOBILE_ANDROID_CHROME_52 =
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/52.0.2725.0 Mobile Safari/537.36';
const UA_MOBILE_IPHONE_CHROME_52 =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1 (KHTML, like Gecko) CriOS/52.0.2725.0 Mobile/13B143 Safari/601.1.46';
const UA_MOBILE_IPHONE_SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 9_1 like Mac OS X) AppleWebKit/601.1.46 (KHTML, like Gecko) Version/9.0 Mobile/13B137 Safari/601.1';
// googlebot search crawlers
const UA_GOOGLEBOT =
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const UA_GOOGLEBOT_SMARTPHONE =
    'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// user agent currently in use - - - - - - - - - - - - - - - - - - - - - - - - -
var UA_AMPBENCH = UA_MOBILE_ANDROID_CHROME_52;
var UA_AMPBENCH_NAME = 'UA_MOBILE_ANDROID_CHROME_52';
function set_global_user_agent(user_agent) {
    UA_AMPBENCH = user_agent;
}
function get_global_user_agent() {
    return UA_AMPBENCH;
}
function set_global_user_agent_name(user_agent_name) {
    UA_AMPBENCH_NAME = user_agent_name;
}
function get_global_user_agent_name() {
    return UA_AMPBENCH_NAME;
}

// const UA_AMPBENCH = UA_CURL;
// const UA_AMPBENCH_NAME  = 'UA_CURL';

// const UA_AMPBENCH = UA_GOOGLEBOT_SMARTPHONE;
// const UA_AMPBENCH_NAME  = 'UA_GOOGLEBOT_SMARTPHONE';

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// HTTP response content inspector
//

class HttpBodySniffer {

    constructor(url, body) {

        // print_dashes(60);
        // console.log('=> HttpBodySniffer:constructor: ');
        // console.log('=> -- url : ' + url);
        // console.log('=> -- body: [' + body.substr(0,50) + '...]');

        this.isValidForUse = false; // is the sniffer in a usable state - NOT in the case of bad HTTP responses!

        if (!url || !body || '' === url || '' === body) {

            this.isValidForUse = false; // is the sniffer in a usable state - NOT in the case of bad HTTP responses!

        } else {

            this.isValidForUse = true;

            this._url = url;
            this._body = body;

            this._amphtml_rel_index = this._body.indexOf('rel="amphtml"');
            this._canonical_rel_index = this._body.indexOf('rel="canonical"');

            this._contains = {
                amphtml_signature:
                    S(this._body).contains('<html ⚡') || S(this._body).contains(' ⚡>') ||
                    S(this._body).contains('<html amp') || S(this._body).contains('<html AMP') ||
                    S(this._body).contains(' amp>') || S(this._body).contains(' AMP>'),
                amphtml_link:
                    S(this._body).contains('link rel="amphtml"'),
                amphtml_link2:
                    S(this._body).contains(' rel="amphtml" href='),
                amphtml_link3:
                    S(this._body).contains(' rel="amphtml"'),
                canonical_link:
                    S(this._body).contains('link rel="canonical"'),
                canonical_link2:
                    S(this._body).contains(' rel="canonical"'),
                canonical_link3:
                    S(this._body).contains(' rel="canonical" href='),
                amphtml_runtime:
                    S(this._body).contains('src="https://cdn.ampproject.org/v0.js"')
            };

            this._amphtml_href = this._contains.amphtml_link
                ? S(this._body).between('link rel="amphtml" href=', '>').s
                : '';
            this._amphtml_href2 = this._contains.amphtml_link2
                ? S(this._body).between(' rel="amphtml" href=', '>').s
                : '';
            this._amphtml_href3 = this._contains.amphtml_link3
                ? S(this._body).between(' href=', ' rel="amphtml"').s
                : '';

            this._canonical_href = this._contains.canonical_link
                ? S(this._body).between('link rel="canonical" href=', '>').s
                : '';
            this._canonical_href2 = this._contains.canonical_link2
                ? S(this._body).between(' rel="canonical" href=', '>').s
                : '';
            this._canonical_href3 = this._contains.canonical_link3
                ? S(this._body).between(' href=', ' rel="canonical"').s
                : '';

            this._json_ld_script_raw = this.bodyContains('type="application/ld+json"')
                ? S(this._body).between('type="application/ld+json">', '</script>').s
                : '';
            this._json_ld_script = S(this._json_ld_script_raw).strip(' ', os.EOL);

            this._contains_sd = {
                // AMP_SD_TYPES = ['Article', 'NewsArticle', 'BlogPosting', 'VideoObject'],
                // - - look for json-ld: https://developers.google.com/schemas/formats/json-ld - -
                json_ld: '' !== this._json_ld_script,
                json_ld_schema_org:
                    this.bodyContains('"@context"') && (
                    this.bodyContains('"http://schema.org/"') ||
                    this.bodyContains('"https://schema.org/"') ),
                jsonld_type: {
                    Article:
                        this.bodyContains('"@type":"Article"') ||
                        this.jsonldScriptContains('"@type":"Article"'),
                    NewsArticle:
                        this.bodyContains('"@type":"NewsArticle"') ||
                        this.jsonldScriptContains('"@type":"NewsArticle"'),
                    BlogPosting:
                        this.bodyContains('"@type":"BlogPosting"') ||
                        this.jsonldScriptContains('"@type":"BlogPosting"'),
                    WebPage:
                        this.bodyContains('"@type":"WebPage"') ||
                        this.jsonldScriptContains('"@type":"WebPage"'),
                    Organization:
                        this.bodyContains('"@type":"Organization"') ||
                        this.jsonldScriptContains('"@type":"Organization"'),
                    ImageObject:
                        this.bodyContains('"@type":"ImageObject"') ||
                        this.jsonldScriptContains('"@type":"ImageObject"'),
                    VideoObject:
                        this.bodyContains('"@type":"VideoObject"') ||
                        this.jsonldScriptContains('"@type":"VideoObject"')
                },

                // - - look for microdata: https://developers.google.com/schemas/formats/microdata - -
                microdata: S(this._body).contains(' itemprop='),
                microdata_schema_org:
                    this.bodyContains('itemtype="http://schema.org') ||
                    this.bodyContains('itemtype="https://schema.org'),
                microdata_type: {
                    Article:
                        this.bodyContains('itemtype="http://schema.org/Article"') ||
                        this.bodyContains('itemtype="https://schema.org/Article"'),
                    NewsArticle:
                        this.bodyContains('itemtype="http://schema.org/NewsArticle"') ||
                        this.bodyContains('itemtype="https://schema.org/NewsArticle"'),
                    BlogPosting:
                        this.bodyContains('itemtype="http://schema.org/BlogPosting"') ||
                        this.bodyContains('itemtype="https://schema.org/BlogPosting"'),
                    WebPage:
                        this.bodyContains('itemtype="http://schema.org/WebPage"') ||
                        this.bodyContains('itemtype="https://schema.org/WebPage"'),
                    Organization:
                        this.bodyContains('itemtype="http://schema.org/Organization"') ||
                        this.bodyContains('itemtype="https://schema.org/Organization"'),
                    ImageObject:
                        this.bodyContains('itemtype="http://schema.org/ImageObject"') ||
                        this.bodyContains('itemtype="https://schema.org/ImageObject"'),
                    VideoObject:
                        this.bodyContains('itemtype="http://schema.org/VideoObject"') ||
                        this.bodyContains('itemtype="https://schema.org/VideoObject"')
                }
            };

            this._jsonld_type_is_amp_news_carousel_main =
                this._contains_sd.jsonld_type.Article ||
                this._contains_sd.jsonld_type.NewsArticle ||
                this._contains_sd.jsonld_type.BlogPosting ||
                this._contains_sd.jsonld_type.VideoObject;

            this._jsonld_type_is_amp_news_carousel_support =
                this._contains_sd.jsonld_type.WebPage ||
                this._contains_sd.jsonld_type.Organization ||
                this._contains_sd.jsonld_type.ImageObject;

            this._jsonld_type_is_amp_news_carousel =
                this._jsonld_type_is_amp_news_carousel_main &&
                this._jsonld_type_is_amp_news_carousel_support;

            this._microdata_type_is_amp_news_carousel_main =
                this._contains_sd.microdata_type.Article ||
                this._contains_sd.microdata_type.NewsArticle ||
                this._contains_sd.microdata_type.BlogPosting ||
                this._contains_sd.microdata_type.VideoObject;

            this._microdata_type_is_amp_news_carousel_support =
                this._contains_sd.microdata_type.WebPage ||
                this._contains_sd.microdata_type.Organization ||
                this._contains_sd.microdata_type.ImageObject;

            this._microdata_type_is_amp_news_carousel =
                this._microdata_type_is_amp_news_carousel_main &&
                this._microdata_type_is_amp_news_carousel_support;

            this._sd_type_is_amp_news_carousel_main =
                this._jsonld_type_is_amp_news_carousel_main ||
                this._microdata_type_is_amp_news_carousel_main;

            this._sd_type_is_amp_news_carousel_support =
                this._jsonld_type_is_amp_news_carousel_support ||
                this._microdata_type_is_amp_news_carousel_support;

            this._sd_type_is_amp_news_carousel_main_without_support =
                this._sd_type_is_amp_news_carousel_main &&
                !this._sd_type_is_amp_news_carousel_support;

            this._sd_type_is_amp_news_carousel_support_without_main =
                !this._sd_type_is_amp_news_carousel_main &&
                this._sd_type_is_amp_news_carousel_support;

            this._sd_type_is_amp_news_carousel =
                this._jsonld_type_is_amp_news_carousel ||
                this._microdata_type_is_amp_news_carousel;

            this._sd_amp_types_found_string = ''
                + ( this._contains_sd.jsonld_type.Article
                    ? ' Article (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.Article
                    ? ' Article (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.NewsArticle
                    ? ' NewsArticle (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.NewsArticle
                    ? ' NewsArticle (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.BlogPosting
                    ? ' BlogPosting (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.BlogPosting
                    ? ' BlogPosting (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.WebPage
                    ? ' WebPage (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.WebPage
                    ? ' WebPage (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.Organization
                    ? ' Organization (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.Organization
                    ? ' Organization (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.ImageObject
                    ? ' ImageObject (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.ImageObject
                    ? ' ImageObject (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.VideoObject
                    ? ' VideoObject (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.VideoObject
                    ? ' VideoObject (Microdata)' : '' );

            this._sd_amp_carousel_types_found_string = ''
                + ( this._contains_sd.jsonld_type.Article
                    ? ' Article (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.Article
                    ? ' Article (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.NewsArticle
                    ? ' NewsArticle (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.NewsArticle
                    ? ' NewsArticle (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.BlogPosting
                    ? ' BlogPosting (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.BlogPosting
                    ? ' BlogPosting (Microdata)' : '' )

                + ( this._contains_sd.jsonld_type.VideoObject
                    ? ' VideoObject (JSON-LD)' : '' )
                + ( this._contains_sd.microdata_type.VideoObject
                    ? ' VideoObject (Microdata)' : '' );

            this._contains_byte_order_mark = hasBom(this._body);

        }
    }

    get url() { // read-only - can only be set during instantiation!
        if (this.isValidForUse) {
            return this._url;
        } else {
            return '';
        }
    }
    get body() { // read-only - can only be set during instantiation!
        if (this.isValidForUse) {
            return this._body;
        } else {
            return '';
        }
    }
    get amphtmlRelIndex() {
        if (this.isValidForUse) {
            return this._amphtml_rel_index;
        } else {
            return -1;
        }
    }
    get amphtmlRel() {
        if (this.isValidForUse && 0 < this.amphtmlRelIndex) {
            return this._body.substr(this.amphtmlRelIndex - 150, 300);
        } else {
            return '';
        }
    }
    get canonicalRelIndex() {
        if (this.isValidForUse) {
            return this._canonical_rel_index;
        } else {
            return -1;
        }
    }
    get canonicalRel() {
        if (this.isValidForUse && 0 < this.canonicalRelIndex) {
            return this._body.substr(this.canonicalRelIndex - 150, 300);
        } else {
            return '';
        }
    }
    bodyContains(text) {
        if (this.isValidForUse) {
            return S(this._body).contains(text);
        } else {
            return false;
        }
    }
    jsonldScriptContains(text) {
        if (this.isValidForUse && '' !== this._json_ld_script) {
            return S(this._json_ld_script).contains(text);
        } else {
            return false;
        }
    }
    get contains() { // has child fields so throw error if not valid
        if (this.isValidForUse) {
            return this._contains;
        } else {
            throw 'ERROR: HttpBodySniffer is not valid for use';
        }
    }
    get containsAmpHtmlSignature() {
        if (this.isValidForUse) {
            return this._contains.amphtml_signature;
        } else {
            return false;
        }
    }
    get containsAmpHtmlLink() {
        if (this.isValidForUse) {
            return this._contains.amphtml_link || this._contains.amphtml_link2 || this._contains.amphtml_link3;
        } else {
            return false;
        }
    }
    get containsCanonicalLink() {
        // console.log('=> canonicalLink:_contains.canonical_link : ' + this._contains.canonical_link);
        // console.log('=> canonicalLink:_contains.canonical_link2: ' + this._contains.canonical_link2);
        // console.log('=> canonicalLink:_contains.canonical_link3: ' + this._contains.canonical_link3);
        if (this.isValidForUse) {
            return this._contains.canonical_link || this._contains.canonical_link2 || this._contains.canonical_link3;
        } else {
            return false;
        }
    }
    get amphtmlLink() {
        console.log('=> amphtmlLink:_amphtml_href : ' + this._amphtml_href.substr(0,256).trim());
        console.log('=> amphtmlLink:_amphtml_href2: ' + this._amphtml_href2.substr(0,256).trim());
        console.log('=> amphtmlLink:_amphtml_href3: ' + this._amphtml_href3.substr(0,256).trim());
        if (this.isValidForUse) {
            if (this._contains.amphtml_link3) {
                return this._amphtml_href3.substr(0, 256).trim();
            } else if (this._contains.amphtml_link2) {
                return this._amphtml_href2.substr(0, 256).trim();
            } else if (this._contains.amphtml_link) {
                return this._amphtml_href.substr(0, 256).trim();
            } else return '';
        }
        return '';
    }
    get canonicalLink() {
        // console.log('=> canonicalLink:_canonical_href : ' + this._canonical_href.substr(0,256).trim());
        // console.log('=> canonicalLink:_canonical_href2: ' + this._canonical_href2.substr(0,256).trim());
        // console.log('=> canonicalLink:_canonical_href3: ' + this._canonical_href3.substr(0,256).trim());
        if (this.isValidForUse) {
            if (this._contains.canonical_link3) {
                return this._canonical_href3.substr(0, 256).trim();
            } else if (this._contains.canonical_link2) {
                return this._canonical_href2.substr(0, 256).trim();
            } else if (this._contains.canonical_link) {
                return this._canonical_href.substr(0, 256).trim();
            } else return '';
        }
        return '';
    }
    get containsJsonLd() {
        return this.isValidForUse ?
            this._contains_sd.json_ld_schema_org || this._contains_sd.json_ld :
            false;
    }
    get jsonLdTypeIsAmp() {
        return this.isValidForUse ?
            this._jsonld_type_is_amp_news_carousel :
            false;
    }
    get jsonLdTypeIsAmpCarousel() {
        return this.isValidForUse ?
            this._jsonld_type_is_amp_news_carousel_main :
            false;
    }
    get containsMicroData() {
        return this.isValidForUse ?
            this._contains_sd.microdata_schema_org || this._contains_sd.microdata :
            false;
    }
    get microdataTypeIsAmp() {
        return this.isValidForUse ?
            this._microdata_type_is_amp_news_carousel :
            false;
    }
    get microdataTypeIsAmpCarousel() {
        return this.isValidForUse ?
            this._microdata_type_is_amp_news_carousel_main :
            false;
    }
    get containsMixedStructuredDataMarkup() {
        let _ret = {
                status: false,
                result: ''
        };
        if (this.isValidForUse) {
            _ret.status = this.containsJsonLd && this.containsMicroData;
            _ret.result = _ret.status
                ? 'Page contains Structured Data for more than one markup format (this might include non-AMP relevant items)'
                : 'Page Structured Data markup appears to be of a single format';
        }
        return _ret;
    }
    get containsAmpStructuredData() {
        return this.isValidForUse ?
            this.jsonLdTypeIsAmp || this.microdataTypeIsAmp :
            false;
    }
    get containsAmpCarouselStructuredData() {
        return this.isValidForUse ?
            this.jsonLdTypeIsAmpCarousel || this.microdataTypeIsAmpCarousel :
            false;
    }
    get containsIncompleteAmpCarouselStructuredData() {
        // SD for one of the following is missing: Article || NewsArticle || BlogPosting || VideoObject
        let _ret = {
            status: false,
            result: ''
        };
        if (this.isValidForUse) {
            if (this.containsAmpStructuredData && !this.containsAmpCarouselStructuredData) {
                _ret.status = true;
                _ret.result = 'contains AMP Structured Data: is missing AMP Carousel supporting Structured Data: ';
            }
            if (!this.containsAmpStructuredData && !this.containsAmpCarouselStructuredData) {
                _ret.status = true;
                _ret.result = 'is missing AMP Structured Data: is missing AMP Carousel supporting Structured Data: ';
            }

            _ret.result = _ret.status
                ? _ret.result + 'Page might contain incomplete Top Stories Carousel for AMP markup'
                : _ret.result + 'Page appears to contain complete Top Stories Carousel for AMP markup';
        }
        // console.log('=> this.containsIncompleteAmpCarouselStructuredData: ' + _ret.status);
        // console.log('=> this.containsAmpStructuredData                  : ' + this.containsAmpStructuredData);
        // console.log('=> this.containsAmpCarouselStructuredData          : ' + this.containsAmpCarouselStructuredData);
        return _ret;
    }
    get ampStructuredDataTypesFound() {
        return this.isValidForUse ?
            this._sd_amp_types_found_string :
            false;
    }
    get ampCarouselStructuredDataTypesFound() {
        return this.isValidForUse ?
            this._sd_amp_carousel_types_found_string :
            false;
    }
    get containsAmpNewsCarouselStructuredDataTypeMain() {
        return this.isValidForUse ?
            this._sd_type_is_amp_news_carousel_main :
            false;
    }
    get containsAmpNewsCarouselStructuredDataTypeSupport() {
        return this.isValidForUse ?
            this._sd_type_is_amp_news_carousel_support :
            false;
    }
    get containsAmpNewsCarouselStructuredDataTypeMainWithoutSupport() {
        return this.isValidForUse ?
            this._sd_type_is_amp_news_carousel_main_without_support :
            false;
    }
    get containsAmpNewsCarouselStructuredDataTypeSupportWithoutMain() {
        return this.isValidForUse ?
            this._sd_type_is_amp_news_carousel_support_without_main :
            false;
    }
    get containsByteOrderMark() {
        return this.isValidForUse ?
            this._contains_byte_order_mark :
            false;
    }
}

class HttpBodyParser extends HttpBodySniffer {

    constructor(url, body) {
        super(url, body);
        this._index_of_search = -1;
    }

    bodyContains(search_text) { // override super method
        if (this.isValidForUse) {
            this._index_of_search = this._body.indexOf(search_text);
            return (-1 < this._index_of_search);
        } else {
            throw 'ERROR: HttpBodyParser instance is not valid for use';
        }
    }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// AMP validator: Official Node.js API
// https://github.com/ampproject/amphtml/tree/master/validator/nodejs#nodejs-api-beta
//

// Latest AMP cached validator from: 'https://cdn.ampproject.org/v0/validator.js'
// https://github.com/ampproject/amphtml/blob/master/validator/nodejs/index.js
// https://github.com/ampproject/amphtml/blob/master/validator/nodejs/index.js#L286
const VALIDATOR_JS_URL  = 'https://cdn.ampproject.org/v0/validator.js';
const VALIDATOR_JS_FILE = './validator/validator.js';

const amphtml_validator = require('amphtml-validator');
var   amphtml_validator_instance = null; // cache the instance

// The signature for the validator.js file that this module is currently using.
// This gets updated in sync with amphtml_validator_instance.
var   amphtml_validator_signature = '*unavailable*';

function lib_amphtml_validator_signature() {
  return amphtml_validator_signature;
}

// Computes a SHA256 signature, which is what you'd get if you were to
// run the sha256sum Linux command on the validator.js file. This is used to
// distinguish releases of the validator.js file.
function lib_extract_validator_signature(validator_js_contents) {
    return crypto.createHash('sha256').update(validator_js_contents).digest('hex');
}

function lib_fetch_cdn_validator_signature(callback) {
    fetch(VALIDATOR_JS_URL)
        .then(function(res) {
            return res.text();
        }).then(function(validator_js_contents) {
            callback(lib_extract_validator_signature(validator_js_contents));
        });
}

/**
 * Loads the AMPHTML JavaScript validator as per 'https://cdn.ampproject.org/v0/validator.js'
 * @returns {!Object} validatorInstance
 */
function lib_load_validator(opt_force_reload) {
    let _force_reload = opt_force_reload || false;
    if (!_force_reload && amphtml_validator_instance !== null) {
        return amphtml_validator_instance;
    }
    // amphtml_validator_instance is a module level global, so we cache it and will
    // return it unless opt_force_reload is true.
    const validator_js_contents = fs.readFileSync(VALIDATOR_JS_FILE).toString()
    amphtml_validator_signature = lib_extract_validator_signature(
        validator_js_contents);
    amphtml_validator_instance = amphtml_validator.newInstance(validator_js_contents);
    return amphtml_validator_instance;
}

/**
 * Downloads the AMPHTML JavaScript validator from 'https://cdn.ampproject.org/v0/validator.js'
 */
function lib_download_validator(callback_on_complete) {
    const _callback_on_complete = callback_on_complete || null;
    const source_url  = VALIDATOR_JS_URL;
    const target_file = VALIDATOR_JS_FILE;
    var options = {
        // see: https://www.npmjs.com/package/wget-improved#download-and-request-method-options
    };
    var download = wget.download(source_url, target_file, options);
    download.on('error', function(err) {
        console.log('[VALIDATOR REFRESH] ERROR: ' + err);
    });
    download.on('start', function() {
        console.log('[VALIDATOR REFRESH] START: Beginning download to disk...');
    });
    download.on('end', function(output) {
        console.log('[VALIDATOR REFRESH] END: ' + output);
        lib_load_validator(true);               // reload the validator into memory
        if (null != _callback_on_complete) {
            _callback_on_complete(amphtml_validator_signature);
        }
    });
}

/**
 * Downloads the AMPHTML JavaScript validator and reloads it into memory with opt_force_reload = true
 * if a different (not only newer; might be a rollback) version is available.
 */
function lib_refresh_validator_if_stale(callback_on_complete) {
    lib_fetch_cdn_validator_signature( (validator_signature_cdn) => {
        if (validator_signature_cdn !== amphtml_validator_signature) {
            lib_download_validator(callback_on_complete);
        } else {
            callback_on_complete(amphtml_validator_signature);
        }
    });
}

/**
 * Renders the validation results into an array of human readable strings.
 * @param {!Object} validationResult
 * @param {string} validate_url to use in rendering error messages.
 * @return {!Array<string>}
 * @export
 */

function lib_renderValidationResult(validationResult, validate_url) {
    const rendered = [];
    if (CHECK_PASS === validationResult.status) {
        rendered.push(CHECK_PASS);
    } else {
        rendered.push(CHECK_FAIL);
    }
    for (let ii = 0; ii < validationResult.errors.length; ii++) {
        const error = validationResult.errors[ii];
        let msg = validate_url + ': ' + 'line ' + error.line + ', col ' + error.col + ': ' + error.message;
        if (error.specUrl) {
            msg += ' (see ' + error.specUrl + ')';
        }
        rendered.push(msg);
    }
    return rendered;
}

function lib_validate(body, validate_url) {
    let _validator = lib_load_validator();
    let _results = _validator.validateString(body);
    let _output = lib_renderValidationResult(_results, validate_url);
    return _output; //!!!NOTE: returns an ARRAY
}

function lib_validate_lines(body, validate_url) {
    let _output = lib_validate(body, validate_url);
    return _output.join(os.EOL); //!!!NOTE: returns a MULTILINE STRING
}

function lib_validate_json(body, validate_url) {
    let _output = lib_validate(body, validate_url);
    return _output; //!!!NOTE: returns an ARRAY
}

function fetch_and_validate_url(validate_url, on_output_callback, as_json) {

    let http_response = new HttpResponse(validate_url);

    if (http_response.urlIsOK()) { // do not bother if not...

        let full_path = validate_url;

        if (full_path.indexOf('http://') === 0 ||
            full_path.indexOf('https://') === 0) {

            let url_parsed = url.parse(full_path),
                url_parsed_path = url_parsed.pathname;

            if (url_parsed.search) {
                url_parsed_path = url_parsed.pathname + url_parsed.search
            }

            const callback = (res) => {

                let chunks = [], body = '', output = '';

                http_response.setResponse(res); //!!!DO THIS IMMEDIATELY else HttpResponse class is useless
                if (!http_response.statusIsOK()) { // NOT (200 == this.http_response_code)
                    http_response.http_response_body = '';
                    on_output_callback(http_response, [CHECK_FAIL]); // !!! RETURN to front-end  - - - - - - - - - - - -
                }

                res.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    http_response.setResponseEnded();
                    body = chunks.join('');
                    http_response.http_response_body = body;
                    if (http_response.statusIsOK()) {
                        if (0 === as_json) { // return output as JSON or not
                            output = lib_validate_lines(body, full_path); //!!!NOTE: gets a MULTILINE STRING
                        } else {
                            output = lib_validate_json(body, full_path); //!!!NOTE: gets an ARRAY
                        }
                        on_output_callback(http_response, output); // !!! RETURN to front-end  - - - - - - - - - - - - -
                    }
                });
            };

            const http_options = {
                host: url_parsed.hostname,
                path: url_parsed_path,
                headers: {'User-Agent': UA_AMPBENCH}
            };
            let req = http_response.http_client.request(http_options, callback);
            req.on('error', (err) => {
                http_response.is_https_cert_ssl_error = err;
                on_output_callback(http_response, [CHECK_FAIL]); // !!! RETURN to front-end  - - - - - - - - - - - - - -
            });
            req.end();
        }
    } else {
        http_response.http_response_body = '';
        on_output_callback(http_response, [CHECK_FAIL]); // !!! RETURN to front-end  - - - - - - - - - - - - - - - - - -
    }
}

function fetch_and_parse_url_for_amplinks(request_url, on_parsed_callback) {

    let __return = {
        status: CHECK_FAIL, // status indicates successful fetch and parse, nothing more: client checks url content
        url: request_url,
        canonical_url: '',
        amphtml_url: '',
        amphtml_urls: [],
        has_dns_prefetch: false
    };

    let __temp = null;

    let http_response = new HttpResponse(request_url);

    if (http_response.urlIsOK()) { // do not bother if not...

        let full_path = request_url,
            url_parsed = url.parse(full_path),
            url_parsed_path = url_parsed.pathname;

        if (url_parsed.search) {
            url_parsed_path = url_parsed.pathname + url_parsed.search
        }

        if (full_path.indexOf('http://') === 0 ||
            full_path.indexOf('https://') === 0) {

            const callback = (res) => {

                let chunks = [], body = '';

                http_response.setResponse(res); //!!!DO THIS IMMEDIATELY else HttpResponse class is useless
                if (!http_response.statusIsOK()) { // NOT (200 == this.http_response_code)
                    __return.url = full_path;
                    __return.canonical_url = '';
                    __return.amphtml_url = '';
                    __return.amphtml_urls = [];
                    __return.has_dns_prefetch = false;
                    __return.status = CHECK_FAIL;
                    http_response.http_response_body = '';
                    on_parsed_callback(http_response, __return); // !!! RETURN to front-end  - - - - - - - - - - - - - -
                }

                res.on('data', (chunk) => {
                    chunks.push(chunk);
                });
                res.on('end', () => {
                    http_response.setResponseEnded();
                    body = chunks.join('');
                    http_response.http_response_body = body;
                    __temp = parse_body_for_amplinks(body, http_response);
                    __return.url = full_path;
                    __return.canonical_url =    __temp.canonical_url;
                    __return.amphtml_url =      __temp.amphtml_url;
                    __return.amphtml_urls =     __temp.amphtml_urls;
					__return.has_dns_prefetch = __temp.has_dns_prefetch;
                    __return.status = __temp.amphtml_urls.length > 0 ? CHECK_WARN : CHECK_PASS;

                    on_parsed_callback(http_response, __return); // !!! RETURN to front-end  - - - - - - - - - - - - - - -
                });
            };

            const http_options = {
                host: url_parsed.hostname,
                path: url_parsed_path,
                headers: {'User-Agent': UA_AMPBENCH}
            };
            let req = http_response.http_client.request(http_options, callback);
            req.on('error', (err) => {
                http_response.is_https_cert_ssl_error = err;
                __return.url = full_path;
                __return.canonical_url = '';
                __return.amphtml_url = '';
                __return.amphtml_urls = [];
                __return.has_dns_prefetch = false;
                __return.status = CHECK_FAIL;
                on_parsed_callback(http_response, __return); // !!! RETURN to front-end  - - - - - - - - - - - - - - - -
            });
            req.end();
        }
    } else {
        __return.url = request_url;
        __return.canonical_url = '';
        __return.amphtml_url = '';
        __return.amphtml_urls = [];
        __return.has_dns_prefetch = false;
        __return.status = CHECK_FAIL;
        http_response.http_response_body = '';
        on_parsed_callback(http_response, __return); // !!! RETURN to front-end  - - - - - - - - - - - - - - - - - -
    }
}

function get_http_redirect_status(http_response) {
    let
        __ret = 2 < http_response.redirects_count ? CHECK_INFO : CHECK_PASS;
        __ret = 3 < http_response.redirects_count ? CHECK_WARN : __ret;
        __ret = 5 < http_response.redirects_count ? CHECK_FAIL : __ret;
    return __ret;

}

function build_http_redirect_warning_lines(http_response) {
    return make_url_href_list(http_response.redirects_urls);
}

function build_warning_lines_from_validation_output(url, output, filter) {

    const
        FILTER_REQD_LONG = '(see https://www.ampproject.org/docs/reference/spec.html#required-markup)',
        FILTER_REQD_SHORT = '/spec.html#required-markup',
        FILTER_REQD = '' === filter.trim() ? FILTER_REQD_SHORT : filter;

    const
        FILTER_SIZE_LONG = '(see https://www.ampproject.org/docs/reference/spec.html#maximum-size)',
        FILTER_SIZE_SHORT = '/spec.html#maximum-size',
        FILTER_SIZE = '' === filter.trim() ? FILTER_SIZE_SHORT : filter;

        let amp_val_results_len = output.length,
        amp_val_results = 0 < amp_val_results_len ? output.split(os.EOL) : ''; // payload packaged as output.join(os.EOL);

    let amp_val_warnings_len = amp_val_results_len - 1,
        amp_val_warning_lines = '',
        amp_val_warning_status = CHECK_FAIL;

    const
        // amp_val_results_status = 0 < amp_val_results_len ? amp_val_results.shift() : CHECK_FAIL; // pop status and shift left
        amp_val_results_status = 0 < amp_val_results_len ? amp_val_results.shift() : ''; // pop status and shift left

    let amp_val_warnings = amp_val_results,
        amp_val_warning_split = [],
        amp_val_warnings_out = [],
        amp_val_results_short_out = [],
        amp_val_results_short_out_string = '',
        amp_val_results_short_split = [];

    // console.log('=> amp_val_results_len: '  + amp_val_results_len);
    // console.log('=> amp_val_results    :\n' + amp_val_results);

    if (0 < amp_val_results_len) {
        amp_val_warnings_len = 0; // reset
        amp_val_results_short_out.push(amp_val_results_status);
        amp_val_warnings.forEach( (warning) => {
            // console.log('=> warning: ' + warning);
            amp_val_results_short_split = warning.split(url)[1]; // strip out url to shorten line
            amp_val_results_short_out.push(amp_val_results_short_split);
            if (-1 < warning.indexOf(FILTER_REQD) ||
                -1 < warning.indexOf(FILTER_SIZE)) {
                amp_val_warnings_len += 1;
                amp_val_warning_split = warning.split(url)[1]; // strip out url to shorten line
                amp_val_warnings_out.push(amp_val_warning_split);
            }
        });
        amp_val_results_short_out_string = amp_val_results_short_out.join(os.EOL);
        if (0 < amp_val_warnings_len) {
            const // build 5 actual warning lines to pass to template !NOT in a loop for now!
                kBR = '<br>',
                amp_val_warning1 = 0 < amp_val_warnings_len && '' !== amp_val_warnings_out[0] ? amp_val_warnings_out[0] : '',
                amp_val_warning2 = 1 < amp_val_warnings_len && '' !== amp_val_warnings_out[1] ? kBR + amp_val_warnings_out[1] : '',
                amp_val_warning3 = 2 < amp_val_warnings_len && '' !== amp_val_warnings_out[2] ? kBR + amp_val_warnings_out[2] : '',
                amp_val_warning4 = 3 < amp_val_warnings_len && '' !== amp_val_warnings_out[3] ? kBR + amp_val_warnings_out[3] : '',
                amp_val_warning5 = 4 < amp_val_warnings_len && '' !== amp_val_warnings_out[4] ? kBR + amp_val_warnings_out[4] : '';
            amp_val_warning_lines =
                `${amp_val_warning1}${amp_val_warning2}${amp_val_warning3}${amp_val_warning4}${amp_val_warning5}`;
            amp_val_warning_status = CHECK_PASS === amp_val_results_status ? CHECK_WARN : amp_val_warning_status;
        } else {
            amp_val_warning_lines = 'AMP HTML required markup content appears to be valid';
            amp_val_warning_status = CHECK_PASS;
        }
    } else {
        if (CHECK_FAIL === amp_val_results_status) {
            amp_val_warning_lines = 'AMP HTML required markup content could not be retrieved';
            amp_val_warning_status = CHECK_FAIL;
        }
    }

    return {
        amp_val_results_status: amp_val_results_status,
        amp_val_warnings_len: amp_val_warnings_len,
        amp_val_warning_status: amp_val_warning_status,
        amp_val_warning_lines: amp_val_warning_lines,
        amp_val_results_short: amp_val_results_short_out_string // amp_val_results_status + prefix !!!
    };
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// check if a URL is properly formed
//

function check_url_is_valid(url) {
    if (valid_url.isUri(url)) {
        // console.log('=> looks like an URI: ' + url);
        return true;
    } else {
        // console.log('=> not a URI: ' + url);
        return false;
    }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// check if a page can be reached via given URL - i.e. a URL gives a valid response.
//

function check_url_is_reachable(url, callback) {
    return check_url_is_reachable_with_user_agent(url, UA_GOOGLEBOT, callback); // use crawler Googlebot
}

function check_url_is_reachable_with_googlebot(url, callback) {
    return check_url_is_reachable_with_user_agent(url, UA_GOOGLEBOT, callback); // use crawler Googlebot
}

function check_url_is_reachable_with_googlebot_smartphone(url, callback) {
    return check_url_is_reachable_with_user_agent(url, UA_GOOGLEBOT_SMARTPHONE, callback); // use crawler Googlebot
}

function check_url_is_reachable_with_user_agent(fetch_url, user_agent, callback) {

    let _ret = {
        url: fetch_url,
        agent: user_agent,
        http_response_code: 0,
        ok: false,
        status: '',
        result: '',
        size: 0,
        body: '',
        err: null
    };

    const options = {
        method: 'GET',
        headers: { 'user-agent': user_agent }
    };

    try {
        fetch(fetch_url, options)
            .then(function(res) {
                // _log_response(res);
                _ret.http_response_code = res.status;
                if (res.status === 200) {
                    _ret.ok = true;
                    _ret.status = CHECK_PASS;
                    _ret.result = '[HTTP: ' + res.status + '] URL is reachable';
                    _ret.size = res.size;
                    _ret.err = false; // make it false rather than null
                } else {
                    _ret.ok = false;
                    _ret.status = CHECK_FAIL;
                    _ret.result = '[HTTP: ' + res.status + ': ' + res.statusText + '][' + fetch_url + '] is reachable but NOT OK (not 200)';
                    _ret.size = res.size;
                    _ret.err = true; // make it true rather than null
                }
                // _log_return(_ret);
                // return callback(_ret);
                return res.text();
            })
            .then(function(body) {
                _ret.body = body;
                // _log_return(_ret);
                return callback(_ret);
            })
            .catch(err => {
                _ret.ok = false;
                _ret.status = CHECK_FAIL;
                _ret.result = '[HTTP: ' + err.message + '][' + fetch_url + '] is unreachable';
                _ret.size = -1;
                _ret.err = err;
                // _log_return(_ret);
                return callback(_ret);
            });
    } catch(err) {
        _ret.ok = false;
        _ret.status = CHECK_FAIL;
        _ret.result = '[HTTP: ' + err.message + '][' + fetch_url + '] is unreachable';
        _ret.size = -1;
        _ret.err = err;
        // _log_return(_ret);
        return callback(_ret);
    }

    function _log_response(res) {
        print_dashes(60);
        console.log('=> fetch response  :');
        console.log('=> fetch_url       : ' + fetch_url);
        console.log('=> res.ok          : ' + res.ok);
        console.log('=> res.status      : ' + res.status);
        console.log('=> res.statusText  : ' + res.statusText);
        console.log('=> res.content-type: ' + res.headers.get('content-type'));
    }
    function _log_return(ret) {
        print_dashes(60);
        console.log('=> fetch return:');
        console.log('=> _ret.url    : ' + ret.url);
        console.log('=> _ret.agent  : ' + ret.agent);
        console.log('=> _ret.ok     : ' + ret.ok);
        console.log('=> _ret.status : ' + ret.status);
        console.log('=> _ret.result : ' + ret.result);
        console.log('=> _ret.size   : ' + ret.size);
        console.log('=> _ret.err    : ' + ret.err);
        console.log('=> _ret.body   : ' + ret.body);
    }

}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// check robots.txt access for Googlebot AMP crawling agents
// Google crawlers - which robots Google uses to crawl the web:
// -- https://support.google.com/webmasters/answer/1061943?hl=en
// -- https://webmasters.googleblog.com/2016/03/updating-smartphone-user-agent-of.html
//

function make_robots_txt_url(uri) {

    const parse_url = require('url').parse;
    let parsed = parse_url(uri);

    if ((!parsed.protocol) || (!parsed.host)) {
        throw new Error('Cannot parse URL ' + uri);
    }

    return [
        parsed.protocol, '//',
        parsed.auth || '', parsed.auth ? '@' : '',
        parsed.host,
        '/robots.txt'
    ].join('');

}

function check_robots_txt(validation_url, callback) {

    let check_url_is_reachable_return = null;

    let check_robots_txt_return = {},
        check_robots_txt_status = '',
        check_robots_txt_results = '',
        check_robots_txt_file_url = '',
        check_robots_txt_file_url_404 = false,
        check_robots_txt_ua_googlebot_ok = '',
        check_robots_txt_ua_googlebot_smartphone_ok = '';

    function build_results(build_result_extras) {
        check_robots_txt_results =
            'Googlebot [' + check_robots_txt_ua_googlebot_ok + '] ' +
            'Googlebot-Smartphone [' + check_robots_txt_ua_googlebot_smartphone_ok + '] ';
        check_robots_txt_results
            = build_result_extras
            ? check_robots_txt_results + '[' + build_result_extras + ']'
            : check_robots_txt_results;
        if (check_robots_txt_file_url_404) {
            check_robots_txt_status = CHECK_PASS;
        } else {
            if (CHECK_PASS === check_url_is_reachable_return.status) {
                if (CHECK_PASS === check_robots_txt_ua_googlebot_ok &&
                    CHECK_PASS === check_robots_txt_ua_googlebot_smartphone_ok) {
                    check_robots_txt_status = CHECK_PASS;
                }
            } else {
                check_robots_txt_status = check_url_is_reachable_return.status;
            }
        }
        check_robots_txt_return = {
            check_robots_txt_status: check_robots_txt_status,
            check_robots_txt_results: check_robots_txt_results,
            check_robots_txt_file_url: check_robots_txt_file_url,
            check_robots_txt_file_url_404: check_robots_txt_file_url_404,
            check_robots_txt_ua_googlebot_ok: check_robots_txt_ua_googlebot_ok,
            check_robots_txt_ua_googlebot_smartphone_ok: check_robots_txt_ua_googlebot_smartphone_ok,
            check_url_is_reachable_return: check_url_is_reachable_return
        };
        // console.log('=> [robots.txt] ' + check_robots_txt_file_url);
        // console.log('=> [Googlebot] ' + check_robots_txt_ua_googlebot_ok + ': ' + url);
        // console.log('=> [Googlebot-Smartphone] ' + check_robots_txt_ua_googlebot_smartphone_ok + ': ' + url);
    };

    function url_is_reachable_callback(_ret) {
        // return object: _ret = {
        //     url: fetch_url,
        //     agent: user_agent,
        //     ok: false,
        //     status: '',
        //     result: '',
        //     size: 0,
        //     body: '',
        //     err: null
        // };

        check_url_is_reachable_return = _ret;
        // console.log('=> check_robots_txt: url   : '  + check_url_is_reachable_return.url);
        // console.log('=> check_robots_txt: status: '  + check_url_is_reachable_return.status);
        // console.log('=> check_robots_txt: result: '  + check_url_is_reachable_return.result);

        if (!_ret.ok) { // cannot get to the sites robots.txt
            if (_ret.http_response_code === 404) { // 404 is OK: https://developers.google.com/search/reference/robots_txt
                check_robots_txt_file_url_404 = true;
                check_robots_txt_ua_googlebot_ok = CHECK_PASS;
                check_robots_txt_ua_googlebot_smartphone_ok = CHECK_PASS;
            } else {
                check_robots_txt_ua_googlebot_ok = CHECK_FAIL;
                check_robots_txt_ua_googlebot_smartphone_ok = CHECK_FAIL;
            }
            build_results();
            callback(check_robots_txt_return);
        } else {
            check_robots_txt_file_url_404 = false;
            try {
                // https://www.npmjs.com/package/robots-parser - - - - - - - - - - - - - - - - - - - -
                const robots = robots_parser(check_robots_txt_file_url, _ret.body);
                // robots.getSitemaps(); // ['http://example.com/sitemap.xml']
                let site_maps = robots.getSitemaps();
                let site_map_cnt = site_maps.length;
                site_maps
                    = site_maps[0]
                    ? 'site maps (' + site_map_cnt + '): ' + site_maps[0]
                    : null;
                let build_result_extras = site_maps || null;

                // UA_GOOGLEBOT
                check_robots_txt_ua_googlebot_ok
                    = robots.isAllowed(validation_url, UA_GOOGLEBOT)
                    ? CHECK_PASS : CHECK_FAIL;
                // UA_GOOGLEBOT_SMARTPHONE
                check_robots_txt_ua_googlebot_smartphone_ok
                    = robots.isAllowed(validation_url, UA_GOOGLEBOT_SMARTPHONE)
                    ? CHECK_PASS : CHECK_FAIL;
                build_results(build_result_extras);
                callback(check_robots_txt_return);
            } catch (err) {
                console.log('==> ERROR: check_robots_txt(validation_url): '  + validation_url);
                console.log('==> ERROR: check_robots_txt(err)           : '  + err);
                check_robots_txt_ua_googlebot_ok = CHECK_FAIL;
                check_robots_txt_ua_googlebot_smartphone_ok = CHECK_FAIL;
                build_results(err);
                callback(check_robots_txt_return);
            }
        }
    }

    check_robots_txt_file_url = make_robots_txt_url(validation_url);
    check_url_is_reachable(check_robots_txt_file_url, url_is_reachable_callback);

}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// check if url is already in the Google AMP Cache.
// -- https://ampbyexample.com/advanced/using_the_google_amp_cache/
//

function check_google_amp_cache(url, callback) {

    const
        url_cdn     = make_url_to_google_amp_cache(url),
        url_viewer  = make_url_to_google_amp_viewer(url);

    let check_google_amp_cache_return = {},
        check_google_amp_cache_status = '',
        check_google_amp_cache_results = '',
        duration_in_milliseconds = 0;

    let check_google_amp_viewer_return = null;

    let _stamp_on_begin = new Date(); // set beginning timestamp

    request( { uri: url_cdn, headers: {'User-Agent': UA_AMPBENCH} }, (err, res, body) => {
        if (!err) {
            if (res.statusCode == 200) {
                duration_in_milliseconds = new Date() - _stamp_on_begin;
                check_google_amp_cache_status = CHECK_PASS;
                check_google_amp_cache_results =
                    '[HTTP: ' + res.statusCode + '] URL is indexed in the Google AMP Cache:';
            } else {
                check_google_amp_cache_status = CHECK_FAIL;
                check_google_amp_cache_results =
                    '[HTTP: ' + res.statusCode + '] URL is not indexed the Google AMP Cache:';
            }
        } else {
            check_google_amp_cache_status = CHECK_FAIL;
            check_google_amp_cache_results =
                '[HTTP: ' + err.message + '] URL is not reachable in the Google AMP Cache:';
        }

        const check_google_amp_viewer_callback = (_check_viewer_return) => {
            check_google_amp_viewer_return = _check_viewer_return;
            check_google_amp_cache_return = {
                check_google_amp_cache_status: check_google_amp_cache_status,
                check_google_amp_viewer_status: check_google_amp_viewer_return.check_google_amp_viewer_status,
                check_google_amp_cache_results: check_google_amp_cache_results,
                check_google_amp_viewer_results: check_google_amp_viewer_return.check_google_amp_viewer_results,
                check_google_amp_cache_url: url_cdn,
                check_google_amp_viewer_url: url_viewer,
                duration_in_milliseconds: duration_in_milliseconds,
                duration_in_milliseconds_amp_viewer: check_google_amp_viewer_return.duration_in_milliseconds
            };
            callback(check_google_amp_cache_return);
        };
        check_google_amp_viewer(url, check_google_amp_viewer_callback);
    });
}

function check_google_amp_viewer(url, callback) {

    const url_viewer  = make_url_to_google_amp_viewer(url);

    let check_google_amp_viewer_return = {},
        check_google_amp_viewer_status = '',
        check_google_amp_viewer_results = '',
        duration_in_milliseconds = 0;

    let _stamp_on_begin = new Date(); // set beginning timestamp

    request( { uri: url_viewer, headers: {'User-Agent': UA_AMPBENCH} }, (err, res, body) => {
        if (!err) {
            if (res.statusCode == 200) {
                duration_in_milliseconds = new Date() - _stamp_on_begin;
                check_google_amp_viewer_status = CHECK_PASS;
                check_google_amp_viewer_results =
                    '[HTTP: ' + res.statusCode + '] URL is reachable in the Google AMP Viewer:';
            } else {
                check_google_amp_viewer_status = CHECK_FAIL;
                check_google_amp_viewer_results =
                    '[HTTP: ' + res.statusCode + '] URL is not reachable in the Google AMP Viewer';
            }
        } else {
            check_google_amp_viewer_status = CHECK_FAIL;
            check_google_amp_viewer_results =
                '[HTTP: ' + err.message + '] URL is not reachable in the Google AMP Viewer:';
        }
        check_google_amp_viewer_return = {
            check_google_amp_viewer_status: check_google_amp_viewer_status,
            check_google_amp_viewer_results: check_google_amp_viewer_results,
            check_google_amp_viewer_url: url_viewer,
            duration_in_milliseconds: duration_in_milliseconds
        };
        callback(check_google_amp_viewer_return);
    });
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// follow and report redirects if any - could have negative impact on AMP
//

function check_redirects_for_mobile(url, callback) {

    var href_request = '', href_response = '';
    var check_redirects_return = {},
        check_redirects_status = '',
        check_redirects_results = '',
        check_redirects_ua_name = 'Googlebot Smartphone',
        check_redirects_user_agent = UA_GOOGLEBOT_SMARTPHONE;

    const options = {
        url: url,
        headers: { // https://developer.chrome.com/multidevice/user-agent
            'User-Agent': check_redirects_user_agent
        }
    };

    const req = request(options, (err, res, body) => {
        href_request = url;
        if (typeof(res) == "undefined") {
            check_redirects_status = CHECK_FAIL;
            check_redirects_results = err.message;
            // href_request = req.uri.href;
            href_response = 'Destination URL is unreachable';
        } else {
            // href_request = str_rtrim_char(href_request, '/'); //TODO: PROBLEMATIC
            // href_response = str_rtrim_char(res.request.uri.href, '/'); //TODO: PROBLEMATIC
            if (href_request === href_response) {
                check_redirects_status = CHECK_PASS;
                check_redirects_results = 'Page does not appear redirected:';
            } else {
                check_redirects_status = CHECK_FAIL;
                check_redirects_results = 'Page appears redirected:';
            }
        }
        check_redirects_return = {
            check_redirects_status: check_redirects_status,
            check_redirects_results: check_redirects_results,
            check_redirects_ua_name: check_redirects_ua_name,
            check_redirects_user_agent: check_redirects_user_agent,
            href_request: href_request,
            href_response: href_response
        };
        // console.log('=> req.uri.href           : ' + href_request);
        // console.log('=> res.request.uri.href   : ' + href_response);
        // console.log('=> check_redirects_status : ' + check_redirects_return.check_redirects_status);
        // console.log('=> check_redirects_results: ' + check_redirects_return.check_redirects_results);
        callback(check_redirects_return);
    });
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// validate canonical + amphtml links and robots tags in header and body
// <link rel="canonical" href="http://www.theguardian.com/artanddesign/2010/oct/26/eames-furniture-team-charles-ray"/>
// <link rel="amphtml" href="https://amp.theguardian.com/artanddesign/2010/oct/26/eames-furniture-team-charles-ray">
//

function parse_page_content(http_response) {

    let __return = {
        canonical_url: '',
        amphtml_url: '',
        amphtml_urls: [],
        http_body_sniffer: null,
        has_dns_prefetch: false,
        amp_uses_feed: http_response.urlIsGoogleAmpFeed(),
        check_robots_meta_result: 'Page content could not be read.',
        check_robots_meta_status: CHECK_FAIL,
        check_x_robots_tag_header_results: 'Response header could not be read.',
        check_x_robots_tag_header_status: CHECK_FAIL,
        check_ims_or_etag_header: null
    };

    let __temp = null;

    __return.http_body_sniffer = new HttpBodySniffer(http_response.url, http_response.http_response_body);
    __return.check_ims_or_etag_header = parse_headers_for_if_modified_since_or_etag(http_response);

    if (http_response.statusIsOK() && http_response.bodyIsNotEmpty()) { // page fetch PASS

        __temp = parse_body_for_amplinks_and_robots_metatags(http_response);
        __return.canonical_url = __temp.canonical_url;
        __return.amphtml_url = __temp.amphtml_url;
        __return.amphtml_urls = __temp.amphtml_urls;
        __return.has_dns_prefetch = __temp.has_dns_prefetch;
        __return.check_robots_meta_status = __temp.check_robots_meta_status;
        __return.check_robots_meta_result = __temp.check_robots_meta_result;

        __temp = parse_headers_for_x_robots_tag(http_response);
        __return.check_x_robots_tag_header_results = __temp.check_x_robots_tag_header_results;
        __return.check_x_robots_tag_header_status = __temp.check_x_robots_tag_header_status;

    } else { // page fetch FAIL

        __return.check_robots_meta_result =
            'Robots meta tag could not be read: HTTP fetch failed [' + http_response.http_response_text + ']';
        __return.check_robots_meta_status = CHECK_FAIL;

        __return.check_x_robots_tag_header_results =
            'X-Robots meta tag could not be read: HTTP fetch failed [' + http_response.http_response_text + ']';
        __return.check_x_robots_tag_header_status = CHECK_FAIL;

    }

    return __return;

}

function parse_body_for_amplinks(body, http_response) {
// function parse_body_for_amplinks(body) {

    // print_dashes(60);
    // console.log('=> http_response.url: ' + http_response.url);
    // // http_response.printWithBody();
    // print_dashes(30);

    let __return = {
        canonical_url: '',
        amphtml_url: '',
        amphtml_urls: [],
        has_dns_prefetch: false
    };

    let rel = '', href = {}, href_url = '';

    // https://github.com/cheeriojs/cheerio/blob/master/lib/static.js
    // https://github.com/cheeriojs/cheerio/blob/master/lib/static.js#L14
    // --> exports.load = function(content, options) {
    // https://github.com/cheeriojs/cheerio/blob/master/lib/parse.js
    const $ = cheerio.load(body, null);
    const links = $('link'); //jquery get all hyperlinks

    $(links).each( (i, link) => {

        rel = ($(link).attr('rel'));

        // console.log('=> link: [' + i + ': ' + rel + ': '+ $(link).attr('href') + ']');

        if ('dns-prefetch' === rel) { // catch pre-fetching
            __return.has_dns_prefetch = true;
        }

        if ('canonical' === rel || 'amphtml' === rel) {
            href_url = $(link).attr('href');
            href = {rel: rel, url: href_url};
            if ('canonical' === rel) {
                // only take the first occurrence
                __return.canonical_url = encodeURI('' === __return.canonical_url
                    ? href_url
                    : __return.canonical_url);
            }
            if ('amphtml' === rel) {
                // only take and keep the first occurrence
                __return.amphtml_url = '' === __return.amphtml_url
                    ? href_url
                    : __return.amphtml_url;
                // here save all occurrences
                __return.amphtml_urls.push(href_url);
            }
        }
    });

    return __return;
}

function parse_body_for_amplinks_and_robots_metatags(http_response) {

    const
        __links = parse_body_for_amplinks(http_response.http_response_body, http_response);
    const
        canonical_url       = __links.canonical_url,
        amphtml_url         = __links.amphtml_url,
        amphtml_urls        = __links.amphtml_urls,
        has_dns_prefetch    = __links.has_dns_prefetch;

    let check_robots_meta_status = CHECK_PASS,
        check_robots_meta_result = '';

    let meta_name = '', meta_content = '', meta_entry = '';

    const WARN_NOINDEX =
        '[Using noindex means that your AMPs will likely fail to be consumed by search engines]';

    //https://developers.google.com/webmasters/control-crawl-index/docs/robots_meta_tag#using-the-robots-meta-tag
    const $ = cheerio.load(http_response.http_response_body, null);
    const metas = $('meta');

    // See which robots Google uses to crawl the web
    // https://support.google.com/webmasters/answer/1061943
    $(metas).each( (i, meta) => {
        // meta_name = ($(meta).attr('name')).toString().toLowerCase();
        meta_name = $(meta).attr('name');
        meta_name = (typeof(meta_name) == "undefined") ? '' : meta_name.toString().toLowerCase();
        if ('robots' === meta_name ||
            'googlebot' === meta_name ||
            'googlebot-mobile' === meta_name ||
            'googlebot-news' === meta_name ||
            'googlebot-image' === meta_name ||
            'googlebot-video' === meta_name ||
            'mediapartners-google' === meta_name ||
            'mediapartners' === meta_name ||
            'adsbot-google' === meta_name ||
            'adsbot-google-mobile-apps' === meta_name) {
            meta_content = $(meta).attr('content');
            meta_entry = '[' + meta_name + ': ' + meta_content + ']';
            check_robots_meta_result += meta_entry;
            if (-1 < meta_content.indexOf('noindex')) {
                check_robots_meta_result += WARN_NOINDEX;
            }
            check_robots_meta_status = CHECK_WARN;
            // console.log('=> WARN: [meta_name: ' + meta_name + '] [meta_content: ' + meta_content + ']');
        }
        // console.log('=> [meta_entry: ' + meta_entry + ']');
    });
    if (check_robots_meta_status === CHECK_PASS) {
        check_robots_meta_result = 'Robots meta tag check appears to be OK';
    }
    // console.log('=> [check_robots_meta_result: ' + check_robots_meta_result + ']');

    return {
        canonical_url:      canonical_url,
        amphtml_url:        amphtml_url,
        amphtml_urls:       amphtml_urls,
        has_dns_prefetch:   has_dns_prefetch,
        amp_uses_feed:      (-1 < http_response.url.indexOf('googleusercontent.com/amphtml')),
        check_robots_meta_status: check_robots_meta_status,
        check_robots_meta_result: check_robots_meta_result
    };

}

// let parse_amplinks = {}; // <== function parse_page_content(http_response):
// // canonical_url: '',
// // amphtml_url: '',
// // check_robots_meta_results: 'Page content could not be read.',
// // check_robots_meta_status: CHECK_FAIL,
// // check_x_robots_tag_header_results: 'Response header could not be read.',
// // check_x_robots_tag_header_status: CHECK_FAIL
//

function review_amp_links(amp_url, parse_amplinks) {

    let canonical_url = parse_amplinks.canonical_url,
        amphtml_url = parse_amplinks.amphtml_url;

    let check_amplinks = {
        check_extra: '',
        check_amp_links_canonical_url: '',
        check_amp_links_canonical_status: CHECK_NONE,
        check_amp_links_canonical_results: '',
        check_amp_links_amphtml_url: '',
        check_amp_links_amphtml_status: CHECK_NONE,
        check_amp_links_amphtml_results: ''
    };

    if ('' !== canonical_url) {
        check_amplinks.check_amp_links_canonical_url = canonical_url;
        if (check_url_is_valid(canonical_url)) {
            check_amplinks.check_amp_links_canonical_status = CHECK_PASS;
            check_amplinks.check_amp_links_canonical_results = 'Canonical link URL appears to be valid (but was not tested for reachability)';
        } else {
            check_amplinks.check_amp_links_canonical_status = CHECK_FAIL;
            check_amplinks.check_amp_links_canonical_results = 'Canonical link URL appears to be invalid';
        }
    } else {
        check_amplinks.check_amp_links_canonical_url = '';
        check_amplinks.check_amp_links_canonical_status = CHECK_NONE;
        check_amplinks.check_amp_links_canonical_results = 'Canonical link URL was not found';
    }
    if ('' !== amphtml_url) {
        check_amplinks.check_amp_links_amphtml_url = amphtml_url;
        if (check_url_is_valid(amphtml_url)) {
            check_amplinks.check_amp_links_amphtml_status = CHECK_PASS;
            check_amplinks.check_amp_links_amphtml_results = 'AMP HTML link URL appears to be valid (but was not tested for reachability)';
        } else {
            check_amplinks.check_amp_links_amphtml_status = CHECK_FAIL;
            check_amplinks.check_amp_links_amphtml_results = 'AMP HTML link URL appears to be invalid';
        }
    } else {
        check_amplinks.check_amp_links_amphtml_url = '';
        check_amplinks.check_amp_links_amphtml_status = CHECK_NONE;
        check_amplinks.check_amp_links_amphtml_results = 'AMP HTML link URL was not found';
    }
    if (amp_url === canonical_url && '' !== amphtml_url) {
        check_amplinks.check_extra = 'This URL appears to be a Canonical URL: see the links for a possible related AMP HTML URL';
    } else {
        check_amplinks.check_extra = 'This URL does not appear to be a Canonical URL: it is possibly an AMP HTML URL';
    }
    if ('' === canonical_url && '' === amphtml_url) {
        check_amplinks.check_extra = 'This URL does not appear to be a Canonical or an AMP HTML URL';
    }

    return check_amplinks;
}

function parse_headers_for_x_robots_tag(http_response) {

    let check_x_robots_tag_header = {
        check_x_robots_tag_header_results: 'Response header could not be read.',
        check_x_robots_tag_header_status: CHECK_FAIL
    };

    if (typeof(http_response.response.headers['x-robots-tag']) === "undefined") {
        check_x_robots_tag_header.check_x_robots_tag_header_results = 'X-Robots-Tag header check appears to be OK';
        check_x_robots_tag_header.check_x_robots_tag_header_status = CHECK_PASS;
    } else {
        check_x_robots_tag_header.check_x_robots_tag_header_results = 'Found header entry for X-Robots-Tag' +
            http_response.response.headers['x-robots-tag'];
        check_x_robots_tag_header.check_x_robots_tag_header_status = CHECK_FAIL;
    }

    return check_x_robots_tag_header;
}

function parse_headers_for_if_modified_since_or_etag(http_response) {

    let check_ims_or_etag_header = {
        check_ims_or_etag_header_results: 'Response header could not be read.',
        check_ims_or_etag_header_status: CHECK_FAIL,
        check_ims_header_result: '',
        check_ims_header_status: CHECK_FAIL,
        check_etag_header_result: '',
        check_etag_header_status: CHECK_FAIL
    };

    // do not crash and burn if the response is broken!!
    if (http_response && http_response.response && http_response.response.headers &&
        typeof http_response.response.headers !== 'undefined') {

        if (typeof(http_response.response.headers['if-modified-since']) === "undefined") {
            check_ims_or_etag_header.check_ims_header_result = 'Header entry for If-Modified-Since not found';
            check_ims_or_etag_header.check_ims_header_status = CHECK_INFO;
        } else {
            check_ims_or_etag_header.check_ims_header_result = 'Found header entry for If-Modified-Since' +
                http_response.response.headers['if-modified-since'];
            check_ims_or_etag_header.check_ims_header_status = CHECK_PASS;
        }

        if (typeof(http_response.response.headers['etag']) === "undefined") {
            check_ims_or_etag_header.check_etag_header_result = 'Header entry for ETag not found';
            check_ims_or_etag_header.check_etag_header_status = CHECK_INFO;
        } else {
            check_ims_or_etag_header.check_etag_header_result = 'Found header entry for ETag' +
                http_response.response.headers['etag'];
            check_ims_or_etag_header.check_etag_header_status = CHECK_PASS;
        }

        if (CHECK_PASS === check_ims_or_etag_header.check_ims_header_status ||
            CHECK_PASS === check_ims_or_etag_header.check_etag_header_status) {
            check_ims_or_etag_header.check_ims_or_etag_header_results =
                `[${CHECK_PASS}] Site supports either/or both "If-Modified-Since" and "ETag" headers: these make amp serving more efficient`;
            check_ims_or_etag_header.check_ims_or_etag_header_status = CHECK_PASS;
        } else {
            check_ims_or_etag_header.check_ims_or_etag_header_results =
                `[${CHECK_WARN}] Site does not support either "If-Modified-Since" or "ETag" headers: these make amp serving more efficient`;
            check_ims_or_etag_header.check_ims_or_etag_header_status = CHECK_WARN;
        }
    }

    return check_ims_or_etag_header;
}

/**
 * Returns or fetches AMP Caches information, as documented here:
 * https://github.com/ampproject/amphtml/issues/7259
 */
function get_google_amp_cache_origin_json() {

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // the following is for documentation only
    // const CACHES_JSON_URL = 'https://cdn.ampproject.org/caches.json';
    // return fetch(CACHES_JSON_URL)
    //     .then(response => response.json())
    //     .then(json => {
    //         this._caches = json.caches;
    //         return this._caches;
    //     });
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    // hardcode the json object at: https://cdn.ampproject.org/caches.json
    // avoiding unneccesary fetches and we only care for the Google CDN now
    const GOOGLE_CACHE_ORIGIN_STR =
        '{\n' +
        '  "caches": [\n' +
        '    {\n' +
        '      "id": "google",\n' +
        '      "name": "Google AMP Cache",\n' +
        '      "docs": "https://developers.google.com/amp/cache/",\n' +
        '      "updateCacheApiDomainSuffix": "cdn.ampproject.org"\n' +
        '    }\n' +
        '  ]\n' +
        '}';

    // console.log('=> [GOOGLE_CACHE_ORIGIN_STR]: ' + GOOGLE_CACHE_ORIGIN_STR);

    return JSON.parse(GOOGLE_CACHE_ORIGIN_STR);
}

/**
 * Translates an url from the origin to the AMP Cache URL format, as documented here:
 *  https://developers.google.com/amp/cache/overview
 *  https://ampbyexample.com/advanced/using_the_google_amp_cache/
 *
 * @param {String} originUrl the URL to be transformed.
 * @return {String} the transformed URL.
 */
function make_url_to_google_amp_cache(url) {
    const cache = get_google_amp_cache_origin_json();
    return createCacheUrl(cache.caches[0].updateCacheApiDomainSuffix, url);
}

// function make_url_to_google_amp_cache_OBSOLETE(url) {
//     const AMP_CDN_HTTP  = 'https://cdn.ampproject.org/c/';
//     const AMP_CDN_HTTPS = 'https://cdn.ampproject.org/c/s/';
//     var url_cdn = '';
//     if (url.startsWith('http://')) {
//         url_cdn = AMP_CDN_HTTP + url.substr(7);
//     } else if (url.startsWith('https://')) {
//         url_cdn = AMP_CDN_HTTPS + url.substr(8);
//     }
//     return url_cdn;
// }

function make_url_to_google_amp_viewer(url) {
    const AMP_VIEWER_HTTP  = 'https://www.google.com/amp/';
    const AMP_VIEWER_HTTPS = 'https://www.google.com/amp/s/';
    var url_viewer = '';
    if (url.startsWith('http://')) {
        url_viewer = AMP_VIEWER_HTTP + url.substr(7);
    } else if (url.startsWith('https://')) {
        url_viewer = AMP_VIEWER_HTTPS + url.substr(8);
    }
    return url_viewer;
}

function get_resource_path(pathname) {
    const mimetype = mime.lookup(pathname);
    if (!mimetype) {
        return '/c';
    }

    // console.log(mimetype);
    if (mimetype.indexOf('image/') === 0) {
        return '/i';
    }

    if (mimetype.indexOf('font') >= 0) {
        return '/r';
    }

    // Default to document
    return '/c';
}

function make_url_validate_link(url) {
    // prod: https://ampbench.appspot.com/
    return '../validate?url=' + url;
}

function make_url_validate_href(url, title) {
    // prod: https://ampbench.appspot.com/
    // <a href="https://ampbench.appspot.com/validate?url=" target="_blank">Open in a new tab...</a>
    // const   pref = '<a href="https://ampbench.appspot.com/validate?url=' + url +'" ',
    const   pref = '<a href="../validate?url=' + url +'" ',
        suff = 'target="_blank">' + title + '</a>';
    return  pref + suff;
}

function make_url_href(url, title) {
    const pref = '<a href="' + url +'" ',
          suff = 'target="_blank">' + title + '</a>';
    return pref + suff;
}

function make_url_href_list(urls) {
    const kBR = '<br>';
    let __result = '';

    if (urls) {
        if (Array.isArray(urls)) {
            urls.forEach((url) => {
                __result += make_url_href(url, url) + kBR ;
            });
        }
    }
    return __result;

}

function multiline_to_html(multiline_str) { // convert os.EOL to HTML line-breaks
    // console.log('=> multiline_str:\n' + multiline_str);
    if (multiline_str) {
        if (-1 !== multiline_str.indexOf(os.EOL)) {
            var h = multiline_str.split(os.EOL).join("<br/>");
            // return '<div><span style="color:black;font-weight:bold">' + h + '</span></div>';
            return ('<div><span style="font-family:Monospace;">' + h + '</span></div>');
        }
        return ('<div><span style="font-family:Monospace;">' + multiline_str + '</span></div>');
    }
    return '';
}

function str_encode_hard_amp(str) {
    // '&amp=' => '%26amp='
    // console.log('=> HTTP URL [ENC-IN] : ' + str);
    // console.log('=> HTTP URL [ENC-OUT]: ' + str.replace('&amp=', '%26amp='));
    return str.replace('&amp=', '%26amp=');
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// utils: general
//

function str_rtrim_char(str, char) {
    var str_ret = str;
    if (str.charAt(str.length - 1) === char) {
        str_ret = str.substr(0, str.length - 1);
    }
    return str_ret;
}

function unwrap_js_object(obj, maxDepth, prefix){
    var result = '';
    if (!prefix) prefix='';
    for(var key in obj){
        if (typeof obj[key] == 'object'){
            if (maxDepth !== undefined && maxDepth <= 1){
                result += (prefix + key + '=object [max depth reached]\n');
            } else {
                result += unwrap_js_object(obj[key], (maxDepth) ? maxDepth - 1: maxDepth, prefix + key + '.');
            }
        } else {
            result += (prefix + key + '=' + obj[key] + '\n');
        }
    }
    return result;
}

function print_dashes(dash_count) { // needs: const S = require('string');
    console.log(S(('- ').repeat(dash_count)).s );
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// module exports
//

exports.lib_amphtml_validator_signature = lib_amphtml_validator_signature;
exports.VALIDATOR_JS_URL = VALIDATOR_JS_URL;
exports.VALIDATOR_JS_FILE = VALIDATOR_JS_FILE;
exports.lib_download_validator = lib_download_validator;
exports.lib_load_validator = lib_load_validator;
exports.lib_refresh_validator_if_stale = lib_refresh_validator_if_stale;
exports.set_global_user_agent = set_global_user_agent;
exports.get_global_user_agent = get_global_user_agent;
exports.set_global_user_agent_name = set_global_user_agent_name;
exports.get_global_user_agent_name = get_global_user_agent_name;
exports.UA_AMPBENCH = UA_AMPBENCH;
exports.UA_AMPBENCH_NAME = UA_AMPBENCH_NAME;
exports.UA_CURL = UA_CURL;
exports.UA_MOBILE = UA_MOBILE_ANDROID_CHROME_52;
exports.UA_MOBILE_ANDROID_CHROME_52 = UA_MOBILE_ANDROID_CHROME_52;
exports.UA_GOOGLEBOT = UA_GOOGLEBOT;
exports.UA_GOOGLEBOT_SMARTPHONE = UA_GOOGLEBOT_SMARTPHONE;
exports.HttpResponse = HttpResponse;
exports.HttpBodySniffer = HttpBodySniffer;
exports.api_validate_url = fetch_and_validate_url;
exports.get_http_redirect_status = get_http_redirect_status;
exports.build_http_redirect_warning_lines = build_http_redirect_warning_lines;
exports.build_warning_lines_from_validation_output = build_warning_lines_from_validation_output;
exports.check_robots_txt = check_robots_txt;
exports.check_url_is_valid = check_url_is_valid;
exports.check_url_is_reachable = check_url_is_reachable;
exports.check_url_is_reachable_with_googlebot = check_url_is_reachable_with_googlebot;
exports.check_url_is_reachable_with_googlebot_smartphone = check_url_is_reachable_with_googlebot_smartphone;
exports.check_google_amp_cache = check_google_amp_cache;
exports.check_redirects_for_mobile = check_redirects_for_mobile;
exports.parse_page_content = parse_page_content;
exports.fetch_and_parse_url_for_amplinks = fetch_and_parse_url_for_amplinks;
exports.parse_body_for_amplinks_and_robots_metatags = parse_body_for_amplinks_and_robots_metatags;
exports.parse_headers_for_x_robots_tag = parse_headers_for_x_robots_tag;
exports.parse_headers_for_if_modified_since_or_etag = parse_headers_for_if_modified_since_or_etag;
exports.review_amp_links = review_amp_links;
exports.multiline_to_html = multiline_to_html;
exports.make_url_validate_link = make_url_validate_link;
exports.make_url_validate_href = make_url_validate_href;
exports.make_url_href = make_url_href;
exports.make_url_href_list = make_url_href_list;
exports.str_encode_hard_amp = str_encode_hard_amp;
exports.str_rtrim_char = str_rtrim_char;

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
