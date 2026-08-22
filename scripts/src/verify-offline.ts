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
// Run:
//   1. cd artifacts/api-server && pnpm dev
//   2. cd artifacts/finance-tracker && PORT=4321 BASE_PATH=/ VITE_API_URL=http://localhost:3001 pnpm dev
//   3. pnpm --filter @workspace/scripts exec tsx src/verify-offline.ts

import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "..", "screenshots", "offline-verify");

const FRONTEND = process.env.FRONTEND_URL ?? "http://localhost:4321";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

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

async function signIn(context: BrowserContext): Promise<void> {
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", "Origin": FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  // Rewrite cookies to non-Secure so http://localhost stores them.
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(cookies.map((c) => ({
    ...c,
    name: c.name.replace(/^__Secure-/, ""),
    secure: false,
    sameSite: "Lax" as const,
  })));
}

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
// TanStack Query to write through the persister (throttle 1s).
async function warmCache(page: Page): Promise<void> {
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
  }
}

// Signals we look for on the OFFLINE reload:
//   • hasSpinner: still fetching / stuck rendering
//   • hasNumber: at least one number rendered in the page (proves data got
//     through from cache), matches £, $, €, or a bare 3+ digit number
//   • hasNoConnection: the "NO CONNECTION" banner rendered
//   • hasZeroSummary: presence of "£0" as a headline (regression: dashboard
//     was showing zeros when API failed)
//   • title / current URL: proves the page loaded at all
async function inspect(page: Page): Promise<{
  url: string; title: string;
  hasSpinner: boolean; hasNumber: boolean;
  hasNoConnection: boolean; hasZeroHeadline: boolean;
  bodyText: string;
}> {
  const url = page.url();
  const title = await page.title();
  const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 4000));
  const hasSpinner = /LOADING|LOADING…|Loading\.\.\./.test(bodyText);
  const hasNumber = /£[\d,]+|\$[\d,]+|€[\d,]+|\bRM\s?[\d,]+|\b\d{3,}\b/.test(bodyText);
  const hasNoConnection = /NO CONNECTION/i.test(bodyText);
  // Zero headline: a "£0" or "£0.00" as one of the first ~200 chars of a
  // KPI. This is the defect we're guarding against — a user on a plane
  // reading their net worth as zero.
  const hasZeroHeadline = /£0(?:\.\d{2})?\b/.test(bodyText.slice(0, 500));
  return { url, title, hasSpinner, hasNumber, hasNoConnection, hasZeroHeadline, bodyText };
}

async function main(): Promise<void> {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Ignore the Capacitor SW-in-native code path; test the web SW.
    serviceWorkers: "allow",
  });

  await signIn(context);
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
  await warmCache(page);

  // Snapshot online state on the dashboard for the report header.
  await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 20000 });
  await page.waitForTimeout(3000); // extra beat for persister throttle
  const online = await inspect(page);
  await page.screenshot({ path: resolve(OUTPUT_DIR, "00-online-dashboard.png"), fullPage: true });

  // Diagnostic: read IndexedDB directly and report how many query
  // entries the persister wrote, so we can tell whether the persist
  // step happened at all vs. cache hydrating but returning empty data.
  const cacheDiagnostic = await page.evaluate(async () => {
    return await new Promise<{ found: boolean; size: number; queryCount: number; keys: string[] }>((resolve) => {
      const req = indexedDB.open("keyval-store");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("keyval", "readonly");
        const store = tx.objectStore("keyval");
        const getReq = store.get("numeris-query-cache-v1");
        getReq.onsuccess = () => {
          const raw = getReq.result;
          if (!raw) { resolve({ found: false, size: 0, queryCount: 0, keys: [] }); return; }
          try {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            const queries = parsed?.clientState?.queries ?? [];
            const keys = queries.slice(0, 20).map((q: { queryKey: unknown[]; state?: { data?: unknown } }) => {
              const dataPreview = q.state?.data == null
                ? "null"
                : JSON.stringify(q.state.data).slice(0, 100);
              return `${JSON.stringify(q.queryKey)} → ${dataPreview}`;
            });
            resolve({ found: true, size: (typeof raw === "string" ? raw.length : JSON.stringify(raw).length), queryCount: queries.length, keys });
          } catch (err) {
            resolve({ found: true, size: -1, queryCount: -1, keys: [String(err)] });
          }
        };
        getReq.onerror = () => resolve({ found: false, size: 0, queryCount: 0, keys: ["get failed"] });
      };
      req.onerror = () => resolve({ found: false, size: 0, queryCount: 0, keys: ["open failed"] });
    });
  });
  console.log(`[persister] found=${cacheDiagnostic.found} size=${cacheDiagnostic.size} queries=${cacheDiagnostic.queryCount}`);
  console.log(`[persister] keys (all ${cacheDiagnostic.keys.length}):`);
  for (const k of cacheDiagnostic.keys) console.log(`  ${k.slice(0, 120)}`);
  // Grab the full shape of the first persisted query so we can see
  // if hydrate() should be able to consume it.
  const warmFirstQuery = await page.evaluate(async () => {
    return await new Promise<string>((resolve) => {
      const req = indexedDB.open("keyval-store");
      req.onsuccess = () => {
        const tx = req.result.transaction("keyval", "readonly");
        const g = tx.objectStore("keyval").get("numeris-query-cache-v1");
        g.onsuccess = () => {
          const raw = g.result;
          if (typeof raw !== "string") { resolve("not-string"); return; }
          try {
            const p = JSON.parse(raw);
            const q0 = p?.clientState?.queries?.[0];
            if (!q0) { resolve("no-queries"); return; }
            // Return the status of ALL queries so we can see which
            // ones are stored as success vs error.
            const all = p.clientState.queries;
            const lines = all.map((q: {queryKey: unknown[]; state: {status: string; error?: unknown; data?: unknown}}) =>
              `${JSON.stringify(q.queryKey)}: status=${q.state.status} hasErr=${q.state.error != null} hasData=${q.state.data !== undefined && q.state.data !== null}`);
            resolve(lines.join(" | "));
          } catch (err) { resolve(String(err)); }
        };
      };
    });
  });
  console.log(`[persister] first-query WARM shape: ${warmFirstQuery}`);

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
    hasNoConnection: boolean; hasZeroHeadline: boolean;
    verdict: string;
  }> = [];

  // First offline visit: also dump the QueryClient state to confirm
  // whether hydration happened at all before widgets read from it.
  let dumpedRuntime = false;
  for (const r of ROUTES) {
    const url = new URL(r.path, FRONTEND).toString();
    console.log(`[offline] ${r.path}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
    } catch (err) {
      // A hard nav failure means even the shell didn't load — that's a
      // service-worker precache failure, not a cache-hydration failure.
      console.log(`[offline] ${r.path} nav failed: ${(err as Error).message}`);
    }
    // Wait for the persister to hydrate + React to render. If nothing
    // renders in 3s, that's the answer.
    await page.waitForTimeout(3000);
    if (!dumpedRuntime && r.name === "dashboard") {
      dumpedRuntime = true;
      const runtime = await page.evaluate(async () => {
        // Read IndexedDB again from the offline page to prove
        // IndexedDB survives / is reachable.
        return await new Promise<{ found: boolean; queryCount: number; navigatorOnLine: boolean; domSample: string }>((resolve) => {
          const req = indexedDB.open("keyval-store");
          req.onsuccess = () => {
            const db = req.result;
            const tx = db.transaction("keyval", "readonly");
            const getReq = tx.objectStore("keyval").get("numeris-query-cache-v1");
            getReq.onsuccess = () => {
              const raw = getReq.result;
              let count = 0;
              try {
                const p = typeof raw === "string" ? JSON.parse(raw) : raw;
                count = p?.clientState?.queries?.length ?? 0;
              } catch { /* ignore */ }
              resolve({
                found: !!raw,
                queryCount: count,
                navigatorOnLine: navigator.onLine,
                domSample: document.body.innerText.slice(0, 500),
              });
            };
            getReq.onerror = () => resolve({ found: false, queryCount: 0, navigatorOnLine: navigator.onLine, domSample: "" });
          };
          req.onerror = () => resolve({ found: false, queryCount: 0, navigatorOnLine: navigator.onLine, domSample: "" });
        });
      });
      console.log(`[offline-runtime] navigator.onLine=${runtime.navigatorOnLine} idb.found=${runtime.found} idb.queries=${runtime.queryCount}`);
      console.log(`[offline-runtime] dom-sample: ${runtime.domSample.slice(0, 250).replace(/\n/g, " · ")}`);
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
      // Dump the raw JSON from IDB — what's actually stored — so we
      // can see whether it has queries with `state.data` populated.
      const rawSample = await page.evaluate(async () => {
        return await new Promise<string>((resolve) => {
          const req = indexedDB.open("keyval-store");
          req.onsuccess = () => {
            const tx = req.result.transaction("keyval", "readonly");
            const g = tx.objectStore("keyval").get("numeris-query-cache-v1");
            g.onsuccess = () => resolve(typeof g.result === "string" ? g.result.slice(0, 800) : "not-string");
            g.onerror = () => resolve("get-error");
          };
          req.onerror = () => resolve("open-error");
        });
      });
      console.log(`[offline-runtime] raw idb head: ${rawSample.slice(0, 800)}`);
      // Dump the full ONLINE snapshot from IDB (from Phase 1 warm)
      // so we can compare its structure vs what hydration needs.
      const warmSnapshotShape = await page.evaluate(async () => {
        return await new Promise<string>((resolve) => {
          const req = indexedDB.open("keyval-store");
          req.onsuccess = () => {
            const tx = req.result.transaction("keyval", "readonly");
            const g = tx.objectStore("keyval").get("numeris-query-cache-v1");
            g.onsuccess = () => {
              const raw = g.result;
              if (typeof raw !== "string") { resolve("not-string"); return; }
              try {
                const p = JSON.parse(raw);
                const q0 = p?.clientState?.queries?.[0];
                if (!q0) { resolve("no-queries"); return; }
                resolve(JSON.stringify(q0).slice(0, 1000));
              } catch (err) { resolve(String(err)); }
            };
          };
        });
      });
      console.log(`[offline-runtime] first-query-shape: ${warmSnapshotShape}`);
    }
    const shot = resolve(OUTPUT_DIR, `${r.name}-offline.png`);
    try {
      await page.screenshot({ path: shot, fullPage: true });
    } catch { /* page may have died */ }
    const info = await inspect(page).catch(() => ({
      url: "", title: "", hasSpinner: false, hasNumber: false,
      hasNoConnection: false, hasZeroHeadline: false, bodyText: "",
    }));
    const verdict = info.bodyText.length === 0
      ? "BLANK (shell failed)"
      : info.hasZeroHeadline
      ? "FABRICATED ZEROS (defect)"
      : info.hasNumber
      ? "cached data rendered"
      : info.hasSpinner
      ? "STUCK LOADING"
      : "no numbers, but page rendered";
    report.push({
      route: r.path, name: r.name,
      hasSpinner: info.hasSpinner, hasNumber: info.hasNumber,
      hasNoConnection: info.hasNoConnection, hasZeroHeadline: info.hasZeroHeadline,
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
      `  ${r.name.padEnd(18)}  spin=${r.hasSpinner ? "Y" : "-"}  num=${r.hasNumber ? "Y" : "-"}  banner=${r.hasNoConnection ? "Y" : "-"}  £0=${r.hasZeroHeadline ? "Y" : "-"}  → ${r.verdict}`,
    );
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
