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

  function account() {
    var a = root.UNC && root.UNC.account;
    return a && a.configured() ? a : null;
  }

  var PAGES = [
    { id: "home",  href: "index.html",       text: "Home" },
    { id: "play",  href: "play.html",        text: "Play" },
    { id: "board", href: "leaderboard.html", text: "Leaderboard" },
    { id: "games", href: "games.html",       text: "Games" },
    { id: "learn", href: "learn.html",       text: "Learn" },
    { id: "engine", href: "paper.html",      text: "The engine" }
  ];
  /* account.html is reached from the header buttons and the front page rather
     than the navigation, the way a sign-in usually is */

  /* A handful of line drawings, kept here so every page uses the same ones.
     They are stroked with currentColor, so they take the colour of whatever
     they sit in. */
  var ICON = {
    play:  '<path d="M5 3.5v13l11-6.5z"/>',
    robot: '<rect x="3" y="7" width="14" height="10" rx="2"/><path d="M10 3v4M7 12h.01M13 12h.01"/>',
    people:'<circle cx="7" cy="7" r="2.6"/><circle cx="14" cy="8" r="2.2"/>' +
           '<path d="M2.5 16.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4M12.5 16.5c0-1.9 1.2-3.2 3-3.2s2.5 1 2.5 2.4"/>',
    link:  '<path d="M8 12a3.5 3.5 0 0 0 5 0l3-3a3.5 3.5 0 0 0-5-5l-1 1"/>' +
           '<path d="M12 8a3.5 3.5 0 0 0-5 0l-3 3a3.5 3.5 0 0 0 5 5l1-1"/>',
    board: '<path d="M7 2v16M13 2v16M2 7h16M2 13h16"/>',
    clock: '<circle cx="10" cy="10" r="7.5"/><path d="M10 5.5V10l3 2"/>',
    chart: '<path d="M3 16l4-5 3.5 3L17 5"/><path d="M3 18h14"/>',
    empty: '<circle cx="10" cy="10" r="7.5"/><path d="M7 10h6"/>'
  };

  function icon(name, size) {
    return '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.7" ' +
           'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"' +
           (size ? ' width="' + size + '" height="' + size + '"' : "") + ">" +
           (ICON[name] || ICON.board) + "</svg>";
  }

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

  /* An empty page is the first thing most people see. It has to say what to
     do next, not that there is nothing — so every one of them is a mark, a
     line, a sentence and a way onward. */
  function nothing(mark, title, words, buttons) {
    return '<div class="empty__box"><span class="empty__mark">' + icon(mark) + "</span>" +
           "<b>" + esc(title) + "</b><p>" + words + "</p>" +
           (buttons ? '<div class="row-btn">' + buttons + "</div>" : "") + "</div>";
  }

  /* ---- the header and the foot ------------------------------------------ */
  function chrome() {
    var here = doc.body.getAttribute("data-page") || "";
    var me = root.UNC && root.UNC.player ? root.UNC.player.who() : null;
    /* a server to sign in to, and nobody signed in to it */
    var waiting = !!(account() && !account().me());

    var head = doc.createElement("header");
    head.className = "top";
    head.innerHTML =
      '<div class="top__inner">' +
        '<a class="brand" href="index.html">' +
          '<svg class="brand__mark" viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
            '<g stroke="currentColor" stroke-width="7" fill="none">' +
              '<path d="M36 8v84M64 8v84M8 36h84M8 64h84" /></g></svg>' +
          '<span class="brand__word">Ultimate <b>noughts &amp; crosses</b></span>' +
        "</a>" +
        '<nav class="nav" aria-label="Site">' +
          PAGES.map(function (p) {
            return '<a href="' + p.href + '"' +
              (p.id === here ? ' aria-current="page"' : "") + ">" + esc(p.text) + "</a>";
          }).join("") +
        "</nav>" +
        /* Signed in: who you are. Signed out, with a server to sign in to: the
           way in, because a way in nobody can find is not a way in — and not
           both at once, or the header claims you are two people. */
        (me && !waiting ? '<a class="who" href="profile.html" title="Your profile">' +
                '<span class="who__face" style="background:' + tint(me.id) + '">' +
                  esc(initials(me.name)) + "</span>" +
                '<span class="who__name">' + esc(me.name) + "</span>" +
                '<span class="who__rating">' + Math.round(me.rating) + "</span>" +
                (me.server ? '<span class="tag tag--go">account</span>'
                           : '<span class="tag">this browser</span>') +
              "</a>" : "") +
        (waiting && here !== "account"
          ? '<span class="top__in">' +
              '<a class="btn btn--slim" href="account.html?in">Sign in</a>' +
              '<a class="btn btn--slim btn--go" style="width:auto" href="account.html">' +
              "Create an account</a></span>"
          : "");
    doc.body.insertBefore(head, doc.body.firstChild);

    var foot = doc.createElement("footer");
    foot.className = "foot";
    foot.innerHTML =
      '<div class="foot__inner">' +
        '<div class="foot__say">' +
          '<a class="brand" href="index.html">' +
            '<svg class="brand__mark" viewBox="0 0 100 100" aria-hidden="true">' +
              '<g stroke="currentColor" stroke-width="7" fill="none">' +
                '<path d="M36 8v84M64 8v84M8 36h84M8 64h84" /></g></svg>' +
            '<span class="brand__word">Ultimate <b>noughts &amp; crosses</b></span></a>' +
          "<p>Nine boards inside one. Play a stranger, a friend, or an engine " +
          "that taught itself — in a page that needs no account to start.</p>" +
        "</div>" +
        "<div><h3>Play</h3><ul>" +
          '<li><a href="index.html">Find an opponent</a></li>' +
          '<li><a href="play.html?mode=computer">Against the engine</a></li>' +
          '<li><a href="play.html?mode=local">One device, two people</a></li>' +
          '<li><a href="play.html?mode=post">By message</a></li>' +
        "</ul></div>" +
        "<div><h3>Your record</h3><ul>" +
          '<li><a href="leaderboard.html">Leaderboard</a></li>' +
          '<li><a href="games.html">Your games</a></li>' +
          '<li><a href="profile.html">Your profile</a></li>' +
        "</ul></div>" +
        "<div><h3>How it works</h3><ul>" +
          '<li><a href="learn.html">The rules</a></li>' +
          '<li><a href="paper.html">How the engine learned</a></li>' +
          '<li><a href="progress.html">Training charts</a></li>' +
          '<li><a href="https://github.com/HusaynYahya/noughtsandcrosses">Source</a></li>' +
        "</ul></div>" +
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
    esc: esc, initials: initials, tint: tint, face: face, icon: icon, nothing: nothing,
    ago: ago, when: when, plural: plural, ready: ready, chrome: chrome
  };
})(typeof window !== "undefined" ? window : globalThis);
