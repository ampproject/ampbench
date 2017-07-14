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

describe('doesRegexExist(regexString, htmlString)', function () {
    var htmlString = '<html><script src="https://ajax.googleapis.com/ajax/libs/angularjs/1.6.1/angular.min.js"></script></html>';
    
    it('should return true when the regular expression can be found within the context of the htmlString', function () {
        var pattern = new RegExp("angular.*.js");
        expect(self.popups.doesRegexExist(pattern, htmlString)).to.be.true;
    });
    it('should return false when the key given is in NOT in the supported list', function () {
        var pattern = new RegExp("angulars.*.js");
        expect(self.popups.doesRegexExist(pattern, htmlString)).to.be.false;
    });
});