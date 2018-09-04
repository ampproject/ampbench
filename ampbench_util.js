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

// use: import {foo, bar} from 'ampbench_util';

const S = require('string');

const util = require('util');
export function inspect_obj(obj) {
    return util.inspect(obj, { showHidden: true, depth: null })
}

export function unwrap_js_object(obj, maxDepth, prefix) {
    var result = '';
    if (!prefix) prefix='';
    for(var key in obj){
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

export function log_js_object(o, prefix) {
    for (var key in o) {
        if (o.hasOwnProperty(key)) {
            console.log(prefix + key + ': ' + o[key]);
        }
    }
}

export function ifdef(v) { // useful for outputting potentially undefined variable values
    return v ? v : '';
}

// exports.last_element_of_list = function (list) {
export function last_element_of_list(list) {
    return list[list.length - 1];
}

export function last_element_of_path (path) {
    const path_str = path.toString();
    return path_str.substr(path_str.lastIndexOf('/') + 1);
}

export function str_rtrim_char(str, char) {
    let str_ret = str;
    if (str.charAt(str.length - 1) === char) {
        str_ret = str.substr(0, str.length - 1);
    }
    return str_ret;
}

export function format_dashes(dash_count) { // needs: const S = require('string');
    return (S(('- ').repeat(dash_count)).s);
}

export function print_dashes(dash_count) { // needs: const S = require('string');
    console.log(format_dashes(dash_count));
}

export function make_url_href(url, title) {
    const pref = '<a href="' + url +'" ',
        suff = 'target="_blank">' + title + '</a>';
    return pref + suff;
}

export function make_url_href_list(urls) {
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

export function multiline_to_html(multiline_str) { // convert os.EOL to HTML line-breaks
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

export function urls_are_similar(url1, url2) {

    let _url1 = url1.substr(url1.lastIndexOf('http://') + 1);
        _url1 = url1.substr(url1.lastIndexOf('https://') + 1);
    let _url2 = url2.substr(url2.lastIndexOf('http://') + 1);
        _url2 = url2.substr(url2.lastIndexOf('https://') + 1);

    return (
            _url1 === _url2
        ||  _url1.trimEnd === _url2.trimEnd()
        ||  _url1 === _url2.slice(0, -1)
        ||  _url1 === _url2.trim()
        ||  _url1 === _url2.trimEnd()
        ||  _url2 === _url1.slice(0, -1)
        ||  _url2 === _url1.trim()
        ||  _url2 === _url1.trimEnd()
    );

}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
