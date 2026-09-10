import { chromium } from 'playwright';
import { FRONTEND, API, signInSeedUser, openAccountPrefs, assertTheme } from './account-prefs.js';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });

const cookie = await signInSeedUser(ctx);

// The account theme wins over the localStorage seed once theme-sync
// hydrates, so setTheme is what makes each pass the theme its filename
// claims. persona is untouched on purpose: this script wants the
// onboarding questionnaire, which only renders while app_settings has
// no onboarded_at, and the first PUT /api/settings/persona stamps that
// column for good. See account-prefs.ts.
const prefs = await openAccountPrefs(ctx, cookie);

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
      headers: Object.fromEntries(r.headersArray().filter(h => !['set-cookie','content-length'].includes(h.name.toLowerCase())).map(h => [h.name, h.value])),
      body,
    });
  } catch (e) {
    if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
  }
});

for (const theme of ['void', 'arctic']) {
  await prefs.setTheme(theme);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
    // deliberately DO NOT set ft-onboarding-complete — we want the questionnaire
    window.localStorage.removeItem("ft-onboarding-complete");
    window.localStorage.removeItem("nr-onboarding-complete");
    window.localStorage.removeItem("ft-persona");
  } catch (e) {}`);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await assertTheme(page, theme);
  await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/onboarding_desktop_${theme}.png`, fullPage: true });
  // Simulate filling: Q1 pick market, Q2 pick no, Q3 pick focused.
  // Use a string body so tsx/esbuild does not inject __name references.
  await page.evaluate(`(function(){
    var clickByAria = function(label){
      var nodes = Array.from(document.querySelectorAll('button[aria-label]'));
      var b = nodes.find(function(n){ return n.getAttribute('aria-label') === label; });
      if (b) b.click();
    };
    clickByAria('Track Investments and market prices');
    clickByAria('Bank plan: No');
    clickByAria('Visibility: Focused');
  })();`);
  await page.waitForTimeout(300);
  await assertTheme(page, theme);
  await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/onboarding_desktop_market_${theme}.png`, fullPage: true });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
}

// Mobile view
// restore before the context closes — prefs holds ctx.request.
await prefs.restore();
await ctx.close();
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const mcookie = await signInSeedUser(mctx);
const mprefs = await openAccountPrefs(mctx, mcookie);
await mctx.route(`${FRONTEND}/api/**`, async route => {
  try {
    const req = route.request();
    const target = req.url().replace(FRONTEND, API);
    const cs = await mctx.cookies();
    const cookieHeader = cs.map(c => `${c.name}=${c.value}`).join('; ');
    const r = await mctx.request.fetch(target, {
      method: req.method(),
      headers: { ...req.headers(), origin: FRONTEND, cookie: cookieHeader },
      data: req.postDataBuffer() ?? undefined,
      maxRedirects: 0,
    });
    const body = await r.body();
    await route.fulfill({
      status: r.status(),
      headers: Object.fromEntries(r.headersArray().filter(h => !['set-cookie','content-length'].includes(h.name.toLowerCase())).map(h => [h.name, h.value])),
      body,
    });
  } catch (e) {
    if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
  }
});
for (const theme of ['void', 'arctic']) {
  await mprefs.setTheme(theme);
  const page = await mctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
    window.localStorage.removeItem("ft-onboarding-complete");
    window.localStorage.removeItem("nr-onboarding-complete");
    window.localStorage.removeItem("ft-persona");
  } catch (e) {}`);
  await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await assertTheme(page, theme);
  await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/onboarding_mobile_${theme}.png`, fullPage: true });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
}
await mprefs.restore();
await browser.close();
console.log('done');
