// Shared expenses type pass (finding 928333794e02): reads the computed font
// family of /shared's language and data, with the new-bill form open, and
// captures it. Read-only against the API. One capture-only stub, in this
// browser and nowhere else: GET /api/shared-expenses answers two fixture bills
// (one the seed user paid, one shared with them), or [] for the empty-state
// pass; every write to that path is swallowed. Writes .review/shots/shared-type/.
// Usage: tsx src/shared-type-shot.ts [label]   (label suffixes the png names)
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SEED_EMAIL, SEED_PASSWORD } from "./seed-credentials.js";
import { acquireCaptureLock } from "./capture-lock.js";

const FRONTEND = "http://localhost:4321";
const API = "http://localhost:3001";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "../../.review/shots/shared-type");
const LABEL = process.argv[2] ? `-${process.argv[2]}` : "";

function fixtureBills(me: string) {
  const stamp = "2026-10-01T00:00:00Z";
  const base = { notes: null, accountId: null, createdAt: stamp, updatedAt: stamp };
  return [
    {
      ...base, id: 1, userId: me, description: "Dinner at Padella", date: "2026-09-28",
      totalAmount: 90, currency: "GBP", splitRule: "equal",
      participants: [
        { id: 11, name: "You", linkedEmail: null, linkedUserId: me, shareInput: null, shareAmount: 30, isPayer: true, status: "acknowledged" },
        { id: 12, name: "Sam", linkedEmail: null, linkedUserId: "u-sam", shareInput: null, shareAmount: 30, isPayer: false, status: "requested" },
        { id: 13, name: "Alex", linkedEmail: "alex@example.com", linkedUserId: null, shareInput: null, shareAmount: 30, isPayer: false, status: "outstanding" },
      ],
    },
    {
      ...base, id: 2, userId: "u-jo", description: "Cottage weekend", date: "2026-09-20",
      totalAmount: 240, currency: "GBP", splitRule: "shares",
      participants: [
        { id: 21, name: "Jo", linkedEmail: null, linkedUserId: "u-jo", shareInput: 2, shareAmount: 160, isPayer: true, status: "acknowledged" },
        { id: 22, name: "Thomas", linkedEmail: null, linkedUserId: me, shareInput: 1, shareAmount: 80, isPayer: false, status: "outstanding" },
      ],
    },
  ];
}

const family = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].replace(/"/g, "");

async function probe(page: Page, label: string, what: string, loc: ReturnType<Page["locator"]>) {
  const first = loc.first();
  console.log(`${label} | ${what} -> ${(await first.count()) ? await first.evaluate(family) : "absent"}`);
}

const release = acquireCaptureLock();
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

    const signIn = await ctx.request.post(`${API}/api/auth/sign-in/email`, {
      headers: { "Content-Type": "application/json", Origin: FRONTEND },
      data: { email: SEED_EMAIL, password: SEED_PASSWORD },
    });
    if (!signIn.ok()) throw new Error(`sign-in failed: ${signIn.status()} ${await signIn.text()}`);
    const cookies = await ctx.cookies();
    await ctx.clearCookies();
    await ctx.addCookies(cookies.map((c) => ({ ...c, name: c.name.replace(/^__Secure-/, ""), secure: false, sameSite: "Lax" as const })));

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

    const session = (await (await ctx.request.get(`${FRONTEND}/api/auth/get-session`)).json()) as { user?: { id?: string } };
    const me = session.user?.id;
    if (!me) throw new Error("no session user id; cannot build the fixture");

    let bills: unknown[] = fixtureBills(me);
    await ctx.route(`${FRONTEND}/api/shared-expenses**`, (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bills) })
        : route.fulfill({ status: 200, contentType: "application/json", body: "{}" }),
    );

    // Empty state first.
    bills = [];
    const page = await ctx.newPage();
    await page.goto(`${FRONTEND}/shared`, { waitUntil: "networkidle" });
    if (await page.getByText("Let's shape the app around", { exact: false }).count()) {
      throw new Error("landed on the onboarding questionnaire; refusing to capture it");
    }
    await page.getByText("No shared bills yet", { exact: false }).waitFor({ timeout: 15_000 });
    await probe(page, "lang", "empty state", page.getByText("No shared bills yet", { exact: false }));

    bills = fixtureBills(me);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Dinner at Padella", { exact: true }).waitFor({ timeout: 15_000 });

    const t = (s: string, exact = true) => page.getByText(s, { exact });
    await probe(page, "lang", "+ New Bill", page.getByRole("button", { name: "+ New Bill" }));
    await probe(page, "lang", "YOU PAID", t("YOU PAID"));
    await probe(page, "lang", "SHARED WITH YOU", t("SHARED WITH YOU"));
    await probe(page, "lang", "linked", t("linked"));
    await probe(page, "lang", "alex@example.com", t("alex@example.com"));
    for (const s of ["requested", "outstanding", "acknowledged"]) await probe(page, "lang", `status ${s}`, t(s));
    for (const b of ["Ack", "Dispute", "Waive", "Mark paid", "Delete bill"]) {
      await probe(page, "lang", `button ${b}`, page.getByRole("button", { name: b, exact: true }));
    }
    await probe(page, "lang", "description", t("Dinner at Padella"));
    await probe(page, "lang", "participant name", t("Sam"));
    await probe(page, "data", "meta line", t("2026-09-28", false));
    await probe(page, "data", "share GBP 30.00", t("GBP 30.00"));
    await page.screenshot({ path: join(OUT, `shared-list${LABEL}.png`), fullPage: true });

    await page.getByRole("button", { name: "+ New Bill" }).click();
    await page.getByText("New shared bill", { exact: true }).waitFor();
    await page.locator("select").first().selectOption("exact");
    await page.getByRole("button", { name: "Create bill" }).click();
    await t("Description required").waitFor();
    await probe(page, "lang", "header Cancel", page.getByRole("button", { name: "Cancel" }));
    await probe(page, "lang", "PARTICIPANTS", t("PARTICIPANTS"));
    await probe(page, "lang", "+ Add participant", page.getByRole("button", { name: "+ Add participant" }));
    await probe(page, "lang", "Create bill", page.getByRole("button", { name: "Create bill" }));
    await probe(page, "lang", "error Description required", t("Description required"));
    await probe(page, "lang", "remove row ×", page.getByRole("button", { name: "×" }));
    await probe(page, "lang", "description input", page.locator('input[placeholder^="Description"]'));
    await probe(page, "lang", "name input", page.locator('input[placeholder="Name"]'));
    await probe(page, "lang", "email input", page.locator('input[placeholder="name@example.com"]'));
    await probe(page, "lang", "split-rule select", page.locator("select"));
    await probe(page, "data", "header NAME", t("NAME"));
    await probe(page, "data", "header EMAIL", t("EMAIL (optional link)"));
    await probe(page, "data", "header AMOUNT", t("AMOUNT"));
    await probe(page, "data", "date input", page.locator('input[type="date"]'));
    await probe(page, "data", "currency input", page.locator('input[maxlength="3"]'));
    await probe(page, "data", "total input", page.locator('input[placeholder="Total amount"]'));
    await probe(page, "data", "share input", page.locator('input[placeholder="e.g. 8.20"]'));
    await page.screenshot({ path: join(OUT, `shared-form${LABEL}.png`), fullPage: true });
    await ctx.close();
} finally {
  await browser.close();
  release();
}
