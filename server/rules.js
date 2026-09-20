/* ============================================================================
   The rules, as the browser has them
   ----------------------------------------------------------------------------
   The server referees, so it has to know the game — and there must be exactly
   one description of the rules in this project, or the two will drift and the
   server will start rejecting moves the board offered. So it loads the very
   file the page loads.
   ============================================================================ */
"use strict";
const fs = require("fs");
const path = require("path");

const shelf = { window: undefined };
const file = path.join(__dirname, "..", "assets", "js", "engine.js");
new Function("globalThis", "window", fs.readFileSync(file, "utf8"))(shelf, undefined);

module.exports = shelf.UNC.engine;
