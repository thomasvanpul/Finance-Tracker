// ── The finding WHAT CHANGED has never stated ───────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// The band already carries the right data: a total, and a row per cause with
// the accounts under it. What it has never carried is the reading. On the
// current dev account the whole of the last day's move is the ringgit and
// none of it is spending, and a person looking at the band has to work that
// out from four figures and their signs. It should be the first thing said.
//
// Two sentences, because they answer two different questions and a reader
// asks them in this order: what was this NOT, and then what was it.
//
// Shares are of the GROSS movement — the sum of the absolute row amounts —
// not of the net total. With causes pulling in opposite directions the net
// is smaller than any of its parts, and "the rate moved 400% of it" is the
// arithmetic being right and the sentence being nonsense.
//
// Nothing here invents a figure: every number is a ratio of two amounts the
// API supplied, and a ratio of a whole is not drillable (DESIGN.md § 14).

import type { AttributionRow, AttributionView } from "@/lib/change-attribution-view";

export interface ProtoFinding {
  /** What the movement was not. */
  lead: string;
  /** What it was, with the account that concentrates it where one does. */
  cause: string;
}

// "the rate moved" reads as a row label. As the subject of a sentence about
// the whole movement it needs to be a noun.
const CAUSE_NOUN: Record<AttributionRow["kind"], string> = {
  spend: "Your spending",
  rate: "The exchange rate",
  valuation: "A re-marked valuation",
  unexplained: "Something with no transaction behind it",
};

/** How much of one row a single account under it accounts for, before it is
 *  worth naming. Below this the row is genuinely spread and naming its
 *  largest account would imply a concentration that is not there. */
const CONCENTRATION_FLOOR = 0.6;

/** Below this, spending is not what moved the figure and the band should
 *  say so rather than leaving the reader to compare four amounts. */
const SPENDING_IS_NOISE = 0.2;

export function protoFinding(view: AttributionView): ProtoFinding | null {
  if (view.status !== "ok") return null;

  const gross = view.rows.reduce((sum, row) => sum + Math.abs(row.amountBase), 0);
  // A measured zero and an unmeasured one are different claims, and neither
  // has a finding in it (change-attribution.tsx, rule 2).
  if (gross === 0) return null;

  const ranked = [...view.rows].sort((a, b) => Math.abs(b.amountBase) - Math.abs(a.amountBase));
  const top = ranked[0];
  if (top === undefined) return null;

  const spend = view.rows.find((row) => row.kind === "spend");

  if (top.kind === "spend") {
    // The lead would otherwise say "almost none of this was spending" about
    // the row that is most of it. Say the true thing and let the second
    // sentence carry whatever else moved.
    const runnerUp = ranked[1];
    return {
      lead: `This was mostly you spending, ${share(Math.abs(top.amountBase) / gross)} of it.`,
      cause: runnerUp === undefined
        ? concentrationOf(top) ?? "Nothing else moved it."
        : `${CAUSE_NOUN[runnerUp.kind]} is the rest, ${share(Math.abs(runnerUp.amountBase) / gross)}.`,
    };
  }

  const spendShare = spend === undefined ? 0 : Math.abs(spend.amountBase) / gross;
  const lead =
    spend === undefined ? "None of this was you spending."
    : spendShare < SPENDING_IS_NOISE ? `Almost none of this was you spending, ${share(spendShare)}.`
    : `Your spending is ${share(spendShare)} of it.`;

  const concentration = concentrationOf(top);
  const cause = `${CAUSE_NOUN[top.kind]} moved ${share(Math.abs(top.amountBase) / gross)} of it`
    + (concentration === null ? "." : `, and ${concentration}`);

  return { lead, cause };
}

/** "Flat, Kuala Lumpur is 99.6% of that." — only when one account really is. */
function concentrationOf(row: AttributionRow): string | null {
  const rowTotal = Math.abs(row.amountBase);
  if (rowTotal === 0 || row.breakdown.length < 2) return null;
  const biggest = [...row.breakdown].sort((a, b) => Math.abs(b.amountBase) - Math.abs(a.amountBase))[0];
  if (biggest === undefined) return null;
  const fraction = Math.abs(biggest.amountBase) / rowTotal;
  if (fraction < CONCENTRATION_FLOOR) return null;
  // A breakdown label carries the account AND the evidence particular to it
  // ("Flat, Kuala Lumpur · GBP/MYR 5.4700 → 5.5009"), which is right in a
  // row and wrong inside a sentence — the rate pair lands mid-clause and the
  // sentence stops being one. The account is the part that belongs here.
  const account = biggest.label.split(" · ")[0] ?? biggest.label;
  return `${account} is ${share(fraction)} of that.`;
}

/**
 * A share as a percentage. Whole numbers where the precision is not real,
 * one decimal near the ends — "100%" against a true 99.6% is the same class
 * of defect as a clipped figure: it reads as a different, plausible claim.
 */
function share(fraction: number): string {
  const value = fraction * 100;
  if (value >= 99.95) return "100%";
  if (value >= 99) return `${value.toFixed(1)}%`;
  if (value >= 10) return `${Math.round(value)}%`;
  return `${value.toFixed(1)}%`;
}
