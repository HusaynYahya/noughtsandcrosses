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

  /* A live game is kept in three places at once, because a connection is not
     a safe place to keep anything. `gid` names the game so the two sides can
     tell "the game we are both playing" from "a game one of us has forgotten";
     `roomCode` is what the record is filed under here; `startedHere` marks a
     board that is empty on purpose, so a late message from the game before
     cannot put the old one back. */
  var gid = "", roomCode = "", startedHere = false;
  function newGid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

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
      anBody    = $("[data-an-body]"),
      reviewBox   = $("[data-review]"),
      reviewTitle = $("[data-review-title]"),
      reviewIntro = $("[data-review-intro]"),
      reviewGoBtn = $("[data-review-analyse]"),
      reviewProg  = $("[data-review-progress]"),
      reviewSum   = $("[data-review-summary]"),
      evalGraph   = $("[data-evalgraph]"),
      movesNav    = $("[data-moves-nav]"),
      navLabel    = $("[data-nav-label]"),
      anBest    = $("[data-an-best]"),
      anPv      = $("[data-an-pv]"),
      anCands   = $("[data-an-cands]"),
      anSide    = $("[data-an-side]"),
      anEvalBar = $("[data-eval-fill]"),
      anEvalTxt = $("[data-eval-text]"),
      exploreBtn   = $("[data-explore]"),
      exploreStart = $("[data-explore-start]"),
      exploreBox   = $("[data-explore-controls]"),
      exploreCount = $("[data-explore-count]"),
      exploreFlag  = $("[data-explore-flag]"),
      engineLine   = $("[data-engine-line]"),
      engineMoves  = $("[data-engine-moves]"),
      engineStep   = $("[data-engine-step]"),
      engineAll    = $("[data-engine-all]"),
      backBtn      = $("[data-explore-back]"),
      doneBtn      = $("[data-explore-done]"),
      playControls = $("[data-play-controls]"),
      netCheckBtn = $("[data-net-check]"),
      netCheckOut = $("[data-net-check-out]"),
      netReport   = $("[data-net-report]"),
      handBox     = $("[data-byhand]"),
      handStep    = $("[data-hand-step]"),
      handSay     = $("[data-hand-say]"),
      handOut     = $("[data-hand-out]"),
      handOutRow  = $("[data-hand-out-row]"),
      handIn      = $("[data-hand-in]"),
      handInRow   = $("[data-hand-in-row]"),
      handGo      = $("[data-hand-go]"),
      relayUrl    = $("[data-relay-url]"),
      relayUser   = $("[data-relay-user]"),
      relayPass   = $("[data-relay-pass]"),
      relaySaid   = $("[data-relay-said]"),
      postSend    = $("[data-post-send]"),
      postOut     = $("[data-post-out]"),
      postIn      = $("[data-post-in]"),
      postSaid    = $("[data-post-said]"),
      netCopyBtn  = $("[data-net-copy]"),
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

  /* Trying a line. The real game is put aside, and the board becomes a
     scratchpad you can push moves around on for either side. Nothing leaves
     this browser until a move is committed, and anything arriving from the
     other player waits until you are finished. */
  var explore = { on: false, base: null, baseMoves: [], from: 0 };

  /* Going back over a finished game. `at` is how many moves are on the board;
     the full record stays in `moves` so the list can show all of it. The
     engine is only ever consulted here — never while a game is being played. */
  var review = { on: false, at: 0, full: null, scores: [], done: false, running: false };

  /* Playing by message: no connection of any kind. Each move produces a code
     carrying the whole game, which is sent by whatever the two of you already
     use to send each other things. `side` is which of the two you are, settled
     by the first thing you do. */
  var post = { side: null };

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
    if (explore.on) return true;          /* either side, on the scratchpad */
    if (review.on) return false;          /* the game is over: this is a look back */
    if (mode === "computer") return state.turn === mySide && !cancelThinking;
    if (mode === "online") return net && net.connected() && state.turn === seat;
    if (mode === "post") return post.side ? state.turn === post.side : true;
    return true;
  }

  function play(move) {
    if (explore.on) {
      if (!state.over && E.isLegal(state, move)) exploreMove(move);
      return;
    }
    if (!myTurn() || !E.isLegal(state, move)) return;
    if (clock.on && !clock.running) { clock.running = state.turn; clock.since = Date.now(); }

    if (mode === "online" && net.role === "guest") {
      /* Play it here at once so the board feels immediate; the referee's copy
         comes back a moment later and has the final word. */
      advance(move);
      net.send({ t: "move", move: move });
      return;
    }

    if (mode === "post" && !post.side) post.side = state.turn;
    advance(move);
    if (mode === "online") broadcast();
    else if (mode === "computer") computerTurn();
    else if (mode === "post") renderPost();
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
    keepGame();
    analysisRun();
    if (state.over) finishGame();
  }

  function finishGame() {
    if (counted) return;
    counted = true;
    setTimeout(reviewEnter, 900);          /* let the result land first */
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

  /* ---- going back over the game ---------------------------------------- */
  function positionAt(n) {
    var s = E.create();
    for (var i = 0; i < n && i < moves.length; i++) E.apply(s, moves[i]);
    return s;
  }

  function reviewEnter() {
    if (review.on || !state.over) return;
    review.on = true;
    review.full = E.pack(state);
    review.at = moves.length;
    render();
  }

  function reviewLeave() {
    if (!review.on) return;
    if (explore.on) exploreLeave();
    review.on = false;
    review.done = false;
    review.scores = [];
    review.running = false;
    analysis.report = null;
    state = E.unpack(review.full);
    render();
  }

  function reviewGo(n) {
    if (!review.on) return;
    if (explore.on) exploreLeave();
    review.at = Math.max(0, Math.min(moves.length, n));
    state = positionAt(review.at);
    render();
    analysisRun();
  }

  /* Read every position of the game in turn, then judge each move by what it
     did to the position: how it stood for the mover before, against how it
     stands for them after. The same comparison a chess site makes. */
  function reviewAnalyse() {
    if (!review.on || review.running) return;
    review.running = true;
    review.scores = new Array(moves.length + 1);
    analysis.marks = [];
    var at = 0;
    renderReview();

    step();
    function step() {
      if (!review.on) { review.running = false; return; }
      reviewProg.hidden = false;
      reviewProg.textContent = "Looking at move " + Math.min(at + 1, moves.length) +
        " of " + moves.length + "…";
      var pos = positionAt(at);
      AN.analyse(pos, 300, function (r) {
        /* always from the crosses' side, so the numbers can be compared */
        review.scores[at] = r.turn === O ? 100 - r.score : r.score;
        at++;
        if (at <= moves.length) { setTimeout(step, 0); return; }
        finish();
      });
    }

    function finish() {
      for (var i = 0; i < moves.length; i++) {
        var mover = i % 2 === 0 ? X : O;
        var before = mover === X ? review.scores[i] : 100 - review.scores[i];
        var after = mover === X ? review.scores[i + 1] : 100 - review.scores[i + 1];
        var verdict = AN.judge(before, after, true);
        if (verdict) analysis.marks[i] = verdict;
      }
      review.running = false;
      review.done = true;
      reviewProg.hidden = true;
      render();
      analysisRun();
    }
  }

  function renderReview() {
    var over = state.over || review.on;
    reviewBox.hidden = !(review.on || (state.over && moves.length));
    movesNav.hidden = !review.on;

    if (!reviewBox.hidden) {
      reviewTitle.textContent = review.on ? "Going back over the game" : "The game is over";
      reviewIntro.textContent = review.on
        ? "Step through with the arrows under the moves, or click any move in the list. From any position you can try a line of your own."
        : "Step through the moves, or have the engine go over the whole game.";
      reviewGoBtn.disabled = review.running;
      reviewGoBtn.textContent = review.running ? "Reading…"
        : review.done ? "Look again" : "Analyse the game";
    }
    if (review.on) {
      navLabel.textContent = review.at + " / " + moves.length;
      movesNav.querySelector('[data-nav="start"]').disabled = review.at === 0;
      movesNav.querySelector('[data-nav="prev"]').disabled = review.at === 0;
      movesNav.querySelector('[data-nav="next"]').disabled = review.at >= moves.length;
      movesNav.querySelector('[data-nav="end"]').disabled = review.at >= moves.length;
    }
    renderSummary();
    renderGraph();
  }

  function renderSummary() {
    var counts = { X: { "?!": 0, "?": 0, "??": 0 }, O: { "?!": 0, "?": 0, "??": 0 } };
    var any = false;
    analysis.marks.forEach(function (v, i) {
      if (!v) return;
      any = true;
      counts[i % 2 === 0 ? "X" : "O"][v.mark]++;
    });
    reviewSum.hidden = !any;
    if (!any) return;
    function line(side, c) {
      var bits = [];
      if (c["?!"]) bits.push(c["?!"] + " inaccura" + (c["?!"] > 1 ? "cies" : "cy"));
      if (c["?"]) bits.push(c["?"] + " mistake" + (c["?"] > 1 ? "s" : ""));
      if (c["??"]) bits.push(c["??"] + " blunder" + (c["??"] > 1 ? "s" : ""));
      return "<b>" + side + "</b> " + (bits.length ? bits.join(", ") : "nothing to answer for");
    }
    reviewSum.innerHTML = line("Crosses", counts.X) + "<br>" + line("Noughts", counts.O);
  }

  /* how the game stood, move by move — click it to jump */
  function renderGraph() {
    var scores = review.scores;
    if (!review.on || !review.done || !scores || scores.length < 2) {
      evalGraph.hidden = true;
      return;
    }
    evalGraph.hidden = false;
    var W = 280, H = 66;
    var x = function (i) { return (W - 2) * i / (scores.length - 1) + 1; };
    var y = function (v) { return H - (H - 4) * (v / 100) - 2; };
    var area = "M" + x(0) + " " + H, i;
    for (i = 0; i < scores.length; i++) area += " L" + x(i).toFixed(1) + " " + y(scores[i]).toFixed(1);
    area += " L" + x(scores.length - 1) + " " + H + " Z";
    var line = scores.map(function (v, k) {
      return (k ? "L" : "M") + x(k).toFixed(1) + " " + y(v).toFixed(1);
    }).join(" ");

    var marks = "";
    analysis.marks.forEach(function (v, k) {
      if (!v) return;
      var kind = v.mark === "??" ? "blunder" : v.mark === "?" ? "mistake" : "dubious";
      marks += '<circle class="eg__mark eg__mark--' + kind + '" cx="' + x(k + 1).toFixed(1) +
               '" cy="' + y(scores[k + 1]).toFixed(1) + '" r="2.6"></circle>';
    });

    evalGraph.innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="none" role="img" ' +
      'aria-label="How the game stood, move by move">' +
        '<line class="eg__mid" x1="0" y1="' + (H / 2) + '" x2="' + W + '" y2="' + (H / 2) + '"/>' +
        '<path class="eg__area" d="' + area + '"/>' +
        '<path class="eg__line" d="' + line + '"/>' +
        marks +
        '<line class="eg__now" x1="' + x(review.at).toFixed(1) + '" y1="0" x2="' +
          x(review.at).toFixed(1) + '" y2="' + H + '"/>' +
      "</svg>";
  }

  /* ---- trying a line --------------------------------------------------- */
  /* Only offered once the game is finished. The line branches from whatever
     position the review is standing on; the game itself is untouched. */
  function exploreEnter() {
    if (explore.on || !review.on || state.over) return;
    stopThinking();
    explore.on = true;
    explore.base = E.pack(state);
    explore.baseMoves = moves.slice();
    explore.from = review.at;
    moves = moves.slice(0, review.at);
    render();
    analysisRun();
  }

  /* put the game that was played back */
  function exploreLeave() {
    if (!explore.on) return;
    state = E.unpack(explore.base);
    moves = explore.baseMoves.slice();
    explore.on = false;
    analysis.standing = null;
    analysis.pending = null;
    render();
    analysisRun();
  }

  function exploreBack() {
    if (!explore.on || moves.length <= explore.from) return;
    var replay = moves.slice(explore.from, moves.length - 1);
    state = E.unpack(explore.base);
    moves = explore.baseMoves.slice(0, explore.from);
    replay.forEach(function (m) { moves.push(m); E.apply(state, m); });
    render();
    analysisRun();
  }

  /* a move played while trying a line: either side, no clock, nothing sent */
  function exploreMove(move) {
    moves.push(move);
    E.apply(state, move);
    render(move);
    analysisRun();
  }

  /* The line the engine expects from the position now on the board. Each move
     can be clicked to play the line as far as that move. */
  function renderEngineLine() {
    if (!explore.on) { engineLine.hidden = true; return; }
    engineLine.hidden = false;
    var r = analysis.report;
    var pv = r && !state.over ? r.pv : [];

    if (!pv.length) {
      engineMoves.innerHTML = '<span class="waiting">' +
        (state.over ? "The line ends here." : "Reading the position…") + "</span>";
      engineStep.disabled = engineAll.disabled = true;
      return;
    }
    engineMoves.innerHTML = pv.map(function (m, i) {
      return '<button type="button" data-line="' + i + '" title="Play the line to here">' +
             notate(m) + "</button>";
    }).join("");
    engineStep.disabled = engineAll.disabled = false;
  }

  /* play the engine's line up to and including move `upto` */
  function playEngineLine(upto) {
    if (!explore.on || !analysis.report) return;
    var pv = analysis.report.pv || [];
    for (var i = 0; i <= upto && i < pv.length; i++) {
      if (state.over || !E.isLegal(state, pv[i])) break;
      moves.push(pv[i]);
      E.apply(state, pv[i]);
    }
    render(state.last);
    analysisRun();
  }

  function renderExplore() {
    var n = moves.length - explore.from;
    /* while a game is on there is nothing to try: the control belongs to the
       look back afterwards, along with the engine */
    exploreStart.hidden = !review.on || explore.on;
    exploreBox.hidden = !explore.on;
    playControls.hidden = explore.on;
    undoBtn.hidden = review.on || mode === "post";
    exploreFlag.hidden = !explore.on;
    boardEl.classList.toggle("ubk--exploring", explore.on);
    exploreBtn.disabled = state.over;
    exploreBtn.title = state.over
      ? "Step back to a position in the game first" : "";
    if (!explore.on) return;

    exploreCount.textContent = n === 0 ? "Nothing played yet."
      : n === 1 ? "One move in: " + notate(moves[explore.from]) + "."
      : n + " moves in, starting " + notate(moves[explore.from]) + ".";
    backBtn.disabled = n === 0;
    renderEngineLine();
  }

  /* ---- the analysis board ---------------------------------------------- */
  /* Every time the position changes, look at it again. The reading for the
     position before a move is kept, so when that move is played the two
     readings can be set side by side and the move judged. */
  function analysisRun() {
    if (analysis.cancel) { analysis.cancel(); analysis.cancel = null; }
    /* The engine is only ever consulted once a game is over — never while one
       is being played, whether against the computer or a friend. */
    if (!review.on) { analysis.busy = false; renderAnalysis(); return; }
    /* the reading that is on screen belongs to the position that was on the
       board a moment ago; drop it rather than offer a line from somewhere else */
    analysis.report = null;
    analysis.busy = true;
    renderAnalysis();
    var forState = E.clone(state);
    analysis.cancel = AN.analyse(forState, 900, function (report) {
      analysis.cancel = null;
      analysis.busy = false;
      /* the position may have moved on while we were thinking */
      if (forState.filled !== state.filled || forState.turn !== state.turn) return;
      analysis.report = report;

      render();
    });
  }

  /* called as a move is played, so the move can be judged once the new
     position has been read */
  function analysisNote() { analysis.standing = null; }

  function analysisReset() {
    if (analysis.cancel) { analysis.cancel(); analysis.cancel = null; }
    analysis.report = null;
    analysis.marks = [];
    analysis.standing = null;
    analysis.pending = null;
    analysis.busy = false;
  }

  function renderAnalysis() {
    anBody.hidden = !review.on;
    if (!review.on) return;

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
    if (clock.running && clock.left[clock.running] <= 0 && mayFlag() &&
        (explore.on || !state.over)) {
      /* the real game is what runs out, not the line being tried */
      if (explore.on) exploreLeave();
      if (state.over) { renderClocks(); return; }
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
      keepGame();
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
    if (mode === "online") return seat;
    if (mode === "computer") return mySide;
    if (mode === "post") return post.side || X;
    return X;
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
    var bestSquare = review.on && analysis.report && !state.over
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
    renderExplore();
    renderReview();
    renderPost();
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
      var isVar = explore.on && i >= explore.from;
      var here = review.on && !explore.on ? review.at - 1 : moves.length - 1;
      html += '<div class="mv' + (isVar ? " mv--var" : "") + '"><span class="mv__no">' + no + '</span>' +
              '<span class="mv__x' + (i === here ? " mv__now" : "") +
              (isVar ? " mv__var" : "") + '"' + (review.on ? ' data-at="' + (i + 1) + '"' : "") + '>' +
              notate(moves[i]) + markup(i) + '</span>' +
              '<span class="mv__o' + (i + 1 === here ? " mv__now" : "") +
              (explore.on && i + 1 >= explore.from ? " mv__var" : "") + '"' +
              (review.on && moves[i + 1] != null ? ' data-at="' + (i + 2) + '"' : "") + '>' +
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
    if (review.on) {
      var now = movesEl.querySelector(".mv__now");
      if (now) {
        /* measured against the list itself: offsetTop would be relative to
           whichever ancestor happens to be positioned */
        var row = now.parentNode.getBoundingClientRect();
        var box = movesEl.getBoundingClientRect();
        movesEl.scrollTop += (row.top - box.top) - (movesEl.clientHeight - row.height) / 2;
      } else movesEl.scrollTop = 0;
    } else {
      movesEl.scrollTop = movesEl.scrollHeight;
    }
  }

  /* The two player strips, above and below the board. */
  function renderSeats() {
    var home = seatHome();
    var away = home === X ? O : X;
    fill("home", home);
    fill("away", away);

    function fill(where, side) {
      var el = document.querySelector('[data-seat="' + where + '"]');
      var badge = document.querySelector('[data-seat-badge="' + where + '"]');
      var name = document.querySelector('[data-seat-name="' + where + '"]');
      var note = document.querySelector('[data-seat-note="' + where + '"]');
      var score = document.querySelector('[data-seat-score="' + where + '"]');
      var mine = where === "home" && mode !== "local" && !(mode === "post" && !post.side);

      var cls = "seat seat--" + (where === "home" ? "bottom" : "top");
      if (!state.over && state.turn === side) cls += " seat--on";
      if (state.over && state.winner === side) cls += " seat--won";
      el.className = cls;

      badge.className = "seat__badge seat__badge--" + (side === X ? "x" : "o");
      badge.innerHTML = MARK[side];

      name.textContent = mine ? "You"
        : mode === "computer" ? "Computer"
        : mode === "online" || mode === "post" ? "Your friend"
        : SIDE[side];
      note.textContent = mode === "local" || (mode === "post" && !post.side)
        ? (side === X ? "first" : "second")
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
      var who = explore.on ? SIDE[state.turn] + " to play in this line"
        : myTurn() && mode !== "local" ? "Your move" : SIDE[state.turn] + " to play";
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
    if (explore.on) explore.on = false;
    if (review.on) { review.on = false; review.done = false; review.scores = []; }
    analysis.marks = [];
    state = E.create();
    gid = newGid();
    past = [];
    moves = [];
    counted = false;
    clockReset();
    analysisReset();
    render();
    if (mode === "computer") computerTurn();
    if (mode === "online" && net && net.role === "host" && broadcastIt !== false) broadcast(true);
  }

  /* A new game asked for here, rather than a board that happens to be empty */
  function newGame(broadcastIt) { reset(broadcastIt); startedHere = true; keepGame(); }

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

  /* ---- keeping the game ------------------------------------------------- */
  /* Everything needed to put this game back exactly as it is, in one object.
     It is what gets written down here, and what gets sent when the two sides
     have to work out between them which of them still knows the game. */
  function record(t) {
    return { t: t, gid: gid, ply: moves.length, at: Date.now(),
             state: E.pack(state), moves: moves.slice(), seat: seat,
             tally: tally,
             clock: { on: clock.on, mode: clock.mode, base: clock.base,
                      inc: clock.inc, perMove: clock.perMove,
                      x: clock.left[X], o: clock.left[O], running: clock.running } };
  }

  /* A record has to hang together before it is believed, wherever it came
     from: the moves counted, and the position saying the same number. */
  function sound(rec) {
    if (!rec || !rec.state || !Array.isArray(rec.moves) || rec.moves.length > 81) return false;
    for (var i = 0; i < rec.moves.length; i++) {
      var m = rec.moves[i];
      if (typeof m !== "number" || m < 0 || m > 80 || m !== (m | 0)) return false;
    }
    return E.unpack(rec.state).filled === rec.moves.length;
  }

  var KEEP = 12 * 3600 * 1000;    /* a record older than this is no use to anybody */

  function keepGame() {
    if (mode !== "online" || !roomCode) return;
    try { localStorage.setItem("unc.live." + roomCode, JSON.stringify(record("keep"))); }
    catch (e) {}
  }

  function savedGame(code) {
    try {
      var rec = JSON.parse(localStorage.getItem("unc.live." + code) || "null");
      if (!sound(rec) || !rec.at || Date.now() - rec.at > KEEP) return null;
      return rec;
    } catch (e) { return null; }
  }

  /* Put a game back on the board: from this browser's own note of it, or from
     the other player's copy when they are the one who still has it. */
  function restore(rec) {
    stopThinking();
    if (explore.on) explore.on = false;
    if (review.on) { review.on = false; review.done = false; review.scores = []; }
    gid = rec.gid || newGid();
    state = E.unpack(rec.state);
    moves = rec.moves.slice();
    if (rec.seat === X || rec.seat === O) seat = rec.seat;
    past = [];
    counted = state.over;
    analysis.marks = [];
    analysisReset();
    if (rec.clock) {
      clock.on = !!rec.clock.on;
      clock.mode = rec.clock.mode === "move" ? "move" : "bank";
      clock.base = rec.clock.base | 0;
      clock.inc = rec.clock.inc | 0;
      clock.perMove = rec.clock.perMove | 0;
      clock.left[X] = rec.clock.x | 0;
      clock.left[O] = rec.clock.o | 0;
      clock.running = state.over ? 0 : rec.clock.running | 0;
      /* time did not stop while the page was away: whoever was to move has
         been thinking all along */
      if (clock.running && rec.at) {
        clock.left[clock.running] -= Math.max(0, Date.now() - rec.at);
      }
      clock.since = Date.now();
      clock.flagged = 0;
    }
    startedHere = false;
    render(state.last);
  }

  /* Is the record they are offering a better one than ours? Only ever their
     copy of the same game with more of it, or a game we have no note of at
     all — never over a board we emptied on purpose. */
  function betterThanOurs(rec) {
    if (!sound(rec) || startedHere) return false;
    if (rec.gid && rec.gid === gid) return rec.moves.length > moves.length;
    return moves.length === 0 && rec.moves.length > 0;
  }

  /* ---- the private room ------------------------------------------------ */
  function broadcast(fresh) {
    if (!net || net.role !== "host") return;
    clockSettle();
    var out = record("sync");
    out.seat = seat === X ? O : X;        /* their side, not ours */
    out.fresh = !!fresh;                  /* a board emptied on purpose */
    net.send(out);
  }

  function netStatus(text, kind) {
    netStatusText = text;
    netEl.textContent = text;
    netEl.className = "netline" + (kind ? " netline--" + kind : "");
    render();
  }

  function startSession() {
    net = window.UNC.live({
      status: netStatus,
      open: function () {
        /* which of the two plays crosses was settled by the transport, the
           same way on both sides — but a game already under way keeps the
           sides it was played with, whatever the connection decides now */
        if (!moves.length) seat = net.role === "host" ? X : O;
        /* whoever answers brings their copy of the game with them, so a side
           that has lost it can be given it back */
        if (net.role === "host") broadcast(); else net.send(record("hello"));
        say("note", "Connected.");
        chatReady();
        render();
      },
      message: onMessage,
      close: function () {
        say("note", "Your friend has dropped out. The game is kept — it will " +
                    "be here when they come back.");
        chatReady();
        render();
      },
      error: function () {
        if (net && !net.connected()) {
          setupBox.hidden = false;
          liveBox.hidden = true;
          chatEl.hidden = true;
        }
        chatReady();
        render();
        /* Work out why, without being asked: whoever is trying to help needs
           to know which of the three things failed. And point at the way in
           that needs no service, since a service is the usual trouble. */
        if (!lastCheck) runNetCheck();
        handBox.open = true;
      }
    });
    return net;
  }

  function onMessage(msg) {
    /* Anything that moves the real game on ends the line being tried — better
       than leaving a scratchpad standing on a position that no longer is. */
    if (explore.on && (msg.t === "sync" || msg.t === "move" || msg.t === "rematch")) {
      exploreLeave();
      say("note", "Your friend moved, so the line you were trying is gone.");
    }
    if (msg.t === "chat") {
      say("them", String(msg.text || "").slice(0, 300));
      return;
    }
    if (net.role === "host") {
      if (msg.t === "hello" || msg.t === "resume") {
        /* They still have the game and we do not — the usual shape of a
           connection that dropped and came back. Take theirs. */
        if (betterThanOurs(msg)) {
          var mine = msg.seat === X ? O : X;
          restore({ gid: msg.gid, state: msg.state, moves: msg.moves,
                    seat: mine, clock: msg.clock, at: msg.at });
          keepGame();
          say("note", "Picked the game back up where it was.");
        }
        /* if our board is empty because we meant it to be, say so, or they
           will keep offering us the game we have just finished with */
        broadcast(startedHere && !moves.length);
        return;
      }
      if (msg.t === "move") {
        var guestSeat = seat === X ? O : X;
        if (!state.over && state.turn === guestSeat && E.isLegal(state, msg.move)) {
          advance(msg.move);
        }
        broadcast();                       /* right or wrong, they get the truth */
        return;
      }
      if (msg.t === "rematch") { swapSides(); newGame(); return; }
    } else {
      if (msg.t === "sync") {
        /* The referee's word is final about the game we are both playing —
           but a sync that has lost the game is not the referee correcting us,
           it is a page that came back empty. Send ours instead of taking it. */
        var behind = msg.gid === gid ? (msg.ply | 0) < moves.length - 1
                                     : (msg.ply | 0) < moves.length;
        if (!msg.fresh && behind && moves.length) { offerOurs(); return; }
        applySync(msg);
      }
    }
  }

  /* Hand our copy over, but not over and over: if they will not have it,
     saying so again every time changes nothing. */
  var offered = 0;
  function offerOurs() {
    if (Date.now() - offered < 3000) return false;
    offered = Date.now();
    net.send(record("resume"));
    return true;
  }

  function applySync(msg) {
    gid = msg.gid || gid;
    startedHere = false;
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
    analysis.marks.length = moves.length;
    render(state.last);
    keepGame();
    analysisRun();
  }

  function swapSides() { seat = seat === X ? O : X; }

  function showRoom(code) {
    setupBox.hidden = true;
    liveBox.hidden = false;
    chatEl.hidden = false;
    codeEl.textContent = code;
    /* nothing to invite anybody to when the two were introduced by hand */
    $("[data-copy]").hidden = code === "by hand";
    chatReady();
  }

  function leaveRoom() {
    if (net) { net.close(); net = null; }
    roomCode = "";
    setupBox.hidden = false;
    liveBox.hidden = true;
    chatEl.hidden = true;
    clearChat();
    chatReady();
    codeEl.textContent = "";
    netStatus("", "");
    if (location.hash || location.search) {
      history.replaceState(null, "", location.pathname);
    }
    reset(false);
  }

  /* A room is just a code both of you use; there is nothing to create or to
     claim, so making one is only inventing the words. */
  function hostRoom() {
    joinRoom(NET.makeCode());
  }

  function joinRoom(code) {
    var tidy = NET.tidyCode(code || joinInput.value);
    if (!tidy) { netStatus("Type the room code first.", "error"); return; }
    if (net) net.close();
    joinInput.value = tidy;            /* show what was actually read */
    var session = startSession();
    showRoom(tidy);
    roomCode = tidy;
    /* Put the room in the address. A phone that reloads the page — and they
       do, on their own, when a tab has been away a while — then comes back
       into the same room instead of to an empty board. */
    try { history.replaceState(null, "", location.pathname + "?room=" + tidy); }
    catch (e) {}
    reset(false);
    /* Coming back to the same room — after a reload, a lost connection, or a
       phone that put the page to sleep — carries on the game that was there. */
    var saved = savedGame(tidy);
    if (saved) {
      restore(saved);
      say("note", "Your game is where you left it.");
    }
    session.join(tidy).then(function () {
      showRoom(session.code);
      render();
    }).catch(function () { /* the status line has already said so */ });
  }

  function showSavedRelay() {
    var own = NET.savedRelay();
    if (!own) return;
    relayUrl.value = own.urls;
    relayUser.value = own.username || "";
    relayPass.value = own.credential || "";
    relaySaid.textContent = "Using your own relay.";
  }

  /* ---- playing by message ---------------------------------------------- */
  function postLink(code) {
    return location.origin + location.pathname + "?game=" + code;
  }

  function renderPost() {
    if (mode !== "post") { postSend.hidden = true; return; }
    var mine = post.side && state.turn !== post.side && !state.over;
    var ended = state.over && moves.length;
    postSend.hidden = !(mine || ended);
    if (postSend.hidden) return;
    postOut.value = E.packMoves(moves);
  }

  function postUse() {
    var text = postIn.value.trim();
    if (!text) return;
    var read = E.unpackMoves(text.replace(/^.*[?&]game=/, ""));
    if (!read) {
      postSaid.textContent = "That is not a game code — check it came across whole.";
      postSaid.className = "post__said post__said--bad";
      return;
    }
    if (read.length < moves.length) {
      postSaid.textContent = "That code is from earlier in the game than where you are.";
      postSaid.className = "post__said post__said--bad";
      return;
    }
    stopThinking();
    state = E.create();
    moves = read.slice();
    past = [];
    counted = false;
    analysis.marks = [];
    read.forEach(function (m) { E.apply(state, m); });
    /* whoever receives a code is the one to move next */
    post.side = state.over ? post.side : state.turn;
    postIn.value = "";
    postSaid.textContent = state.over ? "That is the end of the game."
      : "Their move is on the board. Yours now.";
    postSaid.className = "post__said post__said--good";
    render(state.last);
    if (state.over) finishGame();
  }

  function copyText(btn, text, said) {
    var done = function () {
      var old = btn.textContent;
      btn.textContent = said || "Copied";
      setTimeout(function () { btn.textContent = old; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { btn.textContent = "Copy it by hand"; });
    } else {
      postOut.value = text;
      postOut.select();
      try { document.execCommand("copy"); done(); } catch (e) { btn.textContent = "Copy it by hand"; }
    }
  }

  /* ---- connecting by hand, with no service ----------------------------- */
  var hand = null, handRole = null, handStage = null;

  function handSession() {
    if (net) net.close();
    net = NET.session({
      status: netStatus,
      open: function () {
        say("note", "Connected by hand.");
        if (net.role === "host") broadcast(); else net.send(record("hello"));
        chatReady();
        render();
      },
      message: onMessage,
      close: function () { say("note", "Your friend has gone."); chatReady(); render(); }
    });
    if (hand) hand.close();
    hand = NET.handshake({
      status: netStatus,
      channel: function (c) { net.adopt(c, handRole); }
    });
    return hand;
  }

  function handShow(say_, outText, wantIn, goLabel) {
    handStep.hidden = false;
    handSay.textContent = say_;
    handOut.hidden = handOutRow.hidden = !outText;
    if (outText) handOut.value = outText;
    handIn.hidden = handInRow.hidden = !wantIn;
    if (wantIn) { handIn.value = ""; handGo.textContent = goLabel || "Use it"; }
  }

  function handStart() {
    handRole = "host";
    seat = X;
    handStage = "wait-reply";
    handSession().offer().then(function (code) {
      handShow("1. Send your friend this code. 2. Paste the code they send back.",
               code, true, "Connect");
      showRoom("by hand");
      chatEl.hidden = false;
      netStatus("Send them your code, then paste theirs back here. Nothing " +
                "happens until both codes have been across.", "waiting");
      render();
    }, function (err) { netStatus(err.message, "error"); });
  }

  function handJoin() {
    handRole = "guest";
    seat = O;
    handStage = "make-reply";
    handSession();
    handShow("Paste the code your friend sent you.", "", true, "Make my reply");
  }

  function handUse() {
    var text = handIn.value.trim();
    if (!text) return;
    if (handStage === "make-reply") {
      hand.answer(text).then(function (reply) {
        handShow("Send this back to your friend. The game starts when they paste it.",
                 reply, false);
        showRoom("by hand");
        chatEl.hidden = false;
        netStatus("Now send that code back. Nothing will happen on this screen " +
                  "until your friend has pasted it.", "waiting");
        render();
      }, function (err) { netStatus(err.message, "error"); });
    } else {
      hand.accept(text).then(function () {
        handShow("Connecting…", "", false);
        netStatus("Both codes are across — connecting…", "waiting");
      }, function (err) { netStatus(err.message, "error"); });
    }
  }

  function handCopy(ev) {
    var btn = ev.currentTarget;
    var text = handOut.value;
    var done = function () {
      btn.textContent = "Copied";
      setTimeout(function () { btn.textContent = "Copy this code"; }, 1800);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        handOut.select();
        btn.textContent = "Copy it from the box";
      });
    } else {
      handOut.select();
      try { document.execCommand("copy"); done(); } catch (e) {
        btn.textContent = "Copy it from the box";
      }
    }
  }

  /* ---- when a room will not open --------------------------------------- */
  /* The last check's findings, kept so they can be copied out and sent to
     somebody who can do something about them. */
  var lastCheck = null;

  function copyNetReport() {
    if (!lastCheck) return;
    var lines = ["Ultimate noughts and crosses — connection report",
                 new Date().toISOString(),
                 "code: " + (net && net.code ? net.code : "(none)") +
                 "   role: " + (net && net.role ? net.role : "(none)") +
                 "   connected: " + !!(net && net.connected()),
                 "status: " + (netStatusText || "(nothing said)"),
                 ""];
    lastCheck.forEach(function (s) {
      lines.push((s.ok ? "OK   " : "FAIL ") + s.name + " — " + s.detail);
    });
    lines.push("", navigator.userAgent);
    var text = lines.join("\n");

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(said, fallback);
    } else fallback();

    function said() {
      netCopyBtn.textContent = "Copied — paste it to whoever is fixing this";
      setTimeout(function () { netCopyBtn.textContent = "Copy this report"; }, 3000);
    }
    function fallback() {
      var box = document.createElement("textarea");
      box.value = text;
      box.style.position = "fixed";
      box.style.opacity = "0";
      document.body.appendChild(box);
      box.select();
      try { document.execCommand("copy"); said(); } catch (e) {
        netCopyBtn.textContent = "Could not copy — read it off the screen";
      }
      document.body.removeChild(box);
    }
  }

  function runNetCheck() {
    netCheckBtn.disabled = true;
    netCheckBtn.textContent = "Checking…";
    netCheckOut.hidden = false;
    netCheckOut.innerHTML = '<li class="working">Trying the three things a room needs…</li>';

    window.UNC.live.check(function (steps, finished) {
      netCheckOut.innerHTML = steps.map(function (s) {
        return '<li class="' + (s.ok ? "ok" : "bad") + '"><b>' + s.name + "</b> — " +
               s.detail + "</li>";
      }).join("") + (finished ? "" : '<li class="working">still checking…</li>');
      if (!finished) return;
      lastCheck = steps;
      netReport.hidden = false;
      netCheckBtn.disabled = false;
      netCheckBtn.textContent = "Check again";
      var bad = steps.filter(function (s) { return !s.ok; });
      if (!bad.length) {
        netCheckOut.innerHTML += '<li class="ok"><b>All three are fine</b> — so a room ' +
          'should open. If it still does not, your friend may be the one having trouble: ' +
          'ask them to run this too.</li>';
      }
    });
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
    post.side = null;
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
        if (net.role === "host") { swapSides(); newGame(); }
        else net.send({ t: "rematch" });
        return;
      }
      reset(false);
    });
    undoBtn.addEventListener("click", undo);
    exploreBtn.addEventListener("click", exploreEnter);
    backBtn.addEventListener("click", exploreBack);
    doneBtn.addEventListener("click", exploreLeave);
    engineStep.addEventListener("click", function () { playEngineLine(0); });
    engineAll.addEventListener("click", function () { playEngineLine(99); });
    engineMoves.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-line]");
      if (btn) playEngineLine(+btn.getAttribute("data-line"));
    });
    document.addEventListener("keydown", function (ev) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName);
      if (review.on && !explore.on && !typing) {
        if (ev.key === "ArrowLeft") { ev.preventDefault(); reviewGo(review.at - 1); return; }
        if (ev.key === "ArrowRight") { ev.preventDefault(); reviewGo(review.at + 1); return; }
        if (ev.key === "Home") { ev.preventDefault(); reviewGo(0); return; }
        if (ev.key === "End") { ev.preventDefault(); reviewGo(moves.length); return; }
      }
      if (ev.key === "Escape" && explore.on) { exploreLeave(); }
      if (ev.key === "Backspace" && explore.on && ev.target === document.body) {
        ev.preventDefault();
        exploreBack();
      }
    });
    reviewGoBtn.addEventListener("click", reviewAnalyse);
    evalGraph.addEventListener("click", function (ev) {
      if (!review.on || !review.scores.length) return;
      var box = evalGraph.getBoundingClientRect();
      var at = Math.round((ev.clientX - box.left) / box.width * moves.length);
      reviewGo(at);
    });
    movesNav.addEventListener("click", function (ev) {
      var btn = ev.target.closest("[data-nav]");
      if (!btn) return;
      var where = btn.getAttribute("data-nav");
      reviewGo(where === "start" ? 0 : where === "end" ? moves.length
             : where === "prev" ? review.at - 1 : review.at + 1);
    });
    movesEl.addEventListener("click", function (ev) {
      var cell = ev.target.closest("[data-at]");
      if (cell && review.on) reviewGo(+cell.getAttribute("data-at"));
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
    netCheckBtn.addEventListener("click", function () { runNetCheck(); });
    netCopyBtn.addEventListener("click", copyNetReport);
    $("[data-post-use]").addEventListener("click", postUse);
    $("[data-post-copy]").addEventListener("click", function (ev) {
      copyText(ev.currentTarget, E.packMoves(moves), "Copied — send it");
    });
    $("[data-post-copy-link]").addEventListener("click", function (ev) {
      copyText(ev.currentTarget, postLink(E.packMoves(moves)), "Copied — send it");
    });
    $("[data-hand-start]").addEventListener("click", handStart);
    $("[data-hand-join]").addEventListener("click", handJoin);
    handGo.addEventListener("click", handUse);
    $("[data-hand-copy]").addEventListener("click", handCopy);
    $("[data-relay-save]").addEventListener("click", function () {
      var url = relayUrl.value.trim();
      if (!url) { relaySaid.textContent = "Put the relay's address in first."; return; }
      NET.setRelay(url, relayUser.value.trim(), relayPass.value.trim());
      relaySaid.textContent = "Saved in this browser. Start the connection again to " +
        "use it — and make sure your friend has one too, or has this same one.";
    });
    $("[data-relay-test]").addEventListener("click", function (ev) {
      var btn = ev.currentTarget;
      btn.disabled = true;
      btn.textContent = "Testing…";
      relaySaid.textContent = "Asking the relay for an address…";
      NET.testRelay(function (r) {
        btn.disabled = false;
        btn.textContent = "Test it";
        relaySaid.textContent = (r.ok ? "✓ " : "✕ ") + r.detail;
        relaySaid.style.color = r.ok ? "var(--go-hi)" : "#e0876f";
      });
    });
    $("[data-relay-clear]").addEventListener("click", function () {
      NET.setRelay(null);
      relayUrl.value = relayUser.value = relayPass.value = "";
      relaySaid.textContent = "Forgotten. Back to the public relays.";
    });
    showSavedRelay();
    chatForm.addEventListener("submit", sendChat);
    $("[data-copy]").addEventListener("click", copyInvite);
    window.addEventListener("beforeunload", function () { if (net) net.close(); });

    /* A phone pauses the page when you switch apps, which kills the line to
       the matchmaking service. Pick it up again the moment the page is looked
       at — this is the difference between a room that works and two people
       staring at "waiting". */
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && net) net.wake();
    });
    /* only a page restored from the back-forward cache; a plain load is
       already opening a room of its own */
    window.addEventListener("pageshow", function (ev) {
      if (ev.persisted && net) net.wake();
    });
    window.addEventListener("online", function () { if (net) net.wake(); });
  }

  function copyInvite(ev) {
    var btn = ev.currentTarget;
    var text = "Come and play ultimate noughts and crosses — open this and " +
               "we'll meet there: " + net.link() + "  (code: " + net.code + ")";
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

  var invited = NET.readLink(location.search, location.hash);
  var byMessage = /[?&]game=([A-Za-z0-9\-_]+)/.exec(location.search);
  if (byMessage) {
    setMode("post");
    postIn.value = byMessage[1];
    postUse();
  } else if (invited) {
    setMode("online");
    joinInput.value = invited;
    joinRoom(invited);
  } else if (NET.looksLikeInvitation(location.search, location.hash)) {
    /* Something was tacked onto the address but no code could be read out of
       it. Almost always a link that lost its tail on the way — say so, rather
       than opening an ordinary game and leaving them wondering. */
    setMode("online");
    netStatus("That link looks like an invitation, but the code did not survive " +
      "being sent. Ask your friend for the four words and type them in.", "error");
    render();
  } else {
    render();
  }
})();
