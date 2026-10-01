// The stat drill modal's five-step quality scale, in every theme, and a
// live check of the daily net-worth history behind the dashboard.
//
// Task 2026-10-01 (decided findings): --ft-orange added to all 14 themes
// and the scale moved from fixed hexes to tokens; "the scale checked in
// every theme (screenshot)". The theme is switched on the page's <html>
// attribute only, never through the account, so nothing is left changed.
//
// Usage (api-server on :3001, Vite on :4321):
//   pnpm --filter @workspace/scripts exec tsx src/quality-scale-shot.ts [TICKER] [STAT]
// STAT defaults to P/Book: it needs a value for one step to show as the
// assessment, and AAPL's P/E is empty in dev.
// Writes .review/shots/quality-scale/<theme>.png.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const TICKER = process.argv[2] ?? "AAPL";
const STAT = process.argv[3] ?? "P/Book";
const THEMES = [
  "void", "phosphor", "arctic", "parchment", "slate", "linen", "amber",
  "midnight", "matrix", "synthwave", "deep-space", "mario", "gilded", "bloodline",
];
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/quality-scale");

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
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

  // Net-worth history: the dashboard read captures today, the history returns it.
  const dash = await ctx.request.get(`${FRONTEND}/api/dashboard`);
  const dashBody = (await dash.json()) as { netWorth: number; baseCurrency: string };
  const hist = await ctx.request.get(`${FRONTEND}/api/net-worth/history?days=30`);
  const histBody = (await hist.json()) as { points: { date: string; netWorth: number; partial: boolean }[]; dataAvailableSince: string | null };
  const last = histBody.points.at(-1);
  console.log(`dashboard ${dash.status()}: netWorth ${dashBody.netWorth} ${dashBody.baseCurrency}`);
  console.log(`history ${hist.status()}: ${histBody.points.length} point(s) since ${histBody.dataAvailableSince}; last ${last?.date} ${last?.netWorth} partial=${last?.partial}`);

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
  await page.goto(`${FRONTEND}/investments`, { waitUntil: "networkidle" });
  if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
    throw new Error("landed on the onboarding questionnaire; refusing to capture it");
  }
  const search = page.locator('input[placeholder^="Enter ticker"], input[placeholder^="Search another ticker"]').first();
  await search.waitFor({ timeout: 20_000 }).catch(async (e) => {
    await page.screenshot({ path: join(OUT, "_failed.png") });
    throw e;
  });
  await search.fill(TICKER);
  await search.press("Enter");
  const cell = page.getByText(STAT, { exact: true }).first();
  await cell.waitFor({ timeout: 30_000 });
  await cell.click();
  const scale = page.getByText("Quality Scale", { exact: true });
  await scale.waitFor({ timeout: 10_000 });
  // The modal panel: the only child of the fixed z-index 2000 backdrop.
  const modal = page.locator('div[style*="z-index: 2000"] > div').first();

  for (const theme of THEMES) {
    await page.evaluate((t) => {
      if (t === "void") document.documentElement.removeAttribute("data-theme");
      else document.documentElement.setAttribute("data-theme", t);
    }, theme);
    await page.waitForTimeout(150);
    const orange = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ft-orange").trim());
    await modal.screenshot({ path: join(OUT, `${theme}.png`) });
    console.log(`${theme}: --ft-orange ${orange}`);
  }
} finally {
  await browser.close();
  release();
}
