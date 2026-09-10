// Phone detail-surface capture — 390x844, both themes, resting AND open.
//
// The lesson this repo paid twelve rounds for: a resting-state screenshot
// cannot see a defect that only exists once something is opened. So this
// captures the sheet open, and asserts the round trip a user actually makes:
// tap a row -> the id is in the URL -> hardware back closes the sheet.
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

const sheet = () => ({
  url: location.pathname + location.search,
  dialogs: document.querySelectorAll('[role="dialog"]').length,
  text: (document.querySelector('[role="dialog"]') as HTMLElement)?.innerText?.slice(0, 120).replace(/\n/g, ' | ') ?? null,
});

const bgByTheme = new Map<string, string>();
let failures = 0;
function check(label: string, ok: boolean, detail: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${JSON.stringify(detail)}`);
}

for (const theme of ['void', 'arctic'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await login(ctx);
  await proxy(ctx);
  // The theme lives on the SERVER, not in localStorage. Several existing
  // shot scripts still set `ft-theme` and silently capture the default
  // theme twice; passkey-shots.ts is the one that has it right. PUT it.
  {
    const cs = await ctx.cookies();
    const r = await ctx.request.put(`${API}/api/settings/theme`, {
      headers: { 'Content-Type': 'application/json', Origin: FRONTEND, cookie: cs.map(c => `${c.name}=${c.value}`).join('; ') },
      data: { theme },
    });
    if (!r.ok()) { console.error('theme PUT failed', theme, r.status(), await r.text()); process.exit(1); }
  }
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
  } catch (e) {}`);

  // resting
  await page.goto(`${FRONTEND}/worth`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  const applied = await page.evaluate(() => ({
    attr: document.documentElement.getAttribute('data-theme') ?? document.documentElement.className,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  // `void` is the default and stamps no attribute, so identity alone can't
  // prove it applied — the two themes producing the same background is the
  // failure this guards (an earlier run of this script captured `arctic`
  // as a second copy of `void` and said nothing).
  bgByTheme.set(theme, applied.bg);
  check(`${theme} theme applied`, theme === 'void' ? applied.attr === '' : applied.attr === theme, applied);
  await page.screenshot({ path: `${OUT}/phone-${theme}-worth-rest.png` });

  // tap the first account row — the interaction state the resting shot cannot see
  const before = page.url();
  await page.getByText('Monzo Current', { exact: false }).first().click();
  await page.waitForTimeout(900);
  const opened = await page.evaluate(sheet);
  check(`${theme} tap opens sheet`, opened.dialogs === 1, opened);
  check(`${theme} tap writes the id to the URL`, /[?&]account=\d+/.test(opened.url), opened.url);
  await page.screenshot({ path: `${OUT}/phone-${theme}-worth-account-open.png` });

  // hardware back must close it — the thing a local boolean could never do
  await page.goBack();
  await page.waitForTimeout(900);
  const closed = await page.evaluate(sheet);
  check(`${theme} back closes the sheet`, closed.dialogs === 0, closed);
  check(`${theme} back restores the URL`, closed.url === new URL(before).pathname, closed.url);

  // inbound drill — the defect this change exists to fix
  await page.goto(`${FRONTEND}/accounts?account=132`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  const inbound = await page.evaluate(sheet);
  check(`${theme} inbound /accounts?account= opens the sheet`, inbound.dialogs === 1, inbound);
  await page.screenshot({ path: `${OUT}/phone-${theme}-inbound-drill.png` });

  // a link to something that is gone says so, rather than opening empty
  await page.goto(`${FRONTEND}/accounts?account=99999`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const missing = await page.evaluate(sheet);
  check(`${theme} unknown id is stated, not blank`, /isn't on your balance sheet/.test(missing.text ?? ''), missing);
  await page.screenshot({ path: `${OUT}/phone-${theme}-unknown-id.png` });

  // HOME, where WHAT CHANGED lives
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/phone-${theme}-home.png` });

  await ctx.close();
}

await browser.close();
check('the two themes render different backgrounds', new Set(bgByTheme.values()).size === bgByTheme.size, Object.fromEntries(bgByTheme));
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
