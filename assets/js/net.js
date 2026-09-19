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

  /* How two browsers find a way to each other. The STUN servers let each side
     learn how it looks from outside; that is enough for most home networks.
     Where it is not — a lot of mobile networks, and offices — nothing direct
     can be arranged at all, and the traffic has to be bounced through a relay.
     The relays below are free and public. They carry the moves but cannot read
     them: a data channel is encrypted end to end, so a relay only ever handles
     ciphertext. */
  var ICE = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject", credential: "openrelayproject" },
      { urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject", credential: "openrelayproject" }
    ]
  };
  var PEER_OPTS = { debug: 0, config: ICE };

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
    var room = /[?&]room=([^&#\s]+)/.exec(text);
    if (room) text = room[1];                            /* ?room=… survives sharing */
    else {
      var hash = text.lastIndexOf("#");
      if (hash > -1) text = text.slice(hash + 1);        /* …and #… when it does */
    }
    var words = text.split(/[^a-z]+/).filter(Boolean);
    var known = words.filter(function (w) { return WORD_SET[w]; });
    /* Codes are built from a known list, so the real words can be picked out
       of surrounding chatter such as "(room code: …)". If the code has been
       mistyped, fall back to the first four words so the message back can
       name exactly what was read. */
    var use = known.length >= 4 ? known.slice(0, 4) : words.slice(0, 4);
    return use.join("-");
  }

  /* Reading a code out of the page's own address is a stricter business than
     reading one a person typed. Anything can end up in a query string — the
     tracking junk messaging apps add, for one — and inventing a room code out
     of it means quietly holding a room open at an address nobody else will
     ever guess. A real code is four words from the list, so at least three of
     them have to be. */
  function readLink(search, hash) {
    var carried = /[?&]room=([^&#\s]+)/i.exec(search || "");
    var text = carried ? carried[1] : String(hash || "").replace(/^#/, "");
    if (!text) return "";
    var words = text.toLowerCase().split(/[^a-z]+/).filter(Boolean).slice(0, 4);
    var known = words.filter(function (w) { return WORD_SET[w]; });
    /* The words are returned as they arrived, odd one included: a code with a
       word mangled in transit cannot be repaired by guessing, and a code three
       words long would quietly open a room at an address nobody is heading
       for. Better it fails and says so. */
    return known.length >= 3 ? words.join("-") : "";
  }

  /* did this address look like it was meant to be an invitation? */
  function looksLikeInvitation(search, hash) {
    return /[?&]room=/i.test(search || "") || /^#.+/.test(hash || "");
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
  var FIRST_KNOCK_MS = 3500;        /* a quick look before holding a room open */

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

    /* Take the code as our own address. Resolves true if we got it, false if
       somebody else already has it. */
    function claim(code) {
      return loadPeer().then(function (Peer) {
        return new Promise(function (done, reject) {
          if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
          var settled = false;
          var p = new Peer(PREFIX + code, PEER_OPTS);
          peer = p;
          p.on("open", function () { if (!settled) { settled = true; done(true); } });
          p.on("connection", function (c) {
            if (conn && conn.open) { c.close(); return; }      /* a room is for two */
            wire(c);
          });
          p.on("error", function (err) {
            if (err && err.type === "unavailable-id") {
              if (!settled) { settled = true; try { p.destroy(); } catch (e) {} peer = null; done(false); }
              return;
            }
            if (!settled) { settled = true; fail(err, reject); }
          });
        });
      });
    }

    /* Knock on somebody else's room. Resolves true once the connection is
       open, false after `tries` goes unanswered. */
    function knock(code, tries) {
      return loadPeer().then(function (Peer) {
        return new Promise(function (done, reject) {
          if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
          var attempts = 0, timer = null, settled = false;
          var p = new Peer(PEER_OPTS);
          peer = p;

          p.on("open", function () { go(); });
          p.on("error", function (err) {
            if (err && err.type === "peer-unavailable") { again(); return; }
            if (!settled) { settled = true; fail(err, reject); }
          });

          function go() {
            if (closed || settled) return;
            attempts++;
            if (attempts > 1) {
              say("Still knocking — attempt " + attempts + " of " + tries + "…");
            }
            var c = p.connect(PREFIX + code, { reliable: true });
            wire(c);
            c.on("open", function () { if (!settled) { settled = true; clearTimeout(timer); done(true); } });
            clearTimeout(timer);
            timer = setTimeout(function () {
              if (settled || (conn && conn.open)) return;
              try { c.close(); } catch (e) {}
              again();
            }, attempts === 1 && tries === 1 ? FIRST_KNOCK_MS : KNOCK_MS);
          }

          function again() {
            if (closed || settled || (conn && conn.open)) return;
            clearTimeout(timer);
            if (attempts < tries) { setTimeout(go, 700); return; }
            settled = true;
            done(false);
          }
        });
      });
    }

    function taken() { return new Error("Somebody else is already at that code."); }

    function notThere(code) {
      var why = new Error("No room called \u201c" + code + "\u201d. Check the code is " +
        "exactly right, and that your friend still has the page open.");
      say(why.message, "error");
      if (h.error) h.error(why);
      return why;
    }

    var api = {
      code: null,
      role: null,

      /* Open a room under a code nobody has claimed. */
      host: function (preferred) {
        api.role = "host";
        api.code = preferred ? tidyCode(preferred) : makeCode();
        say("Opening the room…");
        return claim(api.code).then(function (ok) {
          if (ok) { say("Waiting for your friend to join…"); return api.code; }
          if (preferred) throw taken();
          api.code = makeCode();                 /* astronomically unlikely */
          return api.host();
        });
      },

      /* Knock on a room somebody else has opened. */
      join: function (rawCode) {
        api.role = "guest";
        api.code = tidyCode(rawCode);
        if (!api.code) return Promise.reject(new Error("Type the room code first."));
        say("Looking for the room…");
        return knock(api.code, TRIES).then(function (ok) {
          if (ok) return api.code;
          throw notThere(api.code);
        });
      },

      /* Meet at a code.

         Claiming an address is decided by the matchmaking service and nobody
         else: exactly one browser can hold a given one. So the whole of the
         arrangement is "try to take the room's address":

           got it   — you are the host. You hold it, and you keep holding it.
           taken    — somebody is already there, so knock on their door.

         There is deliberately no looking around first, and a host never lets
         go to go looking. An earlier version alternated between holding a room
         and searching for one, which left windows where nobody was holding
         anything and two people could walk past each other indefinitely. */
      meet: function (rawCode) {
        var code = tidyCode(rawCode);
        if (!code) return Promise.reject(new Error("That link has no room code in it."));
        api.code = code;
        say("Looking for the room…");
        return attempt(0);

        function attempt(n) {
          if (closed) return Promise.resolve(code);
          /* the same address Create a room holds, so the two ways in meet */
          return claim(code).then(function (mine) {
            if (mine) {
              api.role = "host";
              say("Waiting for your friend to join. Keep this page open.");
              return code;                       /* and hold it, without fidgeting */
            }
            api.role = "guest";
            say("Your friend is there — knocking…");
            return knock(code, TRIES).then(function (ok) {
              if (ok) return code;
              /* They were there a moment ago and are not answering: most
                 likely they closed the page and the service has not let go of
                 their address yet. Wait for it to lapse, then take the room. */
              if (n >= 4) throw notThere(code);
              say("No answer. Waiting for their address to lapse, then taking " +
                  "the room over…");
              return new Promise(function (go) { setTimeout(go, 4000); })
                .then(function () { return attempt(n + 1); });
            });
          });
        }
      },

      send: function (msg) {
        if (conn && conn.open) { conn.send(JSON.stringify(msg)); return true; }
        return false;
      },

      connected: function () { return !!(conn && conn.open); },

      link: function () {
        /* The code goes in the query as well as the fragment: some messaging
           apps and link wrappers drop the part after the #, and a link that
           arrives without its code looks to the person clicking it like an
           ordinary game that simply will not connect. */
        return location.origin + location.pathname +
               "?room=" + api.code + "#" + api.code;
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
        try { peer = new root.Peer(PEER_OPTS); }
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
        var pc, settled = false, found = false, relay = false;
        try {
          pc = new RTC({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
          pc.createDataChannel("probe");
        } catch (e) { finish("could not start: " + e.message); return; }

        var timer = setTimeout(function () { finish(null); }, 8000);
        pc.onicecandidate = function (ev) {
          if (!ev.candidate) { finish(null); return; }
          var text = ev.candidate.candidate || "";
          if (ev.candidate.type === "relay" || /typ relay/.test(text)) { relay = true; }
          if (ev.candidate.type === "srflx" || /typ srflx/.test(text)) { found = true; }
          if (found && relay) finish(null);
        };
        pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
          .catch(function (e) { finish("could not start: " + e.message); });

        function finish(why) {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { pc && pc.close(); } catch (e) {}
          note("This network", found || relay, why ? why
            : found && relay ? "lets this browser be reached from outside, and a relay " +
                "is there for the times it cannot"
            : found ? "lets this browser be reached from outside. No relay answered, so " +
                "a game will only work if your friend's network is as open as yours."
            : relay ? "will not allow a direct connection, but a relay answered and the " +
                "game will go through that instead"
            : "would allow neither a direct connection nor a relay. Some office and " +
              "mobile networks block both; another network, or a phone off wifi, " +
              "is the way round it.");
          done();
        }
      });
    }
  }

  root.UNC = root.UNC || {};
  root.UNC.net = { session: session, makeCode: makeCode, tidyCode: tidyCode,
                   readLink: readLink, looksLikeInvitation: looksLikeInvitation,
                   diagnose: diagnose };
})(typeof window !== "undefined" ? window : globalThis);
