// Splits an AI insight line into its leading figure, the clause that says
// what the figure means, and the line of support underneath it.
//
// The dashboard card is three-across (§2 of the 2026-09-08 review task): a
// figure, then a short clause, then one line of evidence. It reads in a
// glance because the three parts are three different things and are set as
// three different things — the figure is data and reads as mono .pnum
// (DESIGN.md §10), the clause is the finding and reads as prose, the
// support is where the finding came from and recedes.
//
// The model is asked for "<figure> — <clause> — <support>". A model is not
// a contract, so every part below the first is optional and the card
// renders whatever arrived:
//   · three parts  → figure, clause, support
//   · two parts    → figure, clause, no support (the shape asked for until
//                    2026-09-08; still valid, still renders)
//   · no separator → the whole line as prose, no figure
//
// A figure is only accepted if the leading part is short AND contains a
// digit. Without both guards a sentence that happens to contain an em dash
// would be promoted to a figure it is not — which is the same defect class
// as showing a number the API did not supply (CLAUDE.md, hard constraint).
const SEP = " — ";

/** Longest head still readable as a figure rather than a sentence. */
const FIGURE_MAX = 24;

export interface InsightParts {
  figure: string | null;
  clause: string;
  /** The evidence line, when the model supplied a third part. */
  support: string | null;
}

export function splitInsight(line: string): InsightParts {
  const i = line.indexOf(SEP);
  if (i <= 0) return { figure: null, clause: line, support: null };

  const head = line.slice(0, i).trim();
  // Not a figure: the whole line is prose, and it is NOT re-split on the
  // remaining separators. An em dash inside a sentence is punctuation, and
  // cutting a sentence in half at one would invent a structure the model
  // did not write.
  if (head.length > FIGURE_MAX || !/\d/.test(head)) {
    return { figure: null, clause: line, support: null };
  }

  const rest = line.slice(i + SEP.length).trim();
  const j = rest.indexOf(SEP);
  if (j <= 0) return { figure: head, clause: rest, support: null };

  return {
    figure: head,
    clause: rest.slice(0, j).trim(),
    // Any further separators stay inside the support line — it is the last
    // slot, so there is nothing after it to promote them into.
    support: rest.slice(j + SEP.length).trim(),
  };
}
