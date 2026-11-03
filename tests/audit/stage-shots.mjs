import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await (await b.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
await page.goto('http://127.0.0.1:8765/mountain-quest/');
await page.waitForFunction(() => window.__MQ && window.__MQ.state().menu === 'main');
for (const i of [6, 7, 9, 10, 12]) {
  await page.evaluate((i) => window.__MQ.load(i), i);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(i === 7 ? 2300 : 1500); await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `/workspace/mountain-quest-shots/stage-${String(i).padStart(2, '0')}-landscape.png` });
}
await b.close();
