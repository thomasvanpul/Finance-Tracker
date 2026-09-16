import type { ReactNode } from "react";

// SectionHeader — the mono-uppercase section titlebar used across the
// wrapped desktop pages Thomas already reads well narrow. Left slot for
// label + optional icon; right slot for status / count / badge.
//
// tone colours the label text. It never draws an edge (DESIGN.md §4).
//
// This is unframed page structure (DESIGN.md §6), so it draws what §2 gives
// SectionRule: the label and a hairline beneath, no fill, inset to the same
// 16px content edge as the rows under it. Until 16 Sep 2026 it sat on a
// --ft-raised band with a 12px inset — a box drawn without a line (§5), and
// the one left edge on the phone that matched nothing below it.
//
// Amendment lines followed (src/index.css:47–94):
//   :77  mono label at var(--ft-text-xs) = 11px (raised from historical
//        9-10px on the hand-rolled sites during extraction, per the
//        30 Aug survey — "extraction is when Amendment fixes land, not
//        after")

type SectionHeaderTone = "default" | "accent" | "blue" | "red" | "amber" | "cyan" | "muted";

const TONE_COLOUR: Record<SectionHeaderTone, string | null> = {
  default: null,
  accent:  "var(--ft-accent)",
  blue:    "var(--ft-blue)",
  red:     "var(--ft-red)",
  amber:   "var(--ft-amber)",
  cyan:    "var(--ft-cyan)",
  muted:   "var(--ft-muted)",
};

interface SectionHeaderProps {
  label: string;
  right?: ReactNode;
  tone?: SectionHeaderTone;
  icon?: ReactNode;
}

export function SectionHeader({ label, right, tone = "default", icon }: SectionHeaderProps) {
  const toneColour = TONE_COLOUR[tone];
  return (
    <div
      style={{
        borderBottom: "1px solid var(--ft-border)",
        paddingLeft: 16,
        paddingRight: 16,
        minHeight: 34,
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontFamily: "var(--font-mono)",
        fontSize: "var(--ft-text-xs)",
        fontWeight: 600,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        color: toneColour ?? "var(--ft-muted)",
      }}
    >
      {icon}
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {right}
    </div>
  );
}
