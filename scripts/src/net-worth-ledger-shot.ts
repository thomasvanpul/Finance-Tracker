// /net-worth drawn from GET /net-worth/history with manual entries merged
// over it (finding b6b740eade39, lib/net-worth-ledger.ts).
//
// Dev holds about one captured day for the seed user, so the history response
// is stubbed with five days (one partial), and ft-nw-history is seeded with
// one manual entry on a captured day, one manual entry on a day with no
// capture, one old "auto" snapshot and one {date, netWorth, cash, portfolio}
// capture. Expected: 6 rows; the auto and cash rows are not drawn; the manual
// entry on 2026-09-30 stands over that day's capture; only manual rows carry
// a delete button; the partial day reads "partial".
//
// Usage (api-server on :3001, Vite on :4321):
//   pnpm --filter @workspace/scripts exec tsx src/net-worth-ledger-shot.ts
// Writes .review/shots/net-worth-ledger/{desktop,table}.png. Desktop only: on a
// phone /net-worth is the WORTH tab, a different screen.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/net-worth-ledger");

const day = (date: string, netWorth: number, partial = false) => ({
  date, netWorth, assets: netWorth - 2000, portfolio: 3000, liabilities: 1000, owingNet: 0, partial,
});
const HISTORY = {
  points: [day("2026-09-27", 41000), day("2026-09-28", 41250), day("2026-09-29", 40900, true), day("2026-09-30", 41400), day("2026-10-01", 41800)],
  dataAvailableSince: "2026-09-27",
};
const STORED = [
  { date: "2026-08-15", totalAssets: 40000, totalLiabilities: 1500, netWorth: 38500, note: "before the app" },
  { date: "2026-09-30", totalAssets: 43000, totalLiabilities: 1000, netWorth: 42000, note: "after bonus" },
  { date: "2026-09-10", totalAssets: 99999, totalLiabilities: 0, netWorth: 99999, note: "auto" },
  { date: "2026-09-12", netWorth: 77777, cash: 70000, portfolio: 7777 },
];

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

try {
  {
    const name = "desktop";
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 1600 } });
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


    await ctx.route(`${FRONTEND}/api/net-worth/history**`, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(HISTORY) }));
    // ft-nw-history is an account-level key, hydrated from the preferences
    // read on load, so the seed goes into that response. Writes are swallowed:
    // nothing on the dev account changes.
    await ctx.route(`${FRONTEND}/api/settings/preferences**`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
        return;
      }
      const real = await ctx.request.get(`${FRONTEND}/api/settings/preferences`.replace(FRONTEND, API), {
        headers: { origin: FRONTEND, cookie: (await ctx.cookies()).map((c) => `${c.name}=${c.value}`).join("; ") },
      });
      const body = (await real.json()) as { preferences?: Record<string, string> };
      const preferences = { ...(body.preferences ?? {}), "ft-nw-history": JSON.stringify(STORED) };
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ preferences }) });
    });

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
    await page.goto(`${FRONTEND}/net-worth`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    await page.getByText("after bonus").first().waitFor({ state: "attached", timeout: 20_000 }).catch(async (e) => {
      await page.screenshot({ path: join(OUT, `_failed-${name}.png`), fullPage: true });
      throw e;
    });
    const text = await page.locator("body").innerText();
    const has = (s: string) => text.includes(s);
    console.log(`${name}: after bonus=${has("after bonus")} before the app=${has("before the app")} partial=${has("partial")} 99,999=${has("99,999")} 77,777=${has("77,777")} 41,400=${has("41,400")} deleteButtons=${await page.locator('button[title="Delete entry"], button:has-text("×")').count()}`);
    await page.screenshot({ path: join(OUT, `${name}.png`), fullPage: true });
    const table = page.locator("table", { hasText: "after bonus" }).first();
    await table.scrollIntoViewIfNeeded();
    await table.screenshot({ path: join(OUT, "table.png") });
    await ctx.close();
  }
} finally {
  await browser.close();
  release();
}
