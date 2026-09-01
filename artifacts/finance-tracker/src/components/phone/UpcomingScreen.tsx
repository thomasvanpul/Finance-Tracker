import { useMemo, useState } from "react";
import {
  useListUpcoming,
  useGetUpcomingSummary,
  usePayUpcomingItem,
  useDeleteUpcomingItem,
  getListUpcomingQueryKey,
  getGetUpcomingSummaryQueryKey,
  type UpcomingItem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

import { useBaseCurrency } from "@/lib/currency-store";
import { formatBaseMoney, formatNative } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import { useSwipeDelete } from "@/hooks/use-swipe-delete";

import { PhoneEntityRow, deriveTone } from "./PhoneEntityRow";
import { SectionHeader } from "./SectionHeader";
import { PhoneScreenSkeleton } from "./PhoneScreenSkeleton";
import { MobileEmptyState } from "@/components/mobile/mobile-ui";
import { PhoneSectionError } from "@/components/mobile/mobile-ui";

// UPCOMING — the fifth tab. What is coming and what does it cost.
//
// This screen absorbs three legacy URLs: /recurring, /subscriptions, /calendar.
// Those are already aliased to the tab in PhoneShell.
//
// Structure (from the task brief):
//   HERO: committed outgoings over the next 30 days in base currency.
//   Under hero: expected income over the same window, subordinate.
//   LIST: grouped by week, nearest first. Each row shows description,
//         due date, and amount. Foreign-currency rows show native beneath.
//   LENSES: RECURRING and SUBSCRIPTIONS as filter segments, not routes.
//
// Vocabulary inherited from SPENDING and WORTH: same hero treatment,
// same section rhythm, same PhoneEntityRow and SectionHeader primitives.
//
// FX note: base equivalents are computed live by the server on each read
// (toBase() in enrichUpcoming). This is correct — upcoming items are future
// obligations whose value should reflect the rate in effect when they land.
// No stored-rate is available for these rows, so null baseEquivalent is
// rendered as "—" in the base column per the CLAUDE.md hard constraint.

// ─── Utilities ──────────────────────────────────────────────────────────────

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Returns the Monday of the week containing `iso` (YYYY-MM-DD).
function weekStart(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  const day = d.getUTCDay(); // 0=Sun
  const offset = day === 0 ? -6 : 1 - day;
  return ymd(addDays(d, offset));
}

// "this week", "next week", "3 Oct – 9 Oct", …
function weekLabel(mondayIso: string, now: Date): string {
  const thisMonday = weekStart(ymd(now));
  const nextMonday = ymd(addDays(new Date(thisMonday + "T00:00:00Z"), 7));
  if (mondayIso === thisMonday) return "This week";
  if (mondayIso === nextMonday) return "Next week";
  const start = new Date(mondayIso + "T00:00:00Z");
  const end = addDays(start, 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

// "Mon 8 Sep", "Fri 1 Oct"
function rowDateLabel(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: "UTC",
  });
}

// Days from now (positive = future, negative = overdue).
function daysUntil(iso: string, now: Date): number {
  const due = new Date(iso + "T00:00:00Z");
  const today = new Date(ymd(now) + "T00:00:00Z");
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

// ─── Types ──────────────────────────────────────────────────────────────────

type Lens = "all" | "recurring" | "subscriptions";

const SUBSCRIPTION_CATEGORIES = new Set([
  "Subscriptions", "subscriptions", "streaming", "software",
]);

const RECURRING_FREQUENCIES = new Set(["weekly", "monthly", "quarterly", "yearly"]);

interface WeekGroup {
  monday: string;
  label: string;
  items: UpcomingItem[];
}

// ─── Data grouping ──────────────────────────────────────────────────────────

function filterItems(items: readonly UpcomingItem[], lens: Lens): UpcomingItem[] {
  if (lens === "subscriptions") {
    return items.filter(i => SUBSCRIPTION_CATEGORIES.has(i.category));
  }
  if (lens === "recurring") {
    return items.filter(i => RECURRING_FREQUENCIES.has(i.frequency));
  }
  return items as UpcomingItem[];
}

function groupByWeek(items: readonly UpcomingItem[], now: Date): WeekGroup[] {
  const map = new Map<string, UpcomingItem[]>();
  for (const item of items) {
    const mon = weekStart(item.dueDate);
    const existing = map.get(mon);
    if (existing) existing.push(item);
    else map.set(mon, [item]);
  }
  const sorted = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  return sorted.map(([monday, groupItems]) => ({
    monday,
    label: weekLabel(monday, now),
    items: groupItems,
  }));
}

// ─── Hero ────────────────────────────────────────────────────────────────────

interface HeroProps {
  outgoings: number | null;
  income: number | null;
  loading: boolean;
}

function UpcomingHero({ outgoings, income, loading }: HeroProps) {
  return (
    <div
      style={{
        padding: "20px 16px 16px",
        borderBottom: "1px solid var(--ft-border)",
        background: "var(--ft-base)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--ft-text-xs)",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--ft-muted)",
          marginBottom: 6,
        }}
      >
        COMMITTED · NEXT 30 DAYS
      </div>

      {loading ? (
        <div style={{ height: 40, background: "var(--ft-raised)", borderRadius: 6, width: 160 }} />
      ) : (
        <div
          className="pnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-primary-num)",
            fontWeight: 700,
            color: outgoings != null ? "var(--ft-red)" : "var(--ft-muted)",
            letterSpacing: "-0.01em",
          }}
        >
          {outgoings != null ? `−${formatBaseMoney(outgoings)}` : "—"}
        </div>
      )}

      {/* Expected income — subordinate line */}
      {!loading && income != null && income > 0 && (
        <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--ft-text-xs)",
              color: "var(--ft-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            +{formatBaseMoney(income)} income
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Lens strip ──────────────────────────────────────────────────────────────

function LensStrip({ active, onChange }: { active: Lens; onChange: (l: Lens) => void }) {
  const lenses: { key: Lens; label: string }[] = [
    { key: "all", label: "ALL" },
    { key: "recurring", label: "RECURRING" },
    { key: "subscriptions", label: "SUBSCRIPTIONS" },
  ];
  return (
    <div
      style={{
        display: "flex",
        gap: 0,
        borderBottom: "1px solid var(--ft-border)",
        background: "var(--ft-raised)",
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {lenses.map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          style={{
            flex: "0 0 auto",
            padding: "8px 14px",
            background: "none",
            border: "none",
            borderBottom: active === key ? "2px solid var(--ft-accent)" : "2px solid transparent",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-xs)",
            fontWeight: 600,
            letterSpacing: "0.08em",
            color: active === key ? "var(--ft-text)" : "var(--ft-muted)",
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  item: UpcomingItem;
  isLast: boolean;
  baseCurrency: string | null;
  now: Date;
  onPay: (id: number) => void;
  onDelete: (id: number) => void;
}

function UpcomingRow({ item, isLast, baseCurrency, now, onPay, onDelete }: RowProps) {
  const swipe = useSwipeDelete(() => onDelete(item.id));

  const days = daysUntil(item.dueDate, now);
  const dateLabel = rowDateLabel(item.dueDate);

  // secondary: date + overdue label if past
  const secondary = days < 0
    ? `${dateLabel} · OVERDUE ${Math.abs(days)}d`
    : dateLabel;

  const nativeStr = formatNative(item.nativeAmount, item.currency);
  const baseStr = item.baseEquivalent != null
    ? formatBaseMoney(item.baseEquivalent)
    : null;

  // income items use base for primary, expense items use base (with native below).
  // If base is unavailable, fall back to native as primary.
  const isIncome = item.type === "income";
  const primaryAmount = baseStr
    ? (isIncome ? `+${baseStr}` : baseStr)
    : (isIncome ? `+${nativeStr}` : nativeStr);
  const nativeBelow = baseStr && item.currency !== baseCurrency ? nativeStr : undefined;

  const amountTone = isIncome
    ? "var(--ft-accent)"
    : days < 0
      ? "var(--ft-red)"
      : "var(--ft-text)";

  return (
    <div {...swipe.touchHandlers} style={{ position: "relative" }}>
      <PhoneEntityRow
        primary={item.description}
        secondary={secondary}
        identity={{ tone: deriveTone(item.category) }}
        amount={{
          value: primaryAmount,
          tone: amountTone,
          native: nativeBelow,
        }}
        isLast={isLast}
        onTap={() => onPay(item.id)}
      />
    </div>
  );
}

// ─── Main screen ────────────────────────────────────────────────────────────

export function UpcomingScreen() {
  const baseCurrency = useBaseCurrency();
  const qc = useQueryClient();
  const { toast } = useToast();
  const now = useMemo(() => new Date(), []);

  const [lens, setLens] = useState<Lens>("all");

  const {
    data: items,
    isLoading: itemsLoading,
    isError: itemsError,
  } = useListUpcoming();

  const {
    data: summary,
    isLoading: summaryLoading,
  } = useGetUpcomingSummary();

  const payMutation = usePayUpcomingItem();
  const deleteMutation = useDeleteUpcomingItem();

  function handlePay(id: number) {
    payMutation.mutate({ id }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListUpcomingQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetUpcomingSummaryQueryKey() });
        haptic.medium();
        toast({ description: "Marked as paid and logged to transactions." });
      },
      onError: () => {
        toast({ description: "Could not mark as paid. Try again.", variant: "destructive" });
      },
    });
  }

  function handleDelete(id: number) {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListUpcomingQueryKey() });
        void qc.invalidateQueries({ queryKey: getGetUpcomingSummaryQueryKey() });
        haptic.light();
      },
      onError: () => {
        toast({ description: "Could not delete item. Try again.", variant: "destructive" });
      },
    });
  }

  const pendingItems = useMemo(
    () => (items ?? []).filter(i => i.status === "pending"),
    [items],
  );

  const filteredItems = useMemo(
    () => filterItems(pendingItems, lens),
    [pendingItems, lens],
  );

  const weekGroups = useMemo(
    () => groupByWeek(filteredItems, now),
    [filteredItems, now],
  );

  const heroLoading = itemsLoading || summaryLoading;

  if (itemsLoading && !items) {
    return <PhoneScreenSkeleton shape="header-hero-list" />;
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <UpcomingHero
        outgoings={summary?.committedOutgoings30d ?? null}
        income={summary?.expectedIncome30d ?? null}
        loading={heroLoading}
      />

      <LensStrip active={lens} onChange={setLens} />

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {itemsError ? (
          <PhoneSectionError
            label="COULDN'T LOAD"
            title="Could not load upcoming items."
          />
        ) : filteredItems.length === 0 ? (
          <MobileEmptyState
            scope="screen"
            label="NOTHING UPCOMING"
            title={
              lens === "subscriptions"
                ? "No subscriptions due soon."
                : lens === "recurring"
                  ? "No recurring items due soon."
                  : "Nothing upcoming."
            }
            description={
              lens === "subscriptions"
                ? "Subscriptions due in the next 45 days appear here."
                : lens === "recurring"
                  ? "Recurring items due in the next 45 days appear here."
                  : "Tap + to add a bill, subscription, or income item."
            }
            ctaLabel="Add item"
            onCta={() => {}}
          />
        ) : (
          weekGroups.map((group) => (
            <div key={group.monday}>
              <SectionHeader label={group.label} />
              {group.items.map((item, idx) => (
                <UpcomingRow
                  key={item.id}
                  item={item}
                  isLast={idx === group.items.length - 1}
                  baseCurrency={baseCurrency}
                  now={now}
                  onPay={handlePay}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
