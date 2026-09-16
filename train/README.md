# Training the engine

The engine's opinion of a move before it has tried it is a set of weights
learned from its own games. This folder is how those weights are made.

```sh
node train/run.js [generations] [self-play games] [playouts a move]
# e.g. node train/run.js 3 240 700
```

One generation is:

1. **`selfplay.js`** — the engine plays itself and writes down, for every
   position, how many playouts the search gave each legal move.
2. **`train.js`** — fits the weights so the model's probabilities match those
   visit counts, by cross-entropy with Adam. A tenth of the positions is held
   back to measure on.
3. **`evaluate.js`** — the new weights play the old ones over a match, colours
   alternating.
4. The new weights are adopted **only if they won**. A lower training loss is
   not the same as a better player, so the match decides.

The champion is written to `assets/js/weights.js`, which is the file the site
loads. Every generation is kept in `train/weights/`, with the score it took
against its parent, and `train/weights/history.json` records the run.

The games themselves land in `train/data/` and are not committed — they are
several megabytes a generation and can be made again at any time.

See [PAPER.md](../PAPER.md) for what the model is and how it works — or
[read it as a page](https://husaynyahya.github.io/noughtsandcrosses/paper.html).
After editing the markdown, rebuild that page with `node tools/build-paper.js`.
