import { useMemo, useState } from "react";
import {
  useGetDashboard,
  useListInvestments,
} from "@workspace/api-client-react";

import { useBaseCurrency } from "@/lib/currency-store";
import { useActivePersona } from "@/lib/persona-hook";
import { worthSectionOrder } from "@/lib/persona-emphasis";
import { formatBaseMoney, formatNative } from "@/lib/utils";

import { PhoneEntityRow, deriveTone, deriveTonesForList } from "./PhoneEntityRow";
import { SectionHeader } from "./SectionHeader";
import { PhoneScreenSkeleton } from "./PhoneScreenSkeleton";
import { InsightSlot } from "./InsightSlot";
import { MobileEmptyState } from "@/components/mobile/mobile-ui";
import { PhoneSectionError } from "@/components/mobile/mobile-ui";
import { MobileSheet } from "@/components/mobile-sheet";
import {
  computeHoldings,
  ViewMode,
  ViewTab,
  RingView,
  BandsView,
  BlocksView,
  type BandsMonth,
} from "./CompositionChart";

// WORTH — the balance-sheet tab. What am I worth, across currencies and
// across assets, as a 5-second check.
//
// This screen absorbs four legacy URLs: /accounts, /net-worth, /portfolio,
// /investments. Those are already aliased to the tab in PhoneShell.
//
// Vocabulary is inherited from SPENDING (the previous tab that landed):
// hero + section rhythm + PhoneEntityRow + PhoneSectionError +
// MobileEmptyState + PhoneScreenSkeleton. No second visual language —
// what worked there works here.
//
// ── Design decisions the brief asked me to record ────────────────────
//
// CURRENCY SPLIT — INCLUDE. HOME's currency treatment is a count marker
// ("2 CURRENCIES") that tells the user THERE IS multi-currency exposure
// but not HOW MUCH is in each. WORTH's whole identity is "money in two
// currencies seen as one balance sheet" — the explicit GBP · 84% ·
// £16,808 / MYR · 16% · RM 16,902 breakdown is the visible payoff of
// that promise. It sits above CASH because it FRAMES the sections that
// enumerate the underlying accounts. Compact two lines — no
// visualisation, no ring, no bar — the numbers are the message.
//
// INSIGHT SLOT — INCLUDE. Empty by default (returns null via
// InsightSlot's own contract). The candidate insights for this tab are
// balance-sheet facts, not spending facts: "You hold £2,000 in cash and
// GBP/MYR is 4.8% above its 90-day average — the pound side of your
// cash has more purchasing power than usual than at any point since May."
// That's the FX-allocation observation the brief mentions; it belongs
// here because it's about how the balance sheet is arranged, not how it
// was spent from. Slot lives BELOW the currency split (so the split is
// the raw fact and the slot is the interpretation over the top of it)
// and ABOVE the sections (so it primes the user before they scan rows).
//
// No producers are registered today, so the slot renders nothing — same
// posture as SPENDING when it first landed. This is the correct
// scaffold for the follow-up work.
//
// ── Amendment lines followed (src/index.css:47–94) ───────────────────
//   :74  min 44 tap targets on rows and detail-close
//   :77  primary number 30 via var(--ft-text-primary-num)
//   :78  no dead space — empty state IS labelled as the message
//   :83  every entity row has a glyph — PhoneEntityRow supplies it
//   :88  sign character in the string on the hero delta
//   :90  tabular figures in aligned columns — .pnum via primitives
//   :91  vertical rhythm uniform within a list — SectionHeader per
//        section, PhoneEntityRow per row, no ragged padding
//
// ── Correctness invariants (do NOT relax) ───────────────────────────
// 1. Every base-currency figure uses tx.baseEquivalent / stored-rate
//    numbers. Never client-side FX conversion (the stored-rate work
//    exists so a figure does not drift between reads).
// 2. Investment values move with the market — that is correct. Only
//    transaction base-values are stored-rate; portfolio positions
//    render live baseEquivalent as-supplied.
// 3. FX-unavailable rows render "—" in the base column, never a
//    fabricated 0. Native amount is always honest.
// 4. No hidden or ellipsised financial figures — CLAUDE.md hard
//    constraint: "shown in full or not at all". Rows use PhoneEntityRow
//    which lays out amounts in fixed-width column on the right, so
//    truncation happens on the description text not the number.

interface Account {
  id: number;
  name: string;
  currency: string;
  balance: number;
  baseEquivalent: number | null;
  type: "cash" | "investment" | "pension" | "property" | "other";
}

interface Position {
  id: number;
  ticker: string;
  name: string;
  shares: number;
  costPricePerShare: number;
  currency: string;
  priceAvailable: boolean;
  livePrice: number | null;
  currentValue: number | null;
  baseEquivalent: number | null;
  plBase: number | null;
  plPercent: number | null;
}

type DetailSubject =
  | { kind: "account"; account: Account }
  | { kind: "position"; position: Position };

// Section subtotal — null when ANY contributing row has a null
// baseEquivalent. Same null-propagation shape as the SPENDING month
// spent total: a partial sum is a lie in aggregate.
function sumBase<T>(items: readonly T[], get: (t: T) => number | null): number | null {
  let sum = 0;
  for (const item of items) {
    const v = get(item);
    if (v == null) return null;
    sum += v;
  }
  return sum;
}

// Currency exposure across the whole balance sheet. Groups both
// account balances and investment position values by their DECLARED
// currency (accounts.currency, investments.currency). A GBP-user who
// holds a USD-denominated ETF and a MYR-cash account sees exactly that
// three-currency exposure.
//
// Excludes rows whose baseEquivalent is null — same skip rule as the
// section subtotals. Callers see the resulting `unconvertibleValue`
// count so they can caveat downstream percentages.
interface CurrencyExposureRow {
  currency: string;
  baseValue: number;
  nativeValue: number; // in the row's own currency
}
interface CurrencyExposure {
  rows: CurrencyExposureRow[];
  totalBase: number;
  unconvertibleCount: number;
}

function computeCurrencyExposure(
  accounts: readonly Account[],
  positions: readonly Position[],
): CurrencyExposure {
  const byCurrencyBase = new Map<string, number>();
  const byCurrencyNative = new Map<string, number>();
  let unconvertibleCount = 0;
  let totalBase = 0;

  for (const a of accounts) {
    if (a.baseEquivalent == null) { unconvertibleCount += 1; continue; }
    byCurrencyBase.set(a.currency, (byCurrencyBase.get(a.currency) ?? 0) + a.baseEquivalent);
    byCurrencyNative.set(a.currency, (byCurrencyNative.get(a.currency) ?? 0) + a.balance);
    totalBase += a.baseEquivalent;
  }
  for (const p of positions) {
    if (p.baseEquivalent == null) { unconvertibleCount += 1; continue; }
    byCurrencyBase.set(p.currency, (byCurrencyBase.get(p.currency) ?? 0) + p.baseEquivalent);
    // Position native = currentValue in position's currency. Never
    // shares × cost — that would show the cost basis, not the exposure.
    const nativeValue = p.currentValue ?? 0;
    byCurrencyNative.set(p.currency, (byCurrencyNative.get(p.currency) ?? 0) + nativeValue);
  }

  const rows: CurrencyExposureRow[] = [];
  for (const [currency, baseValue] of byCurrencyBase) {
    rows.push({
      currency,
      baseValue,
      nativeValue: byCurrencyNative.get(currency) ?? 0,
    });
  }
  // Descending by base value — largest exposure reads first.
  rows.sort((a, b) => b.baseValue - a.baseValue);
  return { rows, totalBase, unconvertibleCount };
}

export function WorthScreen() {
  const persona = useActivePersona();
  const baseCurrency = useBaseCurrency();
  const {
    data: dashboard,
    isLoading: dashboardLoading,
    isError: dashboardError,
    refetch: refetchDashboard,
  } = useGetDashboard();
  const {
    data: investments,
    isLoading: investmentsLoading,
    isError: investmentsError,
  } = useListInvestments();

  const isLoading = dashboardLoading || investmentsLoading;
  const isError = dashboardError || investmentsError;

  const accounts: Account[] = useMemo(
    () => (dashboard?.accountBreakdown ?? []) as Account[],
    [dashboard],
  );
  const positions: Position[] = useMemo(
    () => (investments ?? []) as Position[],
    [investments],
  );

  const cashAccounts = useMemo(
    () => accounts.filter((a) => a.type === "cash"),
    [accounts],
  );
  const holdingAccounts = useMemo(
    () => accounts.filter((a) => a.type !== "cash"),
    [accounts],
  );

  // Section subtotals — null if any row inside is unconvertible.
  const cashSubtotal = useMemo(
    () => sumBase(cashAccounts, (a) => a.baseEquivalent),
    [cashAccounts],
  );
  const holdingsSubtotal = useMemo(() => {
    const acctSum = sumBase(holdingAccounts, (a) => a.baseEquivalent);
    const posSum = sumBase(positions, (p) => p.baseEquivalent);
    if (acctSum == null || posSum == null) return null;
    return acctSum + posSum;
  }, [holdingAccounts, positions]);

  const netWorth = dashboard?.netWorth ?? null;
  // MTD delta as proxy for month-to-date net worth change. Same shape
  // as HOME's headline — inherited pattern, not a new claim. Once the
  // per-account snapshots table has 30+ days of history the NW delta
  // can be computed exactly against the start-of-month snapshot rather
  // than proxied via thisMonth.netSavings; today it is a proxy.
  const mtdDelta = dashboard?.thisMonth.netSavings ?? null;
  const priorNw = netWorth != null && mtdDelta != null ? netWorth - mtdDelta : null;
  const mtdPct = priorNw != null && priorNw > 0 && mtdDelta != null
    ? (mtdDelta / priorNw) * 100
    : null;

  const currencyExposure = useMemo(
    () => computeCurrencyExposure(accounts, positions),
    [accounts, positions],
  );

  // Glyph tones — assigned across the whole visible list at once so
  // two accounts with hash-colliding names (e.g. "Wise MYR Jar" and
  // "Maybank Savings" both blue) don't read as a set. See
  // deriveTonesForList in PhoneEntityRow.tsx. Keyed by account.id /
  // position.id so the same tone follows a row across reorders. Order
  // of insertion here mirrors the on-screen order (cash → holdings →
  // positions) so the assigner walks the palette in the order the
  // user's eye does.
  const tonesById = useMemo(() => {
    const orderedIds: string[] = [];
    const orderedLabels: string[] = [];
    for (const a of cashAccounts) { orderedIds.push(`a:${a.id}`); orderedLabels.push(a.name); }
    for (const a of holdingAccounts) { orderedIds.push(`a:${a.id}`); orderedLabels.push(a.name); }
    for (const p of positions) { orderedIds.push(`p:${p.id}`); orderedLabels.push(p.ticker); }
    const tones = deriveTonesForList(orderedLabels);
    const m = new Map<string, string>();
    orderedIds.forEach((id, i) => m.set(id, tones[i]));
    return m;
  }, [cashAccounts, holdingAccounts, positions]);
  const unconvertibleAccounts = dashboard?.unconvertibleAccounts ?? 0;

  const [detailSubject, setDetailSubject] = useState<DetailSubject | null>(null);
  const [chartView, setChartView] = useState<ViewMode>("ring");

  const holdings = useMemo(() => computeHoldings(dashboard), [dashboard]);
  const bandsMonths: BandsMonth[] = useMemo(
    () =>
      (dashboard?.monthlyHistory ?? []).map((m) => ({
        month: m.month,
        composition: m.composition ?? null,
      })),
    [dashboard],
  );

  // ── render branches ────────────────────────────────────────────
  if (isError) {
    return (
      <PhoneSectionError
        label="COULDN'T LOAD"
        title="Your balance sheet didn't load."
        onRetry={() => { void refetchDashboard(); }}
      />
    );
  }
  if (isLoading && !dashboard) {
    return <PhoneScreenSkeleton shape="header-hero-list" rows={6} />;
  }
  if (dashboard != null && accounts.length === 0 && positions.length === 0) {
    return (
      <MobileEmptyState
        scope="screen"
        label="NOTHING TO SHOW"
        title="No accounts or holdings yet."
        description="Connect a bank account or add a holding to see your balance sheet across currencies."
        ctaLabel="Open settings"
        onCta={() => { window.location.hash = ""; window.location.assign("/settings?panel=connections"); }}
      />
    );
  }

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
          background: "var(--ft-base)",
          paddingBottom: 24,
        }}
      >
        <WorthHero
          netWorth={netWorth}
          mtdDelta={mtdDelta}
          mtdPct={mtdPct}
          unconvertibleAccounts={unconvertibleAccounts}
          loading={isLoading && netWorth == null}
        />

        {/* ── Composition chart ─────────────────────────────────────────── */}
        <div style={{ padding: "0 16px 16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              minHeight: 44,
              borderBottomWidth: 1,
              borderBottomStyle: "solid",
              borderBottomColor: "var(--ft-border)",
              marginBottom: 12,
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.14em",
                color: "var(--ft-dim)",
              }}
            >
              COMPOSITION
            </span>
            <div style={{ display: "flex", gap: 4 }}>
              <ViewTab label="RING" active={chartView === "ring"} onClick={() => setChartView("ring")} />
              <ViewTab label="BANDS" active={chartView === "bands"} onClick={() => setChartView("bands")} />
              <ViewTab label="BLOCKS" active={chartView === "blocks"} onClick={() => setChartView("blocks")} />
            </div>
          </div>
          {chartView === "ring" && <RingView holdings={holdings} />}
          {chartView === "bands" && <BandsView months={bandsMonths} />}
          {chartView === "blocks" && <BlocksView holdings={holdings} />}
        </div>

        {currencyExposure.rows.length >= 2 && (
          <CurrencySplit exposure={currencyExposure} baseCurrency={baseCurrency} />
        )}

        <InsightSlot insight={null} onDismiss={() => { /* no producers yet */ }} />

        {/* Persona ordering (lib/persona-emphasis.ts): a markets persona
            reads HOLDINGS first, everyone else CASH first. Same two
            sections either way — order is the only thing that changes. */}
        {worthSectionOrder(persona).map((section) =>
          section === "cash" ? (
            cashAccounts.length > 0 && (
              <AccountSection
                key="cash"
                label="CASH"
                subtotal={cashSubtotal}
                accounts={cashAccounts}
                baseCurrency={baseCurrency}
                tonesById={tonesById}
                onTap={(a) => setDetailSubject({ kind: "account", account: a })}
              />
            )
          ) : (
            (holdingAccounts.length > 0 || positions.length > 0) && (
              <HoldingsSection
                key="holdings"
                subtotal={holdingsSubtotal}
                accounts={holdingAccounts}
                positions={positions}
                baseCurrency={baseCurrency}
                tonesById={tonesById}
                onTapAccount={(a) => setDetailSubject({ kind: "account", account: a })}
                onTapPosition={(p) => setDetailSubject({ kind: "position", position: p })}
              />
            )
          ),
        )}
      </div>

      {detailSubject && (
        <DetailSheet
          subject={detailSubject}
          baseCurrency={baseCurrency}
          onClose={() => setDetailSubject(null)}
        />
      )}
    </div>
  );
}

// ── hero ────────────────────────────────────────────────────────────

function WorthHero({
  netWorth,
  mtdDelta,
  mtdPct,
  unconvertibleAccounts,
  loading,
}: {
  netWorth: number | null;
  mtdDelta: number | null;
  mtdPct: number | null;
  unconvertibleAccounts: number;
  loading: boolean;
}) {
  const value = netWorth != null ? formatBaseMoney(netWorth) : (loading ? "…" : "—");

  const now = new Date();
  const monthShort = now.toLocaleString(undefined, { month: "short" });
  // First-of-current-month for the delta label — matches HOME's shape
  // ("since 1 Aug") so the two hero devices read as siblings.
  const startOfMonthLabel = `since 1 ${monthShort}`;
  // On the 1st of the month the "since 1 <month>" window is at most 24
  // hours wide, and the proxy that supplies mtdDelta (dashboard.thisMonth.
  // netSavings) has known day-1 uncertainty — a zero reads as
  // "no change so far this month" but is really "the reference point IS
  // right now". Same failure class as the +0.00% Investments row already
  // removed. Falling back to "since 1 <last month>" is rejected: it
  // would show a different metric under the same label (MTD vs
  // month-over-month), which is more dishonest than showing —. The dash
  // resolves on the 2nd, when there's a genuine day-vs-yesterday
  // comparison available.
  const isFirstOfMonth = now.getDate() === 1;

  let deltaLine: React.ReactNode = null;
  if (!isFirstOfMonth && mtdDelta != null && mtdPct != null) {
    const positive = mtdDelta >= 0;
    const sign = positive ? "+" : "−";
    const colour = positive ? "var(--ft-green)" : "var(--ft-red)";
    deltaLine = (
      <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: colour }}>
        {sign}{formatBaseMoney(Math.abs(mtdDelta))} · {sign}{Math.abs(mtdPct).toFixed(2)}% {startOfMonthLabel}
      </span>
    );
  } else if (netWorth != null) {
    deltaLine = (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}>
        — {startOfMonthLabel}
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
        NET WORTH
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
      {unconvertibleAccounts > 0 && (
        <div
          style={{
            marginTop: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--ft-amber)",
            letterSpacing: "0.06em",
          }}
        >
          {unconvertibleAccounts} account{unconvertibleAccounts !== 1 ? "s" : ""} without FX — not in total
        </div>
      )}
    </div>
  );
}

// ── currency split ──────────────────────────────────────────────────

function CurrencySplit({ exposure, baseCurrency }: { exposure: CurrencyExposure; baseCurrency: string | null }) {
  // Only render currencies materially large enough to matter — sub-1%
  // exposures are noise on a phone. Below-threshold currencies still
  // contribute to totalBase; they're just not enumerated.
  const total = exposure.totalBase;
  const materialRows = exposure.rows.filter(
    (r) => total > 0 && (r.baseValue / total) * 100 >= 0.5,
  );
  if (materialRows.length < 2) return null;

  return (
    <div>
      <SectionHeader label="BY CURRENCY" />
      <div style={{ padding: "6px 16px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
      {materialRows.map((row) => {
        const pct = (row.baseValue / total) * 100;
        return (
          <div
            key={row.currency}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              fontFamily: "var(--font-mono)",
              fontSize: 13,
              color: "var(--ft-text)",
            }}
          >
            <span style={{ minWidth: 42, letterSpacing: "0.04em" }}>{row.currency}</span>
            <span
              className="pnum"
              style={{ minWidth: 48, color: "var(--ft-muted)" }}
            >
              {pct.toFixed(0)}%
            </span>
            <span className="pnum" style={{ flex: 1, textAlign: "right" }}>
              {formatBaseMoney(row.baseValue)}
            </span>
            {/*
              Blank the native column when the row IS the base currency —
              otherwise the base row prints its value twice (£16,808.17
              then 16,808.17 GBP). Same pattern the account rows already
              use in AccountRow. Reserve the width via visibility:hidden
              so all rows stay in the same column grid.
            */}
            <span
              className="pnum"
              style={{
                minWidth: 96,
                textAlign: "right",
                color: "var(--ft-muted)",
                fontSize: 12,
                visibility: row.currency === baseCurrency ? "hidden" : "visible",
              }}
            >
              {formatNative(row.nativeValue, row.currency)}
            </span>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── sections ────────────────────────────────────────────────────────

function SubtotalPill({ subtotal }: { subtotal: number | null }) {
  return (
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
      {subtotal != null ? formatBaseMoney(subtotal) : "—"}
    </span>
  );
}

function AccountSection({
  label,
  subtotal,
  accounts,
  baseCurrency,
  tonesById,
  onTap,
}: {
  label: string;
  subtotal: number | null;
  accounts: readonly Account[];
  baseCurrency: string | null;
  tonesById: Map<string, string>;
  onTap: (a: Account) => void;
}) {
  return (
    <div>
      <SectionHeader label={label} right={<SubtotalPill subtotal={subtotal} />} />
      {accounts.map((a, i) => (
        <AccountRow
          key={a.id}
          account={a}
          baseCurrency={baseCurrency}
          tone={tonesById.get(`a:${a.id}`)}
          isLast={i === accounts.length - 1}
          onTap={() => onTap(a)}
        />
      ))}
    </div>
  );
}

function HoldingsSection({
  subtotal,
  accounts,
  positions,
  baseCurrency,
  tonesById,
  onTapAccount,
  onTapPosition,
}: {
  subtotal: number | null;
  accounts: readonly Account[];
  positions: readonly Position[];
  baseCurrency: string | null;
  tonesById: Map<string, string>;
  onTapAccount: (a: Account) => void;
  onTapPosition: (p: Position) => void;
}) {
  // Order: non-cash accounts first (pension, property, other investment
  // accounts), then per-position rows underneath. An account is a
  // container; a position is a line item — reading containers first
  // then their contents matches how a paper statement composes.
  const totalRows = accounts.length + positions.length;
  let rowIdx = 0;
  return (
    <div>
      <SectionHeader label="HOLDINGS" right={<SubtotalPill subtotal={subtotal} />} />
      {accounts.map((a) => {
        const isLast = ++rowIdx === totalRows;
        return (
          <AccountRow
            key={`a-${a.id}`}
            account={a}
            baseCurrency={baseCurrency}
            tone={tonesById.get(`a:${a.id}`)}
            isLast={isLast}
            onTap={() => onTapAccount(a)}
          />
        );
      })}
      {positions.map((p) => {
        const isLast = ++rowIdx === totalRows;
        return (
          <PositionRow
            key={`p-${p.id}`}
            position={p}
            baseCurrency={baseCurrency}
            tone={tonesById.get(`p:${p.id}`)}
            isLast={isLast}
            onTap={() => onTapPosition(p)}
          />
        );
      })}
    </div>
  );
}

// ── rows ────────────────────────────────────────────────────────────

function AccountRow({
  account,
  baseCurrency,
  tone,
  isLast,
  onTap,
}: {
  account: Account;
  baseCurrency: string | null;
  tone?: string;
  isLast: boolean;
  onTap: () => void;
}) {
  const baseStr = account.baseEquivalent != null
    ? formatBaseMoney(account.baseEquivalent)
    : "—";
  // Native line only when the account's currency differs from base —
  // "£412.00 / £412.00" is noise. Amount is always the account's own
  // native balance so a Malaysian user's Maybank row shows the actual
  // ringgit number they'd expect to see. When baseCurrency has not yet
  // resolved (null), suppress the native line — we cannot compare so
  // we don't fake the answer either way.
  const nativeStr = baseCurrency != null && account.currency !== baseCurrency
    ? formatNative(account.balance, account.currency)
    : undefined;
  // Secondary line: skip when it would just restate the section header
  // above. CASH accounts already sit under a "CASH" header, and
  // "investment" holding accounts already sit under a "HOLDINGS"
  // header — the SPENDING fix that dropped "Monzo Current" beneath
  // every row was the same class. Non-investment holdings
  // (pension, property, etc.) still carry information the header
  // does not — they stay.
  const REDUNDANT_TYPES: ReadonlySet<string> = new Set(["cash", "investment"]);
  const secondary = REDUNDANT_TYPES.has(account.type)
    ? undefined
    : account.type.toUpperCase();

  return (
    <PhoneEntityRow
      primary={account.name}
      secondary={secondary}
      identity={{ tone: tone ?? deriveTone(account.name) }}
      amount={{
        value: baseStr,
        native: nativeStr,
      }}
      onTap={onTap}
      isLast={isLast}
    />
  );
}

function PositionRow({
  position,
  baseCurrency,
  tone,
  isLast,
  onTap,
}: {
  position: Position;
  baseCurrency: string | null;
  tone?: string;
  isLast: boolean;
  onTap: () => void;
}) {
  const baseStr = position.baseEquivalent != null
    ? formatBaseMoney(position.baseEquivalent)
    : "—";
  const nativeStr = baseCurrency != null && position.currency !== baseCurrency && position.currentValue != null
    ? formatNative(position.currentValue, position.currency)
    : undefined;

  // Ticker as glyph label — deterministic, readable at 38px. Slice to
  // 4 chars so longer venue-qualified symbols (e.g. "MSFT.LON") still
  // fit the box.
  const glyphLabel = position.ticker.slice(0, 4).toUpperCase();
  const secondary = `${position.ticker} · ${position.shares} share${position.shares === 1 ? "" : "s"}`;

  return (
    <PhoneEntityRow
      primary={position.name}
      secondary={secondary}
      identity={{ label: glyphLabel, tone: "var(--ft-blue)" }}
      amount={{
        value: baseStr,
        native: nativeStr,
      }}
      onTap={onTap}
      isLast={isLast}
    />
  );
}

// ── detail sheet ────────────────────────────────────────────────────

function DetailSheet({
  subject,
  baseCurrency,
  onClose,
}: {
  subject: DetailSubject;
  baseCurrency: string | null;
  onClose: () => void;
}) {
  const title = subject.kind === "account" ? "Account" : "Position";
  return (
    <MobileSheet
      open={true}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={title}
    >
      <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {subject.kind === "account"
          ? <AccountDetail account={subject.account} baseCurrency={baseCurrency} />
          : <PositionDetail position={subject.position} baseCurrency={baseCurrency} />}
      </div>
    </MobileSheet>
  );
}

function AccountDetail({ account, baseCurrency }: { account: Account; baseCurrency: string | null }) {
  const baseStr = account.baseEquivalent != null
    ? formatBaseMoney(account.baseEquivalent)
    : "—";
  const nativeStr = formatNative(account.balance, account.currency);
  const sameCurrency = baseCurrency != null && account.currency === baseCurrency;
  return (
    <>
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-xs)",
            letterSpacing: "0.16em",
            color: "var(--ft-dim)",
          }}
        >
          {account.type.toUpperCase()}
        </div>
        <div
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 26,
            fontWeight: 700,
            lineHeight: "30px",
            letterSpacing: "-0.02em",
            color: "var(--ft-text)",
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
        <DetailRow label="NAME" value={account.name} />
        <DetailRow label="CURRENCY" value={account.currency} />
        <DetailRow label="TYPE" value={account.type} />
      </div>
    </>
  );
}

function PositionDetail({ position, baseCurrency }: { position: Position; baseCurrency: string | null }) {
  const baseStr = position.baseEquivalent != null
    ? formatBaseMoney(position.baseEquivalent)
    : "—";
  const nativeStr = position.currentValue != null
    ? formatNative(position.currentValue, position.currency)
    : "—";
  const sameCurrency = baseCurrency != null && position.currency === baseCurrency;
  // P&L colour is additive to the sign character (Amendment :88) — the
  // "+" / "−" prefix already carries the direction; hue reinforces.
  const plColour = position.plBase == null
    ? "var(--ft-dim)"
    : position.plBase >= 0 ? "var(--ft-green)" : "var(--ft-red)";
  const plStr = position.plBase == null
    ? "—"
    : `${position.plBase >= 0 ? "+" : "−"}${formatBaseMoney(Math.abs(position.plBase))}`;
  const plPctStr = position.plPercent == null
    ? "—"
    : `${position.plPercent >= 0 ? "+" : "−"}${Math.abs(position.plPercent).toFixed(2)}%`;

  return (
    <>
      <div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-xs)",
            letterSpacing: "0.16em",
            color: "var(--ft-dim)",
          }}
        >
          {position.ticker}
        </div>
        <div
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 26,
            fontWeight: 700,
            lineHeight: "30px",
            letterSpacing: "-0.02em",
            color: "var(--ft-text)",
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
        <DetailRow label="NAME" value={position.name} />
        <DetailRow label="SHARES" value={String(position.shares)} />
        <DetailRow
          label="P&L"
          value={`${plStr} · ${plPctStr}`}
          valueColour={plColour}
        />
        <DetailRow label="CURRENCY" value={position.currency} />
      </div>
    </>
  );
}

function DetailRow({
  label,
  value,
  valueColour,
}: {
  label: string;
  value: string;
  valueColour?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: "1px solid var(--ft-border)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--ft-text-xs)",
          letterSpacing: "0.12em",
          color: "var(--ft-dim)",
        }}
      >
        {label}
      </span>
      {/*
        No .pnum class here — DetailRow values are isolated
        label:value pairs, not a column of numbers requiring tabular
        alignment across rows. Half are non-financial labels (name,
        currency, type). And no overflow:hidden / textOverflow —
        CLAUDE.md's "shown in full or not at all" rule: a truncated
        £11,371 that reads as £1… is the worst class of defect a
        finance app can ship. If a value is genuinely too long, the
        sheet wraps rather than crops.
      */}
      <span
        style={{
          fontSize: "var(--ft-text-body)",
          color: valueColour ?? "var(--ft-text)",
          textAlign: "right",
          minWidth: 0,
          wordBreak: "break-word",
        }}
      >
        {value}
      </span>
    </div>
  );
}
