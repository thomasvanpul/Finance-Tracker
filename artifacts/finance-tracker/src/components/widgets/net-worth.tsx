import { useEffect, useState } from "react";
import { useGetDashboard } from "@workspace/api-client-react";
import { UnconvertibleAccountsBadge } from "@/components/UnconvertibleAccountsBadge";
import { StaleAsOf } from "@/components/StaleAsOf";
import { formatBaseMoney, formatPercent } from "@/lib/utils";
import { Drill, DrillTarget } from "@/components/drill";
import { entityHref, ledgerHref, thisMonthRange } from "@/lib/entity-href";
import { WidgetShell } from "./widget-shell";
import { useCountUp } from "@/hooks/use-count-up";
import { CurrencyMark } from "@/components/currency-mark";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const HISTORY_KEY = "ft-nw-history";
const MAX_ENTRIES = 365;

type HistoryEntry = { date: string; netWorth: number; cash: number; portfolio: number };
type Period = "7D" | "1M" | "3M" | "ALL";

type CurrencyGroup = { currency: string; nativeTotal: number; gbpTotal: number; share: number | null };

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
      // Share of zero total cash is undefined, not 0% for every currency.
      share: totalCash > 0 ? (gbp / totalCash) * 100 : null,
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
    // No band fill either. A strip painted a different colour from the panel
    // around it is the same box drawn without a border, and on the light
    // themes it read as the strongest rectangle in the widget.
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 0 0 12px", overflowX: "auto", scrollbarWidth: "none" }}>
        {groups.map((g, i) => (
          // The two totals are sums of the accounts held in this currency, so
          // the cell opens the accounts list (§14). The share percentage beside
          // them is a proportion of a whole, not a set of rows, and stays flat.
          <DrillTarget
            key={g.currency}
            href="/accounts"
            title={`${g.currency} holdings — the accounts this adds up`}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "8px 12px 8px 0",
              minWidth: 0,
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 3 }}>
              <span style={{ color: "var(--ft-muted)" }}>
                <CurrencyMark code={g.currency} size={10} />
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginLeft: 2 }}>
                {g.share == null ? "—" : `${g.share.toFixed(0)}%`}
              </span>
            </div>
            <div style={{ color: "var(--ft-accent)" }}>
              <span className="pnum ft-drill" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>
                {formatNative(g.nativeTotal, g.currency)}
              </span>
            </div>
            {g.currency !== "GBP" && (
              <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 1 }}>
                {formatBaseMoney(g.gbpTotal)}
              </div>
            )}
            {/* share bar */}
            <div style={{ marginTop: 4, height: 2, background: "var(--ft-border)", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${g.share ?? 0}%`, background: `hsl(${(groups.indexOf(g) * 47 + 200) % 360}, 60%, 55%)`, opacity: 0.9 }} />
            </div>
          </DrillTarget>
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
    <div style={{ background: "var(--ft-raised)", border: "1px solid var(--ft-border2)", padding: "var(--ft-widget-py) var(--ft-widget-px)", fontFamily: "var(--font-mono)" }}>
      <div style={{ fontSize: 9, color: "var(--ft-dim)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {new Date(label).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
      </div>
      <div className="pnum" style={{ fontSize: 13, fontWeight: 700, color: "var(--ft-accent)" }}>
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
      fontWeight: 600,
      color: "var(--ft-base)",
      background: isUp ? "var(--ft-green)" : "var(--ft-red)",
      padding: "var(--ft-badge-py) var(--ft-badge-px)",
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
            padding: "var(--ft-badge-py) var(--ft-badge-px)",
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
  /** Set when the figure is a sum over rows (DESIGN.md §14). */
  href?: string;
  isLast: boolean;
};

function KpiCell({ label, raw, value, color, sub, animate, href, isLast }: KpiCellProps) {
  const [hov, setHov] = useState(false);
  const cell = (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        // No rule of any kind on a KPI cell inside a framed panel
        // (DESIGN.md § 5). The grid gap and the shared baseline separate
        // these four; the widget frame is the only line.
        padding: "14px 12px 14px 0",
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
        {href
          ? <span className="ft-drill">{animate && raw !== null ? <AnimatedGbp value={raw} /> : value}</span>
          : (animate && raw !== null ? <AnimatedGbp value={raw} /> : value)}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 3 }}>
        {sub}
      </div>
    </div>
  );
  // The whole cell is the target and the underline sits on the figure —
  // DESIGN.md §14. The existing hover tint stays on the inner div, so the
  // cell keeps the behaviour it had and gains one.
  if (!href) return cell;
  return <DrillTarget href={href} title={`${label} — open what it is made of`}>{cell}</DrillTarget>;
}

type MonthStatCellProps = { label: string; value: string; color: string; href?: string; isLast: boolean };

function MonthStatCell({ label, value, color, href, isLast }: MonthStatCellProps) {
  const [hov, setHov] = useState(false);
  const cell = (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        // No rule, and no band fill either: --ft-raised across the whole row
        // was the other way this strip drew itself as a box.
        padding: "10px 12px 10px 0",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3, whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color, whiteSpace: "nowrap" }}>
        {href ? <span className="ft-drill">{value}</span> : value}
      </div>
    </div>
  );
  if (!href) return cell;
  return <DrillTarget href={href} title={`${label} — open what it is made of`}>{cell}</DrillTarget>;
}

type BreakdownCellProps = { label: string; value: string; color: string; href?: string; isLast: boolean };

function BreakdownCell({ label, value, color, href, isLast }: BreakdownCellProps) {
  const [hov, setHov] = useState(false);
  const cell = (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        padding: "8px 12px 8px 0",
        background: hov ? "color-mix(in srgb, var(--ft-accent) 5%, var(--ft-surface))" : "var(--ft-surface)",
        transition: "background 0.1s",
        overflow: "hidden",
        minWidth: 0,
      }}
    >
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 3, whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color, whiteSpace: "nowrap" }}>
        {href ? <span className="ft-drill">{value}</span> : value}
      </div>
    </div>
  );
  if (!href) return cell;
  return <DrillTarget href={href} title={`${label} — open what it is made of`}>{cell}</DrillTarget>;
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
      {/* Same destination as the dashboard ACCOUNTS row and every other
          account name in the product (DESIGN.md §14). The currency code and
          the native balance beside it are not made of rows. */}
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", padding: "7px 0 7px 0", paddingRight: 8, maxWidth: 110, whiteSpace: "nowrap" }}>
        <Drill href={entityHref("account", acct.id)}>{acct.name}</Drill>
      </td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", padding: "7px 8px 7px 0" }}>
        {acct.currency}
      </td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", padding: "7px 8px 7px 0", textAlign: "right" }}>
        <span className="pnum">{acct.currency !== "GBP" ? acct.balance.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}</span>
      </td>
      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: acct.baseEquivalent == null ? "var(--ft-dim)" : "var(--ft-accent)", textAlign: "right", padding: "7px 0" }}>
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
    const newEntry: HistoryEntry = { date: today, netWorth: d.netWorth, cash: d.totalCash, portfolio: d.portfolio.totalValueBase };
    const updated = [...existing, newEntry].slice(-MAX_ENTRIES);
    saveHistory(updated);
    setHistory(updated);
  }, [d]);

  const periodDef = PERIODS.find(p => p.label === period)!;
  const filteredHistory = periodDef.days
    ? history.slice(-periodDef.days)
    : history;

  const currencyGroups = d ? buildCurrencyGroups(d.accountBreakdown, d.totalCash) : [];

  // "This month" here must sum the same window the ledger will show.
  const month = thisMonthRange();

  const kpis = d ? [
    { label: "Net Worth",    raw: d.netWorth,                             value: formatBaseMoney(d.netWorth),               color: "var(--ft-accent)", sub: "Cash + Portfolio", animate: true, href: "/net-worth" },
    { label: "Total Cash",   raw: null,                                   value: formatBaseMoney(d.totalCash),              color: "var(--ft-text)",   sub: `${d.accountBreakdown.length} accounts`, animate: false, href: "/accounts" },
    { label: "Portfolio",    raw: null,                                   value: formatBaseMoney(d.portfolio.totalValueBase), color: d.portfolio.totalPlBase >= 0 ? "var(--ft-green)" : "var(--ft-red)", sub: `P&L ${d.portfolio.totalPlBase >= 0 ? "+" : ""}${formatBaseMoney(d.portfolio.totalPlBase)}`, animate: false, href: "/investments" },
    { label: "Net Liquidity",raw: null,                                   value: formatBaseMoney(d.netLiquidity),           color: d.netLiquidity >= 0 ? "var(--ft-green)" : "var(--ft-red)", sub: "After 30d commitments", animate: false, href: "/accounts" },
  ] : [];

  const monthStats = d ? [
    { label: "Income",       value: `+${formatBaseMoney(Math.abs(d.thisMonth.income))}`,   color: "var(--ft-green)", href: ledgerHref({ type: "income", ...month }) },
    { label: "Expenses",     value: `-${formatBaseMoney(Math.abs(d.thisMonth.expenses))}`, color: "var(--ft-red)", href: ledgerHref({ type: "expense", ...month }) },
    // Savings Rate is income over expenses, a ratio rather than a set of
    // rows. §14: a figure not made of rows is not a button.
    { label: "Savings Rate", value: d.thisMonth.savingsRate == null ? "—" : formatPercent(d.thisMonth.savingsRate), color: (d.thisMonth.savingsRate ?? 0) >= 20 ? "var(--ft-green)" : "var(--ft-amber)" },
  ] : [];

  const breakdownItems = d ? [
    { label: "Cash",      value: formatBaseMoney(d.totalCash),                color: "var(--ft-accent)", href: "/accounts" },
    { label: "Portfolio", value: formatBaseMoney(d.portfolio.totalValueBase),  color: "var(--ft-green)", href: "/investments" },
    { label: "Net Debt",  value: formatBaseMoney(d.owing.totalIOwe),          color: d.owing.totalIOwe > 0 ? "var(--ft-red)" : "var(--ft-dim)", href: "/owing" },
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
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)", textAlign: "center", padding: "20px 0" }}>
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
      <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", columnGap: 16, padding: "0 0 0 12px" }}>
        {kpis.map((k, i) => (
          <KpiCell
            key={k.label}
            label={k.label}
            raw={k.raw}
            value={k.value}
            color={k.color}
            sub={k.sub}
            animate={k.animate}
            href={k.href}
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
        // A caption on the figures above, not a band between two strips —
        // so it carries no rule and sits directly under what it qualifies.
        <div style={{ padding: "0 12px 8px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <UnconvertibleAccountsBadge count={d.unconvertibleAccounts ?? 0} />
          <StaleAsOf ts={dataUpdatedAt} isFresh={!isStale} />
        </div>
      )}

      {/* Month stats strip */}
      <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: 16, padding: "0 0 0 12px" }}>
        {monthStats.map((item, i) => (
          <MonthStatCell
            key={item.label}
            label={item.label}
            value={item.value}
            color={item.color}
            href={item.href}
            isLast={i === monthStats.length - 1}
          />
        ))}
      </div>

      {/* Breakdown strip */}
      <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", columnGap: 16, padding: "0 0 12px 12px" }}>
        {breakdownItems.map((item, i) => (
          <BreakdownCell
            key={item.label}
            label={item.label}
            value={item.value}
            color={item.color}
            href={item.href}
            isLast={i === breakdownItems.length - 1}
          />
        ))}
      </div>

      <CurrencyExposureStrip groups={currencyGroups} />

      {history.length >= 2 && chartSection}
    </>
  );

  const expandedRightColumn = d && (
    <div style={{ padding: "var(--ft-widget-py) var(--ft-widget-px)", overflowY: "auto" }}>
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
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-accent)", textAlign: "right", paddingTop: 8 }}>
              <Drill href="/accounts" title="Total cash — every account it is the sum of"><span className="pnum">{formatBaseMoney(d.totalCash)}</span></Drill>
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
