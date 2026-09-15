/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the page
   ----------------------------------------------------------------------------
   Draws the board, takes the moves, and wires the three ways to play:
   two at one device, against the computer, or a private room with a friend.
   ============================================================================ */
(function () {
  "use strict";

  var E = window.UNC.engine, AI = window.UNC.ai, NET = window.UNC.net;
  var X = E.X, O = E.O;

  var BOARDS = ["top left", "top centre", "top right",
                "middle left", "centre", "middle right",
                "bottom left", "bottom centre", "bottom right"];
  var SQUARES = BOARDS;
  var SIDE = {}; SIDE[X] = "Crosses"; SIDE[O] = "Noughts";

  var MARK = {};
  MARK[X] = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
            '<path class="mark-path" d="M24 24 L76 76"/>' +
            '<path class="mark-path" d="M76 24 L24 76"/></svg>';
  MARK[O] = '<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">' +
            '<circle class="mark-path" cx="50" cy="50" r="27"/></svg>';

  /* ---- what we are doing ---------------------------------------------- */
  var state = E.create();
  var past = [];                  /* packed positions, for Undo */
  var mode = "local";             /* local | computer | online */
  var level = "steady";
  var mySide = X;                 /* which side the person at this device has */
  var cancelThinking = null;
  var net = null, seat = X, netStatusText = "", tally = { 1: 0, 2: 0, 0: 0 };
  var counted = false;            /* has this game been added to the tally yet */

  /* ---- the page -------------------------------------------------------- */
  var $ = function (sel) { return document.querySelector(sel); };
  var boardEl   = $("[data-board]"),
      statusEl  = $("[data-status]"),
      statusTxt = $("[data-status-text]"),
      dotEl     = $(".game__turn-dot"),
      hintEl    = $("[data-hint]"),
      modeSel   = $("[data-mode]"),
      levelSel  = $("[data-level]"),
      sideSel   = $("[data-side]"),
      newBtn    = $("[data-new]"),
      undoBtn   = $("[data-undo]"),
      setupBox  = $("[data-room-setup]"),
      liveBox   = $("[data-room-live]"),
      codeEl    = $("[data-room-code]"),
      joinInput = $("[data-join-code]"),
      netEl     = $("[data-net-status]");

  var cells = [];                 /* 81 buttons, indexed by move number */
  var minis = [];                 /* 9 small boards */

  function buildBoard() {
    var frag = document.createDocumentFragment();
    for (var b = 0; b < 9; b++) {
      var mini = document.createElement("div");
      mini.className = "mini";
      var glyph = document.createElement("span");
      glyph.className = "mini__won";
      mini.appendChild(glyph);
      for (var sq = 0; sq < 9; sq++) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cell";
        btn.dataset.move = b * 9 + sq;
        mini.appendChild(btn);
        cells[b * 9 + sq] = btn;
      }
      minis[b] = { el: mini, glyph: glyph };
      frag.appendChild(mini);
    }
    boardEl.appendChild(frag);
    boardEl.addEventListener("click", function (ev) {
      var btn = ev.target.closest(".cell");
      if (btn && !btn.disabled) play(+btn.dataset.move);
    });
  }

  /* ---- whose move is it ------------------------------------------------ */
  function myTurn() {
    if (state.over) return false;
    if (mode === "computer") return state.turn === mySide && !cancelThinking;
    if (mode === "online") return net && net.connected() && state.turn === seat;
    return true;
  }

  function play(move) {
    if (!myTurn() || !E.isLegal(state, move)) return;

    if (mode === "online" && net.role === "guest") {
      /* Play it here at once so the board feels immediate; the referee's copy
         comes back a moment later and has the final word. */
      advance(move);
      net.send({ t: "move", move: move });
      return;
    }

    advance(move);
    if (mode === "online") broadcast();
    else if (mode === "computer") computerTurn();
  }

  function advance(move) {
    past.push(E.pack(state));
    E.apply(state, move);
    render(move);
    if (state.over) finishGame();
  }

  function finishGame() {
    if (counted) return;
    counted = true;
    tally[state.winner] = (tally[state.winner] || 0) + 1;
    saveTally();
    renderTally();
  }

  /* ---- the computer ---------------------------------------------------- */
  function computerTurn() {
    if (mode !== "computer" || state.over || state.turn === mySide) return;
    render();
    var thinkingSince = Date.now();
    cancelThinking = AI.think(state, level, function (move) {
      cancelThinking = null;
      if (mode !== "computer" || state.over || move < 0) { render(); return; }
      /* a beat of hesitation, so a snap answer does not feel like a glitch */
      var wait = Math.max(0, 320 - (Date.now() - thinkingSince));
      setTimeout(function () {
        if (mode !== "computer" || state.over || !E.isLegal(state, move)) { render(); return; }
        advance(move);
      }, wait);
    });
    render();
  }

  function stopThinking() {
    if (cancelThinking) { cancelThinking(); cancelThinking = null; }
  }

  /* ---- drawing --------------------------------------------------------- */
  function render(justPlayed) {
    var live = E.activeBoard(state);
    var free = live < 0 && !state.over;
    var canMove = myTurn();

    for (var b = 0; b < 9; b++) {
      var mini = minis[b], owner = state.bw[b], cls = "mini";
      if (owner === X) cls += " mini--x";
      else if (owner === O) cls += " mini--o";
      else if (owner === E.DEAD) cls += " mini--dead";

      var playable = !state.over && !E.isFull(state, b) && (live < 0 || live === b);
      if (!state.over && live === b) cls += " mini--live";
      else if (!state.over && !free && !playable) cls += " mini--shut";
      if (state.winLine && state.winLine.indexOf(b) > -1) cls += " mini--won-line";
      mini.el.className = cls;
      mini.glyph.innerHTML = (owner === X || owner === O) ? MARK[owner] : "";

      for (var sq = 0; sq < 9; sq++) {
        var i = b * 9 + sq, btn = cells[i], who = E.at(state, b, sq);
        var open = who === 0 && playable;
        var c = "cell";
        if (who) c += who === X ? " cell--x" : " cell--o";
        else if (open) c += " cell--open";
        if (i === state.last) c += " cell--last";
        if (i === justPlayed) c += " cell--fresh";
        btn.className = c;
        btn.disabled = !(open && canMove);
        var want = who ? MARK[who] : "";
        if (btn.innerHTML !== want) btn.innerHTML = want;
        btn.setAttribute("aria-label", label(b, sq, who, open));
      }
    }

    boardEl.classList.toggle("is-thinking", !!cancelThinking);
    boardEl.classList.toggle("ubk--free", free && canMove);
    renderStatus(free, live);
    undoBtn.disabled = !past.length || mode === "online" || !!cancelThinking;
  }

  function label(b, sq, who, open) {
    var where = SQUARES[sq] + " square of the " + BOARDS[b] + " board";
    if (who) return where + ", " + (who === X ? "crosses" : "noughts");
    return open ? "Play the " + where : where + ", empty";
  }

  function renderStatus(free, live) {
    var text, dot = state.turn === X ? "X" : "O";
    statusEl.classList.toggle("is-over", state.over);

    if (state.over) {
      dot = "none";
      text = state.winner
        ? SIDE[state.winner] + " win — three boards in a row."
        : "A drawn game — every square filled, nobody with three boards in a row.";
    } else if (mode === "online" && (!net || !net.connected())) {
      text = netStatusText || "Not connected yet.";
    } else if (cancelThinking) {
      text = "The computer is thinking…";
    } else {
      var who = myTurn() && mode !== "local" ? "Your move" : SIDE[state.turn] + " to play";
      text = who + " — " + (free ? "anywhere you like."
                                 : "the " + BOARDS[live] + " board.");
      if (!free && state.bw[live] && state.bw[live] !== E.DEAD) {
        text += " It is already won, but the squares still count for position.";
      }
    }
    dotEl.setAttribute("data-turn", dot);
    statusTxt.textContent = text;
    hintEl.textContent = hint();
  }

  function hint() {
    if (state.over) return "Press New game for another.";
    if (mode === "online" && net && net.connected()) {
      return state.turn === seat ? "You are playing " + SIDE[seat].toLowerCase() + "."
                                 : "Waiting for your friend's move.";
    }
    if (mode === "computer") return "You are playing " + SIDE[mySide].toLowerCase() + ".";
    return "Pass the device over after each move.";
  }

  function renderTally() {
    $("[data-tally-x]").textContent = tally[X] || 0;
    $("[data-tally-o]").textContent = tally[O] || 0;
    $("[data-tally-d]").textContent = tally[0] || 0;
  }

  /* ---- new game -------------------------------------------------------- */
  function reset(broadcastIt) {
    stopThinking();
    state = E.create();
    past = [];
    counted = false;
    render();
    if (mode === "computer") computerTurn();
    if (mode === "online" && net && net.role === "host" && broadcastIt !== false) broadcast();
  }

  function undo() {
    if (mode === "online" || !past.length) return;
    stopThinking();
    state = E.unpack(past.pop());
    /* in a game against the computer, step back past its reply too */
    if (mode === "computer" && state.turn !== mySide && past.length) {
      state = E.unpack(past.pop());
    }
    counted = false;
    render();
  }

  /* ---- the private room ------------------------------------------------ */
  function broadcast() {
    if (!net || net.role !== "host") return;
    net.send({ t: "sync", state: E.pack(state), seat: seat === X ? O : X, tally: tally });
  }

  function netStatus(text, kind) {
    netStatusText = text;
    netEl.textContent = text;
    netEl.className = "room__status" + (kind ? " room__status--" + kind : "");
    render();
  }

  function startSession() {
    net = NET.session({
      status: netStatus,
      open: function () {
        if (net.role === "host") { broadcast(); }
        else { net.send({ t: "hello" }); }
        render();
      },
      message: onMessage,
      close: function () { render(); },
      error: function () {
        if (net && net.role === "guest" && !net.connected()) {
          setupBox.hidden = false;
          liveBox.hidden = true;
        }
        render();
      }
    });
    return net;
  }

  function onMessage(msg) {
    if (net.role === "host") {
      if (msg.t === "hello") { broadcast(); return; }
      if (msg.t === "move") {
        var guestSeat = seat === X ? O : X;
        if (!state.over && state.turn === guestSeat && E.isLegal(state, msg.move)) {
          advance(msg.move);
        }
        broadcast();                       /* right or wrong, they get the truth */
        return;
      }
      if (msg.t === "rematch") { swapSides(); reset(); return; }
    } else {
      if (msg.t === "sync") {
        seat = msg.seat === O ? O : X;
        state = E.unpack(msg.state);
        if (msg.tally) { tally = msg.tally; renderTally(); }
        counted = state.over;
        past = [];
        render(state.last);
      }
    }
  }

  function swapSides() { seat = seat === X ? O : X; }

  function showRoom(code) {
    setupBox.hidden = true;
    liveBox.hidden = false;
    codeEl.textContent = code;
  }

  function leaveRoom() {
    if (net) { net.close(); net = null; }
    setupBox.hidden = false;
    liveBox.hidden = true;
    codeEl.textContent = "";
    netStatus("", "");
    if (location.hash) history.replaceState(null, "", location.pathname);
    reset(false);
  }

  function hostRoom() {
    if (net) net.close();
    seat = X;
    startSession().host().then(function (code) {
      showRoom(code);
      reset(false);
    }).catch(function () { /* the status line has already said so */ });
  }

  function joinRoom(code) {
    var tidy = NET.tidyCode(code || joinInput.value);
    if (!tidy) { netStatus("Type the room code first.", "error"); return; }
    if (net) net.close();
    joinInput.value = tidy;            /* show what was actually read */
    seat = O;
    startSession().join(tidy).then(function () {
      showRoom(tidy);
    }).catch(function () { /* likewise */ });
  }

  /* ---- keeping the tally between visits -------------------------------- */
  function saveTally() {
    try { localStorage.setItem("unc.tally", JSON.stringify(tally)); } catch (e) {}
  }
  function loadTally() {
    try {
      var raw = JSON.parse(localStorage.getItem("unc.tally") || "null");
      if (raw && typeof raw === "object") {
        tally = { 1: raw[1] | 0, 2: raw[2] | 0, 0: raw[0] | 0 };
      }
    } catch (e) {}
  }

  /* ---- controls -------------------------------------------------------- */
  function setMode(next) {
    if (next === mode) return;
    stopThinking();
    if (mode === "online") leaveRoom();
    mode = next;
    document.querySelectorAll("[data-only]").forEach(function (el) {
      el.hidden = el.getAttribute("data-only") !== mode;
    });
    modeSel.value = mode;
    reset(false);
  }

  function wire() {
    modeSel.addEventListener("change", function () { setMode(modeSel.value); });
    levelSel.addEventListener("change", function () { level = levelSel.value; });
    sideSel.addEventListener("change", function () {
      mySide = +sideSel.value === O ? O : X;
      reset(false);
    });
    newBtn.addEventListener("click", function () {
      if (mode === "online" && net && net.connected()) {
        if (net.role === "host") { swapSides(); reset(); }
        else net.send({ t: "rematch" });
        return;
      }
      reset(false);
    });
    undoBtn.addEventListener("click", undo);
    $("[data-host]").addEventListener("click", hostRoom);
    $("[data-join]").addEventListener("click", function () { joinRoom(); });
    joinInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); joinRoom(); }
    });
    $("[data-leave]").addEventListener("click", leaveRoom);
    $("[data-copy]").addEventListener("click", copyInvite);
    window.addEventListener("beforeunload", function () { if (net) net.close(); });
  }

  function copyInvite(ev) {
    var btn = ev.currentTarget;
    var text = "Come and play ultimate noughts and crosses: " + net.link() +
               "  (room code: " + net.code + ")";
    var said = function () {
      var old = btn.textContent;
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = old; }, 1600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(said, fallback);
    } else fallback();

    function fallback() {
      var box = document.createElement("textarea");
      box.value = text;
      box.setAttribute("readonly", "");
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      try { document.execCommand("copy"); said(); } catch (e) {
        netStatus("Copy the code above by hand: " + net.code, "waiting");
      }
      document.body.removeChild(box);
    }
  }

  /* ---- go -------------------------------------------------------------- */
  buildBoard();
  wire();
  loadTally();
  renderTally();

  var invited = NET.tidyCode(location.hash);
  if (invited) {
    setMode("online");
    joinInput.value = invited;
    joinRoom(invited);
  } else {
    render();
  }
})();
