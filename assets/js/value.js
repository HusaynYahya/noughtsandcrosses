/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — what a position is worth
   ----------------------------------------------------------------------------
   The search stops its playouts after a dozen moves and asks this: how does
   this position look for crosses, as a number between nought and one?

   Twelve things are counted, all of them differences — what crosses have minus
   what noughts have — so the reading of a position and the reading of its
   mirror image add up to one without anything having to enforce it. Each is
   counted twice, once as it stands and once scaled by how far into the game we
   are, which lets a board in the corner matter less at move five than at move
   fifty without the model needing to be anything cleverer than a line.

   The weights come from the engine's own games: a few thousand of them, each
   position labelled with how the game actually ended. `train/value.js` fits
   them; what is written below is the result.
   ============================================================================ */
(function (root) {
  "use strict";

  var E = root.UNC.engine;
  var X = E.X, O = E.O, FULL = E.FULL;

  /* how many of the eight lines pass through each board */
  var LINES_THROUGH = [3, 2, 3, 2, 4, 2, 3, 2, 3];
  var SQUARE_WORTH = [3, 2, 3, 2, 4, 2, 3, 2, 3];

  var COUNT = 12;                     /* features before the phase copies */
  var N = COUNT * 2;

  function bits(n) {
    var c = 0;
    while (n) { n &= n - 1; c++; }
    return c;
  }

  /* Fills `f` with the position as the model sees it. Everything is signed:
     positive is good for crosses. */
  var raw = new Float64Array(COUNT);

  function features(s, out) {
    var f = out || raw;
    var i, b, sq, bit, open = 0, dead = 0, decided = 0;
    var boardsX = 0, boardsO = 0, weighted = 0, centre = 0, corners = 0;
    var marks = 0, twoX = 0, twoO = 0, hitX = 0, hitO = 0;

    for (b = 0; b < 9; b++) {
      var owner = s.bw[b];
      if (owner === X) { boardsX++; weighted += LINES_THROUGH[b]; decided++; }
      else if (owner === O) { boardsO++; weighted -= LINES_THROUGH[b]; decided++; }
      else if (owner === E.DEAD) { dead++; decided++; }
      else open |= 1 << b;

      if (b === 4) centre = owner === X ? 1 : owner === O ? -1 : 0;
      else if (b === 0 || b === 2 || b === 6 || b === 8) {
        corners += owner === X ? 1 : owner === O ? -1 : 0;
      }

      if (owner === 0) {
        var mine = s.mx[b], theirs = s.mo[b];
        var free = ~(mine | theirs) & FULL;
        /* squares that would finish this small board */
        var winX = E.COMPLETES[mine] & free, winO = E.COMPLETES[theirs] & free;
        if (winX) { twoX++; hitX += bits(winX); }
        if (winO) { twoO++; hitO += bits(winO); }
        for (sq = 0; sq < 9; sq++) {
          bit = 1 << sq;
          if (mine & bit) marks += SQUARE_WORTH[sq];
          else if (theirs & bit) marks -= SQUARE_WORTH[sq];
        }
      }
    }

    var bigThreatX = bits(E.COMPLETES[s.bigX] & open);
    var bigThreatO = bits(E.COMPLETES[s.bigO] & open);
    var mover = s.turn === X ? 1 : -1;
    var free = E.activeBoard(s) < 0 ? 1 : 0;

    f[0] = weighted / 8;                       /* boards, weighted by their lines */
    f[1] = (boardsX - boardsO) / 4;            /* boards, plainly */
    f[2] = centre;                             /* the middle board */
    f[3] = corners / 4;                        /* the corner boards */
    f[4] = (bigThreatX - bigThreatO) / 3;      /* a board away from the game */
    f[5] = ((bigThreatX > 1 ? 1 : 0) - (bigThreatO > 1 ? 1 : 0));  /* two such, at once */
    f[6] = (twoX - twoO) / 4;                  /* small boards one square from falling */
    f[7] = (hitX - hitO) / 6;                  /* and how many ways they could fall */
    f[8] = marks / 20;                         /* marks in the boards still open */
    f[9] = mover;                              /* whose move it is */
    f[10] = mover * free;                      /* and whether they may go anywhere */
    f[11] = (dead - 0) / 4;                    /* boards that came to nothing */
    return f;
  }

  var W = root.UNC.valueWeights && root.UNC.valueWeights.w;

  /* How crosses stand, between 0 and 1. Without weights it falls back to the
     count the search used before there was a model: boards, by their lines. */
  function value(s) {
    var f = features(s);
    /* with no weights this is exactly the count the search used before there
       was a model, so loading it changes nothing until it has learned */
    if (!W) return 1 / (1 + Math.exp(-(4.4 * f[0] + 2.64 * f[4])));
    var sum = W[N];                            /* the last weight is the offset */
    var phase = s.filled / 81;
    for (var i = 0; i < COUNT; i++) sum += (W[i] + W[COUNT + i] * phase) * f[i];
    return 1 / (1 + Math.exp(-sum));
  }

  root.UNC = root.UNC || {};
  root.UNC.value = {
    value: value, features: features, COUNT: COUNT, N: N,
    setWeights: function (w) { W = w; }
  };
})(typeof window !== "undefined" ? window : globalThis);
