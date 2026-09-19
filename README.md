# Ultimate noughts and crosses

Nine small boards inside one big one. The square you take decides which board
your opponent has to play in next. Win three small boards in a row to win the
game.

Play it three ways: two people at one device, against the computer, or in a
private online room with a friend.

## The rules

1. Nine small boards sit in one big three-by-three.
2. The **square** you play in a small board sends your opponent to the **small
   board in that position**. Take the top-right square, and they must play in
   the top-right board.
3. A small board that has already been won is **still played in** while it has
   empty squares — you are still sent there — but its result never changes. It
   belongs to whoever won it first.
4. Only when the board you are sent to is **completely full** may you play
   wherever you like.
5. A small board that fills up with no line belongs to nobody.
6. Win **three small boards in a row** to win the game. If every square is
   filled and nobody has three in a row, the game is drawn.

A won small board is ruled through, the way you would strike one out on paper,
and the three boards that win the game are ruled through too.

Rules 3 and 4 are the house variant this version plays; other versions send you
anywhere as soon as a board has merely been *won*, which makes for a shorter,
looser game.

## Playing a friend online

One of you presses **Create a room** and gets a four-word code, such as
`copper-kestrel-amber-quartz`. **Copy invitation** puts a link and the code on
your clipboard to send however you like.

A code is a **place to meet**, not a room one of you owns. Whoever gets there
first holds it open and the other walks in, so it does not matter which of you
opens the link — or whether you both do. You can skip the link entirely and
both type the same four words into **Join**; if you arrive at the same instant,
one of you takes the room and the other is let in.

Either player can press **New game** for a rematch; sides swap each time, so
nobody keeps the advantage of going first.

There is no server behind the game and no account to make. The two browsers talk
to each other over WebRTC, so the moves never pass through anybody's database
and nothing is stored when you close the tab. A public matchmaking service
introduces the two browsers to each other — it sees the room code and nothing
else. Both players need the page open at the same time.

Most of the time the two browsers reach each other directly. Some networks —
a lot of mobile ones, and many offices — will not allow that, and the moves are
bounced through a public relay instead. A relay carries the traffic but cannot
read it: a data channel is encrypted end to end, so what passes through is
ciphertext.

The connection library is kept in this repository and served alongside the
game, so a blocked or unreachable CDN cannot stop a room opening.

**On a phone, keep the page open.** Switching to another app pauses it, and a
paused page cannot answer the door — which is what happens if you open the
link, then switch to your messages to send it. The page picks the connection
back up the moment you look at it again, and the other side keeps knocking
meanwhile, so it recovers on its own; but the two of you will meet faster if
the link is sent from somewhere else, or sent first and opened after.

**A relay of your own.** Free public relays come and go, and without one a lot
of mobile and office networks cannot be joined at all. A free account at
metered.ca (or any TURN server) gives you an address, a username and a
password; there is a box for them under *Connect by hand*, and one relay
between the two of you is enough.

**If rooms will not work at all**, there is *Connect by hand* under the room
controls, which needs no matchmaking service: one of you presses **I'll start**
and sends the block of text it makes, the other pastes it in and sends back the
block of text they get, the first pastes that in, and you are connected. It is
clumsy and it works when nothing else does, because the only thing between the
two browsers is whatever you used to send the text.

**If a room will not open**, there is a *Check the connection* link under the
room controls. It tries the three things a private game needs — the library,
the matchmaking service, and whether this network lets two browsers reach each
other — and says which one is the trouble. The third is the one no code can fix:
some office and mobile networks will not allow a direct connection at all.

If your friend's phone drops off the network mid-game, the page says so within
about fifteen seconds. The room stays open: they can rejoin with the same code
and carry on from the current position.

## The clock

Optional, and off until you choose it. There are two ways to keep time:

**A bank of time each** — the chess way. Bullet, blitz and rapid presets, or
your own minutes and increment. Whatever you do not spend on one move is
yours to spend on the next.

**Time for every move** — 15 seconds, 30 seconds, a minute, five minutes, or
your own. Every turn starts with the whole allowance again, however long the
last one took. Run out on a single move and you lose.

Either way the clock does not start until the first move, taking a move back
puts the clock back with it, and running out loses the game. In an online game
the clock belongs to whoever opened the room, so the two sides can never
disagree about whose flag fell.

## The computer opponent

Three levels — gentle, steady and ruthless. It plays by Monte-Carlo tree
search: from the position in front of it, it plays out thousands of fast games
to the end and keeps the moves that tend to end well. On top of that sit a
solver, which proves outright wins and losses instead of sampling them, and a
learned policy that decides which moves are worth the first playouts. It
thinks in short slices so the page never freezes.

The policy's weights were learned from the engine's own games: the engine
plays itself, the search's own choices are the teaching signal, and each
generation is kept only if it beats the one before it over a match. That
learning is worth about 68% against the hand-written priors it replaced, and
the engine as it stands takes 89% against the plain search it started as.

Nine generations were trained and five were kept. Every number those runs
produced — the matches, the fitting curves, the self-play results and all 24
weights of every generation — is charted on the
[progress page](https://husaynyahya.github.io/noughtsandcrosses/progress.html).

How it was done is written up in
**[the report](https://husaynyahya.github.io/noughtsandcrosses/paper.html)** —
the same text as [PAPER.md](PAPER.md), as a page you can actually read in a
browser. To run the training again, see [train/](train/).

## Trying a line before you commit

**Try a line…** turns the board into a scratchpad. Play moves for both sides,
as far ahead as you like, and see how it would go; a banner and a green frame
make sure you never mistake it for the real game. **Back** takes one move off,
**Done** puts the position back exactly as it was, and **Play it** plays the
first move of your line for real.

Nothing is sent anywhere while you are trying a line: the computer does not
reply to it, and an online opponent sees none of it. Your clock keeps running,
because you are still thinking. If your opponent moves while you are mid-line,
the line is dropped and you are told why — better than leaving a scratchpad
standing on a position that no longer exists.

With the analysis board switched on, it reads each position in the line as you
play it, so you can see what the engine makes of where you are heading.

## Going back over a finished game

The engine keeps out of the way while you are playing. Nothing it thinks is
shown during a game — against the computer, against a friend, or across the
table — so there is nothing to lean on and nothing to accuse anybody of.

When the game ends, the review opens. Step through the moves with the arrows,
the left and right arrow keys, or by clicking any move in the list; the board
follows. At each position the engine says how it stood, what it would have
played, and the line it expected. **Try a line from here** branches off into
your own variation, with the engine's suggestion beside it to play out a move
at a time or all at once.

**Analyse the game** goes over every position in turn and marks the moves:
**?!** an inaccuracy, **?** a mistake, **??** a blunder, judged by what the
move did to the position rather than by whether it was the engine's choice.
Underneath, a graph of how the game stood move by move, with the mistakes
marked on it — click anywhere on it to jump there.

## Running it

It is a static page with no build step. Open `index.html`, or serve the folder:

```sh
python3 -m http.server 8000
```

To put it online, turn on GitHub Pages for this repository: **Settings → Pages →
Build and deployment → Deploy from a branch → `main` / root**. Online play needs
the page served over HTTPS (or localhost), which GitHub Pages does for you.

## Tests

```sh
node test/engine.test.js
```

Checks the rules — including the two the house variant turns on — that random
games always finish cleanly, that a position survives the trip across the
network, and that the computer takes a win when one is on offer.

## What is where

| File | What it does |
| --- | --- |
| `index.html` | The page |
| `assets/css/game.css` | All the styling; the design tokens are at the top |
| `assets/js/engine.js` | The rules. No DOM, no network |
| `assets/js/ai.js` | The search: Monte-Carlo tree search, in slices |
| `assets/js/analysis.js` | The analysis board: reading the search tree |
| `assets/js/net.js` | Private rooms, peer to peer |
| `assets/js/app.js` | Drawing the board and wiring the controls |
| `test/engine.test.js` | Rules tests |
