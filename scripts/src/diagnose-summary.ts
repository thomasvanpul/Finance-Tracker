// One-shot diagnostic: what does the transactions page actually see for
// useGetTransactionSummary — is the queryFn erroring, is the persister
// returning stale zero-cache, is the QueryClient in a mixed state?
//
// Not a test. A read-only probe run against the vite preview + api-server.

import { chromium } from "playwright";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const FRONTEND = "http://localhost:4321";
const API_BASE = "http://localhost:3001";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // Sign in and rewrite cookies for http://localhost storage.
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", "Origin": FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()}`);
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(cookies.map((c) => ({
    ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const,
  })));

  // Intercept /api/* on frontend → forward to api-server with whitelisted origin.
  await context.route(`${FRONTEND}/api/**`, async (route) => {
    const req = route.request();
    const target = req.url().replace(FRONTEND, API_BASE);
    try {
      const cs = await context.cookies();
      const headers = { ...req.headers(), origin: FRONTEND, cookie: cs.map(c => `${c.name}=${c.value}`).join("; ") };
      const r = await context.request.fetch(target, {
        method: req.method(), headers, data: req.postDataBuffer() ?? undefined, maxRedirects: 0,
      });
      const body = await r.body();
      await route.fulfill({
        status: r.status(),
        headers: Object.fromEntries(r.headersArray().filter(h => !["set-cookie","content-length"].includes(h.name.toLowerCase())).map(h => [h.name, h.value])),
        body,
      });
    } catch { /* page may be gone */ }
  });

  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error" || m.text().includes("summary")) console.log(`[browser] ${m.type()} ${m.text()}`); });
  await page.addInitScript(`try{localStorage.setItem("ft-onboarding-complete","1")}catch(e){}`);

  console.log("[diag] navigating to /transactions");
  // Watch every /api/transactions/summary request+response so we see
  // network-side behaviour independently of the QueryClient's state.
  page.on("request", (r) => { if (r.url().includes("/transactions/summary")) console.log(`[net] → ${r.method()} ${r.url()}`); });
  page.on("requestfailed", (r) => { if (r.url().includes("/transactions/summary")) console.log(`[net] ✗ ${r.method()} ${r.url()} — ${r.failure()?.errorText}`); });
  page.on("response", (r) => { if (r.url().includes("/transactions/summary")) console.log(`[net] ← ${r.status()} ${r.url()}`); });
  await page.goto(`${FRONTEND}/transactions`, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForTimeout(8000);

  const state = await page.evaluate(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const qc = (window as any).__NUMERIS_QC__;
    if (!qc) return { available: false };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = qc.getQueryCache().getAll();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const summary = all.find((q: any) => JSON.stringify(q.queryKey).includes("summary"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const txs = all.find((q: any) => JSON.stringify(q.queryKey) === '["/api/transactions"]');
    return {
      available: true,
      summary: summary ? {
        key: JSON.stringify(summary.queryKey),
        status: summary.state.status,
        fetchStatus: summary.state.fetchStatus,
        error: summary.state.error ? String(summary.state.error).slice(0, 200) : null,
        data: summary.state.data ? JSON.stringify(summary.state.data).slice(0, 300) : "null",
        dataUpdatedAt: summary.state.dataUpdatedAt,
        errorUpdatedAt: summary.state.errorUpdatedAt,
      } : null,
      txs: txs ? {
        status: txs.state.status,
        hasData: txs.state.data !== undefined,
        len: Array.isArray(txs.state.data) ? txs.state.data.length : -1,
      } : null,
      idbSummary: await new Promise<string>((resolve) => {
        const req = indexedDB.open("keyval-store");
        req.onsuccess = () => {
          const tx = req.result.transaction("keyval", "readonly");
          const s = tx.objectStore("keyval");
          // Persister key prefix is "numeris-query-v1-" from offline-cache.ts.
          const g = s.get('numeris-query-v1-["/api/transactions/summary"]');
          g.onsuccess = () => resolve(typeof g.result === "string" ? g.result.slice(0, 400) : "no-entry-or-non-string");
          g.onerror = () => resolve("get-failed");
        };
        req.onerror = () => resolve("open-failed");
      }),
    };
  });

  console.log("[diag] runtime state:");
  console.log(JSON.stringify(state, null, 2));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
