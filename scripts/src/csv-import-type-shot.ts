// CSV import modal type pass (finding 928333794e02): opens /transactions,
// clicks "↑ CSV", reads the computed font family of the modal's language and
// of its data, attaches a small in-memory CSV to read the file name and size
// line, and captures both states. Reads only — it never presses Import.
// Writes .review/shots/csv-import-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/csv-import-type");

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
    await page.getByRole("button", { name: "↑ CSV" }).click();
    await page.getByText("Import CSV / OFX / QIF", { exact: false }).waitFor({ timeout: 15_000 });
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
      console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);
    const text = (t: string) => page.getByText(t, { exact: true });

    await fam("title", page.getByText("Import CSV / OFX / QIF", { exact: false }));
    await fam("field label (Bank / Provider)", text("Bank / Provider"));
    await fam("provider button", page.getByRole("button", { name: /revolut/i }));
    await fam("drop-zone prompt", text("Drop .csv file here or click to browse"));
    await fam("extension list", text("CSV · OFX · QIF"));
    await fam("format hint", page.getByText("→ CSV.", { exact: false }));
    await fam("Cancel", page.getByRole("button", { name: "Cancel" }));
    await fam("Import", page.getByRole("button", { name: "Import", exact: true }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(OUT, "modal.png") });

    await page.locator('input[type="file"]').setInputFiles({
      name: "statement-2026-09.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("Date,Description,Amount\n2026-09-01,Test,1.00\n"),
    });
    await fam("chosen file name", text("statement-2026-09.csv"));
    await fam("size and extension line", page.getByText(/KB · CSV/));
    await page.screenshot({ path: join(OUT, "modal-file.png") });
    await page.getByRole("button", { name: "Cancel" }).click();
    await ctx.close();
} finally {
  await browser.close();
  release();
}
