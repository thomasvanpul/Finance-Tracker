import type { ReactNode } from "react";

// ── PanelHeader ─────────────────────────────────────────────────────────────
// Mono uppercase panel title strip. Fixed padding, border-bottom, tone.
// No `style?` escape hatch — was here for symmetry with PanelBox, no caller
// ever passed one, removed to make the CLAUDE.md primitives rule hold.

interface PanelHeaderProps {
  children: ReactNode;
  className?: string;
}

export function PanelHeader({ children, className }: PanelHeaderProps) {
  return (
    <div
      className={className}
      style={{
        padding: "var(--ft-cell-py) var(--ft-cell-px)",
        borderBottom: "1px solid var(--ft-border)",
        fontFamily: "var(--font-mono)",
        fontSize: 9,
        letterSpacing: "0.08em",
        textTransform: "uppercase" as const,
        color: "var(--ft-dim)",
        transition: "var(--ft-theme-transition)",
      }}
    >
      {children}
    </div>
  );
}
