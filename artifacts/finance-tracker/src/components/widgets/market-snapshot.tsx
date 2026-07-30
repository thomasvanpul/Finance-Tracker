import { useState } from "react";
import { useGetMarketQuotes, useGetMarketHistory } from "@workspace/api-client-react";
import { WidgetShell } from "./widget-shell";
import { LineChart, Line, ResponsiveContainer, Tooltip } from "recharts";

const DEFAULT_TICKERS = "^GSPC,^FTSE,BTC-USD,GBPUSD=X,ETH-USD,^DJI";

const TICKER_META: Record<string, { name: string; group: "equity" | "crypto" | "fx" }> = {
  "^GSPC":    { name: "S&P 500",    group: "equity" },
  "^FTSE":    { name: "FTSE 100",   group: "equity" },
  "^DJI":     { name: "Dow Jones",  group: "equity" },
  "^IXIC":    { name: "Nasdaq",     group: "equity" },
  "BTC-USD":  { name: "Bitcoin",    group: "crypto" },
  "ETH-USD":  { name: "Ethereum",   group: "crypto" },
  "GBPUSD=X": { name: "GBP/USD",   group: "fx" },
  "GBPEUR=X": { name: "GBP/EUR",   group: "fx" },
};

const GROUP_LABEL: Record<string, string> = {
  equity: "EQUITIES",
  crypto: "CRYPTO",
  fx: "FX",
};

function formatPrice(ticker: string, price: number): string {
  if (ticker === "GBPUSD=X" || ticker === "GBPEUR=X") return price.toFixed(4);
  if (ticker.endsWith("-USD") && price >= 100000)
    return "$" + (price / 1000).toFixed(1) + "K";
  if (ticker.endsWith("-USD") && price >= 10000)
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  if (ticker.endsWith("-USD"))
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
  if (ticker === "^FTSE")
    return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

function formatChg(val: number | undefined): string {
  if (val == null) return "—";
  return `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`;
}

function Sparkline({ ticker }: { ticker: string }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = useGetMarketHistory({ ticker, period: "5d" }, { query: { staleTime: 5 * 60 * 1000, enabled: !!ticker } as any });
  if (!data || data.length < 2) {
    return <div style={{ width: 64, height: 28, opacity: 0.2, borderBottom: "1px dashed var(--ft-border2)" }} />;
  }
  const chartData = data.map((p: { close: number }) => ({ v: p.close }));
  const first = chartData[0].v;
  const last = chartData[chartData.length - 1].v;
  const isUp = last >= first;
  const color = isUp ? "var(--ft-green)" : "var(--ft-red)";

  return (
    <div style={{ width: 64, height: 28 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip
            content={() => null}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface Quote {
  ticker: string;
  price: number;
  updatedAt: string;
  displayName?: string;
  changePercent?: number;
  high52w?: number | null;
  low52w?: number | null;
  currency?: string;
}

function QuoteRow({ q, showSparkline }: { q: Quote; showSparkline: boolean }) {
  const [hov, setHov] = useState(false);
  const chgPct = (q as { changePercent?: number }).changePercent;
  const isUp = chgPct != null ? chgPct >= 0 : null;
  const stale = Date.now() - new Date(q.updatedAt).getTime() > 3_600_000;
  const meta = TICKER_META[q.ticker];

  const rowBg = hov
    ? "var(--ft-raised)"
    : isUp === true
    ? "color-mix(in srgb, var(--ft-green) 4%, transparent)"
    : isUp === false
    ? "color-mix(in srgb, var(--ft-red) 4%, transparent)"
    : "transparent";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "8px 12px",
        borderBottom: "1px solid var(--ft-border)",
        gap: 8,
        background: rowBg,
        transition: "background 0.1s",
        cursor: "default",
        minWidth: 0,
        overflow: "hidden",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Ticker name */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          fontWeight: 700,
          color: "var(--ft-text)",
          letterSpacing: "0.02em",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {q.displayName ?? meta?.name ?? q.ticker}
        </div>
        <div style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: stale ? "var(--ft-amber)" : "var(--ft-dim)",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginTop: 1,
        }}>
          {q.ticker}{stale ? " · DELAYED" : ""}
        </div>
      </div>

      {/* 52w range bar */}
      {q.high52w != null && q.low52w != null && q.high52w !== q.low52w && (
        <div style={{ width: 56, flexShrink: 0 }}>
          <div style={{ height: 2, background: "var(--ft-border2)", borderRadius: 2, position: "relative", marginBottom: 3 }}>
            <div style={{
              position: "absolute",
              left: `${Math.max(0, Math.min(100, ((q.price - q.low52w) / (q.high52w - q.low52w)) * 100))}%`,
              transform: "translateX(-50%)",
              width: 5,
              height: 5,
              borderRadius: "50%",
              background: isUp === false ? "var(--ft-red)" : "var(--ft-green)",
              top: -1.5,
            }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
              {q.low52w != null ? Math.round(q.low52w).toLocaleString() : ""}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7, color: "var(--ft-dim)" }}>
              {q.high52w != null ? Math.round(q.high52w).toLocaleString() : ""}
            </span>
          </div>
        </div>
      )}

      {/* Sparkline */}
      {showSparkline && <Sparkline ticker={q.ticker} />}

      {/* Price + change */}
      <div style={{ textAlign: "right", flexShrink: 0, minWidth: 88 }}>
        <div className="pnum" style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--ft-text)",
          letterSpacing: "-0.01em",
          whiteSpace: "nowrap",
        }}>
          {formatPrice(q.ticker, q.price)}
        </div>
        {chgPct != null ? (
          <div className="pnum" style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            fontWeight: 600,
            color: isUp ? "var(--ft-green)" : "var(--ft-red)",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 2,
            marginTop: 1,
          }}>
            <span style={{ fontSize: 8 }}>{isUp ? "▲" : "▼"}</span>
            {Math.abs(chgPct).toFixed(2)}%
          </div>
        ) : (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 1 }}>
            {meta?.group === "fx" ? "RATE" : q.currency ?? ""}
          </div>
        )}
      </div>
    </div>
  );
}

export function MarketSnapshotWidget({ isExpanded }: { isExpanded?: boolean }) {
  const [showSparklines, setShowSparklines] = useState(false);
  const tickers = isExpanded ? `${DEFAULT_TICKERS},^IXIC` : DEFAULT_TICKERS;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, isError } = useGetMarketQuotes({ tickers }, { query: { refetchInterval: 5 * 60 * 1000 } as any });

  const quotes = (data ?? []) as Quote[];

  // Group by type
  const grouped = quotes.reduce<Record<string, Quote[]>>((acc, q) => {
    const group = TICKER_META[q.ticker]?.group ?? "other";
    (acc[group] = acc[group] ?? []).push(q);
    return acc;
  }, {});

  const lastUpdated = quotes.length > 0
    ? new Date(quotes[0].updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  const marketSummary = quotes.length > 0 ? (() => {
    const equities = quotes.filter(q => TICKER_META[q.ticker]?.group === "equity");
    const upCount = equities.filter(q => ((q as { changePercent?: number }).changePercent ?? 0) >= 0).length;
    const downCount = equities.length - upCount;
    return { upCount, downCount, total: equities.length };
  })() : null;

  const headerRight = (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      {marketSummary && marketSummary.total > 0 && (
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-green)", fontWeight: 700 }}>
            ▲{marketSummary.upCount}
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-red)", fontWeight: 700 }}>
            ▼{marketSummary.downCount}
          </span>
        </div>
      )}
      <button
        onClick={() => setShowSparklines(s => !s)}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.06em",
          padding: "1px 5px",
          background: showSparklines ? "var(--ft-accent)" : "transparent",
          color: showSparklines ? "var(--ft-base)" : "var(--ft-dim)",
          border: `1px solid ${showSparklines ? "var(--ft-accent)" : "var(--ft-border2)"}`,
          cursor: "pointer",
          transition: "all 0.1s",
        }}
        title="Toggle 5d sparklines"
      >
        ∿
      </button>
    </div>
  );

  return (
    <WidgetShell title="Market Snapshot" isLoading={isLoading} accent="var(--ft-amber)" headerRight={headerRight}>
      {!isLoading && (
        isError || quotes.length === 0 ? (
          <div style={{ padding: "24px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
            Market data unavailable
          </div>
        ) : (
          <>
            {Object.entries(grouped).map(([group, qs]) => (
              <div key={group}>
                {Object.keys(grouped).length > 1 && (
                  <div style={{
                    padding: "4px 12px",
                    background: "var(--ft-base)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    letterSpacing: "0.14em",
                    color: "var(--ft-dim)",
                    borderBottom: "1px solid var(--ft-border)",
                  }}>
                    {GROUP_LABEL[group] ?? group.toUpperCase()}
                  </div>
                )}
                {qs.map(q => (
                  <QuoteRow key={q.ticker} q={q} showSparkline={showSparklines} />
                ))}
              </div>
            ))}

            <div style={{
              padding: "5px 12px",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              color: "var(--ft-dim)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              background: "var(--ft-base)",
            }}>
              <span style={{ letterSpacing: "0.06em" }}>AUTO-REFRESH 5MIN</span>
              {lastUpdated && <span>Updated {lastUpdated}</span>}
            </div>
          </>
        )
      )}
    </WidgetShell>
  );
}
