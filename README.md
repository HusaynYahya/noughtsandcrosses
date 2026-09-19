# Ultimate noughts and crosses

Nine small boards inside one big one. The square you take decides which board
your opponent has to play in next. Win three small boards in a row to win the
game.

Play a stranger from the lobby, a friend in a private room, the engine that
taught itself, or somebody sitting next to you. Games are rated, kept, and can
be gone over move by move afterwards.

**There is no server.** Every page here is a static file; the whole site works
by two browsers reaching out to a public message service and talking through
it. That buys real live play and real matchmaking with nothing to run and
nothing to pay for — and it sets one honest limit, which the
[leaderboard](#the-leaderboard-and-what-a-rating-means-here) section spells out.

## The pages

| Page | What it is for |
| --- | --- |
| `index.html` | The lobby: who is waiting for a game, offer one, open a private room, your last games |
| `play.html` | The board, the clock, the chat, the move list and the review |
| `leaderboard.html` | The rating table — you and everybody you have played |
| `games.html` | Every game you have finished, openable on the board again |
| `profile.html` | Your rating drawn game by game, your record, and your name |
| `learn.html` | The rules, the notation, and what to aim for |
| `paper.html`, `progress.html` | How the engine taught itself, written up, with the training charts |

## Finding a game

Press **Find an opponent** on the front page. If somebody is already waiting,
you are put straight into their room; if nobody is, you are put on the board
with your offer standing in the lobby until somebody takes it.

The lobby is one public topic on the same message service the games run over.
While you are waiting, it carries your name, your rating, the clock you asked
for and the room code — that is what lets a stranger walk in. Nothing else of
yours goes near it: **private rooms never appear in the lobby**, they have their
own hashed topic and their own key, and you are only in the lobby while a page
of yours is open on it.

## The leaderboard, and what a rating means here

Ratings are ordinary chess Elo. Everybody starts at 1200; after a rated game
your rating moves by `K × (what you scored − what you were expected to score)`,
with K at 40 while a rating is new, 24 once it has settled and 16 above 2100.
Both browsers run the same arithmetic on the same two numbers, so the two sides
agree without anybody being asked, and the points one player gains are exactly
the points the other loses.

What no server means, said plainly: **the table is your own circle, not a world
ladder.** Each browser keeps its own book. Two people who play each other write
the same result into both books, so what you see of somebody you have played is
real — but nobody polices it, a rating cannot be proved to a third party, and
clearing your site data starts you at 1200 again. Games against the engine, by
message, or across one table are kept but never rated.

## Your record

Every finished game is written down here: the moves, who it was against, how it
ended and what it did to your rating. The games page can put any of them back
on the board with the engine's review, and can copy the lot out as text — it is
your record, and it should not be trapped in one browser.

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
| `index.html` … `learn.html` | The pages, one file each |
| `assets/css/site.css` | The design tokens, the chrome and the shared pieces — retune the site here |
| `assets/css/game.css` | The board and the things beside it |
| `assets/js/engine.js` | The rules. No DOM, no network |
| `assets/js/ai.js` | The search: Monte-Carlo tree search, in slices |
| `assets/js/analysis.js` | The analysis board: reading the search tree |
| `assets/js/live.js` | Live play: reaching out to a message service |
| `assets/js/lobby.js` | The lobby: presence and open offers on one public topic |
| `assets/js/net.js` | Private rooms by hand, and the word codes |
| `assets/js/player.js` | Who you are, and the Elo arithmetic |
| `assets/js/archive.js` | Every game you have finished |
| `assets/js/site.js` | The header and foot, and the small shared helpers |
| `assets/js/app.js` | The board page: drawing it and wiring the controls |
| `assets/js/home.js`, `leaderboard.js`, `games.js`, `profile.js` | A page each |
| `test/engine.test.js` | Rules tests |
| `test/pages.mjs`, `test/matchmaking.mjs` | Every page opens; a game found in the lobby, played and rated |
