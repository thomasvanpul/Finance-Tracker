import { useState } from "react";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/privacy-context";
import {
  useGetDashboard,
  useListTransactions,
  useGetTransactionSummary,
  useListSubscriptions,
} from "@workspace/api-client-react";
import type { AppScreen } from "./MobileApp";
import { MobileEmptyState } from "./mobile-ui";

// ── Number rule (docs/MOBILE-CONCEPT.md § Approved 13 Aug 2026, second pass) ──
// Separators always. Two decimals for facts. No decimals for shapes.
// True minus (U+2212) before symbol, never brackets, never colour alone.
function nfmt(
  value: number,
  opts: { decimals?: number; sign?: boolean; symbol?: string } = {},
): string {
  const decimals = opts.decimals ?? 2;
  const sign = opts.sign ?? false;
  const symbol = opts.symbol ?? "";
  const negative = value < 0;
  const abs = Math.abs(value);
  const str = abs.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const prefix = negative ? "−" : sign ? "+" : "";
  return `${prefix}${symbol}${str}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£",
  USD: "$",
  EUR: "€",
  MYR: "RM ",
  CNY: "¥",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  HKD: "HK$",
  THB: "฿",
  INR: "₹",
};

// ── View switcher state ──
type ViewMode = "blocks" | "bands" | "ring";

interface MobileHomeProps {
  onNavigate: (screen: AppScreen) => void;
}

// ── Holdings composition (pure, testable) ────────────────────────────────────
// Categorises real accounts from the DashboardSummary.accountBreakdown array
// using each account's declared `type`. No residual; no subtraction. If an
// account is uncategorised in the DB it defaults to 'cash' (per the C1
// backfill rule), so nothing lands in `other` unless a user has deliberately
// set it there. Portfolio positions add to `invested` on top of any
// investment-typed accounts.
export type AccountType = "cash" | "investment" | "pension" | "property" | "other";

export interface HoldingsInput {
  accountBreakdown?: Array<{ type: AccountType; gbpEquivalent: number }>;
  portfolio?: { totalValueGbp?: number };
}
// Bucket keys match the DB column values 1:1 so the loop is `buckets[a.type]`
// with no translation table.
export interface Holdings {
  cash: number;
  investment: number;
  pension: number;
  property: number;
  other: number;
}
export function computeHoldings(d: HoldingsInput | null | undefined): Holdings {
  const buckets: Holdings = { cash: 0, investment: 0, pension: 0, property: 0, other: 0 };
  for (const a of d?.accountBreakdown ?? []) {
    buckets[a.type] += a.gbpEquivalent;
  }
  // Portfolio positions live in a separate table from accounts. An investment
  // account itself holds the uninvested cash (part of buckets.investment via
  // its 'investment' type); the position value is added here.
  buckets.investment += d?.portfolio?.totalValueGbp ?? 0;
  return buckets;
}

export function MobileHome(_props: MobileHomeProps) {
  const [, navigate] = useLocation();
  const { privacy: _privacy } = usePrivacy();
  const [view, setView] = useState<ViewMode>("blocks");

  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dateFrom = `${monthStr}-01`;
  const dateTo = now.toISOString().slice(0, 10);

  const { data: dashboard } = useGetDashboard();
  const { data: _monthSummary } = useGetTransactionSummary({ month: monthStr });
  const { data: txns = [] } = useListTransactions({ dateFrom, dateTo });
  const { data: subs = [] } = useListSubscriptions();

  // ── Derived from real data ──
  const netWorth = dashboard?.netWorth ?? 0;
  // MTD delta: uses thisMonth.netSavings as a proxy for month-to-date net worth
  // change. Exact NW delta would need daily NW snapshots; the API does not carry
  // them. Approximation is acceptable per the concept — the number rule still
  // stands.
  const mtdDelta = dashboard?.thisMonth.netSavings ?? 0;
  const priorNw = netWorth - mtdDelta;
  const mtdPct = priorNw > 0 ? (mtdDelta / priorNw) * 100 : 0;

  const holdings = computeHoldings(dashboard);
  const totalCash = holdings.cash;

  const activeAccounts = dashboard?.accountBreakdown ?? [];
  const currencyCount = new Set(activeAccounts.map((a) => a.currency)).size;

  const owedByMe = dashboard?.owing.totalIOwe ?? 0;
  const pendingCount = dashboard?.owing.pendingCount ?? 0;

  const activeSubs = subs.filter((s) => s.active);
  const upcomingBills = activeSubs
    .filter((s): s is typeof s & { nextDue: string } => !!s.nextDue)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 2);
  const monthlySubTotalGbp = activeSubs.reduce((sum, s) => {
    if (s.currency !== "GBP") return sum; // no FX in this pane
    const per =
      s.frequency === "monthly"
        ? s.amount
        : s.frequency === "annual"
          ? s.amount / 12
          : s.frequency === "quarterly"
            ? s.amount / 3
            : s.amount * 4.33; // weekly
    return sum + per;
  }, 0);

  const lastDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();

  // Cashflow: rolling daily balance from txns this month (past only).
  const dailyBalances = buildDailyBalances(txns, now, totalCash);
  const monthLow = dailyBalances.length
    ? dailyBalances.reduce((lo, d) => (d.balance < lo.balance ? d : lo))
    : null;

  const timeStr = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const monthShortMixed = now.toLocaleDateString("en-GB", { month: "short" });
  const monthName = now
    .toLocaleDateString("en-GB", { month: "long" })
    .toUpperCase();
  const todayIndex = now.getDate() - 1;

  // ── Empty state: no accounts connected ───────────────────────────────────
  // Only fires once the dashboard has actually loaded so we don't flash it
  // before data arrives. Footer is rendered by MobileApp, so this returns
  // just the screen body.
  if (dashboard != null && activeAccounts.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "var(--ft-base)",
          color: "var(--ft-text)",
          fontFamily: "var(--font-sans)",
          WebkitFontSmoothing: "antialiased",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            height: 44,
            padding: "0 18px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-dim)",
          }}
        >
          <span>NUMERIS</span>
        </div>
        <MobileEmptyState
          label="NO ACCOUNTS"
          title="Nothing to show yet."
          description="Numeris reads Wise and Revolut, or you can add an account by hand. Once one is connected the home screen fills in on its own."
          ctaLabel="Add an account"
          onCta={() => navigate("/accounts")}
        />
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
        fontFamily: "var(--font-sans)",
        WebkitFontSmoothing: "antialiased",
        overflowY: "auto",
        overflowX: "hidden",
        paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px) + 16px)",
      }}
      className="mobile-scroll"
    >
        {/* Top bar (44px, JetBrains Mono, dim) */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            height: 44,
            padding: "0 18px",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-dim)",
          }}
        >
          <span>LIVE · {activeAccounts.length} ACCOUNTS</span>
        </div>

        {/* Net worth headline */}
        <div style={{ padding: "4px 18px 18px" }}>
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              color: "var(--ft-dim)",
            }}
          >
            NET WORTH
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 4,
              marginTop: 6,
            }}
          >
            <span style={{ fontSize: 17, color: "var(--ft-dim)" }}>£</span>
            <span
              className="pnum"
              style={{
                fontSize: 34,
                lineHeight: "34px",
                fontWeight: 600,
                letterSpacing: "-0.035em",
              }}
            >
              {nfmt(netWorth)}
            </span>
          </div>
          <div
            className="pnum"
            style={{
              marginTop: 6,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color:
                mtdDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)",
            }}
          >
            {nfmt(mtdDelta, { sign: true, symbol: "£" })} ·{" "}
            {nfmt(mtdPct, { sign: true })}% since 1 {monthShortMixed}
          </div>
        </div>

        {/* Holdings header + BLOCKS / BANDS / RING switcher */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 18px 10px",
          }}
        >
          <a
            onClick={(e) => {
              e.preventDefault();
              navigate("/net-worth");
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              minHeight: 44,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              color: "var(--ft-dim)",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            HOLDINGS ›
          </a>
          <div style={{ display: "flex", alignItems: "center", height: 44, gap: 2 }}>
            <ViewTab label="BLOCKS" active={view === "blocks"} onClick={() => setView("blocks")} />
            <ViewTab label="BANDS" active={view === "bands"} onClick={() => setView("bands")} />
            <ViewTab label="RING" active={view === "ring"} onClick={() => setView("ring")} />
          </div>
        </div>

        {/* Chart area — one of BLOCKS / BANDS / RING */}
        <div style={{ padding: "0 18px" }}>
          {view === "blocks" && (
            <BlocksView
              property={holdings.property}
              cash={holdings.cash}
              invested={holdings.investment}
              pension={holdings.pension}
              other={holdings.other}
            />
          )}
          {view === "bands" && <PlaceholderPanel />}
          {view === "ring" && <PlaceholderPanel />}
        </div>

        {/* Claimed (liabilities are outlined, no depth) */}
        {owedByMe > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "18px 18px 0",
            }}
          >
            {/* Outlined glyph — a claim is not material you hold. Compact
                14x14 marker; the previous 88x19 bar read as an empty input. */}
            <div
              style={{
                width: 14,
                height: 14,
                borderWidth: 1, borderStyle: "solid", borderColor: "var(--ft-red)",
                boxSizing: "border-box",
                flex: "none",
                marginTop: 2,
              }}
            />
            <div
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                lineHeight: "16px",
                color: "var(--ft-red)",
              }}
            >
              CLAIMED {nfmt(-owedByMe, { symbol: "£" })} · {pendingCount}{" "}
              {pendingCount === 1 ? "DEBT" : "DEBTS"}
            </div>
          </div>
        )}

        {/* Cashflow section — only when there is anything to plot */}
        {txns.length > 0 && (
          <>
            <SectionHeader
              label={`${monthName} · LIQUID`}
              link="CASHFLOW ›"
              onLink={() => navigate("/cashflow")}
            />
            <div style={{ padding: "0 18px" }}>
              <CashflowChart
                days={dailyBalances}
                todayIndex={todayIndex}
                lastDay={lastDayOfMonth}
                low={monthLow}
                monthShortMixed={monthShortMixed}
              />
            </div>
          </>
        )}

        {/* Accounts section */}
        <SectionHeader
          label={`LIQUID · £ · ${currencyCount || 1} ${(currencyCount || 1) === 1 ? "CURRENCY" : "CURRENCIES"}`}
          link="ACCOUNTS ›"
          onLink={() => navigate("/accounts")}
        />
        <div style={{ padding: "0 18px" }}>
          <AccountsList accounts={activeAccounts} />
        </div>

        {/* Coming section */}
        <SectionHeader
          label="COMING · KNOWN WITH CERTAINTY"
          link="MONTH ›"
          onLink={() => navigate("/upcoming")}
        />
        <div style={{ padding: "0 18px" }}>
          <UpcomingList bills={upcomingBills} />
          <a
            onClick={(e) => {
              e.preventDefault();
              navigate("/split");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              minHeight: 44,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              color: "var(--ft-dim)",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            SPLIT A BILL ›
          </a>
        </div>

        {/* Elsewhere in Numeris */}
        <div
          style={{
            marginTop: 12,
            padding: "16px 18px 24px",
            borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
              color: "var(--ft-dim)",
              marginBottom: 4,
            }}
          >
            ELSEWHERE IN NUMERIS
          </div>
          <ElsewhereRow
            label="Investments"
            valueLabel={
              dashboard?.portfolio.totalPlPercent != null
                ? nfmt(dashboard.portfolio.totalPlPercent, { sign: true }) + "%"
                : "—"
            }
            valueColor={
              (dashboard?.portfolio.totalPlPercent ?? 0) >= 0
                ? "var(--ft-green)"
                : "var(--ft-red)"
            }
            onClick={() => navigate("/portfolio")}
          />
          <ElsewhereRow
            label="Goals"
            valueLabel="—"
            valueColor="var(--ft-dim)"
            onClick={() => navigate("/goals")}
          />
          <ElsewhereRow
            label="Subscriptions"
            valueLabel={
              activeSubs.length
                ? `${nfmt(monthlySubTotalGbp, { symbol: "£" })} a month`
                : "—"
            }
            valueColor="var(--ft-dim)"
            onClick={() => navigate("/subscriptions")}
          />
          {/* Currency row dropped: no FX data and no honest destination. */}
          <a
            onClick={(e) => {
              e.preventDefault();
              navigate("/more");
            }}
            style={{
              display: "flex",
              alignItems: "center",
              minHeight: 44,
              textDecoration: "none",
              color: "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              cursor: "pointer",
            }}
          >
            ALL 37 PLACES · SEARCH ›
          </a>
        </div>
    </div>
  );
}

// ── View switcher tab ────────────────────────────────────────────────────────
function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
    height: 26,
    padding: "0 8px",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer",
    boxSizing: "border-box",
  };
  const on: React.CSSProperties = {
    background: "var(--ft-text)",
    color: "var(--ft-base)",
  };
  const off: React.CSSProperties = {
    color: "var(--ft-dim)",
    borderWidth: 1, borderStyle: "solid", borderColor: "var(--ft-border)",
  };
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", minHeight: 44, cursor: "pointer" }}
    >
      <span style={{ ...base, ...(active ? on : off) }}>{label}</span>
    </div>
  );
}

// ── Blocks view ──────────────────────────────────────────────────────────────
// OTHER (residual — see MobileHome above) takes the top block when > 0.
// LIQUID / INVESTED / PENSION share the row below with widths proportional to
// value. When OTHER is zero, the top block is not rendered and the row grows
// to fill the full 296px height. Constant 10px decorative depth via
// box-shadow — value is encoded ONLY by area (concept doc: dimensionality is
// styling, never data).
function BlocksView({
  property,
  cash,
  invested,
  pension,
  other,
}: {
  property: number;
  cash: number;
  invested: number;
  pension: number;
  other: number;
}) {
  const FIELD_H = 296;
  const AVAILABLE_W = 354;
  // Top block is PROPERTY when > 0 (the "flat" in the design's language).
  // If no property is tracked, the row of remaining categories grows to fill
  // the field height — same layout rule as before.
  const showProperty = property > 0;
  const topH = showProperty ? 230 : 0;
  const rowH = showProperty ? 64 : FIELD_H;
  const total = property + cash + invested + pension + other;

  // Row: CASH / INVESTED / PENSION / OTHER — widths proportional to value.
  // Each renders only if > 0. `other` is a real category (user-declared),
  // not a residual.
  const rowValues: Array<{ key: string; value: number; label: string; bg: string; fg: string }> = [];
  if (cash > 0)
    rowValues.push({ key: "C", value: cash, label: "CASH", bg: "var(--ft-accent)", fg: "var(--ft-base)" });
  if (invested > 0)
    rowValues.push({ key: "I", value: invested, label: "INVESTED", bg: "var(--ft-dim)", fg: "var(--ft-base)" });
  if (pension > 0)
    rowValues.push({ key: "P", value: pension, label: "PENSION", bg: "var(--ft-border2)", fg: "var(--ft-text)" });
  if (other > 0)
    rowValues.push({ key: "O", value: other, label: "OTHER", bg: "var(--ft-muted)", fg: "var(--ft-base)" });
  const rowTotal = rowValues.reduce((s, r) => s + Math.max(r.value, 0), 0) || 1;

  // Blocks narrower than 24px cannot carry a label — collapse into a +n cell.
  const withPx = rowValues.map((r) => ({
    ...r,
    pxWidth: (Math.max(r.value, 0) / rowTotal) * (AVAILABLE_W - (rowValues.length - 1) * 2),
  }));
  const bigEnough = withPx.filter((r) => r.pxWidth >= 24);
  const collapsed = withPx.filter((r) => r.pxWidth < 24);
  const collapsedValue = collapsed.reduce((s, r) => s + r.value, 0);
  const rowRender = collapsed.length
    ? [
        ...bigEnough,
        {
          key: "collapsed",
          value: collapsedValue,
          label: `+${collapsed.length}`,
          bg: "var(--ft-border)",
          fg: "var(--ft-text)",
          pxWidth: (collapsedValue / rowTotal) * (AVAILABLE_W - bigEnough.length * 2),
        } as (typeof withPx)[0],
      ]
    : withPx;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: AVAILABLE_W,
        height: FIELD_H,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        display: "flex",
        flexDirection: "column",
        gap: showProperty ? 2 : 0,
      }}
    >
      {showProperty && (
        <div
          style={{
            height: topH,
            background: "var(--ft-text)",
            color: "var(--ft-base)",
            padding: 14,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.16em",
            }}
          >
            PROPERTY · {total > 0 ? Math.round((property / total) * 100) : 0}%
          </span>
          <span
            className="pnum"
            style={{
              fontSize: 21,
              fontWeight: 600,
              letterSpacing: "-0.03em",
            }}
          >
            {nfmt(property, { symbol: "£", decimals: 0 })}
          </span>
        </div>
      )}
      {/* Compute each tile's DISPLAYED width up front. The last tile has
          flex-grow:1 so it fills the remainder — proportional pxWidth alone
          would understate it, and we'd hide figures that would in fact fit. */}
      <div style={{ height: rowH, display: "flex", gap: 2 }}>
        {(() => {
          const gapTotal = (rowRender.length - 1) * 2;
          const nonLastSum = rowRender.slice(0, -1).reduce((s, r) => s + r.pxWidth, 0);
          const lastDisplayed = Math.max(rowRender.at(-1)?.pxWidth ?? 0, AVAILABLE_W - nonLastSum - gapTotal);
          return rowRender.map((r, i) => {
          // Rule (CLAUDE.md): a financial figure is shown in full or not at
          // all. A tile that's too narrow to hold its £N,NNN figure gets the
          // label only — area still encodes the value, and the per-bucket
          // rows below carry the exact number. Never render "£1…".
          const displayedWidth = i === rowRender.length - 1 ? lastDisplayed : r.pxWidth;
          const figureText = nfmt(r.value, { symbol: "£", decimals: 0 });
          const figureFontSize = showProperty ? 13 : 21;
          const pad = showProperty ? 8 : 14;
          // Tabular-nums glyphs average ~0.6em; add slack for the £ and commas.
          const requiredForFigure = figureText.length * figureFontSize * 0.6 + pad * 2;
          const requiredForLabel = r.label.length * 11 * 0.7 + pad * 2;
          const showFigure = displayedWidth >= requiredForFigure;
          const showLabel = displayedWidth >= requiredForLabel;
          return (
          <div
            key={r.key}
            style={{
              width: `${r.pxWidth}px`,
              flexGrow: rowRender.length - 1 === i ? 1 : 0,
              background: r.bg,
              color: r.fg,
              padding: showProperty ? "8px 8px" : "14px 14px",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: showFigure && showLabel ? "space-between" : "flex-start",
              overflow: "hidden",
            }}
          >
            {showLabel && (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  whiteSpace: "nowrap",
                }}
              >
                {r.label}
              </span>
            )}
            {showFigure && (
              <span
                className="pnum"
                style={{
                  fontSize: figureFontSize,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  letterSpacing: showProperty ? undefined : "-0.03em",
                }}
              >
                {figureText}
              </span>
            )}
          </div>
        );});
        })()}
      </div>
    </div>
  );
}

function PlaceholderPanel() {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: 354,
        height: 296,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        background: "var(--ft-surface)",
      }}
    />
  );
}

// ── Section header (label + link) ────────────────────────────────────────────
function SectionHeader({
  label,
  link,
  onLink,
}: {
  label: string;
  link: string;
  onLink: () => void;
}) {
  return (
    <div
      style={{
        marginTop: 24,
        padding: "16px 18px 0",
        borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            color: "var(--ft-dim)",
          }}
        >
          {label}
        </span>
        <a
          onClick={(e) => {
            e.preventDefault();
            onLink();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: 44,
            margin: "-15px 0",
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-dim)",
            textDecoration: "none",
            cursor: "pointer",
          }}
        >
          {link}
        </a>
      </div>
    </div>
  );
}

// ── Cashflow chart (bar per day, past = fg, today = accent, future = dim) ───
type DailyBalance = { day: number; balance: number; future: boolean };

function buildDailyBalances(
  txns: Array<{ date: string; gbpValue: number; type: string }>,
  now: Date,
  currentBalance: number,
): DailyBalance[] {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  // Compute the balance at the START of the current month by rolling back
  // today's balance through all this-month transactions.
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTxns = txns.filter((t) => t.date.startsWith(thisMonthPrefix));
  const monthNet = monthTxns.reduce((s, t) => {
    const signed = t.type === "expense" ? -Math.abs(t.gbpValue) : Math.abs(t.gbpValue);
    return s + signed;
  }, 0);
  let running = currentBalance - monthNet;
  const perDay: number[] = new Array(daysInMonth).fill(0);
  for (const t of monthTxns) {
    const day = parseInt(t.date.slice(8, 10), 10);
    const signed = t.type === "expense" ? -Math.abs(t.gbpValue) : Math.abs(t.gbpValue);
    perDay[day - 1] += signed;
  }
  const result: DailyBalance[] = [];
  for (let d = 0; d < daysInMonth; d++) {
    running += perDay[d];
    result.push({ day: d + 1, balance: running, future: d + 1 > today });
  }
  return result;
}

function CashflowChart({
  days,
  todayIndex,
  lastDay,
  low,
  monthShortMixed,
}: {
  days: DailyBalance[];
  todayIndex: number;
  lastDay: number;
  low: DailyBalance | null;
  monthShortMixed: string;
}) {
  const maxAbs = days.length ? Math.max(...days.map((d) => Math.abs(d.balance)), 1) : 1;

  return (
    <div>
      <div style={{ position: "relative", height: 132, marginTop: 14 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 6,
            bottom: 0,
            top: 6,
            display: "flex",
            alignItems: "flex-end",
            gap: 2,
          }}
        >
          {days.map((d, i) => {
            const heightPct = Math.max(1, (Math.abs(d.balance) / maxAbs) * 100);
            const isToday = i === todayIndex;
            const isLow = low != null && d.day === low.day;
            const color = d.future
              ? "var(--ft-dim)"
              : isLow
                ? "var(--ft-red)"
                : isToday
                  ? "var(--ft-accent)"
                  : "var(--ft-text)";
            return (
              <span
                key={i}
                style={{
                  flex: 1,
                  height: `${heightPct}%`,
                  background: color,
                  boxShadow: "5px -5px 0 0 var(--ft-border)",
                  minWidth: 1,
                }}
              />
            );
          })}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 8,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-dim)",
          gap: 8,
        }}
      >
        <span>1 {monthShortMixed}</span>
        <span style={{ color: "var(--ft-accent)" }}>TODAY</span>
        {low ? (
          <span className="pnum" style={{ color: "var(--ft-red)", whiteSpace: "nowrap" }}>
            LOW {nfmt(low.balance, { symbol: "£" })} · {low.day} {monthShortMixed}
          </span>
        ) : (
          <span />
        )}
        <span>{lastDay} {monthShortMixed}</span>
      </div>
    </div>
  );
}

// ── Accounts list ────────────────────────────────────────────────────────────
type Acct = {
  id: number;
  name: string;
  currency: string;
  balance: number;
  gbpEquivalent: number;
};

function AccountsList({ accounts }: { accounts: Acct[] }) {
  if (!accounts.length) {
    return (
      <div style={{ padding: "12px 0", fontSize: 13, color: "var(--ft-dim)" }}>
        No accounts.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {accounts.map((a, i) => (
        <div
          key={a.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            minHeight: 44,
            borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
            ...(i === accounts.length - 1
              ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
              : {}),
            fontSize: 14,
          }}
        >
          <span>{a.name}</span>
          {a.currency === "GBP" ? (
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
              }}
            >
              {nfmt(a.gbpEquivalent)}
            </span>
          ) : (
            <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
              <span
                className="pnum"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 12,
                  color: "var(--ft-dim)",
                }}
              >
                {(CURRENCY_SYMBOLS[a.currency] ?? a.currency + " ") +
                  nfmt(a.balance)} ≈
              </span>
              <span
                className="pnum"
                style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
              >
                {nfmt(a.gbpEquivalent)}
              </span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Upcoming list ────────────────────────────────────────────────────────────
function UpcomingList({
  bills,
}: {
  bills: Array<{ id: number; name: string; amount: number; nextDue: string; currency: string }>;
}) {
  if (!bills.length) {
    return (
      <div style={{ padding: "12px 0", fontSize: 13, color: "var(--ft-dim)" }}>
        Nothing upcoming.
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {bills.map((b, i) => {
        const due = new Date(b.nextDue + "T12:00:00");
        const dueStr = due.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
        return (
          <div
            key={b.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              minHeight: 44,
              borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
              ...(i === bills.length - 1
                ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                : {}),
              fontSize: 14,
            }}
          >
            <span>
              {b.name} · {dueStr}
            </span>
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                color: "var(--ft-red)",
              }}
            >
              {nfmt(-b.amount, { symbol: b.currency === "GBP" ? "£" : "" })}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Elsewhere row ────────────────────────────────────────────────────────────
function ElsewhereRow({
  label,
  valueLabel,
  valueColor,
  onClick,
}: {
  label: string;
  valueLabel: string;
  valueColor: string;
  onClick: () => void;
}) {
  return (
    <a
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      style={{
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        minHeight: 44,
        borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)",
        textDecoration: "none",
        color: "var(--ft-text)",
        fontSize: 14,
        cursor: "pointer",
      }}
    >
      <span>{label}</span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: valueColor,
        }}
      >
        {valueLabel}
      </span>
    </a>
  );
}
