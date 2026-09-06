// Provenance mark for a value that is an ECB daily reference fixing
// rather than a live quote.
//
// ── Why this exists ─────────────────────────────────────────────────────────
// The forex quote lane falls through to Frankfurter when Yahoo is
// throttled and Twelve Data's breaker is open. Frankfurter serves the
// ECB euro foreign exchange reference rate: one fixing per TARGET
// working day, published around 16:00 Europe/Brussels. It is a real,
// citable number — but it is not live, and on a Sunday it is Friday's.
//
// Rendered next to live Yahoo tiles with no mark, a fixing reads as a
// live rate. That is the same failure as the fabricated balances the
// MOCK_* sweep removed: a number that renders identically to a real one
// while meaning something else. This mark is the smallest honest fix —
// name the source, date the fixing, and let the reader discount it.
//
// It is NOT the dotted "not-yet-real" treatment. Dotted means the thing
// has not happened. A fixing has happened; it is simply older and
// coarser than a tick. Different claim, different mark.
//
// Pairs with StaleAsOf, which covers the other case — a live value
// served from cache past its fresh window.

import { MonoLabel } from "./primitives/mono-label";

interface FixingMarkProps {
  // ISO instant of the fixing itself, as stamped by the server adapter.
  // Never `now` — see ecbFixingInstant in market-adapters.ts.
  updatedAt: string;
}

// "ECB FIXING · 4 SEP". Date only: the 16:00 Brussels publication time
// is a property of the series, not information the reader needs in a
// grid cell, and the day is what tells them how stale it is.
function formatFixingDate(updatedAt: string): string | null {
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getDate()} ${d.toLocaleString("en-GB", { month: "short" }).toUpperCase()}`;
}

export function FixingMark({ updatedAt }: FixingMarkProps) {
  const when = formatFixingDate(updatedAt);
  return (
    <MonoLabel as="div" size={8} letterSpacing="0.08em" color="var(--ft-dim)">
      {when ? `ECB FIXING · ${when}` : "ECB FIXING"}
    </MonoLabel>
  );
}

// Inline single-line variant for surfaces with no room for a second row —
// the desktop header ticker strip is 10px on one line. Same claim, less
// space: name the source and date it. Anything shorter (a bare dot, an
// asterisk) would be a mark the reader cannot decode, which is not a
// disclosure.
export function FixingTag({ updatedAt }: FixingMarkProps) {
  const when = formatFixingDate(updatedAt);
  return (
    <span
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 8,
        letterSpacing: "0.04em",
        color: "var(--ft-dim)",
        whiteSpace: "nowrap",
      }}
    >
      {when ? `ECB ${when}` : "ECB"}
    </span>
  );
}
