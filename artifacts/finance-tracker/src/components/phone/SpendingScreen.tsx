import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  useListTransactions,
  useDeleteTransaction,
  getListTransactionsQueryKey,
  getGetDashboardQueryKey,
  getGetTransactionSummaryQueryKey,
  getListAccountsQueryKey,
  type Transaction,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";

import { useBaseCurrency } from "@/lib/currency-store";
import { formatBaseMoney, formatNative } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import { useSwipeDelete } from "@/hooks/use-swipe-delete";

import { PhoneEntityRow, deriveTone } from "./PhoneEntityRow";
import { SectionHeader } from "./SectionHeader";
import { PhoneScreenSkeleton } from "./PhoneScreenSkeleton";
import { CategoryStrip } from "./CategoryStrip";
import { InsightSlot } from "./InsightSlot";
import { MobileEmptyState } from "@/components/mobile/mobile-ui";
import { PhoneSectionError } from "@/components/mobile/mobile-ui";
import { QuickAddTransaction } from "@/components/quick-add-transaction";
import { MobileSheet } from "@/components/mobile-sheet";
import {
  selectInsight,
  loadDismissedIds,
  dismissInsight,
  type Insight,
} from "@/lib/spending-insights";

// SPENDING — the daily-check "how much have I spent this month" screen.
//
// Purpose (from the SPENDING brief):
//   - HERO: MTD expenses in base currency, primary-num size.
//   - UNDER HERO: comparison to the SAME POINT last month (not the
//     whole of last month — a 3-day-vs-full-month comparison lies at
//     ~90% drop).
//   - NO CHART. HOME already carries the month cashflow bars; this
//     screen is a ledger view, not a second visualisation of the
//     hero fact.
//   - LIST: day-grouped, newest first. Each day header carries the
//     day's net. Rows use PhoneEntityRow.
//   - Currency: primary amount always in BASE (stored FX rate via
//     tx.baseEquivalent — never live). Native goes below as a
//     subordinate line.
//   - Pagination: current month by default; scrolling past its end
//     loads the previous month with its own header. Month is the
//     unit the hero scopes to; the list must agree.
//   - Not in v1: bulk select, filters, search, split, AI-cat,
//     templates. Those live on desktop.
//
// Amendment lines followed (src/index.css:47–94):
//   :74  min 44 tap targets on rows + FAB
//   :77  primary number ≥28px (30 via var(--ft-text-primary-num))
//   :78  no dead space rule — empty state IS labelled as the message
//   :82  every screen has one thing to DO — FAB satisfies it
//   :83  every entity row has a glyph — PhoneEntityRow supplies it
//   :88  sign character in the string, not just hue (delta line
//        prefixes with "+" / "−" and uses "more"/"less" wording)
//   :90  tabular figures in aligned columns (.pnum via primitives)
//   :91  vertical rhythm uniform within a list — SectionHeader per
//        day, PhoneEntityRow per tx, no ragged padding

// ── date helpers ─────────────────────────────────────────────────────
// Local-date semantics: tx.date on the wire is a bare YYYY-MM-DD
// string (postgres date type, drizzle mode:"string"). Compare with
// local Date construction to avoid UTC drift.

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfMonthNBack(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() - n, 1);
}

// Same day-of-month in the previous month, clamped to the last day
// of the previous month when today is later than the prev month has
// days (e.g. today = Mar 31 → prev = Feb 28/29). "Same point last
// month" is the semantic the brief calls for; overflow to April
// would compare Mar 31 with May 3, which is not the same point.
function sameDayInPrevMonth(now: Date): Date {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const lastDayOfPrev = new Date(y, m, 0).getDate();
  return new Date(y, m - 1, Math.min(d, lastDayOfPrev));
}

function monthLabel(iso: string): string {
  // iso = "YYYY-MM-DD"; returns "AUGUST 2026" style.
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return d.toLocaleString(undefined, { month: "long", year: "numeric" }).toUpperCase();
}

function shortMonthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, 1);
  return d.toLocaleString(undefined, { month: "short" }).toUpperCase();
}

function dayHeaderLabel(iso: string): string {
  // "TUE 26 AUG"
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, day);
  const weekday = d.toLocaleString(undefined, { weekday: "short" }).toUpperCase();
  const dayNum = String(day).padStart(2, "0");
  const monShort = d.toLocaleString(undefined, { month: "short" }).toUpperCase();
  return `${weekday} ${dayNum} ${monShort}`;
}

function sameDayLabel(iso: string): string {
  // "30 JUL" — used in the delta line for "more/less than by 30 Jul".
  const [y, m, day] = iso.split("-").map(Number);
  const d = new Date(y, (m ?? 1) - 1, day);
  return `${day} ${d.toLocaleString(undefined, { month: "short" }).toUpperCase()}`;
}

function isFirstOfMonth(iso: string): boolean {
  return iso.endsWith("-01");
}

// ── shape: month-then-day grouping ──────────────────────────────────
interface DayGroup {
  date: string;             // YYYY-MM-DD
  txs: Transaction[];       // newest-first within the day
  // Day-header figure. EXPENSES ONLY so it agrees with the hero (which
  // is SPENT · MTD, income excluded). If the day has zero expenses,
  // this is null and the day header renders no right-side value —
  // Amendment :78, "sparse over dense," don't invent a signal when
  // there isn't one. If the day has any unconvertible expense, also
  // null — a partial sum is a lie in aggregate.
  expensesTotal: number | null;
}
interface MonthGroup {
  monthStart: string;       // YYYY-MM-01
  spent: number | null;     // total expenses this month, base currency; null if any expense unconvertible
  days: DayGroup[];
  // The account that dominates this month's activity (most tx count).
  // Row-level rendering hides the account name when a row's account
  // matches this — the account chip only carries information when
  // it's the LESS-USED account. Null when the month has no
  // dominant (0 rows, or a genuine tie). Ties broken by first-
  // encountered which is deterministic for a given fetch.
  dominantAccount: string | null;
}

function computeDominantAccount(txs: readonly Transaction[]): string | null {
  const counts = new Map<string, number>();
  let winner: string | null = null;
  let winnerCount = 0;
  for (const tx of txs) {
    const name = tx.accountName;
    if (!name) continue;
    const next = (counts.get(name) ?? 0) + 1;
    counts.set(name, next);
    if (next > winnerCount) {
      winner = name;
      winnerCount = next;
    }
  }
  return winner;
}

function groupIntoMonths(
  txs: readonly Transaction[],
  pendingDeleteIds: ReadonlySet<number>,
): MonthGroup[] {
  const byMonth = new Map<string, Transaction[]>();
  for (const tx of txs) {
    if (pendingDeleteIds.has(tx.id)) continue;
    const key = tx.date.slice(0, 7) + "-01";
    const bucket = byMonth.get(key);
    if (bucket) bucket.push(tx); else byMonth.set(key, [tx]);
  }
  const months: MonthGroup[] = [];
  for (const [monthStart, monthTxs] of byMonth) {
    // Day groups within month.
    const byDay = new Map<string, Transaction[]>();
    for (const tx of monthTxs) {
      const bucket = byDay.get(tx.date);
      if (bucket) bucket.push(tx); else byDay.set(tx.date, [tx]);
    }
    const days: DayGroup[] = [];
    for (const [date, dayTxs] of byDay) {
      // Sort within day: newest createdAt first — a rapid sequence of
      // typed entries on the same date reads in the order the user
      // added them, most recent at top.
      dayTxs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      // Day header figure: EXPENSES ONLY. The tab is SPENDING; the
      // hero is SPENT · MTD; a day header that flipped positive on
      // payday would contradict both. Income and transfer rows
      // still render as subordinated rows within the day — they
      // aren't hidden, they just don't count toward the header
      // figure. Null when any expense is unconvertible or when
      // there is no expense to count.
      let unconvertible = false;
      let total = 0;
      let expenseCount = 0;
      for (const tx of dayTxs) {
        if (tx.type !== "expense") continue;
        expenseCount += 1;
        if (tx.baseEquivalent == null) { unconvertible = true; continue; }
        total += Math.abs(tx.baseEquivalent);
      }
      const expensesTotal = expenseCount === 0
        ? null
        : (unconvertible ? null : total);
      days.push({ date, txs: dayTxs, expensesTotal });
    }
    days.sort((a, b) => b.date.localeCompare(a.date));

    // Month spent total: expenses only, base currency, propagating
    // null if any single expense is unconvertible.
    let expUnconv = false;
    let spent = 0;
    for (const tx of monthTxs) {
      if (tx.type !== "expense") continue;
      if (tx.baseEquivalent == null) { expUnconv = true; continue; }
      spent += Math.abs(tx.baseEquivalent);
    }
    months.push({
      monthStart,
      spent: expUnconv ? null : spent,
      days,
      dominantAccount: computeDominantAccount(monthTxs),
    });
  }
  months.sort((a, b) => b.monthStart.localeCompare(a.monthStart));
  return months;
}

// ── screen ──────────────────────────────────────────────────────────

const FAB_ICON_SIZE = 22;
const FAB_SIZE = 56;

export function SpendingScreen() {
  const baseCurrency = useBaseCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const deleteTx = useDeleteTransaction();

  // How many past-months' data to show in the list. Current month
  // only by default; grows on scroll-past-end. Query always fetches
  // one extra month (monthsShown + 1) to keep the hero's
  // "same point last month" comparison honest even when the list
  // shows only the current month.
  const [monthsShown, setMonthsShown] = useState(1);

  // Frozen "now" per render — repeated calls to `new Date()` inside a
  // single render could straddle midnight during navigation and shift
  // the day groups mid-frame. Held in a ref so useMemo dependencies
  // don't churn on unrelated re-renders.
  const nowRef = useRef<Date | null>(null);
  if (nowRef.current == null) nowRef.current = new Date();
  const now = nowRef.current;

  const queryMonths = monthsShown + 1;
  const dateFrom = ymd(startOfMonthNBack(now, queryMonths - 1));
  const {
    data: transactions,
    isLoading,
    isError,
    refetch,
  } = useListTransactions({ dateFrom });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetTransactionSummaryQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListAccountsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
  }, [queryClient]);

  // ── pending-delete + 3s undo (matches the pattern in
  // pages/transactions.tsx:834–869) ──────────────────────────────
  const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<number>>(new Set());
  const deleteTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const commitDelete = useCallback(async (id: number) => {
    deleteTimers.current.delete(id);
    setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    try {
      await deleteTx.mutateAsync({ id });
      invalidate();
    } catch {
      toast({ title: "Failed to delete transaction", variant: "destructive" });
    }
  }, [deleteTx, invalidate, toast]);

  const handleDelete = useCallback((id: number) => {
    haptic.warning();
    setPendingDeleteIds((prev) => new Set([...prev, id]));
    const { dismiss } = toast({
      title: "Deleting in 3s",
      description: (
        <button
          type="button"
          onClick={() => {
            const t = deleteTimers.current.get(id);
            if (t) clearTimeout(t);
            deleteTimers.current.delete(id);
            setPendingDeleteIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
            dismiss();
          }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ft-accent)", fontFamily: "var(--font-mono)",
            fontSize: 12, padding: 0, fontWeight: 700,
          }}
        >
          Undo
        </button>
      ),
    });
    const timer = setTimeout(() => { commitDelete(id); dismiss(); }, 3000);
    deleteTimers.current.set(id, timer);
  }, [toast, commitDelete]);

  // Clear pending timers on unmount to avoid setState-after-unmount
  // when the screen navigates away mid-undo-window.
  useEffect(() => {
    const timers = deleteTimers.current;
    return () => { for (const t of timers.values()) clearTimeout(t); };
  }, []);

  // ── UI state: add sheet + detail sheet + dismissed insights ───
  const [addOpen, setAddOpen] = useState(false);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [dismissedInsights, setDismissedInsights] = useState<Set<string>>(
    () => loadDismissedIds(),
  );

  // ── grouped data ───────────────────────────────────────────────
  const months = useMemo(
    () => groupIntoMonths(transactions ?? [], pendingDeleteIds),
    [transactions, pendingDeleteIds],
  );

  // Current-month txs, for the category strip and the insight producers.
  // Pre-filtered by month so consumers don't re-slice.
  const currentMonthTxs = useMemo(() => {
    if (!transactions) return [];
    const startCurIso = ymd(startOfMonth(now));
    const todayIso = ymd(now);
    return transactions.filter(
      (tx) =>
        !pendingDeleteIds.has(tx.id) &&
        tx.date >= startCurIso &&
        tx.date <= todayIso,
    );
  }, [transactions, pendingDeleteIds, now]);

  // Insight selection — pure derivation from txs + baseCurrency +
  // dismissed set. Zero producers registered today; this returns null
  // and the slot renders nothing. When features land producers, this
  // starts returning insights automatically.
  const currentInsight = useMemo<Insight | null>(
    () => selectInsight(currentMonthTxs, { baseCurrency }, dismissedInsights),
    [currentMonthTxs, baseCurrency, dismissedInsights],
  );

  const handleDismissInsight = useCallback((id: string) => {
    dismissInsight(id);
    setDismissedInsights((prev) => new Set([...prev, id]));
  }, []);

  // Slice to `monthsShown` for the list. The query fetches one more.
  // Ordered newest-first via groupIntoMonths.
  const visibleMonths = months.slice(0, monthsShown);
  const hasMoreToLoad = months.length > monthsShown || monthsShown < 12;
  //                                                    ^ 12-month floor: user can
  // always request one more month even if the current fetch is empty (a genuine
  // gap in history rather than "nothing more exists"). Capped at 12 to bound
  // the query size.

  // Hero: MTD spend + delta vs same-point last month.
  const hero = useMemo(() => {
    if (!transactions) return null;
    const todayIso = ymd(now);
    const startCurIso = ymd(startOfMonth(now));
    const startLastIso = ymd(startOfMonthNBack(now, 1));
    const sameDayLastIso = ymd(sameDayInPrevMonth(now));

    let mtdSum = 0, mtdUnconv = false;
    let lastSum = 0, lastUnconv = false;
    for (const tx of transactions) {
      if (pendingDeleteIds.has(tx.id)) continue;
      if (tx.type !== "expense") continue;
      if (tx.date >= startCurIso && tx.date <= todayIso) {
        if (tx.baseEquivalent == null) mtdUnconv = true;
        else mtdSum += Math.abs(tx.baseEquivalent);
      } else if (tx.date >= startLastIso && tx.date <= sameDayLastIso) {
        if (tx.baseEquivalent == null) lastUnconv = true;
        else lastSum += Math.abs(tx.baseEquivalent);
      }
    }
    return {
      mtd: mtdUnconv ? null : mtdSum,
      lastMonthSamePoint: lastUnconv ? null : lastSum,
      sameDayLastIso,
    };
  }, [transactions, pendingDeleteIds, now]);

  // ── infinite-scroll sentinel ───────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMoreToLoad) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setMonthsShown((s) => Math.min(s + 1, 12));
            break;
          }
        }
      },
      { rootMargin: "160px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMoreToLoad, monthsShown]);

  // ── render branches ────────────────────────────────────────────
  if (isError) {
    return (
      <PhoneSectionError
        label="COULDN'T LOAD"
        title="Your transactions didn't load."
        onRetry={() => { void refetch(); }}
      />
    );
  }
  if (isLoading && !transactions) {
    return <PhoneScreenSkeleton shape="header-hero-list" rows={8} />;
  }
  if ((transactions?.length ?? 0) === 0) {
    return (
      <>
        <MobileEmptyState
          scope="screen"
          label="NO TRANSACTIONS"
          title="Nothing spent yet."
          description="Log your first transaction to see it here, grouped by day."
          ctaLabel="Add transaction"
          onCta={() => setAddOpen(true)}
        />
        {addOpen && (
          <QuickAddTransaction open={addOpen} onClose={() => setAddOpen(false)} />
        )}
      </>
    );
  }

  return (
    /*
      Fourth attempt at the FAB placement. Prior attempts:
        #1 — bottom: `calc(tab-bar + 16 + inset)` inside a wrapper
              already above the tab bar. FAB floated ~80–114px too
              high; overlaid content mid-screen.
        #2 — bottom: 16, added an 88px pad div at the END of the
              scroll content. Cleared the FAB only at scroll-end;
              at scroll-top rows sat in the FAB's y-range
              (measured 719–784 vs FAB 728–784 = 56px overlap).
        #3 — bottom: 16, moved the 88px pad from scroll-content to
              wrapper.paddingBottom. Shrank the scroll viewport so
              rows never entered the FAB's y-range, but that
              reserved a hard 88px band above the tab bar. On dark
              theme the band read as a flat black strip across the
              full width outside the FAB's 56×56 footprint —
              Thomas: "a black bar next to the AI button covering
              the entire bottom" (31 Aug).

      #4 (this pass) — Thomas's proposed direction, measured
      against source: no reserved band. Scroll region fills the
      wrapper. A short pad in the scroll CONTENT (72 = FAB
      height + 16px margin) lets the last row scroll clear of the
      FAB at scroll-end. A gradient overlay at the bottom
      (transparent → --ft-base, 96px tall) sits between the scroll
      region and the FAB in z-order, so content approaching the
      FAB dissolves into the base colour rather than being covered
      or bumping into a hard band. Standard iOS pattern (Notes,
      Mail — content fades under floating chrome). `pointer-events:
      none` on the gradient so row taps pass through.
    */
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          background: "var(--ft-base)",
        }}
      >
        <SpendingHero hero={hero} now={now} loading={isLoading && !hero} />
        <CategoryStrip txs={currentMonthTxs} />
        <InsightSlot insight={currentInsight} onDismiss={handleDismissInsight} />
        {visibleMonths.map((month, idx) => (
          <MonthSection
            key={month.monthStart}
            month={month}
            isCurrentMonth={idx === 0 && month.monthStart === ymd(startOfMonth(now))}
            onTapTx={setDetailTx}
            onDelete={handleDelete}
            pendingDeleteIds={pendingDeleteIds}
          />
        ))}
        {hasMoreToLoad && (
          <div ref={sentinelRef} style={{ padding: "24px 16px", textAlign: "center" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--ft-text-xs)", color: "var(--ft-dim)", letterSpacing: "0.08em" }}>
              LOADING EARLIER…
            </span>
          </div>
        )}
        {/*
          Short pad at scroll-content end so the LAST row can
          scroll fully above the FAB at scroll-end. 72 = 56 (FAB
          height) + 16 (offset above tab-bar-top). Does NOT reserve
          a visible band — this is content-level pad, invisible
          unless scrolled all the way down (in which case it sits
          transparently above the tab bar). The anti-overlap
          mechanism is the gradient below.
        */}
        <div style={{ height: 72, flexShrink: 0 }} aria-hidden="true" />
      </div>

      {/*
        Gradient fade above the FAB. Absolute inside the wrapper,
        pinned to the bottom, 96px tall, full-width, transparent
        at the top → --ft-base at the bottom. Sits above the
        scroll region (implicit z-index; the FAB has z-index: 30
        so it renders on top of the gradient). `pointer-events:
        none` so taps still reach rows behind the fade zone.
        Content approaching the FAB dissolves into the base
        colour rather than being covered — standard iOS pattern.
      */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 96,
          pointerEvents: "none",
          background: "linear-gradient(to bottom, color-mix(in srgb, var(--ft-base) 0%, transparent) 0%, var(--ft-base) 100%)",
          zIndex: 20,
        }}
      />

      <Fab onClick={() => { haptic.light(); setAddOpen(true); }} />

      {addOpen && (
        <QuickAddTransaction open={addOpen} onClose={() => setAddOpen(false)} />
      )}
      {detailTx && (
        <TxDetailSheet
          tx={detailTx}
          onClose={() => setDetailTx(null)}
          onDelete={() => { handleDelete(detailTx.id); setDetailTx(null); }}
        />
      )}
    </div>
  );
}

// ── hero ────────────────────────────────────────────────────────────

interface HeroData {
  mtd: number | null;
  lastMonthSamePoint: number | null;
  sameDayLastIso: string;
}

function SpendingHero({ hero, now, loading }: { hero: HeroData | null; now: Date; loading: boolean }) {
  const label = `SPENT · ${shortMonthLabel(ymd(now))} · MTD`;
  const value = hero?.mtd != null ? formatBaseMoney(hero.mtd) : (loading ? "…" : "—");

  // Delta: signed (positive = spending more, red; negative = less, green).
  // Amendment :88 — sign carried in the string ("+"/"−" plus "more"/"less"),
  // not by hue alone.
  let deltaLine: React.ReactNode = null;
  if (hero != null && hero.mtd != null && hero.lastMonthSamePoint != null) {
    const diff = hero.mtd - hero.lastMonthSamePoint;
    const abs = Math.abs(diff);
    const dayLabel = sameDayLabel(hero.sameDayLastIso);
    if (abs < 0.005) {
      deltaLine = (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}>
          same as by {dayLabel}
        </span>
      );
    } else {
      const sign = diff > 0 ? "+" : "−";
      const word = diff > 0 ? "more" : "less";
      const colour = diff > 0 ? "var(--ft-red)" : "var(--ft-green)";
      deltaLine = (
        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: colour }}>
          {sign}{formatBaseMoney(abs)} {word} than by {dayLabel}
        </span>
      );
    }
  } else if (hero != null && hero.mtd != null && hero.lastMonthSamePoint == null) {
    deltaLine = (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}>
        no comparison — last month's rate unavailable
      </span>
    );
  }

  return (
    <div style={{ padding: "20px 16px 12px" }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--ft-text-xs)",
          letterSpacing: "0.16em",
          color: "var(--ft-dim)",
        }}
      >
        {label}
      </div>
      <div
        className="pnum"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--ft-text-primary-num)",   // 30px (Amendment :77)
          fontWeight: 700,
          lineHeight: "34px",
          letterSpacing: "-0.02em",
          color: "var(--ft-text)",
          marginTop: 6,
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>
      {deltaLine && <div style={{ marginTop: 6 }}>{deltaLine}</div>}
    </div>
  );
}

// ── month section ───────────────────────────────────────────────────

function MonthSection({
  month,
  isCurrentMonth,
  onTapTx,
  onDelete,
  pendingDeleteIds,
}: {
  month: MonthGroup;
  isCurrentMonth: boolean;
  onTapTx: (tx: Transaction) => void;
  onDelete: (id: number) => void;
  pendingDeleteIds: ReadonlySet<number>;
}) {
  return (
    <div>
      {!isCurrentMonth && (
        <SectionHeader
          label={monthLabel(month.monthStart)}
          right={
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--ft-text-xs)",
                color: "var(--ft-muted)",
                letterSpacing: "0.04em",
                textTransform: "none",
              }}
            >
              {month.spent != null ? `SPENT ${formatBaseMoney(month.spent)}` : "SPENT —"}
            </span>
          }
        />
      )}
      {month.days.map((day) => (
        <DayGroup
          key={day.date}
          day={day}
          dominantAccount={month.dominantAccount}
          onTapTx={onTapTx}
          onDelete={onDelete}
          pendingDeleteIds={pendingDeleteIds}
        />
      ))}
    </div>
  );
}

function DayGroup({
  day,
  dominantAccount,
  onTapTx,
  onDelete,
  pendingDeleteIds,
}: {
  day: DayGroup;
  dominantAccount: string | null;
  onTapTx: (tx: Transaction) => void;
  onDelete: (id: number) => void;
  pendingDeleteIds: ReadonlySet<number>;
}) {
  // Day header = EXPENSES ONLY, unsigned. The tab is SPENDING and the
  // hero is SPENT · MTD; a header that flipped positive on payday
  // would contradict the whole screen. When the day had zero
  // expenses (or all were unconvertible), show no right-side figure
  // at all — Amendment :78, sparse over dense, don't invent a
  // signal. The date on the left still identifies the day.
  const expensesStr = day.expensesTotal == null
    ? null
    : formatBaseMoney(day.expensesTotal);
  return (
    <div>
      <SectionHeader
        label={dayHeaderLabel(day.date)}
        right={
          expensesStr != null ? (
            <span
              className="pnum"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: "var(--ft-text-xs)",
                color: "var(--ft-muted)",
                letterSpacing: "0.04em",
                textTransform: "none",
              }}
            >
              {expensesStr}
            </span>
          ) : undefined
        }
      />
      {day.txs.map((tx, i) => (
        <TxSwipeRow
          key={tx.id}
          tx={tx}
          isLast={i === day.txs.length - 1}
          isPendingDelete={pendingDeleteIds.has(tx.id)}
          dominantAccount={dominantAccount}
          onTap={() => onTapTx(tx)}
          onDelete={() => onDelete(tx.id)}
        />
      ))}
    </div>
  );
}

// ── row (with swipe-to-delete + pending-delete visual) ──────────────

function TxSwipeRow({
  tx,
  isLast,
  isPendingDelete,
  dominantAccount,
  onTap,
  onDelete,
}: {
  tx: Transaction;
  isLast: boolean;
  isPendingDelete: boolean;
  dominantAccount: string | null;
  onTap: () => void;
  onDelete: () => void;
}) {
  const swipe = useSwipeDelete(onDelete);

  // The tab is SPENDING. Income and transfer rows exist for context
  // (money moved and hiding them is dishonest) but they're not the
  // subject — subdue so they visually recede against the expense
  // rows. PhoneEntityRow's `subdued` prop swaps glyph tint to muted
  // grey and drops the amount to body size + muted colour. Expense
  // rows keep full weight and the red tone.
  const isSubject = tx.type === "expense";
  const baseTone = isSubject ? "var(--ft-red)" : undefined;

  // Amount rendering:
  //   - Primary line = base currency, SIGNED. formatBaseMoney passes
  //     the signed number through to Intl.NumberFormat, which yields
  //     "−£43.06" or "+£1,000.00" naturally. Sign character carries
  //     meaning (Amendment :88), colour reinforces on expenses.
  //   - Native companion line = tx.currency amount when it differs
  //     from the base.
  const baseStr = tx.baseEquivalent != null ? formatBaseMoney(tx.baseEquivalent) : "—";
  const showNative = tx.baseEquivalent != null && tx.currency !== undefined;
  // Hide the native line when currency matches base — "RM 43 / RM 43"
  // is noise. A cheap proxy without a store read: hide when
  // tx.baseEquivalent's absolute value equals nativeAmount within
  // rounding.
  const sameCurrency = tx.baseEquivalent != null
    && Math.abs(Math.abs(tx.baseEquivalent) - Math.abs(tx.nativeAmount)) < 0.005;
  const nativeStr = showNative && !sameCurrency
    ? formatNative(Math.abs(tx.nativeAmount), tx.currency)
    : undefined;

  // Category → deterministic tone. Consistent tint per category
  // ("Groceries" always the same colour) is a stronger identity
  // signal than description-hashed tone, which changes per row.
  // Label defaults to deriveInitials(description) via PhoneEntityRow.
  const tone = deriveTone(tx.category || tx.type || "?");

  // Account chip only when this row's account is NOT the month's
  // dominant one. With four accounts and one that owns most rows,
  // "Monzo Current" printed on every row is noise — Maybank Savings
  // needs to stand out precisely because the others are silent.
  // When the month has no dominant (empty or single-row month),
  // dominantAccount is the same as tx.accountName by definition,
  // so the chip is suppressed everywhere in that month — which is
  // also right (nothing to distinguish).
  const showAccount = !!tx.accountName && tx.accountName !== dominantAccount;
  const secondaryParts: string[] = [];
  if (tx.category) secondaryParts.push(tx.category);
  if (showAccount && tx.accountName) secondaryParts.push(tx.accountName);
  const secondary = secondaryParts.length ? secondaryParts.join(" · ") : undefined;

  return (
    <div className="ft-swipe-row" style={{ position: "relative" }} data-tx-row>
      <button
        type="button"
        className="ft-swipe-delete-action"
        onClick={swipe.handleDelete}
        aria-label={`Delete ${tx.description}`}
      >
        DELETE
      </button>
      <div
        {...swipe.touchHandlers}
        style={{
          transform: `translateX(${swipe.offset}px)`,
          transition: "transform 0.15s ease",
          opacity: isPendingDelete ? 0.4 : 1,
          textDecoration: isPendingDelete ? "line-through" : "none",
          background: "var(--ft-base)",
        }}
      >
        <PhoneEntityRow
          primary={tx.description}
          secondary={secondary}
          identity={{ tone }}
          amount={{
            value: baseStr,
            tone: baseTone,
            native: nativeStr,
          }}
          onTap={onTap}
          isLast={isLast}
          subdued={!isSubject}
        />
      </div>
    </div>
  );
}

// ── detail sheet ────────────────────────────────────────────────────

function TxDetailSheet({
  tx,
  onClose,
  onDelete,
}: {
  tx: Transaction;
  onClose: () => void;
  onDelete: () => void;
}) {
  const baseStr = tx.baseEquivalent != null ? formatBaseMoney(tx.baseEquivalent) : "—";
  const nativeStr = formatNative(Math.abs(tx.nativeAmount), tx.currency);
  const sameCurrency = tx.baseEquivalent != null
    && Math.abs(Math.abs(tx.baseEquivalent) - Math.abs(tx.nativeAmount)) < 0.005;
  const typeColour =
    tx.type === "income" ? "var(--ft-green)"
    : tx.type === "expense" ? "var(--ft-red)"
    : "var(--ft-blue)";

  return (
    <MobileSheet
      open={true}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="Transaction"
    >
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: "var(--ft-text-xs)", letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
            {tx.type.toUpperCase()}
          </div>
          <div
            className="pnum"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 26,
              fontWeight: 700,
              lineHeight: "30px",
              letterSpacing: "-0.02em",
              color: typeColour,
              marginTop: 4,
              whiteSpace: "nowrap",
            }}
          >
            {baseStr}
          </div>
          {!sameCurrency && (
            <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--ft-muted)", marginTop: 2 }}>
              {nativeStr}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <DetailRow label="DESCRIPTION" value={tx.description} />
          <DetailRow label="CATEGORY" value={tx.category} />
          <DetailRow label="ACCOUNT" value={tx.accountName} />
          <DetailRow label="DATE" value={tx.date} />
        </div>
        <button
          type="button"
          onClick={onDelete}
          style={{
            minHeight: 44,
            padding: "0 18px",
            background: "transparent",
            color: "var(--ft-red)",
            border: "1px solid var(--ft-red)",
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.08em",
            cursor: "pointer",
            borderRadius: 16,
            alignSelf: "flex-start",
          }}
        >
          DELETE
        </button>
      </div>
    </MobileSheet>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderBottom: "1px solid var(--ft-border)" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--ft-text-xs)", letterSpacing: "0.12em", color: "var(--ft-dim)" }}>
        {label}
      </span>
      <span style={{ fontSize: "var(--ft-text-body)", color: "var(--ft-text)", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis" }}>
        {value}
      </span>
    </div>
  );
}

// ── FAB ─────────────────────────────────────────────────────────────

function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Add transaction"
      style={{
        position: "absolute",
        right: 16,
        // Positioned relative to the SPENDING wrapper, which is the
        // nearest position:relative ancestor. The wrapper already sits
        // ABOVE the tab bar (PhoneShell renders the tab bar as a
        // sibling flex item), and the tab bar owns its own safe-area
        // inset via padding. So `bottom: 16` is exactly 16px above
        // the tab bar's top edge — where a FAB belongs.
        //
        // The previous formula included var(--ft-tab-bar-h) AND
        // env(safe-area-inset-bottom), both of which are already
        // accounted for by the tab bar itself. Adding them here
        // pushed the FAB ~80–114px too high, floating mid-screen and
        // occluding day headers (Thomas's SAT 22 AUG report).
        bottom: 16,
        width: FAB_SIZE,
        height: FAB_SIZE,
        borderRadius: FAB_SIZE / 2,
        background: "var(--ft-accent)",
        color: "var(--ft-base)",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 8px 24px rgba(0, 0, 0, 0.24)",
        zIndex: 30,
      }}
    >
      <Plus style={{ width: FAB_ICON_SIZE, height: FAB_ICON_SIZE, strokeWidth: 2.5 }} />
    </button>
  );
}
