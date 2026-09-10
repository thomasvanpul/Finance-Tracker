import { chromium } from 'playwright';
import { FRONTEND, API, signInSeedUser, openAccountPrefs, seedCacheScript, assertTheme } from './account-prefs.js';


const browser = await chromium.launch();

async function proxy(ctx: import('playwright').BrowserContext, emptyDash: boolean) {
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
      if (emptyDash && (r.headers()['content-type'] ?? '').includes('json') && r.status() === 200) {
        try {
          const parsed = JSON.parse(body.toString('utf-8'));
          if (req.url().endsWith('/api/dashboard')) {
            parsed.accountBreakdown = [];
            parsed.netWorth = 0; parsed.totalCash = 0; parsed.unconvertibleAccounts = 0;
            body = Buffer.from(JSON.stringify(parsed), 'utf-8');
          }
          if (req.url().endsWith('/api/accounts')) {
            body = Buffer.from(JSON.stringify([]), 'utf-8');
          }
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

async function shot(persona: string, theme: string, path: string, emptyDash: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const cookie = await signInSeedUser(ctx);
  // theme is an account column the app hydrates on boot, so the
  // localStorage seed alone is overwritten. persona is deliberately
  // NOT set through the API here: the first PUT stamps onboarded_at
  // permanently and there is no route to undo it, which would break
  // onboarding-shot.ts and first-run-flow-shot.ts. See account-prefs.ts.
  const prefs = await openAccountPrefs(ctx, cookie);
  await prefs.setTheme(theme);
  await proxy(ctx, emptyDash);
  const page = await ctx.newPage();
  await page.addInitScript(seedCacheScript({
    theme,
    persona,
    extra: { 'ft-onboarding-complete': '1', 'nr-onboarding-complete': '1' },
  }));
  await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const outPath = `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/desktop_${persona}_${theme}_${path.replace(/[^a-z0-9]/gi, '_') || 'root'}.png`;
  await assertTheme(page, theme);
  await page.screenshot({ path: outPath, fullPage: false });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
  await prefs.restore();
  await ctx.close();
  console.log('saved', outPath);
}

for (const persona of ['market', 'budget'] as const) {
  for (const theme of ['void', 'arctic'] as const) {
    // Dashboard with empty accounts — shows persona-branched empty state.
    await shot(persona, theme, '/', true);
    // Dashboard with populated data — shows persona-branched KPI bar.
    await shot(persona, theme, '/?populated=1', false);
    // Settings connections.
    await shot(persona, theme, '/settings?panel=connections', false);
  }
}
await browser.close();
console.log('done');
