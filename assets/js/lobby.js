/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the lobby
   ----------------------------------------------------------------------------
   A private room needs a code passed between two people who already know each
   other. The lobby is the other way in: an open board where anybody waiting
   for a game says so, and anybody wanting one picks a name off the list. It is
   how a chess site pairs strangers, minus the server — there is only the same
   message service the games run over, and one public topic on it that everyone
   listens to.

   What is on that topic is public by design: a name, a rating, a time control
   and a room code. Nothing is sealed, because the whole point is that people
   you have never met can read it. Your private games never touch it — those
   have their own hashed topic and their own key. You are only in the lobby
   while a page of yours is showing it.

   A seek is an offer with a room already waiting behind it: whoever takes it
   goes to that room, where the person who posted it is already sitting.
   ============================================================================ */
(function (root) {
  "use strict";

  var TOPIC = "unc1/lobby1";
  var BEAT = 5000;             /* how often to say we are still here */
  var GONE = 16000;            /* how long before somebody counts as gone */
  var SWEEP = 2000;

  function now() { return Date.now(); }

  function join(handlers) {
    var h = handlers || {};
    var client = null, closed = false, beat = null, sweep = null;
    var people = {};           /* id -> { who, at } */
    var seeks = {};            /* id -> { seek, at } */
    var mine = null;           /* the seek we are offering, if any */

    var api = {
      /* offer a game: { room, tc, side } — the room is already ours */
      post: function (seek) {
        mine = seek || null;
        say();
        return mine;
      },
      drop: function () {
        if (mine) { send({ t: "gone", id: me().id }); mine = null; say(); }
      },
      /* somebody's seek was taken by us — tell the room so it leaves the list */
      take: function (seek) {
        send({ t: "take", seek: seek.id, who: me() });
      },
      list: function () { return current(); },
      /* everybody whose beat we have heard lately, offer or no offer */
      everyone: function () {
        return Object.keys(people).filter(function (id) {
          return now() - people[id].at < GONE;
        }).map(function (id) { return people[id].who; });
      },
      people: function () { return Object.keys(people).length + 1; },
      connected: function () { return !!(client && client.connected); },
      close: function () {
        if (mine) api.drop();
        closed = true;
        if (beat) clearInterval(beat);
        if (sweep) clearInterval(sweep);
        if (client) { try { client.end(true); } catch (e) {} client = null; }
      }
    };

    function me() { return root.UNC.player.card(); }

    function send(msg) {
      if (!client || !client.connected) return;
      try { client.publish(TOPIC, JSON.stringify(msg), { qos: 0 }); } catch (e) {}
    }

    /* who we are, and what we are offering if anything */
    function say() {
      send({ t: "here", who: me(), seek: mine ? withId(mine) : null });
    }

    function withId(seek) {
      seek.id = seek.id || me().id;      /* one seek each: your own id names it */
      seek.at = seek.at || now();
      return seek;
    }

    function current() {
      var out = [];
      Object.keys(seeks).forEach(function (id) {
        if (now() - seeks[id].at < GONE) out.push(seeks[id].seek);
      });
      out.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      return out;
    }

    function tell() {
      if (h.list) h.list(current(), api.people());
    }

    function heard(text) {
      var msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (!msg || typeof msg !== "object") return;

      if (msg.t === "gone") {
        delete seeks[String(msg.id || "").slice(0, 40)];
        tell();
        return;
      }

      var who = msg.who;
      if (!who || typeof who.id !== "string" || who.id === me().id) return;
      /* everything below is somebody else's typing: cut it to size and let the
         page escape it before it goes anywhere near the screen */
      who = {
        id: String(who.id).slice(0, 40),
        name: String(who.name || "someone").slice(0, 20),
        rating: Math.max(0, Math.min(4000, who.rating | 0)),
        games: Math.max(0, who.games | 0)
      };

      if (msg.t === "here") {
        people[who.id] = { who: who, at: now() };
        if (root.UNC.player.seen) root.UNC.player.seen(who);
        if (msg.seek && typeof msg.seek.room === "string") {
          seeks[who.id] = {
            at: now(),
            seek: {
              id: who.id, who: who, at: msg.seek.at || now(),
              room: String(msg.seek.room).slice(0, 60),
              tc: String(msg.seek.tc || "unlimited").slice(0, 24),
              side: msg.seek.side === "O" ? "O" : msg.seek.side === "X" ? "X" : "either"
            }
          };
        } else delete seeks[who.id];
        tell();
        return;
      }
      if (msg.t === "take") {
        delete seeks[String(msg.seek).slice(0, 40)];
        tell();
        /* ours has been taken: whoever is watching wants to know */
        if (mine && msg.seek === me().id && h.taken) h.taken(who, mine);
        return;
      }
    }

    root.UNC.live.load().then(function (mqtt) {
      var list = root.UNC.live.brokers();
      (function attach() {
        if (!list.length || closed) {
          if (h.status) h.status("The lobby could not be reached from this network.", "error");
          return;
        }
        var url = list.shift(), settled = false;
        var c = mqtt.connect(url, { clean: true, connectTimeout: 6000, reconnectPeriod: 4000 });
        var giveUp = setTimeout(function () {
          if (settled) return;
          settled = true;
          try { c.end(true); } catch (e) {}
          attach();
        }, 7000);
        c.on("connect", function () {
          if (closed) { try { c.end(true); } catch (e) {} return; }
          client = c;
          settled = true;
          clearTimeout(giveUp);
          c.subscribe(TOPIC, { qos: 0 }, function () {
            say();
            if (h.status) h.status("In the lobby.", "live");
            tell();
          });
          if (beat) clearInterval(beat);
          beat = setInterval(function () { if (!closed) say(); }, BEAT);
          if (sweep) clearInterval(sweep);
          sweep = setInterval(function () {
            var changed = false;
            Object.keys(people).forEach(function (id) {
              if (now() - people[id].at > GONE) { delete people[id]; changed = true; }
            });
            Object.keys(seeks).forEach(function (id) {
              if (now() - seeks[id].at > GONE) { delete seeks[id]; changed = true; }
            });
            if (changed) tell();
          }, SWEEP);
        });
        c.on("message", function (_, payload) { heard(payload.toString()); });
        c.on("error", function () {
          if (settled) return;
          settled = true;
          clearTimeout(giveUp);
          try { c.end(true); } catch (e) {}
          attach();
        });
      })();
    }, function () {
      if (h.status) h.status("The lobby could not be reached from this network.", "error");
    });

    /* a page being closed should not leave a ghost sitting in the list */
    root.addEventListener("pagehide", function () { api.close(); });

    return api;
  }

  root.UNC = root.UNC || {};
  root.UNC.lobby = { join: join, TOPIC: TOPIC };
})(typeof window !== "undefined" ? window : globalThis);
