import type { ReactNode, CSSProperties } from "react";

interface PanelHeaderProps {
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
}

export function PanelHeader({ children, style, className }: PanelHeaderProps) {
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
        ...style,
      }}
    >
      {children}
    </div>
  );
}
