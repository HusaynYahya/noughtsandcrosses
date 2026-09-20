/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — talking to the server
   ----------------------------------------------------------------------------
   Two halves. The first is ordinary requests: sign up, sign in, the ladder, a
   player, a game. The second is one long-lived socket, which is where anything
   live happens — the lobby, being paired, and every move of a game.

   The token is kept in this browser and sent as a bearer header. It is never a
   cookie, so there is nothing for another site to make your browser send on
   your behalf, and the server keeps only a hash of it.

   If no server is set, everything here politely says so and the site falls
   back to the way it works on its own.
   ============================================================================ */
(function (root) {
  "use strict";

  var KEY = "unc.token", WHO = "unc.account", WHERE = "unc.server";

  function base() {
    var asked = new URLSearchParams(location.search).get("server");
    if (asked !== null) {
      try { asked ? localStorage.setItem(WHERE, asked) : localStorage.removeItem(WHERE); } catch (e) {}
    }
    var saved = "";
    try { saved = localStorage.getItem(WHERE) || ""; } catch (e) {}
    return String(saved || root.UNC_SERVER || "").replace(/\/+$/, "");
  }

  function token() {
    try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; }
  }
  function keep(t, me) {
    try {
      if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY);
      if (me) localStorage.setItem(WHO, JSON.stringify(me)); else localStorage.removeItem(WHO);
    } catch (e) {}
    cached = me || null;
  }
  var cached = null;
  function me() {
    if (cached) return cached;
    try { cached = JSON.parse(localStorage.getItem(WHO) || "null"); } catch (e) { cached = null; }
    return cached;
  }

  function ask(path, options) {
    var where = base();
    if (!where) return Promise.reject(new Error("No server is set for this site."));
    var opts = options || {};
    var headers = { "Content-Type": "application/json" };
    if (token()) headers.Authorization = "Bearer " + token();
    return fetch(where + path, {
      method: opts.body ? "POST" : "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (body) {
        if (!res.ok) {
          var err = new Error(body.error || "The server said no (" + res.status + ").");
          err.status = res.status;
          throw err;
        }
        return body;
      });
    }, function () {
      throw new Error("The server did not answer. It may be asleep or unreachable.");
    });
  }

  function join(name, password, isNew) {
    return ask(isNew ? "/api/register" : "/api/login", { body: { name: name, password: password } })
      .then(function (got) {
        keep(got.token, got.me);
        return got.me;
      });
  }

  function leave() {
    var going = token() ? ask("/api/logout", { body: {} }).catch(function () {}) : Promise.resolve();
    return going.then(function () { keep("", null); });
  }

  /* who the server thinks we are, which is the only opinion that counts */
  function refresh() {
    if (!token()) return Promise.resolve(null);
    return ask("/api/me").then(function (got) {
      keep(token(), got.me);
      return got.me;
    }, function (err) {
      if (err.status === 401) keep("", null);
      return null;
    });
  }

  /* ---- the live socket --------------------------------------------------- */
  /* One socket for the lobby and for whatever game is being played; it comes
     back by itself if the connection drops, and says hello again when it does,
     which is also how a game in progress is picked back up. */
  function socket(handlers) {
    var h = handlers || {};
    var wire = null, shut = false, tries = 0, beat = null;

    function url() {
      var where = base();
      return where.replace(/^http/, "ws") + "/ws";
    }

    function open() {
      if (shut || !base() || !token()) return;
      try { wire = new WebSocket(url()); } catch (e) { return later(); }

      wire.onopen = function () {
        tries = 0;
        wire.send(JSON.stringify({ t: "hello", token: token() }));
        if (h.up) h.up();
        clearInterval(beat);
        beat = setInterval(function () { api.send({ t: "ping" }); }, 25000);
      };
      wire.onmessage = function (ev) {
        var msg;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        if (msg.t === "welcome" && msg.me) keep(token(), msg.me);
        if (msg.t === "error" && msg.fatal) { keep("", null); shut = true; }
        if (h.message) h.message(msg);
      };
      wire.onclose = function () {
        clearInterval(beat);
        wire = null;
        if (h.down) h.down();
        later();
      };
      wire.onerror = function () { /* onclose does the work */ };
    }

    function later() {
      if (shut) return;
      tries++;
      setTimeout(open, Math.min(15000, 600 * Math.pow(2, Math.min(tries, 5))));
    }

    var api = {
      send: function (msg) {
        if (!wire || wire.readyState !== 1) return false;
        wire.send(JSON.stringify(msg));
        return true;
      },
      live: function () { return !!wire && wire.readyState === 1; },
      close: function () {
        shut = true;
        clearInterval(beat);
        if (wire) { try { wire.close(); } catch (e) {} wire = null; }
      }
    };
    open();
    return api;
  }

  root.UNC = root.UNC || {};
  root.UNC.account = {
    where: base, configured: function () { return !!base(); },
    token: token, me: me, forget: function () { keep("", null); },
    join: join, leave: leave, refresh: refresh, ask: ask, socket: socket
  };
})(typeof window !== "undefined" ? window : globalThis);
