# Tests

```sh
node test/engine.test.js        # the rules, and that the solver proves what it claims
```

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

`real.mjs` points the page at the local service by setting `UNC_PEER_SERVER`
before the page's own scripts run — the same hook anybody can use to run their
own service instead of the public one.
