/* A connection that drops, a tab that reloads, a phone that throws the page
   away — none of them should cost you the game. This plays a few moves, then
   takes the game away from each side in turn and checks it comes back. */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
const mk = async () => {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } });
  await ctx.addInitScript(() => { window.UNC_BROKERS = ['ws://127.0.0.1:9004']; });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  return p;
};
const A = await mk(), B = await mk();
const CODE = 'harbour-ember-cedar-raven';
const URL = 'http://127.0.0.1:8777/play.html?room=' + CODE + '#' + CODE;

const st = (p) => p.textContent('[data-net-status]').then(t => t.trim());
const marks = (p) => p.locator('.cell--x, .cell--o').count();
const side = (p) => p.textContent('[data-seat-note="home"]').then(t => t.trim());
/* the marks and which board is live — not the fading highlight on the move
   just played, which belongs to whoever saw it arrive */
const board = (p) => p.evaluate(() => [...document.querySelectorAll('.cell')]
  .map(c => c.className.replace(/\bcell--fresh\b/, '').trim()).join());
const say = (label, value) => console.log(label.padEnd(36, ' ') + ':', value);

async function settle(...pages) {
  for (let i = 0; i < 20; i++) {
    await pages[0].waitForTimeout(500);
    const all = await Promise.all(pages.map(st));
    if (all.every(t => t.startsWith('Connected'))) return true;
  }
  return false;
}

await Promise.all([A.goto(URL), B.goto(URL)]);
say('both connected', await settle(A, B));
const sides = { A: await side(A), B: await side(B) };
say('sides', 'A is ' + sides.A + ', B is ' + sides.B);

/* the host is whoever has crosses at the start (the seat note now carries a
   rating as well, so match on the word) */
const host = sides.A.indexOf('crosses') >= 0 ? A : B;
const guest = host === A ? B : A;
const name = (p) => (p === A ? 'A' : 'B');
say('the referee is', name(host));

/* six moves, back and forth */
let turn = host, off = guest;
for (let i = 0; i < 6; i++) {
  await turn.locator('.cell:not(:disabled)').first().click();
  await off.waitForTimeout(500);
  [turn, off] = [off, turn];
}
const played = await marks(host);
say('moves played', played + ' | both boards alike: ' + (await board(A) === await board(B)));

/* 1. the line goes down for long enough that each side gives the other up */
await guest.context().setOffline(true);
await guest.waitForTimeout(17000);
say('while the line is down', 'guest: ' + (await st(guest)) + ' | referee: ' + (await st(host)));
say('nothing lost meanwhile', (await marks(host)) + ' / ' + (await marks(guest)) + ' marks');
await guest.context().setOffline(false);
say('the line comes back', await settle(guest, host));
await guest.waitForTimeout(1500);
say('the game is still there', (await marks(host)) + ' / ' + (await marks(guest)) + ' marks');
say('and still the same board', await board(A) === await board(B));

/* 2. the guest's tab reloads — the usual phone-put-it-to-sleep case */
await guest.reload();
say('guest reloaded, connected again', await settle(guest, host));
await guest.waitForTimeout(1200);
say('guest still has the game', await marks(guest) + ' marks');
say('guest kept its side', await side(guest) === sides[name(guest)]);

/* 3. the referee loses everything — the case that used to wipe both boards */
await host.evaluate(() => localStorage.clear());
await host.reload();
say('referee wiped and reloaded', await settle(host, guest));
await host.waitForTimeout(2500);
say('referee got the game back', await marks(host) + ' marks (had ' + played + ')');
say('the guest was not emptied', await marks(guest) + ' marks');
say('both boards alike again', await board(A) === await board(B));
say('sides unchanged', await side(A) === sides.A && await side(B) === sides.B);

/* 4. and play carries on */
let next = (await host.locator('.cell:not(:disabled)').count()) ? host : guest;
let watcher = next === host ? guest : host;
await next.locator('.cell:not(:disabled)').first().click();
await watcher.waitForTimeout(900);
say('a move still crosses', await marks(watcher) + ' marks');

/* 5. a new game is a new game, and stays one */
await host.click('[data-new]');
await guest.waitForTimeout(1500);
say('new game empties both', (await marks(host)) + ' / ' + (await marks(guest)) + ' marks');
await guest.waitForTimeout(3000);
say('and the old game stays gone', (await marks(host)) + ' / ' + (await marks(guest)) + ' marks');

/* 6. the new game survives a reload too */
await guest.locator('.cell:not(:disabled)').first().click();
await host.waitForTimeout(600);
await guest.reload();
await settle(guest, host);
await guest.waitForTimeout(1200);
say('one move in, reloaded', (await marks(guest)) + ' / ' + (await marks(host)) + ' marks');

say('errors', errs.length ? errs.join(' | ') : 'none');
await b.close();
