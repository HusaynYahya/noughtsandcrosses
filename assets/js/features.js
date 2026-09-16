/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — how a move is described to the model
   ----------------------------------------------------------------------------
   The engine's opinion of a move before it has tried it used to be a handful
   of numbers I made up. Those numbers are now learned from the engine's own
   games, and this file is the vocabulary that learning uses: a short list of
   plain facts about a move, each one cheap to work out.

   A move becomes a vector of 24 numbers. The model is a single set of
   weights: score = weights · features, and the scores of the legal moves are
   turned into probabilities with a softmax. That is a linear policy — the
   simplest thing that can be learned — and it is linear on purpose. The
   search asks for this on every position it expands, hundreds of thousands of
   times a game, so the cost of asking has to stay near nothing. A deeper
   model would give better answers to fewer questions, and in a search that
   trade is usually a losing one.

   The same file runs in the browser and in the training scripts, so what is
   learned and what is played are the same thing.
   ============================================================================ */
(function (root) {
  "use strict";

  var E = root.UNC.engine;
  var X = E.X, O = E.O, FULL = E.FULL;

  var COUNT = 24;                      /* how many numbers describe a move */

  /* BLOCKS[mask] — which of the eight lines that set of squares touches.
     A line nobody has touched is a line still open to me. */
  var BLOCKS = new Uint8Array(512);
  var POP = new Uint8Array(256);
  (function build() {
    var m, i;
    for (m = 0; m < 512; m++) {
      var bits = 0;
      for (i = 0; i < 8; i++) if (m & E.LINE_MASKS[i]) bits |= (1 << i);
      BLOCKS[m] = bits;
    }
    for (m = 0; m < 256; m++) {
      var n = 0, v = m;
      while (v) { n += v & 1; v >>= 1; }
      POP[m] = n;
    }
  })();

  var CORNER_SQ = 0b101000101;          /* squares 0, 2, 6, 8 */

  /* Describe one move. `out` is filled in place — no allocation, because this
     is called for every legal move of every position the search opens. */
  function describe(s, m, out) {
    var p = s.turn;
    var b = (m / 9) | 0, sq = m % 9, bit = 1 << sq;
    var own = p === X ? s.mx : s.mo, opp = p === X ? s.mo : s.mx;
    var myBig = p === X ? s.bigX : s.bigO, theirBig = p === X ? s.bigO : s.bigX;
    var i;
    for (i = 0; i < COUNT; i++) out[i] = 0;

    var here = s.bw[b];
    var after = own[b] | bit;
    var winsBoard = here === 0 && E.WIN[after] ? 1 : 0;
    var winsGame = winsBoard && (E.COMPLETES[myBig] & (1 << b)) ? 1 : 0;
    var blocksBoard = here === 0 && !winsBoard && E.WIN[opp[b] | bit] ? 1 : 0;

    /* a fresh pair of mine in that board, with the third square still free */
    var pairs = 0;
    if (here === 0 && !winsBoard) {
      var openToMe = ~BLOCKS[opp[b]] & 0xff;
      var hadPairs = 0, hasPairs = 0;
      for (i = 0; i < 8; i++) {
        if (!(openToMe & (1 << i))) continue;
        var lm = E.LINE_MASKS[i];
        if (E.COUNT[own[b] & lm] === 2) hadPairs++;
        if (E.COUNT[after & lm] === 2) hasPairs++;
      }
      pairs = hasPairs > hadPairs ? 1 : 0;
    }

    /* where it sends them */
    var t = sq;
    var occ = (s.mx[t] | s.mo[t]) & FULL;
    if (t === b) occ |= bit;
    var theirs = p === X ? s.mo[t] : s.mx[t];
    var sendsFree = occ === FULL ? 1 : 0;
    var sendsDecided = !sendsFree && s.bw[t] !== 0 ? 1 : 0;
    var sendsWinnable = 0, sendsGame = 0;
    if (!sendsFree && s.bw[t] === 0 && (E.COMPLETES[theirs] & ~occ & FULL)) {
      sendsWinnable = 1;
      sendsGame = (E.COMPLETES[theirBig] & (1 << t)) ? 1 : 0;
    }

    /* what taking this board would be worth on the big board */
    var bigPair = 0, bigBlock = 0;
    if (winsBoard) {
      var bigAfter = myBig | (1 << b);
      for (i = 0; i < 8; i++) {
        var L = E.LINE_MASKS[i];
        if ((theirBig & L) === 0 && E.COUNT[bigAfter & L] === 2 && E.COUNT[myBig & L] < 2) bigPair = 1;
        if (E.COUNT[theirBig & L] === 2 && (L & (1 << b)) && !(myBig & L)) bigBlock = 1;
      }
    }

    var phase = s.filled / 81;

    out[0]  = winsBoard;
    out[1]  = winsGame;
    out[2]  = blocksBoard;
    out[3]  = pairs;
    out[4]  = sendsWinnable;
    out[5]  = sendsGame;
    out[6]  = sendsFree;
    out[7]  = sendsDecided;
    out[8]  = t === b ? 1 : 0;
    out[9]  = sq === 4 ? 1 : 0;
    out[10] = (CORNER_SQ >> sq) & 1;
    out[11] = b === 4 ? 1 : 0;
    out[12] = (CORNER_SQ >> b) & 1;
    out[13] = bigPair;
    out[14] = bigBlock;
    out[15] = POP[~BLOCKS[opp[b]] & 0xff] / 8;      /* lines still open to me there */
    out[16] = POP[~BLOCKS[own[b]] & 0xff] / 8;      /* lines still open to them */
    out[17] = here === p ? 1 : 0;
    out[18] = here && here !== p && here !== E.DEAD ? 1 : 0;
    out[19] = here === E.DEAD ? 1 : 0;
    out[20] = phase;
    out[21] = winsBoard * phase;
    out[22] = sendsWinnable * phase;
    out[23] = sendsFree * phase;
    return out;
  }

  /* The policy: score every legal move, then soften the scores into
     probabilities. Filled into `probs`, which must be at least as long as
     `moves`. */
  var scratch = new Float64Array(COUNT);

  function policy(s, moves, weights, probs) {
    var n = moves.length, i, j, z, top = -Infinity, sum = 0;
    if (!weights) {                                  /* no model: all equal */
      for (i = 0; i < n; i++) probs[i] = 1 / n;
      return probs;
    }
    for (i = 0; i < n; i++) {
      describe(s, moves[i], scratch);
      z = 0;
      for (j = 0; j < COUNT; j++) z += weights[j] * scratch[j];
      probs[i] = z;
      if (z > top) top = z;
    }
    for (i = 0; i < n; i++) { probs[i] = Math.exp(probs[i] - top); sum += probs[i]; }
    for (i = 0; i < n; i++) probs[i] /= sum;
    return probs;
  }

  root.UNC.features = {
    COUNT: COUNT,
    describe: describe,
    policy: policy,
    names: [
      "wins the board", "wins the game", "blocks their board", "makes a pair",
      "sends them somewhere winnable", "sends them to the winning board",
      "gives them a free move", "sends them to a decided board", "sends them back here",
      "centre square", "corner square", "centre board", "corner board",
      "makes a big pair", "blocks a big pair",
      "my open lines there", "their open lines there",
      "board already mine", "board already theirs", "board dead",
      "how far along", "wins the board x phase", "sends winnable x phase",
      "free move x phase"
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
