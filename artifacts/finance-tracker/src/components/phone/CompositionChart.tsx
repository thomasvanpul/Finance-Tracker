// Shared composition chart components — used by WORTH and HOME.
// Extracted from MobileHome.tsx so both screens share the same visual
// language without duplicating the bucket constants or chart logic.
//
// Exports: Holdings types, computeHoldings, ViewMode, ViewTab,
//          bucket constants, RingView, BandsView.

import { BlockField } from "@/components/primitives/block-field";

// ── Holdings types ────────────────────────────────────────────────────────────
// Exported so MobileHome can re-export them for backward-compat callers
// (MobileNetWorth, mobile-home.test).

export type AccountType = "cash" | "investment" | "pension" | "property" | "other";

export interface HoldingsInput {
  accountBreakdown?: Array<{ type: AccountType; baseEquivalent: number | null }>;
  portfolio?: { totalValueBase?: number };
}

export interface Holdings {
  cash: number;
  investment: number;
  pension: number;
  property: number;
  other: number;
}

export function computeHoldings(d: HoldingsInput | null | undefined): Holdings {
  const buckets: Holdings = { cash: 0, investment: 0, pension: 0, property: 0, other: 0 };
  for (const a of d?.accountBreakdown ?? []) {
    if (a.baseEquivalent == null) continue;
    buckets[a.type] += a.baseEquivalent;
  }
  if (d?.portfolio?.totalValueBase != null) {
    buckets.investment += d.portfolio.totalValueBase;
  }
  return buckets;
}

// ── View switcher ─────────────────────────────────────────────────────────────

export type ViewMode = "blocks" | "bands" | "ring";

export function ViewTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const base: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
    height: 26,
    padding: "0 8px",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
    letterSpacing: "0.06em",
    cursor: "pointer",
    boxSizing: "border-box",
  };
  const on: React.CSSProperties = {
    background: "var(--ft-text)",
    color: "var(--ft-base)",
  };
  const off: React.CSSProperties = {
    color: "var(--ft-dim)",
    borderWidth: 1, borderStyle: "solid", borderColor: "var(--ft-border)",
  };
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", minHeight: 44, cursor: "pointer" }}
    >
      <span style={{ ...base, ...(active ? on : off) }}>{label}</span>
    </div>
  );
}

// ── Bucket constants ───────────────────────────────────────────────────────────

export const BUCKET_ORDER: (keyof Holdings)[] = ["cash", "investment", "pension", "property", "other"];

export const BUCKET_LABEL: Record<keyof Holdings, string> = {
  cash: "CASH",
  investment: "INVESTED",
  pension: "PENSION",
  property: "PROPERTY",
  other: "OTHER",
};

// Colour = position in the type ladder, not hue-as-data. All values
// route through --ft-* tokens so all 11 themes render legibly.
export const BUCKET_COLOR: Record<keyof Holdings, string> = {
  cash: "var(--ft-text)",
  investment: "var(--ft-accent)",
  pension: "var(--ft-blue)",
  property: "var(--ft-green)",
  other: "var(--ft-dim)",
};

export function bucketTotal(h: Holdings): number {
  return h.cash + h.investment + h.pension + h.property + h.other;
}

// ── BLOCKS ────────────────────────────────────────────────────────────────────

export function BlocksView({ holdings }: { holdings: Holdings }) {
  return <BlockField holdings={holdings} />;
}

// ── RING ──────────────────────────────────────────────────────────────────────

export function RingView({ holdings }: { holdings: Holdings }) {
  const total = bucketTotal(holdings);
  if (total <= 0) {
    return (
      <div
        style={{
          width: "100%", maxWidth: 354, height: 296,
          boxShadow: "10px -10px 0 0 var(--ft-border)",
          background: "var(--ft-surface)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)",
          letterSpacing: "0.14em",
        }}
      >
        NO POSITIONS
      </div>
    );
  }
  const RADIUS = 82;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
  let offset = 0;
  const segments: { key: keyof Holdings; length: number; offset: number; color: string }[] = [];
  for (const key of BUCKET_ORDER) {
    const v = holdings[key];
    if (v <= 0) continue;
    const length = (v / total) * CIRCUMFERENCE;
    segments.push({ key, length, offset, color: BUCKET_COLOR[key] });
    offset += length;
  }
  const totalLabel = total.toLocaleString("en-GB", { maximumFractionDigits: 0 });
  return (
    <div
      style={{
        width: "100%", maxWidth: 354, minHeight: 296,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        background: "var(--ft-surface)",
        display: "flex", flexDirection: "column", alignItems: "stretch",
        padding: 16, boxSizing: "border-box", gap: 16,
      }}
    >
      <div style={{ display: "grid", placeItems: "center" }}>
        <svg width={200} height={200} viewBox="0 0 200 200">
          <circle cx={100} cy={100} r={RADIUS} fill="none" stroke="var(--ft-border)" strokeWidth={1} />
          {segments.map((s) => (
            <circle
              key={s.key}
              cx={100} cy={100} r={RADIUS} fill="none"
              stroke={s.color} strokeWidth={16}
              strokeDasharray={`${s.length} ${CIRCUMFERENCE - s.length}`}
              strokeDashoffset={-s.offset}
              transform="rotate(-90 100 100)"
            />
          ))}
          <text x={100} y={100} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={11} fill="var(--ft-dim)" letterSpacing="0.12em">HOLDINGS</text>
          <text x={100} y={116} textAnchor="middle" dominantBaseline="central" fontFamily="var(--font-mono)" fontSize={11} fontWeight={700} fill="var(--ft-text)">£{totalLabel}</text>
        </svg>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {BUCKET_ORDER.filter((k) => holdings[k] > 0).map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, background: BUCKET_COLOR[k], flex: "none" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--ft-dim)" }}>{BUCKET_LABEL[k]}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", marginLeft: "auto" }}>
              {Math.round((holdings[k] / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── BANDS ─────────────────────────────────────────────────────────────────────

export interface BandsMonth {
  month: string;
  composition: Holdings | null;
}

export function BandsView({ months }: { months: BandsMonth[] }) {
  if (months.length === 0) {
    return (
      <div
        style={{
          width: "100%", maxWidth: 354, height: 296,
          boxShadow: "10px -10px 0 0 var(--ft-border)",
          background: "var(--ft-surface)",
          display: "grid", placeItems: "center",
          fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)",
          letterSpacing: "0.14em",
        }}
      >
        NO HISTORY
      </div>
    );
  }
  const maxTotal = Math.max(
    1,
    ...months.map((m) => (m.composition ? bucketTotal(m.composition) : 0)),
  );
  const BAR_H = 200;
  const BAR_W = 20;
  const GAP = 4;
  const chartW = months.length * (BAR_W + GAP);

  return (
    <div
      style={{
        width: "100%", maxWidth: 354, minHeight: 296,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        background: "var(--ft-surface)",
        padding: 16, boxSizing: "border-box",
        display: "flex", flexDirection: "column", gap: 16,
      }}
    >
      <div style={{ overflowX: "auto" }}>
        <svg width={chartW} height={BAR_H + 40} viewBox={`0 0 ${chartW} ${BAR_H + 40}`}>
          {months.map((m, i) => {
            const x = i * (BAR_W + GAP);
            if (!m.composition) {
              return (
                <g key={m.month}>
                  <rect
                    x={x} y={0} width={BAR_W} height={BAR_H}
                    fill="none" stroke="var(--ft-border)"
                    strokeDasharray="2 2" strokeWidth={1}
                  />
                  <text x={x + BAR_W / 2} y={BAR_H + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--ft-dim)">{m.month.slice(5)}</text>
                </g>
              );
            }
            const total = bucketTotal(m.composition);
            const scale = total / maxTotal;
            let cursorY = BAR_H;
            const segs: { key: keyof Holdings; h: number; y: number }[] = [];
            for (const key of BUCKET_ORDER) {
              const v = m.composition[key];
              if (v <= 0) continue;
              const h = (v / total) * BAR_H * scale;
              cursorY -= h;
              segs.push({ key, h, y: cursorY });
            }
            return (
              <g key={m.month}>
                {segs.map((s) => (
                  <rect
                    key={s.key}
                    x={x} y={s.y} width={BAR_W} height={s.h}
                    fill={BUCKET_COLOR[s.key]}
                  />
                ))}
                <text x={x + BAR_W / 2} y={BAR_H + 14} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={9} fill="var(--ft-dim)">{m.month.slice(5)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        {BUCKET_ORDER.map((k) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 10, height: 10, background: BUCKET_COLOR[k], flex: "none" }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.08em", color: "var(--ft-dim)" }}>{BUCKET_LABEL[k]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
