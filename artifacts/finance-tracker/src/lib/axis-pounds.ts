// Y-axis tick label for a pounds chart. Below £1k a "£0k" tick says nothing
// (and a small negative rendered as "£-0k"), so whole pounds are shown there;
// above it, thousands. The minus is the typographic one, before the £.
export function formatAxisPounds(v: number): string {
  const sign = v < 0 ? "−" : "";
  const abs = Math.abs(v);
  if (abs < 1000) return `${sign}£${Math.round(abs)}`;
  const k = abs / 1000;
  return `${sign}£${k >= 10 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, "")}k`;
}
