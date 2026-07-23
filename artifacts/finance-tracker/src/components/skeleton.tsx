import React from "react";

interface SkeletonProps {
  width?: string | number;
  height?: number;
  lines?: number;
}

const shimmerStyle = `
@keyframes ft-skeleton-shimmer {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}
`;

let injected = false;
function injectKeyframes() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.textContent = shimmerStyle;
  document.head.appendChild(style);
}

export function Skeleton({ width = "100%", height = 12, lines = 1 }: SkeletonProps) {
  injectKeyframes();

  const barStyle: React.CSSProperties = {
    display: "block",
    width: typeof width === "number" ? `${width}px` : width,
    height: height,
    background:
      "linear-gradient(90deg, var(--ft-border) 25%, var(--ft-raised) 50%, var(--ft-border) 75%)",
    backgroundSize: "200% 100%",
    animation: "ft-skeleton-shimmer 1.6s ease-in-out infinite",
  };

  if (lines <= 1) {
    return <span style={barStyle} />;
  }

  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 8, width: typeof width === "number" ? `${width}px` : width }}>
      {Array.from({ length: lines }).map((_, i) => (
        <span
          key={i}
          style={{
            ...barStyle,
            width: i === lines - 1 && lines > 1 ? "70%" : "100%",
          }}
        />
      ))}
    </span>
  );
}
