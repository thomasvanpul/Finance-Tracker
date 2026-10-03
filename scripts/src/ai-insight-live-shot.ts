// AI insights against the LIVE provider chain (the 2026-09-06 task's §2).
// Unlike ai-insight-shapes-shot.ts nothing is stubbed: the dashboard's own
// POST /api/ai/chat goes to whichever provider the api-server has keys for.
// Loads / RUNS times (default 3) in fresh pages, waits for the card to settle,
// prints what it shows and captures the top of the dashboard each time.
// Reads only. Writes .review/shots/ai-insight-live/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/ai-insight-live");

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
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

    const signIn = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
      headers: { "Content-Type": "application/json", Origin: FRONTEND },
      data: { email: SEED_EMAIL, password: SEED_PASSWORD },
    });
    if (!signIn.ok()) throw new Error(`sign-in failed: ${signIn.status()} ${await signIn.text()}`);
    const cookies = await ctx.cookies();
    await ctx.clearCookies();
    await ctx.addCookies(cookies.map((c) => ({ ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const })));

    // An un-onboarded seed account renders the questionnaire on every route.
    // PUT persona re-stamps onboarded_at; the persona itself is kept.
    const personaRes = await ctx.request.get(`${FRONTEND}/api/settings/persona`);
    const persona = (await personaRes.json()) as { persona: string | null; onboarded: boolean };
    if (!persona.onboarded) {
      const put = await ctx.request.put(`${FRONTEND}/api/settings/persona`, {
        headers: { "Content-Type": "application/json" },
        data: { persona: persona.persona ?? "full" },
      });
      console.log(`seed account was not onboarded; re-stamped persona ${persona.persona ?? "full"}: ${put.status()}`);
    }

    const RUNS = Number(process.env.RUNS ?? 3);
    for (let i = 1; i <= RUNS; i++) {
      const page = await ctx.newPage();
      const chat = page.waitForResponse((r) => r.url().endsWith("/api/ai/chat"), { timeout: 60_000 }).catch(() => null);
      await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
      if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
        throw new Error("landed on the onboarding questionnaire; refusing to capture it");
      }
      const res = await chat;
      if (res) await res.finished().catch(() => null);
      await page.waitForTimeout(1500);
      const refresh = page.getByRole("button", { name: "Refresh AI insights" }).first();
      const region = (await refresh.count())
        ? await refresh.evaluate((el) => {
            let n: HTMLElement | null = el as HTMLElement;
            for (let k = 0; k < 4 && n?.parentElement; k++) n = n.parentElement;
            return n?.innerText ?? "";
          })
        : "(no insight card on the page)";
      console.log(`--- run ${i}: /api/ai/chat ${res ? res.status() : "not requested"}`);
      console.log(region.replace(/\n+/g, " | ").slice(0, 900));
      await page.screenshot({ path: join(OUT, `run-${i}.png`), clip: { x: 0, y: 0, width: 1440, height: 420 } });
      await page.close();
    }
    await ctx.close();
} finally {
  await browser.close();
  release();
}
