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

// Every panel surface in the app carries `ft-panelbox`, in addition to
// whatever the caller passed. It changes nothing on its own — the surface is
// still drawn by the inline styles below — but it makes the surface
// ADDRESSABLE from the stylesheet, which it was not.
//
// That matters more than it sounds. Five rounds of design work aimed at "the
// page reads as boxed" edited .ft-panel and .ft-widget-frame in index.css,
// and the dashboard's panels are none of those: they are this component's
// inline border, which no stylesheet rule could name and therefore no
// stylesheet rule could reach. A prototype of the page without frames was
// literally unbuildable in CSS.
const PANEL_BOX_CLASS = "ft-panelbox";

export function PanelBox({ children, className, padding, borderTop }: PanelBoxProps) {
  return (
    <div
      className={className === undefined ? PANEL_BOX_CLASS : `${PANEL_BOX_CLASS} ${className}`}
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
