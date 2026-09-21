/* ============================================================================
   Learning what a position is worth
   ----------------------------------------------------------------------------
   The search stops each playout after a dozen moves and judges the position it
   lands in. That judgement was a count of boards, written by hand. This fits it
   to the engine's own games instead: play, write down a few positions from each
   game with how that game actually ended, and fit a line through them.

   The model is deliberately small — twelve signed counts, each also scaled by
   how far into the game it is, and an offset. It is asked at nearly every node
   of the search, so it has to be cheap; and a small model fitted to a lot of
   games beats a large one fitted to few.

     node train/value.js [games] [playouts] [workers]
   ============================================================================ */
var fs = require("fs"), path = require("path"), cp = require("child_process");
var lib = require("./lib.js");

var GAMES = +process.argv[2] || 2000;
var PLAYOUTS = +process.argv[3] || 200;
var WORKERS = +process.argv[4] || 4;
var TAKE = 6;                      /* positions kept from each game */
var EXPLORE = 10;                  /* plies chosen loosely, for variety */

var OUT = path.join(__dirname, "data", "value.jsonl");

/* ---- a worker: play games, write down positions and how they ended ------- */
if (process.env.UNC_VALUE_WORKER) {
  var g = lib.engine(null);
  var E = g.engine, AI = g.ai, V = g.value;
  var budget = { iterations: PLAYOUTS, millis: 600000, straight: true };
  var first = +process.argv[5], stride = +process.argv[6];
  var rows = [];

  for (var i = first; i < GAMES; i += stride) {
    var s = E.create(), seen = [], guard = 0;
    while (!s.over && guard++ < 90) {
      var tree = null;
      AI.search(s, budget, function (t) { tree = t; });
      var move = choose(tree, guard);
      if (move < 0 || !E.isLegal(s, move)) break;
      E.apply(s, move);
      if (!s.over) seen.push(Array.from(V.features(s)).concat([s.filled / 81]));
    }
    var out = s.winner === 0 ? 0.5 : (s.winner === E.X ? 1 : 0);
    /* a handful from across the game, not every position: neighbouring
       positions say nearly the same thing and would only count twice */
    for (var k = 0; k < TAKE && seen.length; k++) {
      var at = Math.floor((k + 0.5) / TAKE * seen.length);
      rows.push({ f: seen[at], y: out });
    }
    if (rows.length > 400) { process.send(rows); rows = []; }
  }
  process.send(rows);
  process.send({ done: true });
  return;

  function choose(tree, ply) {
    if (!tree || !tree.kids.length) return -1;
    if (ply > EXPLORE) { var top = AI.mostVisited(tree); return top ? top.move : -1; }
    var total = 0, i;
    for (i = 0; i < tree.kids.length; i++) total += tree.kids[i].n;
    if (!total) return tree.kids[0].move;
    var pick = Math.random() * total;
    for (i = 0; i < tree.kids.length; i++) {
      pick -= tree.kids[i].n;
      if (pick <= 0) return tree.kids[i].move;
    }
    return tree.kids[tree.kids.length - 1].move;
  }
}

function load(g) {
  new Function("globalThis", "window",
    fs.readFileSync(path.join(lib.JS_DIR, "value.js"), "utf8"))(g, undefined);
  return g.UNC.value;
}

/* ---- gathering ----------------------------------------------------------- */
var data = [], left = WORKERS, began = Date.now();

console.log("Playing " + GAMES + " games at " + PLAYOUTS + " playouts a move, " +
            "keeping " + TAKE + " positions from each.\n");

for (var w = 0; w < WORKERS; w++) {
  (function (id) {
    var kid = cp.fork(__filename,
      [String(GAMES), String(PLAYOUTS), String(WORKERS), String(id), String(WORKERS)],
      { env: Object.assign({}, process.env, { UNC_VALUE_WORKER: "1" }) });
    kid.on("message", function (msg) {
      if (msg.done) { if (--left === 0) fit(); return; }
      data = data.concat(msg);
      if (data.length % 4000 < 500) {
        process.stdout.write("\r  " + data.length + " positions   " +
          ((Date.now() - began) / 1000).toFixed(0) + "s    ");
      }
    });
  })(w);
}

/* ---- fitting -------------------------------------------------------------- */
/* Ordinary logistic regression, by gradient descent with Adam and a little
   weight decay. The held-back tenth is what says whether it learned anything
   rather than remembered it. */
function fit() {
  var g = {};
  new Function("globalThis", "window",
    fs.readFileSync(path.join(lib.JS_DIR, "engine.js"), "utf8"))(g, undefined);
  var V = load(g);
  var COUNT = V.COUNT, N = V.N;

  console.log("\n\n" + data.length + " positions in " +
              ((Date.now() - began) / 1000).toFixed(0) + "s");

  shuffle(data);
  var cut = Math.floor(data.length * 0.9);
  var train = data.slice(0, cut), test = data.slice(cut);

  var w = new Float64Array(N + 1);
  var m = new Float64Array(N + 1), v = new Float64Array(N + 1);
  var rate = 0.05, b1 = 0.9, b2 = 0.999, eps = 1e-8, decay = 1e-5;
  var STEPS = 400, BATCH = 512;

  for (var step = 1; step <= STEPS; step++) {
    var grad = new Float64Array(N + 1);
    for (var i = 0; i < BATCH; i++) {
      var row = train[(Math.random() * train.length) | 0];
      var p = guess(w, row.f, COUNT, N);
      var err = p - row.y;
      for (var j = 0; j < COUNT; j++) {
        grad[j] += err * row.f[j];
        grad[COUNT + j] += err * row.f[j] * row.f[COUNT];
      }
      grad[N] += err;
    }
    for (var k = 0; k <= N; k++) {
      var gk = grad[k] / BATCH + decay * w[k];
      m[k] = b1 * m[k] + (1 - b1) * gk;
      v[k] = b2 * v[k] + (1 - b2) * gk * gk;
      var mh = m[k] / (1 - Math.pow(b1, step)), vh = v[k] / (1 - Math.pow(b2, step));
      w[k] -= rate * mh / (Math.sqrt(vh) + eps);
    }
    if (step % 100 === 0) {
      console.log("  step " + step + "  train " + loss(w, train, COUNT, N).toFixed(4) +
                  "  held out " + loss(w, test, COUNT, N).toFixed(4));
    }
  }

  var before = plainLoss(test);
  var after = loss(w, test, COUNT, N);
  console.log("\nheld-out loss: the count by hand " + before.toFixed(4) +
              " → learned " + after.toFixed(4));
  console.log("agreement with the result: " + (agree(w, test, COUNT, N) * 100).toFixed(1) + "%");

  var body = "/* Written by train/value.js — the weights the position evaluator uses.\n" +
    "   " + data.length + " positions from " + GAMES + " of the engine's own games.\n" +
    "   Held-out loss " + after.toFixed(4) + ", against " + before.toFixed(4) +
    " for the count it replaces. */\n" +
    '(function (root) {\n  "use strict";\n  root.UNC = root.UNC || {};\n' +
    "  root.UNC.valueWeights = " + JSON.stringify({
      positions: data.length, games: GAMES, heldOut: +after.toFixed(4),
      w: Array.from(w).map(function (x) { return Math.round(x * 10000) / 10000; })
    }, null, 2).replace(/\n/g, "\n  ") + ";\n" +
    '})(typeof window !== "undefined" ? window : globalThis);\n';
  fs.writeFileSync(path.join(lib.JS_DIR, "value-weights.js"), body);
  console.log("wrote assets/js/value-weights.js");

  try { fs.writeFileSync(OUT, data.map(JSON.stringify).join("\n")); } catch (e) {}
  process.exit(0);
}

function guess(w, f, COUNT, N) {
  var sum = w[N], phase = f[COUNT];
  for (var i = 0; i < COUNT; i++) sum += (w[i] + w[COUNT + i] * phase) * f[i];
  return 1 / (1 + Math.exp(-sum));
}

function loss(w, rows, COUNT, N) {
  var t = 0;
  for (var i = 0; i < rows.length; i++) {
    var p = Math.min(1 - 1e-9, Math.max(1e-9, guess(w, rows[i].f, COUNT, N)));
    t += -(rows[i].y * Math.log(p) + (1 - rows[i].y) * Math.log(1 - p));
  }
  return t / rows.length;
}

/* what the hand-written count scored, for comparison */
function plainLoss(rows) {
  var t = 0;
  for (var i = 0; i < rows.length; i++) {
    var f = rows[i].f;
    var p = 1 / (1 + Math.exp(-(4.4 * f[0] + 1.6 * f[4] + 0.25 * f[9])));
    p = Math.min(1 - 1e-9, Math.max(1e-9, p));
    t += -(rows[i].y * Math.log(p) + (1 - rows[i].y) * Math.log(1 - p));
  }
  return t / rows.length;
}

function agree(w, rows, COUNT, N) {
  var ok = 0;
  for (var i = 0; i < rows.length; i++) {
    var p = guess(w, rows[i].f, COUNT, N);
    if (rows[i].y === 0.5) { ok += 0.5; continue; }
    if ((p > 0.5) === (rows[i].y === 1)) ok++;
  }
  return ok / rows.length;
}

function shuffle(a) {
  for (var i = a.length - 1; i > 0; i--) {
    var j = (Math.random() * (i + 1)) | 0;
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
}
