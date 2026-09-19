import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
// two completely separate browsers — no shared anything, no network between them
const one = await b.newContext({ viewport: { width: 1200, height: 950 } });
const two = await b.newContext({ viewport: { width: 1200, height: 950 } });
const A = await one.newPage(), B = await two.newPage();
for (const q of [A, B]) q.on('pageerror', e => errs.push(e.message));
for (const q of [A, B]) {
  await q.goto('http://127.0.0.1:8777/index.html');
  await q.selectOption('[data-mode]', 'post');
  await q.waitForTimeout(200);
}
const marks = (p) => p.locator('.cell--x, .cell--o').count();

// A plays the first move
await A.click('.cell[data-move="40"]');
await A.waitForTimeout(300);
const code1 = await A.inputValue('[data-post-out]');
console.log('A moves, code is   :', code1, '(' + code1.length + ' characters)');
console.log('A board now locked :', (await A.locator('.cell:not(:disabled)').count()) === 0);

// the code goes to B by whatever means; B pastes it
await B.fill('[data-post-in]', code1);
await B.click('[data-post-use]');
await B.waitForTimeout(400);
console.log('B sees             :', await marks(B), 'mark |', (await B.textContent('[data-post-said]')).trim());
console.log('B can move         :', (await B.locator('.cell:not(:disabled)').count()) > 0);

// B replies
const bMove = await B.locator('.cell:not(:disabled)').first().getAttribute('data-move');
await B.click(`.cell[data-move="${bMove}"]`);
await B.waitForTimeout(300);
const code2 = await B.inputValue('[data-post-out]');
console.log('B moves, code is   :', code2);

// back to A
await A.fill('[data-post-in]', code2);
await A.click('[data-post-use]');
await A.waitForTimeout(400);
console.log('A sees both moves  :', await marks(A), 'marks | A to move again:',
            (await A.locator('.cell:not(:disabled)').count()) > 0);
console.log('sides kept straight: A is', (await A.textContent('[data-seat-note="home"]')).trim(),
            '| B is', (await B.textContent('[data-seat-note="home"]')).trim());

// a link instead of a code
const link = 'http://127.0.0.1:8777/index.html?game=' + code2;
const C = await (await b.newContext()).newPage();
await C.goto(link);
await C.waitForTimeout(600);
console.log('opening a link     :', await marks(C), 'marks, mode is',
            await C.inputValue('[data-mode]'), '| can move:',
            (await C.locator('.cell:not(:disabled)').count()) > 0);

// nonsense is refused
await A.fill('[data-post-in]', 'not a real code at all');
await A.click('[data-post-use]');
await A.waitForTimeout(300);
console.log('nonsense refused   :', (await A.textContent('[data-post-said]')).trim());
console.log('errors             :', errs.length ? errs : 'none');
await b.close();
