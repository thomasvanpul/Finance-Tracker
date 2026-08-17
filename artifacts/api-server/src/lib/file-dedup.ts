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
//                         |<signedNativeAmount>")
//              → base64url, first 32 chars
//
// This handles the common cases:
//
//   1. Re-importing the same statement: every row produces the same
//      externalId → all dropped as conflicts → 0 new inserted.
//   2. Reissued statement with 3 new rows: existing rows match on
//      hash and drop; the 3 new rows produce 3 new hashes and land.
//   3. Two identical purchases on the same day (e.g. two £5 coffees
//      at the same shop on the same day): they collapse to one row.
//      This IS a false positive. The user can disambiguate by
//      editing the description to include a marker before import
//      (e.g. "Starbucks (2nd)"). We accept the collapse — the
//      alternative (using row ordinal in the hash) breaks case (2)
//      whenever the reissued statement adds a row on the same day
//      as an existing row, which would shift ordinals and re-import
//      as duplicates.
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
}

export function computeExternalId(input: DedupInput): string {
  const key = [
    input.userId,
    String(input.accountId),
    input.date,
    normaliseDescription(input.description),
    formatAmount(input.nativeAmount),
  ].join("|");
  const digest = createHash("sha256").update(key).digest("base64url");
  return digest.slice(0, 32);
}
