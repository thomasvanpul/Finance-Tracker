// One-off: the whole HOME screen in a single frame. The phone shell scrolls
// an inner container, so fullPage at 390x844 stops at the fold and the FX
// rows below MARKETS never appear. A tall viewport renders the container in
// full. Layout below 768px is unchanged by height, so this is the same
// screen, not a different one.
import { chromium } from 'playwright';
import { FRONTEND, API, signInSeedUser, openAccountPrefs, seedCacheScript } from './account-prefs.js';
import { acquireCaptureLock } from './capture-lock.js';

const label = process.argv[2] ?? 'after';
const release = acquireCaptureLock('j27-home-tall');
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 2000 }, deviceScaleFactor: 2 });
  const cookie = await signInSeedUser(ctx);
  const prefs = await openAccountPrefs(ctx, cookie);
  await prefs.setTheme('void');
  await prefs.setPersona('budget');
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
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/.review/shots/j27-${label}-home-tall.png`, fullPage: true });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
  await prefs.restore();
  await ctx.close();
} finally {
  await browser.close();
  release();
}
console.log('done', label);
