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
your clipboard to send however you like. The other person opens the link, or
types the code into **Join**, and the game begins.

Either player can press **New game** for a rematch; sides swap each time, so
nobody keeps the advantage of going first.

There is no server behind the game and no account to make. The two browsers talk
to each other directly over WebRTC, so the moves never pass through anybody's
database, and nothing is stored when you close the tab. A public signalling
broker introduces the two browsers to each other — it sees the room code and
nothing else. Both players need the page open at the same time.

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
How it was done is written up in [PAPER.md](PAPER.md); to run the training
again, see [train/](train/).

## The analysis board

Switch it on and the search reads the position after every move and says three
things:

- **How it stands** — a bar, and a number: the chance each side ends up
  winning, as the search found it.
- **What to play** — the move it would choose, ringed on the board, with the
  next best alternatives and what each is worth.
- **How it goes on** — the line it expects: the move it examined most, then
  that move's most-examined reply, and on down.

It also marks the moves already played. A move is judged the way a chess site
judges one: how the position stood for you before you moved, against how it
stands for you after. Give ground and the move is marked **?!** for an
inaccuracy, **?** for a mistake, **??** for a blunder — and a move that ends a
game which was still alive is called a blunder whatever the arithmetic says,
because that is the moment worth pointing at.

The two readings come from separate searches, so a point or two of noise is
expected; the thresholds are set well clear of it. It is a search, not an
oracle: on a fresh position it is reading a few thousand playouts, and it will
sometimes change its mind.

Best left switched off while you are playing somebody.

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
