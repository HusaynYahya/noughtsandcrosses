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

  /* The library is kept in this repository and served from the same place as
     the game, so a blocked or unreachable CDN cannot stop a room opening. The
     CDN is only there in case the local copy is somehow missing. */
  var PEERJS_SRC = "assets/vendor/peerjs-1.5.4.min.js";
  var PEERJS_FALLBACK = "https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js";
  var PREFIX = "unc-v1-";        /* keeps our room codes clear of other apps */

  /* Words chosen to be easy to read out over the phone. */
  var WORDS = ("amber anchor basil beacon bishop brass cedar cobalt copper coral " +
    "delta ember falcon flint garnet harbour indigo ivory jasper kestrel lantern " +
    "lilac maple marble meadow nectar oak onyx opal pewter quartz raven rowan " +
    "saffron sable sienna slate sorrel tangle teal thistle topaz umber velvet " +
    "walnut willow zephyr").split(" ");

  var WORD_SET = {};
  WORDS.forEach(function (w) { WORD_SET[w] = true; });

  function coin(n) { return Math.floor(Math.random() * n); }

  function makeCode() {
    var out = [];
    for (var i = 0; i < 4; i++) out.push(WORDS[coin(WORDS.length)]);
    return out.join("-");
  }

  /* People paste all sorts of things in here: the bare code, the whole link,
     the entire invitation message, or the words read out with spaces and
     capitals. Pull the four code words out of whatever arrives. */
  function tidyCode(raw) {
    var text = String(raw || "").toLowerCase();
    var hash = text.lastIndexOf("#");
    if (hash > -1) text = text.slice(hash + 1);          /* prefer the link's code */
    var words = text.split(/[^a-z]+/).filter(Boolean);
    var known = words.filter(function (w) { return WORD_SET[w]; });
    /* Codes are built from a known list, so the real words can be picked out
       of surrounding chatter such as "(room code: …)". If the code has been
       mistyped, fall back to the first four words so the message back can
       name exactly what was read. */
    var use = known.length >= 4 ? known.slice(0, 4) : words.slice(0, 4);
    return use.join("-");
  }

  /* ---- loading PeerJS on demand ---------------------------------------- */
  var loading = null;
  function loadPeer() {
    if (root.Peer) return Promise.resolve(root.Peer);
    if (loading) return loading;
    loading = fetchScript(PEERJS_SRC).catch(function () {
      return fetchScript(PEERJS_FALLBACK);
    }).catch(function (err) {
      loading = null;
      throw err;
    });
    return loading;
  }

  function fetchScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        root.Peer ? resolve(root.Peer)
                  : reject(new Error("The connection library loaded but was empty."));
      };
      s.onerror = function () {
        reject(new Error("Could not load the connection library from " + src + "."));
      };
      document.head.appendChild(s);
    });
  }

  /* ---- a session ------------------------------------------------------- */
  /* handlers: { status, open, message, close, error } */
  /* How the drop-out check works: each side sends a quiet beat every few
     seconds. If nothing at all arrives for a while, the line is treated as
     dead — a phone going into a tunnel does not always close the connection
     tidily, and a game that silently stops taking moves is worse than one
     that says so. */
  var BEAT_MS = 4000, SILENCE_MS = 14000;
  var KNOCK_MS = 7000, TRIES = 4;   /* how long, and how often, to knock */

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
        if (closed || conn !== c) return;
        startBeat();
        say("Connected.", "live");
        if (h.open) h.open();
      });
      c.on("data", function (raw) {
        if (closed || conn !== c) return;
        lastHeard = Date.now();
        if (!h.message) return;
        var msg = raw;
        if (typeof raw === "string") { try { msg = JSON.parse(raw); } catch (e) { return; } }
        if (msg && typeof msg === "object" && typeof msg.t === "string" && msg.t !== "beat") {
          h.message(msg);
        }
      });
      c.on("close", function () {
        if (closed || conn !== c) return;
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
            var tries = 0, timer = null;

            peer = new Peer({ debug: 0 });
            peer.on("open", function () { knock(); resolve(api.code); });
            peer.on("error", function (err) {
              /* The room not being registered yet is worth another knock —
                 the broker can take a moment to catch up with a new room. */
              if (err && err.type === "peer-unavailable") { again(); return; }
              fail(err, reject);
            });

            function knock() {
              if (closed) return;
              tries++;
              say(tries === 1 ? "Knocking on the room door…"
                              : "Still knocking — attempt " + tries + " of " + TRIES + "…");
              var c = peer.connect(PREFIX + api.code, { reliable: true });
              wire(c);
              clearTimeout(timer);
              timer = setTimeout(function () {
                if (closed || (conn && conn.open)) return;
                try { c.close(); } catch (e) {}
                again();
              }, KNOCK_MS);
            }

            function again() {
              if (closed || (conn && conn.open)) return;
              clearTimeout(timer);
              if (tries < TRIES) { setTimeout(knock, 900); return; }
              var why = new Error("No room called \u201c" + api.code + "\u201d. Check the " +
                "code is exactly right, and that your friend still has the page open.");
              say(why.message, "error");
              if (h.error) h.error(why);
            }
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

  /* ---- when it will not connect ---------------------------------------- */
  /* Three things have to work for a private room: the connection library has
     to load, the public matchmaking service has to answer, and this network
     has to let two browsers reach each other directly. This checks them one at
     a time and says which one is the trouble, rather than leaving somebody
     staring at "still knocking". */
  function diagnose(onStep) {
    var results = [];
    function note(name, ok, detail) {
      results.push({ name: name, ok: ok, detail: detail });
      if (onStep) onStep(results.slice(), false);
      return results;
    }

    var libOk = false;
    return loadPeer().then(function () {
      libOk = true;
      note("The connection library", true, "loaded");
    }, function (err) {
      note("The connection library", false, err.message);
    }).then(function () {
      /* no point asking the matchmaking service anything without it */
      return libOk ? broker() : null;
    }).then(function () {
      return reachable();               /* this one stands on its own */
    }).then(function () {
      if (onStep) onStep(results.slice(), true);
      return results;
    }, function () {
      if (onStep) onStep(results.slice(), true);
      return results;
    });

    /* does the matchmaking service answer, and give us an address? */
    function broker() {
      return new Promise(function (done) {
        var peer, settled = false;
        var timer = setTimeout(function () { finish(false, "no answer within 12 seconds"); }, 12000);
        try { peer = new root.Peer({ debug: 0 }); }
        catch (e) { finish(false, e.message); return; }
        peer.on("open", function (id) { finish(true, "answered, and called this browser " + id); });
        peer.on("error", function (err) {
          finish(false, (err && err.type ? err.type : "failed") +
            (err && err.message ? " — " + err.message : ""));
        });
        function finish(ok, detail) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { peer && peer.destroy(); } catch (e) {}
          note("The matchmaking service", ok, ok ? detail :
            detail + ". It is a free public service and does go down; if the rest " +
            "passes, waiting a while is usually all it takes.");
          done();
        }
      });
    }

    /* can this network see itself from the outside? without that, two
       browsers behind different routers cannot meet */
    function reachable() {
      return new Promise(function (done) {
        var RTC = root.RTCPeerConnection || root.webkitRTCPeerConnection;
        if (!RTC) { note("This browser's connection support", false, "WebRTC is not available"); done(); return; }
        var pc, settled = false, found = false;
        try {
          pc = new RTC({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
          pc.createDataChannel("probe");
        } catch (e) { finish("could not start: " + e.message); return; }

        var timer = setTimeout(function () { finish(null); }, 8000);
        pc.onicecandidate = function (ev) {
          if (!ev.candidate) { finish(null); return; }
          if (ev.candidate.type === "srflx" ||
              /typ srflx/.test(ev.candidate.candidate || "")) { found = true; finish(null); }
        };
        pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
          .catch(function (e) { finish("could not start: " + e.message); });

        function finish(why) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { pc && pc.close(); } catch (e) {}
          note("This network", found, why ? why : found
            ? "lets this browser be reached from outside"
            : "did not let this browser find its own address from outside. Some " +
              "office and mobile networks block that, and a direct connection " +
              "cannot be made through them.");
          done();
        }
      });
    }
  }

  root.UNC = root.UNC || {};
  root.UNC.net = { session: session, makeCode: makeCode, tidyCode: tidyCode, diagnose: diagnose };
})(typeof window !== "undefined" ? window : globalThis);
