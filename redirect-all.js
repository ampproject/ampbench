"use strict";

const http = require("http");

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
  res.statusCode = 301;
  res.setHeader('Location', 'https://github.com/ampproject/ampbench#status');
  res.setHeader('Content-type', 'text/plain');
  res.end('See https://github.com/ampproject/ampbench#status');
});

server.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});