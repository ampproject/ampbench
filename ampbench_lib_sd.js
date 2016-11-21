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

const request = require('request');
const http_status = require('http-status');
const cheerio = require('cheerio');
const microdata = require('microdata-node');
const util = require('util');
const inspect_obj = (obj) => {return util.inspect(obj, { showHidden: true, depth: null })};
const S = require('string');

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// AMP Utils:
const benchlib = require('./ampbench_lib.js');

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// State control

const
    CHECK_FAIL = 'FAIL',
    CHECK_PASS = 'PASS',
    CHECK_INFO = 'INFO',
    CHECK_WARN = 'WARNING',
    CHECK_NONE = 'UNKNOWN';

const
    SD_JSON_LD = 'JSON-LD',
    SD_JSON_LD_BAD = 'JSON-LD (badly formed)',
    SD_MICRODATA = 'Microdata',
    SD_MICRODATA_BAD = 'Microdata (badly formed)',
    SD_UNSUPPORTED = 'Unsupported',
    SD_UNKNOWN = 'Unknown, Invalid or Unavailable';

const
    AMP_SD_TYPES = ['Article', 'NewsArticle', 'BlogPosting', 'VideoObject'],
    AMP_SD_TYPES_ARTICLE = ['Article', 'NewsArticle', 'BlogPosting'],
    AMP_SD_TYPES_ARTICLE_COMPANIONS = ['WebPage', 'Organization', 'ImageObject'], // TODO
    AMP_SD_TYPES_RECIPE = ['Recipe'],
    AMP_SD_TYPES_WEBPAGE = ['WebPage'];

const
    sd_type_is_amp = type => {
        return AMP_SD_TYPES.indexOf(type) !== -1 ? CHECK_PASS : CHECK_FAIL;
    },
    sd_type_is_amp_article = type => {
        return AMP_SD_TYPES_ARTICLE.indexOf(type) !== -1;
    },
    sd_type_is_amp_article_companion_type = type => {
        return AMP_SD_TYPES_ARTICLE_COMPANIONS.indexOf(type) !== -1;
    },
    sd_type_is_amp_recipe = type => {
        return AMP_SD_TYPES_RECIPE.indexOf(type) !== -1;
    };

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// Metadata validation results reporting object: it is useful for default initialisation and
// thereafter essentially only carries state around., i.e. mostly a glorified JS object.
//

class MetaData {
    constructor() {
        this.status = CHECK_FAIL;
        this.kind = SD_UNKNOWN;
        this.json = null;
        this.json_text = '';
        this.json_error = '';
        this.result = '';
        this.context = '';
        this.type = '';
        this.type_is_amp = '';
    }
    schemaIsAMP() {
        return AMP_SD_TYPES.indexOf(this.type) !== -1;
    }
    schemaIsArticle() {
        return AMP_SD_TYPES_ARTICLE.indexOf(this.type) !== -1;
    }
    schemaIsRecipe() {
        return AMP_SD_TYPES_RECIPE.indexOf(this.type) !== -1;
    }
    print() {
        const puts = console.log;
        puts('=> metadata.json_error             : '  + this.json_error);
        puts('=> metadata.kind                   : '  + this.kind);
        puts('=> metadata.type                   : '  + this.type);
        puts('=> metadata.type_is_amp            : '  + this.type_is_amp);
        puts('=> metadata.status                 : '  + this.status);
        puts('=> metadata.result                 : '  + this.result);
        puts('=> metadata.context                : '  + this.context);
    }
    print_json() {
        console.log('=> metadata.json_error: ' + this.json_error);
        console.log('=> metadata.json_text:\n' + this.json_text);
        console.log('=> metadata.json: typeof: ' + typeof this.json);
        console.log('=> metadata.json:\n'  + JSON.stringify(this.json, null, 4));
    }
    print_json_text() {
        console.log('=> metadata.json_text:\n' + this.json_text);
    }
}

class RecipeMetaData extends MetaData {
    constructor() {
        super();
        this.name = '';  		    // REQUIRED!!!
        this.image = ''; 			// REQUIRED!!!
        this.author_name = '';	    // recommended / warning
        this.datePublished = '';	// recommended / warning
        this.aggregateRating = {    // recommended / warning
            ratingValue: '',
            reviewCount: ''
        };
        this.description = '';		// recommended / warning
        // this.publisher_name: '',		//
        // this.publisher_logo: '',		//
    }
    print() {
        super.print();
        const puts = console.log;
        puts('=> metadata.name: ' + this.name);
    }
}

class ArticleMetaData extends MetaData {
    constructor() {
        super();
        this.news_headline = '';
        this.author_name = '';
        this.publisher_name = '';
        this.date_published = '';
        this.date_modified = '';
        this.image = {
            status: CHECK_FAIL,
            result: SD_UNKNOWN,
            type: CHECK_NONE,
            url: '',
            url_status: CHECK_WARN,
            file_type: '',
            width: '',
            height: ''
        };
        this.article_image = {
            status: CHECK_FAIL,
            result: SD_UNKNOWN,
            type: CHECK_NONE,
            url: '',
            url_status: CHECK_WARN,
            file_type: '',
            width: '',
            height: ''
        };
        this.article = {
            status: '',
            result: ''
        };
    }
    print() {
        super.print();
        const puts = console.log;
        puts('=> metadata.news_headline           : '  + this.news_headline);
        puts('=> metadata.author_name             : '  + this.author_name);
        puts('=> metadata.publisher_name          : '  + this.publisher_name);
        puts('=> metadata.date_published          : '  + this.date_published);
        puts('=> metadata.date_modified           : '  + this.date_modified);
        puts('=> metadata.image.type              : '  + this.image.type);
        puts('=> metadata.image.url               : '  + this.image.url);
        puts('=> metadata.image.url_status        : '  + this.image.url_status);
        puts('=> metadata.image.file_type         : '  + this.image.file_type);
        puts('=> metadata.image.width             : '  + this.image.width);
        puts('=> metadata.image.height            : '  + this.image.height);
        puts('=> metadata.image.status            : '  + this.image.status);
        puts('=> metadata.image.result            : '  + this.image.result);
        puts('=> metadata.article_image.type      : '  + this.image.type);
        puts('=> metadata.article_image.url       : '  + this.image.url);
        puts('=> metadata.article_image.url_status: '  + this.image.url_status);
        puts('=> metadata.article_image.file_type : '  + this.image.file_type);
        puts('=> metadata.article_image.width     : '  + this.image.width);
        puts('=> metadata.article_image.height    : '  + this.image.height);
        puts('=> metadata.article_image.status    : '  + this.image.status);
        puts('=> metadata.article_image.result    : '  + this.image.result);
        puts('=> metadata.article.status          : '  + this.article.status);
        puts('=> metadata.article.result          : '  + this.article.result);
    }
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// SD RULES:
// https://www.ampproject.org/docs/guides/discovery.html
// https://developers.google.com/structured-data/carousels/top-stories
// https://developers.google.com/structured-data/carousels/top-stories#2_make_your_amp_pages_easy_for_google_to_discover

const
    url_is_valid = url => {
        return benchlib.check_url_is_valid(url) ? CHECK_PASS : CHECK_FAIL;
    };

const
    parse_image_url_file = (url, file_extension) => {
        let img_url = url.toLowerCase(),
            img_ext = file_extension.toLowerCase();
        if (S(img_url).contains(img_ext)) {
            img_url = (S(img_url).splitLeft(img_ext, 1))[0] + img_ext;
        } else {
            img_url = url;
        }
        return img_url;
    },
    parse_image_url = (url) => {
        let img_url = parse_image_url_file(url, '.jpg');
        img_url = parse_image_url_file(img_url, '.jpeg');
        img_url = parse_image_url_file(img_url, '.png');
        img_url = parse_image_url_file(img_url, '.gif');
        return img_url;
    };

// https://developers.google.com/structured-data/rich-snippets/articles#article_markup_properties
const sd_article_is_ok = (metadata) => {
    let sd_article_status = CHECK_PASS,
        sd_article_result = '';
    if ('' === metadata.news_headline.trim()) {
        sd_article_status = CHECK_FAIL;
        sd_article_result += '[headline is unavailable]';
    }
    if ('' === metadata.author_name.trim()) {
        sd_article_status = CHECK_FAIL;
        sd_article_result += '[author is unavailable]';
    }
    if ('' === metadata.date_published.trim()) {
        sd_article_status = CHECK_FAIL;
        sd_article_result += '[date published is unavailable]';
    }
    if ('' === metadata.date_modified.trim()) {
        sd_article_status = CHECK_FAIL;
        sd_article_result += '[date modified is unavailable]';
    }
    if (sd_article_status === CHECK_FAIL) {
        if ('' === sd_article_result.trim()) { // validation likely failed due to other metadata check, like bad json
            sd_article_result = CHECK_WARN + ': some metadata might be unavailable or incorrect - see other validation checks';
        } else {
            sd_article_result = sd_article_status + ': ' + sd_article_result;
        }
    } else {
        sd_article_result = sd_article_status + ': article markup properties appear to be valid';
    }
    // console.log('==> sd_article_status/sd_article_result: ' + sd_article_status + ': ' + sd_article_result);
    return {
        sd_article_status: sd_article_status,
        sd_article_result: sd_article_result
    };
};

// PUBLISHER LOGO!
// https://developers.google.com/search/docs/data-types/articles#amp-logo-guidelines
function sd_publisher_logo_image_is_ok(url, width, height) {
    // Logo image files should be raster (.jpg, .png, .gif), not vector (.svg)
    // The logo image should fit in a 600x60px rectangle.
    let sd_logo_image_status = url_is_valid(url),
        sd_logo_image_result = '',
        sd_logo_image_url_status = benchlib.check_url_is_valid(url)
            ? CHECK_PASS + ': Publisher logo image URL appears to be valid'
            : CHECK_FAIL + ': Publisher logo image URL appears to be invalid';
    let rule_desc_logo_dims = 'Should fit in a 600 X 60 px rectangle';
    let rule_desc_logo_file = 'Should be raster (.jpg, .png, .gif), not vector (.svg)';
    let h_stat = { status: CHECK_PASS, result: rule_desc_logo_dims };
    let w_stat = { status: CHECK_PASS, result: rule_desc_logo_dims };
    let f_stat = { status: CHECK_PASS, result: rule_desc_logo_file };
    let f_type = url ? (S(url).splitRight('.', 1))[1].toUpperCase() : '';
    f_type = 4 < f_type.length ? S(f_type).left(4).s + '...' : f_type;

    // image height - - - - - - - - - - - - - - - - - - - - -
    if (height > 0 && height < 61) {
        h_stat = { status: CHECK_PASS, result: rule_desc_logo_dims };
        sd_logo_image_result += '[height OK]';
    }
    else if (height > 60) {
        h_stat = { status: CHECK_FAIL, result: rule_desc_logo_dims + '[invalid: height > 60]' };
        sd_logo_image_status = CHECK_FAIL;
        sd_logo_image_result += '[invalid: height > 60]';
    }
    else {
        h_stat = { status: CHECK_FAIL, result: rule_desc_logo_dims + '[invalid: height = 0 or is unavailable]' };
        sd_logo_image_status = CHECK_FAIL;
        sd_logo_image_result += '[invalid: height = 0 or is unavailable]';
    }

    // image width - - - - - - - - - - - - - - - - - - - - -
    if (width > 0 && width < 601) {
        w_stat = { status: CHECK_PASS, result: rule_desc_logo_dims };
        sd_logo_image_result += '[width OK]';
    }
    else if (width > 600) {
        w_stat = { status: CHECK_FAIL, result: rule_desc_logo_dims + '[invalid: width > 600]' };
        sd_logo_image_status = CHECK_FAIL;
        sd_logo_image_result += '[invalid: width > 600]';
    }
    else {
        w_stat = { status: CHECK_FAIL, result: rule_desc_logo_dims + '[invalid: width = 0 or is unavailable]' };
        sd_logo_image_status = CHECK_FAIL;
        sd_logo_image_result += '[invalid: width = 0 or is unavailable]';
    }

    // image type - - - - - - - - - - - - - - - - - - - - -
    if ('JPG' !== f_type && 'JPEG' !== f_type && 'PNG' !== f_type && 'GIF' !== f_type) {
        f_stat = { status: CHECK_WARN, result: rule_desc_logo_file };
        sd_logo_image_status = CHECK_PASS === sd_logo_image_status ? CHECK_WARN : sd_logo_image_status;
        sd_logo_image_result += '[.' + f_type + ' does not appear to be a raster type (.jpg, .png, .gif)] ';
        f_type += ' (not raster?)';
    } else {
        f_type += ' (raster)';
    }

    return {
        sd_logo_image_status: sd_logo_image_status,
        sd_logo_image_url_status: sd_logo_image_url_status,
        sd_logo_image_result: sd_logo_image_result,
        sd_logo_image_results: {
            width_ok: w_stat, height_ok: h_stat, file_ok: f_stat, file_type: f_type
        }
    };
}

// ARTICLE IMAGE!
// https://developers.google.com/search/docs/data-types/articles#article_types
// https://developers.google.com/webmasters/control-crawl-index/
function sd_article_image_is_ok(url, width, height) {
    // Logo image files should be raster (.jpg, .png, .gif), not vector (.svg)
    // The logo image should be at least 696 pixels wide.
    let sd_logo_image_status = url_is_valid(url),
        sd_logo_image_result = '',
        sd_logo_image_url_status = benchlib.check_url_is_valid(url)
            ? CHECK_PASS + ': Article image URL appears to be valid'
            : CHECK_FAIL + ': Article image URL appears to be invalid';
    let rule_desc_logo_dims = 'Should be at least 696 pixels wide';
    let rule_desc_logo_file = 'Should be raster (.jpg, .png, .gif), not vector (.svg)';
    let h_stat = { status: CHECK_PASS, result: rule_desc_logo_dims };
    let w_stat = { status: CHECK_PASS, result: rule_desc_logo_dims };
    let f_stat = { status: CHECK_PASS, result: rule_desc_logo_file };
    let f_type = url ? (S(url).splitRight('.', 1))[1].toUpperCase() : '';
    f_type = 4 < f_type.length ? S(f_type).left(4).s + '...' : f_type;

    // image height - - - - - - - - - - - - - - - - - - - - -
    if (height > 0) {
        h_stat = { status: CHECK_PASS, result: rule_desc_logo_dims };
        sd_logo_image_result += '[height OK]';
    }
    else {
        h_stat = { status: CHECK_FAIL, result: rule_desc_logo_dims + '[FAIL: width is invalid or unavailable]' };
        sd_logo_image_status = CHECK_FAIL;
        sd_logo_image_result += '[invalid: height = 0 or is unavailable]';
    }

    // image width - - - - - - - - - - - - - - - - - - - - -
    if (width > 695) {
        w_stat = { status: CHECK_PASS, result: rule_desc_logo_dims };
        sd_logo_image_result += '[width OK]';
    }
    else {
        w_stat = { status: CHECK_FAIL, result: rule_desc_logo_dims + '[FAIL: width is invalid, unavailable, or < 696]' };
        sd_logo_image_status = CHECK_FAIL;
        sd_logo_image_result += '[FAIL: width is invalid, unavailable, or < 696]';
    }

    // image type - - - - - - - - - - - - - - - - - - - - -
    if ('JPG' !== f_type && 'JPEG' !== f_type && 'PNG' !== f_type && 'GIF' !== f_type) {
        f_stat = { status: CHECK_WARN, result: rule_desc_logo_file };
        sd_logo_image_status = CHECK_PASS === sd_logo_image_status ? CHECK_WARN : sd_logo_image_status;
        sd_logo_image_result += '[WARNING: .' + f_type + ' does not appear to be a raster type (.jpg, .png, .gif)] ';
        f_type += ' (not raster?)';
    } else {
        f_type += ' (raster)';
    }

    return {
        sd_logo_image_status: sd_logo_image_status,
        sd_logo_image_url_status: sd_logo_image_url_status,
        sd_logo_image_result: sd_logo_image_result,
        sd_logo_image_results: {
            width_ok: w_stat, height_ok: h_stat, file_ok: f_stat, file_type: f_type
        }
    };
}

function check_image_urls_are_reachable(logo_url, image_url, callback) {
    let logo_url_is_reachable_ret  = null,
        image_url_is_reachable_ret = null;
    // _ret = {
    //     url: fetch_url,
    //     agent: user_agent,
    //     ok: false,
    //     status: '',
    //     result: '',
    //     size: 0,
    //     err: null
    // };
    const logo_url_is_reachable_callback = (_logo_ret) => {
        logo_url_is_reachable_ret = _logo_ret;
        const image_url_is_reachable_callback = (_image_ret) => {
            image_url_is_reachable_ret = _image_ret;
            callback(logo_url_is_reachable_ret, image_url_is_reachable_ret);
        };
        // benchlib.check_url_is_reachable(image_url, image_url_is_reachable_callback);
        benchlib.check_url_is_reachable_with_googlebot(image_url, image_url_is_reachable_callback);
    };
    // benchlib.check_url_is_reachable(logo_url, logo_url_is_reachable_callback);
    benchlib.check_url_is_reachable_with_googlebot(logo_url, logo_url_is_reachable_callback);
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// MAIN:
//

function check_body_metadata(body) {
    return extract_metadata(body, new ArticleMetaData());
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// try json-ld else microdata

function extract_metadata(body, metadata) {

	let md = extract_metadata_json_ld_article(body, metadata);

    // console.log('- - extract_metadata - -');
    // console.log('==> metadata.kind  : ' + md.kind);
    // console.log('==> metadata.status: ' + md.status);
    // print_dashes(50);

    if (CHECK_PASS !== md.status) { // maybe it is microdata format?
        md = inspect_for_microdata_json(body, md);

        // print_dashes(80);
        // console.log('- - inspect_for_microdata_json - -');
        // console.log('==> md.kind  : ' + md.kind);
        // console.log('==> md.status: ' + md.status);
        // console.log('=> microdata.json.length: '  + md.json.length);
        // console.log('=> microdata.json:\n'  + JSON.stringify(md.json, null, 2));
        // print_dashes(50);

        if (SD_MICRODATA === md.kind) {
            md = extract_metadata_microdata(md);

            // console.log('- - extract_metadata_microdata - -');
            // console.log('==> metadata.kind  : ' + md.kind);
            // console.log('==> metadata.status: ' + md.status);
            // print_dashes(30);

        } else if (CHECK_PASS !== md.status) { // maybe badly formed JSON-LD?
            md = extract_json_ld_items_from_body_if_badly_formed(body, md);

            // console.log('- - extract_json_ld_items_from_body_if_badly_formed - -');
            // console.log('==> metadata.kind  : ' + md.kind);
            // console.log('==> metadata.status: ' + md.status);
            // print_dashes(30);

        }
    }

    // console.log('- - extract_metadata - -');
    // console.log('==> metadata.kind  : ' + md.kind);
    // console.log('==> metadata.status: ' + md.status);
    // console.log('==> metadata:\n' + inspect_obj(md));
    // // md.print_json(); //DEBUG!!!
    // // md.print(); //DEBUG!!!
    // print_dashes(60);

    return md;
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// json-ld:

function get_json_ld_value_safe(parent, item) {
    let __ret = null;
    try {
        __ret = parent[item];
    } catch (err) {
        __ret = '*missing*';
    }
    return __ret;
}

function extract_metadata_json_ld_news_types(body) { // cater for multiple ld+json blocks
    let md_type = '',
        jsonld_script_return = '',
        jsonld_json = null,
        jsonld_block = null,
        jsonld_blocks = null;
    try {
        const $ = cheerio.load(body, {});
        jsonld_blocks = $('script[type="application/ld+json"]');
        // console.log('==> $(script[type="application/ld+json"]).length: ' + jsonld_blocks.length);
        for (let i = 0; i < jsonld_blocks.length; i++) {
            jsonld_block = jsonld_blocks[i].children[0].data;
            try {
                jsonld_json = JSON.parse(jsonld_block);
                if (jsonld_json instanceof Array) {
                    for (let j = 0; j < jsonld_json.length; j++) {
                        md_type = jsonld_json[j]['@type'];
                        if (sd_type_is_amp_article(md_type)) {
                            jsonld_script_return = JSON.stringify(jsonld_json[j]);
                        }
                    }
                } else {
                    md_type = jsonld_json['@type'];
                    if (sd_type_is_amp_article(md_type)) {
                        jsonld_script_return = JSON.stringify(jsonld_json);
                    }
                }
            } catch(err) { // do nothing - we need to carry on
                // console.log('==> ERROR: extract_json_ld: JSON.parse(jsonld_block): ' + err);
            }
        }
    } catch(err) { // do nothing - we need to carry on
        // console.log('==> ERROR: extract_json_ld(): ' + err);
    }
    return jsonld_script_return;
}

function extract_metadata_json_ld_article(body, metadata) {

    let script_jsonld_txt = extract_metadata_json_ld_news_types(body);
    metadata.json_text = script_jsonld_txt;

    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // attempt to parse the embedded JSON-LD text into a JSON object
    try {
        metadata.json = JSON.parse(script_jsonld_txt);
        metadata.json_error = '';

        metadata.context = metadata.json['@context'];
        metadata.type = (metadata.json['@type']);
        // get JSON-LD generic metadata
        metadata.kind = SD_JSON_LD;
        metadata.status = CHECK_PASS;
        metadata.result = 'JSON-LD content appears to be valid JSON';
        metadata.type_is_amp = sd_type_is_amp(metadata.type);

        if (CHECK_PASS === metadata.type_is_amp) { // indicates we should be OK to get more specific metadata items
            if (sd_type_is_amp_article(metadata.type)) {
                // publication metadata
                try {
                    metadata.news_headline = metadata.json.headline;
                    metadata.author_name = metadata.json.author.name;
                    metadata.publisher_name = metadata.json.publisher.name;
                    metadata.date_published = metadata.json.datePublished;
                    metadata.date_modified = metadata.json.dateModified;
                } catch (e) {
                    // pass: carry on regardless ...
                    // console.log('==> ERROR: ' + e);
                }
                // publisher logo image metadata
                try {
                    // publisher:
                    // { '@type': 'Organization',
                    //     name: 'WebMD',
                    //     logo:
                    //     { '@type': 'ImageObject',
                    //         url: 'https://img.webmd.com/dtmcms/live/webmd/consumer_assets/site_images/amp/webmd_600x60_google_amp.png?resize=600:60',
                    //         width: 600,
                    //         height: 60 } },
                    metadata.image.type = (metadata.json.publisher.logo['@type']).toString();
                    metadata.image.url = metadata.json.publisher.logo.url;
                    metadata.image.width = metadata.json.publisher.logo.width;
                    metadata.image.height = metadata.json.publisher.logo.height;
                    let publisher_logo_ok = sd_publisher_logo_image_is_ok(
                        parse_image_url(metadata.image.url),
                        metadata.image.width, metadata.image.height);
                    metadata.image.file_type = publisher_logo_ok.sd_logo_image_results.file_type;
                    metadata.image.status  = publisher_logo_ok.sd_logo_image_status;
                    metadata.image.result = publisher_logo_ok.sd_logo_image_result;
                    metadata.image.url_status = publisher_logo_ok.sd_logo_image_url_status;

                    // console.log('- - extract_metadata_json_ld_article - -');
                    // console.log('==> metadata:\n' + inspect_obj(metadata));
                    // print_dashes(60);

                } catch (e) {
                    // pass: carry on regardless ...
                    // console.log('==> ERROR: ' + e);
                }
                // article logo image metadata
                try {
                    metadata.article_image.type = (metadata.json.image['@type']).toString();
                    metadata.article_image.url = metadata.json.image.url;
                    metadata.article_image.width = metadata.json.image.width;
                    metadata.article_image.height = metadata.json.image.height;
                    let article_logo_ok = sd_article_image_is_ok(
                        parse_image_url(metadata.article_image.url),
                        metadata.article_image.width, metadata.article_image.height);
                    metadata.article_image.file_type = article_logo_ok.sd_logo_image_results.file_type;
                    metadata.article_image.status  = article_logo_ok.sd_logo_image_status;
                    metadata.article_image.result = article_logo_ok.sd_logo_image_result;
                    metadata.article_image.url_status = article_logo_ok.sd_logo_image_url_status;

                    // console.log('- - extract_metadata_json_ld_article - -');
                    // console.log('==> metadata:\n' + inspect_obj(metadata));
                    // print_dashes(60);

                } catch (e) {
                    // pass: carry on regardless ...
                    // console.log('==> ERROR: ' + e);
                }
                try {
                    let article_is_ok = sd_article_is_ok(metadata);
                    metadata.article.status = article_is_ok.sd_article_status;
                    metadata.article.result = article_is_ok.sd_article_result;
                } catch (e) {
                    // pass: carry on regardless ...
                    // console.log('==> ERROR: ' + e);
                }
            }
        } else { // SD schema not currently supported
            metadata.status = CHECK_FAIL;
            metadata.kind = SD_UNSUPPORTED;
            metadata.result =
                'JSON-LD content appears to be of a currently unsupported form or type [' + metadata.type + ']';
        }
        // } else if (sd_type_is_amp_recipe(metadata.type)) { // not really supported
        //     // https://developers.google.com/structured-data/rich-snippets/recipes
        //     // https://developers.google.com/structured-data/rich-snippets/recipes#recipe_markup_properties
        //     try { // not really supported but we go the extra mile...???
        //         metadata.news_headline = metadata.json.description;
        //         metadata.author_name = metadata.json.author;
        //         metadata.publisher_name = '';
        //         metadata.date_published = metadata.json.datePublished;
        //         metadata.date_modified = '';
        //         metadata.image.url = metadata.json.image;
        //         let logo_ok = sd_publisher_logo_image_is_ok(
        //             parse_image_url(metadata.image.url),
        //             metadata.image.width, metadata.image.width);
        //         metadata.image.file_type = logo_ok.sd_logo_image_results.file_type;
        //         metadata.image.status  = logo_ok.sd_logo_image_status;
        //         metadata.image.result = logo_ok.sd_logo_image_result;
        //         metadata.image.url_status = logo_ok.sd_logo_image_url_status;
        //         let article_is_ok = sd_article_is_ok(metadata);
        //         metadata.article.status = article_is_ok.sd_article_status;
        //         metadata.article.result = article_is_ok.sd_article_result;
        //     } catch (e) {
        //         // pass: carry on regardless ...
        //         // console.log('==> ERROR [json-ld: Recipe]: ' + e);
        //     }
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    // badly formed JSON??? or Microdata???
    } catch (e) {
        metadata.json_error = e.message;
        metadata.kind = SD_JSON_LD_BAD;
        metadata.status = CHECK_WARN;
        metadata.result =
            'JSON-LD content appears to be invalid JSON: some metadata entities might be unavailable or incorrect';
    }
    // finally {
    //     print_dashes(50); // !!!TODO!!! debug only !!!
    //     metadata.print();
    //     // metadata.print_json();
    //     // console.log('==> ERROR [json-ld parse JSON]: ' + e);
    //     // console.log('==> ERROR [json-ld parse JSON]: ' + e.message);
    //     // // metadata.print_json_text();
    //     print_dashes(50);
    // }

    // console.log('==> metadata:\n' + inspect_obj(metadata));
    // print_dashes(60);

    return metadata;
}

function extract_metadata_json_ld_recipe(body, metadata) {

    try { // Recipe
        // REQUIRED!!!
        metadata.name = get_json_ld_value_safe(metadata.json, 'name');
        metadata.image = get_json_ld_value_safe(metadata.json, 'image');
        // WARNING!!!
        metadata.author_name = get_json_ld_value_safe(metadata.json.author, 'name');
        if (!metadata.author_name) {
            metadata.author_name = get_json_ld_value_safe(metadata.json, 'author');
        }
        metadata.datePublished = get_json_ld_value_safe(metadata.json, 'datePublished');
        metadata.aggregateRating.ratingValue = get_json_ld_value_safe(metadata.json.aggregateRating, 'ratingValue');
        metadata.aggregateRating.reviewCount = get_json_ld_value_safe(metadata.json.aggregateRating, 'reviewCount');
        metadata.description = get_json_ld_value_safe(metadata.json, 'description');
        // not interesting:
        // // metadata.publisher_name = metadata.json.publisher.name;
        // metadata.publisher_name = get_json_ld_value(metadata.json.publisher, 'name');
        // // metadata.publisher_logo = metadata.json.publisher.logo.url;
        // metadata.publisher_logo = get_json_ld_value(metadata.json.publisher.logo, 'url');
    } catch (e) {
        // pass: carry on regardless ...
        // console.log('==> ERROR: ' + e);
    }
    // console.log('==> metadata:\n' + inspect_obj(metadata));
    // print_dashes(60);
    return metadata;

}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// microdata:
// https://www.npmjs.com/package/microdata-node
// https://github.com/LawrenceWoodman/mida/wiki/Sites-Using-Microdata
// http://southernafricatravel.com/destination/south_africa/cape_town_peninsula/

const inspect_for_microdata_json = (body, metadata) => {

    try { // as microdata ? // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...

        const md_json = microdata.toJsonld(body);

        // print_dashes(80);
        // console.log('=> microdata.json.length: '  + md_json.length);
        // console.log('=> microdata.json:\n'  + JSON.stringify(md_json, null, 2));
        // print_dashes(50);

        if (0 < md_json.length) {
            metadata.json = md_json; // seems safe to overwrite current metadata json
            metadata.kind = SD_MICRODATA;
            metadata.status = CHECK_PASS;
            metadata.result = 'Microdata content appears to be available';
            // metadata.json_error = '';
        }
    } catch (e) { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
        // pass: carry on regardless ... i.e., pass-through
        // only set values if microdata was actually found, else leave as is
        // console.log('==> ERROR [try as microdata]: ' + e);
        // metadata.json_error = e.message;
    }
    return metadata;
};

const unwrap_microdata_json_for_news = (md) => { // scans Microdata json block objects for relevant data items

    let md_block_type = '',
        md_id_section = '',
        md_id_publisher_logo = '',
        md_id_article_image = '',
        md_id_author = '',
        md_id_publisher = '';

    function get_schema_id(block, type_name) {
        let __ret = '';
        try { __ret = block['http://schema.org/' + type_name][0]['@id'] || '';
        } catch (e) { // could be https?
            try { __ret = block['https://schema.org/' + type_name][0]['@id'] || '';
            } catch (e) { /* pass - item not found */}
        }
        return __ret;
    }

    function get_schema_value(block, type_name) {
        let __ret = 'missing';
        try { __ret = block['http://schema.org/' + type_name][0]['@value'] || '';
        } catch (e) { // could be https?
            try { __ret = block['https://schema.org/' + type_name][0]['@value'] || '';
            } catch (e) { /* pass - item not found */}
        }
        return __ret;
    }

    try {

        md.json.forEach((md_block) => {

            md_block_type = md_block['@type'][0] || '';
            md_id_section = md_block['@id'] || '';
            // console.log('==> MICRODATA BLOCK [md_block]:\n' + inspect_obj(md_block));
            // console.log('==> [UNWRAP] md_block_type: ' + md_block_type);
            // console.log('==> [UNWRAP] md_id_section: ' + md_id_section);
            // print_dashes(60);

            if (md_block_type) {
                try { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
                    switch (md_block_type) {
                        
                        case 'http://schema.org/Article':
                        case 'https://schema.org/Article':
                        case 'http://schema.org/NewsArticle':
                        case 'https://schema.org/NewsArticle':
                            // in which block id is each item of interest
                            md_id_article_image = get_schema_id(md_block, 'image');
                            md_id_author = get_schema_id(md_block, 'author');
                            md_id_publisher = get_schema_id(md_block, 'publisher');
                            // extract news article items - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
                            md.news_headline = get_schema_value(md_block, 'headline');
                            md.date_published = get_schema_value(md_block, 'datePublished');
                            md.date_modified = get_schema_value(md_block, 'dateModified');
                            break;
                        case 'http://schema.org/Person':
                        case 'https://schema.org/Person':
                            if (md_id_section === md_id_author) {
                                md.author_name = get_schema_value(md_block, 'name');
                            }
                            if (md_id_section === md_id_article_image) {
                                md.article_image.author_name = get_schema_value(md_block, 'name');
                            }
                            break;
                        case 'http://schema.org/Organization':
                        case 'https://schema.org/Organization':
                            if (md_id_section === md_id_publisher) {
                                md_id_publisher_logo = get_schema_id(md_block, 'logo');
                                md.publisher_name = get_schema_value(md_block, 'name');
                            }
                            break;
                        case 'http://schema.org/ImageObject':
                        case 'https://schema.org/ImageObject':
                            if (md_id_section === md_id_publisher_logo) {
                                md.image.type = last_element_of_path(md_block_type);
                                md.image.url = get_schema_value(md_block, 'url');
                                md.image.width = get_schema_value(md_block, 'width');
                                md.image.height = get_schema_value(md_block, 'height');
                            }
                            if (md_id_section === md_id_article_image) {
                                md.article_image.type = last_element_of_path(md_block_type);
                                md.article_image.url = get_schema_value(md_block, 'url');
                                md.article_image.width = get_schema_value(md_block, 'width');
                                md.article_image.height = get_schema_value(md_block, 'height');
                            }
                            break;
                        default:
                        // do nothing
                    }
                } catch (err) { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
                    // pass...
                    // console.log('==> ERROR: MICRODATA 2:\n' + inspect_obj(err));
                    md.status = CHECK_FAIL;
                    md.kind = SD_MICRODATA_BAD;
                    md.result = md_block_type + ': Microdata content appears to be invalid: ' + err.message;
                    md.json_error = err.message;

                }
            }
            // print_dashes(50);
            // console.log('==> md_block_type  : ' + md_block_type);
            // console.log('==> md_id_section  : ' + md_id_section);
            // console.log('==> md_id_logo     : ' + md_id_logo);
            // console.log('==> md_id_author   : ' + md_id_author);
            // console.log('==> md_id_publisher: ' + md_id_publisher);
            // print_dashes(50);
        });
    } catch (err) {
        // pass: carry on regardless ...
        // console.log('==> ERROR: MICRODATA: ' + e);
        // console.log('==> ERROR: MICRODATA 1:\n' + inspect_obj(err));
        md.status = CHECK_FAIL;
        md.kind = SD_MICRODATA_BAD;
        md.result = md_block_type + ': Microdata content appears to be invalid: ' + err.message;
        md.json_error = err.message;
    }

    // md.print_json(); //DEBUG!!!
    // md.print(); //DEBUG!!!
    return md;
};

function extract_metadata_microdata_news_types(metadata) { // scan for all news blocks present, if any

    let _md_news_found = false,
        _md_type = '',
        _md_types = [],
        _md_block_indexes = [];

    _md_news_found = false; // init to negative!
    metadata.json.forEach( (md_block, _md_block_index) => {
        _md_type = last_element_of_path((md_block['@type'][0]).toString());
        if (sd_type_is_amp_article(_md_type)) { // AMP_SD_TYPES_ARTICLE = ['Article', 'NewsArticle', 'BlogPosting']
            // console.log('=> _md_type: ' + _md_type);
            _md_news_found = true;
            _md_types.push(_md_type);
            _md_block_indexes.push(_md_block_index);
        }
    });
    return {
        md_news_found: _md_news_found,
        md_types: _md_types,
        md_block_indexes: _md_block_indexes
    };
}

function extract_metadata_microdata(metadata) {

    try {
        if(0 < metadata.json.length) {

            metadata.kind = SD_MICRODATA;
            metadata.status = CHECK_PASS;
            metadata.result = 'Microdata content appears to be valid';

            let _md_news_types = extract_metadata_microdata_news_types(metadata);

            // if (0 < _md_news_types.md_types.length) { // we found news microdata markup
            if (_md_news_types.md_news_found) { // we found news microdata markup

                // metadata.type = last_element_of_path((metadata.json[0]['@type'][0]).toString());
                metadata.type = _md_news_types.md_types[0]; // take the first one
                metadata.type_is_amp = sd_type_is_amp(metadata.type);

                // print_dashes(80);
                // console.log('- - inspect_for_microdata_json - -');
                // console.log('=> metadata.kind        : ' + metadata.kind);
                // console.log('=> metadata.status      : ' + metadata.status);
                // console.log('=> metadata.type        : ' + metadata.type);
                // console.log('=> metadata.type_is_amp : ' + metadata.type_is_amp);
                // console.log('=> microdata.json.length: ' + metadata.json.length);
                // console.log('=> microdata.json:\n'  + JSON.stringify(metadata.json, null, 2));
                // print_dashes(50);

                metadata = unwrap_microdata_json_for_news(metadata);

                if (CHECK_PASS === metadata.status) { // unwrap succesfull?
                    try {
                        // publisher logo image metadata
                        let publisher_logo_ok = sd_publisher_logo_image_is_ok(
                            parse_image_url(metadata.image.url),
                            metadata.image.width, metadata.image.height);
                        metadata.image.file_type = publisher_logo_ok.sd_logo_image_results.file_type;
                        metadata.image.status  = publisher_logo_ok.sd_logo_image_status;
                        metadata.image.result = publisher_logo_ok.sd_logo_image_result;
                        metadata.image.url_status = publisher_logo_ok.sd_logo_image_url_status;

                        // // article image metadata //!!!TODO!!!20160524
                        let article_logo_ok = sd_article_image_is_ok(
                            parse_image_url(metadata.article_image.url),
                            metadata.article_image.width, metadata.article_image.height);
                        metadata.article_image.file_type = article_logo_ok.sd_logo_image_results.file_type;
                        metadata.article_image.status  = article_logo_ok.sd_logo_image_status;
                        metadata.article_image.result = article_logo_ok.sd_logo_image_result;
                        metadata.article_image.url_status = article_logo_ok.sd_logo_image_url_status;

                        let article_is_ok = sd_article_is_ok(metadata);
                        metadata.article.status = article_is_ok.sd_article_status;
                        metadata.article.result = article_is_ok.sd_article_result;

                    } catch (err) {
                        // pass: carry on regardless ...
                        // console.log('==> ERROR [microdata: Image]: ' + err);
                        metadata.status = CHECK_FAIL;
                        metadata.kind = SD_MICRODATA_BAD;
                        metadata.result = metadata.type + ': Microdata content appears to be invalid: ' + err.message;
                        metadata.json_error = err.message;
                    }
                }
                // console.log('- - extract_metadata_microdata - -');
                // console.log('==> metadata:\n' + inspect_obj(metadata));
                // print_dashes(60);
            } else { // SD schema not currently supported
                metadata.status = CHECK_WARN;
                metadata.result = metadata.type + ': Structured Data markup content appears to be unsupported';
            }
        } else {
            metadata.status = CHECK_FAIL;
            metadata.result = 'Structured Data markup content appears to be invalid';
            metadata.kind = SD_UNKNOWN;
        }
    } catch(e) {
        metadata.status = CHECK_FAIL;
        metadata.result = 'Structured Data markup content appears to be invalid';
        metadata.kind = SD_UNKNOWN;
    }
	return metadata;
}

const extract_json_ld_items_from_body_if_badly_formed = (body, metadata) => {
    const $ = cheerio.load(body, {});
    metadata.json_text = $('script[type="application/ld+json"]').text().trim();
    return extract_json_ld_items_from_text_if_badly_formed(metadata);
};

const extract_json_ld_items_from_text_if_badly_formed = (metadata) => { // extract directly as a last resort (badly formed JSON?)
    let temp = '';
    try { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
        metadata.context = S(metadata.json_text).between('"@context": "', '"').s;
        metadata.type = S(metadata.json_text).between('"@type": "', '"').s; // assume this '@type' instance will be first :-)
        metadata.type_is_amp = sd_type_is_amp(metadata.type);
        metadata.kind = SD_JSON_LD_BAD; // we are here because JSON.parse rejected the JSON as invalid somehow
        metadata.status = CHECK_WARN;
        metadata.result =
            'JSON-LD content appears to be invalid JSON: some metadata entities might be unavailable or incorrect';
        // metadata.status = CHECK_PASS;
        if (CHECK_PASS === metadata.type_is_amp) { // indicates we should be OK to get more specific metadata items
            if (sd_type_is_amp_article(metadata.type)) {
                try { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
                    // publication metadata
                    try {
                        metadata.news_headline = S(metadata.json_text).between('"headline": "', '"').s;
                        metadata.author_name = S(metadata.json_text).between('"name": "', '"').s; // whichever name comes first :-)
                        metadata.publisher_name = S(metadata.json_text).between('"name": "', '"').s; // next one?
                        metadata.date_published = S(metadata.json_text).between('"datePublished": "', '"').s;
                        metadata.date_modified = S(metadata.json_text).between('"dateModified": "', '"').s;
                    } catch (e) { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
                        // pass...
                        // console.log('==> ERROR: MICRODATA: ' + e);
                    }
                    // publisher logo image metadata
                    try {
                        temp = S(metadata.json_text).between('"logo":', '}').s;
                        metadata.image.type = S(temp).between('"@type": "', '"').s;
                        metadata.image.url = S(temp).between('"url": "', '"').s;
                        metadata.image.width = S(temp).between('"width": ', '\n').s;
                        metadata.image.width = parseInt(metadata.image.width, 10);
                        metadata.image.height = S(temp).between('"height": ', '\n').s;
                        metadata.image.height = parseInt(metadata.image.height, 10);
                        let publisher_logo_ok = sd_publisher_logo_image_is_ok(
                            parse_image_url(metadata.image.url),
                            metadata.image.width, metadata.image.height);
                        metadata.image.file_type = publisher_logo_ok.sd_logo_image_results.file_type;
                        metadata.image.status = publisher_logo_ok.sd_logo_image_status;
                        metadata.image.result = publisher_logo_ok.sd_logo_image_result;
                        metadata.image.url_status = publisher_logo_ok.sd_logo_image_url_status;
                    } catch (e) { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
                        // pass...
                        // console.log('==> ERROR: MICRODATA: ' + e);
                    }
                    // article image metadata
                    try {
                        temp = S(metadata.json_text).between('"image":', '}').s;
                        metadata.article_image.type = S(temp).between('"@type": "', '"').s;
                        metadata.article_image.url = S(temp).between('"url": "', '"').s;
                        metadata.article_image.width = S(temp).between('"width": ', '\n').s;
                        metadata.article_image.width = parseInt(metadata.article_image.width, 10);
                        metadata.article_image.height = S(temp).between('"height": ', '\n').s;
                        metadata.article_image.height = parseInt(metadata.article_image.height, 10);
                        let article_logo_ok = sd_article_image_is_ok(
                            parse_image_url(metadata.article_image.url),
                            metadata.article_image.width, metadata.article_image.height);
                        metadata.article_image.file_type = article_logo_ok.sd_logo_image_results.file_type;
                        metadata.article_image.status = article_logo_ok.sd_logo_image_status;
                        metadata.article_image.result = article_logo_ok.sd_logo_image_result;
                        metadata.article_image.url_status = article_logo_ok.sd_logo_image_url_status;
                    } catch (e) { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
                        // pass...
                        // console.log('==> ERROR: MICRODATA: ' + e);
                    }
                    let article_is_ok = sd_article_is_ok(metadata);
                    metadata.article.status = article_is_ok.sd_article_status;
                    metadata.article.result = article_is_ok.sd_article_result;
                } catch (e) { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
                    // pass: carry on regardless ...
                    // console.log('==> ERROR [json-ld extract: Article]: ' + e);
                }
            }
        } else { // SD schema not currently supported
            metadata.status = CHECK_WARN;
        }
    } catch (e) { // DO NOT REMOVE!!! we need to carry on regardless of missing or invalid metadata items...
        // pass...
        // console.log('==> ERROR: MICRODATA: ' + e);
    }

    // console.log('==> metadata:\n' + inspect_obj(metadata));
    // print_dashes(60);

    return metadata;
};

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// utils: general / sometimes also in other modules for good reason
//

const last_element_of_list = (list) => {
	return list[list.length - 1];
};

const last_element_of_path = (path) => {
	const path_str = path.toString();
	return path_str.substr(path_str.lastIndexOf('/') + 1);
};

function log_js_object(o, prefix) {
    for (var key in o) {
        if (o.hasOwnProperty(key)) {
            console.log(prefix + key + ': ' + o[key]);
        }
    }
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

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// EXPORTS:

exports.MetaData = MetaData;
exports.ArticleMetaData = ArticleMetaData;
exports.RecipeMetaData = RecipeMetaData;
exports.check_body_metadata = check_body_metadata;
exports.check_image_urls_are_reachable = check_image_urls_are_reachable;
exports.last_element_of_list = last_element_of_list;
exports.last_element_of_path = last_element_of_path;

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
