import { useListAccounts } from "@workspace/api-client-react";
import { useLocation } from "wouter";
import { MobileEmptyState } from "./mobile-ui";
import { nfmt, CURRENCY_SYMBOLS } from "./mobile-format";
import { figureFits, labelFits } from "@/components/primitives/block-field";

// Full page for the ACCOUNTS section that home links to. Same design
// language as MobileHome:
//   - 09:41 top bar with a right-aligned live status
//   - mono-uppercase headline label + big premium-tier figure
//   - a proportional block field that carries the geometry of the page:
//     here it splits by CURRENCY (area = GBP-equivalent per currency),
//     the same visual vocabulary as home's BLOCKS view splits by type.
//   - per-currency sections listing every account in that currency,
//     native first / converted second per the number rule.
// Depth is decorative (constant 10px shadow); value is length/area only.

export function MobileAccounts() {
  const [, navigate] = useLocation();
  const { data: accounts = [], isLoading } = useListAccounts();

  if (!isLoading && accounts.length === 0) {
    return (
      <div className="mobile-scroll" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <MobileEmptyState
          label="NO ACCOUNTS"
          title="Nothing to show yet."
          description="Connect Wise or Revolut, or add an account by hand. Balances appear here as soon as the sync completes."
          ctaLabel="Manage accounts"
          onCta={() => navigate("/settings")}
        />
      </div>
    );
  }

  const total = accounts.reduce((s, a) => s + a.gbpEquivalent, 0);
  const currencies = [...new Set(accounts.map((a) => a.currency))].sort((a, b) => {
    // GBP first, then others alphabetical
    if (a === "GBP") return -1;
    if (b === "GBP") return 1;
    return a.localeCompare(b);
  });
  const perCurrency = currencies.map((cur) => {
    const rows = accounts.filter((a) => a.currency === cur);
    const nativeSum = rows.reduce((s, a) => s + a.balance, 0);
    const gbpSum = rows.reduce((s, a) => s + a.gbpEquivalent, 0);
    return { currency: cur, rows, nativeSum, gbpSum };
  });

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
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          height: 44,
          padding: "0 18px",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--ft-dim)",
        }}
      >
        <span>
          {accounts.length} {accounts.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
        </span>
      </div>

      {/* Headline */}
      <div style={{ padding: "4px 18px 18px" }}>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            color: "var(--ft-dim)",
          }}
        >
          TOTAL · £ · {currencies.length} {currencies.length === 1 ? "CURRENCY" : "CURRENCIES"}
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
            {nfmt(total)}
          </span>
        </div>
      </div>

      {/* Currency exposure block field — area encodes GBP share per currency */}
      <div style={{ padding: "0 18px" }}>
        <CurrencyBlocks perCurrency={perCurrency} total={total} />
      </div>

      {/* Per-currency account lists */}
      {perCurrency.map((group) => (
        <CurrencySection key={group.currency} group={group} />
      ))}
    </div>
  );
}

// ── Currency block field ─────────────────────────────────────────────────────
// Widths proportional to GBP-equivalent value. Same shape/language as
// MobileHome's BlocksView. Depth is a constant 10px shadow — decoration.
// Cells below 24px collapse into a +n cell (per approved design rule).
function CurrencyBlocks({
  perCurrency,
  total,
}: {
  perCurrency: Array<{ currency: string; gbpSum: number }>;
  total: number;
}) {
  const AVAILABLE_W = 354;
  const FIELD_H = 132;
  const GAP = 2;
  // The +n tile has to be wide enough to hold "+N" text at 15px with 14px
  // side padding — otherwise it clips (as it did on the accounts page for
  // a small currency share). 48px is the tightest that keeps "+1" fully
  // visible in every theme.
  const COLLAPSED_MIN_W = 48;
  const items = perCurrency.filter((c) => c.gbpSum > 0);
  const sumForRatio = items.reduce((s, c) => s + c.gbpSum, 0) || 1;

  // Assign a background per currency using theme tokens only.
  // First currency (usually GBP) uses --ft-text (dominant), rest cycle
  // through accent → dim → border to keep it theme-safe and honest.
  const PALETTE = ["var(--ft-text)", "var(--ft-accent)", "var(--ft-dim)", "var(--ft-border)"];

  // First pass — proportional widths using the whole field, purely to
  // decide which cells are big enough to render individually.
  const provisional = items.map((c, i) => ({
    ...c,
    bg: PALETTE[i % PALETTE.length],
    fg: i < 2 ? "var(--ft-base)" : "var(--ft-text)",
    pxWidth: (c.gbpSum / sumForRatio) * (AVAILABLE_W - (items.length - 1) * GAP),
  }));
  const bigEnough = provisional.filter((c) => c.pxWidth >= 24);
  const collapsed = provisional.filter((c) => c.pxWidth < 24);
  const collapsedGbp = collapsed.reduce((s, c) => s + c.gbpSum, 0);

  // Second pass — once we know how many tiles render, reserve the +n tile's
  // minimum width first and split what's left across the big cells.
  let rowRender: Array<typeof provisional[number]>;
  if (collapsed.length) {
    const tileCount = bigEnough.length + 1;
    const bigPool = AVAILABLE_W - (tileCount - 1) * GAP - COLLAPSED_MIN_W;
    const bigSum = bigEnough.reduce((s, c) => s + c.gbpSum, 0) || 1;
    rowRender = [
      ...bigEnough.map((c) => ({ ...c, pxWidth: (c.gbpSum / bigSum) * bigPool })),
      {
        currency: `+${collapsed.length}`,
        gbpSum: collapsedGbp,
        bg: "var(--ft-border)",
        fg: "var(--ft-text)",
        pxWidth: COLLAPSED_MIN_W,
      },
    ];
  } else {
    rowRender = provisional;
  }

  return (
    <div
      style={{
        width: "100%",
        maxWidth: AVAILABLE_W,
        height: FIELD_H,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        display: "flex",
        gap: 2,
      }}
    >
      {rowRender.map((c, i) => {
        // Rule (CLAUDE.md): a financial figure — including a percentage —
        // is shown in full or not at all. figureFits/labelFits is the shared
        // guard used by BlockField; do not reimplement.
        const pctText = `${total > 0 ? Math.round((c.gbpSum / total) * 100) : 0}%`;
        const showPct = figureFits(pctText, c.pxWidth, 15, 14);
        const showLabel = labelFits(c.currency, c.pxWidth, 11, 14);
        return (
        <div
          key={c.currency}
          style={{
            width: `${c.pxWidth}px`,
            flexGrow: rowRender.length - 1 === i ? 1 : 0,
            background: c.bg,
            color: c.fg,
            padding: 14,
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            justifyContent: showPct && showLabel ? "space-between" : "flex-start",
            overflow: "hidden",
          }}
        >
          {showLabel && (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                whiteSpace: "nowrap",
              }}
            >
              {c.currency}
            </span>
          )}
          {showPct && (
            <span
              className="pnum"
              style={{
                fontSize: 15,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {pctText}
            </span>
          )}
        </div>
      );})}
    </div>
  );
}

// ── Per-currency section ────────────────────────────────────────────────────
// Header shows: CURRENCY · N · native subtotal (converted). Rows list every
// account in that currency, native first then converted per the number rule.
// Non-cash accounts carry a small mono-uppercase mark (IV / PN / PR / OT) —
// same treatment as the WISE pill on the desktop accounts page — because the
// currency grouping alone can't tell you an ISA from a savings account.
// Cash rows carry nothing: the default is the norm, we mark the exception.
type AccountRow = { id: number; name: string; balance: number; gbpEquivalent: number; type: "cash" | "investment" | "pension" | "property" | "other" };

const TYPE_MARK: Record<AccountRow["type"], string | null> = {
  cash: null,
  investment: "IV",
  pension: "PN",
  property: "PR",
  other: "OT",
};

function CurrencySection({
  group,
}: {
  group: { currency: string; rows: AccountRow[]; nativeSum: number; gbpSum: number };
}) {
  const sym = CURRENCY_SYMBOLS[group.currency] ?? group.currency + " ";
  const isGbp = group.currency === "GBP";
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
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            letterSpacing: "0.16em",
            color: "var(--ft-dim)",
          }}
        >
          {group.currency} · {group.rows.length} {group.rows.length === 1 ? "ACCOUNT" : "ACCOUNTS"}
        </span>
        {isGbp ? (
          <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
            £{nfmt(group.gbpSum)}
          </span>
        ) : (
          <span
            style={{ display: "flex", gap: 6, alignItems: "baseline" }}
          >
            <span
              className="pnum"
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}
            >
              {sym}{nfmt(group.nativeSum)} ≈
            </span>
            <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600 }}>
              £{nfmt(group.gbpSum)}
            </span>
          </span>
        )}
      </div>

      <div style={{ marginTop: 6 }}>
        {group.rows.map((a, i) => (
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
              ...(i === group.rows.length - 1
                ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                : {}),
              fontSize: 14,
            }}
          >
            <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
              {TYPE_MARK[a.type] && (
                <span
                  style={{
                    fontSize: 9,
                    padding: "1px 5px",
                    borderRadius: 2,
                    background: "var(--ft-raised)",
                    color: "var(--ft-dim)",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    letterSpacing: "0.1em",
                    textTransform: "uppercase",
                    flexShrink: 0,
                  }}
                >
                  {TYPE_MARK[a.type]}
                </span>
              )}
            </span>
            {isGbp ? (
              <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                {nfmt(a.gbpEquivalent)}
              </span>
            ) : (
              <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <span
                  className="pnum"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-dim)" }}
                >
                  {sym}{nfmt(a.balance)} ≈
                </span>
                <span className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>
                  £{nfmt(a.gbpEquivalent)}
                </span>
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
