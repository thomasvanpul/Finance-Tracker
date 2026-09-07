// The change attribution report, turned into lines a screen can render.
//
// Kept out of both screens because the desktop band and the phone block show
// the SAME rows with different density, and a label that disagreed between
// them would be two different claims about one number. The arithmetic lives
// on the server (api-server/src/lib/change-attribution.ts); this is naming
// and formatting, and the tests below it are about wording and drill targets,
// not about sums.
//
// Two rules this file exists to keep:
//
//   * The headline is the report's own total over the report's own window,
//     never the dashboard's month-to-date figure. The two use different
//     baselines and will sometimes disagree, so the window is always stated
//     next to the figure rather than assumed.
//   * `balances === false` is surfaced, not smoothed. If the parts do not
//     add to the headline the surface says so; it never rounds one of the
//     parts to make the column add up.

import type { ChangeAttributionReport, ChangeAttributionPart } from "@workspace/api-client-react";
import { entityHref, ledgerHref } from "./entity-href";

export type AttributionRowKind = ChangeAttributionPart["kind"];

export interface AttributionRow {
  kind: AttributionRowKind;
  /** Reads as the subject of a sentence: "you spent", "the rate moved". */
  label: string;
  amountBase: number;
  /** The evidence for the label — a count, a rate pair, an account name. */
  detail: string;
  /** §14: a figure computed from rows opens those rows. */
  drillHref: string;
}

/**
 * A union rather than a record of nullables, so no caller can reach for a
 * total that was never measured. Coalescing a null total to zero is the exact
 * shape of the fabricated-zero defect the repo locks against; making the type
 * refuse it is better than remembering not to write it.
 */
export type AttributionView =
  | {
      status: "insufficient";
      /** Says what is missing. Never a "£0.00" row. */
      emptyReason: string;
    }
  | {
      status: "ok";
      /** Total over the report's own window. */
      totalBase: number;
      /** "since 1 Sep" — the report's window, not the dashboard's. */
      windowLabel: string;
      rows: AttributionRow[];
      /** Set when the parts do not add up, or when accounts are missing. */
      warning: string | null;
    };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `2026-09-01` → `1 Sep`. Date-only, so no timezone can move it a day. */
export function shortDate(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/**
 * `GBP/MYR 5.4054` — the direction the rest of the app quotes rates in
 * (pages/accounts.tsx FxRateCell). The API supplies native-to-base, so this
 * is its reciprocal — the same number, read the way the FX panel reads it.
 */
function quote(nativeToBase: number): string {
  const perBase = 1 / nativeToBase;
  return perBase.toFixed(perBase >= 100 ? 2 : 4);
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function rowFor(part: ChangeAttributionPart, from: string | null, to: string, base: string): AttributionRow {
  const accounts = part.accounts;
  const first = accounts[0];

  switch (part.kind) {
    case "spend":
      return {
        kind: "spend",
        label: part.amountBase < 0 ? "you spent" : "you added",
        amountBase: part.amountBase,
        // A null count on a spend part would mean the API broke its own
        // contract. Saying "0 transactions" next to a non-zero figure would
        // be a lie, so the line says where the number came from instead.
        detail: part.transactions == null ? "from the ledger" : plural(part.transactions, "transaction"),
        // The rows that were summed, over the window they were summed over.
        drillHref: ledgerHref({ from: from ?? undefined, to }),
      };
    case "rate": {
      const currencies = new Set(accounts.map((a) => a.currency));
      const detail =
        currencies.size === 1 && first?.fromRate != null && first?.toRate != null
          ? `${base}/${first.currency} ${quote(first.fromRate)} → ${quote(first.toRate)}`
          : `${currencies.size} currencies`;
      return { kind: "rate", label: "the rate moved", amountBase: part.amountBase, detail, drillHref: "/net-worth" };
    }
    case "valuation":
      return {
        kind: "valuation",
        label: "the value was re-marked",
        amountBase: part.amountBase,
        detail: accounts.length === 1 && first ? `${first.name}, no transaction` : `${plural(accounts.length, "account")}, no transaction`,
        drillHref: accounts.length === 1 && first ? entityHref("account", first.accountId) : "/accounts",
      };
    case "unexplained":
    default:
      return {
        kind: "unexplained",
        label: "nothing explains it",
        amountBase: part.amountBase,
        detail: "balance moved, no transaction",
        // The reconciliation panel, which is the long form of this one line.
        drillHref: "/accounts",
      };
  }
}

export function attributionView(report: ChangeAttributionReport | undefined): AttributionView | null {
  if (report == null) return null;

  if (report.status === "insufficient" || report.totalDeltaBase == null || report.periodFrom == null) {
    // "No snapshot, no attribution" — the same gate as everywhere else. The
    // reason says what is missing rather than attributing the change to zero.
    const since = report.dataAvailableSince;
    return {
      status: "insufficient",
      emptyReason: since == null
        ? "Not enough history — no balance has been recorded before today"
        : `Not enough history — the first complete day is still ${shortDate(since)}`,
    };
  }

  const rows = report.parts.map((p) => rowFor(p, report.periodFrom, report.periodTo, report.baseCurrency));

  // Two things can go wrong, and they are different sentences. The first is
  // an arithmetic failure and must be stated as one; the second is a coverage
  // limit, which is honest but not a defect.
  const warning = !report.balances
    ? `These do not add up — ${report.residualBase.toFixed(2)} is unaccounted for`
    : report.unmeasurableAccounts > 0
      ? `${plural(report.unmeasurableAccounts, "account")} not measured — no balance recorded on ${shortDate(report.periodFrom)}`
      : null;

  return {
    status: "ok",
    totalBase: report.totalDeltaBase,
    windowLabel: `since ${shortDate(report.periodFrom)}`,
    rows,
    warning,
  };
}
