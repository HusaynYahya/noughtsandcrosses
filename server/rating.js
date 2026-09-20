/* ============================================================================
   Elo, kept in one place
   ----------------------------------------------------------------------------
   The same arithmetic the browsers do on their own when there is no server —
   see assets/js/player.js — except that here it is the only copy that counts.
   ============================================================================ */
"use strict";

const START = 1200;
const PROVISIONAL = 10;

function expected(mine, theirs) {
  return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
}

function step(rating, games) {
  if (games < PROVISIONAL) return 40;
  if (rating >= 2100) return 16;
  return 24;
}

/* `score` is from the first player's side: 1, 0.5 or 0 */
function after(player, opponent, score) {
  const k = step(player.rating, player.games);
  return Math.round(player.rating + k * (score - expected(player.rating, opponent.rating)));
}

/* Both sides at once, so the two can never be worked out from different
   numbers: each is judged against the rating the other brought to the game. */
function settle(x, o, winner) {
  const scoreX = winner === 0 ? 0.5 : winner === 1 ? 1 : 0;
  return {
    x: after(x, o, scoreX),
    o: after(o, x, 1 - scoreX)
  };
}

module.exports = { settle, after, expected, step, START, PROVISIONAL };
