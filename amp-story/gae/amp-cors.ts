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

import { NextFunction, Request, Response } from "express";

export default (serverOrigin: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.accepts("json")) {
      return next();
    }
    const sourceOrigin = req.query.__amp_source_origin;
    if (!sourceOrigin) {
      return next();
    }
    let origin;
    if (req.headers.origin) {
      origin = req.headers.origin;
    } else if (req.headers["amp-same-origin"] === "true") {
      origin = serverOrigin;
    } else {
      return next();
    }

    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Expose-Headers", [
      "AMP-Access-Control-Allow-Source-Origin",
    ]);
    res.setHeader("AMP-Access-Control-Allow-Source-Origin", sourceOrigin);
    next();
  };
};
