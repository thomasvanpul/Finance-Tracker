import { chromium } from 'playwright';
import { FRONTEND, API, signInSeedUser, openAccountPrefs, seedCacheScript, assertTheme } from './account-prefs.js';

const browser = await chromium.launch();

async function proxy(ctx: import('playwright').BrowserContext) {
  await ctx.route(`${FRONTEND}/api/**`, async route => {
    try {
      const req = route.request();
      const target = req.url().replace(FRONTEND, API);
      const cs = await ctx.cookies();
      const cookieHeader = cs.map(c => `${c.name}=${c.value}`).join('; ');
      const r = await ctx.request.fetch(target, {
        method: req.method(),
        headers: { ...req.headers(), origin: FRONTEND, cookie: cookieHeader },
        data: req.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      let body = await r.body();
      if (req.url().endsWith('/api/dashboard') && (r.headers()['content-type'] ?? '').includes('json') && r.status() === 200) {
        try {
          const parsed = JSON.parse(body.toString('utf-8'));
          // Populate portfolio so market persona hero has real numbers
          parsed.portfolio = parsed.portfolio ?? { totalValueGbp: 0, totalPlGbp: 0, totalPlPercent: 0, dayChangeGbp: null, dayChangePercent: null };
          if (!parsed.portfolio.dayChangeGbp) {
            parsed.portfolio.dayChangeGbp = 137.42;
            parsed.portfolio.dayChangePercent = 0.92;
          }
          body = Buffer.from(JSON.stringify(parsed), 'utf-8');
        } catch {}
      }
      await route.fulfill({
        status: r.status(),
        headers: Object.fromEntries(r.headersArray().filter(h => !['set-cookie','content-length'].includes(h.name.toLowerCase())).map(h => [h.name, h.value])),
        body,
      });
    } catch (e) {
      if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
    }
  });
}

for (const persona of ['market', 'budget'] as const) {
  for (const theme of ['void', 'arctic'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    const cookie = await signInSeedUser(ctx);
    // Account-level, and the app hydrates both from the server on boot.
    // Set them before the page opens or the capture shows the stored
    // values under this filename. See account-prefs.ts.
    const prefs = await openAccountPrefs(ctx, cookie);
    await prefs.setTheme(theme);
    await proxy(ctx);
    const page = await ctx.newPage();
    await page.addInitScript(seedCacheScript({
      theme,
      persona,
      extra: { 'ft-onboarding-complete': '1', 'nr-onboarding-complete': '1' },
    }));
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await assertTheme(page, theme);
    await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/mobilehome_${persona}_${theme}.png`, fullPage: false });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
    await prefs.restore();
    await ctx.close();
    console.log('saved', persona, theme);
  }
}
await browser.close();
console.log('done');
