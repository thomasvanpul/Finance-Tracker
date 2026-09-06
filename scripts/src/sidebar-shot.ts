// The desktop sidebar, on its own, in the two themes that break it
// differently: void (default dark) and arctic (light). §3 of the
// 2026-09-06 review task asks whether the rest of Thomas's sidebar
// critique — hover, icons, spacing — is addressed. This is the
// evidence for that answer.
//
// Captures the <aside class="ft-sidebar"> element only, expanded,
// with a nav row hovered in one pair so the hover token is visible
// rather than asserted.

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

async function shot(theme: "void" | "arctic", hover: boolean, collapsed = false): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
  await login(ctx);
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", ${JSON.stringify(theme)});
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
    window.localStorage.setItem("ft-sidebar", ${JSON.stringify(collapsed ? "collapsed" : "expanded")});
  } catch (e) {}`);

  await page.goto(`${FRONTEND}/transactions`, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    if (t === "void") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", t);
  }, theme);
  await page.waitForTimeout(500);

  const aside = page.locator("aside.ft-sidebar");
  if (hover && !collapsed) {
    // Hover a non-active row so --ft-hover is in the capture.
    await page.locator('aside.ft-sidebar button[aria-label="Goals"]').hover();
    await page.waitForTimeout(250);
  }
  const out = `/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots/sidebar_${theme}${collapsed ? "_rail" : ""}${hover ? "_hover" : ""}.png`;
  await aside.screenshot({ path: out });
  const box = await aside.boundingBox();
  console.log(theme, hover ? "hover" : "rest", `${Math.round(box!.width)}x${Math.round(box!.height)}`, "→", out);
  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
  await ctx.close();
}

for (const theme of ["void", "arctic"] as const) {
  await shot(theme, false);
  await shot(theme, true);
  await shot(theme, false, true);
}
await browser.close();
console.log("done");
