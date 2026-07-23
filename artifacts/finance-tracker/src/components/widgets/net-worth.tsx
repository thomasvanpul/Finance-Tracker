import { useEffect, useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { formatGbp, formatPercent } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import { useCountUp } from "@/hooks/use-count-up";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const HISTORY_KEY = "ft-nw-history";
const MAX_ENTRIES = 365;

type HistoryEntry = { date: string; netWorth: number; cash: number; portfolio: number };
type Period = "7D" | "1M" | "3M" | "ALL";

type CurrencyGroup = { currency: string; nativeTotal: number; gbpTotal: number; share: number };

function buildCurrencyGroups(
  accountBreakdown: { currency: string; balance: number; gbpEquivalent: number }[],
  totalCash: number
): CurrencyGroup[] {
  const map = new Map<string, { native: number; gbp: number }>();
  for (const acct of accountBreakdown) {
    const prev = map.get(acct.currency) ?? { native: 0, gbp: 0 };
    map.set(acct.currency, { native: prev.native + acct.balance, gbp: prev.gbp + acct.gbpEquivalent });
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

const CURRENCY_FLAGS: Record<string, string> = {
  GBP: "🇬🇧", USD: "🇺🇸", EUR: "🇪🇺", MYR: "🇲🇾", SGD: "🇸🇬",
  AUD: "🇦🇺", CAD: "🇨🇦", JPY: "🇯🇵", HKD: "🇭🇰", CHF: "🇨🇭",
  NZD: "🇳🇿", SEK: "🇸🇪", NOK: "🇳🇴", DKK: "🇩🇰", CNY: "🇨🇳",
};

function formatNative(amount: number, currency: string): string {
  const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", MYR: "RM ", SGD: "S$", AUD: "A$", CAD: "C$", JPY: "¥", HKD: "HK$", CHF: "CHF " };
  const sym = symbols[currency] ?? `${currency} `;
  return `${sym}${Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
              <span style={{ fontSize: 10 }}>{CURRENCY_FLAGS[g.currency] ?? "🌐"}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ft-muted)" }}>
                {g.currency}
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
                {formatGbp(g.gbpTotal)}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ height: 3, background: "var(--ft-border)", display: "flex" }}>
        {groups.map((g) => (
          <div
            key={g.currency}
            style={{
              height: "100%",
              width: `${g.share}%`,
              background: `hsl(${(groups.indexOf(g) * 47 + 200) % 360}, 60%, 55%)`,
              opacity: 0.8,
            }}
          />
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

type TooltipProps = { active?: boolean; payload?: { value: number }[]; label?: string };
function NetWorthTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length || !label) return null;
  return (
    <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "6px 10px", fontFamily: "var(--font-mono)" }}>
      <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ft-accent)" }}>
        {formatGbp(payload[0].value)}
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
      color: isUp ? "var(--ft-base)" : "var(--ft-base)",
      background: isUp ? "var(--ft-green)" : "var(--ft-red)",
      padding: "2px 6px",
      borderRadius: 2,
      letterSpacing: "0.04em",
      display: "inline-flex",
      alignItems: "center",
      gap: 2,
    }}>
      {isUp ? "▲" : "▼"} <span className="pnum">{formatGbp(Math.abs(delta))}</span> today
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
  return <>{formatGbp(animated)}</>;
}

export function NetWorthWidget({ isExpanded }: { isExpanded?: boolean }) {
  const { data: d, isLoading } = useGetDashboard();
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
    { label: "Net Worth",    raw: d.netWorth,                            value: formatGbp(d.netWorth),               color: "var(--ft-accent)", sub: "Cash + Portfolio", animate: true },
    { label: "Total Cash",   raw: null,                                  value: formatGbp(d.totalCash),              color: "var(--ft-text)",   sub: `${d.accountBreakdown.length} accounts`, animate: false },
    { label: "Portfolio",    raw: null,                                  value: formatGbp(d.portfolio.totalValueGbp), color: d.portfolio.totalPlGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)", sub: `P&L ${d.portfolio.totalPlGbp >= 0 ? "+" : ""}${formatGbp(d.portfolio.totalPlGbp)}`, animate: false },
    { label: "Net Liquidity",raw: null,                                  value: formatGbp(d.netLiquidity),           color: d.netLiquidity >= 0 ? "var(--ft-green)" : "var(--ft-red)", sub: "After 30d commitments", animate: false },
  ] : [];

  const breakdownRow = d && (
    <div style={{ borderTop: "1px solid var(--ft-border)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: "var(--ft-surface)" }}>
      {[
        { label: "Cash",      value: formatGbp(d.totalCash),                 color: "var(--ft-accent)" },
        { label: "Portfolio", value: formatGbp(d.portfolio.totalValueGbp),  color: "var(--ft-green)" },
        { label: "Net Debt",  value: formatGbp(d.owing.totalIOwe),          color: d.owing.totalIOwe > 0 ? "var(--ft-red)" : "var(--ft-dim)" },
      ].map((item, i) => (
        <div key={item.label} style={{ padding: "8px 12px", borderRight: i < 2 ? "1px solid var(--ft-border)" : undefined }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
            {item.label}
          </div>
          <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: item.color }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );

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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {kpis.map((k, i) => (
          <div key={k.label} style={{ padding: "14px 12px", borderRight: i < kpis.length - 1 ? "1px solid var(--ft-border)" : undefined }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 4 }}>
              {k.label}
            </div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: k.color, lineHeight: 1.1 }}>
              {k.animate && k.raw !== null ? <AnimatedGbp value={k.raw} /> : k.value}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
              {k.sub}
            </div>
          </div>
        ))}
      </div>

      <div style={{ borderTop: "1px solid var(--ft-border)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: "var(--ft-raised)" }}>
        {[
          { label: "Income",       value: `+${formatGbp(d.thisMonth.income)}`,   color: "var(--ft-green)" },
          { label: "Expenses",     value: `-${formatGbp(d.thisMonth.expenses)}`, color: "var(--ft-red)" },
          { label: "Savings Rate", value: formatPercent(d.thisMonth.savingsRate), color: d.thisMonth.savingsRate >= 20 ? "var(--ft-green)" : "var(--ft-amber)" },
        ].map((item, i) => (
          <div key={item.label} style={{ padding: "10px 12px", borderRight: i < 2 ? "1px solid var(--ft-border)" : undefined }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3 }}>
              {item.label}
            </div>
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: item.color }}>
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {breakdownRow}

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
            <tr key={acct.id} style={{ borderTop: i === 0 ? "1px solid var(--ft-border)" : "1px solid var(--ft-border)" }}>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", padding: "7px 0 7px 0", paddingRight: 8, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {acct.name}
              </td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", padding: "7px 8px 7px 0" }}>
                {acct.currency}
              </td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-muted)", padding: "7px 8px 7px 0", textAlign: "right" }}>
                <span className="pnum">{acct.currency !== "GBP" ? acct.balance.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</span>
              </td>
              <td style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--ft-accent)", textAlign: "right", padding: "7px 0" }}>
                <span className="pnum">{formatGbp(acct.gbpEquivalent)}</span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "1px solid var(--ft-border2)" }}>
            <td colSpan={3} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", textTransform: "uppercase", letterSpacing: "0.06em", paddingTop: 8 }}>
              Total Cash
            </td>
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-accent)", textAlign: "right", paddingTop: 8 }}>
              <span className="pnum">{formatGbp(d.totalCash)}</span>
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
