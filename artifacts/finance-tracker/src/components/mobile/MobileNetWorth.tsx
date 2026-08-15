import { useGetDashboard } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MobileEmptyState, MobileScreenHeader } from "./mobile-ui";
import { nfmt } from "./mobile-format";
import { computeHoldings } from "./MobileHome";

// Full page for the HOLDINGS section that home links to. Same design
// language as MobileHome:
//   - 09:41 top bar (with account count on the right)
//   - mono-uppercase headline label + premium-tier (34px) net worth
//   - month-to-date delta line, green/red per sign
//   - the same block field as home's BLOCKS view — categorised by
//     account.type + portfolio positions, area = value.
//   - per-type sections with the accounts contributing to each bucket
//   - CLAIMED strip for liabilities (outlined, no depth — a claim is
//     not material you hold)
// Depth is decorative; value is length/area only.

type Bucket = "cash" | "investment" | "pension" | "property" | "other";

const BUCKET_LABEL: Record<Bucket, string> = {
  cash: "CASH",
  investment: "INVESTED",
  pension: "PENSION",
  property: "PROPERTY",
  other: "OTHER",
};

export function MobileNetWorth({ onBack }: { onBack?: () => void }) {
  const [, navigate] = useLocation();
  const { data, isLoading } = useGetDashboard();
  const accounts = data?.accountBreakdown ?? [];

  if (!isLoading && (data == null || accounts.length === 0)) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileScreenHeader title="Holdings" onBack={onBack} />
        <MobileEmptyState
          label="NO NET WORTH"
          title="Nothing tracked yet."
          description="Connect an account to start tracking net worth over time."
          ctaLabel="Manage accounts"
          onCta={() => navigate("/settings")}
        />
      </div>
    );
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const monthShortMixed = now.toLocaleDateString("en-GB", { month: "short" });

  const netWorth = data?.netWorth ?? 0;
  const mtdDelta = data?.thisMonth.netSavings ?? 0;
  const priorNw = netWorth - mtdDelta;
  const mtdPct = priorNw > 0 ? (mtdDelta / priorNw) * 100 : 0;

  const holdings = computeHoldings(data);
  const owedByMe = data?.owing.totalIOwe ?? 0;
  const pendingCount = data?.owing.pendingCount ?? 0;

  // Group accounts by type for the per-type sections. Portfolio positions
  // are surfaced only through the block field's `invested` bucket — they
  // don't have per-position rows here because that's Investments' job.
  const byType: Record<Bucket, typeof accounts> = {
    cash: [], investment: [], pension: [], property: [], other: [],
  };
  for (const a of accounts) {
    byType[a.type as Bucket]?.push(a);
  }
  // Order sections by bucket size (largest first)
  const bucketOrder: Bucket[] = (["cash", "investment", "pension", "property", "other"] as Bucket[])
    .sort((a, b) => holdings[b] - holdings[a]);

  return (
    <div
      className="mobile-scroll"
      style={{
        width: "100%",
        height: "100%",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
        fontFamily: "var(--font-sans)",
        WebkitFontSmoothing: "antialiased",
        overflowY: "auto",
        overflowX: "hidden",
        paddingBottom: "calc(60px + env(safe-area-inset-bottom, 0px) + 16px)",
      }}
    >
      <MobileScreenHeader title="Holdings" onBack={onBack} />

      {/* Top bar (below the screen header so the mobile chrome sits together) */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          height: 32,
          padding: "0 18px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-dim)",
        }}
      >
        <span>{timeStr}</span>
        <span>{accounts.length} {accounts.length === 1 ? "ACCOUNT" : "ACCOUNTS"}</span>
      </div>

      {/* Net worth headline */}
      <div style={{ padding: "4px 18px 18px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
          NET WORTH
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 6 }}>
          <span style={{ fontSize: 17, color: "var(--ft-dim)" }}>£</span>
          <span
            className="pnum"
            style={{
              fontSize: 34,
              lineHeight: "34px",
              fontWeight: 600,
              letterSpacing: "-0.035em",
            }}
          >
            {nfmt(netWorth)}
          </span>
        </div>
        <div
          className="pnum"
          style={{
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: mtdDelta >= 0 ? "var(--ft-green)" : "var(--ft-red)",
          }}
        >
          {nfmt(mtdDelta, { sign: true, symbol: "£" })} · {nfmt(mtdPct, { sign: true })}% since 1 {monthShortMixed}
        </div>
      </div>

      {/* Block field — same visual language as home's BLOCKS view */}
      <div style={{ padding: "0 18px" }}>
        <HoldingsBlocks holdings={holdings} />
      </div>

      {/* Liabilities strip (outlined, no depth) */}
      {owedByMe > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 12,
            padding: "18px 18px 0",
          }}
        >
          <div
            style={{
              width: 88,
              height: 19,
              borderWidth: 1,
              borderStyle: "solid",
              borderColor: "var(--ft-red)",
              boxSizing: "border-box",
              flex: "none",
              marginTop: 1,
            }}
          />
          <div
            className="pnum"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              lineHeight: "16px",
              color: "var(--ft-red)",
            }}
          >
            CLAIMED {nfmt(-owedByMe, { symbol: "£" })} · {pendingCount} {pendingCount === 1 ? "DEBT" : "DEBTS"}
          </div>
        </div>
      )}

      {/* Per-type sections */}
      {bucketOrder.map((bucket) => {
        const value = holdings[bucket];
        if (value <= 0 && byType[bucket].length === 0) return null;
        return (
          <TypeSection
            key={bucket}
            label={BUCKET_LABEL[bucket]}
            total={value}
            netWorth={netWorth}
            rows={byType[bucket]}
            note={
              bucket === "investment" && (data?.portfolio.totalValueGbp ?? 0) > 0
                ? `Includes ${nfmt(data?.portfolio.totalValueGbp ?? 0, { symbol: "£" })} in portfolio positions`
                : undefined
            }
          />
        );
      })}
    </div>
  );
}

// ── Block field ─────────────────────────────────────────────────────────────
// Property on top when > 0 (Numeris's "flat" tier). Otherwise the row of
// CASH / INVESTED / PENSION / OTHER fills the full 296px height. Widths
// proportional to value share; cells narrower than 24px collapse into a +n
// cell. Same rules as MobileHome's BlocksView.
function HoldingsBlocks({
  holdings,
}: {
  holdings: { cash: number; investment: number; pension: number; property: number; other: number };
}) {
  const { cash, investment, pension, property, other } = holdings;
  const FIELD_H = 296;
  const AVAILABLE_W = 354;
  const showProperty = property > 0;
  const topH = showProperty ? 230 : 0;
  const rowH = showProperty ? 64 : FIELD_H;
  const total = cash + investment + pension + property + other;

  const rowValues: Array<{ key: string; value: number; label: string; bg: string; fg: string }> = [];
  if (cash > 0) rowValues.push({ key: "C", value: cash, label: "CASH", bg: "var(--ft-accent)", fg: "var(--ft-base)" });
  if (investment > 0) rowValues.push({ key: "I", value: investment, label: "INVESTED", bg: "var(--ft-dim)", fg: "var(--ft-base)" });
  if (pension > 0) rowValues.push({ key: "P", value: pension, label: "PENSION", bg: "var(--ft-border)", fg: "var(--ft-text)" });
  if (other > 0) rowValues.push({ key: "O", value: other, label: "OTHER", bg: "var(--ft-border)", fg: "var(--ft-text)" });
  const rowTotal = rowValues.reduce((s, r) => s + Math.max(r.value, 0), 0) || 1;

  const withPx = rowValues.map((r) => ({
    ...r,
    pxWidth: (Math.max(r.value, 0) / rowTotal) * (AVAILABLE_W - (rowValues.length - 1) * 2),
  }));
  const bigEnough = withPx.filter((r) => r.pxWidth >= 24);
  const collapsed = withPx.filter((r) => r.pxWidth < 24);
  const collapsedValue = collapsed.reduce((s, r) => s + r.value, 0);
  const rowRender = collapsed.length
    ? [
        ...bigEnough,
        {
          key: "collapsed",
          value: collapsedValue,
          label: `+${collapsed.length}`,
          bg: "var(--ft-border)",
          fg: "var(--ft-text)",
          pxWidth: (collapsedValue / rowTotal) * (AVAILABLE_W - bigEnough.length * 2),
        } as (typeof withPx)[0],
      ]
    : withPx;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: AVAILABLE_W,
        height: FIELD_H,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        display: "flex",
        flexDirection: "column",
        gap: showProperty ? 2 : 0,
      }}
    >
      {showProperty && (
        <div
          style={{
            height: topH,
            background: "var(--ft-text)",
            color: "var(--ft-base)",
            padding: 14,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em" }}>
            PROPERTY · {total > 0 ? Math.round((property / total) * 100) : 0}%
          </span>
          <span className="pnum" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.03em" }}>
            {nfmt(property, { symbol: "£", decimals: 0 })}
          </span>
        </div>
      )}
      <div style={{ height: rowH, display: "flex", gap: 2 }}>
        {(() => {
          const gapTotal = (rowRender.length - 1) * 2;
          const nonLastSum = rowRender.slice(0, -1).reduce((s, r) => s + r.pxWidth, 0);
          const lastDisplayed = Math.max(rowRender.at(-1)?.pxWidth ?? 0, AVAILABLE_W - nonLastSum - gapTotal);
          return rowRender.map((r, i) => {
          // Rule (CLAUDE.md): a financial figure is shown in full or not at
          // all. A tile too narrow to hold its £N,NNN figure gets the label
          // only. If it can't hold the label either, the label alone gets
          // hidden — the tile still identifies the bucket by colour + area,
          // and the exact values live in the sections below.
          const displayedWidth = i === rowRender.length - 1 ? lastDisplayed : r.pxWidth;
          const figureText = nfmt(r.value, { symbol: "£", decimals: 0 });
          const figureFontSize = showProperty ? 13 : 21;
          const pad = showProperty ? 8 : 14;
          const requiredForFigure = figureText.length * figureFontSize * 0.6 + pad * 2;
          const requiredForLabel = r.label.length * 11 * 0.7 + pad * 2;
          const showFigure = displayedWidth >= requiredForFigure;
          const showLabel = displayedWidth >= requiredForLabel;
          return (
          <div
            key={r.key}
            style={{
              width: `${r.pxWidth}px`,
              flexGrow: rowRender.length - 1 === i ? 1 : 0,
              background: r.bg,
              color: r.fg,
              padding: showProperty ? 8 : 14,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: showFigure && showLabel ? "space-between" : "flex-start",
              overflow: "hidden",
            }}
          >
            {showLabel && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                {r.label}
              </span>
            )}
            {showFigure && (
              <span
                className="pnum"
                style={{
                  fontSize: figureFontSize,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  letterSpacing: showProperty ? undefined : "-0.03em",
                }}
              >
                {figureText}
              </span>
            )}
          </div>
        );});
        })()}
      </div>
    </div>
  );
}

// ── Per-type section ────────────────────────────────────────────────────────
function TypeSection({
  label,
  total,
  netWorth,
  rows,
  note,
}: {
  label: string;
  total: number;
  netWorth: number;
  rows: Array<{ id: number; name: string; balance: number; gbpEquivalent: number; currency: string }>;
  note?: string;
}) {
  const pct = netWorth > 0 ? Math.round((total / netWorth) * 100) : 0;
  return (
    <div
      style={{
        marginTop: 22,
        padding: "14px 18px 0",
        borderTopWidth: 1,
        borderTopStyle: "solid",
        borderTopColor: "var(--ft-border)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.16em", color: "var(--ft-dim)" }}>
          {label} · {pct}%
        </span>
        <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
          £{nfmt(total)}
        </span>
      </div>

      {note && (
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-dim)",
          }}
        >
          {note}
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 6 }}>
          {rows.map((a, i) => (
            <div
              key={a.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                borderTopWidth: 1,
                borderTopStyle: "solid",
                borderTopColor: "var(--ft-border)",
                ...(i === rows.length - 1
                  ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                  : {}),
                fontSize: 14,
              }}
            >
              <span>{a.name}</span>
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                £{nfmt(a.gbpEquivalent)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
