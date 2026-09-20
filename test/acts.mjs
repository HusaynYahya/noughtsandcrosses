/* Resigning, and a draw agreed: both sides have to end up with the same game
   in their record, and the rating has to move for it. */
import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const errs = [];
const mk = async (n) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  await ctx.addInitScript(() => { window.UNC_BROKERS = ['ws://127.0.0.1:9004']; });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(n + ': ' + e.message));
  return p;
};
const say = (l, v) => console.log(l.padEnd(32, ' ') + ':', v);
const st = (p) => p.textContent('[data-net-status]').then(t => t.trim());
const games = (p) => p.evaluate(() => JSON.parse(localStorage.getItem('unc.games') || '[]'));
const base = 'http://127.0.0.1:8777/play.html?room=';

async function pair(code) {
  const A = await mk('A'), B = await mk('B');
  await Promise.all([A.goto(base + code), B.goto(base + code)]);
  for (let i = 0; i < 18; i++) {
    await A.waitForTimeout(500);
    if ((await st(A)).startsWith('Connected') && (await st(B)).startsWith('Connected')) break;
  }
  // a few moves so there is a game to resign from
  let t = (await A.locator('.cell:not(:disabled)').count()) ? A : B, o = t === A ? B : A;
  for (let i = 0; i < 8; i++) {
    await t.locator('.cell:not(:disabled)').first().click();
    await o.waitForTimeout(260);
    [t, o] = [o, t];
  }
  return [A, B];
}

const [A, B] = await pair('amber-cedar-opal-raven');
A.on('dialog', d => d.accept());
await A.click('[data-resign]');
await B.waitForTimeout(1500);
say('A resigns, A is told', (await A.textContent('[data-status]')).replace(/\s+/g, ' ').trim());
say('and B is told', (await B.textContent('[data-status]')).replace(/\s+/g, ' ').trim());
const [ga, gb] = [await games(A), await games(B)];
say('A record', (ga[0] || {}).result + ', ' + (ga[0] || {}).ending + ', ' + (ga[0] || {}).change);
say('B record', (gb[0] || {}).result + ', ' + (gb[0] || {}).ending + ', ' + (gb[0] || {}).change);

const [C, D] = await pair('flint-harbour-ivory-maple');
await C.click('[data-draw]');
await D.waitForTimeout(1200);
say('D is offered a draw', await D.locator('[data-offer-row]').isVisible() ? 'yes' : 'NO');
say('what C sees', (await C.textContent('[data-draw]')).trim());
await D.click('[data-offer-no]');
await C.waitForTimeout(1000);
say('declined, game goes on', (await C.textContent('[data-status]')).replace(/\s+/g, ' ').trim().slice(0, 40));
await C.click('[data-draw]');
await D.waitForTimeout(900);
await D.click('[data-offer-yes]');
await C.waitForTimeout(1500);
say('agreed, C is told', (await C.textContent('[data-status]')).replace(/\s+/g, ' ').trim());
say('agreed, D is told', (await D.textContent('[data-status]')).replace(/\s+/g, ' ').trim());
const [gc, gd] = [await games(C), await games(D)];
say('C record', (gc[0] || {}).result + ', ' + (gc[0] || {}).ending + ', ' + (gc[0] || {}).change);
say('D record', (gd[0] || {}).result + ', ' + (gd[0] || {}).ending + ', ' + (gd[0] || {}).change);
say('errors', errs.length ? errs.join(' | ') : 'none');
await b.close();
