#!/usr/bin/env bash

npm test || exit

trap 'kill $(jobs -p)' EXIT

fetch() {
  echo "TESTING $1"
  res=$(curl -ksSo /dev/null -w "status:%{http_code} time:%{time_total} (%{size_download} bytes)" $1)
  if [[ $? -ne 0 ]]; then
    echo "ERROR $res"
    return
  fi
  if echo $res | grep -q "status:200" ; then
    echo "PASS $res"
  else
    echo "FAIL $res"
  fi
}

echo "STARTING AMPBENCH"

npm start > npm_start.log 2>&1 &

sleep 5 # wait for server to start

echo
echo "RUNNING TESTS"
echo

fetch 'http://jjlocalhost:8080/validate?url=http://www.bbc.com/news/amp/36884290'
fetch 'http://localhost:8080/validate?url=https://www.bbc.com/news/amp/36884290'
fetch 'http://localhost:8080/api2?url=https://www.bbc.com/news/amp/36884290'

kill $(jobs -p)

echo
echo "NPM LOG"
cat npm_start.log
