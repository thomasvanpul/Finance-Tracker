// Sign-in screen type pass (finding 928333794e02): reads the computed font
// family of the signed-out screen's fields, buttons, link and error sentence,
// and captures it. Signs in nobody; the one failed attempt uses an address
// that does not exist. Writes .review/shots/auth-gate-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/auth-gate-type");

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  for (const [label, viewport] of [
    ["desktop", { width: 1440, height: 900 }],
    ["phone", { width: 390, height: 844 }],
  ] as const) {
    const ctx = await browser.newContext({ viewport });
    await ctx.route(`${FRONTEND}/api/**`, async (route) => {
      try {
        const req = route.request();
        const r = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
          method: req.method(),
          headers: { ...req.headers(), origin: FRONTEND },
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

    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
    const email = page.locator('input[type="email"]');
    await email.waitFor({ timeout: 20_000 });
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (name: string, loc: ReturnType<typeof page.locator>) =>
      console.log(`${label} | ${name} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);

    await fam("email field", email);
    await fam("password field", page.locator('input[type="password"]'));
    await fam("submit button", page.locator('button[type="submit"]'));
    await fam("Forgot password? link", page.getByText("Forgot password?", { exact: true }));
    await fam("OR divider", page.getByText("OR", { exact: true }));
    await page.screenshot({ path: join(OUT, `${label}-signin.png`), fullPage: true });

    if (label === "desktop") {
      await email.fill("type-shot@example.invalid");
      await page.locator('input[type="password"]').fill("not-a-real-password");
      await page.locator('button[type="submit"]').click();
      const alert = page.getByRole("alert");
      await alert.waitFor({ timeout: 15_000 });
      await fam("error sentence", alert.locator("div").first());
      await page.screenshot({ path: join(OUT, `${label}-error.png`), fullPage: true });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  release();
}
