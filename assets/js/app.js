/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the page
   ----------------------------------------------------------------------------
   Draws the board, takes the moves, and wires the three ways to play:
   two at one device, against the computer, or a private room with a friend.
   ============================================================================ */
(function () {
  "use strict";

  var E = window.UNC.engine, AI = window.UNC.ai, NET = window.UNC.net;
  var AN = window.UNC.analysis;
  var X = E.X, O = E.O;

  var BOARDS = ["top left", "top centre", "top right",
                "middle left", "centre", "middle right",
                "bottom left", "bottom centre", "bottom right"];
  var SQUARES = BOARDS;
  var SIDE = {}; SIDE[X] = "Crosses"; SIDE[O] = "Noughts";

  var FILES = "abcdefghi";

  /* Squares are named as on a chessboard: files a-i left to right, ranks 1-9
     bottom to top, counted across the whole nine-by-nine. */
  function notate(move) {
    var b = (move / 9) | 0, sq = move % 9;
    var col = (b % 3) * 3 + (sq % 3);
    var row = ((b / 3) | 0) * 3 + ((sq / 3) | 0);
    return FILES.charAt(col) + (9 - row);
  }

  /* A line ruled through the three squares that won, the way you would
     strike through a won game on paper. Drawn in a hundred-unit box, so the
     same code serves a small board, the whole board, and the little
     overall-game grid. */
  function strike(lineIndex, width) {
    var L = E.LINES[lineIndex];
    if (!L) return "";
    var a = centre(L[0]), z = centre(L[2]);
    var dx = z.x - a.x, dy = z.y - a.y;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var over = 9;                                  /* run past both ends */
    var ax = a.x - dx / len * over, ay = a.y - dy / len * over;
    var zx = z.x + dx / len * over, zy = z.y + dy / len * over;
    return '<svg class="strike" viewBox="0 0 100 100" preserveAspectRatio="none" ' +
           'aria-hidden="true" focusable="false"><line class="strike__line" ' +
           'x1="' + ax.toFixed(1) + '" y1="' + ay.toFixed(1) + '" ' +
           'x2="' + zx.toFixed(1) + '" y2="' + zy.toFixed(1) + '" ' +
           'stroke-width="' + width + '"/></svg>';
  }

  function centre(i) {
    return { x: (i % 3) * (100 / 3) + 100 / 6, y: ((i / 3) | 0) * (100 / 3) + 100 / 6 };
  }

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
      dotEl     = $(".status__dot"),
      modeSel   = $("[data-mode]"),
      levelSel  = $("[data-level]"),
      sideSel   = $("[data-side]"),
      newBtn    = $("[data-new]"),
      undoBtn   = $("[data-undo]"),
      setupBox  = $("[data-room-setup]"),
      liveBox   = $("[data-room-live]"),
      codeEl    = $("[data-room-code]"),
      joinInput = $("[data-join-code]"),
      overallEl = $("[data-overall]"),
      movesEl   = $("[data-moves]"),
      anToggle  = $("[data-an-toggle]"),
      anState   = $("[data-an-state]"),
      anBody    = $("[data-an-body]"),
      anBest    = $("[data-an-best]"),
      anPv      = $("[data-an-pv]"),
      anCands   = $("[data-an-cands]"),
      anSide    = $("[data-an-side]"),
      anEvalBar = $("[data-eval-fill]"),
      anEvalTxt = $("[data-eval-text]"),
      tcSel     = $("[data-tc]"),
      tcCustom  = $("[data-tc-custom]"),
      tcMin     = $("[data-tc-min]"),
      tcInc     = $("[data-tc-inc]"),
      tcLabel2  = $("[data-tc-second-label]"),
      tcNote    = $("[data-tc-note]"),
      ranksEl   = $("[data-ranks]"),
      filesEl   = $("[data-files]"),
      chatEl    = $("[data-chat]"),
      chatLog   = $("[data-chat-log]"),
      chatForm  = $("[data-chat-form]"),
      chatInput = $("[data-chat-input]"),
      chatSend  = $("[data-chat-send]"),
      overallCount = $("[data-overall-count]"),
      netEl     = $("[data-net-status]");

  var cells = [];                 /* 81 buttons, indexed by move number */
  var minis = [];                 /* 9 small boards */
  var overall = [];               /* 9 squares of the overall-game grid */
  var moves = [];                 /* every move played, in order */
  var boardStrike = null, overallStrike = null;

  /* The clock. Times are kept in milliseconds; the side that is running has
     the time since its last reading taken off as it is drawn, so the count
     stays true even when the tab has been asleep. A player whose time runs
     out loses, as at chess. */
  /* Two ways to keep time. "bank" is the chess way: a sum to spend across the
     whole game, with an increment added after each move. "move" gives the
     same allowance to every single turn — five minutes a move, say — and
     starts it again each time. Run out either way and you lose. */
  var clock = { on: false, mode: "bank", base: 0, inc: 0, perMove: 0,
                left: {}, running: 0, since: 0, flagged: 0 };

  /* The analysis board. `marks` holds a verdict per move, in step with
     `moves`; `standing` is how the position stood for the player to move,
     kept so the next move can be judged against it. */
  var analysis = { on: false, cancel: null, report: null, marks: [],
                   standing: null, pending: null, busy: false };

  function buildBoard() {
    var frag = document.createDocumentFragment();
    for (var b = 0; b < 9; b++) {
      var mini = document.createElement("div");
      /* light and dark small boards, so the big three-by-three reads at a
         glance the way a chessboard does */
      mini.className = "mini" + (b % 2 === 0 ? " mini--light" : "");
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

    /* files a-i along the bottom, ranks 9-1 down the side */
    for (var f = 0; f < 9; f++) {
      var fl = document.createElement("span");
      fl.textContent = FILES.charAt(f);
      filesEl.appendChild(fl);
      var rk = document.createElement("span");
      rk.textContent = String(9 - f);
      ranksEl.appendChild(rk);
    }
    boardStrike = document.createElement("span");
    boardStrike.className = "ubk__strike";
    boardEl.appendChild(boardStrike);

    for (var i = 0; i < 9; i++) {
      var sq = document.createElement("span");
      sq.className = "overall__sq";
      overallEl.appendChild(sq);
      overall[i] = sq;
    }
    overallStrike = document.createElement("span");
    overallStrike.className = "overall__strike";
    overallEl.appendChild(overallStrike);
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
    if (clock.on && !clock.running) { clock.running = state.turn; clock.since = Date.now(); }

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
    past.push({ s: E.pack(state), c: [clock.left[X], clock.left[O]] });
    moves.push(move);
    analysisNote(moves.length - 1);
    var mover = state.turn;
    E.apply(state, move);
    clockAfterMove(mover);
    if (state.over) clockStop();
    render(move);
    analysisRun();
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

  /* ---- the analysis board ---------------------------------------------- */
  /* Every time the position changes, look at it again. The reading for the
     position before a move is kept, so when that move is played the two
     readings can be set side by side and the move judged. */
  function analysisRun() {
    if (analysis.cancel) { analysis.cancel(); analysis.cancel = null; }
    if (!analysis.on) { analysis.busy = false; renderAnalysis(); return; }
    analysis.busy = true;
    renderAnalysis();
    var forState = E.clone(state);
    analysis.cancel = AN.analyse(forState, 900, function (report) {
      analysis.cancel = null;
      analysis.busy = false;
      /* the position may have moved on while we were thinking */
      if (forState.filled !== state.filled || forState.turn !== state.turn) return;
      analysis.report = report;

      if (analysis.pending) {
        var p = analysis.pending;
        analysis.pending = null;
        var mine = 100 - report.score;          /* from the mover's side */
        var verdict = AN.judge(p.before, mine, true);
        if (verdict) analysis.marks[p.index] = verdict;
        renderMoves();
      }
      analysis.standing = report.score;
      render();
    });
  }

  /* called as a move is played, so the move can be judged once the new
     position has been read */
  function analysisNote(index) {
    if (!analysis.on || analysis.standing == null) { analysis.standing = null; return; }
    analysis.pending = { index: index, before: analysis.standing };
    analysis.standing = null;
  }

  function analysisReset() {
    if (analysis.cancel) { analysis.cancel(); analysis.cancel = null; }
    analysis.report = null;
    analysis.marks = [];
    analysis.standing = null;
    analysis.pending = null;
    analysis.busy = false;
  }

  function renderAnalysis() {
    anBody.hidden = !analysis.on;
    anState.textContent = !analysis.on
      ? "Off — switch on for the engine's view"
      : analysis.busy ? "Reading the position…"
      : "On — best move, chances and the likely line";
    if (!analysis.on) return;

    var r = analysis.report;
    anBody.classList.toggle("an__thinking", analysis.busy && !r);
    if (!r) {
      anEvalBar.style.width = "50%";
      anEvalTxt.textContent = "Reading the position…";
      anBest.textContent = "—";
      anPv.textContent = "—";
      anCands.innerHTML = "";
      return;
    }

    /* the bar always shows it from the crosses' side */
    var forX = r.turn === X ? r.score : 100 - r.score;
    anEvalBar.style.width = forX + "%";
    anEvalTxt.textContent = r.over
      ? (state.winner ? SIDE[state.winner] + " won" : "Drawn")
      : forX >= 50
        ? "Crosses " + Math.round(forX) + "%"
        : "Noughts " + Math.round(100 - forX) + "%";

    anSide.textContent = SIDE[r.turn || state.turn].toLowerCase();
    anBest.textContent = r.best >= 0 ? notate(r.best) : "—";
    anPv.textContent = r.pv.length ? r.pv.map(notate).join(" ") : "—";
    anCands.innerHTML = r.candidates.map(function (c) {
      return "<li><span>" + notate(c.move) + "</span><span>" +
             Math.round(c.score) + "%</span></li>";
    }).join("");
  }

  /* ---- the clock ------------------------------------------------------- */
  function clockSet(tc) {
    clock.mode = tc.mode;
    clock.base = tc.base;
    clock.inc = tc.inc;
    clock.perMove = tc.perMove;
    clock.on = tc.mode === "move" ? tc.perMove > 0 : tc.base > 0;
    clockReset();
  }

  function allowance() { return clock.mode === "move" ? clock.perMove : clock.base; }

  function clockReset() {
    clock.left[X] = allowance();
    clock.left[O] = allowance();
    clock.running = 0;
    clock.since = 0;
    clock.flagged = 0;
  }

  /* take off however long the running side has been thinking */
  function clockSettle() {
    if (!clock.running || !clock.since) return;
    var now = Date.now();
    clock.left[clock.running] = Math.max(0, clock.left[clock.running] - (now - clock.since));
    clock.since = now;
  }

  function clockAfterMove(mover) {
    if (!clock.on || state.over) { clock.running = 0; return; }
    clockSettle();
    if (clock.mode === "move") {
      /* both sides start their next turn with the whole allowance */
      clock.left[mover] = clock.perMove;
      clock.left[state.turn] = clock.perMove;
    } else {
      clock.left[mover] += clock.inc;
    }
    clock.running = state.turn;
    clock.since = Date.now();
  }

  function clockStop() { clockSettle(); clock.running = 0; }

  /* Only one copy of the game decides a flag: in an online game that is the
     player who opened the room, so the two can never disagree. */
  function mayFlag() { return mode !== "online" || (net && net.role === "host"); }

  function clockTick() {
    if (!clock.on) return;
    clockSettle();
    if (clock.running && clock.left[clock.running] <= 0 && !state.over && mayFlag()) {
      var loser = clock.running;
      clock.flagged = loser;
      clock.running = 0;
      state.over = true;
      state.winner = loser === X ? O : X;
      state.winLine = null;
      finishGame();
      if (mode === "online") broadcast();
      stopThinking();
      render();               /* the whole page, not just the clocks */
      return;
    }
    renderClocks();
    renderAnalysis();
  }

  function clockText(ms) {
    if (ms <= 0) return "0:00";
    var s = ms / 1000;
    var m = Math.floor(s / 60);
    var r = s - m * 60;
    if (ms < 20000) return m + ":" + (r < 10 ? "0" : "") + r.toFixed(1);
    return m + ":" + (Math.floor(r) < 10 ? "0" : "") + Math.floor(r);
  }

  function renderClocks() {
    for (var side = 1; side <= 2; side++) {
      var where = side === seatHome() ? "home" : "away";
      var el = document.querySelector('[data-seat-clock="' + where + '"]');
      el.hidden = !clock.on;
      if (!clock.on) continue;
      var ms = clock.left[side];
      if (clock.running === side && clock.since) ms = Math.max(0, ms - (Date.now() - clock.since));
      el.textContent = clockText(ms);
      el.className = "seat__clock" +
        (ms <= 0 ? " seat__clock--out" : ms < 20000 ? " seat__clock--low" : "");
    }
  }

  function seatHome() {
    return mode === "online" ? seat : (mode === "computer" ? mySide : X);
  }

  /* what the controls are asking for, in milliseconds */
  function readTimeControl() {
    var v = tcSel.value;
    var perMove = v.indexOf("move:") === 0;
    var custom = v === "custom" || v === "move:custom";

    tcCustom.hidden = !custom;
    tcNote.hidden = !perMove;
    tcLabel2.textContent = perMove ? "and seconds" : "Increment, seconds";

    if (v === "0") return { mode: "bank", base: 0, inc: 0, perMove: 0 };

    var mins = Math.max(0, Math.min(180, +tcMin.value || 0));
    var secs = Math.max(0, Math.min(60, +tcInc.value || 0));

    if (perMove) {
      var each = v === "move:custom"
        ? mins * 60000 + secs * 1000
        : (+v.slice(5) || 0) * 1000;
      return { mode: "move", base: 0, inc: 0, perMove: each };
    }
    if (custom) return { mode: "bank", base: mins * 60000, inc: secs * 1000, perMove: 0 };

    var parts = v.split("+");
    return { mode: "bank", base: (+parts[0] || 0) * 1000,
             inc: (+parts[1] || 0) * 1000, perMove: 0 };
  }

  function applyTimeControl() {
    clockSet(readTimeControl());
    reset(mode === "online" && net && net.role === "host");
  }

  /* ---- drawing --------------------------------------------------------- */
  function render(justPlayed) {
    var live = E.activeBoard(state);
    var bestSquare = analysis.on && analysis.report && !state.over
      ? analysis.report.best : -1;
    var free = live < 0 && !state.over;
    var canMove = myTurn();

    for (var b = 0; b < 9; b++) {
      var mini = minis[b], owner = state.bw[b];
      var cls = "mini" + (b % 2 === 0 ? " mini--light" : "");
      if (owner === X) cls += " mini--x";
      else if (owner === O) cls += " mini--o";
      else if (owner === E.DEAD) cls += " mini--dead";

      var playable = !state.over && !E.isFull(state, b) && (live < 0 || live === b);
      if (!state.over && live === b) cls += " mini--live";
      else if (!state.over && !free && !playable) cls += " mini--shut";
      if (state.winLine && state.winLine.indexOf(b) > -1) cls += " mini--won-line";
      mini.el.className = cls;
      var wantStrike = (owner === X || owner === O) && state.bl[b] >= 0
        ? strike(state.bl[b], 5) : "";
      if (mini.glyph.innerHTML !== wantStrike) mini.glyph.innerHTML = wantStrike;

      for (var sq = 0; sq < 9; sq++) {
        var i = b * 9 + sq, btn = cells[i], who = E.at(state, b, sq);
        var open = who === 0 && playable;
        var c = "cell";
        if (who) c += who === X ? " cell--x" : " cell--o";
        else if (open) c += " cell--open";
        if (i === state.last) c += " cell--last";
        if (i === justPlayed) c += " cell--fresh";
        if (i === bestSquare) c += " cell--best";
        btn.className = c;
        btn.disabled = !(open && canMove);
        var want = who ? MARK[who] : "";
        if (btn.innerHTML !== want) btn.innerHTML = want;
        btn.setAttribute("aria-label", label(b, sq, who, open));
      }
    }

    var big = state.over && state.winner && state.winLine
      ? E.lineIndexOf(state.winner === X ? state.bigX : state.bigO) : -1;
    var bigCls = state.winner === X ? " is-x" : " is-o";
    boardStrike.className = "ubk__strike" + (big >= 0 ? bigCls : "");
    boardStrike.innerHTML = big >= 0 ? strike(big, 2.4) : "";

    renderOverall(live, big, bigCls);
    renderMoves();
    renderSeats();
    renderClocks();
    renderAnalysis();
    boardEl.classList.toggle("is-thinking", !!cancelThinking);
    boardEl.classList.toggle("ubk--free", free && canMove);
    renderStatus(free, live);
    undoBtn.disabled = !past.length || mode === "online" || !!cancelThinking;
  }

  /* The move list, as a chess site would show it: numbered pairs, with the
     move just played picked out. */
  function renderMoves() {
    if (!moves.length) {
      movesEl.innerHTML = '<p class="moves__empty">The moves will appear here.</p>';
      return;
    }
    var html = "";
    for (var i = 0; i < moves.length; i += 2) {
      var no = (i / 2) + 1;
      html += '<div class="mv"><span class="mv__no">' + no + '</span>' +
              '<span class="mv__x' + (i === moves.length - 1 ? " mv__now" : "") + '">' +
              notate(moves[i]) + markup(i) + '</span>' +
              '<span class="mv__o' + (i + 1 === moves.length - 1 ? " mv__now" : "") + '">' +
              (moves[i + 1] != null ? notate(moves[i + 1]) + markup(i + 1) : "") + '</span></div>';
    }

    function markup(i) {
      var v = analysis.marks[i];
      if (!v) return "";
      var kind = v.mark === "??" ? "blunder" : v.mark === "?" ? "mistake" : "dubious";
      return ' <span class="mv__mark mv__mark--' + kind + '" title="' +
             v.name + ", " + v.loss + ' points given away">' + v.mark + '</span>';
    }
    movesEl.innerHTML = html;
    movesEl.scrollTop = movesEl.scrollHeight;
  }

  /* The two player strips, above and below the board. */
  function renderSeats() {
    var home = mode === "online" ? seat : (mode === "computer" ? mySide : X);
    var away = home === X ? O : X;
    fill("home", home);
    fill("away", away);

    function fill(where, side) {
      var el = document.querySelector('[data-seat="' + where + '"]');
      var badge = document.querySelector('[data-seat-badge="' + where + '"]');
      var name = document.querySelector('[data-seat-name="' + where + '"]');
      var note = document.querySelector('[data-seat-note="' + where + '"]');
      var score = document.querySelector('[data-seat-score="' + where + '"]');
      var mine = where === "home" && mode !== "local";

      var cls = "seat seat--" + (where === "home" ? "bottom" : "top");
      if (!state.over && state.turn === side) cls += " seat--on";
      if (state.over && state.winner === side) cls += " seat--won";
      el.className = cls;

      badge.className = "seat__badge seat__badge--" + (side === X ? "x" : "o");
      badge.innerHTML = MARK[side];

      name.textContent = mine ? "You"
        : mode === "computer" ? "Computer"
        : mode === "online" ? "Your friend"
        : SIDE[side];
      note.textContent = mode === "local" ? (side === X ? "first" : "second")
        : SIDE[side].toLowerCase() + (mode === "computer" && !mine ? " · " + level : "");
      score.textContent = boardsWon(side);
    }
  }

  function boardsWon(side) {
    var n = 0;
    for (var b = 0; b < 9; b++) if (state.bw[b] === side) n++;
    return n;
  }

  /* The nine boards in miniature, and the count underneath. */
  function renderOverall(live, big, bigCls) {
    var x = 0, o = 0, dead = 0, b;
    for (b = 0; b < 9; b++) {
      var owner = state.bw[b], cls = "overall__sq";
      if (owner === X) { cls += " overall__sq--x"; x++; }
      else if (owner === O) { cls += " overall__sq--o"; o++; }
      else if (owner === E.DEAD) { cls += " overall__sq--dead"; dead++; }
      if (!state.over && live === b) cls += " overall__sq--live";
      if (state.winLine && state.winLine.indexOf(b) > -1) cls += " overall__sq--line";
      overall[b].className = cls;
      var want = (owner === X || owner === O) ? MARK[owner] : "";
      if (overall[b].innerHTML !== want) overall[b].innerHTML = want;
    }

    overallStrike.className = "overall__strike" + (big >= 0 ? bigCls : "");
    overallStrike.innerHTML = big >= 0 ? strike(big, 4) : "";

    var open = 9 - x - o - dead;
    var parts = ["Crosses <b>" + x + "</b>", "Noughts <b>" + o + "</b>"];
    if (dead) parts.push("<b>" + dead + "</b> drawn");
    parts.push("<b>" + open + "</b> still open");
    overallCount.innerHTML = state.over && state.winner
      ? SIDE[state.winner] + " took <b>" + (state.winner === X ? x : o) + "</b> boards, " +
        "three of them in a row."
      : parts.join(" &nbsp;·&nbsp; ");
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
      text = !state.winner
        ? "A drawn game — every square filled, nobody with three boards in a row."
        : clock.flagged
          ? SIDE[state.winner] + " win — " + SIDE[clock.flagged].toLowerCase() +
            (clock.mode === "move" ? " ran out of time on that move." : " ran out of time.")
          : SIDE[state.winner] + " win — three boards in a row.";
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
    moves = [];
    counted = false;
    clockReset();
    analysisReset();
    render();
    if (mode === "computer") computerTurn();
    if (mode === "online" && net && net.role === "host" && broadcastIt !== false) broadcast();
  }

  function undo() {
    if (mode === "online" || !past.length) return;
    stopThinking();
    var back = past.pop();
    state = E.unpack(back.s);
    clock.left[X] = back.c[0]; clock.left[O] = back.c[1];
    moves.pop();
    /* in a game against the computer, step back past its reply too */
    if (mode === "computer" && state.turn !== mySide && past.length) {
      back = past.pop();
      state = E.unpack(back.s);
      clock.left[X] = back.c[0]; clock.left[O] = back.c[1];
      moves.pop();
    }
    clock.running = clock.on && moves.length ? state.turn : 0;
    clock.since = Date.now();
    clock.flagged = 0;
    analysis.marks.length = moves.length;
    analysis.standing = null;
    analysis.pending = null;
    counted = false;
    render();
  }

  /* ---- chat ------------------------------------------------------------ */
  /* Messages go straight down the same connection as the moves. Everything
     written here is put on the page as text, never as markup, so a message
     is always read as words and never as anything else. */
  function say(kind, text) {
    var line = document.createElement("p");
    line.className = "chat__line chat__line--" + kind;
    line.textContent = text;
    var empty = chatLog.querySelector(".chat__empty");
    if (empty) empty.remove();
    chatLog.appendChild(line);
    chatLog.scrollTop = chatLog.scrollHeight;
    while (chatLog.children.length > 200) chatLog.firstChild.remove();
  }

  function clearChat(note) {
    chatLog.innerHTML = "";
    var p = document.createElement("p");
    p.className = "chat__empty";
    p.textContent = note || "Messages you send here go straight to your friend.";
    chatLog.appendChild(p);
  }

  function sendChat(ev) {
    if (ev) ev.preventDefault();
    var text = chatInput.value.trim();
    if (!text) return;
    if (!net || !net.connected()) { say("note", "Not connected — that one was not sent."); return; }
    net.send({ t: "chat", text: text.slice(0, 300) });
    say("you", text);
    chatInput.value = "";
    chatInput.focus();
  }

  function chatReady() {
    var live = !!(net && net.connected());
    chatInput.disabled = !live;
    chatSend.disabled = !live;
    chatInput.placeholder = live ? "Say something" : "Waiting for your friend…";
  }

  /* ---- the private room ------------------------------------------------ */
  function broadcast() {
    if (!net || net.role !== "host") return;
    clockSettle();
    net.send({ t: "sync", state: E.pack(state), seat: seat === X ? O : X,
               tally: tally, moves: moves,
               clock: { on: clock.on, mode: clock.mode, base: clock.base,
                        inc: clock.inc, perMove: clock.perMove,
                        x: clock.left[X], o: clock.left[O], running: clock.running } });
  }

  function netStatus(text, kind) {
    netStatusText = text;
    netEl.textContent = text;
    netEl.className = "netline" + (kind ? " netline--" + kind : "");
    render();
  }

  function startSession() {
    net = NET.session({
      status: netStatus,
      open: function () {
        if (net.role === "host") { broadcast(); }
        else { net.send({ t: "hello" }); }
        say("note", net.role === "host" ? "Your friend has joined." : "You are in the room.");
        chatReady();
        render();
      },
      message: onMessage,
      close: function () { say("note", "Your friend has gone."); chatReady(); render(); },
      error: function () {
        if (net && net.role === "guest" && !net.connected()) {
          setupBox.hidden = false;
          liveBox.hidden = true;
          chatEl.hidden = true;
        }
        chatReady();
        render();
      }
    });
    return net;
  }

  function onMessage(msg) {
    if (msg.t === "chat") {
      say("them", String(msg.text || "").slice(0, 300));
      return;
    }
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
        moves = Array.isArray(msg.moves) ? msg.moves.slice() : [];
        if (msg.clock) {
          clock.on = !!msg.clock.on;
          clock.mode = msg.clock.mode === "move" ? "move" : "bank";
          clock.base = msg.clock.base | 0;
          clock.inc = msg.clock.inc | 0;
          clock.perMove = msg.clock.perMove | 0;
          clock.left[X] = msg.clock.x | 0;
          clock.left[O] = msg.clock.o | 0;
          clock.running = msg.clock.running | 0;
          clock.since = Date.now();
        }
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
    chatEl.hidden = false;
    codeEl.textContent = code;
    chatReady();
  }

  function leaveRoom() {
    if (net) { net.close(); net = null; }
    setupBox.hidden = false;
    liveBox.hidden = true;
    chatEl.hidden = true;
    clearChat();
    chatReady();
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
    anToggle.addEventListener("change", function () {
      analysis.on = anToggle.checked;
      if (!analysis.on) analysisReset();
      render();                       /* clears the marked square too */
      if (analysis.on) analysisRun();
    });
    tcSel.addEventListener("change", applyTimeControl);
    tcMin.addEventListener("change", applyTimeControl);
    tcInc.addEventListener("change", applyTimeControl);
    $("[data-host]").addEventListener("click", hostRoom);
    $("[data-join]").addEventListener("click", function () { joinRoom(); });
    joinInput.addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); joinRoom(); }
    });
    $("[data-leave]").addEventListener("click", leaveRoom);
    chatForm.addEventListener("submit", sendChat);
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
  clearChat();
  chatReady();
  renderAnalysis();
  clockSet(readTimeControl());
  setInterval(clockTick, 100);
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
