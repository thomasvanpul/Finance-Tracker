import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  useGetDashboard,
  useListAccounts,
  useListTransactions,
  useListUpcoming,
  useListBudgets,
  useListGoals,
  useGetMarketQuotes,
} from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import type { WidgetId } from "@/contexts/widgets-context";

// ── Shared style constants ────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
const CLIP: React.CSSProperties = { whiteSpace: "nowrap", minWidth: 0 };
const LABEL: React.CSSProperties = { ...MONO, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.13em", textTransform: "uppercase" as const };

// ── Tile heights ──────────────────────────────────────────────────────────────
const TILE_H = 108; // half-width metric tile

// ── Half-width metric tile (Copilot style) ────────────────────────────────────

interface TileProps {
  label: string;
  accent: string;
  href: string;
  primary: string;
  primaryColor?: string;
  secondary?: string;
  secondaryColor?: string;
  badge?: string;
  badgeColor?: string;
  bar?: number;
  barColor?: string;
  trend?: "up" | "down" | "neutral";
}

function Tile({ label, accent, href, primary, primaryColor, secondary, secondaryColor, badge, badgeColor, bar, barColor, trend }: TileProps) {
  const trendSym = trend === "up" ? "▲" : trend === "down" ? "▼" : null;
  const trendCol = trend === "up" ? "var(--ft-green)" : trend === "down" ? "var(--ft-red)" : "var(--ft-dim)";
  return (
    <Link href={href} style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div
        style={{
          background: "var(--ft-surface)",
          border: "1px solid var(--ft-border)",
          borderTop: `3px solid ${accent}`,
          padding: "10px 12px 8px",
          display: "flex",
          flexDirection: "column",
          cursor: "pointer",
          WebkitTapHighlightColor: "transparent",
          height: TILE_H,
          overflow: "hidden",
          flex: 1,
          boxSizing: "border-box",
          gap: 0,
          position: "relative",
          touchAction: "manipulation",
        }}
        onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-raised)"; }}
        onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-surface)"; }}
        onTouchCancel={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-surface)"; }}
      >
        {/* Label row */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5, flexShrink: 0 }}>
          <span style={{ ...LABEL, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ color: accent, fontSize: 11, lineHeight: 1 }}>·</span>
            {label}
          </span>
          {(trendSym || badge) && (
            <span style={{ ...MONO, fontSize: 9, color: trendSym ? trendCol : (badgeColor ?? "var(--ft-dim)"), fontWeight: 700, flexShrink: 0, background: trendSym ? `color-mix(in srgb, ${trendCol} 10%, transparent)` : "transparent", padding: trendSym ? "1px 4px" : undefined }}>
              {trendSym ?? badge}
            </span>
          )}
        </div>

        {/* Primary value — big hero number */}
        <div style={{ ...MONO, ...CLIP, fontSize: 18, fontWeight: 700, color: primaryColor ?? "var(--ft-text)", lineHeight: 1, letterSpacing: "-0.03em", flex: 1, display: "flex", alignItems: "center" }}>
          <span style={{ ...CLIP }}>{primary}</span>
        </div>

        {/* Secondary text */}
        {secondary !== undefined && (
          <div style={{ ...MONO, ...CLIP, fontSize: 10, color: secondaryColor ?? "var(--ft-dim)", letterSpacing: "0.01em", marginTop: 4, flexShrink: 0 }}>
            {secondary}
          </div>
        )}

        {/* Progress bar — full-width at very bottom */}
        {bar !== undefined && (
          <div style={{ flexShrink: 0, marginTop: 7 }}>
            <div style={{ height: 4, background: "var(--ft-raised)", overflow: "hidden", borderRadius: 1 }}>
              <div style={{ height: "100%", width: `${Math.min(100, bar)}%`, background: barColor ?? accent, transition: "width 0.12s ease", borderRadius: 1 }} />
            </div>
          </div>
        )}
      </div>
    </Link>
  );
}

function LoadingTile({ label, accent }: { label: string; accent: string }) {
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: `3px solid ${accent}`, height: TILE_H, display: "flex", flexDirection: "column", justifyContent: "center", padding: "10px 12px", boxSizing: "border-box" }}>
      <span style={{ ...LABEL, opacity: 0.5 }}>{label}</span>
      <div style={{ height: 3, background: "var(--ft-raised)", marginTop: 8, borderRadius: 1 }}>
        <div style={{ height: "100%", width: "40%", background: `${accent}44`, borderRadius: 1 }} />
      </div>
    </div>
  );
}

// ── Full-width section card (Copilot style) ───────────────────────────────────

interface SectionCardProps {
  label: string;
  accent: string;
  href: string;
  linkLabel?: string;
  children: React.ReactNode;
}

function SectionCard({ label, accent, href, linkLabel = "VIEW ALL →", children }: SectionCardProps) {
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: `3px solid ${accent}`, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ft-border)", paddingLeft: 12, paddingRight: 4, height: 34, flexShrink: 0 }}>
        <span style={{ ...LABEL, color: "var(--ft-muted)" }}>{label}</span>
        <Link href={href} style={{ textDecoration: "none" }}>
          <span style={{ ...MONO, fontSize: 9, color: accent, fontWeight: 700, letterSpacing: "0.05em", padding: "0 10px", height: "100%", display: "flex", alignItems: "center" }}>
            {linkLabel}
          </span>
        </Link>
      </div>
      {/* Content */}
      <div style={{ padding: "8px 12px 10px" }}>
        {children}
      </div>
    </div>
  );
}

// ── Row components for section cards ─────────────────────────────────────────

function DataRow({ left, center, right, rightColor, height = 34 }: {
  left: React.ReactNode;
  center?: React.ReactNode;
  right?: React.ReactNode;
  rightColor?: string;
  height?: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", height, gap: 8, borderBottom: "1px solid var(--ft-border)", paddingBottom: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>{left}</div>
      {center && <div style={{ flexShrink: 0 }}>{center}</div>}
      {right !== undefined && (
        <div style={{ ...MONO, fontSize: 11, fontWeight: 700, color: rightColor ?? "var(--ft-text)", flexShrink: 0, letterSpacing: "-0.01em" }}>{right}</div>
      )}
    </div>
  );
}

function RowLabel({ text, sub }: { text: string; sub?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ ...MONO, ...CLIP, fontSize: 11, color: "var(--ft-text)" }}>{text}</div>
      {sub && <div style={{ ...MONO, ...CLIP, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.04em", textTransform: "uppercase" as const }}>{sub}</div>}
    </div>
  );
}

// ── Transaction row sub-component ────────────────────────────────────────────

type RecentTxRowProps = {
  description: string | null | undefined;
  date: string | undefined;
  category: string;
  gbpValue: number | null;
  type: string;
  isLast: boolean;
};

const TX_TYPE_COLOR_TILE: Record<string, string> = {
  income: "var(--ft-green)",
  expense: "var(--ft-red)",
  transfer: "var(--ft-amber)",
};

function RecentTxRow({ description, date, category, gbpValue, type, isLast }: RecentTxRowProps) {
  const [hov, setHov] = useState(false);
  const col = TX_TYPE_COLOR_TILE[type] ?? "var(--ft-muted)";
  const sign = type === "income" ? "+" : type === "expense" ? "−" : "";
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const txDate = date ? new Date(date + "T00:00:00") : null;
  const dateStr = txDate
    ? txDate.toDateString() === today.toDateString() ? "Today"
    : txDate.toDateString() === yesterday.toDateString() ? "Yesterday"
    : txDate.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "";
  const initial = (category ?? type ?? "?")[0].toUpperCase();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 52,
        borderBottom: isLast ? "none" : "1px solid var(--ft-border)",
        paddingLeft: 12,
        paddingRight: 12,
        paddingTop: 8,
        paddingBottom: 8,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
    >
      {/* Avatar circle */}
      <div style={{
        flexShrink: 0, width: 36, height: 36, borderRadius: "50%",
        background: `color-mix(in srgb, ${col} 15%, var(--ft-raised))`,
        border: `1.5px solid ${col}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: col }}>{initial}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...MONO, ...CLIP, fontSize: 13, fontWeight: 500, color: "var(--ft-text)", marginBottom: 3 }}>{description ?? "—"}</div>
        <div style={{ ...MONO, fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.03em" }}>
          {dateStr}{category ? ` · ${category}` : ""}
        </div>
      </div>
      <span className="pnum" style={{
        ...MONO, fontSize: 14, fontWeight: 700, color: gbpValue == null ? "var(--ft-dim)" : col, flexShrink: 0, letterSpacing: "-0.02em",
      }}>
        {gbpValue == null ? "—" : `${sign}${formatGbp(Math.abs(gbpValue))}`}
      </span>
    </div>
  );
}

// ── Market quote row sub-component ────────────────────────────────────────────

type CompactQuoteRowProps = {
  sym: string;
  name: string;
  price: string;
  pctStr: string;
  col: string;
  dir: string;
  isUp: boolean | null;
  isLast: boolean;
};

function CompactQuoteRow({ sym, name, price, pctStr, col, dir, isUp, isLast }: CompactQuoteRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        height: 36,
        borderBottom: isLast ? "none" : "1px solid var(--ft-border)",
        paddingLeft: 12,
        paddingRight: 10,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <span style={{ ...MONO, fontSize: 11, fontWeight: 700, color: "var(--ft-text)", width: 36, flexShrink: 0 }}>{sym}</span>
      <span style={{ ...MONO, ...CLIP, fontSize: 10, color: "var(--ft-dim)", flex: 1 }}>{name}</span>
      <span className="pnum" style={{ ...MONO, fontSize: 11, fontWeight: 700, color: "var(--ft-text)", width: 58, textAlign: "right" as const, flexShrink: 0, letterSpacing: "-0.01em" }}>{price}</span>
      <span style={{
        ...MONO, fontSize: 10, fontWeight: 700,
        color: col,
        background: isUp === true ? "color-mix(in srgb, var(--ft-green) 13%, transparent)"
          : isUp === false ? "color-mix(in srgb, var(--ft-red) 13%, transparent)"
          : "transparent",
        border: isUp !== null
          ? `1px solid ${isUp ? "color-mix(in srgb, var(--ft-green) 28%, transparent)" : "color-mix(in srgb, var(--ft-red) 28%, transparent)"}`
          : "1px solid transparent",
        padding: "1px 5px",
        minWidth: 62,
        textAlign: "right" as const,
        flexShrink: 0,
        letterSpacing: "-0.01em",
      }}>
        {dir} {pctStr}
      </span>
    </div>
  );
}

// ── Cash flow column sub-component ────────────────────────────────────────────

type CashFlowColProps = {
  label: string;
  value: string;
  color: string;
  borderRight: boolean;
};

function CashFlowCol({ label, value, color, borderRight }: CashFlowColProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{
        flex: 1,
        minWidth: 0,
        padding: "12px 12px 12px",
        borderRight: borderRight ? "1px solid var(--ft-border)" : "none",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
        overflow: "hidden",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ ...MONO, fontSize: 9, color, letterSpacing: "0.1em", marginBottom: 6, textTransform: "uppercase" as const, whiteSpace: "nowrap" }}>{label}</div>
      <div className="pnum" style={{ ...MONO, ...CLIP, fontSize: 16, fontWeight: 700, color, lineHeight: 1, letterSpacing: "-0.02em" }}>{value}</div>
    </div>
  );
}

// ── Compact widget implementations ───────────────────────────────────────────

// net-worth: FULL WIDTH — hero card
export function CompactNetWorth() {
  const { data: dash, isLoading } = useGetDashboard();
  const nw = dash?.netWorth ?? null;
  // Three states, never conflated: loading → skeleton on the hero, unknown →
  // "—", real 0 → "£0.00". A `?? 0` here would silently render £0 IN / £0 OUT
  // during load and read as "you earn and spend nothing".
  const income = dash?.thisMonth?.income ?? null;
  const expenses = dash?.thisMonth?.expenses ?? null;
  const savingsRate = dash?.thisMonth?.savingsRate ?? null;
  const net = income != null && expenses != null ? income - expenses : null;
  const now = new Date();
  const monthLabel = now.toLocaleString("en-GB", { month: "long", year: "numeric" });

  if (isLoading || nw === null) return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: "3px solid var(--ft-accent)", padding: "20px 14px" }}>
      <span style={{ ...LABEL, opacity: 0.5 }}>NET WORTH</span>
      <div style={{ ...MONO, fontSize: 34, fontWeight: 700, color: "var(--ft-dim)", letterSpacing: "-0.04em", lineHeight: 1, marginTop: 8 }}>
        {isLoading ? "…" : "—"}
      </div>
    </div>
  );

  const netColor = net != null && net >= 0 ? "var(--ft-green)" : "var(--ft-red)";
  const nwColor = nw >= 0 ? "var(--ft-text)" : "var(--ft-red)";
  const sign = net != null && net >= 0 ? "+" : "−";

  return (
    <Link href="/net-worth" style={{ display: "block" }}>
      <div
        style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderTop: "3px solid var(--ft-accent)", cursor: "pointer", WebkitTapHighlightColor: "transparent" }}
        onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-raised)"; }}
        onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-surface)"; }}
        onTouchCancel={e => { (e.currentTarget as HTMLDivElement).style.background = "var(--ft-surface)"; }}
      >
        {/* Header bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ft-border)", paddingLeft: 12, paddingRight: 12, height: 30 }}>
          <span style={{ ...LABEL }}>NET WORTH</span>
          <span style={{ ...MONO, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>{monthLabel}</span>
        </div>
        {/* Big number */}
        <div style={{ padding: "14px 14px 12px" }}>
          <div className="pnum" style={{ ...MONO, fontSize: 34, fontWeight: 700, color: nwColor, letterSpacing: "-0.04em", lineHeight: 1, marginBottom: 8, whiteSpace: "nowrap" }}>
            {formatGbp(nw)}
          </div>
          {/* MTD delta pill */}
          {net != null && net !== 0 && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 4, background: `color-mix(in srgb, ${netColor} 12%, transparent)`, border: `1px solid ${netColor}44`, padding: "3px 8px", marginBottom: 10 }}>
              <span style={{ ...MONO, fontSize: 10, fontWeight: 700, color: netColor, letterSpacing: "-0.01em" }}>
                {sign}{formatGbp(Math.abs(net))} this month
              </span>
            </div>
          )}
          {/* 3-stat strip: IN / OUT / SAVED. Requires all three fields to be
              non-null; if any is missing, the strip stays hidden rather than
              rendering "£0" as a placeholder. */}
          {income != null && expenses != null && savingsRate != null && income > 0 && (
            <div style={{ display: "flex", borderTop: "1px solid var(--ft-border)", paddingTop: 10, gap: 0 }}>
              {[
                { label: "IN", value: formatGbp(income), color: "var(--ft-green)" },
                { label: "OUT", value: formatGbp(expenses), color: "var(--ft-red)" },
                { label: "SAVED", value: `${savingsRate.toFixed(0)}%`, color: savingsRate >= 20 ? "var(--ft-green)" : savingsRate >= 10 ? "var(--ft-amber)" : "var(--ft-red)" },
              ].map((stat, i) => (
                <div key={stat.label} style={{ flex: 1, textAlign: "center", borderRight: i < 2 ? "1px solid var(--ft-border)" : "none", padding: "0 4px" }}>
                  <div style={{ ...MONO, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.12em", marginBottom: 3, textTransform: "uppercase" as const }}>{stat.label}</div>
                  <div className="pnum" style={{ ...MONO, fontSize: 14, fontWeight: 700, color: stat.color, letterSpacing: "-0.02em", whiteSpace: "nowrap" }}>{stat.value}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

// accounts-summary: FULL WIDTH — account list card
export function CompactAccountsSummary() {
  const { data: accounts = [] } = useListAccounts({});
  const total = useMemo(() => accounts.reduce((s, a) => s + (a.gbpEquivalent ?? 0), 0), [accounts]);
  const sorted = useMemo(() => [...accounts].sort((a, b) => (b.gbpEquivalent ?? -Infinity) - (a.gbpEquivalent ?? -Infinity)).slice(0, 5), [accounts]);
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-cyan)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ft-border)", paddingLeft: 12, paddingRight: 4, height: 34 }}>
        <span style={{ ...MONO, fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.13em", textTransform: "uppercase" as const }}>ACCOUNTS</span>
        <Link href="/accounts" style={{ textDecoration: "none" }}>
          <span style={{ ...MONO, fontSize: 9, color: "var(--ft-cyan)", fontWeight: 700, letterSpacing: "0.05em", padding: "0 12px", height: 34, display: "flex", alignItems: "center" }}>
            {accounts.length} LINKED →
          </span>
        </Link>
      </div>
      {/* Total */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "10px 12px 8px", borderBottom: "1px solid var(--ft-border)" }}>
        <span className="pnum" style={{ ...MONO, fontSize: 22, fontWeight: 700, color: total !== 0 ? (total >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)", letterSpacing: "-0.03em", lineHeight: 1 }}>{formatGbp(total)}</span>
        <span style={{ ...MONO, fontSize: 10, color: "var(--ft-dim)" }}>total cash</span>
      </div>
      {/* Account rows */}
      {sorted.length === 0 ? (
        <div style={{ ...MONO, fontSize: 10, color: "var(--ft-muted)", padding: "12px" }}>No accounts linked</div>
      ) : sorted.map((acc, i) => (
        <div key={acc.id ?? i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: i < sorted.length - 1 ? "1px solid var(--ft-border)" : "none" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ ...MONO, ...CLIP, fontSize: 13, color: "var(--ft-text)", fontWeight: 500 }}>{acc.name}</div>
            <div style={{ ...MONO, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginTop: 2 }}>{acc.currency}</div>
          </div>
          <span className="pnum" style={{ ...MONO, fontSize: 15, fontWeight: 700, color: acc.gbpEquivalent == null ? "var(--ft-dim)" : acc.gbpEquivalent >= 0 ? "var(--ft-text)" : "var(--ft-red)", letterSpacing: "-0.02em", flexShrink: 0 }}>
            {acc.gbpEquivalent == null ? "—" : formatGbp(acc.gbpEquivalent)}
          </span>
        </div>
      ))}
      {accounts.length > 5 && (
        <div style={{ ...MONO, fontSize: 9, color: "var(--ft-dim)", textAlign: "right", padding: "6px 12px", borderTop: "1px solid var(--ft-border)" }}>
          +{accounts.length - 5} more →
        </div>
      )}
    </div>
  );
}

// recent-transactions: FULL WIDTH
export function CompactRecentTransactions() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const { data: txs = [] } = useListTransactions({ dateFrom: monthStart, limit: 7 } as Parameters<typeof useListTransactions>[0]);
  const rows = txs.slice(0, 7);
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-blue)", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ft-border)", paddingLeft: 12, paddingRight: 4, height: 34, flexShrink: 0 }}>
        <span style={{ ...MONO, fontSize: 9, color: "var(--ft-muted)", letterSpacing: "0.13em", textTransform: "uppercase" as const }}>RECENT TRANSACTIONS</span>
        <Link href="/transactions" style={{ textDecoration: "none" }}>
          <span style={{ ...MONO, fontSize: 9, color: "var(--ft-blue)", fontWeight: 700, letterSpacing: "0.05em", padding: "0 12px", height: 34, display: "flex", alignItems: "center" }}>
            VIEW ALL →
          </span>
        </Link>
      </div>
      {rows.length === 0 ? (
        <div style={{ ...MONO, fontSize: 10, color: "var(--ft-muted)", padding: "16px 12px" }}>No transactions this month</div>
      ) : (
        rows.map((t, i) => (
          <RecentTxRow
            key={t.id ?? i}
            description={t.description}
            date={t.date}
            category={t.category}
            gbpValue={t.gbpValue}
            type={t.type}
            isLast={i === rows.length - 1}
          />
        ))
      )}
    </div>
  );
}

// spending-breakdown: HALF WIDTH
export function CompactSpendingBreakdown() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const { data: txs = [] } = useListTransactions({ type: "expense", dateFrom: monthStart } as Parameters<typeof useListTransactions>[0]);
  const top2 = useMemo(() => {
    const map: Record<string, number> = {};
    txs.forEach(t => { map[t.category] = (map[t.category] ?? 0) + Math.abs(t.gbpValue ?? 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 2);
  }, [txs]);
  const top = top2[0] ?? null;
  const second = top2[1] ?? null;
  return (
    <Tile
      label="TOP SPEND"
      accent="#e3b341"
      href="/analytics"
      primary={top ? top[0] : "No spend yet"}
      secondary={top ? `${formatGbp(top[1])}${second ? ` · ${second[0]}` : ""}` : "Add transactions"}
    />
  );
}

// cash-flow: FULL WIDTH — three equal columns
export function CompactCashFlow() {
  const { data: dash } = useGetDashboard();
  const income = dash?.thisMonth?.income ?? null;
  const expenses = dash?.thisMonth?.expenses ?? null;
  if (income === null) return <LoadingTile label="CASH FLOW" accent="var(--ft-green)" />;
  // income is guaranteed above; expenses may still be null. Never re-default
  // to 0 here — a "£0" OUT column next to a real IN column reads as "spent
  // nothing", not "no data yet". Each column decides its own value.
  const net = expenses != null ? income - expenses : null;
  const netColor = net == null ? "var(--ft-dim)" : net !== 0 ? (net >= 0 ? "var(--ft-green)" : "var(--ft-red)") : "var(--ft-muted)";
  const sign = net != null && net >= 0 ? "+" : "";
  const incomeColor = income > 0 ? "var(--ft-green)" : "var(--ft-muted)";
  const expensesColor = expenses == null ? "var(--ft-dim)" : expenses > 0 ? "var(--ft-red)" : "var(--ft-muted)";
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderLeft: "3px solid var(--ft-green)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ft-border)", paddingLeft: 12, paddingRight: 12, height: 34 }}>
        <span style={{ ...LABEL, color: "var(--ft-muted)" }}>CASH FLOW</span>
        <span style={{ ...MONO, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>THIS MONTH</span>
      </div>
      <div style={{ display: "flex", alignItems: "stretch" }}>
        <CashFlowCol label="IN"  value={formatGbp(income)}                            color={incomeColor}   borderRight={true} />
        <CashFlowCol label="OUT" value={expenses == null ? "—" : formatGbp(expenses)} color={expensesColor} borderRight={true} />
        <CashFlowCol label="NET" value={net == null ? "—" : `${sign}${formatGbp(net)}`} color={netColor}    borderRight={false} />
      </div>
    </div>
  );
}

// budget-tracker: HALF WIDTH
export function CompactBudgetTracker() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const { data: budgets = [] } = useListBudgets();
  const { data: txs = [] } = useListTransactions({ type: "expense", dateFrom: monthStart } as Parameters<typeof useListTransactions>[0]);
  const { over, total, worstPct } = useMemo(() => {
    const spend: Record<string, number> = {};
    txs.forEach(t => { spend[t.category] = (spend[t.category] ?? 0) + Math.abs(t.gbpValue ?? 0); });
    let over = 0; let total = 0; let worstPct = 0;
    budgets.forEach(b => {
      total++;
      const pct = (spend[b.category] ?? 0) / b.monthlyLimit * 100;
      worstPct = Math.max(worstPct, pct);
      if (pct > 100) over++;
    });
    return { over, total, worstPct };
  }, [budgets, txs]);
  const color = over > 0 ? "var(--ft-red)" : worstPct > 75 ? "#e3b341" : "var(--ft-green)";
  return (
    <Tile
      label="BUDGETS"
      accent={color}
      href="/budget"
      primary={total === 0 ? "Set budgets" : over === 0 ? "On track" : `${over}/${total} over`}
      primaryColor={color}
      secondary={total > 0 ? `${total} categor${total !== 1 ? "ies" : "y"}` : "Tap to add"}
      bar={total > 0 ? Math.min(100, worstPct) : undefined}
      barColor={color}
      trend={over > 0 ? "down" : total > 0 ? "up" : undefined}
    />
  );
}

// savings-goals: HALF WIDTH
export function CompactSavingsGoals() {
  const { data: goals = [] } = useListGoals();
  const top = useMemo(() => {
    const active = goals.filter(g => g.current < g.target);
    return active.sort((a, b) => (b.current / b.target) - (a.current / a.target))[0] ?? null;
  }, [goals]);
  const pct = top ? Math.round((top.current / top.target) * 100) : null;
  const accent = pct !== null ? (pct >= 75 ? "var(--ft-green)" : pct >= 40 ? "#e3b341" : "var(--ft-blue)") : "var(--ft-blue)";
  return (
    <Tile
      label="GOALS"
      accent={accent}
      href="/goals"
      primary={top ? top.name : "No goals yet"}
      secondary={top ? `${pct}% · ${formatGbp(top.target - top.current)} left` : "Tap to add"}
      bar={pct ?? undefined}
      barColor={accent}
    />
  );
}

// subscription-tracker: HALF WIDTH
export function CompactSubscriptionTracker() {
  const { data: upcoming = [] } = useListUpcoming();
  const { total, count } = useMemo(() => {
    const subs = upcoming.filter(u => u.type === "expense" && (u.frequency === "monthly" || u.frequency === "yearly" || u.frequency === "weekly" || u.frequency === "quarterly"));
    return { total: subs.reduce((s, u) => s + (u.gbpEquivalent ?? 0), 0), count: subs.length };
  }, [upcoming]);
  return (
    <Tile
      label="SUBSCRIPTIONS"
      accent="var(--ft-blue)"
      href="/subscriptions"
      primary={total > 0 ? `${formatGbp(total)}/mo` : "None found"}
      secondary={count > 0 ? `${count} recurring` : "Sync to detect"}
      badge={count > 0 ? `${count}` : undefined}
      badgeColor="var(--ft-blue)"
    />
  );
}

// market-snapshot: FULL WIDTH
const MARKET_TICKERS_STR = "^FTSE,^GSPC,BTC-GBP,GBP=X";

const TICKER_LABELS: Record<string, { sym: string; name: string }> = {
  "^FTSE":   { sym: "FTSE", name: "FTSE 100" },
  "^GSPC":   { sym: "S&P",  name: "S&P 500"  },
  "BTC-GBP": { sym: "BTC",  name: "Bitcoin"   },
  "GBP=X":   { sym: "GBP",  name: "GBP/USD"  },
};

export function CompactMarketSnapshot() {
  const { data } = useGetMarketQuotes({ tickers: MARKET_TICKERS_STR }, { query: { refetchInterval: 5 * 60 * 1000 } as never });
  const quotes = data ?? [];
  const rows = quotes.slice(0, 4).map(q => {
    const pct = (q as { changePercent?: number | null }).changePercent;
    const isUp = pct != null ? pct >= 0 : null;
    const pctStr = pct != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "—";
    const col = isUp === true ? "var(--ft-green)" : isUp === false ? "var(--ft-red)" : "var(--ft-dim)";
    const dir = isUp === true ? "▲" : isUp === false ? "▼" : "";
    const meta = TICKER_LABELS[q.ticker ?? ""] ?? { sym: (q.ticker ?? "").replace(/^\^/, "").slice(0, 5), name: q.displayName ?? q.ticker ?? "" };
    const price = q.price != null
      ? q.price > 10000 ? formatGbp(q.price)
      : q.price > 100   ? q.price.toFixed(0)
      : q.price > 1     ? q.price.toFixed(2)
      : q.price.toFixed(4)
      : "—";
    return { sym: meta.sym, name: meta.name, price, pctStr, col, dir, isUp };
  });
  const isLive = quotes.length > 0;
  return (
    <SectionCard label="MARKETS" accent="var(--ft-cyan)" href="/portfolio" linkLabel={isLive ? "● LIVE" : "NO DATA"}>
      {rows.length === 0 ? (
        <div style={{ ...MONO, fontSize: 10, color: "var(--ft-muted)" }}>Loading market data…</div>
      ) : (
        <div style={{ margin: "0 -12px" }}>
          {rows.map((r, i) => (
            <CompactQuoteRow
              key={i}
              sym={r.sym}
              name={r.name}
              price={r.price}
              pctStr={r.pctStr}
              col={r.col}
              dir={r.dir}
              isUp={r.isUp}
              isLast={i === rows.length - 1}
            />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

// recurring-detector: HALF WIDTH
export function CompactRecurringDetector() {
  const { data: upcoming = [] } = useListUpcoming();
  const recurring = useMemo(() => upcoming.filter(u => u.frequency && u.frequency !== "one-time"), [upcoming]);
  const totalOut = useMemo(() => recurring.filter(u => u.type === "expense").reduce((s, u) => s + (u.gbpEquivalent ?? 0), 0), [recurring]);
  return (
    <Tile
      label="RECURRING"
      accent="var(--ft-blue)"
      href="/subscriptions"
      primary={recurring.length > 0 ? `${recurring.length} items` : "None found"}
      secondary={totalOut > 0 ? `${formatGbp(totalOut)}/mo` : "No charges"}
    />
  );
}

// financial-health: HALF WIDTH
export function CompactFinancialHealth() {
  const { data: dash } = useGetDashboard();
  const savingsRate = dash?.thisMonth?.savingsRate ?? null;
  const score = savingsRate !== null ? Math.min(100, Math.round(savingsRate * 1.5 + 30)) : null;
  const color = score !== null ? (score >= 70 ? "var(--ft-green)" : score >= 40 ? "#e3b341" : "var(--ft-red)") : "var(--ft-dim)";
  return (
    <Tile
      label="HEALTH SCORE"
      accent={color}
      href="/analytics"
      primary={score !== null ? `${score}/100` : "—"}
      primaryColor={color}
      secondary={score !== null ? (score >= 70 ? "Strong" : score >= 40 ? "Fair" : "Needs work") : "No data"}
      bar={score ?? undefined}
      barColor={color}
      trend={score !== null ? (score >= 70 ? "up" : "neutral") : undefined}
    />
  );
}

// transaction-calendar: HALF WIDTH
export function CompactTransactionCalendar() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const { data: txs = [] } = useListTransactions({ dateFrom: monthStart } as Parameters<typeof useListTransactions>[0]);
  const today = now.toISOString().slice(0, 10);
  const todaySpend = txs.filter(t => t.date === today && t.type === "expense").reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0);
  return (
    <Tile
      label="TODAY"
      accent="var(--ft-blue)"
      href="/transactions"
      primary={todaySpend > 0 ? formatGbp(todaySpend) : "£0"}
      secondary={`${txs.length} txns this month`}
    />
  );
}

// cash-flow-sankey: HALF WIDTH
export function CompactCashFlowSankey() {
  const { data: dash, isLoading } = useGetDashboard();
  // Distinguish loading from "no income yet". A `?? 0` coalesce would show
  // "No income" during load, which is a lie about what we know.
  const income = dash?.thisMonth?.income ?? null;
  const expenses = dash?.thisMonth?.expenses ?? null;
  const saved = income != null && expenses != null ? Math.max(0, income - expenses) : null;
  const savePct = income != null && income > 0 && saved != null ? Math.round((saved / income) * 100) : null;
  const hasIncome = income != null && income > 0;
  const primary = isLoading ? "…" : hasIncome ? formatGbp(income) : income == null ? "—" : "No income";
  const secondary = isLoading
    ? "Loading…"
    : hasIncome && expenses != null && savePct != null
      ? `${formatGbp(expenses)} out · ${savePct}% saved`
      : income == null
        ? "Waiting for data"
        : "Add transactions";
  return (
    <Tile
      label="FLOW"
      accent="var(--ft-cyan)"
      href="/analytics"
      primary={primary}
      secondary={secondary}
    />
  );
}

// month-comparison: HALF WIDTH
export function CompactMonthComparison() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const prevMonth = useMemo(() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; }, [now]);
  const prevEnd = useMemo(() => monthStart, [monthStart]);
  const { data: thisTxs = [] } = useListTransactions({ type: "expense", dateFrom: monthStart } as Parameters<typeof useListTransactions>[0]);
  const { data: prevTxs = [] } = useListTransactions({ type: "expense", dateFrom: prevMonth, dateTo: prevEnd } as Parameters<typeof useListTransactions>[0]);
  const thisTotal = useMemo(() => thisTxs.reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0), [thisTxs]);
  const prevTotal = useMemo(() => prevTxs.reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0), [prevTxs]);
  const delta = thisTotal - prevTotal;
  const color = delta <= 0 ? "var(--ft-green)" : "var(--ft-red)";
  const sign = delta >= 0 ? "+" : "";
  return (
    <Tile
      label="MOM SPEND"
      accent={color}
      href="/analytics"
      primary={formatGbp(thisTotal)}
      secondary={prevTotal > 0 ? `${sign}${formatGbp(delta)} vs last mo` : "Not enough data"}
      secondaryColor={prevTotal > 0 ? color : undefined}
      trend={delta <= 0 && prevTotal > 0 ? "up" : delta > 0 ? "down" : undefined}
    />
  );
}

// spending-forecast: HALF WIDTH
export function CompactSpendingForecast() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const { data: txs = [] } = useListTransactions({ type: "expense", dateFrom: monthStart } as Parameters<typeof useListTransactions>[0]);
  const forecast = useMemo(() => {
    const d = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const spent = txs.reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0);
    return d > 0 ? (spent / d) * daysInMonth : 0;
  }, [txs, now]);
  return (
    <Tile
      label="FORECAST"
      accent="#e3b341"
      href="/analytics"
      primary={forecast > 0 ? formatGbp(Math.round(forecast)) : "—"}
      secondary="Projected month-end"
    />
  );
}

// daily-spend: HALF WIDTH
export function CompactDailySpend() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const { data: todayTxs = [] } = useListTransactions({ type: "expense", dateFrom: today } as Parameters<typeof useListTransactions>[0]);
  const todaySpend = useMemo(() => todayTxs.reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0), [todayTxs]);
  return (
    <Tile
      label="TODAY SPEND"
      accent="var(--ft-amber)"
      href="/transactions"
      primary={formatGbp(todaySpend)}
      secondary={`${todayTxs.length} txn${todayTxs.length !== 1 ? "s" : ""} today`}
    />
  );
}

// top-merchants: HALF WIDTH
export function CompactTopMerchants() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const { data: txs = [] } = useListTransactions({ type: "expense", dateFrom: monthStart } as Parameters<typeof useListTransactions>[0]);
  const top = useMemo(() => {
    const map: Record<string, number> = {};
    txs.forEach(t => { const m = t.description ?? "Unknown"; map[m] = (map[m] ?? 0) + Math.abs(t.gbpValue ?? 0); });
    return Object.entries(map).sort((a, b) => b[1] - a[1])[0] ?? null;
  }, [txs]);
  return (
    <Tile
      label="TOP MERCHANT"
      accent="var(--ft-amber)"
      href="/transactions"
      primary={top ? top[0] : "No txns yet"}
      secondary={top ? `${formatGbp(top[1])} this mo` : "Add transactions"}
    />
  );
}

// cash-flow-preview: HALF WIDTH
export function CompactCashFlowPreview() {
  const { data: accounts = [] } = useListAccounts({});
  const { data: upcoming = [] } = useListUpcoming();
  const balance = useMemo(() => accounts.reduce((s, a) => s + (a.gbpEquivalent ?? 0), 0), [accounts]);
  const now = useMemo(() => new Date(), []);
  const in30 = useMemo(() => new Date(now.getTime() + 30 * 86400000), [now]);
  const { inflows, outflows } = useMemo(() => {
    const pending = upcoming.filter(u => { const d = new Date(u.dueDate); return d >= now && d <= in30 && u.status === "pending"; });
    return {
      inflows: pending.filter(u => u.type === "income").reduce((s, u) => s + (u.gbpEquivalent ?? 0), 0),
      outflows: pending.filter(u => u.type === "expense").reduce((s, u) => s + (u.gbpEquivalent ?? 0), 0),
    };
  }, [upcoming, now, in30]);
  const net = inflows - outflows;
  const color = net >= 0 ? "var(--ft-green)" : "var(--ft-red)";
  return (
    <Tile
      label="30-DAY FLOW"
      accent="var(--ft-cyan)"
      href="/"
      primary={net !== 0 ? `${net >= 0 ? "+" : ""}${formatGbp(net)}` : formatGbp(balance)}
      primaryColor={net !== 0 ? color : "var(--ft-text)"}
      secondary={net !== 0 ? `from ${formatGbp(balance)}` : "No upcoming"}
      trend={net > 0 ? "up" : net < 0 ? "down" : undefined}
    />
  );
}

// spending-velocity: HALF WIDTH
export function CompactSpendingVelocity() {
  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, [now]);
  const { data: txs = [] } = useListTransactions({ type: "expense", dateFrom: monthStart } as Parameters<typeof useListTransactions>[0]);
  const dailyRate = useMemo(() => {
    const total = txs.reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0);
    return now.getDate() > 0 ? total / now.getDate() : 0;
  }, [txs, now]);
  return (
    <Tile
      label="SPEND RATE"
      accent="var(--ft-amber)"
      href="/analytics"
      primary={dailyRate > 0 ? `${formatGbp(dailyRate)}/day` : "£0/day"}
      secondary={`Day ${now.getDate()} of month`}
    />
  );
}

// savings-rate: HALF WIDTH
export function CompactSavingsRate() {
  const { data: dash } = useGetDashboard();
  const rate = dash?.thisMonth?.savingsRate ?? null;
  const color = rate !== null ? (rate >= 20 ? "var(--ft-green)" : rate >= 10 ? "#e3b341" : "var(--ft-red)") : "var(--ft-dim)";
  return (
    <Tile
      label="SAVE RATE"
      accent={color}
      href="/"
      primary={rate !== null ? `${Math.round(rate)}%` : "—"}
      primaryColor={color}
      secondary={rate !== null ? (rate >= 20 ? "≥20% target ✓" : `${Math.round(20 - rate)}pp below`) : "No data"}
      bar={rate !== null ? Math.min(100, (rate / 20) * 100) : undefined}
      barColor={color}
      trend={rate !== null ? (rate >= 20 ? "up" : "down") : undefined}
    />
  );
}

// emergency-fund: HALF WIDTH
export function CompactEmergencyFund() {
  const { data: accounts = [] } = useListAccounts({});
  const { data: allTxs = [] } = useListTransactions({});
  const { months, color } = useMemo(() => {
    const liquid = accounts.reduce((s, a) => s + (a.gbpEquivalent ?? 0), 0);
    const now = new Date();
    const expenses: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const tot = allTxs.filter(t => t.type === "expense" && t.date.startsWith(ym)).reduce((s, t) => s + Math.abs(t.gbpValue ?? 0), 0);
      if (tot > 0) expenses.push(tot);
    }
    const avg = expenses.length ? expenses.reduce((s, v) => s + v, 0) / expenses.length : 0;
    const months = avg > 0 ? liquid / avg : 0;
    const color = months < 3 ? "var(--ft-red)" : months < 6 ? "#e3b341" : "var(--ft-green)";
    return { months, color };
  }, [accounts, allTxs]);
  return (
    <Tile
      label="EMERGENCY FUND"
      accent={color}
      href="/accounts"
      primary={months > 0 ? `${months.toFixed(1)} mo` : "—"}
      primaryColor={color}
      secondary={months > 0 ? "of 6-month target" : "No history"}
      bar={months > 0 ? Math.min(100, (months / 6) * 100) : undefined}
      barColor={color}
      trend={months >= 6 ? "up" : months >= 3 ? "neutral" : "down"}
    />
  );
}

// nw-milestones: HALF WIDTH
export function CompactNwMilestones() {
  const { data: dash, isLoading } = useGetDashboard();
  const nw = dash?.netWorth ?? null;
  const MILESTONES = [1_000, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];
  const label = (n: number) => n >= 1_000_000 ? `£${n / 1_000_000}M` : n >= 1_000 ? `£${n / 1_000}K` : `£${n}`;
  if (nw == null) {
    return (
      <Tile
        label="MILESTONE"
        accent="var(--ft-accent)"
        href="/"
        primary="—"
        secondary={isLoading ? "Loading…" : "Waiting for net worth"}
      />
    );
  }
  const next = MILESTONES.find(m => nw < m);
  const pct = next ? Math.min(100, (nw / next) * 100) : 100;
  return (
    <Tile
      label="MILESTONE"
      accent="var(--ft-accent)"
      href="/"
      primary={next ? label(next) : "Max!"}
      secondary={next ? `${Math.round(pct)}% · ${formatGbp(next - nw)} left` : "All reached"}
      bar={pct}
      barColor="var(--ft-accent)"
    />
  );
}

// decision-engine: HALF WIDTH
export function CompactDecisionEngine() {
  const { data: accounts = [] } = useListAccounts({});
  const { data: txs = [] } = useListTransactions({ type: "expense" } as Parameters<typeof useListTransactions>[0]);
  const { data: budgets = [] } = useListBudgets();
  const { data: goals = [] } = useListGoals();
  const { count } = useMemo(() => {
    let count = 0;
    const totalCash = accounts.reduce((s, a) => s + (a.gbpEquivalent ?? 0), 0);
    if (totalCash > 5000) count++;
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const spend: Record<string, number> = {};
    txs.filter(t => t.date >= monthStart).forEach(t => { spend[t.category] = (spend[t.category] ?? 0) + Math.abs(t.gbpValue ?? 0); });
    budgets.forEach(b => { if ((spend[b.category] ?? 0) > b.monthlyLimit) count++; });
    goals.forEach(g => { if (g.deadline && g.current < g.target) { const days = (new Date(g.deadline).getTime() - now.getTime()) / 86400000; if (days < 180) count++; } });
    return { count };
  }, [accounts, txs, budgets, goals]);
  const color = count > 2 ? "var(--ft-red)" : count > 0 ? "#e3b341" : "var(--ft-green)";
  return (
    <Tile
      label="ACTIONS"
      accent={color}
      href="/decisions"
      primary={count === 0 ? "All clear" : `${count} action${count !== 1 ? "s" : ""}`}
      primaryColor={color}
      secondary={count === 0 ? "No issues found" : "Tap to review"}
      trend={count === 0 ? "up" : "down"}
    />
  );
}

// ── Full-width tile IDs (span both columns in mobile grid) ────────────────────

export const COMPACT_WIDGET_FULL_WIDTH: Set<WidgetId> = new Set([
  "net-worth",
  "recent-transactions",
  "cash-flow",
  "market-snapshot",
]);

// ── Registry — maps every WidgetId to its compact tile component ─────────────

export const COMPACT_WIDGET_COMPONENTS: Partial<Record<WidgetId, React.ComponentType>> = {
  "net-worth":            CompactNetWorth,
  "accounts-summary":     CompactAccountsSummary,
  "recent-transactions":  CompactRecentTransactions,
  "spending-breakdown":   CompactSpendingBreakdown,
  "cash-flow":            CompactCashFlow,
  "budget-tracker":       CompactBudgetTracker,
  "savings-goals":        CompactSavingsGoals,
  "subscription-tracker": CompactSubscriptionTracker,
  "market-snapshot":      CompactMarketSnapshot,
  "recurring-detector":   CompactRecurringDetector,
  "financial-health":     CompactFinancialHealth,
  "transaction-calendar": CompactTransactionCalendar,
  "cash-flow-sankey":     CompactCashFlowSankey,
  "month-comparison":     CompactMonthComparison,
  "spending-forecast":    CompactSpendingForecast,
  "daily-spend":          CompactDailySpend,
  "top-merchants":        CompactTopMerchants,
  "cash-flow-preview":    CompactCashFlowPreview,
  "spending-velocity":    CompactSpendingVelocity,
  "savings-rate":         CompactSavingsRate,
  "emergency-fund":       CompactEmergencyFund,
  "nw-milestones":        CompactNwMilestones,
  "decision-engine":      CompactDecisionEngine,
};

// Unused but kept for potential future use
export { DataRow, RowLabel };
