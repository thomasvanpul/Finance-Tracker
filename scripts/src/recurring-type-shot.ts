// Recurring type pass (finding 928333794e02): reads the computed font
// family of /recurring's language and data in all three views, and captures
// each. Read-only. Writes .review/shots/recurring-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/recurring-type");

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
    await page.goto(`${FRONTEND}/recurring`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    await page.getByText("Monthly Commitment", { exact: false }).first().waitFor({ timeout: 15_000 });
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (text: string, exact = true) => {
      const loc = page.getByText(text, { exact }).first();
      if (!(await loc.count())) return "absent";
      return loc.evaluate(family);
    };
    const log = async (label: string, texts: [string, boolean?][]) => {
      for (const [t, exact] of texts) console.log(`${label} | ${t} -> ${await fam(t, exact ?? true)}`);
    };
    const sel = async (label: string, css: string) => {
      const loc = page.locator(css).first();
      console.log(`${label} | ${css} -> ${(await loc.count()) ? await loc.evaluate(family) : "absent"}`);
    };

    // Cards view (the default).
    await log("kpi", [["Monthly Commitment"], ["active patterns", false], ["projected recurring"], ["total rules", false]]);
    await log("trend", [["Last Year"], ["recurring costs", false]]);
    await log("caption", [["Matched by description", false], ["Define rules to auto-categorize", false], ["Preview and apply active rules", false]]);
    await log("cards", [["Est. amount"], ["Last seen"], ["Next est."], ["Count"], ["CONF", false], ["+ Add Rule"]]);
    // The frequency chips, not the <option>s of the select above them.
    for (const f of [/^monthly$/, /^~\d+d$/]) {
      const chip = page.locator("span", { hasText: f }).first();
      console.log(`cards | chip ${f} -> ${(await chip.count()) ? await chip.evaluate(family) : "absent"}`);
    }
    await sel("cards", 'input[placeholder="Search merchant…"]');
    await sel("cards", "select");
    await log("rules", [["Match text (substring)"], ["Assign category"], ["Notes (optional)"], ["NO MANUAL RULES", false]]);
    await sel("rules", 'input[placeholder="e.g. Netflix"]');
    await log("apply", [["un-categorized transaction", false], ["Show Preview", false], ["Detected patterns"], ["Active rules"]]);
    // The first KPI figure and the first series' merchant, by structure.
    const kpiFig = page.locator(".pnum").first();
    console.log(`data | first .pnum -> ${await kpiFig.evaluate(family)}`);
    await page.screenshot({ path: join(OUT, "recurring-cards.png"), fullPage: true });

    await page.getByRole("button", { name: "CALENDAR", exact: true }).click();
    await log("calendar", [["PAYMENT CALENDAR", false], ["MON"], ["due this month", false]]);
    await page.screenshot({ path: join(OUT, "recurring-calendar.png"), fullPage: true });

    await page.getByRole("button", { name: "CATEGORY", exact: true }).click();
    await log("category", [["TOTAL"], ["NO CATEGORY DATA", false], ["more categories", false]]);
    await page.screenshot({ path: join(OUT, "recurring-category.png"), fullPage: true });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
