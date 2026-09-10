// One implementation of "put the seed account into the state the
// screenshot filename claims", shared by every capture script.
//
// WHY THIS EXISTS
//
// theme, persona and tab-slot are account-level columns
// (app_settings.theme / .persona / .tab_slot). The app hydrates all
// three from the server on boot and overwrites whatever the script
// seeded into localStorage:
//
//   - theme    contexts/theme-context.tsx effect (2): signed in, the
//              server value wins on hydrate. Signed out, DEFAULT_THEME
//              is forced and the cache is CLEARED.
//   - persona  lib/persona-sync.ts hydratePersonaFromServer(): applies
//              the server persona when it differs from local — but only
//              when `onboarded` is true.
//
// So injecting localStorage alone does not survive to a post-hydration
// screenshot. Eight scripts looped over ['void','arctic'] with only a
// localStorage seed and captured the account's stored theme twice; the
// arctic half of every such pair was really void. This module is the
// fix, and the reason the fix lives in one file rather than eight.
//
// localStorage is still seeded alongside the PUT — it is the legitimate
// first-paint cache, and seeding it prevents a flash of the old theme
// in the capture. The PUT is what makes it stick; the seed is what
// makes it stick from frame one.
//
// A NOTE ON PERSONA, which is a trap rather than a bug today.
// hydratePersonaFromServer() returns early when `onboarded` is false,
// so a localStorage persona seed currently survives on a seed account
// that has never been onboarded. That is an accident, not a mechanism:
// api-server lib/app-settings-db.ts setPersona() stamps
// `onboardedAt = row.onboardedAt ?? new Date()`, so the FIRST PUT to
// /api/settings/persona flips `onboarded` true for good. Restoring the
// persona value afterwards cannot un-stamp it. From that moment every
// localStorage-only persona seed in this directory silently starts
// capturing the account's stored persona instead. Going through the API
// here means the scripts do not depend on that flag either way.

import type { BrowserContext } from "playwright";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";

export const FRONTEND = "http://localhost:4321";
export const API = process.env.API_BASE_URL ?? "http://localhost:3001";

// Sign the seed user in and rewrite the cookies for the Vite origin.
//
// The api-server issues `__Secure-`-prefixed cookies over what it
// believes is HTTPS; local Vite is plain http on :4321, so the browser
// would refuse to send them back. We keep the original names for direct
// API calls made by this script and install de-prefixed, non-secure
// copies for the page to use.
//
// Returns the raw Cookie header the api-server expects, so callers can
// talk to :3001 directly without going through the Vite proxy.
export async function signInSeedUser(ctx: BrowserContext): Promise<string> {
  const res = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
    headers: { "Content-Type": "application/json", Origin: FRONTEND },
    data: { email: SEED_EMAIL, password: SEED_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);
  }
  const cookies = await ctx.cookies();
  const apiCookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  await ctx.clearCookies();
  await ctx.addCookies(cookies.map((c) => ({
    ...c,
    name: c.name.replace(/^__Secure-/, ""),
    secure: false,
    sameSite: "Lax" as const,
  })));
  return apiCookieHeader;
}

export type Restore = () => Promise<void>;

export interface AccountPrefs {
  /** Set the account theme. No-ops when already there. */
  setTheme: (theme: string) => Promise<void>;
  /** Set the account persona. No-ops when already there. */
  setPersona: (persona: string) => Promise<void>;
  /** Restore every value this run changed, in reverse order. */
  restore: Restore;
}

// Opens a preferences session against the account. Reads the current
// value of anything it might change FIRST, so restore() puts the
// account back exactly as found even if the run dies part-way.
export async function openAccountPrefs(ctx: BrowserContext, cookie: string): Promise<AccountPrefs> {
  const headers = { "Content-Type": "application/json", Origin: FRONTEND, Cookie: cookie };
  const restores: Restore[] = [];

  async function put(path: string, body: unknown): Promise<void> {
    const r = await ctx.request.put(`${API}${path}`, { headers, data: body });
    if (!r.ok()) throw new Error(`PUT ${path} failed: ${r.status()} ${await r.text()}`);
  }
  async function get<T>(path: string): Promise<T> {
    const r = await ctx.request.get(`${API}${path}`, { headers });
    if (!r.ok()) throw new Error(`GET ${path} failed: ${r.status()} ${await r.text()}`);
    return (await r.json()) as T;
  }

  const themeBefore = (await get<{ theme: string }>("/api/settings/theme")).theme;
  let themeNow = themeBefore;
  let themeTouched = false;

  const personaBefore = (await get<{ persona: string }>("/api/settings/persona")).persona;
  let personaNow = personaBefore;
  let personaTouched = false;

  const setTheme = async (theme: string): Promise<void> => {
    if (theme === themeNow) return;
    await put("/api/settings/theme", { theme });
    themeNow = theme;
    if (!themeTouched) {
      themeTouched = true;
      restores.push(() => put("/api/settings/theme", { theme: themeBefore }));
    }
  };

  const setPersona = async (persona: string): Promise<void> => {
    if (persona === personaNow) return;
    await put("/api/settings/persona", { persona });
    personaNow = persona;
    if (!personaTouched) {
      personaTouched = true;
      restores.push(() => put("/api/settings/persona", { persona: personaBefore }));
    }
  };

  const restore = async (): Promise<void> => {
    for (const r of restores.reverse()) await r();
    restores.length = 0;
  };

  return { setTheme, setPersona, restore };
}

// The localStorage half. Seeds the first-paint caches so the capture
// does not open on the previous theme and then swap. Always pair this
// with the matching setTheme/setPersona above — on its own it is the
// bug this module exists to fix.
export function seedCacheScript(opts: { theme?: string; persona?: string; extra?: Record<string, string> }): string {
  const entries: [string, string][] = [];
  if (opts.theme) entries.push(["ft-theme", opts.theme]);
  if (opts.persona) entries.push(["ft-persona", JSON.stringify([opts.persona])]);
  for (const [k, v] of Object.entries(opts.extra ?? {})) entries.push([k, v]);
  const body = entries
    .map(([k, v]) => `window.localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)});`)
    .join("\n    ");
  return `try {\n    ${body}\n  } catch (e) {}`;
}

// Assert the page is actually rendering the theme the filename claims.
// Cheap, and it is the check whose absence let eight scripts mislabel
// their output for weeks. Call it after load, before screenshot().
export async function assertTheme(page: import("playwright").Page, expected: string): Promise<void> {
  const actual = await page.evaluate(() => document.documentElement.getAttribute("data-theme") ?? "void");
  if (actual !== expected) {
    throw new Error(`theme mismatch: expected ${expected}, page is rendering ${actual}`);
  }
}
