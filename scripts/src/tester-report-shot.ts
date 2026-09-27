// Tester report: photographs the report sheet on phone (long-press on the
// tab bar) and on desktop (the REPORT button), and saves the screenshot the
// sheet captured, masked and clear, so the capture itself can be looked at.
//
// Reads only. It changes no account-level setting (theme, persona,
// tab_slot), so it does not take the capture lock and can run beside a
// capture script.
//
// Usage: pnpm tsx src/tester-report-shot.ts [outDir]
import { writeFileSync, mkdirSync } from 'node:fs';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { FRONTEND, API, signInSeedUser, seedCacheScript } from './account-prefs.js';

const OUT = process.argv[2] ?? '/Users/TvpPro/Developer/Finance-Tracker/.review/shots/tester-report';
mkdirSync(OUT, { recursive: true });

async function passApiThrough(ctx: BrowserContext) {
  await ctx.route(`${FRONTEND}/api/**`, async route => {
    const req = route.request();
    const cs = await ctx.cookies();
    const r = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
      method: req.method(),
      headers: { ...req.headers(), origin: FRONTEND, cookie: cs.map(c => `${c.name}=${c.value}`).join('; ') },
      data: req.postDataBuffer() ?? undefined,
      maxRedirects: 0,
    });
    await route.fulfill({
      status: r.status(),
      headers: Object.fromEntries(r.headersArray().filter(h => !['set-cookie', 'content-length'].includes(h.name.toLowerCase())).map(h => [h.name, h.value])),
      body: await r.body(),
    });
  });
}

// The sheet's preview <img> is a blob: URL; read it back out of the page.
async function savePreview(page: Page, file: string) {
  const b64 = await page.evaluate(async () => {
    const img = document.querySelector('img[alt="The screen this report is about"]') as HTMLImageElement | null;
    if (!img) return null;
    const buf = await (await fetch(img.src)).arrayBuffer();
    let s = '';
    new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); });
    return btoa(s);
  });
  if (!b64) { console.log('no preview image in the sheet'); return; }
  writeFileSync(file, Buffer.from(b64, 'base64'));
  console.log('saved', file);
}

async function run(label: 'phone' | 'desktop', viewport: { width: number; height: number }, path: string) {
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: label === 'phone' });
    await signInSeedUser(ctx);
    await passApiThrough(ctx);
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log(`[${label}] pageerror`, e.message));
    await page.addInitScript(seedCacheScript({ extra: { 'ft-onboarding-complete': '1', 'nr-onboarding-complete': '1' } }));
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${label}-before.png` });

    if (label === 'phone') {
      const nav = page.locator('nav[aria-label="Primary"]');
      const box = await nav.boundingBox();
      if (!box) throw new Error('no tab bar');
      await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(350);
      await page.screenshot({ path: `${OUT}/${label}-holding.png` });
      await page.waitForTimeout(600);
      await page.mouse.up();
    } else {
      await page.getByRole('button', { name: 'REPORT' }).click();
    }

    await page.getByText('Report to the testers group').waitFor({ timeout: 15000 });
    await page.waitForTimeout(700);
    console.log(`[${label}] url after gesture:`, new URL(page.url()).pathname);
    await page.screenshot({ path: `${OUT}/${label}-sheet.png` });
    await savePreview(page, `${OUT}/${label}-capture-masked.png`);
    await page.getByRole('button', { name: /Figures hidden/ }).click();
    await page.waitForTimeout(300);
    await savePreview(page, `${OUT}/${label}-capture-clear.png`);
    await page.locator('textarea').fill('Total overlaps the tab bar');
    await page.screenshot({ path: `${OUT}/${label}-sheet-filled.png` });
    await ctx.close();
  } finally {
    await browser.close();
  }
}

await run('phone', { width: 390, height: 844 }, '/spending');
await run('desktop', { width: 1440, height: 900 }, '/');
console.log('done');
