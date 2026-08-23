// Scroll-audit script — measure the DOM, don't infer from CSS.
//
// The scroll-container survey (commit e5935d3) removed two nested
// pairs based on CSS reading and got two of the five candidates
// wrong. This script does the opposite: signs in as the seed user,
// opens each route at each viewport, and reports which elements
// ACTUALLY have a visible vertical scrollbar in the rendered DOM.
//
// For each route × viewport:
//   1. Load the page
//   2. Query every element where computed overflow-y is auto/scroll
//      AND scrollHeight > clientHeight (i.e. actually overflows)
//   3. Report a compact description of each: tag, id/class, size,
//      offset in the viewport, distance from the nearest scrolling
//      ancestor
//
// The goal is Thomas's exact question: does /settings actually show
// TWO vertical scrollbars? If so, which elements own them?

import { chromium } from "playwright";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";

const browser = await chromium.launch();

async function proxy(ctx: import("playwright").BrowserContext): Promise<void> {
  await ctx.route(`${FRONTEND}/api/**`, async (route) => {
    try {
      const req = route.request();
      // Force /api/ai/status = available so the coach page shows its
      // populated state rather than the "AI OFFLINE" empty state
      // (which would collapse the transcript scroll region).
      if (req.url().endsWith("/api/ai/status")) {
        return route.fulfill({
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ available: true, providers: [
            { name: "groq",       keyConfigured: true, models: [], modelsVerified: true, verifiedAt: new Date().toISOString(), lastError: null },
            { name: "cerebras",   keyConfigured: true, models: [], modelsVerified: true, verifiedAt: new Date().toISOString(), lastError: null },
            { name: "openrouter", keyConfigured: true, models: [], modelsVerified: true, verifiedAt: new Date().toISOString(), lastError: null },
          ]}),
        });
      }
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
  if (!res.ok()) { console.error("sign-in failed", res.status()); process.exit(1); }
  const cookies = await ctx.cookies();
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map((c) => ({ ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const })));
}

interface ScrollerReport {
  selector: string;
  tag: string;
  className: string;
  id: string;
  scrollHeight: number;
  clientHeight: number;
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
  overflowY: string;
  nearestScrollingAncestorSelector: string | null;
}

async function audit(route: string, viewport: { w: number; h: number }): Promise<void> {
  const ctx = await browser.newContext({ viewport: { width: viewport.w, height: viewport.h }, deviceScaleFactor: 1 });
  await login(ctx);
  await proxy(ctx);
  const page = await ctx.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
  } catch (e) {}`);
  await page.goto(`${FRONTEND}${route}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  // page.evaluate serialises the function as a string and re-parses
  // in the browser. tsx's ESM transform injects `__name` helpers
  // around named function declarations, which then reference an
  // undefined symbol in the browser context. Passing the source as
  // a plain string via evaluate(str) sidesteps the transform.
  const scrollerScript = `(() => {
    const all = [];
    const selectorFor = (el) => {
      const bits = [el.tagName.toLowerCase()];
      if (el.id) bits.push('#' + el.id);
      if (el.className && typeof el.className === 'string') {
        const cls = el.className.trim().split(/\\s+/).slice(0, 2).join('.');
        if (cls) bits.push('.' + cls);
      }
      return bits.join('');
    };
    const nearestScrollingAncestor = (el) => {
      let p = el.parentElement;
      while (p) {
        const o = getComputedStyle(p).overflowY;
        if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
        p = p.parentElement;
      }
      return null;
    };
    const nodes = document.querySelectorAll('*');
    for (const el of Array.from(nodes)) {
      const cs = getComputedStyle(el);
      const oy = cs.overflowY;
      if (oy !== 'auto' && oy !== 'scroll') continue;
      if (el.scrollHeight <= el.clientHeight) continue;
      const rect = el.getBoundingClientRect();
      const anc = nearestScrollingAncestor(el);
      all.push({
        selector: selectorFor(el),
        tag: el.tagName.toLowerCase(),
        className: typeof el.className === 'string' ? el.className : '',
        id: el.id,
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        offsetTop: Math.round(rect.top),
        offsetLeft: Math.round(rect.left),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        overflowY: oy,
        nearestScrollingAncestorSelector: anc ? selectorFor(anc) : null,
      });
    }
    return all;
  })()`;
  const scrollers = (await page.evaluate(scrollerScript)) as ScrollerReport[];

  console.log(`\n▸ ${route} @ ${viewport.w}×${viewport.h}`);
  if (scrollers.length === 0) {
    console.log("  (no active vertical scrollers)");
  } else {
    for (const s of scrollers) {
      const nest = s.nearestScrollingAncestorSelector ? `  ← inside: ${s.nearestScrollingAncestorSelector}` : "";
      console.log(
        `  ${s.selector}  ${s.width}×${s.height}px @ (${s.offsetLeft},${s.offsetTop})  ` +
        `scrollHeight=${s.scrollHeight} clientHeight=${s.clientHeight}  overflowY=${s.overflowY}${nest}`,
      );
    }
  }

  // Per-route sanity extras. These make the "did we shrink or did
  // we clip" question objective — a clipped composer reports as
  // off-viewport, not just "one scroller instead of two".
  const extrasScript = `(() => {
    const out = {};
    const main = document.querySelector('main.ft-main');
    if (main) {
      out.mainScrollHeight = main.scrollHeight;
      out.mainClientHeight = main.clientHeight;
      out.mainOverflowsBy = main.scrollHeight - main.clientHeight;
    }
    if (${JSON.stringify(route)} === '/ai-coach') {
      const textarea = document.querySelector('textarea');
      if (textarea) {
        const r = textarea.getBoundingClientRect();
        out.composerVisible = r.bottom <= window.innerHeight && r.top >= 0;
        out.composerTop = Math.round(r.top);
        out.composerBottom = Math.round(r.bottom);
      } else {
        out.composerVisible = null;
      }
    }
    if (${JSON.stringify(route)} === '/settings') {
      const nav = document.querySelector('.ft-settings-nav');
      if (nav) {
        const items = nav.querySelectorAll('button');
        out.navItemCount = items.length;
        const last = items[items.length - 1];
        if (last) {
          last.scrollIntoView({ block: 'end' });
          const r = last.getBoundingClientRect();
          out.navLastItemReachable = r.bottom <= window.innerHeight && r.top >= 0;
          out.navLastItemTop = Math.round(r.top);
        } else {
          out.navLastItemReachable = null;
        }
      }
    }
    return out;
  })()`;
  const extras = (await page.evaluate(extrasScript)) as Record<string, unknown>;
  for (const [k, v] of Object.entries(extras)) {
    console.log(`    ${k}: ${JSON.stringify(v)}`);
  }

  await page.unrouteAll({ behavior: "ignoreErrors" });
  await page.close();
  await ctx.close();
}

const ROUTES = ["/settings", "/ai-coach", "/split"];
const VIEWPORTS = [{ w: 1440, h: 900 }, { w: 1024, h: 768 }];

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    await audit(route, vp);
  }
}

await browser.close();
console.log("\ndone");
