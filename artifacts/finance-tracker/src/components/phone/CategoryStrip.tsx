import { StatGrid } from "./StatGrid";
import { formatBaseMoney } from "@/lib/utils";
import type { Transaction } from "@workspace/api-client-react";

// CategoryStrip — three-cell "sense of the month" between the hero and
// the list on SPENDING. Top three categories by expense total, base
// currency. No chart, no percentages, no month-over-month arrow —
// those are the treemap mistake the constitution warned about. Just
// three big numbers so a quick glance answers "where did it go."
//
// Computation matches the reduce in components/widgets/spending-
// breakdown.tsx:216 with two fixes: it uses Math.abs on
// baseEquivalent (the desktop version sums signed values and then
// sorts ascending — putting the SMALLEST spend category first — a
// bug in that file) and it skips null baseEquivalent rows explicitly
// (`?? 0` would silently under-count unconvertible expenses in the
// total, which is the fabricated-zero pattern Lock #16 catches).
//
// Returns null when there are no convertible expenses this month —
// Amendment :78, empty IS the message. The screen just doesn't
// render this section, which is the honest answer.
//
// Amendment lines followed:
//   :55  aligned metric columns stay square (StatGrid inherits)
//   :77  11px floor on the mono label; value at 13px (StatGrid's
//        isFinancial:true tabular-nums)
//   :78  no dead space — return null when nothing to show

interface CategoryStripProps {
  txs: readonly Transaction[];   // current-month rows (pre-filtered by caller)
}

export function CategoryStrip({ txs }: CategoryStripProps) {
  const byCategory = new Map<string, number>();
  for (const tx of txs) {
    if (tx.type !== "expense") continue;
    if (tx.baseEquivalent == null) continue;
    const cat = tx.category?.trim() || "Other";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + Math.abs(tx.baseEquivalent));
  }
  if (byCategory.size === 0) return null;

  const top = [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div style={{ padding: "0 16px 16px" }}>
      <StatGrid
        columns={(top.length as 1 | 2 | 3)}
        items={top.map(([cat, total]) => ({
          label: cat.toUpperCase(),
          value: formatBaseMoney(total),
          isFinancial: true,
        }))}
      />
    </div>
  );
}
