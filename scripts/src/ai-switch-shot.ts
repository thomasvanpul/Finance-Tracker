// BACKLOG § I7 — the AI switch, checked in the running app.
//
// Off (the seed account's nr-ai-enabled absent): HOME mounts the insight
// panel and must send NO AI request (/api/ai/* or /api/receipt/*, less the
// public /api/ai/status health read), and the panel must say why. Then Settings → AI Coach:
// the switch renders off, a click turns it on, and the change reaches the
// server as nr-ai-enabled=true. restore() puts the account's own value back.
//
// Run: pnpm --filter @workspace/scripts exec tsx src/ai-switch-shot.ts
// Writes .review/shots/ai-switch/{home-ai-off,settings-ai-off,settings-ai-on}.png

import { chromium, type Request } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FRONTEND, API, signInSeedUser, openAccountPrefs, assertRoute } from "./account-prefs.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/ai-switch");
const AI_KEY = "nr-ai-enabled";
const OFF_TEXT = "AI is off for this account.";

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
let failed = false;
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed = true;
};

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      const cs = await ctx.cookies();
      const r = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
        method: req.method(),
        headers: { ...req.headers(), origin: FRONTEND, cookie: cs.map((c) => `${c.name}=${c.value}`).join("; ") },
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

  const cookie = await signInSeedUser(ctx);
  const prefs = await openAccountPrefs(ctx, cookie);
  try {
    await prefs.setPreference(AI_KEY, null);

    const page = await ctx.newPage();
    const aiRequests: string[] = [];
    const prefPatches: string[] = [];
    let statusRequests = 0;
    page.on("request", (req: Request) => {
      const path = new URL(req.url()).pathname;
      // /api/ai/status is not an AI call: it reads the server's in-memory
      // provider health (api-server lib/ai-config.ts getAiHealth), contacts
      // no provider and carries no user data. Counted, not failed.
      if (path === "/api/ai/status") statusRequests += 1;
      else if (path.startsWith("/api/ai") || path.startsWith("/api/receipt")) aiRequests.push(`${req.method()} ${path}`);
      if (path === "/api/settings/preferences" && req.method() === "PATCH") prefPatches.push(req.postData() ?? "");
    });

    await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
    await assertRoute(page, "/");
    await page.getByText(OFF_TEXT).first().waitFor({ timeout: 15_000 });
    await page.waitForTimeout(1500); // the panel fetches 500 ms after mount
    check(aiRequests.length === 0, `HOME with AI off sent no AI request (saw: ${aiRequests.join(", ") || "none"})`);
    check((await page.getByText(OFF_TEXT).count()) > 0, "HOME insight panel says AI is off");
    console.log(`info: /api/ai/status requests on HOME: ${statusRequests} (public provider health, not an AI call)`);
    await page.screenshot({ path: join(OUT, "home-ai-off.png"), fullPage: false });

    await page.goto(`${FRONTEND}/settings?panel=ai`, { waitUntil: "networkidle" });
    const row = page.getByText("Turn on AI", { exact: true });
    await row.waitFor({ timeout: 15_000 });
    await page.screenshot({ path: join(OUT, "settings-ai-off.png"), fullPage: false });

    // The nearest row that holds a Toggle (settings-atoms.tsx: a button with aria-pressed).
    const toggle = row.locator("xpath=ancestor::div[.//button[@aria-pressed]][1]//button[@aria-pressed]");
    check((await toggle.getAttribute("aria-pressed")) === "false", "switch renders off for an account that never turned AI on");
    await toggle.click();
    await page.waitForTimeout(1500);
    const stored = await page.evaluate((k) => localStorage.getItem(k), AI_KEY);
    check(stored === "true", `switch writes ${AI_KEY}=true locally (got ${stored})`);
    check(prefPatches.some((b) => b.includes(`"${AI_KEY}":"true"`)), "switch pushes nr-ai-enabled=true to the server");
    await page.screenshot({ path: join(OUT, "settings-ai-on.png"), fullPage: false });

    const server = await ctx.request.get(`${API}/api/settings/preferences`, { headers: { Cookie: cookie, Origin: FRONTEND } });
    const serverValue = ((await server.json()) as { preferences: Record<string, string> }).preferences[AI_KEY];
    check(serverValue === "true", `server holds ${AI_KEY}=true (got ${serverValue})`);
  } finally {
    await prefs.restore();
  }
  await ctx.close();
} finally {
  await browser.close();
}
if (failed) process.exit(1);
