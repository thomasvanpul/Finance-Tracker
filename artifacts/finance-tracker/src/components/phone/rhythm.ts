// The phone's vertical rhythm, decided once (DESIGN.md §3).
//
// Until 16 Sep 2026 the phone had no rhythm of its own: 16 above every
// section, 34 per header, 10 above and below every row, 44 of empty top bar
// — a component library's defaults, uniformly airy. These are tighter,
// toward the desktop's density, and each one is a different number because
// the asymmetry is what shows the grouping:
//
//   GUTTER      16  page edge. Unchanged — it is the thumb's margin.
//   GROUP_GAP   12  space above a section's rule. The rule separates the
//                   groups; the gap only has to let it breathe.
//   HEADER_H    30  a section label and its hairline.
//   IN_GROUP     6  between items inside one group.
//   ROW_PY       8  above and below a row's text. A pressable row still
//                   reaches 44 through its min-height (Mobile Amendment).
export const PHONE_GUTTER = 16;
export const PHONE_GROUP_GAP = 12;
export const PHONE_HEADER_H = 30;
export const PHONE_IN_GROUP = 6;
export const PHONE_ROW_PY = 8;
