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

## Playing a friend by message

The way that needs nothing at all: no matchmaking service, no relay, no
connection between the two of you of any kind.

Pick **A friend, by message**. Make your move and the page gives you a short
code — three characters at the start of a game, under a hundred at the end of
a long one. Send it however you already send things. They paste it in, see your
move, reply, and send a code back.

The code carries the **whole game**, not just the last move, so the two of you
cannot drift apart: whatever arrives replays from the beginning, and a code
that could not have come from a real game is refused. There is a link version
too, if a tap is easier than a paste.

It works on any network, between any two devices, because nothing travels
except a message you sent yourself.

## Playing a friend online

Press **Make a code** and you get four words, such as
`copper-kestrel-amber-quartz`. **Copy invitation** puts a link and the code on
your clipboard. Both of you open the same code — the link, or the words typed
in — and the game starts. Neither of you has to be first.

**How it works, and why it changed.** The first version of this had the two
browsers talk straight to each other. That is the elegant way and it is the
wrong way: it asks both networks to let a stranger in, and plenty will not —
most mobile networks, and most offices, let you out and nothing in. No amount
of retrying fixes a network built to refuse.

So neither browser waits to be reached. Both reach **out** to a message
service, the same direction as loading a web page, which every network allows;
the service passes messages between the two outbound connections. Connecting
takes about a second.

The service sees nothing. The code never leaves the two browsers: the topic is
a hash of it, and every message is sealed with a key derived from it, so what
a public service carries is ciphertext under a meaningless name. Which of you
plays crosses is settled by both sides at once — each announces a random
number and the lower one goes first — so there is nothing to claim and nobody
to wait for.

**If even that is blocked**, there is *Connect by hand* underneath: the two
browsers are introduced by you passing two blocks of text between them, with
no service at all. And if live play is not worth the trouble, there is
[playing by message](#playing-a-friend-by-message), which needs nothing.

### A dropped connection does not cost you the game

A connection is not a safe place to keep a game, so the game is not kept
there. Both browsers write the whole game down as it is played, under the room
code; the room goes into the address bar, so a page that reloads itself — as
phones do to a tab that has been away — comes back into the same room and puts
the board back as it was. Which side you are playing is remembered with it: a
game under way keeps the sides it started with, however the connection settles
things afterwards.

When the two find each other again, they compare notes before anything is
overwritten. Each side's copy of the game carries a name and a length, and a
sync that has *lost* the game is never taken as the truth: the side that still
has it offers its copy back, and the other picks the game up where it was. A
board that was emptied on purpose says so, so pressing **New game** cannot be
undone by a message from the game before.

`node test/recover.mjs` is the proof: it drops the line for long enough that
both sides give up on each other, reloads a tab, and wipes everything one side
knows — and checks the game survives all three.

## Going back over a finished game

The engine keeps out of the way while you are playing. Nothing it thinks is
shown during a game — against the computer, against a friend, or across the
table — and neither is the scratchpad, so there is nothing to lean on and
nothing to accuse anybody of. Both belong to afterwards.

When the game ends, the review opens. Step through the moves with the arrows,
the left and right arrow keys, or by clicking any move in the list; the board
follows. At each position the engine says how it stood, what it would have
played, and the line it expected.

**Try a line from here…** turns the board into a scratchpad standing on the
position you are looking at. Play moves for both sides, as far ahead as you
like, and see how it would have gone; a banner and a green frame make sure you
never mistake it for the game that was played. The engine's own suggestion sits
beside it, to play out a move at a time or all at once, and it reads each
position of your line as you go. **Back** takes one move off, **Done** puts the
game back exactly as it was — the moves that were played are never touched.

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
