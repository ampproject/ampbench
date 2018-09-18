/**
 * Copyright 2018 Google Inc. All Rights Reserved.
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
 * limitations under the License.
 */

import * as fs from "fs";
import {URL} from "url";

import * as cheerio from "cheerio";
import * as debug from "debug";
import express = require("express");
import {compile, registerHelper} from "handlebars";
import {default as fetch, Request, RequestInit, Response} from "node-fetch";

import ampCors from "./amp-cors.js";
import * as validate from "./amp-story-linter";

const log = debug("linter");

const UA_GOOGLEBOT_MOBILE = [
  "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36",
  "(KHTML, like Gecko) Chrome/41.0.2272.96 Mobile Safari/537.36",
  "(compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
].join(" ");

const ORIGIN = process.env.ORIGIN || `https://${process.env.PROJECT_ID}.appspot.com`;

const PORT = (() => {
  if (process.env.NODE_ENV === "production") {
    return 8080;
  } else {
    return (new URL(ORIGIN)).port || 80;
  }
})();

const INDEX = (() => {
  registerHelper("escape", (name) => {
    return `{{${name}}}`;
  });
  const template = compile(fs.readFileSync("index.hbs").toString());
  return template({
    canonical: ORIGIN,
  });
})();

const app = express();

app.use((req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    res.setHeader("strict-transport-security", "max-age=31556926");
  }
  next();
});

app.use(ampCors(ORIGIN));

app.get("/", (req, res) => {
  res.status(200);
  res.setHeader("content-type", "text/html");
  // res.send(JSON.stringify(req.query));
  res.send(INDEX);
  res.end();
});

app.get("/lint", async (req, res, next) => {
  const url = req.query.url;
  if (!url) {
    res.status(400);
    res.setHeader("content-type", "application/json");
    res.send(JSON.stringify({
      message: "no [url] query string parameter provided",
      status: "error",
    }));
    res.end();
    return;
  }

  try {
    log({url});
    console.log({url});
    const r = await fetch(url, {
      headers: {
        "user-agent": UA_GOOGLEBOT_MOBILE,
      },
    });
    if (!r.ok) {
      res.status(200);
      res.setHeader("content-type", "application/json");
      res.send(JSON.stringify({
        message: `couldn't load [${url}]`,
        status: "error",
      }));
      res.end();
      r.text().then(console.error);
      return;
    }
    const $ = cheerio.load(await r.text());
    const context = { $, url, headers: {} };
    const data = await validate.testAll(context) as {[key: string]: validate.Message};
    res.status(200);
    res.setHeader("content-type", "text/json");
    const body = (() => {
      if (req.query.type === "summary") {
        return Object.keys(data).filter((k) => data[k].status !== "OKAY").join(",");
      } else {
        return JSON.stringify(data, undefined, 2);
      }
    })();
    res.send(body);
    res.end();
  } catch (e) {
    console.error(e);
    res.status(e.code === "ENOTFOUND" ? 400 : 500); // probably caller's fault if ENOTFOUND
    res.setHeader("content-type", "application/json");
    res.send(JSON.stringify({
      message: `couldn't load [${url}]`,
      status: "error",
    }));
    res.end();
  }
});

app.listen(PORT, () => {
  console.log(`App listening at ${ORIGIN}`);
  console.log("Press Ctrl+C to quit.");
});
