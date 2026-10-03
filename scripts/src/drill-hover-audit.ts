// Hovers every `.ft-drill` on the desktop routes and checks that the
// figure's text actually turns --ft-accent, not only its underline.
//
// `.ft-drill:hover` sets `color: var(--ft-accent)` and the text inherits it.
// An inline `color` on the drill or on any element between the drill and a
// text node beats that inheritance, so the underline goes accent while the
// digits stay green/red — the affordance says "press me" in half a voice.
// Labels inside a drill (a dim "NET WORTH" over the total) keep their own
// colour by design, so only text carrying a digit is checked.
// This prints every drill where some figure text does not reach the accent,
// with the element that carries the overriding colour.
//
// Needs the api-server on :3001 and Vite on :4321.
//   pnpm --filter @workspace/scripts exec tsx ./src/drill-hover-audit.ts
import { chromium, type BrowserContext } from 'playwright';
import { signInSeedUser, openAccountPrefs, assertRoute, type AccountPrefs } from './account-prefs.js';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const ROUTES = process.env.ROUTES ? process.env.ROUTES.split(',') : ['/', '/net-worth', '/accounts', '/transactions', '/budget', '/recurring', '/subscriptions', '/reports', '/calendar', '/briefing'];

const browser = await chromium.launch();

async function proxy(ctx: BrowserContext) {
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
      await route.fulfill({
        status: r.status(),
        headers: Object.fromEntries(r.headersArray().filter(h => !['set-cookie', 'content-length'].includes(h.name.toLowerCase())).map(h => [h.name, h.value])),
        body: await r.body(),
      });
    } catch (e) {
      if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
    }
  });
}

let total = 0;
let failing = 0;
let prefs: AccountPrefs | null = null;
try {
  // Takes the capture lock and pins nr-default-page to "/", so "/" below is the
  // dashboard; restore() in the finally puts the landing page back. Its own
  // context, so it outlives the audit context.
  const prefsCtx = await browser.newContext();
  prefs = await openAccountPrefs(prefsCtx, await signInSeedUser(prefsCtx));
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signInSeedUser(ctx);
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", "void");
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
  } catch (e) {}`);

  for (const path of ROUTES) {
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'domcontentloaded' });
    try { await page.waitForSelector('.ft-drill', { timeout: 20000 }); } catch { /* route may have none */ }
    try { await page.waitForFunction(() => document.querySelectorAll('.ft-skeleton, [data-skeleton]').length === 0, { timeout: 15000 }); } catch { /* measured anyway */ }
    await page.waitForTimeout(4000);
    if (path === '/') await assertRoute(page, '/');
    const drills = page.locator('.ft-drill');
    const n = await drills.count();
    let routeFails = 0;
    for (let i = 0; i < n; i++) {
      const d = drills.nth(i);
      if (!(await d.isVisible())) continue;
      try { await d.hover({ timeout: 2000 }); } catch { continue; }
      await page.waitForTimeout(160); // .ft-drill transitions colour over 120ms
      total++;
      const bad = await d.evaluate((el) => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--ft-accent)';
        el.appendChild(probe);
        const accent = getComputedStyle(probe).color;
        probe.remove();
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let t = walker.nextNode(); t; t = walker.nextNode()) {
          // The figure, not a label beside it: only text carrying a digit.
          if (!/\d/.test(t.textContent ?? '')) continue;
          const host = t.parentElement!;
          if (getComputedStyle(host).color === accent) continue;
          let culprit: Element | null = host;
          while (culprit && culprit !== el.parentElement && !(culprit as HTMLElement).style?.color) culprit = culprit.parentElement;
          const target = el.closest('a[href]') ?? el;
          return { where: `${target.getAttribute('href') ?? ''} ${el.getAttribute('title') ?? target.getAttribute('title') ?? ''}`.trim(), text: el.textContent?.trim().slice(0, 40), color: getComputedStyle(host).color, accent, culprit: culprit?.outerHTML.slice(0, 160) ?? null };
        }
        return null;
      });
      if (bad) {
        routeFails++;
        console.log(`  FAIL ${path} #${i} [${bad.where}] "${bad.text}" text=${bad.color} accent=${bad.accent}\n       culprit: ${bad.culprit}`);
      }
    }
    failing += routeFails;
    console.log(`${path}: ${n} drills, ${routeFails} whose figure does not turn accent on hover`);
  }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
} finally {
  try {
    await prefs?.restore();
  } finally {
    await browser.close();
  }
}
console.log(`TOTAL hovered=${total} failing=${failing}`);
process.exitCode = failing ? 1 : 0;
