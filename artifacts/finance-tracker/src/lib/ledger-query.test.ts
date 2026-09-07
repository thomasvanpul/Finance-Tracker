// The round trip: what the ledger writes to the URL must be what ledgerHref
// would have written for the same filters, or a drilled-in view and a
// hand-filtered one stop being the same view.

import { describe, it, expect } from "vitest";
import { ledgerSearch, ledgerLocation, ledgerSearchMatches, type LedgerFilterState } from "./ledger-query";
import { ledgerHref, categoryTransactionsHref, accountTransactionsHref, monthTransactionsHref } from "./entity-href";

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
