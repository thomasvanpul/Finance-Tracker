// The other half of `ledgerHref`.
//
// lib/entity-href.ts builds a URL from a set of ledger filters, and
// pages/transactions.tsx reads that URL into its filter state. What was
// missing is the return leg: the page never wrote its state back, so the
// moment you touched a select the URL and the screen disagreed. A filtered
// ledger could be arrived at but not addressed — refresh it, bookmark it,
// send it to yourself, and you got the unfiltered list.
//
// That is not a cosmetic gap. The §14 drills added in 5a1099a exist to take
// you from a figure to the rows behind it; without this, the address of those
// rows survives exactly until the next click.
//
// Kept pure so the round trip can be pinned by tests: what the page writes
// must be what `ledgerHref` would have written for the same filters, or the
// two halves drift and a drilled-in view stops matching a hand-filtered one.

/** The six filters that have a URL spelling. Deliberately not all of them. */
export interface LedgerFilterState {
  /** Free-text search across description, category and account. */
  q: string;
  /** "all" means unfiltered — the value the selects hold, not a category. */
  type: string;
  category: string;
  /**
   * An account **id**, not a name. `account` means an id everywhere in the
   * app (see entityHref); the page resolves it to the name it filters rows
   * by, so renaming an account never strands a link.
   */
  accountId: string | null;
  /** Inclusive ISO bounds, "" when unset. */
  from: string;
  to: string;
}

// Fixed order, so two states that mean the same thing serialise to the same
// string and the sync effect can compare with ===. A drill URL written by
// ledgerHref may order its keys differently; that costs exactly one
// canonicalising replace on arrival and nothing after.
const KEYS = ["q", "type", "category", "account", "from", "to"] as const;

/**
 * Serialise filter state to a canonical query string, omitting anything at
 * its default. Returns "" when nothing is filtered, which is the URL for the
 * whole ledger — an empty `?` in the address bar is noise, not information.
 *
 * Amount range, tag, sort order and the grouping toggles are **not** here.
 * They have no spelling in `ledgerHref`, so putting them in the URL would
 * write a parameter nothing reads back, and a one-way parameter is worse
 * than none: the link looks like it carries the view and does not.
 */
export function ledgerSearch(state: LedgerFilterState): string {
  const values: Record<(typeof KEYS)[number], string> = {
    q: state.q.trim(),
    type: state.type === "all" ? "" : state.type,
    category: state.category === "all" ? "" : state.category,
    account: state.accountId ?? "",
    from: state.from,
    to: state.to,
  };
  const params = new URLSearchParams();
  for (const key of KEYS) {
    const value = values[key];
    if (value !== "") params.set(key, value);
  }
  return params.toString();
}

/**
 * The path to navigate to for a given filter state — the same shape
 * `ledgerHref` returns, so the page's own writes and a drill's links are
 * indistinguishable once canonicalised.
 */
export function ledgerLocation(state: LedgerFilterState): string {
  const search = ledgerSearch(state);
  return search === "" ? "/transactions" : `/transactions?${search}`;
}

/**
 * Whether the URL already says what the state says.
 *
 * Compared as parsed pairs rather than as raw strings: a hand-typed URL may
 * order its keys differently or carry parameters this page does not own
 * (a persona flag, a tracking tag), and neither is a reason to rewrite it.
 * Only a genuine disagreement about one of the six is.
 */
export function ledgerSearchMatches(currentSearch: string, state: LedgerFilterState): boolean {
  const want = new URLSearchParams(ledgerSearch(state));
  const have = new URLSearchParams(currentSearch);
  return KEYS.every((key) => (have.get(key) ?? "") === (want.get(key) ?? ""));
}

// ── The predicate ───────────────────────────────────────────────────────────
// `ledgerHref` spells six filters into a URL. Until now, only
// pages/transactions.tsx could read them back, and it did so with an inline
// predicate — so the phone's SPENDING tab, which the phone shell routes
// /transactions to, dropped every one of them. Pressing a category on the
// phone navigated to the same unfiltered list it was already showing.
//
// One predicate, so a drilled-in view on the phone and one on desktop cannot
// mean different things by the same URL. Amount range, tag and sort stay at
// the desktop call site: they have no spelling in `ledgerHref`, so they are
// not part of what a URL can claim.

/** The subset of a transaction the six URL-spelled filters read. */
export interface LedgerRow {
  date: string;
  type?: string | null;
  category?: string | null;
  accountName?: string | null;
  description?: string | null;
}

/**
 * The six filters, in the form the predicate matches on.
 *
 * `account` is a NAME here, not an id. The URL carries an id (see
 * `entityHref`, where `account` means an id everywhere); resolving it to a
 * name is the caller's job, because only the caller has the account list.
 * A name that is later edited therefore never strands a link.
 *
 * "all" and "" are the unfiltered values, matching what the desktop selects
 * hold, so a state object round-trips through `ledgerSearch` unchanged.
 */
export interface LedgerRowFilters {
  q: string;
  type: string;
  category: string;
  account: string;
  from: string;
  to: string;
}

export const NO_LEDGER_FILTERS: LedgerRowFilters = {
  q: "", type: "all", category: "all", account: "all", from: "", to: "",
};

export function matchesLedgerFilters(tx: LedgerRow, f: LedgerRowFilters): boolean {
  if (f.type !== "all" && tx.type !== f.type) return false;
  if (f.category !== "all" && tx.category !== f.category) return false;
  if (f.account !== "all" && tx.accountName !== f.account) return false;
  if (f.from && tx.date < f.from) return false;
  if (f.to && tx.date > f.to) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    const desc = (tx.description ?? "").toLowerCase();
    const cat = (tx.category ?? "").toLowerCase();
    const acct = (tx.accountName ?? "").toLowerCase();
    if (!desc.includes(q) && !cat.includes(q) && !acct.includes(q)) return false;
  }
  return true;
}

/** True when nothing is filtered — the URL for the whole ledger. */
export function isUnfiltered(f: LedgerRowFilters): boolean {
  return f.q === "" && f.type === "all" && f.category === "all"
    && f.account === "all" && f.from === "" && f.to === "";
}

/**
 * Read the six filters out of a query string.
 *
 * `account` arrives as an id and is resolved through `accounts`. An id that
 * matches no account resolves to "all" rather than to a name that filters
 * everything out: a stale link should show the ledger, not an empty screen
 * that looks like the user has no transactions.
 */
export function readLedgerFilters(
  search: string | URLSearchParams,
  accounts: readonly { id: number | string; name: string }[] | undefined,
): LedgerRowFilters {
  const p = typeof search === "string" ? new URLSearchParams(search) : search;
  const accountParam = p.get("account");
  const matched = accountParam == null
    ? undefined
    : accounts?.find((a) => String(a.id) === accountParam);
  const type = p.get("type");
  return {
    q: p.get("q") ?? "",
    type: type === "income" || type === "expense" || type === "transfer" ? type : "all",
    category: p.get("category") ?? "all",
    account: matched?.name ?? "all",
    from: p.get("from") ?? "",
    to: p.get("to") ?? "",
  };
}
