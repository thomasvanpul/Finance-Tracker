// Proof that the screenshot harness refuses to write a PNG of something that
// is not the page that was asked for.
//
// Every case below produced a PNG and exited 0 before the assertion existed.
// Each is served over HTTP at a real path and answered 200, exactly as the SPA
// does — a wrong page is indistinguishable from a right one at the transport
// layer, which is why the assertion has to look at the DOM.
//
//   pnpm --filter @workspace/scripts verify:inspect-assertions
//
// Not in `pnpm -r test`: it needs a browser. The pure part of the check (the
// route table behind inspect's up-front validation) is covered by
// src/app-routes.test.ts, which the gate does run.

import { chromium } from "playwright";
import { createServer } from "node:http";
import { assertRendered } from "./screenshot.js";

const PAGES: Record<string, string> = {
  "/four-oh-four": `<div data-nr-route-state="not-found"><h1>404 Page Not Found</h1></div>`,
  "/signed-out":   `<div data-nr-route-state="auth">Sign in to Numeris with your email and password</div>`,
  "/onboarding":   `<div data-nr-route-state="onboarding">Welcome to Numeris, let us set your accounts up</div>`,
  "/blank":        `<div></div>`,
  "/redirector":   `<div>${"plenty of rendered text on a page that then moves ".repeat(3)}</div><script>history.replaceState({}, "", "/elsewhere")</script>`,
  "/accounts":     `<div>${"Numeris accounts net worth balance ".repeat(4)}</div>`,
};

const MUST_FAIL: ReadonlyArray<readonly [string, string]> = [
  ["404 component",  "/four-oh-four"],
  ["sign-in screen", "/signed-out"],
  ["onboarding",     "/onboarding"],
  ["blank body",     "/blank"],
  ["navigated away", "/redirector"],
];

async function main(): Promise<void> {
  const server = createServer((req, res) => {
    const path = (req.url ?? "/").split("?")[0];
    res.writeHead(200, { "content-type": "text/html" });
    res.end(`<!doctype html><body>${PAGES[path] ?? "<div>unknown</div>"}</body>`);
  });
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  const { port } = server.address() as { port: number };
  const base = `http://127.0.0.1:${port}`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  let wrong = 0;

  for (const [label, path] of MUST_FAIL) {
    await page.goto(base + path, { waitUntil: "networkidle" });
    try {
      await assertRendered(page, path);
      console.log(`NOT CAUGHT  ${label} — a PNG would have been written`);
      wrong++;
    } catch (err) {
      console.log(`refused     ${label}: ${(err as Error).message}`);
    }
  }

  // Positive control. Without it, an assertion that rejects everything would
  // pass this file — and a harness that always fails is as useless as one
  // that never does.
  await page.goto(`${base}/accounts`, { waitUntil: "networkidle" });
  try {
    await assertRendered(page, "/accounts");
    console.log("passed      (control) a genuine page — no false failure");
  } catch (err) {
    console.log(`FALSE FAIL  (control) ${(err as Error).message}`);
    wrong++;
  }

  await browser.close();
  server.close();

  if (wrong > 0) throw new Error(`${wrong} case(s) wrong — the render assertion does not bite as claimed`);
  console.log(`\nall ${MUST_FAIL.length} shapes refused, control passed`);
}

main().catch((err: unknown) => {
  console.error("[verify:inspect-assertions] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
