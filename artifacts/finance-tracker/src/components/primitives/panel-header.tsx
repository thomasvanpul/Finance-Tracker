import type { ReactNode } from "react";

// ── PanelHeader ─────────────────────────────────────────────────────────────
// The one section header. It sits INSIDE the panel frame as the frame's
// internal rule, never floating above unframed content. Fixed height from
// --ft-panel-header-h (density-aware), 12px title from .ft-panel-label, a
// hairline below, and an optional right-hand slot for controls.
//
// No accent dot, no coloured stripe, no raised background: the frame around
// the panel is what says "this is one object", and a 3px accent border is
// the single most cited AI-design tell. Where an accent carried meaning it
// belongs on the label text or a leading glyph passed in as children.
//
// No `style?` escape hatch — see the primitives rule in CLAUDE.md.

interface PanelHeaderProps {
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}

export function PanelHeader({ children, right, className }: PanelHeaderProps) {
  return (
    <div
      className={className}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
        minHeight: "var(--ft-panel-header-h)",
        padding: "0 12px",
        borderBottom: "1px solid var(--ft-border)",
        transition: "var(--ft-theme-transition)",
      }}
    >
      <span className="ft-panel-label" style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
        {children}
      </span>
      {right !== undefined && right !== null && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {right}
        </div>
      )}
    </div>
  );
}
