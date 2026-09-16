import type { ReactNode } from "react";
import { HoverRow } from "./HoverRow";
import { DrillTarget } from "@/components/drill";

// StatGrid — the "border-as-gap" stat grid Thomas reads well narrow.
// Merges profile's KpiStrip + accounts's isFinancial + accounts's icon
// slot — six hand-rolled implementations across
// pages/{profile,accounts,settings}.tsx, components/widgets/net-worth.tsx,
// pages/split.tsx, pages/investments/markets-tab.tsx today.
//
// Square by design — Amendment :55 keeps aligned metric columns square.
// The 1px frame is the only line. Until 16 Sep 2026 every cell also drew
// borderRight / borderBottom, which is the ruled KPI grid DESIGN.md §5
// withdrew: cells inside a framed panel carry no border and no band fill,
// and the cell padding is what separates the columns.
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
  /**
   * Where this figure came from, when it is a sum over rows (DESIGN.md §14).
   * The whole cell becomes the target so a thumb has 44px to land on, and
   * the underline sits on the figure alone.
   */
  href?: string;
}

interface StatGridProps {
  items: StatGridItem[];
  columns?: 1 | 2 | 3 | 4;
}

type StatCellProps = StatGridItem;

function StatCell({ label, value, sub, accent, icon, isFinancial, href }: StatCellProps) {
  const cell = (
    <HoverRow
      style={{
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
        // With a drill the anchor is the grid item, so the cell has to fill
        // it or the hover tint stops short of the row below.
        flex: href ? 1 : undefined,
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
        {href ? <span className="ft-drill">{value}</span> : value}
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
  if (!href) return cell;
  return (
    <DrillTarget
      href={href}
      title={`${label} — open what it is made of`}
      style={{ display: "flex", flexDirection: "column", minWidth: 0 }}
    >
      {cell}
    </DrillTarget>
  );
}

export function StatGrid({ items, columns = 2 }: StatGridProps) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        border: "1px solid var(--ft-border)",
        background: "var(--ft-surface)",
      }}
    >
      {items.map((item) => (
        <StatCell
          key={item.label}
          {...item}
        />
      ))}
    </div>
  );
}
