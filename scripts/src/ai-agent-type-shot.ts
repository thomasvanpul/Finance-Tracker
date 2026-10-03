// AI agent panel type pass (finding 928333794e02): opens the dashboard,
// presses G, reads the computed font family of the floating panel's language
// and of its legends, and captures it. Reads only — it opens the panel but
// sends nothing. Desktop only: the panel is mounted by the desktop layout.
// Writes .review/shots/ai-agent-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInSeedUser, openAccountPrefs, assertRoute } from "./account-prefs.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/ai-agent-type");

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

    const cookie = await signInSeedUser(ctx);
    const prefs = await openAccountPrefs(ctx, cookie);
    try {
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

      const page = await ctx.newPage();
      await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
      await assertRoute(page, "/");
      if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
        throw new Error("landed on the onboarding questionnaire; refusing to capture it");
      }
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("g");
      await page.getByLabel("Close AI Coach").waitFor({ timeout: 15_000 });
      const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
      const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
        console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);
      const text = (t: string) => page.getByText(t, { exact: true });

      await fam("title (AI Coach)", text("AI Coach").last());
      await fam("legend (CONTEXT)", text("CONTEXT"));
      await fam("page name (context strip)", text("CONTEXT").locator("xpath=following-sibling::*[1]"));
      await fam("legend (READY)", text("READY"));
      await fam("legend (TRY)", text("TRY"));
      await fam("empty-state sentence", page.getByText("Ask about your finances. I read", { exact: false }));
      await fam("starter prompt", text("TRY").locator("xpath=following-sibling::button[1]"));
      await fam("composer", page.locator("textarea").last());
      await page.screenshot({ path: join(OUT, "panel.png") });

      // A route with a page name: the name is language. Close, navigate, reopen.
      await page.getByLabel("Close AI Coach").click();
      await page.goto(`${FRONTEND}/budget`, { waitUntil: "networkidle" });
      await page.locator("body").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("g");
      await page.getByLabel("Close AI Coach").waitFor({ timeout: 15_000 });
      await fam("page name on /budget (context strip)", text("CONTEXT").locator("xpath=following-sibling::*[1]"));
      // Let the 0.12s open animation finish so the capture is not mid-fade.
      await page.waitForTimeout(500);
      const panel = page.getByLabel("Close AI Coach").locator("xpath=ancestor::div[contains(@style,'flex-direction: column')][1]");
      console.log(`panel opacity -> ${await panel.evaluate((el) => getComputedStyle(el).opacity)}, background -> ${await panel.evaluate((el) => getComputedStyle(el).backgroundColor)}`);
      await page.screenshot({ path: join(OUT, "panel-budget.png") });
    } finally {
      await prefs.restore();
    }
    await ctx.close();
} finally {
  await browser.close();
}
