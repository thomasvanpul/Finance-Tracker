// Settings › Currency, Rules, Widgets, Data and Shortcuts type pass: opens
// each panel, reads the computed font family of its language and of the data
// left in mono, and captures each. It never presses Add, Export or a Reset, so
// nothing is written. Desktop only: the phone draws MobileSettings instead.
// Writes .review/shots/settings-panels-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/settings-panels-type");

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
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
      console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);
    const text = (t: string, exact = false) => page.getByText(t, { exact });
    const open = async (panel: string, waitFor: string) => {
      await page.goto(`${FRONTEND}/settings?panel=${panel}`, { waitUntil: "networkidle" });
      if (await text("Let's shape the app around").count()) {
        throw new Error("landed on the onboarding questionnaire; refusing to capture it");
      }
      await text(waitFor).first().waitFor({ timeout: 15_000 });
      console.log(`-- ${panel}`);
    };

    await open("currency", "All amounts will be converted");
    await fam("description (sans)", text("All amounts will be converted"));
    await fam("FX description (sans)", text("Override live FX rates"));
    await fam("FX header Pair (mono)", page.locator("th", { hasText: "Pair" }));
    await fam("FX pair cell (mono)", page.locator("td", { hasText: "/" }));
    await page.screenshot({ path: join(OUT, "currency.png"), fullPage: true });

    await open("rules", "When a transaction description contains");
    console.log(`rules listed: ${await page.locator('button[aria-label^="Delete rule for"]').count()}`);
    await fam("description (sans)", text("When a transaction description contains"));
    await fam("empty state (sans)", text("No rules yet. Add one below.", true));
    await fam("Keyword label (sans)", text("Keyword", true).last());
    await fam("keyword input (sans)", page.locator('input[placeholder="keyword"]'));
    await fam("category select (sans)", page.locator("select").last());
    await fam("+ Add (sans)", page.getByRole("button", { name: "+ Add" }));
    await fam("footnote (sans)", text("Rules apply when adding transactions"));
    await page.screenshot({ path: join(OUT, "rules.png"), fullPage: true });

    await open("widgets", "Enabled widgets appear on the Dashboard page.");
    await fam("footer (sans)", text("Enabled widgets appear on the Dashboard page."));
    await page.screenshot({ path: join(OUT, "widgets.png"), fullPage: true });

    await open("data", "Export All Data downloads your account");
    await fam("export sentence (sans)", text("Export All Data downloads your account"));
    await page.screenshot({ path: join(OUT, "data.png"), fullPage: true });

    await open("shortcuts", "Keyboard Shortcuts");
    await fam("key (mono)", page.locator("kbd"));
    await fam("action (sans)", page.locator("tbody td").nth(1));
    await fam("header Action (mono)", page.locator("th", { hasText: "Action" }));
    await page.screenshot({ path: join(OUT, "shortcuts.png"), fullPage: true });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
