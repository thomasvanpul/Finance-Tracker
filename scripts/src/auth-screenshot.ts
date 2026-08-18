// Auth-gate screenshot helper.
//
// The main screenshot harness signs in as the seed user before
// capturing, so it can never reach the auth gate. This tiny sibling
// visits the app cold, with no cookies, and captures the auth
// screen in whichever mode + theme + viewport is asked for.
//
// Modes: signin, signup, forgot, reset (?token=demo), error-*
// Themes: void, arctic
// Viewports: mobile (390×844), desktop (1440×900)
//
// Run:
//   pnpm --filter @workspace/scripts exec tsx src/auth-screenshot.ts

import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, "../screenshots");

const BASE = "http://localhost:4321";

type Theme = "void" | "arctic";
type Viewport = "mobile" | "desktop";

interface Shot {
  name: string;
  path: string;              // route + query, e.g. "/?mode=signup"
  clicks?: string[];         // roles or selectors to click before capture
  fills?: [string, string][]; // selectors + values to fill (to trigger error states)
  submit?: boolean;          // submit the form after fills
  waitForText?: string;      // wait for a text to appear (post-submit)
  // For the "server waking" error shot: intercept every /api/*
  // request and abort it, so the classifier's cold-start probe
  // fires and the UI shows the "server is waking up" message.
  interceptApi?: boolean;
  // For the "reset transport off" error shot: return a fake
  // failure that matches the string the server throws when
  // RESEND_API_KEY is missing, so classifyAuthError routes to
  // reset_transport_off.
  fakeResetTransportOff?: boolean;
  // For shots that need the "Forgot password?" link to render:
  // the link is gated on the /api/auth-providers response's
  // passwordResetEnabled. In dev without RESEND_API_KEY it's
  // false. Fake it to true so the forgot flow can be captured.
  fakePasswordResetEnabled?: boolean;
}

const shots: Shot[] = [
  { name: "signin",  path: "/" },
  { name: "signup",  path: "/", clicks: ["Sign up"] },
  { name: "reset",   path: "/?token=demo-reset-token-xyz" },
  // Forgot flow: the button only renders when passwordResetEnabled
  // is true. In dev without RESEND_API_KEY the button is hidden;
  // navigate via the URL-triggered mode instead by injecting a
  // click through the always-visible "Sign up"/"Sign in" toggle
  // (no forgot button = shot renders sign-in). This is honest
  // behaviour, so we capture what a user actually sees.
  { name: "forgot",  path: "/", clicks: ["Forgot password?"], fakePasswordResetEnabled: true },
  // Error state: wrong credentials. Fill something invalid and
  // submit; the server will refuse and the UI will render the
  // wrong_credentials AuthError message.
  {
    name: "error-wrong-credentials",
    path: "/",
    fills: [
      ['input[type="email"]', "nobody@example.test"],
      ['input[type="password"]', "not-a-real-password"],
    ],
    submit: true,
    waitForText: "Wrong email or password",
  },
  // Error state: server waking / cold start. Simulated by
  // pointing fetch at a black-hole port so the initial call
  // times out. The `looksLikeColdStart` probe against
  // /api/healthz also fails, so the classifier upgrades to
  // server_waking. See notes in the file — this shot needs the
  // route setup below.
  {
    name: "error-server-waking",
    path: "/",
    fills: [
      ['input[type="email"]', "someone@example.test"],
      ['input[type="password"]', "any-password"],
    ],
    submit: true,
    waitForText: "server is waking up",
    interceptApi: true,
  },
  // Error state: reset transport unavailable. Simulated by
  // making the reset request return the specific error the
  // server would throw when RESEND_API_KEY is missing.
  {
    name: "error-reset-transport-off",
    path: "/",
    clicks: ["Forgot password?"],
    fills: [['input[type="email"]', "someone@example.test"]],
    submit: true,
    waitForText: "not configured on this server",
    fakeResetTransportOff: true,
    fakePasswordResetEnabled: true,
  },
];

const viewports: Record<Viewport, { width: number; height: number }> = {
  mobile:  { width: 390, height: 844 },
  desktop: { width: 1440, height: 900 },
};

async function shoot(theme: Theme, viewport: Viewport, shot: Shot): Promise<void> {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: viewports[viewport],
    // Clear storage so auth-gate always renders
    storageState: undefined,
  });
  const page = await context.newPage();

  // Preload the theme choice into localStorage before the app boots.
  // Theme context reads "ft-theme" (see contexts/theme-context.tsx).
  await page.addInitScript((t) => {
    localStorage.setItem("ft-theme", t);
  }, theme);

  // Fake the providers endpoint FIRST so downstream shots can
  // rely on passwordResetEnabled to render the Forgot link.
  if (shot.fakePasswordResetEnabled) {
    await context.route("**/api/auth-providers", (route) => {
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ providers: [], passwordResetEnabled: true }),
      });
    });
  }

  // Intercepts for the error-state shots. Register BEFORE the
  // page navigates so the first fetch also gets aborted.
  if (shot.interceptApi) {
    await context.route("**/api/**", (route) => {
      // Delay to make the "server waking" delay believable —
      // classifier's cold-start probe uses a 3s soft timeout,
      // so hang everything past that.
      setTimeout(() => route.abort("timedout"), 4000);
    });
  } else if (shot.fakeResetTransportOff) {
    await context.route("**/api/auth/request-password-reset**", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { message: "Password reset email transport is not configured on this server." },
        }),
      });
    });
  }

  await page.goto(`${BASE}${shot.path}`, { waitUntil: "domcontentloaded" });
  // Give the client a beat to hydrate + settle theme
  await page.waitForTimeout(400);

  if (shot.clicks) {
    for (const label of shot.clicks) {
      await page.getByRole("button", { name: label }).click();
      await page.waitForTimeout(200);
    }
  }
  if (shot.fills) {
    for (const [sel, val] of shot.fills) {
      await page.fill(sel, val);
    }
  }
  if (shot.submit) {
    await page.keyboard.press("Enter");
    if (shot.waitForText) {
      // The server-waking flow needs longer than 8s because the
      // 3s cold-start probe fires AFTER the initial fetch fails,
      // so a submit → probe → error render takes ~7s in the
      // simulated environment.
      const timeout = shot.interceptApi ? 15000 : 8000;
      await page.getByText(shot.waitForText, { exact: false }).waitFor({ timeout }).catch(() => {});
    } else {
      await page.waitForTimeout(1200);
    }
  }

  const out = resolve(OUT_DIR, `auth-${shot.name}_${viewport}_${theme}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`[auth-screenshot] ${shot.name} · ${viewport} · ${theme} → ${out}`);

  await context.close();
  await browser.close();
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  for (const theme of ["void", "arctic"] as Theme[]) {
    for (const viewport of ["mobile", "desktop"] as Viewport[]) {
      for (const shot of shots) {
        try {
          await shoot(theme, viewport, shot);
        } catch (err) {
          console.error(`[auth-screenshot] ${shot.name} · ${viewport} · ${theme} FAILED:`, err);
        }
      }
    }
  }
}

main().catch((err) => {
  console.error("auth-screenshot fatal:", err);
  process.exit(1);
});
