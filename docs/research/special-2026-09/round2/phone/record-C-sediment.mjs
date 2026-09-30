// Records the C Sediment phone prototype: node record-C-sediment.mjs
// Writes C-sediment-1..5.png, C-sediment-poster.png and a raw webm (converted to mp4/gif afterwards).
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const require = createRequire('/Users/TvpPro/Developer/Finance-Tracker/scripts/package.json');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const NAME = 'C-sediment';
const url = pathToFileURL(path.join(here, `${NAME}.html`)).href;
const vidDir = process.env.VID_DIR || path.join(here, `.${NAME}-video`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true,
    recordVideo: { dir: vidDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();
  const shot = n => page.screenshot({ path: path.join(here, `${NAME}-${n}.png`) });
  const tilt = async (from, to, ms) => {
    const steps = Math.max(1, Math.round(ms / 50));
    for (let i = 1; i <= steps; i++) {
      const g = from + (to - from) * i / steps;
      await page.evaluate(g => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 60, gamma: g })), g);
      await sleep(50);
    }
  };

  await page.goto(url);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.evaluate(() => document.fonts.ready);

  // 1. grains pour in and settle
  await sleep(3800);
  await shot(1);

  // 2. tilt left and right: only the loose grains move
  await tilt(0, -40, 700); await sleep(1100); await shot(2);
  await tilt(-40, 40, 1200); await sleep(1000);
  await tilt(40, 0, 600); await sleep(700);

  // 3. tap the dotted layer to name the promised money
  await page.mouse.click(200, 600); await sleep(2400); await shot(3);
  await page.mouse.click(200, 600); await sleep(500);

  // 4. run the days: drag down on the vessel at the recent pace (36.40/day) past 29 Dec
  await page.mouse.move(150, 170); await page.mouse.down();
  for (let i = 1; i <= 120; i++) { await page.mouse.move(150, 170 + 480 * i / 120); await sleep(50); if (i === 62) await shot('poster'); }
  await page.mouse.up(); await sleep(1500); await shot(4);

  // 5. reset, choose 31.77/day and run to 12 Jan
  await page.click("#reset"); await sleep(1800);
  await page.click('.pace[data-p="3177"]'); await sleep(700);
  await page.click('#run'); await sleep(8000);
  await shot(5); await sleep(500);

  await context.close();
  const vid = await page.video().path();
  console.log('video', vid);
} finally {
  await browser.close();
}
