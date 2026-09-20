/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the home page
   ----------------------------------------------------------------------------
   What a chess site's front page does: who is waiting for a game, a way to
   offer one, a way to open a private room, and enough of your own record to
   see how you are doing. The list of open games is live — it is the lobby
   topic, read as it arrives.

   Taking a game off the list is not a negotiation: every offer carries the
   room its owner is already sitting in, so accepting is walking into it.
   ============================================================================ */
(function () {
  "use strict";

  var S = window.UNC.site, P = window.UNC.player, ARCH = window.UNC.archive;
  var NET = window.UNC.net;
  var $ = function (sel) { return document.querySelector(sel); };

  /* An invitation from before the site had more than one page pointed here.
     Send it on rather than showing a lobby to somebody expecting a board. */
  if (/[?&](room|game)=/.test(location.search) || /^#.+/.test(location.hash)) {
    location.replace("play.html" + location.search + location.hash);
    return;
  }

  var seeksBody = $("[data-seeks]"), seeksTable = $("[data-seeks-table]"),
      seeksEmpty = $("[data-seeks-empty]"), lobbyStatus = $("[data-lobby-status]"),
      lobbyCount = $("[data-lobby-count]"), lobbyDot = $("[data-lobby-dot]"),
      tcSel = $("[data-seek-tc]"), sideSel = $("[data-seek-side]");

  var A = window.UNC.account;
  var lobby = null, offers = [];
  var sock = null, onServer = false;   /* the server's lobby, when there is one */

  /* ---- your account, if this site has a server --------------------------- */
  function drawAccount() {
    var card = $("[data-account]");
    if (!A.configured()) { card.hidden = true; return; }
    card.hidden = false;
    $("[data-account-where]").textContent = A.where().replace(/^https?:\/\//, "");
    var body = $("[data-account-body]"), me = A.me();

    if (me) {
      $("[data-account-head]").textContent = "Signed in";
      body.innerHTML =
        '<div class="youcard">' + S.face(me, true) +
          "<div><b class=\"youcard__name\">" + S.esc(me.name) + "</b>" +
          '<span class="youcard__rating">' + me.rating +
            (me.provisional ? '<span class="tag">provisional</span>' : "") +
            (me.place ? " · #" + me.place : "") + "</span></div></div>" +
        '<div class="row-btn" style="margin-top:.7rem">' +
          '<a class="btn btn--slim" href="profile.html">Your profile</a>' +
          '<button class="btn btn--slim" type="button" data-signout>Sign out</button>' +
        "</div>";
      $("[data-signout]").addEventListener("click", function () {
        A.leave().then(function () { location.reload(); });
      });
      return;
    }

    $("[data-account-head]").textContent = "Sign in";
    body.innerHTML =
      '<p class="netline" style="margin-top:0">An account puts you on the ladder, ' +
        "keeps your games, and has the server referee them — neither player can " +
        "argue with the result. You can still play a friend without one.</p>" +
      '<label class="lbl" for="acc-name">Name</label>' +
      '<input id="acc-name" type="text" data-acc-name autocomplete="username" maxlength="20" />' +
      '<label class="lbl lbl--spaced" for="acc-pass">Password</label>' +
      '<input id="acc-pass" type="password" data-acc-pass autocomplete="current-password" />' +
      '<div class="row-btn" style="margin-top:.7rem">' +
        '<button class="btn btn--go" type="button" data-signin>Sign in</button>' +
        '<button class="btn" type="button" data-signup>Create an account</button>' +
      "</div>" +
      '<p class="netline" data-acc-said></p>';

    function go(isNew) {
      var said = $("[data-acc-said]");
      said.className = "netline";
      said.textContent = isNew ? "Making your account…" : "Signing in…";
      A.join($("[data-acc-name]").value, $("[data-acc-pass]").value, isNew)
        .then(function () { location.reload(); },
              function (err) {
                said.className = "netline netline--error";
                said.textContent = err.message;
              });
    }
    $("[data-signin]").addEventListener("click", function () { go(false); });
    $("[data-signup]").addEventListener("click", function () { go(true); });
    $("[data-acc-pass]").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") go(false);
    });
  }

  /* ---- the decorative board --------------------------------------------- */
  (function hero() {
    var box = $("[data-hero]");
    if (!box) return;
    /* a position, not a random scatter: crosses have taken the middle board
       and are a move from the top row of the big one */
    var shown = { 30: 1, 40: 1, 50: 2, 4: 1, 13: 2, 36: 1, 44: 2, 20: 1, 60: 2,
                  10: 2, 70: 1, 22: 1, 58: 2, 66: 2, 8: 1 };
    var html = "";
    for (var b = 0; b < 9; b++) {
      html += '<span class="hero__mini' + (b % 2 === 0 ? " hero__mini--light" : "") + '">';
      for (var c = 0; c < 9; c++) {
        var at = b * 9 + c, who = shown[at];
        html += '<span class="hero__cell' + (who === 1 ? " hero__cell--x" :
                 who === 2 ? " hero__cell--o" : "") + '"></span>';
      }
      html += "</span>";
    }
    box.innerHTML = html;
  })();

  /* ---- you -------------------------------------------------------------- */
  function drawYou() {
    var me = P.who(), sum = ARCH.summary();
    $("[data-you-body]").innerHTML =
      '<div class="youcard">' +
        S.face(me, true) +
        "<div>" +
          '<b class="youcard__name" data-rename title="Click to rename">' + S.esc(me.name) + "</b>" +
          '<span class="youcard__rating">' + Math.round(me.rating) +
            (P.provisional(me) ? '<span class="tag">provisional</span>' : "") + "</span>" +
        "</div>" +
      "</div>" +
      '<div class="tiles tiles--tight">' +
        tile(sum.played, "games") +
        tile(sum.wins + "/" + sum.draws + "/" + sum.losses, "w / d / l") +
        tile(sum.rate + "%", "score") +
      "</div>";
    var rename = me.server ? null : $("[data-rename]");
    if (me.server) $("[data-rename]").removeAttribute("title");
    if (rename) rename.addEventListener("click", function () {
      var next = prompt("What should people call you?", P.me().name);
      if (next == null) return;
      P.rename(next);
      location.reload();
    });
  }

  function tile(n, k) {
    return '<div class="tile"><span class="tile__n">' + S.esc(n) + '</span>' +
           '<span class="tile__k">' + S.esc(k) + "</span></div>";
  }

  /* ---- your last games --------------------------------------------------- */
  function drawRecent() {
    var games = ARCH.all().slice(0, 6), body = $("[data-recent]");
    $("[data-recent-empty]").hidden = games.length > 0;
    body.innerHTML = games.map(function (g) {
      var mark = g.result === "win" ? '<span class="w">won</span>'
               : g.result === "loss" ? '<span class="l">lost</span>'
               : '<span class="d">drawn</span>';
      return "<tr><td>" + mark + "</td>" +
        "<td>" + S.esc(g.opponent ? g.opponent.name : label(g.mode)) + "</td>" +
        '<td class="num">' + (g.rated ? (g.change > 0 ? "+" : "") + g.change : "—") + "</td>" +
        '<td class="num quiet">' + S.esc(S.ago(g.at)) + "</td>" +
        '<td class="num"><a href="play.html?review=' + encodeURIComponent(g.id) + '">review</a></td></tr>';
    }).join("");
  }

  function label(mode) {
    return mode === "computer" ? "the engine" : mode === "online" ? "a friend"
         : mode === "post" ? "by message" : "across the table";
  }

  /* ---- the top of the table ---------------------------------------------- */
  function drawTop() {
    var rows = P.table().slice(0, 6);
    $("[data-top]").innerHTML = rows.map(function (r) {
      return "<tr" + (r.you ? ' class="you"' : "") + '><td class="num quiet">' + r.place + "</td>" +
        '<td><span class="name">' + S.face(r) + S.esc(r.name) + "</span></td>" +
        '<td class="num">' + r.rating + (r.provisional ? "?" : "") + "</td>" +
        '<td class="num quiet">' + r.games + "</td></tr>";
    }).join("");
  }

  /* ---- the lobby ---------------------------------------------------------- */
  function drawSeeks(list, count) {
    offers = list;
    lobbyCount.textContent = count ? S.plural(count, "player") + " here" : "";
    lobbyDot.className = "dot " + (lobby && lobby.connected() ? "dot--on" : "dot--off");
    seeksTable.hidden = !list.length;
    seeksEmpty.hidden = !!list.length;
    seeksBody.innerHTML = list.map(function (s, i) {
      return '<tr><td><span class="name">' + S.face(s.who) + S.esc(s.who.name) + "</span></td>" +
        '<td class="num">' + (s.who.rating || "—") + "</td>" +
        "<td>" + S.esc(clockWords(s.tc)) + "</td>" +
        "<td>" + S.esc(s.side === "either" ? "either" :
                       s.side === "X" ? "they are crosses" : "they are noughts") + "</td>" +
        '<td class="quiet">' + S.esc(S.ago(s.at)) + "</td>" +
        '<td class="num"><button class="btn btn--slim" type="button" data-take="' + i +
          '">Play</button></td></tr>';
    }).join("");
  }

  function clockWords(tc) {
    if (!tc || tc === "0") return "no clock";
    if (tc.indexOf("move:") === 0) return (+tc.slice(5) / 60) + " min a move";
    var parts = tc.split("+");
    return (+parts[0] / 60) + " + " + (+parts[1] || 0);
  }

  seeksBody.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-take]");
    if (!btn) return;
    var seek = offers[+btn.getAttribute("data-take")];
    if (seek) accept(seek);
  });

  function accept(seek) {
    if (seek.server) {
      /* asking for the same thing they asked for is what pairs the two of you */
      serverSeek(seek.tc, seek.side === "X" ? "O" : seek.side === "O" ? "X" : "either");
      return;
    }
    if (lobby) lobby.take(seek);
    P.seen(seek.who);
    go(seek.room, seek.tc, false);
  }

  function offer() {
    if (onServer) { serverSeek(tcSel.value, sideSel.value); return; }
    var code = NET.makeCode();
    go(code, tcSel.value, true, sideSel.value);
  }

  /* off to the board: `open` says the board should keep the offer standing in
     the lobby until somebody arrives */
  function go(room, tc, open, side) {
    var url = "play.html?room=" + encodeURIComponent(room) +
              "&tc=" + encodeURIComponent(tc || "0");
    if (open) url += "&open=1&side=" + encodeURIComponent(side || "either");
    location.href = url;
  }

  $("[data-offer]").addEventListener("click", offer);
  $("[data-lobby-refresh]").addEventListener("click", offer);

  /* one button that does whatever is sensible: take the longest-waiting offer
     if there is one, otherwise leave one of your own */
  $("[data-quick]").addEventListener("click", function () {
    if (offers.length) accept(offers[0]);
    else offer();
  });

  $("[data-join-form]").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var tidy = NET.tidyCode($("[data-join-code]").value);
    if (!tidy) { lobbyStatus.textContent = "That does not look like a room code."; return; }
    location.href = "play.html?room=" + encodeURIComponent(tidy);
  });

  /* ---- the server's lobby ------------------------------------------------- */
  /* The same table, filled from the server instead of from the message
     service: these are people with accounts, and taking a game means the
     server pairs you and referees what follows. */
  function serverLobby() {
    onServer = true;
    $("[data-lobby-name]").textContent = "Open games on the server";
    lobbyStatus.textContent = "Reaching the server…";

    sock = A.socket({
      up: function () { lobbyStatus.textContent = "In the lobby."; },
      down: function () {
        lobbyDot.className = "dot dot--off";
        lobbyStatus.textContent = "The server went quiet — trying again…";
      },
      message: function (msg) {
        if (msg.t === "lobby") {
          offers = msg.seeks.map(function (s) {
            return { id: s.id, who: s.who, at: s.at, tc: s.tc, side: s.side, server: true };
          });
          lobbyDot.className = "dot dot--on";
          lobbyStatus.textContent = "In the lobby — " +
            S.plural(msg.players, "player") + " here, " +
            S.plural(msg.games, "game") + " being played.";
          drawSeeks(offers, msg.players);
          return;
        }
        if (msg.t === "start") { location.href = "play.html?g=" + encodeURIComponent(msg.game.id); return; }
        if (msg.t === "error") {
          lobbyStatus.className = "netline netline--error";
          lobbyStatus.textContent = msg.why;
        }
      }
    });
  }

  function serverSeek(tc, side) {
    if (!sock || !sock.live()) { lobbyStatus.textContent = "Not connected to the server yet."; return; }
    sock.send({ t: "seek", tc: tc || "0", side: side || "either" });
    lobbyStatus.textContent = "Waiting for an opponent…";
  }

  /* ---- go ----------------------------------------------------------------- */
  S.ready(function () {
    drawAccount();
    drawYou();
    drawRecent();
    drawTop();

    if (A.configured() && A.token()) {
      /* check the server still knows us before trusting the name in this
         browser, then play on it */
      A.refresh().then(function (me) {
        drawAccount();
        if (me) serverLobby();
        else peerLobby();
      });
      return;
    }
    peerLobby();
  });

  function peerLobby() {
    lobby = window.UNC.lobby.join({
      list: drawSeeks,
      status: function (text, kind) {
        lobbyStatus.textContent = text === "In the lobby."
          ? "In the lobby — offers appear here as people make them."
          : text;
        lobbyStatus.className = "netline" + (kind ? " netline--" + kind : "");
        lobbyDot.className = "dot " + (kind === "live" ? "dot--on" : "dot--off");
      }
    });
    setInterval(function () {
      if (offers.length && lobby) drawSeeks(offers, lobby.people());
    }, 15000);
  }
})();
