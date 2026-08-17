// F3 · news filter tests. The filter's contract: an item that
// cannot be tied to a held ticker OR a held currency does not
// appear. Every surviving item carries a connectedTo marker so the
// UI can render the required "why is this on your screen" caption.

import { describe, it, expect } from "vitest";
import { filterNewsForUser, type NewsItem } from "./market";

const now = new Date().toISOString();
function item(title: string): NewsItem {
  return { title, link: `https://example.test/${title.slice(0, 20)}`, publisher: "Test", publishedAt: now };
}

describe("filterNewsForUser — the core contract", () => {
  it("drops items that match neither holding nor currency", () => {
    const items = [item("Local council raises parking fees"), item("Cat rescued from tree")];
    const out = filterNewsForUser(items, { tickers: ["AAPL"], currencies: ["GBP"] });
    expect(out).toEqual([]);
  });

  it("keeps ticker matches and tags them", () => {
    const items = [item("AAPL beats earnings"), item("Local dog show winner")];
    const out = filterNewsForUser(items, { tickers: ["AAPL"], currencies: [] });
    expect(out).toHaveLength(1);
    expect(out[0]!.connectedTo).toEqual({ kind: "ticker", value: "AAPL", label: "AAPL" });
  });

  it("keeps currency matches and tags them (Ringgit → MYR)", () => {
    const items = [item("Ringgit slips as Malaysia holds rate")];
    const out = filterNewsForUser(items, { tickers: [], currencies: ["MYR"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.connectedTo).toEqual({ kind: "currency", value: "MYR", label: "MYR" });
  });

  it("prefers ticker over currency when both match", () => {
    // AAPL is a US company so a title mentioning both would be
    // tagged by ticker per the "ticker first" rule.
    const items = [item("AAPL surges as dollar strengthens")];
    const out = filterNewsForUser(items, { tickers: ["AAPL"], currencies: ["USD"] });
    expect(out[0]!.connectedTo.kind).toBe("ticker");
    expect(out[0]!.connectedTo.value).toBe("AAPL");
  });

  it("empty holdings → empty result even if items look relevant", () => {
    const items = [item("AAPL beats earnings"), item("Ringgit slips")];
    const out = filterNewsForUser(items, { tickers: [], currencies: [] });
    expect(out).toEqual([]);
  });

  it("case-insensitive ticker match", () => {
    const items = [item("apple earnings top estimates")];
    // "APPLE" as a ticker won't match; but if user held it as
    // ticker "APPLE" the uppercased-title match would fire. This
    // test locks that behaviour.
    const out = filterNewsForUser(items, { tickers: ["APPLE"], currencies: [] });
    expect(out).toHaveLength(1);
  });

  it("Sterling and Pound match GBP", () => {
    const a = filterNewsForUser([item("Sterling weakens against dollar")], { tickers: [], currencies: ["GBP"] });
    const b = filterNewsForUser([item("British pound rallies")], { tickers: [], currencies: ["GBP"] });
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it("Yen matches JPY", () => {
    const out = filterNewsForUser([item("Yen at 30-year low")], { tickers: [], currencies: ["JPY"] });
    expect(out).toHaveLength(1);
  });
});

describe("filterNewsForUser — survival rate on a synthetic generic feed", () => {
  // Mimics what a generic finance RSS pull might look like — a mix
  // of individual-company news, macro/currency news, and unrelated
  // items. Used to sanity-check the survival ratio for a
  // representative user before running the same rule against a
  // real Yahoo feed (see scripts/news-survival-check.ts).
  const genericFeed: NewsItem[] = [
    item("AAPL announces new iPhone"),
    item("TSLA falls on split rumours"),
    item("Tesla profit surprises analysts"), // note: "Tesla" alone won't match TSLA (bare-ticker filter)
    item("Ringgit slips as Malaysia holds rate"),
    item("Sterling holds firm ahead of BoE decision"),
    item("Yen at 30-year low"),
    item("Nikkei rallies on AI optimism"),
    item("Local council raises parking fees"),
    item("Cat rescued from tree"),
    item("Weather warning for weekend"),
    item("New restaurant opens downtown"),
  ];

  it("user with typical UK / US holdings sees only anchor-tied items", () => {
    const out = filterNewsForUser(genericFeed, {
      tickers: ["AAPL", "TSLA"],
      currencies: ["GBP", "USD"],
    });
    // AAPL matches on ticker. TSLA matches on ticker. "Tesla
    // profit …" does NOT — the filter locks the ticker symbol
    // ("TSLA"), not a company name. Sterling → GBP. USD doesn't
    // match anything in this feed. Yen, Ringgit, and the unrelated
    // headlines drop.
    const titles = out.map((o) => o.title);
    expect(titles).toContain("AAPL announces new iPhone");
    expect(titles).toContain("TSLA falls on split rumours");
    expect(titles).toContain("Sterling holds firm ahead of BoE decision");
    expect(titles).not.toContain("Tesla profit surprises analysts");
    expect(titles).not.toContain("Local council raises parking fees");
    expect(out.length).toBeGreaterThanOrEqual(3);
    expect(out.length).toBeLessThan(genericFeed.length); // some drop
  });

  it("user with only MYR sees only Malaysia items", () => {
    const out = filterNewsForUser(genericFeed, { tickers: [], currencies: ["MYR"] });
    expect(out).toHaveLength(1);
    expect(out[0]!.title).toBe("Ringgit slips as Malaysia holds rate");
  });

  it("user with no holdings sees nothing at all", () => {
    const out = filterNewsForUser(genericFeed, { tickers: [], currencies: [] });
    expect(out).toEqual([]);
  });
});
