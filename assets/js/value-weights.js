/* Written by train/value.js — the weights the position evaluator uses.
   15000 positions from 2500 of the engine's own games.
   Held-out loss 0.6694, against 0.8025 for the count it replaces. */
(function (root) {
  "use strict";
  root.UNC = root.UNC || {};
  root.UNC.valueWeights = {
    "positions": 15000,
    "games": 2500,
    "heldOut": 0.6694,
    "w": [
      0.6588,
      0.5774,
      0.1329,
      0.624,
      0.351,
      -0.0978,
      -0.0757,
      -0.0837,
      -0.1396,
      0.012,
      0.8354,
      -0.3528,
      -0.1852,
      -0.0458,
      0.0419,
      -0.2428,
      0.879,
      0.3727,
      0.1969,
      1.213,
      1.2499,
      -0.2063,
      0.3223,
      -0.3578,
      0.0543
    ]
  };
})(typeof window !== "undefined" ? window : globalThis);
