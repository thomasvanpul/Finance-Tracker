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
