/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the chrome, and the small shared pieces
   ----------------------------------------------------------------------------
   The header, the navigation and the foot are written once here and put on
   every page, so a page is only ever its own content. Underneath are the few
   helpers every page turned out to need: a name's initials, a colour for a
   player, a date said the way people say it, and text made safe to put on the
   page. Everything on this site is drawn from text somebody typed, so nothing
   is ever handed to innerHTML unescaped.
   ============================================================================ */
(function (root) {
  "use strict";

  var doc = root.document;

  var PAGES = [
    { id: "home",  href: "index.html",       text: "Home" },
    { id: "play",  href: "play.html",        text: "Play" },
    { id: "board", href: "leaderboard.html", text: "Leaderboard" },
    { id: "games", href: "games.html",       text: "Games" },
    { id: "learn", href: "learn.html",       text: "Learn" },
    { id: "engine", href: "paper.html",      text: "The engine" }
  ];

  function esc(text) {
    return String(text == null ? "" : text)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function initials(name) {
    var parts = String(name || "?").split(/[^A-Za-z0-9]+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  /* A colour of somebody's own, worked out from their id so it is the same
     wherever they turn up, and always light enough to read dark text on. */
  function tint(id) {
    var h = 0, s = String(id || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
    return "hsl(" + h + " 46% 62%)";
  }

  function face(who, big) {
    var name = who && who.name || "?";
    return '<span class="face' + (big ? " face--big" : "") + '" aria-hidden="true" style="background:' +
           tint(who && who.id) + '">' + esc(initials(name)) + "</span>";
  }

  /* "just now", "14 minutes ago", "yesterday", "3 March" */
  function ago(at) {
    if (!at) return "";
    var s = Math.max(0, Date.now() - at) / 1000;
    if (s < 45) return "just now";
    if (s < 90) return "a minute ago";
    if (s < 3600) return Math.round(s / 60) + " minutes ago";
    if (s < 7200) return "an hour ago";
    if (s < 86400) return Math.round(s / 3600) + " hours ago";
    if (s < 172800) return "yesterday";
    if (s < 604800) return Math.round(s / 86400) + " days ago";
    return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  }

  function when(at) {
    if (!at) return "";
    return new Date(at).toLocaleString(undefined,
      { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  function plural(n, one, many) {
    return n + " " + (n === 1 ? one : (many || one + "s"));
  }

  /* ---- the header and the foot ------------------------------------------ */
  function chrome() {
    var here = doc.body.getAttribute("data-page") || "";
    var me = root.UNC && root.UNC.player ? root.UNC.player.who() : null;

    var head = doc.createElement("header");
    head.className = "top";
    head.innerHTML =
      '<div class="top__inner">' +
        '<a class="brand" href="index.html">' +
          '<svg class="brand__mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
            '<g stroke="currentColor" stroke-width="7" fill="none">' +
              '<path d="M36 8v84M64 8v84M8 36h84M8 64h84" /></g></svg>' +
          '<span class="brand__word">Ultimate noughts &amp; crosses</span>' +
        "</a>" +
        '<nav class="nav" aria-label="Site">' +
          PAGES.map(function (p) {
            return '<a href="' + p.href + '"' +
              (p.id === here ? ' aria-current="page"' : "") + ">" + esc(p.text) + "</a>";
          }).join("") +
        "</nav>" +
        (me ? '<a class="who" href="profile.html" title="Your profile">' +
                '<span class="who__face" style="background:' + tint(me.id) + '">' +
                  esc(initials(me.name)) + "</span>" +
                '<span class="who__name">' + esc(me.name) + "</span>" +
                '<span class="who__rating">' + Math.round(me.rating) + "</span>" +
                (me.server ? "" : '<span class="tag">local</span>') +
              "</a>" : "");
    doc.body.insertBefore(head, doc.body.firstChild);

    var foot = doc.createElement("footer");
    foot.className = "foot";
    foot.innerHTML =
      '<div class="foot__inner">' +
        "<span>Nine boards inside one. No accounts, no server — everything here " +
        "lives in this browser.</span>" +
        '<span><a href="learn.html">The rules</a> · <a href="paper.html">How the engine learned</a> ' +
        '· <a href="progress.html">Training charts</a> ' +
        '· <a href="https://github.com/HusaynYahya/noughtsandcrosses">Source</a></span>' +
      "</div>";
    doc.body.appendChild(foot);
  }

  function ready(fn) {
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  /* every page says which one it is on <body data-page="…"> */
  ready(function () { if (doc.body.hasAttribute("data-page")) chrome(); });

  root.UNC = root.UNC || {};
  root.UNC.site = {
    esc: esc, initials: initials, tint: tint, face: face,
    ago: ago, when: when, plural: plural, ready: ready, chrome: chrome
  };
})(typeof window !== "undefined" ? window : globalThis);
