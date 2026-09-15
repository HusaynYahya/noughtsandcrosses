/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the search
   ----------------------------------------------------------------------------
   Monte-Carlo tree search. The machine plays thousands of games at random from
   the position in front of it, keeps the moves that tend to end well, and
   explores the promising ones more deeply. It is given a slice of a few
   milliseconds at a time so the page never freezes while it thinks.

   `search` does the work and hands back the tree it built. `think` uses that
   to pick a move to play; the analysis board reads the same tree to say what
   it would have played, how good the position is, and how the game might go
   on from here.
   ============================================================================ */
(function (root) {
  "use strict";

  var E = root.UNC.engine;
  var X = E.X, O = E.O;

  var LEVELS = {
    gentle:   { iterations:   220, millis:  400, blunder: 0.22 },
    steady:   { iterations:  4000, millis:  900, blunder: 0.04 },
    ruthless: { iterations: 40000, millis: 2200, blunder: 0    }
  };

  var EXPLORE = 1.35;          /* how much the search prefers the untried */
  var SLICE_MS = 12;           /* work done between repaints */

  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  /* ---- a random game, played out to the end --------------------------- */
  /* Not purely random: a player who can win a small board usually takes it,
     and a player who can win the whole game always does. That is enough to
     make the statistics mean something without slowing the rollout down. */
  function rollout(s, moves) {
    while (!s.over) {
      E.legalMoves(s, moves);
      if (!moves.length) break;
      var p = s.turn, own = p === X ? s.mx : s.mo;
      var big = p === X ? s.bigX : s.bigO;
      var claims = null, i, m, b, bit;

      for (i = 0; i < moves.length; i++) {
        m = moves[i]; b = (m / 9) | 0; bit = 1 << (m % 9);
        if (s.bw[b] === 0 && E.WIN[own[b] | bit]) {
          if (E.WIN[big | (1 << b)]) { claims = [m]; break; }   /* wins outright */
          (claims || (claims = [])).push(m);
        }
      }
      E.apply(s, claims && (claims.length === 1 || Math.random() < 0.75)
        ? pick(claims) : pick(moves));
    }
    return s.winner;
  }

  function score(winner, player) {
    return winner === 0 ? 0.5 : (winner === player ? 1 : 0);
  }

  function node(move, parent, mover, moves) {
    return { move: move, parent: parent, mover: mover,
             kids: [], untried: moves, w: 0, n: 0 };
  }

  function best(n) {
    var logN = Math.log(n.n || 1), top = null, topV = -Infinity, i, k, v;
    for (i = 0; i < n.kids.length; i++) {
      k = n.kids[i];
      v = k.w / k.n + EXPLORE * Math.sqrt(logN / k.n);
      if (v > topV) { topV = v; top = k; }
    }
    return top;
  }

  /* ---- the search, run in slices --------------------------------------- */
  /* Calls done(root) when the budget is spent. Returns a function that calls
     the whole thing off. */
  function search(state, budget, done) {
    var moves = E.legalMoves(state, []);
    var root = node(-1, null, 0, moves.slice());
    var scratch = E.create();
    var buf = [];
    var iters = 0, deadline = Date.now() + (budget.millis || 800), stopped = false;

    if (!moves.length) { setTimeout(function () { done(root); }, 0); return noop; }

    function slice() {
      if (stopped) return;
      var until = Date.now() + SLICE_MS;
      while (Date.now() < until && iters < budget.iterations && Date.now() < deadline) {
        for (var k = 0; k < 16 && iters < budget.iterations; k++) { iterate(); iters++; }
      }
      if (iters >= budget.iterations || Date.now() >= deadline) {
        stopped = true;
        setTimeout(function () { done(root); }, 0);
      } else {
        setTimeout(slice, 0);
      }
    }

    function iterate() {
      var s = E.copyInto(scratch, state);
      var n = root;
      while (!n.untried.length && n.kids.length) {       /* selection */
        n = best(n);
        E.apply(s, n.move);
      }
      if (n.untried.length && !s.over) {                  /* expansion */
        var i = (Math.random() * n.untried.length) | 0;
        var mv = n.untried.splice(i, 1)[0];
        var mover = s.turn;
        E.apply(s, mv);
        var kid = node(mv, n, mover, E.legalMoves(s, []));
        n.kids.push(kid);
        n = kid;
      }
      var winner = rollout(s, buf);                       /* play it out */
      while (n && n.parent) {                             /* and remember */
        n.n++;
        n.w += score(winner, n.mover);
        n = n.parent;
      }
      root.n++;
    }

    setTimeout(slice, 0);
    return function cancel() { stopped = true; };
  }

  function noop() {}

  function mostVisited(n) {
    var top = null, most = -1;
    for (var i = 0; i < n.kids.length; i++) {
      if (n.kids[i].n > most) { most = n.kids[i].n; top = n.kids[i]; }
    }
    return top;
  }

  /* ---- picking a move to play ------------------------------------------ */
  function think(state, level, done) {
    var cfg = LEVELS[level] || LEVELS.steady;
    var moves = E.legalMoves(state, []);

    if (!moves.length) { done(-1); return noop; }
    if (moves.length === 1) { answer(moves[0]); return noop; }

    /* take a win that is there for the taking, whatever the level */
    var now = winningMove(state, moves);
    if (now >= 0 && level !== "gentle") { answer(now); return noop; }

    return search(state, cfg, function (root) {
      var top = mostVisited(root);
      var move = top ? top.move : -1;
      if (cfg.blunder && Math.random() < cfg.blunder) move = pick(moves);
      answer(move);
    });

    function answer(move) { setTimeout(function () { done(move); }, 0); }
  }

  /* a move that wins the whole game on the spot, or -1 */
  function winningMove(s, moves) {
    var p = s.turn, own = p === X ? s.mx : s.mo, big = p === X ? s.bigX : s.bigO;
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], b = (m / 9) | 0, bit = 1 << (m % 9);
      if (s.bw[b] === 0 && E.WIN[own[b] | bit] && E.WIN[big | (1 << b)]) return m;
    }
    return -1;
  }

  root.UNC.ai = {
    think: think,
    search: search,
    mostVisited: mostVisited,
    winningMove: winningMove,
    levels: Object.keys(LEVELS)
  };
})(typeof window !== "undefined" ? window : globalThis);
