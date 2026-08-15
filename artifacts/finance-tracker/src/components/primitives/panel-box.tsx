import type { ReactNode } from "react";

// ── PanelBox ────────────────────────────────────────────────────────────────
// The standard bordered surface: --ft-surface background, 1px --ft-border,
// overflow: hidden, theme-transition. No `style?` escape hatch — the earlier
// version had one and it was the leak the primitives family exists to close.
//
// Surface only. Layout goes inside via HStack / VStack. If a call site needs
// something PanelBox doesn't have, either it isn't a PanelBox (use inline
// styles for one-offs, or propose a new surface primitive) or the missing
// prop is genuinely a surface concern and can be added here explicitly.

interface PanelBoxProps {
  children: ReactNode;
  className?: string;
  padding?: string | number;
  borderTop?: string;
  /** @deprecated — layout on a surface. Wrap children in `<HStack>` instead.
   *  Will be removed once existing callers migrate. */
  row?: boolean;
  /** @deprecated — layout on a surface. Use the enclosing Stack's `gap`. */
  gap?: number | string;
}

export function PanelBox({ children, className, padding, borderTop, row, gap }: PanelBoxProps) {
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
        ...(row ? { display: "flex", flexWrap: "wrap" as const, alignItems: "center" } : {}),
        ...(gap !== undefined ? { gap } : {}),
      }}
    >
      {children}
    </div>
  );
}
