# The server

One process, no dependencies. It uses only what Node already ships with —
`http`, `crypto` and `sqlite` — and a WebSocket written out in `ws.js`, so
there is nothing to install, nothing to keep patched, and nothing to go wrong
in a lockfile.

```sh
node server/index.js                                  # port 8090, server/unc.db
PORT=8090 UNC_DB=/data/unc.db node server/index.js
```

Then open `http://localhost:8090` — it serves the site sitting beside it as
well, so one box can host the whole thing.

| Setting | What it does |
| --- | --- |
| `PORT` | What to listen on. Default 8090. |
| `UNC_DB` | Where the database file goes. Default `server/unc.db`. |
| `UNC_ORIGINS` | Comma-separated list of sites allowed to call it. Default: any. |

## What it is for

Three things a game played browser-to-browser cannot do for itself:

- **Accounts**, so a name and a rating belong to somebody rather than to a
  browser that can be cleared.
- **Refereeing.** The server holds the position, decides whether a move is
  legal, runs the clocks and is the only thing that writes a result. Neither
  player is trusted with any of it, which is the whole reason a rating is worth
  having.
- **Remembering.** Games are kept where the browser that played them is not.

It loads `assets/js/engine.js` — the very file the page loads — so the rules
the server enforces and the rules the board offers cannot drift apart.

## The shape of it

| File | What it does |
| --- | --- |
| `index.js` | The HTTP server: the API, the site, and the WebSocket upgrade |
| `ws.js` | WebSocket: the handshake and the frames |
| `arena.js` | Who is here, who wants a game, and every game being played |
| `db.js` | The schema and every query, in SQLite |
| `auth.js` | Names, scrypt passwords, session tokens |
| `rating.js` | Elo, the only copy that counts |
| `rules.js` | Loads the browser's engine so there is one set of rules |

## The API

Everything answers JSON. A token goes in `Authorization: Bearer …`; there are
no cookies, so there is nothing for another site to make a browser send.

```
POST /api/register  {name, password}   -> {token, me}
POST /api/login     {name, password}   -> {token, me}
POST /api/logout
GET  /api/me
GET  /api/leaderboard?limit=50
GET  /api/players/:name                -> profile and recent games
GET  /api/games?player=name&limit=30
GET  /api/game/:id                     -> one game, whole
GET  /api/health
```

The live half is one socket at `/ws`. The client says `hello` with its token;
after that it can `seek`, `unseek`, `move`, `resign`, `draw`, `claim` and
`chat`, and is sent `welcome`, `lobby`, `start`, `state`, `chat`, `away` and
`end`. A game in progress is picked straight back up on reconnecting, because
the server never lost it.

## Putting it somewhere

**It has to be reachable over https.** The site is served over https, and a
browser will not let an https page talk to a plain-http server or a `ws://`
socket. Anything that terminates TLS for you — Fly, Render, Caddy, nginx — is
fine.

**Fly.io**, which is what `fly.toml` here is for. It gives you a machine with
a disk and an https address, and puts the machine to sleep when nobody is
playing.

```sh
# once, on your own machine
curl -L https://fly.io/install.sh | sh
fly auth signup                     # or: fly auth login

cd noughtsandcrosses
fly launch --no-deploy --copy-config --name unc-<something-of-your-own>
fly volumes create unc_data --size 1 --region lhr
fly deploy

fly open /api/health                # {"ok":true,...} means it is up
```

`--copy-config` keeps the `fly.toml` in this repository rather than writing a
new one; the name has to be one nobody else on Fly has taken, and it becomes
`https://<name>.fly.dev`. Pick the region nearest the people who will play:
`lhr` London, `iad` Virginia, `fra` Frankfurt, `syd` Sydney.

**Keep it to one machine.** The database is a file on that volume and the games
in progress are in that machine's memory, so a second machine would be a second
server with its own book and its own lobby. Never `fly scale count 2`.

**Docker**, anywhere:

```sh
docker build -t unc .
docker run -d --name unc -p 8090:8090 -v unc-data:/data --restart unless-stopped unc
```

The container starts as root only long enough to hand the volume to an
unprivileged user, then drops to it. Put something that terminates TLS in front
of it — see the plain machine below.

**A plain machine** — a £4 VPS is more than enough — with systemd and Caddy,
which gets a certificate on its own:

```
# /etc/caddy/Caddyfile
unc.example.com {
    reverse_proxy 127.0.0.1:8090
}
```

```sh
git clone https://github.com/HusaynYahya/noughtsandcrosses /srv/noughtsandcrosses
useradd --system --home /var/lib/unc --create-home unc
systemctl enable --now unc caddy
```

```ini
# /etc/systemd/system/unc.service
[Unit]
Description=Ultimate noughts and crosses
After=network.target

[Service]
ExecStart=/usr/bin/node /srv/noughtsandcrosses/server/index.js
Environment=PORT=8090 UNC_DB=/var/lib/unc/unc.db
WorkingDirectory=/srv/noughtsandcrosses
User=unc
Restart=always

[Install]
WantedBy=multi-user.target
```

## Pointing the site at it

One line, in `assets/js/config.js`:

```js
window.UNC_SERVER = "https://unc.example.com";
```

Without it the site works exactly as it always has — private rooms, ratings
each browser keeps for itself. With it, the site grows accounts, a ladder and a
referee. You can also try a server out for one visit without committing the
site to it, by adding `?server=https://…` to any page's address.

## Looking after it

The database is one file. Copy it and you have everything:

```sh
sqlite3 /data/unc.db ".backup /backup/unc-$(date +%F).db"
```

A restart loses games in progress and nothing else: finished games and ratings
are written as they happen. Sessions last three months and are stored as
hashes, so a stolen database is not a pile of live logins; passwords are
scrypt with a per-password salt.

## Tests

```sh
node test/server.test.mjs        # the protocol: accounts, pairing, a refereed game, the book
node test/withserver.mjs         # the site against a real server, in two browsers
```

The first needs nothing but Node. The second wants the site on
`127.0.0.1:8777` and Playwright, like the other browser tests.
