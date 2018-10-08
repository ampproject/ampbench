/// <reference path="probe-image-size.d.ts" />
/// <reference path="amp-toolbox-cache-url.d.ts" />

import {readFileSync} from "fs";
import {resolve, URL} from "url";
// tslint:disable-next-line:no-var-requires
const validator = require("amphtml-validator").newInstance(
  // Let's not fetch over the network on every run.
  // Use `npm run update-data` to update.
  // tslint:disable-next-line:no-var-requires
  readFileSync(`${__dirname}/validator.js`).toString(),
);
import createCacheUrl = require("amp-toolbox-cache-url");
import * as cheerio from "cheerio";
import throat = require("throat");

import {default as fetch, Request, RequestInit, Response} from "node-fetch";
import {basename} from "path";
import * as probe from "probe-image-size";
import * as punycode from "punycode";
import * as readline from "readline";

const CONCURRENCY = 8;
const UA_GOOGLEBOT_MOBILE = [
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36",
  "(KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36",
  "(compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
].join(" ");

export interface ActualExpected {
  readonly actual: string|undefined;
  readonly expected: string;
}

export interface Message {
  readonly status: string;
  readonly message?: string|ActualExpected;
}

export interface Context {
  readonly url: string;
  readonly $: CheerioStatic;
  readonly headers: {
    [key: string]: string;
  };
}

export interface Test {
  (context: Context): Promise<Message>;
}

export interface TestList {
  (context: Context): Promise<Message[]>;
}

interface InlineMetadata {
  "title": string;
  "publisher": string;
  "publisher-logo-src": string;
  "poster-portrait-src": string;
  "poster-square-src"?: string;
  "poster-landscape-src"?: string;
}

const S_PASS = "PASS";
const S_FAIL = "FAIL";
const S_WARN = "WARN";
const S_INFO = "INFO";

export const PASS = (): Promise<Message> => Promise.resolve({status: S_PASS});
export const FAIL = (s: string|ActualExpected) => {
  return Promise.resolve({status: S_FAIL, message: s});
};
export const WARN = (s: string|ActualExpected) => {
  return Promise.resolve({status: S_WARN, message: s});
};
export const INFO = (s: string|ActualExpected) => {
  return Promise.resolve({status: S_INFO, message: s});
};

const isPass = (m: Message): boolean => {
  return m.status === S_PASS;
};

const notPass = (m: Message): boolean => {
  return m.status !== S_PASS;
};

const getBody = throat(CONCURRENCY,
  (context: Context, s: string|Request, init = {}) => {
    if (!("headers" in init)) {
      init.headers = {};
    }
    // Might be able to use type guards to avoid the cast somehow...
    (init.headers as {[key: string]: string})["user-agent"] = UA_GOOGLEBOT_MOBILE;
    return fetch(s, init);
    // return res.ok ? res.text() : new Error(res);
  },
);

const getUrl = throat(CONCURRENCY,
  async (context: Context, s: string|Request) => {
    const res = await fetch(s, {headers: context.headers });
    return res.url;
  },
);

const getContentLength = throat(CONCURRENCY,
  async (context: Context, s: string|Request) => {
    const options = Object.assign(
      {},
      { method: "HEAD" },
      { headers: context.headers }
    );
    const res = await fetch(s, options);
    if (!res.ok) { return Promise.reject(res); }
    const contentLength = res.headers.get("content-length");
    return contentLength ? contentLength : 0;
  },
);

const absoluteUrl = (s: string|undefined, base: string|undefined) => {
  if (typeof s !== "string" || typeof base !== "string") {
    return undefined;
  } else {
    return resolve(base, s);
  }
};

const getSchemaMetadata = ($: CheerioStatic) => {
  const metadata = JSON.parse($('script[type="application/ld+json"]').html() as string);
  return metadata ? metadata : {};
};

function getInlineMetadata($: CheerioStatic) {
  const e = $("amp-story");
  const inlineMetadata: InlineMetadata = {
    "poster-landscape-src": e.attr("poster-landscape-src"), // optional
    "poster-portrait-src": e.attr("poster-portrait-src"),
    "poster-square-src": e.attr("poster-square-src"), // optional
    "publisher": e.attr("publisher"),
    "publisher-logo-src": e.attr("publisher-logo-src"),
    "title": e.attr("title"),
  };
  return inlineMetadata;
}

function getImageSize(context: Context, url: string):
  Promise<{width: number, height: number, mime: string, [k: string]: any}> {
  // probe-image size can't handle encoded streams:
  // https://github.com/nodeca/probe-image-size/issues/28
  const headers = Object.assign({}, context.headers);
  delete headers["accept-encoding"];
  return probe(absoluteUrl(url, context.url), { headers });
}

const getCorsEndpoints = ($: CheerioStatic) => {
  return ([] as string[]).concat(
    $("amp-list[src]").map((_, e) => $(e).attr("src")).get(),
    $("amp-story amp-story-bookend").attr("src"),
    $("amp-story").attr("bookend-config-src"),
  ).filter(s => !!s);
};

function fetchToCurl(url: string, init: { headers?: { [k: string]: string } } = { headers: {} }) {
  const headers = init.headers || {};

  const h = Object.keys(headers).map(k => `-H '${k}: ${headers[k]}'`).join(" ");

  return `curl -i ${h} '${url}'`;
}

const testValidity: Test = ({$}) => {
  const res = validator.validateString($.html());
  return Promise.resolve(res.status === "PASS" ? PASS() : res);
};

const testCanonical: Test = (context) => {
  const {$, url} = context;
  const href = $('link[rel="canonical"]').attr("href");
  if (!href) {
    return FAIL("<link rel=canonical> not specified");
  }
  const canonical = absoluteUrl(href, url);
  if (url !== canonical) {
    return FAIL({
      actual: canonical,
      expected: url,
    });
  }
  return getUrl(context, canonical).then((s) => {
    if (s === canonical) {
      return PASS();
     } else {
       return FAIL({
         actual: s,
         expected: canonical,
       });
      }
    },
  ).catch(() => {
    return FAIL(`couldn't retrieve canonical ${canonical}`);
  });
};

const testSchemaMetadataType: Test = ({$}) => {
  const metadata = getSchemaMetadata($);
  const type = metadata["@type"];
  if (type !== "Article" && type !== "NewsArticle" && type !== "ReportageNewsArticle") {
    return WARN(`@type is not 'Article' or 'NewsArticle' or 'ReportageNewsArticle'`);
  } else {
    return PASS();
  }
};

const testSchemaMetadataRecent: Test = ({$}) => {
  const inLastMonth = (time: number) => {
    return  (time > Date.now() - (30 * 24 * 60 * 60 * 1000)) && (time < Date.now());
  };
  const metadata = getSchemaMetadata($);
  const datePublished = metadata.datePublished;
  const dateModified = metadata.dateModified;
  if (!datePublished || !dateModified) {
    return FAIL(`datePublished or dateModified not found`);
  }
  const timePublished = Date.parse(datePublished);
  const timeModified = Date.parse(dateModified);
  if (isNaN(timePublished) || isNaN(timeModified)) {
    return FAIL(`couldn't parse datePublished [${datePublished}] or dateModified [${dateModified}]`);
  }
  if (timeModified < timePublished) {
    return FAIL(`dateModified [${dateModified}] is earlier than datePublished [${datePublished}]`);
  }
  if (inLastMonth(timePublished) && inLastMonth(timeModified)) {
    return PASS();
  } else {
    return WARN(`datePublished [${datePublished}] or dateModified [${dateModified}] is old or in the future`);
  }
};

const testAmpStory: Test = ({$}) => {
  if ($("body amp-story[standalone]").length === 1) {
    return PASS();
  } else {
    return FAIL(`couldn't find <amp-story standalone> component`);
  }
};

const testVideoSize: Test = (context) => {
  const {$} = context;
  return Promise.all($(`amp-video source[type="video/mp4"][src], amp-video[src]`).map(async (i, e) => {
    const url = absoluteUrl($(e).attr("src"), context.url);
    const length = await getContentLength(context, url!);
    return { url, length };
  }).get() as any as Array<Promise<{ url: string, length: number }>>).then((args) => { // TODO(stillers): switch to Map
    return args.reduce((a, v) => {
      a[v.url] = v.length;
      return a;
    }, {} as {[url: string]: number});
  }).then((videos) => {
    const large = Object.keys(videos).filter((v) => videos[v] > 4000000);
    if (large.length > 0) {
      return FAIL(`videos over 4MB: [${large.join(",")}]`);
    } else {
      return PASS();
    }
  });
};

/**
 * Adds `__amp_source_origin` query parameter to URL.
 *
 * @param url
 * @param sourceOrigin
 */
function addSourceOrigin(url: string, sourceOrigin: string) {
  const {parse, format} = require("url"); // use old API to work with node 6+
  const obj = parse(url, true);
  obj.query.__amp_source_origin = sourceOrigin;
  obj.search = require("querystring").stringify(obj.query);
  return format(obj);
}

function isJson(res: Response): Promise<Response> {
  const contentType = (() => {
    if (!res.headers) {
      return "";
    }
    const s = res.headers.get("content-type") || "";
    return s.toLowerCase().split(";")[0];
  })();
  if (contentType !== "application/json") {
    throw new Error(`expected content-type: [application/json]; actual: [${contentType}]`);
  }
  return res.text().then((text) => {
    try {
      JSON.parse(text);
    } catch (e) {
      throw new Error(`couldn't parse body as JSON: ${text.substring(0, 100)}`);
    }
    return res;
  });
}

function isStatusNotOk(res: Response) {
  if (!res.ok) {
    return res;
   } else {
     throw new Error(`expected status code: [1xx, 3xx, 4xx, 5xx], actual [${res.status}]`);
   }
}

function isStatusOk(res: Response) {
  if (res.ok) {
    return res;
   } else {
     throw new Error(`expected status code: [2xx], actual [${res.status}]`);
   }
}

function isAccessControlHeaders(origin: string, sourceOrigin: string): (res: Response) => Response {
  return (res) => {
    const h1 = res.headers.get("access-control-allow-origin") || "";
    if ((h1 !== origin) && (h1 !== "*")) {
      throw new Error(
        `access-control-allow-origin header is [${h1}], expected [${origin}]`,
      );
    }
    // The AMP docs specify that the AMP-Access-Control-Allow-Source-Origin and
    // Access-Control-Expose-Headers headers must be returned, but this is not
    // in true: the runtime does check this header, but only if the
    // requireAmpResponseSourceOrigin flag is true, and amp-story sets this to
    // false.
    //
    // https://www.ampproject.org/docs/fundamentals/amp-cors-requests#ensuring-secure-responses
    /*
    const h2 = res.headers.get('amp-access-control-allow-source-origin') || '';
    if (h2 !== sourceOrigin) throw new Error(
      `amp-access-control-allow-source-origin header is [${h2}], expected [${sourceOrigin}]`
    );
    const h3 = res.headers.get('access-control-expose-headers') || '';
    if (h3 !== 'AMP-Access-Control-Allow-Source-Origin') throw new Error(
      `access-control-expose-headers is [${h3}], expected [AMP-Access-Control-Allow-Source-Origin]`
    );
    */
    return res;
  };
}

function buildSourceOrigin(url: string) {
  const {parse} = require("url"); // use old API to work with node 6+
  const obj = parse(url, true);
  return `${obj.protocol}//${obj.host}`;
}

function canXhrSameOrigin(context: Context, xhrUrl: string) {
  xhrUrl = absoluteUrl(xhrUrl, context.url)!;
  const sourceOrigin = buildSourceOrigin(context.url);

  const headers = Object.assign(
    {},
    {"amp-same-origin": "true"},
    context.headers
  );

  const curl = fetchToCurl(addSourceOrigin(xhrUrl, sourceOrigin), { headers });

  return fetch(addSourceOrigin(xhrUrl, sourceOrigin), {headers})
    .then(isStatusOk)
    .then(isJson)
    .then(PASS, (e: Error) => FAIL(`can't XHR [${xhrUrl}]: ${e.message} [debug: ${curl}]`));
}

async function canXhrCache(context: Context, xhrUrl: string, cacheSuffix: string) {
  const sourceOrigin = buildSourceOrigin(context.url);
  const url = await createCacheUrl(cacheSuffix, context.url);
  const {parse} = require("url"); // use old API to work with node 6+
  const obj = parse(url);
  const origin = `${obj.protocol}//${obj.host}`;

  const headers = Object.assign(
    {},
    {origin},
    context.headers
  );

  const curl = fetchToCurl(addSourceOrigin(xhrUrl, sourceOrigin), { headers });

  return fetch(addSourceOrigin(xhrUrl, sourceOrigin), {headers})
    .then(isStatusOk)
    .then(isAccessControlHeaders(origin, sourceOrigin))
    .then(isJson)
    .then(PASS, (e) => FAIL(`can't XHR [${xhrUrl}]: ${e.message} [debug: ${curl}]`));
}

const testBookendSameOrigin: Test = (context) => {
  const {$, url} = context;
  const s1 = $("amp-story amp-story-bookend").attr("src");
  const s2 = $("amp-story").attr("bookend-config-src");
  const bookendSrc = s1 || s2;
  if (!bookendSrc) { return WARN("amp-story-bookend missing"); }
  const bookendUrl = absoluteUrl(bookendSrc, url);

  return canXhrSameOrigin(context, bookendUrl!);
};

const testBookendCache: Test = (context) => {
  const {$, url} = context;
  const s1 = $("amp-story amp-story-bookend").attr("src");
  const s2 = $("amp-story").attr("bookend-config-src");
  const bookendSrc = s1 || s2;
  if (!bookendSrc) { return WARN("amp-story-bookend missing"); }
  const bookendUrl = absoluteUrl(bookendSrc, url);

  return canXhrCache(context, bookendUrl!, "cdn.ampproject.org");
};

const testVideoSource: Test = ({$}) => {
  if ($("amp-video[src]").length > 0) {
    return FAIL("<amp-video src> used instead of <amp-video><source/></amp-video>");
  } else {
    return PASS();
  }
};

const testAmpStoryV1: Test = ({$}) => {
  const isV1 = $("script[src='https://cdn.ampproject.org/v0/amp-story-1.0.js']").length > 0;
  return isV1 ? PASS() : WARN("amp-story-1.0.js not used (probably 0.1?)");
};

const testAmpStoryV1Metadata: Test = ({$}) => {
  const isV1 = $("script[src='https://cdn.ampproject.org/v0/amp-story-1.0.js']").length > 0;
  if (!isV1) { return PASS(); }
  const attr: string[] = [ "title", "publisher", "publisher-logo-src", "poster-portrait-src" ]
    .map(a => $(`amp-story[${a}]`).length > 0 ? false : a)
    .filter(Boolean) as string[];
  if (attr.length > 0) {
    return WARN(`<amp-story> is missing attribute(s) that will soon be mandatory: [${attr.join(", ")}]`);
  } else {
    return PASS();
  }
};

const testMetaCharsetFirst: Test = ({$}) => {
  const firstChild = $("head *:first-child");
  const charset = firstChild.attr("charset");
  return !charset ? FAIL(`<meta charset> not the first <meta> tag`) : PASS();
};

const testRuntimePreloaded: Test = ({$}) => {
  const attr = [
    "href='https://cdn.ampproject.org/v0.js'",
    "rel='preload'",
    "as='script'"
  ].map(s => `[${s}]`).join("");
  const isPreloaded = $(`link${attr}`).length > 0;
  return isPreloaded ?
    PASS() : WARN("<link href=https://cdn.ampproject.org/v0.js rel=preload> is missing");
};

const testMostlyText: Test = ({$}) => {
  const text = $("amp-story").text();
  if (text.length > 100) {
    return PASS();
  } else {
    return WARN(`minimal text in the story [${text}]`);
  }
};

const testThumbnails: TestList = async (context) => {
  const $ = context.$;
  async function isSquare(url: string|undefined) {
    if (!url) { return false; }
    const {width, height} = await getImageSize(context, absoluteUrl(url, context.url)!);
    return width === height;
  }
  async function isPortrait(url: string|undefined) {
    if (!url) { return false; }
    const {width, height} = await getImageSize(context, absoluteUrl(url, context.url)!);
    return (width > (0.74 * height)) && (width < (0.76 * height));
  }
  async function isLandscape(url: string|undefined) {
    if (!url) { return false; }
    const {width, height} = await getImageSize(context, absoluteUrl(url, context.url)!);
    return (height > (0.74 * width)) && (height < (0.76 * width));
  }
  const inlineMetadata = getInlineMetadata($);

  const res: Array<Promise<Message>> = [];

  res.push((() => {
    const k = "publisher-logo-src";
    const v = inlineMetadata[k];
    return isSquare(v).then(
      r => r ? PASS() : FAIL(`[${k}] (${v}) is missing or not square (1:1)`),
      e => FAIL(`[${k}] (${v}) status not 200`)
    );
  })());

  res.push((() => {
    const k = "poster-portrait-src";
    const v = inlineMetadata[k];
    return isPortrait(v).then(
      r => r ? PASS() : FAIL(`[${k}] (${v}) is missing or not portrait (3:4)`),
      e => FAIL(`[${k}] (${v}) status not 200`)
    );
  })());

  (() => {
    const k = "poster-square-src";
    const v = inlineMetadata[k];
    if (v) {
      res.push(isSquare(v).then(
        r => r ? PASS() : FAIL(`[${k}] (${v}) is not square (1x1)`),
        e => FAIL(`[${k}] (${v}) status not 200`)
      ));
    }
  })();

  (() => {
    const k = "poster-landscape-src";
    const v = inlineMetadata[k];
    if (v) {
      res.push(isLandscape(v).then(
        r => r ? PASS() : FAIL(`[${k}] (${v}) is not landscape (4:3)`),
        e => FAIL(`[${k}] (${v}) status not 200`)
      ));
    }
  })();

  return (await Promise.all(res)).filter(notPass);
};

const testSingleAmpImg = (
    context: Context,
    { src, expectedWidth, expectedHeight }: { src: string, expectedWidth: number, expectedHeight: number }
  ): Promise<Message> => {
  const success = ({height, width}: {height: number, width: number}): Promise<Message> => {
    const actualHeight = height;
    const actualWidth = width;
    const actualRatio = Math.floor(actualWidth * 100 / actualHeight) / 100;
    const expectedRatio = Math.floor(expectedWidth * 100 / expectedHeight) / 100;
    if (Math.abs(actualRatio - expectedRatio) > 0.015) {
      const actualString = `${actualWidth}/${actualHeight} = ${actualRatio}`;
      const expectedString = `${expectedWidth}/${expectedHeight} = ${expectedRatio}`;
      return FAIL(`[${src}]: actual ratio [${actualString}] does not match specified [${expectedString}]`);
    }
    const actualVolume = actualWidth * actualHeight;
    const expectedVolume = expectedWidth * expectedHeight;
    if (expectedVolume < (0.25 * actualVolume)) {
      const actualString = `${actualWidth}x${actualHeight}`;
      const expectedString = `${expectedWidth}x${expectedHeight}`;
      return WARN(`[${src}]: actual dimensions [${actualString}] are much larger than specified [${expectedString}]`);
    }
    if (expectedVolume > (1.5 * actualVolume)) {
      const actualString = `${actualWidth}x${actualHeight}`;
      const expectedString = `${expectedWidth}x${expectedHeight}`;
      return WARN(`[${src}]: actual dimensions [${actualString}] are much smaller than specified [${expectedString}]`);
    }
    return PASS();
  };
  const fail = (e: {statusCode: number}) => {
    if (e.statusCode === undefined) {
      return FAIL(`[${src}] ${JSON.stringify(e)}`);
    } else {
      return FAIL(`[${src}] returned status ${e.statusCode}`);
    }
  };
  return getImageSize(context, absoluteUrl(src, context.url)!).then(success, fail);

};

const testAmpImg: TestList = async (context) => {
  const $ = context.$;

  return (await Promise.all($("amp-img").map((_, e) => {
    const src = $(e).attr("src");
    const expectedHeight = parseInt($(e).attr("height"), 10);
    const expectedWidth = parseInt($(e).attr("width"), 10);
    return testSingleAmpImg(context, { src, expectedHeight, expectedWidth });
  }).get() as any as Array<Promise<Message>>)).filter(notPass);
};

const testCorsSameOrigin: TestList = async (context) => {
  const corsEndpoints = getCorsEndpoints(context.$);
  return (await Promise.all(corsEndpoints.map(s => canXhrSameOrigin(context, s)))).filter(notPass);
};

const testCorsCache: TestList = async (context) => {
  // Cartesian product from https://stackoverflow.com/a/43053803/11543
  const cartesian = (a: any, b: any) => [].concat(...a.map((d: any) => b.map((e: any) => [].concat(d, e))));
  const corsEndpoints = getCorsEndpoints(context.$);
  const caches = (require("./caches.json").caches as Array<{ cacheDomain: string }>).map(c => c.cacheDomain);
  const product = cartesian(corsEndpoints, caches);
  return (await Promise.all(
    product.map(([xhrUrl, cacheSuffix]) => canXhrCache(context, xhrUrl, cacheSuffix))
  )).filter(notPass);
};

const testAll = async (context: Context): Promise<{[key: string]: Message}> => {
  const tests = [
    testValidity,
    testCanonical,
    testAmpStory,
    testAmpStoryV1,
    testAmpStoryV1Metadata,
    testSchemaMetadataRecent,
    testSchemaMetadataType,
    testBookendSameOrigin,
    testBookendCache,
    testVideoSource,
    testVideoSize,
    testMostlyText,
    testRuntimePreloaded,
    testThumbnails,
    testMetaCharsetFirst,
    testAmpImg,
    testCorsSameOrigin,
    testCorsCache,
  ];
  const res = await Promise.all(tests.map(async (testFn) => {
    const v = await testFn(context);
    return [
      testFn.name.substring("test".length).toLowerCase(), // key
      v, // value
    ];
  })) as Array<[string, Message]>; // not sure why this cast is necessary, but...
  return res.reduce((a: {[key: string]: Message}, kv: [string, Message]) => {
    a[kv[0]] = kv[1];
    return a;
  }, {});
};

export {
  testAll,
  testAmpStory,
  testAmpStoryV1,
  testAmpStoryV1Metadata,
  testBookendCache,
  testBookendSameOrigin,
  testCanonical,
  testSchemaMetadataType,
  testSchemaMetadataRecent,
  testMostlyText,
  testValidity,
  testVideoSize,
  testVideoSource,
  testMetaCharsetFirst,
  testRuntimePreloaded,
  testThumbnails,
  testAmpImg,
  testCorsSameOrigin,
  testCorsCache,
  fetchToCurl,
  // "private" functions get prefixed
  getBody as _getBody,
  getSchemaMetadata as _getSchemaMetadata,
  getInlineMetadata as _getInlineMetadata,
  getImageSize as _getImageSize,
  getCorsEndpoints as _getCorsEndpoints,
};

if (require.main === module) { // invoked directly?

  if (process.argv.length <= 2) {
    console.error(`usage: ${basename(process.argv[0])} ${basename(process.argv[1])} URL|copy_as_cURL`);
    process.exit(1);
  }

  const url = process.argv[2] === "-" ? "-" : process.argv.filter(s => s.match(/^http/))[0];

  function seq(first: number, last: number): number[] {
    if (first < last) {
      return [first].concat(seq(first + 1, last));
    } else if (first > last) {
      return [last].concat(seq(first, last - 1));
    } else {
      return [first];
    }
  }

  const headers = seq(2, process.argv.length - 1)
    .filter(n => process.argv[n] === "-H")
    .map(n => process.argv[n + 1])
    .map(s => {
      const [h, ...v] = s.split(": ");
      return [h, v.join("")];
    })
    .reduce((a: {[key: string]: any}, kv) => {
      a[kv[0]] = kv[1];
      return a;
    }, {});

  // console.log({url, headers});

  const body = (() => {
    if (url === "-") {
      return Promise.resolve(readFileSync("/dev/stdin").toString());
    } else {
      return fetch(url, { headers }).then(
        r => r.ok ? r.text() : Promise.reject(`couldn't load [${url}]: ${r.statusText}`)
      );
    }
  })();

  body
    .then(b => cheerio.load(b))
    .then($ => testAll({$, headers, url}))
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .then(() => process.exit(0))
    .catch((e) => console.error(`error: ${e}`));

}
