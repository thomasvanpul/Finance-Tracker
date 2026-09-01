import { useState, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/privacy-context";
import {
  useGetDashboard,
  useListTransactions,
  useGetTransactionSummary,
  useListSubscriptions,
  useListUpcoming,
} from "@workspace/api-client-react";
import { MobileEmptyState } from "./mobile-ui";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { MarketPane } from "./MarketPane";
import { NewsPane } from "./NewsPane";
import { loadPersonaIds, type PersonaId } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";
import { InsightSlot } from "@/components/phone/InsightSlot";
import {
  computeHoldings,
  type Holdings,
  type AccountType,
  type HoldingsInput,
} from "@/components/phone/CompositionChart";
import {
  selectInsight,
  loadDismissedIds,
  dismissInsight,
  type Insight,
} from "@/lib/spending-insights";

// Re-export for callers that import these from MobileHome.
export type { Holdings, AccountType, HoldingsInput };
export { computeHoldings };

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

interface MobileHomeProps {
  // Placeholder — MobileHome takes no runtime props today. The empty
  // interface stays so PhoneShell can pass future context (persona
  // overrides, tab-scoped fx rates) without changing the call site.
}

export function MobileHome(_props: MobileHomeProps) {
  const [, navigate] = useLocation();
  const { privacy: _privacy } = usePrivacy();

  const now = new Date();
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dateFrom = `${monthStr}-01`;
  const dateTo = now.toISOString().slice(0, 10);

  const { data: dashboard, isLoading: dashboardLoading } = useGetDashboard();
  const { data: _monthSummary } = useGetTransactionSummary({ month: monthStr });
  const { data: txns = [] } = useListTransactions({ dateFrom, dateTo });
  const { data: subs = [] } = useListSubscriptions();
  // C2-3: pull upcoming income items so COMING can show salary +
  // any other explicit income entries alongside the recurring bills.
  // upcomingTable already carries `type: income | expense` — no
  // schema change needed. Filter to pending + next 30d + income.
  const { data: upcomingItems = [] } = useListUpcoming();

  // ── Derived from real data ──
  // Three states preserved: loading (dashboardLoading), unknown (null) and
  // real zero (0). A `?? 0` coalesce would render an authoritative £0.00
  // during load that a user cannot distinguish from an actual zero.
  const netWorth = dashboard?.netWorth ?? null;
  // MTD delta: uses thisMonth.netSavings as a proxy for month-to-date net worth
  // change. Exact NW delta would need daily NW snapshots; the API does not carry
  // them. Approximation is acceptable per the concept — the number rule still
  // stands.
  const mtdDelta = dashboard?.thisMonth.netSavings ?? null;
  const priorNw = netWorth != null && mtdDelta != null ? netWorth - mtdDelta : null;
  const mtdPct = priorNw != null && priorNw > 0 && mtdDelta != null ? (mtdDelta / priorNw) * 100 : null;

  const holdings = computeHoldings(dashboard);
  const totalCash = holdings.cash;

  const activeAccounts = dashboard?.accountBreakdown ?? [];
  const unconvertibleAccounts = dashboard?.unconvertibleAccounts ?? 0;
  const persona = useActivePersona();

  const owedByMe = dashboard?.owing.totalIOwe ?? null;
  const pendingCount = dashboard?.owing.pendingCount ?? null;
  // C2-4: top counterparties (up to 3) for the CLAIMED strip. When
  // the API returns them we list names; if the endpoint is old
  // (deployed API one commit behind), we fall back to the count-only
  // rendering below. Both cases coexist.
  const topPending = dashboard?.owing.topPending ?? [];

  // ── Insight pipeline ──────────────────────────────────────────────────────
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(
    () => loadDismissedIds(),
  );
  const currentInsight = useMemo<Insight | null>(
    () => selectInsight(txns, { baseCurrency: dashboard?.baseCurrency ?? null, upcomingItems, topPending }, dismissedInsights),
    [txns, dashboard, upcomingItems, topPending, dismissedInsights],
  );
  const handleDismissInsight = useCallback((id: string) => {
    dismissInsight(id);
    setDismissedInsights((prev) => new Set([...prev, id]));
  }, []);

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
                scope="screen"
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
              scope="screen"
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
        paddingBottom: "calc(var(--ft-tab-bar-h) + env(safe-area-inset-bottom, 0px) + 16px)",
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
                {dashboardLoading
                  ? "…"
                  : dashboard?.portfolio.totalValueBase != null
                    ? nfmt(dashboard.portfolio.totalValueBase)
                    : "—"}
              </Text>
            </HStack>
            {/* 24h delta. Uses dashData.portfolio.dayChange* from P1b.
                Null → render "—", never a fabricated zero. */}
            {(() => {
              const dGbp = dashboard?.portfolio.dayChangeBase ?? null;
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
                {dashboardLoading ? "…" : netWorth != null ? nfmt(netWorth) : "—"}
              </Text>
            </HStack>
            {mtdDelta != null && mtdPct != null ? (
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
            ) : (
              <Text as="div" mono size={12} mt={6} color="var(--ft-dim)">
                {dashboardLoading ? "…" : "—"} since 1 {monthShortMixed}
              </Text>
            )}
            {unconvertibleAccounts > 0 && (
              <Text as="div" mono size={10} mt={4} color="var(--ft-amber)" letterSpacing="0.06em">
                {unconvertibleAccounts} account{unconvertibleAccounts !== 1 ? "s" : ""} without FX — not in total
              </Text>
            )}
          </VStack>
        )}

        {/* Claimed (liabilities are outlined, no depth).
            C2-4: when the API supplies topPending, list up to 3
            counterparties by name + amount underneath the total.
            If not (older API), only the count line renders. */}
        {owedByMe != null && owedByMe > 0 && (
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
                CLAIMED {nfmt(-owedByMe, { symbol: "£" })} · {pendingCount ?? 0}{" "}
                {pendingCount === 1 ? "DEBT" : "DEBTS"}
              </Text>
            </HStack>
            {topPending.filter((p) => p.direction === "i_owe_them").slice(0, 3).map((p) => (
              <HStack key={`${p.name}-${p.amountBase}`} align="baseline" justify="between" padding="0 0 0 26px">
                <Text as="span" size={11} color="var(--ft-muted)" truncate>
                  {p.name}
                </Text>
                <Text as="span" mono size={11} color="var(--ft-red)" numeric>
                  {nfmt(-p.amountBase, { symbol: "£" })}
                </Text>
              </HStack>
            ))}
          </VStack>
        )}

        <InsightSlot insight={currentInsight} onDismiss={handleDismissInsight} />

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

        {/* Markets pane — the only element that differs tomorrow morning
            without the user doing anything. Scoped to holdings + implied
            FX pairs; renders nothing when the user has neither. */}
        <MarketPane onOpenInvestments={() => navigate("/investments")} />

        {/* F3 · news pane. All-or-nothing: header + list render
            together only when NewsPane has anchor-tied items to
            show. See components/mobile/NewsPane.tsx. */}
        <NewsPane onOpenInvestments={() => navigate("/investments")} />

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
  txns: Array<{ date: string; baseEquivalent: number | null; type: string }>,
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
  const monthTxns = txns.filter((t) => t.date.startsWith(thisMonthPrefix) && t.baseEquivalent != null) as Array<{ date: string; baseEquivalent: number; type: string }>;
  const monthNet = monthTxns.reduce((s, t) => {
    const signed = t.type === "expense" ? -Math.abs(t.baseEquivalent) : Math.abs(t.baseEquivalent);
    return s + signed;
  }, 0);
  let running = currentBalance - monthNet;
  const perDay: number[] = new Array(daysInMonth).fill(0);
  for (const t of monthTxns) {
    const day = parseInt(t.date.slice(8, 10), 10);
    const signed = t.type === "expense" ? -Math.abs(t.baseEquivalent) : Math.abs(t.baseEquivalent);
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

