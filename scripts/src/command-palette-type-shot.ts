// ⌘K / "/" command palette type pass (finding 928333794e02): reads the
// computed font family of each part of the palette and captures it, empty
// query, a "go" query and a no-results query. Writes .review/shots/command-palette-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/command-palette-type");

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
    await page.goto(`${FRONTEND}/transactions`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("/");
    const input = page.locator('input[placeholder^="Type a command"]');
    await input.waitFor({ timeout: 10_000 });
    const fam = (loc: import("playwright").Locator) => loc.first().evaluate((el) => getComputedStyle(el).fontFamily.split(",")[0]);
    const panel = input.locator("xpath=ancestor::div[2]");
    const report = async (label: string) => {
      const title = panel.locator('[data-selected] > span:nth-child(2)');
      const shortcut = panel.locator('[data-selected] > span:nth-child(3)');
      console.log(`${label}: input=${await fam(input)} title=${await title.count() ? await fam(title) : "-"} shortcut=${await shortcut.count() ? await fam(shortcut) : "-"} legend=${await fam(panel.getByText("NAVIGATION", { exact: true })).catch(() => "-")} hintWord=${await fam(panel.getByText("esc", { exact: true }).locator("xpath=.."))} hintKey=${await fam(panel.getByText("esc", { exact: true }))}`);
    };
    await report("empty");
    await panel.screenshot({ path: join(OUT, "empty.png") });
    await input.fill("go to");
    await report("go to");
    await input.fill("100 gbp to myr");
    await page.waitForTimeout(300);
    const conv = panel.getByText("CONVERT", { exact: true });
    console.log(`convert: present=${await conv.count()} title=${await conv.count() ? await fam(panel.locator('[data-selected] > span:nth-child(2)')) : "-"}`);
    await panel.screenshot({ path: join(OUT, "convert.png") });
    await input.fill("zzqqxx");
    console.log(`no results: ${await fam(panel.getByText("NO RESULTS", { exact: true }))}`);
    await panel.screenshot({ path: join(OUT, "no-results.png") });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
