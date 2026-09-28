// Seed N tester accounts (default 6, tester1..N@numeris.local) for the
// first user-testing round, each with the same realistic demo data the dev
// seed account uses (scripts/src/seed-demo-data.ts). Idempotent — an
// account whose email already exists is left untouched and skipped, so
// re-running after adding testers only creates the new ones.
//
// Generated passwords are appended to ~/.atrium/numeris-testers.txt (mode
// 600, never printed or logged) the moment that account's sign-up succeeds,
// one `branch<TAB>email<TAB>password` line each. Not after the loop: on 28 Sep
// a prod run died at tester4 and took tester1-3's already-created passwords
// with it. There is nothing to re-derive a lost password from, and the app has
// no admin set-password path (see .review/archive 2026-09-28 prod-testers).
//
// better-auth, in production, allows 3 sign-ups per IP and only resets that
// count after 10s with none (rate-limiter/index.mjs getDefaultSpecialRules,
// decideConsume). Seeding a tester takes less than that, so the 4th sign-up
// got 429. signUp() waits out X-Retry-After and tries again.
//
// Each tester is stamped onboarded (app_settings.onboarded_at, persona
// "full") at creation, the same effect the first PUT /api/settings/persona
// has for a real user — otherwise a brand-new account's first sign-in
// renders the onboarding questionnaire instead of the dashboard, which
// verify-tester-logins.ts (WebKit, 390 + 1440) would catch as a failure.
//
// Branch guard mirrors backfill-tx-rates.ts: --branch=dev|prod is
// mandatory, and DATABASE_URL must match the declared branch's host or the
// script refuses to run.
//
//   pnpm --filter @workspace/scripts run seed:testers:dev [-- --count=6] [-- --dry-run]
//   pnpm --filter @workspace/scripts run seed:testers:prod   # writes to PRODUCTION
//
// --reissue <email> (repeatable): rewrite that tester's stored password in
// place — deletes nothing, creates nothing. Refuses any email that isn't
// tester<N>@numeris.local. The new password is hashed with better-auth's own
// hashPassword() (better-auth/crypto) — never a hand-rolled hash — and
// written straight to that user's "credential" row in the account table, the
// same row better-auth's own updatePassword() targets (userId + providerId
// "credential"). This bypasses the HTTP sign-up/reset-password endpoints on
// purpose: better-auth's admin plugin (which would give an HTTP path for
// this) isn't enabled here, and there is no other endpoint that sets a
// user's password without the old one. Dry-run by default — pass --yes to
// actually write. A reissue run ignores --count and does not touch any
// account whose email wasn't named.
//
//   pnpm --filter @workspace/scripts run seed:testers:dev -- --reissue=tester7@numeris.local --yes

import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { db, userTable, appSettingsTable, accountTable } from "@workspace/db";

import { seedDemoData } from "./seed-demo-data.js";

// ── Branch guard (same hosts as backfill-tx-rates.ts) ───────────────────────
const DEV_DB_HOST = "ep-withered-night-abucoq17";
const PROD_DB_HOST = "ep-dark-hall-ab7g28of";

const DEFAULT_TESTER_COUNT = 6;

// tester<N>@numeris.local only — --reissue refuses anything else, however it
// arrived (typo, wrong env, copy-paste from a real account).
const TESTER_EMAIL_RE = /^tester[1-9][0-9]*@numeris\.local$/;

interface Args {
  branch: "dev" | "prod";
  count: number;
  dryRun: boolean;
  reissue: string[];
  yes: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const branchFlag = args.find((a) => a.startsWith("--branch="));
  const branch = branchFlag?.split("=")[1];
  if (branch !== "dev" && branch !== "prod") {
    console.error("Usage: seed-testers --branch=dev|prod [--count=N] [--dry-run] [--reissue=email]... [--yes]");
    process.exit(1);
  }
  const countFlag = args.find((a) => a.startsWith("--count="));
  const count = countFlag ? Number(countFlag.split("=")[1]) : DEFAULT_TESTER_COUNT;
  if (!Number.isInteger(count) || count < 1) {
    console.error(`[seed-testers] --count must be a positive integer, got "${countFlag}"`);
    process.exit(1);
  }
  const reissue = args
    .filter((a) => a.startsWith("--reissue="))
    .map((a) => a.slice("--reissue=".length));
  for (const email of reissue) {
    if (!TESTER_EMAIL_RE.test(email)) {
      console.error(`[seed-testers] --reissue refuses "${email}" — must match tester<N>@numeris.local`);
      process.exit(1);
    }
  }
  return { branch, count, dryRun: args.includes("--dry-run"), reissue, yes: args.includes("--yes") };
}

function assertBranch(branch: "dev" | "prod"): void {
  const url = process.env.DATABASE_URL ?? "";
  const expectedHost = branch === "dev" ? DEV_DB_HOST : PROD_DB_HOST;
  if (!url.includes(expectedHost)) {
    console.error(
      `[seed-testers] refusing to run — --branch=${branch} declared, DATABASE_URL must contain host "${expectedHost}"`,
    );
    console.error(`[seed-testers] observed: ${url ? url.replace(/:[^@/]+@/, ":***@") : "(unset)"}`);
    process.exit(1);
  }
}

async function confirmProd(action: string): Promise<void> {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  About to WRITE to PRODUCTION.                            ║");
  console.log(`║  ${action.padEnd(58)}║`);
  console.log("║  Sleeping 3s. Ctrl-C to abort.                             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  await new Promise((r) => setTimeout(r, 3000));
}

// ── API base + Origin, per branch ────────────────────────────────────────────
// Dev talks to the local api-server; prod talks to the Render deployment and
// must present an Origin the deployed ALLOWED_ORIGINS actually whitelists
// (CLAUDE.md: financetracker.work is the live Vercel domain).
function apiBaseFor(branch: "dev" | "prod"): string {
  return process.env.API_BASE_URL ?? (branch === "prod" ? "https://numeris-api.onrender.com" : "http://localhost:3001");
}
function originFor(branch: "dev" | "prod"): string {
  return branch === "prod" ? "https://financetracker.work" : "http://localhost:4321";
}

// ── Password generation ──────────────────────────────────────────────────────
// Unambiguous alphabet (no 0/O, 1/I/l) — testers type these on a phone.
// minPasswordLength on the server is 8; 12 chars leaves headroom.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
const PASSWORD_LENGTH = 12;

function generatePassword(): string {
  const bytes = randomBytes(PASSWORD_LENGTH);
  let out = "";
  for (let i = 0; i < PASSWORD_LENGTH; i++) {
    out += PASSWORD_ALPHABET[bytes[i] % PASSWORD_ALPHABET.length];
  }
  return out;
}

// ── Credentials file: append-only, mode 600, never logged ──────────────────
// Lines written before 28 Sep carry no branch column; they are all from the
// 00:51 dev run. verify-tester-logins.ts reads both shapes.
const CREDENTIALS_DIR = join(homedir(), ".atrium");
const CREDENTIALS_PATH = join(CREDENTIALS_DIR, "numeris-testers.txt");

function appendCredential(branch: "dev" | "prod", email: string, password: string): void {
  if (!existsSync(CREDENTIALS_DIR)) mkdirSync(CREDENTIALS_DIR, { mode: 0o700 });
  appendFileSync(CREDENTIALS_PATH, `${branch}\t${email}\t${password}\n`, { mode: 0o600 });
  chmodSync(CREDENTIALS_PATH, 0o600);
  console.log(`[seed-testers] ${email}: login saved to ${CREDENTIALS_PATH} (mode 600, not printed)`);
}

// ── Create one tester via better-auth HTTP endpoint (owns the password hash) ─
const SIGNUP_MAX_ATTEMPTS = 4;
const RETRY_MARGIN_MS = 1000;

async function postSignUp(apiBase: string, origin: string, email: string, password: string, name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${apiBase}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Origin": origin },
      body: JSON.stringify({ email, password, name }),
    });
    if (res.ok) return;
    const body = await res.text();
    if (res.status === 429 && attempt < SIGNUP_MAX_ATTEMPTS) {
      const retryAfterS = Number(res.headers.get("x-retry-after") ?? res.headers.get("retry-after") ?? "10");
      const waitMs = (Number.isFinite(retryAfterS) ? retryAfterS * 1000 : 10_000) + RETRY_MARGIN_MS;
      console.log(`[seed-testers] ${email}: sign-up rate-limited (429), waiting ${Math.ceil(waitMs / 1000)}s`);
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }
    throw new Error(`sign-up failed for ${email}: ${res.status} ${res.statusText}\n${body}`);
  }
}

async function signUp(
  branch: "dev" | "prod", apiBase: string, origin: string, email: string, password: string, name: string,
): Promise<string> {
  await postSignUp(apiBase, origin, email, password, name);
  // The account now exists with this password. Save it before anything
  // else can fail.
  appendCredential(branch, email, password);
  const row = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email));
  if (row.length === 0) throw new Error(`user row missing after sign-up for ${email}`);
  // REQUIRE_EMAIL_VERIFICATION is on and testers have no inbox reachable
  // from this script — verify directly, same as seed-dev-user.ts.
  await db.update(userTable).set({ emailVerified: true }).where(eq(userTable.email, email));
  return row[0].id;
}

// Stamp onboarded_at + persona so the tester's first real sign-in lands on
// the dashboard, not the onboarding questionnaire. Mirrors what
// setPersona() in app-settings-db.ts does on a user's first settings PUT.
async function markOnboarded(userId: string): Promise<void> {
  await db
    .insert(appSettingsTable)
    .values({ userId, persona: "full", onboardedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettingsTable.userId,
      set: { persona: "full", onboardedAt: new Date() },
    });
}

// Rewrite one tester's stored password in place. Returns true on success
// (including a dry-run preview), false if the email can't be reissued —
// caller counts failures and exits non-zero rather than throwing, so one bad
// email in a --reissue list doesn't abort the rest.
async function reissueOne(branch: "dev" | "prod", email: string, live: boolean): Promise<boolean> {
  const userRow = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email));
  if (userRow.length === 0) {
    console.error(`[seed-testers] --reissue ${email}: no such user, skipping`);
    return false;
  }
  const userId = userRow[0].id;
  const credRow = await db
    .select({ id: accountTable.id })
    .from(accountTable)
    .where(and(eq(accountTable.userId, userId), eq(accountTable.providerId, "credential")));
  if (credRow.length === 0) {
    console.error(`[seed-testers] --reissue ${email}: no credential (password) account row, skipping`);
    return false;
  }
  if (!live) {
    console.log(`[seed-testers] ${email}: would reissue password (user ${userId})`);
    return true;
  }
  const password = generatePassword();
  const hashed = await hashPassword(password);
  await db
    .update(accountTable)
    .set({ password: hashed })
    .where(and(eq(accountTable.userId, userId), eq(accountTable.providerId, "credential")));
  // Save it the moment the write lands, same reasoning as signUp(): nothing
  // to re-derive a lost password from afterwards.
  appendCredential(branch, email, password);
  console.log(`[seed-testers] ${email}: password reissued (user ${userId})`);
  return true;
}

async function runReissue(branch: "dev" | "prod", emails: string[], yes: boolean): Promise<void> {
  console.log(`[seed-testers] target:  ${branch} branch`);
  console.log(`[seed-testers] reissue: ${emails.join(", ")}`);
  if (!yes) console.log("[seed-testers] dry-run (default) — pass --yes to actually rewrite passwords");

  if (yes && branch === "prod") {
    await confirmProd(`This will rewrite the password for ${emails.length} tester account(s).`);
  }

  let ok = 0;
  let failed = 0;
  for (const email of emails) {
    const succeeded = await reissueOne(branch, email, yes);
    if (succeeded) ok++;
    else failed++;
  }

  console.log(`\n[seed-testers] reissue done. ${ok} ok, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

async function main(): Promise<void> {
  const { branch, count, dryRun, reissue, yes } = parseArgs();
  assertBranch(branch);

  if (reissue.length > 0) {
    await runReissue(branch, reissue, yes);
    return;
  }

  const apiBase = apiBaseFor(branch);
  const origin = originFor(branch);

  console.log(`[seed-testers] target: ${branch} branch`);
  console.log(`[seed-testers] api:    ${apiBase}`);
  console.log(`[seed-testers] count:  ${count}`);
  if (dryRun) console.log("[seed-testers] --dry-run: no writes will be made");

  let created = 0;
  let skipped = 0;
  let confirmed = false;

  for (let i = 1; i <= count; i++) {
    const email = `tester${i}@numeris.local`;
    const existing = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, email));
    if (existing.length > 0) {
      console.log(`[seed-testers] ${email}: already exists, skipping`);
      skipped++;
      continue;
    }
    if (dryRun) {
      console.log(`[seed-testers] ${email}: would create, with demo data, onboarded`);
      created++;
      continue;
    }
    if (branch === "prod" && !confirmed) {
      await confirmProd(`This will create up to ${count - skipped} tester account(s) and their demo data.`);
      confirmed = true;
    }
    const password = generatePassword();
    const userId = await signUp(branch, apiBase, origin, email, password, `Tester ${i}`);
    await seedDemoData(userId);
    await markOnboarded(userId);
    created++;
    console.log(`[seed-testers] ${email}: created (${userId})`);
  }

  console.log(`\n[seed-testers] done. ${created} created, ${skipped} already existed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-testers] failed:", err);
  process.exit(1);
});
