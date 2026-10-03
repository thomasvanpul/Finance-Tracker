// Airplane-mode verification for the offline read path.
//
// This is not a unit test. It boots a real Chromium against the running
// dev servers, signs in as the seed user, warms the TanStack Query
// persister by visiting each key route, then flips context.setOffline(true)
// and reloads each route. What renders on the second visit is what a
// user on a plane sees. "Airplane mode is the test, not a mocked
// offline flag."
//
// Chromium's setOffline() rejects every network request at the browser
// level — same failure shape as no signal. The service worker + IndexedDB
// persister survive because they're browser-local state, not network.
//
// Run it against a PRODUCTION build, never the Vite dev server. The dev
// server registers no service worker (vite.config.ts: devOptions.enabled
// false), so nothing precaches the shell and the first offline navigation
// is ERR_INTERNET_DISCONNECTED however good the data cache is. The harness
// checks for a controlling service worker before going offline and stops
// with that reason rather than reporting ten BLANK routes.
//
//   1. cd artifacts/api-server && pnpm dev
//   2. cd artifacts/finance-tracker && VITE_API_URL= BASE_PATH=/ pnpm build \
//        && PORT=4322 BASE_PATH=/ pnpm serve
//      VITE_API_URL is emptied on purpose: .env.local sets it to :3001, and a
//      build carrying it sends /api straight to the api-server, past the
//      context.route() interception below. :4322 leaves the dev server on
//      :4321 alone; the dev API's CORS accepts any localhost port.
//   3. FRONTEND_URL=http://localhost:4322 \
//        pnpm --filter @workspace/scripts exec tsx src/verify-offline.ts

import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInSeedUser, openAccountPrefs, assertRoute } from "./account-prefs.js";
import { fabricatedZeros, zeroFigures } from "./fabricated-zeros.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "..", "screenshots", "offline-verify");

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:4321";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

// The persister writes one idb-keyval entry per query, keyed
// `${prefix}-${queryHash}` (experimental_createQueryPersister). Mirrors
// PERSISTER_PREFIX in artifacts/finance-tracker/src/lib/offline-cache.ts.
// This harness used to read a single "numeris-query-cache-v1" key — the
// whole-client blob of the PersistQueryClientProvider that offline-cache.ts
// replaced — so it reported found=false queries=0 however much was cached.
const PERSISTER_PREFIX = "numeris-query-v1-";

type PersistedSnapshot = { queryCount: number; lines: string[]; firstEntry: string };

// Every persisted query entry, read straight from IndexedDB.
async function readPersisted(page: Page): Promise<PersistedSnapshot> {
  return page.evaluate(async (prefix) => {
    return await new Promise<PersistedSnapshot>((resolve) => {
      // No named helpers in here: tsx wraps them in __name(), which does not
      // exist in the page.
      const req = indexedDB.open("keyval-store");
      req.onerror = () => resolve({ queryCount: 0, lines: ["open failed"], firstEntry: "" });
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("keyval")) { resolve({ queryCount: 0, lines: ["no keyval store"], firstEntry: "" }); return; }
        const store = db.transaction("keyval", "readonly").objectStore("keyval");
        const keysReq = store.getAllKeys();
        const valsReq = store.getAll();
        valsReq.onerror = () => resolve({ queryCount: 0, lines: ["getAll failed"], firstEntry: "" });
        valsReq.onsuccess = () => {
          const pairs = (keysReq.result as IDBValidKey[])
            .map((k, i) => [String(k), valsReq.result[i]] as const)
            .filter(([k]) => k.startsWith(prefix));
          const lines = pairs.map(([, v]) => {
            try {
              const p = JSON.parse(String(v)) as { queryKey?: unknown; state?: { status?: string; data?: unknown } };
              const hasData = p.state?.data !== undefined && p.state?.data !== null;
              return `${JSON.stringify(p.queryKey)}: status=${p.state?.status} hasData=${hasData}`;
            } catch (err) {
              return `unparseable entry: ${String(err)}`;
            }
          });
          resolve({ queryCount: pairs.length, lines, firstEntry: pairs.length ? String(pairs[0][1]).slice(0, 1000) : "" });
        };
      };
    });
  }, PERSISTER_PREFIX);
}

// Without a service worker controlling the page nothing serves the shell
// offline, and every offline route fails before the cache is ever read.
async function assertServiceWorkerControls(page: Page): Promise<void> {
  const controlled = await page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return false;
    const ready = navigator.serviceWorker.ready.then(() => true);
    const timeout = new Promise<boolean>((r) => setTimeout(() => r(false), 10000));
    if (!(await Promise.race([ready, timeout]))) return false;
    return navigator.serviceWorker.controller !== null;
  });
  if (!controlled) {
    throw new Error(
      `no service worker controls ${page.url()} — offline navigation cannot load the shell. ` +
      "The Vite dev server registers none (devOptions.enabled false); run against " +
      "`pnpm build && pnpm serve` as described at the top of this file.",
    );
  }
}

// The routes worth verifying. Ordered by user priority: dashboard first
// because it's the plane-mode use case, then the data-heavy pages, then
// the pages the survey said should be OK to show empty offline.
const ROUTES: { path: string; name: string; expectCacheable: boolean }[] = [
  { path: "/",              name: "dashboard",     expectCacheable: true },
  { path: "/accounts",      name: "accounts",      expectCacheable: true },
  { path: "/transactions",  name: "transactions",  expectCacheable: true },
  { path: "/budget",        name: "budget",        expectCacheable: true },
  { path: "/goals",         name: "goals",         expectCacheable: true },
  { path: "/upcoming",      name: "upcoming",      expectCacheable: true },
  { path: "/subscriptions", name: "subscriptions", expectCacheable: true },
  { path: "/investments",   name: "investments",   expectCacheable: true },
  { path: "/owing",         name: "owing_shared",  expectCacheable: true },
  // Deliberately-empty-offline surface: market quotes must NOT persist.
  // If this page renders cached quotes, the blacklist is broken.
  { path: "/portfolio",     name: "portfolio",     expectCacheable: true },
];

// Route /api/* through context.request (with a whitelisted Origin so the
// api-server's dev CORS check accepts it). Bypasses the Vite dev proxy.
async function interceptApiRequests(context: BrowserContext): Promise<void> {
  await context.route(`${FRONTEND}/api/**`, async (route) => {
    const req = route.request();
    const target = req.url().replace(FRONTEND, API_BASE);
    try {
      const cookies = await context.cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const headers = { ...req.headers(), origin: FRONTEND, cookie: cookieHeader };
      const response = await context.request.fetch(target, {
        method: req.method(),
        headers,
        data: req.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      const setCookies = response.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
      for (const { value } of setCookies) {
        const name = value.split("=")[0].replace(/^__Secure-/, "");
        const rest = value.slice(value.indexOf("=") + 1).split(";")[0];
        await context.addCookies([{ name, value: rest, domain: "localhost", path: "/", secure: false, sameSite: "Lax" }]);
      }
      const body = await response.body();
      await route.fulfill({
        status: response.status(),
        headers: Object.fromEntries(
          response.headersArray()
            .filter((h) => h.name.toLowerCase() !== "set-cookie" && h.name.toLowerCase() !== "content-length")
            .map((h) => [h.name, h.value]),
        ),
        body,
      });
    } catch (err) {
      if (!(err instanceof Error) || !/disposed|closed/i.test(err.message)) throw err;
    }
  });
}

// Warm each route: navigate, wait for network idle, wait a beat for
// TanStack Query to write through the persister (throttle 1s). Returns each
// route's online innerText by name — the record of what the API supplied,
// which the offline FABRICATED ZEROS check diffs against.
async function warmCache(page: Page): Promise<Map<string, string>> {
  const onlineText = new Map<string, string>();
  for (const r of ROUTES) {
    const url = new URL(r.path, FRONTEND).toString();
    console.log(`[warm] ${r.path}`);
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 15000 });
    } catch {
      // Some pages (e.g. investments) issue background market polls
      // that never fully settle. domcontentloaded + a fixed wait is
      // enough to populate the persister.
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10000 });
    }
    await page.waitForTimeout(2000); // persister throttleTime is 1s
    onlineText.set(r.name, await page.evaluate(() => document.body.innerText));
  }
  return onlineText;
}

// Signals we look for on the OFFLINE reload:
//   • hasSpinner: still fetching / stuck rendering
//   • hasNumber: at least one number rendered in the page (proves data got
//     through from cache), matches £, $, €, or a bare 3+ digit number
//   • hasNoConnection: the "NO CONNECTION" banner rendered
//   • fabricatedZeros (computed by the caller against the online render,
//     fabricated-zeros.ts): £0 figures the API never supplied
//   • title / current URL: proves the page loaded at all
async function inspect(page: Page): Promise<{
  url: string; title: string;
  hasSpinner: boolean; hasNumber: boolean;
  hasNoConnection: boolean;
  bodyText: string;
}> {
  const url = page.url();
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText);
  const hasSpinner = /LOADING|LOADING…|Loading\.\.\./.test(bodyText);
  const hasNumber = /£[\d,]+|\$[\d,]+|€[\d,]+|\bRM\s?[\d,]+|\b\d{3,}\b/.test(bodyText);
  const hasNoConnection = /NO CONNECTION/i.test(bodyText);
  return { url, title, hasSpinner, hasNumber, hasNoConnection, bodyText };
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  // Takes the capture lock and pins nr-default-page to "/", so the dashboard
  // visits below are the dashboard; restore() puts the landing page back. Its
  // own context: the test context goes offline, and restore() must still reach
  // the api-server afterwards.
  const prefsCtx = await browser.newContext();
  const prefs = await openAccountPrefs(prefsCtx, await signInSeedUser(prefsCtx));
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      // Ignore the Capacitor SW-in-native code path; test the web SW.
      serviceWorkers: "allow",
    });

    await signInSeedUser(context);
    await interceptApiRequests(context);
    const page = await context.newPage();
    page.on("console", (msg) => {
      const text = msg.text();
      if (text.includes("[persist") || text.includes("[persister") || text.includes("[qc-accounts]")) console.log(`[browser] ${text}`);
    });
    await page.addInitScript(`try {
      window.localStorage.setItem("ft-onboarding-complete", "1");
      window.localStorage.setItem("nr-onboarding-complete", "1");
    } catch (e) {}`);

    // Clear any prior IndexedDB from previous test runs so we're
    // definitively starting from a blank persister state under the
    // currently-installed package versions.
    await page.goto(FRONTEND, { waitUntil: "domcontentloaded", timeout: 20000 });
    await page.evaluate(async () => {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase("keyval-store");
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    });
    console.log("[reset] wiped keyval-store");

    console.log("── Phase 1: warming cache (online) ──");
    const onlineText = await warmCache(page);

    // Snapshot online state on the dashboard for the report header.
    await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(3000); // extra beat for persister throttle
    await assertRoute(page, "/");
    const online = await inspect(page);
    await page.screenshot({ path: resolve(OUTPUT_DIR, "00-online-dashboard.png"), fullPage: true });

    // Diagnostic: how many query entries the persister wrote, so we can
    // tell whether the persist step happened at all vs. cache hydrating
    // but returning empty data.
    const warm = await readPersisted(page);
    console.log(`[persister] queries=${warm.queryCount}`);
    for (const line of warm.lines) console.log(`  ${line.slice(0, 120)}`);
    if (warm.queryCount === 0) {
      throw new Error("persister wrote no query entries while online — nothing to test offline");
    }
    await assertServiceWorkerControls(page);

    console.log("── Phase 2: airplane mode → cold reload each route ──");
    await context.setOffline(true);
    // Also unroute so the intercepted API path stops answering — the
    // offline flag alone blocks NEW network fetches, but a hanging
    // in-flight one from the previous page could still fulfill. Belt
    // and braces.
    await context.unrouteAll({ behavior: "ignoreErrors" });

    const report: Array<{
      route: string; name: string;
      hasSpinner: boolean; hasNumber: boolean;
      hasNoConnection: boolean; fabricatedZeros: string[];
      verdict: string;
    }> = [];

    // First offline visit: also dump the QueryClient state to confirm
    // whether hydration happened at all before widgets read from it.
    let dumpedRuntime = false;
    for (const r of ROUTES) {
      const url = new URL(r.path, FRONTEND).toString();
      console.log(`[offline] ${r.path}`);
      let navOk = true;
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      } catch (err) {
        navOk = false;
        // A hard nav failure means even the shell didn't load — that's a
        // service-worker precache failure, not a cache-hydration failure.
        console.log(`[offline] ${r.path} nav failed: ${(err as Error).message}`);
      }
      // Wait for the persister to hydrate + React to render. If nothing
      // renders in 3s, that's the answer.
      await page.waitForTimeout(3000);
      // Only when the shell loaded: a failed nav is itself the finding, and
      // the report below records it as BLANK rather than dying here.
      if (r.path === "/" && navOk) await assertRoute(page, "/");
      // Only when the shell loaded: an error page has no IndexedDB access.
      if (!dumpedRuntime && r.name === "dashboard" && navOk) {
        dumpedRuntime = true;
        // Read IndexedDB again from the offline page to prove it survives.
        const offline = await readPersisted(page);
        const { onLine, domSample } = await page.evaluate(() => ({
          onLine: navigator.onLine,
          domSample: document.body.innerText.slice(0, 500),
        }));
        console.log(`[offline-runtime] navigator.onLine=${onLine} idb.queries=${offline.queryCount}`);
        console.log(`[offline-runtime] dom-sample: ${domSample.slice(0, 250).replace(/\n/g, " · ")}`);
        // Also inspect the live QueryClient — is the cached data reaching
        // components, or does the client itself have empty state?
        const qcState = await page.evaluate(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const qc = (window as any).__NUMERIS_QC__;
          if (!qc) return { available: false, queries: 0, sample: [] };
          const cache = qc.getQueryCache();
          const all = cache.getAll();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sample = all.slice(0, 6).map((q: any) => ({
            key: JSON.stringify(q.queryKey),
            status: q.state?.status,
            fetchStatus: q.state?.fetchStatus,
            hasData: q.state?.data !== undefined,
            dataPreview: q.state?.data == null ? "null" : JSON.stringify(q.state.data).slice(0, 80),
          }));
          return { available: true, queries: all.length, sample };
        });
        console.log(`[offline-runtime] qc.available=${qcState.available} qc.queries=${qcState.queries}`);
        for (const s of qcState.sample) {
          console.log(`  ${s.key} status=${s.status}/${s.fetchStatus} hasData=${s.hasData} → ${s.dataPreview}`);
        }
        // The raw stored entry, so its shape can be compared with what
        // hydration needs.
        console.log(`[offline-runtime] first-entry: ${offline.firstEntry.slice(0, 800)}`);
      }
      const shot = resolve(OUTPUT_DIR, `${r.name}-offline.png`);
      try {
        await page.screenshot({ path: shot, fullPage: true });
      } catch { /* page may have died */ }
      const info = await inspect(page).catch(() => ({
        url: "", title: "", hasSpinner: false, hasNumber: false,
        hasNoConnection: false, bodyText: "",
      }));
      // A zero is fabricated only if the same route did not show it online.
      // With no online render to compare, every zero is unverified, not fine.
      const onlineRender = onlineText.get(r.name);
      const fabricated = onlineRender === undefined
        ? zeroFigures(info.bodyText)
        : fabricatedZeros(onlineRender, info.bodyText);
      const verdict = info.bodyText.length === 0
        ? "BLANK (shell failed)"
        : fabricated.length > 0
        ? onlineRender === undefined
          ? "UNVERIFIED ZEROS (no online render)"
          : "FABRICATED ZEROS (defect)"
        : info.hasNumber
        ? "cached data rendered"
        : info.hasSpinner
        ? "STUCK LOADING"
        : "no numbers, but page rendered";
      report.push({
        route: r.path, name: r.name,
        hasSpinner: info.hasSpinner, hasNumber: info.hasNumber,
        hasNoConnection: info.hasNoConnection, fabricatedZeros: fabricated,
        verdict,
      });
    }

    // Write a machine-readable report next to the screenshots.
    await writeFile(
      resolve(OUTPUT_DIR, "report.json"),
      JSON.stringify({ online, report }, null, 2),
    );

    console.log("\n── Report ──");
    console.log(`Online dashboard hasNumber=${online.hasNumber} title="${online.title}"`);
    for (const r of report) {
      console.log(
        `  ${r.name.padEnd(18)}  spin=${r.hasSpinner ? "Y" : "-"}  num=${r.hasNumber ? "Y" : "-"}  banner=${r.hasNoConnection ? "Y" : "-"}  £0=${r.fabricatedZeros.length || "-"}  → ${r.verdict}`,
      );
      for (const z of r.fabricatedZeros) console.log(`      fabricated: ${z}`);
    }
  } finally {
    await prefs.restore();
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
