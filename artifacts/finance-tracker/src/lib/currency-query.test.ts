// What the palette accepts as a conversion, and — more importantly — what it
// refuses. A parser that fires on ordinary search text turns every query into
// a currency answer.

import { describe, it, expect } from "vitest";
import {
  parseCurrencyQuery,
  convertVia,
  formatConverted,
  formatUnitRate,
} from "./currency-query";

// The three the seed user actually holds, plus two the API quotes.
const KNOWN = new Set(["GBP", "EUR", "MYR", "USD", "JPY"]);
const parse = (s: string) => parseCurrencyQuery(s, KNOWN);

describe("parseCurrencyQuery — what a person types", () => {
  it("reads amount, from and to", () => {
    expect(parse("1000 gbp to myr")).toEqual({ amount: 1000, from: "GBP", to: "MYR" });
  });

  it("does not need the joining word", () => {
    expect(parse("1000 gbp myr")).toEqual({ amount: 1000, from: "GBP", to: "MYR" });
  });

  it("accepts the amount glued to the code", () => {
    expect(parse("1000gbp myr")).toEqual({ amount: 1000, from: "GBP", to: "MYR" });
  });

  it("accepts 'in' and '>' as well as 'to'", () => {
    expect(parse("50 eur in gbp")).toEqual({ amount: 50, from: "EUR", to: "GBP" });
    expect(parse("50 eur > gbp")).toEqual({ amount: 50, from: "EUR", to: "GBP" });
  });

  it("accepts a leading 'convert', which is what you type when hunting for the feature", () => {
    expect(parse("convert 20 usd to gbp")).toEqual({ amount: 20, from: "USD", to: "GBP" });
  });

  it("treats a bare pair as a rate lookup — amount 1", () => {
    expect(parse("gbp to myr")).toEqual({ amount: 1, from: "GBP", to: "MYR" });
  });

  it("takes a decimal and a pasted thousands separator", () => {
    expect(parse("1,250.75 gbp to eur")).toEqual({ amount: 1250.75, from: "GBP", to: "EUR" });
  });

  it("is case-insensitive and tolerates sloppy spacing", () => {
    expect(parse("  100   MyR   To   gbp ")).toEqual({ amount: 100, from: "MYR", to: "GBP" });
  });
});

describe("parseCurrencyQuery — what it must refuse", () => {
  it("says nothing to ordinary search text", () => {
    for (const q of ["tesco", "groceries", "add transaction", "net worth", "settings"]) {
      expect(parse(q)).toBeNull();
    }
  });

  it("does not fire on two ordinary three-letter words", () => {
    // The reason codes are gated against the known set rather than shape alone.
    expect(parse("new car")).toBeNull();
    expect(parse("pay rent")).toBeNull();
  });

  it("refuses a code the API does not quote, rather than answering 'Unknown: XXX'", () => {
    expect(parse("100 gbp to zzz")).toBeNull();
    expect(parse("100 zzz to gbp")).toBeNull();
  });

  it("refuses a conversion to itself", () => {
    expect(parse("100 gbp to gbp")).toBeNull();
  });

  it("refuses a four-letter code, so longer words cannot masquerade as one", () => {
    expect(parse("100 gbpx to myr")).toBeNull();
  });

  it("refuses trailing text after the target code", () => {
    expect(parse("100 gbp to myr please")).toBeNull();
  });

  it("says nothing to an empty or whitespace query", () => {
    expect(parse("")).toBeNull();
    expect(parse("   ")).toBeNull();
  });
});

describe("convertVia — through the pivot", () => {
  // Units per GBP, the shape /api/fx/rates returns. GBP is absent by design.
  const RATES = { MYR: 5.4759, EUR: 1.1638, USD: 1.3538 };

  it("converts from the pivot", () => {
    expect(convertVia(1000, "GBP", "MYR", RATES)).toBeCloseTo(5475.9, 4);
  });

  it("converts to the pivot", () => {
    expect(convertVia(5475.9, "MYR", "GBP", RATES)).toBeCloseTo(1000, 6);
  });

  it("converts between two non-pivot currencies", () => {
    // 100 EUR → GBP → USD
    expect(convertVia(100, "EUR", "USD", RATES)).toBeCloseTo((100 / 1.1638) * 1.3538, 6);
  });

  it("round-trips", () => {
    const there = convertVia(250, "GBP", "EUR", RATES)!;
    expect(convertVia(there, "EUR", "GBP", RATES)).toBeCloseTo(250, 6);
  });

  it("returns null for an unpriced leg rather than treating the rate as 1", () => {
    // The whole point: a rate the API did not supply must not become a figure.
    expect(convertVia(100, "GBP", "ZZZ", RATES)).toBeNull();
    expect(convertVia(100, "ZZZ", "GBP", RATES)).toBeNull();
  });

  it("returns null on a zero or non-finite rate rather than dividing by it", () => {
    expect(convertVia(100, "BAD", "GBP", { ...RATES, BAD: 0 })).toBeNull();
    expect(convertVia(100, "BAD", "GBP", { ...RATES, BAD: Number.NaN })).toBeNull();
  });
});

describe("formatting", () => {
  it("prints money at 2dp", () => {
    expect(formatConverted(5475.9)).toBe("5,475.90");
  });

  it("prints a sub-unit figure at 4dp, where 2dp would round a real difference away", () => {
    expect(formatConverted(0.1826)).toBe("0.1826");
  });

  it("quotes the unit rate the way FxRateCell does", () => {
    expect(formatUnitRate("GBP", "MYR", 5.4759)).toBe("1 GBP = 5.4759 MYR");
  });

  it("drops to 2dp on a rate above 100, matching the app's precision rule", () => {
    expect(formatUnitRate("GBP", "JPY", 208.9812)).toBe("1 GBP = 208.98 JPY");
  });
});
