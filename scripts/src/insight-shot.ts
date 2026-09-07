// Each insight in its fired and unfired state.
//
// Same harness as drill-sweep-shot: sign in against the API, proxy /api/**
// from the Vite origin so cookies match, force the void theme, skip
// onboarding. Phone viewport for the three slots, desktop for the
// reconciliation panel.
//
// The seed data is well-behaved — it is a realistic month, so most of these
// insights are correctly SILENT on it, which is the whole point of them. To
// see a fired state, each scenario applies ONE stated perturbation and lets
// the real client logic do the rest. The perturbations are response rewrites
// in this harness; nothing is written to the database and nothing here runs
// in the product.
//
//   fx-fired          dismiss the reconciliation insight, so the WORTH slot
//                     falls through to the next-ranked candidate. Requires
//                     backdated snapshots to exist.
//   trough-fired      empty the two GBP cash accounts and set the clock to the
//                     day after payday. The recurring series, the dates and
//                     the projection are all real.
//   unbudgeted-fired  fix the clock to a month with real spending and drop ONE
//                     budget from /api/budgets.
//
// Usage: tsx scripts/src/insight-shot.ts <scenario>

import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots';
const SCENARIO = process.argv[2] ?? 'plain';

type Rewrite = (url: string, body: any) => any;

interface Scenario {
  /** Insight ids to pre-dismiss, as a real user's localStorage would hold. */
  dismiss: string[];
  /**
   * Press the slot's own dismiss control on this screen and look again, so
   * the next-ranked candidate is revealed the way a user would reveal it.
   * More honest than guessing the dismissed insight's id.
   */
  dismissOn?: string;
  /** Fixed wall-clock time, when the scenario needs a month with data in it. */
  clock?: string;
  rewrite?: Rewrite;
}

// One stated rule rather than two magic numbers: the two GBP cash accounts
// are emptied, and the real foreign balances (Wise EUR £464.64, Maybank MYR
// £361.69) are left exactly as they are. Investments, pension and property
// are untouched, so the balance sheet still reads as the same person's.
const EMPTIED_GBP_CASH = new Set([132, 133]);
const LOW_CASH: Rewrite = (url, body) => {
  if (!url.includes('/api/dashboard') || body?.accountBreakdown == null) return body;
  return {
    ...body,
    accountBreakdown: body.accountBreakdown.map((a: any) =>
      EMPTIED_GBP_CASH.has(a.id) ? { ...a, balance: 0, baseEquivalent: 0 } : a),
  };
};

const NO_RENT_BUDGET: Rewrite = (url, body) =>
  url.includes('/api/budgets') && Array.isArray(body)
    ? body.filter((b: any) => b.category !== 'Rent / Mortgage')
    : body;

const SCENARIOS: Record<string, Scenario> = {
  plain: { dismiss: [] },
  // Same configuration as `plain`, run against a database with no balance
  // snapshot at all. Separate name only so the two sets of files do not
  // overwrite each other. This is the honest unfired state for (b) and for
  // the reconciliation gap: no snapshot, no claim.
  'no-snapshot': { dismiss: [] },
  'fx-fired': { dismiss: [], dismissOn: '/net-worth' },
  // The projected low only exists after payday: on the real ledger the
  // stipend lands 9 Sep and the rent 12 Sep, so before the 9th the minimum
  // IS today's balance and the producer correctly says nothing. Measured
  // 2026-09-07 by running the producer against the live /api/transactions.
  'trough-fired': { dismiss: [], clock: '2026-09-10T10:00:00Z', rewrite: LOW_CASH },
  'unbudgeted-fired': { dismiss: [], clock: '2026-08-20T10:00:00Z', rewrite: NO_RENT_BUDGET },
};

const scenario = SCENARIOS[SCENARIO];
if (scenario == null) { console.error(`unknown scenario ${SCENARIO}; have ${Object.keys(SCENARIOS).join(', ')}`); process.exit(1); }

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
      // Express sends `Content-Type`, so a lowercase key lookup silently
      // misses and every rewrite is skipped. Found the hard way.
      const contentType = Object.entries(headers)
        .find(([k]) => k.toLowerCase() === 'content-type')?.[1] ?? '';
      let body = await r.body();
      if (scenario.rewrite && r.ok() && contentType.includes('json')) {
        try {
          const rewritten = scenario.rewrite(req.url(), JSON.parse(body.toString()));
          body = Buffer.from(JSON.stringify(rewritten));
        } catch { /* not JSON after all — pass it through untouched */ }
      }
      await route.fulfill({ status: r.status(), headers, body });
    } catch (e) {
      if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
    }
  });
}

// `nr-dismissed-insights` is an ACCOUNT-level key (lib/account-storage-keys.ts),
// so the app syncs it to /api/settings/preferences and hydrates it back over
// whatever localStorage held. Seeding localStorage alone is therefore
// overwritten a moment later, and — worse — a dismiss click in one run
// suppressed that insight in every run afterwards. That is what made the
// reconciliation insight silently disappear on 2026-09-07. Set the server
// copy instead, and clear it again when the run finishes.
async function setDismissals(ctx: import('playwright').BrowserContext, ids: readonly string[]) {
  const res = await ctx.request.patch(`${API}/api/settings/preferences`, {
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND },
    data: { preferences: { 'nr-dismissed-insights': ids.length === 0 ? null : JSON.stringify(ids) } },
  });
  if (!res.ok()) console.log(`  (could not set dismissals: ${res.status()})`);
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
  await setDismissals(ctx, scenario.dismiss);
  const page = await ctx.newPage();
  if (scenario.clock) await page.clock.setFixedTime(new Date(scenario.clock));
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", "void");
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
    window.localStorage.setItem("nr-dismissed-insights", ${JSON.stringify(JSON.stringify(scenario.dismiss))});
  } catch (e) {}`);
  page.on('pageerror', e => console.log('  PAGE ERROR:', String(e).slice(0, 200)));
  page.on('response', r => { if (r.url().includes('/api/') && !r.ok()) console.log(`  API ${r.status()} ${r.url().replace(FRONTEND, '')}`); });
  return { ctx, page };
}

// The phone screens render inline-styled placeholder bars, not a .ft-skeleton
// class, so there is nothing to wait for by selector. Wait for the network to
// go quiet instead — a screenshot of a still-loading page must be visible
// rather than plausible.
async function settle(page: import('playwright').Page) {
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch { console.log('  (networkidle timed out)'); }
  await page.waitForTimeout(4000);
}

async function slotText(page: import('playwright').Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.querySelector('[data-insight-slot]');
    if (!el) return 'none (slot renders nothing)';
    return `[${el.getAttribute('data-insight-slot')}] ${(el.textContent ?? '').trim()}`;
  });
}

// ── Phone: the three slots ─────────────────────────────────────────────────
{
  const { ctx, page } = await makePage(390, 844);
  for (const [path, name] of [['/', 'home'], ['/spending', 'spending'], ['/net-worth', 'worth']] as const) {
    await page.goto(`${FRONTEND}${path}`, { waitUntil: 'domcontentloaded' });
    await settle(page);
    if (scenario.dismissOn === path) {
      const before = await slotText(page);
      const btn = page.locator('[aria-label="Dismiss insight"]').first();
      if (await btn.count() > 0) {
        await btn.click();
        await page.waitForTimeout(1500);
        console.log(`phone ${path} dismissed: ${before}`);
      }
    }
    console.log(`phone ${path} slot: ${await slotText(page)}`);
    await page.screenshot({ path: `${OUT}/insight_${SCENARIO}_phone_${name}.png`, fullPage: false });
  }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// ── Desktop: the reconciliation panel, where (c)'s note lives ──────────────
{
  const { ctx, page } = await makePage(1440, 900);
  await page.goto(`${FRONTEND}/accounts`, { waitUntil: 'domcontentloaded' });
  await settle(page);
  const state = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      untracked: text.includes('balance kept by hand'),
      insufficient: /not enough history/i.test(text),
    };
  });
  console.log(`desktop /accounts — untracked note: ${state.untracked}, insufficient: ${state.insufficient}`);
  try {
    await page.locator('text=/balance kept by hand/').first().scrollIntoViewIfNeeded({ timeout: 4000 });
  } catch {
    try { await page.locator('text=/RECONCIL/i').first().scrollIntoViewIfNeeded({ timeout: 4000 }); } catch { console.log('  reconciliation panel not located'); }
  }
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/insight_${SCENARIO}_desktop_accounts.png`, fullPage: false });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// Leave the account as it was found: a dismissal made for a screenshot is
// not the user's, and it would suppress the same insight in the next run.
{
  const ctx = await browser.newContext();
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (res.ok()) await setDismissals(ctx, []);
  await ctx.close();
}

await browser.close();
console.log('done');
