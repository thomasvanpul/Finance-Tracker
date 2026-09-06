// void's --ft-muted and --ft-dim, before and after.
//
// The 2026-09-06 review task: "Moving text colour on the default theme
// is a real change, so screenshot before and after and report what it
// cost." Both shots are the CURRENT build at the same route and
// viewport; the "before" one re-injects the two retired values
// (--ft-muted #6A8098, --ft-dim #506070) as a page style so the only
// difference between the pair is those two tokens. Anything else that
// changed this session is present in both and cannot be mistaken for
// the cost of the colour move.

import { chromium } from "playwright";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";

const browser = await chromium.launch();

async function proxy(ctx: import("playwright").BrowserContext): Promise<void> {
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      const target = req.url().replace(FRONTEND, API);
      const cs = await ctx.cookies();
      const cookieHeader = cs.map((c) => `${c.name}=${c.value}`).join("; ");
      const r = await ctx.request.fetch(target, {
        method: req.method(),
        headers: { ...req.headers(), origin: FRONTEND, cookie: cookieHeader },
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
}

async function login(ctx: import("playwright").BrowserContext): Promise<void> {
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) { console.error("sign-in failed", res.status(), await res.text()); process.exit(1); }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map((c) => ({ ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const })));
}

const RETIRED = ":root{--ft-muted:#6A8098 !important;--ft-dim:#506070 !important;}";

async function shot(which: "before" | "after"): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await login(ctx);
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", "void");
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
  } catch (e) {}`);
  await page.goto(`${FRONTEND}/accounts`, { waitUntil: "networkidle" });
  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  if (which === "before") await page.addStyleTag({ content: RETIRED });
  await page.waitForTimeout(700);
  const out = `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/void-text-${which}.png`;
  await page.screenshot({ path: out });
  console.log(which, "→", out);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
  await ctx.close();
}

await shot("before");
await shot("after");
await browser.close();
console.log("done");
