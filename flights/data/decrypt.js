'use strict';

// Taken from https://uber.github.io/deck.gl/workers/flight-path-data-decoder.js

var FLUSH_LIMIT = 20000;
var result = [];
var index = 0;
var count = 0;

function onmessage(e) {
  var lines = e.split('\n');

  lines.forEach(function(line) {
    if (!line) {
      return;
    }

    var parts = line.split('\t');
    var coords0 = parts[2].split('\x01').map(function(str) {
      return decodePolyline(str, 5);
    });
    var coords1 = parts[3].split('\x01').map(function(str) {
      return decodePolyline(str, 1);
    });

    coords0.forEach(function(lineStr, i) {
      for (var j = 1; j < lineStr.length; j++) {
        var prevPt0 = coords0[i][j - 1],
          prevPt1 = coords1[i][j - 1],
          currPt0 = coords0[i][j],
          currPt1 = coords1[i][j];

        result.push({
          name: parts[0],
          country: parts[1],
          start: [prevPt0[0], prevPt0[1], prevPt1[0]],
          end: [currPt0[0], currPt0[1], currPt1[0]],
        });
        count++;
      }
    });

    if (result.length >= FLUSH_LIMIT) {
      flush();
    }
  });

  var jsonse = JSON.stringify(result);
  var blob = new Blob([jsonse], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  console.log(url);

  var a = document.createElement('a');
  a.href = url;
  a.download = 'data.json';
  a.textContent = 'Download data.json';

  document.body.appendChild(a);

  // if (e.data.event === 'load') {
  //   flush();
  //   postMessage({ action: 'end' });
  // }
}

fetch(
  'https://raw.githubusercontent.com/uber-common/deck.gl-data/master/website/flight-path-data.txt'
)
  .then(res => res.text())
  .then(text => {
    onmessage(text);
  });

function flush() {
  // postMessage({
  //   action: 'add',
  //   data: result,
  //   meta: { count: count },
  // });
  // result = [];
}
