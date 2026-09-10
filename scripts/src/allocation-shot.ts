// The allocation surface, every state, both viewports, with the interaction
// states photographed rather than reasoned about.
//
// Why the interaction states are in scope: the last design round found a
// figure clipping to "£229,6", a drag with no drop indicator and a header
// collision on 12 of 20 widgets — all in the first pass that actually
// photographed hover and active states after twelve rounds that had not.
// A drill that is wired is not a drill that is visible (DESIGN.md §14), and
// only a screenshot says which you have.
//
// Harness is attribution-converge-shot.ts's, unchanged: sign in against the
// API, proxy /api/** from the Vite origin so cookies match, set the theme
// through the API (never localStorage — the account theme wins once
// theme-sync hydrates, and five earlier scripts captured the default theme
// twice while labelling one `parchment`).
//
// The BLOCKER state is the one every real user sees for their first week.
// Whether it or the populated state is live depends on how much snapshot
// history the dev branch holds — see attribution-fixture.ts, which writes a
// backdated baseline day. This script photographs whichever state is live
// and PRINTS which, so a shot is never mistaken for the other one.
//
// Usage:
//   tsx scripts/src/allocation-shot.ts <suffix>
import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';
import { acquireCaptureLock } from './capture-lock.js';

// One capture at a time: this PUTs the seed account's theme, an account-level
// column shared with every other capture script.
acquireCaptureLock();

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots';
const SUFFIX = process.argv[2] ?? 'state';

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

async function setTheme(ctx: import('playwright').BrowserContext, theme: string) {
  const r = await ctx.request.put(`${API}/api/settings/theme`, {
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND }, data: { theme },
  });
  if (!r.ok()) { console.error('theme PUT failed', theme, r.status()); process.exit(1); }
}

// What the band actually says, read out of the DOM. A figure that renders
// clipped still reads as a full string here, so the width of its box is
// measured alongside the width of its text — that difference IS the clip.
const bandMarks = (key: string) => {
  const root = Array.from(document.querySelectorAll('*')).find(
    el => (el as HTMLElement).innerText?.replace(/\s+/g, ' ').includes(key)
      && el.children.length < 12
      && (el as HTMLElement).innerText.length < 600,
  ) as HTMLElement | undefined;
  if (root == null) return { found: false, text: '', figures: [] as string[], clipped: [] as string[] };
  const clipped: string[] = [];
  for (const n of Array.from(root.querySelectorAll('.pnum, [class*="pnum"]'))) {
    const el = n as HTMLElement;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.innerText} (${el.clientWidth}<${el.scrollWidth})`);
  }
  return {
    found: true,
    text: root.innerText.replace(/\n/g, ' | '),
    figures: (root.innerText.match(/[+-]?[£$][\d,]+\.\d\d/g) ?? []),
    clipped,
  };
};

let failures = 0;
function check(label: string, ok: boolean, detail: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${JSON.stringify(detail)}`);
}

// Which state is live, straight from the API, so every shot below is
// labelled with the state it actually shows AND every check below expects
// the right thing. The disclosure exists only where there is a figure to
// decompose; asserting it unconditionally reported the blocker state — the
// state this task exists to build — as two failures.
let hasFigure = false;
{
  const ctx = await browser.newContext();
  await login(ctx);
  const r = await ctx.request.get(`${API}/api/allocation`, { headers: { Origin: FRONTEND } });
  const a = await r.json() as { status: string; dailyAllowance: number | null; driftDays: number; minDriftDays: number; blockers: string[] };
  hasFigure = a.dailyAllowance != null;
  console.log(`\nLIVE STATE  status=${a.status} allowance=${a.dailyAllowance} driftDays=${a.driftDays}/${a.minDriftDays} blockers=${JSON.stringify(a.blockers)}\n`);
  await ctx.close();
}

// ── Phone: SPENDING ─────────────────────────────────────────────────────────
for (const theme of ['void', 'arctic'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await login(ctx);
  await setTheme(ctx, theme);
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try{window.localStorage.setItem("ft-onboarding-complete","1");window.localStorage.setItem("nr-onboarding-complete","1")}catch(e){}`);
  await page.goto(`${FRONTEND}/spending`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2600);

  const m = await page.evaluate(bandMarks, 'SAFE TO SPEND');
  check(`phone ${theme} band present`, m.found, m.text.slice(0, 150));
  check(`phone ${theme} nothing clipped`, m.clipped.length === 0, m.clipped);
  await page.screenshot({ path: `${OUT}/alloc-phone-${theme}-${SUFFIX}.png`, fullPage: false });
  await ctx.close();
}

// ── Desktop: the dashboard band, closed then with workings open ─────────────
for (const theme of ['void', 'arctic'] as const) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await login(ctx);
  await setTheme(ctx, theme);
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try{window.localStorage.setItem("ft-onboarding-complete","1");window.localStorage.setItem("nr-onboarding-complete","1")}catch(e){}`);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2800);

  const m = await page.evaluate(bandMarks, 'SAFE TO SPEND');
  check(`desktop ${theme} band present`, m.found, m.text.slice(0, 180));
  check(`desktop ${theme} nothing clipped`, m.clipped.length === 0, m.clipped);
  await page.screenshot({ path: `${OUT}/alloc-desktop-${theme}-${SUFFIX}-closed.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } });

  // The band's own Workings, not WHAT CHANGED's. Both say "Workings", so the
  // one inside the SAFE TO SPEND row is selected by its row, not by its text
  // — picking the first match on the page opens the wrong band.
  // Two scopes, deliberately. `.last()` is the innermost div whose text
  // starts with the key — the header row, which is where Workings lives and
  // where the OTHER band's Workings must not be reachable from. `.first()`
  // is the outermost — the whole band, which is where the legs appear once
  // the disclosure is open. Using the header for both found zero leg drills
  // and skipped the check in silence.
  const row = page.locator('div', { hasText: /^SAFE TO SPEND/ }).last();
  const band = page.locator('div', { hasText: /^SAFE TO SPEND/ }).first();
  const workings = row.getByText('Workings', { exact: true }).first();
  const workingsCount = await workings.count();
  const hasWorkings = workingsCount > 0;
  // Offered exactly when there is a figure, and NOT offered otherwise: in
  // the waiting state the legs that were computed are inputs to a number
  // that does not exist, and putting them under a toggle invites the reader
  // to do the subtraction and arrive at the partial figure the engine
  // withheld on purpose.
  check(`desktop ${theme} workings offered iff figure`, hasWorkings === hasFigure, { workingsCount, hasFigure });

  if (hasWorkings) {
    // Hover first, and photograph it: the drill affordance is meant to be
    // visible at rest AND to take the accent on hover (§14).
    await workings.hover();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/alloc-desktop-${theme}-${SUFFIX}-hover.png`, clip: { x: 0, y: 0, width: 1440, height: 260 } });

    await workings.click();
    await page.waitForTimeout(500);
    const open = await page.evaluate(bandMarks, 'SAFE TO SPEND');
    check(`desktop ${theme} workings nothing clipped`, open.clipped.length === 0, open.clipped);
    console.log(`      OPEN ${theme}: ${open.text.slice(0, 400)}`);
    await page.screenshot({ path: `${OUT}/alloc-desktop-${theme}-${SUFFIX}-open.png`, clip: { x: 0, y: 0, width: 1440, height: 460 } });

    // A leg drill, hovered. This is the check §14 says only a screenshot
    // can make: the underline is painted by the PARENT's computed value and
    // an inline-block child swallows it.
    // Scoped to the band. Picking the last drill on the PAGE selected one
    // in a widget below the fold and reported "none" for a mark that was
    // never being looked at.
    const leg = band.locator('a.ft-drill, a:has(.ft-drill)').filter({ hasText: /£/ }).first();
    const legCount = await leg.count();
    // Not a silent skip. "No leg drill found" and "the leg drill draws
    // nothing" are the same finding to a reader of this report, and the
    // first version of this check reported neither because it returned early.
    check(`desktop ${theme} leg drill present`, legCount > 0, { legCount });
    if (legCount > 0) {
      await leg.hover();
      await page.waitForTimeout(200);
      const deco = await leg.evaluate((el) => {
        const child = el.querySelector('*') ?? el;
        const cs = getComputedStyle(child as Element);
        return { line: cs.textDecorationLine, colour: cs.textDecorationColor };
      });
      check(`desktop ${theme} leg drill underlined on hover`, deco.line.includes('underline'), deco);
      await page.screenshot({ path: `${OUT}/alloc-desktop-${theme}-${SUFFIX}-drill-hover.png`, clip: { x: 0, y: 0, width: 1440, height: 460 } });
    }
  }
  await ctx.close();
}

await browser.close();
console.log(failures === 0 ? '\nall checks passed' : `\n${failures} check(s) failed`);
process.exit(failures === 0 ? 0 : 1);
