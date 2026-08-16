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
import { BlockField } from "@/components/primitives/block-field";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { MarketPane } from "./MarketPane";

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
  accountBreakdown?: Array<{ type: AccountType; gbpEquivalent: number | null }>;
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
    // Skip accounts whose FX conversion is unavailable; the block-
    // field visualisation below reads each bucket as a proportion, so
    // a fabricated 0 would shrink the wrong bucket. Total shown on
    // the NET WORTH headline (dashboard.netWorth) already matches
    // this skip-based sum.
    if (a.gbpEquivalent == null) continue;
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
  const unconvertibleAccounts = dashboard?.unconvertibleAccounts ?? 0;

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
        <HStack justify="end" align="center" height={44} paddingX={18}>
          <Text as="span" mono size={11} color="var(--ft-dim)">NUMERIS</Text>
        </HStack>
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
        <HStack justify="end" align="center" height={44} paddingX={18}>
          <Text as="span" mono size={11} color="var(--ft-dim)">
            LIVE · {activeAccounts.length} ACCOUNTS
          </Text>
        </HStack>

        {/* Net worth headline */}
        <VStack padding="4px 18px 18px">
          <MonoLabel size={11} letterSpacing="0.16em">NET WORTH</MonoLabel>
          <HStack align="baseline" gap={4} marginTop={6}>
            <Text as="span" size={17} color="var(--ft-dim)">£</Text>
            <Text
              as="span"
              size={34}
              weight={600}
              lineHeight="34px"
              letterSpacing="-0.035em"
              numeric
            >
              {nfmt(netWorth)}
            </Text>
          </HStack>
          <Text
            as="div"
            mono
            size={12}
            mt={6}
            color={mtdDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
            numeric
          >
            {nfmt(mtdDelta, { sign: true, symbol: "£" })} ·{" "}
            {nfmt(mtdPct, { sign: true })}% since 1 {monthShortMixed}
          </Text>
          {unconvertibleAccounts > 0 && (
            <Text as="div" mono size={10} mt={4} color="var(--ft-amber)" letterSpacing="0.06em">
              {unconvertibleAccounts} account{unconvertibleAccounts !== 1 ? "s" : ""} without FX — not in total
            </Text>
          )}
        </VStack>

        {/* Holdings header + BLOCKS / BANDS / RING switcher */}
        <HStack align="center" justify="between" padding="0 18px 10px">
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
          <HStack align="center" height={44} gap={2}>
            <ViewTab label="BLOCKS" active={view === "blocks"} onClick={() => setView("blocks")} />
            <ViewTab label="BANDS" active={view === "bands"} onClick={() => setView("bands")} />
            <ViewTab label="RING" active={view === "ring"} onClick={() => setView("ring")} />
          </HStack>
        </HStack>

        {/* Chart area — one of BLOCKS / BANDS / RING */}
        <div style={{ padding: "0 18px" }}>
          {view === "blocks" && <BlockField holdings={holdings} />}
          {view === "bands" && <PlaceholderPanel />}
          {view === "ring" && <PlaceholderPanel />}
        </div>

        {/* Claimed (liabilities are outlined, no depth) */}
        {owedByMe > 0 && (
          <HStack align="start" gap={12} padding="18px 18px 0">
            {/* Outlined glyph — a claim is not material you hold. One-off
                surface (border-only marker) stays inline. */}
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
            <Text
              as="div"
              mono
              size={11}
              lineHeight="16px"
              color="var(--ft-red)"
              numeric
            >
              CLAIMED {nfmt(-owedByMe, { symbol: "£" })} · {pendingCount}{" "}
              {pendingCount === 1 ? "DEBT" : "DEBTS"}
            </Text>
          </HStack>
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

        {/* Markets pane — the only element that differs tomorrow morning
            without the user doing anything. Scoped to holdings + implied
            FX pairs; renders nothing when the user has neither. */}
        <MarketPane onOpenInvestments={() => navigate("/investments")} />

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
          <MonoLabel size={11} letterSpacing="0.16em" mb={4}>
            ELSEWHERE IN NUMERIS
          </MonoLabel>
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
    // Border-top + margin are one-off surface (section divider). Inline
    // stays — no divider primitive.
    <div
      style={{
        marginTop: 24,
        padding: "16px 18px 0",
        borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
      }}
    >
      <HStack align="baseline" justify="between">
        <MonoLabel as="span" size={11} letterSpacing="0.16em">
          {label}
        </MonoLabel>
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
      </HStack>
    </div>
  );
}

// ── Cashflow chart (bar per day, past = fg, today = accent, future = dim) ───
type DailyBalance = { day: number; balance: number; future: boolean };

function buildDailyBalances(
  txns: Array<{ date: string; gbpValue: number | null; type: string }>,
  now: Date,
  currentBalance: number,
): DailyBalance[] {
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const today = now.getDate();
  // Compute the balance at the START of the current month by rolling back
  // today's balance through all this-month transactions. Skip rows whose
  // FX is unavailable — including a fabricated 0 in monthNet would
  // shift the rolled-back start balance and skew the whole curve.
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthTxns = txns.filter((t) => t.date.startsWith(thisMonthPrefix) && t.gbpValue != null) as Array<{ date: string; gbpValue: number; type: string }>;
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
  gbpEquivalent: number | null;
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
    <VStack>
      {accounts.map((a, i) => (
        // Row borders are one-off dividers between siblings. Inline
        // stays; primitives don't own row rules.
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
          <Text as="span" size={14}>{a.name}</Text>
          {a.currency === "GBP" ? (
            <Text as="span" mono size={13} numeric>
              {a.gbpEquivalent == null ? "—" : nfmt(a.gbpEquivalent)}
            </Text>
          ) : (
            // Foreign account row: native amount always honest; the
            // "≈" line drops to "—" when the FX rate is unavailable.
            <HStack gap={10} align="baseline">
              <Text as="span" mono size={12} color="var(--ft-dim)" numeric>
                {(CURRENCY_SYMBOLS[a.currency] ?? a.currency + " ") +
                  nfmt(a.balance)} ≈
              </Text>
              <Text as="span" mono size={13} color={a.gbpEquivalent == null ? "var(--ft-dim)" : undefined} numeric>
                {a.gbpEquivalent == null ? "—" : nfmt(a.gbpEquivalent)}
              </Text>
            </HStack>
          )}
        </div>
      ))}
    </VStack>
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
    <VStack>
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
            <Text as="span" size={14}>
              {b.name} · {dueStr}
            </Text>
            <Text as="span" mono size={13} color="var(--ft-red)" numeric>
              {nfmt(-b.amount, { symbol: b.currency === "GBP" ? "£" : "" })}
            </Text>
          </div>
        );
      })}
    </VStack>
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
  // Kept as an <a> (not HStack) because the row is a link — semantic HTML
  // matters even for imperative onClick. Border-bottom + no-underline are
  // one-off surface on the link. Text primitives own the two children.
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
      <Text as="span" size={14}>{label}</Text>
      <Text as="span" mono size={11} color={valueColor}>{valueLabel}</Text>
    </a>
  );
}
