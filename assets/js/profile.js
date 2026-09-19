/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — your profile
   ----------------------------------------------------------------------------
   Your rating drawn game by game, how much you have been playing, and how you
   have done against each person you have met. Two charts, both single-measure,
   both hoverable; the numbers under them are the same numbers, said plainly,
   so nothing here is carried by colour alone.
   ============================================================================ */
(function () {
  "use strict";
  var S = window.UNC.site, P = window.UNC.player, A = window.UNC.archive;

  /* ---- the head --------------------------------------------------------- */
  function head() {
    var me = P.me(), sum = A.summary();
    document.querySelector("[data-head]").innerHTML =
      '<div class="profile__card">' +
        '<span class="face face--huge" style="background:' + S.tint(me.id) + '">' +
          S.esc(S.initials(me.name)) + "</span>" +
        "<div>" +
          "<h1>" + S.esc(me.name) + "</h1>" +
          '<p class="profile__sub">' + Math.round(me.rating) +
            (P.provisional(me) ? " provisional" : "") + " · " +
            S.plural(sum.played, "game") + " · playing since " +
            S.esc(new Date(me.since || Date.now()).toLocaleDateString(undefined,
              { month: "long", year: "numeric" })) + "</p>" +
        "</div>" +
      "</div>";

    document.querySelector("[data-tiles]").innerHTML =
      tile(Math.round(me.rating), "rating",
           me.best > me.rating ? "best " + me.best : "your best yet") +
      tile(sum.wins + " / " + sum.draws + " / " + sum.losses, "won / drawn / lost") +
      tile(sum.rate + "%", "score") +
      tile(sum.streak || sum.longest, sum.streak ? "on a run of" : "best run",
           sum.streak ? "longest " + sum.longest : "wins in a row") +
      tile(sum.asX ? Math.round(sum.winsAsX / sum.asX * 100) + "%" : "—", "as crosses",
           S.plural(sum.asX, "game")) +
      tile(sum.asO ? Math.round(sum.winsAsO / sum.asO * 100) + "%" : "—", "as noughts",
           S.plural(sum.asO, "game"));
  }

  function tile(n, k, sub) {
    return '<div class="tile"><span class="tile__n">' + S.esc(n) + "</span>" +
           '<span class="tile__k">' + S.esc(k) + "</span>" +
           (sub ? '<span class="tile__sub">' + S.esc(sub) + "</span>" : "") + "</div>";
  }

  /* ---- the rating line --------------------------------------------------- */
  /* One measure, one line: no legend to draw, so the last point is labelled
     instead and the rest is left quiet. */
  function ratingLine() {
    var line = A.ratingLine(P.START), box = document.querySelector("[data-rating]");
    if (line.length < 2) {
      box.innerHTML = '<p class="empty">Your rating is drawn here once you have ' +
        "played a rated game — that means an online opponent.</p>";
      return;
    }
    var W = 520, H = 190, L = 34, R = 12, T = 12, B = 20;
    var lo = Math.min.apply(null, line.map(function (p) { return p.rating; }));
    var hi = Math.max.apply(null, line.map(function (p) { return p.rating; }));
    var pad = Math.max(20, Math.round((hi - lo) * 0.15));
    lo -= pad; hi += pad;
    var x = function (i) { return L + i / (line.length - 1) * (W - L - R); };
    var y = function (v) { return T + (hi - v) / (hi - lo) * (H - T - B); };

    var ticks = [], stepAt = niceStep(hi - lo);
    for (var t = Math.ceil(lo / stepAt) * stepAt; t <= hi; t += stepAt) ticks.push(t);

    var path = line.map(function (p, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.rating).toFixed(1); }).join(" ");
    var area = path + " L" + x(line.length - 1).toFixed(1) + " " + (H - B) +
               " L" + x(0).toFixed(1) + " " + (H - B) + " Z";
    var last = line[line.length - 1];

    box.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" class="chart" ' +
        'aria-label="Your rating after each rated game, ending at ' + last.rating + '">' +
        ticks.map(function (v) {
          return '<line class="chart__grid" x1="' + L + '" y1="' + y(v).toFixed(1) +
                 '" x2="' + (W - R) + '" y2="' + y(v).toFixed(1) + '"/>' +
                 '<text class="chart__tick" x="' + (L - 6) + '" y="' + (y(v) + 3.5).toFixed(1) +
                 '" text-anchor="end">' + v + "</text>";
        }).join("") +
        '<path class="chart__area" d="' + area + '"/>' +
        '<path class="chart__line" d="' + path + '"/>' +
        /* A dot on every game turns a long line into a dashed one, so they
           appear only while there are few enough to read; the hover target is
           a wide invisible band either way, which is what you can actually
           hit with a finger. */
        line.map(function (p, i) {
          var band = (W - L - R) / line.length;
          var dot = line.length <= 20 || i === line.length - 1
            ? '<circle class="chart__dot" cx="' + x(i).toFixed(1) + '" cy="' +
              y(p.rating).toFixed(1) + '" r="' + (i === line.length - 1 ? 4 : 2.5) + '"/>'
            : "";
          return "<g>" + dot + '<rect class="chart__hit" x="' + (x(i) - band / 2).toFixed(1) +
                 '" y="' + T + '" width="' + band.toFixed(1) + '" height="' + (H - T - B) +
                 '"><title>' +
                 S.esc((p.change > 0 ? "+" : "") + (p.change || 0) + " · " + p.rating +
                       (p.at ? " · " + S.ago(p.at) : " · the start")) + "</title></rect></g>";
        }).join("") +
        '<text class="chart__now" x="' + (x(line.length - 1) - 8).toFixed(1) + '" y="' +
          (y(last.rating) - 9).toFixed(1) + '" text-anchor="end">' + last.rating + "</text>" +
      "</svg>";

    document.querySelector("[data-rating-range]").textContent =
      S.plural(line.length - 1, "rated game") + " · low " + Math.round(lo + pad) +
      " · high " + Math.round(hi - pad);
  }

  function niceStep(span) {
    var raw = span / 4;
    var steps = [5, 10, 20, 25, 50, 100, 200, 250, 500];
    for (var i = 0; i < steps.length; i++) if (raw <= steps[i]) return steps[i];
    return 1000;
  }

  /* ---- how much you have been playing ------------------------------------ */
  function activity() {
    var days = A.recent(30), box = document.querySelector("[data-activity]");
    var most = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.games; })));
    var W = 520, H = 190, L = 24, R = 8, T = 12, B = 22;
    var slot = (W - L - R) / days.length;
    var w = Math.max(3, slot - 2);          /* two pixels of ground between bars */

    box.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" class="chart" ' +
        'aria-label="Games played on each of the last thirty days">' +
        '<line class="chart__axis" x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) +
          '" y2="' + (H - B) + '"/>' +
        '<line class="chart__grid" x1="' + L + '" y1="' + T + '" x2="' + (W - R) +
          '" y2="' + T + '"/>' +
        '<text class="chart__tick" x="' + (L - 6) + '" y="' + (T + 4) + '" text-anchor="end">' +
          most + "</text>" +
        days.map(function (d, i) {
          var h = d.games / most * (H - T - B);
          var xx = L + i * slot + (slot - w) / 2;
          var label = new Date(d.at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
          return '<rect class="chart__bar' + (d.games ? "" : " chart__bar--none") + '" x="' +
            xx.toFixed(1) + '" y="' + (H - B - h).toFixed(1) + '" width="' + w.toFixed(1) +
            '" height="' + Math.max(d.games ? 3 : 1, h).toFixed(1) + '" rx="2"><title>' +
            S.esc(label + ": " + S.plural(d.games, "game") +
                  (d.games ? ", " + d.wins + " won" : "")) + "</title></rect>";
        }).join("") +
        '<text class="chart__tick" x="' + L + '" y="' + (H - 6) + '">30 days ago</text>' +
        '<text class="chart__tick" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">today</text>' +
      "</svg>";
  }

  /* ---- who you have played ----------------------------------------------- */
  function rivals() {
    var all = P.rivals(), ids = Object.keys(all);
    var rows = ids.map(function (id) { return all[id]; })
      .filter(function (r) { return r.games; })
      .sort(function (a, b) { return (b.last || 0) - (a.last || 0); });
    document.querySelector("[data-rivals-empty]").hidden = rows.length > 0;
    document.querySelector("[data-rivals]").innerHTML = rows.map(function (r) {
      var mine = A.against(r.id);
      var w = mine.filter(function (g) { return g.result === "win"; }).length;
      var l = mine.filter(function (g) { return g.result === "loss"; }).length;
      var d = mine.length - w - l;
      return '<tr><td><span class="name">' + S.face(r) + S.esc(r.name) + "</span></td>" +
        '<td class="num">' + Math.round(r.rating || P.START) + "</td>" +
        '<td class="num">' + (r.games || 0) + "</td>" +
        '<td><span class="w">' + w + "</span> / <span class=\"d\">" + d +
          '</span> / <span class="l">' + l + "</span></td>" +
        '<td class="quiet">' + S.esc(S.ago(r.last || r.seen)) + "</td></tr>";
    }).join("");
  }

  /* ---- your name --------------------------------------------------------- */
  function settings() {
    var input = document.querySelector("[data-name]");
    var said = document.querySelector("[data-said]");
    input.value = P.me().name;
    document.querySelector("[data-save]").addEventListener("click", function () {
      var name = P.rename(input.value);
      input.value = name;
      said.textContent = "Saved. Other players will see " + name + ".";
      head();
    });
    document.querySelector("[data-forget]").addEventListener("click", function () {
      if (!confirm("Forget your name, rating, rivals and every game? This cannot be undone.")) return;
      P.forget();
      A.forget();
      location.reload();
    });
  }

  S.ready(function () { head(); ratingLine(); activity(); rivals(); settings(); });
})();
