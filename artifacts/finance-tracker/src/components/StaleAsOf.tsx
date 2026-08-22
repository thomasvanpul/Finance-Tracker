// Timestamp badge for cached data — the reader half of the offline
// read-path invariant.
//
// ── The rule this component exists to enforce ───────────────────────────────
// Cached data must never be presented as live. When a query is served
// from IndexedDB (offline, cold reload) or is past its fresh window,
// the widget shows this badge with the ORIGINAL fetch time — the
// TanStack Query `dataUpdatedAt`. That value is never re-stamped: a
// 12-min-old figure labelled "just now" is the same class of defect
// as the fabricated £0 the FX-null work removed. See
// [[feedback_design_not_vibe_coded]] and the stale-serve pattern in
// lib/market.ts for the full argument.
//
// ── Usage ───────────────────────────────────────────────────────────────────
//   const q = useGetDashboard();
//   const dataUpdatedAt = q.dataUpdatedAt;   // TanStack Query field
//   // ... render q.data ...
//   <StaleAsOf ts={dataUpdatedAt} isFresh={!q.isStale} />
//
// isFresh=true suppresses the badge; only stale / offline data is
// marked. Passing a `label` prop overrides the default "AS OF" prefix
// for widgets that want a shorter form (e.g. compact mobile cards).
//
// The badge itself uses the dotted-hint token so it visually pairs
// with the "not-yet-real" treatment established in the mobile design
// language. Reuse rather than invent.

import { useMemo } from "react";

interface StaleAsOfProps {
  // Milliseconds since epoch — TanStack Query's dataUpdatedAt. If 0 or
  // undefined (never fetched), the badge shows "NEVER FETCHED" so the
  // user understands why a page is blank rather than assuming it's
  // just loading. Fresh installs on a plane are the case that produces
  // this — no cache row exists on this device.
  ts: number | undefined | null;
  // When true, hide the badge entirely — the data is inside its fresh
  // window and the timestamp isn't UX-relevant. Callers pass
  // `!query.isStale` (or a stricter check) here.
  isFresh?: boolean;
  // Override "AS OF" — some widgets use "UPDATED" or a symbol.
  label?: string;
  // Tighter styling for compact widgets. Defaults to standard.
  compact?: boolean;
}

// Format an ISO-ish timestamp in a compact "AS OF" phrase. Rules:
//   - Same day → "AS OF 15:12"
//   - Yesterday → "AS OF YESTERDAY 15:12"
//   - Older → "AS OF AUG 20, 15:12"
// The time is local — a user on a plane cares about their wall clock.
function formatAsOf(ts: number): string {
  const now = new Date();
  const then = new Date(ts);
  const nowDate = now.toISOString().slice(0, 10);
  const thenDate = then.toISOString().slice(0, 10);

  const hh = String(then.getHours()).padStart(2, "0");
  const mm = String(then.getMinutes()).padStart(2, "0");
  const time = `${hh}:${mm}`;

  if (nowDate === thenDate) return time;

  // Yesterday: subtract one day from now in ms, compare date parts.
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const yesterdayDate = yesterday.toISOString().slice(0, 10);
  if (yesterdayDate === thenDate) return `YESTERDAY ${time}`;

  const month = then.toLocaleString("en-GB", { month: "short" }).toUpperCase();
  const day = then.getDate();
  return `${month} ${day}, ${time}`;
}

export function StaleAsOf({ ts, isFresh, label = "AS OF", compact = false }: StaleAsOfProps) {
  const formatted = useMemo(() => {
    if (!ts) return null;
    return formatAsOf(ts);
  }, [ts]);

  if (isFresh) return null;

  const isEmpty = !ts;
  const text = isEmpty ? "NEVER FETCHED" : `${label} ${formatted}`;

  return (
    <span
      // Dotted-hint chrome pairs with the "not-yet-real" mobile design
      // language. Colour token stays --ft-dim so this recedes visually
      // — it's a caveat, not a headline.
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: compact ? 8 : 9,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: "var(--ft-dim)",
        borderBottom: "1px dotted var(--ft-dim)",
        paddingBottom: 1,
        display: "inline-block",
      }}
      title={ts ? new Date(ts).toISOString() : "no cached data on this device"}
    >
      {text}
    </span>
  );
}
