// Verifies that a change to a URL query parameter re-renders the page.
//
// The four pages that read query params used to do it inside a `useState`
// initializer — `new URLSearchParams(window.location.search).get(...)` — which
// runs once. `?panel=appearance` becoming `?panel=connections` therefore did
// nothing. They now read through `useQueryParam` (wouter's `useSearch`), so the
// value is live.
//
// This drives the real app: sign in as the seed user, load a route, then change
// one parameter via `history.pushState` — the same signal wouter's own
// `navigate` emits, since wouter v3 monkey-patches pushState — and assert the
// rendered output followed.
//
// Run (needs :4321 and :3001 up, and `pnpm --filter @workspace/scripts seed:dev`):
//   pnpm --filter @workspace/scripts exec tsx src/verify-search-params.ts

import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");
const FRONTEND = process.env.SCREENSHOT_FRONTEND ?? "http://localhost:4321";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

async function signIn(context: BrowserContext): Promise<void> {
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(
    cookies.map((c) => ({
      ...c,
      name: c.name.replace(/^__Secure-/, ""),
      secure: false,
      sameSite: "Lax" as const,
    }))
  );
}

/** Change the URL in place the way an in-app link does, then let React settle. */
async function pushSearch(page: Page, url: string): Promise<void> {
  await page.evaluate((u) => { window.history.pushState({}, "", u); }, url);
  await page.waitForTimeout(600);
}

interface Case {
  name: string;
  /** Route loaded cold. */
  from: string;
  /** Same route, one parameter changed, pushed without a reload. */
  to: string;
  /** Read the piece of UI the parameter is supposed to drive. */
  probe: (page: Page) => Promise<string>;
}

const cases: Case[] = [
  {
    name: "settings-panel",
    from: "/settings?panel=appearance",
    to: "/settings?panel=connections",
    // Settings marks no nav item with an aria/data attribute, so read the
    // rendered panel body instead — each ?panel= value mounts a different
    // component, so the body text is the honest signal that the switch happened.
    probe: async (page) =>
      (
        await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>(".ft-settings-content");
          if (!el) throw new Error(".ft-settings-content not found");
          return el.innerText.replace(/\s+/g, " ").trim();
        })
      ).slice(0, 200),
  },
  {
    name: "transactions-q",
    from: "/transactions?q=coffee",
    to: "/transactions?q=rent",
    probe: async (page) =>
      await page.locator('input[type="search"], input[placeholder*="earch" i]').first().inputValue(),
  },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signIn(context);
  const page = await context.newPage();

  let failures = 0;
  for (const c of cases) {
    await page.goto(`${FRONTEND}${c.from}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    const before = await c.probe(page);
    await page.screenshot({ path: resolve(OUT_DIR, `searchparam-${c.name}-before.png`) });

    await pushSearch(page, c.to);
    const after = await c.probe(page);
    await page.screenshot({ path: resolve(OUT_DIR, `searchparam-${c.name}-after.png`) });

    const ok = before !== after && after.length > 0;
    if (!ok) failures++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${c.name}\n` +
        `      ${c.from}  ->  ${JSON.stringify(before)}\n` +
        `      ${c.to}  ->  ${JSON.stringify(after)}`
    );
  }

  await browser.close();
  console.log(failures === 0 ? "\nall cases re-rendered" : `\n${failures} case(s) did not re-render`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
