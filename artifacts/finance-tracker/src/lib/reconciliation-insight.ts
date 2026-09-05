// Reconciliation gap → the phone's InsightSlot.
//
// The API says how much money moved through cash accounts that the ledger
// does not explain (GET /accounts/reconciliation). The phone gets the
// number and one action; the desktop panel on /accounts carries the
// reasoning (per-account movement, period rule, caveats).
//
// Silence is a statement here. Below the minimum history the report is
// `insufficient` and there is nothing to place, so no insight — the desktop
// panel is where "not enough history yet" is said. A zero gap is also
// silent: the slot exists for what Numeris does not know, and a reconciled
// ledger is not that.

import type { Insight } from "./spending-insights";
import { formatMoney } from "./utils";
import type { ReconciliationReport } from "@workspace/api-client-react";

// Above the recurring-detector producer (80): an unexplained balance
// movement is the one thing on WORTH the user can act on today.
export const RECONCILIATION_PRIORITY = 90;

// Anything under half a penny of base is rounding, not money.
const ZERO_TOLERANCE = 0.005;

export function reconciliationPeriodLabel(report: Pick<ReconciliationReport, "periodRule" | "periodFrom">): string {
  if (report.periodRule === "month-to-date") return "this month";
  if (report.periodFrom == null) return "";
  return `since ${formatShortDate(report.periodFrom)}`;
}

// "3 Sep", matching the WORTH header's "since 1 Sep" (Intl en-GB would
// give "Sept").
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatShortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function reconciliationInsight(
  report: ReconciliationReport | undefined,
  onPlace: () => void,
): Insight | null {
  if (report == null || report.status !== "ok" || report.gapBase == null) return null;
  if (Math.abs(report.gapBase) < ZERO_TOLERANCE) return null;

  const magnitude = formatMoney(Math.abs(report.gapBase), report.baseCurrency);
  const period = reconciliationPeriodLabel(report);
  const affected = report.accounts.filter((a) => a.gapBase != null && Math.abs(a.gapBase) >= ZERO_TOLERANCE);
  const where = affected.length === 1 ? affected[0].name : `${affected.length} accounts`;
  const direction = report.gapBase < 0 ? "left" : "entered";
  const caveat = report.unconvertibleAccounts > 0
    ? ` ${report.unconvertibleAccounts} account${report.unconvertibleAccounts === 1 ? "" : "s"} could not be converted and is not included.`
    : "";

  return {
    id: `reconciliation:${report.periodFrom}:${Math.round(report.gapBase * 100)}`,
    source: "reconciliation",
    priority: RECONCILIATION_PRIORITY,
    headline: `${magnitude} unaccounted ${period}`,
    // InsightSlot renders the body on one line (~45 chars at 13px); the
    // number and the account must survive, so the sentence is the fact
    // alone. The reasoning lives on the desktop /accounts panel.
    body: `${magnitude} ${direction} ${where}, unrecorded.${caveat}`,
    action: { label: "Place it", onTap: onPlace },
  };
}
