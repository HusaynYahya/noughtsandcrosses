/* ============================================================================
   Training: fit the weights to what the search decided.
   ----------------------------------------------------------------------------
   Every recorded position gives a target: the share of the search's playouts
   each legal move received, normalised to sum to one. The model turns its own
   scores into probabilities with a softmax over the same moves, and the
   weights are moved to make its probabilities look like the search's.

   The loss is cross-entropy, and for a softmax the gradient is the plainest
   thing in machine learning: for each move, (what the model said minus what
   the search said) times that move's features. Adam does the stepping, and a
   small ridge penalty keeps the weights from running away on features that
   hardly ever fire.

     node train/train.js <data.jsonl> <out.json> [epochs] [startWeights.json]
   ============================================================================ */
var fs = require("fs");
var lib = require("./lib.js");

var DATA = process.argv[2] || "train/data/gen.jsonl";
var OUT = process.argv[3] || "train/weights/gen-1.json";
var EPOCHS = +process.argv[4] || 12;
var START = process.argv[5];

var U = lib.engine(null);
var E = U.engine, F = U.features;
var N = F.COUNT;

var LR = 0.05, BETA1 = 0.9, BETA2 = 0.999, EPS = 1e-8, L2 = 1e-4;
var HOLDOUT = 0.1;

/* ---- read the games in, turning each position into feature rows --------- */
console.log("reading " + DATA);
var rows = [];
fs.readFileSync(DATA, "utf8").split("\n").forEach(function (line) {
  if (!line) return;
  var rec = JSON.parse(line);
  var s = E.unpack(rec.s);
  var total = rec.v.reduce(function (a, b) { return a + b; }, 0);
  if (!total || rec.m.length < 2) return;
  var feats = [], target = [];
  for (var i = 0; i < rec.m.length; i++) {
    var f = new Float64Array(N);
    F.describe(s, rec.m[i], f);
    feats.push(f);
    target.push(rec.v[i] / total);
  }
  rows.push({ f: feats, t: target });
});
console.log("  " + rows.length + " positions");

/* a tenth of them is kept back, so improvement is measured on games the
   fitting never saw */
for (var i = rows.length - 1; i > 0; i--) {
  var j = (Math.random() * (i + 1)) | 0;
  var tmp = rows[i]; rows[i] = rows[j]; rows[j] = tmp;
}
var cut = Math.max(1, Math.floor(rows.length * HOLDOUT));
var test = rows.slice(0, cut), train = rows.slice(cut);
console.log("  " + train.length + " to fit on, " + test.length + " held back");

/* ---- the model ---------------------------------------------------------- */
var w = new Float64Array(N);
if (START) {
  var prev = lib.readWeights(START).w;
  for (i = 0; i < N; i++) w[i] = prev[i];
} else {
  var shipped = U.weights.w;
  for (i = 0; i < N; i++) w[i] = shipped[i];
}

function probabilities(row, out) {
  var top = -Infinity, sum = 0, k, d;
  for (k = 0; k < row.f.length; k++) {
    var z = 0;
    for (d = 0; d < N; d++) z += w[d] * row.f[k][d];
    out[k] = z;
    if (z > top) top = z;
  }
  for (k = 0; k < row.f.length; k++) { out[k] = Math.exp(out[k] - top); sum += out[k]; }
  for (k = 0; k < row.f.length; k++) out[k] /= sum;
  return out;
}

function lossOf(set) {
  var loss = 0, hit = 0, p = [];
  set.forEach(function (row) {
    probabilities(row, p);
    var bestModel = 0, bestSearch = 0;
    for (var k = 0; k < row.t.length; k++) {
      if (row.t[k] > 0) loss -= row.t[k] * Math.log(Math.max(p[k], 1e-12));
      if (p[k] > p[bestModel]) bestModel = k;
      if (row.t[k] > row.t[bestSearch]) bestSearch = k;
    }
    if (bestModel === bestSearch) hit++;
  });
  return { loss: loss / set.length, agree: hit / set.length };
}

/* ---- Adam --------------------------------------------------------------- */
var m = new Float64Array(N), v = new Float64Array(N), step = 0;
var grad = new Float64Array(N), probs = [];
var BATCH = 64;

console.log("\nepoch   loss(fit)  loss(held)  agrees with the search");
var before = lossOf(test);
console.log("  0      " + lossOf(train).loss.toFixed(4) + "     " +
            before.loss.toFixed(4) + "      " + (before.agree * 100).toFixed(1) + "%");

for (var epoch = 1; epoch <= EPOCHS; epoch++) {
  for (i = train.length - 1; i > 0; i--) {
    j = (Math.random() * (i + 1)) | 0;
    tmp = train[i]; train[i] = train[j]; train[j] = tmp;
  }
  for (var start = 0; start < train.length; start += BATCH) {
    grad.fill(0);
    var batch = train.slice(start, start + BATCH);
    batch.forEach(function (row) {
      probabilities(row, probs);
      for (var k = 0; k < row.f.length; k++) {
        var diff = probs[k] - row.t[k];
        if (!diff) continue;
        var f = row.f[k];
        for (var d = 0; d < N; d++) grad[d] += diff * f[d];
      }
    });
    step++;
    var scale = 1 / batch.length;
    var c1 = 1 - Math.pow(BETA1, step), c2 = 1 - Math.pow(BETA2, step);
    for (var d = 0; d < N; d++) {
      var gr = grad[d] * scale + L2 * w[d];
      m[d] = BETA1 * m[d] + (1 - BETA1) * gr;
      v[d] = BETA2 * v[d] + (1 - BETA2) * gr * gr;
      w[d] -= LR * (m[d] / c1) / (Math.sqrt(v[d] / c2) + EPS);
    }
  }
  var a = lossOf(train), b = lossOf(test);
  console.log("  " + String(epoch).padEnd(6) + a.loss.toFixed(4) + "     " +
              b.loss.toFixed(4) + "      " + (b.agree * 100).toFixed(1) + "%");
}

var after = lossOf(test);
lib.writeWeights(OUT, {
  generation: null,
  trainedOn: rows.length,
  heldOutLossBefore: +before.loss.toFixed(4),
  heldOutLossAfter: +after.loss.toFixed(4),
  agreementBefore: +(before.agree * 100).toFixed(1),
  agreementAfter: +(after.agree * 100).toFixed(1),
  w: Array.from(w)
});
console.log("\nwrote " + OUT);
console.log("held-out loss " + before.loss.toFixed(4) + " -> " + after.loss.toFixed(4) +
            ", agreement " + (before.agree * 100).toFixed(1) + "% -> " + (after.agree * 100).toFixed(1) + "%");
F.names.forEach(function (name, k) {
  console.log("  " + name.padEnd(34) + w[k].toFixed(3));
});
