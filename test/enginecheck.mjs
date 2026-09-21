import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await (await b.newContext({ viewport: { width: 1280, height: 950 } })).newPage();
const errs = [];
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
await p.goto('http://127.0.0.1:8777/play.html?mode=computer');
await p.waitForTimeout(800);
const loaded = await p.evaluate(() => ({
  value: !!(window.UNC.value), weights: !!(window.UNC.valueWeights),
  positions: window.UNC.valueWeights && window.UNC.valueWeights.positions
}));
console.log('engine pieces loaded:', JSON.stringify(loaded));
// play six moves against it and time its replies
for (let i = 0; i < 6; i++) {
  const free = p.locator('.cell:not(:disabled)');
  if (!(await free.count())) break;
  const t0 = Date.now();
  await free.first().click();
  await p.waitForTimeout(200);
  await p.waitForFunction(() => !document.querySelector('.ubk').classList.contains('is-thinking'), { timeout: 15000 });
  if (i === 0 || i === 5) console.log('move', i + 1, 'round trip', Date.now() - t0, 'ms');
}
console.log('marks on the board:', await p.locator('.cell--x, .cell--o').count());
console.log('status:', (await p.textContent('[data-status]')).replace(/\s+/g, ' ').trim());
console.log('errors:', errs.length ? errs.slice(0, 3) : 'none');
await b.close();
