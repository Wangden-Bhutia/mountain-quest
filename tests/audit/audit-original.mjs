import { chromium } from 'playwright';
const url = 'file:///workspace/mountain-quest/original.html';
const out = '/workspace/mountain-quest-shots/original/';
const b = await chromium.launch();
const res = {};
for (const [name, vp] of [['portrait', {width:390,height:844}], ['landscape', {width:844,height:390}]]) {
  const ctx = await b.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const reqs = [], errs = [];
  page.on('request', r => { if (!r.url().startsWith('file:') && !r.url().startsWith('data:')) reqs.push(r.url()); });
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text()); });
  await page.addInitScript(() => {
    const C = window.AudioContext; window.__acs = [];
    window.AudioContext = function(){ const a = new C(); window.__acs.push(a); return a; };
  });
  await page.goto(url); await page.waitForTimeout(1500);
  await page.screenshot({ path: out + name + '-title.png' });
  const canvasBox = await page.$eval('#game', c => { const r = c.getBoundingClientRect(); return {w:r.width,h:r.height, cw:c.width, ch:c.height}; });
  // tap canvas to start (as a touch user would on title)
  await page.tap('#game', { position: { x: canvasBox.w/2, y: canvasBox.h/2 } });
  await page.waitForTimeout(300);
  const acState = await page.evaluate(() => window.__acs.map(a => a.state));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + name + '-play.png' });
  const btns = await page.$$eval('#touch button, #ui button', bs => bs.map(b => { const r=b.getBoundingClientRect(); return {k:b.dataset.k||b.id, x:r.x,y:r.y,w:r.width,h:r.height, vis: getComputedStyle(b).display}; }));
  const hasPauseBtn = await page.$('[aria-label*="ause" i]') !== null;
  const ls = await page.evaluate(() => Object.keys(localStorage));
  res[name] = { reqs, errs, canvasBox, acStateAfterCanvasTap: acState, btns, hasPauseBtn, localStorageKeys: ls };
  await ctx.close();
}
// desktop: stuck key on blur, M-key icon desync
const ctx = await b.newContext({ viewport: {width:1280,height:720} });
const page = await ctx.newPage();
await page.goto(url); await page.waitForTimeout(1200);
await page.keyboard.press('Space'); await page.waitForTimeout(800);
await page.keyboard.press('KeyM'); await page.waitForTimeout(100);
res.desktop = { sndBtnClassAfterM: await page.$eval('#btnSnd', b => b.className) };
await page.screenshot({ path: out + 'desktop-play.png' });
await b.close();
console.log(JSON.stringify(res, null, 1));
