/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the games list
   ----------------------------------------------------------------------------
   Your whole record, filtered a few useful ways, with each row a way back onto
   the board. The whole list can be copied out as text: it is your record, and
   it should not be trapped in one browser.
   ============================================================================ */
(function () {
  "use strict";
  var S = window.UNC.site, A = window.UNC.archive;
  var rowsEl = document.querySelector("[data-rows]");
  var emptyEl = document.querySelector("[data-empty]");
  var filter = "all";

  function keep(g) {
    if (filter === "all") return true;
    if (filter === "rated") return g.rated;
    if (filter === "online" || filter === "computer") return g.mode === filter;
    return g.result === filter;
  }

  function draw() {
    var all = A.all(), list = all.filter(keep), sum = A.summary(all);

    document.querySelector("[data-tiles]").innerHTML =
      tile(sum.played, "games") +
      tile(sum.wins + " / " + sum.draws + " / " + sum.losses, "won / drawn / lost") +
      tile(sum.rate + "%", "score") +
      tile(sum.longest, "best run", sum.streak ? "on " + sum.streak + " now" : "") +
      tile(sum.averageLength, "moves a game", sum.byTime ? sum.byTime + " on time" : "");

    emptyEl.hidden = list.length > 0;
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
        '<td class="num"><a href="play.html?review=' + encodeURIComponent(g.id) +
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
    return A.all().map(function (g) {
      return [new Date(g.at).toISOString().slice(0, 16).replace("T", " "),
              g.result, g.opponent ? g.opponent.name : "—",
              (g.side === 1 ? "X" : "O"), g.plies + " moves",
              g.rated ? (g.change > 0 ? "+" : "") + g.change + " (" + g.after + ")" : "casual",
              g.moves].join("  ");
    }).join("\n");
  }

  S.ready(function () {
    draw();
    document.querySelector("[data-filter]").addEventListener("change", function (ev) {
      filter = ev.target.value;
      draw();
    });
    document.querySelector("[data-export]").addEventListener("click", function (ev) {
      var text = asText();
      var btn = ev.target;
      function done() {
        btn.textContent = "Copied — " + S.plural(A.all().length, "game");
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
