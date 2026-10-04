// Seed a known test user into the Neon dev branch, with enough realistic
// data to exercise the UI. Idempotent — safe to run repeatedly. Refuses to
// run against anything but the dev branch. Credentials live in this file
// deliberately (not in a committed .env).
//
// Prerequisite: the api-server must be running on API_BASE_URL, because
// user + password creation goes through better-auth's HTTP endpoint (which
// owns the password hash format). Everything else is written directly via
// drizzle so we can bulk-insert without hitting rate limits.
//
//   1. cd artifacts/api-server && pnpm dev     (in one terminal)
//   2. cd scripts && pnpm seed:dev              (in another)

import { eq } from "drizzle-orm";
import { db, userTable } from "@workspace/db";
import { DEV_DB_HOST } from "@workspace/db/hosts";

import { SEED_EMAIL, SEED_PASSWORD, SEED_NAME } from "./seed-credentials.js";
import { seedDemoData } from "./seed-demo-data.js";

// ── Dev-branch guard ────────────────────────────────────────────────────────
const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";

function assertDevBranch(): void {
  const url = process.env.DATABASE_URL ?? "";
  if (!url.includes(DEV_DB_HOST)) {
    console.error(
      `[seed] refusing to run — DATABASE_URL must point at the dev branch host "${DEV_DB_HOST}"`,
    );
    console.error(`[seed] observed: ${url ? url.replace(/:[^@/]+@/, ":***@") : "(unset)"}`);
    process.exit(1);
  }
}

// ── Delete existing seed user (cascade wipes everything user-owned) ─────────
async function purge(): Promise<void> {
  const existing = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, SEED_EMAIL));
  if (existing.length > 0) {
    await db.delete(userTable).where(eq(userTable.email, SEED_EMAIL));
    console.log(`[seed] removed existing user ${SEED_EMAIL} (cascade)`);
  }
}

// ── Create user via better-auth HTTP endpoint (owns the password hash) ──────
async function signUp(): Promise<string> {
  // Better-auth rejects requests without an Origin header. Use one that the
  // api-server's trustedOrigins already whitelists in dev (localhost:4321).
  const res = await fetch(`${API_BASE}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "http://localhost:4321",
    },
    body: JSON.stringify({
      email: SEED_EMAIL,
      password: SEED_PASSWORD,
      name: SEED_NAME,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sign-up failed: ${res.status} ${res.statusText}\n${body}`);
  }
  const row = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.email, SEED_EMAIL));
  if (row.length === 0) throw new Error("user row missing after sign-up");
  // 980b0be (19 Sep 2026) turned on REQUIRE_EMAIL_VERIFICATION, so sign-up no
  // longer returns a session and sign-in answers 403 until the link is
  // clicked. The seed user has no inbox and every capture script signs in
  // with its password, so verify it here, directly in the dev branch.
  await db
    .update(userTable)
    .set({ emailVerified: true })
    .where(eq(userTable.email, SEED_EMAIL));
  return row[0].id;
}

async function main(): Promise<void> {
  assertDevBranch();
  console.log(`[seed] target: dev branch (${DEV_DB_HOST})`);
  console.log(`[seed] api:    ${API_BASE}`);
  console.log(`[seed] user:   ${SEED_EMAIL}`);

  await purge();
  const userId = await signUp();
  console.log(`[seed] created user ${userId}`);

  await seedDemoData(userId);

  console.log(`\n[seed] done. sign in as ${SEED_EMAIL} / ${SEED_PASSWORD}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
