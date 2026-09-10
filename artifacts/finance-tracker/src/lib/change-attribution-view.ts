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
import { formatMoneyWhole } from "./utils";

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
  /**
   * The accounts behind this row, one line each, already sorted by
   * magnitude by the API. The report has always carried these; until
   * 2026-09-07 the band collapsed them into `detail` ("3 currencies") and
   * threw the rest away, so a two-part month rendered as two lines and
   * looked like the surface had nothing to say. Empty when the row is a
   * single account — the row itself already names it.
   */
  breakdown: AttributionBreakdownLine[];
}

export interface AttributionBreakdownLine {
  /** The account, plus the evidence particular to it where there is any. */
  label: string;
  amountBase: number;
  /** §14 again: each sub-line opens the account it names. */
  drillHref: string;
}

/**
 * The one sentence this surface exists to deliver, and its evidence.
 *
 * The band has had correct data and no point since it shipped: a figure, a
 * list of causes, and nowhere the finding — that almost none of the change
 * is usually the user spending. A reader had to derive that by comparing a
 * row against the others, which is the work the screen is supposed to do.
 *
 * `headline` names the share the user's own spending accounts for, in
 * words, because that is the question being answered ("was this me?"). It
 * is a claim about proportion, so it is computed from the GROSS movement —
 * the sum of the absolute parts — not from the net total. A month of +£500
 * spend and −£500 FX nets to zero, and describing that as "none of it was
 * you" because the total is zero would be the worst reading available.
 *
 * `support` states the two magnitudes the headline compares, so no reader
 * has to take the wording on trust, and names what the rest was. It is null
 * when there is only one part, because "£960 of £960" adds nothing to a
 * band that already prints one row.
 */
export interface AttributionFinding {
  headline: string;
  support: string | null;
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
      /** The sentence the band leads with. */
      finding: AttributionFinding;
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

/**
 * One line per account behind a part. Suppressed when the part has a single
 * account, because the row's own `detail` already names it and repeating it
 * underneath would be two lines saying one thing.
 *
 * Capped: past six the band stops being a summary. The cap is stated in the
 * tail line rather than silently dropping accounts, because a total that
 * does not visibly add up is the defect this whole surface exists to avoid.
 */
const BREAKDOWN_MAX = 6;

function breakdownFor(part: ChangeAttributionPart, base: string): AttributionBreakdownLine[] {
  const accounts = part.accounts;
  if (accounts.length < 2) return [];

  const shown = accounts.slice(0, BREAKDOWN_MAX);
  const lines: AttributionBreakdownLine[] = shown.map((a) => ({
    label:
      part.kind === "rate" && a.fromRate != null && a.toRate != null
        ? `${a.name} · ${base}/${a.currency} ${quote(a.fromRate)} → ${quote(a.toRate)}`
        : a.name,
    amountBase: a.amountBase,
    drillHref: entityHref("account", a.accountId),
  }));

  const rest = accounts.slice(BREAKDOWN_MAX);
  if (rest.length > 0) {
    lines.push({
      label: `${plural(rest.length, "other account")}`,
      amountBase: rest.reduce((sum, a) => sum + a.amountBase, 0),
      drillHref: "/accounts",
    });
  }
  return lines;
}

function rowFor(part: ChangeAttributionPart, from: string | null, to: string, base: string): AttributionRow {
  const accounts = part.accounts;
  const first = accounts[0];
  const breakdown = breakdownFor(part, base);

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
        breakdown,
      };
    case "rate": {
      const currencies = new Set(accounts.map((a) => a.currency));
      // "2 currencies" was written when nothing rendered the breakdown, so
      // the count of currencies was the whole of what the row disclosed.
      // The phone started rendering the account lines on 2026-09-10 and the
      // seed puts three accounts under two currencies — "2 currencies" then
      // sits directly above three lines and reads as a miscount. Say both
      // when they differ; one number is still one number when they agree.
      const detail =
        currencies.size === 1 && first?.fromRate != null && first?.toRate != null
          ? `${base}/${first.currency} ${quote(first.fromRate)} → ${quote(first.toRate)}`
          : accounts.length === currencies.size
            ? `${currencies.size} ${currencies.size === 1 ? "currency" : "currencies"}`
            : `${plural(accounts.length, "account")} · ${currencies.size} currencies`;
      return { kind: "rate", label: "the rate moved", amountBase: part.amountBase, detail, drillHref: "/net-worth", breakdown };
    }
    case "valuation":
      return {
        kind: "valuation",
        label: "the value was re-marked",
        amountBase: part.amountBase,
        detail: accounts.length === 1 && first ? `${first.name}, no transaction` : `${plural(accounts.length, "account")}, no transaction`,
        drillHref: accounts.length === 1 && first ? entityHref("account", first.accountId) : "/accounts",
        breakdown,
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
        breakdown,
      };
  }
}

/**
 * What a part is called when it is the subject of a sentence rather than
 * the label on a row. The row labels are verb phrases ("the rate moved"),
 * which do not survive being embedded — "the rest is the rate moved".
 */
const KIND_NOUN: Record<AttributionRowKind, string> = {
  spend: "your own spending",
  rate: "currency rates",
  valuation: "revaluations",
  unexplained: "movement nothing explains",
};

/**
 * Rounded to the pound. The headline is a claim about proportion and reads
 * alongside the exact figures in the rows beneath it; pence in a sentence
 * are noise, and the rows are where the arithmetic is checkable. Magnitude,
 * because the sentence supplies its own direction ("was you spending").
 */
function roughMoney(value: number, currency: string): string {
  return formatMoneyWhole(Math.abs(value), currency);
}

/**
 * Thresholds. "Almost none" has to mean something a reader would agree
 * with if they did the division, so it is set at a twentieth rather than
 * at a tenth — a fifth of a month's movement is not "almost none".
 */
const ALMOST_NONE = 0.05;
const ALMOST_ALL = 0.95;

function findingFor(parts: ChangeAttributionPart[], base: string): AttributionFinding {
  const gross = parts.reduce((sum, p) => sum + Math.abs(p.amountBase), 0);
  const spend = parts.find((p) => p.kind === "spend");
  const you = spend == null ? 0 : Math.abs(spend.amountBase);

  // Everything else, largest first — what the headline is contrasting the
  // user's spending against.
  const rest = parts
    .filter((p) => p.kind !== "spend" && p.amountBase !== 0)
    .sort((a, b) => Math.abs(b.amountBase) - Math.abs(a.amountBase));

  // Nothing moved at all. Not a share of zero — a share of zero is
  // undefined, and dividing by it to reach "0% was you" would be a
  // fabricated proportion.
  if (gross === 0) {
    return { headline: "Nothing moved", support: null };
  }

  const share = you / gross;
  const restNoun = rest[0] == null ? null : KIND_NOUN[rest[0].kind];

  const headline =
    share === 0 ? "None of this was you spending"
    : share < ALMOST_NONE ? "Almost none of this was you spending"
    : share >= 1 ? "All of this was you spending"
    : share > ALMOST_ALL ? "Almost all of this was you spending"
    : `${roughMoney(you, base)} of ${roughMoney(gross, base)} was you spending`;

  // One part: the row beneath already says everything the support could.
  if (rest.length === 0 || restNoun == null) return { headline, support: null };

  // The magnitudes the headline rests on, then what the remainder is. When
  // the sentence already prints both figures, printing them again would be
  // the restatement the AI card was rejected for.
  const magnitudes = share >= ALMOST_NONE && share <= ALMOST_ALL
    ? ""
    : `${roughMoney(you, base)} of ${roughMoney(gross, base)} — `;
  const tail = rest.length === 1
    ? `the whole of the rest is ${restNoun}`
    : `most of the rest is ${restNoun}`;

  return { headline, support: `${magnitudes}${tail}` };
}

/**
 * The causes, joined into the second half of the finding's sentence.
 *
 * The row labels were written as sentence subjects — "you spent", "the rate
 * moved", "nothing explains it" — and until 2026-09-10 nothing had ever used
 * them as one: the adopted top region set them as uppercase mono links in a
 * row, which read as navigation rather than as a clause. Thomas: "confusing
 * right now."
 *
 * The join lives here rather than in the component because it is grammar, not
 * layout, and because it is the one part of that line a test can hold: a
 * three-cause month must read "a, b and c" and not "a, b, c" or "a and b and
 * c". The Oxford comma is deliberately absent — the surrounding line is
 * British and the rest of the app's prose is too.
 */
export function causeSegments(rows: AttributionRow[]): { row: AttributionRow; lead: string }[] {
  return rows.map((row, i) => ({
    row,
    lead: i === 0 ? "" : i === rows.length - 1 ? " and " : ", ",
  }));
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
    finding: findingFor(report.parts, report.baseCurrency),
    warning,
  };
}
