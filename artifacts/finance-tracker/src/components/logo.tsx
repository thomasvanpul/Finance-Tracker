import { useState } from "react";

// Diagonal length: sqrt((22-6)²+(23-5)²) ≈ 24.1 — used for stroke-dasharray
const DIAG_LEN = 24.2;
const VERT_LEN = 18.5;

export function LogoMark({ hovered = false }: { hovered?: boolean }) {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Numeris"
      style={{
        overflow: "visible",
        transform: hovered ? "scale(1.1)" : "scale(1)",
        transition: "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)",
      }}
    >
      <style>{`
        /* ── idle ── */
        @keyframes nr-peak-idle {
          0%, 100% { filter: drop-shadow(0 0 3px var(--ft-accent)); }
          50%       { filter: drop-shadow(0 0 8px var(--ft-accent)); }
        }
        @keyframes nr-diag-idle {
          0%, 100% { opacity: 0.9; }
          50%       { opacity: 0.5; }
        }

        /* ── hover: sequential stroke draw ── */
        @keyframes nr-draw-left {
          0%   { stroke-dashoffset: ${VERT_LEN}; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes nr-draw-diag {
          0%   { stroke-dashoffset: ${DIAG_LEN}; }
          100% { stroke-dashoffset: 0; }
        }
        @keyframes nr-draw-right {
          0%   { stroke-dashoffset: ${VERT_LEN}; }
          100% { stroke-dashoffset: 0; }
        }

        /* ── traveling dot along diagonal ── */
        @keyframes nr-travel {
          0%   { transform: translate(6px, 23px) scale(1.4); opacity: 1; }
          85%  { transform: translate(22px, 5px)  scale(1.8); opacity: 0.9; }
          100% { transform: translate(22px, 5px)  scale(0);   opacity: 0; }
        }

        /* ── peak burst (two rings) ── */
        @keyframes nr-ring-1 {
          0%   { r: 2.8; opacity: 1;   stroke-width: 1.6; }
          100% { r: 10;  opacity: 0;   stroke-width: 0.4; }
        }
        @keyframes nr-ring-2 {
          0%   { r: 2.8; opacity: 0.6; stroke-width: 1; }
          100% { r: 16;  opacity: 0;   stroke-width: 0.2; }
        }

        /* ── ghost historical lines ── */
        @keyframes nr-ghost {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        /* ── baseline brightens ── */
        @keyframes nr-base-bright {
          0%, 100% { opacity: 0.55; }
          50%      { opacity: 0.85; }
        }

        /* class bindings */
        .nr-idle-peak { animation: nr-peak-idle 2.6s ease-in-out infinite; }
        .nr-idle-diag { animation: nr-diag-idle 2.6s ease-in-out infinite; }

        .nr-draw-l {
          stroke-dasharray: ${VERT_LEN};
          stroke-dashoffset: ${VERT_LEN};
          animation: nr-draw-left  0.18s ease-out 0s     forwards;
        }
        .nr-draw-d {
          stroke-dasharray: ${DIAG_LEN};
          stroke-dashoffset: ${DIAG_LEN};
          animation: nr-draw-diag  0.22s ease-out 0.15s  forwards;
        }
        .nr-draw-r {
          stroke-dasharray: ${VERT_LEN};
          stroke-dashoffset: ${VERT_LEN};
          animation: nr-draw-right 0.18s ease-out 0.35s  forwards;
        }

        .nr-traveler {
          transform-origin: 0 0;
          animation: nr-travel 0.37s cubic-bezier(0.4, 0, 0.2, 1) 0.15s both;
        }

        .nr-ring-1 { animation: nr-ring-1 0.55s ease-out 0.5s both; }
        .nr-ring-2 { animation: nr-ring-2 0.85s ease-out 0.53s both; }

        .nr-ghost-a { animation: nr-ghost 0.3s ease-out 0.28s both; }
        .nr-ghost-b { animation: nr-ghost 0.3s ease-out 0.35s both; }

        .nr-base-hover { animation: nr-base-bright 0.8s ease-out 0.4s both; }
      `}</style>

      {/* ── Ghost historical lines (hover only) ── */}
      {hovered && (
        <>
          <polyline
            className="nr-ghost-a"
            points="4,22 8,17 12,20 16,13 20,9"
            stroke="var(--ft-accent)" strokeWidth="0.9"
            strokeLinecap="round" strokeLinejoin="round"
            fill="none" opacity="0.2"
          />
          <polyline
            className="nr-ghost-b"
            points="4,24 9,21 13,22 17,18 22,14"
            stroke="var(--ft-accent)" strokeWidth="0.7"
            strokeLinecap="round" strokeLinejoin="round"
            fill="none" opacity="0.11"
          />
        </>
      )}

      {/* ── Left vertical stroke ── */}
      {hovered
        ? <line key="hl" className="nr-draw-l"
            x1="6" y1="23" x2="6" y2="5"
            stroke="var(--ft-text)" strokeWidth="2.3" strokeLinecap="round" />
        : <line key="il"
            x1="6" y1="23" x2="6" y2="5"
            stroke="var(--ft-text)" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      }

      {/* ── Diagonal ── */}
      {hovered
        ? <line key="hd" className="nr-draw-d"
            x1="6" y1="23" x2="22" y2="5"
            stroke="var(--ft-accent)" strokeWidth="2.4" strokeLinecap="round" />
        : <line key="id" className="nr-idle-diag"
            x1="6" y1="23" x2="22" y2="5"
            stroke="var(--ft-accent)" strokeWidth="2.2" strokeLinecap="round" />
      }

      {/* ── Traveling dot along diagonal (hover only) ── */}
      {hovered && (
        <circle key="traveler" className="nr-traveler"
          cx="0" cy="0" r="2" fill="var(--ft-accent)" opacity="0" />
      )}

      {/* ── Right vertical stroke ── */}
      {hovered
        ? <line key="hr" className="nr-draw-r"
            x1="22" y1="5" x2="22" y2="23"
            stroke="var(--ft-text)" strokeWidth="2.3" strokeLinecap="round" />
        : <line key="ir"
            x1="22" y1="5" x2="22" y2="23"
            stroke="var(--ft-text)" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
      }

      {/* ── Burst rings (hover only, timed after draw completes) ── */}
      {hovered && (
        <>
          <circle key="r1" className="nr-ring-1" cx="22" cy="5" r="2.8" fill="none" stroke="var(--ft-accent)" opacity="0" />
          <circle key="r2" className="nr-ring-2" cx="22" cy="5" r="2.8" fill="none" stroke="var(--ft-accent)" opacity="0" />
        </>
      )}

      {/* ── Peak dot ── */}
      <circle
        className="nr-idle-peak"
        cx="22" cy="5"
        r={hovered ? 3 : 2.4}
        fill="var(--ft-accent)"
        style={{ transition: "r 0.15s 0.5s" }}
      />

      {/* ── Baseline ── */}
      <line
        className={hovered ? "nr-base-hover" : undefined}
        x1="4" y1="25" x2="24" y2="25"
        stroke="var(--ft-accent)" strokeWidth="0.8" strokeLinecap="round"
        opacity={hovered ? undefined : 0.3}
      />
    </svg>
  );
}

const LETTERS = "NUMERIS".split("");

export function Logo() {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap: 8, cursor: "default", userSelect: "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <LogoMark hovered={hovered} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ display: "flex", letterSpacing: "0.12em" }}>
          {LETTERS.map((ch, i) => (
            <span
              key={i}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                fontWeight: 700,
                lineHeight: 1,
                color: hovered ? "var(--ft-accent)" : "var(--ft-text)",
                textShadow: hovered ? "0 0 8px var(--ft-accent)" : "none",
                transition: `color 0.07s ease ${i * 0.028}s, text-shadow 0.07s ease ${i * 0.028}s`,
              }}
            >
              {ch}
            </span>
          ))}
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.18em",
          lineHeight: 1,
          color: hovered ? "var(--ft-accent)" : "var(--ft-dim)",
          opacity: hovered ? 0.65 : 1,
          transition: "color 0.22s 0.14s, opacity 0.22s 0.14s",
        }}>
          PERSONAL OS
        </span>
      </div>
    </div>
  );
}
