# Learning to play ultimate noughts and crosses

**A linear policy, trained on its own search, inside a Monte-Carlo tree search**

*A report on the engine behind [this game](https://husaynyahya.github.io/noughtsandcrosses/).
Everything described here runs in a browser tab, in about 25 KB of JavaScript,
with no server and no dependencies.*

---

## Abstract

The engine plays ultimate noughts and crosses by Monte-Carlo tree search. This
report describes how the part of that search which decides *what to look at
first* was replaced by a model learned from the engine's own games, and what
that was worth over the board.

The model is a **linear softmax policy** over 24 hand-designed features of a
move, trained by **policy iteration**: the engine plays itself, the number of
playouts the search gave each move is taken as the teaching signal, and the
weights are fitted to reproduce that distribution by cross-entropy loss with
Adam. Each generation must beat its parent over a match before it is adopted.

Two findings are worth stating at the front, because both cut against the
obvious expectation. First, **a better search is not the same as a stronger
engine**: an early version won 67.5% of games at equal playouts and only 52.5%
at equal time, because the extra thinking cost more than it bought. Second,
**a lower training loss is not the same as better play**, which is why every
generation is gated on a match rather than on the loss curve.

---

## 1. The game

Nine small boards sit in one big three-by-three. The square you take inside a
small board decides which small board your opponent must play in next. Win
three small boards in a row and you win the game.

This version plays a variant on two points, both of which lengthen the game
and make it sharper: a small board that has been won **may still be played
in** while it has empty squares — its result never changes, but the squares
still steer where the opponent goes — and only a board that is **completely
full** frees the opponent to play wherever they like.

What makes it hard for a computer is the shape of the tree rather than its
size. The opening move has 81 replies, but most moves have exactly nine, and
the position is dominated by a single question: *where does this send them?*
A move that wins a small board and hands the opponent the board they needed is
worse than a quiet move that gives them nothing. Material, the anchor of chess
evaluation, does not exist here. What exists is tempo and the geography of
where the next move must fall.

## 2. The search

The engine is a Monte-Carlo tree search. From the position in front of it, it
repeatedly walks down the tree it has built so far, adds a position to it,
plays a fast random-ish game to the end from there, and carries the result
back up. Moves that tend to end in wins get walked more often, and the move
walked most often is the one it plays.

Three things sit on top of the plain algorithm. They are worth naming
separately because the measurements later depend on which of them is in play.

**Playout policy.** The random games are not quite random. A player takes a
small board when one is going, blocks one when it is not, and never plays a
move that loses the game there and then.

**A solver.** Guessing is wasteful when the answer can be known. A move that
wins outright is marked *won*; a move that hands the opponent a win they
cannot miss is marked *lost*; a position whose every reply is winning for the
opponent is itself *lost*. These verdicts are exact, carried up the tree, and
proven branches are then taken or avoided outright rather than sampled.

**A policy.** Before a position's moves have been tried, something has to
decide which of them deserve the first playouts. That something is the model
this report is about.

## 3. Why the model is small

The obvious thing to reach for is a neural network. It is the wrong reach
here, and the reason is arithmetic rather than taste.

The search asks the policy a question every time it opens a new position —
hundreds of thousands of times in a single move of a single game. The answer
is only worth having if it costs less than the playouts it saves. A 24-feature
dot product is 24 multiply-adds, on the order of tens of nanoseconds. A small
multi-layer network with one hidden layer of 64 units is roughly 3,000
multiply-adds for the same answer, before any framework overhead, and it must
run in a browser tab on whatever device the person happens to have.

The measurements in section 6 make the trade concrete: an engine with a
better-informed but more expensive search won two games in three at equal
playouts and barely broke even at equal time. Anything that slows the search
down has to earn its place twice over. A linear model is what fits inside that
budget, it fits in a few hundred bytes, and it has the incidental virtue of
being readable — the learned weights can be printed and argued with, which is
how section 6.4 checks that the model learned the game rather than an artefact
of the training set.

## 4. The model

### 4.1 What the model sees

A move is described by 24 numbers. They fall into four groups.

**What the move does here** — whether it wins the small board, whether that
wins the whole game, whether it takes the square the opponent needed, whether
it creates a fresh pair with the third square still open.

**Where it sends them** — whether the board it sends them to is one they can
win at once, whether winning that board would win them the game, whether the
board is full (so they may go anywhere), whether it is already decided, and
whether it sends them back into the board just played in.

**Geography** — centre and corner, for both the square and the board; how many
lines are still open to each side in that board; whether the board is already
won, lost or dead.

**How far along the game is** — the fraction of squares filled, on its own and
multiplied by three of the sharper features, so the model can learn that the
same fact means different things in the opening and the endgame.

### 4.2 From features to a probability

Each move's features are scored by a single weight vector, and the scores of
the legal moves in a position are turned into probabilities by a softmax:

```
    z(m) = w · f(m)
    P(m) = exp(z(m)) / Σ exp(z(m'))     over the legal moves m'
```

This is multinomial logistic regression over moves, with one shared weight
vector rather than one per class — the same structure as the policy head of an
AlphaZero-style engine, with the network replaced by a dot product.

### 4.3 How the search uses it

The search picks its way down the tree with a PUCT rule. At each node it takes
the child maximising

```
    Q(m)  +  c · P(m) · √N / (1 + n(m))
```

where `Q(m)` is the average result of the playouts through that move, `n(m)`
is how many there have been, `N` is the total at the node, `P(m)` is the
model's probability, and `c` (1.8 here) sets how long the model's opinion
holds out against evidence. Early on the second term dominates and the search
follows the model; as playouts accumulate the first term takes over and the
model is overruled by what actually happened. The model never vetoes anything;
it decides what gets looked at first.

## 5. Training

### 5.1 Where the data comes from

The engine plays itself. For every position, the search is run and **the
number of playouts each move received** is recorded alongside the position.
Those counts, normalised, are the target distribution.

Using visit counts rather than the single best move matters: the counts carry
how close the decision was. A position where one move took 90% of the playouts
teaches something quite different from one where three moves split them
evenly, and a model trained only on the winner would be taught to be certain
about positions the search found difficult.

For the first twelve plies the move actually played is drawn *in proportion*
to the visit counts instead of being the most-visited one. Without that the
engine plays nearly the same game every time and the model sees one narrow
line of positions over and over.

### 5.2 The fit

Cross-entropy between the model's distribution and the search's, which for a
softmax gives the plainest gradient in machine learning: for each move, the
difference between what the model said and what the search said, times that
move's features.

```
    ∂L/∂w = Σ_m ( P(m) − T(m) ) · f(m)
```

Adam (lr 0.05, β₁ 0.9, β₂ 0.999), minibatches of 64, a ridge penalty of 1e-4
to stop weights running away on features that fire rarely, twelve passes over
the data. A tenth of the positions is held back and never fitted on, so the
loss quoted is on positions the fitting never saw.

### 5.3 The gate

A new generation is adopted **only if it beats its parent over a match**. This
is the part that is easy to leave out and expensive to leave out. Fitting a
model to its teacher's choices reliably lowers the training loss; it does not
reliably produce a better player. The loss measures agreement with a noisy
teacher, and agreement with a noisy teacher can be improved by copying its
noise. The match is the only measurement that answers the question actually
being asked.

## 6. Results

Every match below alternates colours, so neither engine gets the first move
more often. Scores count a draw as half a point. Matches of this length are
noisy: with 60 games the standard error on a score is about 6 percentage
points, so differences smaller than roughly 12 points should be read as "no
clear difference". Where a result matters, the match was run longer.

### 6.1 The search, before any learning

The starting point was a plain MCTS with uniform random playouts and a
hand-written prior. Adding the playout policy and the solver to it produced an
engine that was clearly better *per playout* and barely better *per second*:

| engine | measure | result |
| --- | --- | --- |
| playout policy + solver, hand-set priors | equal playouts (2,000 a move, 40 games) | **67.5%** |
| the same | equal time (60 ms a move, 40 games) | 52.5% |
| the same, after two rounds of optimisation | equal time (60 ms a move, 60 games) | **62.5%** |

Throughput, measured on a midgame position, tells the story behind those two
numbers:

| version | playouts per second |
| --- | --- |
| plain MCTS, uniform playouts | 71,000 |
| first improved playout policy | 32,000 |
| after a lookup table and removing allocation | 46,000 |
| with the learned policy and PUCT selection | 43,000 |

The first improved policy was better per playout and worse per second by more
than it was better, which is exactly the trade section 3 warns about. Only
after the cost came back down did the quality show up on the scoreboard.

### 6.2 The generations

Nine generations were run — the numbers below, and the charts on the
[progress page](https://husaynyahya.github.io/noughtsandcrosses/progress.html),
are the whole record. 240 self-play games each at 700 playouts a move,
roughly 15,000 recorded positions per generation, twelve training epochs, and
a 60-game gating match against the reigning champion. Five were adopted and
four were thrown away.

| generation | learned from | match against champion | kept |
| --- | --- | --- | --- |
| 1 | gen 0 | **67.5%** | yes |
| 2 | gen 1 | 51.7% | no |
| 3 | gen 1 | **57.5%** | yes |
| 4 | gen 3 | 50.0% | no |
| 5 | gen 3 | **58.3%** | yes |
| 6 | gen 5 | 44.2% | no |
| 7 | gen 5 | **53.3%** | yes |
| 8 | gen 7 | **53.3%** | yes |
| 9 | gen 8 | 48.3% | no |

Two things stand out. The gains shrink — 67.5%, then 57.5, 58.3, 53.3, 53.3 —
which is what a model approaching its ceiling looks like: the first generation
had a hand-written starting point to beat, and each one after it had a better
opponent. And **nearly half the generations were failures**. Generation 2 had
the best training numbers of the whole run — the lowest held-out loss and the
highest agreement with its teacher — and could not beat the weights it was
meant to improve on. Generation 6 was worse still, losing its match outright at
44.2%.

Without the gate, four of those nine would have been shipped, at least two of
them making the engine weaker. Training against your own search is a noisy
business, and the loss curve cannot tell you which side of the noise you landed
on.

### 6.3 What the learning was worth

The learned policy against the hand-set priors it replaced, both inside the
same search, at the same number of playouts:

> **68.0%** — 58 wins, 22 losses, 20 draws over 100 games (±9 points, 95%)
> — about +130 Elo.

Every generation was then played against generation 0 directly, 50 games each,
to see the shape of the improvement rather than only the last step of it:

| generation | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| against gen 0 | 52% | 58% | 65% | 76% | 63% | 72% | 75% | **67%** | 69% |
| kept by its gate | yes | no | yes | no | yes | no | yes | **yes** | no |

The trend is real and the ordering is not. Two generations their own gate threw
away — 4 and 6 — score higher here than the champion, and generation 1, which
won its gate 67.5%, manages only 52% in this one. Both matches are of the same
pair at the same budget, and they disagree by fifteen points.

### 6.3.1 The playoff

That disagreement is the instrument, not the engine. At 50 games the 95%
interval on a score is about ±14 points, so nearly every number in that row is
consistent with nearly every other. To find out whether the top few generations
actually differed, they were played again at 200 games:

| match | result |
| --- | --- |
| gen 4 v gen 7 | 49.5% — level |
| gen 4 v gen 8 | 43.3% — **gen 8 ahead** |
| gen 7 v gen 8 | 48.0% — level |

The champion held. Generation 4, which looked like the strongest engine in the
run on a 50-game sample, loses to the shipped champion over 200. Nothing was
re-shipped; the short matches had simply been telling a story about their own
noise.

And the engine as shipped — playout policy, solver and learned policy together
— against the plain MCTS it started as, at equal time:

> **89.0%** — 86 wins, 8 losses, 6 draws over 100 games (±6 points, 95%)
> — about +360 Elo.

### 6.4 What it learned

The weights are readable, which is the compensation for the model being
simple. Sorted by size, with the phase interactions read alongside the plain
feature they modify:

| what the model notices | weight | × how far along |
| --- | --- | --- |
| wins the small board | **+3.64** | **−2.65** |
| sends them somewhere they can win | **−1.98** | **+2.53** |
| blocks their small board | +1.35 | |
| sends them to the board that wins them the game | −1.29 | |
| sends them to a board already decided | **+1.03** | |
| makes a fresh pair | +0.92 | |
| gives them a free move | −0.66 | +0.72 |
| wins the game | +0.62 | |
| centre square | −0.29 | |

Three of these are worth dwelling on.

**Winning a small board is an opening move.** The weight is large and positive,
and the phase interaction nearly cancels it by the end of the game. The model
decided on its own that taking boards early builds the structure that decides
the game, and that taking them late is often just a move.

**Sending the opponent somewhere they can win is a disaster early and merely a
nuisance late** — again the phase term nearly cancels the plain one. By the
endgame many boards are already settled, and the cost of giving one away has
largely been paid already.

**Sending them into a board that is already decided is good.** This one is
specific to the house rules, and I did not put it there. A board that has been
won can still be played in, but its result cannot change — so a move that
forces the opponent into one makes them spend a turn on a square that cannot
matter. The model found that in its own games. The negative weight on the
centre square is the same idea seen from the other end: taking the middle of a
board sends the opponent to the middle board, which is the best board to be
sent to.

## 7. What did not work, and what nearly hid

### 7.1 A bug the unit tests passed straight over

The solver was written with its perspective inverted. A child node's verdict
belongs to the player who *moved into* it, which is the player choosing at the
node above; the code treated a proven win for that player as a reason to avoid
the move. The search was therefore steering deliberately into positions it had
just proved it lost.

Every unit test passed. The rules tests passed, because the rules were not
wrong. The solver's own test passed, because it only checked that a
mate-in-one was found — and it was, by the ordinary statistics, with the
solver's contribution merely wasted. What caught it was playing the new engine
against the old one: **0 wins in 40 games**. A result that lopsided is not a
weaker engine, it is a broken one, and the match was the only test that asked
the question plainly enough to notice.

The lesson is not "write more unit tests". It is that a search engine has one
honest measurement — games against another engine — and everything else is a
proxy that can agree with a bug.

### 7.2 Making the search cleverer made it slower

Each improvement to the playout policy bought better information per playout
and cost playouts per second. The first version of the policy was reasonable
and expensive: it more than halved throughput, and at equal time the engine
that "knew more" was no better than the one it replaced. It took two rounds of
optimisation — a lookup table for "could this line be finished in one?", and
replacing three temporary arrays with reservoir sampling — to buy the quality
back at an acceptable price.

Anyone tempted to put a neural network in the priors should price it against
this. The policy here costs about as much as thirty playouts; a small network
would cost hundreds, and it would have to be that much wiser to break even.

### 7.3 The loss curve is not the scoreboard

Training flattened after a single epoch. Held-out loss moved from 1.5625 to
1.5338 and then wandered sideways for eleven more epochs — a linear model on
24 features saturates almost at once. Judged on the loss curve alone, the
whole exercise looks marginal.

Judged over the board it was not marginal at all. The same weights that barely
moved the loss changed the search's opening choices enough to win two games in
three against the hand-set weights they replaced. Cross-entropy against a noisy
teacher and strength against an opponent are different quantities, and only one
of them is the point.

### 7.4 The model quietly forgot the most decisive feature

After training, the weight on *wins the game* — by far the most important
thing a move can do — had collapsed from 6.0 to near zero.

This is not as alarming as it looks, and the reason is instructive. Positions
where a game-winning move is available are rare in the training data, and in
those positions the solver has already proven the move won, so the search does
not need the policy's opinion. The gradient therefore has almost nothing to say
about that weight, and the ridge penalty pulls it towards zero.

The model did not learn that winning does not matter. It learned that the
question is never asked of it. That is a sound division of labour with a solver
in the engine — and a trap for anyone who removes the solver later and assumes
the policy will cover for it.

### 7.5 The gate is only as good as the match behind it

Section 5.3 argues for gating a generation on a match rather than on the loss
curve, and that argument stands. What the ladder exposed is that the gate used
here — 60 games — is a much blunter instrument than it looks. At 60 games the
95% interval is about ±13 points, and the real differences between consecutive
generations are worth perhaps 5. Nearly half the gating decisions in this run
were therefore close to coin tosses, and two of the generations thrown away may
well have been fine.

The 200-game playoff says the shipped champion is not worse than the
generations rejected around it, so the outcome survived. That is luck as much
as method. A run that wanted its ordering to mean something would need matches
of several hundred games at each gate, which for this engine is minutes rather
than seconds — affordable, and the first thing I would change.

The general form of the mistake is worth naming, because it is not specific to
games: **a selection procedure inherits the noise of its measurement.** Picking
the best of nine candidates on a noisy metric mostly selects for a lucky
measurement, and the more candidates there are, the more thoroughly the winner
is chosen by its luck.

## 8. What would help next

- **A value model to cut the playouts short.** Every playout runs to the end of
  the game. A cheap estimate of who stands better, applied twenty or thirty
  moves in, would let the same second buy several times as many samples. This
  is the single largest gain still on the table.
- **Reusing the tree between moves.** The search currently throws away
  everything it learned as soon as a move is played, and rebuilds from nothing.
- **Running the search off the main thread.** In a worker it would not need to
  stop every twelve milliseconds to let the page draw.
- **Longer gating matches.** See 7.5: the gate needs several hundred games per
  decision, not sixty, before the ordering of generations means anything.
- **More self-play, and more of it per generation.** These generations are 240
  games each. The gains per generation were still positive when the run
  stopped, though clearly shrinking.
- **Feature crosses, or a small network, once a value model exists.** The
  linear policy will have a ceiling. It has not obviously been reached yet.

## 9. Doing it again

```sh
node train/run.js 3 240 700     # three generations, 240 self-play games each
node train/evaluate.js train/weights/gen-3.json train/weights/gen-0.json 100 600
node test/engine.test.js        # the rules, and that the solver proves what it claims
```

Every generation's weights are kept in `train/weights/`, each recording the
score it took against its parent and whether it was adopted. The champion is
written to `assets/js/weights.js`, which is the file the browser loads.

---

*The engine, the training scripts and this report are in
[HusaynYahya/noughtsandcrosses](https://github.com/HusaynYahya/noughtsandcrosses).*
