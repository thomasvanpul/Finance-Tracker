// Subscriptions as a recurrence rule — the two properties that matter.
//
// IDEMPOTENT: running generation twice must not produce two rows.
// IT ADVANCES: when a generated row is paid, the next one appears.
//
// Both are asserted against an in-memory store that models the real
// database constraint — upcoming_subscription_due_uniq (migration 0021),
// a partial unique index on (subscription_id, due_date) — rather than
// against drizzle mocks, which would only prove the mocks agree with
// themselves. The index's existence in the generated SQL is locked
// separately at the bottom of this file.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findSubscriptionDuplicates,
  generateUpcomingFromSubscriptions,
  nextUnfilledOccurrence,
  occurrenceAt,
  toUpcomingFrequency,
  type GeneratedRow,
  type RecurrenceStore,
  type SubscriptionRule,
} from "./subscription-recurrence";

const USER = "user-a";

const sub = (over: Partial<SubscriptionRule> = {}): SubscriptionRule => ({
  id: 1,
  name: "Netflix",
  amount: "10.9900",
  currency: "GBP",
  frequency: "monthly",
  category: "Entertainment",
  nextDue: "2026-09-19",
  startDate: "2026-03-11",
  ...over,
});

interface StoredRow extends GeneratedRow { id: number; }

/**
 * An in-memory store whose insert enforces the same uniqueness the partial
 * unique index does: at most one row per (subscriptionId, dueDate), silently
 * skipping the rest — which is what onConflictDoNothing does.
 */
function makeStore(subscriptions: SubscriptionRule[], seeded: Partial<StoredRow>[] = []) {
  let nextId = 100;
  const rows: StoredRow[] = seeded.map((r) => ({
    userId: USER, subscriptionId: 1, dueDate: "2026-01-01", description: "seed",
    category: "Other", type: "expense", frequency: "monthly", status: "pending",
    nativeAmount: "1.0000", currency: "GBP", accountId: null,
    id: nextId++, ...r,
  } as StoredRow));

  const store: RecurrenceStore = {
    async activeSubscriptions() { return subscriptions; },
    async occupiedOccurrences() {
      return rows
        .filter((r) => r.subscriptionId != null)
        .map((r) => ({ subscriptionId: r.subscriptionId, dueDate: r.dueDate, status: r.status }));
    },
    async handEnteredExpenses() {
      return rows
        .filter((r) => r.subscriptionId == null && r.type === "expense" && r.status === "pending")
        .map((r) => ({ id: r.id, dueDate: r.dueDate, description: r.description, nativeAmount: r.nativeAmount, currency: r.currency }));
    },
    async insertGenerated(incoming) {
      let written = 0;
      for (const row of incoming) {
        const clash = rows.some((r) => r.subscriptionId === row.subscriptionId && r.dueDate === row.dueDate);
        if (clash) continue;
        rows.push({ ...row, id: nextId++ });
        written++;
      }
      return written;
    },
  };
  return { store, rows };
}

describe("generation is idempotent", () => {
  it("running it twice produces one row, not two", async () => {
    const { store, rows } = makeStore([sub()]);

    const first = await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    const second = await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");

    expect(first.inserted).toBe(1);
    expect(second.inserted).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dueDate).toBe("2026-09-19");
  });

  it("a fifth run on four subscriptions still leaves four rows", async () => {
    const subs = [
      sub({ id: 1, name: "Netflix", nextDue: "2026-09-19" }),
      sub({ id: 2, name: "Spotify", nextDue: "2026-09-12", amount: "11.9900" }),
      sub({ id: 3, name: "iCloud+", nextDue: "2026-09-27", amount: "2.9900" }),
      sub({ id: 4, name: "ChatGPT Plus", nextDue: "2026-09-15", amount: "20.0000", currency: "USD" }),
    ];
    const { store, rows } = makeStore(subs);
    for (let i = 0; i < 5; i++) await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    expect(rows).toHaveLength(4);
  });

  it("the insert is refused for a duplicate occurrence even when the generator asks twice", async () => {
    // Models the concurrency case the unique index exists for: two requests
    // both read an empty occupied set, both compute 2026-09-19, both insert.
    const { store, rows } = makeStore([sub()]);
    const written = await store.insertGenerated([
      { userId: USER, subscriptionId: 1, dueDate: "2026-09-19", description: "Netflix", category: "Entertainment", type: "expense", frequency: "monthly", status: "pending", nativeAmount: "10.9900", currency: "GBP", accountId: null },
      { userId: USER, subscriptionId: 1, dueDate: "2026-09-19", description: "Netflix", category: "Entertainment", type: "expense", frequency: "monthly", status: "pending", nativeAmount: "10.9900", currency: "GBP", accountId: null },
    ]);
    expect(written).toBe(1);
    expect(rows).toHaveLength(1);
  });
});

describe("generation advances", () => {
  it("when the generated row is paid, the next occurrence appears", async () => {
    const { store, rows } = makeStore([sub()]);

    await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    expect(rows.map((r) => r.dueDate)).toEqual(["2026-09-19"]);

    // POST /upcoming/:id/pay sets status to "paid" and leaves the row in place.
    rows[0]!.status = "paid" as GeneratedRow["status"];

    await generateUpcomingFromSubscriptions(USER, store, "2026-09-19");
    expect(rows.map((r) => r.dueDate)).toEqual(["2026-09-19", "2026-10-19"]);
  });

  it("a paid row does not free its own occurrence to be regenerated", async () => {
    const { store, rows } = makeStore([sub()]);
    await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    rows[0]!.status = "paid" as GeneratedRow["status"];
    await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    // One paid September row, one pending October row. Never two Septembers.
    expect(rows.filter((r) => r.dueDate === "2026-09-19")).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });

  it("holds at most one unfilled row ahead, so a 30-day window counts a subscription once", async () => {
    const { store, rows } = makeStore([sub({ frequency: "weekly", nextDue: "2026-09-11" })]);
    for (let i = 0; i < 3; i++) await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    expect(rows).toHaveLength(1);
  });
});

describe("what generation refuses to do", () => {
  it("leaves an inactive subscription alone", async () => {
    // activeSubscriptions is the store's filter; an empty list means no work.
    const { store, rows } = makeStore([]);
    const result = await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    expect(result.inserted).toBe(0);
    expect(rows).toHaveLength(0);
  });

  it("reports an unmodelled frequency rather than guessing one", async () => {
    const { store, rows } = makeStore([sub({ frequency: "fortnightly" })]);
    const result = await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    expect(result.inserted).toBe(0);
    expect(result.unsupported).toEqual([{ id: 1, frequency: "fortnightly" }]);
    expect(rows).toHaveLength(0);
  });

  it("never touches a hand-entered row", async () => {
    const { store, rows } = makeStore([sub()], [
      { id: 7, subscriptionId: null as unknown as number, dueDate: "2026-09-19", description: "NETFLIX.COM 4471", nativeAmount: "10.9900" },
    ]);
    await generateUpcomingFromSubscriptions(USER, store, "2026-09-10");
    // The hand-entered row survives untouched AND the generated row is
    // still created — the overlap is reported, not resolved.
    expect(rows).toHaveLength(2);
    expect(rows[0]!.description).toBe("NETFLIX.COM 4471");
  });
});

describe("frequency vocabulary", () => {
  it('maps the subscriptions word "annual" to the upcoming word "yearly"', () => {
    // pages/subscriptions.tsx types frequency as "annual"; schema/upcoming.ts
    // and the client's RECURRING sets say "yearly". A generated row that said
    // "annual" would stop being recognised as recurring by the UI.
    expect(toUpcomingFrequency("annual")).toBe("yearly");
    expect(toUpcomingFrequency("yearly")).toBe("yearly");
    expect(toUpcomingFrequency("Monthly")).toBe("monthly");
    expect(toUpcomingFrequency("one-time")).toBeNull();
    expect(toUpcomingFrequency("whenever")).toBeNull();
  });
});

describe("month-end arithmetic", () => {
  it("clamps a 31st anchor into February without drifting into March", () => {
    expect(occurrenceAt("2026-01-31", "monthly", 1)).toBe("2026-02-28");
  });

  it("recovers the 31st in the next long month rather than losing it", () => {
    // The reason every occurrence is computed from the anchor rather than
    // from its predecessor: stepping would give Mar 28 here, forever.
    expect(occurrenceAt("2026-01-31", "monthly", 2)).toBe("2026-03-31");
  });

  it("handles a leap February", () => {
    expect(occurrenceAt("2028-01-31", "monthly", 1)).toBe("2028-02-29");
  });

  it("steps weekly, quarterly and yearly", () => {
    expect(occurrenceAt("2026-09-10", "weekly", 3)).toBe("2026-10-01");
    expect(occurrenceAt("2026-09-30", "quarterly", 1)).toBe("2026-12-30");
    expect(occurrenceAt("2026-02-29", "yearly", 1)).toBeNull;
    expect(occurrenceAt("2026-09-10", "yearly", 2)).toBe("2028-09-10");
  });
});

describe("nextUnfilledOccurrence", () => {
  it("skips occurrences already taken, whatever their status", () => {
    const taken = new Set(["2026-09-19", "2026-10-19"]);
    expect(nextUnfilledOccurrence({ anchor: "2026-09-19", frequency: "monthly" }, "2026-09-10", taken))
      .toBe("2026-11-19");
  });

  it("rolls a stale anchor forward to today rather than emitting a past date", () => {
    expect(nextUnfilledOccurrence({ anchor: "2024-03-11", frequency: "monthly" }, "2026-09-10", new Set()))
      .toBe("2026-09-11");
  });

  it("emits nothing for an unparseable anchor rather than a wrong date", () => {
    expect(nextUnfilledOccurrence({ anchor: "not-a-date", frequency: "monthly" }, "2026-09-10", new Set())).toBeNull();
    expect(nextUnfilledOccurrence({ anchor: null, frequency: "monthly" }, "2026-09-10", new Set())).toBeNull();
  });
});

describe("duplicate detection reports and never acts", () => {
  const subs = [{ id: 1, name: "Netflix", amount: "10.9900", currency: "GBP", nextDue: "2026-09-19", startDate: "2026-03-11" }];

  it("matches on amount, currency and a nearby date, ignoring description", () => {
    const pairs = findSubscriptionDuplicates(subs, [
      { id: 7, dueDate: "2026-09-20", description: "NETFLIX.COM 4471", nativeAmount: "10.9900", currency: "GBP" },
    ]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]).toMatchObject({ subscriptionId: 1, upcomingId: 7, daysApart: 1 });
  });

  it("does not match a different currency at the same amount", () => {
    expect(findSubscriptionDuplicates(subs, [
      { id: 7, dueDate: "2026-09-19", description: "x", nativeAmount: "10.9900", currency: "USD" },
    ])).toHaveLength(0);
  });

  it("does not match beyond the date tolerance", () => {
    expect(findSubscriptionDuplicates(subs, [
      { id: 7, dueDate: "2026-09-25", description: "x", nativeAmount: "10.9900", currency: "GBP" },
    ])).toHaveLength(0);
  });

  it("does not match a penny away", () => {
    expect(findSubscriptionDuplicates(subs, [
      { id: 7, dueDate: "2026-09-19", description: "x", nativeAmount: "11.0000", currency: "GBP" },
    ])).toHaveLength(0);
  });
});

describe("the migration behind the idempotency guarantee", () => {
  const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
  const sqlPath = join(REPO_ROOT, "lib", "db", "drizzle", "0021_lean_gamora.sql");

  it("creates the partial unique index the generator's onConflictDoNothing targets", () => {
    const sql = readFileSync(sqlPath, "utf-8");
    expect(sql).toMatch(/CREATE UNIQUE INDEX "upcoming_subscription_due_uniq"/);
    expect(sql).toMatch(/"subscription_id","due_date"/);
    expect(sql).toMatch(/WHERE .*subscription_id.* is not null/i);
  });

  it("is additive only — no column dropped, no NOT NULL added, no data rewritten", () => {
    const sql = readFileSync(sqlPath, "utf-8");
    // "ON UPDATE no action" is part of the FK clause, so the data-rewrite
    // check anchors on a statement-initial UPDATE rather than the bare word.
    expect(sql).not.toMatch(/DROP COLUMN|DROP TABLE|SET NOT NULL|ALTER COLUMN/i);
    expect(sql).not.toMatch(/(^|\n)\s*(UPDATE|DELETE FROM)\s/i);
    expect(sql).toMatch(/ADD COLUMN "subscription_id" integer;/);
    expect(sql).toMatch(/ON DELETE set null/);
  });
});
