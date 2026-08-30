// Badge — small status chip. Mono, semantic border + tinted background.
// Hand-rolled ~10 sites in profile alone (session active, email
// verified, persona code, etc.).
//
// Rectangular, not pill — Anti-Vibe REQUIRED "rect chips on financial
// category labels" applies to identity chips too. Amendment permits
// 16-24px radius on cards/buttons but keeps chip-shape distinctions.
// 2px radius here is the hairline compromise that reads as "chip" not
// "pill" and matches the existing hand-rolled sites.
//
// Amendment lines followed:
//   :77  mono at var(--ft-text-xs) = 11 (raised from historical 8-9)

type BadgeTone = "success" | "warn" | "danger" | "info" | "muted";

const TONE_BORDER: Record<BadgeTone, string> = {
  success: "var(--ft-green)",
  warn:    "var(--ft-amber)",
  danger:  "var(--ft-red)",
  info:    "var(--ft-accent)",
  muted:   "var(--ft-dim)",
};

const TONE_COLOUR: Record<BadgeTone, string> = {
  success: "var(--ft-green)",
  warn:    "var(--ft-amber)",
  danger:  "var(--ft-red)",
  info:    "var(--ft-accent)",
  muted:   "var(--ft-dim)",
};

const TONE_BG_MIX: Record<BadgeTone, string> = {
  success: "color-mix(in srgb, var(--ft-green) 12%, transparent)",
  warn:    "color-mix(in srgb, var(--ft-amber) 12%, transparent)",
  danger:  "color-mix(in srgb, var(--ft-red) 12%, transparent)",
  info:    "color-mix(in srgb, var(--ft-accent) 10%, transparent)",
  muted:   "color-mix(in srgb, var(--ft-dim) 10%, transparent)",
};

interface BadgeProps {
  label: string;
  tone: BadgeTone;
}

export function Badge({ label, tone }: BadgeProps) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 6px",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--ft-text-xs)",
        letterSpacing: "0.08em",
        color: TONE_COLOUR[tone],
        background: TONE_BG_MIX[tone],
        border: `1px solid ${TONE_BORDER[tone]}`,
        borderRadius: 2,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}
