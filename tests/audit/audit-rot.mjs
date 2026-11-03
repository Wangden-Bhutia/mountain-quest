import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: {width:390,height:844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await ctx.newPage();
await page.goto('file:///workspace/mountain-quest/original.html'); await page.waitForTimeout(1200);
await page.tap('#btnRot'); await page.waitForTimeout(900);
await page.tap('#game'); await page.waitForTimeout(2600);
await page.screenshot({ path: '/workspace/mountain-quest-shots/original/portrait-rotated-play.png' });
// hold right 1.5s via touch button, then check pause possibilities
console.log(await page.$eval('#stage', s => s.className + ' ' + s.style.width + 'x' + s.style.height));
// resize to landscape while rotated
await page.setViewportSize({width:844,height:390}); await page.waitForTimeout(500);
console.log(await page.$eval('#stage', s => s.className + ' ' + s.style.width + 'x' + s.style.height));
await b.close();
