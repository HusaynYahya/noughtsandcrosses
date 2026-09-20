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
      losses     INTEGER NOT NULL DEFAULT 0
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
  `);
  return wrap(db);
}

function wrap(db) {
  const q = {
    newPlayer: db.prepare(
      "INSERT INTO players (name, lower, hash, made, seen) VALUES (?, ?, ?, ?, ?)"),
    byName: db.prepare("SELECT * FROM players WHERE lower = ?"),
    byId: db.prepare("SELECT * FROM players WHERE id = ?"),
    seen: db.prepare("UPDATE players SET seen = ? WHERE id = ?"),
    rename: db.prepare("UPDATE players SET name = ?, lower = ? WHERE id = ?"),
    setPass: db.prepare("UPDATE players SET hash = ? WHERE id = ?"),
    scored: db.prepare(
      "UPDATE players SET rating = ?, best = MAX(best, ?), games = games + 1, " +
      "wins = wins + ?, draws = draws + ?, losses = losses + ?, seen = ? WHERE id = ?"),

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
