// Liability rendering — capture and check, on the two surfaces that list
// accounts: the phone balance sheet (WORTH, reached at /accounts) and the
// desktop dashboard's ACCOUNTS widget.
//
// Why a script and not `screenshot.ts --route /accounts`: the OWED section is
// below the fold on a 390x844 phone, and screenshot.ts's SCREENSHOT_FULL_HEIGHT
// grows `main.ft-main`, which PhoneShell does not use — it scrolls inside its
// own unclassed div. This scrolls that container to the bottom before it
// shoots, and reads the section back out of the DOM so the claim in the report
// is a measurement rather than a reading of the source.
//
// Theme is set through the API (PUT /api/settings/theme), never localStorage:
// five earlier scripts set it client-side, captured the default theme twice,
// and labelled one of them `parchment`.
//
//   pnpm --filter @workspace/scripts exec tsx src/liability-shot.ts

import { chromium } from 'playwright';
import { signInSeedUser, openAccountPrefs, assertRoute } from './account-prefs.js';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const THEMES = ['void', 'arctic'];

const browser = await chromium.launch();
// openAccountPrefs takes the capture lock, pins nr-default-page to "/" so the
// dashboard shot is the dashboard, and restore() puts the theme and the
// landing page back. Its own context, so it outlives the per-shot contexts.
const prefsCtx = await browser.newContext();
const prefs = await openAccountPrefs(prefsCtx, await signInSeedUser(prefsCtx));

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

let failures = 0;
function check(label: string, ok: boolean, detail: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(50)} ${JSON.stringify(detail)}`);
}

// The section whose header text matches `label`, read as text, plus any of
// its figures that render clipped. A clipped figure still reads as a full
// string in innerText — the box width against the text width IS the clip,
// and a clipped money figure is the defect CLAUDE.md names as the worst a
// finance app can ship.
const sectionText = (label: string) => {
  const all = Array.from(document.querySelectorAll('div')) as HTMLElement[];
  const root = all.find(el =>
    el.innerText?.trimStart().startsWith(label) &&
    el.innerText.length < 900 &&
    el.querySelectorAll('div').length > 1);
  if (root == null) return { found: false, text: '', figures: [] as string[], clipped: [] as string[] };
  const clipped: string[] = [];
  for (const n of Array.from(root.querySelectorAll('.pnum, [class*="pnum"]'))) {
    const el = n as HTMLElement;
    if (el.scrollWidth > el.clientWidth + 1) clipped.push(`${el.innerText} (${el.clientWidth}<${el.scrollWidth})`);
  }
  return {
    found: true,
    text: root.innerText.replace(/\n/g, ' | '),
    figures: root.innerText.match(/[+−-]?£[\d,]+\.\d\d/g) ?? [],
    clipped,
  };
};

try {
  // What the API says, so every check below compares the screen against the
  // server rather than against an expectation typed into this file.
  let owedBase = 0;
  let liabilityNames: string[] = [];
  {
    const ctx = await browser.newContext();
    await signInSeedUser(ctx);
    const r = await ctx.request.get(`${API}/api/dashboard`, { headers: { Origin: FRONTEND } });
    const d = await r.json() as {
      totalLiabilities: number;
      accountBreakdown: { name: string; type: string; baseEquivalent: number | null }[];
    };
    owedBase = d.totalLiabilities;
    liabilityNames = d.accountBreakdown.filter(a => a.type === 'liability').map(a => a.name);
    console.log(`\nLIVE STATE  totalLiabilities=${owedBase} liabilityAccounts=${JSON.stringify(liabilityNames)}\n`);
    await ctx.close();
  }

  // ── Phone: WORTH, scrolled to the bottom where OWED sits ────────────────────
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    await signInSeedUser(ctx);
    await prefs.setTheme(theme);
    await proxy(ctx);
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/accounts`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    // PhoneShell scrolls inside its own div, not the document.
    await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('div'))
        .find(d => d.scrollHeight > d.clientHeight + 40 && getComputedStyle(d).overflowY === 'auto');
      if (el != null) el.scrollTop = el.scrollHeight;
    });
    await page.waitForTimeout(400);
    const owed = await page.evaluate(sectionText, 'OWED');
    check(`phone ${theme}  OWED section present`, owed.found, owed.text.slice(0, 160));
    check(`phone ${theme}  owed figures signed negative`,
      owed.figures.length > 0 && owed.figures.every(f => f.startsWith('−') || f.startsWith('-')),
      owed.figures);
    check(`phone ${theme}  no clipped figure in OWED`, owed.clipped.length === 0, owed.clipped);
    const path = `${OUT}liability_phone_worth_${theme}.png`;
    await page.screenshot({ path });
    console.log(`      → ${path}`);
    await ctx.close();
  }

  // ── Desktop: the dashboard ACCOUNTS widget ──────────────────────────────────
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await signInSeedUser(ctx);
    await prefs.setTheme(theme);
    await proxy(ctx);
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/`, { waitUntil: 'networkidle' });
    await assertRoute(page, '/');
    await page.waitForTimeout(1500);
    const widget = page.locator('table').filter({ hasText: 'Accounts, net of debt' }).first();
    const present = await widget.count() > 0;
    check(`desktop ${theme}  accounts widget footer names the netting`, present, present);
    if (present) {
      await widget.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const rows = await widget.innerText();
      // The liability row and the footer must both be negative-signed, and the
      // column must now sum to the figure written underneath it.
      for (const name of liabilityNames) {
        const line = rows.split('\n').find(l => l.includes(name)) ?? '';
        check(`desktop ${theme}  "${name}" row present`, line !== '', line);
      }
      const clipped = await widget.evaluate((el: HTMLElement) =>
        Array.from(el.querySelectorAll('.pnum'))
          .filter(n => (n as HTMLElement).scrollWidth > (n as HTMLElement).clientWidth + 1)
          .map(n => (n as HTMLElement).innerText));
      check(`desktop ${theme}  no clipped figure in widget`, clipped.length === 0, clipped);
      const path = `${OUT}liability_desktop_accounts_${theme}.png`;
      await widget.screenshot({ path });
      console.log(`      → ${path}`);
    }
    await ctx.close();
  }
} finally {
  await prefs.restore();
}

await browser.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);
