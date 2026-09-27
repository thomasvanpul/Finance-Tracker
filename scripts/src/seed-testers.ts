// Seed N tester accounts (default 6, tester1..N@numeris.local) for the
// first user-testing round, each with the same realistic demo data the dev
// seed account uses (scripts/src/seed-demo-data.ts). Idempotent — an
// account whose email already exists is left untouched and skipped, so
// re-running after adding testers only creates the new ones.
//
// Generated passwords are written once, at creation, to
// ~/.atrium/numeris-testers.txt (mode 600) and never printed or logged.
// There is nothing to re-derive a lost password from; delete the tester's
// user row (cascades) and re-run to reissue one.
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

import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { db, userTable, appSettingsTable } from "@workspace/db";

import { seedDemoData } from "./seed-demo-data.js";

// ── Branch guard (same hosts as backfill-tx-rates.ts) ───────────────────────
const DEV_DB_HOST = "ep-withered-night-abucoq17";
const PROD_DB_HOST = "ep-dark-hall-ab7g28of";

const DEFAULT_TESTER_COUNT = 6;

interface Args {
  branch: "dev" | "prod";
  count: number;
  dryRun: boolean;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const branchFlag = args.find((a) => a.startsWith("--branch="));
  const branch = branchFlag?.split("=")[1];
  if (branch !== "dev" && branch !== "prod") {
    console.error("Usage: seed-testers --branch=dev|prod [--count=N] [--dry-run]");
    process.exit(1);
  }
  const countFlag = args.find((a) => a.startsWith("--count="));
  const count = countFlag ? Number(countFlag.split("=")[1]) : DEFAULT_TESTER_COUNT;
  if (!Number.isInteger(count) || count < 1) {
    console.error(`[seed-testers] --count must be a positive integer, got "${countFlag}"`);
    process.exit(1);
  }
  return { branch, count, dryRun: args.includes("--dry-run") };
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

async function confirmProd(count: number): Promise<void> {
  console.log("");
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  About to WRITE to PRODUCTION.                            ║");
  console.log(`║  This will create up to ${String(count).padEnd(2)} tester account(s) and    ║`);
  console.log("║  their demo data on the live database.                    ║");
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
const CREDENTIALS_DIR = join(homedir(), ".atrium");
const CREDENTIALS_PATH = join(CREDENTIALS_DIR, "numeris-testers.txt");

function writeCredentials(creds: { email: string; password: string }[]): void {
  if (creds.length === 0) return;
  if (!existsSync(CREDENTIALS_DIR)) mkdirSync(CREDENTIALS_DIR, { mode: 0o700 });
  const lines = creds.map((c) => `${c.email}\t${c.password}`).join("\n") + "\n";
  appendFileSync(CREDENTIALS_PATH, lines, { mode: 0o600 });
  chmodSync(CREDENTIALS_PATH, 0o600);
  console.log(`[seed-testers] wrote ${creds.length} credential(s) to ${CREDENTIALS_PATH} (mode 600, not printed)`);
}

// ── Create one tester via better-auth HTTP endpoint (owns the password hash) ─
async function signUp(apiBase: string, origin: string, email: string, password: string, name: string): Promise<string> {
  const res = await fetch(`${apiBase}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": origin },
    body: JSON.stringify({ email, password, name }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sign-up failed for ${email}: ${res.status} ${res.statusText}\n${body}`);
  }
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

async function main(): Promise<void> {
  const { branch, count, dryRun } = parseArgs();
  assertBranch(branch);

  const apiBase = apiBaseFor(branch);
  const origin = originFor(branch);

  console.log(`[seed-testers] target: ${branch} branch`);
  console.log(`[seed-testers] api:    ${apiBase}`);
  console.log(`[seed-testers] count:  ${count}`);
  if (dryRun) console.log("[seed-testers] --dry-run: no writes will be made");

  let created = 0;
  let skipped = 0;
  const newCredentials: { email: string; password: string }[] = [];
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
      await confirmProd(count - skipped);
      confirmed = true;
    }
    const password = generatePassword();
    const userId = await signUp(apiBase, origin, email, password, `Tester ${i}`);
    await seedDemoData(userId);
    await markOnboarded(userId);
    newCredentials.push({ email, password });
    created++;
    console.log(`[seed-testers] ${email}: created (${userId})`);
  }

  if (!dryRun) writeCredentials(newCredentials);

  console.log(`\n[seed-testers] done. ${created} created, ${skipped} already existed.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed-testers] failed:", err);
  process.exit(1);
});
