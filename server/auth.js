/* ============================================================================
   Names, passwords and sessions
   ----------------------------------------------------------------------------
   Passwords are salted and put through scrypt, which is deliberately slow and
   memory-hungry, and compared in constant time. Nothing here ever holds a
   password longer than the moment it takes to hash it, and no password is ever
   written to the log or the database.
   ============================================================================ */
"use strict";
const crypto = require("crypto");

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const SESSION_LIFE = 90 * 86400 * 1000;      /* a season of not signing in again */

function hash(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT);
  return "s1$" + salt.toString("base64") + "$" + key.toString("base64");
}

function matches(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3 || parts[0] !== "s1") return false;
  const salt = Buffer.from(parts[1], "base64");
  const want = Buffer.from(parts[2], "base64");
  const got = crypto.scryptSync(password, salt, want.length, SCRYPT);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

function token() { return crypto.randomBytes(24).toString("base64url"); }

/* stored hashed, so a stolen database is not a pile of live sessions */
function fold(t) { return crypto.createHash("sha256").update(String(t)).digest("base64url"); }

/* A name has to be readable, typeable and unmistakable for somebody else's. */
function tidyName(raw) {
  const name = String(raw || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,19}$/.test(name)) return null;
  return name;
}

function okPassword(raw) {
  const p = String(raw || "");
  return p.length >= 8 && p.length <= 200 ? p : null;
}

module.exports = { hash, matches, token, fold, tidyName, okPassword, SESSION_LIFE };
