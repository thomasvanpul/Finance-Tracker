import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';

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

async function shot(persona: string, theme: string, path: string, emptyDash: boolean) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await login(ctx);
  await proxy(ctx, emptyDash);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
    window.localStorage.setItem("ft-persona", JSON.stringify([${JSON.stringify(persona)}]));
  } catch (e) {}`);
  await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  const outPath = `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/desktop_${persona}_${theme}_${path.replace(/[^a-z0-9]/gi, '_') || 'root'}.png`;
  await page.screenshot({ path: outPath, fullPage: false });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
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
