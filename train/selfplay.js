/* ============================================================================
   Self-play: the engine plays itself and writes down what it decided.
   ----------------------------------------------------------------------------
   For every position, the search is run and the number of playouts each move
   received is recorded. Those counts are the teaching signal: a move the
   search spent a lot of time on is a move worth looking at first next time.
   This is the same idea as the policy head of AlphaZero, with the search
   playing the part of the teacher and a linear model playing the part of the
   student.

   Early moves are chosen in proportion to the visit counts rather than by
   taking the best, so the games differ from one another and the model sees a
   spread of positions instead of one line played over and over.

     node train/selfplay.js <games> <playouts> <out.jsonl> [weights.json]
   ============================================================================ */
var fs = require("fs");
var lib = require("./lib.js");

var GAMES = +process.argv[2] || 200;
var PLAYOUTS = +process.argv[3] || 600;
var OUT = process.argv[4] || "train/data/gen.jsonl";
var WEIGHTS = process.argv[5] ? lib.readWeights(process.argv[5]).w : null;

var U = lib.engine(WEIGHTS);
var E = U.engine;
var BUDGET = { iterations: PLAYOUTS, millis: 600000 };
var EXPLORE_PLIES = 12;          /* how long to keep choosing loosely */

function choose(tree, ply) {
  var kids = tree.kids.filter(function (k) { return k.n > 0 || k.proven; });
  if (!kids.length) return { move: -1 };
  var visits = kids.map(function (k) { return k.proven === 1 ? 1e9 : k.n; });
  var total = visits.reduce(function (a, b) { return a + b; }, 0);

  var move;
  if (ply < EXPLORE_PLIES) {     /* pick in proportion, to vary the games */
    var r = Math.random() * total, acc = 0;
    move = kids[kids.length - 1].move;
    for (var i = 0; i < kids.length; i++) {
      acc += visits[i];
      if (r <= acc) { move = kids[i].move; break; }
    }
  } else {
    move = kids[visits.indexOf(Math.max.apply(null, visits))].move;
  }
  return {
    move: move,
    moves: kids.map(function (k) { return k.move; }),
    visits: visits.map(function (v) { return v >= 1e9 ? total : v; })
  };
}

(async function () {
  var out = fs.createWriteStream(OUT);
  var positions = 0, results = { 1: 0, 2: 0, 0: 0 };
  var t0 = Date.now();

  for (var g = 0; g < GAMES; g++) {
    var s = E.create(), ply = 0;
    while (!s.over && ply < 200) {
      var tree = await lib.search(U, s, BUDGET);
      var chosen = choose(tree, ply);
      if (chosen.move < 0) break;
      if (chosen.moves && chosen.moves.length > 1) {
        out.write(JSON.stringify({
          s: E.pack(s), m: chosen.moves, v: chosen.visits
        }) + "\n");
        positions++;
      }
      E.apply(s, chosen.move);
      ply++;
    }
    results[s.winner]++;
    if ((g + 1) % 20 === 0) {
      var secs = ((Date.now() - t0) / 1000).toFixed(0);
      console.log("  " + (g + 1) + "/" + GAMES + " games, " + positions +
                  " positions, " + secs + "s  (crosses " + results[1] +
                  ", noughts " + results[2] + ", drawn " + results[0] + ")");
    }
  }
  out.end();
  console.log("wrote " + positions + " positions to " + OUT);
})();
