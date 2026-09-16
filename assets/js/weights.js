/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — what the engine has learned
   ----------------------------------------------------------------------------
   One weight for each of the 24 things the engine notices about a move (see
   features.js). The score of a move is the weights times its features; the
   scores of the legal moves are softened into probabilities, and the search
   spends its time in proportion.

   generation:  which round of training these came from. Generation 0 was set
                by hand; every generation after it was learned from the games
                the generation before it played, and kept only if it beat its
                parent over a match.

   Regenerate with:  node train/run.js
   ============================================================================ */
(function (root) {
  "use strict";
  root.UNC = root.UNC || {};
  root.UNC.weights = {
    "generation": 3,
    "trainedOn": 15676,
    "note": "learned from generation 2's games, and beat it",
    "w": [
      3.6382,
      0.6202,
      1.3499,
      0.9146,
      -1.9751,
      -1.2889,
      -0.6618,
      1.0321,
      0.2183,
      -0.2901,
      -0.1612,
      0.4112,
      0.42,
      0.5475,
      0.1918,
      -0.2398,
      -0.0683,
      -0.1268,
      -0.4036,
      0,
      0,
      -2.6493,
      2.5311,
      0.7232
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
