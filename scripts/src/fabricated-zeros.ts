// Which £0 figures an offline render shows that the API never supplied.
//
// A zero on its own proves nothing: /upcoming with no income due reads
// 30D INCOME +£0.00 online and offline, and that zero is real. What the
// offline check guards against is a figure that had a value while the API
// answered and reads £0 once it cannot — a user on a plane reading their net
// worth as zero. So each zero is keyed by the line above it (its label, in
// the app's KPI and table markup) and the offline render is diffed against
// the online render of the same route. fabricated-zeros.test.ts.

// A whole zero: £0, £0.00, signed or not. Not £0.50, £0.05 or £0,5.
const ZERO_FIGURE = /[+−-]?£0(?:\.0+)?(?![\d.,])/g;

// Every £0 figure in a page's innerText, as "<line above> | <its line>".
export function zeroFigures(text: string): string[] {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const keys: string[] = [];
  lines.forEach((line, i) => {
    const hits = line.match(ZERO_FIGURE)?.length ?? 0;
    for (let n = 0; n < hits; n++) keys.push(`${lines[i - 1] ?? ""} | ${line}`);
  });
  return keys;
}

// Zero figures offline beyond those the same route showed online, counted:
// two zero rows offline against one online is one fabrication.
export function fabricatedZeros(onlineText: string, offlineText: string): string[] {
  const seenOnline = new Map<string, number>();
  for (const key of zeroFigures(onlineText)) seenOnline.set(key, (seenOnline.get(key) ?? 0) + 1);
  const extra: string[] = [];
  for (const key of zeroFigures(offlineText)) {
    const left = seenOnline.get(key) ?? 0;
    if (left > 0) seenOnline.set(key, left - 1);
    else extra.push(key);
  }
  return extra;
}

// ─── The other direction: a figure where an unknown was owed ─────────────────
//
// `fabricatedZeros` asks what the offline render invented. T1 (5 Oct 2026)
// asked the question the other way round: when an input is genuinely null,
// does the screen SAY so, or does it show 0, or a grade, or an invented
// placeholder? /whatif opened at an income of £3,000 nobody earned; /tax
// assumed £35,000 gross against £3,750 recorded; the health score scored an
// unknown pillar as 0 and then graded the composite out of it.
//
// A stated unknown is the em dash the app renders for a missing value
// (DESIGN.md §7). These helpers read it out of a page's innerText so a
// browser run — verify-offline, or a one-off capture — can assert it, and so
// the four surfaces that must agree can be diffed against each other.

/** DESIGN.md §7: a missing value renders as this, and only this. */
export const STATED_UNKNOWN = "—";

// A figure: money, a percentage, a bare number, or the stated unknown.
// Anchored to the whole line so a label containing a number ("30D INCOME") is
// not read as a value. The bare number matters: a health score shown as 42
// where its inputs are unknown is the same defect as a 0% savings rate, and
// without it that case would be reported as a missing cell instead.
const FIGURE_LINE =
  /^(?:[+−-]?(?:£|\$|€)[\d,]+(?:\.\d+)?|[+−-]?[\d,]+(?:\.\d+)?%|[+−-]?[\d,]+(?:\.\d+)?|—)$/;

/**
 * The value drawn under each label, for every label whose next line is a
 * figure. Labels are matched case-insensitively and returned as given.
 *
 * This is the same keying `zeroFigures` uses — a figure belongs to the line
 * above it — because that is the only structure a text dump has. A label
 * whose value is two lines down, or beside it, is invisible here; the
 * screenshots are what cover those.
 */
export function figuresByLabel(text: string): Map<string, string[]> {
  const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
  const out = new Map<string, string[]>();
  lines.forEach((line, i) => {
    if (i === 0) return;
    if (!FIGURE_LINE.test(line)) return;
    const label = lines[i - 1]!.toLowerCase();
    const seen = out.get(label);
    if (seen) seen.push(line);
    else out.set(label, [line]);
  });
  return out;
}

/**
 * Of the labels that must read as unknown, those that showed a figure.
 *
 * A label absent from the page is NOT a pass — it is returned as `missing`,
 * because a screen that stopped rendering the cell has not stated anything.
 */
export function unknownsNotStated(
  text: string,
  expectedUnknown: readonly string[],
): { label: string; showed: string }[] {
  const figures = figuresByLabel(text);
  const bad: { label: string; showed: string }[] = [];
  for (const label of expectedUnknown) {
    const values = figures.get(label.toLowerCase());
    if (!values || values.length === 0) { bad.push({ label, showed: "missing" }); continue; }
    for (const v of values) {
      if (v !== STATED_UNKNOWN) bad.push({ label, showed: v });
    }
  }
  return bad;
}

/**
 * Whether several routes agree on one figure.
 *
 * `pages` maps a route to its innerText; `labels` maps a route to the label
 * that route draws the figure under, because the four surfaces do not use the
 * same words. Returns the distinct values found, keyed by route — one entry
 * means they agree, two or more is the contradiction T1 item 10 is about.
 */
export function figureAcrossRoutes(
  pages: Readonly<Record<string, string>>,
  labels: Readonly<Record<string, string>>,
): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [route, text] of Object.entries(pages)) {
    const label = labels[route];
    if (label == null) continue;
    const values = figuresByLabel(text).get(label.toLowerCase());
    found[route] = values && values.length > 0 ? values[0]! : "missing";
  }
  return found;
}

/** The distinct values in a `figureAcrossRoutes` result. One means agreement. */
export function distinctFigures(found: Readonly<Record<string, string>>): string[] {
  return [...new Set(Object.values(found))];
}
