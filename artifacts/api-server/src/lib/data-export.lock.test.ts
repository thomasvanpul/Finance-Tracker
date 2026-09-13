// Lock: the export covers every table and every column, or says why not.
//
// The export covered 8 of 26 tables until 2026-09-13 and nothing noticed,
// because its table list was typed by hand. Three properties, all derived
// from the drizzle schema (pure data — no connection is opened):
//
//   1. every table is exported or excluded with a reason, never neither
//   2. every column of an exported table is exported or withheld with a
//      reason; a withheld name that no longer exists is stale and fails
//   3. every credential-shaped column (token, secret, password, ciphertext,
//      backup codes) is withheld — so a new `api_token` column added to an
//      exported table fails here instead of landing in a user's download
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost/test";
});

import { getTableColumns, is } from "drizzle-orm";
import { getTableConfig, PgTable, type PgColumn } from "drizzle-orm/pg-core";
import * as schema from "@workspace/db";
import { EXCLUDED_TABLES, EXPORT_SECTIONS, sectionTableName, withheldList } from "./data-export";

const CREDENTIAL_SHAPED = /(token|secret|password|ciphertext|backup_codes)/;
const NOT_A_CREDENTIAL = /_expires_at$/;

function allTableNames(): string[] {
  return (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => is(v, PgTable))
    .map((t) => getTableConfig(t).name)
    .sort();
}

describe("data export · coverage lock", () => {
  it("every table in the schema is exported or excluded with a reason", () => {
    const exported = new Set(EXPORT_SECTIONS.map(sectionTableName));
    const unclassified = allTableNames().filter((name) => !exported.has(name) && !(name in EXCLUDED_TABLES));
    expect(unclassified).toEqual([]);
    expect(allTableNames().length).toBeGreaterThanOrEqual(26);
  });

  it("no table is both exported and excluded, and no section is listed twice", () => {
    const names = EXPORT_SECTIONS.map(sectionTableName);
    expect(names.filter((n) => n in EXCLUDED_TABLES)).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
    const keys = EXPORT_SECTIONS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every withheld field names a column that exists, and carries a reason", () => {
    const stale: string[] = [];
    for (const section of EXPORT_SECTIONS) {
      const columns = getTableColumns(section.table);
      for (const [field, reason] of Object.entries(section.withheld ?? {})) {
        if (!(field in columns)) stale.push(`${section.key}.${field}`);
        expect(reason.length, `${section.key}.${field}`).toBeGreaterThan(10);
      }
    }
    expect(stale).toEqual([]);
  });

  it("every credential-shaped column on an exported table is withheld", () => {
    const leaks: string[] = [];
    for (const section of EXPORT_SECTIONS) {
      const columns = getTableColumns(section.table) as Record<string, PgColumn>;
      for (const [field, column] of Object.entries(columns)) {
        if (!CREDENTIAL_SHAPED.test(column.name) || NOT_A_CREDENTIAL.test(column.name)) continue;
        if (!(field in (section.withheld ?? {}))) leaks.push(`${sectionTableName(section)}.${column.name}`);
      }
    }
    expect(leaks).toEqual([]);
  });

  it("the known credentials are among the withheld fields", () => {
    const withheld = withheldList().map((w) => `${w.section}.${w.field}`);
    expect(withheld).toEqual(
      expect.arrayContaining([
        "sessions.token",
        "signInMethods.accessToken",
        "signInMethods.refreshToken",
        "signInMethods.idToken",
        "signInMethods.password",
        "authenticatorApps.secret",
        "twoFactor.secret",
        "twoFactor.backupCodes",
        "connections.credentialCiphertext",
        "verification.*",
      ]),
    );
  });

  it("still exports the eight sections the version-1 file had, under the same keys", () => {
    const keys = EXPORT_SECTIONS.map((s) => s.key);
    expect(keys).toEqual(
      expect.arrayContaining(["accounts", "transactions", "investments", "upcoming", "debts", "budgets", "goals", "subscriptions"]),
    );
  });
});
