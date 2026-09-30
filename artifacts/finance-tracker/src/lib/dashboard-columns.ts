// Which dashboard widgets go in the right-hand column.
//
// The desktop dashboard is two independent columns (each its own sortable
// list), so the split has to be decided rather than left to CSS. It used to
// be "every other widget, as of first render": index parity says nothing
// about height, and a widget enabled after first render (the persona's
// layout arrives from the API a beat later) was in neither half of that set
// and so always landed left. On 30 Sep that gave a seed dashboard four
// widgets on the left and one on the right, and a tester dashboard whose
// right column ended 1,300px above the left one — half the page an empty
// field beside a wall of widgets.
//
// Exact for a normal dashboard, greedy past that. With up to EXACT_MAX
// widgets every split is tried and the one with the smallest height
// difference wins (the first widget is pinned left, so a split and its
// mirror are not both counted, and ties go to the first found — the answer
// is deterministic). Greedy-in-order was tried first and left the 30 Sep
// tester dashboard 480px uneven, because the order forces a tall widget
// onto whichever side happens to be shorter when its turn comes. Past
// EXACT_MAX (2^(n-1) splits) each widget goes to the shorter column.
//
// Order within a column is preserved because callers filter the ordered id
// list by this set. Moving a widget between the two columns does not change
// its height (the columns are the same width), so a second pass over the
// same heights gives the same answer — the split cannot oscillate.

const EXACT_MAX = 14;

export function balanceColumns<T extends string>(
  ids: readonly T[],
  heights: ReadonlyMap<T, number>,
  gap = 0,
): Set<T> {
  const h = ids.map((id) => (heights.get(id) ?? 0) + gap);
  if (ids.length <= EXACT_MAX) {
    const total = h.reduce((a, b) => a + b, 0);
    let bestMask = 0;
    let bestDiff = Infinity;
    // Bit i set = ids[i] goes right. Bit 0 is never set: the first widget
    // stays left.
    for (let mask = 0; mask < 1 << ids.length; mask += 2) {
      let right = 0;
      for (let i = 1; i < ids.length; i++) if (mask & (1 << i)) right += h[i];
      const diff = Math.abs(total - 2 * right);
      if (diff < bestDiff) { bestDiff = diff; bestMask = mask; }
    }
    return new Set(ids.filter((_, i) => (bestMask & (1 << i)) !== 0));
  }
  let left = 0;
  let right = 0;
  const rightSet = new Set<T>();
  ids.forEach((id, i) => {
    if (right < left) { rightSet.add(id); right += h[i]; } else { left += h[i]; }
  });
  return rightSet;
}

export function sameSet<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}
