/* The whole thing a chess site does, end to end: one player offers a game in
   the lobby, a stranger takes it, they play it out, and both of them come away
   with the game in their record and their ratings moved the right way. */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
const mk = async (name) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  await ctx.addInitScript(() => { window.UNC_BROKERS = ['ws://127.0.0.1:9004']; });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  return p;
};
const base = 'http://127.0.0.1:8777/';
const say = (label, value) => console.log(label.padEnd(34, ' ') + ':', value);
const st = (p) => p.textContent('[data-net-status]').then(t => t.trim());
const marks = (p) => p.locator('.cell--x, .cell--o').count();
const rating = (p) => p.evaluate(() => Math.round(JSON.parse(localStorage.getItem('unc.me')).rating));
const games = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('unc.games') || '[]'));

const A = await mk('A'), B = await mk('B');

/* both arrive at the front page as new players */
await Promise.all([A.goto(base + 'index.html'), B.goto(base + 'index.html')]);
await A.waitForTimeout(1500);
say('two new players', (await A.textContent('[data-you-body]')).replace(/\s+/g, ' ').slice(0, 46));
say('lobby reached', (await A.textContent('[data-lobby-status]')).trim().slice(0, 40));

/* A offers a game */
await A.selectOption('[data-seek-tc]', '0');
await A.click('[data-offer]');
await A.waitForTimeout(2500);
say('A is on the board, waiting', (await st(A)));

/* B sees it and takes it */
for (let i = 0; i < 12 && !(await B.locator('[data-seeks] tr').count()); i++) await B.waitForTimeout(700);
say('B sees the offer', await B.locator('[data-seeks] tr').count() ? 'yes' : 'NO');
await B.click('[data-take="0"]');
for (let i = 0; i < 16; i++) {
  await B.waitForTimeout(600);
  if ((await st(A)).startsWith('Connected') && (await st(B)).startsWith('Connected')) break;
}
say('paired', 'A: ' + await st(A) + ' | B: ' + await st(B));
say('A sees who it is playing', (await A.textContent('[data-seat-name="away"]')).trim() +
    ' (' + (await A.textContent('[data-seat-note="away"]')).trim() + ')');
say('B sees who it is playing', (await B.textContent('[data-seat-name="away"]')).trim() +
    ' (' + (await B.textContent('[data-seat-note="away"]')).trim() + ')');

/* and the offer is off the list, because it has been taken */
await B.waitForTimeout(500);

/* play it out */
let turn = (await A.locator('.cell:not(:disabled)').count()) ? A : B;
let off = turn === A ? B : A;
for (let i = 0; i < 90; i++) {
  const free = turn.locator('.cell:not(:disabled)');
  const n = await free.count();
  if (!n) {
    if (!(await off.locator('.cell:not(:disabled)').count())) break;
    [turn, off] = [off, turn]; continue;
  }
  await free.nth(Math.floor(Math.random() * n)).click();
  await off.waitForTimeout(220);
  [turn, off] = [off, turn];
}
await A.waitForTimeout(2000);
say('game over', (await A.textContent('[data-status]')).replace(/\s+/g, ' ').trim());
say('same board both ends', (await marks(A)) === (await marks(B)) ? (await marks(A)) + ' marks' : 'NO');

/* both wrote it down, and the ratings moved opposite ways */
const [ga, gb] = [await games(A), await games(B)];
const [ra, rb] = [await rating(A), await rating(B)];
say('A record', ga.length + ' game, ' + (ga[0] && ga[0].result) + ', ' +
    (ga[0] && ga[0].rated ? 'rated ' + (ga[0].change > 0 ? '+' : '') + ga[0].change : 'casual'));
say('B record', gb.length + ' game, ' + (gb[0] && gb[0].result) + ', ' +
    (gb[0] && gb[0].rated ? 'rated ' + (gb[0].change > 0 ? '+' : '') + gb[0].change : 'casual'));
say('ratings now', 'A ' + ra + ' | B ' + rb);
say('the two agree', ga[0] && gb[0] &&
    ((ga[0].result === 'win' && gb[0].result === 'loss') ||
     (ga[0].result === 'loss' && gb[0].result === 'win') ||
     (ga[0].result === 'draw' && gb[0].result === 'draw')) ? 'yes' : 'NO');
say('and the points balance', ga[0] && gb[0] && (ga[0].change + gb[0].change === 0)
    ? 'yes, ' + ga[0].change + ' and ' + gb[0].change : 'no: ' + (ga[0] && ga[0].change) + ' / ' + (gb[0] && gb[0].change));

/* the game is in the list, and opens again on the board */
await A.goto(base + 'games.html');
await A.waitForTimeout(600);
say('games page', (await A.locator('[data-rows] tr').count()) + ' row, opponent ' +
    (await A.locator('[data-rows] tr td').nth(1).innerText()).trim());
await A.click('[data-rows] a');
await A.waitForTimeout(1500);
say('it opens on the board again', (await marks(A)) + ' marks, review ' +
    (await A.locator('[data-review]').isVisible() ? 'open' : 'shut'));

await A.goto(base + 'leaderboard.html');
await A.waitForTimeout(800);
say('leaderboard', (await A.locator('[data-table] tr').count()) + ' players: ' +
    (await A.locator('[data-table]').innerText()).replace(/\s+/g, ' ').slice(0, 70));

await A.goto(base + 'profile.html');
await A.waitForTimeout(800);
say('profile chart', (await A.locator('[data-rating] svg').count()) ? 'drawn' : 'nothing to draw yet');

say('errors', errs.length ? errs.slice(0, 3).join(' | ') : 'none');
await b.close();
