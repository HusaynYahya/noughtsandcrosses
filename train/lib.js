/* Shared plumbing for the training scripts: load the game, the features and a
   set of weights into a fresh sandbox, so several engines can be run side by
   side in one process. */
var fs = require("fs"), path = require("path");
var JS_DIR = path.join(__dirname, "..", "assets", "js");

function load(g, file) {
  new Function("globalThis", "window", fs.readFileSync(path.join(JS_DIR, file), "utf8"))(g, undefined);
}

/* weights: an array of numbers, or null for the file the site currently ships */
function engine(weights) {
  return engineFrom(path.join(JS_DIR, "ai.js"), weights);
}

/* The same, but with the search read from wherever you point it — so two
   versions of the search itself can be put against each other, not only two
   sets of weights. */
function engineFrom(aiFile, weights) {
  var g = {};
  load(g, "engine.js");
  load(g, "features.js");
  load(g, "weights.js");
  if (weights) g.UNC.weights = { generation: -1, w: weights.slice() };
  new Function("globalThis", "window", fs.readFileSync(aiFile, "utf8"))(g, undefined);
  return g.UNC;
}

function search(side, state, budget) {
  return new Promise(function (res) {
    side.ai.search(state, budget, res);
  });
}

function readWeights(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeWeights(file, obj) {
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
}

/* the file the site actually loads */
function publish(obj) {
  var out = path.join(JS_DIR, "weights.js");
  var body = fs.readFileSync(out, "utf8");
  var head = body.slice(0, body.indexOf("(function (root)"));
  fs.writeFileSync(out, head +
'(function (root) {\n' +
'  "use strict";\n' +
'  root.UNC = root.UNC || {};\n' +
'  root.UNC.weights = ' + JSON.stringify({
      generation: obj.generation,
      trainedOn: obj.trainedOn,
      note: obj.note,
      w: obj.w.map(function (x) { return Math.round(x * 10000) / 10000; })
    }, null, 2).replace(/\n/g, "\n  ") + ';\n' +
'})(typeof window !== "undefined" ? window : globalThis);\n');
}

module.exports = { engine: engine, engineFrom: engineFrom, search: search, readWeights: readWeights,
                   writeWeights: writeWeights, publish: publish, JS_DIR: JS_DIR };
