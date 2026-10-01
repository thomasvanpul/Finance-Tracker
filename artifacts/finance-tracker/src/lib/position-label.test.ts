import { describe, it, expect } from "vitest";
import { isCryptoTicker, positionGlyph, positionQuantity, positionQuantityLabel } from "./position-label";

describe("isCryptoTicker", () => {
  it("matches the quote-currency suffixes the server classifier treats as crypto", () => {
    for (const t of ["BTC-USD", "eth-usd", "SOL-USDT", "XRP-EUR", "ADA-GBP", "LINK-BTC", "DOT-ETH"]) {
      expect(isCryptoTicker(t)).toBe(true);
    }
  });

  it("does not match equities, class shares, forex or futures", () => {
    for (const t of ["AAPL", "BRK-B", "VOD.L", "GBPUSD=X", "GC=F", "^GSPC"]) {
      expect(isCryptoTicker(t)).toBe(false);
    }
  });
});

describe("positionGlyph", () => {
  it("never renders the pair separator — BTC-USD is BTC, not BTC-", () => {
    expect(positionGlyph("BTC-USD")).toBe("BTC");
    expect(positionGlyph("DOGE-USD")).toBe("DOGE");
  });

  it("drops an exchange suffix rather than cutting into it", () => {
    expect(positionGlyph("VOD.L")).toBe("VOD");
    expect(positionGlyph("MSFT.LON")).toBe("MSFT");
  });

  it("keeps a plain ticker, upper-cased, at most four characters", () => {
    expect(positionGlyph("aapl")).toBe("AAPL");
    expect(positionGlyph("GOOGL")).toBe("GOOG");
  });

  it("never ends on punctuation", () => {
    for (const t of ["BTC-USD", "BRK-B", "VOD.L", "GBPUSD=X", "^GSPC", "A.B.C"]) {
      expect(positionGlyph(t)).toMatch(/^[A-Z0-9]+$/);
    }
  });
});

describe("positionQuantity", () => {
  it("counts crypto in the base asset, not in shares", () => {
    expect(positionQuantity("BTC-USD", 0.5)).toBe("0.5 BTC");
    expect(positionQuantity("BTC-USD", 1)).toBe("1 BTC");
  });

  it("counts equities in shares, singular at one", () => {
    expect(positionQuantity("AAPL", 1)).toBe("1 share");
    expect(positionQuantity("AAPL", 12)).toBe("12 shares");
  });
});

describe("positionQuantityLabel", () => {
  it("names the detail-row quantity by what is held", () => {
    expect(positionQuantityLabel("BTC-USD")).toBe("QUANTITY");
    expect(positionQuantityLabel("AAPL")).toBe("SHARES");
  });
});
