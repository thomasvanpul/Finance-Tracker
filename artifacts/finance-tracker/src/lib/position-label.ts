// Labels for a held position: the monogram glyph, the quantity line and the
// quantity's name on the detail sheet.
//
// Crypto is told apart by symbol shape alone — the position rows carry no
// asset class. The rule mirrors `classifyTicker` in
// artifacts/api-server/src/lib/market-classifier.ts: a Yahoo crypto pair ends
// in a quote-currency suffix. Change both together.
const CRYPTO_PAIR = /-(USD|USDT|EUR|GBP|BTC|ETH)$/;

const GLYPH_MAX = 4;

export function isCryptoTicker(ticker: string): boolean {
  return CRYPTO_PAIR.test(ticker.trim().toUpperCase());
}

// The symbol's root: the base asset of a crypto pair, the ticker before an
// exchange suffix (VOD.L → VOD), with Yahoo's ^ / =X / =F notation stripped.
function tickerRoot(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  const root = t.replace(/^\^/, "").split(/[-.=]/)[0];
  return root.replace(/[^A-Z0-9]/g, "");
}

// Monogram text. Cut from the root, never from the raw symbol, so it cannot
// end on the separator — "BTC-USD".slice(0, 4) rendered "BTC-".
export function positionGlyph(ticker: string): string {
  return tickerRoot(ticker).slice(0, GLYPH_MAX);
}

// "0.5 BTC" for crypto, "12 shares" for everything else.
export function positionQuantity(ticker: string, quantity: number): string {
  if (isCryptoTicker(ticker)) return `${quantity} ${tickerRoot(ticker)}`;
  return `${quantity} share${quantity === 1 ? "" : "s"}`;
}

export function positionQuantityLabel(ticker: string): "QUANTITY" | "SHARES" {
  return isCryptoTicker(ticker) ? "QUANTITY" : "SHARES";
}
