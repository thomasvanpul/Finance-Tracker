// Small self-contained render widgets for the Markets tab. Extracted from
// pages/investments.tsx. Prop-driven, no state. No behaviour change.

// ── Candlestick chart layer (recharts Customized) ────────────────────────────
export function CandlestickLayer(props: Record<string, unknown>) {
  const xAxisMap = (props.xAxisMap ?? {}) as Record<string, { scale: ((v: string) => number) & { bandwidth?: () => number }; width?: number }>;
  const yAxisMap = (props.yAxisMap ?? {}) as Record<string, { scale: (v: number) => number }>;
  const data = (props.data ?? []) as Array<{ label?: string; date?: string; open?: number; high?: number; low?: number; close: number; volume?: number }>;
  const xAxis = Object.values(xAxisMap)[0];
  const yAxis = Object.values(yAxisMap)[0];
  if (!xAxis?.scale || !yAxis?.scale || data.length === 0) return null;
  const xScale = xAxis.scale;
  const yScale = yAxis.scale;
  const bandwidth = xScale.bandwidth ? xScale.bandwidth() : ((xAxis.width ?? 400) / data.length);

  return (
    <g>
      {data.map((d, i) => {
        const label = d.label ?? d.date ?? String(i);
        const cx = (xScale(label) ?? 0) + bandwidth / 2;
        const open = d.open ?? d.close;
        const close = d.close;
        const high = d.high ?? Math.max(open, close);
        const low = d.low ?? Math.min(open, close);
        const isUp = close >= open;
        const color = isUp ? "#3fb950" : "#f85149";
        const yHigh = yScale(high);
        const yLow = yScale(low);
        const yOpen = yScale(open);
        const yClose = yScale(close);
        const bodyTop = Math.min(yOpen, yClose);
        const bodyBot = Math.max(yOpen, yClose);
        const bodyH = Math.max(bodyBot - bodyTop, 1);
        const candleW = Math.max(bandwidth * 0.65, 2);
        return (
          <g key={i}>
            <line x1={cx} y1={yHigh} x2={cx} y2={yLow} stroke={color} strokeWidth={1} />
            <rect x={cx - candleW / 2} y={bodyTop} width={candleW} height={bodyH} fill={color} stroke={color} strokeWidth={0.5} opacity={0.9} />
          </g>
        );
      })}
    </g>
  );
}

// ── Rich OHLC tooltip ─────────────────────────────────────────────────────────
export function OHLCTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: Record<string, number | undefined> }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload ?? {};
  const isUp = (d.close ?? 0) >= (d.open ?? d.close ?? 0);
  return (
    <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.7, minWidth: 130, boxShadow: "0 4px 16px rgba(0,0,0,0.6)" }}>
      {label && <div style={{ color: "var(--ft-text)", fontSize: 11, fontWeight: 700, marginBottom: 5, borderBottom: "1px solid var(--ft-border)", paddingBottom: 3 }}>{label}</div>}
      {d.open != null && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: "var(--ft-dim)", flex: 1, minWidth: 0 }}>Open</span><span style={{ color: "var(--ft-text)", flexShrink: 0, whiteSpace: "nowrap" }}>${d.open.toFixed(2)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: "var(--ft-dim)", flex: 1, minWidth: 0 }}>High</span><span style={{ color: "#3fb950", flexShrink: 0, whiteSpace: "nowrap" }}>${(d.high ?? d.close ?? 0).toFixed(2)}</span></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: "var(--ft-dim)", flex: 1, minWidth: 0 }}>Low</span><span style={{ color: "#f85149", flexShrink: 0, whiteSpace: "nowrap" }}>${(d.low ?? d.close ?? 0).toFixed(2)}</span></div>
        </>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><span style={{ color: "var(--ft-dim)", flex: 1, minWidth: 0 }}>Close</span><span style={{ color: isUp ? "#3fb950" : "#f85149", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>${(d.close ?? 0).toFixed(2)}</span></div>
      {d.volume != null && (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--ft-dim)", fontSize: 9, marginTop: 3, borderTop: "1px solid var(--ft-border)", paddingTop: 3 }}>
          <span style={{ flex: 1, minWidth: 0 }}>Volume</span>
          <span style={{ flexShrink: 0, whiteSpace: "nowrap" }}>{d.volume >= 1e6 ? `${(d.volume / 1e6).toFixed(1)}M` : `${(d.volume / 1e3).toFixed(0)}K`}</span>
        </div>
      )}
    </div>
  );
}

// ── 52-week range dot bar ────────────────────────────────────────────────────
export function RangeBar({ low52w, high52w, price }: { low52w?: number | null; high52w?: number | null; price: number }) {
  if (!low52w || !high52w || high52w <= low52w) return <span style={{ color: "var(--ft-dim)", fontSize: 10 }}>—</span>;
  const pct = Math.max(0, Math.min(100, ((price - low52w) / (high52w - low52w)) * 100));
  const col = pct > 75 ? "var(--ft-green)" : pct < 25 ? "var(--ft-red)" : "var(--ft-amber)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 80 }}>
      <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>{low52w.toFixed(0)}</span>
      <div style={{ flex: 1, height: 4, background: "var(--ft-raised)", borderRadius: 2, position: "relative", minWidth: 40 }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${pct}%`, background: col, borderRadius: 2 }} />
        <div style={{ position: "absolute", top: -2, left: `${pct}%`, transform: "translateX(-50%)", width: 8, height: 8, borderRadius: "50%", background: col, border: "1px solid var(--ft-base)" }} />
      </div>
      <span style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)" }}>{high52w.toFixed(0)}</span>
    </div>
  );
}

// ── Analyst recommendation stacked bar ───────────────────────────────────────
export function RecBar({ trend }: { trend: { strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }[] }) {
  const t = trend[0] ?? { strongBuy: 0, buy: 0, hold: 0, sell: 0, strongSell: 0 };
  const total = t.strongBuy + t.buy + t.hold + t.sell + t.strongSell;
  if (total === 0) return <span style={{ color: "var(--ft-dim)", fontSize: 10 }}>No analyst data</span>;
  const segs = [
    { label: "Strong Buy", val: t.strongBuy, color: "var(--ft-green)" },
    { label: "Buy", val: t.buy, color: "rgba(63,185,80,0.5)" },
    { label: "Hold", val: t.hold, color: "var(--ft-amber)" },
    { label: "Sell", val: t.sell, color: "rgba(248,81,73,0.5)" },
    { label: "Strong Sell", val: t.strongSell, color: "var(--ft-red)" },
  ];
  return (
    <div>
      <div style={{ display: "flex", height: 10, borderRadius: 2, overflow: "hidden", gap: 1 }}>
        {segs.map((s) => s.val > 0 && (
          <div key={s.label} title={`${s.label}: ${s.val}`} style={{ flex: s.val / total, background: s.color, minWidth: 2 }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
        {segs.map((s) => s.val > 0 && (
          <span key={s.label} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: s.color }}>
            {s.label}: {s.val}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Rating bar (0-10 score with coloured fill) ────────────────────────────────
export function RatingBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", width: 70, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: "var(--ft-raised)", borderRadius: 2, position: "relative" }}>
        <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${score * 10}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color, width: 24, textAlign: "right" }}>{score.toFixed(1)}</span>
    </div>
  );
}
