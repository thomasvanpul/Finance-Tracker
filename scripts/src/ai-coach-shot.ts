// AI Coach design-pass captures — one script, four PNGs (two
// surfaces × two themes). Two "captures" per Thomas's cap: the
// /ai-coach page (empty state) and the floating panel opened on
// /budget. Both are captured in void (dark) and arctic (light) so
// the design survives both.
//
// Uses the same seed-user + api-proxy pattern as
// scripts/src/desktop-persona-shot.ts. Seeds sessionStorage with a
// fixture message stream so the streaming-state visuals
// (StreamingProgress caption, reducedCapacity footer, cut, error,
// queued follow-up) are visible in the coach-with-messages shot.

import { chromium } from "playwright";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";

const browser = await chromium.launch();

async function proxy(ctx: import("playwright").BrowserContext): Promise<void> {
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      // Force /api/ai/status to report available:true so the floating
      // agent renders (component hides itself if available === false)
      // and the /ai-coach page shows the "AI ONLINE" state. In this
      // dev env the seed user's provider keys aren't set so the real
      // response is available:false — we only need available:true
      // for the DESIGN capture, not for real inference.
      if (req.url().endsWith("/api/ai/status")) {
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ available: true, providers: [
            { name: "groq",       keyConfigured: true, models: ["openai/gpt-oss-120b"], modelsVerified: true, verifiedAt: new Date().toISOString(), lastError: null },
            { name: "cerebras",   keyConfigured: true, models: ["gpt-oss-120b"],        modelsVerified: true, verifiedAt: new Date().toISOString(), lastError: null },
            { name: "openrouter", keyConfigured: true, models: ["nvidia/nemotron-3-super-120b-a12b:free"], modelsVerified: true, verifiedAt: new Date().toISOString(), lastError: null },
          ]}),
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
          r
            .headersArray()
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

async function login(ctx: import("playwright").BrowserContext): Promise<void> {
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) {
    console.error("sign-in failed", res.status(), await res.text());
    process.exit(1);
  }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(
    cookies.map((c) => ({ ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const })),
  );
}

// Fixture stream that shows every streaming state visual in one
// screenshot: streaming caption, reducedCapacity footer, cut marker,
// error, queued follow-up. Injected via sessionStorage so the coach
// page hydrates with these messages on load.
const FIXTURE_MESSAGES = [
  { role: "user", text: "How am I doing this month?" },
  {
    role: "model",
    text:
      "Your spending is up roughly 12% vs last month, largely driven by Groceries and Transport. Savings rate is 22% — below your 30% target but not alarming.\n\n" +
      "One thing to focus on: **Groceries is at 122% of budget** with a week left. Consider a no-shop weekend to reset the trajectory.",
    status: "done",
    servingProvider: "cerebras",
    reducedCapacity: true,
  },
  { role: "user", text: "What changed since last month?" },
  {
    role: "model",
    text: "Compared with last month:\n\n1. Dining rose 34%, Transport fell 8%\n2. Two new subscriptions started (£23/mo combined)",
    status: "cut",
    servingProvider: "groq",
    cutReason: "connection dropped after 47 tokens",
  },
];

async function shot(surface: "coach" | "floating", theme: "void" | "arctic"): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await login(ctx);
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
    ${surface === "coach"
      ? `window.sessionStorage.setItem("nr-ai-coach-msgs", ${JSON.stringify(JSON.stringify(FIXTURE_MESSAGES))});`
      : ""}
  } catch (e) {}`);

  const path = surface === "coach" ? "/ai-coach" : "/budget";
  await page.goto(`${FRONTEND}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  // Force theme via data-theme attribute — bypasses the server-side
  // theme hydration that overrides localStorage after sign-in.
  await page.evaluate((t) => {
    if (t === "void") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await page.waitForTimeout(200);

  if (surface === "floating") {
    // Click the classic floating button directly. Its title starts
    // "Open AI Coach" — distinct from the sidebar link labelled just
    // "AI Coach".
    await page.locator('button[title^="Open AI Coach"]').first().click();
    await page.waitForTimeout(500);
  }

  const outPath = `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/ai-coach_${surface}_${theme}.png`;
  await page.screenshot({ path: outPath, fullPage: false });
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
  await ctx.close();
  console.log("saved", outPath);
}

for (const surface of ["coach", "floating"] as const) {
  for (const theme of ["void", "arctic"] as const) {
    await shot(surface, theme);
  }
}
await browser.close();
console.log("done");
