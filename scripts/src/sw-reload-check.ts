// End-to-end check of lib/sw-update.ts: does a new deployment force a tab
// that is already open to reload?
//
// Worth the setup cost. This check caught two defects that both read as
// correct in the source and both would have shipped a module that quietly
// did nothing: a first-visit guard that latched for the life of the tab, and
// a "is the user typing" guard that tested focus rather than content and so
// was permanently on, because the sign-in screen autofocuses an EMPTY email
// field. Neither is visible without actually deploying underneath a live tab.
//
// Recipe — two real production builds, served from a swappable root:
//
//   cd artifacts/finance-tracker
//   mkdir -p /tmp/swtest && echo a > /tmp/swtest/which
//   VERCEL_GIT_COMMIT_SHA=aaaaaaa1 pnpm run build && cp -R public /tmp/swtest/a
//   VERCEL_GIT_COMMIT_SHA=bbbbbbb2 pnpm run build && cp -R public /tmp/swtest/b
//   # a static server on :5199 that reads /tmp/swtest/which each request and
//   # serves /tmp/swtest/<that>, with index.html as the SPA fallback
//   pnpm --filter @workspace/scripts sw:reload-check
//
// The commit SHA is baked in by vite.config.ts, so the two builds differ in
// every chunk hash and in sw.js — which is what a real deploy looks like.
// The check loads build A, waits for the worker to take control, flips the
// pointer to build B, and then watches whether the tab moves on its own.
// Expected: it reloads roughly one poll interval later (measured: 63s).
import { chromium } from "playwright";

const ORIGIN = process.env.SW_ORIGIN ?? "http://localhost:5199";
const WAIT_MS = Number(process.env.SW_WAIT_MS ?? "120000");

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const loads: string[] = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) loads.push(new Date().toISOString()); });

  await page.goto(ORIGIN, { waitUntil: "load", timeout: 30000 });
  const ready = await page.evaluate(
    `navigator.serviceWorker.ready.then(function (r) { return !!r.active; })`,
  );
  const chunkBefore = await page.evaluate(
    `(document.querySelector('script[type=module]') || {}).src || ''`,
  );
  const controlledBefore = await page.evaluate(`!!navigator.serviceWorker.controller`);
  console.log(JSON.stringify({ ready, controlledBefore, chunkBefore, navigations: loads.length }));

  // The tab is now open, controlled, and running build A. Ship build B.
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/tmp/swtest/which", "b\n");
  const shippedAt = Date.now();
  console.log("[check] build B is now live; watching the open tab...");

  let reloadedAfter: number | null = null;
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    let chunkNow = "";
    try {
      chunkNow = String(await page.evaluate(`(document.querySelector('script[type=module]') || {}).src || ''`));
    } catch { continue; }
    if (chunkNow !== chunkBefore && chunkNow !== "") {
      reloadedAfter = Date.now() - shippedAt;
      console.log(JSON.stringify({ reloadedAfterMs: reloadedAfter, chunkAfter: chunkNow }));
      break;
    }
  }
  if (reloadedAfter === null) console.log("[check] FAILED — the open tab never reloaded.");
  else console.log("[check] PASSED — the open tab picked up the new build on its own.");
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
