/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the search
   ----------------------------------------------------------------------------
   Monte-Carlo tree search, with three things on top of the plain algorithm:

   PRIOR KNOWLEDGE  A move is not born equal. When a move is first tried it is
                    handed a few made-up visits reflecting what can be seen at
                    a glance — that it takes a small board, that it takes the
                    square the opponent needed, that it sends the opponent
                    somewhere they can win. The search then spends its real
                    playouts on moves that are worth the time.

   A SOLVER         Near the end of a game, guessing is wasteful when the
                    answer can be known. A move that wins outright is marked
                    won, a position whose every reply is winning for the
                    opponent is marked lost, and those verdicts are carried
                    back up the tree. Proven branches are then taken or
                    avoided outright rather than sampled.

   BETTER PLAYOUTS  The random games are no longer quite random: a player
                    takes a small board when it is there, blocks one when it
                    is not, and never hands over a move that loses the game on
                    the spot.

   `search` does the work and hands back the tree. `think` picks a move from
   it; the analysis board reads the same tree for its opinions.
   ============================================================================ */
(function (root) {
  "use strict";

  var E = root.UNC.engine, F = root.UNC.features;
  var X = E.X, O = E.O, FULL = E.FULL;

  var LEVELS = {
    gentle:   { iterations:   400, millis:  500, blunder: 0.22 },
    steady:   { iterations: 20000, millis: 1100, blunder: 0.03 },
    ruthless: { iterations: 400000, millis: 3000, blunder: 0    }
  };

  var CPUCT = 1.8;          /* how much the search trusts the policy over its own results */
  var FPU = 0.5;            /* what an untried move is assumed to be worth */
  var EXPAND_AT = 1;        /* open a position out once it has been seen this often */
  var SLICE_MS = 12;        /* work done between repaints, when on the page */

  function pick(a) { return a[(Math.random() * a.length) | 0]; }

  /* ---- the playouts ---------------------------------------------------- */
  /* A player takes a small board when one is going, blocks one when it is
     not, and never plays a move that loses the game there and then. */
  /* One pass over the legal moves, choosing as it goes. Nothing is collected
     into lists: each kind of move keeps a running count and one candidate,
     replaced with probability one-in-count, which draws uniformly from that
     kind without ever building an array. Playouts are where nearly all of the
     time goes, so this is worth the trouble. */
  function rollout(s, moves) {
    while (!s.over) {
      E.legalMoves(s, moves);
      var count = moves.length;
      if (!count) break;

      var p = s.turn;
      var own = p === X ? s.mx : s.mo, opp = p === X ? s.mo : s.mx;
      /* the only boards where anything drastic can happen this move */
      var mine = E.COMPLETES[p === X ? s.bigX : s.bigO];
      var danger = E.COMPLETES[p === X ? s.bigO : s.bigX];

      var take = -1, takeN = 0, block = -1, blockN = 0, safe = -1, safeN = 0;
      var chosen = -1, i, m, b, sq, bit, occ, theirs;

      for (i = 0; i < count; i++) {
        m = moves[i]; b = (m / 9) | 0; sq = m % 9; bit = 1 << sq;

        if (s.bw[b] === 0) {
          if (E.WIN[own[b] | bit]) {
            if (mine & (1 << b)) { chosen = m; break; }        /* wins outright */
            if (Math.random() * ++takeN < 1) take = m;
            continue;
          }
          if (E.WIN[opp[b] | bit]) {
            if (Math.random() * ++blockN < 1) block = m;
            continue;
          }
        }

        /* would this hand them the game? only worth asking where it could */
        if (danger & (1 << sq)) {
          occ = (s.mx[sq] | s.mo[sq]) & FULL;
          if (sq === b) occ |= bit;
          if (occ !== FULL && s.bw[sq] === 0) {
            theirs = p === X ? s.mo[sq] : s.mx[sq];
            if (E.COMPLETES[theirs] & ~occ & FULL) continue;   /* leave it be */
          }
        }
        if (Math.random() * ++safeN < 1) safe = m;
      }

      if (chosen < 0) {
        chosen = takeN && Math.random() < 0.85 ? take
               : blockN && Math.random() < 0.65 ? block
               : safeN ? safe
               : moves[(Math.random() * count) | 0];
      }
      E.apply(s, chosen);
    }
    return s.winner;
  }

  function score(winner, player) {
    return winner === 0 ? 0.5 : (winner === player ? 1 : 0);
  }

  /* ---- the tree -------------------------------------------------------- */
  /* proven:  1 this node's mover wins with best play
             -1 this node's mover loses
              0 not known                                                    */
  function node(move, parent, mover) {
    return { move: move, parent: parent, mover: mover,
             kids: [], opened: false, p: 0, w: 0, n: 0, proven: 0 };
  }

  /* Open a position out: every legal move becomes a child, each carrying the
     policy's opinion of it. The policy is asked once per position rather than
     once per move, which is what keeps it affordable. */
  var probs = new Float64Array(81);
  var openMoves = [];

  function open(n, s) {
    E.legalMoves(s, openMoves);
    var w = root.UNC.weights && root.UNC.weights.w;
    F.policy(s, openMoves, w, probs);
    var mover = s.turn;
    for (var i = 0; i < openMoves.length; i++) {
      var kid = node(openMoves[i], n, mover);
      kid.p = probs[i];
      n.kids.push(kid);
    }
    n.opened = true;
    /* Some verdicts need no searching at all. A move that wins the game is
       won; a move that hands the opponent a win they cannot miss is lost.
       Settling those here costs a few table lookups and saves the search
       from sampling moves whose answer is already known — which matters more
       now that the policy steers, because a move it dislikes might otherwise
       never be looked at closely enough to be refuted. */
    for (i = 0; i < n.kids.length; i++) {
      var v = plainly(s, n.kids[i].move, mover);
      if (v) settle(n.kids[i], v);
    }
  }

  /* 1 this move wins the game, -1 it lets the opponent win at once, 0 neither */
  function plainly(s, m, p) {
    var b = (m / 9) | 0, sq = m % 9, bit = 1 << sq;
    var own = p === X ? s.mx : s.mo;
    var myBig = p === X ? s.bigX : s.bigO, theirBig = p === X ? s.bigO : s.bigX;
    var takesBoard = s.bw[b] === 0 && E.WIN[own[b] | bit];

    if (takesBoard && (E.COMPLETES[myBig] & (1 << b))) return 1;

    var t = sq;
    if (t === b && takesBoard) return 0;          /* that board is mine now */
    if (s.bw[t] !== 0) return 0;
    if (!(E.COMPLETES[theirBig] & (1 << t))) return 0;
    var occ = (s.mx[t] | s.mo[t]) & FULL;
    if (t === b) occ |= bit;
    if (occ === FULL) return 0;
    var theirs = p === X ? s.mo[t] : s.mx[t];
    return (E.COMPLETES[theirs] & ~occ & FULL) ? -1 : 0;
  }

  function settle(n, verdict) {
    if (n.proven) return;
    n.proven = verdict;
    if (n.parent) carry(n.parent);
  }

  /* A child's verdict belongs to whoever moved into it — that is the player
     to move at the node above. So a child proven won is a winning move for
     the player choosing here, and therefore a loss for the node above it. */
  function carry(n) {
    var i;
    for (i = 0; i < n.kids.length; i++) {
      if (n.kids[i].proven === 1) { settle(n, -1); return; }   /* they have a winning reply */
    }
    if (n.opened && n.kids.length) {
      for (i = 0; i < n.kids.length; i++) if (n.kids[i].proven !== -1) return;
      settle(n, 1);                                            /* every reply of theirs loses */
    }
  }

  /* The choice at each step: what the playouts have found, plus what the
     policy thinks of a move that has not had many yet. */
  function best(n) {
    var pull = CPUCT * Math.sqrt(n.n + 1);
    var top = null, topV = -Infinity, fallback = null, i, k, v;
    for (i = 0; i < n.kids.length; i++) {
      k = n.kids[i];
      if (k.proven === 1) return k;             /* takes the game — play it */
      if (k.proven === -1) { fallback = fallback || k; continue; }  /* loses — leave it */
      v = (k.n ? k.w / k.n : FPU) + pull * k.p / (1 + k.n);
      if (v > topV) { topV = v; top = k; }
    }
    return top || fallback;
  }

  function real(k) { return k.n; }

  function mostVisited(n) {
    var top = null, most = -Infinity, i, k;
    for (i = 0; i < n.kids.length; i++) {
      k = n.kids[i];
      if (k.proven === 1) return k;
      if (k.proven === -1 && n.kids.length > 1) continue;
      if (real(k) > most) { most = real(k); top = k; }
    }
    if (top) return top;
    for (i = 0; i < n.kids.length; i++) if (!top || real(n.kids[i]) > real(top)) top = n.kids[i];
    return top;
  }

  /* ---- the search ------------------------------------------------------ */
  /* Calls done(root) when the budget is spent. On the page it works in short
     slices so nothing freezes; in a worker there is nothing to freeze, so it
     runs straight through. */
  function search(state, budget, done) {
    var moves = E.legalMoves(state, []);
    var root = node(-1, null, 0);
    var scratch = E.create();
    var buf = [];
    var iterations = budget.iterations || 200000;
    var deadline = Date.now() + (budget.millis || 800);
    var iters = 0, stopped = false;

    if (!moves.length) { finish(); return noop; }

    if (budget.straight) { while (spin()) {} finish(); return noop; }
    setTimeout(slice, 0);
    return function cancel() { stopped = true; };

    function spin() {
      if (stopped || iters >= iterations || root.proven) return false;
      for (var k = 0; k < 24 && iters < iterations; k++) { iterate(); iters++; }
      return Date.now() < deadline;
    }

    function slice() {
      if (stopped) return;
      var until = Date.now() + SLICE_MS;
      var going = true;
      while (going && Date.now() < until) going = spin();
      if (!going) { finish(); return; }
      setTimeout(slice, 0);
    }

    function finish() {
      stopped = true;
      if (budget.straight) done(root);
      else setTimeout(function () { done(root); }, 0);
    }

    function iterate() {
      var s = E.copyInto(scratch, state);
      var n = root;

      while (n.kids.length && !s.over) {                  /* down the tree */
        var next = best(n);
        if (!next) break;
        n = next;
        E.apply(s, n.move);
      }

      /* A position is opened out the second time it is reached, so a single
         stray visit does not cost a policy call. */
      if (!s.over && !n.opened && n.n >= EXPAND_AT && !n.proven) {
        open(n, s);
        var kid = best(n);
        if (kid) { n = kid; E.apply(s, n.move); }
      }

      var winner;
      if (s.over) {                                       /* known, not guessed */
        winner = s.winner;
        if (winner === n.mover) settle(n, 1);
        else if (winner) settle(n, -1);
      } else {
        winner = rollout(s, buf);                         /* play it out */
      }

      while (n && n.parent) {                             /* and remember */
        n.n++;
        n.w += score(winner, n.mover);
        n = n.parent;
      }
      root.n++;
    }
  }

  function noop() {}

  /* ---- picking a move to play ------------------------------------------ */
  function think(state, level, done) {
    var cfg = LEVELS[level] || LEVELS.steady;
    var moves = E.legalMoves(state, []);

    if (!moves.length) { done(-1); return noop; }
    if (moves.length === 1) { answer(moves[0]); return noop; }

    var now = winningMove(state, moves);
    if (now >= 0 && level !== "gentle") { answer(now); return noop; }

    return search(state, cfg, function (tree) {
      var top = mostVisited(tree);
      var move = top ? top.move : -1;
      if (cfg.blunder && !(top && top.proven === 1) && Math.random() < cfg.blunder) {
        move = pick(moves);
      }
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
    realVisits: real,
    winningMove: winningMove,
    levels: Object.keys(LEVELS),
    LEVELS: LEVELS
  };
})(typeof window !== "undefined" ? window : globalThis);
