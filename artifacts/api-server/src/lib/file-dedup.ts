// H5 file-import dedup.
//
// A file-imported transaction is identified by a deterministic hash
// of its content. Re-importing the same statement produces identical
// hashes; the unique index on transactions(userId, accountId,
// externalId) turns those into ON CONFLICT DO NOTHING drops.
//
// The dedup rule — the whole feature turns on this:
//
//   externalId = sha256("<userId>|<accountId>|<date>|<description>
//                         |<signedNativeAmount>|<ordinal>")
//              → base64url, first 32 chars
//
// where `ordinal` is the 1-based position of this row within the
// GROUP of rows in THIS import that share all five preceding fields.
// Two £5 Starbucks purchases on the same day get ordinals 1 and 2;
// a Tesco row on the same day is in a different group and starts
// its own ordinal at 1 — unrelated rows never shift each other.
//
// This handles every case correctly:
//
//   1. Re-importing the same statement: every row produces the same
//      externalId (same group population, same 1-based position) →
//      all dropped as conflicts → 0 new inserted.
//
//   2. Reissued statement with 3 new rows on a NEW day/description/
//      amount combo: existing rows match on hash and drop; the 3
//      new rows are in their own new groups (each starts at
//      ordinal 1) and land.
//
//   3. Two identical purchases on the same day (e.g. two £5
//      coffees at the same shop): they get ordinals 1 and 2 →
//      TWO distinct externalIds → both persist. This is the
//      right answer — a spending tracker that under-reports on
//      a common everyday case is broken.
//
//   4. Reissue that adds an identical row to an existing group
//      (2 coffees → 3): the new import assigns ordinals 1,2,3.
//      Positions 1 and 2 hash-match existing rows and drop; the
//      third row is new and lands. Correct.
//
//   5. Reissue that REMOVES an identical row (3 coffees → 2):
//      the new import assigns ordinals 1 and 2 only. Both match
//      and drop. The DB row with ordinal 3 stays — a stale
//      historical row. This is the accepted asymmetry: the file
//      layer cannot distinguish "row was removed from history"
//      from "user chose a smaller date window this time", so we
//      preserve. Reissue-with-remove is rare, reissue-with-add
//      is common, and losing history is the worse failure.
//
//   6. Reissue that inserts an UNRELATED same-day row (e.g.
//      Tesco added on the day two Starbucks rows exist): the
//      Tesco row is in a different group so the Starbucks
//      ordinals stay 1 and 2. Nothing shifts.
//
//   7. Two separate imports over overlapping date ranges that
//      both contain the same two Starbucks rows: each import
//      computes its own within-import ordinals (1 and 2 in
//      both), and the resulting hashes match → the second
//      import's rows drop as conflicts. Correct.
//
// Ordinals are scoped to (date, normalisedDescription,
// signedAmount) — the equivalence class of "otherwise identical
// rows on this day". Because identical rows are interchangeable,
// which one holds ordinal 1 is irrelevant; only the total count
// per group matters.
//
// Fields hashed:
//   - userId, accountId: same content in different users' or
//     accounts' files must not collide (they can't — different
//     externalIds would follow, but hashing user/account first makes
//     the intent explicit).
//   - date: ISO YYYY-MM-DD as stored.
//   - description: trimmed, single-spaced. Whitespace normalisation
//     matters because two exports of the same statement sometimes
//     collapse or expand whitespace. Trim + normalise-internal-
//     whitespace is the same rule the CSV parsers apply on read.
//   - nativeAmount: as a signed decimal string with 2 places. Two
//     places matches the storage precision the UI shows; more
//     places would fingerprint float display noise.
//   - ordinal: 1-based position within the same-content group.
//
// Fields NOT hashed:
//   - currency: always the same for a given account, so hashing it
//     adds nothing.
//   - source, category, notes, tx type: derived fields the user or
//     auto-categoriser sets after import. Including them would
//     cause the same statement re-imported after auto-cat to look
//     "new" and re-insert.
//
// The truncation to 32 base64url chars is 192 bits of entropy —
// vastly beyond any collision risk at the volumes any individual
// finance app sees.

import { createHash } from "node:crypto";

function normaliseDescription(desc: string): string {
  return desc.trim().replace(/\s+/g, " ");
}

function formatAmount(amount: number): string {
  // Two decimal places, explicit sign. Matches the UI precision so
  // hashing tracks the visible amount, not float noise.
  const sign = amount < 0 ? "-" : "";
  return `${sign}${Math.abs(amount).toFixed(2)}`;
}

export interface DedupInput {
  userId: string;
  accountId: number;
  date: string; // ISO YYYY-MM-DD
  description: string;
  nativeAmount: number; // signed — negative for outflows
  ordinal: number; // 1-based position within the same-content group
}

export function computeExternalId(input: DedupInput): string {
  const key = [
    input.userId,
    String(input.accountId),
    input.date,
    normaliseDescription(input.description),
    formatAmount(input.nativeAmount),
    String(input.ordinal),
  ].join("|");
  const digest = createHash("sha256").update(key).digest("base64url");
  return digest.slice(0, 32);
}

// Assigns 1-based ordinals to rows within groups of otherwise-
// identical (date, normalisedDescription, signedAmount) rows. Two
// £5 Starbucks on the same day get ordinals 1 and 2; a Tesco row
// on the same day is in a different group and starts its own
// ordinal at 1. Rows are processed in the order they appear in the
// input — that order does NOT need to match statement order,
// because within a group all rows are interchangeable and only the
// count matters.
export function assignOrdinals<
  T extends { date: string; description: string; nativeAmount: number }
>(rows: T[]): Array<T & { ordinal: number }> {
  const counts = new Map<string, number>();
  return rows.map((r) => {
    const key = `${r.date}|${normaliseDescription(r.description)}|${formatAmount(r.nativeAmount)}`;
    const next = (counts.get(key) ?? 0) + 1;
    counts.set(key, next);
    return { ...r, ordinal: next };
  });
}
