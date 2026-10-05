// INVESTED ASSETS: what "portfolio" means on /fire, and nothing else.
//
// /fire used to seed its portfolio input from net worth when the
// investment summary was empty, under the label "Total invested assets
// (ISA, pension, brokerage)". On 5 Oct 2026 that read PORTFOLIO
// £215,447.00 — net worth, including a flat in Kuala Lumpur and the
// current accounts — and the FI number, the 36% progress bar and the
// "14.8 yrs" estimate all rested on it. Measured: the invested figure is
// £53,127.87 against a £215,447.22 net worth, a 4x overstatement of
// progress toward financial independence.
//
// Composition, which matches the label: the balances of accounts typed
// `investment` (ISA, brokerage) and `pension`, plus the valued securities
// portfolio. It follows the same decomposition the dashboard's net worth
// uses, where account balances and the securities total are separate
// terms. Cash, property, `other` and liabilities are excluded.

import { signedAccountAmount } from "./account-sign";

/** An `accountBreakdown` row from GET /api/dashboard, structurally. */
export interface AccountForInvested {
  type: string;
  baseEquivalent?: number | null;
}

const INVESTED_TYPES = new Set(["investment", "pension"]);

export interface InvestedAssets {
  total: number;
  /** Balance held in investment- and pension-typed accounts. */
  accounts: number;
  /** Valued securities, from the investment summary. Null = none valued. */
  securities: number | null;
  /** Accounts in scope whose FX conversion was unavailable. */
  unconvertible: number;
}

export function investedAssets(
  accounts: readonly AccountForInvested[] | null | undefined,
  securitiesValueBase: number | null | undefined,
): InvestedAssets {
  let accountsTotal = 0;
  let unconvertible = 0;
  for (const a of accounts ?? []) {
    if (!INVESTED_TYPES.has(a.type)) continue;
    // An unconvertible balance is left out and counted, never coerced to
    // zero — the caller caveats the total with the count.
    const signed = signedAccountAmount(a.type, a.baseEquivalent);
    if (signed == null) unconvertible += 1;
    else accountsTotal += signed;
  }
  const securities = securitiesValueBase ?? null;
  return {
    total: Math.round((accountsTotal + (securities ?? 0)) * 100) / 100,
    accounts: Math.round(accountsTotal * 100) / 100,
    securities,
    unconvertible,
  };
}
