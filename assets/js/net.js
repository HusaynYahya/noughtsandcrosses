/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — private games between two browsers
   ----------------------------------------------------------------------------
   There is no server behind this game. One player opens a private room and
   gets a four-word code; the other types that code in. The two browsers then
   talk to each other directly over WebRTC, and the moves never pass through
   anybody's database. A public signalling broker is used for the introduction
   only — it learns the room code and nothing else.

   The player who opened the room is the referee: their copy of the game is the
   real one. The other browser sends its moves across and is sent the position
   back, so the two can never drift apart.

   PeerJS is fetched from a CDN the first time somebody asks to play online.
   Until then this page loads nothing from anywhere else.
   ============================================================================ */
(function (root) {
  "use strict";

  var PEERJS_SRC = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
  var PREFIX = "unc-v1-";        /* keeps our room codes clear of other apps */

  /* Words chosen to be easy to read out over the phone. */
  var WORDS = ("amber anchor basil beacon bishop brass cedar cobalt copper coral " +
    "delta ember falcon flint garnet harbour indigo ivory jasper kestrel lantern " +
    "lilac maple marble meadow nectar oak onyx opal pewter quartz raven rowan " +
    "saffron sable sienna slate sorrel tangle teal thistle topaz umber velvet " +
    "walnut willow zephyr").split(" ");

  function coin(n) { return Math.floor(Math.random() * n); }

  function makeCode() {
    var out = [];
    for (var i = 0; i < 4; i++) out.push(WORDS[coin(WORDS.length)]);
    return out.join("-");
  }

  function tidyCode(raw) {
    return String(raw || "").toLowerCase().trim()
      .replace(/^.*#/, "")           /* let somebody paste the whole link */
      .replace(/[^a-z]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  /* ---- loading PeerJS on demand ---------------------------------------- */
  var loading = null;
  function loadPeer() {
    if (root.Peer) return Promise.resolve(root.Peer);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = PEERJS_SRC;
      s.async = true;
      s.onload = function () {
        root.Peer ? resolve(root.Peer)
                  : reject(new Error("The connection library did not load."));
      };
      s.onerror = function () {
        loading = null;
        reject(new Error("Could not reach the connection library. Check your internet."));
      };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ---- a session ------------------------------------------------------- */
  /* handlers: { status, open, message, close, error } */
  /* How the drop-out check works: each side sends a quiet beat every few
     seconds. If nothing at all arrives for a while, the line is treated as
     dead — a phone going into a tunnel does not always close the connection
     tidily, and a game that silently stops taking moves is worse than one
     that says so. */
  var BEAT_MS = 4000, SILENCE_MS = 14000;

  function session(handlers) {
    var h = handlers || {};
    var peer = null, conn = null, closed = false;
    var beat = null, watch = null, lastHeard = 0;

    function startBeat() {
      lastHeard = Date.now();
      stopBeat();
      beat = setInterval(function () {
        if (conn && conn.open) conn.send(JSON.stringify({ t: "beat" }));
      }, BEAT_MS);
      watch = setInterval(function () {
        if (conn && Date.now() - lastHeard > SILENCE_MS) dropped();
      }, 2000);
    }
    function stopBeat() {
      if (beat) { clearInterval(beat); beat = null; }
      if (watch) { clearInterval(watch); watch = null; }
    }
    function dropped() {
      if (closed || !conn) return;
      try { conn.close(); } catch (e) {}
      conn = null;
      stopBeat();
      say(api.role === "host"
        ? "Your friend has dropped out. The room is still open — they can rejoin with the same code."
        : "The connection dropped. Press Join to pick the game back up.", "error");
      if (h.close) h.close();
    }

    function say(text, kind) { if (h.status) h.status(text, kind || "waiting"); }

    function wire(c) {
      conn = c;
      c.on("open", function () {
        if (closed) return;
        startBeat();
        say("Connected.", "live");
        if (h.open) h.open();
      });
      c.on("data", function (raw) {
        if (closed) return;
        lastHeard = Date.now();
        if (!h.message) return;
        var msg = raw;
        if (typeof raw === "string") { try { msg = JSON.parse(raw); } catch (e) { return; } }
        if (msg && typeof msg === "object" && typeof msg.t === "string" && msg.t !== "beat") {
          h.message(msg);
        }
      });
      c.on("close", function () {
        if (closed || !conn) return;
        conn = null;
        stopBeat();
        say(api.role === "host"
          ? "Your friend has left. The room is still open — they can rejoin with the same code."
          : "Your friend has closed the game.", "waiting");
        if (h.close) h.close();
      });
      c.on("error", function () { /* reported through the close handler */ });
    }

    var api = {
      code: null,
      role: null,

      host: function () {
        api.role = "host";
        api.code = makeCode();
        say("Opening the room…");
        return loadPeer().then(function (Peer) {
          return new Promise(function (resolve, reject) {
            peer = new Peer(PREFIX + api.code, { debug: 0 });
            peer.on("open", function () {
              say("Waiting for your friend to join…");
              resolve(api.code);
            });
            peer.on("connection", function (c) {
              if (conn && conn.open) { c.close(); return; }   /* room is for two */
              wire(c);
            });
            peer.on("error", function (err) {
              if (err && err.type === "unavailable-id") {
                /* astronomically unlikely, but take a fresh code and retry */
                api.code = makeCode();
                peer.destroy();
                api.host().then(resolve, reject);
                return;
              }
              fail(err, reject);
            });
          });
        });
      },

      join: function (rawCode) {
        api.role = "guest";
        api.code = tidyCode(rawCode);
        if (!api.code) return Promise.reject(new Error("Type the room code first."));
        say("Looking for the room…");
        return loadPeer().then(function (Peer) {
          return new Promise(function (resolve, reject) {
            peer = new Peer({ debug: 0 });
            peer.on("open", function () {
              wire(peer.connect(PREFIX + api.code, { reliable: true }));
              /* If nobody is listening, PeerJS reports it through peer error. */
              setTimeout(function () {
                if (!closed && (!conn || !conn.open)) {
                  say("Still knocking… make sure the code is exactly right.", "waiting");
                }
              }, 6000);
              resolve(api.code);
            });
            peer.on("error", function (err) {
              if (err && err.type === "peer-unavailable") {
                fail(new Error("No room with that code. Check it, and that your " +
                               "friend still has the page open."), reject);
                return;
              }
              fail(err, reject);
            });
          });
        });
      },

      send: function (msg) {
        if (conn && conn.open) { conn.send(JSON.stringify(msg)); return true; }
        return false;
      },

      connected: function () { return !!(conn && conn.open); },

      link: function () {
        return location.origin + location.pathname + "#" + api.code;
      },

      close: function () {
        closed = true;
        stopBeat();
        if (conn) { try { conn.close(); } catch (e) {} conn = null; }
        if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
      }
    };

    function fail(err, reject) {
      var message = (err && err.message) || "The connection failed.";
      say(message, "error");
      if (h.error) h.error(err);
      if (reject) reject(err instanceof Error ? err : new Error(message));
    }

    return api;
  }

  root.UNC = root.UNC || {};
  root.UNC.net = { session: session, makeCode: makeCode, tidyCode: tidyCode };
})(typeof window !== "undefined" ? window : globalThis);
