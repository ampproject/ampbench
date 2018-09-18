const FIXTURES = __dirname + "/local";

import {basename} from "path";

import * as cheerio from "cheerio";
import {diffJson as diff} from "diff";
import * as fs from "fs";

import * as linter from "../index";

async function run(prefix: string) {

  const match = prefix.match(/\/(.*)\-/);

  if (!match) {
    console.warn(`skipping ${prefix}`);
    return;
  }

  const name = basename(match[1]);

  if (!(name in linter)) {
    console.warn(`${name}() not found`);
    return;
  }

  const $ = (() => {
    try {
      return cheerio.load(fs.readFileSync(`${prefix}/source.html`).toString());
    } catch (e) {
      console.error(`error: can't read/parse ${prefix}/source.html, skipping ${prefix}`);
      return null;
    }
  })();

  const expected = (() => {
    try {
      return JSON.parse(fs.readFileSync(`${prefix}/expected.json`).toString());
    } catch (e) {
      console.error(`error: can't read/parse ${prefix}/expected.json, skipping ${prefix}`);
      return null;
    }
  })();

  if (!$ || !expected) { return; }

  const url = expected._url || "https://example.com/";

  const fn = (linter as any)[name] as linter.Test;
  const context = {
    $,
    headers: {},
    url
  };
  const actual = await fn(context);

  return diff(expected, actual);
}

let COUNT = 0;

if (process.argv.length === 3) {

  const prefix = process.argv[2];

  run(prefix).then(res => {
    if (!res) { return; }
    res.forEach(part => {
      const color = part.added ? "green" :
        part.removed ? "red" : "grey";
      process.stdout.write((part.value as any)[color]);
    });
    process.stdout.write("\n");
  });

} else {

  fs.readdirSync(FIXTURES).forEach(async d => {
    const count = ++COUNT;
    const prefix = `${FIXTURES}/${d}`;
    const res = await run(prefix);
    if (res && res.length === 1) {
      console.log(`ok ${count} - ${basename(prefix)}`);
    } else {
      console.log(
        `not ok ${count} - ${prefix} # more info: ${basename(process.argv[0])} ${basename(process.argv[1])} ${prefix}`,
      );
    }
  });

  console.log(`1..${COUNT}`);

}
