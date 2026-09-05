// Lock: every way a table can reach user.id is one the deletion covers.
//
// Three shapes are allowed, and nothing else:
//   1. FK to user.id with onDelete: cascade      — Postgres removes the rows
//   2. FK to user.id with onDelete: set null on a column named in
//      OTHER_USERS_LINK_COLUMNS                  — another user's record,
//                                                  link removed, row kept
//   3. a user_id-shaped column with NO foreign key, listed in
//      EXPLICITLY_HANDLED                        — deletion code handles it
//
// A new table that references the user any other way (no cascade, an
// unlisted set-null column, a bare user_id text column) fails here, so
// the failure is in the gate rather than in a user's deleted-but-not-
// really account.
//
// @workspace/db validates DATABASE_URL at import; nothing here opens a
// connection (drizzle table configs are pure data).
import { describe, it, expect, vi } from "vitest";

// Static imports are hoisted above any statement, so the env stub must be
// hoisted too or the pool constructor in @workspace/db throws first.
vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost/test";
});

import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { is } from "drizzle-orm";
import * as schema from "@workspace/db";
import { userTable } from "@workspace/db";
import { EXPLICITLY_HANDLED, OTHER_USERS_LINK_COLUMNS, userOwnedTables } from "./account-deletion";

const USER_SHAPED = /(^|_)user_id$/;

function allTables(): PgTable[] {
  return (Object.values(schema) as unknown[]).filter((v): v is PgTable => is(v, PgTable));
}

describe("account deletion · schema coverage lock", () => {
  it("every foreign key to user.id is cascade, or set-null on a listed other-user link column", () => {
    const violations: string[] = [];
    for (const table of allTables()) {
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        if (getTableConfig(ref.foreignTable).name !== "user") continue;
        const column = ref.columns[0].name;
        if (fk.onDelete === "cascade") continue;
        if (fk.onDelete === "set null" && OTHER_USERS_LINK_COLUMNS.has(column)) continue;
        violations.push(`${config.name}.${column} onDelete=${fk.onDelete ?? "none"}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("every user-shaped column without a foreign key is explicitly handled, and nothing else is listed", () => {
    const bare: string[] = [];
    for (const table of allTables()) {
      const config = getTableConfig(table);
      if (config.name === "user") continue;
      const fkColumns = new Set(config.foreignKeys.flatMap((fk) => fk.reference().columns.map((c) => c.name)));
      for (const col of config.columns) {
        if (USER_SHAPED.test(col.name) && !fkColumns.has(col.name)) bare.push(config.name);
      }
    }
    // verification has no user column at all — it is keyed by email/value —
    // so it is listed by name rather than found by shape.
    const expected = [...bare, "verification"].sort();
    expect(Object.keys(EXPLICITLY_HANDLED).sort()).toEqual(expected);
  });

  it("the derived user-owned list covers every cascade table, by name", () => {
    const names = new Set(userOwnedTables().map((t) => t.name));
    const cascadeNames = new Set<string>(["user"]);
    for (const table of allTables()) {
      const config = getTableConfig(table);
      for (const fk of config.foreignKeys) {
        if (getTableConfig(fk.reference().foreignTable).name === "user" && fk.onDelete === "cascade") cascadeNames.add(config.name);
      }
    }
    expect([...names].sort()).toEqual([...cascadeNames].sort());
    // Sanity anchors: the tables a deletion most needs to reach. A rename
    // here is a deliberate change to the schema, not a drift.
    for (const must of ["accounts", "transactions", "connections", "session", "account", "two_factor", "passkey", "app_settings", "account_balance_snapshots"]) {
      expect(names.has(must), must).toBe(true);
    }
    expect(names.has(getTableConfig(userTable).name)).toBe(true);
  });
});
