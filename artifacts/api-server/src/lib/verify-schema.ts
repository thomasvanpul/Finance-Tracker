// Schema-drift boot check.
//
// ── The defect class this catches ────────────────────────────────────────
// Code expects columns the database doesn't have. Every time this
// state has appeared in production it looked like a scatter of
// unrelated 500s:
//   · /api/dashboard fails on missing accounts.external_provider
//   · /api/accounts fails on missing accounts.type
//   · /api/settings fails on missing app_settings.theme
//   · /api/shared-expenses fails on missing table
//   · /api/ai/chat fails on missing app_settings.persona
// Each looks like a bug in the failing endpoint. All eight are the
// same underlying condition: schema in code ≠ schema in DB.
//
// migrateAtBoot (src/lib/migrate.ts) is the primary defence — it
// applies pending SQL migrations before boot and refuses to serve
// on failure. This check is the belt to migrateAtBoot's braces:
//
//   · a developer generated schema in code but forgot
//     `drizzle-kit generate` — no migration file exists,
//     migrateAtBoot is a no-op, but the code still expects the
//     column. This check catches that.
//
//   · the past force-push defect wiped the __drizzle_migrations
//     journal but left tables in place. When drizzle later tried to
//     replay the baseline, it CREATE TABLE'd on tables that
//     already existed OR (as in Aug 2026) baselined 0000-0002 as
//     applied when 0001 + 0002 were actually missing — only caught
//     because a later migration failed on the absent table. This
//     check catches THAT case too: even when the journal claims
//     everything is applied, we compare code expectations against
//     information_schema and refuse to boot if any column the code
//     touches is absent.
//
// ── What it checks ───────────────────────────────────────────────────────
// For every business table exported from @workspace/db:
//   1. Get expected columns from drizzle's getTableColumns()
//   2. Get actual columns from information_schema.columns
//   3. Any expected column not present in the DB is drift
//
// Column TYPE drift is not checked here — it's a much rarer failure
// mode and adding it turns this into a whole schema-diff tool. The
// present-vs-missing check is what caught every real defect in this
// class so far.
//
// ── Behaviour ────────────────────────────────────────────────────────────
// Blocking. Throws a Fix-Me sentence naming every missing table and
// column, so the operator sees ONE loud line at deploy time instead
// of scattered 500s later. Non-blocking would defeat the purpose.

import { getTableColumns, getTableName, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import {
  db,
  accountsTable,
  appSettingsTable,
  budgetsTable,
  connectionsTable,
  debtsTable,
  dismissedSubscriptionsTable,
  goalsTable,
  investmentsTable,
  nwSnapshotsTable,
  recurringPatternsTable,
  sharedExpensesTable,
  sharedExpenseParticipantsTable,
  sharedExpenseSettlementsTable,
  subscriptionsTable,
  transactionsTable,
  upcomingTable,
  userTable,
  sessionTable,
  accountTable,
  verificationTable,
  passkeyTable,
  totpTable,
  twoFactorTable,
} from "@workspace/db";
import { logger } from "./logger";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TABLES: Record<string, PgTable<any>> = {
  // Business data — the tables that produced the Aug 2026 500s.
  accounts: accountsTable,
  app_settings: appSettingsTable,
  budgets: budgetsTable,
  connections: connectionsTable,
  debts: debtsTable,
  dismissed_subscriptions: dismissedSubscriptionsTable,
  goals: goalsTable,
  investments: investmentsTable,
  nw_snapshots: nwSnapshotsTable,
  recurring_patterns: recurringPatternsTable,
  shared_expenses: sharedExpensesTable,
  shared_expense_participants: sharedExpenseParticipantsTable,
  shared_expense_settlements: sharedExpenseSettlementsTable,
  subscriptions: subscriptionsTable,
  transactions: transactionsTable,
  upcoming: upcomingTable,
  // Auth tables — Better Auth manages these but they're still
  // schema-drift risk if a Better Auth version bump adds a column
  // and the app hasn't migrated yet.
  user: userTable,
  session: sessionTable,
  account: accountTable,
  verification: verificationTable,
  passkey: passkeyTable,
  totp_credential: totpTable,
  two_factor: twoFactorTable,
};

interface DriftReport {
  missingTables: string[];
  missingColumns: Array<{ table: string; column: string }>;
}

export async function verifySchemaAtBoot(): Promise<void> {
  const start = process.hrtime.bigint();
  const expected = new Map<string, Set<string>>();
  for (const [name, table] of Object.entries(TABLES)) {
    const cols = getTableColumns(table);
    const dbNames = new Set<string>();
    for (const col of Object.values(cols)) {
      // getTableColumns returns PgColumn instances; .name is the
      // snake_case DB column name (as opposed to the camelCase JS
      // key used in the schema object).
      dbNames.add((col as { name: string }).name);
    }
    // Sanity: assert we resolved the DB table name to what we
    // hardcoded above. A mismatch means someone renamed a table in
    // the schema file without updating this map.
    const actualName = getTableName(table);
    if (actualName !== name) {
      throw new Error(
        `verify-schema: TABLES map key "${name}" doesn't match drizzle-declared name "${actualName}". Update TABLES in src/lib/verify-schema.ts.`,
      );
    }
    expected.set(name, dbNames);
  }

  // One query over the whole public schema — cheaper than per-table.
  const rows = await db.execute<{ table_name: string; column_name: string }>(
    sql`SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  );
  const actual = new Map<string, Set<string>>();
  for (const row of rows.rows) {
    const t = row.table_name;
    if (!actual.has(t)) actual.set(t, new Set());
    actual.get(t)!.add(row.column_name);
  }

  const drift: DriftReport = { missingTables: [], missingColumns: [] };
  for (const [table, columns] of expected) {
    const actualCols = actual.get(table);
    if (!actualCols) {
      drift.missingTables.push(table);
      continue;
    }
    for (const col of columns) {
      if (!actualCols.has(col)) {
        drift.missingColumns.push({ table, column: col });
      }
    }
  }

  const ms = Number(process.hrtime.bigint() - start) / 1_000_000;

  if (drift.missingTables.length === 0 && drift.missingColumns.length === 0) {
    logger.info(
      { ms: Math.round(ms), tables: expected.size },
      "schema drift check: no drift detected",
    );
    return;
  }

  // Load-bearing single-line FIX-ME. Names every missing table and
  // every missing column so the operator can act without re-diagnosing.
  const missingTablesText = drift.missingTables.length > 0
    ? `Missing tables: ${drift.missingTables.join(", ")}.`
    : "";
  const missingColumnsText = drift.missingColumns.length > 0
    ? `Missing columns: ${drift.missingColumns.map((d) => `${d.table}.${d.column}`).join(", ")}.`
    : "";
  const fixMe =
    `SCHEMA DRIFT — code expects tables/columns the database does not have. ` +
    `${missingTablesText} ${missingColumnsText} ` +
    `Fix: (a) if migrations are pending, run \`pnpm --filter @workspace/db run migrate\` against DATABASE_URL. ` +
    `(b) if code was pushed without a matching migration, run \`pnpm --filter @workspace/db run generate\` and commit the new SQL. ` +
    `(c) if the __drizzle_migrations journal is out of sync with the actual schema (past force-push), reconcile the journal — see the Aug 2026 recovery in commit history.`;
  logger.error(
    {
      missingTables: drift.missingTables,
      missingColumns: drift.missingColumns,
      ms: Math.round(ms),
    },
    fixMe,
  );
  throw new Error(fixMe);
}
