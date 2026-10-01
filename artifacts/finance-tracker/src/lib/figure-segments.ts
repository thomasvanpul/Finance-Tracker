import { AccountInputCurrency } from "@workspace/api-client-react";

// Split a sentence into its money and percentage figures and the words
// around them, so a renderer can put each figure in `.pnum` — which is what
// privacy mode blurs (index.css, body.privacy-mode .pnum).
//
// Needed where a figure arrives inside a string rather than as a number:
// insight producers build "£31 outstanding for 74 days." with formatMoney,
// and a string has no element to carry the class.
//
// A figure is a number WITH a currency mark or a percent sign. A bare number
// — "74 days", "3 BILLS", "23 Sep" — is not one and is left readable. The
// currency marks are what Intl prints for the currencies the app holds, in
// the three number locales it formats with (lib/utils.ts getNumberLocale):
// a symbol, possibly region-marked ("£", "US$", "CN¥", fr-FR "£GB"), or the ISO code
// ("MYR 4,120.00", "1.234,56 SGD").

export interface FigureSegment {
  text: string;
  figure: boolean;
}

const SPACE = "[\\s\\u00a0\\u202f]";
const SYMBOL = "[A-Z]{0,2}[£$€¥₹฿][A-Z]{0,2}";
const CODE = `(?:${Object.values(AccountInputCurrency).join("|")})`;
const SIGN = "[-−+]?";
// Digits with their grouping and decimal marks; ends on a digit, so a
// sentence's own full stop or comma is never swallowed.
const NUM = "\\d(?:[\\d.,\\u00a0\\u202f]*\\d)?";
const PREFIX = `(?:${SYMBOL}|${CODE}${SPACE}?)`;
const SUFFIX = `(?:${SPACE}?(?:${SYMBOL}|${CODE}\\b)|${SPACE}?%)`;
const FIGURE = new RegExp(
  `${SIGN}${PREFIX}${SIGN}${NUM}|${SIGN}${NUM}${SUFFIX}`,
  "g",
);

export function figureSegments(text: string): FigureSegment[] {
  const out: FigureSegment[] = [];
  let last = 0;
  for (const m of text.matchAll(FIGURE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ text: text.slice(last, start), figure: false });
    out.push({ text: m[0], figure: true });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), figure: false });
  return out;
}
