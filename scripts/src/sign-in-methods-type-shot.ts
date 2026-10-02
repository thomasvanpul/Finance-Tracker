// Profile › Sign-in Methods type pass (finding 928333794e02): opens /profile,
// reads the computed font family of the panel's language and data, and
// captures it. Account and passkey lists are stubbed inside this browser only
// so every row kind renders (password, Google, a passkey, the add buttons);
// it never presses Remove or an add button, so nothing is written.
// Writes .review/shots/sign-in-methods-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/sign-in-methods-type");
const TAG = process.argv[2] ?? "shot";

const ACCOUNTS = [
  { id: "stub-cred", providerId: "credential", accountId: "stub-cred", createdAt: "2026-03-14T09:00:00.000Z" },
  { id: "stub-google", providerId: "google", accountId: "stub-google", createdAt: "2026-05-02T09:00:00.000Z" },
];
const PASSKEYS = [{ id: "stub-pk", name: "MacBook Touch ID", createdAt: "2026-06-20T09:00:00.000Z" }];
const json = (body: unknown) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

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

    // Registered after the proxy, so these win for their own URLs.
    await ctx.route(`${FRONTEND}/api/auth-providers`, (r) =>
      r.fulfill(json({ providers: ["google", "github"], passkeyEnabled: true })));
    await ctx.route(`${FRONTEND}/api/auth/list-accounts*`, (r) => r.fulfill(json(ACCOUNTS)));
    await ctx.route(`${FRONTEND}/api/auth/passkey/list-user-passkeys*`, (r) => r.fulfill(json(PASSKEYS)));

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
    await page.goto(`${FRONTEND}/profile`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    const panel = page.locator("div", { has: page.getByText("Sign-in Methods", { exact: true }) })
      .filter({ has: page.getByText("Add another", { exact: true }) }).last();
    await panel.getByText("MacBook Touch ID", { exact: true }).waitFor({ timeout: 15_000 });
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
      console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);
    const text = (t: string, exact = true) => panel.getByText(t, { exact });

    await fam("panel title Sign-in Methods (reference)", text("Sign-in Methods"));
    await fam("provider name Password", text("Password"));
    await fam("provider name Google", text("Google"));
    await fam("passkey name MacBook Touch ID", text("MacBook Touch ID"));
    await fam("date line Added <date>", text("Added", false));
    await fam("date line Registered <date>", text("Registered", false));
    await fam("date figure inside Added line", text("Added", false).locator(".pnum"));
    await fam("Remove button", panel.getByRole("button", { name: "Remove" }));
    await fam("Add another title", text("Add another"));
    await fam("add Passkey button", panel.getByRole("button", { name: "Passkey", exact: true }));
    await fam("add GitHub button", panel.getByRole("button", { name: "GitHub", exact: true }));
    await panel.screenshot({ path: join(OUT, `panel-${TAG}.png`) });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
