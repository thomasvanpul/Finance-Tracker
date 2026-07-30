// Reusable SVG chart primitives for mobile screens

function smoothPath(pts: [number, number][]): string {
  if (pts.length < 2) return '';
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    const cpx = ((pts[i - 1][0] + pts[i][0]) / 2).toFixed(2);
    d += ` C ${cpx},${pts[i - 1][1].toFixed(2)} ${cpx},${pts[i][1].toFixed(2)} ${pts[i][0].toFixed(2)},${pts[i][1].toFixed(2)}`;
  }
  return d;
}

function scalePts(data: number[], w: number, h: number, pad = 4): [number, number][] {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  return data.map((v, i) => [
    data.length > 1 ? (i / (data.length - 1)) * w : w / 2,
    pad + (1 - (v - min) / range) * (h - pad * 2),
  ]);
}

function polarXY(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

// ── SparkArea ────────────────────────────────────────────────────────────────
// Full-width area chart with gradient fill. Use preserveAspectRatio="none" to
// stretch horizontally inside whatever container it lives in.

interface SparkAreaProps {
  data: number[];
  height?: number;
  color?: string;
}

export function SparkArea({ data, height = 48, color = 'var(--ft-accent)' }: SparkAreaProps) {
  if (data.length < 2) return null;
  const VW = 260;
  const VH = height;
  const gradId = `spa-${color.replace(/[^a-zA-Z0-9]/g, '_')}`;
  const pts = scalePts(data, VW, VH);
  const linePath = smoothPath(pts);
  const areaPath = `${linePath} L${VW},${VH} L0,${VH} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      width="100%"
      height={VH}
      style={{ display: 'block' }}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.22} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r={3} fill={color} />
    </svg>
  );
}

// ── MiniSparkLine ─────────────────────────────────────────────────────────────
// Compact 56×22 sparkline for use in list rows (investment tickers, etc.)

interface MiniSparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  positive?: boolean;
  color?: string;
}

export function MiniSparkLine({ data, width = 56, height = 22, positive = true, color: colorProp }: MiniSparkLineProps) {
  if (data.length < 2) return null;
  const color = colorProp ?? (positive ? 'var(--ft-green)' : 'var(--ft-red)');
  const pts = scalePts(data, width, height, 2);
  const linePath = smoothPath(pts);

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── DonutChart ────────────────────────────────────────────────────────────────
// Ring/donut chart for category breakdowns. Segments sorted largest first.
// A 2° gap separates adjacent segments for legibility.

interface DonutSegment {
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
}

export function DonutChart({ segments, size = 100, thickness = 13 }: DonutChartProps) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const GAP = segments.length > 1 ? 2.5 : 0;

  let angle = -90;

  const paths = segments.map((seg, i) => {
    const sweep = (seg.value / total) * 360;
    const drawSweep = sweep - GAP;
    const startA = angle + GAP / 2;
    const endA = angle + sweep - GAP / 2;
    angle += sweep;

    if (drawSweep <= 0) return null;

    const [x1, y1] = polarXY(cx, cy, r, startA);
    const [x2, y2] = polarXY(cx, cy, r, endA);
    const large = drawSweep > 180 ? 1 : 0;

    return (
      <path
        key={i}
        d={`M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`}
        fill="none"
        stroke={seg.color}
        strokeWidth={thickness}
        strokeLinecap="butt"
      />
    );
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--ft-raised)" strokeWidth={thickness} />
      {paths}
    </svg>
  );
}

// ── ArcGauge ──────────────────────────────────────────────────────────────────
// Semicircular speedometer-style gauge. Arc runs from 9 o'clock to 3 o'clock
// through the top (counter-clockwise relative to screen). Uses stroke-dasharray
// trick: rotate(180°) moves start from 3 o'clock to 9 o'clock, then we fill
// clockwise through the top.

interface ArcGaugeProps {
  pct: number;
  size?: number;
  thickness?: number;
  color: string;
}

export function ArcGauge({ pct, size = 140, thickness = 11, color }: ArcGaugeProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;
  const circum = 2 * Math.PI * r;
  const half = circum / 2;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * half;
  const svgH = size / 2 + thickness / 2 + 4;

  return (
    <svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`}>
      {/* Track */}
      <circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke="var(--ft-raised)"
        strokeWidth={thickness}
        strokeLinecap="round"
        strokeDasharray={`${half} ${circum}`}
        transform={`rotate(180 ${cx} ${cy})`}
      />
      {/* Fill */}
      {filled > 2 && (
        <circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circum}`}
          transform={`rotate(180 ${cx} ${cy})`}
        />
      )}
    </svg>
  );
}
