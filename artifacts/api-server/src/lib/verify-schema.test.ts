// Lock: verifySchemaAtBoot must THROW when drift exists, and the
// throw message must name every missing table + column. This is the
// blocking-boot contract — if this test starts passing on partial
// data, some future edit weakened the check into a warning.
//
// Stubs the db's information_schema query to a controlled subset;
// the drizzle-declared columns come from the real schema imports,
// so a schema.ts rename is caught by the "expected columns" side of
// the diff automatically.

// @workspace/db throws at import time if DATABASE_URL is unset (the
// pool constructor validates it). Nothing here ever opens a
// connection — the query goes through the mocked db.execute below —
// but the module still needs the env truthy to load.
process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost/test";

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PgTable } from "drizzle-orm/pg-core";

// Mock @workspace/db BEFORE importing verifySchemaAtBoot. The
// module-scope import of `db` in verify-schema.ts resolves against
// this mock. Table exports pass through — they carry the real
// column shape drizzle infers from the .ts schema files.
const mockRows: Array<{ table_name: string; column_name: string }> = [];
vi.mock("@workspace/db", async () => {
  const actual = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
  return {
    ...actual,
    db: {
      execute: async () => ({ rows: mockRows }),
    },
  };
});

// Also silence the logger so ERROR-level fixture output doesn't spam
// the test runner (the throw itself is what we assert on).
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// Import AFTER mocks so verify-schema resolves against the stub db.
const { verifySchemaAtBoot } = await import("./verify-schema");

beforeEach(() => {
  mockRows.length = 0;
});

// Small helper: fake information_schema for the tables we want to
// pretend exist. Passing an empty columns array = table exists but
// with no columns (unrealistic in practice; the check counts every
// declared column as missing).
function fake(schema: Record<string, string[]>): void {
  mockRows.length = 0;
  for (const [table, cols] of Object.entries(schema)) {
    for (const col of cols) mockRows.push({ table_name: table, column_name: col });
  }
}

describe("verifySchemaAtBoot", () => {
  it("throws a FIX-ME naming every missing table when a whole table is absent", async () => {
    // Simulate a DB missing shared_expenses entirely — the actual
    // Aug 2026 defect on production.
    fake({
      accounts: ["id", "user_id", "name", "currency", "balance", "type", "is_wise_linked", "wise_profile_id", "wise_balance_id", "external_provider", "external_id", "last_synced_at", "created_at", "updated_at"],
      // shared_expenses / shared_expense_participants / shared_expense_settlements
      // deliberately omitted — should surface as missing tables.
    });
    await expect(verifySchemaAtBoot()).rejects.toThrow(/SCHEMA DRIFT/);
    await expect(verifySchemaAtBoot()).rejects.toThrow(/Missing tables:.*shared_expenses/);
  });

  it("throws naming every missing column when a table exists but a column doesn't", async () => {
    // Simulate app_settings missing theme + persona — the actual
    // Aug 2026 defect that broke buildChatContext.
    fake({
      app_settings: ["user_id", "base_currency", "updated_at"],
      // theme + persona deliberately omitted.
    });
    await expect(verifySchemaAtBoot()).rejects.toThrow(/SCHEMA DRIFT/);
    await expect(verifySchemaAtBoot()).rejects.toThrow(/app_settings\.theme/);
    await expect(verifySchemaAtBoot()).rejects.toThrow(/app_settings\.persona/);
  });

  it("does NOT throw when every declared column is present in the DB", async () => {
    // Build a complete fake by asking the real schema what it wants,
    // then hand it back. This assures the check's success path
    // isn't inadvertently strict about EXTRA DB columns (drift
    // detection is one-directional by design — code-expects but
    // DB-lacks; extra DB columns are ignored so a rollback of code
    // doesn't spuriously fail boot).
    const { getTableColumns, getTableName, is } = await import("drizzle-orm");
    const { PgTable } = await import("drizzle-orm/pg-core");
    const dbModule = await import("@workspace/db");
    const tables = Object.values(dbModule).filter((v) => is(v, PgTable)) as PgTable[];
    const complete: Record<string, string[]> = {};
    for (const table of tables) {
      const name = getTableName(table);
      complete[name] = Object.values(getTableColumns(table)).map((c) => (c as { name: string }).name);
      // Add a fake extra column to prove the check ignores it.
      complete[name].push("__extra_db_column__");
    }
    fake(complete);
    await expect(verifySchemaAtBoot()).resolves.toBeUndefined();
  });

  it("notices ANY table @workspace/db exports going missing, not a hand-picked subset", async () => {
    // The check once kept its own table list, and net_worth_snapshots,
    // account_balance_snapshots, provider_health, eod_prices and
    // request_metrics were each added to the schema without being added
    // to it — so a database lacking any of them booted clean.
    const { getTableColumns, getTableName, is } = await import("drizzle-orm");
    const { PgTable } = await import("drizzle-orm/pg-core");
    const dbModule = await import("@workspace/db");
    const tables = Object.values(dbModule).filter((v) => is(v, PgTable)) as PgTable[];
    const complete: Record<string, string[]> = {};
    for (const table of tables) {
      complete[getTableName(table)] = Object.values(getTableColumns(table)).map((c) => (c as { name: string }).name);
    }
    expect(Object.keys(complete).length).toBeGreaterThan(25);
    for (const name of Object.keys(complete)) {
      const { [name]: _dropped, ...rest } = complete;
      fake(rest);
      await expect(verifySchemaAtBoot(), `missing ${name}`).rejects.toThrow(new RegExp(`Missing tables:.*\\b${name}\\b`));
    }
  });
});
