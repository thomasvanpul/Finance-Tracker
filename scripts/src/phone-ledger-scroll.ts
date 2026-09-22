// Phone ledger reachability — 390x844, /transactions, measured not inferred.
//
// Finding 2026-09-07: the SPENDING tab stuck on "LOADING EARLIER…" with only
// 3 of 46 rows ever reachable. This script answers the question the finding
// asks: of the rows the API holds for the seed account, how many can a user
// reach by scrolling the phone ledger, and does the sentinel stand down once
// the history is exhausted?
//
// It scrolls the list's own scroll container with the mouse wheel (the input
// a user makes, which is what the IntersectionObserver has to see), counts
// distinct [data-tx-row] elements, and stops when neither the row count nor
// the scroll height has moved for several rounds.
import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';
import { acquireCaptureLock } from './capture-lock.js';

// Read-only on the account, but it signs in as the one seed user; hold the
// lock so a concurrent theme/persona capture cannot change what this sees.
acquireCaptureLock();

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';
const OUT = '/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots';
const MAX_ROUNDS = 80;
const SETTLE_ROUNDS = 6;

const browser = await chromium.launch();
let failures = 0;
function check(label: string, ok: boolean, detail: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${JSON.stringify(detail)}`);
}

try {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed ${res.status()} ${await res.text()}`);
  const signed = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(signed.map(c => ({ ...c, name: c.name.replace(/^__Secure-/, ''), secure: false, sameSite: 'Lax' as const })));
  const cookieHeader = async () => (await ctx.cookies()).map(c => `${c.name}=${c.value}`).join('; ');

  await ctx.route(`${FRONTEND}/api/**`, async route => {
    try {
      const req = route.request();
      const r = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
        method: req.method(),
        headers: { ...req.headers(), origin: FRONTEND, cookie: await cookieHeader() },
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

  // Ground truth: every transaction the API holds, and how many months back
  // the oldest sits — the screen pages at most 12 months, so rows older than
  // that are out of the ledger's reach by design and are reported separately.
  const all = await ctx.request.get(`${API}/api/transactions`, { headers: { origin: FRONTEND, cookie: await cookieHeader() } });
  if (!all.ok()) throw new Error(`list failed ${all.status()}`);
  const txs = (await all.json()) as { id: number; date: string }[];
  const now = new Date();
  const monthIndex = (d: string) => (now.getFullYear() - Number(d.slice(0, 4))) * 12 + (now.getMonth() + 1 - Number(d.slice(5, 7)));
  const inWindow = txs.filter(t => monthIndex(t.date) < 12).length;
  const oldest = txs.map(t => t.date).sort()[0];
  console.log(`API  total=${txs.length}  within 12 months=${inWindow}  oldest=${oldest}`);

  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
  } catch (e) {}`);
  await page.goto(`${FRONTEND}/transactions`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-tx-row]', { timeout: 15000 });
  await page.waitForTimeout(1200);

  const probe = () => page.evaluate(() => {
    const rows = document.querySelectorAll('[data-tx-row]').length;
    const sentinel = Array.from(document.querySelectorAll('span')).some(s => s.textContent === 'LOADING EARLIER…');
    const first = document.querySelector('[data-tx-row]');
    let el: HTMLElement | null = first as HTMLElement | null;
    while (el && !(/(auto|scroll)/.test(getComputedStyle(el).overflowY) && el.scrollHeight > el.clientHeight)) el = el.parentElement;
    return {
      rows, sentinel,
      scroller: el ? { top: Math.round(el.scrollTop), height: el.scrollHeight, client: el.clientHeight } : null,
    };
  });

  const initial = await probe();
  console.log(`initial  ${JSON.stringify(initial)}`);
  await page.screenshot({ path: `${OUT}/phone-ledger-scroll-initial.png` });

  let last = initial;
  let still = 0;
  let jumpedToTop = 0;
  for (let i = 0; i < MAX_ROUNDS && still < SETTLE_ROUNDS; i++) {
    await page.mouse.move(195, 600);
    await page.mouse.wheel(0, 1600);
    await page.waitForTimeout(450);
    const p = await probe();
    // While the sentinel is up the screen is still paging (possibly through
    // empty months), so it has not settled even if nothing new rendered.
    const moved = p.sentinel || p.rows !== last.rows || p.scroller?.height !== last.scroller?.height;
    if (p.scroller && last.scroller && p.scroller.top < last.scroller.top - 400) jumpedToTop++;
    still = moved ? 0 : still + 1;
    last = p;
  }
  console.log(`final    ${JSON.stringify(last)}`);
  await page.screenshot({ path: `${OUT}/phone-ledger-scroll-final.png` });

  const atBottom = last.scroller != null && last.scroller.top + last.scroller.client >= last.scroller.height - 2;
  check('ledger scrolls at all', (last.scroller?.top ?? 0) > 0, last.scroller);
  check('reached the bottom of the scroller', atBottom, last.scroller);
  check('every row within the 12-month window is rendered', last.rows >= inWindow, { rendered: last.rows, inWindow, total: txs.length });
  check('scroll position held while pages loaded', jumpedToTop === 0, { jumpedToTop });
  check('sentinel stood down at the end of history', !last.sentinel, { sentinel: last.sentinel });

  await ctx.close();
} finally {
  await browser.close();
}
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAIL`);
process.exit(failures === 0 ? 0 : 1);
