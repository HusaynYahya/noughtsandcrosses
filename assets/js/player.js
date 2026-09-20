/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — who you are, and how well you play
   ----------------------------------------------------------------------------
   There is no server behind this site, so there is no account either. You are
   whoever this browser says you are: a name you chose, an id it made up, and a
   rating it has been keeping since your first game. That is enough for
   everything a chess site does with an account except one thing — nobody else
   can vouch for it. Ratings are exchanged with the people you play and agreed
   between the two of you; what you see is your circle, honestly kept, not a
   world ladder policed by anybody.

   Rating is ordinary Elo, the chess one, with the same shrinking K that the
   chess sites use: fast to find your level, slow to wander once it has.
   ============================================================================ */
(function (root) {
  "use strict";

  var ME = "unc.me", RIVALS = "unc.rivals";
  var START = 1200;            /* everybody's first rating */
  var PROVISIONAL = 10;        /* games before a rating is taken seriously */

  var ADJECTIVE = ("quick clever quiet bold steady sharp patient bright canny " +
    "keen nimble calm wily").split(" ");
  var CREATURE = ("falcon otter heron badger marten kestrel hare raven lynx " +
    "swift pika ibex").split(" ");

  function read(key, fallback) {
    try {
      var got = JSON.parse(localStorage.getItem(key) || "null");
      return got && typeof got === "object" ? got : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }
  function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

  /* ---- you ------------------------------------------------------------- */
  var me = null;

  function whoAmI() {
    if (me) return me;
    me = read(ME, null);
    if (!me || !me.id) {
      me = {
        id: "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        name: pick(ADJECTIVE) + "-" + pick(CREATURE),
        rating: START, games: 0, wins: 0, draws: 0, losses: 0,
        best: START, streak: 0, since: Date.now()
      };
      write(ME, me);
    }
    me.rating = me.rating || START;
    return me;
  }

  function rename(name) {
    var tidy = String(name || "").replace(/\s+/g, " ").trim().slice(0, 20);
    if (!tidy) return whoAmI().name;
    whoAmI().name = tidy;
    write(ME, me);
    return tidy;
  }

  function save() { write(ME, whoAmI()); }

  /* Who to show, and who to introduce yourself as. When this browser is
     signed in to a server, that account is who you are — its name and its
     rating are the ones other people can check — and this browser's own book
     goes back to being a private record of games played without one. */
  function account() {
    var a = root.UNC && root.UNC.account;
    var signed = a && a.configured() && a.me();
    return signed || null;
  }

  function who() {
    var them = account();
    if (!them) return whoAmI();
    return { id: "s" + them.id, name: them.name, rating: them.rating,
             games: them.games, wins: them.wins, draws: them.draws,
             losses: them.losses, best: them.best, since: them.since,
             server: true };
  }

  /* the short form that travels to the other player */
  function card() {
    var m = who();
    return { id: m.id, name: m.name, rating: Math.round(m.rating), games: m.games };
  }

  function provisional(who) { return (who && who.games || 0) < PROVISIONAL; }

  /* ---- Elo ------------------------------------------------------------- */
  /* Expected score: how often the first player would win, by the ratings
     alone. Four hundred points is ten to one. */
  function expected(mine, theirs) {
    return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  }

  /* Big steps while a rating is new, smaller once it has settled, smaller
     still at the top — the same shape the chess federations use. */
  function step(who) {
    if ((who.games || 0) < PROVISIONAL) return 40;
    if ((who.rating || START) >= 2100) return 16;
    return 24;
  }

  /* `score` is 1 for a win, 0.5 for a draw, 0 for a loss. Returns what the
     rating becomes — the same arithmetic runs on both machines, from the same
     two numbers, so the two sides agree without being told. */
  function after(who, theirRating, score) {
    var now = who.rating || START;
    return Math.round(now + step(who) * (score - expected(now, theirRating)));
  }

  /* ---- a game finished ------------------------------------------------- */
  /* `score` is from your side. `rival` is their card, or null for a game
     against the computer or across the table, which is kept but not rated. */
  function finished(score, rival, rated) {
    var m = whoAmI();
    var before = Math.round(m.rating);
    var change = 0;

    m.games++;
    if (score === 1) { m.wins++; m.streak = m.streak >= 0 ? m.streak + 1 : 1; }
    else if (score === 0) { m.losses++; m.streak = m.streak <= 0 ? m.streak - 1 : -1; }
    else { m.draws++; m.streak = 0; }

    if (rated && rival && typeof rival.rating === "number") {
      var next = after(m, rival.rating, score);
      change = next - before;
      m.rating = next;
      if (next > (m.best || START)) m.best = next;
      noteRival(rival, score, before);
    } else if (rival) {
      noteRival(rival, score, before);
    }
    save();
    return { before: before, after: Math.round(m.rating), change: change };
  }

  /* ---- everybody you have played --------------------------------------- */
  function rivals() { return read(RIVALS, {}); }

  function noteRival(card_, score, myRatingBefore) {
    if (!card_ || !card_.id) return;
    var all = rivals();
    var r = all[card_.id] || { id: card_.id, games: 0, wins: 0, draws: 0, losses: 0 };
    r.name = card_.name || r.name || "someone";
    /* their rating after this game, worked out from their side of it */
    if (typeof card_.rating === "number") {
      r.rating = after({ rating: card_.rating, games: card_.games || 0 },
                       myRatingBefore, 1 - score);
    }
    r.games++;
    if (score === 1) r.losses++;            /* my win is their loss */
    else if (score === 0) r.wins++;
    else r.draws++;
    r.last = Date.now();
    all[card_.id] = r;
    write(RIVALS, all);
  }

  /* Somebody seen in the lobby, or met in a room: worth remembering even
     before a game is played, so the leaderboard knows they exist. */
  function seen(card_) {
    if (!card_ || !card_.id || card_.id === whoAmI().id) return;
    var all = rivals();
    var r = all[card_.id] || { id: card_.id, games: 0, wins: 0, draws: 0, losses: 0 };
    r.name = card_.name || r.name || "someone";
    if (typeof card_.rating === "number" && !r.games) r.rating = card_.rating;
    r.seen = Date.now();
    all[card_.id] = r;
    write(RIVALS, all);
  }

  /* ---- the table ------------------------------------------------------- */
  /* You and everybody you know about, strongest first. */
  function table() {
    var m = whoAmI();
    var rows = [{
      id: m.id, name: m.name, rating: Math.round(m.rating), games: m.games,
      wins: m.wins, draws: m.draws, losses: m.losses, you: true,
      provisional: provisional(m)
    }];
    var all = rivals();
    Object.keys(all).forEach(function (id) {
      var r = all[id];
      rows.push({
        id: id, name: r.name, rating: Math.round(r.rating || START),
        games: r.games || 0, wins: r.wins || 0, draws: r.draws || 0,
        losses: r.losses || 0, you: false, seen: r.seen, last: r.last,
        provisional: (r.games || 0) < PROVISIONAL
      });
    });
    rows.sort(function (a, b) {
      return b.rating - a.rating || b.games - a.games || a.name.localeCompare(b.name);
    });
    rows.forEach(function (r, i) { r.place = i + 1; });
    return rows;
  }

  function forget() {
    try { localStorage.removeItem(ME); localStorage.removeItem(RIVALS); } catch (e) {}
    me = null;
  }

  root.UNC = root.UNC || {};
  root.UNC.player = {
    me: whoAmI, who: who, account: account, card: card, rename: rename, save: save,
    finished: finished, seen: seen, rivals: rivals, table: table,
    expected: expected, after: after, provisional: provisional,
    forget: forget, START: START, PROVISIONAL: PROVISIONAL
  };
})(typeof window !== "undefined" ? window : globalThis);
