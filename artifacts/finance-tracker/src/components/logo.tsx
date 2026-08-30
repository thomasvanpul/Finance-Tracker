import { useState } from "react";

// Diagonal length: sqrt((21-7)²+(6-22)²) = sqrt(452) ≈ 21.26 — used
// for stroke-dasharray on the sequential-draw animation. Was 24.2
// when the diagonal ran corner-to-corner (6,23)→(22,5); the 30-Aug
// cap-collision fix pulled the endpoints one unit inward along the
// diagonal so the vertical strokes (drawn on top) hide the
// diagonal's round caps. See the diagonal <line> below for the
// geometry note.
const DIAG_LEN = 21.3;
const VERT_LEN = 18.5;

// Stroke widths — one constant per element, used by BOTH hover and rest
// paths. Previously two paths carried slightly different fudge factors
// (verticals 2.2/2.3, diagonal 2.2/2.4) that drifted rather than
// deliberately encoded a hover-thicken effect. If a future hover-weight
// change is wanted, edit the constants — the paths follow.
//
// Value picked for pixel alignment at the header size (28px). A 2-unit
// stroke centred on an integer coordinate (x=6 or x=22) covers pixels
// (C-1) to (C+1) exactly — 2 whole pixels of full coverage, no
// anti-aliased edges. A 2.2 stroke (the historical value) covered
// C-1.1 to C+1.1, spreading across 4 pixel columns with two soft edges
// and reading as a slightly blurred vertical. The 2.0 value costs ~9%
// of visual weight for a materially sharper header render. At 20px
// (tab bar) and 16px (favicon) the unit is sub-pixel, so no coordinate
// or width choice gets a crisp result — those sizes need distinct
// heavier-stroke variants (favicon.svg already ships heavier at
// public/favicon.svg; smaller phone sizes are a follow-up).
const STROKE_VERT = 2.0;
const STROKE_DIAG = 2.0;
const STROKE_RING = 1.6;   // element-level baseline; keyframes still animate it during the burst

export function LogoMark({ hovered = false, size = 28 }: { hovered?: boolean; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Numeris"
      style={{
        overflow: "visible",
        transform: hovered ? "scale(1.1)" : "scale(1)",
        transition: "transform 0.12s ease",
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

        /* ── traveling dot along diagonal ──
           Path matches the visible diagonal endpoints (7,22)→(21,6),
           updated in the 30-Aug cap-collision fix. Dot enters at the
           actual line start rather than the conceptual corner, so
           it appears to trace along the yellow stroke exactly. */
        @keyframes nr-travel {
          0%   { transform: translate(7px, 22px) scale(1.4); opacity: 1; }
          85%  { transform: translate(21px, 6px) scale(1.8); opacity: 0.9; }
          100% { transform: translate(21px, 6px) scale(0);   opacity: 0; }
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

      {/* ── Diagonal ── (drawn BEFORE the verticals so the vertical
           strokes cover the diagonal's round caps at the corners.
           Endpoints are pulled ONE UNIT INWARD along the diagonal —
           (6,23)→(7,22) and (22,5)→(21,6) — so the cap semicircles
           sit fully inside the 2-wide vertical strokes at x=6 and
           x=22. The vertical is drawn on top, painting over the cap
           entirely. No visible yellow blob at the corners; no soft
           cap-on-cap blend between the two stroke colours. This is
           the "clean deterministic edge" fix for BACKLOG G22.1 — a
           real mitre join would require a single-path single-colour
           mark, which loses the two-tone. */}
      {hovered
        ? <line key="hd" className="nr-draw-d"
            x1="7" y1="22" x2="21" y2="6"
            stroke="var(--ft-accent)" strokeWidth={STROKE_DIAG} strokeLinecap="round" />
        : <line key="id" className="nr-idle-diag"
            x1="7" y1="22" x2="21" y2="6"
            stroke="var(--ft-accent)" strokeWidth={STROKE_DIAG} strokeLinecap="round" />
      }

      {/* ── Left vertical stroke ── (butt caps: flush termination at
           y=5 and y=23. Round caps here would produce visible dots
           extending into the gap between the mark and the baseline
           at y=25. Butt gives a clean bounded mark.) */}
      {hovered
        ? <line key="hl" className="nr-draw-l"
            x1="6" y1="23" x2="6" y2="5"
            stroke="var(--ft-text)" strokeWidth={STROKE_VERT} strokeLinecap="butt" />
        : <line key="il"
            x1="6" y1="23" x2="6" y2="5"
            stroke="var(--nr-mark-vert)" strokeWidth={STROKE_VERT} strokeLinecap="butt" />
      }

      {/* ── Traveling dot along diagonal (hover only) ── */}
      {hovered && (
        <circle key="traveler" className="nr-traveler"
          cx="0" cy="0" r="2" fill="var(--ft-accent)" opacity="0" />
      )}

      {/* ── Right vertical stroke ── (butt caps, same reason as left) */}
      {hovered
        ? <line key="hr" className="nr-draw-r"
            x1="22" y1="5" x2="22" y2="23"
            stroke="var(--ft-text)" strokeWidth={STROKE_VERT} strokeLinecap="butt" />
        : <line key="ir"
            x1="22" y1="5" x2="22" y2="23"
            stroke="var(--nr-mark-vert)" strokeWidth={STROKE_VERT} strokeLinecap="butt" />
      }

      {/* ── Burst rings (hover only, timed after draw completes) ── */}
      {hovered && (
        <>
          <circle key="r1" className="nr-ring-1" cx="22" cy="5" r="2.8" fill="none" stroke="var(--ft-accent)" strokeWidth={STROKE_RING} opacity="0" />
          <circle key="r2" className="nr-ring-2" cx="22" cy="5" r="2.8" fill="none" stroke="var(--ft-accent)" strokeWidth={STROKE_RING} opacity="0" />
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

// size prop scales the whole lockup — mark + wordmark + tagline —
// so the auth-screen hero can lead with the mark without a wrapper
// transform. Existing sidebar/header callers pass no prop and get
// the same 28/13/8 sizing they always had.
export function Logo({ size = 28 }: { size?: number }) {
  const [hovered, setHovered] = useState(false);
  const wordSize = Math.round(size * 0.465);   // 28 → 13
  const tagSize  = Math.round(size * 0.286);   // 28 → 8
  const gap      = Math.round(size * 0.286);   // 28 → 8

  return (
    <div
      style={{ display: "flex", alignItems: "center", gap, cursor: "default", userSelect: "none" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <LogoMark hovered={hovered} size={size} />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{ display: "flex", letterSpacing: "0.12em" }}>
          {LETTERS.map((ch, i) => (
            <span
              key={i}
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: wordSize,
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
          fontSize: tagSize,
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
