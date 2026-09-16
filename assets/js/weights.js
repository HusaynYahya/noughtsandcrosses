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
    "generation": 8,
    "trainedOn": 15419,
    "note": "learned from gen-7's games, and beat it",
    "w": [
      4.2317,
      0.1266,
      1.3381,
      0.9575,
      -2.3054,
      -1.6245,
      -0.6783,
      2.0158,
      0.4913,
      -0.3875,
      -0.3067,
      0.6192,
      0.0966,
      0.0958,
      0.6338,
      -0.3687,
      0.6427,
      -0.1022,
      -0.3278,
      0,
      0,
      -3.3393,
      3.9377,
      0.4274
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
