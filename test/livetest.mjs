import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
// two separate browsers, nothing shared, pointed at the message service here
const mk = async () => {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } });
  await ctx.addInitScript(() => { window.UNC_BROKERS = ['ws://127.0.0.1:9004']; });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  return p;
};
const A = await mk(), B = await mk();
const URL = 'http://127.0.0.1:8777/play.html?room=lantern-delta-opal-falcon#lantern-delta-opal-falcon';
const st = async (p) => (await p.textContent('[data-net-status]')).trim();

console.log('— both open the same link, at the same time —');
const t0 = Date.now();
await Promise.all([A.goto(URL), B.goto(URL)]);
for (let i = 0; i < 15; i++) {
  await A.waitForTimeout(700);
  if ((await st(A)).startsWith('Connected') && (await st(B)).startsWith('Connected')) break;
}
console.log('A:', await st(A), '| B:', await st(B));
console.log('took:', ((Date.now() - t0) / 1000).toFixed(1) + 's');
console.log('sides:', (await A.textContent('[data-seat-note="home"]')).trim(),
            '/', (await B.textContent('[data-seat-note="home"]')).trim());

const mover = (await A.locator('.cell:not(:disabled)').count()) ? A : B;
const other = mover === A ? B : A;
await mover.click('.cell[data-move="40"]');
await other.waitForTimeout(800);
console.log('a move crossed:', await other.locator('.cell--x, .cell--o').count(), 'marks');
await other.fill('[data-chat-input]', 'live at last');
await other.press('[data-chat-input]', 'Enter');
await mover.waitForTimeout(700);
console.log('chat crossed  :', (await mover.locator('.chat__line--them').last().textContent()).trim());

// play twenty moves back and forth to be sure it stays in step
let turn = other, off = mover;
for (let i = 0; i < 20; i++) {
  const free = turn.locator('.cell:not(:disabled)');
  if (!(await free.count())) break;
  await free.first().click();
  await off.waitForTimeout(300);
  [turn, off] = [off, turn];
}
const sameBoard =
  (await A.evaluate(() => [...document.querySelectorAll('.cell')].map(c => c.className).join())) ===
  (await B.evaluate(() => [...document.querySelectorAll('.cell')].map(c => c.className).join()));
console.log('after twenty more moves, same board both ends:', sameBoard);
console.log('errors:', errs.length ? errs : 'none');
await b.close();
