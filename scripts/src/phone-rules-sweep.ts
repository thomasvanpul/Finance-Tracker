// DESIGN.md §13 sweep for the phone. Photographs HOME, WORTH, SPENDING and
// DIRECTORY at 390 in one dark and one light theme, with the theme set
// through the API and NO response rewriting — same harness as
// j27-phone-sweep.ts, widened to both themes.
//
// Usage: pnpm tsx scripts/src/phone-rules-sweep.ts <label> [theme ...]
import { chromium } from 'playwright';
import { FRONTEND, API, signInSeedUser, openAccountPrefs, seedCacheScript, assertTheme } from './account-prefs.js';
import { acquireCaptureLock } from './capture-lock.js';

const label = process.argv[2] ?? 'before';
const themes = process.argv.length > 3 ? process.argv.slice(3) : ['void', 'arctic'];
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/.review/shots';

const ROUTES: Array<{ slug: string; path: string }> = [
  { slug: 'home',      path: '/' },
  { slug: 'worth',     path: '/worth' },
  { slug: 'spending',  path: '/spending' },
  { slug: 'directory', path: '/directory' },
];

const release = acquireCaptureLock('phone-rules-sweep');
const browser = await chromium.launch();
try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const cookie = await signInSeedUser(ctx);
  const prefs = await openAccountPrefs(ctx, cookie);
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
  for (const theme of themes) {
    await prefs.setTheme(theme);
    const page = await ctx.newPage();
    await page.addInitScript(seedCacheScript({
      theme, persona: 'budget',
      extra: { 'ft-onboarding-complete': '1', 'nr-onboarding-complete': '1' },
    }));
    for (const { slug, path } of ROUTES) {
      await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      await assertTheme(page, theme);
      // The shell scrolls an inner container, so fullPage stops at the
      // viewport. Step through the tallest scroller one screen at a time.
      const steps = await page.evaluate(() => {
        const el = Array.from(document.querySelectorAll<HTMLElement>('*'))
          .filter(e => ['auto', 'scroll'].includes(getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight)
          .sort((a, b) => b.scrollHeight - a.scrollHeight)[0];
        if (!el) return 1;
        el.setAttribute('data-sweep-scroller', '');
        return Math.ceil(el.scrollHeight / (el.clientHeight - 80));
      });
      for (let i = 0; i < steps; i++) {
        await page.evaluate(n => {
          const el = document.querySelector<HTMLElement>('[data-sweep-scroller]');
          if (el) el.scrollTop = n * (el.clientHeight - 80);
        }, i);
        await page.waitForTimeout(250);
        await page.screenshot({ path: `${OUT}/rules-${label}-${theme}-${slug}-${i}.png` });
      }
      console.log('saved', theme, slug, steps);
    }
    await page.close();
  }
  await prefs.restore();
  await ctx.close();
} finally {
  await browser.close();
  release();
}
console.log('done', label);
