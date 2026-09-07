// The change-attribution surface in both of its states, on both platforms.
//
// Same harness as insight-shot.ts: sign in against the API, proxy /api/**
// from the Vite origin so the cookies match, force the void theme, skip
// onboarding. No response rewriting — the point of this surface is that its
// parts add up, and rewriting the response would be screenshotting a fiction.
// The two states come from the database: run it once as it stands ("empty"),
// then again after attribution-fixture.ts --write ("fired").
//
// Usage: tsx scripts/src/attribution-shot.ts <label>

import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots';
const LABEL = process.argv[2] ?? 'plain';

const browser = await chromium.launch();

async function proxy(ctx: import('playwright').BrowserContext) {
  await ctx.route(`${FRONTEND}/api/**`, async route => {
    try {
      const req = route.request();
      const cs = await ctx.cookies();
      const r = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
        method: req.method(),
        headers: { ...req.headers(), origin: FRONTEND, cookie: cs.map(c => `${c.name}=${c.value}`).join('; ') },
        data: req.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      const headers = Object.fromEntries(r.headersArray()
        .filter(h => !['set-cookie', 'content-length'].includes(h.name.toLowerCase()))
        .map(h => [h.name, h.value]));
      await route.fulfill({ status: r.status(), headers, body: await r.body() });
    } catch (e) {
      if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
    }
  });
}

async function makePage(width: number, height: number) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) { console.error('sign-in failed', res.status(), await res.text()); process.exit(1); }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map(c => ({ ...c, name: c.name.replace(/^__Secure-/, ''), secure: false, sameSite: 'Lax' as const })));
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", "void");
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
  } catch (e) {}`);
  page.on('pageerror', e => console.log('  PAGE ERROR:', String(e).slice(0, 200)));
  page.on('response', r => { if (r.url().includes('/api/') && !r.ok()) console.log(`  API ${r.status()} ${r.url().replace(FRONTEND, '')}`); });
  return { ctx, page };
}

async function settle(page: import('playwright').Page) {
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch { console.log('  (networkidle timed out)'); }
  await page.waitForTimeout(3000);
}

// What the surface actually says, in text, next to the picture of it. A
// screenshot alone cannot be grepped and cannot be pasted into a report.
async function bandText(page: import('playwright').Page): Promise<string> {
  return page.evaluate(() => {
    const body = document.body.innerText;
    // The insufficient state on the phone has no label — it is one sentence,
    // deliberately, so look for the sentence too rather than reporting the
    // surface as absent.
    const empty = body.split('\n').find(l => l.startsWith('Not enough history'));
    const heads = Array.from(document.querySelectorAll('*'))
      .filter(el => el.children.length === 0 && (el.textContent ?? '').trim() === 'WHAT CHANGED');
    if (heads.length === 0) return empty ?? 'WHAT CHANGED not on the page';
    // Two levels up from the label is the panel/section that carries the rows.
    const box = heads[0].closest('div')?.parentElement?.parentElement;
    return (box?.innerText ?? heads[0].parentElement?.innerText ?? '').trim().replace(/\n+/g, ' | ');
  });
}

{
  const { ctx, page } = await makePage(1440, 900);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  console.log(`desktop /  → ${await bandText(page)}`);
  await page.screenshot({ path: `${OUT}/attribution_${LABEL}_desktop_dashboard.png`, fullPage: false });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

{
  const { ctx, page } = await makePage(390, 844);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  console.log(`phone /    → ${await bandText(page)}`);
  await page.screenshot({ path: `${OUT}/attribution_${LABEL}_phone_home.png`, fullPage: false });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

await browser.close();
console.log('done');
