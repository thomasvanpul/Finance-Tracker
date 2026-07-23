import { useGetMarketQuotes } from "@workspace/api-client-react";
import { WidgetShell } from "./widget-shell";

const TICKERS = "^GSPC,^FTSE,BTC-USD,GBPUSD=X";

const TICKER_LABELS: Record<string, { name: string; suffix?: string }> = {
  "^GSPC": { name: "S&P 500" },
  "^FTSE": { name: "FTSE 100" },
  "BTC-USD": { name: "Bitcoin", suffix: "USD" },
  "GBPUSD=X": { name: "GBP/USD", suffix: "" },
};

function formatPrice(ticker: string, price: number): string {
  if (ticker === "GBPUSD=X") return price.toFixed(4);
  if (ticker === "BTC-USD") return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  if (ticker === "^FTSE") return new Intl.NumberFormat("en-GB", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

function formatRange(val?: number | null): string {
  if (val == null) return "—";
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

export function MarketSnapshotWidget() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, isLoading, isError } = useGetMarketQuotes({ tickers: TICKERS }, { query: { refetchInterval: 5 * 60 * 1000 } as any });

  const quotes = data ?? [];

  return (
    <WidgetShell title="Market Snapshot" isLoading={isLoading} accent="var(--ft-amber)">
      {!isLoading && (
        <>
          {isError || quotes.length === 0 ? (
            <div style={{ padding: "20px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center" }}>
              Market data unavailable
            </div>
          ) : (
            <>
              {quotes.map(q => {
                const meta = TICKER_LABELS[q.ticker];
                const updatedAt = new Date(q.updatedAt);
                const stale = Date.now() - updatedAt.getTime() > 3600000;

                return (
                  <div key={q.ticker} style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 12px",
                    borderBottom: "1px solid var(--ft-border)",
                    gap: 10,
                  }}>
                    {/* Ticker + Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.04em" }}>
                        {q.displayName ?? meta?.name ?? q.ticker}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 1 }}>
                        {q.ticker}
                        {stale && <span style={{ marginLeft: 6, color: "var(--ft-amber)" }}>DELAYED</span>}
                      </div>
                    </div>

                    {/* 52w range mini bar */}
                    {q.high52w != null && q.low52w != null && (
                      <div style={{ width: 70, flexShrink: 0 }}>
                        <div style={{ height: 2, background: "var(--ft-border)", borderRadius: 2, marginBottom: 3, position: "relative" }}>
                          <div style={{
                            position: "absolute",
                            left: `${((q.price - q.low52w) / (q.high52w - q.low52w)) * 100}%`,
                            transform: "translateX(-50%)",
                            width: 4,
                            height: 4,
                            borderRadius: "50%",
                            background: "var(--ft-amber)",
                            top: -1,
                          }} />
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{formatRange(q.low52w)}</span>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{formatRange(q.high52w)}</span>
                        </div>
                      </div>
                    )}

                    {/* Price + change */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>
                        {formatPrice(q.ticker, q.price)}
                      </div>
                      {(q as { changePercent?: number }).changePercent != null ? (
                        <div style={{
                          fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600,
                          color: (q as { changePercent?: number }).changePercent! >= 0 ? "var(--ft-green)" : "var(--ft-red)",
                        }}>
                          {(q as { changePercent?: number }).changePercent! >= 0 ? "▲" : "▼"}
                          {Math.abs((q as { changePercent?: number }).changePercent!).toFixed(2)}%
                        </div>
                      ) : (
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)" }}>
                          {meta?.suffix ?? q.currency}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Updated time */}
              {quotes.length > 0 && (
                <div style={{ padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textAlign: "right" }}>
                  Updated {new Date(quotes[0].updatedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </>
          )}
        </>
      )}
    </WidgetShell>
  );
}
