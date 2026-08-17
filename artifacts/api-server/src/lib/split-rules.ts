// Split-rule arithmetic for shared expenses (F4).
//
// The whole feature turns on getting the remainder pence right. A
// dinner bill of £24.61 split three ways is not £8.20-and-a-bit
// each — someone has to pay £8.21. Which someone must be
// deterministic, or the same expense splits differently on refresh
// and the ledger disagrees with itself.
//
// Rule for equal-split remainders:
//   The remainder pence go to the EARLIEST participants by
//   insertion order (participants[0], participants[1], ...) —
//   first served, first extra penny. Deterministic, easy to
//   explain, and matches how a human would round the top of a
//   list rather than the bottom.
//
// Rule for shares-split remainders:
//   Amounts are computed as floor((total * share) / totalShares).
//   The remainder pence go to the participants with the LARGEST
//   share weight first (a bigger share carries more of the
//   rounding), then insertion order as a tiebreak. Also
//   deterministic.
//
// Everything is done in integer minor units (pence, cents) to
// avoid float error. The caller passes a number of major units;
// this file converts to minor once, splits in integer arithmetic,
// converts back. Currencies with a different minor unit exponent
// (JPY has 0, KWD has 3) are not supported yet — we assume 2
// decimal places for every currency we ship today (GBP, USD, EUR,
// MYR, SGD). If a 0- or 3-decimal currency ever lands, the
// exponent needs to become a per-call parameter.

const MINOR_UNIT_EXPONENT = 2;
const MINOR_PER_MAJOR = 10 ** MINOR_UNIT_EXPONENT;

// Convert a major-unit amount (pounds) to integer minor units
// (pence). Rounds to the nearest — a total of 24.605 is 2461p, not
// 2460p. Rounding at the boundary matches the storage precision
// (numeric(18, 4)) and the UI (£24.61 rendered).
function toMinor(amountMajor: number): number {
  return Math.round(amountMajor * MINOR_PER_MAJOR);
}

// And back for the return value.
function fromMinor(amountMinor: number): number {
  return amountMinor / MINOR_PER_MAJOR;
}

export interface SplitResult {
  // Per-participant amount in major units (pounds), in the same
  // order as the input. Sums exactly to the input total.
  amounts: number[];
}

// Equal split of `total` among `n` participants. Returns n amounts
// summing exactly to `total`. Remainder pence go to the first
// participants by insertion order.
//
// Examples (£, 2dp):
//   splitEqual(30, 3)     → [10, 10, 10]
//   splitEqual(10, 3)     → [3.34, 3.33, 3.33]
//   splitEqual(24.61, 3)  → [8.21, 8.20, 8.20]
//   splitEqual(0.01, 3)   → [0.01, 0, 0]     (one penny, one person)
export function splitEqual(total: number, n: number): SplitResult {
  if (!Number.isFinite(total)) throw new Error("splitEqual: total must be finite");
  if (!Number.isInteger(n) || n <= 0) throw new Error("splitEqual: n must be a positive integer");
  const totalMinor = toMinor(total);
  const base = Math.trunc(totalMinor / n);
  const remainder = totalMinor - base * n;
  const amounts: number[] = [];
  for (let i = 0; i < n; i++) {
    const shareMinor = base + (i < remainder ? 1 : 0);
    amounts.push(fromMinor(shareMinor));
  }
  return { amounts };
}

// Exact split: participants pre-specify per-person amounts. Returns
// those amounts unchanged if they sum to the total, throws otherwise.
// This is a validator, not a distributor — the caller has already
// decided who owes what, this just guards against arithmetic errors
// (typoed 8.20 as 82.00 across three lines and only noticed the
// missing zero on the last one).
//
// Tolerance: amounts must sum EXACTLY in minor units. £8.201 is not
// a legal input — the UI must round the field before sending, or
// this throws. Never accept "close enough" — that is how a shared
// ledger becomes an argument.
export function splitExact(total: number, amounts: number[]): SplitResult {
  if (!Number.isFinite(total)) throw new Error("splitExact: total must be finite");
  if (amounts.length === 0) throw new Error("splitExact: at least one amount required");
  const totalMinor = toMinor(total);
  let sumMinor = 0;
  for (const a of amounts) {
    if (!Number.isFinite(a)) throw new Error("splitExact: amounts must be finite");
    if (a < 0) throw new Error("splitExact: amounts must be non-negative");
    sumMinor += toMinor(a);
  }
  if (sumMinor !== totalMinor) {
    throw new Error(
      `splitExact: amounts sum to ${fromMinor(sumMinor).toFixed(2)}, expected ${fromMinor(totalMinor).toFixed(2)}`,
    );
  }
  return { amounts: amounts.slice() };
}

// Shares split: proportional to integer share weights. Zero share
// is legal — the participant is on the ledger but owes nothing.
// Negative shares are not (they would be someone owed by the group,
// which is a different feature — Venmo-style "IOUs to the group").
//
// Remainder pence go to the largest share first, then insertion
// order as a tiebreak. This makes a bigger share carry a bigger
// slice of the rounding, which matches how a human would round a
// bill where one person had 3× more than the others.
//
// Example: £10 split as shares [2, 1, 1] with 4 total shares
//   Raw:  [5.00, 2.50, 2.50] — sums exactly, no remainder
//
// Example: £10 split as shares [1, 1, 1] — same as equal
//   base = floor(1000/3) = 333p each = £3.33 × 3 = £9.99
//   remainder = 1p → largest-share first, tiebreak insertion order
//   → participant 0 gets 334p = £3.34, rest £3.33
export function splitShares(total: number, shares: number[]): SplitResult {
  if (!Number.isFinite(total)) throw new Error("splitShares: total must be finite");
  if (shares.length === 0) throw new Error("splitShares: at least one share required");
  for (const s of shares) {
    if (!Number.isInteger(s) || s < 0) throw new Error("splitShares: shares must be non-negative integers");
  }
  const totalShares = shares.reduce((sum, s) => sum + s, 0);
  if (totalShares === 0) throw new Error("splitShares: total shares must be > 0");

  const totalMinor = toMinor(total);
  const baseMinor = shares.map((s) => Math.trunc((totalMinor * s) / totalShares));
  const allocated = baseMinor.reduce((sum, b) => sum + b, 0);
  const remainder = totalMinor - allocated;

  // Assign remainder pence to participants ordered by:
  //   1. share DESC — bigger share carries more rounding
  //   2. insertion order ASC — deterministic tiebreak
  // We take the top `remainder` participants under that order and
  // give each one extra penny.
  const rankedIndices = shares
    .map((s, i) => ({ i, s }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .slice(0, remainder)
    .map((r) => r.i);
  const bonus = new Set(rankedIndices);

  const amounts = baseMinor.map((b, i) => fromMinor(b + (bonus.has(i) ? 1 : 0)));
  return { amounts };
}
