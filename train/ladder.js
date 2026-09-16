/* ============================================================================
   Every generation that was kept, played against generation 0, so strength can
   be plotted against training time rather than only against the generation
   before it. Colours alternate; a draw is half a point.

     node train/ladder.js [games] [playouts]
   ============================================================================ */
var fs = require("fs"), path = require("path"), cp = require("child_process");
var lib = require("./lib.js");

var GAMES = +process.argv[2] || 60;
var PLAYOUTS = +process.argv[3] || 600;
var DIR = path.join(__dirname, "weights");
var zero = path.join(DIR, "gen-0.json");

var gens = fs.readdirSync(DIR)
  .map(function (f) { return /^gen-(\d+)\.json$/.exec(f); })
  .filter(Boolean).map(function (m) { return +m[1]; })
  .filter(function (n) { return n > 0; })
  .sort(function (a, b) { return a - b; });

var out = [{ generation: 0, score: 50, elo: 0, kept: true }];
gens.forEach(function (n) {
  var file = path.join(DIR, "gen-" + n + ".json");
  var meta = lib.readWeights(file);
  process.stdout.write("gen " + n + " v gen 0 … ");
  var r = cp.spawnSync("node", [path.join(__dirname, "evaluate.js"), file, zero, GAMES, PLAYOUTS],
                       { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  var m = /SCORE ([\d.]+)/.exec(r.stdout || "");
  var pct = m ? +m[1] : 50;
  var p = Math.min(0.99, Math.max(0.01, pct / 100));
  var elo = -400 * Math.log10(1 / p - 1);
  /* A match of this length is a noisy instrument. The band is the ordinary
     95% interval on a proportion, and it is wide enough to matter: it is why
     the champion was settled by a longer playoff rather than by these. */
  var se = Math.sqrt(p * (1 - p) / GAMES) * 100;
  var band = [Math.max(0, pct - 1.96 * se), Math.min(100, pct + 1.96 * se)];
  console.log(pct.toFixed(1) + "%  (" + (elo >= 0 ? "+" : "") + elo.toFixed(0) + " Elo, " +
              "95% " + band[0].toFixed(0) + "-" + band[1].toFixed(0) + "%)");
  out.push({ generation: n, score: pct, elo: +elo.toFixed(0), kept: !!meta.kept,
             games: GAMES, low: +band[0].toFixed(1), high: +band[1].toFixed(1),
             heldOutLossAfter: meta.heldOutLossAfter, agreementAfter: meta.agreementAfter,
             scoreAgainstParent: meta.scoreAgainstParent, w: meta.w });
});

fs.writeFileSync(path.join(DIR, "ladder.json"), JSON.stringify(out, null, 2) + "\n");
console.log("\nwrote train/weights/ladder.json");
