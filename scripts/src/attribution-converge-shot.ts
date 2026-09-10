// WHAT CHANGED after the convergence — the phone block on WORTH at 390x844
// in both themes, and the desktop one-liner with its workings disclosed at
// 1440x900.
//
// The point of capturing both is that they must show the SAME rows. Until
// today the phone rendered no per-account breakdown at all, so a reader on
// the phone saw "the rate moved · 3 currencies" and had no way to reach the
// three. This asserts the two surfaces agree on the row labels and figures,
// which is the whole claim of "one rendering, two densities".
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

let failures = 0;
function check(label: string, ok: boolean, detail: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${JSON.stringify(detail)}`);
}

// Every drill href inside the WHAT CHANGED surface, plus the text of the
// row it sits on. Two surfaces rendering one report must agree on these.
const marks = () => {
  const root = Array.from(document.querySelectorAll('*')).find(
    el => (el as HTMLElement).innerText?.startsWith('WHAT CHANGED')
      && (el as HTMLElement).querySelectorAll('a[href]').length > 0
      && el.children.length < 8,
  ) as HTMLElement | undefined;
  const scope = root ?? document.body;
  return {
    found: root != null,
    hrefs: Array.from(scope.querySelectorAll('a[href]')).map(a => a.getAttribute('href') ?? '').filter(h => h !== ''),
    figures: (scope.innerText.match(/[+-]?[£$][\d,]+\.\d\d/g) ?? []),
    text: scope.innerText.replace(/\n/g, ' | '),
  };
};

const bg = new Map<string, string>();

// ── Phone: WORTH, both themes ────────────────────────────────────────────
let phoneMarks: ReturnType<typeof marks> | null = null;
for (const theme of ['void', 'arctic'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await login(ctx);
  // The theme is server-side. Setting localStorage["ft-theme"] captures the
  // default theme twice and the two shots come out pixel-identical.
  const r = await ctx.request.put(`${API}/api/settings/theme`, {
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND }, data: { theme },
  });
  if (!r.ok()) { console.error('theme PUT failed', theme, r.status()); process.exit(1); }
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try{window.localStorage.setItem("ft-onboarding-complete","1");window.localStorage.setItem("nr-onboarding-complete","1")}catch(e){}`);
  await page.goto(`${FRONTEND}/net-worth`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const applied = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme') ?? '',
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  check(`${theme} applied`, theme === 'void' ? applied.attr === '' : applied.attr === theme, applied);
  bg.set(theme, applied.bg);

  const m = await page.evaluate(marks);
  check(`${theme} WORTH carries WHAT CHANGED`, m.found, { found: m.found });
  check(`${theme} it drills`, m.hrefs.length > 0, { hrefs: m.hrefs.length });
  if (theme === 'void') phoneMarks = m;
  await page.screenshot({ path: `${OUT}/phone-${theme}-worth-attribution.png` });

  // It must be gone from HOME — one finding, one place.
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  const home = await page.evaluate(() => document.body.innerText);
  check(`${theme} HOME no longer states it`, !/WHAT CHANGED/.test(home), { has: /WHAT CHANGED/.test(home) });
  await ctx.close();
}
check('the two themes render different grounds', bg.get('void') !== bg.get('arctic'), Object.fromEntries(bg));

// ── Desktop: the one-liner, workings disclosed ───────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await login(ctx);
  await ctx.request.put(`${API}/api/settings/theme`, { headers: { 'Content-Type': 'application/json', Origin: FRONTEND }, data: { theme: 'void' } });
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try{window.localStorage.setItem("ft-onboarding-complete","1");window.localStorage.setItem("nr-onboarding-complete","1")}catch(e){}`);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);
  const toggle = page.locator('text=Workings').first();
  const hasToggle = await toggle.count() > 0;
  check('desktop still offers the workings disclosure', hasToggle, { hasToggle });
  if (hasToggle) { await toggle.click(); await page.waitForTimeout(700); }
  const d = await page.evaluate(marks);
  await page.screenshot({ path: `${OUT}/desktop-attribution-workings.png`, clip: { x: 0, y: 0, width: 1440, height: 460 } });

  // The convergence claim, asserted rather than asserted-about: both
  // densities render the same drill targets and the same figures.
  if (phoneMarks != null) {
    const p = new Set(phoneMarks.hrefs), q = new Set(d.hrefs);
    const missing = [...q].filter(h => !p.has(h));
    check('phone drills to everything desktop drills to', missing.length === 0, { missing });
    const pf = new Set(phoneMarks.figures), qf = new Set(d.figures);
    const lost = [...qf].filter(f => !pf.has(f));
    check('phone states every figure desktop states', lost.length === 0, { lost });
  }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
