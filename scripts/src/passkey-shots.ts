// Two-shot harness proof for the passkey + sign-in-methods work.
//
// Shot 1: signed-out auth screen with the passkey button visible,
//   void theme. Proves the double-gate (server passkeyEnabled +
//   browser PublicKeyCredential) reaches "render" under normal
//   conditions.
// Shot 2: signed-in Profile with the Sign-in Methods panel, arctic
//   theme. Proves the panel loads without error, shows the seed
//   user's actual method (password), and the Add-another surface
//   offers the passkey button.
//
// Two only. Chromium closed on exit; verified with pgrep after.

import { chromium, type BrowserContext } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");
const FRONTEND = "http://localhost:4321";
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const VIEWPORT = { width: 1440, height: 900 } as const;

async function signIn(context: BrowserContext): Promise<void> {
  const res = await context.request.post(`${API_BASE}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", "Origin": FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  const cookies = await context.cookies();
  await context.clearCookies();
  await context.addCookies(cookies.map((c) => ({
    ...c,
    name: c.name.replace(/^__Secure-/, ""),
    secure: false,
    sameSite: "Lax" as const,
  })));
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    // Shot 1 — signed-out auth screen, void theme. No localStorage
    // seed — void is the default so this is a first-visit shot.
    {
      const context = await browser.newContext({ viewport: VIEWPORT, storageState: undefined });
      const page = await context.newPage();
      await page.goto(FRONTEND, { waitUntil: "networkidle", timeout: 25000 });
      // Wait for the auth card to actually render — networkidle fires
      // before authClient.useSession() resolves, so the AuthGate is
      // in its isPending blank-screen state for a beat after that.
      await page.locator('input[type="email"]').waitFor({ timeout: 10000 });
      await page.waitForTimeout(400);
      const out = resolve(OUT_DIR, "passkey-01-signin-void.png");
      await page.screenshot({ path: out, fullPage: false });
      console.log(`[passkey] signin void → ${out}`);
      await context.close();
    }
    // Shot 2 — signed-in Profile page with Sign-in Methods panel,
    // arctic theme. Server holds the theme now, so PUT the theme
    // then navigate; the ThemeProvider will hydrate arctic.
    {
      const context = await browser.newContext({ viewport: VIEWPORT, storageState: undefined });
      await signIn(context);
      // Set theme=arctic via API so the ThemeProvider hydrates arctic
      // when the page loads. Cookie name has no __Secure- prefix on
      // localhost, but better-auth in dev accepts either form.
      const cookies = await context.cookies();
      const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      await context.request.put(`${API_BASE}/api/settings/theme`, {
        headers: { "Content-Type": "application/json", "Origin": FRONTEND, cookie: cookieHeader },
        data: { theme: "arctic" },
      });
      const page = await context.newPage();
      await page.addInitScript(() => {
        try {
          localStorage.setItem("ft-onboarding-complete", "1");
          localStorage.setItem("nr-onboarding-complete", "1");
        } catch { /* ignore */ }
      });
      await page.goto(`${FRONTEND}/profile`, { waitUntil: "networkidle", timeout: 25000 });
      // Wait for the panel's listAccounts / listUserPasskeys fetches
      // to resolve. 1500ms is comfortable for two /api round-trips.
      await page.waitForTimeout(1500);
      const out = resolve(OUT_DIR, "passkey-02-signin-methods-arctic.png");
      await page.screenshot({ path: out, fullPage: false });
      console.log(`[passkey] sign-in methods arctic → ${out}`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("passkey-shots fatal:", err);
  process.exit(1);
});
