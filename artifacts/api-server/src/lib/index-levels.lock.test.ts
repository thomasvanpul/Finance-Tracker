// Index levels lock.
//
// An index level (S&P 500, FTSE 100, Nikkei 225 …) is licensed by the index
// owner, separately from whoever sells the feed, and the app holds no such
// licence. That is falsifier 2 in .review/BLOCKER.md: public signup cannot
// open while the app displays one. Individual stock, ETF, crypto and FX
// prices are a different question and are NOT refused here — SPY and VUSA.L
// track the S&P 500 but are securities someone can own.
//
// Three things are locked:
//
//   1. No index symbol is reachable from a client default. Every string
//      literal and JSX text in artifacts/finance-tracker/src (tests
//      excluded) is split on commas, and each symbol-shaped piece is checked
//      against the server's own rule (isIndexSymbol) and against the no-caret
//      symbols Yahoo was measured to report as INDEX.
//   2. The server refuses before any provider is called when the symbol's
//      shape says index, and on Yahoo's reported instrument type when it does
//      not — without falling through to a provider that reports no type, and
//      without counting the refusal against Yahoo's circuit breaker.
//   3. The routes answer 451 with a stated reason, so the UI has something
//      true to say instead of an empty tile or "failed to load".
//
// market-classifier.test.ts names ^N225 and ^FTSE because it tests the
// classifier. It is server code and is not scanned; only the client is.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

// routes/market.ts imports the db for /market/news/for-user. No test here
// reaches it; the mock exists so the router can be imported at all.
vi.mock("@workspace/db", () => ({ db: {}, investmentsTable: {}, accountsTable: {} }));

import {
  INDEX_LEVEL_REFUSED,
  IndexLevelRefusedError,
  isIndexInstrumentType,
  isIndexSymbol,
} from "./market-classifier";
import {
  __setYahooForTesting,
  getOptionsChain,
  getStockDetail,
  getStockHistory,
  readStockPrices,
  readStockQuotes,
} from "./market";
import { __resetProviderHealthForTesting, getProviderHealth, registerProvider } from "./provider-health";
import marketRouter from "../routes/market";
import liveRouter from "../routes/market-live";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const CLIENT_SRC = join(REPO_ROOT, "artifacts", "finance-tracker", "src");

// Probed 2026-09-11 with yahoo-finance2 quote().quoteType and
// chart().meta.instrumentType: all four report INDEX and none has a caret.
// SSE Composite, CSI 300, ICE US Dollar Index, MOEX Russia.
const MEASURED_NO_CARET_INDICES = ["000001.SS", "000300.SS", "DX-Y.NYB", "IMOEX.ME"];

// ── 1. Client defaults ──────────────────────────────────────────────────────

// A string naming an index symbol that is not a default: the migration that
// drops the retired defaults from a saved ticker bar. Matched on path, symbol
// AND the declaration the literal sits in, so the same symbol put back into
// DEFAULTS in the same file is still caught. No line number, so an unrelated
// edit above it does not make the entry stale.
const ALLOWLIST: { path: string; symbol: string; within: string; reason: string }[] = [
  {
    path: "artifacts/finance-tracker/src/contexts/tickers-context.tsx",
    symbol: "^FTSE",
    within: "RETIRED_DEFAULTS",
    reason: "migration: drops the retired default slot from a ticker bar saved before 2026-09-11",
  },
  {
    path: "artifacts/finance-tracker/src/contexts/tickers-context.tsx",
    symbol: "^GSPC",
    within: "RETIRED_DEFAULTS",
    reason: "migration: drops the retired default slot from a ticker bar saved before 2026-09-11",
  },
];

// Symbol-shaped: a caret symbol in any case, or an uppercase token of the
// characters tickers use. Prose, regex sources and CSS never match.
const SYMBOL_SHAPE = /^(\^[A-Za-z0-9.-]{1,20}|[A-Z0-9][A-Z0-9.:=-]{1,23})$/;

interface Hit { path: string; line: number; symbol: string; within: string | null }

function enclosingDeclaration(node: ts.Node): string | null {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
  }
  return null;
}

function clientSourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) clientSourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function indexSymbolsIn(file: string): Hit[] {
  const text = readFileSync(file, "utf-8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const path = relative(REPO_ROOT, file);
  const hits: Hit[] = [];
  const noCaret = new Set(MEASURED_NO_CARET_INDICES);

  const visit = (node: ts.Node): void => {
    const literal =
      ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
        ? node.text
        : ts.isJsxText(node)
          ? node.getText(source)
          : null;
    if (literal !== null) {
      for (const piece of literal.split(",")) {
        const symbol = piece.trim();
        if (!SYMBOL_SHAPE.test(symbol)) continue;
        if (!isIndexSymbol(symbol) && !noCaret.has(symbol.toUpperCase())) continue;
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        hits.push({ path, line, symbol, within: enclosingDeclaration(node) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return hits;
}

describe("index levels · no client default names an index symbol", () => {
  const hits = clientSourceFiles(CLIENT_SRC).flatMap(indexSymbolsIn);
  const allowed = (h: Hit) =>
    ALLOWLIST.some((a) => a.path === h.path && a.symbol === h.symbol && a.within === h.within);

  it("scans a real tree (a scan that reads nothing passes vacuously)", () => {
    expect(clientSourceFiles(CLIENT_SRC).length).toBeGreaterThan(100);
  });

  it("finds no index symbol outside the allowlist", () => {
    const offending = hits.filter((h) => !allowed(h));
    expect(
      offending,
      "An index level is licensed by the index owner and the server refuses it " +
        "(api-server lib/market-classifier.ts). Remove the symbol rather than allowlisting it:\n" +
        offending.map((h) => `  ${h.path}:${h.line} ${h.symbol}${h.within ? ` in ${h.within}` : ""}`).join("\n"),
    ).toEqual([]);
  });

  it("every allowlist entry still matches (the allowlist is not stale)", () => {
    const stale = ALLOWLIST.filter(
      (a) => !hits.some((h) => h.path === a.path && h.symbol === a.symbol && h.within === a.within),
    );
    expect(stale).toEqual([]);
  });
});

// ── 2. Server refusal ───────────────────────────────────────────────────────

describe("isIndexSymbol · the shape rule", () => {
  it.each(["^GSPC", "^ftse", " ^N225 ", "I:SPX"])("%s is an index by shape", (t) => {
    expect(isIndexSymbol(t)).toBe(true);
  });

  it.each(["SPY", "VUSA.L", "AAPL", "BTC-GBP", "GBP=X", "GC=F", "ES=F"])("%s is not an index", (t) => {
    expect(isIndexSymbol(t)).toBe(false);
  });

  it("shape alone is not sufficient: the measured no-caret indices pass it", () => {
    // This is the finding, stated as a test: these are caught on Yahoo's
    // reported type below, not by their symbol.
    for (const t of MEASURED_NO_CARET_INDICES) expect(isIndexSymbol(t)).toBe(false);
  });

  it("recognises Yahoo's INDEX type in any case, and nothing else", () => {
    expect(isIndexInstrumentType("INDEX")).toBe(true);
    expect(isIndexInstrumentType("index")).toBe(true);
    for (const t of ["ETF", "EQUITY", "MUTUALFUND", "FUTURE", "CURRENCY", "CRYPTOCURRENCY", "", undefined, null, 7]) {
      expect(isIndexInstrumentType(t)).toBe(false);
    }
  });
});

// A Yahoo stand-in reporting a type per symbol (EQUITY unless named) and a
// price for everything, so a refusal is the only reason a row can go missing.
function yahooReporting(types: Record<string, string>) {
  const typeOf = (t: string) => types[t] ?? "EQUITY";
  return {
    quote: vi.fn(async (t: string) => ({ quoteType: typeOf(t), regularMarketPrice: 101, currency: "USD" })),
    chart: vi.fn(async (t: string) => ({
      meta: { instrumentType: typeOf(t), regularMarketPrice: 101, chartPreviousClose: 100, currency: "USD" },
      quotes: [],
    })),
    historical: vi.fn(async () => []),
    options: vi.fn(async (t: string) => ({
      quote: { quoteType: typeOf(t), regularMarketPrice: 101 },
      expirationDates: [],
      options: [],
    })),
    quoteSummary: vi.fn(async () => ({})),
  };
}

let yahoo: ReturnType<typeof yahooReporting>;
// Alpaca, Polygon and Twelve Data all reach the network through fetch. None
// of them reports an instrument type, so a refused symbol must never get here.
const network = vi.fn(async () => {
  throw new Error("a refused symbol reached a provider that cannot tell it is an index");
});

beforeEach(() => {
  process.env.ALPACA_KEY_ID = "TEST_KEY";
  process.env.ALPACA_SECRET_KEY = "TEST_SECRET";
  process.env.TWELVEDATA_API_KEY = "TEST_TD_KEY";
  __resetProviderHealthForTesting();
  registerProvider({ name: "yahoo", configured: true });
  registerProvider({ name: "alpaca", configured: true });
  registerProvider({ name: "polygon", configured: false });
  registerProvider({ name: "twelvedata", configured: true, creditsBudget: 800 });
  registerProvider({ name: "frankfurter", configured: true });
  network.mockClear();
  vi.stubGlobal("fetch", network);
  yahoo = yahooReporting({ "000001.SS": "INDEX", "000300.SS": "INDEX", "DX-Y.NYB": "INDEX", "IMOEX.ME": "INDEX", SPY: "ETF" });
  __setYahooForTesting(yahoo);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("quotes and prices · refused at the boundary, never served elsewhere", () => {
  it("a caret symbol reaches no provider at all", async () => {
    const quotes = await readStockQuotes(["^FTSE", "^GSPC"]);
    const prices = await readStockPrices(["^N225"]);
    expect(quotes).toEqual({ rows: [], refused: ["^FTSE", "^GSPC"] });
    expect(prices).toEqual({ rows: [], refused: ["^N225"] });
    expect(yahoo.quote).not.toHaveBeenCalled();
    expect(yahoo.chart).not.toHaveBeenCalled();
    expect(network).not.toHaveBeenCalled();
  });

  it("a no-caret symbol Yahoo reports as INDEX is refused and not retried on another provider", async () => {
    const quotes = await readStockQuotes(["000001.SS"]);
    const prices = await readStockPrices(["DX-Y.NYB"]);
    expect(quotes).toEqual({ rows: [], refused: ["000001.SS"] });
    expect(prices).toEqual({ rows: [], refused: ["DX-Y.NYB"] });
    expect(network).not.toHaveBeenCalled();
  });

  it("a stock or an ETF that tracks an index is still served beside a refused index", async () => {
    const quotes = await readStockQuotes(["SPY", "^GSPC", "AAPL"]);
    const prices = await readStockPrices(["SPY", "IMOEX.ME"]);
    expect(quotes.rows.map((r) => r.ticker)).toEqual(["SPY", "AAPL"]);
    expect(quotes.refused).toEqual(["^GSPC"]);
    expect(prices.rows.map((r) => r.ticker)).toEqual(["SPY"]);
    expect(prices.refused).toEqual(["IMOEX.ME"]);
  });

  it("a refusal is not a Yahoo failure: the breaker stays closed", async () => {
    for (let i = 0; i < 5; i += 1) {
      await readStockPrices(["000001.SS"]);
      await readStockQuotes(["000300.SS"]);
    }
    const y = getProviderHealth().find((p) => p.name === "yahoo");
    expect(y?.breaker).toBe("closed");
    expect(y?.consecutiveFailures).toBe(0);
  });
});

describe("history, detail and options · refused", () => {
  it("history refuses a caret symbol without calling Yahoo", async () => {
    await expect(getStockHistory("^GSPC", "1m")).rejects.toBeInstanceOf(IndexLevelRefusedError);
    expect(yahoo.chart).not.toHaveBeenCalled();
  });

  it("history refuses a symbol Yahoo's chart reports as INDEX, and caches nothing", async () => {
    await expect(getStockHistory("000001.SS", "1y")).rejects.toBeInstanceOf(IndexLevelRefusedError);
    await expect(getStockHistory("000001.SS", "1y")).rejects.toBeInstanceOf(IndexLevelRefusedError);
    expect(network).not.toHaveBeenCalled();
  });

  it("history for a stock still resolves", async () => {
    await expect(getStockHistory("MSFT", "1m")).resolves.toEqual([]);
  });

  it("detail refuses a caret symbol without calling Yahoo", async () => {
    await expect(getStockDetail("^N225")).rejects.toBeInstanceOf(IndexLevelRefusedError);
    expect(yahoo.quoteSummary).not.toHaveBeenCalled();
  });

  it("options refuse a caret symbol and one Yahoo reports as INDEX", async () => {
    await expect(getOptionsChain("^SPX")).rejects.toBeInstanceOf(IndexLevelRefusedError);
    await expect(getOptionsChain("DX-Y.NYB")).rejects.toBeInstanceOf(IndexLevelRefusedError);
    expect(yahoo.options).toHaveBeenCalledTimes(1);
  });
});

// ── 3. Routes answer 451 ────────────────────────────────────────────────────

interface Sent { status: number; body: unknown }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function call(router: any, path: string, req: Record<string, unknown>): Promise<Sent> {
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = router.stack.find((l: any) => l?.route?.path === path);
    if (!layer) return reject(new Error(`route not found: ${path}`));
    let status = 200;
    const res = {
      status(code: number) { status = code; return res; },
      json(body: unknown) { resolve({ status, body }); return res; },
      setHeader() { reject(new Error("a refused ticker opened a stream")); },
      flushHeaders() {},
      write() {},
    };
    const full = { query: {}, params: {}, on() {}, ...req };
    Promise.resolve(layer.route.stack[0].handle(full, res)).catch(reject);
  });
}

function expectRefusal(sent: Sent, refused: string[]): void {
  const body = sent.body as { error?: string; code?: string; refused?: string[] };
  expect(sent.status).toBe(451);
  expect(body.code).toBe(INDEX_LEVEL_REFUSED);
  expect(body.refused).toEqual(refused);
  expect(body.error).toMatch(/licensed by the index owner/);
}

describe("routes · an index symbol gets 451 and a reason", () => {
  it("/market/quotes and /market/prices refuse when every ticker is an index", async () => {
    expectRefusal(await call(marketRouter, "/market/quotes", { query: { tickers: "^FTSE,^GSPC" } }), ["^FTSE", "^GSPC"]);
    expectRefusal(await call(marketRouter, "/market/prices", { query: { tickers: "000001.SS" } }), ["000001.SS"]);
  });

  it("/market/quotes serves the licensed rows of a mixed request", async () => {
    const sent = await call(marketRouter, "/market/quotes", { query: { tickers: "^FTSE,AAPL" } });
    expect(sent.status).toBe(200);
    expect((sent.body as unknown as { ticker: string }[]).map((r) => r.ticker)).toEqual(["AAPL"]);
  });

  it("/market/history, /market/detail and /market/options refuse", async () => {
    expectRefusal(await call(marketRouter, "/market/history", { query: { ticker: "^gspc", period: "1m" } }), ["^GSPC"]);
    expectRefusal(await call(marketRouter, "/market/history", { query: { ticker: "000300.SS", period: "1y" } }), ["000300.SS"]);
    expectRefusal(await call(marketRouter, "/market/detail", { query: { ticker: "^N225" } }), ["^N225"]);
    expectRefusal(await call(marketRouter, "/market/options", { query: { ticker: "^GSPC" } }), ["^GSPC"]);
  });

  it("/api/market/live/:ticker refuses before opening a stream", async () => {
    expectRefusal(await call(liveRouter, "/api/market/live/:ticker", { params: { ticker: "^GSPC" } }), ["^GSPC"]);
  });
});
