export function LogoMark() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Numeris"
    >
      <style>{`
        @keyframes nr-peak-pulse {
          0%, 100% { opacity: 1; r: 2.4; filter: drop-shadow(0 0 3px var(--ft-accent)); }
          50%       { opacity: 0.55; r: 2.0; filter: drop-shadow(0 0 7px var(--ft-accent)); }
        }
        @keyframes nr-diagonal-glow {
          0%, 100% { opacity: 0.9; }
          50%       { opacity: 0.55; }
        }
        .nr-peak     { animation: nr-peak-pulse 2.6s ease-in-out infinite; }
        .nr-diagonal { animation: nr-diagonal-glow 2.6s ease-in-out infinite; }
      `}</style>

      {/* Left vertical stroke */}
      <line
        x1="6" y1="23"
        x2="6" y2="5"
        stroke="var(--ft-text)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Rising diagonal — goes upward from bottom-left to top-right (the chart trend) */}
      <line
        className="nr-diagonal"
        x1="6" y1="23"
        x2="22" y2="5"
        stroke="var(--ft-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Right vertical stroke */}
      <line
        x1="22" y1="5"
        x2="22" y2="23"
        stroke="var(--ft-text)"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.85"
      />

      {/* Peak dot — accent colour, pulsing glow */}
      <circle className="nr-peak" cx="22" cy="5" r="2.4" fill="var(--ft-accent)" />

      {/* Subtle baseline */}
      <line
        x1="4" y1="25"
        x2="24" y2="25"
        stroke="var(--ft-accent)"
        strokeWidth="0.8"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <LogoMark />
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          fontWeight: 700,
          color: "var(--ft-text)",
          letterSpacing: "0.12em",
          lineHeight: 1,
        }}>
          NUMERIS
        </span>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          color: "var(--ft-dim)",
          letterSpacing: "0.18em",
          lineHeight: 1,
        }}>
          PERSONAL OS
        </span>
      </div>
    </div>
  );
}
