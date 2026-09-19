/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — live play, the way round that actually works
   ----------------------------------------------------------------------------
   The first attempt at this had the two browsers talk straight to each other.
   That is the elegant way and it is the wrong way, because it asks the two
   networks to let strangers in. Plenty will not: most mobile networks, and
   most offices, allow you out and nothing in. No amount of retrying fixes a
   network that is built to refuse.

   So neither browser waits to be reached. Both reach OUT to a message broker,
   the same direction as loading a web page, which is a thing every network
   allows — and messages are relayed between the two outbound connections.

   What the broker sees is nothing. The room code never leaves the two
   browsers: the topic is a hash of it, and every message is sealed with a key
   derived from it. A public broker carries ciphertext under a meaningless
   name.

   Who plays which side is settled without asking anybody: both sides announce
   a random number, and the lower one is crosses. No claiming, no knocking, no
   waiting to see who got there first.
   ============================================================================ */
(function (root) {
  "use strict";

  var MQTT_SRC = "assets/vendor/mqtt-5.10.1.min.js";
  var BROKERS = [
    "wss://broker.emqx.io:8084/mqtt",
    "wss://broker.hivemq.com:8884/mqtt",
    "wss://test.mosquitto.org:8081/mqtt"
  ];
  var HELLO_EVERY = 4000;      /* how often to say we are still here */
  var SILENCE = 14000;         /* how long before we decide they are gone */

  var loading = null;
  function loadMqtt() {
    if (root.mqtt) return Promise.resolve(root.mqtt);
    if (loading) return loading;
    loading = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = MQTT_SRC;
      s.async = true;
      s.onload = function () {
        root.mqtt ? resolve(root.mqtt) : reject(new Error("The message library did not load."));
      };
      s.onerror = function () { loading = null; reject(new Error("Could not load the message library.")); };
      document.head.appendChild(s);
    });
    return loading;
  }

  /* ---- keeping the broker out of it ------------------------------------ */
  function digest(text) {
    var bytes = new TextEncoder().encode(text);
    return crypto.subtle.digest("SHA-256", bytes);
  }

  function hex(buf) {
    var out = "", b = new Uint8Array(buf);
    for (var i = 0; i < b.length; i++) out += ("0" + b[i].toString(16)).slice(-2);
    return out;
  }

  function secrets(code) {
    return digest("unc-topic:" + code).then(function (t) {
      return digest("unc-key:" + code).then(function (k) {
        return crypto.subtle.importKey("raw", k, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
          .then(function (key) {
            return { topic: "unc1/" + hex(t).slice(0, 24), key: key };
          });
      });
    });
  }

  function seal(key, obj) {
    var nonce = crypto.getRandomValues(new Uint8Array(12));
    var body = new TextEncoder().encode(JSON.stringify(obj));
    return crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, body)
      .then(function (cipher) {
        var out = new Uint8Array(12 + cipher.byteLength);
        out.set(nonce, 0);
        out.set(new Uint8Array(cipher), 12);
        return out;
      });
  }

  function unseal(key, bytes) {
    var data = new Uint8Array(bytes);
    if (data.length < 13) return Promise.reject(new Error("short"));
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: data.slice(0, 12) }, key, data.slice(12))
      .then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); });
  }

  /* ---- a live game ------------------------------------------------------ */
  function live(handlers) {
    var h = handlers || {};
    var client = null, topic = null, key = null;
    var me = null;
    var them = null, lastHeard = 0, closed = false;
    var beat = null, watch = null, opened = false;

    function say(text, kind) { if (h.status) h.status(text, kind || "waiting"); }

    var api = {
      code: null,
      role: null,

      join: function (rawCode) {
        api.code = String(rawCode || "").trim();
        if (!api.code) return Promise.reject(new Error("There is no room code here."));
        me = whoWeAre(api.code);
        say("Joining…");
        return loadMqtt().then(function (mqtt) {
          return secrets(api.code).then(function (s) {
            topic = s.topic;
            key = s.key;
            return attach(mqtt, (root.UNC_BROKERS || BROKERS).slice());
          });
        });
      },

      send: function (msg) {
        if (!client || !client.connected) return false;
        msg.from = me;
        seal(key, msg).then(function (bytes) {
          try { client.publish(topic, bytes, { qos: 0 }); } catch (e) {}
        });
        return true;
      },

      connected: function () {
        return !!(client && client.connected && them && Date.now() - lastHeard < SILENCE);
      },

      link: function () {
        return location.origin + location.pathname + "?room=" + api.code + "#" + api.code;
      },

      wake: function () {
        if (closed || !client) return;
        if (!client.connected) { try { client.reconnect(); } catch (e) {} }
        hello();
      },

      close: function () {
        closed = true;
        stopBeat();
        if (client) { try { client.end(true); } catch (e) {} client = null; }
      }
    };

    /* try each broker in turn until one lets us in */
    function attach(mqtt, list) {
      if (!list.length) {
        var why = new Error("No message service would answer. That usually means " +
                            "this network is blocking them.");
        say(why.message, "error");
        if (h.error) h.error(why);
        throw why;
      }
      var url = list.shift();
      say("Joining…");
      return new Promise(function (done, fail) {
        var settled = false;
        var c = mqtt.connect(url, {
          clean: true, connectTimeout: 6000, reconnectPeriod: 3000,
          clientId: "unc_" + me
        });
        var giveUp = setTimeout(function () {
          if (settled) return;
          settled = true;
          try { c.end(true); } catch (e) {}
          done(attach(mqtt, list));               /* next broker */
        }, 7000);

        c.on("connect", function () {
          if (closed) { try { c.end(true); } catch (e) {} return; }
          client = c;
          c.subscribe(topic, { qos: 0 }, function () {
            hello();
            startBeat();
          });
          if (!settled) {
            settled = true;
            clearTimeout(giveUp);
            say("Waiting for your friend…");
            done(api.code);
          }
        });

        c.on("message", function (_, payload) { heard(payload); });

        c.on("error", function () {
          if (settled) return;
          settled = true;
          clearTimeout(giveUp);
          try { c.end(true); } catch (e) {}
          done(attach(mqtt, list));
        });

        c.on("close", function () {
          if (!closed && settled && opened) say("Reconnecting…");
        });
      });
    }

    function hello() { api.send({ t: "here", id: me }); }

    /* Who we are, kept for as long as this tab is open. Which of the two
       plays crosses is settled by comparing these, so a page that comes back
       under a new name would come back on the other side of the board —
       reloading a game is not a reason to swap colours. It is per tab, so two
       tabs on one machine are still two players. */
    function whoWeAre(code) {
      var slot = "unc.me." + code;
      try {
        var kept = sessionStorage.getItem(slot);
        if (kept) return kept;
      } catch (e) {}
      var made = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { sessionStorage.setItem(slot, made); } catch (e) {}
      return made;
    }

    function startBeat() {
      stopBeat();
      beat = setInterval(function () { if (!closed) hello(); }, HELLO_EVERY);
      watch = setInterval(function () {
        if (closed || !them) return;
        if (Date.now() - lastHeard > SILENCE) {
          them = null;
          opened = false;
          say("Your friend has dropped out. They can come back to the same code.");
          if (h.close) h.close();
        }
      }, 2000);
    }

    function stopBeat() {
      if (beat) { clearInterval(beat); beat = null; }
      if (watch) { clearInterval(watch); watch = null; }
    }

    function heard(payload) {
      if (closed) return;
      unseal(key, payload).then(function (msg) {
        if (!msg || msg.from === me) return;        /* our own words coming back */
        lastHeard = Date.now();

        if (msg.t === "here") {
          var first = !them;
          them = msg.id;
          /* the lower of the two random numbers plays crosses — decided by
             both sides at once, with nobody to ask */
          api.role = me < them ? "host" : "guest";
          if (first) {
            hello();                                 /* so they learn about us too */
            opened = true;
            say("Connected.", "live");
            if (h.open) h.open();
          }
          return;
        }
        if (h.message) h.message(msg);
      }, function () { /* somebody else's traffic, or a stale key */ });
    }

    return api;
  }

  /* Does this network let us reach a message service at all? That is the only
     thing live play needs now, so it is the only thing worth checking. */
  function check(onStep) {
    var results = [];
    function note(name, ok, detail) {
      results.push({ name: name, ok: ok, detail: detail });
      if (onStep) onStep(results.slice(), false);
    }
    return loadMqtt().then(function (mqtt) {
      note("The message library", true, "loaded");
      var list = (root.UNC_BROKERS || BROKERS).slice();
      return (function next(reached) {
        if (!list.length) {
          note("A message service", reached > 0,
            reached > 0 ? reached + " of them answered — live play will work"
                        : "none of them answered. This network is blocking the " +
                          "connections a live game needs; playing by message will " +
                          "still work.");
          return results;
        }
        var url = list.shift();
        return new Promise(function (done) {
          var c, settled = false;
          var timer = setTimeout(function () { finish(false); }, 7000);
          try { c = mqtt.connect(url, { connectTimeout: 6000, reconnectPeriod: 0 }); }
          catch (e) { finish(false); return; }
          c.on("connect", function () { finish(true); });
          c.on("error", function () { finish(false); });
          function finish(ok) {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { c && c.end(true); } catch (e) {}
            done(ok);
          }
        }).then(function (ok) { return next(reached + (ok ? 1 : 0)); });
      })(0);
    }, function (err) {
      note("The message library", false, err.message);
      return results;
    }).then(function (r) {
      if (onStep) onStep(results.slice(), true);
      return r;
    });
  }

  root.UNC = root.UNC || {};
  root.UNC.live = live;
  root.UNC.live.check = check;
  /* the lobby reaches the same services the same way; no point having two
     copies of the loader or two lists of addresses */
  root.UNC.live.load = loadMqtt;
  root.UNC.live.brokers = function () { return (root.UNC_BROKERS || BROKERS).slice(); };
})(typeof window !== "undefined" ? window : globalThis);
