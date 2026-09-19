import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
const A = await (await b.newContext({ viewport: { width: 1200, height: 950 } })).newPage();
const B = await (await b.newContext({ viewport: { width: 1200, height: 950 } })).newPage();
for (const q of [A, B]) {
  q.on('pageerror', e => errs.push(e.message));
  await q.goto('http://127.0.0.1:8777/index.html');
  await q.selectOption('[data-mode]', 'post');
}
// a whole game, passing codes back and forth like messages
let turn = A, other = B, moves = 0, longest = 0;
for (let i = 0; i < 100; i++) {
  const free = turn.locator('.cell:not(:disabled)');
  const n = await free.count();
  if (!n) break;
  await free.nth(Math.floor(Math.random() * n)).click();
  await turn.waitForTimeout(90);
  moves++;
  const code = await turn.inputValue('[data-post-out]');
  longest = Math.max(longest, code.length);
  await other.fill('[data-post-in]', code);
  await other.click('[data-post-use]');
  await other.waitForTimeout(120);
  if (await turn.evaluate(() => !!document.querySelector('.status.is-over'))) break;
  [turn, other] = [other, turn];
}
const result = (await A.textContent('[data-status-text]')).trim();
console.log('a whole game by message:', moves, 'moves passed back and forth');
console.log('longest code           :', longest, 'characters');
console.log('A sees                 :', result);
console.log('B sees                 :', (await B.textContent('[data-status-text]')).trim());
console.log('same board both ends   :',
  (await A.evaluate(() => [...document.querySelectorAll('.cell')].map(c => c.className).join())) ===
  (await B.evaluate(() => [...document.querySelectorAll('.cell')].map(c => c.className).join())));
console.log('review offered at end  :', await A.locator('[data-review]').isVisible());
console.log('errors                 :', errs.length ? errs : 'none');
await A.screenshot({ path: '/tmp/claude-0/-home-user-DataScience/9938f053-b86d-51ba-8fd0-0f8776471b0f/scratchpad/bymessage.png' });
await b.close();
