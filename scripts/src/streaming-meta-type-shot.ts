// AI Coach streaming strips type pass (finding 928333794e02): opens /ai-coach,
// sends four questions to a stubbed /api/ai/chat and reads the computed font
// family of each strip components/ai-coach/streaming-meta.tsx draws — reduced
// capacity, cut, error, the "Starting…" progress caption and a queued
// follow-up. The stub runs only inside this browser; no model is called and
// nothing reaches the API's chat route. Writes .review/shots/streaming-meta-type/.
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { signInSeedUser, openAccountPrefs } from "./account-prefs.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/streaming-meta-type");

const sse = (events: object[]) =>
  events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join("");

// One stream per send, in order. The fourth never answers, so the bubble
// stays on its "Starting…" caption and the fifth send is queued behind it.
const STREAMS: (string | null)[] = [
  sse([
    { type: "token", text: "Served by the second lane." },
    { type: "done", servingProvider: "gemini", reducedCapacity: true, triedProviders: ["groq", "gemini"] },
  ]),
  sse([
    { type: "token", text: "This reply stops partway" },
    { type: "cut", servingProvider: "groq", reason: "socket closed", triedProviders: ["groq"] },
  ]),
  sse([{ type: "error", message: "Every provider is unavailable right now.", triedProviders: ["groq", "gemini"] }]),
  null,
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
try {
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
    // Registered last, so it wins over the proxy for the chat route.
    let sent = 0;
    await ctx.route(`${FRONTEND}/api/ai/chat**`, async (route) => {
      const body = STREAMS[sent++];
      if (body === null || body === undefined) return; // left hanging on purpose
      await route.fulfill({ status: 200, headers: { "content-type": "text/event-stream" }, body });
    });

    const cookie = await signInSeedUser(ctx);
    // Holds the capture lock until restore(). The client refuses every
    // /api/ai/* request while AI is off (BACKLOG § I7), so the stubbed chat
    // route would never be asked; turn it on server-side and restore after.
    const prefs = await openAccountPrefs(ctx, cookie);
    try {
    await prefs.setPreference("nr-ai-enabled", "true");

    // An un-onboarded seed account renders the questionnaire on every route.
    // PUT persona re-stamps onboarded_at; the persona itself is kept.
    const personaRes = await ctx.request.get(`${FRONTEND}/api/settings/persona`);
    const persona = (await personaRes.json()) as { persona: string | null; onboarded: boolean };
    if (!persona.onboarded) {
      const put = await ctx.request.put(`${FRONTEND}/api/settings/persona`, {
        headers: { "Content-Type": "application/json" },
        data: { persona: persona.persona ?? "full" },
      });
      console.log(`seed account was not onboarded; re-stamped persona ${persona.persona ?? "full"}: ${put.status()}`);
    }

    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/ai-coach`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    const composer = page.locator("textarea").last();
    const send = async (q: string) => {
      await composer.fill(q);
      await composer.press("Enter");
    };
    const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");
    const fam = async (label: string, loc: ReturnType<typeof page.locator>) =>
      console.log(`${label} -> ${(await loc.count()) ? await loc.first().evaluate(family) : "absent"}`);
    const text = (t: string) => page.getByText(t, { exact: true });

    await send("probe one");
    await text("REDUCED CAPACITY").waitFor({ timeout: 15_000 });
    await fam("legend (REDUCED CAPACITY)", text("REDUCED CAPACITY"));
    await fam("words (· served by)", page.getByText("· served by", { exact: false }));
    await fam("provider (GEMINI)", page.getByText("GEMINI", { exact: false }));

    await send("probe two");
    await text("RESPONSE ENDED EARLY").waitFor({ timeout: 15_000 });
    await fam("legend (RESPONSE ENDED EARLY)", text("RESPONSE ENDED EARLY"));
    await fam("words (disconnected mid-reply)", page.getByText("disconnected mid-reply", { exact: false }));
    await fam("retry sentence", page.getByText("Ask again to retry", { exact: false }));

    await send("probe three");
    await text("Every provider is unavailable right now.").first().waitFor({ timeout: 15_000 });
    await fam("legend (ERROR)", text("ERROR").first());
    await fam("error message", text("Every provider is unavailable right now.").first());
    await page.screenshot({ path: join(OUT, "coach-terminal-states.png"), fullPage: true });

    await send("probe four");
    await text("Starting…").waitFor({ timeout: 15_000 });
    await fam("progress caption (Starting…)", text("Starting…"));
    await send("a queued follow-up");
    await text("QUEUED").waitFor({ timeout: 15_000 });
    await fam("legend (QUEUED)", text("QUEUED"));
    await fam("queued prompt", text("a queued follow-up"));
    await page.screenshot({ path: join(OUT, "coach-streaming.png"), fullPage: true });
    } finally {
      await prefs.restore();
    }
    await ctx.close();
} finally {
  await browser.close();
}
