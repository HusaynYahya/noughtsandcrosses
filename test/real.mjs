import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
// point the page at the matchmaking service running here — NO fake transport
await ctx.addInitScript(() => {
  window.UNC_PEER_SERVER = { host: '127.0.0.1', port: 9000, path: '/unc', secure: false };
});
const logs = [];
const A = await ctx.newPage(), B = await ctx.newPage();
A.on('console', m => logs.push('A: ' + m.text()));
B.on('console', m => logs.push('B: ' + m.text()));
A.on('pageerror', e => logs.push('A PAGEERROR: ' + e.message));
B.on('pageerror', e => logs.push('B PAGEERROR: ' + e.message));

const st = async (p) => (await p.textContent('[data-net-status]')).trim();
const URL = 'http://127.0.0.1:8777/index.html?room=lantern-delta-opal-falcon#lantern-delta-opal-falcon';

console.log('— A opens the invitation link —');
await A.goto(URL);
await A.waitForTimeout(3000);
console.log('A:', await st(A));

console.log('— B opens the same link —');
await B.goto(URL);
for (let i = 0; i < 12; i++) {
  await B.waitForTimeout(2000);
  const a = await st(A), bb = await st(B);
  console.log(`  t+${(i + 1) * 2}s  A: ${a.slice(0, 44)}  |  B: ${bb.slice(0, 44)}`);
  if (a.startsWith('Connected') && bb.startsWith('Connected')) break;
}

const connected = await A.evaluate(() => !!document.querySelector('.chat__form input:not([disabled])'));
console.log('\nconnected:', connected);
if (connected) {
  const mover = (await A.locator('.cell:not(:disabled)').count()) ? A : B;
  const other = mover === A ? B : A;
  await mover.click('.cell[data-move="40"]');
  await other.waitForTimeout(1200);
  console.log('a real move crossed a real WebRTC data channel:',
              await other.locator('.cell--x, .cell--o').count(), 'marks');
  await mover.fill('[data-chat-input]', 'hello over real webrtc');
  await mover.press('[data-chat-input]', 'Enter');
  await other.waitForTimeout(800);
  console.log('chat arrived:', (await other.locator('.chat__line--them').last().textContent()).trim());
}
console.log('\npage logs:', logs.length ? logs.slice(0, 12) : 'none');
await b.close();
