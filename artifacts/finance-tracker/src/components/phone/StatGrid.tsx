import type { ReactNode } from "react";
import { HoverRow } from "./HoverRow";

// StatGrid — the "border-as-gap" stat grid Thomas reads well narrow.
// Merges profile's KpiStrip + accounts's isFinancial + accounts's icon
// slot — six hand-rolled implementations across
// pages/{profile,accounts,settings}.tsx, components/widgets/net-worth.tsx,
// pages/split.tsx, pages/investments/markets-tab.tsx today.
//
// Square by design — Amendment :55 keeps aligned metric columns square.
// Hairlines between cells are per-cell borderRight / borderBottom (last
// column and last row carry none) inside one 1px frame — no CSS gap, so
// hover-tints don't leave gaps between cells.
//
// Amendment lines followed:
//   :55  aligned metric columns stay square (no border-radius)
//   :77  mono label at var(--ft-text-xs) = 11 (raised from historical
//        9px on the hand-rolled sites)
//   :90  tabular-nums on financial figures (isFinancial toggles .pnum)

interface StatGridItem {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
  icon?: ReactNode;
  isFinancial?: boolean;
}

interface StatGridProps {
  items: StatGridItem[];
  columns?: 1 | 2 | 3 | 4;
}

type StatCellProps = StatGridItem & { isLastCol: boolean; isLastRow: boolean };

function StatCell({ label, value, sub, accent, icon, isFinancial, isLastCol, isLastRow }: StatCellProps) {
  return (
    <HoverRow
      style={{
        background: "var(--ft-surface)",
        padding: "10px 12px",
        borderRight: isLastCol ? undefined : "1px solid var(--ft-border)",
        borderBottom: isLastRow ? undefined : "1px solid var(--ft-border)",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {icon && <span style={{ color: "var(--ft-dim)", display: "flex" }}>{icon}</span>}
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-xs)",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--ft-dim)",
          }}
        >
          {label}
        </span>
      </div>
      <div
        className={isFinancial ? "pnum" : undefined}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          color: accent ?? "var(--ft-text)",
          fontVariantNumeric: isFinancial ? "tabular-nums" : undefined,
          lineHeight: 1.1,
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-xs)",
            color: "var(--ft-muted)",
            whiteSpace: "nowrap",
          }}
        >
          {sub}
        </div>
      )}
    </HoverRow>
  );
}

export function StatGrid({ items, columns = 2 }: StatGridProps) {
  const rowCount = Math.ceil(items.length / columns);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        border: "1px solid var(--ft-border)",
      }}
    >
      {items.map((item, i) => (
        <StatCell
          key={item.label}
          {...item}
          isLastCol={(i + 1) % columns === 0 || i === items.length - 1}
          isLastRow={i >= (rowCount - 1) * columns}
        />
      ))}
    </div>
  );
}
