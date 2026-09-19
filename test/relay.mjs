import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });

// 1. the relay test button, with the right password and then a wrong one
for (const [label, user, pass, expect] of [
  ['correct password', 'gamer', 'letmein', 'should pass'],
  ['wrong password',   'gamer', 'nope',    'should fail']]) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } });
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8777/play.html');
  await p.selectOption('[data-mode]', 'online');
  await p.click('.byhand summary');
  await p.fill('[data-relay-url]', 'turn:127.0.0.1:3478');
  await p.fill('[data-relay-user]', user);
  await p.fill('[data-relay-pass]', pass);
  await p.click('[data-relay-save]');
  await p.click('[data-relay-test]');
  await p.waitForFunction(() => !/Testing|Asking/.test(document.querySelector('[data-relay-said]').textContent), null, { timeout: 30000 });
  console.log(label.padEnd(18), '->', (await p.textContent('[data-relay-said]')).trim(), `(${expect})`);
  await ctx.close();
}

// 2. a whole game forced through the relay — no direct route allowed at all
const ctx = await b.newContext({ viewport: { width: 1200, height: 950 } });
await ctx.addInitScript(() => {
  window.UNC_FORCE_RELAY = true;
  localStorage.setItem('unc.relay', JSON.stringify({
    urls: 'turn:127.0.0.1:3478', username: 'gamer', credential: 'letmein' }));
});
const A = await ctx.newPage(), B = await ctx.newPage();
const errs = [];
for (const q of [A, B]) {
  q.on('pageerror', e => errs.push(e.message));
  await q.goto('http://127.0.0.1:8777/play.html');
  await q.selectOption('[data-mode]', 'online');
  await q.click('.byhand summary');
}
await A.click('[data-hand-start]');
await A.waitForSelector('[data-hand-out]:not([hidden])', { timeout: 30000 });
await A.waitForTimeout(2000);
const codeA = await A.inputValue('[data-hand-out]');
await B.click('[data-hand-join]');
await B.fill('[data-hand-in]', codeA);
await B.click('[data-hand-go]');
await B.waitForSelector('[data-hand-out]:not([hidden])', { timeout: 30000 });
await B.waitForTimeout(2000);
const codeB = await B.inputValue('[data-hand-out]');
await A.fill('[data-hand-in]', codeB);
await A.click('[data-hand-go]');
for (let i = 0; i < 15; i++) {
  await A.waitForTimeout(1000);
  if (await A.evaluate(() => !!document.querySelector('.chat__form input:not([disabled])'))) break;
}
const ok = await A.evaluate(() => !!document.querySelector('.chat__form input:not([disabled])'));
console.log('\ngame forced through the relay, no direct route:', ok);
if (ok) {
  const mover = (await A.locator('.cell:not(:disabled)').count()) ? A : B;
  const other = mover === A ? B : A;
  await mover.click('.cell[data-move="40"]');
  await other.waitForTimeout(1500);
  console.log('a move crossed the relay:', await other.locator('.cell--x, .cell--o').count(), 'marks');
}
console.log('errors:', errs.length ? errs : 'none');
await b.close();
