// Settings › Connections type pass (finding 928333794e02): opens the panel,
// opens the add form, reads the computed font family of its language, and
// captures both states. It never presses Validate + Add, Sync or Remove, so
// nothing is written. Desktop only: the phone draws MobileSettings instead.
// Writes .review/shots/connections-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/connections-type");

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
    await page.goto(`${FRONTEND}/settings?panel=connections`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    await page.getByText("Credentials are AES-256-GCM at rest.", { exact: false }).first().waitFor({ timeout: 15_000 });
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
      console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);
    const text = (t: string, exact = false) => page.getByText(t, { exact });

    console.log(`connections listed: ${await text("Last synced").count()}`);
    await fam("connection name / caption (Last synced)", text("Last synced"));
    await fam("empty state title", text("No connections yet", true));
    await fam("Add a connection title", text("Add a connection", true));
    await fam("trailing encryption note", text("Credentials are AES-256-GCM at rest."));
    await page.screenshot({ path: join(OUT, "panel.png"), fullPage: true });

    await page.getByRole("button", { name: "> ADD", exact: true }).click();
    await text("Validated against").first().waitFor();
    await fam("Provider label", text("Provider", true));
    await fam("Label label", page.locator("label", { hasText: "(optional)" }));
    await fam("provider select", page.locator("form select"));
    await fam("credential field", page.locator('form input[type="password"]'));
    await fam("label field", page.locator('form input[type="text"]'));
    await fam("submit button", page.locator('form button[type="submit"]'));
    await fam("validated-before-stored note", text("Validated against"));
    console.log(`submit button text: ${await page.locator('form button[type="submit"]').first().innerText()}`);
    await page.screenshot({ path: join(OUT, "add-form.png"), fullPage: true });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
