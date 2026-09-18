import type { ReactNode } from "react";
import { DrillTarget } from "@/components/drill";
import { MonoLabel, Text } from "@/components/primitives";
import { PHONE_GUTTER, PHONE_IN_GROUP, PHONE_ROW_PY } from "@/components/phone/rhythm";

// HOME's headline, set as the first reading of a strip rather than as a
// fintech hero.
//
// Until 16 Sep 2026 the figure stood alone under 44px of empty top bar: a
// big number in whitespace with a small dim £ beside it, the opening of
// every finance app. The desktop states net worth as one cell in a strip of
// figures, in mono, on rules. This is that strip at phone scale:
//
//   NET WORTH                       ← legend
//   £216,389.76                     ← the reading, mono, 30px (Amendment :77)
//   ─────────────────────────────── ← full-bleed hairline
//   ACCOUNTS      │ CLAIMED · 3 DEBTS
//   8             │ −£48.00         ← the readings that were scattered round it
//   ───────────────────────────────
//
// The figure is still the largest thing on the screen. What changed is that
// it now belongs to something: it has neighbours, and rules either side.
// The £ is set at the figure's size and dimmed rather than shrunk, so the
// currency reads as part of the value, not as a decoration beside it.

export interface HeroCell {
  key: string;
  label: string;
  value: ReactNode;
  href: string;
  title: string;
}

const HERO_SIZE = 30;

export function HomeHero({
  label,
  symbol,
  figure,
  href,
  hrefTitle,
  under,
  cells,
}: {
  label: string;
  symbol: string;
  figure: string;
  href?: string;
  hrefTitle?: string;
  under?: ReactNode;
  cells: HeroCell[];
}) {
  const reading = (
    <Text as="span" mono size={HERO_SIZE} weight={600} lineHeight={`${HERO_SIZE + 4}px`} letterSpacing="-0.02em" numeric>
      <span style={{ color: "var(--ft-dim)" }}>{symbol}</span>
      {figure}
    </Text>
  );
  return (
    <div>
      <div style={{ padding: `12px ${PHONE_GUTTER}px 10px` }}>
        <MonoLabel size={11} letterSpacing="0.16em">{label}</MonoLabel>
        <div style={{ marginTop: PHONE_IN_GROUP }}>
          {href ? (
            <DrillTarget href={href} title={hrefTitle ?? label}>
              <span className="ft-drill">{reading}</span>
            </DrillTarget>
          ) : reading}
        </div>
        {under}
      </div>
      {cells.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
            borderTop: "1px solid var(--ft-border)",
            borderBottom: "1px solid var(--ft-border)",
          }}
        >
          {cells.map((c, i) => (
            <DrillTarget key={c.key} href={c.href} title={c.title}>
              <div
                style={{
                  minHeight: 44,
                  padding: `${PHONE_ROW_PY}px ${PHONE_GUTTER}px`,
                  borderLeft: i > 0 ? "1px solid var(--ft-border)" : "none",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <MonoLabel size={11} letterSpacing="0.1em">{c.label}</MonoLabel>
                <span className="ft-drill" style={{ alignSelf: "flex-start" }}>
                  <Text as="span" mono size={13} weight={600} numeric>{c.value}</Text>
                </span>
              </div>
            </DrillTarget>
          ))}
        </div>
      )}
    </div>
  );
}
