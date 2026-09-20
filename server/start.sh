#!/bin/sh
# A volume turns up owned by root, so give it to the user that will be doing
# the writing, then stop being root.
set -e
DIR=$(dirname "${UNC_DB:-/data/unc.db}")
mkdir -p "$DIR"
chown -R node:node "$DIR" 2>/dev/null || true
exec su-exec node node /app/server/index.js
