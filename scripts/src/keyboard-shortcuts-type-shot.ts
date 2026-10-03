// Keyboard-shortcut overlay type pass (finding 928333794e02): opens the
// dashboard, presses ?, reads the computed font family of the overlay's
// language and of its keys and legends, and captures it. Reads only.
// Desktop only: the overlay is bound in the desktop layout.
// Writes .review/shots/keyboard-shortcuts-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInSeedUser, openAccountPrefs, assertRoute } from "./account-prefs.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/keyboard-shortcuts-type");

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
      await page.keyboard.press("?");
      await page.getByText("KEYBOARD SHORTCUTS", { exact: true }).waitFor({ timeout: 15_000 });
      const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
      const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
        console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);
      const text = (t: string) => page.getByText(t, { exact: true });

      await fam("title (KEYBOARD SHORTCUTS)", text("KEYBOARD SHORTCUTS"));
      await fam("close hint words", page.locator("span", { hasText: "TO CLOSE" }).last());
      await fam("close hint key (ESC)", text("ESC"));
      await fam("section legend (NAVIGATION)", text("NAVIGATION"));
      await fam("action name (Dashboard)", text("Dashboard").last());
      await fam("action name (Command palette)", text("Command palette"));
      await fam("key (G D)", page.locator("kbd", { hasText: "G D" }));
      await fam("key (Esc)", page.locator("kbd", { hasText: "Esc" }));
      await page.screenshot({ path: join(OUT, "overlay.png") });
    } finally {
      await prefs.restore();
    }
    await ctx.close();
} finally {
  await browser.close();
}
