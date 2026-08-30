import { useState, type CSSProperties, type ReactNode } from "react";

// HoverRow — hover-tint wrapper for interactive rows. Hover doesn't fire
// on touch so this becomes a no-op on phone, but the primitive is used
// on tablet and desktop-emulator views of the same components. Kept as
// a small primitive because it's hand-rolled 3+ times across
// profile/settings/accounts today.

interface HoverRowProps {
  children: ReactNode;
  style?: CSSProperties;
  onClick?: () => void;
}

export function HoverRow({ children, style, onClick }: HoverRowProps) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        background: hov ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "transparent",
        transition: "background 0.12s",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
