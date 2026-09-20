/* ============================================================================
   The arena: who is here, who wants a game, and every game being played
   ----------------------------------------------------------------------------
   This is the part a peer-to-peer game cannot have. The server referees: it
   holds the position, it decides whether a move is legal, it runs the clocks,
   and it is the only thing that writes a result. Neither browser is trusted
   with any of it, which is what makes a rating worth having.

   Everything in here is in memory and dies with the process except the part
   that matters — finished games and ratings go into the database as they
   happen, so a restart loses games in progress and nothing else.
   ============================================================================ */
"use strict";
const crypto = require("crypto");
const E = require("./rules.js");
const rating = require("./rating.js");

const X = 1, O = 2;
const GONE_GRACE = 60000;        /* how long a disconnected player is waited for */
const RATED_FROM = 6;            /* a game abandoned sooner than this is not rated */
const TICK = 500;

function id(n) { return crypto.randomBytes(n || 9).toString("base64url"); }

/* "300+3" | "move:300" | "0" */
function readClock(tc) {
  const text = String(tc || "0");
  if (text.indexOf("move:") === 0) {
    const each = Math.max(1, Math.min(3600, +text.slice(5) || 0)) * 1000;
    return { mode: "move", base: 0, inc: 0, perMove: each, text: "move:" + each / 1000 };
  }
  const parts = text.split("+");
  const base = Math.max(0, Math.min(10800, +parts[0] || 0)) * 1000;
  const inc = Math.max(0, Math.min(180, +parts[1] || 0)) * 1000;
  if (!base) return { mode: "bank", base: 0, inc: 0, perMove: 0, text: "0" };
  return { mode: "bank", base, inc, perMove: 0, text: base / 1000 + "+" + inc / 1000 };
}

class Arena {
  constructor(book) {
    this.book = book;
    this.people = new Map();       /* playerId -> person */
    this.seeks = new Map();        /* seekId -> seek */
    this.games = new Map();        /* gameId -> game */
    this.timer = setInterval(() => this.tick(), TICK);
    if (this.timer.unref) this.timer.unref();
  }

  stop() { clearInterval(this.timer); }

  /* ---- people ---------------------------------------------------------- */
  person(player) {
    let who = this.people.get(player.id);
    if (!who) {
      who = { id: player.id, name: player.name, rating: player.rating,
              games: player.games, sockets: new Set(), game: null, seek: null, gone: 0 };
      this.people.set(player.id, who);
    }
    who.name = player.name;
    who.rating = player.rating;
    who.games = player.games;
    who.gone = 0;
    return who;
  }

  arrived(player, socket) {
    const who = this.person(player);
    who.sockets.add(socket);
    socket.who = who;
    this.toLobby();
    return who;
  }

  left(socket) {
    const who = socket.who;
    if (!who) return;
    who.sockets.delete(socket);
    if (who.sockets.size) return;
    who.gone = Date.now();
    if (who.seek) this.unseek(who);
    this.toLobby();
    /* a game in progress is not lost: it waits for them, on their own clock */
    if (who.game) {
      this.toGame(who.game, { t: "away", who: who.name });
      const game = this.games.get(who.game);
      if (game) this.tell(game);                /* so the board shows them gone */
    }
  }

  here(who) { return who && who.sockets.size > 0; }

  to(who, msg) {
    const text = JSON.stringify(msg);
    who.sockets.forEach((s) => s.send(text));
  }

  /* ---- the lobby -------------------------------------------------------- */
  lobbyState() {
    const seeks = [];
    this.seeks.forEach((s) => {
      const by = this.people.get(s.by);
      if (!by || !this.here(by)) return;
      seeks.push({ id: s.id, tc: s.tc, side: s.side, at: s.at,
                   who: { id: by.id, name: by.name, rating: by.rating, games: by.games } });
    });
    seeks.sort((a, b) => a.at - b.at);
    const online = [];
    this.people.forEach((p) => {
      if (this.here(p)) online.push({ id: p.id, name: p.name, rating: p.rating,
                                      playing: !!p.game });
    });
    online.sort((a, b) => b.rating - a.rating);
    return { t: "lobby", seeks, online: online.slice(0, 60), players: online.length,
             games: this.games.size };
  }

  toLobby() {
    const state = JSON.stringify(this.lobbyState());
    this.people.forEach((p) => p.sockets.forEach((s) => s.send(state)));
  }

  seek(who, tc, side) {
    if (who.game) return { error: "You are in a game." };
    if (who.seek) this.unseek(who);
    const clock = readClock(tc);
    const want = side === "X" || side === "O" ? side : "either";

    /* somebody already waiting for the same thing? then it is a game, not an
       offer — first come, first paired */
    for (const s of this.seeks.values()) {
      if (s.by === who.id || s.tc !== clock.text) continue;
      const them = this.people.get(s.by);
      if (!them || !this.here(them) || them.game) continue;
      if (!sidesFit(s.side, want)) continue;
      this.seeks.delete(s.id);
      them.seek = null;
      return { game: this.start(them, who, clock, s.side, want) };
    }

    const s = { id: id(6), by: who.id, tc: clock.text, side: want, at: Date.now() };
    this.seeks.set(s.id, s);
    who.seek = s.id;
    this.toLobby();
    return { seek: s };
  }

  unseek(who) {
    if (!who.seek) return;
    this.seeks.delete(who.seek);
    who.seek = null;
    this.toLobby();
  }

  /* ---- a game ------------------------------------------------------------ */
  start(a, b, clock, aSide, bSide) {
    /* whoever asked for a side gets it; otherwise the coin decides */
    let x = a, o = b;
    if (aSide === "O" || bSide === "X") { x = b; o = a; }
    else if (aSide !== "X" && bSide !== "O" && Math.random() < 0.5) { x = b; o = a; }

    const game = {
      id: id(9),
      x, o,
      state: E.create(),
      moves: [],
      clock,
      left: { 1: clock.base, 2: clock.base },
      running: 0,
      since: 0,
      at: Date.now(),
      draw: 0,                      /* who has a draw offer standing */
      over: false,
      chat: []
    };
    this.games.set(game.id, game);
    x.game = game.id; o.game = game.id;
    this.unseek(x); this.unseek(o);

    [x, o].forEach((p) => this.to(p, { t: "start", game: this.view(game, p) }));
    this.toLobby();
    return game;
  }

  view(game, forWho) {
    const me = forWho && forWho.id === game.x.id ? X : forWho && forWho.id === game.o.id ? O : 0;
    return {
      id: game.id,
      you: me,
      x: { id: game.x.id, name: game.x.name, rating: game.x.rating },
      o: { id: game.o.id, name: game.o.name, rating: game.o.rating },
      tc: game.clock.text,
      moves: game.moves.slice(),
      turn: game.state.turn,
      over: game.over,
      winner: game.state.winner,
      ending: game.ending || "",
      clock: this.clocks(game),
      draw: game.draw,
      away: { 1: !this.here(game.x), 2: !this.here(game.o) }
    };
  }

  clocks(game) {
    const left = { 1: game.left[1], 2: game.left[2] };
    if (game.running && game.since) {
      left[game.running] = Math.max(0, left[game.running] - (Date.now() - game.since));
    }
    return { on: game.clock.base > 0 || game.clock.perMove > 0, mode: game.clock.mode,
             x: left[1], o: left[2], running: game.running };
  }

  toGame(gameId, msg) {
    const game = this.games.get(gameId);
    if (!game) return;
    const text = JSON.stringify(msg);
    [game.x, game.o].forEach((p) => p.sockets.forEach((s) => s.send(text)));
  }

  tell(game) {
    [game.x, game.o].forEach((p) => this.to(p, { t: "state", game: this.view(game, p) }));
  }

  move(who, gameId, move) {
    const game = this.games.get(gameId);
    if (!game || game.over) return { error: "That game is over." };
    const side = who.id === game.x.id ? X : who.id === game.o.id ? O : 0;
    if (!side) return { error: "That is not your game." };
    if (game.state.turn !== side) return { error: "Not your turn." };
    if (!Number.isInteger(move) || !E.isLegal(game.state, move)) return { error: "Not a legal move." };

    this.settleClock(game);
    if (game.over) return {};                       /* the clock beat them to it */

    game.moves.push(move);
    E.apply(game.state, move);
    game.draw = 0;

    /* the clock starts on the reply to the first move, as at a board */
    if (game.clock.mode === "move") {
      game.left[side] = game.clock.perMove;
      game.left[game.state.turn] = game.clock.perMove;
    } else if (game.clock.base) {
      game.left[side] += game.clock.inc;
    }
    game.running = game.state.over ? 0 : game.state.turn;
    game.since = Date.now();

    if (game.state.over) this.finish(game, game.state.winner, "board");
    else this.tell(game);
    return {};
  }

  settleClock(game) {
    if (!game.running || !game.since) return;
    const now = Date.now();
    const used = now - game.since;
    game.left[game.running] = Math.max(0, game.left[game.running] - used);
    game.since = now;
    if ((game.clock.base || game.clock.perMove) && game.left[game.running] <= 0) {
      const loser = game.running;
      this.finish(game, loser === X ? O : X, "time");
    }
  }

  resign(who, gameId) {
    const game = this.games.get(gameId);
    if (!game || game.over) return { error: "That game is over." };
    const side = who.id === game.x.id ? X : who.id === game.o.id ? O : 0;
    if (!side) return { error: "That is not your game." };
    this.finish(game, side === X ? O : X, "resign");
    return {};
  }

  drawOffer(who, gameId, offer, agree) {
    const game = this.games.get(gameId);
    if (!game || game.over) return { error: "That game is over." };
    const side = who.id === game.x.id ? X : who.id === game.o.id ? O : 0;
    if (!side) return { error: "That is not your game." };
    if (offer) {
      game.draw = side;
      this.tell(game);
      return {};
    }
    if (agree && game.draw && game.draw !== side) {
      this.finish(game, 0, "agreed");
      return {};
    }
    game.draw = 0;
    this.tell(game);
    return {};
  }

  /* somebody who walked away from a game in progress can be claimed against */
  claim(who, gameId) {
    const game = this.games.get(gameId);
    if (!game || game.over) return { error: "That game is over." };
    const side = who.id === game.x.id ? X : who.id === game.o.id ? O : 0;
    if (!side) return { error: "That is not your game." };
    const them = side === X ? game.o : game.x;
    if (this.here(them)) return { error: "They are still here." };
    if (Date.now() - them.gone < GONE_GRACE) return { error: "Give them a moment." };
    this.finish(game, side, "gone");
    return {};
  }

  chat(who, gameId, text) {
    const game = this.games.get(gameId);
    if (!game) return { error: "No such game." };
    const side = who.id === game.x.id ? X : who.id === game.o.id ? O : 0;
    if (!side) return { error: "That is not your game." };
    const said = String(text || "").slice(0, 300);
    if (!said.trim()) return {};
    this.toGame(gameId, { t: "chat", game: gameId, from: who.name, side, text: said });
    return {};
  }

  /* ---- the end ----------------------------------------------------------- */
  finish(game, winner, ending) {
    if (game.over) return;
    game.over = true;
    game.ending = ending;
    game.running = 0;
    game.state.over = true;
    game.state.winner = winner;

    const rated = game.moves.length >= RATED_FROM;
    const before = { x: game.x.rating, o: game.o.rating };
    let next = before;
    if (rated) {
      next = rating.settle(
        { rating: game.x.rating, games: game.x.games },
        { rating: game.o.rating, games: game.o.games },
        winner);
      this.record(game.x, next.x, winner === X ? 1 : winner === 0 ? 0.5 : 0);
      this.record(game.o, next.o, winner === O ? 1 : winner === 0 ? 0.5 : 0);
    }

    const row = {
      id: game.id, at: game.at,
      x: game.x.id, o: game.o.id, xname: game.x.name, oname: game.o.name,
      winner, ending, moves: E.packMoves(game.moves), plies: game.moves.length,
      tc: game.clock.text, rated: rated ? 1 : 0,
      xbefore: before.x, xafter: next.x, obefore: before.o, oafter: next.o
    };
    try {
      this.book.q.addGame.run(row.id, row.at, row.x, row.o, row.xname, row.oname,
        row.winner, row.ending, row.moves, row.plies, row.tc, row.rated,
        row.xbefore, row.xafter, row.obefore, row.oafter);
    } catch (e) { /* a game the database refuses is still a game they played */ }

    [game.x, game.o].forEach((p) => {
      const mine = p.id === game.x.id ? "x" : "o";
      this.to(p, {
        t: "end",
        game: this.view(game, p),
        rated,
        rating: { before: before[mine], after: next[mine],
                  change: next[mine] - before[mine] }
      });
      p.game = null;
    });
    this.games.delete(game.id);
    this.toLobby();
  }

  record(who, newRating, score) {
    who.rating = newRating;
    who.games += 1;
    this.book.q.scored.run(newRating, newRating,
      score === 1 ? 1 : 0, score === 0.5 ? 1 : 0, score === 0 ? 1 : 0,
      Date.now(), who.id);
  }

  /* ---- the heartbeat ------------------------------------------------------ */
  tick() {
    const now = Date.now();
    this.games.forEach((game) => {
      if (game.over) return;
      const before = game.over;
      this.settleClock(game);
      if (!before && game.over) return;
      /* nudge the clocks along for both sides once a second */
      if (now % 1000 < TICK) this.tell(game);
    });
    /* a seek from somebody who has gone is not an offer */
    let changed = false;
    this.seeks.forEach((s) => {
      const by = this.people.get(s.by);
      if (!by || !this.here(by) || by.game) { this.seeks.delete(s.id); changed = true; }
    });
    if (changed) this.toLobby();
  }
}

function sidesFit(a, b) {
  if (a === "either" || b === "either") return true;
  return a !== b;                 /* one wants crosses, the other noughts */
}

module.exports = { Arena, readClock, X, O };
