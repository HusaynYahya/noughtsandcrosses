/* ============================================================================
   Two sets of weights, one match. Colours alternate, so neither side gets the
   advantage of moving first more often.

     node train/evaluate.js <a.json|shipped> <b.json|shipped> <games> <ms|playouts> [time]
   ============================================================================ */
var lib = require("./lib.js");

var A = process.argv[2] === "shipped" ? null : lib.readWeights(process.argv[2]).w;
var B = process.argv[3] === "shipped" ? null : lib.readWeights(process.argv[3]).w;
var GAMES = +process.argv[4] || 40;
var SIZE = +process.argv[5] || 600;
var MODE = process.argv[6] || "playouts";
var BUDGET = MODE === "time" ? { iterations: 1e9, millis: SIZE }
                             : { iterations: SIZE, millis: 600000 };

var a = lib.engine(A), b = lib.engine(B);
var E = a.engine;
var score = { a: 0, b: 0, draw: 0 };

async function game(aPlaysX) {
  var s = E.create(), guard = 0;
  while (!s.over && guard++ < 200) {
    var isA = (s.turn === E.X) === aPlaysX;
    var side = isA ? a : b;
    var tree = await lib.search(side, s, BUDGET);
    var top = side.ai.mostVisited(tree);
    if (!top || !E.isLegal(s, top.move)) return;
    E.apply(s, top.move);
  }
  if (!s.winner) score.draw++;
  else if ((s.winner === E.X) === aPlaysX) score.a++;
  else score.b++;
}

(async function () {
  for (var i = 0; i < GAMES; i++) {
    await game(i % 2 === 0);
    if ((i + 1) % 20 === 0) {
      console.log("    " + (i + 1) + "/" + GAMES + ": a " + score.a + " b " + score.b + " drawn " + score.draw);
    }
  }
  var played = score.a + score.b + score.draw;
  var pct = (score.a + score.draw / 2) / played * 100;
  console.log("RESULT a " + score.a + " b " + score.b + " drawn " + score.draw +
              " => " + pct.toFixed(1) + "% for a");
  console.log("SCORE " + pct.toFixed(2));
})();
