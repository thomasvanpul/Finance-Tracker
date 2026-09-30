// Records the A-sentence prototype. Run: node docs/research/special-2026-09/round2/phone/record-A-sentence.mjs
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
const require = createRequire('/Users/TvpPro/Developer/Finance-Tracker/scripts/package.json');
const { chromium } = require('playwright');

const DIR = path.dirname(fileURLToPath(import.meta.url));
const NAME = 'A-sentence';
const VIDDIR = process.env.VIDDIR || path.join(os.tmpdir(), 'video-' + NAME);
const URL = 'file://' + path.join(DIR, NAME + '.html');

const browser = await chromium.launch({ headless: true });
try {
  const opts = { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 };
  const ctx = await browser.newContext({ ...opts, recordVideo: { dir: VIDDIR, size: { width: 390, height: 844 } } });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.evaluate(() => document.fonts.ready);
  const wait = ms => page.waitForTimeout(ms);
  const center = async sel => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + Math.min(b.width / 2, 40), y: b.y + b.height / 2 }; };
  const tap = async sel => { const p = await center(sel); await page.mouse.move(p.x, p.y); await page.mouse.down(); await wait(70); await page.mouse.up(); };
  const tapAt = async (x, y) => { await page.mouse.move(x, y); await page.mouse.down(); await wait(70); await page.mouse.up(); };
  const swipe = async (fromY, toY) => {
    await page.mouse.move(200, fromY); await page.mouse.down();
    const steps = 12; for (let i = 1; i <= steps; i++) { await page.mouse.move(200, fromY + (toY - fromY) * i / steps); await wait(16); }
    await page.mouse.up();
  };
  const still = async n => { const f = path.join(DIR, `${NAME}-${n}.png`); await page.screenshot({ path: f }); };

  await wait(1800);                               // beat 1: sentence 1
  await still(1);
  await tap('.door[data-id="perday"]');           // beat 2: unfold the derivation
  await wait(2200);
  await tap('.door[data-id="rent1"]');            // beat 3: rent unfolds its four dates
  await wait(2300);
  await still(2);
  await tapAt(200, 790);                          // beat 4: tap background, fold back
  await wait(1600);
  await swipe(620, 330); await wait(2200);        // beat 5: sentence 2 (zero-day tension)
  await still(3);
  await swipe(620, 330); await wait(1600);        // sentence 3 (net worth, foreign share)
  await tap('.door[data-id="fx3"]'); await wait(2400);
  await still(4);
  await swipe(620, 330); await wait(1800);        // sentence 4 (promised)
  // beat 6: press and hold to ask
  await page.mouse.move(200, 760); await page.mouse.down(); await wait(800); await page.mouse.up();
  await wait(600);
  await page.keyboard.type('Can I afford £45 on Friday?', { delay: 70 });
  await wait(700);
  await still(5);
  await page.keyboard.press('Enter');             // beat 7: answer sentence
  await wait(2200);
  await tap('.door[data-id="nz"]'); await wait(2600);
  await still('poster');
  await tapAt(200, 790);                          // beat 8: back home
  await wait(2000);
  await ctx.close();
  const vids = fs.readdirSync(VIDDIR).filter(f => f.endsWith('.webm'));
  console.log('video', path.join(VIDDIR, vids[0]));
} finally {
  await browser.close();
}
