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


const loadJSON = (callback) => {
    let xobj = new XMLHttpRequest();
    xobj.overrideMimeType("application/json");
    xobj.open('GET', 'my_data.json', true);
    // Replace 'my_data' with the path to your file
    xobj.onreadystatechange = () => {
        if (xobj.readyState === 4 && xobj.status === "200") {
            // Required use of an anonymous callback 
            // as .open() will NOT return a value but simply returns undefined in asynchronous mode
            callback(xobj.responseText);
        }
    };
    xobj.send(null);
}


describe('vendors.json should be valid json', function () {
  
  beforeEach(() => {
    sinon.stub(window, 'fetch');
  });
  
  afterEach(() => {
    window.fetch.restore();
  });
  
  it('should be a valid file', function () {
    fetch('../readiness-tool/vendors')
      .then(function(response) {
        console.log('response', response);
        console.log('response text', response.text);

      }).catch(function(err) {
          // Error :(
      });
  });
});
