// Ticker lists, label maps, and fallback mock quotes for the Markets tab.
// Pure data, extracted from pages/investments.tsx. No behaviour change.

export const POPULAR_TICKERS = "AAPL,MSFT,NVDA,GOOGL,META,AMZN,TSLA,AVGO,ORCL,NFLX,AMD,JPM,V,UNH,WMT";
export const INDEX_TICKERS = "SPY,QQQ,DIA,IWM,VEA,EEM";
export const CRYPTO_MARKET_TICKERS = "BTC-USD,ETH-USD,SOL-USD,BNB-USD,XRP-USD,DOGE-USD";
export const FOREX_TICKERS_STR = "GBPUSD=X,EURUSD=X,USDJPY=X,AUDUSD=X,USDCAD=X,GBPEUR=X";
export const COMMODITY_TICKERS_STR = "GC=F,SI=F,CL=F,NG=F";
export const GLOBAL_INDEX_TICKERS = "^N225,^HSI,^GDAXI,^FCHI,^AXJO";
export const SECTOR_TICKERS = "XLK,XLV,XLF,XLE,XLY,XLP,XLRE,XLU,XLI,XLB,XLC";
export const OVERVIEW_TICKERS = [
  POPULAR_TICKERS, INDEX_TICKERS, SECTOR_TICKERS, CRYPTO_MARKET_TICKERS,
  FOREX_TICKERS_STR, COMMODITY_TICKERS_STR, GLOBAL_INDEX_TICKERS,
].join(",");

export const INDEX_LABELS: Record<string, string> = {
  SPY: "S&P 500", QQQ: "NASDAQ 100", DIA: "Dow Jones", IWM: "Russell 2000",
  VEA: "Developed Mkts", EEM: "Emerging Mkts",
};
export const SECTOR_LABELS: Record<string, string> = {
  XLK: "Technology", XLV: "Health Care", XLF: "Financials", XLE: "Energy",
  XLY: "Cons. Discret.", XLP: "Cons. Staples", XLRE: "Real Estate",
  XLU: "Utilities", XLI: "Industrials", XLB: "Materials", XLC: "Communication",
};
export const POPULAR_NAMES: Record<string, string> = {
  AAPL: "Apple Inc.", MSFT: "Microsoft Corp.", NVDA: "NVIDIA Corp.", GOOGL: "Alphabet Inc.",
  META: "Meta Platforms", AMZN: "Amazon.com Inc.", TSLA: "Tesla Inc.", AVGO: "Broadcom Inc.",
  ORCL: "Oracle Corp.", NFLX: "Netflix Inc.", AMD: "Advanced Micro Devices", JPM: "JPMorgan Chase",
  V: "Visa Inc.", UNH: "UnitedHealth Group", WMT: "Walmart Inc.",
};
export const CRYPTO_NAMES: Record<string, string> = {
  "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum", "SOL-USD": "Solana",
  "BNB-USD": "BNB", "XRP-USD": "XRP", "DOGE-USD": "Dogecoin",
};
export const FOREX_NAMES: Record<string, string> = {
  "GBPUSD=X": "GBP / USD", "EURUSD=X": "EUR / USD", "USDJPY=X": "USD / JPY",
  "AUDUSD=X": "AUD / USD", "USDCAD=X": "USD / CAD", "GBPEUR=X": "GBP / EUR",
};
export const COMMODITY_NAMES: Record<string, string> = {
  "GC=F": "Gold ($/oz)", "SI=F": "Silver ($/oz)", "CL=F": "Crude Oil ($/bbl)", "NG=F": "Natural Gas ($/MMBtu)",
};
export const GLOBAL_INDEX_NAMES: Record<string, string> = {
  "^N225": "Nikkei 225", "^HSI": "Hang Seng", "^GDAXI": "DAX 40", "^FCHI": "CAC 40", "^AXJO": "ASX 200",
};

export const CHART_PERIODS = ["5s", "15s", "30s", "1min", "2min", "5min", "15min", "30min", "1h", "1d", "3d", "5d", "1w", "1m", "3m", "6m", "1y", "2y", "5y"];
export const INTRADAY_PERIODS_SET = new Set(["1min", "2min", "5min", "15min", "30min", "1h", "1d", "3d", "5d"]);
export const MULTIDAY_PERIODS_SET = new Set(["3d", "5d"]);
export const TICK_PERIODS_SET = new Set(["5s", "15s", "30s"]);
export const TICK_INTERVAL_MAP: Record<string, number> = { "5s": 5, "15s": 15, "30s": 30 };

// US equities: no exchange suffix (.L .HK .DE etc) and not a ^INDEX symbol
export const isUSTicker = (ticker: string) => !ticker.includes(".") && !ticker.startsWith("^");

// ── Fallback mock prices shown when live API data isn't available ─────────────
// Prices approximate as of mid-2026; changePercent simulates a typical trading day.
// The Markets tab supplements API responses with these when the API returns null
// changePercent (market closed, partial key) — see qMap builder in MarketsTab.
export const MOCK_QUOTES: Record<string, { price: number; changePercent: number; low52w?: number; high52w?: number }> = {
  SPY:  { price: 548.32, changePercent: 0.43, low52w: 482.7,  high52w: 565.1  },
  QQQ:  { price: 478.91, changePercent: 0.71, low52w: 408.3,  high52w: 498.4  },
  DIA:  { price: 404.17, changePercent: 0.18, low52w: 360.2,  high52w: 418.9  },
  IWM:  { price: 208.54, changePercent: -0.34, low52w: 176.2, high52w: 230.1  },
  VEA:  { price: 52.83,  changePercent: 0.12, low52w: 44.1,  high52w: 55.9   },
  EEM:  { price: 44.28,  changePercent: -0.21, low52w: 36.8, high52w: 47.3   },
  XLK:  { price: 231.14, changePercent: 0.88  },
  XLV:  { price: 144.62, changePercent: -0.15 },
  XLF:  { price: 48.39,  changePercent: 0.54  },
  XLE:  { price: 87.22,  changePercent: -0.72 },
  XLY:  { price: 196.55, changePercent: 0.31  },
  XLP:  { price: 78.44,  changePercent: 0.08  },
  XLRE: { price: 38.91,  changePercent: -0.19 },
  XLU:  { price: 70.13,  changePercent: 0.22  },
  XLI:  { price: 132.78, changePercent: 0.41  },
  XLB:  { price: 88.67,  changePercent: -0.09 },
  XLC:  { price: 95.24,  changePercent: 1.12  },
  AAPL: { price: 213.49, changePercent: 0.54  },
  MSFT: { price: 448.28, changePercent: 0.82  },
  NVDA: { price: 138.85, changePercent: 2.14  },
  GOOGL:{ price: 182.91, changePercent: 0.37  },
  META: { price: 591.24, changePercent: 1.03  },
  AMZN: { price: 204.67, changePercent: 0.61  },
  TSLA: { price: 247.38, changePercent: -1.42 },
  AVGO: { price: 191.55, changePercent: 0.78  },
  ORCL: { price: 164.22, changePercent: 0.45  },
  NFLX: { price: 732.10, changePercent: 0.94  },
  AMD:  { price: 168.43, changePercent: 1.67  },
  JPM:  { price: 248.91, changePercent: 0.29  },
  V:    { price: 292.17, changePercent: 0.21  },
  UNH:  { price: 298.44, changePercent: -0.63 },
  WMT:  { price: 91.28,  changePercent: 0.15  },
  "BTC-USD":  { price: 64433, changePercent: 1.82  },
  "ETH-USD":  { price: 3512,  changePercent: 2.11  },
  "SOL-USD":  { price: 178.4, changePercent: 3.24  },
  "BNB-USD":  { price: 614.8, changePercent: 0.87  },
  "XRP-USD":  { price: 0.632, changePercent: 1.43  },
  "DOGE-USD": { price: 0.148, changePercent: -1.21 },
  "GBPUSD=X": { price: 1.3302, changePercent: 0.09  },
  "EURUSD=X": { price: 1.0847, changePercent: -0.14 },
  "USDJPY=X": { price: 151.84, changePercent: 0.31  },
  "AUDUSD=X": { price: 0.6561, changePercent: -0.08 },
  "USDCAD=X": { price: 1.3681, changePercent: 0.12  },
  "GBPEUR=X": { price: 1.1871, changePercent: 0.22  },
  "GC=F": { price: 2341.8, changePercent: 0.48  },
  "SI=F": { price: 29.84,  changePercent: 0.73  },
  "CL=F": { price: 79.12,  changePercent: -1.14 },
  "NG=F": { price: 2.871,  changePercent: -0.92 },
  "^N225":  { price: 38821, changePercent: 0.53  },
  "^HSI":   { price: 18924, changePercent: -0.74 },
  "^GDAXI": { price: 18892, changePercent: 0.41  },
  "^FCHI":  { price: 7638,  changePercent: 0.28  },
  "^AXJO":  { price: 8041,  changePercent: 0.17  },
};

export const BULL_WORDS = /\b(surge|gain|rally|rise|beat|record|strong|buy|upgrade|outperform|growth|profit|soar|jump|boost|bull|bullish|optimist|recover|rebound)\b/i;
export const BEAR_WORDS = /\b(fall|drop|cut|decline|miss|disappoint|concern|sell|downgrade|underperform|risk|crash|fear|weak|loss|bear|bearish|pessimist|slump|plunge|warn)\b/i;

export function newsScore(title: string): "bullish" | "bearish" | "neutral" {
  const bulls = (title.match(BULL_WORDS) ?? []).length;
  const bears = (title.match(BEAR_WORDS) ?? []).length;
  if (bulls > bears) return "bullish";
  if (bears > bulls) return "bearish";
  return "neutral";
}

export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function fmtCap(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

export function fmtNum(v: number | null | undefined, suffix = ""): string {
  if (v == null) return "—";
  return `${v}${suffix}`;
}
