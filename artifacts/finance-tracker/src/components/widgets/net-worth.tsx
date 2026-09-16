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
import { signedAccountAmount } from "@/lib/account-sign";

const HISTORY_KEY = "ft-nw-history";
const MAX_ENTRIES = 365;

type HistoryEntry = { date: string; netWorth: number; cash: number; portfolio: number };
type Period = "7D" | "1M" | "3M" | "ALL";

// `gbpTotal` and `share` are null when ANY account in the bucket has no FX
// rate. Not zero: a currency whose rate is missing has an unknown base value,
// and "£0" beside a real RM 851,980.00 is a fabricated number, which is the
// one thing this app is not allowed to print. formatBaseMoney's own note says
// it — "a row that reads RM 4,120.00 · — is honest, £0 is not".
type CurrencyGroup = { currency: string; nativeTotal: number; gbpTotal: number | null; share: number | null };

// The shares must sum to 100%, and until 2026-09-16 they summed to 103%.
//
// Numerator and denominator were drawn from two different populations. The
// denominator, `totalCash`, is `assetAccountsTotal` (routes/dashboard.ts) and
// EXCLUDES liabilities. The numerator reduced over every row in
// `accountBreakdown`, liabilities included, so the seed account's £6,800
// season-ticket loan was added to the GBP bucket as if it were £6,800 held.
// GBP therefore claimed 28% of a whole that never contained it, and
// MYR 75% + GBP 28% + EUR 0% came to 103%.
//
// This is exactly the defect `lib/account-sign.ts` exists to end, and that
// module's own comment names the shape: "it lives in one module so a third
// list cannot re-introduce the same defect with its own reduce()". This was
// that third list, with its own reduce(), in a file that already imported the
// module for something else.
//
// NET is the convention, matching the two surfaces that already state a
// currency exposure and already agree with each other — `computeCurrencyExposure`
// (phone/WorthScreen.tsx) and the Currency Exposure block on the accounts page,
// both of which sign with `signedAccountAmount` on both halves of the division.
// The phone carries the argument: a £6,800 sterling loan against £11,375 of
// sterling cash is £4,575 of sterling, not £18,175. This widget was the only
// one of the three that disagreed, which is why the desktop shipped 103% while
// the phone did not.
//
// The share of a net whole can be NEGATIVE — a currency whose only holding is
// a loan. The figure prints as it is, because CLAUDE.md's rule is that a
// figure is shown as supplied or not at all. The BAR is what cannot draw it:
// value is encoded by length, and a length has no sign, so the bar clamps at
// zero while the percentage beside it does not.
function buildCurrencyGroups(
  accountBreakdown: { currency: string; balance: number; baseEquivalent: number | null; type: string }[],
  netTotal: number
): CurrencyGroup[] {
  const map = new Map<string, { native: number; gbp: number | null }>();
  for (const acct of accountBreakdown) {
    const prev = map.get(acct.currency) ?? { native: 0, gbp: 0 };
    // An unconvertible account POISONS its bucket's base total rather than
    // adding zero to it. Coalescing a missing base equivalent to zero is the
    // fabricated-zero defect
    // the lock in lib/fabricated-zero-lock.test.ts exists to stop, and it was
    // live here: an account with no rate silently shrank its own currency's
    // share and every other currency's share grew to fill the gap. The count
    // is already surfaced by UnconvertibleAccountsBadge on this same widget;
    // this makes the figure it qualifies honest instead of merely caveated.
    const base = signedAccountAmount(acct.type, acct.baseEquivalent);
    map.set(acct.currency, {
      native: prev.native + (signedAccountAmount(acct.type, acct.balance) ?? 0),
      gbp: prev.gbp == null || base == null ? null : prev.gbp + base,
    });
  }
  return Array.from(map.entries())
    .map(([currency, { native, gbp }]) => ({
      currency,
      nativeTotal: native,
      gbpTotal: gbp,
      // Share of a zero total is undefined, not 0% for every currency — and
      // so is the share of a bucket whose own base value is unknown.
      share: gbp != null && netTotal > 0 ? (gbp / netTotal) * 100 : null,
    }))
    // Unknown sorts last. It cannot be compared with a figure, and putting it
    // at the top on a -Infinity would claim it is the largest holding.
    .sort((a, b) => (b.gbpTotal ?? -Infinity) - (a.gbpTotal ?? -Infinity));
}

/**
 * A share as a percentage, where rounding must not turn a real holding into
 * nothing.
 *
 * €540.75 of a £200,579.93 total is 0.23%, and `toFixed(0)` printed that as
 * "0%" directly above the €540.75 itself — the card stating in one line that
 * the money in the next line does not exist. A share too small to round to a
 * whole percent reports as "<1%", which is true and is visibly not a zero.
 * The mirror case gets the same treatment: a share just under 100% must not
 * round up to a "100%" that denies the other currencies on the strip.
 */
function formatShare(share: number): string {
  if (share > 0 && share < 0.5) return "<1%";
  if (share < 100 && share >= 99.5) return ">99%";
  return `${share.toFixed(0)}%`;
}

function formatNative(amount: number, currency: string): string {
  const symbols: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", MYR: "RM ", SGD: "S$", AUD: "A$", CAD: "C$", JPY: "¥", HKD: "HK$", CHF: "CHF " };
  const sym = symbols[currency] ?? `${currency} `;
  return `${sym}${Math.abs(amount).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Sorted on the way out, never trusted as stored.
//
// The x-axis read "7 Sept · 20 Aug · 10 Sept · 8 Sept · 9 Sept · 11 Sept ·
// 13 Sept · 16 Sept" — August between two Septembers — because entries were
// appended in the order the widget happened to mount and the array was
// plotted in that order. Recharts draws a categorical axis from the array,
// so the line travelled backwards in time and the chart was not a chart of
// anything.
//
// Nothing in this file ever guaranteed the order. The append guard only
// checks that today is not already present; an entry written under a clock
// that had moved, or restored from a backup, lands wherever it lands. The
// fix is here rather than at the append because this is the only place the
// stored array becomes data, so a future writer cannot reintroduce it.
//
// Rows with no usable date are dropped rather than sorted to one end: a
// point with no x is not a point, and keeping it would put a fabricated
// position on a chart of someone's money.
function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as HistoryEntry[])
      .filter((e) => e != null && typeof e.date === "string" && !Number.isNaN(Date.parse(e.date)))
      .sort((a, b) => a.date.localeCompare(b.date));
  } catch { return []; }
}

function saveHistory(entries: HistoryEntry[]): void {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(entries)); } catch {}
}

// The LOCAL calendar day, as YYYY-MM-DD.
//
// Not `toISOString().slice(0, 10)`, which is the UTC day: east of Greenwich
// the local midnight is still yesterday in UTC, so that idiom names the
// wrong day for every user ahead of it and the wrong day the other way for
// every user behind. Entries in this history are keyed by local day, so a
// cutoff computed in UTC would compare against a different calendar.
function isoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
      {/* The denominator, named. A set of percentages is a claim about a
          whole, and a reader who cannot see which whole cannot check the
          claim — which is how 103% survived on screen for days. It names
          ACCOUNTS rather than net worth because the portfolio is not in this
          division, and NET OF DEBT because liabilities are signed into both
          halves of it; see buildCurrencyGroups. */}
      <div style={{ padding: "10px 12px 0", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ft-dim)" }}>
        Share of accounts, net of debt
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "6px 0 0 12px", overflowX: "auto", scrollbarWidth: "none" }}>
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
                {g.share == null ? "—" : formatShare(g.share)}
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
              <div style={{ height: "100%", width: `${Math.max(0, g.share ?? 0)}%`, background: `hsl(${(groups.indexOf(g) * 47 + 200) % 360}, 60%, 55%)`, opacity: 0.9 }} />
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
        // No overflow: hidden and no minWidth: 0 here. Together they are the
        // recipe that clipped £229,628.27 to £229,6 — minWidth: 0 lets the grid
        // track shrink below the figure, overflow: hidden hides the evidence,
        // and the result is a readable number that is wrong. The grids these
        // cells sit in drop a column instead (auto-fit, below), so the figure
        // is never asked for less width than it needs. Locked by
        // pnum-clip.lock.test.ts.
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
        // No overflow: hidden and no minWidth: 0 here. Together they are the
        // recipe that clipped £229,628.27 to £229,6 — minWidth: 0 lets the grid
        // track shrink below the figure, overflow: hidden hides the evidence,
        // and the result is a readable number that is wrong. The grids these
        // cells sit in drop a column instead (auto-fit, below), so the figure
        // is never asked for less width than it needs. Locked by
        // pnum-clip.lock.test.ts.
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
        // No overflow: hidden and no minWidth: 0 here. Together they are the
        // recipe that clipped £229,628.27 to £229,6 — minWidth: 0 lets the grid
        // track shrink below the figure, overflow: hidden hides the evidence,
        // and the result is a readable number that is wrong. The grids these
        // cells sit in drop a column instead (auto-fit, below), so the figure
        // is never asked for less width than it needs. Locked by
        // pnum-clip.lock.test.ts.
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
  // `type` is required, not optional: without it this row cannot ask for the
  // signed figure, and a liability prints as a positive holding.
  acct: { id: number | string; name: string; type: string; currency: string; balance: number; baseEquivalent: number | null };
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
        {acct.baseEquivalent == null ? "—" : <span className="pnum">{formatBaseMoney(signedAccountAmount(acct.type, acct.baseEquivalent))}</span>}
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
    const today = isoDay(new Date());
    const existing = loadHistory();
    if (existing.some(e => e.date === today)) { setHistory(existing); return; }
    const newEntry: HistoryEntry = { date: today, netWorth: d.netWorth, cash: d.totalCash, portfolio: d.portfolio.totalValueBase };
    // Re-sorted rather than appended blind. "Today" is only the newest entry
    // while the clock moves forwards, and an out-of-order write is what put
    // 20 August between two Septembers in the first place.
    const updated = [...existing, newEntry]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-MAX_ENTRIES);
    saveHistory(updated);
    setHistory(updated);
  }, [d]);

  // A window in DAYS, not in entries. `slice(-7)` took the last seven
  // RECORDINGS, and this history gains an entry only on a day the dashboard
  // was opened — so "7D" on a widget opened eight times since June was a
  // three-month chart wearing a seven-day label. The period buttons name
  // spans of time, so they have to select by time.
  const periodDef = PERIODS.find(p => p.label === period)!;
  const filteredHistory = (() => {
    if (periodDef.days == null) return history;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - periodDef.days);
    return history.filter(e => e.date >= isoDay(cutoff));
  })();

  // Denominator: accounts NET of liabilities, so it is the same population the
  // buckets above are summed from. `d.totalCash` is the gross asset total and
  // was the wrong half of the division — see buildCurrencyGroups.
  const currencyGroups = d ? buildCurrencyGroups(d.accountBreakdown, d.totalCash - d.totalLiabilities) : [];

  // "This month" here must sum the same window the ledger will show.
  const month = thisMonthRange();

  // DESIGN.md §14's three states. Zero is a real sum that prints, but it
  // means the ledger holds no rows for this window, so it takes no drill —
  // and this widget shipped four figures that offered one anyway (INCOME
  // +£0.00 was the live case on the seeded account, the other three were the
  // same defect waiting on different data). A drill that opens an empty list
  // is a promise the product did not keep.
  const drillWhen = (hasRows: boolean, href: string): string | undefined =>
    hasRows ? href : undefined;

  // `d.totalCash` is EVERY non-liability account (assetAccountsTotal,
  // routes/dashboard.ts), so it legitimately counts a flat, a SIPP and an
  // ISA — £207,690.91 on the seed account against £11,375.18 of real cash.
  // It was labelled "Total Cash" here and "Cash" in the breakdown below,
  // which told the reader a Kuala Lumpur flat was money in hand.
  //
  // The label is what was wrong, not the field: totalCash is a term of the
  // response identity `netWorth == totalCash + portfolio + owing −
  // totalLiabilities`, and spendable cash already has a name in this same
  // widget (Net Liquidity). "Accounts" rather than "Assets" because
  // Portfolio is a separate cell and separate from this figure.
  const kpis = d ? [
    { label: "Net Worth",    raw: d.netWorth,                             value: formatBaseMoney(d.netWorth),               color: "var(--ft-accent)", sub: "Accounts + Portfolio + owed − liabilities", animate: true, href: drillWhen(d.accountBreakdown.length > 0, "/net-worth") },
    { label: "Accounts",     raw: null,                                   value: formatBaseMoney(d.totalCash),              color: "var(--ft-text)",   sub: `${d.accountBreakdown.length} accounts`, animate: false, href: drillWhen(d.accountBreakdown.length > 0, "/accounts") },
    { label: "Portfolio",    raw: null,                                   value: formatBaseMoney(d.portfolio.totalValueBase), color: d.portfolio.totalPlBase >= 0 ? "var(--ft-green)" : "var(--ft-red)", sub: `P&L ${d.portfolio.totalPlBase >= 0 ? "+" : ""}${formatBaseMoney(d.portfolio.totalPlBase)}`, animate: false, href: drillWhen(d.portfolio.totalValueBase !== 0, "/investments") },
    { label: "Net Liquidity",raw: null,                                   value: formatBaseMoney(d.netLiquidity),           color: d.netLiquidity >= 0 ? "var(--ft-green)" : "var(--ft-red)", sub: "After 30d commitments", animate: false, href: drillWhen(d.accountBreakdown.length > 0, "/accounts") },
  ] : [];

  const monthStats = d ? [
    { label: "Income",       value: `+${formatBaseMoney(Math.abs(d.thisMonth.income))}`,   color: "var(--ft-green)", href: drillWhen(d.thisMonth.income !== 0, ledgerHref({ type: "income", ...month })) },
    { label: "Expenses",     value: `-${formatBaseMoney(Math.abs(d.thisMonth.expenses))}`, color: "var(--ft-red)", href: drillWhen(d.thisMonth.expenses !== 0, ledgerHref({ type: "expense", ...month })) },
    // Savings Rate is income over expenses, a ratio rather than a set of
    // rows. §14: a figure not made of rows is not a button.
    { label: "Savings Rate", value: d.thisMonth.savingsRate == null ? "—" : formatPercent(d.thisMonth.savingsRate), color: (d.thisMonth.savingsRate ?? 0) >= 20 ? "var(--ft-green)" : "var(--ft-amber)" },
  ] : [];

  // The card's own arithmetic, in the terms it does not already state above.
  //
  // This row used to be Accounts, Portfolio and Net Debt, which printed
  // ACCOUNTS and PORTFOLIO a SECOND time inside the same card — the same two
  // figures, six inches apart, from two config arrays that each listed them.
  // A layout bug would have been the kinder explanation.
  //
  // Worse than the repetition was what the repetition crowded out. Net worth
  // on this account is £216,033.82 and the card showed Accounts £207,379.93,
  // Portfolio £15,358.19 and Net Debt £48.00, which comes to £222,690.12 —
  // £6,656.30 apart from the figure at the top of the same card, under a
  // caption reading "Accounts + Portfolio − debt". The £6,800 season-ticket
  // loan appeared nowhere, and "debt" pointed at the £48 someone is owed
  // rather than at the liability.
  //
  // The identity routes/dashboard.ts states and its tests pin has four terms:
  //
  //   netWorth == totalCash + portfolio.totalValueBase + owing.netBase
  //               − totalLiabilities
  //
  // Two are already cells above, so this row carries the two that were
  // missing, and the four now reconcile on screen: 207,379.93 + 15,358.19
  // + 95.70 − 6,800.00 = 216,033.82.
  //
  // Owing is the NET of both directions, not `totalIOwe`. A row labelled
  // "Net Debt" that ignored the £143.70 owed TO the holder was not net, and
  // it is the term the identity actually contains.
  const breakdownItems = d ? [
    { label: "Owed, net",  value: formatBaseMoney(d.owing.netBase),                color: d.owing.netBase >= 0 ? "var(--ft-green)" : "var(--ft-red)", href: drillWhen(d.owing.pendingCount > 0, "/owing") },
    // Negated here and stated by the formatter, never by a "−" glyph in
    // front of one — DESIGN.md §7 and the sign-glyph lock. totalLiabilities
    // is a POSITIVE magnitude on the wire and non-nullable, so no coalesce.
    { label: "Liabilities", value: formatBaseMoney(-d.totalLiabilities),         color: d.totalLiabilities > 0 ? "var(--ft-red)" : "var(--ft-dim)", href: drillWhen(d.totalLiabilities !== 0, "/accounts") },
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
      {/* KPI strip — border-as-gap pattern.

          The column count is `auto-fit` rather than a fixed 4, because this
          widget is not always as wide as the page. `.ft-four-col` also opts
          into the main-content container query (3-col ≤900 content width,
          2-col ≤700), and that query measures `.ft-main-inner` — the whole
          content area — not this box. On a wide page inside a narrow panel it
          never fires, which is how a 291px box kept four columns and cropped
          its figures. `auto-fit` measures the box itself, so the two agree:
          the query handles a narrow PAGE, auto-fit handles a narrow BOX. */}
      <div className="ft-four-col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", columnGap: 16, padding: "0 0 0 12px" }}>
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
      <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", columnGap: 16, padding: "0 0 0 12px" }}>
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
      <div className="ft-three-col" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(115px, 1fr))", columnGap: 16, padding: "0 0 12px 12px" }}>
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
              Accounts
            </td>
            <td style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--ft-accent)", textAlign: "right", paddingTop: 8 }}>
              <Drill href="/accounts" title="Account assets — every account it is the sum of"><span className="pnum">{formatBaseMoney(d.totalCash)}</span></Drill>
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
