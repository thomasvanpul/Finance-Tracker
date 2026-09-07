// "1000 gbp to myr" — a currency conversion typed as a command.
//
// The converter used to be a panel at the bottom of /accounts: three inputs, a
// swap button, and a rate readout duplicating the FX strip directly above it.
// Nothing on that page needed it and no phone user could reach it at all. What
// it actually is, is a question with an answer — which is the command palette's
// job, not a section's. This is the parsing half, kept pure so the wording it
// accepts can be pinned by tests rather than discovered by typing at it.
//
// Deliberately NOT a calculator: no arithmetic operators, no chained units, no
// natural language beyond the two joining words people actually type. A parser
// that accepts almost anything makes a palette that fires on almost anything.

/** GBP is the pivot every stored rate is quoted against. */
export const PIVOT = "GBP";

export interface CurrencyQuery {
  amount: number;
  from: string;
  to: string;
}

// Codes are 3 letters in every currency the API quotes. Accepting longer
// strings only widens what looks like a conversion — "budget to date" should
// never light up the converter.
const CODE = "[A-Za-z]{3}";

// Three accepted shapes, in the order a person is likely to type them:
//   1000 gbp to myr   ·   1000 gbp myr   ·   1000gbp myr
//   gbp to myr        (amount defaults to 1 — "what is the rate")
// A leading "convert" is allowed because that is what someone types when they
// are looking for the feature rather than for an answer.
const WITH_AMOUNT = new RegExp(
  `^(?:convert\\s+)?([0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(${CODE})\\s+(?:to\\s+|in\\s+|>\\s*)?(${CODE})$`,
  "i",
);
const RATE_ONLY = new RegExp(
  `^(?:convert\\s+)?(${CODE})\\s+(?:to\\s+|in\\s+|>\\s*)?(${CODE})$`,
  "i",
);

/**
 * Parse a palette query into a conversion, or null when it is not one.
 *
 * `knownCodes` gates the result: an unrecognised code returns null rather than
 * a query that would later render "Unknown: XXX". The palette has other things
 * to show for a string it cannot price, and a red error inside a list of
 * commands reads as a broken command, not as a typo.
 */
export function parseCurrencyQuery(
  input: string,
  knownCodes: ReadonlySet<string>,
): CurrencyQuery | null {
  const text = input.trim().replace(/\s+/g, " ");
  if (text === "") return null;

  const withAmount = WITH_AMOUNT.exec(text);
  const rateOnly = withAmount == null ? RATE_ONLY.exec(text) : null;

  const raw = withAmount ?? rateOnly;
  if (raw == null) return null;

  const amountText = withAmount == null ? "1" : (withAmount[1] ?? "1");
  const from = (withAmount == null ? raw[1] : raw[2] ?? "").toUpperCase();
  const to = (withAmount == null ? raw[2] : raw[3] ?? "").toUpperCase();

  // A thousands separator is what people paste out of a bank statement.
  const amount = Number(amountText.replace(/,/g, ""));
  if (!Number.isFinite(amount)) return null;
  if (from === to) return null;
  if (!knownCodes.has(from) || !knownCodes.has(to)) return null;

  return { amount, from, to };
}

/**
 * Convert through the pivot. `rates` maps a code to its units-per-GBP figure,
 * exactly as /api/fx/rates returns it, and must not contain GBP itself — the
 * caller adds it, so a missing pivot is a caller bug rather than a silent 1.
 *
 * Returns null when either leg is unpriced. Never falls back to 1: a rate the
 * API did not supply must not become a figure on screen.
 */
export function convertVia(
  amount: number,
  from: string,
  to: string,
  rates: Readonly<Record<string, number>>,
): number | null {
  const fromRate = from === PIVOT ? 1 : rates[from];
  const toRate = to === PIVOT ? 1 : rates[to];
  if (fromRate == null || toRate == null) return null;
  if (!Number.isFinite(fromRate) || fromRate === 0) return null;
  if (!Number.isFinite(toRate)) return null;
  return (amount / fromRate) * toRate;
}

/**
 * The figure as the palette prints it: 2dp for anything a person would read as
 * money, 4dp only below a unit where 2dp would round a real difference to
 * nothing. Never an ellipsis and never a truncation — a currency figure is
 * shown in full or not at all.
 */
export function formatConverted(value: number): string {
  const decimals = Math.abs(value) >= 1 ? 2 : 4;
  return value.toLocaleString("en-GB", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** "1 GBP = 5.4759 MYR" — the same quoting direction FxRateCell uses. */
export function formatUnitRate(from: string, to: string, unit: number): string {
  const decimals = unit >= 100 ? 2 : 4;
  return `1 ${from} = ${unit.toFixed(decimals)} ${to}`;
}
