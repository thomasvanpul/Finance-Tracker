import type { ReactNode } from "react";

// TabStrip — segment-control tab bar with 2px accent underline on active.
// Hand-rolled 3× (profile.tsx TabButton, accounts.tsx :1957, settings.tsx
// :2568). Same shape everywhere: mono 11 letter-spaced 0.1em uppercase,
// 2px borderBottom in accent when active, marginBottom -1 to overlap the
// container's own border.
//
// Distinct from the PhoneTabBar (which is the shell's 5-tab bottom nav).
// TabStrip is a horizontal segment control WITHIN a screen — WORTH's
// CASH/HOLDINGS lens, SPENDING's TXNS/BUDGET/BREAKDOWN, etc.
//
// Amendment lines followed:
//   :74  min 44 tap target on each tab button
//   :77  mono at var(--ft-text-xs) = 11

export interface TabStripTab {
  id: string;
  label: string;
  icon?: ReactNode;
}

interface TabStripProps {
  tabs: readonly TabStripTab[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function TabStrip({ tabs, activeId, onSelect }: TabStripProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        background: "var(--ft-surface)",
        borderBottom: "1px solid var(--ft-border)",
        paddingLeft: 12,
        paddingRight: 12,
        overflowX: "auto",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelect(tab.id)}
            style={{
              minHeight: 44,
              padding: "0 12px",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontFamily: "var(--font-mono)",
              fontSize: "var(--ft-text-xs)",
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              background: isActive
                ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))"
                : "transparent",
              border: "none",
              borderBottom: isActive ? "2px solid var(--ft-accent)" : "2px solid transparent",
              marginBottom: -1,
              color: isActive ? "var(--ft-accent)" : "var(--ft-muted)",
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
