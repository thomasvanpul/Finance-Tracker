// Phone shell chrome type pass (finding 928333794e02): at phone width, reads
// the computed font family of the header every directory route opens in, the
// DIRECTORY tab's group header and item count, and the desktop-only
// explainer, and captures each. Reads only. Writes .review/shots/phone-shell-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/phone-shell-type");

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
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
    const page = await ctx.newPage();
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
      console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);
    const go = async (url: string) => {
      await page.goto(`${FRONTEND}${url}`, { waitUntil: "networkidle" });
      if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
        throw new Error("landed on the onboarding questionnaire; refusing to capture it");
      }
    };
    const back = page.locator('button[aria-label="Back to directory"]');

    await go("/directory");
    await page.getByRole("button", { name: /Calculators/ }).first().click();
    await back.waitFor({ timeout: 15_000 });
    await fam("directory group back control", back);
    await fam("directory group title (Calculators)", page.locator("header span").filter({ hasText: "Calculators" }));
    await page.screenshot({ path: join(OUT, "directory-group.png") });
    await back.click();
    await fam("directory row count", page.locator("li button span.pnum"));
    await page.screenshot({ path: join(OUT, "directory.png") });

    await go("/pension");
    await back.waitFor({ timeout: 15_000 });
    await fam("wrapped route back control", back);
    await fam("wrapped route title (Pension)", page.locator("header span").filter({ hasText: /^Pension$/ }));
    await page.screenshot({ path: join(OUT, "wrapped-pension.png") });

    await go("/business");
    await back.waitFor({ timeout: 15_000 });
    await fam("desktop-only back control", back);
    await fam("desktop-only title (Business)", page.locator("header span").filter({ hasText: /^Business$/ }));
    await fam("desktop-only eyebrow", page.getByText("DESKTOP FOR NOW", { exact: true }));
    await page.screenshot({ path: join(OUT, "desktop-only-business.png") });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
