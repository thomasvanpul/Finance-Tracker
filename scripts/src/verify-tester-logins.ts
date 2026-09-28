// Prove every tester credential in ~/.atrium/numeris-testers.txt actually
// reaches the dashboard — not the sign-in screen, not the onboarding
// questionnaire — in WebKit (Safari's engine, the one testers' iPhones
// actually run) at phone width (390) and desktop width (1440).
//
// Reuses the same login-by-API + assertRendered check screenshot.ts already
// relies on to refuse writing a PNG of the wrong screen (data-nr-route-state
// on the auth-gate / onboarding fallback roots). A tester whose account
// isn't onboarded, or whose password is wrong, fails loud here instead of
// silently in front of a tester on Wednesday.
//
// Usage: pnpm --filter @workspace/scripts run verify:tester-logins

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { webkit, type Browser, type BrowserContext } from "playwright";
import { assertRendered } from "./screenshot.js";

const FRONTEND = process.env.SCREENSHOT_FRONTEND ?? "http://localhost:4321";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const CREDENTIALS_PATH = join(homedir(), ".atrium", "numeris-testers.txt");
// Which branch's testers to check. The file holds both; the defaults above
// point at the local (dev) stack, so dev is the default here too.
const BRANCH = process.env.TESTERS_BRANCH ?? "dev";

// Same two viewports every capture script in this repo uses (screenshot.ts
// VIEWPORTS.mobile / .desktop) — kept literal here rather than imported
// since screenshot.ts doesn't export that map.
const VIEWPORTS = {
  mobile:  { width: 390,  height: 844 },
  desktop: { width: 1440, height: 900 },
} as const;

interface Tester { email: string; password: string; }

function loadTesters(): Tester[] {
  const raw = readFileSync(CREDENTIALS_PATH, "utf8");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      // `branch email password` since 28 Sep; the older two-column lines all
      // came from the 00:51 dev run (seed-testers.ts).
      const fields = line.split("\t");
      const [branch, email, password] = fields.length === 2 ? ["dev", ...fields] : fields;
      // Never echo the line: it carries a password.
      if (!email || !password) throw new Error(`malformed credentials line (${fields.length} fields)`);
      return { branch, email, password };
    })
    .filter((t) => t.branch === BRANCH)
    .map(({ email, password }) => ({ email, password }));
}

// Same cookie dance as screenshot.ts's signIn(): sign in against the API
// directly, then rewrite __Secure- cookies to the plain, non-secure form
// the http://localhost frontend's Vite proxy expects.
async function signIn(context: BrowserContext, email: string, password: string): Promise<void> {
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", "Origin": FRONTEND },
    data: { email, password },
  });
  if (!res.ok()) {
    throw new Error(`sign-in failed for ${email}: ${res.status()} ${await res.text()}`);
  }
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(cookies.map((c) => ({
    ...c,
    name: c.name.replace(/^__Secure-/, ""),
    secure: false,
    sameSite: "Lax" as const,
  })));
}

async function checkOne(browser: Browser, tester: Tester, viewportName: keyof typeof VIEWPORTS): Promise<string | null> {
  const context = await browser.newContext({ viewport: VIEWPORTS[viewportName] });
  try {
    await signIn(context, tester.email, tester.password);
    const page = await context.newPage();
    await page.goto(FRONTEND + "/");
    await page.waitForLoadState("networkidle");
    await assertRendered(page, "/");
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  } finally {
    await context.close();
  }
}

async function main(): Promise<void> {
  const testers = loadTesters();
  if (testers.length === 0) {
    console.error(`[verify-tester-logins] no ${BRANCH} credentials in ${CREDENTIALS_PATH}`);
    process.exit(1);
  }
  console.log(`[verify-tester-logins] frontend: ${FRONTEND}`);
  console.log(`[verify-tester-logins] checking ${testers.length} tester(s) × mobile(390) + desktop(1440)`);

  const browser = await webkit.launch();
  let failures = 0;
  try {
    for (const tester of testers) {
      for (const viewportName of Object.keys(VIEWPORTS) as (keyof typeof VIEWPORTS)[]) {
        const failure = await checkOne(browser, tester, viewportName);
        if (failure) {
          failures++;
          console.error(`[verify-tester-logins] FAIL ${tester.email} @ ${viewportName}: ${failure}`);
        } else {
          console.log(`[verify-tester-logins] ok   ${tester.email} @ ${viewportName}`);
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`\n[verify-tester-logins] ${testers.length * 2 - failures}/${testers.length * 2} checks passed`);
  process.exit(failures > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[verify-tester-logins] failed:", err);
  process.exit(1);
});
