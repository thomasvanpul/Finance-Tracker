import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots';

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
      await route.fulfill({
        status: r.status(),
        headers: Object.fromEntries(r.headersArray().filter(h => !['set-cookie','content-length'].includes(h.name.toLowerCase())).map(h => [h.name, h.value])),
        body: await r.body(),
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
  if (!res.ok()) { console.error('sign-in failed', res.status(), await res.text()); process.exit(1); }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map(c => ({ ...c, name: c.name.replace(/^__Secure-/, ''), secure: false, sameSite: 'Lax' as const })));
}

async function makePage(width: number, height: number) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
  await login(ctx);
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", "void");
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
  } catch (e) {}`);
  return { ctx, page };
}

// ── Desktop sweep ───────────────────────────────────────────────────────────
{
  const { ctx, page } = await makePage(1440, 900);
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(String(e)));

  for (const [path, name] of [['/', 'dashboard'], ['/net-worth', 'networth'], ['/accounts', 'accounts'], ['/transactions', 'transactions'], ['/budget', 'budget'], ['/recurring', 'recurring'], ['/subscriptions', 'subscriptions'], ['/reports', 'reports'], ['/calendar', 'calendar'], ['/briefing', 'briefing']] as const) {
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForSelector('.ft-drill, .ft-drill-target', { timeout: 20000 }); } catch {}
    // Widgets resolve their own queries, so one drill can appear while
    // three panels are still skeletons. Counting then understates the
    // page; wait for the skeletons to clear first.
    try { await page.waitForFunction(() => document.querySelectorAll('.ft-skeleton, [data-skeleton]').length === 0, { timeout: 15000 }); } catch {}
    await page.waitForTimeout(6000);
    const n = await page.locator('.ft-drill, .ft-drill-target').count();
    console.log(`${path}: ${n} drill targets`);
    await page.screenshot({ path: `${OUT}/drill_desktop_${name}.png`, fullPage: false });
  }

  // Hover affordance, close up.
  await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const first = page.locator('.ft-drill').first();
  const before = await first.evaluate(el => getComputedStyle(el).textDecorationColor);
  await first.hover();
  await page.waitForTimeout(300);
  const after = await first.evaluate(el => getComputedStyle(el).textDecorationColor);
  console.log(`hover: underline ${before} -> ${after}`);
  const box = await first.boundingBox();
  if (box) {
    await page.screenshot({
      path: `${OUT}/drill_hover_closeup.png`,
      clip: { x: Math.max(0, box.x - 160), y: Math.max(0, box.y - 60), width: 520, height: 160 },
    });
  }

  // Press a drill and confirm it lands on the rows.
  await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const target = page.locator('.ft-drill').first();
  const label = (await target.innerText()).trim();
  await target.click();
  await page.waitForTimeout(2000);
  console.log(`pressed "${label}" -> ${page.url()}`);
  await page.screenshot({ path: `${OUT}/drill_landed.png`, fullPage: false });

  if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 5));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// ── Phone sweep ─────────────────────────────────────────────────────────────
{
  const { ctx, page } = await makePage(390, 844);
  for (const [path, name] of [['/', 'home'], ['/spending', 'spending'], ['/net-worth', 'worth']] as const) {
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForSelector('.ft-drill, .ft-drill-target', { timeout: 20000 }); } catch {}
    // Widgets resolve their own queries, so one drill can appear while
    // three panels are still skeletons. Counting then understates the
    // page; wait for the skeletons to clear first.
    try { await page.waitForFunction(() => document.querySelectorAll('.ft-skeleton, [data-skeleton]').length === 0, { timeout: 15000 }); } catch {}
    await page.waitForTimeout(6000);
    const n = await page.locator('.ft-drill, .ft-drill-target').count();
    console.log(`phone ${path}: ${n} drill targets`);
    await page.screenshot({ path: `${OUT}/drill_phone_${name}.png`, fullPage: false });
  }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

await browser.close();
console.log('done');
