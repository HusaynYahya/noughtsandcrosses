/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the analysis board
   ----------------------------------------------------------------------------
   Reads the search tree and says three things about a position:

     how it stands   a number from 0 to 100 — the chance the player to move
                     ends up winning, as the search found it
     what to play    the move the search settled on, with the next best
                     alternatives beside it
     how it goes on  the line the search expects, read off by following the
                     move it looked at most, then that move's most-looked-at
                     reply, and so on

   Judging a move that has been played works the way it does on a chess site:
   compare how the position stood before the move with how it stands after,
   both from the mover's point of view. Losing ground means the move gave
   something away. The two readings come from separate searches, so a little
   noise is expected and the thresholds are set well clear of it.
   ============================================================================ */
(function (root) {
  "use strict";

  var E = root.UNC.engine, AI = root.UNC.ai;

  var DEPTH = 8;            /* how far down the expected line to read */
  var CANDIDATES = 3;       /* how many alternatives to show */
  var TRUST = 25;           /* a move looked at less than this says little */

  /* How much ground a move may give away before it is worth naming, in
     percentage points. Well clear of the noise between two searches. */
  var LOST = 3;             /* at or below this, the game is gone */
  var ALIVE = 8;            /* above this, there was still something to play for */
  var WON = 92;             /* at or above this, the game was there to be taken */

  var MARKS = [
    { loss: 28, mark: "??", name: "blunder" },
    { loss: 16, mark: "?",  name: "mistake" },
    { loss: 9,  mark: "?!", name: "inaccuracy" }
  ];

  /* ---- reading the tree ------------------------------------------------ */
  function report(state, root_) {
    var best = AI.mostVisited(root_);
    if (!best) {
      return { ready: false, score: 50, best: -1, pv: [], candidates: [], visits: 0 };
    }

    var kids = root_.kids.slice().sort(function (a, b) { return b.n - a.n; });
    var candidates = kids.slice(0, CANDIDATES).map(function (k) {
      return { move: k.move, score: pct(k.w / k.n), visits: k.n };
    });

    return {
      ready: root_.n > 0,
      turn: state.turn,
      score: pct(best.w / best.n),        /* for the player to move */
      best: best.move,
      visits: best.n,
      total: root_.n,
      pv: line(best),
      candidates: candidates
    };
  }

  /* the expected continuation: the most-examined move, then its most-examined
     reply, and on down */
  function line(node) {
    var out = [], n = node, guard = 0;
    while (n && guard++ < DEPTH) {
      out.push(n.move);
      n = AI.mostVisited(n);
      if (!n || n.n < 3) break;          /* too thin to be worth quoting */
    }
    return out;
  }

  function pct(v) { return Math.round(v * 1000) / 10; }

  /* ---- what to call a move that has been played ------------------------ */
  /* `before` is how the position stood for the mover when it was their turn;
     `after` is how it stands for them once the reply position is judged. */
  function judge(before, after, trusted) {
    if (before == null || after == null || !trusted) return null;
    var loss = before - after;

    /* A game that was still alive and is now gone counts as a blunder however
       small the arithmetic says the loss was. In a position already going
       badly there is little left to give away, but handing the game over is
       still the moment worth pointing at. */
    if (after <= LOST && before >= ALIVE) {
      return { mark: "??", name: "blunder", loss: Math.round(loss), lost: true };
    }
    /* And the same the other way: a position that was won and no longer is. */
    if (before >= WON && after < WON - 12) {
      return { mark: "??", name: "blunder", loss: Math.round(loss), threw: true };
    }

    for (var i = 0; i < MARKS.length; i++) {
      if (loss >= MARKS[i].loss) {
        return { mark: MARKS[i].mark, name: MARKS[i].name, loss: Math.round(loss) };
      }
    }
    return null;
  }

  /* ---- the public face ------------------------------------------------- */
  /* Runs a search on the position and hands back the report. */
  function analyse(state, millis, done) {
    if (state.over) {
      /* Same point of view as every other reading: how it stands for whoever
         is to move. Nobody is to move once it is over, but the side that
         would have been is the one whose turn it now is. */
      done({
        ready: true, over: true, turn: state.turn,
        score: state.winner === 0 ? 50 : (state.winner === state.turn ? 100 : 0),
        best: -1, pv: [], candidates: [], visits: 0, total: 0
      });
      return function () {};
    }
    return AI.search(state, { iterations: 200000, millis: millis || 900 },
      function (tree) { done(report(state, tree)); });
  }

  root.UNC.analysis = {
    analyse: analyse,
    judge: judge,
    TRUST: TRUST,
    MARKS: MARKS
  };
})(typeof window !== "undefined" ? window : globalThis);
