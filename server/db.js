/* ============================================================================
   The book: players, sessions and finished games
   ----------------------------------------------------------------------------
   SQLite, through the one Node ships with, so the whole server is a file and a
   database beside it. Nothing here knows about HTTP; it is opened once and
   handed round.
   ============================================================================ */
"use strict";
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const START = 1200;

function open(file) {
  const db = new DatabaseSync(file || path.join(__dirname, "unc.db"));
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id         INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      lower      TEXT NOT NULL UNIQUE,
      hash       TEXT NOT NULL,
      made       INTEGER NOT NULL,
      seen       INTEGER NOT NULL,
      rating     INTEGER NOT NULL DEFAULT ${START},
      best       INTEGER NOT NULL DEFAULT ${START},
      games      INTEGER NOT NULL DEFAULT 0,
      wins       INTEGER NOT NULL DEFAULT 0,
      draws      INTEGER NOT NULL DEFAULT 0,
      losses     INTEGER NOT NULL DEFAULT 0,
      email      TEXT,
      verified   INTEGER NOT NULL DEFAULT 0,
      plain      TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS players_email ON players (email) WHERE email IS NOT NULL;

    /* A rating for each kind of clock, the way a chess site does it: being
       good at five minutes says little about being good at ten seconds. The
       overall one on the players row stays as the headline. */
    CREATE TABLE IF NOT EXISTS ratings (
      player  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      kind    TEXT NOT NULL,
      rating  INTEGER NOT NULL DEFAULT ${START},
      best    INTEGER NOT NULL DEFAULT ${START},
      games   INTEGER NOT NULL DEFAULT 0,
      wins    INTEGER NOT NULL DEFAULT 0,
      draws   INTEGER NOT NULL DEFAULT 0,
      losses  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (player, kind)
    );

    /* One-shot links: proving an address, and getting back in without one. */
    CREATE TABLE IF NOT EXISTS tokens (
      token   TEXT PRIMARY KEY,
      player  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      kind    TEXT NOT NULL,
      made    INTEGER NOT NULL,
      used    INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token   TEXT PRIMARY KEY,
      player  INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      made    INTEGER NOT NULL,
      seen    INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS games (
      id       TEXT PRIMARY KEY,
      at       INTEGER NOT NULL,
      x        INTEGER REFERENCES players(id) ON DELETE SET NULL,
      o        INTEGER REFERENCES players(id) ON DELETE SET NULL,
      xname    TEXT NOT NULL,
      oname    TEXT NOT NULL,
      winner   INTEGER NOT NULL,        -- 0 drawn, 1 crosses, 2 noughts
      ending   TEXT NOT NULL,           -- board | time | resign | agreed | gone
      moves    TEXT NOT NULL,           -- the whole game, packed
      plies    INTEGER NOT NULL,
      tc       TEXT NOT NULL,
      rated    INTEGER NOT NULL,
      xbefore  INTEGER NOT NULL, xafter INTEGER NOT NULL,
      obefore  INTEGER NOT NULL, oafter INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS games_at ON games (at DESC);
    CREATE INDEX IF NOT EXISTS games_x  ON games (x, at DESC);
    CREATE INDEX IF NOT EXISTS games_o  ON games (o, at DESC);
    CREATE INDEX IF NOT EXISTS players_rating ON players (rating DESC);
    CREATE INDEX IF NOT EXISTS ratings_kind ON ratings (kind, rating DESC);
  `);
  /* Databases made before the columns existed are brought up to date rather
     than thrown away. */
  const columns = db.prepare("PRAGMA table_info(players)").all().map((c) => c.name);
  if (columns.indexOf("email") < 0) db.exec("ALTER TABLE players ADD COLUMN email TEXT");
  if (columns.indexOf("verified") < 0) {
    db.exec("ALTER TABLE players ADD COLUMN verified INTEGER NOT NULL DEFAULT 0");
  }
  if (columns.indexOf("plain") < 0) db.exec("ALTER TABLE players ADD COLUMN plain TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS players_plain ON players (plain) " +
          "WHERE plain IS NOT NULL");
  return wrap(db);
}

function wrap(db) {
  const q = {
    newPlayer: db.prepare(
      "INSERT INTO players (name, lower, plain, hash, email, made, seen) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?)"),
    byPlain: db.prepare("SELECT * FROM players WHERE plain = ?"),
    byName: db.prepare("SELECT * FROM players WHERE lower = ?"),
    byId: db.prepare("SELECT * FROM players WHERE id = ?"),
    seen: db.prepare("UPDATE players SET seen = ? WHERE id = ?"),
    rename: db.prepare("UPDATE players SET name = ?, lower = ? WHERE id = ?"),
    setPass: db.prepare("UPDATE players SET hash = ? WHERE id = ?"),
    scored: db.prepare(
      "UPDATE players SET rating = ?, best = MAX(best, ?), games = games + 1, " +
      "wins = wins + ?, draws = draws + ?, losses = losses + ?, seen = ? WHERE id = ?"),

    setEmail: db.prepare("UPDATE players SET email = ?, verified = ? WHERE id = ?"),
    verify: db.prepare("UPDATE players SET verified = 1 WHERE id = ?"),
    byEmail: db.prepare("SELECT * FROM players WHERE email = ?"),
    removePlayer: db.prepare("DELETE FROM players WHERE id = ?"),

    rating: db.prepare("SELECT * FROM ratings WHERE player = ? AND kind = ?"),
    ratingsOf: db.prepare("SELECT * FROM ratings WHERE player = ?"),
    newRating: db.prepare(
      "INSERT OR IGNORE INTO ratings (player, kind) VALUES (?, ?)"),
    ratingScored: db.prepare(
      "UPDATE ratings SET rating = ?, best = MAX(best, ?), games = games + 1, " +
      "wins = wins + ?, draws = draws + ?, losses = losses + ? WHERE player = ? AND kind = ?"),
    ladderOf: db.prepare(
      "SELECT p.id, p.name, p.seen, r.rating, r.best, r.games, r.wins, r.draws, r.losses " +
      "FROM ratings r JOIN players p ON p.id = r.player " +
      "WHERE r.kind = ? AND r.games > 0 ORDER BY r.rating DESC, r.games DESC LIMIT ?"),
    placeIn: db.prepare(
      "SELECT COUNT(*) + 1 AS place FROM ratings WHERE kind = ? AND games > 0 AND rating > ?"),

    newToken: db.prepare("INSERT INTO tokens (token, player, kind, made) VALUES (?, ?, ?, ?)"),
    token: db.prepare("SELECT * FROM tokens WHERE token = ? AND kind = ?"),
    useToken: db.prepare("UPDATE tokens SET used = 1 WHERE token = ?"),
    dropTokens: db.prepare("DELETE FROM tokens WHERE player = ? AND kind = ?"),
    dropOldTokens: db.prepare("DELETE FROM tokens WHERE made < ?"),
    dropSessionsOf: db.prepare("DELETE FROM sessions WHERE player = ?"),

    newSession: db.prepare("INSERT INTO sessions (token, player, made, seen) VALUES (?, ?, ?, ?)"),
    session: db.prepare("SELECT * FROM sessions WHERE token = ?"),
    touchSession: db.prepare("UPDATE sessions SET seen = ? WHERE token = ?"),
    dropSession: db.prepare("DELETE FROM sessions WHERE token = ?"),
    dropOld: db.prepare("DELETE FROM sessions WHERE seen < ?"),

    addGame: db.prepare(
      "INSERT INTO games (id, at, x, o, xname, oname, winner, ending, moves, plies, tc, " +
      "rated, xbefore, xafter, obefore, oafter) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"),
    game: db.prepare("SELECT * FROM games WHERE id = ?"),
    recent: db.prepare("SELECT * FROM games ORDER BY at DESC LIMIT ?"),
    forPlayer: db.prepare(
      "SELECT * FROM games WHERE x = ? OR o = ? ORDER BY at DESC LIMIT ?"),
    between: db.prepare(
      "SELECT * FROM games WHERE (x = ? AND o = ?) OR (x = ? AND o = ?) ORDER BY at DESC LIMIT ?"),

    ladder: db.prepare(
      "SELECT id, name, rating, best, games, wins, draws, losses, seen FROM players " +
      "WHERE games > 0 ORDER BY rating DESC, games DESC LIMIT ?"),
    countPlayers: db.prepare("SELECT COUNT(*) AS n FROM players"),
    countGames: db.prepare("SELECT COUNT(*) AS n FROM games"),
    placeOf: db.prepare(
      "SELECT COUNT(*) + 1 AS place FROM players WHERE games > 0 AND rating > ?")
  };
  return { db, q, close: () => db.close() };
}

module.exports = { open, START };
