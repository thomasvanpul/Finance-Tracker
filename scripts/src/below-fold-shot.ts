// Below the fold, one screen at a time.
//
// screenshot.ts already notes why it cannot do this: the app scrolls inside an
// inner container, so Playwright's fullPage:true captures the first viewport
// and nothing else. Judging "what remains below the fold" needs the rest, and
// a stitched full-page image of a 6,000px page is unreadable anyway — so this
// scrolls the real scrolling element by one viewport at a time and writes one
// PNG per screen, the way a person actually meets the page.
//
// It measures rather than assumes which element scrolls: the same technique as
// scroll-audit.ts, because reading the CSS got that question wrong before.
//
// Nothing is rewritten and nothing is written to the database — this is the
// live dev data as it stands.
//
// Usage:
//   tsx scripts/src/below-fold-shot.ts --route=/accounts [--viewport=desktop|mobile] [--max=6]

import { chromium } from "playwright";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = "/Users/TvpPro/Developer/Finance-Tracker/scripts/screenshots";

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit == null ? fallback : hit.slice(name.length + 3);
}

const route = arg("route", "/accounts");
const viewport = arg("viewport", "desktop");
const maxScreens = Number(arg("max", "6"));
const size = viewport === "mobile" ? { width: 390, height: 844 } : { width: 1440, height: 900 };
const slug = route.replace(/\W+/g, "") || "root";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: size, deviceScaleFactor: 2 });

const signIn = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
  headers: { "Content-Type": "application/json", Origin: FRONTEND },
  data: { email: SEED_EMAIL, password: SEED_PASSWORD },
});
if (!signIn.ok()) {
  console.error("sign-in failed", signIn.status());
  process.exit(1);
}
const cookies = await ctx.cookies();
await ctx.clearCookies();
// The API sets __Secure- prefixed cookies; the dev origin is http, where that
// prefix is rejected. Same strip the other harnesses do.
await ctx.addCookies(cookies.map((c) => ({ ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const })));

await ctx.route(`${FRONTEND}/api/**`, async (r) => {
  const req = r.request();
  const cs = await ctx.cookies();
  const res = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
    method: req.method(),
    headers: { ...req.headers(), origin: FRONTEND, cookie: cs.map((c) => `${c.name}=${c.value}`).join("; ") },
    data: req.postDataBuffer() ?? undefined,
    maxRedirects: 0,
  });
  const headers = Object.fromEntries(res.headersArray()
    .filter((h) => !["set-cookie", "content-length"].includes(h.name.toLowerCase()))
    .map((h) => [h.name, h.value]));
  await r.fulfill({ status: res.status(), headers, body: await res.body() });
});

const page = await ctx.newPage();
await page.addInitScript(`try {
  window.localStorage.setItem("ft-theme", "void");
  window.localStorage.setItem("ft-onboarding-complete", "1");
  window.localStorage.setItem("nr-onboarding-complete", "1");
} catch (e) {}`);
await page.goto(`${FRONTEND}${route}`, { waitUntil: "domcontentloaded" });
try { await page.waitForLoadState("networkidle", { timeout: 30000 }); } catch { console.log("  (networkidle timed out)"); }
await page.waitForTimeout(3000);

// Which element actually scrolls? Largest overflowing candidate wins — on this
// app that is the content column, not documentElement.
const target = await page.evaluate(() => {
  const candidates = [document.scrollingElement as Element, ...Array.from(document.querySelectorAll("*"))]
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
    .filter((el) => {
      const oy = getComputedStyle(el).overflowY;
      return (oy === "auto" || oy === "scroll" || el === document.scrollingElement)
        && el.scrollHeight - el.clientHeight > 40;
    })
    .sort((a, b) => b.scrollHeight - a.scrollHeight);
  const el = candidates[0];
  if (el == null) return null;
  el.setAttribute("data-below-fold-target", "1");
  return { tag: el.tagName, cls: el.className.toString().slice(0, 60), scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
});
if (target == null) {
  console.log(`${route} ${viewport}: nothing scrolls — one screen only`);
} else {
  console.log(`${route} ${viewport}: scrolls in <${target.tag} class="${target.cls}"> · ${target.scrollHeight}px of content in ${target.clientHeight}px`);
}

const screens = target == null ? 1 : Math.min(maxScreens, Math.ceil(target.scrollHeight / target.clientHeight));
for (let i = 0; i < screens; i += 1) {
  if (i > 0) {
    await page.evaluate((step) => {
      const el = document.querySelector("[data-below-fold-target]") as HTMLElement | null;
      if (el != null) el.scrollTop = step * el.clientHeight;
    }, i);
    await page.waitForTimeout(900);
  }
  const path = `${OUT}/fold_${slug}_${viewport}_${i + 1}.png`;
  await page.screenshot({ path });
  console.log(`  screen ${i + 1}/${screens} → ${path}`);
}

await page.unrouteAll({ behavior: "ignoreErrors" });
await ctx.close();
await browser.close();
