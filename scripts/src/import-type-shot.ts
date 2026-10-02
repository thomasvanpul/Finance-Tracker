// Import type pass (finding 928333794e02): walks the three steps with the
// example CSV, reads the computed font family of their language and data, and
// captures each step. It never presses Import, so nothing is written.
// Writes .review/shots/import-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/import-type");

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

    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/import`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    await page.getByText("Step 1", { exact: false }).first().waitFor({ timeout: 15_000 });
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (text: string, exact = true) => {
      const loc = page.getByText(text, { exact }).first();
      if (!(await loc.count())) return "absent";
      return loc.evaluate(family);
    };
    const log = async (label: string, texts: [string, boolean?][]) => {
      for (const [t, exact] of texts) console.log(`${label} | ${t} -> ${await fam(t, exact ?? true)}`);
    };
    const famOf = async (label: string, selector: string) => {
      const loc = page.locator(selector).first();
      console.log(`${label} | ${selector} -> ${(await loc.count()) ? await loc.evaluate(family) : "absent"}`);
    };

    // Step 1
    await page.getByRole("button", { name: "Show example CSV" }).click();
    await log("step1", [
      ["PASTE / UPLOAD"], ["Paste your bank export below", false], ["DRAG & DROP OR CLICK TO UPLOAD"],
      [".csv · .ofx · .qif"], ["OR PASTE BELOW"], ["Example Barclays/Monzo-style CSV"],
      ["Hide example"], ["Parse CSV"], ["Use this example →"],
    ]);
    await famOf("step1", "pre");
    await page.getByRole("button", { name: "Use this example →" }).click();
    await famOf("step1", "textarea");
    await famOf("step1 line count", "textarea + div");
    await page.screenshot({ path: join(OUT, "step1.png"), fullPage: true });

    // Step 2
    await page.getByRole("button", { name: "Parse CSV" }).click();
    await page.getByText("Step 2", { exact: false }).first().waitFor();
    await log("step2", [
      ["Tell Numeris which CSV column", false], ["Quick presets — auto-fill for known banks and brokers"],
      ["Column mapping"], ["Amount format"], ["Single column (+ income, − expense)", false],
      ["Monzo"], ["Amount column (signed)"], ["← Back"], ["Build Preview"],
    ]);
    await famOf("step2", "select");
    await famOf("step2 preview th", "th");
    await famOf("step2 preview td", "td");
    await page.screenshot({ path: join(OUT, "step2.png"), fullPage: true });

    // Step 3 — review only; Import is never pressed.
    await page.getByRole("button", { name: "Build Preview" }).click();
    await page.getByText("Step 3", { exact: false }).first().waitFor();
    await log("step3", [
      ["transactions selected", false], ["Total Rows"], ["Import into account:"], ["Required to import"],
      ["Date"], ["Description"], ["2025-01-15"], ["Tesco Groceries"], ["INCOME"], ["READY"], ["DUP"],
    ]);
    await famOf("step3", "select");
    await famOf("step3 amount", "td.pnum");
    await famOf("step3 kpi value", "div.pnum");
    await page.screenshot({ path: join(OUT, "step3.png"), fullPage: true });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
