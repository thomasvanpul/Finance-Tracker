import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';

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
      const body = await r.body();
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

async function login(ctx: import('playwright').BrowserContext) {
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { 'Content-Type': 'application/json', 'Origin': FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) { console.error('sign-in failed'); process.exit(1); }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map(c => ({ ...c, name: c.name.replace(/^__Secure-/, ''), secure: false, sameSite: 'Lax' as const })));
}

// Per-persona routes to visit (>=3 per persona). Slot-2 route is the
// one that should light for that persona.
const ROUTES: Record<string, string[]> = {
  market: ['/', '/investments', '/accounts'],
  budget: ['/', '/upcoming', '/accounts'],
  wealth: ['/', '/goals', '/accounts'],
  social: ['/', '/owing', '/accounts'],
};

for (const persona of Object.keys(ROUTES)) {
  for (const theme of ['void', 'arctic'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await login(ctx);
    await proxy(ctx);
    for (const route of ROUTES[persona]!) {
      const page = await ctx.newPage();
      await page.addInitScript(`try {
        window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
        window.localStorage.setItem("ft-onboarding-complete", "1");
        window.localStorage.setItem("nr-onboarding-complete", "1");
        window.localStorage.setItem("ft-persona", JSON.stringify([${JSON.stringify(persona)}]));
      } catch (e) {}`);
      await page.goto(`${FRONTEND}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const slug = route.replace(/[^a-z0-9]/gi, '_') || 'root';
      await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/nav_${persona}_${theme}_${slug}.png`, fullPage: false });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
    }
    await ctx.close();
    console.log('done', persona, theme);
  }
}
await browser.close();
console.log('all done');
