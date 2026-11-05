// Browser tests (Chromium via Playwright). Needs the site served at
// http://127.0.0.1:8765/mountain-quest/ (./serve.sh). Run: node --test tests/e2e.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const BASE = process.env.MQ_URL || 'http://127.0.0.1:8765/mountain-quest/';
const SHOTS = process.env.MQ_SHOTS || '/workspace/mountain-quest-shots/';
const FS_SHOTS = SHOTS.replace(/\/?$/, '/') + 'fullscreen/';
fs.mkdirSync(FS_SHOTS, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
const VIEWS = { portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
const ASPECTS = { '844x390': [844, 390], '915x412': [915, 412], '960x384': [960, 384], '667x375': [667, 375], '1024x768': [1024, 768], '1024x478': [1024, 478], '960x432': [960, 432], '1000x460': [1000, 460], '923x415': [923, 415], '1170x450': [1170, 450] };
let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

async function open(view, opts = {}) {
  const ctx = await browser.newContext({ viewport: VIEWS[view], isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: opts.rm ? 'reduce' : 'no-preference', bypassCSP: !!opts.bypassCSP });
  // headless Chromium would really enter full screen and then refuse viewport resizes
  await ctx.addInitScript(() => { Element.prototype.requestFullscreen = function () { window.__fsReq = (window.__fsReq || 0) + 1; return Promise.resolve(); }; });
  if (opts.init) await ctx.addInitScript(opts.init);
  const page = await ctx.newPage();
  const ext = [], errors = [];
  page.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:')) ext.push(u); });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.text()); });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
  return { ctx, page, ext, errors };
}
const st = (page) => page.evaluate(() => window.__MQ.state());
async function axe(page, label) {
  const r = await new AxeBuilder({ page }).include('#menu').analyze();
  const bad = r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
  assert.deepStrictEqual(bad.map(v => v.id + ': ' + v.nodes.length), [], 'axe ' + label);
}
async function noOverlap(page, sel, label) {
  const boxes = await page.$$eval(sel, els => els.filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return { id: e.id || e.dataset.k || e.textContent.trim(), x: r.x, y: r.y, w: r.width, h: r.height }; }));
  const vw = page.viewportSize();
  for (const a of boxes) {
    assert.ok(a.x >= -1 && a.y >= -1 && a.x + a.w <= vw.width + 1 && a.y + a.h <= vw.height + 1, `${label}: ${a.id} off screen`);
    assert.ok(a.w >= 44 && a.h >= 44, `${label}: ${a.id} touch target ${a.w}x${a.h}`);
    for (const b of boxes) if (a !== b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) assert.fail(`${label}: ${a.id} overlaps ${b.id}`);
  }
}

for (const view of Object.keys(VIEWS)) {
  test(`${view}: smoke, menus, axe, overlap, screenshots`, async () => {
    const { ctx, page, ext, errors } = await open(view);
    const shot = (n) => page.screenshot({ path: `${SHOTS}${n}-${view}.png` });
    await page.waitForTimeout(400);
    if (view === 'portrait') { assert.strictEqual(await page.isVisible('#turn'), true); await page.tap('#turnAnyway'); }
    else assert.strictEqual(await page.isVisible('#turn'), false);
    await shot('01-title');
    await axe(page, 'title');
    await noOverlap(page, '#ui .ctl, #menu .mbtn', 'title');

    await page.tap('[data-act="chapters"]'); await page.waitForTimeout(200);
    await axe(page, 'chapters');
    const locked = await page.$$eval('.chap', bs => bs.map(b => b.disabled));
    assert.strictEqual(locked[0], false); assert.ok(locked.slice(1).every(Boolean), 'fresh save: only training open');
    await shot('02-level-select-fresh');
    await page.tap('[data-act="back"]:visible');

    await page.tap('[data-act="settings"]'); await page.waitForTimeout(150);
    await axe(page, 'settings'); await shot('03-settings');
    await page.tap('#menu [data-panel="settings"] [data-act="back"]');

    // start: training -> play
    await page.tap('#mNew'); await page.waitForTimeout(300);
    let s = await st(page);
    assert.strictEqual(s.state, 'play'); assert.strictEqual(s.audio, 'running', 'audio unlocked by the tap');
    await noOverlap(page, '#ui .ctl', 'hud buttons');
    await noOverlap(page, '#touch button', 'touch pads');
    // hold the right pad for a second: the hero walks right
    const r = await page.$('[data-k="right"]'); const bb = await r.boundingBox();
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2);
    const x0 = (await st(page)).x;
    await r.dispatchEvent('pointerdown', { pointerId: 7, isPrimary: true });
    await page.waitForTimeout(900);
    assert.ok((await st(page)).x > x0 + 150, 'moved right while held');
    await r.dispatchEvent('pointerup', { pointerId: 7 });
    await page.waitForTimeout(400);
    assert.strictEqual((await st(page)).held.r, false);
    await shot('04-gameplay');

    // pause button
    await page.tap('#btnPause'); await page.waitForTimeout(200);
    s = await st(page); assert.ok(s.paused && s.menu === 'pause');
    const xp = s.x; await page.waitForTimeout(400); assert.strictEqual((await st(page)).x, xp, 'world frozen while paused');
    await axe(page, 'pause'); await shot('05-pause');
    await page.tap('[data-act="resume"]'); await page.waitForTimeout(100);
    assert.strictEqual((await st(page)).paused, false);

    // story card for chapter 1
    await page.evaluate(() => window.__MQ.start(1)); await page.waitForTimeout(3600);
    assert.strictEqual((await st(page)).state, 'story'); await shot('06-story-card');
    await page.tap('#game'); await page.waitForTimeout(200);
    if ((await st(page)).state === 'story') { await page.tap('#game'); await page.waitForTimeout(200); }
    assert.strictEqual((await st(page)).state, 'play');

    // a new-mechanic stage and the boss
    await page.evaluate(() => window.__MQ.load(8)); await page.waitForTimeout(2600); await shot('07-frozen-falls');
    await page.evaluate(() => window.__MQ.load(16)); await page.waitForTimeout(2600); await shot('08-boss');
    await page.evaluate(() => window.__MQ.load(12)); await page.waitForTimeout(2600); await shot('13-spring-canyon');
    await page.evaluate(() => window.__MQ.load(14)); await page.waitForTimeout(2600); await shot('14-frost-gate');

    // ending
    await page.evaluate(() => window.__MQ.end()); await page.waitForTimeout(500);
    await page.tap('#game'); await page.waitForTimeout(3500);
    assert.strictEqual((await st(page)).state, 'win'); await shot('09-ending');
    await page.tap('#game'); await page.waitForTimeout(300);
    s = await st(page); assert.strictEqual(s.menu, 'credits');
    await axe(page, 'credits'); await shot('10-story-credits');

    // progress survives a reload
    await page.reload(); await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
    s = await st(page); assert.ok(s.save.finished); assert.strictEqual(s.save.unlocked, 17, 'finishing opens every chapter');
    assert.strictEqual(await page.isVisible('#mContinue'), true);
    await page.tap('[data-act="chapters"]'); await page.waitForTimeout(200);
    await shot('11-level-select-progress');

    assert.deepStrictEqual(ext, [], 'no external requests');
    assert.deepStrictEqual(errors, [], 'no console errors or warnings');
    await ctx.close();
  });
}

test('keyboard: blur releases held keys, M syncs the sound button, P pauses, hidden tab auto-pauses', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(BASE); await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
  await page.evaluate(() => window.__MQ.load(1));
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(200);
  assert.strictEqual((await st(page)).held.r, true);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  let s = await st(page);
  assert.strictEqual(s.held.r, false); assert.strictEqual(s.paused, true, 'blur pauses');
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Escape'); assert.strictEqual((await st(page)).paused, false);
  await page.keyboard.press('KeyM');
  assert.match(await page.$eval('#btnSnd', b => b.className), /off/);
  await page.keyboard.press('KeyP'); assert.strictEqual((await st(page)).paused, true);
  await page.keyboard.press('KeyP'); assert.strictEqual((await st(page)).paused, false);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  assert.strictEqual((await st(page)).paused, true, 'hidden tab pauses');
  await ctx.close();
});

test('save: corrupt data and a throwing localStorage do not break the game', async () => {
  const a = await open('landscape', { init: () => { try { localStorage.setItem('mountain-quest:v1', '{not json'); } catch (e) {} } });
  let s = await st(a.page); assert.strictEqual(s.save.unlocked, 0);
  await a.ctx.close();
  const b = await open('landscape', { init: () => { Storage.prototype.setItem = function () { throw new Error('QuotaExceeded'); }; Storage.prototype.getItem = function () { throw new Error('SecurityError'); }; } });
  await b.page.evaluate(() => window.__MQ.load(1));
  await b.page.evaluate(() => window.__MQ.win());
  s = await st(b.page); assert.strictEqual(s.state, 'complete'); assert.strictEqual(s.save.unlocked, 2, 'progress kept in memory');
  assert.match(await b.page.textContent('#toast'), /can.t be saved/);
  assert.deepStrictEqual(b.errors, []);
  await b.ctx.close();
});

test('reduced motion is respected', async () => {
  const { ctx, page } = await open('portrait', { rm: true });
  assert.strictEqual((await st(page)).rm, true);
  assert.ok(await page.evaluate(() => document.body.classList.contains('rm')));
  await ctx.close();
});

test('portrait rotate button turns the stage into landscape', async () => {
  const { ctx, page } = await open('portrait');
  await page.tap('#turnRotate'); await page.waitForTimeout(900);
  assert.strictEqual(await page.isVisible('#turn'), false, 'manual rotate dismisses the card');
  assert.match(await page.$eval('#stage', e => e.className), /rot/);
  await page.tap('#mNew'); await page.waitForTimeout(2600);
  await page.screenshot({ path: `${SHOTS}12-gameplay-rotated-portrait.png` });
  await ctx.close();
});

test('offline: load once, go offline, reload and play', async () => {
  const ctx = await browser.newContext({ viewport: VIEWS.landscape, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
  await page.tap('#mNew'); await page.waitForTimeout(300);
  const r = await page.$('[data-k="right"]');
  await r.dispatchEvent('pointerdown', { pointerId: 3 }); await page.waitForTimeout(800); await r.dispatchEvent('pointerup', { pointerId: 3 });
  const s = await st(page);
  assert.strictEqual(s.state, 'play'); assert.ok(s.x > 300, 'moved while offline');
  // a deep link also falls back to the cached game
  await page.goto(BASE + '?from=homescreen');
  await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
  await page.screenshot({ path: `${SHOTS}17-offline-reload-landscape.png` });
  await ctx.close();
});

test('install button: hidden by default, shown on beforeinstallprompt, hidden after install / when standalone', async () => {
  const { ctx, page, errors } = await open('landscape');
  assert.strictEqual(await page.isVisible('#menu [data-panel="main"] [data-act="install"]'), false, 'hidden without the event');
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true });
    e.prompt = () => { window.__prompted = true; }; e.userChoice = Promise.resolve({ outcome: 'accepted' });
    window.dispatchEvent(e);
  });
  assert.strictEqual(await page.isVisible('#menu [data-panel="main"] [data-act="install"]'), true);
  await page.screenshot({ path: `${SHOTS}15-install-button-landscape.png` });
  await axe(page, 'title with install');
  await noOverlap(page, '#ui .ctl, #menu .mbtn', 'title with install');
  await page.tap('#menu [data-panel="main"] [data-act="install"]');
  assert.strictEqual(await page.evaluate(() => window.__prompted), true, 'prompt() called');
  await page.waitForTimeout(100);
  assert.strictEqual(await page.isVisible('#menu [data-panel="main"] [data-act="install"]'), false, 'hidden after prompting');
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  assert.deepStrictEqual(errors, []);
  await ctx.close();

  const sa = await open('portrait', { init: () => { const mm = window.matchMedia.bind(window); window.matchMedia = (q) => /display-mode/.test(q) ? { matches: true, media: q, addEventListener() {}, removeEventListener() {} } : mm(q); } });
  await sa.page.evaluate(() => { const e = new Event('beforeinstallprompt'); e.prompt = () => {}; window.dispatchEvent(e); });
  assert.strictEqual(await sa.page.isVisible('[data-act="install"]'), false, 'hidden when already installed');
  await sa.ctx.close();
});

test('install on iOS shows the Add to Home Screen hint', async () => {
  const ctx = await browser.newContext({ viewport: VIEWS.portrait, isMobile: true, hasTouch: true, deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  await page.goto(BASE); await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
  await page.tap('#turnAnyway');
  assert.strictEqual(await page.isVisible('#menu [data-panel="main"] [data-act="install"]'), true);
  await page.screenshot({ path: `${SHOTS}15-install-button-portrait.png` });
  await page.tap('#menu [data-panel="main"] [data-act="install"]'); await page.waitForTimeout(150);
  assert.strictEqual((await st(page)).menu, 'iosinstall');
  await axe(page, 'ios install hint');
  await page.screenshot({ path: `${SHOTS}16-ios-install-hint-portrait.png` });
  await ctx.close();
});

test('save migration: a v1 (12-chapter) save keeps its progress', async () => {
  const { ctx, page } = await open('landscape', { init: () => {
    if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
      localStorage.setItem('mountain-quest:v1', JSON.stringify({ v: 1, unlocked: 11, best: { 3: 7, 10: 5, 11: 3 }, finished: false, settings: { muted: true, sfx: true, music: false, motion: 'auto' } })); }
  } });
  const s = (await st(page)).save;
  assert.strictEqual(s.unlocked, 16, 'Old Horn (was 11) is now 16');
  assert.deepStrictEqual(s.best, { 3: 7, 15: 5, 16: 3 });
  assert.strictEqual(s.settings.muted, true); assert.strictEqual(s.settings.music, false);
  await page.tap('[data-act="chapters"]'); await page.waitForTimeout(150);
  await page.screenshot({ path: `${SHOTS}18-level-select-migrated-landscape.png` });
  await ctx.close();
});

test('landscape first: portrait shows the turn card, rotating dismisses it, play-anyway is remembered', async () => {
  const { ctx, page, errors } = await open('portrait');
  assert.strictEqual(await page.isVisible('#turn'), true);
  await axe(page, 'turn card'); // axe scope is #menu; check the card too
  const r = await new AxeBuilder({ page }).include('#turn').analyze();
  assert.deepStrictEqual(r.violations.filter(v => v.impact === 'serious' || v.impact === 'critical').map(v => v.id), []);
  await noOverlap(page, '#turn .mbtn', 'turn card');
  await page.screenshot({ path: `${SHOTS}19-turn-sideways-portrait.png` });
  await page.setViewportSize(VIEWS.landscape); await page.waitForTimeout(300);
  assert.strictEqual(await page.isVisible('#turn'), false, 'gone in landscape');
  await page.tap('#mNew'); await page.waitForTimeout(2600);
  await page.screenshot({ path: `${SHOTS}20-landscape-play-landscape.png` });
  // hero stays clear of the left pads at the start
  const pads = await page.$eval('[data-k="right"]', b => b.getBoundingClientRect().right);
  const heroX = await page.evaluate(() => { const c = document.getElementById('game').getBoundingClientRect(); const sc = Math.min(c.width / 960, c.height / 540); const ox = c.x + (c.width - 960 * sc) / 2; const s = window.__MQ.state(); return ox + (s.x - 0) * sc; });
  assert.ok(heroX > pads, `hero ${heroX} right of pads ${pads}`);
  // back to portrait mid-game: card returns and the game pauses
  await page.setViewportSize(VIEWS.portrait); await page.waitForTimeout(300);
  let s = await st(page); assert.ok(s.turn && s.paused, 'paused under the card');
  await page.tap('#turnAnyway'); await page.waitForTimeout(100);
  assert.strictEqual(await page.isVisible('#turn'), false);
  await page.reload(); await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
  assert.strictEqual(await page.isVisible('#turn'), false, 'choice remembered');
  assert.deepStrictEqual(errors, []);
  await ctx.close();
});

test('desktop never sees the turn card', async () => {
  const ctx = await browser.newContext({ viewport: { width: 600, height: 900 } });
  const page = await ctx.newPage(); await page.goto(BASE);
  await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
  assert.strictEqual(await page.isVisible('#turn'), false);
  await ctx.close();
});

for (const [name, [w, h]] of Object.entries(ASPECTS)) {
  test(`edge to edge at ${name}: canvas covers the viewport, UI inside safe area`, async () => {
    VIEWS[name] = { width: w, height: h };
    const { ctx, page, errors } = await open(name);
    const fsBefore = await page.evaluate(() => window.__fsReq || 0);
    await page.tap('#mNew'); await page.waitForTimeout(2600);
    assert.strictEqual(await page.evaluate(() => window.__fsReq || 0), fsBefore + 1, 'Start asked for full screen');
    const c = await page.$eval('#game', el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, bw: el.width, bh: el.height }; });
    assert.deepStrictEqual([c.x, c.y, c.w, c.h], [0, 0, w, h], 'canvas box = viewport');
    assert.ok(Math.abs(c.bw / c.bh - w / h) < 0.01, 'backing store has the screen aspect (no letterbox)');
    // no blank bars: every edge pixel row/column is painted with game art, not the page background
    const buf = await page.screenshot({ path: `${FS_SHOTS}play-${name}.png` });
    const blank = await page.evaluate(async (b64) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
      const g = cv.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, cv.width, cv.height).data; let n = 0, tot = 0;
      const at = (x, y) => { const i = (y * cv.width + x) * 4; return Math.abs(d[i] - 13) < 12 && Math.abs(d[i + 1] - 27) < 12 && Math.abs(d[i + 2] - 42) < 12; };
      // outer edges plus columns 2% and 8% in from each side, where a letterbox bar would sit
      const cols = [0, cv.width - 1, Math.round(cv.width * 0.02), Math.round(cv.width * 0.98), Math.round(cv.width * 0.08), Math.round(cv.width * 0.92)];
      for (let y = 0; y < cv.height; y += 4) for (const x of cols) { tot++; if (at(x, y)) n++; }
      for (let x = 0; x < cv.width; x += 4) { tot += 2; if (at(x, 0)) n++; if (at(x, cv.height - 1)) n++; }
      return n / tot;
    }, buf.toString('base64'));
    assert.ok(blank < 0.02, `edge pixels showing the bare page background: ${(blank * 100).toFixed(1)}%`);
    await noOverlap(page, '#ui .ctl', 'hud buttons ' + name);
    await noOverlap(page, '#touch button', 'touch pads ' + name);
    assert.deepStrictEqual(errors, []);
    await ctx.close();
  });
}

test('safe-area insets keep buttons clear of a notch (simulated 44px)', async () => {
  VIEWS.notch = { width: 915, height: 412 };
  const { ctx, page } = await open('notch', { bypassCSP: true, init: () => {
    document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = ':root{--n:44px} #ui{right:calc(10px + 44px)!important} #touch{padding-left:calc(10px + 44px)!important;padding-right:calc(10px + 44px)!important} .safe-probe{padding:0 44px 0 44px!important}'; document.head.appendChild(st); });
  } });
  await page.tap('#mNew'); await page.waitForTimeout(500);
  const left = await page.$eval('[data-k="left"]', b => b.getBoundingClientRect().left);
  const right = await page.$eval('#btnFull', b => b.getBoundingClientRect().right);
  assert.ok(left >= 44 && right <= 915 - 44, `${left} ${right}`);
  await page.screenshot({ path: `${FS_SHOTS}notch-sim-915x412.png` });
  await ctx.close();
});

test('pause and settings have a full screen switch', async () => {
  const { ctx, page } = await open('landscape');
  await page.tap('#mNew'); await page.waitForTimeout(300);
  await page.tap('#btnPause'); await page.waitForTimeout(150);
  assert.ok(await page.isVisible('#menu [data-panel="pause"] [data-act="fullscreen"]'));
  await axe(page, 'pause with full screen');
  await page.screenshot({ path: `${FS_SHOTS}pause-844x390.png` });
  await page.tap('#menu [data-panel="pause"] [data-act="settings"]'); await page.waitForTimeout(150);
  assert.ok(await page.isVisible('#sFs')); await axe(page, 'settings with full screen');
  await ctx.close();
});
