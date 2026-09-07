import { useEffect, useMemo, useRef, useState } from "react";
import { useIsFetching } from "@tanstack/react-query";
import {
  useGetAccountsReconciliation,
  useGetDashboard,
  useListTransactions,
  useListUpcoming,
} from "@workspace/api-client-react";
import { ZERO_TOLERANCE } from "@/lib/reconciliation-insight";
import { loadDismissedIds, selectInsight } from "@/lib/spending-insights";
import type { CompanionSignals } from "@/lib/companion/signals";

// The producer for CompanionSignals — the only place the companion touches
// the app's data. Everything downstream of here is pure.
//
// Every query below is one the app already runs with the same key, so this
// hook is a set of cache reads rather than a set of requests. It is mounted
// once, next to the assistant.

/** How long the companion stays on "income landed" before settling. */
const INCOME_ACK_MS = 6000;

/**
 * True while the user is actually typing in a search field.
 *
 * The two search surfaces (global search, command palette) each keep their
 * query in local state inside the rendered dialog, and both `useGlobalSearch`
 * and `useCommandPalette` are plain `useState` hooks rather than contexts —
 * so a second caller would get its own unshared `open`, not theirs. Reading
 * the focused field is the honest signal available without lifting state out
 * of two components, and it has the advantage of being true for any search
 * field, not just those two. The `data-search-field` attribute marks them.
 */
export function useSearchingField(): boolean {
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    const read = () => {
      const el = document.activeElement as HTMLInputElement | null;
      setSearching(
        el != null &&
          el.matches?.("[data-search-field]") === true &&
          el.value.trim().length > 0,
      );
    };
    document.addEventListener("input", read);
    document.addEventListener("focusin", read);
    document.addEventListener("focusout", read);
    return () => {
      document.removeEventListener("input", read);
      document.removeEventListener("focusin", read);
      document.removeEventListener("focusout", read);
    };
  }, []);
  return searching;
}

export function useCompanionSignals(searching: boolean): CompanionSignals {
  const { data: reconciliation } = useGetAccountsReconciliation();
  const { data: dashboard } = useGetDashboard();
  const { data: txs } = useListTransactions();
  const { data: upcomingItems = [] } = useListUpcoming();

  // ── Reconciliation gap ──────────────────────────────────────────────────
  // Three states, kept apart on purpose. `null` is "the app has not been
  // able to work it out"; 0 is a measured zero. Collapsing them would let
  // the companion fall asleep on books nobody has checked.
  const reconciliationGap = useMemo<number | null>(() => {
    if (reconciliation == null) return null;
    if (reconciliation.status !== "ok") return null;
    const gap = reconciliation.gapBase;
    if (gap == null) return null;
    return Math.abs(gap) < ZERO_TOLERANCE ? 0 : gap;
  }, [reconciliation]);

  // ── An insight nobody has read ──────────────────────────────────────────
  // Dismissal is the only "seen" signal the app records, so that is what
  // this reads. There is no opened-but-not-dismissed state anywhere.
  const dismissed = useMemo(() => loadDismissedIds(), []);
  const unreadInsight = useMemo(() => {
    if (txs == null || dashboard == null) return false;
    return (
      selectInsight(
        txs,
        {
          baseCurrency: dashboard.baseCurrency ?? null,
          upcomingItems,
          topPending: dashboard.owing?.topPending ?? [],
          cashBalanceBase: null,
          historyTxs: txs,
        },
        dismissed,
      ) !== null
    );
  }, [txs, dashboard, upcomingItems, dismissed]);

  // ── A sync in flight ────────────────────────────────────────────────────
  const syncing = useIsFetching() > 0;

  // ── Income landing ──────────────────────────────────────────────────────
  // Direction lives in `type`, not in the sign of the amount — the amounts
  // are unsigned. The first resolve seeds the marker WITHOUT firing, so the
  // companion does not celebrate every page load as fresh income.
  const latestIncome = useMemo(() => {
    if (txs == null) return null;
    let best: { id: number; at: string } | null = null;
    for (const t of txs) {
      if (t.type !== "income") continue;
      // createdAt is when the row reached the app, which is what "landed"
      // means here. `date` is when the money moved, and a backdated entry
      // is not news.
      if (best == null || t.createdAt > best.at) best = { id: t.id, at: t.createdAt };
    }
    return best;
  }, [txs]);

  const seenRef = useRef<number | null>(null);
  const seededRef = useRef(false);
  const [incomeLanded, setIncomeLanded] = useState(false);

  useEffect(() => {
    if (latestIncome == null) return;
    if (!seededRef.current) {
      seededRef.current = true;
      seenRef.current = latestIncome.id;
      return;
    }
    if (seenRef.current === latestIncome.id) return;
    seenRef.current = latestIncome.id;
    setIncomeLanded(true);
    const t = window.setTimeout(() => setIncomeLanded(false), INCOME_ACK_MS);
    return () => window.clearTimeout(t);
  }, [latestIncome]);

  return { reconciliationGap, unreadInsight, syncing, searching, incomeLanded };
}
