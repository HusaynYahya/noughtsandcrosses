/* The site with a server behind it: two people make accounts, meet in the
   lobby, and play a game the server referees — then the ladder, the games list
   and the profile all know about it. */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';

const DB = '/tmp/unc-sitetest.db';
for (const f of [DB, DB + '-wal', DB + '-shm']) { try { rmSync(f); } catch {} }
const PORT = 8098;
const server = spawn('node', ['server/index.js'],
  { env: { ...process.env, PORT: PORT, UNC_DB: DB }, stdio: ['ignore', 'pipe', 'pipe'] });
server.stderr.on('data', d => { const s = d.toString(); if (!/Experimental/.test(s)) process.stderr.write(s); });
await new Promise(r => setTimeout(r, 900));

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
const site = 'http://127.0.0.1:8777/';
const API = `http://127.0.0.1:${PORT}`;

const mk = async (tag) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  await ctx.addInitScript(([api]) => {
    window.UNC_SERVER = api;
    window.UNC_BROKERS = ['ws://127.0.0.1:9004'];
  }, [API]);
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(tag + ': ' + e.message));
  return p;
};
const say = (l, v) => console.log(l.padEnd(34, ' ') + ':', v);
const marks = (p) => p.locator('.cell--x, .cell--o').count();

const A = await mk('A'), B = await mk('B');

/* make two accounts through the page itself */
async function signUp(p, name, email, pass) {
  await p.goto(site + 'account.html');
  await p.waitForSelector('#name');
  await p.fill('#name', name);
  await p.fill('#email', email);
  await p.fill('#pass', pass);
  await p.click('[data-go]');
  await p.waitForSelector('[data-form] h1', { timeout: 8000 });
  await p.waitForTimeout(600);
  return (await p.textContent('[data-form] h1')).trim();
}
say('made on the page', await signUp(A, 'ada', 'ada@example.com', 'analytical-engine'));
say('and again', await signUp(B, 'linus', 'linus@example.com', 'just-for-fun!'));
await A.goto(site + 'index.html');
await B.goto(site + 'index.html');
await A.waitForTimeout(1200);
await B.waitForTimeout(1200);
say('the header knows who you are', (await A.textContent('.who')).replace(/\s+/g, ' ').trim());
say('the lobby is the server now', (await A.textContent('[data-lobby-name]')).trim());

/* wrong password, right password */
const ctxC = await mk('C');
await ctxC.goto(site + 'account.html?in');
await ctxC.waitForSelector('#name');
await ctxC.fill('#name', 'ada');
await ctxC.fill('#pass', 'not-the-password');
await ctxC.click('[data-go]');
await ctxC.waitForTimeout(1200);
say('a wrong password is refused', (await ctxC.textContent('[data-said]')).trim());
await ctxC.fill('#pass', 'analytical-engine');
await ctxC.click('[data-go]');
await ctxC.waitForTimeout(1500);
say('the right one is not', (await ctxC.textContent('[data-form] h1')).trim());

/* asking for a way back in gives nothing away either way */
const ctxD = await mk('D0');
await ctxD.goto(site + 'account.html?in');
await ctxD.waitForSelector('[data-to="forgot"]');
await ctxD.click('[data-to="forgot"]');
await ctxD.fill('#name', 'nobody@example.com');
await ctxD.click('[data-go]');
await ctxD.waitForTimeout(1200);
say('forgotten password', (await ctxD.textContent('[data-form]')).replace(/\s+/g, ' ').slice(0, 64));

/* A offers a game, B takes it */
await A.waitForTimeout(800);
await A.selectOption('[data-seek-tc]', '0');
await A.click('[data-offer]');
await B.waitForTimeout(1500);
say('B sees it on the server board', await B.locator('[data-seeks] tr').count() ? 'yes' : 'NO');
say('what B sees', (await B.locator('[data-seeks] tr').first().innerText()).replace(/\s+/g, ' '));

await B.click('[data-take="0"]');
await Promise.all([
  A.waitForURL(/play\.html\?g=/, { timeout: 15000 }),
  B.waitForURL(/play\.html\?g=/, { timeout: 15000 })
]);
await A.waitForTimeout(2000);
say('both are on the board', (await A.url()).split('?')[1] === (await B.url()).split('?')[1]
    ? 'in the same game' : 'DIFFERENT GAMES');
say('A is playing', (await A.textContent('[data-seat-name="away"]')).trim() +
    ' · ' + (await A.textContent('[data-seat-note="away"]')).trim());

/* play it out: only the side the server says is to move can move */
let turn = (await A.locator('.cell:not(:disabled)').count()) ? A : B;
let off = turn === A ? B : A;
for (let i = 0; i < 90; i++) {
  const free = turn.locator('.cell:not(:disabled)');
  if (!(await free.count())) {
    if (!(await off.locator('.cell:not(:disabled)').count())) break;
    [turn, off] = [off, turn];
    continue;
  }
  await free.nth(Math.floor(Math.random() * await free.count())).click();
  await off.waitForTimeout(260);
  [turn, off] = [off, turn];
}
await A.waitForTimeout(2500);
say('the game ended', (await A.textContent('[data-status]')).replace(/\s+/g, ' ').trim());
say('same board both ends', (await marks(A)) === (await marks(B)) ? (await marks(A)) + ' marks' : 'NO');
say('the rating change is shown', (await A.textContent('[data-review-intro]')).slice(0, 34));

/* the ladder, the games list and the profile */
await A.goto(site + 'leaderboard.html');
await A.waitForTimeout(1200);
say('the ladder', (await A.locator('[data-table]').innerText()).replace(/\s+/g, ' ').slice(0, 76));
say('and its tiles', (await A.locator('[data-tiles]').innerText()).replace(/\s+/g, ' ').slice(0, 60));

await A.goto(site + 'games.html');
await A.waitForTimeout(1200);
say('the games list', (await A.locator('[data-rows] tr').count()) + ' row from the server');

await A.goto(site + 'profile.html');
await A.waitForTimeout(1400);
say('the profile head', (await A.textContent('.profile__sub')).replace(/\s+/g, ' ').trim());
say('somebody else\'s profile', await (async () => {
  await A.goto(site + 'profile.html?player=linus');
  await A.waitForTimeout(1200);
  return (await A.textContent('.profile__card h1')).trim() + ' — ' +
         (await A.textContent('.profile__sub')).replace(/\s+/g, ' ').trim().slice(0, 40);
})());

/* the finished game has an address anybody can open */
const gameUrl = await B.url();
const D = await mk('D');
await D.goto(gameUrl);
await D.waitForTimeout(4200);
say('a finished game opens by link', (await marks(D)) + ' marks, ' +
    (await D.textContent('[data-net-status]')).replace(/\s+/g, ' ').trim().slice(0, 48));

/* somebody who walks out of a game can be claimed against */
const E1 = await mk('E'), F1 = await mk('F');
for (const [p, n] of [[E1, 'grace'], [F1, 'edsger']]) {
  await signUp(p, n, n + '@example.com', 'a-good-long-password');
  await p.goto(site + 'index.html');
  await p.waitForTimeout(1200);
}
await E1.selectOption('[data-seek-tc]', '0');
await E1.click('[data-offer]');
await F1.waitForTimeout(1500);
await F1.click('[data-take="0"]');
await Promise.all([E1.waitForURL(/play\.html\?g=/), F1.waitForURL(/play\.html\?g=/)]);
await E1.waitForTimeout(1500);
let mover = (await E1.locator('.cell:not(:disabled)').count()) ? E1 : F1;
let other = mover === E1 ? F1 : E1;
for (let i = 0; i < 6; i++) {
  await mover.locator('.cell:not(:disabled)').first().click();
  await other.waitForTimeout(260);
  [mover, other] = [other, mover];
}
await F1.close();
await E1.waitForTimeout(2000);
say('the board notices they left', await E1.locator('[data-claim-row]').isVisible()
    ? (await E1.textContent('[data-claim-text]')).trim() : 'NO');
say('claiming waits a minute', await E1.locator('[data-claim]').isDisabled()
    ? (await E1.textContent('[data-claim]')).trim() : 'claimable already');

say('errors', errs.length ? errs.slice(0, 3).join(' | ') : 'none');
await b.close();
server.kill();
