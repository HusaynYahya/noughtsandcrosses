/* Every page, opened in a real browser: no script errors, the chrome on all of
   them, and the pieces that matter actually on the screen. */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
await ctx.addInitScript(() => { window.UNC_BROKERS = ['ws://127.0.0.1:9004']; });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });

const say = (label, value) => console.log(label.padEnd(30, ' ') + ':', value);
const base = 'http://127.0.0.1:8777/';

const pages = [
  ['index.html', '[data-seeks-empty], [data-seeks-table]'],
  ['play.html', '.ubk .cell'],
  ['leaderboard.html', '[data-table] tr'],
  ['games.html', '[data-tiles] .tile'],
  ['profile.html', '[data-tiles] .tile'],
  ['learn.html', '.diagram'],
  ['account.html', '[data-form]'],
  ['paper.html', 'h1'],
  ['progress.html', 'h1']
];

for (const [page, must] of pages) {
  const before = errs.length;
  await p.goto(base + page);
  await p.waitForTimeout(700);
  const chrome = await p.locator('header.top .nav a').count();
  const found = await p.locator(must).count();
  const title = (await p.title()).slice(0, 40);
  say(page, `nav ${chrome} · ${must.split(',')[0]} ×${found} · "${title}"` +
      (errs.length > before ? ' · ERRORS' : ''));
}

// the front page really lists a game somebody ELSE is offering: a second
// browser, with its own player and its own record
await p.goto(base + 'index.html');
await p.waitForTimeout(500);
const ctx2 = await b.newContext({ viewport: { width: 1100, height: 900 } });
await ctx2.addInitScript(() => { window.UNC_BROKERS = ['ws://127.0.0.1:9004']; });
const other = await ctx2.newPage();
other.on('pageerror', e => errs.push('other: ' + e.message));
await other.goto(base + 'play.html?room=cedar-raven-opal-flint&tc=300%2B3&open=1&side=X');
await p.waitForTimeout(6000);
const seeks = await p.locator('[data-seeks] tr').count();
say('an offer reaches the lobby', seeks > 0 ? 'yes, ' + seeks + ' listed' : 'NO');
if (seeks) {
  say('what it says', (await p.locator('[data-seeks] tr').first().innerText()).replace(/\s+/g, ' '));
}

say('errors', errs.length ? errs.slice(0, 4).join(' | ') : 'none');
await b.close();
