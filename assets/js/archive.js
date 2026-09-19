/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — every game you have played
   ----------------------------------------------------------------------------
   A finished game is written down here, whole: the moves, who was who, how it
   ended, and what it did to your rating. Nothing is sent anywhere. It is what
   the games list reads, what the profile counts, and what the review board
   loads when you open an old game to go over it.

   Moves are kept in the same short form the by-message mode uses, so a whole
   game is a few dozen characters and a few hundred games are a few pages of
   text.
   ============================================================================ */
(function (root) {
  "use strict";

  var KEY = "unc.games";
  var LIMIT = 400;             /* the last four hundred games are kept */

  function read() {
    try {
      var got = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(got) ? got : [];
    } catch (e) { return []; }
  }
  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, LIMIT))); } catch (e) {}
  }

  /* `game` wants: mode, result (win|loss|draw), side, moves, opponent, rated,
     ratings { before, after, change }, ending, clock, code */
  function add(game) {
    var list = read();
    var row = {
      id: "g" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      at: Date.now(),
      mode: game.mode || "local",
      result: game.result || "draw",
      side: game.side === 2 ? 2 : 1,
      ending: game.ending || "board",
      moves: game.moves || "",
      plies: game.plies | 0,
      opponent: game.opponent || null,
      rated: !!game.rated,
      before: game.before | 0,
      after: game.after | 0,
      change: game.change | 0,
      clock: game.clock || null
    };
    list.unshift(row);
    write(list);
    return row;
  }

  function all() { return read(); }

  function get(id) {
    var list = read();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function against(rivalId) {
    return read().filter(function (g) { return g.opponent && g.opponent.id === rivalId; });
  }

  function forget() { try { localStorage.removeItem(KEY); } catch (e) {} }

  /* ---- what the numbers say -------------------------------------------- */
  function summary(list) {
    var games = list || read();
    var out = {
      played: games.length, wins: 0, draws: 0, losses: 0,
      rated: 0, asX: 0, asO: 0, winsAsX: 0, winsAsO: 0,
      byTime: 0, plies: 0, best: null, worst: null, streak: 0, longest: 0
    };
    var run = 0;
    games.forEach(function (g) {
      if (g.result === "win") out.wins++;
      else if (g.result === "loss") out.losses++;
      else out.draws++;
      if (g.rated) out.rated++;
      if (g.side === 1) { out.asX++; if (g.result === "win") out.winsAsX++; }
      else { out.asO++; if (g.result === "win") out.winsAsO++; }
      if (g.ending === "time") out.byTime++;
      out.plies += g.plies | 0;
      if (g.rated && (!out.best || g.change > out.best.change)) out.best = g;
      if (g.rated && (!out.worst || g.change < out.worst.change)) out.worst = g;
    });
    /* newest first, so the current run is at the front */
    for (var i = 0; i < games.length; i++) {
      if (games[i].result !== "win") break;
      out.streak++;
    }
    games.forEach(function (g) {
      run = g.result === "win" ? run + 1 : 0;
      if (run > out.longest) out.longest = run;
    });
    out.rate = out.played ? Math.round((out.wins + out.draws / 2) / out.played * 100) : 0;
    out.averageLength = out.played ? Math.round(out.plies / out.played) : 0;
    return out;
  }

  /* Your rating after each rated game, oldest first, for the graph. */
  function ratingLine(start) {
    var line = [{ at: 0, rating: start }];
    read().slice().reverse().forEach(function (g) {
      if (g.rated) line.push({ at: g.at, rating: g.after, change: g.change, id: g.id });
    });
    return line;
  }

  /* How many games a day for the last `days` days, oldest first. */
  function recent(days) {
    var n = days || 30, day = 86400000;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var first = today.getTime() - (n - 1) * day;
    var buckets = [];
    for (var i = 0; i < n; i++) buckets.push({ at: first + i * day, games: 0, wins: 0 });
    read().forEach(function (g) {
      var i = Math.floor((g.at - first) / day);
      if (i >= 0 && i < n) {
        buckets[i].games++;
        if (g.result === "win") buckets[i].wins++;
      }
    });
    return buckets;
  }

  root.UNC = root.UNC || {};
  root.UNC.archive = {
    add: add, all: all, get: get, against: against, forget: forget,
    summary: summary, ratingLine: ratingLine, recent: recent, LIMIT: LIMIT
  };
})(typeof window !== "undefined" ? window : globalThis);
