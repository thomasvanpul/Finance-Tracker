// Splits an AI insight line into its leading figure and the clause after it.
//
// The dashboard card leads with the figure (DESIGN.md §10: the figure is
// data and reads as mono, the clause is language and reads as sans). The
// model is asked for "<figure> — <clause>"; when it complies the figure is
// set apart, when it does not the whole line comes back as the clause so the
// insight still renders.
//
// A figure is only accepted if the leading part is short AND contains a
// digit. Without both guards a sentence that happens to contain an em dash
// would be promoted to a figure it is not — which is the same defect class
// as showing a number the API did not supply (CLAUDE.md, hard constraint).
export function splitInsight(line: string): { figure: string | null; clause: string } {
  const i = line.indexOf(" — ");
  if (i <= 0) return { figure: null, clause: line };
  const head = line.slice(0, i).trim();
  if (head.length > 24 || !/\d/.test(head)) return { figure: null, clause: line };
  return { figure: head, clause: line.slice(i + 3).trim() };
}
