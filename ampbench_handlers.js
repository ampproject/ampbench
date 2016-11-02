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
// AMP validator wrapper library
//

const benchlib = require('./ampbench_lib.js');
const sdlib = require('./ampbench_lib_sd.js');

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// app version
//

const VERSION_STRING = '[AMPBench:v.1.0]';

function version_msg(msg) {
    return VERSION_STRING + '[' + new Date().toISOString() + '] ' + msg;
}

function validator_signature() {
    return '[validator-signature:' + benchlib.lib_amphtml_validator_signature() + ']';
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
const // http://www.tutorialspoint.com/html/html_colors.htm
    CHECK_FAIL_CSS = '<span style="color: red; ">'       + CHECK_FAIL + '</span>',
    CHECK_PASS_CSS = '<span style="color: #41c40f; ">'   + CHECK_PASS + '</span>',
    CHECK_INFO_CSS = '<span style="color: #c530ac; ">'   + CHECK_INFO + '</span>',
    CHECK_WARN_CSS = '<span style="color: orange; ">'    + CHECK_WARN + '</span>',
    CHECK_NONE_CSS = '<span style="color: orange; ">'    + CHECK_NONE + '</span>';
const
    get_check_status_css = (status) => {
        switch(status) {
            case CHECK_FAIL: return CHECK_FAIL_CSS;
            case CHECK_PASS: return CHECK_PASS_CSS;
            case CHECK_INFO: return CHECK_INFO_CSS;
            case CHECK_WARN: return CHECK_WARN_CSS;
            default: return CHECK_NONE_CSS;
        }
    };

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// app imports, main instance and view templates
//

const os = require('os');
const fs = require('fs');
const path = require("path");
const http = require('http');
const https = require('https');
const url = require('url');
const util = require('util');
const S = require('string');

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// ROUTES
//

function version(route, req, res) {
    let __ret = version_msg('');
    return __ret;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function validate(route, req, res, on_validate_callback) {

    let __ret = null;

    let url_to_validate = req.query.url || '';
    if ('' !== url_to_validate.trim()) {

        const on_amp_validate = (http_response, output) => {

            console.log(version_msg(
                validator_signature() +
                '[HTTP:' + http_response.http_response_code + '] ' +
                req.path + ' ' + url_to_validate)); //!!!USEFUL!!!

            let parse_amplinks = benchlib.parse_page_content(http_response);

            // response body sniffer
            let sniffer = parse_amplinks.http_body_sniffer;

            // - - - - - - - - - - - - - - - - - - - -
            let amp_hdr_status = CHECK_NONE,
                amp_val_status = CHECK_NONE;

            if (output) { // verify the output payload and get the result
                if (Array.isArray(output)) {
                    amp_hdr_status = output.shift();
                } else if ('string' === typeof output) {
                    amp_hdr_status = output.substring(0, 4);
                }
                amp_val_status = amp_hdr_status;
            }

            const amp_val_warnings =
                benchlib.build_warning_lines_from_validation_output(url_to_validate, output, '');

            let check_amp_links_canonical_status = '',
                check_amp_links_canonical_results = '',
                check_amp_links_amphtml_status = '',
                check_amp_links_amphtml_results = '';

            const on_canonical_parsed = (http_response_canonical, canonical_parsed_return) => {
                canonical_parsed_return.result = ''; // make a result field

                let canonical_url_found = canonical_parsed_return.canonical_url,
                    amphtml_url_found = canonical_parsed_return.amphtml_url,
                    fetch_duration_amp = http_response.duration_in_milliseconds,
                    fetch_duration_canonical = http_response_canonical.duration_in_milliseconds,
                    fetch_duration_amp_cache = 0, fetch_status_amp_cache = '';

                if (http_response_canonical.urlIsOK()) {
                    if (http_response_canonical.statusIsOK()) {
                        canonical_parsed_return.result += '[Canonical URL is reachable]';
                        if ('' !== canonical_url_found) {
                            canonical_parsed_return.canonical_url = benchlib.make_url_href(
                                canonical_url_found, canonical_url_found);
                        }
                        if ('' !== amphtml_url_found) {
                            canonical_parsed_return.result += '[AMP link found in Canonical page]';
                            if (url_to_validate !== amphtml_url_found) { // amp link not pointing back!!!
                                canonical_parsed_return.status = CHECK_FAIL;
                                canonical_parsed_return.result += '[FAIL: AMP link in Canonical page does not refer to the current AMP page]';
                            } else {
                                canonical_parsed_return.status = CHECK_PASS;
                                canonical_parsed_return.result += '[AMP link in Canonical page refers to the current AMP page]';
                            }
                            canonical_parsed_return.amphtml_url = benchlib.make_url_href(
                                amphtml_url_found, amphtml_url_found);
                        } else {
                            canonical_parsed_return.status = CHECK_WARN;
                            let _can_result =
                                '[WARNING: AMP link not found in the Canonical page]';
                            if (url_to_validate === canonical_url_found) { // standalone AMP? canonical_link <=> amphtml_link
                                canonical_parsed_return.status = CHECK_INFO;
                                _can_result =
                                    '[AMP page Canonical link points to the AMP page itself: is this a standalone AMP?]';
                            }
                            canonical_parsed_return.result += _can_result;
                        }
                    } else {
                        canonical_parsed_return.status = CHECK_FAIL;
                        canonical_parsed_return.result += '[FAIL: Canonical URL is unreachable]';
                        if ('' !== http_response_canonical.http_response_text) {
                            canonical_parsed_return.result += '[' + http_response_canonical.http_response_text + ']';
                        }
                    }
                } else {
                    canonical_parsed_return.status = CHECK_FAIL;
                    canonical_parsed_return.result +=
                        '[FAIL: Canonical URL is invalid][' + http_response_canonical.url_error + ']';
                }

                canonical_parsed_return.status = get_check_status_css(canonical_parsed_return.status);
                canonical_parsed_return.url = benchlib.make_url_href(
                    canonical_parsed_return.url, canonical_parsed_return.url);

                const on_check_robots_txt = (check_robots_txt_return) => {

                    const on_check_google_amp_cache = (check_google_amp_cache_return) => {

                        fetch_duration_amp_cache = check_google_amp_cache_return.duration_in_milliseconds;
                        fetch_status_amp_cache = 0 < fetch_duration_amp_cache ? '' :
                        '[' + check_google_amp_cache_return.check_google_amp_cache_results + ']';

                        const on_check_url_metadata = (metadata_return) => {

                            // cache the news article image urls
                            let publisher_logo_url = metadata_return.image.url,
                                article_image_url = metadata_return.article_image.url;

                            const on_check_image_urls_are_reachable = (publisher_logo_url_reachable_ret,
                                                                       article_image_url_reachable_ret) => {
                                let amp_url_href = benchlib.make_url_href(url_to_validate, url_to_validate),
                                    amphtml_url_href = '',
                                    // amphtml_url_href = benchlib.make_url_href(amphtml_url, amphtml_url),
                                    canonical_url_href = benchlib.make_url_href(
                                        parse_amplinks.canonical_url,
                                        parse_amplinks.canonical_url);

                                let url_to_validate_enc = encodeURIComponent(url_to_validate),
                                    redirect_url = '';

                                // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                                // REDIRECT decisions - follows the approach of sifting out cases + use of redirects.
                                // - - - -

                                if (( // a Canonical?
                                        url_to_validate === parse_amplinks.canonical_url &&
                                        '' !== parse_amplinks.amphtml_url
                                    ) || (
                                        '' === parse_amplinks.canonical_url &&
                                        '' !== parse_amplinks.amphtml_url
                                    )) {
                                    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                                    // CASE 1:
                                    // - - - -

                                    url_to_validate_enc = encodeURIComponent(benchlib.str_encode_hard_amp(parse_amplinks.amphtml_url));
                                    redirect_url = '..' + route + '?url=' + url_to_validate_enc;
                                    res.redirect(redirect_url);

                                } else if ( // from a non-Canonical, non-AMP to a redirect which will trigger CASE 1 on seperate request.
                                url_to_validate !== parse_amplinks.canonical_url &&
                                '' !== parse_amplinks.canonical_url &&
                                '' !== parse_amplinks.amphtml_url && !sniffer.containsAmpHtmlLink
                                ) {
                                    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                                    // CASE 2:
                                    // - - - -

                                    url_to_validate_enc = encodeURIComponent(benchlib.str_encode_hard_amp(parse_amplinks.amphtml_url));
                                    redirect_url = '..' + route + '?url=' + url_to_validate_enc;
                                    res.redirect(redirect_url);

                                } else if ( // from a non-Canonical, non-AMP, and so on ...
                                url_to_validate !== parse_amplinks.canonical_url &&
                                '' !== parse_amplinks.canonical_url &&
                                url_to_validate !== parse_amplinks.amphtml_url &&
                                '' !== parse_amplinks.amphtml_url
                                ) {
                                    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                                    // CASE 3:
                                    // - - - -

                                    url_to_validate_enc = encodeURIComponent(benchlib.str_encode_hard_amp(parse_amplinks.amphtml_url));
                                    redirect_url = '..' + route + '?url=' + url_to_validate_enc;
                                    res.redirect(redirect_url);

                                } else {
                                    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                                    // CASE Z: NO REDIRECT - FINAL HANDLER
                                    // - - - -

                                    if ('' !== parse_amplinks.amphtml_url) {
                                        // there should be no AMPHTML relation link on an AMP page!
                                        // https://www.ampproject.org/docs/guides/discovery.html
                                        amp_hdr_status = CHECK_FAIL;
                                        check_amp_links_amphtml_status = CHECK_FAIL;
                                        check_amp_links_amphtml_results += '[This page has an AMPHTML relation link but appears to be an AMP page]';
                                        check_amp_links_amphtml_results += '[AMP pages should not have AMPHTML relation links]';
                                        amphtml_url_href = '<br>' + benchlib.make_url_href(
                                                parse_amplinks.amphtml_url,
                                                parse_amplinks.amphtml_url);
                                        if (parse_amplinks.amphtml_url !== url_to_validate) { // *and* the amphtml_link rel link is not the validated URL
                                            check_amp_links_amphtml_results += '[the AMPHTML link also does not point at the current page]';
                                        }
                                        if (parse_amplinks.canonical_url === url_to_validate) {    // these should *not* be identical here except for standalone!
                                            check_amp_links_canonical_results += '[Canonical equal to AMP: standalone AMP page?]';
                                        }
                                    }
                                    if ('' !== parse_amplinks.canonical_url) {
                                        if (benchlib.check_url_is_valid(parse_amplinks.canonical_url)) {
                                            check_amp_links_canonical_status = CHECK_PASS;
                                        } else {
                                            amp_hdr_status = CHECK_FAIL;
                                            check_amp_links_canonical_status = CHECK_FAIL;
                                            check_amp_links_canonical_results += '[Canonical URL is invalid]';
                                        }
                                    } else {
                                        // we should always have a Canonical relationship link on all AMP pages
                                        // https://www.ampproject.org/docs/guides/discovery.html
                                        amp_hdr_status = CHECK_FAIL;
                                        check_amp_links_canonical_status = CHECK_FAIL;
                                        canonical_url_href =
                                            '[Canonical relation link was not found: is the requested URL for a valid AMP page?]';
                                        check_amp_links_canonical_results +=
                                            '[All AMP pages need a Canonical relation link, even if pointing to itself (standalone AMP)]';
                                    }

                                    let http_response_result = parse_amplinks.amp_uses_feed
                                        ? '[ DEPRECATED!: Uses the Google AMP Feed Conversion Service - this is due for imminent Shutdown! ]' : '';
                                    http_response_result += !http_response.statusIsOK()
                                        ? ' [URL is unreachable] [' + http_response.http_response_text + ']'
                                        : '';

                                    let http_redirect_route = benchlib.build_http_redirect_warning_lines(http_response),
                                        http_redirect_status = benchlib.get_http_redirect_status(http_response);

                                    amp_val_warnings.amp_val_warning_status =
                                        get_check_status_css(amp_val_warnings.amp_val_warning_status);
                                    metadata_return.status =
                                        get_check_status_css(metadata_return.status);
                                    // publisher logo
                                    metadata_return.image.url =
                                        benchlib.make_url_href(metadata_return.image.url, metadata_return.image.url);
                                    metadata_return.image.status =
                                        get_check_status_css(metadata_return.image.status);
                                    // article image
                                    metadata_return.article_image.url =
                                        benchlib.make_url_href(metadata_return.article_image.url, metadata_return.article_image.url);
                                    metadata_return.article_image.status =
                                        get_check_status_css(metadata_return.article_image.status);
                                    // article guidelines
                                    metadata_return.article.status =
                                        get_check_status_css(metadata_return.article.status);

                                    metadata_return.json_error =
                                        '' !== metadata_return.json_error.trim()
                                            ? `[${metadata_return.json_error}]`
                                            : metadata_return.json_error.trim();

                                    let check_google_amp_cache_status_css =
                                        get_check_status_css(check_google_amp_cache_return.check_google_amp_cache_status);
                                    if (CHECK_PASS !== check_google_amp_cache_return.check_google_amp_cache_status ||
                                        CHECK_PASS !== check_google_amp_cache_return.check_google_amp_viewer_status) {
                                        check_google_amp_cache_status_css = get_check_status_css(CHECK_WARN);
                                    }
                                    if (CHECK_FAIL === check_google_amp_cache_return.check_google_amp_cache_status) {
                                        check_google_amp_cache_status_css = get_check_status_css(CHECK_FAIL);
                                    }

                                    check_robots_txt_return.check_robots_txt_status =
                                        get_check_status_css(check_robots_txt_return.check_robots_txt_status);
                                    parse_amplinks.check_robots_meta_status =
                                        get_check_status_css(parse_amplinks.check_robots_meta_status);
                                    parse_amplinks.check_x_robots_tag_header_status =
                                        get_check_status_css(parse_amplinks.check_x_robots_tag_header_status);

                                    // response times
                                    let fetch_compare_canonical_amp = (0 < fetch_duration_canonical && 0 < fetch_duration_amp)
                                        ? Math.round((fetch_duration_canonical / fetch_duration_amp) * 100) / 100
                                        : 0;
                                    let fetch_compare_canonical_amp_cache = (0 < fetch_duration_canonical && 0 < fetch_duration_amp_cache)
                                        ? Math.round((fetch_duration_canonical / fetch_duration_amp_cache) * 100) / 100
                                        : 0;
                                    let response_times_status_css = CHECK_INFO_CSS,
                                        response_times_status_amp = '',
                                        response_times_status_amp_cache = '';
                                    if (fetch_duration_amp > fetch_duration_canonical) {
                                        response_times_status_css = CHECK_WARN_CSS;
                                        response_times_status_amp = '[' + CHECK_WARN + ': AMP page fetch is slower than Canonical page]';
                                    }
                                    if (fetch_duration_amp_cache > fetch_duration_canonical) {
                                        response_times_status_css = CHECK_WARN_CSS;
                                        response_times_status_amp_cache = '[' + CHECK_WARN + ': AMP Cache page fetch is slower than Canonical page]';
                                    }

                                    // response body sniffer reporting
                                    let sniffer_raw_status_css = sniffer.containsAmpHtmlLink // AMP should not contain an AMP rel link
                                            ? CHECK_FAIL_CSS : CHECK_PASS_CSS,
                                        sniffer_raw_result = !sniffer.containsAmpHtmlSignature
                                            ? CHECK_FAIL + ': AMP page should contain a top-level "<html ⚡>" or "<html amp>" tag'
                                            : 'AMP page appears to contain a top-level "<html ⚡>" or "<html amp>" tag',
                                        sniffer_raw_result_amphtml = sniffer.containsAmpHtmlLink
                                            ? '[' + CHECK_FAIL + ': AMP page should not contain a AMP-HTML rel link]'
                                            : 'AMP page appears free of AMP-HTML rel link(s)',
                                        sniffer_raw_result_canonical = !sniffer.containsCanonicalLink
                                            ? CHECK_FAIL + ': AMP page should contain a Canonical rel link'
                                            : 'AMP page appears to contain a Canonical rel link',
                                        sniffer_sd_status_css = '' === sniffer.ampStructuredDataTypesFound
                                            ? CHECK_FAIL_CSS : CHECK_INFO_CSS,
                                        sniffer_sd_result = sniffer.containsMixedStructuredDataMarkup.status
                                            ? CHECK_WARN + ': ' + sniffer.containsMixedStructuredDataMarkup.result
                                            : CHECK_INFO + ': ' + sniffer.containsMixedStructuredDataMarkup.result,
                                        sniffer_sd_types_result = '' !== sniffer.ampStructuredDataTypesFound
                                            ? sniffer.ampStructuredDataTypesFound
                                            : CHECK_FAIL +
                                        ': No Structured Data markup for AMP supported types was found' +
                                        ': see the "SDTT Structured Data Testing Tool Results" section for AMP agnostic SD validation',
                                        sniffer_sd_carousel_status_css = '' === sniffer.ampCarouselStructuredDataTypesFound
                                            ? CHECK_FAIL_CSS : CHECK_INFO_CSS,
                                        sniffer_sd_carousel_result = sniffer.containsIncompleteAmpCarouselStructuredData.status
                                            ? CHECK_WARN + ': ' + sniffer.containsIncompleteAmpCarouselStructuredData.result
                                            : CHECK_INFO + ': ' + sniffer.containsIncompleteAmpCarouselStructuredData.result;

                                    sniffer_raw_status_css = !sniffer.containsAmpHtmlSignature
                                        ? CHECK_FAIL_CSS : sniffer_raw_status_css;

                                    __ret = {
                                        // https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString
                                        response_timestamp: new Date().toISOString(), // The timezone is always zero UTC offset, as per suffix "Z"
                                        amphtml_validator_signature: validator_signature().substr(0, 21+16) + ']', // only show left 16 chars
                                        // http_response: http_response,
                                        http_response_result: http_response_result,
                                        parse_amplinks: parse_amplinks,
                                        canonical_parsed_return: canonical_parsed_return,
                                        response_times: {
                                            status: response_times_status_css,
                                            response_times_status_amp: response_times_status_amp,
                                            response_times_status_amp_cache: response_times_status_amp_cache,
                                            fetch_duration_canonical,
                                            fetch_duration_amp,
                                            fetch_duration_amp_cache,
                                            fetch_status_amp_cache,
                                            fetch_compare_canonical_amp,
                                            fetch_compare_canonical_amp_cache
                                        },
                                        amp_hdr_status: get_check_status_css(amp_hdr_status),
                                        amp_val_status: get_check_status_css(amp_val_status),
                                        amp_val_warnings: amp_val_warnings,
                                        amp_url: url_to_validate,
                                        amp_url_enc: url_to_validate_enc,
                                        amp_url_href: amp_url_href,
                                        amphtml_url: parse_amplinks.amphtml_url,
                                        amphtml_url_href: amphtml_url_href,
                                        canonical_url: parse_amplinks.canonical_url,
                                        canonical_url_href: canonical_url_href,
                                        check_amp_links_canonical_status: get_check_status_css(check_amp_links_canonical_status),
                                        check_amp_links_canonical_results: check_amp_links_canonical_results.trim(),
                                        check_amp_links_amphtml_status: get_check_status_css(check_amp_links_amphtml_status),
                                        check_amp_links_amphtml_results: check_amp_links_amphtml_results,
                                        // conditional metadata view drivers - - - - - - - - - - - - -
                                        sniffer: sniffer,
                                        sniffer_raw_status_css: sniffer_raw_status_css,
                                        sniffer_raw_result: sniffer_raw_result,
                                        sniffer_raw_result_amphtml: sniffer_raw_result_amphtml,
                                        sniffer_raw_result_canonical: sniffer_raw_result_canonical,
                                        sniffer_sd_status_css: sniffer_sd_status_css,
                                        sniffer_sd_result: sniffer_sd_result,
                                        sniffer_sd_types_result: sniffer_sd_types_result,
                                        sniffer_sd_carousel_status_css: sniffer_sd_carousel_status_css,
                                        sd_ampCarouselStructuredDataTypesFound: '' !== sniffer.ampCarouselStructuredDataTypesFound
                                            ? sniffer.ampCarouselStructuredDataTypesFound
                                            : CHECK_FAIL + ': No Structured Data markup for AMP Top Stories Carousel supported types was found',
                                        sd_containsIncompleteAmpCarouselStructuredData_result: sniffer_sd_carousel_result,
                                        // - - -
                                        metadata_is_news: metadata_return.schemaIsArticle() ||
                                        sniffer.containsAmpNewsCarouselStructuredDataTypeMain ||
                                        sniffer.containsAmpNewsCarouselStructuredDataTypeSupport,
                                        metadata_return: metadata_return,
                                        publisher_logo_url_reachable_return: publisher_logo_url_reachable_ret,
                                        article_image_url_reachable_return: article_image_url_reachable_ret,
                                        // - - -
                                        check_robots_txt_return: check_robots_txt_return,
                                        check_google_amp_cache_status_css: check_google_amp_cache_status_css,
                                        check_google_amp_cache_return: check_google_amp_cache_return,
                                        // check_redirects_return: check_redirects_return,
                                        http_redirect_status: get_check_status_css(http_redirect_status),
                                        http_redirect_route: http_redirect_route,
                                        url: url_to_validate, /* REQUIRED for SDTT request! */
                                        // amp_results: output
                                        amp_results: amp_val_warnings.amp_val_results_short
                                    };

                                    on_validate_callback(__ret); // DONE!!!
                                }
                            };
                            sdlib.check_image_urls_are_reachable(publisher_logo_url, article_image_url, on_check_image_urls_are_reachable);
                        };
                        on_check_url_metadata(sdlib.check_body_metadata(http_response.http_response_body)); // body already fetched
                    };
                    benchlib.check_google_amp_cache(url_to_validate, on_check_google_amp_cache);
                };
                benchlib.check_robots_txt(url_to_validate, on_check_robots_txt);
            };
            benchlib.fetch_and_parse_url_for_amplinks(parse_amplinks.canonical_url, on_canonical_parsed);
        };
        benchlib.api_validate_url(url_to_validate, on_amp_validate, 0);
    }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// local utils
//

function print_dashes(dash_count) { // needs: const S = require('string');
    console.log(S(('- ').repeat(dash_count)).s );
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// module exports
//

exports.version = version;
exports.validate = validate;

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
