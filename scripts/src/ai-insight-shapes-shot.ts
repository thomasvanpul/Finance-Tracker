// AI insights card, driven by model-shaped output.
//
// §2 of the 2026-09-06 review task asked for this card to be run
// against a live model. It cannot be: no GROQ_API_KEY, CEREBRAS_API_KEY
// or OPENROUTER_API_KEY exists locally, /api/ai/status reports
// available:false, and both numeris-api.onrender.com and
// financetracker.work answer a Cloudflare challenge to a non-browser
// client. So this drives the SAME transport (POST /api/ai/chat,
// text/event-stream, token frames then a done frame) with output
// shaped like what a model returns, including the shapes that break
// layouts. It is a stub. It proves the renderer, not the model.
//
// Three batches, three lines each — the card takes the first 3
// non-empty lines:
//   plain       what the prompt asks for: "figure — clause"
//   adversarial no separator at all; two separators; a 7-figure sum
//   overflow    a clause far over eight words; a head over 24 chars;
//               a head with no digit in it
// The last two batches exist because splitInsight() only splits on
// " — " when the head is <= 24 chars AND contains a digit. Every
// other shape falls through and renders whole as prose.

import { chromium } from "playwright";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";

const BATCHES: Record<string, string[]> = {
  // The shape the prompt asks for from 2026-09-08: figure, clause, support.
  plain: [
    "£412/mo — the rise in subscriptions is timing, not a new habit — three annual renewals landed in the same month, against a 6% budget line",
    "£1,240 — dining out is where the month went, not groceries — it is 34% above your average while groceries held flat at £310",
    "22% — the savings rate gap is one month, not a trend — £890 of rent and a £412 renewal cluster fell inside the same 30 days",
  ],
  // The two-part shape the prompt asked for until 2026-09-08. Still valid,
  // still renders: the support slot is absent rather than padded.
  twoPart: [
    "£412/mo — subscriptions, up 18% on last quarter",
    "£1,240 — dining out this month, 34% above your average",
    "22% — savings rate, below your 30% target",
  ],
  adversarial: [
    "Your spending looks broadly stable this month with nothing unusual across any category.",
    "£1,240 — dining out — up 34% on last month",
    "£1,284,930.55 — total portfolio value across all six accounts",
  ],
  overflow: [
    "18% — of your take-home pay now goes to recurring subscriptions and standing orders that renew automatically each month without any further action from you",
    "Groceries and Transport — together 42% of everything you spent",
    "Subscriptions — up sharply on the last three months",
  ],
};

const browser = await chromium.launch();

function sse(lines: string[]): string {
  // Chunk the way a real stream arrives: several tokens per line,
  // not one frame carrying the whole answer.
  const text = lines.join("\n");
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 17) chunks.push(text.slice(i, i + 17));
  return (
    chunks.map((c) => `event: token\ndata: ${JSON.stringify({ text: c })}\n\n`).join("") +
    `event: done\ndata: ${JSON.stringify({ servingProvider: "groq", reducedCapacity: false })}\n\n`
  );
}

async function proxy(ctx: import("playwright").BrowserContext, batch: string): Promise<void> {
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      if (req.url().endsWith("/api/ai/status")) {
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ available: true, providers: [
            { name: "groq", keyConfigured: true, models: ["openai/gpt-oss-120b"], modelsVerified: true, verifiedAt: new Date().toISOString(), lastError: null },
          ]}),
        });
      }
      if (req.url().endsWith("/api/ai/chat")) {
        return route.fulfill({
          status: 200,
          headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
          body: sse(BATCHES[batch]!),
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

async function login(ctx: import("playwright").BrowserContext): Promise<void> {
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) { console.error("sign-in failed", res.status(), await res.text()); process.exit(1); }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map((c) => ({ ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const })));
}

async function shot(batch: string, width: number, label: string): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });
  await login(ctx);
  await proxy(ctx, batch);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", "void");
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
    window.sessionStorage.removeItem("ft-dashboard-ai-insights");
    window.sessionStorage.removeItem("ft-dashboard-ai-insights-dismissed");
  } catch (e) {}`);

  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  const card = page.locator(".ft-dashboard-insights:visible").locator("xpath=..").first();
  await card.waitFor({ state: "visible", timeout: 15000 });
  await page.waitForTimeout(900);

  const out = `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/ai-insight_${batch}_${label}.png`;
  await card.screenshot({ path: out });
  // Report the measured box so an overflow is a number, not an impression.
  const box = await card.boundingBox();
  const clipped = await page.evaluate(() => {
    const grid = Array.from(document.querySelectorAll(".ft-dashboard-insights")).find((g) => (g as HTMLElement).offsetParent !== null)!;
    const rows = Array.from(grid.children);
    return rows.map((r) => ({ h: Math.round(r.getBoundingClientRect().height), overflow: r.scrollHeight > r.clientHeight + 1 }));
  });
  console.log(batch, label, `card ${Math.round(box!.width)}x${Math.round(box!.height)}`, JSON.stringify(clipped));
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
  await ctx.close();
  console.log("saved", out);
}

for (const batch of Object.keys(BATCHES)) {
  await shot(batch, 1440, "desktop");
}
// No mobile capture: at 390px the phone dashboard renders its own
// insights surface, which never resolved visible under this stub —
// it does not go through this fetch path. Desktop only, stated
// rather than quietly dropped.
await browser.close();
console.log("done");
