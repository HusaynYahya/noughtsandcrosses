/* The engine and the scratchpad belong to the look back, not to the game.
   This plays a whole game on one device, then checks that "try a line" only
   appears once it is over — and that trying one leaves the game alone. */
import { chromium } from 'playwright';

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({ viewport: { width: 1200, height: 950 } })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
await p.goto('http://127.0.0.1:8777/index.html');
await p.selectOption('[data-mode]', 'local');
await p.waitForTimeout(200);

const shown = (sel) => p.locator(sel).isVisible();
const say = (label, value) => console.log(label.padEnd(34, ' ') + ':', value);

say('during play, try a line offered', await shown('[data-explore-start]'));
say('during play, engine offered', await shown('[data-an-body]'));

/* play the thing out */
let n = 0, midway = null;
for (; n < 120; n++) {
  const free = await p.locator('.cell:not(:disabled)').count();
  if (!free) break;
  await p.locator('.cell:not(:disabled)').nth(Math.floor(Math.random() * free)).click();
  if (n === 20) midway = await shown('[data-explore-start]');
}
await p.waitForTimeout(1600);                       /* the look back opens itself */
const played = await p.locator('.mv__x, .mv__o').evaluateAll(
  els => els.filter(e => e.textContent.trim()).length);
say('game played out, moves', played + ' (' + n + ' clicks)');
say('twenty moves in, still hidden', midway === false);

say('afterwards, review open', await shown('[data-review]'));
say('afterwards, try a line offered', await shown('[data-explore-start]'));
say('at the final position, disabled', await p.locator('[data-explore]').isDisabled());
say('the commit button is gone', await p.locator('[data-explore-commit]').count() === 0);

/* step back and branch off */
for (let i = 0; i < 6; i++) await p.click('[data-nav="prev"]');
await p.waitForTimeout(200);
const at = (await p.textContent('[data-nav-label]')).trim();
say('stepped back to', at);
say('now the button is live', !(await p.locator('[data-explore]').isDisabled()));

await p.click('[data-explore]');
await p.waitForTimeout(300);
say('scratchpad open', await shown('[data-explore-controls]'));
say('the game controls stand aside', !(await shown('[data-play-controls]')));
say('the board says so', (await p.textContent('[data-explore-flag]')).trim());

for (let i = 0; i < 3; i++) {
  const free = await p.locator('.cell:not(:disabled)').count();
  if (!free) break;
  await p.locator('.cell:not(:disabled)').first().click();
  await p.waitForTimeout(120);
}
await p.waitForTimeout(400);
say('moves made in the line', (await p.textContent('[data-explore-count]')).trim());
say('the list marks them as a line', await p.locator('.mv--var').count() > 0);
say('the engine reads the line', (await p.textContent('[data-an-pv]')).trim().slice(0, 40));

/* Back takes one off, and leaves the game underneath alone */
await p.click('[data-explore-back]');
await p.waitForTimeout(300);
say('after Back', (await p.textContent('[data-explore-count]')).trim());
const inLine = () => p.locator('.mv__var').evaluateAll(
  els => els.filter(e => e.textContent.trim()).length);
say('the list shows two, not three', await inLine() === 2);

/* the engine's own suggestion can be played out */
await p.waitForTimeout(1200);                       /* let it read the position */
say('the engine has a line again', (await p.textContent('[data-engine-moves]')).trim().slice(0, 30));
await p.click('[data-engine-step]');
await p.waitForTimeout(400);
say('after the engine\'s next move', (await p.textContent('[data-explore-count]')).trim());

await p.click('[data-explore-done]');
await p.waitForTimeout(400);
const after = await p.locator('.mv__x, .mv__o').evaluateAll(
  els => els.filter(e => e.textContent.trim()).length);
say('the game is as it was', after === played ? 'yes, ' + after + ' moves' : 'NO: ' + after);
say('back where the review was', (await p.textContent('[data-nav-label]')).trim() === at);
say('no line left in the list', await p.locator('.mv--var').count() === 0);

/* and a new game puts it away again */
await p.click('[data-new]');
await p.waitForTimeout(300);
say('new game, try a line offered', await shown('[data-explore-start]'));
say('new game, engine offered', await shown('[data-an-body]'));

say('page errors', errs.length ? errs.join(' | ') : 'none');
await b.close();
