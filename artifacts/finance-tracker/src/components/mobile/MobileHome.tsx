import { useState, useMemo, useCallback } from "react";
import { entityHref } from "@/lib/entity-href";
import { DrillTarget } from "@/components/drill";
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
import { HomeSectionHeader } from "./home-section-header";
import { HStack, MonoLabel, Text, VStack } from "@/components/primitives";
import { MarketPane } from "./MarketPane";
import { NewsPane } from "./NewsPane";
import { loadPersonaIds, type PersonaId } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";
import { homeSectionOrder } from "@/lib/persona-emphasis";
import { InsightSlot } from "@/components/phone/InsightSlot";
import { sinceCloseLabel } from "@/components/FixingMark";
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
  // The month window above is what the screen shows. A recurring series
  // cannot be seen inside one month, so the projected trough reads the full
  // ledger instead — same query key the other screens use, so TanStack
  // serves it from cache rather than fetching it twice.
  const { data: allTxns } = useListTransactions();
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
  // NO delta under NET WORTH, deliberately. This slot used to render
  // `thisMonth.netSavings` — month-to-date income minus expenses — as
  // though it were the change in net worth, and then reconstructed a
  // "net worth on the 1st" by subtracting it. Neither number was real.
  // On seed data it printed "−£40.45 · −0.02% since 1 Sept" while the
  // accounts had actually moved −£1,174.51, all of it FX revaluation,
  // so the headline understated the move by a factor of 29 and named
  // the wrong cause.
  //
  // A true delta needs a prior NET WORTH, and nothing in the schema
  // carries one:
  //   · nw_snapshots is keyed by MONTH and upserted from live values on
  //     every dashboard read, so the current month's row is today's
  //     number, not the 1st's. The seed user has exactly one row
  //     (2026-09) and no prior month.
  //   · account_balance_snapshots is daily and honest, but it starts
  //     2026-09-07 (no backfill is possible — accounts.balance is a live
  //     scalar) and it covers ACCOUNTS only. Investments are not
  //     snapshotted at all, so the portfolio leg of net worth has no
  //     history.
  // An accounts-only delta under a NET WORTH figure is the same class of
  // untruth as netSavings was: a number that is not the change in the
  // thing above it. The repo's standing rule is that an unknown leg
  // makes the total unknown, so this states nothing.
  //
  // The honest change figure the app DOES have — accounts, since the
  // first snapshot, with its own date on it — is WHAT CHANGED on WORTH,
  // fed by /api/accounts/change-attribution. That is where a user finds
  // out what moved. Restoring a delta here needs the portfolio leg
  // snapshotted server-side; until then this slot stays empty.

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
    // totalCash is holdings.cash, derived from the dashboard's own account
    // breakdown — the projected trough starts from a level the API supplied,
    // never from a zero stood in for a missing one.
    () => selectInsight(txns, {
      baseCurrency: dashboard?.baseCurrency ?? null,
      upcomingItems,
      topPending,
      cashBalanceBase: dashboard == null ? null : totalCash,
      historyTxs: allTxns ?? undefined,
    }, dismissedInsights),
    [txns, allTxns, dashboard, upcomingItems, topPending, totalCash, dismissedInsights],
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
        <HStack justify="end" align="center" height={44} paddingX={16}>
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
              onCta={() => navigate(entityHref("settings", "connections"))}
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
        <HStack justify="end" align="center" height={44} paddingX={16}>
          {/* The count alone. This read "LIVE · 8 ACCOUNTS" until 16 Sep 2026
              and claimed something the app cannot do: these balances are
              maintained by hand, and nothing on this screen is a live feed
              from a bank. "ACTIVE" was the other candidate and is untrue for
              a second reason — `activeAccounts` is the whole of
              accountBreakdown, with no active/dormant filter anywhere in it.
              The count is the only part of the old label that was a fact,
              and the drill title already says what the count is of. */}
          <DrillTarget href="/accounts" title="The accounts this counts">
            <span className="ft-drill">
              <Text as="span" mono size={11} color="var(--ft-dim)">
                {activeAccounts.length} {activeAccounts.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
              </Text>
            </span>
          </DrillTarget>
        </HStack>

        {/* Headline (P2·9). Market persona gets PORTFOLIO VALUE +
            day delta, matching the same argument as the desktop
            KPI bar: a market user opens the app to see the market
            moved, and net worth doesn't tell them that. Every
            other persona keeps NET WORTH + since-1st-of-month
            (the existing headline shape). */}
        {persona === "market" ? (
          <VStack padding="4px 16px 0">
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
            {/* Close-to-close delta, dated by the session it runs from
                (not "24H" — a Monday spans the weekend). Null → render
                "—", never a fabricated zero. */}
            {(() => {
              const since = sinceCloseLabel(dashboard?.portfolio.dayChangeFromSession);
              const dGbp = dashboard?.portfolio.dayChangeBase ?? null;
              const dPct = dashboard?.portfolio.dayChangePercent ?? null;
              if (dGbp == null) {
                return (
                  <Text as="div" mono size={12} mt={6} color="var(--ft-dim)">
                    {since} · —
                  </Text>
                );
              }
              const col = dGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)";
              return (
                <Text as="div" mono size={12} mt={6} color={col} numeric>
                  {nfmt(dGbp, { sign: true, symbol: "£" })}
                  {dPct != null && ` · ${nfmt(dPct, { sign: true })}%`}
                  {` · ${since}`}
                </Text>
              );
            })()}
            {unconvertibleAccounts > 0 && (
              <Text as="div" size={11} mt={6} color="var(--ft-amber)">
                {unconvertibleAccounts} account{unconvertibleAccounts !== 1 ? "s" : ""} without FX — not in total
              </Text>
            )}
          </VStack>
        ) : (
          <VStack padding="4px 16px 0">
            <MonoLabel size={11} letterSpacing="0.16em">NET WORTH</MonoLabel>
            <DrillTarget href="/net-worth" title="Net worth — everything it is the sum of">
              <HStack align="baseline" gap={4} marginTop={6}>
                <Text as="span" size={17} color="var(--ft-dim)">£</Text>
                <span className="ft-drill">
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
                </span>
              </HStack>
            </DrillTarget>
            {unconvertibleAccounts > 0 && (
              <Text as="div" size={11} mt={6} color="var(--ft-amber)">
                {unconvertibleAccounts} account{unconvertibleAccounts !== 1 ? "s" : ""} without FX — not in total
              </Text>
            )}
          </VStack>
        )}

        {/* WHAT CHANGED stood here from 2026-09-07 to 2026-09-10 and now
            stands on WORTH. The reason it was under this hero — the hero
            states a move and this states what the move was made of — is
            true of the WORTH hero too, and WORTH is the balance sheet:
            "what changed" is a statement about balances, and every row in
            it drills to an account, which is the tab those accounts live
            on. Rendering it on both tabs would be one finding stated
            twice, so it moved rather than being copied. */}

        {/* Claimed. C2-4: when the API supplies topPending, list up to 3
            counterparties by name + amount underneath the total.

            Until 16 Sep 2026 a 14px red-outlined square stood in front of
            this line. It was a div — no input, no state, no handler — that
            looked exactly like an unticked checkbox (DESIGN.md §16: a control
            that does nothing is a lie), so it is gone rather than wired.

            The total and the per-person amounts are a balance owed, not a
            move, so they are drawn in the text colour with their minus sign,
            as WORTH draws OWED. Red on HOME is kept for a figure that went
            down (§7, §11); it was carrying five meanings on this screen. */}
        {owedByMe != null && owedByMe > 0 && (
          <VStack gap={6} padding="16px 16px 0">
            <DrillTarget href="/owing" title="The debts this claims">
              <span className="ft-drill">
                <Text
                  as="div"
                  mono
                  size={11}
                  lineHeight="16px"
                  numeric
                >
                  CLAIMED {nfmt(-owedByMe, { symbol: "£" })}
                  {pendingCount != null && ` · ${pendingCount} ${pendingCount === 1 ? "DEBT" : "DEBTS"}`}
                </Text>
              </span>
            </DrillTarget>
            {topPending.filter((p) => p.direction === "i_owe_them").slice(0, 3).map((p) => (
              <HStack key={`${p.name}-${p.amountBase}`} align="baseline" justify="between" gap={12}>
                <Text as="span" size={11} color="var(--ft-muted)" truncate>
                  {p.name}
                </Text>
                <span style={{ flex: "none" }}>
                  <Text as="span" mono size={11} color="var(--ft-muted)" numeric>
                    {nfmt(-p.amountBase, { symbol: "£" })}
                  </Text>
                </span>
              </HStack>
            ))}
          </VStack>
        )}

        {currentInsight != null && (
          <div style={{ paddingTop: 16 }}>
            <InsightSlot insight={currentInsight} onDismiss={handleDismissInsight} />
          </div>
        )}

        {/* Persona ordering (lib/persona-emphasis.ts): a markets persona
            sees market movement above the cashflow chart, everyone else
            the reverse. Both blocks render for every persona; only the
            sequence changes. News travels with the markets pane. */}
        {homeSectionOrder(persona).map((section) =>
          section === "cashflow" ? (
            /* Cashflow section — only when there is anything to plot */
            txns.length > 0 && (
              <div key="cashflow">
                <HomeSectionHeader
                  label={`${monthName} · LIQUID`}
                  link="CASHFLOW ›"
                  onLink={() => navigate("/cashflow")}
                />
                <div style={{ padding: "0 16px" }}>
                  <CashflowChart
                    days={dailyBalances}
                    todayIndex={todayIndex}
                    lastDay={lastDayOfMonth}
                    low={monthLow}
                    monthShortMixed={monthShortMixed}
                  />
                </div>
              </div>
            )
          ) : (
            <div key="markets">
              {/* Markets pane — the only element that differs tomorrow morning
                  without the user doing anything. Scoped to holdings + implied
                  FX pairs; renders nothing when the user has neither. */}
              <MarketPane onOpenInvestments={() => navigate("/investments")} />

              {/* F3 · news pane. All-or-nothing: header + list render
                  together only when NewsPane has anchor-tied items to
                  show. See components/mobile/NewsPane.tsx. */}
              <NewsPane onOpenInvestments={() => navigate("/investments")} />
            </div>
          ),
        )}

        {/* Coming section */}
        <HomeSectionHeader
          label="COMING · KNOWN WITH CERTAINTY"
          link="MONTH ›"
          onLink={() => navigate("/upcoming")}
        />
        <div style={{ padding: "0 16px" }}>
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
              fontSize: 13,
              color: "var(--ft-dim)",
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            Split a bill ›
          </a>
        </div>

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

// Until 16 Sep 2026 this drew thirty bars with no scale, a red bar and a
// yellow bar with no legend, each bar carrying a 5px offset shadow, and four
// labels spaced along one line with nothing tying them to a bar. Now, by
// rule:
//   · the plot states its scale — the top rule is labelled with the tallest
//     balance and the baseline is £0 (DESIGN.md §5, §7);
//   · days that have not happened are dotted outlines, not a dimmer solid
//     (the phone's "dotted means not-yet-real");
//   · TODAY and LOW are tick-marked under their own bars, not coloured —
//     hue does not carry them (§11). LOW is red only when it is below zero;
//   · depth is decoration, so the offset shadow is gone (Mobile Amendment
//     permits elevation only on floating surfaces).
// Bar height is still |balance| / max — see report Deferred on negatives.
const PLOT_H = 120;
const AXIS_H = 18;
const EDGE_LABEL_CLEARANCE = 5; // days — hide an edge date the TODAY label would collide with

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
  const n = Math.max(days.length, 1);
  const centreOf = (i: number) => `${((i + 0.5) / n) * 100}%`;
  const lowIndex = low != null ? days.findIndex((d) => d.day === low.day) : -1;
  const hasToday = todayIndex >= 0 && todayIndex < days.length;
  const showFirst = !hasToday || todayIndex >= EDGE_LABEL_CLEARANCE;
  const showLast = !hasToday || todayIndex < days.length - EDGE_LABEL_CLEARANCE;
  const axisLabel = { position: "absolute" as const, top: 4, whiteSpace: "nowrap" as const };
  const tick = (i: number) => (
    <span
      key={`tick-${i}`}
      aria-hidden
      style={{ position: "absolute", top: 0, left: centreOf(i), width: 1, height: 4, background: "var(--ft-muted)" }}
    />
  );

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4 }}>
        <Text as="span" mono size={11} color="var(--ft-dim)" numeric>
          {nfmt(maxAbs, { symbol: "£", decimals: 0 })}
        </Text>
      </div>
      <div
        style={{
          height: PLOT_H,
          display: "flex",
          alignItems: "flex-end",
          gap: 2,
          borderTop: "1px solid var(--ft-border)",
          borderBottom: "1px solid var(--ft-border2)",
        }}
      >
        {days.map((d, i) => {
          const heightPct = Math.max(1, (Math.abs(d.balance) / maxAbs) * 100);
          return (
            <span
              key={i}
              style={{
                flex: 1,
                minWidth: 1,
                height: `${heightPct}%`,
                boxSizing: "border-box",
                ...(d.future
                  ? { border: "1px dotted var(--ft-dim)", borderBottom: "none" }
                  : { background: "var(--ft-text)" }),
              }}
            />
          );
        })}
      </div>
      <div style={{ position: "relative", height: AXIS_H, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
        {hasToday && tick(todayIndex)}
        {lowIndex >= 0 && lowIndex !== todayIndex && tick(lowIndex)}
        {showFirst && <span className="pnum" style={{ ...axisLabel, left: 0 }}>1 {monthShortMixed}</span>}
        {hasToday && (
          <span style={{ ...axisLabel, left: centreOf(todayIndex), transform: "translateX(-50%)", color: "var(--ft-text)" }}>
            TODAY
          </span>
        )}
        {showLast && <span className="pnum" style={{ ...axisLabel, right: 0 }}>{lastDay} {monthShortMixed}</span>}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          flexWrap: "wrap",
          gap: "6px 12px",
          marginTop: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-dim)",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ width: 8, height: 8, background: "var(--ft-text)" }} />
          SO FAR
          <span aria-hidden style={{ width: 8, height: 8, marginLeft: 6, border: "1px dotted var(--ft-dim)", boxSizing: "border-box" }} />
          PROJECTED
        </span>
        {low && (
          <span className="pnum" style={{ color: low.balance < 0 ? "var(--ft-red)" : "var(--ft-muted)" }}>
            LOW {nfmt(low.balance, { symbol: "£" })} · {low.day} {monthShortMixed}
          </span>
        )}
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
            // No top rule on the first row: COMING's header draws it (DESIGN.md §5).
            ...(i > 0 ? { borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)" } : {}),
            ...(i === rows.length - 1
              ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
              : {}),
            fontSize: 14,
          }}
        >
          {/* The name may give; the amount may not (DESIGN.md §8). */}
          <Text as="span" size={14} truncate>
            {r.name} · {r.dateStr}
          </Text>
          <span style={{ flex: "none", paddingLeft: 12 }}>
            <Text
              as="span"
              mono
              size={13}
              color={r.kind === "in" ? "var(--ft-green)" : "var(--ft-red)"}
              numeric
            >
              {/* Native currency is named on every foreign value (§7). This
                  passed an empty symbol for anything not GBP, so a USD bill
                  read as a bare "−20.00". */}
              {nfmt(r.kind === "in" ? r.amount : -r.amount, {
                symbol: CURRENCY_SYMBOLS[r.currency] ?? `${r.currency} `,
                sign: r.kind === "in",
              })}
            </Text>
          </span>
        </div>
      ))}
    </VStack>
  );
}

