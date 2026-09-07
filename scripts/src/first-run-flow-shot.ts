// Walks the whole first-run experience end to end against a brand-new
// user, so every screen is exercised with the data a real new account
// actually has: none.
//
//   1. sign-up            (a fresh email, never seen by the server)
//   2. questionnaire      (two questions — the bank question is gone)
//   3. account step       (the real create mutation)
//   4. landing            (five widgets + the CUSTOMIZE discovery tile)
//   5. second device      (same user, clean localStorage — must NOT re-ask)
//   6. skip path          (another fresh user, skips both steps)
//   7. skipper's 2nd device (the skip path user again, clean storage —
//                            must NOT re-ask; this is the case the
//                            persona string alone could not carry)
//
// Run with the dev API on :3001 and Vite on :4321.
import { chromium, type BrowserContext } from 'playwright';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots';
const PASSWORD = 'Numeris-Dev-FirstRun-2026!';

const browser = await chromium.launch();

// Every account this script signs up, so the cleanup at the bottom can delete
// them. Recorded here rather than at each call site because the leak this
// fixes came from exactly that: four sign-ups, no list of them anywhere, and
// nothing to delete them by. A new pass added later is cleaned up for free.
const created: string[] = [];

function freshEmail(tag: string): string {
  const email = `firstrun-${tag}-${Date.now()}@numeris.local`;
  created.push(email);
  return email;
}

// Deletes every account this run created, through the app's own deletion
// endpoint rather than by touching the database — the same path a user takes,
// so the cascade is the real one and nothing is left behind in the 25 tables
// that carry a userId.
//
// This runs on the failure paths too. Thirty-three of these accounts were
// found on the dev branch on 7 Sep 2026 from runs on 6 Sep; a script that
// leaks only when it aborts leaks just as permanently as one that never
// cleaned up at all.
async function cleanupCreatedUsers(): Promise<void> {
  if (created.length === 0) return;
  let gone = 0;
  for (const email of created.splice(0)) {
    try {
      const ctx = await browser.newContext();
      const signIn = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
        headers: { 'Content-Type': 'application/json', 'Origin': FRONTEND },
        data: { email, password: PASSWORD },
      });
      if (signIn.ok()) {
        const del = await ctx.request.post(`${API}/api/account/delete`, {
          headers: { 'Content-Type': 'application/json', 'Origin': FRONTEND },
          data: { email },
        });
        if (del.ok()) gone += 1;
        else console.error('cleanup: delete failed for', email, del.status(), await del.text());
      } else {
        console.error('cleanup: sign-in failed for', email, signIn.status());
      }
      await ctx.close();
    } catch (e) {
      console.error('cleanup: threw for', email, e instanceof Error ? e.message : e);
    }
  }
  console.log(`\ncleanup: deleted ${gone} of ${gone + created.length} account(s) this run created`);
}

// An abort must still clean up. Without these the script leaks on every failed
// assertion, which is how the strays accumulated.
for (const signal of ['uncaughtException', 'unhandledRejection'] as const) {
  process.on(signal, async (err) => {
    console.error(`\n${signal}:`, err);
    await cleanupCreatedUsers().catch(() => {});
    await browser.close().catch(() => {});
    process.exit(1);
  });
}



// Proxies /api/** from the Vite origin to the API server, carrying the
// context's cookies. Same shape as onboarding-shot.ts.
async function proxyApi(ctx: BrowserContext): Promise<void> {
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
      const body = await r.body();
      await route.fulfill({
        status: r.status(),
        headers: Object.fromEntries(
          r.headersArray()
            .filter(h => !['set-cookie', 'content-length'].includes(h.name.toLowerCase()))
            .map(h => [h.name, h.value])),
        body,
      });
    } catch (e) {
      if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
    }
  });
}

async function authed(email: string, mode: 'sign-up' | 'sign-in'): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const res = await ctx.request.post(`${API}/api/auth/${mode}/email`, {
    headers: { 'Content-Type': 'application/json', 'Origin': FRONTEND },
    data: mode === 'sign-up'
      ? { email, password: PASSWORD, name: 'First Run' }
      : { email, password: PASSWORD },
  });
  if (!res.ok()) throw new Error(`${mode} failed ${res.status()} ${await res.text()}`);
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map(c => ({ ...c, name: c.name.replace(/^__Secure-/, ''), secure: false, sameSite: 'Lax' as const })));
  await proxyApi(ctx);
  return ctx;
}

const clean = `try {
  window.localStorage.setItem("ft-theme", "void");
  ["ft-onboarding-complete","nr-onboarding-complete","ft-onboarding-dismissed",
   "ft-persona","nr-onboarding-followup","nr-customize-discovered",
   "ft-dashboard-customize-mode","ft-widgets"].forEach(function(k){
    window.localStorage.removeItem(k);
  });
} catch (e) {}`;

function clickByAria(label: string): string {
  return `(function(){
    var b = Array.from(document.querySelectorAll('button[aria-label]'))
      .find(function(n){ return n.getAttribute('aria-label') === ${JSON.stringify(label)}; });
    if (b) b.click(); else throw new Error('no button ' + ${JSON.stringify(label)});
  })();`;
}

function state(): string {
  return `(function(){
    var s = document.querySelector('[data-nr-route-state]');
    return JSON.stringify({
      routeState: s ? s.getAttribute('data-nr-route-state') : null,
      onboardingComplete: window.localStorage.getItem('ft-onboarding-complete'),
      persona: window.localStorage.getItem('ft-persona'),
      followUp: window.localStorage.getItem('nr-onboarding-followup'),
      heading: (document.querySelector('h1') || {}).textContent || null,
      bodyText: document.body.innerText.slice(0, 400)
    });
  })();`;
}

async function report(page: import('playwright').Page, label: string): Promise<void> {
  const raw = await page.evaluate(state()) as string;
  console.log(`\n--- ${label} ---\n${raw}`);
}

// ── 1-4: the happy path ────────────────────────────────────────────────────
const emailA = freshEmail('a');
{
  const ctx = await authed(emailA, 'sign-up');
  const page = await ctx.newPage();
  await page.addInitScript(clean);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/firstrun_1_questionnaire.png`, fullPage: true });
  await report(page, '1 questionnaire');

  await page.evaluate(clickByAria('Track Net worth over time'));
  await page.evaluate(clickByAria('Visibility: Focused'));
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/firstrun_2_questionnaire_answered.png`, fullPage: true });

  await page.evaluate(`(function(){
    var b = Array.from(document.querySelectorAll('button'))
      .find(function(n){ return /Continue/.test(n.textContent || ''); });
    b.click();
  })();`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/firstrun_3_account_step.png`, fullPage: true });
  await report(page, '3 account step');

  await page.fill('#nr-onb-account-name', 'Everyday current');
  await page.selectOption('#nr-onb-account-currency', 'GBP');
  await page.fill('#nr-onb-account-balance', '2480.55');
  await page.waitForTimeout(200);
  await page.screenshot({ path: `${OUT}/firstrun_4_account_filled.png`, fullPage: true });

  await page.evaluate(`(function(){
    var b = Array.from(document.querySelectorAll('button'))
      .find(function(n){ return /Add account/.test(n.textContent || ''); });
    b.click();
  })();`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/firstrun_5_landing.png`, fullPage: true });
  await report(page, '5 landing');

  console.log('\n--- landing detail ---\n' + await page.evaluate(`JSON.stringify({ url: location.pathname })`));

  // The dashboard itself: five widgets and the discovery tile.
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/firstrun_5b_dashboard.png`, fullPage: true });
  console.log('\n--- dashboard ---\n' + await page.evaluate(`(function(){
    return JSON.stringify({
      url: location.pathname,
      enabledWidgets: (JSON.parse(window.localStorage.getItem('ft-widgets') || '{}').enabled || []),
      tile: (Array.from(document.querySelectorAll('button'))
        .find(function(n){ return /MORE WIDGET/.test(n.textContent || ''); }) || {}).innerText || null
    });
  })();`));

  // The discovery tile itself, framed.
  const tileEl = page.locator('button', { hasText: 'MORE WIDGETS' }).first();
  await tileEl.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/firstrun_5c_tile.png` });
  await tileEl.screenshot({ path: `${OUT}/firstrun_5d_tile_only.png` });

  // The discovery tile: click it, confirm customize mode and that it goes.
  await page.evaluate(`(function(){
    var b = Array.from(document.querySelectorAll('button'))
      .find(function(n){ return /MORE WIDGET/.test(n.textContent || ''); });
    if (b) b.click();
  })();`);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/firstrun_6_customize.png`, fullPage: true });
  console.log('\n--- after tile click ---\n' + await page.evaluate(`JSON.stringify({
    customizeMode: window.localStorage.getItem('ft-dashboard-customize-mode'),
    discovered: window.localStorage.getItem('nr-customize-discovered'),
    banner: /CUSTOMIZE MODE/.test(document.body.innerText)
  })`));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// ── 5: second device — same user, empty localStorage ───────────────────────
{
  const ctx = await authed(emailA, 'sign-in');
  const page = await ctx.newPage();
  await page.addInitScript(clean);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/firstrun_7_second_device.png`, fullPage: true });
  await report(page, '7 second device (must NOT be the questionnaire)');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// ── 6: skip path — fresh user, top-bar skip ────────────────────────────────
const emailB = freshEmail('b');
{
  const ctx = await authed(emailB, 'sign-up');
  const page = await ctx.newPage();
  await page.addInitScript(clean);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(`(function(){
    var b = Array.from(document.querySelectorAll('button'))
      .find(function(n){ return /Skip/.test(n.textContent || ''); });
    b.click();
  })();`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/firstrun_8_skip_landing.png`, fullPage: true });
  await report(page, '8 skip landing');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// ── 6b: the skipper's second device ────────────────────────────────────────
//
// Skip writes persona "full" — the same string as the column default
// handed to someone who has never onboarded. Before app_settings.
// onboarded_at existed the client could not tell those apart, so it
// refused every server "full" and this user was asked the questions all
// over again on their laptop. `onboarded` distinguishes them, so this
// must land on the dashboard with the questionnaire never shown.
{
  const ctx = await authed(emailB, 'sign-in');
  const page = await ctx.newPage();
  await page.addInitScript(clean);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/firstrun_8b_skipper_second_device.png`, fullPage: true });
  await report(page, "8b skipper's second device (must NOT be the questionnaire)");
  console.log('\n--- persona over the wire ---\n' + await page.evaluate(`
    fetch('/api/settings/persona').then(function(r){ return r.text(); })`));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// ── 7: the acceptance criterion — a failed write must not trap ─────────────
{
  const ctx = await authed(freshEmail('c'), 'sign-up');
  const page = await ctx.newPage();
  await page.addInitScript(clean);
  // Fail every account create, before the generic /api/** proxy sees it.
  await page.route(`${FRONTEND}/api/accounts`, async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'upstream is down' }) });
    } else {
      await route.fallback();
    }
  });
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(clickByAria('Track Day-to-day spending'));
  await page.evaluate(clickByAria('Visibility: Focused'));
  await page.evaluate(`(function(){
    Array.from(document.querySelectorAll('button')).find(function(n){ return /Continue/.test(n.textContent || ''); }).click();
  })();`);
  await page.waitForTimeout(1200);
  await page.fill('#nr-onb-account-name', 'Will not save');
  await page.fill('#nr-onb-account-balance', '100');
  await page.evaluate(`(function(){
    Array.from(document.querySelectorAll('button')).find(function(n){ return /Add account/.test(n.textContent || ''); }).click();
  })();`);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/firstrun_9_write_failed.png`, fullPage: true });
  await report(page, '9 write failed (must still be on the account step, with a way out)');
  console.log('\n--- exits still live? ---\n' + await page.evaluate(`JSON.stringify({
    skipVisible: !!Array.from(document.querySelectorAll('button')).find(function(n){ return /Skip for now/i.test(n.textContent || ''); }),
    retryLabel: (Array.from(document.querySelectorAll('button')).find(function(n){ return /Try again|Add account/.test(n.textContent || ''); }) || {}).innerText || null,
    errorShown: !!document.querySelector('[role=alert]')
  })`));
  // Take the exit.
  await page.evaluate(`(function(){
    Array.from(document.querySelectorAll('button')).find(function(n){ return /Skip for now/i.test(n.textContent || ''); }).click();
  })();`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/firstrun_10_escaped.png`, fullPage: true });
  await report(page, '10 escaped after failure');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

// ── 8: the same flow at phone width ────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const email = freshEmail('m');
  const res = await ctx.request.post(`${API}/api/auth/sign-up/email`, {
    headers: { 'Content-Type': 'application/json', 'Origin': FRONTEND },
    data: { email, password: PASSWORD, name: 'First Run' },
  });
  if (!res.ok()) { console.error('mobile sign-up failed', res.status()); process.exit(1); }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map(c => ({ ...c, name: c.name.replace(/^__Secure-/, ''), secure: false, sameSite: 'Lax' as const })));
  await proxyApi(ctx);

  const page = await ctx.newPage();
  await page.addInitScript(clean);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/firstrun_m1_questionnaire.png`, fullPage: true });
  await page.evaluate(clickByAria('Track Day-to-day spending'));
  await page.evaluate(clickByAria('Visibility: Focused'));
  await page.evaluate(`(function(){
    Array.from(document.querySelectorAll('button')).find(function(n){ return /Continue/.test(n.textContent || ''); }).click();
  })();`);
  await page.waitForTimeout(1200);
  await page.fill('#nr-onb-account-name', 'Monzo current');
  await page.fill('#nr-onb-account-balance', '640.20');
  await page.screenshot({ path: `${OUT}/firstrun_m2_account.png`, fullPage: true });
  await page.evaluate(`(function(){
    Array.from(document.querySelectorAll('button')).find(function(n){ return /Add account/.test(n.textContent || ''); }).click();
  })();`);
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `${OUT}/firstrun_m3_landing.png`, fullPage: true });
  await report(page, 'M3 phone landing');
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/firstrun_m4_dashboard.png`, fullPage: true });
  console.log('\n--- phone dashboard ---\n' + await page.evaluate(`(function(){
    return JSON.stringify({
      enabledWidgets: (JSON.parse(window.localStorage.getItem('ft-widgets') || '{}').enabled || []),
      tile: (Array.from(document.querySelectorAll('button'))
        .find(function(n){ return /MORE WIDGET/.test(n.textContent || ''); }) || {}).innerText || null
    });
  })();`));
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await ctx.close();
}

await cleanupCreatedUsers();
await browser.close();
console.log('\ndone');
