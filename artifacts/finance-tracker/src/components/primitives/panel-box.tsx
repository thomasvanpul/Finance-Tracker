import type { ReactNode, CSSProperties } from "react";

interface PanelBoxProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  padding?: string | number;
  borderTop?: string;
  row?: boolean;
  gap?: number | string;
}

export function PanelBox({ children, style, className, padding, borderTop, row, gap }: PanelBoxProps) {
  return (
    <div
      className={className}
      style={{
        background: "var(--ft-surface)",
        border: "1px solid var(--ft-border)",
        overflow: "hidden",
        ...(padding !== undefined ? { padding } : {}),
        ...(borderTop !== undefined ? { borderTop } : {}),
        ...(row ? { display: "flex", flexWrap: "wrap" as const, alignItems: "center" } : {}),
        ...(gap !== undefined ? { gap } : {}),
        ...style,
      }}
    >
      {children}
    </div>
  );
}
