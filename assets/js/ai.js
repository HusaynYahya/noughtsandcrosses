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

   A KEPT TREE      The position you are asked about is usually two moves down
                    the tree you built last time. Throwing that away and
                    starting again is the most expensive habit a search can
                    have, so it is kept — checked square by square against the
                    position before it is trusted. It is worth about as much as
                    doubling the time.

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

  var CPUCT = 0.9;          /* how much the search trusts the policy over its own results */
  /* A playout used to be played to the end. It turns out that after a dozen
     moves the random game has told you what it is going to tell you, and
     carrying on only adds noise: stopping there and judging the position beats
     finishing it, both per playout and per second. Judging without playing at
     all is much worse — the playout is doing real work, just not for sixty
     moves. */
  var ROLL_CAP = 12;        /* moves a playout plays before it is judged instead */
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
  /* How much a position is worth to crosses, without playing it out. The
     reading itself lives in value.js, which is fitted to the engine's own
     games; without that file, or before it has learned anything, it is the
     count of boards it replaces. */
  var V = root.UNC.value;
  var guess = V ? V.value : function (s) {
    var points = 0, b, open = 0;
    for (b = 0; b < 9; b++) {
      if (s.bw[b] === X) points += 3;
      else if (s.bw[b] === O) points -= 3;
      else open |= 1 << b;
    }
    return 1 / (1 + Math.exp(-0.55 * points));
  };

  function rollout(s, moves) {
    var left = ROLL_CAP;
    while (!s.over && left-- > 0) {
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
    if (s.over) return s.winner === 0 ? 0.5 : (s.winner === X ? 1 : 0);
    return guess(s);
  }

  /* everything below carries one number: how the position looks for crosses */
  function score(vx, player) {
    return player === X ? vx : 1 - vx;
  }

  /* ---- the tree -------------------------------------------------------- */
  /* proven:  1 this node's mover wins with best play
             -1 this node's mover loses
              0 not known                                                    */
  var made = 0;             /* nodes in the tree being kept, so it cannot run away */

  function node(move, parent, mover) {
    made++;
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

  /* ---- keeping the tree between moves ----------------------------------- */
  /* A search throws away everything it learned the moment it answers, and the
     next search starts again from nothing — even though the position it is
     asked about is usually two moves down the tree it just built. Keeping that
     subtree is free depth: the work is already done and still true.

     What is kept is checked against the position before it is used, square by
     square, so a tree from another game or another line is never mistaken for
     this one. */
  var kept = null;                 /* { root, state } from the last search */
  var REUSE_FROM = 40;             /* not worth carrying a tree thinner than this */
  /* A kept tree grows: each move adds what it searched and throws away only
     the branches nobody went down. Left alone it reaches millions of nodes and
     takes the tab with it, so it is counted, and once it is this big the
     search stops adding to it and starts again next move. A hundred and fifty thousand
     nodes is tens of megabytes — deep enough that the cap is rarely reached
     before a game is over, small enough to be no trouble on a phone. */
  var NODE_CAP = 150000;

  function sameState(a, b) {
    if (a.turn !== b.turn || a.forced !== b.forced || a.filled !== b.filled) return false;
    for (var i = 0; i < 9; i++) {
      if (a.mx[i] !== b.mx[i] || a.mo[i] !== b.mo[i] || a.bw[i] !== b.bw[i]) return false;
    }
    return true;
  }

  /* how many nodes are under this one, giving up once that is too many */
  function sizeOf(n, limit) {
    var stack = [n], seen = 0;
    while (stack.length) {
      var top = stack.pop();
      seen++;
      if (seen > limit) return seen;
      for (var i = 0; i < top.kids.length; i++) stack.push(top.kids[i]);
    }
    return seen;
  }

  /* the child, or grandchild, of the kept tree that is this position */
  function inherit(state) {
    if (!kept) return null;
    var gap = state.filled - kept.state.filled;
    if (gap < 1 || gap > 2) return null;

    var probe = E.create(), i, j, k1, k2;
    for (i = 0; i < kept.root.kids.length; i++) {
      k1 = kept.root.kids[i];
      if (!k1.n) continue;
      E.copyInto(probe, kept.state);
      if (!E.isLegal(probe, k1.move)) continue;
      E.apply(probe, k1.move);

      if (gap === 1) {
        if (k1.move === state.last && sameState(probe, state)) return k1;
        continue;
      }
      for (j = 0; j < k1.kids.length; j++) {
        k2 = k1.kids[j];
        if (k2.move !== state.last || !k2.n) continue;
        var after = E.copyInto(E.create(), probe);
        if (!E.isLegal(after, k2.move)) break;
        E.apply(after, k2.move);
        if (sameState(after, state)) return k2;
        break;
      }
    }
    return null;
  }

  /* ---- the search ------------------------------------------------------ */
  /* Calls done(root) when the budget is spent. On the page it works in short
     slices so nothing freezes; in a worker there is nothing to freeze, so it
     runs straight through. */
  function search(state, budget, done) {
    var moves = E.legalMoves(state, []);
    var carried = budget.fresh ? null : inherit(state);
    var root, carrying = 0;
    if (carried && carried.n >= REUSE_FROM) {
      carrying = sizeOf(carried, NODE_CAP);
    }
    if (carrying && carrying <= NODE_CAP) {
      root = carried;
      root.parent = null;                /* it is the top of the tree now */
      made = carrying;                   /* the rest of the old tree is let go */
    } else {
      made = 0;
      root = node(-1, null, 0);
    }
    kept = { root: root, state: E.pack(state) };
    var scratch = E.create();
    var buf = [];
    /* the budget is new work, and a carried tree is not new work: what it
       brings is depth already paid for, not licence to do more */
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
      if (!s.over && !n.opened && n.n >= EXPAND_AT && !n.proven && made < NODE_CAP) {
        open(n, s);
        var kid = best(n);
        if (kid) { n = kid; E.apply(s, n.move); }
      }

      var vx;
      if (s.over) {                                       /* known, not guessed */
        vx = s.winner === 0 ? 0.5 : (s.winner === X ? 1 : 0);
        if (s.winner === n.mover) settle(n, 1);
        else if (s.winner) settle(n, -1);
      } else {
        vx = rollout(s, buf);                             /* play it out, or judge it */
      }

      while (n && n.parent) {                             /* and remember */
        n.n++;
        n.w += score(vx, n.mover);
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

  /* a new game is a new tree */
  function forget() { kept = null; made = 0; }

  root.UNC.ai = {
    think: think,
    forget: forget,
    search: search,
    mostVisited: mostVisited,
    realVisits: real,
    winningMove: winningMove,
    levels: Object.keys(LEVELS),
    LEVELS: LEVELS
  };
})(typeof window !== "undefined" ? window : globalThis);
