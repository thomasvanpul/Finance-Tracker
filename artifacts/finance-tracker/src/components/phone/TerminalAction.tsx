// TerminalAction — the `> export.json()` affordance from profile.tsx.
// Mono, accent colour, prefix character. Reads as a shell prompt; the
// action name looks like a function call. Extracted so future terminal-
// style actions (`> import.csv()`, `> resend.verification()`) reuse the
// shape.
//
// Amendment lines followed:
//   :54  border-radius on buttons (subtle 4px — not pill, per
//        Anti-Vibe rect-chip rule)
//   :74  min 44 tap target
//   :77  mono at var(--ft-text-xs) = 11

interface TerminalActionProps {
  label: string;
  onClick: () => void;
  prefix?: string;
}

export function TerminalAction({ label, onClick, prefix = ">" }: TerminalActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        minHeight: 44,
        padding: "0 12px",
        background: "transparent",
        border: "1px solid var(--ft-border)",
        borderRadius: 4,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--ft-text-xs)",
        color: "var(--ft-accent)",
        cursor: "pointer",
        userSelect: "none",
        letterSpacing: "0.02em",
      }}
    >
      <span aria-hidden style={{ color: "var(--ft-dim)" }}>{prefix}</span>
      <span>{label}</span>
    </button>
  );
}
