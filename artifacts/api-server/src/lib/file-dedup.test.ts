// Dedup rule tests.
//
// The critical properties:
//   1. Determinism — same input, same externalId, across process
//      restarts and across imports.
//   2. Group-scoped ordinals — two identical rows on the same day
//      produce two distinct externalIds; unrelated rows on the
//      same day never shift each other's ordinals.
//   3. The four reissue scenarios named in the review (add,
//      remove, unrelated insert, overlapping-range re-import) all
//      behave correctly.
//
// If any of these break, the file import silently loses or
// duplicates a user's transactions.

import { describe, it, expect } from "vitest";
import { computeExternalId, assignOrdinals } from "./file-dedup";

// Test row shape — a subset of the fields the import endpoint
// hashes on. All rows in these tests use the same userId +
// accountId so the group logic is what's being exercised.
interface Row {
  date: string;
  description: string;
  nativeAmount: number;
}

// Compute externalIds for a set of rows the way the import endpoint
// does: assign ordinals, then hash each row with (userId, accountId,
// ordinal). Returns a parallel array so tests can compare positions
// directly.
function hashSet(userId: string, accountId: number, rows: Row[]): string[] {
  return assignOrdinals(rows).map((r) =>
    computeExternalId({
      userId,
      accountId,
      date: r.date,
      description: r.description,
      nativeAmount: r.nativeAmount,
      ordinal: r.ordinal,
    }),
  );
}

const USER = "user-A";
const ACCOUNT = 42;
const COFFEE: Row = { date: "2026-08-17", description: "STARBUCKS", nativeAmount: -5 };
const TESCO: Row = { date: "2026-08-17", description: "TESCO", nativeAmount: -12.5 };

describe("computeExternalId — determinism", () => {
  it("same input → same externalId across two invocations", () => {
    const input = {
      userId: USER, accountId: ACCOUNT, date: "2026-08-17",
      description: "STARBUCKS #1234", nativeAmount: -4.75, ordinal: 1,
    };
    expect(computeExternalId(input)).toEqual(computeExternalId(input));
  });

  it("trailing/leading and internal whitespace differences normalise", () => {
    const clean = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "STARBUCKS #1234", nativeAmount: -4.75, ordinal: 1,
    });
    const padded = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "  STARBUCKS  #1234  ", nativeAmount: -4.75, ordinal: 1,
    });
    expect(clean).toBe(padded);
  });

  it("amount precision beyond 2dp truncates", () => {
    const a = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "S", nativeAmount: -4.75, ordinal: 1,
    });
    const b = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "S", nativeAmount: -4.7501, ordinal: 1,
    });
    expect(a).toBe(b);
  });

  it("returns a 32-char base64url string", () => {
    const id = computeExternalId({
      userId: "u", accountId: 1, date: "2026-08-17",
      description: "S", nativeAmount: -4.75, ordinal: 1,
    });
    expect(id).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});

describe("computeExternalId — sensitivity", () => {
  const base = {
    userId: USER, accountId: ACCOUNT, date: "2026-08-17",
    description: "STARBUCKS", nativeAmount: -4.75, ordinal: 1,
  };
  it("user, account, date, description, amount, sign flip, ordinal — each changes the hash", () => {
    const h = computeExternalId(base);
    expect(computeExternalId({ ...base, userId: "user-B" })).not.toEqual(h);
    expect(computeExternalId({ ...base, accountId: 2 })).not.toEqual(h);
    expect(computeExternalId({ ...base, date: "2026-08-18" })).not.toEqual(h);
    expect(computeExternalId({ ...base, description: "TESCO" })).not.toEqual(h);
    expect(computeExternalId({ ...base, nativeAmount: -4.76 })).not.toEqual(h);
    expect(computeExternalId({ ...base, nativeAmount: 4.75 })).not.toEqual(h);
    expect(computeExternalId({ ...base, ordinal: 2 })).not.toEqual(h);
  });
});

describe("assignOrdinals — group scoping", () => {
  it("two identical rows get ordinals 1, 2 in order", () => {
    const [a, b] = assignOrdinals([COFFEE, COFFEE]);
    expect(a!.ordinal).toBe(1);
    expect(b!.ordinal).toBe(2);
  });

  it("unrelated same-day row starts its own ordinal at 1", () => {
    const rows = assignOrdinals([COFFEE, TESCO, COFFEE]);
    expect(rows[0]!.ordinal).toBe(1); // COFFEE #1
    expect(rows[1]!.ordinal).toBe(1); // TESCO #1 — separate group
    expect(rows[2]!.ordinal).toBe(2); // COFFEE #2
  });

  it("different day but same description/amount is a different group", () => {
    const day1: Row = { date: "2026-08-17", description: "STARBUCKS", nativeAmount: -5 };
    const day2: Row = { date: "2026-08-18", description: "STARBUCKS", nativeAmount: -5 };
    const rows = assignOrdinals([day1, day1, day2, day2, day1]);
    expect(rows[0]!.ordinal).toBe(1); // day1 #1
    expect(rows[1]!.ordinal).toBe(2); // day1 #2
    expect(rows[2]!.ordinal).toBe(1); // day2 #1
    expect(rows[3]!.ordinal).toBe(2); // day2 #2
    expect(rows[4]!.ordinal).toBe(3); // day1 #3
  });

  it("whitespace-only description differences fall into the same group", () => {
    const a: Row = { date: "2026-08-17", description: "STARBUCKS", nativeAmount: -5 };
    const b: Row = { date: "2026-08-17", description: "  STARBUCKS ", nativeAmount: -5 };
    const rows = assignOrdinals([a, b]);
    expect(rows[0]!.ordinal).toBe(1);
    expect(rows[1]!.ordinal).toBe(2);
  });
});

describe("dedup — the four review cases", () => {
  it("case 1: reissue adds an identical row (2 coffees → 3) — first two match, third is new", () => {
    const first  = hashSet(USER, ACCOUNT, [COFFEE, COFFEE]);
    const second = hashSet(USER, ACCOUNT, [COFFEE, COFFEE, COFFEE]);
    // The first two hashes of the reissue must match the two from
    // the first import — those rows drop as conflicts, no dupes.
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    // The third hash must be new — it lands as a new row.
    expect(second[2]).not.toBe(first[0]);
    expect(second[2]).not.toBe(first[1]);
  });

  it("case 2: reissue REMOVES an identical row (3 coffees → 2) — both match, third stays as stale", () => {
    const first  = hashSet(USER, ACCOUNT, [COFFEE, COFFEE, COFFEE]);
    const second = hashSet(USER, ACCOUNT, [COFFEE, COFFEE]);
    // The reissue's two hashes match the first two from the
    // original — both drop as conflicts. The third original row
    // (with ordinal=3 hash) is NEVER regenerated by the reissue,
    // so its DB row is untouched. That's the accepted asymmetry:
    // we preserve rather than delete, because the file layer
    // can't distinguish "removed from history" from "smaller
    // date window this time".
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second).toHaveLength(2);
    // Confirm the third hash from the first import is unique —
    // nothing in the reissue matches it, so it stays on disk.
    expect(first[2]).not.toBe(first[0]);
    expect(first[2]).not.toBe(first[1]);
  });

  it("case 3: reissue inserts an UNRELATED same-day row (Tesco added to a day with two Starbucks) — coffee ordinals do not move", () => {
    const first  = hashSet(USER, ACCOUNT, [COFFEE, COFFEE]);
    // Reissue: Tesco appears BETWEEN the two coffees in file order.
    // If ordinals were "all rows for a date" this would shift the
    // second coffee's ordinal. Group scoping keeps it stable.
    const second = hashSet(USER, ACCOUNT, [COFFEE, TESCO, COFFEE]);
    // Coffee #1 and Coffee #2 hashes must match across imports.
    expect(second[0]).toBe(first[0]); // COFFEE ordinal 1
    expect(second[2]).toBe(first[1]); // COFFEE ordinal 2 (position 2 in file, but still #2 in group)
    // Tesco is a new row with a different hash — it lands.
    expect(second[1]).not.toBe(first[0]);
    expect(second[1]).not.toBe(first[1]);
  });

  it("case 4: two separate imports over overlapping date ranges both containing the same two coffees — the second is fully deduped", () => {
    // Import A: [Jul 30, Coffee1, Coffee2, Aug 2]
    const jul30: Row = { date: "2026-07-30", description: "RENT", nativeAmount: -1200 };
    const aug2: Row  = { date: "2026-08-02", description: "SALARY", nativeAmount: 3500 };
    const importA = hashSet(USER, ACCOUNT, [jul30, COFFEE, COFFEE, aug2]);
    // Import B: overlapping window, same two coffees appear again
    // alongside other rows. Only the two coffees should collide
    // with import A.
    const aug5: Row = { date: "2026-08-05", description: "TESCO", nativeAmount: -45 };
    const importB = hashSet(USER, ACCOUNT, [COFFEE, COFFEE, aug5]);
    // importA[1] = COFFEE #1, importA[2] = COFFEE #2
    // importB[0] = COFFEE #1, importB[1] = COFFEE #2
    expect(importB[0]).toBe(importA[1]);
    expect(importB[1]).toBe(importA[2]);
    // importB[2] (TESCO on aug 5) is a new hash.
    expect(importB[2]).not.toBe(importA[0]);
    expect(importB[2]).not.toBe(importA[1]);
    expect(importB[2]).not.toBe(importA[2]);
    expect(importB[2]).not.toBe(importA[3]);
  });
});

describe("dedup — a truly-different reissue still lands new rows", () => {
  it("original 2 coffees, reissue has 2 coffees + 1 TESCO (unrelated group) → coffees drop, TESCO lands", () => {
    const first  = hashSet(USER, ACCOUNT, [COFFEE, COFFEE]);
    const second = hashSet(USER, ACCOUNT, [COFFEE, COFFEE, TESCO]);
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
    expect(second[2]).not.toBe(first[0]);
    expect(second[2]).not.toBe(first[1]);
  });
});
