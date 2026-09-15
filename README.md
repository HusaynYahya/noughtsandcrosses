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

Optional, and off until you choose it: bullet, blitz and rapid presets, or set
your own minutes and increment. The clock does not start until the first move,
each move adds the increment, and taking a move back puts the clock back too.
Run out of time and you lose the game, as at chess. In an online game the clock
belongs to whoever opened the room, so the two sides can never disagree about
it.

## The computer opponent

Three levels — gentle, steady and ruthless. It uses Monte-Carlo tree search:
it plays out thousands of random games from the position in front of it and
keeps the moves that tend to end well. It thinks in short slices so the page
never freezes, and it is given between 0.4 and 2.2 seconds depending on the
level.

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
| `assets/js/ai.js` | The computer opponent |
| `assets/js/net.js` | Private rooms, peer to peer |
| `assets/js/app.js` | Drawing the board and wiring the controls |
| `test/engine.test.js` | Rules tests |
