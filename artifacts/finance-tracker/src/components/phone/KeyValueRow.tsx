import type { ReactNode } from "react";
import { HoverRow } from "./HoverRow";

// KeyValueRow — the row-with-right-value shape. Mono label left, mono
// pnum value right, optional sub-line below label. Hand-rolled 3× in
// profile alone (UsageStorageRow, AuthProviderRow, several inline sites),
// same shape across settings and accounts.
//
// When onTap is set the row is tappable — Amendment :74 44-min tap
// target applies, and the pointer becomes a hand.
//
// Amendment lines followed:
//   :74  min 44 tap target when tappable
//   :77  mono at var(--ft-text-xs) = 11
//   :90  tabular-nums on the value (via .pnum) when value is text

interface KeyValueRowProps {
  label: string;
  value: string | ReactNode;
  sub?: string;
  onTap?: () => void;
  isLast?: boolean;
}

export function KeyValueRow({ label, value, sub, onTap, isLast }: KeyValueRowProps) {
  return (
    <HoverRow
      onClick={onTap}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 16px",
        minHeight: onTap ? 44 : undefined,
        borderBottom: isLast ? undefined : "1px solid var(--ft-border)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--ft-text-xs)",
            color: "var(--ft-muted)",
          }}
        >
          {label}
        </span>
        {sub && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "var(--ft-text-xs)",
              color: "var(--ft-dim)",
            }}
          >
            {sub}
          </span>
        )}
      </div>
      <span
        className={typeof value === "string" ? "pnum" : undefined}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--ft-text-xs)",
          color: "var(--ft-text)",
          fontWeight: 700,
          flexShrink: 0,
        }}
      >
        {value}
      </span>
    </HoverRow>
  );
}
