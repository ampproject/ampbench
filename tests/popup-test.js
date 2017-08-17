/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS-IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
const popup = require('../readiness-tool/popup');

const vendors = require('../readiness-tool/vendors');

const isJSON = require('is-valid-json');

const Validator = require('jsonschema').Validator;

const v = new Validator();

describe('isSupported(key)', function () {

  it('should return true when the key given is in the supported list', function () {
    expect(popup.isSupported('Adhese')).to.be.true;
  });

  it('should return false when the key given is in NOT in the supported list', function () {
    expect(popup.isSupported('alannalytics')).to.be.false;
  });
});

describe('addToDict(tempScript, htmlString, foundThis, key, category)', function () {

  let htmlString;
  let foundThis;

  beforeEach(() => {
    htmlString = 'candycanes';
    foundThis = {
      'supported': {
        'ads': [],
        'analytics': []
      },
      'notSupported': {
        'ads': [],
        'analytics': []
      }
    };
  });

  it('should push analytics to the analytics array', function () {
    let tempScript = 'candy';
    const category = 'Analytics';
    let key = 'comScore';
    popup.addToDict(tempScript, htmlString, foundThis, key, category);
    expect(foundThis.supported.analytics).to.include('comScore');
    tempScript = 'peppermint';
    expect(foundThis.supported.analytics).to.not.include('Swoop');
    expect(foundThis.notSupported.analytics).to.not.include('Swoop');
  });

  it('should push ads to the ads array', function () {
    let tempScript = 'candy';
    const category = 'Ads';
    let key = 'comScore';
    popup.addToDict(tempScript, htmlString, foundThis, key, category);
    expect(foundThis.supported.ads).to.include('comScore');
    tempScript = 'peppermint';
    expect(foundThis.supported.ads).to.not.include('Swoop');
    expect(foundThis.notSupported.ads).to.not.include('Swoop');
  });
});


describe('vendors.json should be valid json', function () {

  it('should be a valid file', function () {
    
    const vendorSchema = {
      'id': '/SimpleVendors',
      'type': 'object',
      'properties': {
        'regex': {
          'type': 'array',
          'items': {
            'type': 'string'
          }
        },
        'tooltip': {
          'type': 'string'
        },
        'category': {
          'type': 'string'
        },
      },
      'required': ['category', 'regex']
    };

    v.addSchema(vendorSchema, '/SimpleVendors');
    const result = v.validate(vendors.vendor, vendorSchema);

    expect(isJSON(vendors)).to.be.true;
    expect(result.valid).to.be.true;
  });
});
