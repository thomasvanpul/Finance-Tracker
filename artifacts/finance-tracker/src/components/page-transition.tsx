import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useFintrackTheme } from "@/contexts/theme-context";

function readTransitionPref(): string {
  try { return localStorage.getItem("nr-theme-transition") ?? "fade"; } catch { return "fade"; }
}

function getBracketColor(theme: string): string {
  switch (theme) {
    case "phosphor":   return "#7FFF00";
    case "amber":      return "#FFD700";
    case "matrix":     return "#00FF41";
    case "bloodline":  return "#C80000";
    case "synthwave":  return "#ff00ff";
    case "deep-space": return "#6495ED";
    case "mario":      return "#ef4444";
    case "gilded":     return "#FFD700";
    case "arctic":     return "#79C0FF";
    case "midnight":   return "#7B68EE";
    default:           return "var(--ft-accent)";
  }
}

type Phase = "idle" | "draw" | "hold" | "fade";

const BRACKET_SIZE = 22; // px — how long each arm of the L-bracket is
const THICKNESS = 1.5;   // px — line weight

export function PageTransitionOverlay() {
  const [location] = useLocation();
  const { theme } = useFintrackTheme();
  const [phase, setPhase] = useState<Phase>("idle");
  const prevLocation = useRef(location);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useEffect(() => {
    if (location === prevLocation.current) return;
    prevLocation.current = location;
    if (readTransitionPref() === "none") return;

    clear();
    setPhase("draw");
    timers.current.push(setTimeout(() => setPhase("hold"), 240));
    timers.current.push(setTimeout(() => setPhase("fade"), 380));
    timers.current.push(setTimeout(() => setPhase("idle"), 580));

    return clear;
  }, [location]);

  if (phase === "idle") return null;

  const color = getBracketColor(theme);
  const glow = `0 0 8px ${color}88`;

  const armLength = phase === "draw" || phase === "hold" ? BRACKET_SIZE : 0;
  const opacity   = phase === "fade" ? 0 : 1;

  const armStyle = (dir: "w" | "h") =>
    ({
      position: "absolute" as const,
      background: color,
      boxShadow: glow,
      transition:
        phase === "draw"
          ? `${dir === "w" ? "width" : "height"} 0.22s cubic-bezier(0.4,0,0.2,1)`
          : phase === "hold"
          ? "none"
          : `${dir === "w" ? "width" : "height"} 0.18s ease, opacity 0.18s ease`,
      opacity,
      ...(dir === "w"
        ? { height: THICKNESS, width: armLength }
        : { width: THICKNESS, height: armLength }),
    });

  const corners = [
    { label: "tl", outer: { top:  8, left:  8 }, h: { top: 0, left: 0 }, w: { top: 0, left: 0 } },
    { label: "tr", outer: { top:  8, right: 8 }, h: { top: 0, right: 0 }, w: { top: 0, right: 0 } },
    { label: "bl", outer: { bottom: 8, left: 8 }, h: { bottom: 0, left: 0 }, w: { bottom: 0, left: 0 } },
    { label: "br", outer: { bottom: 8, right: 8 }, h: { bottom: 0, right: 0 }, w: { bottom: 0, right: 0 } },
  ];

  return (
    <>
      {corners.map(({ label, outer, h, w }) => (
        <div
          key={label}
          style={{
            position: "fixed",
            zIndex: 9999,
            pointerEvents: "none",
            width: BRACKET_SIZE,
            height: BRACKET_SIZE,
            ...outer,
          }}
        >
          {/* horizontal arm */}
          <div style={{ ...armStyle("w"), ...w }} />
          {/* vertical arm */}
          <div style={{ ...armStyle("h"), ...h }} />
        </div>
      ))}
    </>
  );
}
