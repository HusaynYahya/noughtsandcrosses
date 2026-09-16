/* ============================================================================
   The charts on progress.html. Plain SVG, no libraries: the data is small and
   the page should keep working for as long as the game does.
   ============================================================================ */
(function () {
  "use strict";
  var D = window.PROGRESS;
  if (!D) return;

  var $ = function (s) { return document.querySelector(s); };
  var tip = $("[data-tip]");
  var SEQ = ["--seq-1","--seq-2","--seq-3","--seq-4","--seq-5",
             "--seq-6","--seq-7","--seq-8","--seq-9","--seq-10"];

  var styles = getComputedStyle(document.documentElement);
  function css(name) { return styles.getPropertyValue(name).trim(); }
  function ramp(i, n) {          /* oldest palest, through the sequential blues */
    if (n <= 1) return css(SEQ[SEQ.length - 3]);
    var lo = 1, hi = SEQ.length - 1;              /* keep off the very lightest */
    var k = Math.round(lo + (hi - lo) * (i / (n - 1)));
    return css(SEQ[k]);
  }
  function el(tag, attrs, text) {
    var n = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    return n;
  }
  function svg(host, w, h) {
    var s = el("svg", { viewBox: "0 0 " + w + " " + h, role: "img" });
    host.appendChild(s);
    return s;
  }
  function show(ev, html) {
    tip.innerHTML = html;
    tip.style.opacity = 1;
    var pad = 14;
    var x = Math.min(ev.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
    var y = Math.max(8, ev.clientY - tip.offsetHeight - pad);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  function hide() { tip.style.opacity = 0; }
  function hoverable(node, html) {
    node.addEventListener("mousemove", function (e) { show(e, html); });
    node.addEventListener("mouseleave", hide);
    node.addEventListener("touchstart", function (e) { show(e.touches[0], html); }, { passive: true });
  }

  var gens = D.generations;
  var trained = gens.filter(function (g) { return g.generation > 0; });

  /* ---- the headline numbers -------------------------------------------- */
  (function kpis() {
    var host = $("[data-kpis]");
    var kept = trained.filter(function (g) { return g.kept; }).length;
    var positions = trained.reduce(function (a, g) { return a + (g.trainedOn || 0); }, 0);
    var games = Object.keys(D.selfplay).reduce(function (a, k) { return a + D.selfplay[k].games; }, 0);
    var champ = D.ladder.filter(function (l) { return l.generation === D.shipped; })[0]
      || { score: 50, elo: 0 };
    var items = [
      [trained.length, "generations trained"],
      [kept + " of " + trained.length, "kept after their match"],
      [games.toLocaleString(), "self-play games"],
      [positions.toLocaleString(), "positions learned from"],
      [champ.score.toFixed(0) + "%", "the champion against generation 0"],
      ["gen " + D.shipped, "shipped in the game"]
    ];
    items.forEach(function (it) {
      var d = document.createElement("div");
      d.className = "kpi";
      d.innerHTML = '<div class="kpi__n">' + it[0] + '</div><div class="kpi__l">' + it[1] + '</div>';
      host.appendChild(d);
    });
  })();

  /* ---- strength against generation 0 ----------------------------------- */
  (function ladder() {
    var host = $('[data-chart="ladder"]');
    var data = D.ladder;
    if (!data.length) return;
    var W = 900, H = 300, L = 46, R = 16, T = 16, B = 34;
    var s = svg(host, W, H);
    var xs = data.map(function (d) { return d.generation; });
    var maxX = Math.max.apply(null, xs);
    var lo = 30, hi = 95;
    var x = function (g) { return L + (W - L - R) * (maxX ? g / maxX : 0); };
    var y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };

    var g = el("g", { class: "grid" });
    for (var v = 30; v <= hi; v += 10) {
      g.appendChild(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v) }));
      s.appendChild(el("text", { x: L - 8, y: y(v) + 3, "text-anchor": "end", class: "lbl" }, v + "%"));
    }
    s.appendChild(g);
    /* level with generation 0 */
    s.appendChild(el("line", { x1: L, x2: W - R, y1: y(50), y2: y(50),
                               stroke: css("--line"), "stroke-width": 1.5 }));
    s.appendChild(el("text", { x: W - R, y: y(50) - 6, "text-anchor": "end", class: "lbl" },
      "level with generation 0"));

    /* the 95% band on each match, drawn first so the marks sit on top */
    data.forEach(function (d) {
      if (!d.games) return;
      s.appendChild(el("line", { x1: x(d.generation), x2: x(d.generation),
        y1: y(d.low), y2: y(d.high), stroke: css("--line"), "stroke-width": 6,
        "stroke-linecap": "round", opacity: .9 }));
    });

    var path = data.map(function (d, i) { return (i ? "L" : "M") + x(d.generation) + " " + y(d.score); }).join(" ");
    s.appendChild(el("path", { d: path, fill: "none", stroke: css("--seq-7"), "stroke-width": 2,
                               "stroke-linejoin": "round" }));

    data.forEach(function (d) {
      var c = el("circle", { cx: x(d.generation), cy: y(d.score), r: 6,
        fill: d.kept ? css("--seq-7") : css("--surface-1"),
        stroke: d.kept ? css("--surface-1") : css("--seq-7"), "stroke-width": 2 });
      hoverable(c, "<b>generation " + d.generation + "</b><br>" + d.score.toFixed(1) +
        "% against generation 0" + (d.games ? " over " + d.games + " games" : "") +
        (d.games ? "<br>95% sure it is between " + d.low + "% and " + d.high + "%" : "") +
        "<br>" + (d.elo >= 0 ? "+" : "") + d.elo + " Elo<br>" +
        (d.generation === 0 ? "the starting point" : d.kept ? "kept by its gate" : "thrown away by its gate"));
      s.appendChild(c);
      s.appendChild(el("text", { x: x(d.generation), y: y(d.high) - 8, "text-anchor": "middle",
        class: "lbl" + (d.kept ? " lbl--on" : "") }, d.generation ? d.score.toFixed(0) + "%" : ""));
      s.appendChild(el("text", { x: x(d.generation), y: H - 12, "text-anchor": "middle", class: "lbl" },
        d.generation));
    });
    s.appendChild(el("text", { x: L, y: H - 1, class: "lbl" }, "generation"));
  })();

  /* ---- the gating matches, as a diverging bar about 50% ---------------- */
  (function gate() {
    var host = $('[data-chart="gate"]');
    var data = trained.filter(function (g) { return g.scoreAgainstParent != null; });
    if (!data.length) return;
    var W = 440, H = 260, L = 30, R = 40, T = 10, B = 28;
    var s = svg(host, W, H);
    var band = (H - T - B) / data.length;
    var mid = L + (W - L - R) / 2;
    var span = (W - L - R) / 2 / 25;               /* 25 points either side */

    s.appendChild(el("line", { x1: mid, x2: mid, y1: T, y2: H - B, stroke: css("--line"), "stroke-width": 1.5 }));
    s.appendChild(el("text", { x: mid, y: H - B + 14, "text-anchor": "middle", class: "lbl" }, "50%"));

    data.forEach(function (d, i) {
      var delta = d.scoreAgainstParent - 50;
      var w = Math.abs(delta) * span;
      var top = T + i * band + band * 0.22;
      var h = band * 0.56;
      var pos = delta >= 0;
      var r = el("rect", { x: pos ? mid : mid - w, y: top, width: Math.max(w, 1.5), height: h,
        rx: 2, fill: pos ? css(d.kept ? "--div-pos-3" : "--div-pos-1") : css("--div-neg-2") });
      hoverable(r, "<b>generation " + d.generation + "</b><br>" + d.scoreAgainstParent.toFixed(1) +
        "% against " + (d.parent || "its parent") + "<br>" + (d.kept ? "kept" : "thrown away"));
      s.appendChild(r);
      s.appendChild(el("text", { x: 4, y: top + h * 0.78, class: "lbl" + (d.kept ? " lbl--on" : "") },
        "gen " + d.generation));
      s.appendChild(el("text", { x: (pos ? mid + w : mid - w) + (pos ? 6 : -6), y: top + h * 0.78,
        "text-anchor": pos ? "start" : "end", class: "lbl" + (d.kept ? " lbl--on" : "") },
        d.scoreAgainstParent.toFixed(1) + "%"));
    });
  })();

  /* ---- self-play outcomes, stacked ------------------------------------- */
  (function selfplay() {
    var host = $('[data-chart="selfplay"]');
    var keys = Object.keys(D.selfplay).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) return;
    var W = 440, H = 260, L = 30, R = 12, T = 10, B = 30;
    var s = svg(host, W, H);
    var band = (W - L - R) / keys.length;
    var max = Math.max.apply(null, keys.map(function (k) { return D.selfplay[k].games; }));
    var y = function (v) { return T + (H - T - B) * (1 - v / max); };

    [0, 0.25, 0.5, 0.75, 1].forEach(function (f) {
      s.appendChild(el("line", { x1: L, x2: W - R, y1: y(max * f), y2: y(max * f),
                                 stroke: css("--grid") }));
      s.appendChild(el("text", { x: L - 6, y: y(max * f) + 3, "text-anchor": "end", class: "lbl" },
        Math.round(max * f)));
    });

    keys.forEach(function (k, i) {
      var d = D.selfplay[k];
      var x0 = L + i * band + band * 0.18, bw = band * 0.64;
      var parts = [["crosses", d.crosses, "--series-1"], ["noughts", d.noughts, "--series-2"],
                   ["drawn", d.drawn, "--series-3"]];
      var acc = 0;
      parts.forEach(function (p) {
        var h = (H - T - B) * (p[1] / max);
        var yy = y(acc + p[1]);
        var r = el("rect", { x: x0, y: yy, width: bw, height: Math.max(h - 2, 0), fill: css(p[2]), rx: 2 });
        hoverable(r, "<b>generation " + k + "</b><br>" + p[1] + " games " +
          (p[0] === "drawn" ? "drawn" : "won by " + p[0]) + " of " + d.games +
          "<br>" + d.positions.toLocaleString() + " positions, " + d.seconds + "s");
        s.appendChild(r);
        acc += p[1];
      });
      s.appendChild(el("text", { x: x0 + bw / 2, y: H - 12, "text-anchor": "middle", class: "lbl" }, k));
    });
    s.appendChild(el("text", { x: L, y: H - 1, class: "lbl" }, "generation"));
  })();

  /* ---- the fitting curves ---------------------------------------------- */
  function curves(host, rampHost, pick, fmt, pad) {
    var keys = Object.keys(D.epochs).map(Number).sort(function (a, b) { return a - b; });
    if (!keys.length) return;
    var W = 440, H = 260, L = 44, R = 14, T = 12, B = 30;
    var s = svg(host, W, H);
    var all = [];
    keys.forEach(function (k) { D.epochs[k].forEach(function (e) { all.push(pick(e)); }); });
    var lo = Math.min.apply(null, all) - pad, hi = Math.max.apply(null, all) + pad;
    var maxE = Math.max.apply(null, keys.map(function (k) { return D.epochs[k].length - 1; }));
    var x = function (e) { return L + (W - L - R) * (maxE ? e / maxE : 0); };
    var y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };

    for (var i = 0; i <= 4; i++) {
      var v = lo + (hi - lo) * i / 4;
      s.appendChild(el("line", { x1: L, x2: W - R, y1: y(v), y2: y(v), stroke: css("--grid") }));
      s.appendChild(el("text", { x: L - 6, y: y(v) + 3, "text-anchor": "end", class: "lbl" }, fmt(v)));
    }
    for (var e = 0; e <= maxE; e += Math.ceil(maxE / 6)) {
      s.appendChild(el("text", { x: x(e), y: H - 12, "text-anchor": "middle", class: "lbl" }, e));
    }
    s.appendChild(el("text", { x: L, y: H - 1, class: "lbl" }, "epoch"));

    keys.forEach(function (k, i) {
      var pts = D.epochs[k];
      var colour = ramp(i, keys.length);
      var d = pts.map(function (p, j) { return (j ? "L" : "M") + x(p.epoch) + " " + y(pick(p)); }).join(" ");
      var line = el("path", { d: d, fill: "none", stroke: colour, "stroke-width": 2,
                              "stroke-linejoin": "round" });
      hoverable(line, "<b>generation " + k + "</b><br>starts " + fmt(pick(pts[0])) +
        ", ends " + fmt(pick(pts[pts.length - 1])));
      s.appendChild(line);
      var last = pts[pts.length - 1];
      var dot = el("circle", { cx: x(last.epoch), cy: y(pick(last)), r: 3.5, fill: colour });
      hoverable(dot, "<b>generation " + k + "</b><br>after " + last.epoch + " epochs: " + fmt(pick(last)));
      s.appendChild(dot);
    });

    if (rampHost) {
      rampHost.innerHTML = "<span style='color:var(--text-muted)'>gen " + keys[0] + "</span>" +
        keys.map(function (k, i) { return "<span style='background:" + ramp(i, keys.length) + "'></span>"; }).join("") +
        "<span style='color:var(--text-muted)'>gen " + keys[keys.length - 1] + "</span>";
    }
  }
  curves($('[data-chart="loss"]'), $('[data-ramp="loss"]'),
         function (e) { return e.held; }, function (v) { return v.toFixed(3); }, 0.004);
  curves($('[data-chart="agree"]'), $('[data-ramp="agree"]'),
         function (e) { return e.agree; }, function (v) { return v.toFixed(0) + "%"; }, 1);

  /* ---- every weight, as a heatmap -------------------------------------- */
  (function weights() {
    var host = $('[data-chart="weights"]');
    var names = D.features;
    var cols = gens.filter(function (g) { return g.w; });
    if (!cols.length) return;
    var cw = 52, rh = 20, L = 210, T = 26, B = 26, R = 10;
    var W = L + cols.length * cw + R, H = T + names.length * rh + B;
    var s = svg(host, W, H);
    var peak = 0;
    cols.forEach(function (g) { g.w.forEach(function (v) { peak = Math.max(peak, Math.abs(v)); }); });

    function shade(v) {
      var t = Math.min(1, Math.abs(v) / peak);
      var steps = v >= 0 ? ["--div-pos-1", "--div-pos-2", "--div-pos-3"]
                         : ["--div-neg-1", "--div-neg-2", "--div-neg-3"];
      if (t < 0.02) return css("--div-mid");
      return css(steps[t < 0.28 ? 0 : t < 0.62 ? 1 : 2]);
    }

    cols.forEach(function (g, i) {
      s.appendChild(el("text", { x: L + i * cw + cw / 2, y: 16, "text-anchor": "middle",
        class: "lbl" + (g.kept ? " lbl--on" : "") }, g.generation));
    });
    s.appendChild(el("text", { x: L, y: H - 8, class: "lbl" }, "generation →"));

    names.forEach(function (name, r) {
      s.appendChild(el("text", { x: L - 10, y: T + r * rh + 14, "text-anchor": "end", class: "lbl" }, name));
      cols.forEach(function (g, i) {
        var v = g.w[r];
        var cell = el("rect", { x: L + i * cw + 1, y: T + r * rh + 1, width: cw - 3, height: rh - 3,
          rx: 2, fill: shade(v) });
        hoverable(cell, "<b>" + name + "</b><br>generation " + g.generation + ": " + v.toFixed(3) +
          "<br>" + (v > 0.05 ? "a reason to play the move" : v < -0.05 ? "a reason not to" : "no opinion"));
        s.appendChild(cell);
        var t = Math.min(1, Math.abs(v) / peak);
        var ink = t < 0.02 ? css("--text-muted")    /* the neutral middle */
                : t > 0.62 ? "#f7f7f5"              /* on the deepest steps */
                : "#12110f";                        /* on the pale ones */
        /* inline, because the stylesheet's own fill would win over an attribute */
        s.appendChild(el("text", { x: L + i * cw + cw / 2, y: T + r * rh + 14, "text-anchor": "middle",
          class: "lbl", "font-size": 9, style: "fill:" + ink }, v.toFixed(1)));
      });
    });
  })();

  /* ---- the tables ------------------------------------------------------ */
  function table(host, head, rows) {
    if (!host) return;
    var thead = document.createElement("thead");
    thead.innerHTML = "<tr>" + head.map(function (h) { return "<th>" + h + "</th>"; }).join("") + "</tr>";
    var tbody = document.createElement("tbody");
    rows.forEach(function (r) {
      var tr = document.createElement("tr");
      if (r.cls) tr.className = r.cls;
      tr.innerHTML = r.cells.map(function (c) { return "<td>" + c + "</td>"; }).join("");
      tbody.appendChild(tr);
    });
    host.appendChild(thead);
    host.appendChild(tbody);
  }

  table($('[data-table="generations"]'),
    ["generation", "learned from", "positions", "held-out loss", "agreement",
     "v champion", "v gen 0", "Elo", "verdict"],
    gens.map(function (g) {
      var l = D.ladder.filter(function (x) { return x.generation === g.generation; })[0];
      return { cls: g.generation === 0 ? "" : (g.kept ? "kept" : "dropped"), cells: [
        "gen " + g.generation,
        g.parent || "—",
        g.trainedOn ? g.trainedOn.toLocaleString() : "—",
        g.heldOutLossBefore ? g.heldOutLossBefore.toFixed(4) + " → " + g.heldOutLossAfter.toFixed(4) : "—",
        g.agreementBefore ? g.agreementBefore.toFixed(1) + "% → " + g.agreementAfter.toFixed(1) + "%" : "—",
        g.scoreAgainstParent != null ? g.scoreAgainstParent.toFixed(1) + "%" : "—",
        l ? l.score.toFixed(1) + "%" : "—",
        l ? (l.elo >= 0 ? "+" : "") + l.elo : "—",
        g.generation === 0 ? '<span class="tag">starting point</span>'
          : g.kept ? '<span class="tag tag--kept">kept</span>'
                   : '<span class="tag tag--drop">thrown away</span>'
      ] };
    }));

  table($('[data-table="weights"]'),
    ["what the model notices"].concat(gens.filter(function (g) { return g.w; })
      .map(function (g) { return "gen " + g.generation; })),
    D.features.map(function (name, i) {
      return { cells: [name].concat(gens.filter(function (g) { return g.w; })
        .map(function (g) { return g.w[i].toFixed(3); })) };
    }));

  table($('[data-table="playoff"]'), ["match", "games", "result"],
    (D.playoff || []).map(function (m) {
      var winner = m.score > 50 ? m.a : m.b;
      var margin = Math.abs(m.score - 50) < 2.5 ? "level" : winner + " ahead";
      return { cells: [m.a + " v " + m.b, m.games,
        m.score.toFixed(1) + "% for " + m.a + " — " + margin] };
    }));

  table($('[data-table="throughput"]'), ["version", "playouts a second"],
    D.benchmarks.throughput.map(function (b) {
      return { cells: [b.what, b.playoutsPerSecond.toLocaleString()] };
    }));

  table($('[data-table="matches"]'), ["match", "games", "score"],
    D.benchmarks.matches.map(function (m) {
      return { cells: [m.what, m.games, m.score.toFixed(1) + "%"] };
    }));

  $("[data-built]").textContent = "Built " + D.builtAt + ".";
})();
