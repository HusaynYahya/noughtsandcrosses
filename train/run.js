/* ============================================================================
   One turn of the wheel, repeated:

     play        the engine plays itself and writes down what it decided
     learn       the weights are fitted to those decisions
     judge       the new weights play the old ones over a match
     keep        the new weights are adopted only if they actually won

   The gate matters. Fitting a model to its own teacher's choices usually
   lowers the training loss, and lower loss is not the same as better play.
   A generation that cannot beat its parent over the board is thrown away.

     node train/run.js [generations] [games] [playouts]
   ============================================================================ */
var cp = require("child_process");
var fs = require("fs");
var path = require("path");
var lib = require("./lib.js");

var GENERATIONS = +process.argv[2] || 3;
var SELFPLAY_GAMES = +process.argv[3] || 200;
var PLAYOUTS = +process.argv[4] || 600;
var MATCH_GAMES = 60;
var MATCH_PLAYOUTS = 600;
var KEEP_ABOVE = 53;          /* per cent of the match the challenger must take */

var DIR = path.join(__dirname, "weights");
var DATA = path.join(__dirname, "data");

function run(cmd, args) {
  console.log("\n$ node " + args.join(" "));
  var r = cp.spawnSync("node", args, { stdio: ["ignore", "pipe", "inherit"], encoding: "utf8",
                                       maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(r.stdout || "");
  if (r.status !== 0) throw new Error(cmd + " failed");
  return r.stdout || "";
}

/* where we are now */
var best = path.join(DIR, "gen-0.json");
if (!fs.existsSync(best)) {
  var shipped = lib.engine(null).weights;
  lib.writeWeights(best, { generation: 0, trainedOn: 0,
                           note: "set by hand, before any training", w: shipped.w });
}

var log = [];
for (var g = 1; g <= GENERATIONS; g++) {
  console.log("\n================ generation " + g + " ================");
  var data = path.join(DATA, "gen-" + g + ".jsonl");
  var cand = path.join(DIR, "gen-" + g + ".json");

  run("selfplay", [path.join(__dirname, "selfplay.js"), SELFPLAY_GAMES, PLAYOUTS, data, best]);
  var fit = run("train", [path.join(__dirname, "train.js"), data, cand, 12, best]);
  var out = run("evaluate", [path.join(__dirname, "evaluate.js"), cand, best, MATCH_GAMES, MATCH_PLAYOUTS]);

  var m = /SCORE ([\d.]+)/.exec(out);
  var pct = m ? +m[1] : 0;
  var keep = pct > KEEP_ABOVE;
  var w = lib.readWeights(cand);
  w.generation = g;
  w.scoreAgainstParent = pct;
  w.kept = keep;
  var parent = path.basename(best, ".json");
  w.parent = parent;
  w.note = keep ? "learned from " + parent + "'s games, and beat it"
                : "learned from " + parent + "'s games, but did not beat it";
  lib.writeWeights(cand, w);

  var parentName = path.basename(best, ".json");
  console.log("\ngeneration " + g + " scored " + pct.toFixed(1) + "% against " +
              parentName + " — " + (keep ? "KEPT" : "thrown away"));
  log.push({ generation: g, parent: parent, score: pct, kept: keep,
             heldOutLossBefore: w.heldOutLossBefore, heldOutLossAfter: w.heldOutLossAfter,
             agreementBefore: w.agreementBefore, agreementAfter: w.agreementAfter });
  if (keep) best = cand;
}

fs.writeFileSync(path.join(DIR, "history.json"), JSON.stringify(log, null, 2) + "\n");
var champion = lib.readWeights(best);
lib.publish(champion);
console.log("\nshipped generation " + champion.generation + " to assets/js/weights.js");
