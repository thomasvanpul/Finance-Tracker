// The horizon: every pending bill on a date axis. Tick height is the amount.
// Dotted = not yet paid. Left of the today line and amber = past its date.
window.Horizon = function (W, H, opts = {}) {
  const { upcoming, today, alloc, money, dayLabel } = N;
  const first = upcoming.reduce((m, u) => (u.dueDate < m ? u.dueDate : m), today);
  const x0 = new Date(first) - 2 * 86400000, x1 = new Date(alloc.windowEnd).getTime() + 86400000;
  const L = 0, R = W, base = H - 16;
  const X = (iso) => L + ((new Date(iso) - x0) / (x1 - x0)) * (R - L);
  const maxV = Math.max(...upcoming.map((u) => u.baseEquivalent));
  const top = opts.top ?? 6;
  const Y = (v) => Math.max(6, (v / maxV) * (base - top));
  let s = `<line x1="0" x2="${W}" y1="${base + 0.5}" y2="${base + 0.5}" stroke="#262a31"/>`;
  const xt = X(today);
  s += `<rect x="0" y="${top - 4}" width="${xt}" height="${base - top + 4}" fill="rgba(242,174,61,0.05)"/>`;
  for (const u of upcoming) {
    const late = u.dueDate < today, x = X(u.dueDate), h = Y(u.baseEquivalent);
    s += `<rect x="${(x - 2).toFixed(1)}" y="${(base - h).toFixed(1)}" width="4" height="${h.toFixed(1)}" fill="${late ? "rgba(242,174,61,0.14)" : "none"}" stroke="${late ? "#f2ae3d" : "#939aa6"}" stroke-dasharray="1.5 1.5"/>`;
  }
  s += `<line x1="${xt}" x2="${xt}" y1="${top - 4}" y2="${base + 4}" stroke="#36d6e7" stroke-width="1.5"/>`;
  s += `<text x="${xt}" y="${H - 3}" font-size="9.5" fill="#36d6e7" text-anchor="middle" font-family="JetBrains Mono">${dayLabel(today)}</text>`;
  s += `<text x="2" y="${H - 3}" font-size="9.5" fill="#5d6470" font-family="JetBrains Mono">${dayLabel(first)}</text>`;
  s += `<text x="${W - 2}" y="${H - 3}" font-size="9.5" fill="#5d6470" text-anchor="end" font-family="JetBrains Mono">${dayLabel(alloc.windowEnd)}</text>`;
  return `<svg width="${W}" height="${H}">${s}</svg>`;
};
