/* ============================================================================
   Two searches, one match — the only way to tell whether a change helped
   ----------------------------------------------------------------------------
   A change to a search can look obviously right and still play worse. This
   settles it by playing the two against each other, and it goes to some
   trouble to be believable:

     PAIRED OPENINGS   Each opening is played twice, with the colours swapped,
                       so neither side is flattered by a lucky start. Half the
                       variance in a match comes from openings; this removes it.
     FRESH RANDOMNESS  Playouts stay random. It is the openings that are paired,
                       not the dice.
     AN ERROR BAR      The result comes with one. A 54% score over 100 games is
                       not a result, and the number underneath says so.
     SEVERAL AT ONCE   One process a core.

     node train/duel.js <a.js> <b.js> [games] [playouts] [workers]
     node train/duel.js assets/js/ai.js /tmp/ai-new.js 400 600

   Either side may be "shipped", meaning the search the site currently uses.
   ============================================================================ */
var path = require("path"), cp = require("child_process");
var lib = require("./lib.js");

var HERE = path.join(__dirname, "..");
function resolve(name) {
  return name === "shipped" ? path.join(lib.JS_DIR, "ai.js")
                            : path.resolve(HERE, name);
}

var A = resolve(process.argv[2] || "shipped");
var B = resolve(process.argv[3] || "shipped");
var GAMES = +process.argv[4] || 200;
var PLAYOUTS = +process.argv[5] || 600;      /* or "250ms" for time a move */
var WORKERS = +process.argv[6] || 4;

/* ---- one worker: play the openings it is given, both ways round --------- */
if (process.env.UNC_DUEL_WORKER) {
  var a = lib.engineFrom(A, null), b = lib.engineFrom(B, null);
  var E = a.engine;
  /* a number is playouts a move; "250ms" is time a move, which is how the site
     actually asks */
  var byClock = /ms$/.test(String(process.argv[5]));
  var budget = byClock
    ? { iterations: 1e9, millis: parseInt(process.argv[5], 10), straight: true }
    : { iterations: PLAYOUTS, millis: 600000, straight: true };
  var first = +process.argv[7], stride = +process.argv[8];

  var out = { a: 0, b: 0, draw: 0, games: 0, scores: [] };
  for (var g = first; g < GAMES; g += stride) {
    var opening = openingFor(Math.floor(g / 2));
    var aIsX = g % 2 === 0;
    var s = E.unpack(opening);
    var guard = 0;
    while (!s.over && guard++ < 90) {
      var side = ((s.turn === E.X) === aIsX) ? a : b;
      var tree = null;
      side.ai.search(s, budget, function (t) { tree = t; });
      var top = side.ai.mostVisited(tree);
      if (!top || !E.isLegal(s, top.move)) break;
      E.apply(s, top.move);
    }
    var mine = !s.winner ? 0.5 : ((s.winner === E.X) === aIsX ? 1 : 0);
    out.scores.push(mine);
    out.games++;
    if (mine === 1) out.a++; else if (mine === 0) out.b++; else out.draw++;
    if (process.send) process.send(out);
  }
  if (process.send) process.send(Object.assign({ done: true }, out));
  return;
}

/* ---- the openings ------------------------------------------------------- */
/* Four plies of legal moves from a seeded generator, so every worker and every
   run sees the same set of starts. A game decided by which opening you drew is
   not a game that tells you anything. */
function seeded(n) {
  var x = (n * 2654435761) >>> 0;
  return function () {
    x ^= x << 13; x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

function openingFor(i) {
  var lib2 = require("./lib.js");
  var g = lib2.engine(null), E = g.engine;
  var rnd = seeded(i + 1);
  for (var tries = 0; tries < 20; tries++) {
    var s = E.create(), ok = true;
    for (var ply = 0; ply < 4; ply++) {
      var moves = E.legalMoves(s, []);
      if (!moves.length || s.over) { ok = false; break; }
      E.apply(s, moves[(rnd() * moves.length) | 0]);
    }
    if (ok && !s.over) return E.pack(s);
  }
  return E.pack(E.create());
}

/* ---- the match ---------------------------------------------------------- */
var totals = { a: 0, b: 0, draw: 0, games: 0, scores: [] };
var live = {}, left = WORKERS;
var began = Date.now();

console.log("A: " + path.relative(HERE, A));
console.log("B: " + path.relative(HERE, B));
console.log(GAMES + " games, " + (/ms$/.test(String(process.argv[5]))
              ? process.argv[5] + " a move, " : PLAYOUTS + " playouts a move, ") +
            (GAMES / 2) + " openings each played both ways\n");

for (var w = 0; w < WORKERS; w++) {
  (function (id) {
    var kid = cp.fork(__filename,
      [process.argv[2] || "shipped", process.argv[3] || "shipped",
       String(GAMES), String(PLAYOUTS), String(WORKERS), String(id), String(WORKERS)],
      { env: Object.assign({}, process.env, { UNC_DUEL_WORKER: "1" }) });
    kid.on("message", function (msg) {
      live[id] = msg;
      report();
      if (msg.done) { if (--left === 0) finish(); }
    });
  })(w);
}

var lastSaid = 0;
function report() {
  var now = Date.now();
  if (now - lastSaid < 4000) return;
  lastSaid = now;
  var sum = gather();
  process.stdout.write("\r  " + sum.games + "/" + GAMES + "  a " + sum.a +
    "  b " + sum.b + "  drawn " + sum.draw + "   " +
    ((now - began) / 1000).toFixed(0) + "s    ");
}

function gather() {
  var sum = { a: 0, b: 0, draw: 0, games: 0, scores: [] };
  Object.keys(live).forEach(function (id) {
    var m = live[id];
    sum.a += m.a; sum.b += m.b; sum.draw += m.draw; sum.games += m.games;
    sum.scores = sum.scores.concat(m.scores);
  });
  return sum;
}

function finish() {
  var sum = gather();
  var n = sum.games;
  var mean = sum.scores.reduce(function (t, s) { return t + s; }, 0) / n;
  var variance = sum.scores.reduce(function (t, s) {
    return t + (s - mean) * (s - mean);
  }, 0) / Math.max(1, n - 1);
  var se = Math.sqrt(variance / n);

  function elo(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    return -400 * Math.log10(1 / p - 1);
  }
  var lo = mean - 1.96 * se, hi = mean + 1.96 * se;

  console.log("\n\nRESULT  a " + sum.a + "  b " + sum.b + "  drawn " + sum.draw +
              "  of " + n);
  console.log("SCORE   " + (mean * 100).toFixed(1) + "%  ±" + (1.96 * se * 100).toFixed(1) +
              "  (95% confidence: " + (lo * 100).toFixed(1) + "–" + (hi * 100).toFixed(1) + "%)");
  console.log("ELO     " + (elo(mean) >= 0 ? "+" : "") + elo(mean).toFixed(0) +
              "  (" + (elo(lo) >= 0 ? "+" : "") + elo(lo).toFixed(0) + " to " +
              (elo(hi) >= 0 ? "+" : "") + elo(hi).toFixed(0) + ")");
  console.log(lo > 0.5 ? "A is stronger." : hi < 0.5 ? "B is stronger."
            : "Not settled — the two are within noise of each other.");
  console.log("took " + ((Date.now() - began) / 1000).toFixed(0) + "s");
  process.exit(0);
}
