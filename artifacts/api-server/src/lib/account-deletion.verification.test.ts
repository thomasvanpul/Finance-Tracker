// Lock: the verification rows removed by an account deletion are matched
// EXACTLY, never by pattern.
//
// The predicate was `identifier LIKE '%<email>'` until 2026-09-13, so
// deleting a@b.com also removed rows keyed to xa@b.com, and `_` in an
// address matched any character. The gate has no database, so this test
// renders the predicate to SQL and then evaluates the rendered shape
// against rows for two addresses where one is a suffix of the other. The
// real-database version of the same case is in
// account-deletion.integration.test.ts (NUMERIS_DB_TESTS=1).
import { describe, it, expect, vi } from "vitest";

vi.hoisted(() => {
  process.env.DATABASE_URL = process.env.DATABASE_URL || "postgres://test:test@localhost/test";
});

import { PgDialect } from "drizzle-orm/pg-core";
import { verificationRowsFor } from "./account-deletion";

const dialect = new PgDialect();

function render(user: { id: string; email: string }) {
  return dialect.sqlToQuery(verificationRowsFor(user));
}

// Evaluates the rendered predicate against a row. Only the shapes the
// predicate is allowed to have are understood — `"col" = $n` joined by
// `or` — so a LIKE, ILIKE or any other operator throws instead of being
// silently evaluated as something it is not.
function matches(user: { id: string; email: string }, row: { identifier: string; value: string }): boolean {
  const { sql, params } = render(user);
  const body = sql.replace(/^\((.*)\)$/, "$1");
  return body.split(" or ").some((clause) => {
    const m = clause.match(/^"verification"\."(identifier|value)" = \$(\d+)$/);
    if (!m) throw new Error(`unexpected clause shape: ${clause}`);
    return row[m[1] as "identifier" | "value"] === params[Number(m[2]) - 1];
  });
}

describe("account deletion · verification rows are matched exactly", () => {
  const victim = { id: "user-victim-0001", email: "a@b.com" };
  const bystander = { id: "user-bystander-01", email: "extra@b.com" };

  it("renders no pattern operator", () => {
    const { sql } = render(victim);
    expect(sql).not.toMatch(/like/i);
    expect(sql).not.toMatch(/similar|~/i);
  });

  it("binds the email and the user id as whole values, with no wildcard added", () => {
    expect(render(victim).params.sort()).toEqual([victim.email, victim.id].sort());
  });

  it("deleting a@b.com does not match extra@b.com, whose address ends with it", () => {
    expect(bystander.email.endsWith(victim.email)).toBe(true);
    expect(matches(victim, { identifier: bystander.email, value: "code" })).toBe(false);
    expect(matches(victim, { identifier: `email-verification-otp-${bystander.email}`, value: "code" })).toBe(false);
  });

  it("an underscore in the address is a character, not a wildcard", () => {
    const underscored = { id: "user-u", email: "a_b@c.com" };
    expect(matches(underscored, { identifier: "axb@c.com", value: "code" })).toBe(false);
  });

  it("still matches the victim's own rows: the bare email, and the user id as the value", () => {
    expect(matches(victim, { identifier: victim.email, value: "code" })).toBe(true);
    expect(matches(victim, { identifier: "reset-password:tok", value: victim.id })).toBe(true);
    expect(matches(victim, { identifier: "2fa-abc", value: victim.id })).toBe(true);
  });

  it("does not match a bystander's row whose value is their own id", () => {
    expect(matches(victim, { identifier: "reset-password:tok2", value: bystander.id })).toBe(false);
  });
});
