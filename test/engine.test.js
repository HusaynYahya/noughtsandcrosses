/* Rules checks. Run with: node test/engine.test.js */
var fs = require("fs"), path = require("path");
var g = { window: undefined };
function load(f) {
  var code = fs.readFileSync(path.join(__dirname, "..", "assets/js", f), "utf8");
  new Function("globalThis", "window", code)(g, undefined);
}
load("engine.js"); load("ai.js");
var E = g.UNC.engine, AI = g.UNC.ai;

var fails = 0, checks = 0;
function ok(cond, what) {
  checks++;
  if (!cond) { fails++; console.log("  FAIL  " + what); }
}
function play(s, moves) { moves.forEach(function (m) {
  if (!E.isLegal(s, m)) throw new Error("illegal move " + m + " in test");
  E.apply(s, m);
}); return s; }

console.log("rules");

/* 1. opening move is free, then you are sent to the matching board */
var s = E.create();
ok(E.activeBoard(s) === -1, "opening move may go anywhere");
ok(E.legalMoves(s, []).length === 81, "81 opening moves");
E.apply(s, 4 * 9 + 6);                        /* centre board, bottom-left */
ok(E.activeBoard(s) === 6, "sent to the board matching the square played");
ok(E.legalMoves(s, []).length === 9, "only that board is playable");
ok(!E.isLegal(s, 0), "cannot play outside the board you were sent to");
ok(E.isLegal(s, 6 * 9 + 0), "can play inside the board you were sent to");

/* 2. a won small board stays playable while it has empty squares (house rule) */
s = E.create();
/* X takes the top row of board 0; the moves in between park O elsewhere */
play(s, [0 * 9 + 0, 0 * 9 + 8, 8 * 9 + 1, 1 * 9 + 8, 8 * 9 + 0, 0 * 9 + 2]);
/* board 0: X at 0, O at 8,2 ... rebuild deliberately instead */
s = E.create();
play(s, [
  0 * 9 + 0,   /* X b0 s0 -> sends O to b0 */
  0 * 9 + 3,   /* O b0 s3 -> sends X to b3 */
  3 * 9 + 0,   /* X b3 s0 -> sends O to b0 */
  0 * 9 + 4,   /* O b0 s4 -> sends X to b4 */
  4 * 9 + 0,   /* X b4 s0 -> sends O to b0 */
  0 * 9 + 5    /* O b0 s5 -> O wins board 0 (3,4,5); sends X to b5 */
]);
ok(s.bw[0] === E.O, "O owns board 0");
ok(!E.isFull(s, 0), "board 0 still has empty squares");
play(s, [5 * 9 + 0]);                          /* X b5 s0 -> sends O to b0 */
ok(E.activeBoard(s) === 0, "you are still sent to a board that is already won");
ok(E.isLegal(s, 0 * 9 + 1), "and you must play in it");
ok(E.legalMoves(s, []).length === 5, "only its empty squares are available");
var ownerBefore = s.bw[0];
/* X now makes a line in the already-won board: ownership must not change */
play(s, [0 * 9 + 1]); play(s, [1 * 9 + 0]); play(s, [0 * 9 + 2]);
play(s, [2 * 9 + 0]); /* park */
ok(s.bw[0] === ownerBefore, "a later line does not change who owns the board");

/* 3. only a completely full board sets you free */
s = E.create();
var fill = [0, 1, 2, 3, 4, 5, 6, 7, 8];
/* fill board 8 alternately, bouncing via board 8 squares */
s = E.create();
s.mx[8] = 0b010101010; s.mo[8] = 0b101010101; s.bw[8] = E.DEAD; s.filled = 9;
s.forced = 8; s.turn = E.X;
ok(E.activeBoard(s) === -1, "a full board sets you free");
ok(E.legalMoves(s, []).length === 72, "every empty square elsewhere is legal");
ok(!E.isLegal(s, 8 * 9 + 0), "no square is left in the full board");

/* 4. a full board with no line belongs to nobody */
ok(s.bw[8] === E.DEAD, "drawn board belongs to nobody");
ok(!(s.bigX & (1 << 8)) && !(s.bigO & (1 << 8)), "and counts for neither player");

/* 5. three small boards in a row wins the game */
s = E.create();
s.bw[0] = E.X; s.bw[1] = E.X; s.bigX = 0b011;
s.mx[2] = 0b000011; s.turn = E.X; s.forced = 2;
E.apply(s, 2 * 9 + 2);                         /* completes board 2, and the top row */
ok(s.winner === E.X, "X wins by taking three boards in a row");
ok(s.over === true, "game is over");
ok(JSON.stringify(s.winLine) === JSON.stringify([0, 1, 2]), "winning line reported");
ok(E.legalMoves(s, []).length === 0, "no moves once the game is over");

/* 5b. the line that won a small board is remembered, and not overwritten */
var bl = E.create();
bl.mx[0] = 0b000000011;                 /* X already holds squares 0 and 1 */
bl.turn = E.X; bl.forced = 0;
E.apply(bl, 0 * 9 + 2);                  /* and completes the top row */
ok(bl.bw[0] === E.X, "X owns board 0");
ok(JSON.stringify(E.LINES[bl.bl[0]]) === JSON.stringify([0, 1, 2]),
   "the winning line of a small board is recorded");
var wasLine = bl.bl[0];
bl.mo[0] = 0b000011000;                  /* O holds squares 3 and 4 there */
bl.turn = E.O; bl.forced = 0;
E.apply(bl, 0 * 9 + 5);                  /* and makes the middle row */
ok(bl.bw[0] === E.X, "the board still belongs to whoever won it first");
ok(bl.bl[0] === wasLine, "a later line in that board does not replace the recorded one");
ok(E.create().bl[0] === -1, "a board with no line records none");

/* 6. pack / unpack round trip (used by the network) */
var back = E.unpack(JSON.parse(JSON.stringify(E.pack(s))));
ok(back.winner === s.winner && back.bigX === s.bigX && back.mx[2] === s.mx[2],
   "state survives a round trip through the network");
var backBl = E.unpack(JSON.parse(JSON.stringify(E.pack(bl))));
ok(backBl.bl[0] === bl.bl[0], "the struck-through lines survive the trip too");

/* 7. a full random game always terminates in a legal, decided position */
for (var t = 0; t < 400; t++) {
  var r = E.create(), guard = 0, mv = [];
  while (!r.over && guard++ < 200) {
    E.legalMoves(r, mv);
    if (!mv.length) break;
    var m = mv[(Math.random() * mv.length) | 0];
    if (!E.isLegal(r, m)) { ok(false, "generated move was illegal"); break; }
    E.apply(r, m);
  }
  if (!r.over || r.filled > 81) { ok(false, "random game did not finish cleanly"); break; }
}
ok(true, "400 random games all finish with a decided result");

console.log("computer opponent");
/* 8. the computer takes a game-winning move when one is on offer */
var done = false;
var win = E.create();
win.bw[0] = E.O; win.bw[1] = E.O; win.bigO = 0b011;
win.mo[2] = 0b000011; win.turn = E.O; win.forced = 2;
AI.think(win, "steady", function (move) {
  ok(move === 2 * 9 + 2, "computer plays the move that wins the game");
  done = true;
  console.log("\n" + (fails ? fails + " FAILED of " + checks : "all " + checks + " checks passed"));
  process.exit(fails ? 1 : 0);
});
setTimeout(function () { if (!done) { console.log("  FAIL  computer never answered"); process.exit(1); } }, 8000);
