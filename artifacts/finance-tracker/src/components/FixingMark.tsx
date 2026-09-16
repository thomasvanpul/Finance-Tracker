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
import { sameDayLabel } from "@/lib/same-point-spend";

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

// ── The same claim, for securities ──────────────────────────────────────────
// J26 settled that holdings are valued END OF DAY. Until 16 Sep 2026 the
// portfolio total was computed from whatever the live quote lane returned on
// each dashboard read, so the figure moved during the trading day and read as
// live because it was. It is now the last COMPLETED session's close, stored
// once per (ticker, session) — see api-server/src/lib/market-eod.ts.
//
// A close rendered with no mark is indistinguishable from a live price, which
// is the identical failure FixingMark exists to prevent one lane over. So the
// mark is the same shape and the same weight: name what the number is, date
// it, and let the reader discount it. Nothing new is invented — "CLOSE" is
// already the word this app uses for it (layout.tsx renders "PREV CLOSE" in
// the ticker tooltip), and the date format is the one sameDayLabel already
// produces everywhere else.
//
// Crypto and FX are NOT marked: they have no close to be end-of-day against
// and are still valued live, which is the correct answer for a 24/7 market.

interface CloseMarkProps {
  // The session the valuation is as of, YYYY-MM-DD. When several tickers
  // contribute, the server sends the OLDEST — a total is only as current as
  // its stalest leg. Null when nothing in the portfolio is EOD-valued.
  sessionDate: string | null | undefined;
}

// "AT CLOSE · 15 SEP". Rendered as a dim 8px mono line under the figure it
// qualifies, exactly like FixingMark.
export function CloseMark({ sessionDate }: CloseMarkProps) {
  if (!sessionDate) return null;
  return (
    <MonoLabel as="div" size={8} letterSpacing="0.08em" color="var(--ft-dim)">
      {`AT CLOSE · ${sameDayLabel(sessionDate)}`}
    </MonoLabel>
  );
}

// Inline single-line variant, for a row that already has a dim sub-line and
// no room for a second one. Same claim, no leading source word.
export function closeTagText(sessionDate: string | null | undefined): string | null {
  return sessionDate ? `AT CLOSE ${sameDayLabel(sessionDate)}` : null;
}

// The label for the portfolio's day-change. The delta is close-to-close, so
// on a Monday it spans Friday to Monday and "24H" would be untrue; dating its
// start ("SINCE 11 SEP") stays true across weekends and holidays. With no
// dated leg (a crypto-only portfolio) it says what the baseline is and no more.
export function sinceCloseLabel(fromSession: string | null | undefined): string {
  return fromSession ? `SINCE ${sameDayLabel(fromSession)}` : "SINCE PREV CLOSE";
}
