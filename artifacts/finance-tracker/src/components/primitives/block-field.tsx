import React from "react";
import { nfmt } from "@/components/mobile/mobile-format";

// ── BlockField ──────────────────────────────────────────────────────────────
// The area-encodes-value block view used on mobile /home and /net-worth.
// Extracted because both screens carried a copy of the same 100-line render,
// which meant the no-truncation guard (CLAUDE.md hard constraint) was enforced
// in one place and could rot in the other.
//
// Design vocabulary is fixed and lives here — the caller supplies holdings
// numbers and nothing else. No `style` escape hatch, per the StackProps
// precedent; PanelBox had one and six of nine call sites leaked inline
// objects through it. If a new visual variant is ever needed, add a named
// prop, don't open a hole.
//
// Rules baked in:
//   - PROPERTY renders as the hero (top) block when > 0; when 0, the row
//     of remaining buckets fills the full field height.
//   - Row buckets (cash / investment / pension / other) render only when > 0.
//   - Buckets with proportional width < COLLAPSE_AT collapse into a `+n` cell.
//   - Each tile hides its label and/or figure when its displayed width
//     cannot hold them in full — never renders "£1…" from "£11,371".
//   - Depth is decoration only (constant 10px shadow).

export interface Holdings {
  cash: number;
  investment: number;
  pension: number;
  property: number;
  other: number;
}

const FIELD_H = 296;
const AVAILABLE_W = 354;
const HERO_H = 230;
const ROW_H_WITH_HERO = 64;
const GAP = 2;
const COLLAPSE_AT = 24;

// Rough average glyph-to-em ratios; measured empirically to be pessimistic
// enough that no clip escapes the fit check across the 11 themes.
const PNUM_EM = 0.6;
const LABEL_EM = 0.7;

// ── figureFits / labelFits ──────────────────────────────────────────────────
// The one-and-only source of truth for the CLAUDE.md rule:
// "A financial figure is shown in full or not at all." Callers outside this
// file that render numeric text inside a size-constrained container MUST
// gate the render on figureFits; label callers MUST gate on labelFits.
// Do NOT reimplement the arithmetic — extend these helpers if a new class
// of glyph needs a different em ratio.
export function figureFits(text: string, containerPx: number, fontSizePx: number, horizontalPadPx: number): boolean {
  return containerPx >= text.length * fontSizePx * PNUM_EM + horizontalPadPx * 2;
}
export function labelFits(text: string, containerPx: number, fontSizePx: number, horizontalPadPx: number): boolean {
  return containerPx >= text.length * fontSizePx * LABEL_EM + horizontalPadPx * 2;
}

interface Bucket {
  key: string;
  value: number;
  label: string;
  bg: string;
  fg: string;
}

function buildRow(h: Holdings): Bucket[] {
  const row: Bucket[] = [];
  if (h.cash > 0)       row.push({ key: "C", value: h.cash,       label: "CASH",     bg: "var(--ft-accent)",  fg: "var(--ft-base)" });
  if (h.investment > 0) row.push({ key: "I", value: h.investment, label: "INVESTED", bg: "var(--ft-dim)",     fg: "var(--ft-base)" });
  if (h.pension > 0)    row.push({ key: "P", value: h.pension,    label: "PENSION",  bg: "var(--ft-border2)", fg: "var(--ft-text)" });
  if (h.other > 0)      row.push({ key: "O", value: h.other,      label: "OTHER",    bg: "var(--ft-muted)",   fg: "var(--ft-base)" });
  return row;
}

interface RenderTile extends Bucket { pxWidth: number }

function planRow(row: Bucket[]): RenderTile[] {
  const rowTotal = row.reduce((s, r) => s + Math.max(r.value, 0), 0) || 1;
  const provisional: RenderTile[] = row.map((r) => ({
    ...r,
    pxWidth: (Math.max(r.value, 0) / rowTotal) * (AVAILABLE_W - (row.length - 1) * GAP),
  }));
  const bigEnough = provisional.filter((r) => r.pxWidth >= COLLAPSE_AT);
  const collapsed = provisional.filter((r) => r.pxWidth < COLLAPSE_AT);
  if (collapsed.length === 0) return provisional;
  const collapsedValue = collapsed.reduce((s, r) => s + r.value, 0);
  return [
    ...bigEnough,
    {
      key: "collapsed",
      value: collapsedValue,
      label: `+${collapsed.length}`,
      bg: "var(--ft-border)",
      fg: "var(--ft-text)",
      pxWidth: (collapsedValue / rowTotal) * (AVAILABLE_W - bigEnough.length * GAP),
    },
  ];
}

export function BlockField({ holdings }: { holdings: Holdings }) {
  const { property, cash, investment, pension, other } = holdings;
  const showProperty = property > 0;
  const topH = showProperty ? HERO_H : 0;
  const rowH = showProperty ? ROW_H_WITH_HERO : FIELD_H;
  const total = property + cash + investment + pension + other;

  const tiles = planRow(buildRow(holdings));

  return (
    <div
      style={{
        width: "100%",
        maxWidth: AVAILABLE_W,
        height: FIELD_H,
        boxShadow: "10px -10px 0 0 var(--ft-border)",
        display: "flex",
        flexDirection: "column",
        gap: showProperty ? GAP : 0,
      }}
    >
      {showProperty && <HeroTile height={topH} value={property} total={total} />}
      <TileRow tiles={tiles} rowH={rowH} withHero={showProperty} />
    </div>
  );
}

function HeroTile({ height, value, total }: { height: number; value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div
      style={{
        height,
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
        PROPERTY · {pct}%
      </span>
      <span className="pnum" style={{ fontSize: 21, fontWeight: 600, letterSpacing: "-0.03em" }}>
        {nfmt(value, { symbol: "£", decimals: 0 })}
      </span>
    </div>
  );
}

function TileRow({ tiles, rowH, withHero }: { tiles: RenderTile[]; rowH: number; withHero: boolean }) {
  // The last tile has flex-grow:1 so it fills the remainder; its DISPLAYED
  // width can exceed its proportional pxWidth. Fit-check needs the displayed
  // width, otherwise figures that would in fact fit get hidden.
  const gapTotal = (tiles.length - 1) * GAP;
  const nonLastSum = tiles.slice(0, -1).reduce((s, r) => s + r.pxWidth, 0);
  const lastDisplayed = Math.max(tiles.at(-1)?.pxWidth ?? 0, AVAILABLE_W - nonLastSum - gapTotal);

  const figureFontSize = withHero ? 13 : 21;
  const pad = withHero ? 8 : 14;
  const padCss = withHero ? "8px 8px" : "14px 14px";

  return (
    <div style={{ height: rowH, display: "flex", gap: GAP }}>
      {tiles.map((tile, i) => {
        const displayedWidth = i === tiles.length - 1 ? lastDisplayed : tile.pxWidth;
        const figureText = nfmt(tile.value, { symbol: "£", decimals: 0 });
        // Rule (CLAUDE.md): a financial figure is shown in full or not at all.
        const showFigure = figureFits(figureText, displayedWidth, figureFontSize, pad);
        const showLabel = labelFits(tile.label, displayedWidth, 11, pad);
        return (
          <div
            key={tile.key}
            style={{
              width: `${tile.pxWidth}px`,
              flexGrow: tiles.length - 1 === i ? 1 : 0,
              background: tile.bg,
              color: tile.fg,
              padding: padCss,
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              justifyContent: showFigure && showLabel ? "space-between" : "flex-start",
              overflow: "hidden",
            }}
          >
            {showLabel && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                {tile.label}
              </span>
            )}
            {showFigure && (
              <span
                className="pnum"
                style={{
                  fontSize: figureFontSize,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  letterSpacing: withHero ? undefined : "-0.03em",
                }}
              >
                {figureText}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
