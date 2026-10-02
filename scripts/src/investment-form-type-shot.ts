// Add-position form type pass (finding 928333794e02): opens /investments?add=1
// at phone width, where WorthScreen opens the add-position sheet (on desktop the
// page is gated while market data is off, so the dialog does not render),
// and reads the computed font family of each site
// components/investments/investment-form-fields.tsx draws — the ticker and
// number inputs, the exchange hint, the asset-class select, the
// "Auto-detected" sentence, the Per Share / Total Cost buttons and the
// Effective Cost / Share line. It types into the form and never submits it,
// so nothing is written. Writes .review/shots/investment-form-type/<label>/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const LABEL = process.argv[2] ?? "current";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/investment-form-type", LABEL);

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
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
    await page.goto(`${FRONTEND}/investments?add=1`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    const ticker = page.locator("#inv-phone-ticker");
    try {
      await ticker.waitFor({ timeout: 15_000 });
    } catch (e) {
      await page.screenshot({ path: join(OUT, "no-form.png"), fullPage: true });
      console.log(`no form at ${page.url()}`);
      throw e;
    }
    const dialog = page.locator("form").filter({ has: ticker });
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
      console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);

    // One letter: no class is derived yet, so the sentence shows.
    await ticker.fill("V");
    await fam("auto-detected sentence", dialog.getByText("Auto-detected:", { exact: false }));
    await fam("hint words (US market)", dialog.getByText("US market", { exact: false }));
    await fam("hint currency (· USD)", dialog.getByText("· USD", { exact: true }));

    await ticker.fill("VOD.L");
    await fam("hint codes (LSE · GBP)", dialog.getByText("LSE · GBP", { exact: true }));
    await fam("ticker input", ticker);
    await fam("asset-class select", dialog.locator("button[role=combobox]"));
    await fam("Per Share button", dialog.getByRole("button", { name: "Per Share" }));
    await fam("Total Cost button", dialog.getByRole("button", { name: "Total Cost" }));

    await page.locator("#inv-phone-shares").fill("10");
    await page.locator("#inv-phone-cost").fill("2.15");
    await fam("shares input", page.locator("#inv-phone-shares"));
    await fam("cost input", page.locator("#inv-phone-cost"));
    await fam("fees input", page.locator("#inv-phone-fees"));
    await fam("legend (Effective Cost / Share)", dialog.getByText("Effective Cost / Share", { exact: true }));
    await fam("effective-cost figure", dialog.getByText("2.1500 GBP", { exact: true }));
    await dialog.screenshot({ path: join(OUT, "add-position.png") });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
