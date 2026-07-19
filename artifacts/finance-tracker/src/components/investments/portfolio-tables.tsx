import { type Investment } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";

// ── Shared types & styles ─────────────────────────────────────────────────────

interface QuoteData {
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
}

const TH: React.CSSProperties = {
  padding: "6px 12px", fontSize: 10, fontWeight: 600, color: "var(--ft-dim)",
  background: "var(--ft-surface)", borderBottom: "2px solid var(--ft-border2)",
  borderRight: "1px solid var(--ft-border)", textTransform: "uppercase" as const,
  letterSpacing: "0.4px", whiteSpace: "nowrap" as const,
};

function fmtMktCap(cap: number | null | undefined): string {
  if (!cap) return "—";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(1)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  return `$${(cap / 1e6).toFixed(0)}M`;
}

// ── Fundamentals Table ────────────────────────────────────────────────────────

interface FundamentalsTableProps {
  investments: Investment[];
  quoteMap: Map<string, QuoteData>;
}

export function FundamentalsTable({ investments, quoteMap }: FundamentalsTableProps) {
  const HEADS = [
    { h: "TICKER", a: "left" }, { h: "PE (TTM)", a: "right" }, { h: "FWD PE", a: "right" },
    { h: "EPS", a: "right" }, { h: "52W RANGE", a: "right" }, { h: "MKT CAP", a: "right" },
    { h: "BETA", a: "right" }, { h: "DIV YIELD", a: "right" },
    { h: "ANALYST TGT", a: "right" }, { h: "UPSIDE", a: "right" },
  ];
  return (
    <div className="border" style={{ borderColor: "var(--ft-border)" }}>
      <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(34,211,238,0.08)", borderColor: "rgba(34,211,238,0.18)", color: "var(--ft-cyan)" }}>
        ▼ FUNDAMENTALS & VALUATION — Yahoo Finance
      </div>
      <div className="overflow-x-auto">
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>{HEADS.map(({ h, a }) => <th key={h} style={{ ...TH, textAlign: a as "left" | "right" }}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {investments.map((inv) => {
              const q = quoteMap.get(inv.ticker);
              const sym = q?.currency === "GBP" ? "£" : "$";
              const up = q?.analystTargetPrice && q?.price ? ((q.analystTargetPrice - q.price) / q.price) * 100 : null;
              const TD = (children: React.ReactNode, extra?: React.CSSProperties) => (
                <td style={{ padding: "6px 12px", borderRight: "1px solid var(--ft-border)", fontSize: 11, fontVariantNumeric: "tabular-nums", ...extra }}>{children}</td>
              );
              return (
                <tr key={inv.id} style={{ borderBottom: "1px solid rgba(33,38,45,0.6)", background: "var(--ft-base)" }}>
                  {TD(inv.ticker, { color: "var(--ft-blue)", fontWeight: 700, fontSize: 12 })}
                  {TD(q?.pe != null ? q.pe.toFixed(1) : "—", { textAlign: "right", color: "var(--ft-text)" })}
                  {TD(q?.forwardPe != null ? q.forwardPe.toFixed(1) : "—", { textAlign: "right", color: "var(--ft-text)" })}
                  {TD(q?.eps != null ? `${sym}${q.eps.toFixed(2)}` : "—", { textAlign: "right", color: "var(--ft-text)" })}
                  {TD(q?.low52w != null && q?.high52w != null ? `${sym}${q.low52w.toFixed(0)} – ${sym}${q.high52w.toFixed(0)}` : "—", { textAlign: "right", color: "var(--ft-muted)" })}
                  {TD(fmtMktCap(q?.marketCap), { textAlign: "right", color: "var(--ft-text)" })}
                  {TD(q?.beta != null ? q.beta.toFixed(2) : "—", { textAlign: "right", color: "var(--ft-text)" })}
                  {TD(q?.dividendYield != null ? `${q.dividendYield.toFixed(2)}%` : "—", { textAlign: "right", color: q?.dividendYield ? "var(--ft-green)" : "var(--ft-dim)" })}
                  {TD(q?.analystTargetPrice != null ? `${sym}${q.analystTargetPrice.toFixed(0)}` : "—", { textAlign: "right", color: "var(--ft-text)" })}
                  <td style={{ padding: "6px 12px", textAlign: "right", fontSize: 11 }}>
                    {up != null ? (
                      <span style={{ padding: "1px 5px", borderRadius: 2, background: up >= 0 ? "rgba(63,185,80,0.15)" : "rgba(248,81,73,0.15)", color: up >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600 }}>
                        {up >= 0 ? "+" : ""}{up.toFixed(1)}%
                      </span>
                    ) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-3 py-1.5 text-xs border-t" style={{ color: "var(--ft-dim)", background: "var(--ft-surface)", borderColor: "var(--ft-border)" }}>
        Not financial advice · data via Yahoo Finance
      </div>
    </div>
  );
}

// ── Dividend Tracker ─────────────────────────────────────────────────────────

interface DividendTrackerProps {
  investments: Investment[];
  quoteMap: Map<string, QuoteData>;
}

export function DividendTracker({ investments, quoteMap }: DividendTrackerProps) {
  const positions = investments.filter((inv) => {
    const q = quoteMap.get(inv.ticker);
    return q?.dividendYield && q.dividendYield > 0;
  });

  const totalAnnual = positions.reduce((sum, inv) => {
    const q = quoteMap.get(inv.ticker);
    if (!q?.dividendYield) return sum;
    return sum + (q.dividendYield / 100) * q.price * inv.shares;
  }, 0);

  const HEADS: [string, "left" | "right"][] = [
    ["TICKER", "left"], ["SHARES", "right"], ["LIVE PRICE", "right"],
    ["DIV YIELD %", "right"], ["ANNUAL / SHARE", "right"], ["TOTAL ANNUAL", "right"], ["TOTAL (GBP)", "right"],
  ];

  return (
    <div className="border" style={{ borderColor: "var(--ft-border)" }}>
      <div className="flex items-center px-3 py-1.5 text-xs font-bold border-b" style={{ background: "rgba(63,185,80,0.08)", borderColor: "rgba(63,185,80,0.2)", color: "var(--ft-green)" }}>
        ▼ DIVIDEND TRACKER — Estimated Annual Income
      </div>
      {positions.length === 0 ? (
        <div className="text-center py-8 text-xs" style={{ color: "var(--ft-dim)" }}>No dividend-paying positions tracked</div>
      ) : (
        <div className="overflow-x-auto">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>{HEADS.map(([h, a]) => <th key={h} style={{ ...TH, textAlign: a }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {positions.map((inv) => {
                const q = quoteMap.get(inv.ticker);
                if (!q?.dividendYield) return null;
                const sym = q.currency === "GBP" ? "£" : "$";
                const annualPerShare = (q.dividendYield / 100) * q.price;
                const totalRow = annualPerShare * inv.shares;
                const gbpRatio = inv.livePrice > 0 ? inv.gbpValue / (inv.livePrice * inv.shares) : 1;
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid rgba(33,38,45,0.6)", background: "var(--ft-base)" }}>
                    <td style={{ padding: "6px 12px", color: "var(--ft-blue)", fontWeight: 700, fontSize: 12 }}>{inv.ticker}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-text)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{inv.shares}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-text)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{sym}{q.price.toFixed(2)}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-green)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{q.dividendYield.toFixed(2)}%</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-text)", fontSize: 11, fontVariantNumeric: "tabular-nums" }}>{sym}{annualPerShare.toFixed(4)}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-text)", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{sym}{totalRow.toFixed(2)}</td>
                    <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-green)", fontSize: 11, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{formatGbp(totalRow * gbpRatio)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: "2px solid var(--ft-border2)", background: "rgba(63,185,80,0.04)" }}>
                <td colSpan={5} style={{ padding: "6px 12px", color: "var(--ft-dim)", fontSize: 11, fontWeight: 700 }}>ESTIMATED TOTAL ANNUAL DIVIDEND INCOME</td>
                <td colSpan={2} style={{ padding: "6px 12px", textAlign: "right", color: "var(--ft-green)", fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>
                  {formatGbp(totalAnnual)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
