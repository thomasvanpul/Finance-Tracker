// J27 verification sweep. Photographs the phone tabs at 390 in `void`,
// with NO response rewriting — the point of this task is what the API
// actually supplies, so a proxy that injects a dayChange (as
// mobilehome-shot.ts does) would defeat it.
//
// Usage: pnpm tsx scripts/src/j27-phone-sweep.ts <label>
import { chromium } from 'playwright';
import { FRONTEND, API, signInSeedUser, openAccountPrefs, seedCacheScript, assertTheme } from './account-prefs.js';
import { acquireCaptureLock } from './capture-lock.js';

const label = process.argv[2] ?? 'before';
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/.review/shots';

const ROUTES: Array<{ slug: string; path: string }> = [
  { slug: 'home',      path: '/' },
  { slug: 'worth',     path: '/worth' },
  { slug: 'spending',  path: '/spending' },
  { slug: 'directory', path: '/directory' },
];

const release = acquireCaptureLock('j27-phone-sweep');
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const cookie = await signInSeedUser(ctx);
  const prefs = await openAccountPrefs(ctx, cookie);
  await prefs.setTheme('void');
  await prefs.setPersona('budget');
  // Pass /api straight through to the API server, unmodified.
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
      headers: Object.fromEntries(r.headersArray().filter(h => !['set-cookie','content-length'].includes(h.name.toLowerCase())).map(h => [h.name, h.value])),
      body: await r.body(),
    });
  });
  const page = await ctx.newPage();
  await page.addInitScript(seedCacheScript({
    theme: 'void', persona: 'budget',
    extra: { 'ft-onboarding-complete': '1', 'nr-onboarding-complete': '1' },
  }));
  for (const { slug, path } of ROUTES) {
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    if (slug === 'home') await assertTheme(page, 'void');
    await page.screenshot({ path: `${OUT}/j27-${label}-${slug}.png`, fullPage: true });
    console.log('saved', slug);
  }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
  await prefs.restore();
  await ctx.close();
} finally {
  await browser.close();
  release();
}
console.log('done', label);
