// captureAccountSnapshots — write path for the per-account daily
// snapshot table. Design decisions and full rationale live in
// .review/report.md (2026-09-01).
//
// The whole point of this table is HONEST reference points for the
// reconciliation gap and forward-looking safe-to-spend. Anything the
// tests here lock is either
//   (a) preserving that honesty (write-once, native+rate, all accounts
//       fanned out), or
//   (b) preserving the read-path contract downstream consumers
//       depend on (snapshotFxRate captured per account, matching the
//       transactions.ts stored-rate shape).
//
// The db module is mocked so this suite has no external dependencies —
// same posture as connections.test.ts. The FX layer is injected via
// __setFxCacheForTesting so snapshotFxRate returns deterministic rates
// without touching Yahoo or Frankfurter.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Capture insert calls: the mock db stores every insert-values-payload
// so tests can assert on the row shape without a real Postgres.
type InsertCall = {
  table: unknown;
  values: unknown;
  onConflictTarget: unknown;
};
const insertCalls: InsertCall[] = [];

// The account rows the mock db returns from select(). Tests overwrite
// this in beforeEach.
let mockAccounts: Array<{ id: number; balance: string; currency: string }> = [];

// Stub table shapes — the helper reads column identifiers off them for
// select-projection and onConflict-target arguments. The mock db chain
// ignores the args (my assertions inspect the captured onConflict
// target directly), so any object with the right property keys suffices.
// Not calling vi.importActual keeps this test independent of
// DATABASE_URL — importing the real @workspace/db throws at module load
// if the env var is unset, and vi.mock factories are hoisted above any
// process.env assignment we could make in this file.
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => Promise.resolve(mockAccounts),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => ({
        onConflictDoNothing: (opts: { target: unknown }) => {
          insertCalls.push({ table, values, onConflictTarget: opts.target });
          return Promise.resolve();
        },
      }),
    }),
  },
  accountsTable: {
    id: { name: "id" },
    userId: { name: "user_id" },
    balance: { name: "balance" },
    currency: { name: "currency" },
  },
  accountBalanceSnapshotsTable: {
    accountId: { name: "account_id" },
    date: { name: "date" },
  },
}));

vi.mock("./app-settings-db", () => ({
  getBaseCurrency: async () => "GBP",
}));

// Fixed local-date so tests are deterministic regardless of when they
// run. localDateString(new Date()) is called inside the helper — we
// don't stub it directly (the real function is small and correct),
// but we do assert on shape rather than exact date-of-run.
import { captureAccountSnapshots } from "./account-snapshots";
import { __setFxCacheForTesting } from "./market";

const BASE_FX = {
  base: "GBP",
  rates: { USD: 1.266, EUR: 1.15, MYR: 5.7 },
  updatedAt: "2026-08-30T09:00:00.000Z",
};

beforeEach(() => {
  insertCalls.length = 0;
  mockAccounts = [];
  __setFxCacheForTesting(BASE_FX);
});

describe("captureAccountSnapshots — write path", () => {
  it("no-ops when the user has zero accounts (no insert issued)", async () => {
    mockAccounts = [];
    await captureAccountSnapshots("user_empty");
    expect(insertCalls).toHaveLength(0);
  });

  it("fans out one row per account for a multi-account user", async () => {
    mockAccounts = [
      { id: 1, balance: "1000.0000", currency: "GBP" },
      { id: 2, balance: "500.0000", currency: "USD" },
      { id: 3, balance: "2000.0000", currency: "MYR" },
    ];
    await captureAccountSnapshots("user_multi");
    expect(insertCalls).toHaveLength(1);
    const rows = insertCalls[0]!.values as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.accountId).sort()).toEqual([1, 2, 3]);
  });

  it("captures native balance + currency exactly as the account holds it (no conversion)", async () => {
    mockAccounts = [
      { id: 42, balance: "1234.5600", currency: "USD" },
    ];
    await captureAccountSnapshots("user_native");
    const rows = insertCalls[0]!.values as Array<Record<string, unknown>>;
    expect(rows[0]!.balance).toBe("1234.5600");
    expect(rows[0]!.currency).toBe("USD");
  });

  it("captures the FX rate at write time (USD→GBP = 1/1.266)", async () => {
    mockAccounts = [
      { id: 1, balance: "100.0000", currency: "USD" },
    ];
    await captureAccountSnapshots("user_fx");
    const rows = insertCalls[0]!.values as Array<Record<string, unknown>>;
    // Stored as string (numeric column). snapshotFxRate returns
    // toRate / fromRate = 1 / 1.266 for USD→GBP.
    expect(rows[0]!.nativeToBaseRate).toBe(String(1 / 1.266));
    // rateAsOf must reflect the FX cache's updatedAt — write-time
    // provenance is the whole point of storing it.
    expect((rows[0]!.rateAsOf as Date).toISOString()).toBe("2026-08-30T09:00:00.000Z");
  });

  it("captures rate=1 for accounts already in the base currency", async () => {
    mockAccounts = [
      { id: 1, balance: "100.0000", currency: "GBP" },
    ];
    await captureAccountSnapshots("user_base");
    const rows = insertCalls[0]!.values as Array<Record<string, unknown>>;
    expect(rows[0]!.nativeToBaseRate).toBe("1");
  });

  it("stores nativeToBaseRate=null when FX is unavailable (no fabricated rate)", async () => {
    // THB isn't in BASE_FX.rates — snapshotFxRate returns null. The
    // snapshot MUST record that honestly so downstream falls back to
    // live toBase() at read time and the "unknown FX" state is visible.
    mockAccounts = [
      { id: 1, balance: "100.0000", currency: "THB" },
    ];
    await captureAccountSnapshots("user_null_fx");
    const rows = insertCalls[0]!.values as Array<Record<string, unknown>>;
    expect(rows[0]!.nativeToBaseRate).toBeNull();
    // rateAsOf is still populated — "we tried at T and had no rate"
    // is meaningful to consumers deciding whether to re-attempt.
    expect(rows[0]!.rateAsOf).toBeInstanceOf(Date);
  });

  it("uses onConflictDoNothing targeted at (accountId, date) — the write-once invariant", async () => {
    mockAccounts = [
      { id: 1, balance: "100.0000", currency: "GBP" },
    ];
    await captureAccountSnapshots("user_conflict");
    const target = insertCalls[0]!.onConflictTarget as Array<{ name: string }>;
    // Design decision #2 (write-once per (accountId, date)) is what
    // prevents the drift that nw_snapshots' upsert-on-current-month
    // reintroduced at day granularity. Changing this to onConflictDoUpdate
    // or targeting anything else silently regresses that guarantee.
    expect(target).toHaveLength(2);
    const cols = target.map((c) => c.name);
    expect(cols).toContain("account_id");
    expect(cols).toContain("date");
  });

  it("stamps every row with today's local date in YYYY-MM-DD shape", async () => {
    mockAccounts = [
      { id: 1, balance: "100.0000", currency: "GBP" },
      { id: 2, balance: "200.0000", currency: "USD" },
    ];
    await captureAccountSnapshots("user_date");
    const rows = insertCalls[0]!.values as Array<Record<string, unknown>>;
    // ISO YYYY-MM-DD — same shape as transactions.date, no timezone
    // suffix, lexicographically sortable.
    for (const r of rows) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Both rows carry the SAME date — the fan-out is one bucket, not
    // per-row wall-clock.
    expect(rows[0]!.date).toBe(rows[1]!.date);
  });

  it("carries userId through to every row", async () => {
    mockAccounts = [
      { id: 1, balance: "100.0000", currency: "GBP" },
      { id: 2, balance: "200.0000", currency: "GBP" },
    ];
    await captureAccountSnapshots("user_scoped");
    const rows = insertCalls[0]!.values as Array<Record<string, unknown>>;
    for (const r of rows) expect(r.userId).toBe("user_scoped");
  });
});

// Source-scan lock: the schema declaration is what the migration
// derives from. If someone silently changes the uniqueIndex or drops a
// column, the drizzle-generated migration would ride along — but this
// test catches the schema drift on every CI run, no DB access required.
// Same posture as tx-rate-lock.test.ts.
describe("account_balance_snapshots — schema declaration is intact", () => {
  const __filename = fileURLToPath(import.meta.url);
  const SCHEMA_PATH = join(
    dirname(__filename),
    "..", "..", "..", "..",
    "lib", "db", "src", "schema", "account-balance-snapshots.ts",
  );
  const source = readFileSync(SCHEMA_PATH, "utf8");

  it("declares uniqueIndex on (accountId, date) — the write-once invariant at the DB layer", () => {
    expect(source).toMatch(/uniqueIndex\(\s*"account_balance_snapshots_account_date_uniq"\s*\)/);
    expect(source).toMatch(/\.on\(t\.accountId,\s*t\.date\)/);
  });

  it("carries nativeToBaseRate (FX at write) and rateAsOf (provenance) columns", () => {
    // Symmetric with transactions.ts. Dropping either would silently
    // fossilise base-currency values against a moving FX rate.
    expect(source).toMatch(/nativeToBaseRate:\s*numeric\("native_to_base_rate"/);
    expect(source).toMatch(/rateAsOf:\s*timestamp\("rate_as_of"/);
  });

  it("stores balance as numeric(18, 4) — same precision as accounts.balance", () => {
    // A financial figure at lower precision than the source it's
    // snapshotting is a rounding error waiting to happen. The gap
    // calculation subtracts two snapshots and any precision loss
    // shows up as false spending.
    expect(source).toMatch(/balance:\s*numeric\("balance",\s*\{\s*precision:\s*18,\s*scale:\s*4/);
  });

  it("cascades on account or user delete (no orphan snapshots)", () => {
    expect(source).toMatch(/references\(\(\)\s*=>\s*userTable\.id,\s*\{\s*onDelete:\s*"cascade"\s*\}\)/);
    expect(source).toMatch(/references\(\(\)\s*=>\s*accountsTable\.id,\s*\{\s*onDelete:\s*"cascade"\s*\}\)/);
  });
});

// Wiring lock: the two callers documented in the report (dashboard read
// + accounts PATCH) MUST invoke the helper. A silent removal of either
// call would leave the table underpopulated in the way the report
// specifically calls out — dashboard-only leaves PATCH corrections
// invisible; PATCH-only means users who never edit balances get no
// snapshots. Source-scan on the two route files catches either drift.
describe("captureAccountSnapshots wiring — the two documented callers", () => {
  const __filename = fileURLToPath(import.meta.url);
  const ROUTES_DIR = join(dirname(__filename), "..", "routes");

  it("dashboard route calls captureAccountSnapshots (lazy write on read)", () => {
    const src = readFileSync(join(ROUTES_DIR, "dashboard.ts"), "utf8");
    expect(src).toContain("captureAccountSnapshots");
  });

  it("accounts PATCH route calls captureAccountSnapshots after the balance UPDATE", () => {
    const src = readFileSync(join(ROUTES_DIR, "accounts.ts"), "utf8");
    // Import + call, and the call sits after the UPDATE. Regex checks
    // the order of the two markers — captures the "someone moved the
    // call before the UPDATE" regression where the snapshot would
    // record the pre-edit balance.
    expect(src).toContain("captureAccountSnapshots");
    const updateIdx = src.indexOf(".update(accountsTable)");
    const captureIdx = src.indexOf("captureAccountSnapshots(userId)");
    expect(updateIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeGreaterThan(-1);
    expect(captureIdx).toBeGreaterThan(updateIdx);
  });
});
