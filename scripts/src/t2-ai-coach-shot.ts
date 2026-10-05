// T2 (desktop audit 5 Oct 2026) — the AI switch made honest, checked in the
// running app at 1440 in void and arctic.
//
//   AI off  /ai-coach must show the off notice before anything is clicked:
//           no AI ONLINE badge, no CONTEXT LOADED, no question chips, and
//           no AI request leaves the page. /briefing must offer no Generate.
//   AI on   /ai-coach empty state (the A1 line for ANL·05, read back from
//           the DOM), then one real question sent through the local
//           api-server, captured after the answer finishes, with whether it
//           carried the ANSWER CUT SHORT marker.
//   cut     the ANSWER CUT SHORT marker itself. A real cut needs an answer
//           longer than the cap, which the measured prompts no longer
//           produce, so this one is a sessionStorage FIXTURE and is named so.
//
// Persona is set to ANL·05 (full) because A1 only ever affected it. Theme,
// persona and nr-ai-enabled are account-level; restore() puts them back.
//
// Run: pnpm --filter @workspace/scripts exec tsx src/t2-ai-coach-shot.ts
// Writes .review/shots/t2/*.png

import { chromium, type Page, type Request } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FRONTEND, API, signInSeedUser, openAccountPrefs, assertTheme, assertRoute, seedCacheScript } from "./account-prefs.js";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/t2");
const AI_KEY = "nr-ai-enabled";
// With ft-persona seeded to the server's own value, the gate never calls
// applyPersonas, which is what sets this flag; seed it as ai-coach-shot does.
const ONBOARDED_KEY = "ft-onboarding-complete";
const OFF_TEXT = "AI is off for this account.";
const A1_EXPECTED = "Full Analyst: Every page and every tool, nothing hidden.";

mkdirSync(OUT, { recursive: true });
let failed = false;
const check = (ok: boolean, label: string): void => {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failed = true;
};

const CUT_FIXTURE = [
  { role: "user", text: "Design a personalised 30-day spending challenge based on my weakest budget categories." },
  {
    role: "model",
    text: "FIXTURE — not a model answer. This bubble exists to show the marker an answer gets when the provider reports finish_reason \"length\".\n\nWeek one: hold coffee to the £40 budget by",
    status: "done",
    servingProvider: "groq",
    truncated: true,
  },
];

async function textVisible(page: Page, text: string): Promise<boolean> {
  return (await page.getByText(text, { exact: false }).count()) > 0;
}

const browser = await chromium.launch();
try {
  for (const theme of ["void", "arctic"] as const) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.route(`${FRONTEND}/api/**`, async (route) => {
      try {
        const req = route.request();
        const cs = await ctx.cookies();
        const r = await ctx.request.fetch(req.url().replace(FRONTEND, API), {
          method: req.method(),
          headers: { ...req.headers(), origin: FRONTEND, cookie: cs.map((c) => `${c.name}=${c.value}`).join("; ") },
          data: req.postDataBuffer() ?? undefined,
          maxRedirects: 0,
          timeout: 120_000,
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
    const cookie = await signInSeedUser(ctx);
    const prefs = await openAccountPrefs(ctx, cookie);
    try {
      await prefs.setTheme(theme);
      // setPersona skips the PUT when the account is already on "full", and
      // only that PUT stamps onboarded_at. An un-onboarded account renders
      // the questionnaire on every route, so step through another persona to
      // force the stamp; restore() un-stamps it if the account was found
      // un-onboarded.
      await prefs.setPersona("budget");
      await prefs.setPersona("full");

      // ── AI off ──────────────────────────────────────────────────────────
      await prefs.setPreference(AI_KEY, null);
      {
        const page = await ctx.newPage();
        await page.addInitScript(`${seedCacheScript({ theme, persona: "full", extra: { [ONBOARDED_KEY]: "1" } })}
          try { localStorage.removeItem(${JSON.stringify(AI_KEY)}); sessionStorage.removeItem("nr-ai-coach-msgs"); } catch (e) {}`);
        const aiRequests: string[] = [];
        page.on("request", (req: Request) => {
          const path = new URL(req.url()).pathname;
          if (path !== "/api/ai/status" && (path.startsWith("/api/ai") || path.startsWith("/api/receipt"))) aiRequests.push(path);
        });
        await page.goto(`${FRONTEND}/ai-coach`, { waitUntil: "networkidle" });
        await assertRoute(page, "/ai-coach");
        await assertTheme(page, theme);
        await page.getByText(OFF_TEXT).first().waitFor({ timeout: 15_000 }).catch(async (e: unknown) => {
          await page.screenshot({ path: join(OUT, `FAILED-coach-ai-off_${theme}.png`) });
          throw e;
        });
        check(!(await textVisible(page, "AI ONLINE")), `${theme} coach AI off: no AI ONLINE badge`);
        check(!(await textVisible(page, "Context loaded")), `${theme} coach AI off: no CONTEXT LOADED`);
        check(!(await textVisible(page, "Common questions")) && !(await textVisible(page, "Persona picks")), `${theme} coach AI off: no question chips`);
        check(await page.locator("textarea").isDisabled(), `${theme} coach AI off: composer disabled`);
        check(aiRequests.length === 0, `${theme} coach AI off: no AI request (saw: ${aiRequests.join(", ") || "none"})`);
        await page.screenshot({ path: join(OUT, `coach-ai-off_${theme}.png`) });

        await page.goto(`${FRONTEND}/briefing`, { waitUntil: "networkidle" });
        await assertRoute(page, "/briefing");
        await page.getByText(OFF_TEXT).first().waitFor({ timeout: 15_000 });
        check((await page.getByRole("button", { name: /generate|regenerate/i }).count()) === 0, `${theme} briefing AI off: no Generate action`);
        await page.screenshot({ path: join(OUT, `briefing-ai-off_${theme}.png`) });
        await page.close();
      }

      // ── AI on ───────────────────────────────────────────────────────────
      await prefs.setPreference(AI_KEY, "true");
      {
        const page = await ctx.newPage();
        await page.addInitScript(`${seedCacheScript({ theme, persona: "full", extra: { [AI_KEY]: "true", [ONBOARDED_KEY]: "1" } })}
          try { if (!sessionStorage.getItem("t2-seeded")) { sessionStorage.removeItem("nr-ai-coach-msgs"); sessionStorage.setItem("t2-seeded", "1"); } } catch (e) {}`);
        await page.goto(`${FRONTEND}/ai-coach`, { waitUntil: "networkidle" });
        await assertTheme(page, theme);
        await page.getByText("Common questions").first().waitFor({ timeout: 15_000 });
        check(!(await textVisible(page, OFF_TEXT)), `${theme} coach AI on: no off notice`);
        check(await textVisible(page, A1_EXPECTED), `${theme} coach AI on: A1 line reads "${A1_EXPECTED}…"`);
        check(!(await textVisible(page, "bloomberg")) && !(await textVisible(page, "Bloomberg")), `${theme} coach AI on: no Bloomberg`);
        await page.screenshot({ path: join(OUT, `coach-ai-on-empty_${theme}.png`) });

        await page.getByRole("button", { name: /How am I doing this month\?/ }).click();
        // Done = the composer placeholder leaves its "queued while replying" state.
        await page.waitForFunction(
          () => !(document.querySelector("textarea")?.getAttribute("placeholder") ?? "").includes("queued"),
          undefined,
          { timeout: 120_000, polling: 500 },
        );
        await page.waitForTimeout(500);
        check(await textVisible(page, "AI ONLINE"), `${theme} coach AI on: badge reads AI ONLINE`);
        const cut = await textVisible(page, "ANSWER CUT SHORT");
        const errored = await textVisible(page, "AI temporarily unavailable");
        console.log(`info: ${theme} live answer — cut marker ${cut ? "present" : "absent"}${errored ? ", ERROR shown" : ""}`);
        check(!errored, `${theme} coach AI on: the live question answered`);
        await page.screenshot({ path: join(OUT, `coach-ai-on-answer_${theme}.png`) });
        await page.close();
      }
      {
        const page = await ctx.newPage();
        await page.addInitScript(`${seedCacheScript({ theme, persona: "full", extra: { [AI_KEY]: "true", [ONBOARDED_KEY]: "1" } })}
          try { sessionStorage.setItem("nr-ai-coach-msgs", ${JSON.stringify(JSON.stringify(CUT_FIXTURE))}); } catch (e) {}`);
        await page.goto(`${FRONTEND}/ai-coach`, { waitUntil: "networkidle" });
        await assertTheme(page, theme);
        await page.getByText("ANSWER CUT SHORT").first().waitFor({ timeout: 15_000 });
        check((await page.getByRole("button", { name: /Continue/ }).count()) === 1, `${theme} cut fixture: one Continue action`);
        await page.screenshot({ path: join(OUT, `coach-cut-FIXTURE_${theme}.png`) });
        await page.close();
      }
    } finally {
      await prefs.restore();
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
