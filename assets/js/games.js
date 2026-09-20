/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the games list
   ----------------------------------------------------------------------------
   Your whole record, filtered a few useful ways, with each row a way back onto
   the board. The whole list can be copied out as text: it is your record, and
   it should not be trapped in one browser.
   ============================================================================ */
(function () {
  "use strict";
  var S = window.UNC.site, A = window.UNC.archive, ACC = window.UNC.account;
  var rowsEl = document.querySelector("[data-rows]");
  var emptyEl = document.querySelector("[data-empty]");
  var filter = "all";
  var view = "local", fromServer = null;

  /* A game from the server's book, said the way this browser's own book says
     things, so one set of rows does for both. */
  function mine(g) {
    var me = ACC.me() || {};
    var meX = g.x.id === me.id;
    var side = meX ? 1 : 2;
    return {
      id: g.id, at: g.at, mode: "online",
      result: g.winner === 0 ? "draw" : g.winner === side ? "win" : "loss",
      side: side, ending: g.ending, plies: g.plies, moves: g.moves, rated: g.rated,
      before: meX ? g.x.before : g.o.before,
      after: meX ? g.x.after : g.o.after,
      change: (meX ? g.x.after - g.x.before : g.o.after - g.o.before),
      opponent: meX ? { id: g.o.id, name: g.o.name } : { id: g.x.id, name: g.x.name },
      server: true
    };
  }

  function games() {
    return view === "server" && fromServer ? fromServer : A.all();
  }

  function keep(g) {
    if (filter === "all") return true;
    if (filter === "rated") return g.rated;
    if (filter === "online" || filter === "computer") return g.mode === filter;
    return g.result === filter;
  }

  function draw() {
    var all = games(), list = all.filter(keep), sum = A.summary(all);

    document.querySelector("[data-tiles]").innerHTML =
      tile(sum.played, "games") +
      tile(sum.wins + " / " + sum.draws + " / " + sum.losses, "won / drawn / lost") +
      tile(sum.rate + "%", "score") +
      tile(sum.longest, "best run", sum.streak ? "on " + sum.streak + " now" : "") +
      tile(sum.averageLength, "moves a game", sum.byTime ? sum.byTime + " on time" : "");

    document.querySelector("[data-table-box]").hidden = !list.length;
    document.querySelector("[data-tools]").hidden = !all.length;
    emptyEl.innerHTML = list.length ? "" : S.nothing("board",
      all.length ? "Nothing matches that" : "No games yet",
      all.length
        ? "Try another filter — everything you have played is in here somewhere."
        : "Every game you finish is written down here: the moves, who it was " +
          "against, how it ended and what it did to your rating. Any of them " +
          "opens again on the board with the engine beside it.",
      all.length ? "" :
        '<a class="btn btn--go" style="width:auto" href="index.html">Find an opponent</a>' +
        '<a class="btn" href="play.html?mode=computer">Play the engine</a>');
    rowsEl.innerHTML = list.map(function (g) {
      var out = g.result === "win" ? '<span class="w">won</span>'
              : g.result === "loss" ? '<span class="l">lost</span>'
              : '<span class="d">drawn</span>';
      return "<tr><td>" + out + "</td>" +
        '<td><span class="name">' + (g.opponent ? S.face(g.opponent) : "") +
          S.esc(g.opponent ? g.opponent.name : "—") +
          (g.rated ? "" : '<span class="tag">casual</span>') + "</span></td>" +
        "<td>" + (g.side === 1 ? "crosses" : "noughts") + "</td>" +
        '<td class="num">' + g.plies + "</td>" +
        '<td class="num">' + (g.rated
            ? '<span class="' + (g.change > 0 ? "w" : g.change < 0 ? "l" : "d") + '">' +
              (g.change > 0 ? "+" : "") + g.change + "</span> " + g.after
            : "—") + "</td>" +
        "<td>" + (g.ending === "time" ? "on time" : "on the board") + "</td>" +
        '<td class="quiet" title="' + S.esc(S.when(g.at)) + '">' + S.esc(S.ago(g.at)) + "</td>" +
        '<td class="num"><a href="' + (g.server
            ? "play.html?g=" + encodeURIComponent(g.id)
            : "play.html?review=" + encodeURIComponent(g.id)) +
          '">go over it</a></td></tr>';
    }).join("");
  }

  function tile(n, k, sub) {
    return '<div class="tile"><span class="tile__n">' + S.esc(n) + "</span>" +
           '<span class="tile__k">' + S.esc(k) + "</span>" +
           (sub ? '<span class="tile__sub">' + S.esc(sub) + "</span>" : "") + "</div>";
  }

  /* one line a game, the way you would write it in a notebook */
  function asText() {
    return games().map(function (g) {
      return [new Date(g.at).toISOString().slice(0, 16).replace("T", " "),
              g.result, g.opponent ? g.opponent.name : "—",
              (g.side === 1 ? "X" : "O"), g.plies + " moves",
              g.rated ? (g.change > 0 ? "+" : "") + g.change + " (" + g.after + ")" : "casual",
              g.moves].join("  ");
    }).join("\n");
  }

  function tabs() {
    var bar = document.querySelector("[data-tabs]");
    if (!ACC.configured() || !ACC.me()) return;
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
    if (ACC.configured() && ACC.me()) {
      view = "server";
      tabs();
      ACC.ask("/api/games?player=" + encodeURIComponent(ACC.me().name) + "&limit=100")
        .then(function (got) {
          fromServer = got.games.map(mine);
          draw();
        }, function () { view = "local"; tabs(); draw(); });
    }
    draw();
    document.querySelector("[data-filter]").addEventListener("change", function (ev) {
      filter = ev.target.value;
      draw();
    });
    document.querySelector("[data-export]").addEventListener("click", function (ev) {
      var text = asText();
      var btn = ev.target;
      function done() {
        btn.textContent = "Copied — " + S.plural(games().length, "game");
        setTimeout(function () { btn.textContent = "Copy them all as text"; }, 2200);
      }
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, done);
      else done();
    });
    document.querySelector("[data-forget]").addEventListener("click", function () {
      if (!confirm("Delete every game in this browser's record? Your rating stays.")) return;
      A.forget();
      draw();
    });
  });
})();
