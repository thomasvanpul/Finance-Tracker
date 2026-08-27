import { useEffect, useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { UnconvertibleAccountsBadge } from "@/components/UnconvertibleAccountsBadge";
import { StaleAsOf } from "@/components/StaleAsOf";
import { formatBaseMoney, formatPercent } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { useCountUp } from "@/hooks/use-count-up";
import { CurrencyMark } from "@/components/currency-mark";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const HISTORY_KEY = "ft-nw-history";
const MAX_ENTRIES = 365;

type HistoryEntry = { date: string; netWorth: number; cash: number; portfolio: number };
type Period = "7D" | "1M" | "3M" | "ALL";

type CurrencyGroup = { currency: string; nativeTotal: number; gbpTotal: number; share: number };

function buildCurrencyGroups(
  accountBreakdown: { currency: string; balance: number; baseEquivalent: number | null }[],
  totalCash: number
): CurrencyGroup[] {
  const map = new Map<string, { native: number; gbp: number }>();
  for (const acct of accountBreakdown) {
    const prev = map.get(acct.currency) ?? { native: 0, gbp: 0 };
    map.set(acct.currency, { native: prev.native + acct.balance, gbp: prev.gbp + (acct.baseEquivalent ?? 0) });
  }
  return Array.from(map.entries())
    .map(([currency, { native, gbp }]) => ({
      currency,
      nativeTotal: native,
      gbpTotal: gbp,
      share: totalCash > 0 ? (gbp / totalCash) * 100 : 0,
    }))
    .sort((a, b) => b.gbpTotal - a.gbpTotal);
}


function formatNative(amount: number, currency: string): string {
  const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", MYR: "RM ", SGD: "S$", AUD: "A$", CAD: "C$", JPY: "¥", HKD: "HK$", CHF: "CHF " };
  const sym = symbols[currency] ?? `${currency} `;
  return `${sym}${Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)); } catch {}
}

function formatYAxis(value: number): string {
  return Math.abs(value) >= 1000 ? `£${(value / 1000).toFixed(0)}k` : `£${value.toFixed(0)}`;
}
function formatXAxis(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CurrencyExposureStrip({ groups }: { groups: CurrencyGroup[] }) {
  if (groups.length <= 1) return null;
  return (
    <div style={{ borderTop: "1px solid var(--ft-border)", background: "var(--ft-base)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 0, overflowX: "auto", scrollbarWidth: "none" }}>
        {groups.map((g, i) => (
          <div
            key={g.currency}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "8px 12px",
              borderRight: i < groups.length - 1 ? "1px solid var(--ft-border)" : undefined,
              minWidth: 0,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
              <span style={{ color: "var(--ft-muted)" }}>
                <CurrencyMark code={g.currency} size={10} />
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 2 }}>
                {g.share.toFixed(0)}%
              </span>
            </div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--ft-accent)", whiteSpace: "nowrap" }}>
              {formatNative(g.nativeTotal, g.currency)}
            </div>
            {g.currency !== "GBP" && (
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 1 }}>
                {formatBaseMoney(g.gbpTotal)}
              </div>
            )}
            {/* share bar */}
            <div style={{ marginTop: 4, height: 2, background: "var(--ft-border)", borderRadius: 1, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${g.share}%`, background: `hsl(${(groups.indexOf(g) * 47 + 200) % 360}, 60%, 55%)`, opacity: 0.9 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const PERIODS: { label: Period; days: number | null }[] = [
  { label: "7D",  days: 7 },
  { label: "1M",  days: 30 },
  { label: "3M",  days: 90 },
  { label: "ALL", days: null },
];

type TooltipProps = { active?: boolean; payload?: { value: number }[]; label?: string };
function NetWorthTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "6px 10px", fontFamily: "var(--font-mono)" }}>
      <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </div>
      <div className="pnum" style={{ fontSize: 12, fontWeight: 700, color: "var(--ft-accent)" }}>
        {formatBaseMoney(payload[0].value)}
      </div>
    </div>
  );
}

function TodayBadge({ history }: { history: HistoryEntry[] }) {
  if (history.length < 2) return null;
  const today = history[history.length - 1];
  const yesterday = history[history.length - 2];
  const delta = today.netWorth - yesterday.netWorth;
  if (delta === 0) return null;
  const isUp = delta > 0;
  return (
    <span style={{
      fontFamily: "var(--font-mono)",
      fontSize: 9,
      fontWeight: 700,
      color: "var(--ft-base)",
      background: isUp ? "var(--ft-green)" : "var(--ft-red)",
      padding: "2px 6px",
      borderRadius: 2,
      letterSpacing: "0.04em",
      display: "inline-flex",
      alignItems: "center",
      gap: 2,
    }}>
      {isUp ? "▲" : "▼"} <span className="pnum">{formatBaseMoney(Math.abs(delta))}</span> today
    </span>
  );
}

function PeriodSelector({ period, setPeriod }: { period: Period; setPeriod: (p: Period) => void }) {
  return (
    <div style={{ display: "flex", gap: 2 }}>
      {PERIODS.map(p => (
        <button
          key={p.label}
          onClick={() => setPeriod(p.label)}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.06em",
            padding: "2px 6px",
            background: period === p.label ? "var(--ft-accent)" : "transparent",
            color: period === p.label ? "var(--ft-base)" : "var(--ft-dim)",
            border: `1px solid ${period === p.label ? "var(--ft-accent)" : "var(--ft-border2)"}`,
            transition: "all 0.1s",
            cursor: "pointer",
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function AnimatedGbp({ value }: { value: number }) {
  const animated = useCountUp(value);
  return <>{formatBaseMoney(animated)}</>;
}

type KpiCellProps = {
  label: string;
  raw: number | null;
  value: string;
  color: string;
  sub: string;
  animate: boolean;
  isLast: boolean;
};

function KpiCell({ label, raw, value, color, sub, animate, isLast }: KpiCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "14px 12px",
        borderRight: !isLast ? "1px solid var(--ft-border)" : undefined,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color, lineHeight: 1.1, whiteSpace: "nowrap" }}>
        {animate && raw !== null ? <AnimatedGbp value={raw} /> : value}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
        {sub}
      </div>
    </div>
  );
}

type MonthStatCellProps = { label: string; value: string; color: string; isLast: boolean };

function MonthStatCell({ label, value, color, isLast }: MonthStatCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "10px 12px",
        borderRight: !isLast ? "1px solid var(--ft-border)" : undefined,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-raised))" : "var(--ft-raised)",
        transition: "background 0.1s",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3, whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color, whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

type BreakdownCellProps = { label: string; value: string; color: string; isLast: boolean };

function BreakdownCell({ label, value, color, isLast }: BreakdownCellProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "8px 12px",
        borderRight: !isLast ? "1px solid var(--ft-border)" : undefined,
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3, whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color, whiteSpace: "nowrap" }}>
        {value}
      </div>
    </div>
  );
}

type AccountTableRowProps = {
  acct: { id: number | string; name: string; currency: string; balance: number; baseEquivalent: number | null };
  isFirst: boolean;
};

function AccountTableRow({ acct, isFirst }: AccountTableRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderTop: isFirst ? "1px solid var(--ft-border)" : "1px solid var(--ft-border)",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "transparent",
        transition: "background 0.1s",
      }}
    >
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", padding: "7px 0 7px 0", paddingRight: 8, maxWidth: 110, whiteSpace: "nowrap" }}>
        {acct.name}
      </td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", padding: "7px 8px 7px 0" }}>
        {acct.currency}
      </td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "7px 8px 7px 0", textAlign: "right" }}>
        <span className="pnum">{acct.currency !== "GBP" ? acct.balance.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</span>
      </td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: acct.baseEquivalent == null ? "var(--ft-dim)" : "var(--ft-accent)", textAlign: "right", padding: "7px 0" }}>
        {acct.baseEquivalent == null ? "—" : <span className="pnum">{formatBaseMoney(acct.baseEquivalent)}</span>}
      </td>
    </tr>
  );
}

// ─── Main widget ──────────────────────────────────────────────────────────────

export function NetWorthWidget({ isExpanded }: { isExpanded?: boolean }) {
  // dataUpdatedAt drives the StaleAsOf badge — the honest fetch time,
  // never re-stamped to render time. isStale is true past the query's
  // fresh window, or whenever a refetch is in flight after failure.
  // Both are what make a cached-but-not-live value legible to the user
  // rather than presented as current.
  const { data: d, isLoading, dataUpdatedAt, isStale } = useGetDashboard();
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [period, setPeriod] = useState<Period>("1M");

  useEffect(() => {
    if (!d) return;
    const today = new Date().toISOString().slice(0, 10);
    const existing = loadHistory();
    if (existing.some(e => e.date === today)) { setHistory(existing); return; }
    const newEntry: HistoryEntry = { date: today, netWorth: d.netWorth, cash: d.totalCash, portfolio: d.portfolio.totalValueGbp };
    const updated = [...existing, newEntry].slice(-MAX_ENTRIES);
    saveHistory(updated);
    setHistory(updated);
  }, [d]);

  const periodDef = PERIODS.find(p => p.label === period)!;
  const filteredHistory = periodDef.days
    ? history.slice(-periodDef.days)
    : history;

  const currencyGroups = d ? buildCurrencyGroups(d.accountBreakdown, d.totalCash) : [];

  const kpis = d ? [
    { label: "Net Worth",    raw: d.netWorth,                             value: formatBaseMoney(d.netWorth),               color: "var(--ft-accent)", sub: "Cash + Portfolio", animate: true },
    { label: "Total Cash",   raw: null,                                   value: formatBaseMoney(d.totalCash),              color: "var(--ft-text)",   sub: `${d.accountBreakdown.length} accounts`, animate: false },
    { label: "Portfolio",    raw: null,                                   value: formatBaseMoney(d.portfolio.totalValueGbp), color: d.portfolio.totalPlGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)", sub: `P&L ${d.portfolio.totalPlGbp >= 0 ? "+" : ""}${formatBaseMoney(d.portfolio.totalPlGbp)}`, animate: false },
    { label: "Net Liquidity",raw: null,                                   value: formatBaseMoney(d.netLiquidity),           color: d.netLiquidity >= 0 ? "var(--ft-green)" : "var(--ft-red)", sub: "After 30d commitments", animate: false },
  ] : [];

  const monthStats = d ? [
    { label: "Income",       value: `+${formatBaseMoney(d.thisMonth.income)}`,   color: "var(--ft-green)" },
    { label: "Expenses",     value: `-${formatBaseMoney(d.thisMonth.expenses)}`, color: "var(--ft-red)" },
    { label: "Savings Rate", value: formatPercent(d.thisMonth.savingsRate), color: d.thisMonth.savingsRate >= 20 ? "var(--ft-green)" : "var(--ft-amber)" },
  ] : [];

  const breakdownItems = d ? [
    { label: "Cash",      value: formatBaseMoney(d.totalCash),                color: "var(--ft-accent)" },
    { label: "Portfolio", value: formatBaseMoney(d.portfolio.totalValueGbp),  color: "var(--ft-green)" },
    { label: "Net Debt",  value: formatBaseMoney(d.owing.totalIOwe),          color: d.owing.totalIOwe > 0 ? "var(--ft-red)" : "var(--ft-dim)" },
  ] : [];

  const chartSection = (
    <div style={{ borderTop: "1px solid var(--ft-border)", padding: "12px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
            Net Worth History
          </span>
          <TodayBadge history={history} />
        </div>
        <PeriodSelector period={period} setPeriod={setPeriod} />
      </div>

      {filteredHistory.length < 2 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", textAlign: "center", padding: "20px 0" }}>
          Not enough data for this period
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={filteredHistory} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="nwGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="var(--ft-accent)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--ft-accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tickFormatter={formatXAxis} axisLine={false} tickLine={false} tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} interval="preserveStartEnd" />
            <YAxis tickFormatter={formatYAxis} axisLine={false} tickLine={false} tick={{ fontFamily: "var(--font-mono)", fontSize: 9, fill: "var(--ft-dim)" }} width={40} />
            <Tooltip content={<NetWorthTooltip />} />
            <Area type="monotone" dataKey="netWorth" stroke="var(--ft-accent)" strokeWidth={1.5} fill="url(#nwGradient)" dot={false} activeDot={{ r: 3, fill: "var(--ft-accent)", strokeWidth: 0 }} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  const compactContent = d && (
    <>
      {/* KPI strip — border-as-gap pattern. ft-four-col opts into the
          main-content container query: 4-col at wide, 3-col ≤900
          container width, 2-col ≤700. */}
      <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--ft-border)" }}>
        {kpis.map((k, i) => (
          <KpiCell
            key={k.label}
            label={k.label}
            raw={k.raw}
            value={k.value}
            color={k.color}
            sub={k.sub}
            animate={k.animate}
            isLast={i === kpis.length - 1}
          />
        ))}
      </div>

      {/* Unconvertible-accounts warning + stale-as-of timestamp both
          sit directly under the KPI strip so they read as caveats on
          the totals above. The badge announces silent server-side
          `?? 0` drops; StaleAsOf shows the fetch time when the data
          is past its fresh window or offline. */}
      {((d.unconvertibleAccounts ?? 0) > 0 || isStale) && (
        <div style={{ padding: "6px 12px", borderTop: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <UnconvertibleAccountsBadge count={d.unconvertibleAccounts ?? 0} />
          <StaleAsOf ts={dataUpdatedAt} isFresh={!isStale} />
        </div>
      )}

      {/* Month stats strip */}
      <div className="ft-three-col" style={{ borderTop: "1px solid var(--ft-border)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)" }}>
        {monthStats.map((item, i) => (
          <MonthStatCell
            key={item.label}
            label={item.label}
            value={item.value}
            color={item.color}
            isLast={i === monthStats.length - 1}
          />
        ))}
      </div>

      {/* Breakdown strip */}
      <div className="ft-three-col" style={{ borderTop: "1px solid var(--ft-border)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "var(--ft-border)" }}>
        {breakdownItems.map((item, i) => (
          <BreakdownCell
            key={item.label}
            label={item.label}
            value={item.value}
            color={item.color}
            isLast={i === breakdownItems.length - 1}
          />
        ))}
      </div>

      <CurrencyExposureStrip groups={currencyGroups} />

      {history.length >= 2 && chartSection}
    </>
  );

  const expandedRightColumn = d && (
    <div style={{ padding: "14px 12px", overflowY: "auto" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 10 }}>
        Account Breakdown
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Account", "Currency", "Balance", "GBP"].map(h => (
              <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ft-dim)", textAlign: h === "Balance" || h === "GBP" ? "right" : "left", paddingBottom: 6, fontWeight: 600 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {d.accountBreakdown.map((acct, i) => (
            <AccountTableRow key={acct.id} acct={acct} isFirst={i === 0} />
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1px solid var(--ft-border2)" }}>
            <td colSpan={3} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 8 }}>
              Total Cash
            </td>
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-accent)", textAlign: "right", paddingTop: 8 }}>
              <span className="pnum">{formatBaseMoney(d.totalCash)}</span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );

  return (
    <WidgetShell title="Net Worth" isLoading={isLoading}>
      {d && (
        isExpanded ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, height: "100%" }}>
            <div style={{ borderRight: "1px solid var(--ft-border)" }}>
              {compactContent}
            </div>
            <div>
              <div style={{ padding: "10px 12px 6px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
                    Period
                  </span>
                  <TodayBadge history={history} />
                </div>
                <PeriodSelector period={period} setPeriod={setPeriod} />
              </div>
              {expandedRightColumn}
            </div>
          </div>
        ) : compactContent
      )}
    </WidgetShell>
  );
}
