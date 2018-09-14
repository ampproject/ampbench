const FIXTURES = "network";

import { existsSync } from "fs";

import * as cheerio from "cheerio";
import * as debug from "debug";
import { diffJson as diff } from "diff";
import { back as nockBack } from "nock";
import { default as fetch } from "node-fetch";

import { _getBody as getBody } from "..";
import { _getSchemaMetadata as getSchemaMetadata } from "..";
import { _getInlineMetadata as getInlineMetadata } from "..";
import { _getImageSize as getImageSize } from "..";
import * as linter from "..";

import throat = require("throat");

const PASS = linter.PASS();

const log = debug("linter");

nockBack.fixtures = `${__dirname}/${FIXTURES}`;

// Need to throttle to one run at a time because nock() works by monkey patching
// the (global) http.* object, which means it can't run in parallel.
const withFixture = throat(1,
  async <T>(fixtureName: string, fn: () => Promise<T>): Promise<T> => {
    const fixturePath = `${fixtureName}.json`;
    if (existsSync(`${nockBack.fixtures}/${fixturePath}`)) {
      log(`nocking HTTP requests with fixture [${fixturePath}]`);
      nockBack.setMode("lockdown");
      const { nockDone } = await nockBack(fixturePath);
      const res = await fn();
      nockDone();
      return res;
    } else {
      log(`recording HTTP requests to fixture [${fixturePath}] ...`);
      nockBack.setMode("record");
      const { nockDone } = await nockBack(fixturePath);
      const res = await fn();
      return new Promise<T>((resolve) => {
        setTimeout(() => { // wait for probe-image-size's aborts to settle
          nockDone();
          log(`... created fixture [${fixturePath}]`);
          resolve(res);
        }, 2000);
      });
    }
  }
) as <T>(fixtureName: string, fn: () => Promise<T>) => Promise<T>;

async function assertEqual<T extends object>(
  testName: string,
  actual: T|Promise<T>,
  expected: T|Promise<T>
) {
  COUNT++;
  const res = diff(
    await Promise.resolve(expected),
    await Promise.resolve(actual)
  );
  if (res && res.length === 1) {
    console.log(`ok ${COUNT} - ${testName}`);
  } else {
    const s = JSON.stringify(await Promise.resolve(actual));
    console.log(`not ok ${COUNT} - ${testName} actual: ${s}`);
  }
  return res;
}

async function assertNotEqual<T extends object>(
  testName: string,
  actual: T|Promise<T>,
  expected: T|Promise<T>
) {
  COUNT++;
  const res = diff(
    await Promise.resolve(expected),
    await Promise.resolve(actual)
  );
  if (res && res.length === 1) {
    const s = JSON.stringify(await Promise.resolve(actual));
    console.log(`not ok ${COUNT} - ${testName} actual: ${s}`);
  } else {
    console.log(`ok ${COUNT} - ${testName}`);
  }
  return res;
}

async function assertMatch<T extends object>(
  testName: string,
  actual: T|Promise<T>,
  expected: string
) {
  COUNT++;
  const s = JSON.stringify(await Promise.resolve(actual));
  if (s.match(expected)) {
    console.log(`ok ${COUNT} - ${testName}`);
  } else {
    console.log(`not ok ${COUNT} - ${testName} actual: ${s}`);
  }
}

async function assertFn<T extends object>(
  testName: string,
  actual: T|Promise<T>,
  expectedFn: (expected: T) => string,
) {
  COUNT++;
  const res = expectedFn(await actual);
  if (!res) {
    console.log(`ok ${COUNT} - ${testName}`);
  } else {
    console.log(`not ok ${COUNT} - ${testName} [${res}]`);
  }
  return res;
}

async function runTest<T>(fn: linter.Test, url: string) {
  const res = await fetch(url);
  const body = await res.text();
  const $ = cheerio.load(body);
  const context = {
    $,
    headers: {},
    url
  };
  return Promise.resolve(fn(context));
}

async function runTestList<T>(fn: linter.TestList, url: string) {
  const res = await fetch(url);
  const body = await res.text();
  const $ = cheerio.load(body);
  const context = {
    $,
    headers: {},
    url
  };
  return Promise.resolve(fn(context));
}

async function runCheerioFn<T>(fn: ($: CheerioStatic, url?: string) => T|Promise<T>, url: string) {
  const res = await fetch(url);
  const body = await res.text();
  const $ = cheerio.load(body);
  return Promise.resolve(fn($, url));
}

async function runUrlFn<T>(fn: (url: string) => T, url: string) {
  return Promise.resolve(fn(url));
}

let COUNT = 0;

withFixture("getschemametadata", () => assertEqual(
  "getSchemaMetadata",
  runCheerioFn(
    getSchemaMetadata,
    "https://ampbyexample.com/stories/introduction/amp_story_hello_world/preview/embed/"
  ),
  {
    "@context": "http://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "item": {
          "@id": "https://ampbyexample.com/#/stories#stories/introduction",
          "name": "Introduction",
        },
        "position": 1,
      },
      {
        "@type": "ListItem",
        "item": {
          "@id":
            "https://ampbyexample.com/stories/introduction/amp_story_hello_world/",
          "name": " AMP Story Hello World",
        },
        "position": 2,
      }
    ]
  },
));

withFixture("getinlinemetadata", () => assertEqual(
  "getInlineMetadata",
  runCheerioFn(
    getInlineMetadata,
    "https://ithinkihaveacat.github.io/hello-world-amp-story/"
  ),
  {
    "poster-portrait-src":
      [
        "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/",
        "Cantilever_bridge_human_model.jpg/",
        "627px-Cantilever_bridge_human_model.jpg"
      ].join(""),
    "publisher": "Michael Stillwell",
    "publisher-logo-src":
      "https://s.gravatar.com/avatar/3928085cafc1e496fb3d990a9959f233?s=150",
    "title": "Hello, Ken Burns",
    },
));

withFixture("thumbnails1", () => assertEqual(
  "testThumbnails - correctly sized",
  runTest(
    linter.testThumbnails,
    "https://ampbyexample.com/stories/introduction/amp_story_hello_world/preview/embed/"
  ),
  PASS
));

withFixture("thumbnails2", () => assertMatch(
  "testThumbnails - publisher-logo-src missing",
  runTest(
    linter.testThumbnails,
    "https://regular-biology.glitch.me/"
  ),
  "publisher-logo-src"
));

withFixture("testvalidity1", () => assertEqual(
  "testValidity - valid",
  runTest(
    linter.testValidity,
    "https://www.ampproject.org/"
  ),
  PASS
));

withFixture("testvalidity2", async () => assertNotEqual(
  "testValidity - not valid",
  runTest(
    linter.testValidity,
    "https://precious-sturgeon.glitch.me/"
  ),
  PASS
));

withFixture("testcanonical1", () => assertEqual(
  "testCanonical - canonical",
  runTest(
    linter.testCanonical,
    "https://regular-biology.glitch.me/"
  ),
  PASS
));

withFixture("testcanonical2", () => assertMatch(
  "testCanonical - not canonical",
  runTest(
    linter.testCanonical,
    "https://regular-biology.glitch.me/"
  ),
  "https://regular-biology.glitch.me/"
));

withFixture("testcanonical3", () => assertEqual(
  "testCanonical - relative",
  runTest(
    linter.testCanonical,
    "https://regular-biology.glitch.me/"
  ),
  PASS
));

withFixture("testvideosize1", () => assertEqual(
  "testVideoSize - too big",
  runTest(
    linter.testVideoSize,
    "https://regular-biology.glitch.me/"
  ),
  {
    message: "videos over 4MB: [https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4]",
    status: "FAIL"
  }
));

withFixture("testvideosize2", () => assertEqual(
  "testVideoSize - good size #1",
  runTest(
    linter.testVideoSize,
    "https://regular-biology.glitch.me/"
  ),
  PASS
));

withFixture("testvideosize3", () => assertEqual(
  "testVideoSize - good size #2",
  runTest(
    linter.testVideoSize,
    "https://ampbyexample.com/stories/features/media/preview/embed/"
  ),
  PASS
));

withFixture("bookendsameorigin1", () => assertEqual(
  "testBookendSameOrigin - configured correctly",
  runTest(
    linter.testBookendSameOrigin,
    "https://ampbyexample.com/stories/introduction/amp_story_hello_world/preview/embed/"
  ),
  PASS
));

withFixture("bookendsameorigin2", () => assertMatch(
  "testBookendSameOrigin - bookend not application/json",
  runTest(
    linter.testBookendSameOrigin,
    "https://ampbyexample.com/stories/introduction/amp_story_hello_world/preview/embed/"
  ),
  "application/json"
));

withFixture("bookendsameorigin3", () => assertMatch(
  "testBookendSameOrigin - bookend not JSON",
  runTest(
    linter.testBookendSameOrigin,
    "https://ampbyexample.com/stories/introduction/amp_story_hello_world/preview/embed/"
  ),
  "JSON"
));

withFixture("bookendsameorgin4", () => assertEqual(
  "testBookendSameOrigin - v0 AMP Story - configured correctly",
  runTest(
    linter.testBookendSameOrigin,
    "https://ampbyexample.com/stories/introduction/amp_story_hello_world/preview/embed/"
  ),
  PASS
));

withFixture("bookendcache1", () => assertEqual(
  "testBookendCache - configured correctly",
  runTest(
    linter.testBookendCache,
    "https://ampbyexample.com/stories/introduction/amp_story_hello_world/preview/embed/"
  ),
  PASS
));

withFixture("bookendcache2", () => assertMatch(
  "testBookendCache - incorrect headers",
  runTest(
    linter.testBookendCache,
    "https://ampbyexample.com/stories/introduction/amp_story_hello_world/preview/embed/"
  ),
  "access-control-allow-origin"
));

withFixture("ampstoryv1metadata1", () => assertEqual(
  "testAmpStoryV1Metadata - valid metadata",
  runTest(
    linter.testAmpStoryV1Metadata,
    "https://ithinkihaveacat.github.io/hello-world-amp-story/"
  ),
  PASS
));

withFixture("ampstoryv1metadata2", () => assertMatch(
  "testAmpStoryV1Metadata - invalid metadata",
  runTest(
    linter.testAmpStoryV1Metadata,
    "https://ithinkihaveacat-hello-world-amp-story-7.glitch.me/"
  ),
  "publisher-logo-src"
));

withFixture("ampimg1", () => assertFn<linter.Message[]>(
  "testAmpImg - height/width are incorrect #1",
  runTestList(
    linter.testAmpImg,
    "https://ampbyexample.com/components/amp-img/"
  ),
  (res) => {
    if (res.length !== 3) {
      return "expected 3 failures";
    }
    const message = res[1].message;
    if (typeof(message) !== "string" || !message.match("does-not-exist")) {
      return "does-not-exist.jpg should be a 404";
    }
    return "";
  }
));

withFixture("ampimg2", () => assertFn<linter.Message[]>(
  "testAmpImg - height/width are incorrect #2",
  runTestList(
    linter.testAmpImg,
    "https://www.ampproject.org/docs/reference/components/amp-story"
  ),
  (res) => {
    if (res.length !== 6) {
      return "expected 6 failures";
    }
    const message1 = res[0].message;
    if (typeof(message1) !== "string" || !message1.match("amp-story-tag-hierarchy")) {
      return "amp-story-tag-hierarchy.png is wrong ratio";
    }
    const message2 = res[5].message;
    if (typeof(message2) !== "string" || !message2.match("layers-layer-3")) {
      return "layers-layer-3.jpg is too big";
    }
    return "";
  }
));

withFixture("ampimg3", () => assertFn<linter.Message[]>(
  "testAmpImg - height/width are correct",
  runTestList(
    linter.testAmpImg,
    "https://ampbyexample.com/introduction/hello_world/"
  ),
  (res) => {
    return res.length === 0 ? "" : `expected 0 failures, got ${JSON.stringify(res)}`;
  }
));

console.log("# dummy"); // https://github.com/scottcorgan/tap-spec/issues/63 (sigh)
console.log(`1..23`);
