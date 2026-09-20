/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — a profile
   ----------------------------------------------------------------------------
   Your rating drawn game by game, how much you have been playing, and how you
   have done against everybody you have met. It reads from whichever book
   applies: the server's, when you are signed in or looking somebody up, and
   this browser's own when there is no server in the picture.

   Both books are shaped the same way by the time the drawing starts, so there
   is one set of charts and one set of tables rather than two of each.
   ============================================================================ */
(function () {
  "use strict";
  var S = window.UNC.site, P = window.UNC.player, A = window.UNC.archive;
  var ACC = window.UNC.account;
  var $ = function (sel) { return document.querySelector(sel); };

  /* ---- where the numbers come from --------------------------------------- */
  function localBook() {
    var me = P.me(), rivals = P.rivals();
    return {
      who: { name: me.name, id: me.id, rating: Math.round(me.rating), best: me.best,
             games: me.games, wins: me.wins, draws: me.draws, losses: me.losses,
             since: me.since, provisional: P.provisional(me), place: null },
      mine: true, server: false,
      summary: A.summary(),
      line: A.ratingLine(P.START),
      days: A.recent(30),
      rivals: Object.keys(rivals).map(function (id) {
        var r = rivals[id], mine = A.against(id);
        return {
          id: id, name: r.name, rating: Math.round(r.rating || P.START),
          games: r.games || 0, last: r.last || r.seen,
          w: mine.filter(function (g) { return g.result === "win"; }).length,
          l: mine.filter(function (g) { return g.result === "loss"; }).length,
          d: mine.filter(function (g) { return g.result === "draw"; }).length
        };
      }).filter(function (r) { return r.games; })
    };
  }

  /* the same shape, worked out from the games the server has on file */
  function serverBook(data, mine) {
    var who = data.player, games = data.games || [];
    var sum = { played: 0, wins: 0, draws: 0, losses: 0, rated: 0, asX: 0, asO: 0,
                winsAsX: 0, winsAsO: 0, byTime: 0, plies: 0, streak: 0, longest: 0 };
    var line = [{ at: 0, rating: 1200 }], rivals = {}, run = 0;

    games.slice().reverse().forEach(function (g) {
      var meX = g.x.id === who.id;
      var side = meX ? 1 : 2;
      var result = g.winner === 0 ? "draw" : g.winner === side ? "win" : "loss";
      var them = meX ? g.o : g.x;

      sum.played++;
      sum.plies += g.plies;
      if (result === "win") sum.wins++; else if (result === "loss") sum.losses++; else sum.draws++;
      if (side === 1) { sum.asX++; if (result === "win") sum.winsAsX++; }
      else { sum.asO++; if (result === "win") sum.winsAsO++; }
      if (g.ending === "time") sum.byTime++;
      run = result === "win" ? run + 1 : 0;
      if (run > sum.longest) sum.longest = run;

      if (g.rated) {
        sum.rated++;
        var after = meX ? g.x.after : g.o.after;
        var before = meX ? g.x.before : g.o.before;
        line.push({ at: g.at, rating: after, change: after - before, id: g.id });
      }
      var r = rivals[them.id] || { id: them.id, name: them.name, games: 0, w: 0, d: 0, l: 0 };
      r.games++;
      r[result === "win" ? "w" : result === "loss" ? "l" : "d"]++;
      r.last = Math.max(r.last || 0, g.at);
      r.rating = meX ? g.o.after : g.x.after;
      rivals[them.id] = r;
    });

    for (var i = 0; i < games.length; i++) {
      var g2 = games[i], meX2 = g2.x.id === who.id;
      if (g2.winner !== (meX2 ? 1 : 2)) break;
      sum.streak++;
    }
    sum.rate = sum.played ? Math.round((sum.wins + sum.draws / 2) / sum.played * 100) : 0;
    sum.averageLength = sum.played ? Math.round(sum.plies / sum.played) : 0;

    var day = 86400000, today = new Date();
    today.setHours(0, 0, 0, 0);
    var first = today.getTime() - 29 * day, days = [];
    for (var d = 0; d < 30; d++) days.push({ at: first + d * day, games: 0, wins: 0 });
    games.forEach(function (g) {
      var at = Math.floor((g.at - first) / day);
      if (at < 0 || at > 29) return;
      days[at].games++;
      if (g.winner === (g.x.id === who.id ? 1 : 2)) days[at].wins++;
    });

    return {
      who: { name: who.name, id: who.id, rating: who.rating, best: who.best,
             games: who.games, wins: who.wins, draws: who.draws, losses: who.losses,
             since: who.since, provisional: who.provisional, place: who.place,
             online: data.online },
      mine: !!mine, server: true, summary: sum, line: line, days: days,
      rivals: Object.keys(rivals).map(function (id) { return rivals[id]; })
        .sort(function (a, b) { return b.last - a.last; }),
      games: games
    };
  }

  /* ---- the head ----------------------------------------------------------- */
  function head(book) {
    var who = book.who, sum = book.summary;
    $("[data-head]").innerHTML =
      '<div class="profile__card">' +
        '<span class="face face--huge" style="background:' + S.tint(who.id) + '">' +
          S.esc(S.initials(who.name)) + "</span>" +
        "<div>" +
          "<h1>" + S.esc(who.name) + "</h1>" +
          '<p class="profile__sub">' + who.rating +
            (who.provisional ? " provisional" : "") +
            (who.place ? " · #" + who.place + " on the ladder" : "") + " · " +
            S.plural(who.games || sum.played, "game") +
            (book.server ? " · on the server" : " · in this browser") +
            (who.since ? " · since " + S.esc(new Date(who.since).toLocaleDateString(undefined,
              { month: "long", year: "numeric" })) : "") + "</p>" +
        "</div>" +
      "</div>";

    $("[data-tiles]").innerHTML =
      tile(who.rating, "rating", who.best > who.rating ? "best " + who.best : "best yet") +
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

  /* ---- the rating line ---------------------------------------------------- */
  /* One measure, one line: no legend to draw, so the last point is labelled
     and the rest is left quiet. */
  function ratingLine(book) {
    var line = book.line, box = $("[data-rating]");
    if (line.length < 2) {
      box.innerHTML = '<p class="empty">A rating is drawn here once there are ' +
        "rated games to draw it from.</p>";
      $("[data-rating-range]").textContent = "";
      return;
    }
    var W = 520, H = 190, L = 34, R = 12, T = 12, B = 20;
    var lo = Math.min.apply(null, line.map(function (p) { return p.rating; }));
    var hi = Math.max.apply(null, line.map(function (p) { return p.rating; }));
    var pad = Math.max(20, Math.round((hi - lo) * 0.15));
    var low = lo - pad, high = hi + pad;
    var x = function (i) { return L + i / (line.length - 1) * (W - L - R); };
    var y = function (v) { return T + (high - v) / (high - low) * (H - T - B); };

    var ticks = [], stepAt = niceStep(high - low);
    for (var t = Math.ceil(low / stepAt) * stepAt; t <= high; t += stepAt) ticks.push(t);

    var path = line.map(function (p, i) {
      return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.rating).toFixed(1);
    }).join(" ");
    var area = path + " L" + x(line.length - 1).toFixed(1) + " " + (H - B) +
               " L" + x(0).toFixed(1) + " " + (H - B) + " Z";
    var last = line[line.length - 1];
    var band = (W - L - R) / line.length;

    box.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" class="chart" ' +
        'aria-label="Rating after each rated game, ending at ' + last.rating + '">' +
        ticks.map(function (v) {
          return '<line class="chart__grid" x1="' + L + '" y1="' + y(v).toFixed(1) +
                 '" x2="' + (W - R) + '" y2="' + y(v).toFixed(1) + '"/>' +
                 '<text class="chart__tick" x="' + (L - 6) + '" y="' + (y(v) + 3.5).toFixed(1) +
                 '" text-anchor="end">' + v + "</text>";
        }).join("") +
        '<path class="chart__area" d="' + area + '"/>' +
        '<path class="chart__line" d="' + path + '"/>' +
        /* a dot on every game turns a long line into a dashed one, so they
           appear only while there are few enough to read; the hover target is
           a wide invisible band either way */
        line.map(function (p, i) {
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

    $("[data-rating-range]").textContent =
      S.plural(line.length - 1, "rated game") + " · low " + lo + " · high " + hi;
  }

  function niceStep(span) {
    var raw = span / 4, steps = [5, 10, 20, 25, 50, 100, 200, 250, 500];
    for (var i = 0; i < steps.length; i++) if (raw <= steps[i]) return steps[i];
    return 1000;
  }

  /* ---- how much playing has been going on --------------------------------- */
  function activity(book) {
    var days = book.days, box = $("[data-activity]");
    var most = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.games; })));
    var W = 520, H = 190, L = 24, R = 8, T = 12, B = 22;
    var slot = (W - L - R) / days.length;
    var w = Math.max(3, slot - 2);          /* two pixels of ground between bars */

    box.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" role="img" class="chart" ' +
        'aria-label="Games played on each of the last thirty days">' +
        '<line class="chart__grid" x1="' + L + '" y1="' + T + '" x2="' + (W - R) +
          '" y2="' + T + '"/>' +
        '<line class="chart__axis" x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) +
          '" y2="' + (H - B) + '"/>' +
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

  /* ---- who they have played ------------------------------------------------ */
  function rivals(book) {
    var rows = book.rivals || [];
    $("[data-rivals-empty]").hidden = rows.length > 0;
    $("[data-rivals]").innerHTML = rows.map(function (r) {
      return '<tr><td><span class="name">' + S.face(r) +
          (book.server ? '<a href="profile.html?player=' + encodeURIComponent(r.name) + '">' +
            S.esc(r.name) + "</a>" : S.esc(r.name)) + "</span></td>" +
        '<td class="num">' + Math.round(r.rating || 1200) + "</td>" +
        '<td class="num">' + r.games + "</td>" +
        '<td><span class="w">' + r.w + '</span> / <span class="d">' + r.d +
          '</span> / <span class="l">' + r.l + "</span></td>" +
        '<td class="quiet">' + S.esc(S.ago(r.last)) + "</td></tr>";
    }).join("");
  }

  /* ---- your name ----------------------------------------------------------- */
  function settings(book) {
    var card = $("[data-settings]");
    if (!book.mine) { card.hidden = true; return; }
    if (book.server) {
      card.innerHTML =
        '<div class="card__head"><h2>Your account</h2></div>' +
        "<p>You are signed in as <b>" + S.esc(book.who.name) + "</b> on " +
        S.esc(ACC.where().replace(/^https?:\/\//, "")) + ". Your name, rating and " +
        "games live there, so they follow you to any browser you sign in from.</p>" +
        '<div class="row-btn"><button class="btn btn--slim" type="button" data-signout>Sign out</button></div>';
      $("[data-signout]").addEventListener("click", function () {
        ACC.leave().then(function () { location.href = "index.html"; });
      });
      return;
    }
    var input = $("[data-name]"), said = $("[data-said]");
    input.value = P.me().name;
    $("[data-save]").addEventListener("click", function () {
      var name = P.rename(input.value);
      input.value = name;
      said.textContent = "Saved. Other players will see " + name + ".";
      head(localBook());
    });
    $("[data-forget]").addEventListener("click", function () {
      if (!confirm("Forget your name, rating, rivals and every game? This cannot be undone.")) return;
      P.forget();
      A.forget();
      location.reload();
    });
  }

  function show(book) {
    head(book);
    ratingLine(book);
    activity(book);
    rivals(book);
    settings(book);
  }

  S.ready(function () {
    var asked = new URLSearchParams(location.search).get("player");
    var me = ACC.configured() ? ACC.me() : null;

    if (asked || (me && !asked)) {
      var name = asked || me.name;
      ACC.ask("/api/players/" + encodeURIComponent(name)).then(function (got) {
        show(serverBook(got, !asked || (me && me.name.toLowerCase() === name.toLowerCase())));
      }, function (err) {
        show(localBook());
        $("[data-rating-range]").textContent = err.message;
      });
      return;
    }
    show(localBook());
  });
})();
