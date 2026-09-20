/* The server, on its own: two accounts, a game found, refereed and rated, and
   the book that remembers it. No browser involved — this is the protocol. */
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const DB = '/tmp/unc-servertest.db';
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { rmSync(f); } catch {} }

const port = 8099;
const server = spawn('node', ['server/index.js'],
  { env: { ...process.env, PORT: port, UNC_DB: DB }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', d => { const s = d.toString(); if (!/Experimental/.test(s)) process.stderr.write(s); });
await new Promise(r => setTimeout(r, 900));

const base = `http://127.0.0.1:${port}`;
let checks = 0, bad = 0;
const ok = (what, cond, extra = '') => {
  checks++; if (!cond) bad++;
  console.log((cond ? '  ok   ' : '  FAIL ') + what + (extra ? '  — ' + extra : ''));
};
const post = (path, body, token) => fetch(base + path, {
  method: 'POST', headers: { 'Content-Type': 'application/json',
    ...(token ? { Authorization: 'Bearer ' + token } : {}) },
  body: JSON.stringify(body)
}).then(async r => ({ status: r.status, body: await r.json() }));
const get = (path, token) => fetch(base + path,
  { headers: token ? { Authorization: 'Bearer ' + token } : {} })
  .then(async r => ({ status: r.status, body: await r.json() }));

/* ---- accounts ---------------------------------------------------------- */
const one = await post('/api/register', { name: 'ada', password: 'analytical-engine' });
const two = await post('/api/register', { name: 'linus', password: 'just-for-fun!' });
ok('two accounts made', one.status === 200 && two.status === 200, JSON.stringify(one.body.me?.name) + ' & ' + JSON.stringify(two.body.me?.name));
ok('the name is taken now', (await post('/api/register', { name: 'ADA', password: 'another-one' })).status === 409);
ok('a short password is refused', (await post('/api/register', { name: 'bob', password: 'short' })).status === 400);
ok('a silly name is refused', (await post('/api/register', { name: 'a b', password: 'long-enough-1' })).status === 400);
ok('the wrong password is refused', (await post('/api/login', { name: 'ada', password: 'nope-nope-nope' })).status === 401);
ok('the right one is not', (await post('/api/login', { name: 'ada', password: 'analytical-engine' })).status === 200);
ok('a token names its owner', (await get('/api/me', one.body.token)).body.me.name === 'ada');
ok('no token, no answer', (await get('/api/me')).status === 401);

/* ---- two players, one game --------------------------------------------- */
const talk = (token) => new Promise((done) => {
  const sock = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const seen = [];
  const waits = [];
  sock.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    seen.push(msg);
    waits.slice().forEach((w, i) => {
      if (w.test(msg)) { waits.splice(waits.indexOf(w), 1); w.done(msg); }
    });
  };
  sock.onopen = () => {
    sock.send(JSON.stringify({ t: 'hello', token }));
    done({
      send: (m) => sock.send(JSON.stringify(m)),
      seen,
      wait: (test, ms = 4000) => new Promise((resolve, reject) => {
        const hit = seen.find(test);
        if (hit) return resolve(hit);
        const w = { test, done: resolve };
        waits.push(w);
        setTimeout(() => reject(new Error('waited too long for ' + test)), ms);
      }),
      close: () => sock.close()
    });
  };
});

const A = await talk(one.body.token);
const B = await talk(two.body.token);
await A.wait(m => m.t === 'welcome');
await B.wait(m => m.t === 'welcome');
ok('both are in the lobby', (await A.wait(m => m.t === 'lobby' && m.players === 2)).players === 2);

A.send({ t: 'seek', tc: '0' });
await new Promise(r => setTimeout(r, 300));
const sawSeek = await B.wait(m => m.t === 'lobby' && m.seeks.length === 1);
ok('the offer is on the board', sawSeek.seeks[0].who.name === 'ada', sawSeek.seeks[0].tc);

B.send({ t: 'seek', tc: '0' });
const startA = await A.wait(m => m.t === 'start');
const startB = await B.wait(m => m.t === 'start');
ok('they are paired', startA.game.id === startB.game.id, 'game ' + startA.game.id);
ok('sides are dealt out', startA.game.you !== startB.game.you,
   'ada is ' + (startA.game.you === 1 ? 'crosses' : 'noughts'));

const gameId = startA.game.id;
const first = startA.game.you === 1 ? A : B;
const second = first === A ? B : A;

/* the server refuses what is not yours to do */
second.send({ t: 'move', game: gameId, move: 40 });
ok('a move out of turn is refused', (await second.wait(m => m.t === 'error')).why === 'Not your turn.');
first.send({ t: 'move', game: gameId, move: 999 });
ok('a move off the board is refused', (await first.wait(m => m.t === 'error' && m.why === 'Not a legal move.')).t === 'error');

/* play a real game out: whoever is to move picks a legal square. The rules
   come from the same file the page and the server use. */
const { readFileSync } = await import('node:fs');
const rules = (function () {
  const shelf = { window: undefined };
  new Function('globalThis', 'window', readFileSync('assets/js/engine.js', 'utf8'))(shelf, undefined);
  return shelf.UNC.engine;
})();

let state = rules.create();
let end = null;
A.send({ t: 'chat', game: gameId, text: 'good luck' });
ok('chat crosses', (await B.wait(m => m.t === 'chat')).text === 'good luck');

for (let i = 0; i < 90; i++) {
  const mover = state.turn === startA.game.you ? A : B;
  const legal = rules.legalMoves(state);
  const move = legal[Math.floor(Math.random() * legal.length)];
  mover.send({ t: 'move', game: gameId, move });
  rules.apply(state, move);
  const news = await mover.wait(m => (m.t === 'state' || m.t === 'end') &&
    m.game.moves.length === state.filled);
  if (news.t === 'end' || news.game.over) { end = news; break; }
  await new Promise(r => setTimeout(r, 12));
}
/* each side is told separately, and each is told its own numbers — so read
   both, rather than reading whichever arrived first twice */
const endA = await A.wait(m => m.t === 'end');
const endB = await B.wait(m => m.t === 'end');
ok('the game ended', !!endA && endA.game.over, endA.game.ending + ', winner ' + endA.game.winner);
ok('both were told the same', endA.game.winner === endB.game.winner);
ok('it was rated', endA.rated && endA.rating.change !== undefined,
   'ada ' + endA.rating.before + ' → ' + endA.rating.after);
ok('the points balance', endA.rating.change + endB.rating.change === 0,
   endA.rating.change + ' and ' + endB.rating.change);

/* ---- the book ------------------------------------------------------------ */
const ladder = await get('/api/leaderboard');
ok('the ladder has both', ladder.body.table.length === 2,
   ladder.body.table.map(r => r.name + ' ' + r.rating).join(', '));
const filed = await get('/api/game/' + gameId);
ok('the game is on file', filed.status === 200 && filed.body.game.plies === state.filled,
   filed.body.game.plies + ' moves, ' + filed.body.game.ending);
const mine = await get('/api/games?player=ada');
ok('and in her games', mine.body.games.length === 1);
const profile = await get('/api/players/ada');
ok('the profile adds up', profile.body.player.games === 1 &&
   profile.body.player.rating === endA.rating.after);

/* ---- coming back --------------------------------------------------------- */
A.send({ t: 'seek', tc: '300+3' });
await new Promise(r => setTimeout(r, 200));
A.close();
await new Promise(r => setTimeout(r, 600));
const after = await get('/api/health');
ok('a seek dies with its maker', after.body.online <= 2);

console.log(`\n${bad ? bad + ' of ' + checks + ' FAILED' : 'all ' + checks + ' checks passed'}`);
server.kill();
process.exit(bad ? 1 : 0);
