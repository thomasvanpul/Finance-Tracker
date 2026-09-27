// Which accounts count as CASH — money that can move this month.
//
// The account `type` (lib/db schema/accounts.ts; enum in openapi.yaml:
// cash, investment, pension, property, other, liability) is the only
// classifier. A name is never parsed: whether "Stocks & Shares ISA" is
// liquid is the user's judgement, recorded by the type they chose.
//
// Only `cash` is cash. `investment`, `pension` and `property` are assets
// that count toward net worth but cannot be spent without a sale or a
// withdrawal; `other` is unclassified, so it is not claimed as cash either;
// `liability` is debt. This is the same filter the API applies to
// `netLiquidity` (spendableCashTotal, api-server routes/dashboard.ts),
// GET /allocation and computeReconciliation, so a client "cash" figure and
// the server's agree on which rows they sum.
//
// A negative `cash` balance is an overdraft and is summed as given — it
// really does reduce what can be spent.
//
// Before this module, the briefing's "Liquid Assets", the dashboard's
// "CASH" KPI and its emergency-fund "liquid" figure each summed EVERY
// account: on the seed account ~£203–210k, of which a Kuala Lumpur flat, a
// SIPP and an ISA made up almost all, against ~£11k of actual cash.

export function isCashType(type: string): boolean {
  return type === "cash";
}

export interface CashTotal {
  /** Sum of base equivalents over convertible `cash` accounts. */
  total: number;
  /** How many `cash` accounts exist at all. Zero means there is no figure to show. */
  cashAccounts: number;
  /** `cash` accounts with no base equivalent — absent from `total`; caveat it. */
  unconvertible: number;
}

export function cashAccountsTotal(
  accounts: readonly { type: string; baseEquivalent: number | null | undefined }[],
): CashTotal {
  let total = 0;
  let cashAccounts = 0;
  let unconvertible = 0;
  for (const a of accounts) {
    if (!isCashType(a.type)) continue;
    cashAccounts += 1;
    if (a.baseEquivalent == null) unconvertible += 1;
    else total += a.baseEquivalent;
  }
  return { total, cashAccounts, unconvertible };
}
