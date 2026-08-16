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
      // Force the dashboard endpoints to look empty so the empty-state UI fires.
      const url = req.url();
      let body = await r.body();
      let bodyText: string | null = null;
      const isJson = (r.headers()['content-type'] ?? '').includes('json');
      if (isJson && r.status() === 200) {
        try {
          const parsed = JSON.parse(body.toString('utf-8'));
          if (url.endsWith('/api/dashboard')) {
            parsed.accountBreakdown = [];
            parsed.netWorth = 0;
            parsed.totalCash = 0;
            parsed.unconvertibleAccounts = 0;
            parsed.thisMonth = parsed.thisMonth ?? { netSavings: 0 };
          }
          if (url.endsWith('/api/accounts')) {
            bodyText = JSON.stringify([]);
          }
          if (url.endsWith('/api/transactions')) {
            bodyText = JSON.stringify([]);
          }
          if (url.endsWith('/api/subscriptions')) {
            bodyText = JSON.stringify([]);
          }
          if (bodyText == null) bodyText = JSON.stringify(parsed);
          body = Buffer.from(bodyText, 'utf-8');
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
    await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/empty_home_${persona}_${theme}.png`, fullPage: false });
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.close();
    await ctx.close();
  }
}
await browser.close();
console.log('done');
