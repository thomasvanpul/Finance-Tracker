import type { ReactNode } from "react";

// ── PanelBox ────────────────────────────────────────────────────────────────
// The standard bordered surface: --ft-surface background, 1px --ft-border,
// overflow: hidden, theme-transition. Surface only.
//
// Layout goes inside via HStack / VStack — the primitives family split is
// hard: Stack owns layout, PanelBox owns surface, one-offs stay inline,
// and if a property is neither layout nor surface it goes on neither
// primitive. See CLAUDE.md.
//
// No `style?` escape hatch, no `row`, no `gap`. All three were exceptions
// that grew back toward "it's just a div"; removed.

interface PanelBoxProps {
  children: ReactNode;
  className?: string;
  padding?: string | number;
  borderTop?: string;
}

export function PanelBox({ children, className, padding, borderTop }: PanelBoxProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        overflow: "hidden",
        transition: "var(--ft-theme-transition)",
        ...(padding !== undefined ? { padding } : {}),
        ...(borderTop !== undefined ? { borderTop } : {}),
      }}
    >
      {children}
    </div>
  );
}
