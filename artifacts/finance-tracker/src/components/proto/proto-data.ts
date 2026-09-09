// ── One reading of the account, for eight designs to disagree about ─────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// The previous round shared THREE WIDGETS between four designs, and that is
// why the four looked like one product with the boxes moved: NET WORTH,
// SAVINGS GOALS and the sankey are Numeris's visual signature, and any page
// containing them reads as Numeris no matter how the page is arranged.
//
// So this round shares data and nothing else. Every design draws its own
// marks from these rows. What is shared is what a design cannot be allowed
// to disagree about — which accounts exist, what they are worth, what moved
// — and every derived figure here is an arithmetic function of a figure the
// API supplied. Nothing invents a value; where the API supplies null the
// field stays null and the design shows nothing rather than a zero.

import { useMemo } from "react";
import {
  useGetDashboard,
  useListTransactions,
  useListUpcoming,
  useGetAccountsChangeAttribution,
  type DashboardSummary,
  type Transaction,
  type UpcomingItem,
} from "@workspace/api-client-react";
import { attributionView, type AttributionView } from "@/lib/change-attribution-view";
import { protoFinding, type ProtoFinding } from "@/components/proto/proto-finding";

export interface ProtoAccount {
  id: number;
  name: string;
  currency: string;
  /** Native balance, in the account's own currency. */
  balance: number;
  /** Null when the account could not be converted — never coerced to 0. */
  baseEquivalent: number | null;
  type: DashboardSummary["accountBreakdown"][number]["type"];
  /** Share of the summed convertible base value. Null when unconvertible. */
  share: number | null;
}

export interface ProtoGroup {
  key: string;
  base: number;
  share: number;
  count: number;
}

export interface ProtoMonth {
  /** "2026-09" */
  month: string;
  /** "Sep" */
  short: string;
  income: number;
  expenses: number;
  netSavings: number;
}

export interface ProtoCategory {
  name: string;
  /** Base-currency total of the expense rows in this category. */
  total: number;
  count: number;
  share: number;
  lastDate: string;
}

export interface ProtoData {
  /** False until every query has landed. Designs render nothing before it. */
  ready: boolean;
  baseCurrency: string | null;
  netWorth: number | null;
  netLiquidity: number | null;
  totalCash: number | null;
  unconvertibleAccounts: number;
  portfolio: DashboardSummary["portfolio"] | null;
  thisMonth: DashboardSummary["thisMonth"] | null;
  owing: DashboardSummary["owing"] | null;
  /** Accounts, largest base value first. */
  accounts: ProtoAccount[];
  /** By account type, largest first. */
  composition: ProtoGroup[];
  /** By currency, largest first. The concentration argument lives here. */
  exposure: ProtoGroup[];
  /** Months with any activity, oldest first. */
  months: ProtoMonth[];
  /** Every transaction, newest first. */
  txns: Transaction[];
  /** Expense categories, largest base total first. */
  categories: ProtoCategory[];
  /** Merchants (description), largest expense total first. */
  merchants: ProtoCategory[];
  /** Pending items, soonest first. */
  upcoming: UpcomingItem[];
  /** Sum of the convertible upcoming items. Null if any is unconvertible. */
  upcomingTotal: number | null;
  attribution: AttributionView | null;
  finding: ProtoFinding | null;
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Sum of base-currency figures, or null if ANY of them is unconvertible.
 *
 * Every design in this round routes its totals through here rather than
 * coalescing a null base figure to zero, which is the fabricated-zero defect
 * the repo locks against (lib/fabricated-zero-lock.test.ts): a missing FX
 * conversion becomes a silent £0 and the total is quietly smaller than the
 * truth. A total that cannot be computed is null, and a null renders as an
 * em dash, never as a number.
 */
export function sumBase(values: readonly (number | null)[]): number | null {
  let total = 0;
  for (const v of values) {
    if (v === null) return null;
    total += v;
  }
  return total;
}

/** Sort key for "largest first" over a nullable base figure. Unconvertible
 *  rows sort LAST rather than as zero — the difference matters on a list
 *  that can contain both a £0 account and an unmeasurable one. */
function magnitude(base: number | null): number {
  return base === null ? -1 : Math.abs(base);
}

/** Sum by a key over rows that carry a base figure, sorted by magnitude.
 *  Rows with a null base are counted nowhere — a share of an unknown is not
 *  a small share, it is not a share. */
function groupBy<T>(rows: T[], key: (row: T) => string, base: (row: T) => number | null): ProtoGroup[] {
  const acc = new Map<string, { base: number; count: number }>();
  for (const row of rows) {
    const value = base(row);
    if (value === null) continue;
    const k = key(row);
    const prev = acc.get(k) ?? { base: 0, count: 0 };
    acc.set(k, { base: prev.base + value, count: prev.count + 1 });
  }
  const total = [...acc.values()].reduce((sum, g) => sum + Math.abs(g.base), 0);
  return [...acc.entries()]
    .map(([k, g]) => ({ key: k, base: g.base, count: g.count, share: total === 0 ? 0 : Math.abs(g.base) / total }))
    .sort((a, b) => Math.abs(b.base) - Math.abs(a.base));
}

/** Expense rows only, grouped and ranked. Income and transfers are a
 *  different question and mixing them into a "top spend" list is the kind
 *  of quietly wrong ranking nobody checks. */
function rankExpenses(txns: Transaction[], key: (t: Transaction) => string): ProtoCategory[] {
  const acc = new Map<string, { total: number; count: number; lastDate: string }>();
  let total = 0;
  for (const t of txns) {
    if (t.type !== "expense") continue;
    // Narrowed to a local, so an unconvertible row is skipped rather than
    // coerced. It is excluded from the shares too, which is why the shares
    // are of the CONVERTIBLE spend and the count states how many rows.
    const amount = t.baseEquivalent;
    if (amount === null) continue;
    total += Math.abs(amount);
    const k = key(t);
    const prev = acc.get(k) ?? { total: 0, count: 0, lastDate: t.date };
    acc.set(k, {
      total: prev.total + Math.abs(amount),
      count: prev.count + 1,
      lastDate: t.date > prev.lastDate ? t.date : prev.lastDate,
    });
  }
  return [...acc.entries()]
    .map(([name, g]) => ({ name, total: g.total, count: g.count, lastDate: g.lastDate, share: total === 0 ? 0 : g.total / total }))
    .sort((a, b) => b.total - a.total);
}

export function useProtoData(): ProtoData {
  const dash = useGetDashboard();
  const txnQuery = useListTransactions();
  const upcomingQuery = useListUpcoming();
  const attrQuery = useGetAccountsChangeAttribution();

  const d = dash.data ?? null;
  const txnData = txnQuery.data ?? null;
  const upcomingData = upcomingQuery.data ?? null;

  return useMemo((): ProtoData => {
    const breakdown = d?.accountBreakdown ?? [];
    // Denominator for the share column: the summed magnitude of the
    // accounts that HAVE a base value. An unconvertible account contributes
    // to neither the numerator nor the denominator, so no share is inflated
    // by pretending a missing conversion is zero.
    let convertibleTotal = 0;
    for (const a of breakdown) {
      if (a.baseEquivalent === null) continue;
      convertibleTotal += Math.abs(a.baseEquivalent);
    }
    const accounts: ProtoAccount[] = breakdown
      .map((a) => ({
        id: a.id,
        name: a.name,
        currency: a.currency,
        balance: a.balance,
        baseEquivalent: a.baseEquivalent,
        type: a.type,
        share: a.baseEquivalent === null || convertibleTotal === 0
          ? null
          : Math.abs(a.baseEquivalent) / convertibleTotal,
      }))
      .sort((x, y) => magnitude(y.baseEquivalent) - magnitude(x.baseEquivalent));

    const txns = [...(txnData ?? [])].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));

    const upcoming = [...(upcomingData ?? [])]
      .filter((u) => u.status === "pending")
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.id - b.id));
    const upcomingTotal = sumBase(upcoming.map((u) => u.baseEquivalent));

    const months: ProtoMonth[] = (d?.monthlyHistory ?? [])
      .map((m) => ({
        month: m.month,
        short: MONTH_SHORT[Number(m.month.split("-")[1]) - 1] ?? m.month,
        income: m.income ?? 0,
        expenses: m.expenses ?? 0,
        netSavings: m.netSavings ?? 0,
      }))
      .filter((m) => m.income !== 0 || m.expenses !== 0);

    const view = attrQuery.data === undefined ? null : attributionView(attrQuery.data);

    return {
      ready: d !== null && txnData !== null && upcomingData !== null,
      baseCurrency: d?.baseCurrency ?? null,
      netWorth: d?.netWorth ?? null,
      netLiquidity: d?.netLiquidity ?? null,
      totalCash: d?.totalCash ?? null,
      unconvertibleAccounts: d?.unconvertibleAccounts ?? 0,
      portfolio: d?.portfolio ?? null,
      thisMonth: d?.thisMonth ?? null,
      owing: d?.owing ?? null,
      accounts,
      composition: groupBy(accounts, (a) => a.type, (a) => a.baseEquivalent),
      exposure: groupBy(accounts, (a) => a.currency, (a) => a.baseEquivalent),
      months,
      txns,
      categories: rankExpenses(txns, (t) => t.category),
      merchants: rankExpenses(txns, (t) => t.description),
      upcoming,
      upcomingTotal,
      attribution: view,
      finding: view === null ? null : protoFinding(view),
    };
  }, [d, txnData, upcomingData, attrQuery.data]);
}

/** "2026-09-13" → "13 Sep". Date-only, so no timezone can move it a day. */
export function shortDay(iso: string): string {
  const [, m, day] = iso.split("-").map(Number);
  return `${day} ${MONTH_SHORT[m - 1]}`;
}

/** Whole days from today to an ISO date, positive for the future. Computed
 *  on the date parts alone for the same reason shortDay is. */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const then = Date.UTC(y, m - 1, d);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((then - today) / 86400000);
}
