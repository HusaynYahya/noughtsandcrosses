import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } });
const errs = [];
const A = await ctx.newPage(), B = await ctx.newPage();
for (const q of [A, B]) q.on('pageerror', e => errs.push(e.message));
// no matchmaking service pointed at, and no fake transport: real WebRTC only
for (const q of [A, B]) {
  await q.goto('http://127.0.0.1:8777/index.html');
  await q.selectOption('[data-mode]', 'online');
  await q.click('.byhand summary');
}
console.log('— A starts —');
await A.click('[data-hand-start]');
await A.waitForSelector('[data-hand-out]:not([hidden])', { timeout: 20000 });
await A.waitForTimeout(1500);
const codeA = await A.inputValue('[data-hand-out]');
console.log('A made a code of', codeA.length, 'characters, starting', codeA.slice(0, 12));

console.log('— B answers —');
await B.click('[data-hand-join]');
await B.fill('[data-hand-in]', codeA);
await B.click('[data-hand-go]');
await B.waitForSelector('[data-hand-out]:not([hidden])', { timeout: 20000 });
await B.waitForTimeout(1500);
const codeB = await B.inputValue('[data-hand-out]');
console.log('B made a reply of', codeB.length, 'characters');

console.log('— A pastes the reply —');
await A.fill('[data-hand-in]', codeB);
await A.click('[data-hand-go]');
for (let i = 0; i < 10; i++) {
  await A.waitForTimeout(1000);
  const open = await A.evaluate(() => !!document.querySelector('.chat__form input:not([disabled])'));
  if (open) break;
}
const connected = await A.evaluate(() => !!document.querySelector('.chat__form input:not([disabled])'));
console.log('connected with no service at all:', connected);
if (connected) {
  const mover = (await A.locator('.cell:not(:disabled)').count()) ? A : B;
  const other = mover === A ? B : A;
  await mover.click('.cell[data-move="40"]');
  await other.waitForTimeout(1200);
  console.log('a move crossed:', await other.locator('.cell--x, .cell--o').count(), 'marks');
  await other.fill('[data-chat-input]', 'no server needed');
  await other.press('[data-chat-input]', 'Enter');
  await mover.waitForTimeout(800);
  console.log('chat crossed  :', (await mover.locator('.chat__line--them').last().textContent()).trim());
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
