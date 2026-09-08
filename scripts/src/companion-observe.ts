// Watches the companion on a live dev page for a stretch of time and reports
// what it ACTUALLY does — not what the source says it should.
//
// A screenshot cannot show a behaviour that only exists over seconds. "The cat
// is going berserk" was true and every still frame looked fine; what the
// numbers below showed was motion in 99.9% of frames, a 214px corridor walked
// 3,716px in one minute, and twenty teleports in thirty seconds of scrolling.
// None of that is visible in a PNG.
//
// Prerequisite: both dev servers running (see screenshot.ts), and the seeded
// dev user. The AI assistant is force-enabled for this run the same way
// SCREENSHOT_COMPANION does it — only `available` is flipped, no figure and no
// model output is invented — because the companion only mounts under the
// assistant and no local dev API has a provider key.
//
//   pnpm --filter @workspace/scripts companion:observe
//   OBSERVE_SECONDS=60 OBSERVE_SCROLL=1 pnpm --filter @workspace/scripts companion:observe
//
//   OBSERVE_SECONDS  how long to watch          (default 60)
//   OBSERVE_ROUTE    which page                 (default /)
//   OBSERVE_SCROLL=1 scroll the main container between t=3s and t=8s
//   OBSERVE_MOUSE=1  sweep a synthetic pointer past it at t=10s
import { chromium, type BrowserContext } from "playwright";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const FRONTEND = process.env.SCREENSHOT_FRONTEND ?? "http://localhost:4321";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const SECONDS = Number(process.env.OBSERVE_SECONDS ?? "60");
const ROUTE = process.env.OBSERVE_ROUTE ?? "/";

async function signIn(context: BrowserContext): Promise<void> {
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(cookies.map((c) => ({
    ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const,
  })));
}

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signIn(context);

  await context.route(`${FRONTEND}/api/**`, async (route) => {
    const request = route.request();
    const targetUrl = request.url().replace(FRONTEND, API_BASE);
    try {
      const cookies = await context.cookies();
      const cookie = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      const response = await context.request.fetch(targetUrl, {
        method: request.method(),
        headers: { ...request.headers(), origin: FRONTEND, cookie },
        data: request.postDataBuffer() ?? undefined,
        maxRedirects: 0,
      });
      let body = await response.body();
      if (targetUrl.includes("/api/ai/status")) {
        try {
          const parsed = JSON.parse(body.toString("utf-8")) as Record<string, unknown>;
          parsed.available = true;
          body = Buffer.from(JSON.stringify(parsed), "utf-8");
        } catch { /* not JSON */ }
      }
      await route.fulfill({
        status: response.status(),
        headers: Object.fromEntries(response.headersArray()
          .filter((h) => !["set-cookie", "content-length"].includes(h.name.toLowerCase()))
          .map((h) => [h.name, h.value])),
        body,
      });
    } catch (err) {
      if (!(err instanceof Error) || !/disposed|closed/i.test(err.message)) throw err;
    }
  });

  const page = await context.newPage();
  await page.addInitScript(`try {
    window.localStorage.setItem("ft-theme", "void");
    window.localStorage.setItem("ft-onboarding-complete", "1");
    window.localStorage.setItem("nr-onboarding-complete", "1");
    window.localStorage.setItem("numeris-ai-style", "wanderer");
    window.localStorage.setItem("ft-widgets", JSON.stringify({ enabled: ["net-worth","cash-flow-sankey"], spans: {} }));
  } catch (e) {}`);

  const errs: string[] = [];
  page.on("pageerror", (e) => errs.push(e.message));

  await page.goto(new URL(ROUTE, FRONTEND).toString(), { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(1500);

  const present = await page.locator('[aria-label^="Assistant · "]').count();
  console.log(`[observe] companion elements found: ${present}`);
  if (present === 0) {
    console.log("[observe] companion did not render — cannot observe.");
    await browser.close();
    return;
  }

  // Built as a source string: tsx compiles arrow functions with an esbuild
  // `__name` helper that does not exist in the page, so a normal
  // page.evaluate(fn) throws ReferenceError inside the browser.
  const CODE = `(async () => {
    const MOUSE = ${process.env.OBSERVE_MOUSE === "1"};
    const SCROLL = ${process.env.OBSERVE_SCROLL === "1"};
    // Cost of one obstacle scan, which the companion runs every 700ms and on
    // every window scroll / resize.
    const scanCost = (function () {
      const t0 = performance.now();
      let n = 0;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const range = document.createRange();
      for (let node = w.nextNode(); node != null; node = w.nextNode()) {
        const v = node.nodeValue;
        if (v == null || v.trim().length === 0) continue;
        range.selectNodeContents(node);
        n += range.getClientRects().length;
      }
      return { ms: +(performance.now() - t0).toFixed(1), rects: n };
    })();
    const scroller = (function () {
      const els = document.querySelectorAll("*");
      let best = null;
      for (let i = 0; i < els.length; i++) {
        const e = els[i];
        if (e.scrollHeight > e.clientHeight + 200 && e.clientHeight > 300) { best = e; break; }
      }
      return best;
    })();
    const sel = '[aria-label^="Assistant · "]';
    const samples = [];
    const start = performance.now();
    let frames = 0;
    await new Promise(function (done) {
      function tick() {
        frames++;
        // Scripted pointer: a sweep at t=10s, then the pointer stops dead.
        // A real user's cursor stops far more often than it moves, and that
        // is the case the stalk logic has to get right.
        if (SCROLL && scroller) {
          const e0 = performance.now() - start;
          if (e0 > 3000 && e0 < 8000) scroller.scrollTop = ((e0 - 3000) / 12) % Math.max(scroller.scrollHeight - scroller.clientHeight, 1);
        }
        if (MOUSE) {
          const el0 = performance.now() - start;
          if (el0 > 10000 && el0 < 11000) {
            const px = 700 + (el0 - 10000) * 0.5;
            window.dispatchEvent(new MouseEvent("mousemove", { clientX: px, clientY: 700, bubbles: true }));
          }
        }
        const el = document.querySelector(sel);
        const now = performance.now() - start;
        if (el) {
          const sprite = el.firstElementChild;
          samples.push({
            t: now,
            x: parseFloat(el.style.left) || 0,
            y: parseFloat(el.style.top) || 0,
            state: (el.getAttribute("aria-label") || "").replace("Assistant · ", ""),
            facing: sprite && sprite.style.transform ? "flipped" : "normal",
            over: (function () {
              if (frames % 6 !== 0) return -1;
              const r = el.getBoundingClientRect();
              const nodes = document.querySelectorAll(".pnum");
              let n = 0;
              for (let i = 0; i < nodes.length; i++) {
                const b = nodes[i].getBoundingClientRect();
                if (b.width === 0) continue;
                if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) n++;
              }
              return n;
            })(),
          });
        } else {
          samples.push({ t: now, x: NaN, y: NaN, state: "(absent)", facing: "-", over: 0 });
        }
        if (now < ${SECONDS} * 1000) requestAnimationFrame(tick); else done();
      }
      requestAnimationFrame(tick);
    });

    let facingFlips = 0, stateChanges = 0, absentFrames = 0, dirChanges = 0, travelled = 0;
    const stateSeconds = {};
    const stateSeq = [];
    let lastDir = 0, jumps = 0;
    const jumpList = [];
    let movingFrames = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      if (s.state === "(absent)") absentFrames++;
      const prev = samples[i - 1];
      if (!prev) continue;
      const dt = (s.t - prev.t) / 1000;
      stateSeconds[s.state] = (stateSeconds[s.state] || 0) + dt;
      if (s.facing !== prev.facing) facingFlips++;
      if (Math.abs(s.x - prev.x) > 0.01) movingFrames++;
      if (s.state !== prev.state) { stateChanges++; stateSeq.push((s.t/1000).toFixed(1) + "s " + prev.state + "->" + s.state); }
      const d = s.x - prev.x;
      if (Number.isFinite(d) && (Math.abs(d) > 10 || Math.abs(s.y - prev.y) > 1)) {
        jumps++; jumpList.push((s.t/1000).toFixed(1) + "s " + Math.round(prev.x) + "," + prev.y + " -> " + Math.round(s.x) + "," + s.y);
      }
      if (Number.isFinite(d)) {
        travelled += Math.abs(d);
        const dir = Math.sign(d);
        if (dir !== 0) { if (lastDir !== 0 && dir !== lastDir) dirChanges++; lastDir = dir; }
      }
    }

    const el = document.querySelector(sel);
    const overlapNow = [];
    if (el) {
      const r = el.getBoundingClientRect();
      const seen = {};
      const nodes = document.querySelectorAll(".pnum");
      for (let i = 0; i < nodes.length; i++) {
        const b = nodes[i].getBoundingClientRect();
        if (b.width === 0) continue;
        if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) {
          const t = (nodes[i].textContent || "").trim().slice(0, 24);
          if (!seen[t]) { seen[t] = 1; overlapNow.push(t); }
        }
      }
    }

    let checked = 0, coveringFrames = 0;
    samples.forEach(function (s) { if (s.over >= 0) { checked++; if (s.over > 0) coveringFrames++; } });
    const xs = samples.map(function (s) { return s.x; }).filter(Number.isFinite);
    const ys = samples.map(function (s) { return s.y; }).filter(Number.isFinite);
    const uniqYSet = {};
    ys.forEach(function (v) { uniqYSet[Math.round(v)] = 1; });
    const uniqY = Object.keys(uniqYSet).map(Number).sort(function (a, b) { return a - b; });
    const stateSecondsR = {};
    Object.keys(stateSeconds).forEach(function (k) { stateSecondsR[k] = +stateSeconds[k].toFixed(1); });
    return {
      frames: frames, samples: samples.length, absentFrames: absentFrames,
      seconds: ${SECONDS},
      fps: +(frames / ${SECONDS}).toFixed(1),
      facingFlips: facingFlips, facingFlipsPerSec: +(facingFlips / ${SECONDS}).toFixed(2),
      stateChanges: stateChanges, stateChangesPerSec: +(stateChanges / ${SECONDS}).toFixed(2),
      dirChanges: dirChanges, dirChangesPerSec: +(dirChanges / ${SECONDS}).toFixed(2),
      travelledPx: Math.round(travelled),
      xMin: Math.round(Math.min.apply(null, xs)), xMax: Math.round(Math.max.apply(null, xs)),
      uniqY: uniqY,
      stateSeconds: stateSecondsR,
      firstStateChanges: stateSeq.slice(0, 30),
      overlapNow: overlapNow,
      pnumChecks: checked, framesCoveringANumber: coveringFrames,
      scanCost: scanCost,
      teleports: jumps, teleportSamples: jumpList.slice(0, 12),
      movingFrames: movingFrames, movingPct: +(100 * movingFrames / Math.max(samples.length - 1, 1)).toFixed(1),
      scrollerFound: scroller ? (scroller.tagName + "." + String(scroller.className).slice(0, 40)) : null,
    };
  })()`;
  const result = await page.evaluate(CODE);

  console.log(JSON.stringify(result, null, 2));
  if (errs.length) console.log("[observe] page errors:", errs.slice(0, 5));
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
