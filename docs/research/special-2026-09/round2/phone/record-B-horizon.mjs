// Records the B Horizon phone prototype. Run: node record-B-horizon.mjs [--stills-only]
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire('/Users/TvpPro/Developer/Finance-Tracker/scripts/package.json');
const { chromium } = require('playwright');

const NAME = 'B-horizon';
const DIR = path.dirname(fileURLToPath(import.meta.url));
const SCRATCH = '/private/tmp/claude-501/-Users-TvpPro-Developer-Finance-Tracker/f3673092-c393-49fe-8c33-8c94ecdb5d16/scratchpad/B-horizon-video';
const URL = 'file://' + path.join(DIR, NAME + '.html');
const FFMPEG = '/opt/homebrew/bin/ffmpeg';
mkdirSync(SCRATCH, { recursive: true });

const wait = ms => new Promise(r => setTimeout(r, ms));

async function drag(page, x0, y0, x1, y1, steps, ms) {
  await page.mouse.move(x0, y0);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e);
    await wait(ms / steps);
  }
  await page.mouse.up();
}
async function still(page, n) {
  await wait(250);
  await page.screenshot({ path: path.join(DIR, `${NAME}-${n}.png`) });
}

const browser = await chromium.launch({ headless: true });
try {
  // stills at deviceScaleFactor 2; video in a separate 1x context
  const stillsOnly = process.argv.includes('--stills-only');
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true,
    ...(stillsOnly ? {} : { recordVideo: { dir: SCRATCH, size: { width: 390, height: 844 } } }),
  });
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.waitForSelector('body[data-ready="1"]');
  await page.evaluate(() => document.fonts.ready);
  await wait(1800);
  await still(page, 1);                                   // beat 1: today

  // beat 2: walk forward through the cliffs to the shoreline (29 Dec = day 90)
  for (let k = 0; k < 3; k++) {
    await drag(page, 330, 380, 60, 382, 30, 1300);
    await wait(500);
    if (k === 0) await still(page, 2);
  }
  // fine-walk until the marker stands on the shoreline day
  let m = await page.evaluate(() => window.horizon.marker);
  while (m < 90) { await page.keyboard.press('ArrowRight'); await wait(40); m = await page.evaluate(() => window.horizon.marker); }
  while (m > 90) { await page.keyboard.press('ArrowLeft'); await wait(40); m = await page.evaluate(() => window.horizon.marker); }
  await wait(1500);
  await still(page, 3);

  // beat 3: turn the pace down 36.40 -> 31.77 with a vertical drag (0.02 per px, 4.63 = 231.5 px)
  await drag(page, 250, 260, 252, 260 + 232, 50, 3200);
  await wait(400);
  let p = await page.evaluate(() => window.horizon.pace);
  console.log('pace after drag', p);
  // walk to the wall to see the land reach it
  await drag(page, 320, 300, 220, 302, 20, 900);
  await wait(1800);
  await still(page, 4);

  // beat 4: tilt the phone left to walk back towards today
  {
    const t0 = Date.now();
    m = await page.evaluate(() => window.horizon.marker);
    while (m > 54 && Date.now() - t0 < 6000) {
      await page.evaluate(g => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: g })), -26);
      await wait(50);
      m = await page.evaluate(() => window.horizon.marker);
    }
    await page.evaluate(() => window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta: 40, gamma: 0 })));
  }
  console.log('marker after tilt', m);
  await wait(800);

  // beat 5: tap a cliff to name it (the December rent)
  const box = await page.evaluate(() => {
    const b = window.horizon.bills.findIndex(x => x.date === '2026-12-01');
    const h = window.horizon.hit.find(k => k.i === b);
    return h ? { x: (h.x0 + 16), y: (h.y0 + h.y1) / 2 } : null;
  });
  console.log('cliff box', box);
  if (box) await page.touchscreen.tap(box.x, box.y);
  await wait(2200);
  await still(page, 5);
  await page.screenshot({ path: path.join(DIR, `${NAME}-poster.png`) });
  await wait(1200);

  const video = page.video();
  await ctx.close();
  if (video) {
    const webm = await video.path();
    const mp4 = path.join(DIR, NAME + '.mp4'), gif = path.join(DIR, NAME + '.gif');
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-preset', 'slow', '-movflags', '+faststart', mp4]);
    execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-i', webm, '-vf',
      'fps=12,scale=390:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', gif]);
    renameSync(webm, path.join(SCRATCH, NAME + '-raw.webm'));
    for (const f of [mp4, gif]) console.log(path.basename(f), (statSync(f).size / 1e6).toFixed(2), 'MB');
  }
} finally {
  await browser.close();
}
