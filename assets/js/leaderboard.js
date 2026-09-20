/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the rating table
   ----------------------------------------------------------------------------
   Everybody this browser knows about: you, everybody you have played, and
   anybody standing in the lobby right now. The lobby is joined only to mark
   who is online — nothing is posted on your behalf by opening this page.
   ============================================================================ */
(function () {
  "use strict";
  var S = window.UNC.site, P = window.UNC.player, A = window.UNC.archive;
  var ACC = window.UNC.account;
  var online = {};
  var view = ACC.configured() ? "server" : "local";
  var ladder = null;      /* what the server last said */

  var BLURB = {
    server: "Everybody who has played a rated game on this server, strongest " +
            "first. The server refereed every one of them, so nobody's rating " +
            "is anybody's word against anybody else's.",
    local: "You and everybody you have played from this browser, strongest " +
           "first — your own circle, kept here. Games played signed in to the " +
           "server are on the ladder instead."
  };

  function drawServer() {
    var rows = (ladder && ladder.table) || [];
    var me = ACC.me();
    var mine = me ? rows.filter(function (r) { return r.id === me.id; })[0] : null;

    document.querySelector("[data-tiles]").innerHTML =
      tile(ladder ? ladder.players : "—", "players", "with an account here") +
      tile(ladder ? ladder.games : "—", "games played", "kept on the server") +
      tile(mine ? mine.rating : (me ? me.rating : "—"), "your rating",
           mine ? "#" + mine.place + " on the ladder" : me ? "unrated so far" : "sign in to join") +
      tile(rows.filter(function (r) { return r.online; }).length, "online now");

    document.querySelector("[data-table]").innerHTML = rows.map(function (r) {
      var you = me && r.id === me.id;
      return "<tr" + (you ? ' class="you"' : "") + ">" +
        '<td class="num quiet">' + r.place + "</td>" +
        '<td><span class="name"><span class="dot ' + (r.online ? "dot--on" : "dot--off") +
          '"></span>' + S.face(r) + '<a href="profile.html?player=' +
          encodeURIComponent(r.name) + '">' + S.esc(r.name) + "</a>" +
          (you ? '<span class="tag">you</span>' : "") + "</span></td>" +
        '<td class="num">' + r.rating + (r.provisional ? "?" : "") + "</td>" +
        '<td class="num">' + r.games + "</td>" +
        '<td class="num w">' + r.wins + "</td>" +
        '<td class="num d">' + r.draws + "</td>" +
        '<td class="num l">' + r.losses + "</td>" +
        '<td class="num">' + (r.games ? Math.round((r.wins + r.draws / 2) / r.games * 100) + "%" : "—") + "</td>" +
        '<td class="quiet">' + S.esc(r.online ? "now" : S.ago(r.seen)) + "</td></tr>";
    }).join("");
    document.querySelector("[data-table-box]").hidden = !rows.length;
    document.querySelector("[data-empty]").innerHTML = rows.length ? "" : S.nothing("people",
      "Nobody has finished a rated game here yet",
      "Be the first. Every rated game on this server is refereed by it, so what " +
      "ends up in this table is not anybody's word for it.",
      '<a class="btn btn--go" style="width:auto" href="index.html">Find an opponent</a>');
  }

  function draw() {
    document.querySelector("[data-blurb]").innerHTML = S.esc(BLURB[view]) +
      ' <a href="#how">How the rating works.</a>';
    if (view === "server") return drawServer();
    drawLocal();
  }

  function drawLocal() {
    var rows = P.table();
    var me = rows.filter(function (r) { return r.you; })[0];
    var sum = A.summary();

    document.querySelector("[data-tiles]").innerHTML =
      tile(me.rating + (me.provisional ? "?" : ""), "your rating",
           me.provisional ? (P.PROVISIONAL - me.games) + " rated games to settle it" : "") +
      tile("#" + me.place, "of " + S.plural(rows.length, "player")) +
      tile(sum.rate + "%", "your score", sum.wins + " won, " + sum.draws + " drawn") +
      tile(Object.keys(online).length, "online now", "in the lobby");

    var alone = rows.filter(function (r) { return r.games; }).length === 0;
    document.querySelector("[data-table-box]").hidden = alone;
    document.querySelector("[data-empty]").innerHTML = alone ? S.nothing("people",
      "Nobody has played yet",
      "This table fills itself in as you play. Beat somebody and their points " +
      "come to you; lose and they go the other way. Games against the engine " +
      "are kept, but they are not rated.",
      '<a class="btn btn--go" style="width:auto" href="index.html">Find an opponent</a>' +
      '<a class="btn" href="play.html?mode=computer">Play the engine</a>') : "";
    document.querySelector("[data-table]").innerHTML = (alone ? [] : rows).map(function (r) {
      var here = online[r.id] || r.you;
      return "<tr" + (r.you ? ' class="you"' : "") + ">" +
        '<td class="num quiet">' + r.place + "</td>" +
        '<td><span class="name"><span class="dot ' + (here ? "dot--on" : "dot--off") +
          '"></span>' + S.face(r) + S.esc(r.name) +
          (r.you ? '<span class="tag">you</span>' : "") + "</span></td>" +
        '<td class="num">' + r.rating + (r.provisional ? "?" : "") + "</td>" +
        '<td class="num">' + r.games + "</td>" +
        '<td class="num w">' + r.wins + "</td>" +
        '<td class="num d">' + r.draws + "</td>" +
        '<td class="num l">' + r.losses + "</td>" +
        '<td class="num">' + (r.games ? Math.round((r.wins + r.draws / 2) / r.games * 100) + "%" : "—") + "</td>" +
        '<td class="quiet">' + S.esc(here ? "now" : S.ago(r.last || r.seen)) + "</td></tr>";
    }).join("");
  }

  function tile(n, k, sub) {
    return '<div class="tile"><span class="tile__n">' + S.esc(n) + "</span>" +
           '<span class="tile__k">' + S.esc(k) + "</span>" +
           (sub ? '<span class="tile__sub">' + S.esc(sub) + "</span>" : "") + "</div>";
  }

  function tabs() {
    var bar = document.querySelector("[data-tabs]");
    if (!ACC.configured()) return;
    bar.hidden = false;
    bar.querySelectorAll("[data-tab]").forEach(function (b) {
      b.classList.toggle("tab--on", b.getAttribute("data-tab") === view);
      b.addEventListener("click", function () {
        view = b.getAttribute("data-tab");
        tabs();
        draw();
      });
    });
  }

  S.ready(function () {
    tabs();
    draw();
    var note = document.querySelector("[data-live-note]");

    if (ACC.configured()) {
      ACC.ask("/api/leaderboard").then(function (got) {
        ladder = got;
        note.textContent = S.plural(got.players, "player") + " on this server";
        draw();
      }, function (err) {
        note.textContent = err.message;
        if (view === "server") { view = "local"; tabs(); draw(); }
      });
    }

    var lobby = window.UNC.lobby.join({
      list: function (seeks, count) {
        online = {};
        lobby.everyone().forEach(function (w) { online[w.id] = true; });
        if (view === "local") {
          note.textContent = count ? S.plural(count, "player") + " in the lobby" : "";
          draw();
        }
      },
      status: function (text, kind) { if (kind === "error") note.textContent = text; }
    });
  });
})();
