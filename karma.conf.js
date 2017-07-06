/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
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


module.exports = {

  files: ['tests/**/*.js'],

  frameworks: [
    'browserify',
    'chai',
    'mocha',
    'sinon-chai',
  ],

  preprocessors: {
    'src/**/*.js': ['browserify'],
    'tests/**/*.js': ['browserify'],
  },
  browserify: {
    watch: true,
    debug: true,
    transform: [ ['babelify', {presets: ["es2015"]}] ],
    bundleDelay: 900,
  },
  port: 9876,
  colors: true,
  logLevel: process.env.TRAVIS ? 'ERROR' : 'WARN',
  autoWatch: true,
  browsers: [
    process.env.TRAVIS ? 'Chrome_travis_ci' : 'Chrome_no_extensions',
  ],

  // Number of sauce tests to start in parallel
  concurrency: 6,

  customLaunchers: {
    /*eslint "google-camelcase/google-camelcase": 0*/
    Chrome_travis_ci: {
      base: 'Chrome',
      flags: ['--no-sandbox', '--disable-extensions'],
    },
    Chrome_no_extensions: {
      base: 'Chrome',
      // Dramatically speeds up iframe creation time.
      flags: ['--disable-extensions'],
    },
  },
};
