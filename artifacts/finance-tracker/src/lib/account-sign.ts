// How an account's balance is SIGNED for display, in one place.
//
// The API stores and returns every account balance as a positive magnitude
// and lets `type` carry the sign: a `liability` of 6,800 is £6,800 owed, not
// £6,800 held. Server-side that is unambiguous — `assetAccountsTotal` and
// `liabilityAccountsTotal` (routes/dashboard.ts) keep the two terms apart and
// the response identity spells out how they combine.
//
// Client-side it was not. Every surface that listed accounts summed
// `baseEquivalent` directly, so a season-ticket loan added £6,800 to the
// screen's headline and rendered in the row list looking exactly like a
// savings account. Both surfaces are fixed by going through here, and it
// lives in one module so a third list cannot re-introduce the same defect
// with its own reduce().
//
// The sign is produced by NEGATING the value and letting the formatter state
// it. Never prefix a "−" glyph to a formatted figure — DESIGN.md §7 and Lock
// #19 (`lib/sign-glyph.lock.test.ts`): every glyph-prefixed formatter
// argument is a magnitude, and double-signing yields "−−£6,800.00".

/** True when this account type reduces what the holder is worth. */
export function isLiabilityType(type: string): boolean {
  return type === "liability";
}

/**
 * The display value of an account amount: unchanged for an asset, negated
 * for a liability. Pass the result straight to `formatMoney` / `nfmt`.
 * Null passes through so an unconvertible account still renders its dash.
 */
export function signedAccountAmount<T extends number | null | undefined>(
  type: string,
  amount: T,
): T {
  if (amount == null) return amount;
  return (isLiabilityType(type) ? -amount : amount) as T;
}

/**
 * Sum a mixed list of accounts the way net worth does — assets add,
 * liabilities subtract. Accounts with no base equivalent are skipped, so
 * callers with a non-zero unconvertible count must caveat the total.
 */
export function netAccountsTotal(
  accounts: readonly { type: string; baseEquivalent: number | null | undefined }[],
): number {
  return accounts.reduce(
    (sum, a) => sum + (signedAccountAmount(a.type, a.baseEquivalent) ?? 0),
    0,
  );
}
