/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — rules engine
   ----------------------------------------------------------------------------
   Pure game logic. No DOM, no network. Everything else in this project builds
   on top of this file.

   HOUSE RULES (as agreed):
     1. Nine small boards arranged in a big three-by-three.
     2. The square you play in a small board decides which small board your
        opponent must play in next.
     3. A small board that has been WON can still be played in while it has
        empty squares — you are still sent there — but its result never
        changes. It belongs to whoever won it first.
     4. Only if the board you are sent to is COMPLETELY FULL may you play
        anywhere you like.
     5. A small board that fills up with no line belongs to nobody.
     6. Win three small boards in a row to win the game. If every square is
        filled and nobody has three in a row, the game is drawn.

   Board and square indices both run 0-8, left to right, top to bottom:
        0 1 2
        3 4 5
        6 7 8
   A move is a single number 0-80:  move = board * 9 + square.
   ============================================================================ */
(function (root) {
  "use strict";

  var EMPTY = 0, X = 1, O = 2, DEAD = 3;
  var FULL = 511;                       /* all nine bits set */

  /* the eight lines of a three-by-three, as nine-bit masks */
  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];
  var LINE_MASKS = LINES.map(function (l) {
    return (1 << l[0]) | (1 << l[1]) | (1 << l[2]);
  });

  /* WIN[mask] — does this set of squares contain a line? Answered by lookup
     rather than by looping, because the search engine asks millions of times. */
  var WIN = new Uint8Array(512);
  /* EMPTIES[mask] — the squares still free, ready-made. */
  var EMPTIES = new Array(512);
  /* COUNT[mask] — how many squares are taken. */
  var COUNT = new Uint8Array(512);
  (function build() {
    for (var m = 0; m < 512; m++) {
      var i, hit = 0, free = [], n = 0;
      for (i = 0; i < 8; i++) if ((m & LINE_MASKS[i]) === LINE_MASKS[i]) { hit = 1; break; }
      WIN[m] = hit;
      for (i = 0; i < 9; i++) { if (m & (1 << i)) n++; else free.push(i); }
      EMPTIES[m] = free;
      COUNT[m] = n;
    }
  })();

  function lineOf(mask) {
    for (var i = 0; i < 8; i++) {
      if ((mask & LINE_MASKS[i]) === LINE_MASKS[i]) return LINES[i];
    }
    return null;
  }

  /* ---- state ----------------------------------------------------------- */
  /* mx / mo   nine-bit occupancy of each small board, per player
     bw        who owns each small board: 0 none, 1 X, 2 O, 3 nobody (full)
     bigX/bigO which small boards each player owns, as a nine-bit mask
     forced    the small board the player to move is sent to, or -1 for free
     turn      X or O
     filled    squares played so far, 0-81                                   */
  function create() {
    return {
      mx: new Int16Array(9),
      mo: new Int16Array(9),
      bw: new Int8Array(9),
      bigX: 0, bigO: 0,
      forced: -1,
      turn: X,
      winner: 0,
      over: false,
      filled: 0,
      last: -1,
      winLine: null
    };
  }

  function clone(s) { return copyInto(create(), s); }

  function copyInto(dst, src) {
    dst.mx.set(src.mx); dst.mo.set(src.mo); dst.bw.set(src.bw);
    dst.bigX = src.bigX; dst.bigO = src.bigO;
    dst.forced = src.forced; dst.turn = src.turn;
    dst.winner = src.winner; dst.over = src.over;
    dst.filled = src.filled; dst.last = src.last;
    dst.winLine = src.winLine;
    return dst;
  }

  function occ(s, b) { return (s.mx[b] | s.mo[b]) & FULL; }
  function isFull(s, b) { return occ(s, b) === FULL; }

  /* what is in a square: 0, X or O */
  function at(s, board, square) {
    var bit = 1 << square;
    if (s.mx[board] & bit) return X;
    if (s.mo[board] & bit) return O;
    return EMPTY;
  }

  /* Which small board must the player to move play in?
     -1 means anywhere — either it is the opening move, or the board they were
     sent to is completely full (rule 4). */
  function activeBoard(s) {
    if (s.over) return -1;
    if (s.forced >= 0 && !isFull(s, s.forced)) return s.forced;
    return -1;
  }

  function legalMoves(s, out) {
    out = out || [];
    out.length = 0;
    if (s.over) return out;
    var live = activeBoard(s), b, free, i;
    if (live >= 0) {
      free = EMPTIES[occ(s, live)];
      for (i = 0; i < free.length; i++) out.push(live * 9 + free[i]);
      return out;
    }
    for (b = 0; b < 9; b++) {
      free = EMPTIES[occ(s, b)];
      for (i = 0; i < free.length; i++) out.push(b * 9 + free[i]);
    }
    return out;
  }

  function isLegal(s, move) {
    if (s.over || move < 0 || move > 80) return false;
    var b = (move / 9) | 0, sq = move % 9;
    if (occ(s, b) & (1 << sq)) return false;          /* square taken */
    var live = activeBoard(s);
    return live < 0 || live === b;
  }

  /* Play a move. Assumes it is legal — check with isLegal first. */
  function apply(s, move) {
    var b = (move / 9) | 0, sq = move % 9, bit = 1 << sq, p = s.turn;

    if (p === X) s.mx[b] |= bit; else s.mo[b] |= bit;
    s.filled++;
    s.last = move;

    /* A board's owner is settled the first time somebody makes a line there,
       and never revisited — play may continue in the squares left over. */
    if (s.bw[b] === 0) {
      var own = p === X ? s.mx[b] : s.mo[b];
      if (WIN[own]) {
        s.bw[b] = p;
        if (p === X) s.bigX |= (1 << b); else s.bigO |= (1 << b);
        var big = p === X ? s.bigX : s.bigO;
        if (WIN[big]) { s.winner = p; s.over = true; s.winLine = lineOf(big); }
      } else if (occ(s, b) === FULL) {
        s.bw[b] = DEAD;
      }
    }

    /* You are sent to the board matching the square just played — even if
       somebody has already won it. Only a full board sets you free. */
    s.forced = isFull(s, sq) ? -1 : sq;
    s.turn = p === X ? O : X;

    if (!s.over && s.filled === 81) { s.over = true; s.winner = 0; }
    return s;
  }

  /* ---- plain-object form, for the network and for saving --------------- */
  function pack(s) {
    return {
      mx: Array.prototype.slice.call(s.mx),
      mo: Array.prototype.slice.call(s.mo),
      bw: Array.prototype.slice.call(s.bw),
      bigX: s.bigX, bigO: s.bigO, forced: s.forced, turn: s.turn,
      winner: s.winner, over: s.over, filled: s.filled,
      last: s.last, winLine: s.winLine
    };
  }

  function unpack(o) {
    var s = create();
    if (!o || !o.mx || o.mx.length !== 9) return s;
    s.mx.set(o.mx); s.mo.set(o.mo); s.bw.set(o.bw);
    s.bigX = o.bigX | 0; s.bigO = o.bigO | 0;
    s.forced = o.forced | 0; s.turn = o.turn === O ? O : X;
    s.winner = o.winner | 0; s.over = !!o.over; s.filled = o.filled | 0;
    s.last = typeof o.last === "number" ? o.last : -1;
    s.winLine = o.winLine || null;
    return s;
  }

  root.UNC = root.UNC || {};
  root.UNC.engine = {
    EMPTY: EMPTY, X: X, O: O, DEAD: DEAD, FULL: FULL,
    LINES: LINES, LINE_MASKS: LINE_MASKS,
    WIN: WIN, EMPTIES: EMPTIES, COUNT: COUNT,
    create: create, clone: clone, copyInto: copyInto,
    at: at, occ: occ, isFull: isFull, activeBoard: activeBoard,
    legalMoves: legalMoves, isLegal: isLegal, apply: apply,
    lineOf: lineOf, pack: pack, unpack: unpack
  };
})(typeof window !== "undefined" ? window : globalThis);
