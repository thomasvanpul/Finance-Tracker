import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  BookOpen,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  X,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatGbp } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Text, MonoLabel } from "@/components/primitives";

// ── Types ──────────────────────────────────────────────────────────────────────

type TradeDirection = "long" | "short";
type TradeStatus = "open" | "closed";
type TradeSetup = "breakout" | "pullback" | "reversal" | "momentum" | "value" | "other";
type SortField = "date" | "pnl" | "ticker";
type SortDir = "asc" | "desc";

interface Trade {
  id: string;
  date: string;
  closeDate?: string;
  ticker: string;
  direction: TradeDirection;
  status: TradeStatus;
  entryPrice: number;
  exitPrice?: number;
  quantity: number;
  currency: string;
  setup: TradeSetup;
  notes: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  execution: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

interface TradeForm {
  ticker: string;
  date: string;
  closeDate: string;
  direction: TradeDirection;
  status: TradeStatus;
  entryPrice: string;
  exitPrice: string;
  quantity: string;
  currency: string;
  setup: TradeSetup;
  notes: string;
  confidence: 1 | 2 | 3 | 4 | 5;
  execution: 1 | 2 | 3 | 4 | 5;
  tags: string;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const LS_KEY = "ft-trading-journal-trades";

const SETUPS: TradeSetup[] = ["breakout", "pullback", "reversal", "momentum", "value", "other"];
const CURRENCIES = ["GBP", "USD", "EUR", "JPY", "CHF", "CAD", "AUD"];

const EMPTY_FORM: TradeForm = {
  ticker: "",
  date: new Date().toISOString().slice(0, 10),
  closeDate: "",
  direction: "long",
  status: "open",
  entryPrice: "",
  exitPrice: "",
  quantity: "",
  currency: "GBP",
  setup: "breakout",
  notes: "",
  confidence: 3,
  execution: 3,
  tags: "",
};

// ── Storage ───────────────────────────────────────────────────────────────────

function loadTrades(): Trade[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as Trade[]) : [];
  } catch {
    return [];
  }
}

function saveTrades(trades: Trade[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(trades));
  } catch {
    // ignore
  }
}

// ── Computed helpers ───────────────────────────────────────────────────────────

function calcPnl(trade: Trade): number {
  if (trade.status !== "closed" || trade.exitPrice == null) return 0;
  const { direction, entryPrice, exitPrice, quantity } = trade;
  return direction === "long"
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;
}

function calcPnlPct(trade: Trade): number {
  if (trade.status !== "closed" || trade.exitPrice == null) return 0;
  const { direction, entryPrice, exitPrice } = trade;
  return direction === "long"
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : ((entryPrice - exitPrice) / entryPrice) * 100;
}

function daysHeld(trade: Trade): number {
  const start = new Date(trade.date);
  const end = trade.closeDate ? new Date(trade.closeDate) : new Date();
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

function fmtPrice(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function fmtPct(n: number): string {
  return (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const d = new Date(parseInt(y), parseInt(m) - 1, 1);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

// ── Risk metrics ───────────────────────────────────────────────────────────────

function calcMaxDrawdown(closedByDate: Trade[]): number {
  let peak = 0;
  let running = 0;
  let maxDD = 0;
  for (const t of closedByDate) {
    running += calcPnl(t);
    if (running > peak) peak = running;
    const dd = peak - running;
    if (dd > maxDD) maxDD = dd;
  }
  return maxDD;
}

function calcSharpeRatio(closedByDate: Trade[]): number | null {
  if (closedByDate.length < 3) return null;
  const pnls = closedByDate.map(calcPnl);
  const mean = pnls.reduce((s, v) => s + v, 0) / pnls.length;
  const variance = pnls.reduce((s, v) => s + (v - mean) ** 2, 0) / pnls.length;
  const std = Math.sqrt(variance);
  if (std === 0) return null;
  return mean / std;
}

function calcCurrentStreak(closedByDate: Trade[]): { type: "win" | "loss" | null; count: number } {
  if (closedByDate.length === 0) return { type: null, count: 0 };
  const last = closedByDate[closedByDate.length - 1];
  const type: "win" | "loss" = calcPnl(last) > 0 ? "win" : "loss";
  let count = 0;
  for (let i = closedByDate.length - 1; i >= 0; i--) {
    const isWin = calcPnl(closedByDate[i]) > 0;
    if ((type === "win" && isWin) || (type === "loss" && !isWin)) count++;
    else break;
  }
  return { type, count };
}

// ── Win rate color helper (module level) ──────────────────────────────────────

function winRateColor(pct: number): string {
  if (pct >= 60) return "var(--ft-green)";
  if (pct >= 40) return "var(--ft-amber)";
  return "var(--ft-red)";
}

// ── Style atoms ────────────────────────────────────────────────────────────────

const mono: React.CSSProperties = { fontFamily: "var(--font-mono)" };

const panel: React.CSSProperties = {
  background: "var(--ft-surface)",
  border: "1px solid var(--ft-border)",
  marginBottom: 16,
};

const sectionHead: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--ft-dim)",
  padding: "8px 16px",
  borderBottom: "1px solid var(--ft-border)",
  background: "var(--ft-base)",
};

const th: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
  textAlign: "left",
  padding: "5px 10px",
  fontWeight: 400,
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
  background: "var(--ft-base)",
};

const td: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  color: "var(--ft-text)",
  padding: "7px 10px",
  borderBottom: "1px solid var(--ft-border)",
  whiteSpace: "nowrap",
};

const inputStyle: React.CSSProperties = {
  ...mono,
  fontSize: 12,
  background: "var(--ft-raised)",
  border: "1px solid var(--ft-border2)",
  color: "var(--ft-text)",
  padding: "0 9px",
  height: 32,
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  ...mono,
  fontSize: 9,
  color: "var(--ft-dim)",
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

const btnPrimary: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  padding: "6px 14px",
  background: "var(--ft-accent)",
  color: "var(--ft-base)",
  border: "none",
  cursor: "pointer",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  transition: "background 0.1s",
};

const btnGhost: React.CSSProperties = {
  ...mono,
  fontSize: 11,
  padding: "6px 12px",
  background: "transparent",
  color: "var(--ft-muted)",
  border: "1px solid var(--ft-border)",
  cursor: "pointer",
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  transition: "background 0.1s",
};

// ── Custom tooltip ─────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "6px 10px" }}>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginBottom: 2 }}>{label}</div>
      <div style={{ ...mono, fontSize: 12, color: val >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
        <span className="pnum">{val >= 0 ? "+" : ""}{formatGbp(val)}</span>
      </div>
    </div>
  );
}

function PnlBarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "6px 10px" }}>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginBottom: 2 }}>{label}</div>
      <div style={{ ...mono, fontSize: 12, color: val >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
        <span className="pnum">{val >= 0 ? "+" : ""}{formatGbp(val)}</span>
      </div>
    </div>
  );
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; name: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border)", padding: "6px 10px" }}>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.name} style={{ ...mono, fontSize: 11, color: "var(--ft-text)" }}>
          {p.name}: <span className="pnum">{p.name === "Win %" ? p.value.toFixed(1) + "%" : formatGbp(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── Star Rating ────────────────────────────────────────────────────────────────

function StarRating({ value, onChange }: { value: 1 | 2 | 3 | 4 | 5; onChange: (v: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div style={{ display: "flex", gap: 3 }}>
      {([1, 2, 3, 4, 5] as const).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          style={{
            ...mono,
            fontSize: 14,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: n <= value ? "var(--ft-accent)" : "var(--ft-border2)",
            padding: "0 1px",
            transition: "color 0.1s",
          }}
        >
          ★
        </button>
      ))}
    </div>
  );
}

// ── KPI Cell ───────────────────────────────────────────────────────────────────

function KpiCell({
  label,
  value,
  color,
  sub,
  hero,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
  hero?: boolean;
}) {
  return (
    <div
      style={{
        padding: "10px 14px",
        minWidth: 0,
        background: "var(--ft-surface)",
      }}
    >
      <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      <div style={{ ...mono, fontSize: hero ? 20 : 16, fontWeight: 700, color: color ?? "var(--ft-text)", fontVariantNumeric: "tabular-nums", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span className="pnum">{value}</span>
      </div>
      {sub && <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ── Streak Cell ────────────────────────────────────────────────────────────────

function StreakCell({ streak }: { streak: { type: "win" | "loss" | null; count: number } }) {
  if (!streak.type) {
    return (
      <div style={{ padding: "10px 14px", background: "var(--ft-surface)" }}>
        <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Current Streak</div>
        <div style={{ ...mono, fontSize: 16, fontWeight: 700, color: "var(--ft-dim)" }}>—</div>
      </div>
    );
  }
  const isWin = streak.type === "win";
  const color = isWin ? "var(--ft-green)" : "var(--ft-red)";
  const bars = Math.min(streak.count, 8);
  return (
    <div style={{ padding: "10px 14px", background: "var(--ft-surface)" }}>
      <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 5 }}>Current Streak</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ ...mono, fontSize: 16, fontWeight: 700, color }}>
          <span className="pnum">{streak.count}{isWin ? "W" : "L"}</span>
        </div>
        <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
          {Array.from({ length: bars }, (_, i) => (
            <div
              key={i}
              style={{
                width: 4,
                height: 4 + i * 2,
                background: color,
                opacity: 0.6 + (i / bars) * 0.4,
              }}
            />
          ))}
        </div>
      </div>
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>{isWin ? "winning" : "losing"} run</div>
    </div>
  );
}

// ── Direction badge ────────────────────────────────────────────────────────────

function DirectionBadge({ direction }: { direction: TradeDirection }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 8,
        fontWeight: 700,
        letterSpacing: "0.06em",
        color: direction === "long" ? "var(--ft-green)" : "var(--ft-red)",
        border: `1px solid ${direction === "long" ? "var(--ft-green)" : "var(--ft-red)"}`,
        background: direction === "long" ? "color-mix(in srgb, var(--ft-green) 10%, transparent)" : "color-mix(in srgb, var(--ft-red) 10%, transparent)",
        padding: "1px 5px",
      }}
    >
      {direction.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: TradeStatus }) {
  return (
    <span
      style={{
        ...mono,
        fontSize: 9,
        letterSpacing: "0.06em",
        color: status === "open" ? "var(--ft-amber)" : "var(--ft-dim)",
        border: `1px solid ${status === "open" ? "var(--ft-amber)" : "var(--ft-border)"}`,
        padding: "1px 5px",
      }}
    >
      {status.toUpperCase()}
    </span>
  );
}

// ── Best / Worst callout ───────────────────────────────────────────────────────

function TradeCallouts({ closed }: { closed: Trade[] }) {
  const best = useMemo(() => {
    if (closed.length === 0) return null;
    return closed.reduce((top, t) => calcPnl(t) > calcPnl(top) ? t : top);
  }, [closed]);
  const worst = useMemo(() => {
    if (closed.length === 0) return null;
    return closed.reduce((bot, t) => calcPnl(t) < calcPnl(bot) ? t : bot);
  }, [closed]);

  if (!best && !worst) return null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1, marginBottom: 16, background: "var(--ft-border)" }}>
      {[
        { label: "Best Trade", trade: best, color: "var(--ft-green)", icon: "▲" },
        { label: "Worst Trade", trade: worst, color: "var(--ft-red)", icon: "▼" },
      ].map(({ label, trade, color, icon }) => (
        <div
          key={label}
          style={{
            padding: "12px 16px",
            background: "var(--ft-surface)",
            borderLeft: `3px solid ${color}`,
          }}
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
            <span style={{ ...mono, fontSize: 10, color, fontWeight: 700 }}>{icon} {label}</span>
          </div>
          {trade ? (
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "4px 12px", alignItems: "baseline" }}>
              <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.02em" }}>{trade.ticker}</span>
              <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>{fmtDate(trade.closeDate ?? trade.date)} · {trade.setup}</span>
              <span style={{ ...mono, fontSize: 14, fontWeight: 700, color }}>
                <span className="pnum">{calcPnl(trade) >= 0 ? "+" : ""}{formatGbp(calcPnl(trade))}</span>
              </span>
              <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", gridColumn: "1 / -1" }}>
                <span className="pnum">{fmtPrice(trade.entryPrice)}</span> → <span className="pnum">{trade.exitPrice != null ? fmtPrice(trade.exitPrice) : "—"}</span> · <span className="pnum">{trade.quantity.toLocaleString()}</span> {trade.direction.toUpperCase()}
                <span style={{ marginLeft: 8, color }}><span className="pnum">{fmtPct(calcPnlPct(trade))}</span></span>
              </span>
            </div>
          ) : (
            <div style={{ ...mono, fontSize: 11, color: "var(--ft-dim)" }}>—</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── P&L Bar Chart ─────────────────────────────────────────────────────────────

function PnlBarsChart({ closed }: { closed: Trade[] }) {
  const data = useMemo(() => {
    return [...closed]
      .sort((a, b) => {
        const da = a.closeDate ?? a.date;
        const db = b.closeDate ?? b.date;
        return da < db ? -1 : da > db ? 1 : 0;
      })
      .map((t, i) => ({
        idx: i + 1,
        pnl: parseFloat(calcPnl(t).toFixed(2)),
        label: `${t.ticker} ${fmtDate(t.closeDate ?? t.date)}`,
        ticker: t.ticker,
      }));
  }, [closed]);

  if (data.length === 0) return null;

  return (
    <div style={panel}>
      <div style={{ ...sectionHead, borderLeft: "3px solid var(--ft-accent)" }}>
        P&amp;L Per Trade — Color-Coded
      </div>
      <div style={{ padding: "16px 8px 8px 8px", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" vertical={false} />
            <XAxis
              dataKey="idx"
              tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
              axisLine={false}
              tickLine={false}
              label={{ value: "Trade #", position: "insideBottom", offset: -2, fontSize: 8, fill: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}
            />
            <YAxis
              tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => (v >= 0 ? "+" : "") + formatGbp(v)}
              width={72}
            />
            <Tooltip content={<PnlBarTooltip />} />
            <ReferenceLine y={0} stroke="var(--ft-border2)" strokeDasharray="3 3" />
            <Bar dataKey="pnl" radius={0} maxBarSize={20}>
              {data.map((d) => (
                <Cell
                  key={d.idx}
                  fill={d.pnl > 0 ? "var(--ft-green)" : d.pnl < 0 ? "var(--ft-red)" : "var(--ft-dim)"}
                  opacity={0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Sort icon (module level) ───────────────────────────────────────────────────

function SortIcon({ field, sortField, sortDir }: { field: SortField; sortField: SortField; sortDir: SortDir }) {
  if (sortField !== field) return <span style={{ color: "var(--ft-border2)", marginLeft: 3 }}>⇅</span>;
  return sortDir === "asc" ? (
    <ArrowUp size={9} style={{ display: "inline", marginLeft: 3, verticalAlign: "middle" }} />
  ) : (
    <ArrowDown size={9} style={{ display: "inline", marginLeft: 3, verticalAlign: "middle" }} />
  );
}

// ── Open Position Card ────────────────────────────────────────────────────────

interface OpenPositionCardProps {
  trade: Trade;
  onEdit: (trade: Trade) => void;
  onDelete: (id: string) => void;
}

function OpenPositionCard({ trade, onEdit, onDelete }: OpenPositionCardProps) {
  const [hov, setHov] = useState(false);
  const days = daysHeld(trade);
  const unrealizedPnl = trade.exitPrice != null ? calcPnl(trade) : null;
  const unrealizedPct = trade.exitPrice != null ? calcPnlPct(trade) : null;

  return (
    <div
      style={{
        padding: "12px 16px",
        borderRight: "1px solid var(--ft-border)",
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ ...mono, fontSize: 14, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.02em" }}>
          {trade.ticker}
        </span>
        <DirectionBadge direction={trade.direction} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 0" }}>
        <div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>ENTRY</div>
          <div style={{ ...mono, fontSize: 12, color: "var(--ft-text)" }}><span className="pnum">{fmtPrice(trade.entryPrice)}</span></div>
        </div>
        <div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>QTY</div>
          <div style={{ ...mono, fontSize: 12, color: "var(--ft-text)" }}><span className="pnum">{trade.quantity.toLocaleString()}</span></div>
        </div>
        <div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>DAYS HELD</div>
          <div style={{ ...mono, fontSize: 12, color: "var(--ft-text)" }}><span className="pnum">{days}</span></div>
        </div>
        <div>
          <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>SETUP</div>
          <div style={{ ...mono, fontSize: 11, color: "var(--ft-muted)" }}>{trade.setup}</div>
        </div>
        {unrealizedPnl != null && (
          <div style={{ gridColumn: "1 / -1", marginTop: 6, paddingTop: 6, borderTop: "1px solid var(--ft-border)" }}>
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>UNREALIZED P&amp;L</div>
            <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: unrealizedPnl >= 0 ? "var(--ft-green)" : "var(--ft-red)" }}>
              <span className="pnum">{unrealizedPnl >= 0 ? "+" : ""}{fmtPrice(unrealizedPnl)} ({fmtPct(unrealizedPct ?? 0)})</span>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 6 }}>
        <button
          style={{ ...btnGhost, fontSize: 9, padding: "3px 8px" }}
          onClick={() => onEdit(trade)}
        >
          Edit
        </button>
        <button
          style={{ ...btnGhost, fontSize: 9, padding: "3px 8px", color: "var(--ft-red)", borderColor: "var(--ft-red)" }}
          onClick={() => onDelete(trade.id)}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// ── Trade Table Row ────────────────────────────────────────────────────────────

interface TradeRowProps {
  trade: Trade;
  isExpanded: boolean;
  rowBg: string;
  onToggleExpand: () => void;
  onEdit: (trade: Trade) => void;
  onDelete: (id: string) => void;
  onCollapse: () => void;
}

function TradeRow({ trade, isExpanded, rowBg, onToggleExpand, onEdit, onDelete, onCollapse }: TradeRowProps) {
  const [hov, setHov] = useState(false);
  const pnl = calcPnl(trade);
  const pct = calcPnlPct(trade);

  return (
    <>
      <tr
        style={{
          background: hov ? "var(--ft-raised)" : rowBg,
          cursor: "pointer",
          height: 36,
          transition: "background 0.1s",
        }}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        onTouchStart={() => setHov(true)}
        onTouchEnd={() => setHov(false)}
        onTouchCancel={() => setHov(false)}
        onClick={onToggleExpand}
      >
        <td style={{ ...td, fontSize: 9, color: "var(--ft-muted)", width: 72, minWidth: 72 }}>{fmtDate(trade.date)}</td>
        <td style={{ ...td, fontWeight: 700, fontSize: 12, letterSpacing: "0.03em", width: 60, minWidth: 60 }}>{trade.ticker}</td>
        <td style={{ ...td, width: 52, minWidth: 52 }}>
          <DirectionBadge direction={trade.direction} />
        </td>
        <td style={{ ...td, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
          <span className="pnum">{fmtPrice(trade.entryPrice)}</span>
        </td>
        <td style={{ ...td, textAlign: "right", color: "var(--ft-muted)", fontVariantNumeric: "tabular-nums" }}>
          <span className="pnum">{trade.exitPrice != null ? fmtPrice(trade.exitPrice) : "—"}</span>
        </td>
        <td
          style={{
            ...td,
            textAlign: "right",
            fontSize: 13,
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: trade.status === "closed"
              ? pnl > 0 ? "var(--ft-green)" : pnl < 0 ? "var(--ft-red)" : "var(--ft-dim)"
              : "var(--ft-dim)",
          }}
        >
          <span className="pnum">{trade.status === "closed" ? (pnl >= 0 ? "+" : "") + fmtPrice(pnl) : "—"}</span>
        </td>
        <td
          style={{
            ...td,
            textAlign: "right",
            fontVariantNumeric: "tabular-nums",
            color: trade.status === "closed"
              ? pct > 0 ? "var(--ft-green)" : pct < 0 ? "var(--ft-red)" : "var(--ft-dim)"
              : "var(--ft-dim)",
          }}
        >
          <span className="pnum">{trade.status === "closed" ? fmtPct(pct) : "—"}</span>
        </td>
        <td style={{ ...td, color: "var(--ft-muted)", fontSize: 10 }}>{trade.setup}</td>
        <td style={td}>
          <StatusBadge status={trade.status} />
        </td>
        <td style={{ ...td, textAlign: "center" }}>
          <Text as="span" color="var(--ft-accent)">{"★".repeat(trade.confidence)}</Text>
          <span style={{ color: "var(--ft-dim)", margin: "0 3px" }}>/</span>
          <Text as="span" color="var(--ft-blue)">{"★".repeat(trade.execution)}</Text>
        </td>
        <td style={{ ...td, textAlign: "center" }}>
          <div style={{ display: "flex", gap: 4, justifyContent: "center" }}>
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(trade); }}
              style={{ ...mono, fontSize: 9, padding: "2px 7px", background: "transparent", border: "1px solid var(--ft-border)", color: "var(--ft-muted)", cursor: "pointer" }}
            >
              Edit
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(trade.id); }}
              style={{ ...mono, fontSize: 9, padding: "2px 7px", background: "transparent", border: "1px solid var(--ft-border)", color: "var(--ft-red)", cursor: "pointer" }}
            >
              <Trash2 size={10} />
            </button>
          </div>
        </td>
      </tr>
      {isExpanded && (
        <tr style={{ background: "var(--ft-base)" }}>
          <td colSpan={11} style={{ padding: "12px 16px", borderBottom: "1px solid var(--ft-border)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px 24px", alignItems: "start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", marginBottom: 4 }}>JOURNAL NOTES</div>
                <div style={{ ...mono, fontSize: 10, color: "var(--ft-text)", lineHeight: 1.6 }}>
                  {trade.notes || <Text as="span" color="var(--ft-dim)">No notes recorded.</Text>}
                </div>
              </div>
              <div>
                {trade.tags.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", marginBottom: 4 }}>TAGS</div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {trade.tags.map((tag) => (
                        <span
                          key={tag}
                          style={{ ...mono, fontSize: 9, padding: "2px 6px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-muted)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>CURRENCY</div>
                    <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)" }}>{trade.currency}</div>
                  </div>
                  <div>
                    <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>DAYS HELD</div>
                    <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)" }}><span className="pnum">{daysHeld(trade)}</span></div>
                  </div>
                  {trade.closeDate && (
                    <div>
                      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>CLOSED</div>
                      <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)" }}>{fmtDate(trade.closeDate)}</div>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={onCollapse}
                style={{ background: "transparent", border: "none", color: "var(--ft-dim)", cursor: "pointer", padding: 4 }}
              >
                ▲
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Setup Analysis Row ────────────────────────────────────────────────────────

interface SetupRowProps {
  s: { setup: string; count: number; winPct: number; avgPnl: number };
}

function SetupRow({ s }: SetupRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      style={{
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : "var(--ft-surface)",
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <td style={{ ...td, textTransform: "capitalize", fontWeight: 600 }}>{s.setup}</td>
      <td style={{ ...td, textAlign: "center", color: "var(--ft-muted)" }}><span className="pnum">{s.count}</span></td>
      <td style={{ ...td, textAlign: "right", color: winRateColor(s.winPct) }}>
        <span className="pnum">{s.winPct.toFixed(1)}%</span>
      </td>
      <td style={{ ...td, textAlign: "right", color: s.avgPnl > 0 ? "var(--ft-green)" : s.avgPnl < 0 ? "var(--ft-red)" : "var(--ft-dim)", fontWeight: 600 }}>
        <span className="pnum">{s.avgPnl >= 0 ? "+" : ""}{formatGbp(s.avgPnl)}</span>
      </td>
    </tr>
  );
}

// ── Monthly Cell ──────────────────────────────────────────────────────────────

interface MonthCellProps {
  m: { key: string; label: string; count: number; winRate: number; pnl: number };
}

function MonthCell({ m }: MonthCellProps) {
  const [hov, setHov] = useState(false);
  const hasData = m.count > 0;
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRight: "1px solid var(--ft-border)",
        borderBottom: "1px solid var(--ft-border)",
        background: hov
          ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))"
          : hasData
          ? m.pnl > 0
            ? "color-mix(in srgb, var(--ft-green) 5%, var(--ft-surface))"
            : m.pnl < 0
            ? "color-mix(in srgb, var(--ft-red) 5%, var(--ft-surface))"
            : "var(--ft-surface)"
          : "var(--ft-base)",
        opacity: hasData ? 1 : 0.5,
        transition: "background 0.1s",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onTouchStart={() => setHov(true)}
      onTouchEnd={() => setHov(false)}
      onTouchCancel={() => setHov(false)}
    >
      <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 6 }}>
        {m.label}
      </div>
      {hasData ? (
        <>
          <div style={{ ...mono, fontSize: 13, fontWeight: 700, color: m.pnl > 0 ? "var(--ft-green)" : m.pnl < 0 ? "var(--ft-red)" : "var(--ft-dim)", marginBottom: 4, fontVariantNumeric: "tabular-nums" }}>
            <span className="pnum">{m.pnl >= 0 ? "+" : ""}{formatGbp(m.pnl)}</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>TRADES</div>
              <div style={{ ...mono, fontSize: 11, color: "var(--ft-text)" }}><span className="pnum">{m.count}</span></div>
            </div>
            <div>
              <div style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>WIN%</div>
              <div style={{ ...mono, fontSize: 11, color: winRateColor(m.winRate) }}>
                <span className="pnum">{m.winRate.toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div style={{ ...mono, fontSize: 10, color: "var(--ft-border2)" }}>No trades</div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function TradingJournal() {
  const isMobile = useIsMobile();
  const [trades, setTrades] = useState<Trade[]>(loadTrades);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<TradeForm>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "closed">("all");
  const [filterSetup, setFilterSetup] = useState<TradeSetup | "all">("all");
  const [filterSymbol, setFilterSymbol] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterPnlMin, setFilterPnlMin] = useState<string>("");
  const [filterPnlMax, setFilterPnlMax] = useState<string>("");
  const formRef = useRef<HTMLDivElement>(null);
  const symbolInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showForm) {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [showForm]);

  // Focus symbol input when form opens for fast keyboard entry
  useEffect(() => {
    if (showForm && !editId) {
      setTimeout(() => symbolInputRef.current?.focus(), 60);
    }
  }, [showForm, editId]);

  const persist = useCallback((next: Trade[]) => {
    setTrades(next);
    saveTrades(next);
  }, []);

  // ── Computed stats ───────────────────────────────────────────────────────────

  const closed = useMemo(() => trades.filter((t) => t.status === "closed"), [trades]);

  const closedByDate = useMemo(
    () =>
      [...closed].sort((a, b) => {
        const da = a.closeDate ?? a.date;
        const db = b.closeDate ?? b.date;
        return da < db ? -1 : da > db ? 1 : 0;
      }),
    [closed],
  );

  const stats = useMemo(() => {
    if (closed.length === 0) {
      return { winRate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0, profitFactor: 0, totalTrades: 0, expectancy: 0 };
    }
    const wins = closed.filter((t) => calcPnl(t) > 0);
    const losses = closed.filter((t) => calcPnl(t) < 0);
    const totalPnl = closed.reduce((s, t) => s + calcPnl(t), 0);
    const grossWin = wins.reduce((s, t) => s + calcPnl(t), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + calcPnl(t), 0));
    const avgWin = wins.length > 0 ? grossWin / wins.length : 0;
    const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    const winRate = (wins.length / closed.length) * 100;
    const expectancy = (winRate / 100) * avgWin - (1 - winRate / 100) * avgLoss;
    return { winRate, totalPnl, avgWin, avgLoss, profitFactor, totalTrades: closed.length, expectancy };
  }, [closed]);

  const riskMetrics = useMemo(() => {
    return {
      maxDrawdown: calcMaxDrawdown(closedByDate),
      sharpe: calcSharpeRatio(closedByDate),
      streak: calcCurrentStreak(closedByDate),
    };
  }, [closedByDate]);

  // ── Equity curve ─────────────────────────────────────────────────────────────

  const equityCurve = useMemo(() => {
    let running = 0;
    return closedByDate.map((t) => {
      running += calcPnl(t);
      return {
        date: fmtDate(t.closeDate ?? t.date),
        cumPnl: parseFloat(running.toFixed(2)),
        rawDate: t.closeDate ?? t.date,
      };
    });
  }, [closedByDate]);

  // ── Setup analysis ────────────────────────────────────────────────────────────

  const setupStats = useMemo(() => {
    return SETUPS.map((setup) => {
      const st = closed.filter((t) => t.setup === setup);
      if (st.length === 0) return null;
      const wins = st.filter((t) => calcPnl(t) > 0);
      const winPct = (wins.length / st.length) * 100;
      const avgPnl = st.reduce((s, t) => s + calcPnl(t), 0) / st.length;
      return { setup, count: st.length, winPct, avgPnl };
    }).filter(Boolean) as { setup: string; count: number; winPct: number; avgPnl: number }[];
  }, [closed]);

  // ── Monthly breakdown ─────────────────────────────────────────────────────────

  const monthlyStats = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return months.map((mk) => {
      const month = closed.filter((t) => monthKey(t.closeDate ?? t.date) === mk);
      const wins = month.filter((t) => calcPnl(t) > 0);
      const pnl = month.reduce((s, t) => s + calcPnl(t), 0);
      return {
        key: mk,
        label: monthLabel(mk),
        count: month.length,
        winRate: month.length > 0 ? (wins.length / month.length) * 100 : 0,
        pnl,
      };
    });
  }, [closed]);

  // ── Unique tickers for filter dropdown ────────────────────────────────────────

  const uniqueTickers = useMemo(() => {
    return [...new Set(trades.map((t) => t.ticker))].sort();
  }, [trades]);

  // ── Sort + filter ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = [...trades];
    if (filterStatus !== "all") list = list.filter((t) => t.status === filterStatus);
    if (filterSetup !== "all") list = list.filter((t) => t.setup === filterSetup);
    if (filterSymbol) list = list.filter((t) => t.ticker === filterSymbol);
    if (filterDateFrom) list = list.filter((t) => t.date >= filterDateFrom);
    if (filterDateTo) list = list.filter((t) => t.date <= filterDateTo);
    if (filterPnlMin !== "") {
      const min = parseFloat(filterPnlMin);
      if (!isNaN(min)) list = list.filter((t) => calcPnl(t) >= min);
    }
    if (filterPnlMax !== "") {
      const max = parseFloat(filterPnlMax);
      if (!isNaN(max)) list = list.filter((t) => calcPnl(t) <= max);
    }
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === "date") {
        cmp = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
      } else if (sortField === "pnl") {
        cmp = calcPnl(a) - calcPnl(b);
      } else if (sortField === "ticker") {
        cmp = a.ticker.localeCompare(b.ticker);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [trades, filterStatus, filterSetup, filterSymbol, filterDateFrom, filterDateTo, filterPnlMin, filterPnlMax, sortField, sortDir]);

  const openTrades = useMemo(() => trades.filter((t) => t.status === "open"), [trades]);

  const hasActiveFilters = filterStatus !== "all" || filterSetup !== "all" || filterSymbol !== "" || filterDateFrom !== "" || filterDateTo !== "" || filterPnlMin !== "" || filterPnlMax !== "";

  function clearFilters() {
    setFilterStatus("all");
    setFilterSetup("all");
    setFilterSymbol("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterPnlMin("");
    setFilterPnlMax("");
  }

  // ── Form handlers ─────────────────────────────────────────────────────────────

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  }

  function handleEdit(trade: Trade) {
    setForm({
      ticker: trade.ticker,
      date: trade.date,
      closeDate: trade.closeDate ?? "",
      direction: trade.direction,
      status: trade.status,
      entryPrice: String(trade.entryPrice),
      exitPrice: trade.exitPrice != null ? String(trade.exitPrice) : "",
      quantity: String(trade.quantity),
      currency: trade.currency,
      setup: trade.setup,
      notes: trade.notes,
      confidence: trade.confidence,
      execution: trade.execution,
      tags: trade.tags.join(", "),
    });
    setEditId(trade.id);
    setShowForm(true);
  }

  function handleDelete(id: string) {
    persist(trades.filter((t) => t.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entryPrice = parseFloat(form.entryPrice);
    const exitPrice = form.exitPrice ? parseFloat(form.exitPrice) : undefined;
    const quantity = parseFloat(form.quantity);
    if (!form.ticker || isNaN(entryPrice) || isNaN(quantity)) return;

    const trade: Trade = {
      id: editId ?? crypto.randomUUID(),
      date: form.date,
      closeDate: form.closeDate || undefined,
      ticker: form.ticker.toUpperCase().trim(),
      direction: form.direction,
      status: form.status,
      entryPrice,
      exitPrice,
      quantity,
      currency: form.currency,
      setup: form.setup,
      notes: form.notes,
      confidence: form.confidence,
      execution: form.execution,
      tags: form.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
    };

    if (editId) {
      persist(trades.map((t) => (t.id === editId ? trade : t)));
    } else {
      persist([...trades, trade]);
    }

    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(false);
  }

  function handleCancel() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(false);
  }

  function updateForm<K extends keyof TradeForm>(key: K, value: TradeForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div style={{ padding: "0 0 40px 0" }}>
      <PageHeader
        icon={BookOpen}
        title="Trading Journal"
        subtitle="Track, analyze, and refine your edge"
        actions={
          <button
            style={btnPrimary}
            onClick={() => {
              if (showForm && !editId) {
                handleCancel();
              } else {
                setEditId(null);
                setForm(EMPTY_FORM);
                setShowForm(true);
              }
            }}
          >
            <Plus size={12} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
            New Trade
          </button>
        }
      />

      {/* ── KPI Bar — border-as-gap grid ─────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 1,
          background: "var(--ft-border)",
          border: "1px solid var(--ft-border)",
          marginBottom: 16,
          overflow: "hidden",
        }}
      >
        <KpiCell
          label="Total P&L"
          value={stats.totalTrades > 0 ? (stats.totalPnl >= 0 ? "+" : "") + formatGbp(stats.totalPnl) : "—"}
          color={stats.totalPnl > 0 ? "var(--ft-green)" : stats.totalPnl < 0 ? "var(--ft-red)" : undefined}
          hero
        />
        <KpiCell
          label="Win Rate"
          value={stats.totalTrades > 0 ? stats.winRate.toFixed(1) + "%" : "—"}
          color={stats.totalTrades > 0 ? winRateColor(stats.winRate) : undefined}
          sub={`${stats.totalTrades} closed`}
          hero
        />
        <KpiCell
          label="Total Trades"
          value={String(trades.length)}
          color="var(--ft-text)"
          sub={`${openTrades.length} open`}
        />
        <KpiCell
          label="Avg Win"
          value={stats.avgWin > 0 ? formatGbp(stats.avgWin) : "—"}
          color="var(--ft-green)"
        />
        <KpiCell
          label="Avg Loss"
          value={stats.avgLoss > 0 ? formatGbp(-stats.avgLoss) : "—"}
          color="var(--ft-red)"
        />
        <KpiCell
          label="Profit Factor"
          value={stats.profitFactor === Infinity ? "∞" : stats.totalTrades > 0 ? stats.profitFactor.toFixed(2) : "—"}
          color={stats.profitFactor >= 2 ? "var(--ft-green)" : stats.profitFactor >= 1 ? "var(--ft-amber)" : "var(--ft-red)"}
          sub="gross win / loss"
        />
        <KpiCell
          label="Max Drawdown"
          value={riskMetrics.maxDrawdown > 0 ? formatGbp(-riskMetrics.maxDrawdown) : "—"}
          color={riskMetrics.maxDrawdown > 0 ? "var(--ft-red)" : "var(--ft-dim)"}
          sub="peak-to-trough"
        />
        <KpiCell
          label="Sharpe Ratio"
          value={riskMetrics.sharpe != null ? riskMetrics.sharpe.toFixed(2) : "—"}
          color={
            riskMetrics.sharpe != null
              ? riskMetrics.sharpe >= 1 ? "var(--ft-green)" : riskMetrics.sharpe >= 0 ? "var(--ft-amber)" : "var(--ft-red)"
              : undefined
          }
          sub="return / std-dev"
        />
        <StreakCell streak={riskMetrics.streak} />
        <KpiCell
          label="Expectancy"
          value={stats.totalTrades > 0 ? formatGbp(stats.expectancy) : "—"}
          color={stats.expectancy >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
          sub="per trade"
        />
      </div>

      {/* ── Best / Worst callouts ──────────────────────────────────────────────── */}
      {closed.length >= 2 && <TradeCallouts closed={closed} />}

      {/* ── Add/Edit form ──────────────────────────────────────────────────────── */}
      {showForm && (
        <div
          ref={formRef}
          style={{
            ...panel,
            marginBottom: 20,
            border: "1px solid var(--ft-border2)",
          }}
        >
          <div
            style={{
              ...sectionHead,
              borderLeft: "3px solid var(--ft-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <span>{editId ? "Edit Trade" : "Log New Trade"}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ ...mono, fontSize: 8, color: "var(--ft-dim)" }}>Tab to navigate · Enter to submit</span>
              <button
                type="button"
                onClick={handleCancel}
                style={{ background: "transparent", border: "none", color: "var(--ft-dim)", cursor: "pointer", padding: 2 }}
              >
                <X size={12} />
              </button>
            </div>
          </div>
          <form onSubmit={handleSubmit} style={{ padding: "16px 16px 20px" }}>
            {/* Row 1: Ticker, Date, Close Date, Direction, Status */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: "12px 16px", marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Ticker *</label>
                <input
                  ref={symbolInputRef}
                  style={inputStyle}
                  value={form.ticker}
                  onChange={(e) => updateForm("ticker", e.target.value)}
                  placeholder="AAPL"
                  required
                  autoComplete="off"
                />
              </div>
              <div>
                <label style={labelStyle}>Entry Date *</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={form.date}
                  onChange={(e) => updateForm("date", e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Close Date</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={form.closeDate}
                  onChange={(e) => updateForm("closeDate", e.target.value)}
                />
              </div>
              <div>
                <label style={labelStyle}>Direction *</label>
                <div style={{ display: "flex", gap: 0 }}>
                  {(["long", "short"] as TradeDirection[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => updateForm("direction", d)}
                      style={{
                        ...mono,
                        flex: 1,
                        fontSize: 11,
                        padding: "6px 0",
                        background: form.direction === d
                          ? d === "long" ? "var(--ft-green)" : "var(--ft-red)"
                          : "var(--ft-raised)",
                        color: form.direction === d ? "var(--ft-base)" : "var(--ft-muted)",
                        border: "1px solid var(--ft-border2)",
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        transition: "background 0.1s",
                      }}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Status *</label>
                <div style={{ display: "flex", gap: 0 }}>
                  {(["open", "closed"] as TradeStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateForm("status", s)}
                      style={{
                        ...mono,
                        flex: 1,
                        fontSize: 11,
                        padding: "6px 0",
                        background: form.status === s ? "var(--ft-accent)" : "var(--ft-raised)",
                        color: form.status === s ? "var(--ft-base)" : "var(--ft-muted)",
                        border: "1px solid var(--ft-border2)",
                        cursor: "pointer",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                        transition: "background 0.1s",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 2: Entry, Exit, Qty, Currency, Setup */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: "12px 16px", marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Entry Price *</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="any"
                  value={form.entryPrice}
                  onChange={(e) => updateForm("entryPrice", e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Exit Price</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="any"
                  value={form.exitPrice}
                  onChange={(e) => updateForm("exitPrice", e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label style={labelStyle}>Quantity *</label>
                <input
                  style={inputStyle}
                  type="number"
                  step="any"
                  value={form.quantity}
                  onChange={(e) => updateForm("quantity", e.target.value)}
                  placeholder="100"
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Currency</label>
                <select
                  style={{ ...inputStyle, cursor: "pointer" }}
                  value={form.currency}
                  onChange={(e) => updateForm("currency", e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Setup</label>
                <select
                  style={{ ...inputStyle, cursor: "pointer" }}
                  value={form.setup}
                  onChange={(e) => updateForm("setup", e.target.value as TradeSetup)}
                >
                  {SETUPS.map((s) => (
                    <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Row 3: Confidence, Execution, Tags */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "12px 16px", marginBottom: 14 }}>
              <div>
                <label style={labelStyle}>Pre-trade Conviction</label>
                <StarRating value={form.confidence} onChange={(v) => updateForm("confidence", v)} />
              </div>
              <div>
                <label style={labelStyle}>Execution Quality</label>
                <StarRating value={form.execution} onChange={(v) => updateForm("execution", v)} />
              </div>
              <div>
                <label style={labelStyle}>Tags (comma-separated)</label>
                <input
                  style={inputStyle}
                  value={form.tags}
                  onChange={(e) => updateForm("tags", e.target.value)}
                  placeholder="earnings, swing, weekly"
                />
              </div>
            </div>

            {/* Row 4: Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Journal Notes</label>
              <textarea
                style={{ ...inputStyle, resize: "vertical", minHeight: 72, lineHeight: 1.5 }}
                value={form.notes}
                onChange={(e) => updateForm("notes", e.target.value)}
                placeholder="Why did you take this trade? What was the thesis? How did it play out?"
              />
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" style={btnPrimary}>
                {editId ? "Update Trade" : "Log Trade"}
              </button>
              <button type="button" style={btnGhost} onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Open Positions ─────────────────────────────────────────────────────── */}
      {openTrades.length > 0 && (
        <div style={panel}>
          <div style={{ ...sectionHead, borderLeft: "3px solid var(--ft-amber)" }}>
            Open Positions — <span className="pnum">{openTrades.length}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 1, background: "var(--ft-border)" }}>
            {openTrades.map((trade) => (
              <OpenPositionCard
                key={trade.id}
                trade={trade}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Trade Log ─────────────────────────────────────────────────────────── */}
      <div style={panel}>
        <div
          style={{
            ...sectionHead,
            borderLeft: "3px solid var(--ft-blue)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>Trade Log — <span className="pnum">{filtered.length}{trades.length !== filtered.length ? `/${trades.length}` : ""}</span> entries</span>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                style={{ ...mono, fontSize: 8, padding: "2px 6px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: "var(--ft-amber)", cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase" }}
              >
                Clear Filters
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {/* Status filter */}
            <div style={{ display: "flex", gap: 0 }}>
              {(["all", "open", "closed"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterStatus(f)}
                  style={{
                    ...mono,
                    fontSize: 9,
                    padding: "3px 8px",
                    background: filterStatus === f ? "var(--ft-accent)" : "var(--ft-raised)",
                    color: filterStatus === f ? "var(--ft-base)" : "var(--ft-muted)",
                    border: "1px solid var(--ft-border2)",
                    cursor: "pointer",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  {f}
                </button>
              ))}
            </div>
            {/* Setup filter */}
            <select
              style={{ ...mono, fontSize: 9, padding: "3px 8px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: filterSetup !== "all" ? "var(--ft-text)" : "var(--ft-muted)", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em" }}
              value={filterSetup}
              onChange={(e) => setFilterSetup(e.target.value as TradeSetup | "all")}
            >
              <option value="all">All Setups</option>
              {SETUPS.map((s) => (
                <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            {/* Symbol filter */}
            {uniqueTickers.length > 0 && (
              <select
                style={{ ...mono, fontSize: 9, padding: "3px 8px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: filterSymbol ? "var(--ft-text)" : "var(--ft-muted)", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.05em" }}
                value={filterSymbol}
                onChange={(e) => setFilterSymbol(e.target.value)}
              >
                <option value="">All Symbols</option>
                {uniqueTickers.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            {/* Date range */}
            <input
              type="date"
              style={{ ...mono, fontSize: 9, padding: "3px 6px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: filterDateFrom ? "var(--ft-text)" : "var(--ft-muted)", cursor: "pointer", height: 25, width: 110 }}
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              title="Date from"
            />
            <span style={{ ...mono, fontSize: 9, color: "var(--ft-dim)" }}>→</span>
            <input
              type="date"
              style={{ ...mono, fontSize: 9, padding: "3px 6px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: filterDateTo ? "var(--ft-text)" : "var(--ft-muted)", cursor: "pointer", height: 25, width: 110 }}
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              title="Date to"
            />
            {/* P&L range */}
            <input
              type="text"
              inputMode="decimal"
              placeholder="P&L min"
              style={{ ...mono, fontSize: 9, padding: "3px 6px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: filterPnlMin ? "var(--ft-text)" : "var(--ft-muted)", height: 25, width: 70 }}
              value={filterPnlMin}
              onChange={(e) => setFilterPnlMin(e.target.value)}
            />
            <input
              type="text"
              inputMode="decimal"
              placeholder="P&L max"
              style={{ ...mono, fontSize: 9, padding: "3px 6px", background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", color: filterPnlMax ? "var(--ft-text)" : "var(--ft-muted)", height: 25, width: 70 }}
              value={filterPnlMax}
              onChange={(e) => setFilterPnlMax(e.target.value)}
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <div style={{ padding: "36px 24px", textAlign: "center", borderTop: "1px solid var(--ft-border)" }}>
            <div style={{ ...mono, fontSize: 11, color: "var(--ft-border2)", marginBottom: 8, letterSpacing: "0.05em" }}>
              [ NO TRADES MATCH ]
            </div>
            <div style={{ ...mono, fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {hasActiveFilters ? "Adjust or clear active filters" : "Log your first trade to begin"}
            </div>
          </div>
        ) : (
          <div className="ft-scroll-x">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th
                    style={{ ...th, cursor: "pointer" }}
                    onClick={() => handleSort("date")}
                  >
                    Date <SortIcon field="date" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th
                    style={{ ...th, cursor: "pointer" }}
                    onClick={() => handleSort("ticker")}
                  >
                    Ticker <SortIcon field="ticker" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th style={th}>Dir</th>
                  <th style={{ ...th, textAlign: "right" }}>Entry</th>
                  <th style={{ ...th, textAlign: "right" }}>Exit</th>
                  <th
                    style={{ ...th, textAlign: "right", cursor: "pointer" }}
                    onClick={() => handleSort("pnl")}
                  >
                    P&amp;L <SortIcon field="pnl" sortField={sortField} sortDir={sortDir} />
                  </th>
                  <th style={{ ...th, textAlign: "right" }}>P&amp;L %</th>
                  <th style={th}>Setup</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: "center" }}>Conv/Exec</th>
                  <th style={{ ...th, textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((trade, i) => {
                  const isExpanded = expandedId === trade.id;
                  const rowBg = i % 2 === 0 ? "var(--ft-surface)" : "var(--ft-base)";
                  return (
                    <TradeRow
                      key={trade.id}
                      trade={trade}
                      isExpanded={isExpanded}
                      rowBg={rowBg}
                      onToggleExpand={() => setExpandedId(isExpanded ? null : trade.id)}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onCollapse={() => setExpandedId(null)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Charts row ─────────────────────────────────────────────────────────── */}
      {closed.length > 0 && (
        <>
          {/* P&L bars chart */}
          <PnlBarsChart closed={closed} />

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16, marginBottom: 16 }}>
            {/* Equity curve */}
            <div style={panel}>
              <div style={{ ...sectionHead, borderLeft: "3px solid var(--ft-green)" }}>
                <TrendingUp size={10} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
                Cumulative Equity Curve
              </div>
              <div style={{ padding: "16px 8px 8px 8px", height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={equityCurve} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={stats.totalPnl >= 0 ? "var(--ft-green)" : "var(--ft-red)"} stopOpacity={0.18} />
                        <stop offset="95%" stopColor={stats.totalPnl >= 0 ? "var(--ft-green)" : "var(--ft-red)"} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) => (v >= 0 ? "+" : "") + formatGbp(v)}
                      width={70}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <ReferenceLine y={0} stroke="var(--ft-border2)" strokeDasharray="3 3" />
                    <Area
                      type="monotone"
                      dataKey="cumPnl"
                      stroke={stats.totalPnl >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
                      strokeWidth={1.5}
                      fill="url(#pnlGrad)"
                      dot={false}
                      activeDot={{ r: 3, strokeWidth: 0 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Setup win rate */}
            {setupStats.length > 0 && (
              <div style={panel}>
                <div style={{ ...sectionHead, borderLeft: "3px solid var(--ft-cyan)" }}>Win Rate by Setup</div>
                <div style={{ padding: "16px 8px 8px 0", height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={setupStats} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} layout="vertical">
                      <CartesianGrid strokeDasharray="2 4" stroke="var(--ft-border)" horizontal={false} />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tick={{ fontFamily: "var(--font-mono)", fontSize: 8, fill: "var(--ft-dim)" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => v + "%"}
                      />
                      <YAxis
                        type="category"
                        dataKey="setup"
                        tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-muted)" }}
                        axisLine={false}
                        tickLine={false}
                        width={68}
                      />
                      <Tooltip content={<BarTooltip />} />
                      <Bar dataKey="winPct" name="Win %" radius={0} maxBarSize={14}>
                        {setupStats.map((s) => (
                          <Cell key={s.setup} fill={winRateColor(s.winPct)} opacity={0.85} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Setup analysis table ──────────────────────────────────────────────── */}
      {setupStats.length > 0 && (
        <div style={{ ...panel, marginBottom: 16 }}>
          <div style={{ ...sectionHead, borderLeft: "3px solid var(--ft-cyan)" }}>Setup Analysis</div>
          <div className="ft-scroll-x">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={th}>Setup</th>
                  <th style={{ ...th, textAlign: "center" }}>Trades</th>
                  <th style={{ ...th, textAlign: "right" }}>Win Rate</th>
                  <th style={{ ...th, textAlign: "right" }}>Avg P&amp;L</th>
                </tr>
              </thead>
              <tbody>
                {setupStats
                  .slice()
                  .sort((a, b) => b.avgPnl - a.avgPnl)
                  .map((s) => (
                    <SetupRow key={s.setup} s={s} />
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Monthly breakdown ─────────────────────────────────────────────────── */}
      <div style={panel}>
        <div style={{ ...sectionHead, borderLeft: "3px solid var(--ft-blue)" }}>Monthly Performance — Last 12 Months</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 0 }}>
          {monthlyStats.map((m) => (
            <MonthCell key={m.key} m={m} />
          ))}
        </div>
      </div>

      {/* ── Empty state ────────────────────────────────────────────────────────── */}
      {trades.length === 0 && (
        <div
          style={{
            ...mono,
            textAlign: "center",
            padding: "48px 24px",
            border: "1px solid var(--ft-border)",
            color: "var(--ft-dim)",
            fontSize: 12,
            background: "var(--ft-surface)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--ft-border2)", marginBottom: 12, letterSpacing: "0.06em" }}>
            {`┌─────────────────────────┐`}
            <br />
            {`│   JOURNAL  EMPTY        │`}
            <br />
            {`│   NO TRADES LOGGED      │`}
            <br />
            {`└─────────────────────────┘`}
          </div>
          <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, color: "var(--ft-dim)" }}>
            No trades logged
          </div>
          <div style={{ fontSize: 10, marginBottom: 20, color: "var(--ft-dim)", maxWidth: 320, margin: "0 auto 20px" }}>
            Log your first trade to start tracking performance and building your edge.
          </div>
          <button style={btnPrimary} onClick={() => setShowForm(true)}>
            <Plus size={11} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
            Log First Trade
          </button>
        </div>
      )}
    </div>
  );
}
