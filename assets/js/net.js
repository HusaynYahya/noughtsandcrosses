/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — connecting the two of you by hand
   ----------------------------------------------------------------------------
   Rooms live in live.js now, where both browsers reach OUT to a message
   service. What is left here is the way that needs no service of any kind: the
   two browsers are introduced by you, passing two blocks of text between them,
   and then talk directly.

   That still asks the two networks to let each other in, which is exactly what
   a lot of them will not do — so a relay can be given as well, and there is a
   test for it, because "it did not work" is not a useful thing to be told.

   The four-word codes live here too, since both ways of playing use them.
   ============================================================================ */
(function (root) {
  "use strict";

  /* How two browsers find a way to each other, when they are talking directly.
     STUN lets each side learn how it looks from outside; a relay carries the
     traffic when neither network will allow anything direct. A relay cannot
     read what it carries: a data channel is encrypted end to end. */
  var PUBLIC_RELAYS = [
    { urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject", credential: "openrelayproject" },
    { urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject", credential: "openrelayproject" }
  ];
  var ICE = { iceServers: [] };

  /* A relay you have been given, kept in this browser. */
  function savedRelay() {
    try {
      var raw = localStorage.getItem("unc.relay");
      var r = raw ? JSON.parse(raw) : null;
      return r && r.urls ? r : null;
    } catch (e) { return null; }
  }

  function setRelay(urls, username, credential) {
    try {
      if (!urls) localStorage.removeItem("unc.relay");
      else {
        localStorage.setItem("unc.relay", JSON.stringify({
          urls: urls, username: username || "", credential: credential || ""
        }));
      }
    } catch (e) {}
    ICE.iceServers = iceList();
  }

  function iceList() {
    var list = [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" }
    ];
    var own = savedRelay();
    if (own) list.push(own);
    return list.concat(PUBLIC_RELAYS);
  }
  ICE.iceServers = iceList();

  /* Is the relay working? Ask it for an address and see whether it gives one. */
  function testRelay(done) {
    var RTC = root.RTCPeerConnection || root.webkitRTCPeerConnection;
    if (!RTC) { done({ ok: false, detail: "This browser cannot do WebRTC at all." }); return; }
    var own = savedRelay();
    var pc, settled = false, got = false;
    try {
      pc = new RTC({ iceServers: ICE.iceServers, iceTransportPolicy: "relay" });
      pc.createDataChannel("probe");
    } catch (e) { done({ ok: false, detail: "Could not start: " + e.message }); return; }
    var timer = setTimeout(finish, 9000);
    pc.onicecandidate = function (ev) {
      if (!ev.candidate) { finish(); return; }
      if (ev.candidate.type === "relay" || /typ relay/.test(ev.candidate.candidate || "")) {
        got = true;
        finish();
      }
    };
    pc.onicecandidateerror = function (ev) {
      if (!got && ev && (ev.errorCode === 401 || ev.errorCode === 403)) {
        finish("The relay answered but refused the username or password.");
      }
    };
    pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
      .catch(function (e) { finish("Could not start: " + e.message); });

    function finish(why) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { pc.close(); } catch (e) {}
      done({
        ok: got,
        detail: got
          ? (own ? "Your relay works — it gave this browser an address."
                 : "A public relay answered.")
          : why || (own
              ? "Your relay did not answer. Check the address, the username and " +
                "the password, and that the address starts with turn:"
              : "No relay answered. The free public ones are unreliable; put " +
                "your own in above.")
      });
    }
  }

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

  /* ---- a game's worth of plumbing --------------------------------------- */
  /* Whatever carries the messages — the message service, or a connection made
     by hand — the game above wants the same few things: send, are we
     connected, and tell me when something arrives. */
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
    var conn = null, closed = false;
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

    function taken() { return new Error("Somebody else is already at that code."); }


    var api = {
      code: null,
      role: null,

      send: function (msg) {
        if (conn && conn.open) { conn.send(JSON.stringify(msg)); return true; }
        return false;
      },

      connected: function () { return !!(conn && conn.open); },

      /* Take on a connection made some other way — by hand, with no service. */
      adopt: function (c, role) {
        api.role = role;
        api.code = "by hand";
        wire(c);
      },

      /* Called when the page is looked at again after being in the background. */
      wake: function () {},

      link: function () {
        return location.origin + location.pathname +
               "?room=" + api.code + "#" + api.code;
      },

      close: function () {
        closed = true;
        stopBeat();
        if (conn) { try { conn.close(); } catch (e) {} conn = null; }
      }
    };


    return api;
  }

  /* ---- connecting with no service at all -------------------------------- */
  /* Everything above depends on a public matchmaking service to introduce two
     browsers. When that service is down — and it is free, so it does go down —
     nothing else in here can help. This does the introduction by hand: one
     side produces a block of text, the other pastes it in and produces a reply
     block, the first pastes that back, and the two are connected. It is
     clumsy, and it works when nothing else does, because the only thing
     between the two browsers is whatever you use to send the text. */
  function handshake(handlers) {
    var h = handlers || {};
    var pc = null, channel = null, closed = false;

    function announce(text, kind) { if (h.status) h.status(text, kind || "waiting"); }

    /* the shape the rest of this file expects of a connection */
    function adapt(dc) {
      var listeners = {};
      var api = {
        open: false,
        on: function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
        send: function (data) { if (api.open) dc.send(data); },
        close: function () { try { dc.close(); } catch (e) {} }
      };
      function fire(ev, a) { (listeners[ev] || []).forEach(function (f) { f(a); }); }
      dc.onopen = function () { api.open = true; fire("open"); };
      dc.onmessage = function (e) { fire("data", e.data); };
      dc.onclose = function () { api.open = false; fire("close"); };
      dc.onerror = function (e) { fire("error", e); };
      return api;
    }

    function ready(p) {
      return new Promise(function (done) {
        if (p.iceGatheringState === "complete") { done(); return; }
        var timer = setTimeout(finish, 5000);   /* good enough beats perfect */
        p.addEventListener("icegatheringstatechange", function () {
          if (p.iceGatheringState === "complete") finish();
        });
        function finish() { clearTimeout(timer); done(); }
      });
    }

    function pack(desc) {
      var text = JSON.stringify({ t: desc.type, s: desc.sdp });
      if (!root.CompressionStream) return Promise.resolve("u0" + btoa(text));
      var stream = new Blob([text]).stream().pipeThrough(new root.CompressionStream("deflate-raw"));
      return new Response(stream).arrayBuffer().then(function (buf) {
        var bytes = new Uint8Array(buf), out = "";
        for (var i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
        return "u1" + btoa(out);
      });
    }

    function unpack(code) {
      var text = String(code || "").replace(/\s+/g, "");
      var kind = text.slice(0, 2);
      var body = text.slice(2);
      if (kind !== "u0" && kind !== "u1") {
        return Promise.reject(new Error("That does not look like one of these codes."));
      }
      var raw;
      try { raw = atob(body); } catch (e) { return Promise.reject(new Error("That code is damaged.")); }
      if (kind === "u0") return Promise.resolve(JSON.parse(raw));
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      var stream = new Blob([bytes]).stream()
        .pipeThrough(new root.DecompressionStream("deflate-raw"));
      return new Response(stream).text().then(JSON.parse);
    }

    /* Both blocks of text have to be pasted before anything can connect. Until
       the second one has been, a connection going nowhere means nothing —
       there is nobody at the other end yet — so it is not reported as a
       failure. Saying "neither network will allow it" to somebody whose friend
       simply has not pasted yet sends them off fixing the wrong thing. */
    var swapped = false;

    function make() {
      var conf = { iceServers: ICE.iceServers };
      /* used by the tests to prove a game really does go through a relay */
      if (root.UNC_FORCE_RELAY) conf.iceTransportPolicy = "relay";
      pc = new (root.RTCPeerConnection || root.webkitRTCPeerConnection)(conf);
      pc.onconnectionstatechange = function () {
        if (closed || !pc) return;
        var state = pc.connectionState;
        if (state === "connected") { announce("Connected.", "live"); return; }
        if (state !== "failed" && state !== "disconnected") return;
        if (!swapped) {
          announce("Waiting for your friend to paste your code. Nothing happens " +
                   "until they do.");
          return;
        }
        announce("Both codes went across, but the two browsers still could not " +
                 "reach each other. Neither network will allow a direct link, and " +
                 "no relay answered. A relay of your own is the way through — " +
                 "there is a box for one below.", "error");
      };
      return pc;
    }

    return {
      /* the starter: make a block of text to send */
      offer: function () {
        make();
        var dc = pc.createDataChannel("unc", { ordered: true });
        h.channel(adapt(dc));
        announce("Making your code…");
        return pc.createOffer()
          .then(function (d) { return pc.setLocalDescription(d); })
          .then(function () { return ready(pc); })
          .then(function () { return pack(pc.localDescription); });
      },

      /* the friend: take their text, make the reply text */
      answer: function (code) {
        make();
        pc.ondatachannel = function (ev) { h.channel(adapt(ev.channel)); };
        announce("Reading their code…");
        return unpack(code)
          .then(function (d) { return pc.setRemoteDescription({ type: d.t, sdp: d.s }); })
          .then(function () { return pc.createAnswer(); })
          .then(function (d) { return pc.setLocalDescription(d); })
          .then(function () { return ready(pc); })
          .then(function () {
            swapped = true;          /* we have their code; they need ours */
            return pack(pc.localDescription);
          });
      },

      /* the starter again: take the reply */
      accept: function (code) {
        if (!pc) return Promise.reject(new Error("Make your code first."));
        announce("Reading their reply…");
        return unpack(code).then(function (d) {
          swapped = true;
          return pc.setRemoteDescription({ type: d.t, sdp: d.s });
        });
      },

      close: function () {
        closed = true;
        try { pc && pc.close(); } catch (e) {}
      }
    };
  }

  root.UNC = root.UNC || {};
  root.UNC.net = { session: session, handshake: handshake,
                   savedRelay: savedRelay, setRelay: setRelay, testRelay: testRelay,
                   makeCode: makeCode, tidyCode: tidyCode,
                   readLink: readLink, looksLikeInvitation: looksLikeInvitation };
})(typeof window !== "undefined" ? window : globalThis);
