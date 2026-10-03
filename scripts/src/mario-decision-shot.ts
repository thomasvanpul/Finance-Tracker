// mario theme decision: shoots /dashboard and /accounts in mario as it ships,
// then again with the candidate palette in .review/decide-mario-surface.patch
// injected as a page style. The theme is set on the DOM only, never on the
// account, so nothing is written. Writes .review/shots/mario-decision/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInSeedUser, openAccountPrefs, assertRoute } from "./account-prefs.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/mario-decision");

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

      const CANDIDATE = `[data-theme="mario"] {
        --ft-base: #0C2A78; --ft-surface: #143386; --ft-raised: #1D3F9A;
        --ft-border: #6080D8; --ft-border2: #7A96E0;
        --ft-text: #FCFCFC; --ft-muted: #D4E4FF; --ft-dim: #A9C0F2; --ft-accent: #F8C800;
        --ft-amber: #F5A623; --ft-orange: #FF8A4C; --ft-green: #5BD65B; --ft-red: #FF8070;
        --ft-blue: #9DB8FF; --ft-cyan: #90DCFC; }`;
      const page = await ctx.newPage();
      for (const route of ["", "accounts"]) {
        await page.goto(`${FRONTEND}/${route}`, { waitUntil: "networkidle" });
        if (route === "") await assertRoute(page, "/");
        if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
          throw new Error("landed on the onboarding questionnaire; refusing to capture it");
        }
        await page.evaluate(() => { document.documentElement.dataset.theme = "mario"; });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, `${route || "dashboard"}-current.png`) });
        await page.addStyleTag({ content: CANDIDATE });
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, `${route || "dashboard"}-candidate.png`) });
        console.log(`${route || "dashboard"}: shot`);
      }
    } finally {
      await prefs.restore();
    }
    await ctx.close();
} finally {
  await browser.close();
}
