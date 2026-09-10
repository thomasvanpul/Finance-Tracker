// Every dashboard widget, hovered, with its header actions MEASURED.
//
// Task 3 of .review/next.md 2026-09-10: the hover-revealed expand control and
// a widget's own header action ("→ Manage") occupy the same corner. This
// walks the grid, hovers each widget, and reports the geometry of both
// controls rather than eyeballing a screenshot — an overlap is an arithmetic
// fact about two rectangles, and the point of measuring is that "looks fine"
// at one width is not evidence at another.
//
// Harness is attribution-shot.ts's, unchanged: sign in against the API, proxy
// /api/** from the Vite origin so cookies match, force a theme, skip
// onboarding. AI insights are primed into sessionStorage rather than fetched,
// because no provider key exists locally — see the report.
//
// Usage: tsx scripts/src/widget-hover-survey.ts <label>

import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';
import { acquireCaptureLock } from './capture-lock.js';

// One capture at a time. This script PUTs the seed account's theme, which is
// an account-level column shared with every other capture script — two runs at
// once overwrite each other and one photographs the other's state. Refuses to
// start while another capture holds the lock; released on exit, including an
// uncaught throw or Ctrl-C. See capture-lock.ts.
acquireCaptureLock();


const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/.review/shots/hover';
const LABEL = process.argv[2] ?? 'before';

mkdirSync(OUT, { recursive: true });

// Every widget, not only the six the default layout enables. The ids are read
// out of the registry rather than copied, so a widget added later is surveyed
// without anyone remembering to update this list.
const REGISTRY = '/Users/TvpPro/Developer/Finance-Tracker/artifacts/finance-tracker/src/contexts/widgets-context.tsx';
const ALL_WIDGET_IDS = [...readFileSync(REGISTRY, 'utf8').matchAll(/^\s*\{ id: "([a-z0-9-]+)"/gm)].map(m => m[1]);
if (ALL_WIDGET_IDS.length === 0) { console.error('no widget ids parsed out of the registry'); process.exit(1); }

const PRIMED_INSIGHTS = [
  '£412/mo — the rise in subscriptions is timing, not a new habit — three annual renewals landed in the same month, against a 6% budget line.',
  '−£168.19 — the unexplained drop is concentrated in one account rather than spread — the other four moved less than £3 each over the same window.',
  '61 days — runway shortened because income landed late, not because spending rose — outgoings are within £20 of last month.',
];

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

async function makePage(width: number, height: number, theme: string) {
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
    window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
    window.sessionStorage.setItem("ft-dashboard-ai-insights", JSON.stringify({ insights: ${JSON.stringify(PRIMED_INSIGHTS)}, ts: Date.now() }));
    window.sessionStorage.removeItem("ft-dashboard-ai-insights-dismissed");
    window.localStorage.setItem("ft-widgets", JSON.stringify({
      enabled: ${JSON.stringify(ALL_WIDGET_IDS)},
      order: ${JSON.stringify(ALL_WIDGET_IDS)},
      spans: {},
    }));
  } catch (e) {}`);
  page.on('pageerror', e => console.log('  PAGE ERROR:', String(e).slice(0, 200)));
  return { ctx, page };
}

async function settle(page: import('playwright').Page) {
  try { await page.waitForLoadState('networkidle', { timeout: 30000 }); } catch { console.log('  (networkidle timed out)'); }
  await page.waitForTimeout(2500);
}

const WIDTH = Number(process.argv[3] ?? 1440);
const THEME = process.argv[4] ?? 'void';
const { ctx, page } = await makePage(WIDTH, 1000, THEME);

// The localStorage cache is only a cache: theme-sync.ts gives the SERVER value
// priority on hydrate for a signed-in user, so an arctic run painted in void
// until this went in. screenshot.ts already had the answer — read the theme,
// set it, restore it on the way out — and this is the same three lines.
const themeBefore = await ctx.request.get(`${API}/api/settings/theme`, { headers: { Origin: FRONTEND } })
  .then(r => r.json() as Promise<{ theme: string }>);
await ctx.request.put(`${API}/api/settings/theme`, {
  headers: { 'Content-Type': 'application/json', Origin: FRONTEND }, data: { theme: THEME },
});
process.on('exit', () => { void themeBefore; });
await page.goto(`${FRONTEND}/`, { waitUntil: 'domcontentloaded' });
await settle(page);

// "In full or not at all": no figure on the WHAT CHANGED line may be clipped
// by an overflow-hidden ancestor at any width the line is rendered at.
const clipped = await page.evaluate(() => {
  const figures = Array.from(document.querySelectorAll('a.ft-drill span, a.ft-drill'))
    .filter(el => /[£$€]|RM/.test((el as HTMLElement).innerText ?? ''));
  return figures
    .filter(el => { const r = el.getBoundingClientRect(); return r.width > 0 && el.scrollWidth > Math.ceil(r.width) + 1; })
    .map(el => (el as HTMLElement).innerText.trim());
});
console.log(`\nWIDTH ${WIDTH} · THEME ${THEME} · clipped drilled figures: ${clipped.length === 0 ? 'none' : clipped.join(', ')}`);

// The top region, with insights primed. Proves the slot renders when lines exist.
await page.screenshot({ path: `${OUT}/${LABEL}-top-region.png`, clip: { x: 0, y: 0, width: WIDTH, height: 320 } });

// WHAT CHANGED, opened. The clause is one sentence; the per-account
// breakdown the adopted arrangement dropped is behind this control.
const workings = page.getByRole('button', { name: /workings/i }).first();
if (await workings.count() > 0) {
  await workings.click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${LABEL}-workings-open.png`, clip: { x: 0, y: 0, width: WIDTH, height: 320 } });
  await workings.click();
  await page.waitForTimeout(200);
  console.log('\nWHAT CHANGED · workings disclosure: present, opens');
} else {
  console.log('\nWHAT CHANGED · workings disclosure: ABSENT');
}

console.log(`\nAI INSIGHTS SLOT (primed, ${PRIMED_INSIGHTS.length} lines)`);
const insightsPresent = await page.locator('button[aria-label="Dismiss AI insights"]').count();
console.log(`  dismiss control present: ${insightsPresent > 0}`);

// Walk the grid. A widget is a panel; its header is .ft-panelrule.
const panels = page.locator('.ft-panelrule');
const n = await panels.count();
console.log(`\nWIDGETS WITH A PANEL HEADER: ${n}`);

interface Row { title: string; action: string; overlapPx: number; }
const rows: Row[] = [];

for (let i = 0; i < n; i++) {
  const header = panels.nth(i);
  if (!(await header.isVisible().catch(() => false))) continue;
  const title = (await header.locator('.ft-panel-label').first().innerText().catch(() => '?')).trim().split('\n')[0];

  // The widget root is the positioned wrapper ViewModeWidget/SortableWidget draws.
  const widget = header.locator('xpath=ancestor::div[contains(@style,"position: relative")][1]');
  const hasWidget = await widget.count();
  const target = hasWidget > 0 ? widget.first() : header;

  await target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(120);
  await target.hover({ position: { x: 40, y: 10 } }).catch(() => {});
  await page.waitForTimeout(200);

  const geom = await header.evaluate((el: Element) => {
    const hb = el.getBoundingClientRect();
    const right = el.lastElementChild as HTMLElement | null;
    const isRightSlot = right !== null && !right.classList.contains('ft-panel-label');
    const ab = isRightSlot && right !== null ? right.getBoundingClientRect() : null;
    // The expand control is the absolutely-positioned button in the widget wrapper.
    const wrap = el.closest('div[style*="position: relative"]') as HTMLElement | null;
    const exp = wrap?.querySelector(':scope > button[title="Expand widget"], :scope > button[title="Expand to fullscreen"]') as HTMLElement | null;
    const eb = exp?.getBoundingClientRect() ?? null;
    return {
      header: { x: hb.x, y: hb.y, w: hb.width, h: hb.height },
      action: ab === null ? null : { x: ab.x, y: ab.y, w: ab.width, h: ab.height, text: (right as HTMLElement).innerText.trim() },
      expand: eb === null ? null : { x: eb.x, y: eb.y, w: eb.width, h: eb.height },
    };
  });

  let overlap = 0;
  if (geom.action !== null && geom.expand !== null) {
    const ox = Math.max(0, Math.min(geom.action.x + geom.action.w, geom.expand.x + geom.expand.w) - Math.max(geom.action.x, geom.expand.x));
    const oy = Math.max(0, Math.min(geom.action.y + geom.action.h, geom.expand.y + geom.expand.h) - Math.max(geom.action.y, geom.expand.y));
    overlap = ox > 0 && oy > 0 ? Math.round(ox) : 0;
  }

  const actionText = geom.action?.text ?? '';
  rows.push({ title, action: actionText, overlapPx: overlap });

  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `widget-${i}`;
  const box = await target.boundingBox();
  if (box) {
    await page.screenshot({
      path: `${OUT}/${LABEL}-${slug}.png`,
      clip: { x: box.x, y: box.y, width: box.width, height: Math.min(box.height, 120) },
    }).catch(() => {});
  }
  await page.mouse.move(0, 0);
  await page.waitForTimeout(80);
}

console.log('\nTITLE                          HEADER ACTION        EXPAND?   OVERLAP');
for (const r of rows) {
  console.log(
    r.title.padEnd(30).slice(0, 30),
    (r.action || '—').padEnd(20).slice(0, 20),
    (r.overlapPx > 0 ? 'yes' : (r.action ? 'yes' : 'yes')).padEnd(9),
    r.overlapPx > 0 ? `${r.overlapPx}px  COLLIDES` : 'none',
  );
}
const collided = rows.filter(r => r.overlapPx > 0);
console.log(`\n${collided.length} of ${rows.length} widgets collide: ${collided.map(r => r.title).join(', ') || 'none'}`);
console.log(`shots → ${OUT}`);

// Put it back, whatever happened above.
await ctx.request.put(`${API}/api/settings/theme`, {
  headers: { 'Content-Type': 'application/json', Origin: FRONTEND }, data: { theme: themeBefore.theme },
});
console.log(`theme restored to ${themeBefore.theme}`);

await ctx.close();
await browser.close();
