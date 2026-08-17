import { useState } from "react";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/privacy-context";
import {
  useGetDashboard,
  useListTransactions,
  useGetTransactionSummary,
  useListSubscriptions,
  useListUpcoming,
} from "@workspace/api-client-react";
import type { AppScreen } from "./MobileApp";
import { MobileEmptyState } from "./mobile-ui";
import { BlockField } from "@/components/primitives/block-field";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { MarketPane } from "./MarketPane";
import { loadPersonaIds, type PersonaId } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";

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
  // Initial view accepts ?view=bands / ?view=ring / ?view=blocks so
  // the harness (and any deep-link) can land straight on a specific
  // switcher tab. Defaults to blocks. Explicit switcher clicks
  // override — this only seeds the first render.
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "blocks";
    const q = new URLSearchParams(window.location.search).get("view");
    return q === "bands" || q === "ring" ? q : "blocks";
  });

  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dateFrom = `${monthStr}-01`;
  const dateTo = now.toISOString().slice(0, 10);

  const { data: dashboard } = useGetDashboard();
  const { data: _monthSummary } = useGetTransactionSummary({ month: monthStr });
  const { data: txns = [] } = useListTransactions({ dateFrom, dateTo });
  const { data: subs = [] } = useListSubscriptions();
  // C2-3: pull upcoming income items so COMING can show salary +
  // any other explicit income entries alongside the recurring bills.
  // upcomingTable already carries `type: income | expense` — no
  // schema change needed. Filter to pending + next 30d + income.
  const { data: upcomingItems = [] } = useListUpcoming();

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
  const persona = useActivePersona();

  const owedByMe = dashboard?.owing.totalIOwe ?? 0;
  const pendingCount = dashboard?.owing.pendingCount ?? 0;
  // C2-4: top counterparties (up to 3) for the CLAIMED strip. When
  // the API returns them we list names; if the endpoint is old
  // (deployed API one commit behind), we fall back to the count-only
  // rendering below. Both cases coexist.
  const topPending = dashboard?.owing.topPending ?? [];

  const activeSubs = subs.filter((s) => s.active);
  const upcomingBills = activeSubs
    .filter((s): s is typeof s & { nextDue: string } => !!s.nextDue)
    .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
    .slice(0, 2);
  // Upcoming income within the next 30 days. Bills come from
  // subscriptions (recurring); income comes from upcomingTable
  // (explicit one-off or scheduled). Two rendering rows max — enough
  // for salary + maybe a client invoice, without turning COMING into
  // an infinite feed.
  const now30 = new Date();
  const in30Str = new Date(now30.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const todayStr = now30.toISOString().slice(0, 10);
  const upcomingIncome = upcomingItems
    .filter((i) => i.type === "income" && i.status === "pending")
    .filter((i) => i.dueDate >= todayStr && i.dueDate <= in30Str)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
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
        {(() => {
          // Persona-aware empty state (F1c). A market-persona user
          // must never be asked to connect a bank — the entire point
          // of that persona is holdings-only, no bank machinery. So
          // the CTA sends them to /investments to add a ticker.
          // Every other persona lands on the connections panel.
          const persona: PersonaId = (loadPersonaIds()[0] as PersonaId) ?? "full";
          if (persona === "market") {
            return (
              <MobileEmptyState
                label="NO HOLDINGS"
                title="Add your first holding."
                description="Type a ticker and Numeris tracks it from the market. No bank connection needed — enter a few tickers once and the home screen fills in whenever prices move."
                ctaLabel="Add a holding"
                onCta={() => navigate("/investments")}
              />
            );
          }
          return (
            <MobileEmptyState
              label="NO ACCOUNTS"
              title="Nothing to show yet."
              description="Connect a bank account or add one by hand. Once one is connected the home screen fills in on its own."
              ctaLabel="Connect an account"
              onCta={() => navigate("/settings?panel=connections")}
            />
          );
        })()}
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

        {/* Headline (P2·9). Market persona gets PORTFOLIO VALUE +
            24H delta, matching the same argument as the desktop
            KPI bar: a market user opens the app to see the market
            moved, and net worth doesn't tell them that. Every
            other persona keeps NET WORTH + since-1st-of-month
            (the existing headline shape). */}
        {persona === "market" ? (
          <VStack padding="4px 18px 18px">
            <MonoLabel size={11} letterSpacing="0.16em">PORTFOLIO</MonoLabel>
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
                {nfmt(dashboard?.portfolio.totalValueGbp ?? 0)}
              </Text>
            </HStack>
            {/* 24h delta. Uses dashData.portfolio.dayChange* from P1b.
                Null → render "—", never a fabricated zero. */}
            {(() => {
              const dGbp = dashboard?.portfolio.dayChangeGbp ?? null;
              const dPct = dashboard?.portfolio.dayChangePercent ?? null;
              if (dGbp == null) {
                return (
                  <Text as="div" mono size={12} mt={6} color="var(--ft-dim)">
                    24H · —
                  </Text>
                );
              }
              const col = dGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)";
              return (
                <Text as="div" mono size={12} mt={6} color={col} numeric>
                  {nfmt(dGbp, { sign: true, symbol: "£" })}
                  {dPct != null && ` · ${nfmt(dPct, { sign: true })}%`}
                  {" · 24H"}
                </Text>
              );
            })()}
            {unconvertibleAccounts > 0 && (
              <Text as="div" mono size={10} mt={4} color="var(--ft-amber)" letterSpacing="0.06em">
                {unconvertibleAccounts} account{unconvertibleAccounts !== 1 ? "s" : ""} without FX — not in total
              </Text>
            )}
          </VStack>
        ) : (
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
        )}

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
          {view === "bands" && (
            <BandsView
              months={(dashboard?.monthlyHistory ?? []).map((m) => ({
                month: m.month,
                composition: m.composition ?? null,
              }))}
            />
          )}
          {view === "ring" && <RingView holdings={holdings} />}
        </div>

        {/* Claimed (liabilities are outlined, no depth).
            C2-4: when the API supplies topPending, list up to 3
            counterparties by name + amount underneath the total.
            If not (older API), only the count line renders. */}
        {owedByMe > 0 && (
          <VStack gap={4} padding="18px 18px 0">
            <HStack align="start" gap={12}>
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
            {topPending.filter((p) => p.direction === "i_owe_them").slice(0, 3).map((p) => (
              <HStack key={`${p.name}-${p.amountGbp}`} align="baseline" justify="between" padding="0 0 0 26px">
                <Text as="span" size={11} color="var(--ft-muted)" truncate>
                  {p.name}
                </Text>
                <Text as="span" mono size={11} color="var(--ft-red)" numeric>
                  {nfmt(-p.amountGbp, { symbol: "£" })}
                </Text>
              </HStack>
            ))}
          </VStack>
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
          <UpcomingList bills={upcomingBills} incoming={upcomingIncome} />
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
// Bucket colours for BANDS + RING. Kept as one const so the two views
// stay in visual sync — a colour drift would make the same bucket
// read differently across the switcher.
const BUCKET_ORDER: (keyof Holdings)[] = ["cash", "investment", "pension", "property", "other"];
const BUCKET_LABEL: Record<keyof Holdings, string> = {
  cash: "CASH",
  investment: "INVESTED",
  pension: "PENSION",
  property: "PROPERTY",
  other: "OTHER",
};
// Colour = position in the type ladder, not hue-as-data. All values
// route through --ft-* tokens so all 11 themes (arctic light included)
// render legibly. Neutral steps rather than a rainbow — hierarchy
// through structure and scale.
const BUCKET_COLOR: Record<keyof Holdings, string> = {
  cash: "var(--ft-text)",
  investment: "var(--ft-accent)",
  pension: "var(--ft-blue)",
  property: "var(--ft-green)",
  other: "var(--ft-dim)",
};

function bucketTotal(h: Holdings): number {
  return h.cash + h.investment + h.pension + h.property + h.other;
}

// ── RING ──────────────────────────────────────────────────────────
// A single doughnut of the CURRENT holdings composition. Uses the
// same `holdings` that BLOCKS uses — no historical data needed, so
// this view was already satisfiable from existing API fields
// (accountBreakdown + portfolio.totalValueGbp). No schema change.
function RingView({ holdings }: { holdings: Holdings }) {
  const total = bucketTotal(holdings);
  if (total <= 0) {
    return (
      <div
        style={{
          width: "100%", maxWidth: 354, height: 296,
          boxShadow: "10px -10px 0 0 var(--ft-border)",
          background: "var(--ft-surface)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)",
          letterSpacing: "0.14em",
        }}
      >
        NO POSITIONS
      </div>
    );
  }
  // SVG donut. Two circles: an outer stroked path per bucket, and
  // an inner disc for the central label. Circumference maths in
  // one place. Radius chosen so 296px height accommodates label
  // + legend below.
  const RADIUS = 82;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  let offset = 0;
  const segments: { key: keyof Holdings; length: number; offset: number; color: string }[] = [];
  for (const key of BUCKET_ORDER) {
    const v = holdings[key];
    if (v <= 0) continue;
    const length = (v / total) * CIRCUMFERENCE;
    segments.push({ key, length, offset, color: BUCKET_COLOR[key] });
    offset += length;
  }
  return (
    <div
      style={{
        width: "100%", maxWidth: 354, minHeight: 296,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        background: "var(--ft-surface)",
        display: "flex", flexDirection: "column", alignItems: "stretch",
        padding: 16, boxSizing: "border-box", gap: 16,
      }}
    >
      <div style={{ display: "grid", placeItems: "center" }}>
        <svg width={200} height={200} viewBox="0 0 200 200">
          {/* Track — hairline so 0-value buckets still read as absent */}
          <circle cx={100} cy={100} r={RADIUS} fill="none" stroke="var(--ft-border)" strokeWidth={1} />
          {segments.map((s) => (
            <circle
              key={s.key}
              cx={100} cy={100} r={RADIUS} fill="none"
              stroke={s.color} strokeWidth={16}
              strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
              strokeDashoffset={-s.offset}
              transform="rotate(-90 100 100)"
            />
          ))}
          <text x={100} y={100} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={11} fill="var(--ft-dim)" letterSpacing="0.12em">HOLDINGS</text>
          <text x={100} y={116} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={11} fontWeight={700} fill="var(--ft-text)">£{nfmt(total, { decimals: 0 })}</text>
        </svg>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {BUCKET_ORDER.filter((k) => holdings[k] > 0).map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, background: BUCKET_COLOR[k], flex: "none" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--ft-dim)" }}>{BUCKET_LABEL[k]}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-text)", marginLeft: "auto" }}>
              {Math.round((holdings[k] / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BANDS ─────────────────────────────────────────────────────────
// 12-month stacked bars of composition per bucket. Each month is
// either a stack of segments (has snapshot) or a hollow band (no
// snapshot — historical months before feature landing). NEVER a
// fabricated zero — that would show composition drift that never
// happened.
interface BandsMonth {
  month: string;
  composition: Holdings | null;
}
function BandsView({ months }: { months: BandsMonth[] }) {
  if (months.length === 0) {
    return (
      <div
        style={{
          width: "100%", maxWidth: 354, height: 296,
          boxShadow: "10px -10px 0 0 var(--ft-border)",
          background: "var(--ft-surface)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)",
          letterSpacing: "0.14em",
        }}
      >
        NO HISTORY
      </div>
    );
  }
  // Compute the max non-null total so bars share a y-axis.
  const maxTotal = Math.max(
    1,
    ...months.map((m) => (m.composition ? bucketTotal(m.composition) : 0)),
  );
  const BAR_H = 200;
  const BAR_W = 20;
  const GAP = 4;
  const chartW = months.length * (BAR_W + GAP);

  return (
    <div
      style={{
        width: "100%", maxWidth: 354, minHeight: 296,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        background: "var(--ft-surface)",
        padding: 16, boxSizing: "border-box",
        display: "flex", flexDirection: "column", gap: 16,
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <svg width={chartW} height={BAR_H + 40} viewBox={`0 0 ${chartW} ${BAR_H + 40}`}>
          {months.map((m, i) => {
            const x = i * (BAR_W + GAP);
            if (!m.composition) {
              // Hollow band — no snapshot for this month. Drawn as a
              // dotted rectangle at the max height so the reader can
              // see the gap. Per the design constitution: dotted
              // means not-yet-real.
              return (
                <g key={m.month}>
                  <rect
                    x={x} y={0} width={BAR_W} height={BAR_H}
                    fill="none" stroke="var(--ft-border)"
                    strokeDasharray="2 2" strokeWidth={1}
                  />
                  <text x={x + BAR_W / 2} y={BAR_H + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--ft-dim)">{m.month.slice(5)}</text>
                </g>
              );
            }
            const total = bucketTotal(m.composition);
            const scale = total / maxTotal;
            let cursorY = BAR_H;
            const segs: { key: keyof Holdings; h: number; y: number }[] = [];
            for (const key of BUCKET_ORDER) {
              const v = m.composition[key];
              if (v <= 0) continue;
              const h = (v / total) * BAR_H * scale;
              cursorY -= h;
              segs.push({ key, h, y: cursorY });
            }
            return (
              <g key={m.month}>
                {segs.map((s) => (
                  <rect
                    key={s.key}
                    x={x} y={s.y} width={BAR_W} height={s.h}
                    fill={BUCKET_COLOR[s.key]}
                  />
                ))}
                <text x={x + BAR_W / 2} y={BAR_H + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--ft-dim)">{m.month.slice(5)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {BUCKET_ORDER.map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, background: BUCKET_COLOR[k], flex: "none" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", color: "var(--ft-dim)" }}>{BUCKET_LABEL[k]}</span>
          </div>
        ))}
      </div>
    </div>
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
// Two row kinds share the same rendering:
//   - BILL (from subscriptions): negative amount, red
//   - INCOME (from upcomingTable, type=income): positive amount, green
// Income rows render FIRST so salary etc. sit at the top of the pane
// — the "known money in" is the item most likely to change the
// user's plan for the month.
interface UpcomingIncomeRow {
  id: number;
  description: string;
  dueDate: string;
  nativeAmount: number;
  currency: string;
}
function UpcomingList({
  bills,
  incoming = [],
}: {
  bills: Array<{ id: number; name: string; amount: number; nextDue: string; currency: string }>;
  incoming?: UpcomingIncomeRow[];
}) {
  if (!bills.length && !incoming.length) {
    return (
      <div style={{ padding: "12px 0", fontSize: 13, color: "var(--ft-dim)" }}>
        Nothing upcoming.
      </div>
    );
  }
  const rows: Array<
    | { kind: "in"; id: number; name: string; amount: number; dateStr: string; currency: string }
    | { kind: "out"; id: number; name: string; amount: number; dateStr: string; currency: string }
  > = [
    ...incoming.map((i) => ({
      kind: "in" as const,
      id: i.id,
      name: i.description,
      amount: i.nativeAmount,
      dateStr: new Date(i.dueDate + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      currency: i.currency,
    })),
    ...bills.map((b) => ({
      kind: "out" as const,
      id: b.id,
      name: b.name,
      amount: b.amount,
      dateStr: new Date(b.nextDue + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      currency: b.currency,
    })),
  ];
  return (
    <VStack>
      {rows.map((r, i) => (
        <div
          key={`${r.kind}-${r.id}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            minHeight: 44,
            borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
            ...(i === rows.length - 1
              ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
              : {}),
            fontSize: 14,
          }}
        >
          <Text as="span" size={14}>
            {r.name} · {r.dateStr}
          </Text>
          <Text
            as="span"
            mono
            size={13}
            color={r.kind === "in" ? "var(--ft-green)" : "var(--ft-red)"}
            numeric
          >
            {nfmt(r.kind === "in" ? r.amount : -r.amount, {
              symbol: r.currency === "GBP" ? "£" : "",
              sign: r.kind === "in",
            })}
          </Text>
        </div>
      ))}
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
