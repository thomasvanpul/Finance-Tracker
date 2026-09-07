// FX-only drift → the phone's WORTH insight slot.
//
// `/accounts` shows the balance and `/net-worth` shows the movement, and
// neither says **this movement is not yours**. When a foreign-currency
// holding has sat still and the rate has moved, the whole change in base
// value is the rate — and on a month where that is the largest single thing
// to happen to a net worth, reading it as progress is simply wrong.
//
// GET /accounts/fx-drift supplies the split; this decides whether it is
// worth a sentence. It passes the four-part test in DESIGN.md §15:
//
//   Is it true?              Gated on a real snapshot with a rate recorded at
//                            capture time. No snapshot, no claim.
//   Can the user act?        It corrects a belief they are otherwise acting
//                            on — the strongest kind. A large exposed balance
//                            is also a thing they can choose to convert.
//   Will it stop?            Yes. It is silent below the thresholds, and the
//                            share shrinks as soon as they transact.
//   Would you say it aloud?  "£320 of your £500 rise was the euro, not you."
//
// Silence is a statement, so `insufficient` produces null rather than
// "not enough history yet" — the same rule the reconciliation gap follows.

import type { Insight } from "./spending-insights";
import { entityHref } from "./entity-href";
import { formatShortDate } from "./reconciliation-insight";
import { formatMoney } from "./utils";
import type { FxDriftReport } from "@workspace/api-client-react";

// Below reconciliation (90): an unexplained gap is a thing the user must
// place, this is a thing they must not misread. Above the 60 tier, because
// it changes how every other number on the screen should be read.
export const FX_DRIFT_PRIORITY = 70;

// Below this the slot is not worth spending. A few pounds of rate movement
// is the normal condition of holding foreign money, not news.
const MIN_ABSOLUTE_BASE = 25;

// FX must be at least this share of the total movement in magnitude, or the
// movement mostly IS theirs and the sentence would be false. Half is the
// honest line for the claim "this movement is not yours".
const MIN_FX_SHARE = 0.5;

export function fxDriftInsight(report: FxDriftReport | undefined): Insight | null {
  if (report == null || report.status !== "ok" || report.accounts.length === 0) return null;

  const fxTotal = report.accounts.reduce((sum, a) => sum + a.fxDeltaBase, 0);
  const totalDelta = report.accounts.reduce((sum, a) => sum + a.totalDeltaBase, 0);
  if (Math.abs(fxTotal) < MIN_ABSOLUTE_BASE) return null;
  if (Math.abs(fxTotal) < MIN_FX_SHARE * Math.abs(totalDelta)) return null;

  // Only the accounts that actually carry the move get named or drilled to.
  // A GBP account under a GBP base has fxDeltaBase exactly 0 and is not part
  // of this sentence, even though it is measurable and in the report.
  const moved = report.accounts.filter((a) => a.fxDeltaBase !== 0);
  if (moved.length === 0) return null;

  const magnitude = formatMoney(Math.abs(fxTotal), report.baseCurrency);
  // The direction belongs in the headline. "£798.64 of the move was the rate"
  // reads identically for a rise and a fall, which is the one thing this
  // insight exists to disambiguate — seen on the rendered slot, 2026-09-07.
  const verb = fxTotal < 0 ? "took" : "added";
  const period = report.periodFrom == null ? "" : `, since ${formatShortDate(report.periodFrom)}`;
  const where = moved.length === 1 ? moved[0].name : `${moved.length} accounts`;
  // InsightSlot gives the body one nowrap line and ellipsises the rest, so
  // roughly 45 characters at 13px. The long-form caveat truncated in place;
  // this is the same fact at a width that survives.
  const caveat = report.unmeasurableAccounts > 0
    ? ` +${report.unmeasurableAccounts} unmeasured`
    : "";

  return {
    // The rounded amount is part of the id so a dismissal covers this
    // reading of the drift, not the drift for ever — the rate keeps moving.
    id: `fx-drift:${report.periodFrom}:${Math.round(fxTotal * 100)}`,
    source: "fx-drift",
    priority: FX_DRIFT_PRIORITY,
    headline: `The rate ${verb} ${magnitude}`,
    // One line at 13px: where it sits, and over what window.
    body: `${where}${period}${caveat}`,
    // A figure computed from account rows opens those rows (DESIGN.md §14).
    drillHref: moved.length === 1 ? entityHref("account", moved[0].accountId) : "/accounts",
  };
}
