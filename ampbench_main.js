// Copyright 2015-2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

'use strict';

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// MAIN: service
//

const routes = require('./ampbench_routes.js');

if (module === require.main) {
    const server = routes.app.listen(process.env.PORT || 8080, function () {
        let __server = routes.init_server(server);
        var host = __server.host;
        var port = __server.port;
        console.log(routes.version_msg('service started on host [' + host + ':' + port + ']'));
    });
    server.timeout = 20000; // 20 secs
}

// - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
