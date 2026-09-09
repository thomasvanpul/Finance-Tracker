// ── Marks the eight designs draw with ───────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Sharing a LAYOUT between designs answers the question four times the same
// way, which is the mistake the last round made. Sharing a MARK does not: a
// sparkline is a sparkline in Stripe and in Bloomberg, and the difference
// between those two products is where it sits, how big it is and what else
// is beside it — not whether their polylines are drawn differently.
//
// Every mark encodes value as LENGTH or AREA (DESIGN.md — depth is
// decoration, never data), takes its colour from a --ft-* token, and renders
// nothing at all rather than a flat line when it has no values. An empty
// sparkline that looks like "no change" is a fabricated reading.

interface SparkProps {
  values: number[];
  width: number;
  height: number;
  color: string;
  /** Draw the area under the line as well, at low opacity. */
  fill?: boolean;
  strokeWidth?: number;
}

/** A polyline over an index axis. Baseline is the series minimum, not zero:
 *  these are shape indicators beside a figure that already states the level,
 *  and a zero baseline flattens every one of them into the same line. */
export function Spark({ values, width, height, color, fill = false, strokeWidth = 1.25 }: SparkProps) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const x = (i: number) => (i / (values.length - 1)) * width;
  const y = (v: number) => (span === 0 ? height / 2 : height - ((v - min) / span) * height);
  const points = values.map((v, i) => `${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: "block", overflow: "visible" }}>
      {fill && (
        <polygon points={`0,${height} ${points} ${width},${height}`} fill={color} opacity={0.14} />
      )}
      <polyline points={points} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

interface ColumnsProps {
  values: number[];
  width: number;
  height: number;
  /** Colour per column, so a sign can be read without a legend. */
  colorAt: (value: number, index: number) => string;
  gap?: number;
}

/** Columns from a shared zero line, so positive and negative read as
 *  opposite directions rather than as two lengths of the same thing. */
export function Columns({ values, width, height, colorAt, gap = 3 }: ColumnsProps) {
  if (values.length === 0) return null;
  const extent = Math.max(...values.map((v) => Math.abs(v)));
  if (extent === 0) return null;
  const slot = width / values.length;
  const barWidth = Math.max(1, slot - gap);
  const zero = height / 2;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" style={{ display: "block" }}>
      <line x1={0} y1={zero} x2={width} y2={zero} stroke="var(--ft-border)" strokeWidth={1} />
      {values.map((v, i) => {
        const h = (Math.abs(v) / extent) * (height / 2);
        return (
          <rect
            key={i}
            x={i * slot + gap / 2}
            y={v >= 0 ? zero - h : zero}
            width={barWidth}
            height={Math.max(1, h)}
            fill={colorAt(v, i)}
          />
        );
      })}
    </svg>
  );
}

/** A single proportion, as a filled length. The one mark every ranked list
 *  in this round uses, because a rank without a magnitude is an ordering
 *  and the magnitudes here differ by two orders. */
export function ShareBar({ share, width, height, color, track }: {
  share: number; width: number | string; height: number; color: string; track?: string;
}) {
  const pct = Math.max(0, Math.min(1, share));
  return (
    <div style={{ width, height, background: track ?? "var(--ft-border)", position: "relative", overflow: "hidden" }} aria-hidden="true">
      <div style={{ position: "absolute", inset: 0, width: `${(pct * 100).toFixed(2)}%`, background: color }} />
    </div>
  );
}

/** One horizontal bar split into segments. Used where the whole is the
 *  point (composition, currency exposure) and the parts are read against
 *  each other rather than against a scale. */
export function StackBar({ parts, height }: { parts: { key: string; share: number; color: string }[]; height: number }) {
  if (parts.length === 0) return null;
  return (
    <div style={{ display: "flex", width: "100%", height, overflow: "hidden" }} aria-hidden="true">
      {parts.map((p) => (
        <div key={p.key} style={{ width: `${(p.share * 100).toFixed(3)}%`, background: p.color }} />
      ))}
    </div>
  );
}

/** The identity ramp, for series that are categories rather than states
 *  (DESIGN.md §11: blue and the id slots are categorical, and carry no
 *  affordance). Wraps at 12, which is how many the ramp defines. */
export function idColor(index: number): string {
  return `var(--ft-id-${(index % 12) + 1})`;
}
