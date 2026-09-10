// Enumerate every query-param drill target and check, in a real phone
// viewport, whether the screen the phone renders actually reflects the
// parameter. Grepping for the param name proves nothing: the question is
// whether the destination changes when the parameter is present.
import { chromium } from 'playwright';
import { SEED_EMAIL, SEED_PASSWORD } from './seed-credentials.js';

const FRONTEND = 'http://localhost:4321';
const API = 'http://localhost:3001';

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

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await login(ctx);
await proxy(ctx);
const page = await ctx.newPage();
await page.addInitScript(`try {
  window.localStorage.setItem("ft-onboarding-complete", "1");
  window.localStorage.setItem("nr-onboarding-complete", "1");
} catch (e) {}`);


// Each case says HOW you can tell the parameter was honoured. A char-count
// proxy is not good enough: /goals?goal= marks a card without changing the
// text, and a proxy that cannot see that reports a working feature as broken.
type Probe = { rows: number; dialogs: number; text: string; marked: boolean; chips: string[] };

async function probe(path: string): Promise<Probe> {
  await page.goto(`${FRONTEND}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2400);
  return page.evaluate(() => ({
    // transaction/upcoming rows carry a currency figure; count them
    rows: document.body.innerText.split('\n').filter(l => /[£$]\s?[\d,]/.test(l)).length,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    text: document.body.innerText.replace(/\n/g, ' | '),
    marked: document.querySelector('[data-goal-id][style*="outline"]') != null,
    chips: Array.from(document.querySelectorAll('button[aria-label^="Clear filter"]')).map(b => (b as HTMLElement).innerText.trim()),
  }));
}

let failures = 0;
function check(label: string, ok: boolean, detail: unknown) {
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${JSON.stringify(detail)}`);
}

// 1. the two fixed in f133ab3, still fixed
for (const [label, path] of [['entityHref("account")', '/accounts?account=132'], ['entityHref("investment")', '/investments?position=1']] as const) {
  const r = await probe(path);
  check(`${label} opens a sheet`, r.dialogs === 1, { dialogs: r.dialogs });
}

// 2. the six ledger filters. Assert the rendered rows against what the API
// actually holds, not against "fewer than before" — filtered, the screen
// shows every matching month rather than paging, so a correct filter can
// legitimately render MORE rows than the unfiltered first page. An
// inequality proxy called that a regression twice.
const txs: any[] = await (async () => {
  const r = await ctx.request.get(`${API}/api/transactions?dateFrom=2026-08-01`, { headers: { origin: FRONTEND } });
  const b = await r.json();
  return Array.isArray(b) ? b : b.data ?? [];
})();
// One "DELETE" per swipe row, so it counts transaction rows and nothing else.
const rowsShown = (t: string) => (t.match(/\bDELETE\b/g) ?? []).length;

for (const [label, path, expectChip, want] of [
  ['categoryTransactionsHref()', '/transactions?category=Groceries', 'Groceries', txs.filter(t => t.category === 'Groceries').length],
  ['accountTransactionsHref()',  '/transactions?account=132',       null,        txs.filter(t => t.accountId === 132).length],
  ['transactionSearchHref()',    '/transactions?q=Tesco',           '"Tesco"',   txs.filter(t => /tesco/i.test(`${t.description} ${t.category} ${t.accountName}`)).length],
  ['ledgerHref({type})',         '/transactions?type=income',       'income',    txs.filter(t => t.type === 'income').length],
] as const) {
  const r = await probe(path);
  check(`${label} renders exactly the matching rows`, rowsShown(r.text) === want, { rendered: rowsShown(r.text), inApi: want });
  check(`${label} shows a clearable chip`, r.chips.length > 0 && (expectChip === null || r.chips.some(c => c.startsWith(expectChip))), r.chips);
  const stated = Number(/(\d+)\s+ROWS?/.exec(r.text)?.[1] ?? -1);
  check(`${label} states a count equal to what it rendered`, stated === rowsShown(r.text), { stated, rendered: rowsShown(r.text) });
  // The hero must be about the rows below it. Unfiltered it is SPENT · MTD;
  // left that way over a filtered list it states a figure for a month the
  // list is no longer showing.
  check(`${label} heads the list with a figure about the filter`, /MATCHING/.test(r.text.slice(0, 120)), { head: r.text.slice(0, 60) });
}

// a date range is inclusive at both ends and does not widen
{
  const r = await probe('/transactions?from=2026-09-01&to=2026-09-02');
  const want = txs.filter(t => t.date >= '2026-09-01' && t.date <= '2026-09-02').length;
  check('monthTransactionsHref() bounds the range', rowsShown(r.text) === want, { rendered: rowsShown(r.text), inApi: want });
}

// clearing a chip must restore the full list
{
  await probe('/transactions?category=Groceries');
  await page.click('button[aria-label^="Clear filter"]');
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => ({ url: location.pathname + location.search, chips: document.querySelectorAll('button[aria-label^="Clear filter"]').length }));
  check('a chip clears its own parameter', after.url === '/transactions' && after.chips === 0, after);
}

// a filter matching nothing says so, and does not claim the ledger is empty
{
  const r = await probe('/transactions?category=Nonexistent');
  check('no matches shows no total rather than the month\u2019s',
    /MATCHING \| \u2014/.test(r.text), { head: r.text.slice(0, 60) });
  check('no matches states the filter, not an empty ledger',
    /No transactions match this filter/.test(r.text) && !/Nothing spent yet/.test(r.text), { has: /No transactions match this filter/.test(r.text) });
}

// 3. recurring series
{
  const bareR = await probe('/recurring');
  const r = await probe('/recurring?q=OCTOPUS');
  check('recurringSeriesHref() filters the list', r.rows < bareR.rows, { bare: bareR.rows, filtered: r.rows });
  check('recurringSeriesHref() shows a clearable chip', r.chips.length > 0, r.chips);
}

// the PATH also says which lens
{
  const subs = await probe('/subscriptions');
  const all = await probe('/upcoming');
  check('/subscriptions opens on its own lens', subs.rows !== all.rows || subs.text !== all.text, { subsRows: subs.rows, allRows: all.rows });
}

// 4. goals — read a real id from the API rather than assuming one exists.
// Asserting against a guessed id reports a working feature as broken, which
// is the same mistake as asserting a string appears somewhere.
{
  const r = await ctx.request.get(`${API}/api/goals`, { headers: { origin: FRONTEND } });
  const body = await r.json();
  const list = Array.isArray(body) ? body : body.data ?? [];
  const id = list[0]?.id;
  check('the seed has a goal to drill to', id != null, { count: list.length });
  if (id != null) {
    const g = await probe(`/goals?goal=${id}`);
    check('entityHref("goal") marks that goal', g.marked, { id, marked: g.marked });
    const other = await probe('/goals');
    check('an unaddressed /goals marks nothing', !other.marked, { marked: other.marked });
  }
}

// Look at it, rather than only asserting about it.
for (const [name, path] of [
  ['spending-filtered',   '/transactions?category=Groceries'],
  ['spending-no-matches', '/transactions?category=Nonexistent'],
  ['upcoming-series',     '/recurring?q=OCTOPUS'],
  ['goals-marked',        '/goals'],
] as const) {
  await probe(path === '/goals' ? '/goals?goal=22' : path);
  await page.screenshot({ path: `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/phone-${name}.png` });
}

await browser.close();
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
