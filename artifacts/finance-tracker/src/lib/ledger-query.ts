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
