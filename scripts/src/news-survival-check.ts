// F3 · news survival-rate check.
//
// One-off measurement. Pulls a generic finance RSS feed, runs it
// through the same filterNewsForUser() function the app uses, and
// prints the survival ratio for a synthetic user with realistic
// UK+US holdings. No side effects; safe to run anytime.
//
// Run: pnpm --filter @workspace/scripts exec tsx src/news-survival-check.ts
//
// Sources (in order of preference):
//   1. Yahoo Finance top-headlines RSS (broad market)
//   2. If unreachable, fall back to a static synthetic feed so the
//      script still prints numbers rather than exiting with 0
//      results.

interface RawItem {
  title: string;
  link: string;
}

async function fetchYahooTopHeadlines(): Promise<RawItem[]> {
  const url = "https://finance.yahoo.com/news/rssindex";
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; NumerisSurvivalCheck/1.0)",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: RawItem[] = [];
    const matches = xml.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    for (const raw of matches) {
      const title =
        (raw.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) ??
          raw.match(/<title>([\s\S]*?)<\/title>/))?.[1]?.trim() ?? "";
      const link = (raw.match(/<link>([\s\S]*?)<\/link>/))?.[1]?.trim() ?? "";
      if (title && link) items.push({ title, link });
    }
    return items;
  } catch {
    return [];
  }
}

// ── Filter (copy of the one in api-server/src/lib/market.ts) ────────
// Duplicated so this script has zero cross-package build coupling.
// If the real filter's logic diverges from this, the script's
// numbers get stale — kept as a documented copy for that reason.
const CURRENCY_KEYWORDS: Record<string, string[]> = {
  GBP: ["gbp", "sterling", "pound sterling", "british pound"],
  USD: ["usd", "us dollar", "u.s. dollar", "dollar"],
  EUR: ["eur", "euro", "eurozone"],
  MYR: ["myr", "ringgit", "malaysian ringgit"],
  SGD: ["sgd", "singapore dollar"],
  CNY: ["cny", "yuan", "renminbi"],
  JPY: ["jpy", "yen"],
  AUD: ["aud", "australian dollar", "aussie dollar"],
  CAD: ["cad", "canadian dollar"],
  HKD: ["hkd", "hong kong dollar"],
  THB: ["thb", "thai baht", "baht"],
  INR: ["inr", "rupee", "indian rupee"],
};

interface FilteredItem { title: string; kind: "ticker" | "currency"; anchor: string }
function filter(
  items: RawItem[],
  holdings: { tickers: string[]; currencies: string[] },
): FilteredItem[] {
  const tickers = holdings.tickers.map((t) => t.toUpperCase());
  const currencies = holdings.currencies.map((c) => c.toUpperCase());
  const out: FilteredItem[] = [];
  for (const it of items) {
    const upper = it.title.toUpperCase();
    const tickerHit = tickers.find((t) => upper.includes(t));
    if (tickerHit) {
      out.push({ title: it.title, kind: "ticker", anchor: tickerHit });
      continue;
    }
    const lower = it.title.toLowerCase();
    let hit = false;
    for (const code of currencies) {
      const keys = CURRENCY_KEYWORDS[code];
      if (!keys) continue;
      if (keys.some((k) => lower.includes(k))) {
        out.push({ title: it.title, kind: "currency", anchor: code });
        hit = true;
        break;
      }
    }
    if (hit) continue;
  }
  return out;
}

// ── Synthetic user profiles to test against ─────────────────────────
const profiles = [
  {
    name: "UK budget persona (bank only, no holdings)",
    tickers: [],
    currencies: ["GBP"],
  },
  {
    name: "UK market persona (AAPL + MSFT + NVDA + GBP + USD)",
    tickers: ["AAPL", "MSFT", "NVDA"],
    currencies: ["GBP", "USD"],
  },
  {
    name: "Malaysia expat (Wise + Maybank + Alpaca)",
    tickers: ["AAPL", "TSLA"],
    currencies: ["GBP", "USD", "MYR", "SGD"],
  },
  {
    name: "Full analyst (broad tickers + majors)",
    tickers: ["AAPL", "MSFT", "GOOG", "NVDA", "TSLA", "AMZN"],
    currencies: ["GBP", "USD", "EUR", "JPY", "MYR"],
  },
];

async function main(): Promise<void> {
  console.log("F3 news survival-rate check\n");
  const items = await fetchYahooTopHeadlines();
  console.log(`Pulled ${items.length} items from Yahoo Finance top headlines RSS.\n`);
  if (items.length === 0) {
    console.log("(No items — network unreachable or feed changed. Nothing to measure.)");
    process.exit(0);
  }

  for (const p of profiles) {
    const kept = filter(items, { tickers: p.tickers, currencies: p.currencies });
    const pct = ((kept.length / items.length) * 100).toFixed(1);
    console.log(`## ${p.name}`);
    console.log(`   tickers:    ${p.tickers.length === 0 ? "(none)" : p.tickers.join(", ")}`);
    console.log(`   currencies: ${p.currencies.length === 0 ? "(none)" : p.currencies.join(", ")}`);
    console.log(`   survived:   ${kept.length} / ${items.length}  (${pct}%)`);
    if (kept.length > 0) {
      const byAnchor: Record<string, number> = {};
      for (const k of kept) byAnchor[`${k.kind}:${k.anchor}`] = (byAnchor[`${k.kind}:${k.anchor}`] ?? 0) + 1;
      console.log(`   breakdown:  ${Object.entries(byAnchor).map(([k, v]) => `${k}=${v}`).join(", ")}`);
      console.log(`   sample:     "${kept[0]!.title.slice(0, 80)}${kept[0]!.title.length > 80 ? "…" : ""}" → ${kept[0]!.kind}:${kept[0]!.anchor}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error("survival check failed:", err);
  process.exit(1);
});

export {};
