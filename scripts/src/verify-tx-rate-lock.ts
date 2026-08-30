// Live-DB bite proof for Lock #19 · tx_rate_after_backfill.
//
// Proves the Postgres CHECK constraint actually rejects a violating
// INSERT and admits a valid one. Runs against dev by default. Every
// INSERT is done inside a transaction that is ROLLED BACK — nothing
// persists.
//
// The vitest source-scan lock at
// artifacts/api-server/src/lib/tx-rate-lock.test.ts catches
// "someone deleted the check() line from the schema declaration."
// This script catches "the check() line is present but the actual
// DB constraint has been dropped by hand" — a different failure
// mode. Both matter.
//
// Usage:
//   pnpm --filter @workspace/scripts run verify:tx-rate-lock:dev
//   pnpm --filter @workspace/scripts run verify:tx-rate-lock:prod
//
// The prod variant is safe to run — it uses BEGIN/ROLLBACK on every
// probe insert. Nothing gets committed.

import { db, transactionsTable, userTable, accountsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const DEV_DB_HOST = "ep-withered-night-abucoq17";
const PROD_DB_HOST = "ep-dark-hall-ab7g28of";

function parseArgs(): { branch: "dev" | "prod" } {
  const args = process.argv.slice(2);
  const flag = args.find((a) => a.startsWith("--branch="));
  const branch = flag?.split("=")[1] as "dev" | "prod" | undefined;
  if (branch !== "dev" && branch !== "prod") {
    console.error("Usage: verify-tx-rate-lock --branch=dev|prod");
    process.exit(1);
  }
  return { branch };
}

function assertBranch(branch: "dev" | "prod"): void {
  const url = process.env.DATABASE_URL ?? "";
  const expected = branch === "dev" ? DEV_DB_HOST : PROD_DB_HOST;
  if (!url.includes(expected)) {
    console.error(`[verify] refusing to run — --branch=${branch} but DATABASE_URL host isn't "${expected}"`);
    process.exit(1);
  }
}

interface Probe {
  name: string;
  values: {
    userId: string;
    accountId: number;
    date: string;
    description: string;
    type: string;
    category: string;
    nativeAmount: string;
    currency: string;
    source: string;
    nativeToBaseRate: string | null;
    rateAsOf: Date | null;
    createdAt: Date;
  };
  expect: "reject" | "accept";
  reason: string;
}

// Postgres surfaces a check-violation as SQLSTATE 23514 with the
// offending .constraint name. Drizzle wraps the raw pg error but
// preserves both fields on the wrapped error (or on .cause). Walk
// the chain to find them so we don't rely on brittle string matches
// against the failed-query printout.
function extractPgError(err: unknown): { code?: string; constraint?: string } {
  let cur: any = err;
  for (let i = 0; i < 4 && cur; i++) {
    if (cur.code || cur.constraint) return { code: cur.code, constraint: cur.constraint };
    cur = cur.cause;
  }
  return {};
}

async function runProbe(p: Probe): Promise<{ pass: boolean; err?: string }> {
  try {
    await db.transaction(async (tx) => {
      await tx.insert(transactionsTable).values(p.values);
      // Roll back regardless of success — never persist a probe.
      throw new Error("__ROLLBACK_MARKER__");
    });
    // Only reached if the transaction commits (it can't — we throw).
    return { pass: false, err: "unexpected commit" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "__ROLLBACK_MARKER__") {
      // Insert succeeded, our rollback marker fired.
      return { pass: p.expect === "accept" };
    }
    // Real error — is it the CHECK constraint we're testing?
    const pg = extractPgError(err);
    const isOurCheck = pg.code === "23514" && pg.constraint === "tx_rate_after_backfill";
    if (p.expect === "reject" && isOurCheck) return { pass: true };
    return {
      pass: false,
      err: isOurCheck ? "constraint fired but on an unexpected probe" : (pg.constraint ? `wrong constraint fired: ${pg.constraint}` : msg),
    };
  }
}

async function main(): Promise<void> {
  const { branch } = parseArgs();
  assertBranch(branch);
  console.log(`[verify] connected to ${branch} branch`);

  // Need a real user WITH at least one account — a probe insert
  // with a nonexistent userId or accountId would fail on FK violation
  // before it ever hits the CHECK. Users without accounts (empty
  // seed users on dev) don't qualify.
  const [pair] = await db
    .select({ userId: accountsTable.userId, accountId: accountsTable.id })
    .from(accountsTable)
    .limit(1);
  if (!pair || !pair.userId) {
    console.error("[verify] no user+account pair found — seed the branch first");
    process.exit(1);
  }
  const aUser = { id: pair.userId };
  const anAccount = { id: pair.accountId };
  console.log(`[verify] using user ${aUser.id.slice(0, 8)}... account ${anAccount.id}`);

  const now = new Date();
  const preCutoff = new Date("2026-08-30T00:00:00Z");
  const postCutoff = new Date("2026-09-01T00:00:00Z");   // clearly after the cutoff

  const baseValues = {
    userId: aUser.id,
    accountId: anAccount.id,
    date: "2026-09-01",
    description: "LOCK-19 PROBE — ROLLED BACK, DO NOT PERSIST",
    type: "expense",
    category: "Other",
    nativeAmount: "1.00",
    currency: "GBP",
    createdAt: now,
  };

  const probes: Probe[] = [
    {
      name: "post-cutoff manual row with null rate_as_of — MUST BE REJECTED",
      values: {
        ...baseValues,
        source: "manual",
        nativeToBaseRate: null,
        rateAsOf: null,
        createdAt: postCutoff,
      },
      expect: "reject",
      reason: "manual write path always calls snapshotFxRate; a null rateAsOf here means someone bypassed it",
    },
    {
      name: "post-cutoff manual row WITH rate_as_of — MUST BE ACCEPTED",
      values: {
        ...baseValues,
        source: "manual",
        nativeToBaseRate: "1.00000000",
        rateAsOf: postCutoff,
        createdAt: postCutoff,
      },
      expect: "accept",
      reason: "snapshotFxRate ran normally; the standard case",
    },
    {
      name: "post-cutoff manual row with rate_as_of but null rate — MUST BE ACCEPTED",
      values: {
        ...baseValues,
        source: "manual",
        nativeToBaseRate: null,
        rateAsOf: postCutoff,
        createdAt: postCutoff,
      },
      expect: "accept",
      reason: "snapshotFxRate ran, FX was unavailable; rateAsOf proves the attempt",
    },
    {
      name: "post-cutoff CSV row with both null — MUST BE ACCEPTED (exempt source)",
      values: {
        ...baseValues,
        source: "csv",
        nativeToBaseRate: null,
        rateAsOf: null,
        createdAt: postCutoff,
      },
      expect: "accept",
      reason: "historical import; rate populated later by backfill",
    },
    {
      name: "post-cutoff Wise row with both null — MUST BE ACCEPTED (exempt source)",
      values: {
        ...baseValues,
        source: "wise",
        nativeToBaseRate: null,
        rateAsOf: null,
        createdAt: postCutoff,
      },
      expect: "accept",
      reason: "adapter import; rate populated later by backfill",
    },
    {
      name: "pre-cutoff manual row with both null — MUST BE ACCEPTED (grandfathered)",
      values: {
        ...baseValues,
        source: "manual",
        nativeToBaseRate: null,
        rateAsOf: null,
        createdAt: preCutoff,
      },
      expect: "accept",
      reason: "legacy row from before the write path change was deployed",
    },
  ];

  let allPassed = true;
  console.log("");
  console.log("== PROBE RESULTS ==");
  for (const p of probes) {
    const result = await runProbe(p);
    const mark = result.pass ? "✓" : "✗";
    console.log(`  ${mark} ${p.name}`);
    if (!result.pass) {
      allPassed = false;
      console.log(`      REASON:  ${p.reason}`);
      if (result.err) console.log(`      OBSERVED: ${result.err}`);
    }
  }

  // Also confirm the current DB has zero violating rows — a real
  // one, not a probe. If this counts anything > 0, someone bypassed
  // the constraint (or it was added after the violating row).
  // db.execute returns a driver-specific result wrapper (pg's shape
  // is { rows, rowCount, ... }, not iterable). Read .rows[0].n.
  const result = await db.execute<{ n: number }>(sql`
    select count(*)::int as n
    from transactions
    where created_at >= '2026-08-30T12:31:52Z'::timestamptz
      and source = 'manual'
      and rate_as_of is null
  `);
  const rows = (result as any).rows ?? [];
  const violating = Number(rows[0]?.n ?? 0);
  console.log("");
  console.log(`== LIVE VIOLATIONS ON ${branch.toUpperCase()} ==`);
  console.log(`  Rows in violation: ${violating}`);
  if (violating > 0) {
    console.log("  ✗ Real rows already violate. The constraint may have been added AFTER the violating rows.");
    allPassed = false;
  } else {
    console.log("  ✓ No violating rows in current data.");
  }

  console.log("");
  console.log("== VERDICT ==");
  if (allPassed) {
    console.log("  ✓ Lock #19 CHECK constraint is live and behaves as declared.");
    process.exit(0);
  } else {
    console.log("  ✗ Lock #19 CHECK constraint is missing or misbehaving. See above.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[verify] failed:", err);
  process.exit(1);
});
