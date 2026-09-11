// The account sign rule, server side, in one place.
//
// An account row stores a POSITIVE balance and lets `type` carry the sign: a
// `liability` of 6,800 is £6,800 owed, not £6,800 held. That is stated on the
// column itself (lib/db/src/schema/accounts.ts) and it is the distinction that
// keeps an OVERDRAFT and a LOAN apart:
//
//   a £6,800 `liability` with balance +6800  → net worth −6800
//   a −£6,800 balance on a `cash` account    → net worth −6800  (same)
//                                            → netLiquidity −6800 (different)
//
// An overdraft is ALREADY negative. Flipping it because it is negative would
// collapse the two cases and destroy that distinction permanently. Only the
// TYPE flips a value; never the value's own sign.
//
// WHY THIS EXISTS SERVER-SIDE AT ALL, given the client has its own copy at
// artifacts/finance-tracker/src/lib/account-sign.ts:
//
// The two runtimes share no workspace package — the SPA depends on
// @workspace/api-client-react and nothing else, the API on @workspace/db and
// @workspace/api-zod. Introducing a package to share three lines would put a
// build-graph edge between them for less code than the edge costs. So the rule
// is stated once per runtime, and `account-sign.lock.test.ts` scans BOTH trees
// and asserts the two statements stay identical — the duplication is held
// coherent by a test rather than by anyone remembering.
//
// Most of this server does NOT want a signed sum. `assetAccountsTotal` and
// `liabilityAccountsTotal` (routes/dashboard.ts) deliberately keep the two
// terms apart so the documented response identity holds:
//
//   netWorth == totalCash + portfolio.totalValueBase + owing.netBase
//               - totalLiabilities
//
// Netting them at the source would make a field named "Cash" fall when a loan
// is entered and hide the size of the debt inside an opaque total. What those
// two functions take from here is only `isLiabilityType`, so the type string
// itself lives in one place. `signedAccountAmount` is for the places that
// genuinely need one signed figure per account — currency exposure being the
// first, where a sterling loan reduces sterling exposure rather than adding
// to it.

/** True when this account type reduces what the holder is worth. */
export function isLiabilityType(type: string): boolean {
  return type === "liability";
}

/**
 * One account's signed contribution: unchanged for an asset, negated for a
 * liability. Null passes through so an unconvertible account stays absent
 * rather than becoming a fabricated zero.
 */
export function signedAccountAmount<T extends number | null | undefined>(
  type: string,
  amount: T,
): T {
  if (amount == null) return amount;
  return (isLiabilityType(type) ? -amount : amount) as T;
}
