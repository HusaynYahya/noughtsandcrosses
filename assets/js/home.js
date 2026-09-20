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

  /* ---- your account, if this site has one to offer ----------------------- */
  /* The card says one of three things: make an account, you are in one, or
     this site has no server so there are none to make. Whichever it is, it
     says it plainly rather than quietly not being there. */
  function drawAccount() {
    var card = $("[data-account]");
    var body = $("[data-account-body]"), head = $("[data-account-head]");
    var where = $("[data-account-where]");
    card.hidden = false;

    if (!A.configured()) {
      head.textContent = "Accounts";
      where.textContent = "";
      body.innerHTML =
        "<p>This site has no server behind it yet, so there is nothing to sign " +
        "in to. Everything you play is kept in this browser, and a private room " +
        "with a friend needs no account at all.</p>" +
        '<div class="row-btn">' +
          '<a class="btn btn--slim" href="account.html">What an account would add</a>' +
        "</div>";
      return;
    }

    var me = A.me();
    where.textContent = A.where().replace(/^https?:\/\//, "");

    if (me) {
      head.textContent = "Signed in";
      body.innerHTML =
        '<div class="youcard">' + S.face(me, true) +
          '<div><b class="youcard__name">' + S.esc(me.name) + "</b>" +
          '<span class="youcard__rating">' + me.rating +
            (me.provisional ? '<span class="tag">provisional</span>' : "") +
            (me.place ? " · #" + me.place : "") + "</span></div></div>" +
        (me.verified === false
          ? '<p class="netline">Your address is not proved yet — ' +
            '<button class="linkish" type="button" data-again>send the letter again</button>.</p>'
          : "") +
        '<div class="row-btn" style="margin-top:var(--s-3)">' +
          '<a class="btn btn--slim" href="profile.html">Your profile</a>' +
          '<button class="btn btn--slim" type="button" data-signout>Sign out</button>' +
        "</div>";
      var out = $("[data-signout]");
      if (out) out.addEventListener("click", function () {
        A.leave().then(function () { location.reload(); });
      });
      var again = $("[data-again]");
      if (again) again.addEventListener("click", function () {
        again.textContent = "sending…";
        A.verifyAgain().then(function () { again.textContent = "sent"; },
                             function (e) { again.textContent = e.message; });
      });
      return;
    }

    head.textContent = "Accounts";
    body.innerHTML =
      "<p>An account puts you on the ladder, keeps your games wherever you sign " +
      "in, and has the server referee them — so a result is not one player's " +
      "word. You can play without one.</p>" +
      '<div class="row-btn">' +
        '<a class="btn btn--go" style="width:auto" href="account.html">Create an account</a>' +
        '<a class="btn" href="account.html?in">Sign in</a>' +
      "</div>";
  }

  /* ---- the board in the hero, playing itself ----------------------------- */
  /* Nothing explains the rule like watching it. A mark lands, the small board
     in that position lights up, and the next mark lands there — so the game is
     legible in fifteen seconds without a word of instruction.

     The sequence is only a list of squares: the square a mark lands in IS the
     board the next one goes to, so following the rule is what generates it. */
  var DEMO = [2, 2, 1, 3, 6, 3, 7, 8, 0, 4, 8, 4, 5, 5];
  var LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  var MARK = {
    1: '<svg viewBox="0 0 100 100"><path d="M26 26l48 48M74 26l-48 48"/></svg>',
    2: '<svg viewBox="0 0 100 100"><path d="M50 23a27 27 0 1 1 0 54 27 27 0 1 1 0-54"/></svg>'
  };

  function won(mini, who) {
    return LINES.some(function (l) {
      return l.every(function (i) { return mini[i] === who; });
    });
  }

  function hero() {
    var box = $("[data-hero]"), cap = $("[data-hero-cap]");
    if (!box) return;

    var cells = [];
    for (var b = 0; b < 9; b++) {
      var mini = document.createElement("span");
      mini.className = "hero__mini" + (b % 2 === 0 ? " hero__mini--light" : "");
      for (var c = 0; c < 9; c++) {
        var cell = document.createElement("span");
        cell.className = "hero__cell";
        mini.appendChild(cell);
        cells.push(cell);
      }
      box.appendChild(mini);
    }
    var minis = Array.prototype.slice.call(box.children);
    var still = window.matchMedia &&
                window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var grid, board, turn, at, timer = null;

    function clear() {
      grid = [];
      for (var b = 0; b < 9; b++) grid.push([0, 0, 0, 0, 0, 0, 0, 0, 0]);
      cells.forEach(function (c) { c.className = "hero__cell"; c.innerHTML = ""; });
      minis.forEach(function (m, i) {
        m.className = "hero__mini" + (i % 2 === 0 ? " hero__mini--light" : "");
      });
      board = 4; turn = 1; at = 0;
      light();
    }

    function light() {
      minis.forEach(function (m, i) { m.classList.toggle("hero__mini--live", i === board); });
    }

    /* one move, and where it sends the next one */
    function place(fresh) {
      var c = DEMO[at++];
      var cell = cells[board * 9 + c];
      grid[board][c] = turn;
      cell.className = "hero__cell hero__cell--" + (turn === 1 ? "x" : "o") +
                       (fresh ? " hero__cell--new" : "");
      cell.innerHTML = MARK[turn];
      if (won(grid[board], turn)) {
        minis[board].classList.add("hero__mini--won",
          turn === 1 ? "hero__mini--x" : "hero__mini--o");
      }
      board = c;
      turn = turn === 1 ? 2 : 1;
      light();
    }

    function step() {
      if (at >= DEMO.length) {
        cap.textContent = "Crosses have taken the middle board";
        timer = setTimeout(function () {
          cap.textContent = "A game, playing itself";
          clear();
          timer = setTimeout(step, 700);
        }, 2400);
        return;
      }
      var who = turn === 1 ? "Crosses" : "Noughts";
      place(true);
      cap.textContent = who + " played — the lit board is where the reply must go";
      timer = setTimeout(step, 1050);
    }

    clear();
    if (still) {
      while (at < DEMO.length) place(false);
      cap.textContent = "The square you take decides where they play next";
      return;
    }
    timer = setTimeout(step, 450);
    document.addEventListener("visibilitychange", function () {
      clearTimeout(timer);
      if (!document.hidden) timer = setTimeout(step, 600);
    });
  }

  /* the little line drawings on the three ways in */
  function icons() {
    document.querySelectorAll("[data-icon]").forEach(function (el) {
      el.innerHTML = S.icon(el.getAttribute("data-icon"));
    });
  }
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
    $("[data-recent-empty]").innerHTML = games.length ? "" : S.nothing("board",
      "No games yet",
      "Everything you finish is kept here — the moves, who it was against, and " +
      "what it did to your rating. You can open any of them again and have the " +
      "engine go over it with you.",
      '<a class="btn btn--go" style="width:auto" href="play.html?mode=computer">' +
        "Play your first</a>");
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
    var alone = rows.length < 2;
    $("[data-top-empty]").innerHTML = alone ? S.nothing("people",
      "Just you so far",
      "Everybody you play turns up here, with the record between you. Beat " +
      "somebody rated and the points move from them to you.",
      '<button class="btn btn--go" style="width:auto" type="button" data-quick-2>' +
        "Find an opponent</button>") : "";
    var alt = document.querySelector("[data-quick-2]");
    if (alt) alt.addEventListener("click", quick);
    $("[data-top]").innerHTML = (alone ? [] : rows).map(function (r) {
      return "<tr" + (r.you ? ' class="you"' : "") + '><td class="num quiet">' + r.place + "</td>" +
        '<td><span class="name">' + S.face(r) + S.esc(r.name) + "</span></td>" +
        '<td class="num">' + r.rating + (r.provisional ? "?" : "") + "</td>" +
        '<td class="num quiet">' + r.games + "</td></tr>";
    }).join("");
  }

  /* ---- the lobby ---------------------------------------------------------- */
  function drawSeeks(list, count) {
    offers = list;
    lobbyCount.textContent = count ? "· " + S.plural(count, "player") + " here" : "";
    lobbyDot.className = "dot " + ((onServer ? sock && sock.live() : lobby && lobby.connected())
      ? "dot--on" : "dot--off");
    seeksTable.hidden = !list.length;
    seeksEmpty.innerHTML = list.length ? "" : S.nothing("clock",
      "Nobody is waiting just now",
      "Leave an offer and the next person here walks straight into your game — " +
      "it takes one click, and you can play the engine while you wait.",
      '<button class="btn btn--go" type="button" data-offer-empty style="width:auto">' +
        "Offer a game</button>" +
      '<a class="btn" href="play.html?mode=computer">Play the engine</a>');
    var alt = document.querySelector("[data-offer-empty]");
    if (alt) alt.addEventListener("click", offer);
    var ways = document.querySelector("[data-ways-lobby]");
    if (ways) {
      ways.textContent = list.length
        ? S.plural(list.length, "game") + " waiting to be taken"
        : "Leave an offer; the next person takes it";
    }
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

  /* one button that does whatever is sensible: take the longest-waiting offer
     if there is one, otherwise leave one of your own */
  function quick() {
    if (offers.length) accept(offers[0]);
    else offer();
  }

  $("[data-offer]").addEventListener("click", offer);
  document.querySelectorAll("[data-quick]").forEach(function (b) {
    b.addEventListener("click", quick);
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
    $("[data-lobby-name]").textContent = "Open games";
    var top = $("[data-top-name]");
    if (top) top.textContent = "The ladder";
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
    icons();
    hero();
    drawSeeks([], 0);          /* something to look at before the lobby answers */
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
