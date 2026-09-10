// The round trip: what the ledger writes to the URL must be what ledgerHref
// would have written for the same filters, or a drilled-in view and a
// hand-filtered one stop being the same view.

import { describe, it, expect } from "vitest";
import {
  ledgerSearch, ledgerLocation, ledgerSearchMatches, type LedgerFilterState,
  matchesLedgerFilters, readLedgerFilters, isUnfiltered, NO_LEDGER_FILTERS, type LedgerRow,
} from "./ledger-query";
import { ledgerHref, categoryTransactionsHref, accountTransactionsHref, merchantTransactionsHref, monthTransactionsHref } from "./entity-href";

const EMPTY: LedgerFilterState = { q: "", type: "all", category: "all", accountId: null, from: "", to: "" };
const state = (over: Partial<LedgerFilterState> = {}): LedgerFilterState => ({ ...EMPTY, ...over });

describe("ledgerSearch — only what is actually filtered", () => {
  it("says nothing when nothing is filtered", () => {
    expect(ledgerSearch(EMPTY)).toBe("");
    expect(ledgerLocation(EMPTY)).toBe("/transactions");
  });

  it("treats 'all' as unfiltered rather than as a value", () => {
    expect(ledgerSearch(state({ type: "all", category: "all" }))).toBe("");
  });

  it("drops a search that is only whitespace", () => {
    expect(ledgerSearch(state({ q: "   " }))).toBe("");
  });

  it("carries the six it owns", () => {
    const s = state({ q: "tesco", type: "expense", category: "Groceries", accountId: "105", from: "2026-09-01", to: "2026-09-30" });
    expect(ledgerSearch(s)).toBe("q=tesco&type=expense&category=Groceries&account=105&from=2026-09-01&to=2026-09-30");
  });

  it("encodes a search that would otherwise break the query string", () => {
    expect(ledgerSearch(state({ q: "M&S food" }))).toBe("q=M%26S+food");
    expect(new URLSearchParams(ledgerSearch(state({ q: "M&S food" }))).get("q")).toBe("M&S food");
  });
});

describe("ledgerSearch — agrees with the links that drill here", () => {
  it("matches a category drill", () => {
    expect(ledgerLocation(state({ category: "Groceries" }))).toBe(categoryTransactionsHref("Groceries"));
  });

  it("matches an account drill, which addresses the account by id", () => {
    expect(ledgerLocation(state({ accountId: "105" }))).toBe(accountTransactionsHref(105));
  });

  it("matches a month drill once key order is normalised", () => {
    // monthTransactionsHref emits from,to,type; this module emits a fixed
    // order. Same view, so the parsed pairs must agree even though the
    // strings do not.
    const href = monthTransactionsHref("2026-09", "expense");
    const s = state({ from: "2026-09-01", to: "2026-09-30", type: "expense" });
    expect(ledgerSearchMatches(href.split("?")[1] ?? "", s)).toBe(true);
  });

  it("matches a bare ledgerHref for the same filters", () => {
    expect(ledgerLocation(state({ q: "coffee", type: "expense" })))
      .toBe(ledgerHref({ q: "coffee", type: "expense" }));
  });
});

describe("ledgerSearchMatches — when not to rewrite the URL", () => {
  it("is true when the URL already says it, in any key order", () => {
    const s = state({ category: "Groceries", from: "2026-09-01" });
    expect(ledgerSearchMatches("from=2026-09-01&category=Groceries", s)).toBe(true);
  });

  it("ignores a parameter this page does not own", () => {
    // The whole point of comparing pairs rather than strings: stripping a
    // parameter someone else put there is not this page's business.
    expect(ledgerSearchMatches("utm_source=email", EMPTY)).toBe(true);
    expect(ledgerSearchMatches("category=Groceries&persona=market", state({ category: "Groceries" }))).toBe(true);
  });

  it("is false when one of the six genuinely disagrees", () => {
    expect(ledgerSearchMatches("category=Transport", state({ category: "Groceries" }))).toBe(false);
    expect(ledgerSearchMatches("", state({ type: "expense" }))).toBe(false);
    expect(ledgerSearchMatches("type=expense", EMPTY)).toBe(false);
  });

  it("is false when the URL still carries an account the filter has cleared", () => {
    // The regression this guards: clearing the filter left ?account=105 in
    // the URL, so a refresh restored a filter the user had just removed.
    expect(ledgerSearchMatches("account=105", EMPTY)).toBe(false);
  });
});

const rows: LedgerRow[] = [
  { date: "2026-09-03", type: "expense", category: "Groceries", accountName: "Monzo Current", description: "TESCO STORES 3456" },
  { date: "2026-09-01", type: "expense", category: "Transport", accountName: "Monzo Current", description: "UBER *TRIP" },
  { date: "2026-08-10", type: "income",  category: "Salary",    accountName: "Barclays",      description: "UROP STIPEND" },
];
const accounts = [{ id: 132, name: "Monzo Current" }, { id: 140, name: "Barclays" }];

// The URL half and the predicate half have to agree, or a drilled-in view
// stops matching the figure that was pressed to reach it. Each case starts
// from the href builder rather than from a hand-written query string.
function applyHref(href: string): LedgerRow[] {
  const search = href.split("?")[1] ?? "";
  const f = readLedgerFilters(search, accounts);
  return rows.filter((r) => matchesLedgerFilters(r, f));
}

describe("the six URL-spelled ledger filters", () => {
  it("categoryTransactionsHref selects that category", () => {
    expect(applyHref(categoryTransactionsHref("Groceries")).map(r => r.description)).toEqual(["TESCO STORES 3456"]);
  });

  it("categoryTransactionsHref with a range also bounds the dates", () => {
    expect(applyHref(categoryTransactionsHref("Salary", { from: "2026-09-01", to: "2026-09-30" }))).toEqual([]);
    expect(applyHref(categoryTransactionsHref("Salary", { from: "2026-08-01", to: "2026-08-31" })).length).toBe(1);
  });

  it("accountTransactionsHref carries an id and matches on the name", () => {
    expect(applyHref(accountTransactionsHref(132)).length).toBe(2);
    expect(applyHref(accountTransactionsHref(140)).map(r => r.accountName)).toEqual(["Barclays"]);
  });

  it("an account id that matches nothing shows the ledger, not an empty screen", () => {
    // A stale link must not read as "you have no transactions".
    expect(applyHref(accountTransactionsHref(99999)).length).toBe(rows.length);
  });

  it("merchantTransactionsHref searches description, category and account", () => {
    expect(applyHref(merchantTransactionsHref("UBER")).length).toBe(1);
    expect(applyHref(merchantTransactionsHref("monzo")).length).toBe(2);   // account name, case-insensitive
    expect(applyHref(merchantTransactionsHref("Groceries")).length).toBe(1); // category
  });

  it("monthTransactionsHref bounds inclusively at both ends", () => {
    expect(applyHref(monthTransactionsHref("2026-09")).map(r => r.date)).toEqual(["2026-09-03", "2026-09-01"]);
  });

  it("ledgerHref({type}) selects that type", () => {
    expect(applyHref(ledgerHref({ type: "income" })).map(r => r.description)).toEqual(["UROP STIPEND"]);
  });

  it("filters compose", () => {
    expect(applyHref(ledgerHref({ account: 132, type: "expense", category: "Transport" })).length).toBe(1);
  });

  it("the bare ledger URL filters nothing", () => {
    expect(applyHref("/transactions").length).toBe(rows.length);
    expect(isUnfiltered(readLedgerFilters("", accounts))).toBe(true);
  });

  it("readLedgerFilters ignores a type the URL is not allowed to spell", () => {
    // Anything outside the three real types is "all", not a filter that
    // silently empties the screen.
    expect(readLedgerFilters("type=banana", accounts).type).toBe("all");
  });

  it("round-trips through ledgerSearch unchanged", () => {
    const f = readLedgerFilters("category=Groceries&type=expense&from=2026-09-01", accounts);
    const back = readLedgerFilters(ledgerSearch({ ...f, accountId: null }), accounts);
    expect(back).toEqual(f);
  });

  it("NO_LEDGER_FILTERS is unfiltered", () => {
    expect(isUnfiltered(NO_LEDGER_FILTERS)).toBe(true);
    expect(rows.every((r) => matchesLedgerFilters(r, NO_LEDGER_FILTERS))).toBe(true);
  });
});
