// Browser tests (Chromium via Playwright). Needs the site served at
// http://127.0.0.1:8765/mountain-quest/ (./serve.sh). Run: node --test tests/e2e.test.mjs
import test from 'node:test';
import assert from 'node:assert';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';
import fs from 'node:fs';

const BASE = process.env.MQ_URL || 'http://127.0.0.1:8765/mountain-quest/';
const SHOTS = process.env.MQ_SHOTS || '/workspace/mountain-quest-shots/';
fs.mkdirSync(SHOTS, { recursive: true });
const VIEWS = { portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } };
let browser;
test.before(async () => { browser = await chromium.launch(); });
test.after(async () => { await browser.close(); });

async function open(view, opts = {}) {
  const ctx = await browser.newContext({ viewport: VIEWS[view], isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: opts.rm ? 'reduce' : 'no-preference' });
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
    assert.strictEqual((await st(page)).state, 'play');

    // a new-mechanic stage and the boss
    await page.evaluate(() => window.__MQ.load(8)); await page.waitForTimeout(2600); await shot('07-frozen-falls');
    await page.evaluate(() => window.__MQ.load(11)); await page.waitForTimeout(2600); await shot('08-boss');

    // ending
    await page.evaluate(() => window.__MQ.end()); await page.waitForTimeout(500);
    await page.tap('#game'); await page.waitForTimeout(3500);
    assert.strictEqual((await st(page)).state, 'win'); await shot('09-ending');
    await page.tap('#game'); await page.waitForTimeout(300);
    s = await st(page); assert.strictEqual(s.menu, 'credits');
    await axe(page, 'credits'); await shot('10-story-credits');

    // progress survives a reload
    await page.reload(); await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
    s = await st(page); assert.ok(s.save.finished); assert.strictEqual(s.save.unlocked, 12, 'finishing opens every chapter');
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
  await page.tap('#btnRot'); await page.waitForTimeout(900);
  assert.match(await page.$eval('#stage', e => e.className), /rot/);
  await page.tap('#mNew'); await page.waitForTimeout(2600);
  await page.screenshot({ path: `${SHOTS}12-gameplay-rotated-portrait.png` });
  await ctx.close();
});
