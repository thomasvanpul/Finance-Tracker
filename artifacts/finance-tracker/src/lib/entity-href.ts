// ── entityHref ──────────────────────────────────────────────────────────────
// One place that says how to link to a thing.
//
// The app had grown five separate conventions for the same job, each invented
// at its own call site: `/accounts?highlight=<id>`, `/goals?highlight=<id>`,
// `/transactions?q=<description>`, `/investments?add=1` and
// `/settings?panel=<id>`. Two of them collided on the name `highlight` while
// meaning different things, and one of them — the goals link — pointed at a
// parameter no page has ever read.
//
// A detail surface is a query parameter on the entity's own list screen, not a
// route (CLAUDE.md: a new URL is a claim that this is one of ~20 things a user
// looks up by name; a single account is not). Everything that opens one goes
// through here, so the parameter name lives in exactly one file.

export type EntityKind =
  | "account"
  | "goal"
  | "investment"
  | "settings";

/** The query parameter each kind's list screen reads. */
export const ENTITY_PARAM: Record<EntityKind, string> = {
  account: "account",
  goal: "goal",
  investment: "position",
  settings: "panel",
};

const ENTITY_ROUTE: Record<EntityKind, string> = {
  account: "/accounts",
  goal: "/goals",
  investment: "/investments",
  settings: "/settings",
};

/** Link to one entity's detail surface on its list screen. */
export function entityHref(kind: EntityKind, id: string | number): string {
  return `${ENTITY_ROUTE[kind]}?${ENTITY_PARAM[kind]}=${encodeURIComponent(String(id))}`;
}

/** Link to a transaction search. Not an entity id — a query over rows. */
export function transactionSearchHref(query: string): string {
  return `/transactions?q=${encodeURIComponent(query)}`;
}

/** Link to the add-position form on the investments screen. */
export function addInvestmentHref(): string {
  return "/investments?add=1";
}

// ── Filters over the ledger ─────────────────────────────────────────────────
// A category, an account, a merchant, a month, a type — none of these is an
// entity with a detail surface. Each is a query over transaction rows, so a
// drill on one lands on /transactions with the filter already applied: the
// same screen the user would have reached by hand, with the same chips ready
// to clear. One builder, so a parameter name lives in one place.

export interface LedgerFilters {
  /** Substring match across description, category and account name. */
  q?: string;
  /** Exact match on a transaction's category. */
  category?: string;
  /** An account **id** — /transactions resolves it to the name it filters on. */
  account?: string | number;
  type?: "income" | "expense" | "transfer";
  /** Inclusive ISO date bounds, `YYYY-MM-DD`. */
  from?: string;
  to?: string;
}

export function ledgerHref(filters: LedgerFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

/**
 * The ledger filtered to one category.
 *
 * Not `q`: the search is a substring match across description, category and
 * account, so `?q=Groceries` also catches a transaction merely described as
 * "groceries refund". A category drill promises the category.
 */
export function categoryTransactionsHref(category: string, range?: { from?: string; to?: string }): string {
  return ledgerHref({ category, ...range });
}

/**
 * The ledger filtered to one account, by id.
 *
 * `account` means an account id everywhere in the app — the same value
 * `entityHref("account", id)` carries. /transactions resolves it to the
 * account name it filters on, so the two never disagree about what an
 * `account` parameter holds, and renaming an account does not strand a link.
 */
export function accountTransactionsHref(id: string | number): string {
  return ledgerHref({ account: id });
}

/**
 * One merchant's history across every account.
 *
 * A merchant is a transaction description in this schema — see the merchant
 * grouping in pages/transactions.tsx, which keys on `tx.description`. `q`
 * matches description, so the search is the history, and it deliberately
 * crosses accounts.
 */
export function merchantTransactionsHref(description: string): string {
  return ledgerHref({ q: description });
}

/** The rows behind a month's total. `month` is `YYYY-MM`. */
export function monthTransactionsHref(month: string, type?: LedgerFilters["type"]): string {
  const [y, m] = month.split("-").map(Number);
  // Day 0 of the next month is the last day of this one, so this is correct
  // for February and for a leap year without a table of month lengths.
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return ledgerHref({ from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, "0")}`, type });
}

/**
 * The recurring series a transaction belongs to.
 *
 * A series has no id — `lib/recurring-detect.ts` derives one from a run of
 * transactions sharing a merchant name, so the name is the address. The
 * /recurring screen reads `q` and filters its list to it.
 */
export function recurringSeriesHref(merchantName: string): string {
  return `/recurring?q=${encodeURIComponent(merchantName)}`;
}

/**
 * The current calendar month as inclusive ISO bounds.
 *
 * Every "this month" figure in the app sums the same window, so the drills
 * behind them must too — a KPI that says £1,240 and a ledger that shows a
 * different set of rows is the defect this whole convention is meant to
 * avoid. Local time, matching how the dashboard's month figures are built.
 */
export function thisMonthRange(now: Date = new Date()): { from: string; to: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const pad = (n: number) => String(n).padStart(2, "0");
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { from: `${y}-${pad(m + 1)}-01`, to: `${y}-${pad(m + 1)}-${pad(lastDay)}` };
}
