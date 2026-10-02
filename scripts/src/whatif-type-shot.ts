// What-If type pass (finding 928333794e02): opens each of the six tabs, reads
// the computed font family of its language and data, and captures it.
// Writes .review/shots/whatif-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/whatif-type");

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
    await page.goto(`${FRONTEND}/whatif`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    await page.getByText("What-If Simulator", { exact: false }).first().waitFor({ timeout: 15_000 });
    const fam = async (text: string, exact = true) => {
      const loc = page.getByText(text, { exact }).first();
      if (!(await loc.count())) return "absent";
      return loc.evaluate((el) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, ""));
    };
    const log = async (label: string, texts: [string, boolean?][]) => {
      for (const [t, exact] of texts) console.log(`${label} | ${t} -> ${await fam(t, exact ?? true)}`);
    };
    const tabs: [string, string, [string, boolean?][]][] = [
      ["Income Change", "income", [["Income Change"], ["Surplus Impact"], ["Before"], ["Target"]]],
      ["Expense Cut", "expense", [
        ["Add a budget or import transactions", false], ["Reset all"], ["Cancel subscriptions", false],
        ["IMPACT SUMMARY"], ["Monthly Saving"],
      ]],
      ["Invest Lump Sum", "lump", [
        ["Lump Sum Amount"], ["FV = P × (1 + r)^n"], ["Monthly equivalent = what you'd need", false], ["Future Value"],
      ]],
      ["Debt Payoff", "debt", [
        ["Loan Amount"], ["MINIMUM PAYMENT"], ["/mo min to cover interest", false], ["Months to Payoff"],
        ["more months not shown", false], ["Month"], ["Balance"],
      ]],
      ["Inflation Impact", "inflation", [
        ["Inflation Rate (%/yr)"], ["Lost", false], ["Real return:", false], ["Real value of cash"], ["Real value of cash in hand"],
      ]],
      ["Portfolio Shock", "shock", [["No positions found"], ["Custom change %:"], ["Ticker"], ["Market Crash", false]]],
    ];
    for (const [tab, slug, texts] of tabs) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      await page.waitForTimeout(500);
      await log(slug, texts);
      if (slug === "inflation") {
        const fig = page.getByText("Lost", { exact: false }).first().locator("span.pnum");
        console.log(`inflation | Lost figure -> ${await fig.count() ? await fig.evaluate((el) => getComputedStyle(el).fontFamily.split(",")[0]) : "absent"}`);
      }
      await page.screenshot({ path: join(OUT, `${slug}.png`), fullPage: true });
    }
    await ctx.close();
} finally {
  await browser.close();
  release();
}
