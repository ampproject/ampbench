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

// use: import {get_bare_url, urls_are_similar} from 'ampbench_util'; !!!2018.09: NOT SUPPORTED BY NODE.JS YET!!!

const S = require('string');

const util = require('util');
function inspect_obj(obj) {
    return util.inspect(obj, { showHidden: true, depth: null })
}

function unwrap_js_object(obj, maxDepth, prefix) {
    let result = '';
    if (!prefix) prefix='';
    for(let key in obj){
        if (typeof obj[key] === 'object') {
            if (maxDepth !== undefined && maxDepth <= 1) {
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

function log_js_object(o, prefix) {
    for (let key in o) {
        if (o.hasOwnProperty(key)) {
            console.log(prefix + key + ': ' + o[key]);
        }
    }
}

function ifdef(v) { // useful for outputting potentially undefined variable values
    return v ? v : '';
}

// exports.last_element_of_list = function (list) {
function last_element_of_list(list) {
    return list[list.length - 1];
}

function last_element_of_path (path) {
    const path_str = path.toString();
    return path_str.substr(path_str.lastIndexOf('/') + 1);
}

function str_rtrim_char(str, char) {
    let str_ret = str;
    if (str.charAt(str.length - 1) === char) {
        str_ret = str.substr(0, str.length - 1);
    }
    return str_ret;
}

function format_dashes(dash_count) { // needs: const S = require('string');
    return (S(('- ').repeat(dash_count)).s);
}

function print_dashes(dash_count) { // needs: const S = require('string');
    console.log(format_dashes(dash_count));
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

function get_bare_url(url) {
    // note: https://ilikekillnerds.com/2016/05/removing-character-startend-string-javascript/
    // test: 'xwp.co' === get_bare_url('https://xwp.co')
    // test: 'xwp.co' === get_bare_url('https://xwp.co/')
    let _url = url.trim();
    if ('/' === _url.slice(-1)) {   // check  last character of the url
        _url = _url.slice(0, -1);   // remove last character of the url
    }
    if (-1 < _url.indexOf('http://')) {
        _url = _url.substr(7);
    }
    if (-1 < _url.indexOf('https://')) {
        _url = _url.substr(8);
    }
    return _url;
}

function urls_are_similar(url1, url2) {
    // note: https://ilikekillnerds.com/2016/05/removing-character-startend-string-javascript/
    // test: urls_are_similar('https://xwp.co', 'https://xwp.co/')
    // test: urls_are_similar('https://xwp.co', 'http://xwp.co')
    let _url1 = get_bare_url(url1),
        _url2 = get_bare_url(url2);
    return ( // compare what is left of the two urls
        _url1 === _url2
    );
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// module exports
//

exports.get_bare_url = get_bare_url;
exports.urls_are_similar = urls_are_similar;

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

