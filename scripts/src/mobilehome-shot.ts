import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from '../../scripts/src/seed-credentials.js';

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

async function login(ctx: import('playwright').BrowserContext) {
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { 'Content-Type': 'application/json', 'Origin': FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) { console.error('sign-in failed', res.status()); process.exit(1); }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map(c => ({ ...c, name: c.name.replace(/^__Secure-/, ''), secure: false, sameSite: 'Lax' as const })));
}

for (const persona of ['market', 'budget'] as const) {
  for (const theme of ['void', 'arctic'] as const) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await login(ctx);
    await proxy(ctx);
    const page = await ctx.newPage();
    await page.addInitScript(`try {
      window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
      window.localStorage.setItem("ft-onboarding-complete", "1");
      window.localStorage.setItem("nr-onboarding-complete", "1");
      window.localStorage.setItem("ft-persona", JSON.stringify([${JSON.stringify(persona)}]));
    } catch (e) {}`);
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/mobilehome_${persona}_${theme}.png`, fullPage: false });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
    await ctx.close();
    console.log('saved', persona, theme);
  }
}
await browser.close();
console.log('done');
