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
require("../readiness-tool/popup");
describe('isSupported(key)', function () {
  it('should return true when the key given is in the supported list', function () {
    expect(self.popups.isSupported('Adhese')).to.be.true;
  });
  it('should return false when the key given is in NOT in the supported list', function () {
    expect(self.popups.isSupported('alannalytics')).to.be.false;
  });
});
describe('addToDict(tempScript, htmlString, foundThis, key, category)', function () {
  var htmlString = "candycanes";
  var foundThis = {
    'supported': {
      'ads': []
      , 'analytics': []
    }
    , 'notSupported': {
      'ads': []
      , 'analytics': []
    }
  };
      
  it('should push analytics to the analytics array', function () {
    var tempScript = "candy";
    var category = "10";
    const key = "Candy";
    self.popups.addToDict(tempScript, htmlString, foundThis, key, category);
    expect(foundThis.supported.analytics).to.equal(['Candy']);
    var tempScript = "peppermint";
    expect(foundThis.notSupported.analytics).to.equal(['Candy']);
  });
  
  it('should return false when the key given is in NOT in the supported list', function () {
    expect(self.popups.isSupported('alannalytics')).to.be.false;
  });
});