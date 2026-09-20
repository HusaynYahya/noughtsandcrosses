/* ============================================================================
   ULTIMATE NOUGHTS AND CROSSES — the server
   ----------------------------------------------------------------------------
   One process, no dependencies: Node's own http, crypto and sqlite, plus a
   WebSocket written out in ws.js. It does the three things a peer-to-peer game
   cannot do for itself —

     it keeps accounts, so a name and a rating belong to somebody;
     it referees, so a result is not one player's word; and
     it remembers, so a game is still there when the browser that played it is
     not.

   It will also serve the site beside it, so a single box can host the whole
   thing. Run it:

     node server/index.js                 # port 8090, database in server/unc.db
     PORT=80 UNC_DB=/data/unc.db node server/index.js

   The browsers can be anywhere; set UNC_ORIGINS to the sites allowed to call
   it, or leave it open.
   ============================================================================ */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ws = require("./ws.js");
const store = require("./db.js");
const auth = require("./auth.js");
const { Arena } = require("./arena.js");

const PORT = +process.env.PORT || 8090;
const ROOT = path.join(__dirname, "..");
const ORIGINS = (process.env.UNC_ORIGINS || "*").split(",").map((s) => s.trim());

const book = store.open(process.env.UNC_DB);
const arena = new Arena(book);

/* ---- the small change ---------------------------------------------------- */
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8", ".txt": "text/plain; charset=utf-8"
};

function cors(req, res) {
  const origin = req.headers.origin;
  if (ORIGINS[0] === "*") res.setHeader("Access-Control-Allow-Origin", "*");
  else if (origin && ORIGINS.indexOf(origin) >= 0) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
}

function say(res, code, body) {
  const text = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8",
                        "Cache-Control": "no-store" });
  res.end(text);
}

function body(req, limit = 4096) {
  return new Promise((done, fail) => {
    let text = "", size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) { fail(new Error("too big")); req.destroy(); return; }
      text += c;
    });
    req.on("end", () => {
      if (!text) return done({});
      try { done(JSON.parse(text)); } catch (e) { fail(new Error("not json")); }
    });
    req.on("error", fail);
  });
}

/* ---- who is asking -------------------------------------------------------- */
function playerFor(token) {
  if (!token) return null;
  const row = book.q.session.get(auth.fold(token));
  if (!row) return null;
  if (Date.now() - row.seen > auth.SESSION_LIFE) {
    book.q.dropSession.run(auth.fold(token));
    return null;
  }
  book.q.touchSession.run(Date.now(), auth.fold(token));
  return book.q.byId.get(row.player) || null;
}

function bearer(req) {
  const head = req.headers.authorization || "";
  return head.indexOf("Bearer ") === 0 ? head.slice(7) : "";
}

function card(p, place) {
  return { id: p.id, name: p.name, rating: p.rating, best: p.best, games: p.games,
           wins: p.wins, draws: p.draws, losses: p.losses, since: p.made,
           place: place || null, provisional: p.games < 10 };
}

/* ---- knocking too often --------------------------------------------------- */
const knocks = new Map();
function tooMany(ip) {
  const now = Date.now();
  const seen = knocks.get(ip) || [];
  const recent = seen.filter((t) => now - t < 60000);
  recent.push(now);
  knocks.set(ip, recent);
  return recent.length > 12;
}

/* ---- the api --------------------------------------------------------------- */
async function api(req, res, url) {
  const route = url.pathname;
  const ip = req.socket.remoteAddress || "?";

  if (route === "/api/health") {
    return say(res, 200, { ok: true, players: book.q.countPlayers.get().n,
                           games: book.q.countGames.get().n,
                           online: arena.lobbyState().players, playing: arena.games.size });
  }

  if (route === "/api/register" || route === "/api/login") {
    if (req.method !== "POST") return say(res, 405, { error: "Post it." });
    if (tooMany(ip)) return say(res, 429, { error: "Too many tries. Wait a minute." });
    let sent;
    try { sent = await body(req); } catch (e) { return say(res, 400, { error: "Bad request." }); }

    const name = auth.tidyName(sent.name);
    const password = auth.okPassword(sent.password);
    if (!name) return say(res, 400, {
      error: "A name is 2 to 20 letters, numbers, dashes or underscores, starting with a letter or number." });
    if (!password) return say(res, 400, { error: "A password is at least 8 characters." });

    let player = book.q.byName.get(name.toLowerCase());

    if (route === "/api/register") {
      if (player) return say(res, 409, { error: "That name is taken." });
      const now = Date.now();
      book.q.newPlayer.run(name, name.toLowerCase(), auth.hash(password), now, now);
      player = book.q.byName.get(name.toLowerCase());
    } else {
      if (!player || !auth.matches(password, player.hash)) {
        return say(res, 401, { error: "No such name, or the wrong password." });
      }
      book.q.seen.run(Date.now(), player.id);
    }

    const token = auth.token();
    book.q.newSession.run(auth.fold(token), player.id, Date.now(), Date.now());
    return say(res, 200, { token, me: card(player) });
  }

  if (route === "/api/logout") {
    const token = bearer(req);
    if (token) book.q.dropSession.run(auth.fold(token));
    return say(res, 200, { ok: true });
  }

  if (route === "/api/me") {
    const player = playerFor(bearer(req));
    if (!player) return say(res, 401, { error: "Not signed in." });
    return say(res, 200, { me: card(player, book.q.placeOf.get(player.rating).place) });
  }

  if (route === "/api/leaderboard") {
    const limit = Math.max(1, Math.min(200, +url.searchParams.get("limit") || 50));
    const rows = book.q.ladder.all(limit).map((p, i) => Object.assign(card(p), {
      place: i + 1, online: arena.here(arena.people.get(p.id))
    }));
    return say(res, 200, { table: rows, players: book.q.countPlayers.get().n,
                           games: book.q.countGames.get().n });
  }

  if (route.indexOf("/api/players/") === 0) {
    const name = decodeURIComponent(route.slice("/api/players/".length)).toLowerCase();
    const player = book.q.byName.get(name);
    if (!player) return say(res, 404, { error: "No such player." });
    const games = book.q.forPlayer.all(player.id, player.id, 50).map(gameRow);
    return say(res, 200, {
      player: card(player, book.q.placeOf.get(player.rating).place),
      online: arena.here(arena.people.get(player.id)),
      games
    });
  }

  if (route === "/api/games") {
    const limit = Math.max(1, Math.min(100, +url.searchParams.get("limit") || 30));
    const who = url.searchParams.get("player");
    if (who) {
      const player = book.q.byName.get(who.toLowerCase());
      if (!player) return say(res, 404, { error: "No such player." });
      return say(res, 200, { games: book.q.forPlayer.all(player.id, player.id, limit).map(gameRow) });
    }
    return say(res, 200, { games: book.q.recent.all(limit).map(gameRow) });
  }

  if (route.indexOf("/api/game/") === 0) {
    const row = book.q.game.get(route.slice("/api/game/".length));
    if (!row) return say(res, 404, { error: "No such game." });
    return say(res, 200, { game: gameRow(row) });
  }

  return say(res, 404, { error: "No such thing here." });
}

function gameRow(g) {
  return { id: g.id, at: g.at, tc: g.tc, rated: !!g.rated, winner: g.winner,
           ending: g.ending, moves: g.moves, plies: g.plies,
           x: { id: g.x, name: g.xname, before: g.xbefore, after: g.xafter },
           o: { id: g.o, name: g.oname, before: g.obefore, after: g.oafter } };
}

/* ---- the site, if this box is serving it ---------------------------------- */
function statically(req, res, url) {
  let file = decodeURIComponent(url.pathname);
  if (file.endsWith("/")) file += "index.html";
  const full = path.normalize(path.join(ROOT, file));
  if (full.indexOf(ROOT) !== 0) { res.writeHead(403); return res.end("No."); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not here."); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(full)] || "application/octet-stream",
                         "Cache-Control": "no-cache" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (url.pathname.indexOf("/api/") === 0) {
    api(req, res, url).catch(() => say(res, 500, { error: "Something went wrong here." }));
    return;
  }
  if (req.method !== "GET") { res.writeHead(405); return res.end(); }
  statically(req, res, url);
});

/* ---- the live part --------------------------------------------------------- */
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://" + (req.headers.host || "localhost"));
  if (url.pathname !== "/ws") { socket.end("HTTP/1.1 404 Not Found\r\n\r\n"); return; }
  const wire = ws.upgrade(req, socket, head);
  if (!wire) return;

  let who = null;
  const send = (msg) => wire.send(JSON.stringify(msg));

  wire.on("text", (text) => {
    let msg;
    try { msg = JSON.parse(text); } catch (e) { return send({ t: "error", why: "Bad message." }); }
    if (!msg || typeof msg.t !== "string") return;

    if (msg.t === "hello") {
      const player = playerFor(msg.token);
      if (!player) return send({ t: "error", why: "Sign in first.", fatal: true });
      who = arena.arrived(player, wire);
      send({ t: "welcome", me: card(player, book.q.placeOf.get(player.rating).place) });
      send(arena.lobbyState());
      /* a game already under way is picked straight back up */
      if (who.game) {
        const game = arena.games.get(who.game);
        if (game) send({ t: "start", game: arena.view(game, who) });
        else who.game = null;
      }
      return;
    }
    if (!who) return send({ t: "error", why: "Sign in first." });

    let out = {};
    switch (msg.t) {
      case "seek":   out = arena.seek(who, msg.tc, msg.side); break;
      case "unseek": arena.unseek(who); break;
      case "move":   out = arena.move(who, msg.game, msg.move | 0); break;
      case "resign": out = arena.resign(who, msg.game); break;
      case "draw":   out = arena.drawOffer(who, msg.game, !!msg.offer, !!msg.agree); break;
      case "claim":  out = arena.claim(who, msg.game); break;
      case "chat":   out = arena.chat(who, msg.game, msg.text); break;
      case "ping":   send({ t: "pong" }); break;
      default: out = { error: "Nobody here does that." };
    }
    if (out && out.error) send({ t: "error", why: out.error });
  });

  wire.on("close", () => { if (who) arena.left(wire); });
});

/* a connection that has gone quiet is one the operating system has not noticed
   yet; a ping every half minute finds it */
setInterval(() => {
  arena.people.forEach((p) => p.sockets.forEach((s) => s.ping()));
  book.q.dropOld.run(Date.now() - auth.SESSION_LIFE);
}, 30000).unref?.();

if (require.main === module) {
  server.listen(PORT, () => {
    console.log("[unc] listening on http://localhost:" + PORT +
                "  (database: " + (process.env.UNC_DB || "server/unc.db") + ")");
  });
}

module.exports = { server, book, arena };
