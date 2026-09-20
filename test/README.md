# Tests

```sh
node test/engine.test.js        # the rules, and that the solver proves what it claims
```

```sh
node test/pages.mjs              # every page opens, with the chrome and no errors
node test/matchmaking.mjs        # the lobby: offered, taken, played, rated, filed
node test/acts.mjs               # resigning, and a draw offered, declined, agreed
```

Those two want the local message service below as well as the web server, since
the lobby is carried on it.

```sh
node test/bymessage.mjs          # two isolated browsers, codes passed by hand
node test/bymessage2.mjs         # a whole game played that way, move by move
node test/review.mjs             # the engine and the scratchpad stay shut until the end
```

The first two need nothing but the page itself — which is the point of the mode
they test. `review.mjs` plays a whole game on one device and checks that
neither the engine nor *Try a line* is anywhere to be seen while it is on, that
both appear once it is over, and that a line tried from a position in the
review leaves the game that was played exactly as it was. All three want a
server on 127.0.0.1:8777 (`python3 -m http.server 8777 --bind 127.0.0.1`).

The connection is harder to test honestly, because the thing most likely to
break is not in this repository. These two run the real library and real
WebRTC rather than a stand-in, which is how it was established that the game's
own code connects perfectly well:

```sh
npm i peer playwright            # in a scratch folder
node test/peerserver.js          # a matchmaking service on 127.0.0.1:9000
python3 -m http.server 8777 --bind 127.0.0.1
node test/real.mjs               # two browsers, a room, a move, a message
node test/byhand.mjs             # the same with no matchmaking service at all
```

```sh
node test/broker.js              # a message service on ws://127.0.0.1:9004
node test/livetest.mjs           # two browsers, same code, a game between them
node test/recover.mjs            # and a game that survives losing the connection
```

`livetest.mjs` is the one that matters for live play: it opens the same link in
two separate browsers at the same moment and checks they connect, that a move
and a message cross, and that twenty more moves leave both boards identical.
It also shows what the service sees — an opaque topic and sealed blobs.

`matchmaking.mjs` is the one that matters for the site around the board: two
browsers with their own players, one offering a game in the lobby and the other
taking it off the list, then a whole game played and checked at both ends — the
same result written down twice, the ratings moved opposite ways by the same
number of points, and the finished game openable again on the board.

`recover.mjs` is the one that matters for a connection that misbehaves, which
is every connection eventually. Six moves in, it cuts the guest's network until
both sides have given the other up, then brings it back; reloads the guest's
tab; and finally wipes everything the referee knows and reloads it, which used
to empty both boards. After each of the three the game has to still be there,
on both sides, with the same board and the same sides. It then checks that
**New game** still empties both boards and that the game before does not come
back to haunt it.

```sh
node test/turnserver.js          # a relay on 127.0.0.1:3478 (gamer/letmein)
node test/relay.mjs              # the relay test button, and a game forced through it
```

`relay.mjs` proves three things: that a right password passes, that a wrong one
is reported as refused rather than as a broken network, and that a whole game
plays through a relay with no direct route allowed at all.

`livetest.mjs` points the page at the local service by setting `UNC_BROKERS`
before the page's own scripts run — the same hook anybody can use to run their
own message service instead of the public ones.
