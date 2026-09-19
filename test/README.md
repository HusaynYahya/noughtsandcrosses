# Tests

```sh
node test/engine.test.js        # the rules, and that the solver proves what it claims
```

```sh
node test/bymessage.mjs          # two isolated browsers, codes passed by hand
node test/bymessage2.mjs         # a whole game played that way, move by move
```

Those two need nothing but the page itself — which is the point of the mode
they test.

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
```

`livetest.mjs` is the one that matters for live play: it opens the same link in
two separate browsers at the same moment and checks they connect, that a move
and a message cross, and that twenty more moves leave both boards identical.
It also shows what the service sees — an opaque topic and sealed blobs.

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
