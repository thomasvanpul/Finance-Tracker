// Shared types, constants, and pure helpers lifted from investments.tsx.
// The parent file is still large; this is the safe first step of the
// E4 refactor — no behaviour change, only physical relocation.

export type InputMode = "perShare" | "totalCost";

export type AssetClass = "ETF" | "Stock" | "Bond" | "Crypto" | "Cash" | "Real Estate" | "Other";
export const ASSET_CLASSES: AssetClass[] = ["ETF", "Stock", "Bond", "Crypto", "Cash", "Real Estate", "Other"];

export interface InvForm {
  ticker: string;
  name: string;
  buyDate: string;
  inputMode: InputMode;
  shares: string;
  costPricePerShare: string;
  totalShares: string;
  totalCost: string;
  fees: string;
  nativeCurrency: string;
  assetClass: AssetClass | "";
}

export type Watchlist = { id: string; name: string; tickers: string[] };

export type AlertMetric = "price" | "pct_change" | "pe";

export interface PriceAlert {
  id: string;
  ticker: string;
  metric: AlertMetric;
  targetPrice: number;
  direction: "above" | "below";
  triggered: boolean;
  createdAt: string;
}

export interface QuoteData {
  ticker: string;
  price: number;
  currency: string;
  changePercent?: number;
  pe?: number | null;
  forwardPe?: number | null;
  eps?: number | null;
  low52w?: number | null;
  high52w?: number | null;
  marketCap?: number | null;
  beta?: number | null;
  dividendYield?: number | null;
  analystTargetPrice?: number | null;
  dayHigh?: number | null;
  dayLow?: number | null;
  volume?: number | null;
  previousClose?: number | null;
  nextEarningsDate?: string | null;
  marketState?: string | null;
  postMarketPrice?: number | null;
  postMarketChangePercent?: number | null;
  preMarketPrice?: number | null;
  preMarketChangePercent?: number | null;
}

export type TabId = "portfolio" | "orders" | "derivatives" | "markets" | "rebalance";

export interface ExchangeInfo { label: string; currency: string; }

export interface NewsItem {
  title: string;
  link: string;
  publisher: string;
  publishedAt: string;
}

export const LS_CLASSES_KEY = "ft-inv-classes";
export const LS_WATCHLISTS_KEY = "ft-watchlists";
export const LS_REBALANCE_KEY = "ft-rebalance-targets";
export const LS_ALERTS_KEY = "ft-price-alerts";

export const CRYPTO_TICKERS = new Set([
  "BTC","ETH","BNB","XRP","SOL","ADA","DOGE","DOT","AVAX","MATIC","LINK","UNI","ATOM",
  "LTC","BCH","XLM","ALGO","VET","FIL","THETA","TRX","EOS","XTZ","NEO","DASH","ZEC",
  "SHIB","PEPE","FLOKI","WIF","BONK","MEME",
]);

export const ETF_TICKERS = new Set([
  "VOO","VTI","SPY","QQQ","IVV","VEA","VXUS","BND","VNQ","GLD","SLV","IAU","TLT",
  "LQD","HYG","AGG","VIG","SCHD","JEPI","JEPQ","VYM","DGRO","ITOT","IEFA","IEMG",
  "EFA","EEM","VWO","RSP","ARKK","ARKG","ARKW","ARKF","XLK","XLV","XLF","XLE",
  "SMH","SOXX","NVDL","TQQQ","SQQQ","SH","VGSH","VGIT","VGLT","BSV","BKAG",
  "VUSA","VWRL","VWRP","CSPX","SWRD","IWDA","EIMI","VDEV","VAPX","ISF","CSP1",
  "ACWI","URTH","IOO","MOAT","DIVO","NOBL","VT","BNDW",
]);

export const BOND_ETF_TICKERS = new Set(["BND","AGG","TLT","LQD","HYG","MUB","SHY","IEF","BSV","BKAG","VGSH","VGIT","VGLT"]);

export const EXCHANGE_SUFFIXES: Record<string, ExchangeInfo> = {
  ".L":  { label: "LSE",        currency: "GBP" },
  ".TO": { label: "TSX",        currency: "CAD" },
  ".AX": { label: "ASX",        currency: "AUD" },
  ".HK": { label: "HKEX",       currency: "HKD" },
  ".DE": { label: "Xetra",      currency: "EUR" },
  ".PA": { label: "Euronext Paris", currency: "EUR" },
  ".AM": { label: "Euronext Amsterdam", currency: "EUR" },
  ".BR": { label: "Euronext Brussels", currency: "EUR" },
  ".LS": { label: "Euronext Lisbon", currency: "EUR" },
  ".MI": { label: "Borsa Italiana", currency: "EUR" },
  ".MC": { label: "BME Spain",  currency: "EUR" },
  ".SS": { label: "Shanghai",   currency: "CNY" },
  ".SZ": { label: "Shenzhen",   currency: "CNY" },
  ".NS": { label: "NSE India",  currency: "INR" },
  ".BO": { label: "BSE India",  currency: "INR" },
  ".T":  { label: "Tokyo",      currency: "JPY" },
  ".SW": { label: "SIX Swiss",  currency: "CHF" },
  ".ST": { label: "Stockholm",  currency: "SEK" },
  ".NZ": { label: "NZX",        currency: "NZD" },
  ".SG": { label: "SGX",        currency: "SGD" },
  ".JO": { label: "JSE",        currency: "ZAR" },
  ".MX": { label: "BMV Mexico", currency: "MXN" },
  ".SR": { label: "Tadawul",    currency: "SAR" },
};

export function detectExchange(ticker: string): (ExchangeInfo & { suffix: string }) | null {
  for (const [suffix, info] of Object.entries(EXCHANGE_SUFFIXES)) {
    if (ticker.toUpperCase().endsWith(suffix.toUpperCase())) return { ...info, suffix };
  }
  return null;
}

export function detectAssetClass(ticker: string): AssetClass {
  const t = ticker.toUpperCase().split(".")[0];
  if (CRYPTO_TICKERS.has(t)) return "Crypto";
  if (BOND_ETF_TICKERS.has(t)) return "Bond";
  if (ETF_TICKERS.has(t)) return "ETF";
  if (/^[A-Z]{2,5}\d+$/.test(t)) return "Bond";
  return "Stock";
}

export function makeEmptyInvForm(): InvForm {
  return {
    ticker: "", name: "", buyDate: new Date().toISOString().slice(0, 10), inputMode: "perShare",
    shares: "", costPricePerShare: "", totalShares: "", totalCost: "",
    fees: "", nativeCurrency: "USD", assetClass: "",
  };
}

export const CHART_COLORS = ["var(--ft-blue)", "var(--ft-green)", "var(--ft-amber)", "var(--ft-cyan)", "#79C0FF", "#56D364", "#FF7B72", "#D2A8FF", "#E3B341", "#FF6E40"];

export const CLASS_COLORS: Record<AssetClass, string> = {
  ETF: "var(--ft-blue)", Stock: "var(--ft-green)", Bond: "var(--ft-amber)", Crypto: "var(--ft-cyan)",
  Cash: "#E3B341", "Real Estate": "#79C0FF", Other: "var(--ft-dim)",
};

export const TABS: { id: TabId; label: string; color: string }[] = [
  { id: "portfolio", label: "PORTFOLIO", color: "var(--ft-blue)" },
  { id: "markets", label: "MARKETS", color: "var(--ft-green)" },
  { id: "orders", label: "ORDERS", color: "var(--ft-amber)" },
  { id: "derivatives", label: "DERIVATIVES", color: "var(--ft-cyan)" },
  { id: "rebalance", label: "REBALANCE", color: "var(--ft-accent)" },
];

export function readAlerts(): PriceAlert[] {
  try { const r = localStorage.getItem(LS_ALERTS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
export function writeAlerts(alerts: PriceAlert[]): void {
  try { localStorage.setItem(LS_ALERTS_KEY, JSON.stringify(alerts)); } catch { /* noop */ }
}
export function readClassMap(): Record<number, AssetClass> {
  try { const r = localStorage.getItem(LS_CLASSES_KEY); return r ? JSON.parse(r) : {}; } catch { return {}; }
}
export function writeClassMap(m: Record<number, AssetClass>): void {
  try { localStorage.setItem(LS_CLASSES_KEY, JSON.stringify(m)); } catch { /* noop */ }
}
export function readWatchlists(): Watchlist[] {
  try { const r = localStorage.getItem(LS_WATCHLISTS_KEY); return r ? JSON.parse(r) : []; } catch { return []; }
}
export function writeWatchlists(wls: Watchlist[]): void {
  try { localStorage.setItem(LS_WATCHLISTS_KEY, JSON.stringify(wls)); } catch { /* noop */ }
}
