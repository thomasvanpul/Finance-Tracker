// Recharts <XAxis> / <YAxis> want inline fill/stroke props, so every
// chart page independently hardcoded the same GitHub-dark greys
// (#6b7280, #7d8590, #6C7A96, #374151). On arctic those ranged from
// invisible to WCAG-failing. These constants route the pattern
// through --ft-muted and --ft-border so a chart adapts to whichever
// theme is active. Spread with a fontSize per chart:
//     tick={{ ...AXIS_TICK, fontSize: 10 }}
export const AXIS_TICK = {
  fill: "var(--ft-muted)",
  fontFamily: "var(--font-mono)",
} as const;

export const AXIS_LINE = {
  stroke: "var(--ft-border)",
  strokeWidth: 1,
} as const;
