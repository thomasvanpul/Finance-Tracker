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
  // --ft-accent means "you can press this" (DESIGN.md §11), so only a row
  // with an onClick earns the accent-tinted hover. A row with no onClick
  // isn't pressable, so it gets the neutral --ft-hover wash instead.
  const tint = onClick ? "color-mix(in srgb, var(--ft-accent) 6%, var(--ft-surface))" : "var(--ft-hover)";
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        background: hov ? tint : "transparent",
        transition: "background 0.12s",
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
