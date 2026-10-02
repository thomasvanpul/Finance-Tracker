// Unconvertible-accounts badge, shared chart tooltip and tester report sheet
// type pass (finding 928333794e02). Reads computed font families at 1440x900:
//  - the dashboard net-worth widget's "N accounts without FX — not in total";
//  - /analytics' chart tooltips: each series name, its value, and the label row;
//  - the tester report sheet opened from the header's REPORT button: the Bug /
//    Idea radio, "Send to group", and "Figures shown / hidden".
// Reads only. The one stub is flagTwoUnconvertible, below; nothing is written.
// Writes .review/shots/badges-tooltip-report-type/<label>/.
import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const LABEL = process.argv[2] ?? "current";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/badges-tooltip-report-type", LABEL);

// The badge draws only when GET /api/dashboard reports unconvertible accounts,
// and every dev account converts. In the browser's copy the counter is set to
// 2; every figure is the API's and nothing is written.
function flagTwoUnconvertible(body: Buffer): Buffer {
  const d = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
  console.log(`dashboard unconvertibleAccounts was ${String(d.unconvertibleAccounts)}, stubbed to 2`);
  return Buffer.from(JSON.stringify({ ...d, unconvertibleAccounts: 2 }));
}

async function signedInContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      const isDashboard = new URL(req.url()).pathname === "/api/dashboard" && req.method() === "GET";
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
        body: isDashboard && r.ok() ? flagTwoUnconvertible(await r.body()) : await r.body(),
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
  return ctx;
}

const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
const fam = async (label: string, loc: Locator) =>
  console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);

async function refuseOnboarding(page: Page) {
  if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
    throw new Error("landed on the onboarding questionnaire; refusing to capture it");
  }
}

// Hover each Recharts chart until its tooltip shows, and print every leaf in
// the tooltip with its family. Stops after `limit` tooltips.
async function readTooltips(page: Page, limit: number) {
  const charts = page.locator(".recharts-wrapper");
  const n = await charts.count();
  let seen = 0;
  for (let i = 0; i < n && seen < limit; i++) {
    const chart = charts.nth(i);
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    if (!box) continue;
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5);
    await page.waitForTimeout(300);
    const tip = chart.locator(".recharts-tooltip-wrapper");
    if (!(await tip.count()) || !(await tip.innerText()).trim()) continue;
    seen += 1;
    // No named helper inside evaluate: tsx wraps it in __name, which the page lacks.
    const leaves = await tip.evaluate((root) =>
      Array.from(root.querySelectorAll("*"))
        .filter((el) => el.children.length === 0 && (el.textContent ?? "").trim())
        .map((el) => `"${(el.textContent ?? "").trim().slice(0, 32)}"${el.classList.contains("pnum") ? " (.pnum)" : ""} -> ${getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "")}`),
    );
    console.log(`analytics chart ${i} tooltip:`);
    for (const l of leaves) console.log(`  ${l}`);
    await page.screenshot({ path: join(OUT, `analytics-tooltip-${i}.png`), clip: { x: Math.max(0, box.x - 20), y: Math.max(0, box.y - 20), width: Math.min(box.width + 40, 1440), height: box.height + 120 } });
  }
}

const release = acquireCaptureLock();
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
  const ctx = await signedInContext(browser);
  const page = await ctx.newPage();
  const exact = (t: string | RegExp) => page.getByText(t, { exact: typeof t === "string" });

  // ── Dashboard: net-worth widget badge ────────────────────────────
  // App.tsx's DefaultPageRedirector sends "/" to the persona's default page
  // once per session; the second load of "/" stays on the dashboard.
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await refuseOnboarding(page);
  await page.goto(`${FRONTEND}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  console.log(`dashboard url ${page.url()}`);
  const badge = exact(/^2 accounts without FX — not in total$/);
  await fam("dashboard unconvertible badge", badge);
  if (await badge.count()) {
    await badge.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, "dashboard-badge.png") });
  }

  // ── /analytics: chart tooltips ───────────────────────────────────
  await page.goto(`${FRONTEND}/analytics`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await readTooltips(page, 6);

  // ── Tester report sheet ──────────────────────────────────────────
  await page.goto(`${FRONTEND}/accounts`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  const reportBtn = page.getByRole("button", { name: "REPORT", exact: true });
  if (await reportBtn.count()) {
    await reportBtn.click();
    await page.getByText("Send to group", { exact: true }).waitFor({ timeout: 15000 });
    await page.waitForTimeout(500);
    await fam("report radio bug", page.getByRole("radio", { name: "bug" }));
    await fam("report radio idea", page.getByRole("radio", { name: "idea" }));
    await fam("report Send to group", exact("Send to group"));
    await fam("report Figures shown/hidden", exact(/^Figures (shown|hidden)$/));
    await page.screenshot({ path: join(OUT, "report-sheet.png") });
  } else {
    console.log("REPORT button absent");
  }
  await ctx.close();
} finally {
  await browser.close();
  release();
}
