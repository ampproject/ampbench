/**
 * @license
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the license.
 */

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// This file is an extended version of the one to be found at:
// https://github.com/ampproject/amphtml/tree/master/validator/nodejs
// The official AMP validator Node.js API
// Please consider using the published NPM module:
// https://www.npmjs.com/package/amphtml-validator
// TODO(powdercloud): make it so this file / project uses it as well.

'use strict';

var Promise = require('promise');
var fs = require('fs');
var http = require('http');
var https = require('https');
var querystring = require('querystring');
var url = require('url');
var util = require('util');
var vm = require('vm');
var amphtmlValidator = require('amphtml-validator');

/**
 * Determines if str begins with prefix.
 * @param {!string} str
 * @param {!string} prefix
 * @returns {!boolean}
 */
function hasPrefix(str, prefix) {
    return str.indexOf(prefix) == 0;
}

/**
 * Convenience function to detect whether an argument is a URL. If not,
 * it may be a local file.
 * @param {!string} url
 * @returns {!boolean}
 */
function isHttpOrHttpsUrl(url) {
    return hasPrefix(url, 'http://') || hasPrefix(url, 'https://');
}

/**
 * Creates a promise which reads from a file.
 * @param {!string} name
 * @returns {!Promise<!string>}
 */
function readFromFile(name) {
    return new Promise(function(resolve, reject) {
        fs.readFile(name, 'utf8', function(err, data) {
            if (err) {
                reject(err);
            } else {
                resolve(data);
            }
        });
    });
}

/**
 * Synchronously reads from a file returning the contents.
 * @param {!string} name
 * @returns {!string} contents
 */
function readFromFileSync(name) {
    return fs.readFileSync(name).toString(); // default encoding is 'utf8'
}

/**
 * Creates a promise which reads from a stream.
 * @param {!string} name
 * @param {!stream.Readable} readable
 * @returns {!Promise<!string>}
 */
function readFromReadable(name, readable) {
    return new Promise(function(resolve, reject) {
        var chunks = [];
        readable.setEncoding('utf8');
        readable.on('data', function(chunk) { chunks.push(chunk); });
        readable.on('end', function() { resolve(chunks.join('')); });
        readable.on('error', function(error) {
            reject(new Error('Could not read from ' + name + ' - ' + error.message));
        });
    });
}

/**
 * Creates a promise which reads from a URL or more precisely, fetches
 * the contents located at the URL by using the 'http' or 'https' module.
 * Any HTTP status other than 200 is interpreted as an error.
 * @param {!string} url
 * @returns {!Promise<!string>}
 */
function readFromUrl(url) {
    return new Promise(function(resolve, reject) {
        var clientModule = hasPrefix(url, 'http://') ? http : https;
        var req = clientModule.request(url, function(response) {
            if (response.statusCode !== 200) {
                // https://nodejs.org/api/http.html says: "[...] However, if
                // you add a 'response' event handler, then you must consume
                // the data from the response object, either by calling
                // response.read() whenever there is a 'readable' event, or by
                // adding a 'data' handler, or by calling the .resume()
                // method."
                response.resume();
                reject(new Error(
                    'Unable to fetch ' + url + ' - HTTP Status ' +
                    response.statusCode));
            } else {
                resolve(response);
            }
        });
        req.on('error', function(error) {  // E.g., DNS resolution errors.
            reject(
                new Error('Unable to fetch ' + url + ' - ' + error.message));
        });
        req.end();
    })
        .then(readFromReadable.bind(null, url));
}

/**
 * ValidationResult is the record computed by the validator for each
 * document. It contains an overall status (PASS/FAIL) and the list of
 * errors, if any. This class corresponds to the ValidationResult
 * message in validator.proto in this directory.
 * @export
 * @constructor
 */
function ValidationResult() {
    /**
     * Possible values are 'UNKNOWN', 'PASS', and 'FAIL'.
     * @type {!string}
     */
    this.status = 'UNKNOWN';
    /** @type {!Array<!ValidationError>} */
    this.errors = [];
}

/**
 * Each validation error describes a specific problem in a validated
 * document. This class corresponds to the ValidationError message in
 * validator.proto in this directory.
 * @export
 * @constructor
 */
function ValidationError() {
    /**
     * The severity of the error - possible values are 'UNKNOWN_SEVERITY',
     * 'ERROR', and 'WARNING'.
     */
    this.severity = 'UNKNOWN_SEVERITY';
    /**
     * The line number at which the error was seen (1 is the first line).
     */
    this.line = 1;
    /**
     * The column number at which the error was seen (0 is the first column).
     */
    this.col = 0;
    /**
     * A human-readable error message for the validation error.
     * If you find yourself trying to write a parser against this string
     * to scrape out some detail, consider looking at the code and params
     * fields below.
     * @type {!string}
     */
    this.message = '';
    /**
     * The spec URL is often added by the validator to provide additional
     * context for the error. In a user interface this would be shown
     * as a "Learn more" link.
     * @type {!string}
     */
    this.specUrl = null;
    /**
     * Categorizes error messages into higher-level groups. This makes it
     * easier to create error statistics across a site and give advice based
     * on the most common problems for a set of pages.
     * See the ErrorCategory.Code enum in validator.proto for possible values.
     * @type {!string}
     */
    this.category = 'UNKNOWN';
    /**
     * This field is only useful when scripting against the validator,
     * it should not be displayed in a user interface as it adds nothing
     * for humans to read over the message field (see above).
     * Possible values are the codes listed in ValidationError.Code - see
     * validator.proto. Examples: 'UNKNOWN_CODE', 'MANDATORY_TAG_MISSING',
     * 'TAG_REQUIRED_BY_MISSING'. For each of these codes there is a
     * format string in validator-main.protoascii (look for error_formats),
     * which is used to assemble the message from the strings in params.
     * @type {!string}
     */
    this.code = 'UNKNOWN_CODE';
    /**
     * This field is only useful when scripting against the validator,
     * it should not be displayed in a user interface as it adds nothing
     * for humans to read over the message field (see above).
     * @type {!Array<!string>}
     */
    this.params = [];
}

/**
 * The validator instance is a proxy object to a precompiled
 * validator.js script - in practice the script was either downloaded
 * from 'https://cdn.ampproject.org/v0/validator.js' or read from a
 * local file.
 * @param {!string} scriptContents
 * @throws {!Error}
 * @constructor
 */
function Validator(scriptContents) {
    // The 'sandbox' is a Javascript object (dictionary) which holds
    // the results of evaluating the validatorJs / scriptContents, so
    // basically, it holds functions, prototypes, etc. As a
    // side-effect of evaluating, the VM will compile this code and
    // it's worth holding onto it. Hence, this validate function is
    // reached via 2 codepaths - either the sandbox came from the
    // cache, precompiledByValidatorJs - or we just varructed it
    // after downloading and evaluating the script. The API is fancier
    // here, vm.Script / vm.createContext / vm.runInContext and all
    // that, but it's quite similar to a Javascript eval.
    this.sandbox = vm.createContext();
    // cache the script contents - useful for parsing potential metadata, such as the spec file revision
    this.scriptContents = scriptContents;
    try {
        new vm.Script(scriptContents).runInContext(this.sandbox);
    } catch (error) {
        throw new Error('Could not instantiate validator.js - ' + error.message);
    }
}

/**
 * @param {!string} inputString
 * @returns {!ValidationResult}
 * @export
 */
Validator.prototype.validateString =
    function(inputString) {
        var internalResult = this.sandbox.amp.validator.validateString(inputString);
        var result = new ValidationResult();
        result.status = internalResult.status;
        for (var ii = 0; ii < internalResult.errors.length; ii++) {
            var internalError = internalResult.errors[ii];
            var error = new ValidationError();
            error.severity = internalError.severity;
            error.line = internalError.line;
            error.col = internalError.col;
            error.message =
                this.sandbox.amp.validator.renderErrorMessage(internalError);
            error.specUrl = internalError.specUrl;
            error.code = internalError.code;
            error.params = internalError.params;
            error.category = this.sandbox.amp.validator.categorizeError(internalError);
            result.errors.push(error);
        }
        return result;
    };

/**
 * A global static map used by the getInstance function to avoid loading
 * AMP Validators more than once.
 * @type {!Object<string, Validator>}
 */
var instanceByValidatorJs = {};

/**
 * @param {string=} opt_validatorJs
 * @returns {!Promise<Validator>}
 * @export
 */
function getInstance(opt_validatorJs) {
    var validatorJs =
        opt_validatorJs || 'https://cdn.ampproject.org/v0/validator.js';
    if (instanceByValidatorJs.hasOwnProperty(validatorJs)) {
        return Promise.resolve(instanceByValidatorJs[validatorJs]);
    }
    var validatorJsPromise =
        (isHttpOrHttpsUrl(validatorJs) ? readFromUrl : readFromFile)(validatorJs);
    return validatorJsPromise.then(function(scriptContents) {
        var instance;
        try {
            instance = new Validator(scriptContents);
        } catch (error) {
            // It may be useful to cache errors and exceptions encountered
            // here, but for now we don't do this for e.g. http errors when
            // fetching the validator, so we shouldn't do it for syntax
            // errors etc. either (which lead to the varructor throwing an error).
            throw error;
        }
        instanceByValidatorJs[validatorJs] = instance;
        return instance;
    });
}

function getInstanceFromFileSync(validatorJsFile, opt_force_reload) {
    var _force_reload = opt_force_reload || false;
    var scriptContents;
    var instance;
    if (!instanceByValidatorJs.hasOwnProperty(validatorJsFile)) { // not cached, must do reload
        _force_reload = true;
    }
    if (_force_reload) {
        try {
            scriptContents = readFromFileSync(validatorJsFile);
            instance = new Validator(scriptContents);
        } catch (error) {
            throw error;
        }
        instanceByValidatorJs[validatorJsFile] = instance;
        // - - - - - - - -
        // console.log('=> [VALIDATOR CACHED?: FALSE] reloaded]: ' + validatorJsFile);
        // - - - - - - - -
    } else {
        instance = instanceByValidatorJs[validatorJsFile];
        // - - - - - - - -
        // console.log('=> [VALIDATOR CACHED?: TRUE] reused: ' + validatorJsFile);
        // - - - - - - - -
    }
    return instance;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// module exports
//

exports.getInstance = getInstance;
exports.getInstanceFromFileSync = getInstanceFromFileSync;
