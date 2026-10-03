// What each AI panel shows when no AI provider answers.
//
// Written 2026-09-11 with the removal of the OpenRouter lane. With Groq and
// Cerebras both down there is no third lane, so every panel that used to
// hide itself on failure now says why. This captures that, two ways:
//
//   real       the local api-server as it is — no GROQ_API_KEY or
//              CEREBRAS_API_KEY exists locally, so /api/ai/status reports
//              available:false and /api/ai/chat answers 503 "not
//              configured". Nothing is stubbed; no request leaves the
//              machine for a model provider.
//   exhausted  both providers configured but failing. That cannot be
//              produced locally without sending the seed account's
//              financial summary to Groq and Cerebras with a dead key, so
//              it is REPLAYED: /api/ai/status says available and
//              /api/ai/chat answers with the exact error frame
//              routes/ai.ts writes when the chain is exhausted. It proves
//              the renderer, not the chain — chain.test.ts covers that.
//
// Needs the api-server on :3001 and Vite on :4321.

import { chromium } from "playwright";
import { signInSeedUser, openAccountPrefs, assertRoute } from "./account-prefs.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT_DIR = "/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots";

// routes/ai.ts CLIENT_FAILURE, as sent in the SSE error frame on exhaustion.
const CLIENT_FAILURE = "The AI service is temporarily unavailable. Please try again in a moment.";

type Mode = "real" | "exhausted";

const PAGES: Array<{ path: string; label: string }> = [
  { path: "/", label: "dashboard" },
  { path: "/budget", label: "budget" },
  { path: "/goals", label: "goals" },
  { path: "/portfolio", label: "portfolio" },
];

const browser = await chromium.launch();

async function proxy(ctx: import("playwright").BrowserContext, mode: Mode): Promise<void> {
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      if (mode === "exhausted" && req.url().endsWith("/api/ai/status")) {
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ available: true, providers: [] }),
        });
      }
      if (mode === "exhausted" && req.url().endsWith("/api/ai/chat")) {
        return route.fulfill({
          status: 200,
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
          body: `event: error\ndata: ${JSON.stringify({ message: CLIENT_FAILURE, triedProviders: ["groq", "cerebras"] })}\n\n`,
        });
      }
      const target = req.url().replace(FRONTEND, API);
      const cs = await ctx.cookies();
      const cookieHeader = cs.map((c) => `${c.name}=${c.value}`).join("; ");
      const r = await ctx.request.fetch(target, {
        method: req.method(),
        headers: { ...req.headers(), origin: FRONTEND, cookie: cookieHeader },
        data: req.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      await route.fulfill({
        status: r.status(),
        headers: Object.fromEntries(
          r.headersArray()
            .filter((h) => !["set-cookie", "content-length"].includes(h.name.toLowerCase()))
            .map((h) => [h.name, h.value]),
        ),
        body: await r.body(),
      });
    } catch (e) {
      if (!(e instanceof Error) || !/disposed|closed/i.test(e.message)) throw e;
    }
  });
}

async function shot(mode: Mode, path: string, label: string): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  const cookie = await signInSeedUser(ctx);
  // AI is opt-in (BACKLOG § I7): with nr-ai-enabled absent every panel would
  // say "AI is off" and never reach the failure this script photographs.
  const prefs = await openAccountPrefs(ctx, cookie);
  try {
    await prefs.setPreference("nr-ai-enabled", "true");
    await proxy(ctx, mode);
    const page = await ctx.newPage();
    await page.addInitScript(`try {
      window.localStorage.setItem("ft-onboarding-complete", "1");
      window.localStorage.setItem("nr-onboarding-complete", "1");
    } catch (e) {}`);

    // Not networkidle: the app holds a live market stream open, so the network
    // never goes idle. The message wait below is the real readiness signal.
    await page.goto(`${FRONTEND}${path}`, { waitUntil: "domcontentloaded" });
    // visible=true: a page can carry a hidden second copy (the phone layout),
    // and .first() on that one never becomes visible.
    const message = page
      .getByText(/AI (insights are unavailable|service is temporarily unavailable|assistant is not configured)/)
      .locator("visible=true")
      .first();
    let found = true;
    try {
      await message.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      found = false;
    }
    await page.waitForTimeout(500);
    if (path === "/") await assertRoute(page, "/");

    const out = `${OUT_DIR}/ai-failure_${mode}_${label}.png`;
    // Always keep the page in context too: the crop shows the message, the
    // viewport shows where it sits and whether its controls came with it.
    await page.screenshot({ path: `${OUT_DIR}/ai-failure_${mode}_${label}_viewport.png` });
    if (found) {
      // The message's panel: nearest ancestor at least 300px wide, so the
      // capture shows the surface the message sits in, not the bare line.
      const handle = await message.evaluateHandle((el) => {
        let n: HTMLElement | null = el as HTMLElement;
        while (n && n.getBoundingClientRect().width < 300) n = n.parentElement;
        return n?.parentElement ?? el;
      });
      await handle.asElement()!.screenshot({ path: out });
      console.log(mode, label, "FOUND:", JSON.stringify(await message.textContent()));
    } else {
      await page.screenshot({ path: out });
      console.log(mode, label, "NOT FOUND — full viewport saved");
    }
    await page.unrouteAll({ behavior: "ignoreErrors" });
    await page.close();
    console.log("saved", out);
  } finally {
    await prefs.restore();
  }
  await ctx.close();
}

for (const mode of ["real", "exhausted"] as const) {
  for (const p of PAGES) await shot(mode, p.path, p.label);
}
await browser.close();
console.log("done");
