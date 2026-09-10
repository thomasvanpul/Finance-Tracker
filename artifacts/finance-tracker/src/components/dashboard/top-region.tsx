// ── The dashboard's top region ──────────────────────────────────────────────
//
// Everything between the breadcrumb and the widget grid: the KPI run, the
// EDIT LAYOUT control, WHAT CHANGED, and the AI insights slot.
//
// This is `top-1-flat`, adopted. It was one of six arrangements captured in
// round 3 (see .review/archive/2026-09-09T1041-*) and Thomas picked it. Its
// argument, restated because the code should carry it:
//
//   The rebuilt header rested on "one number leads the page" — a dashboard
//   answers one question in two seconds, so net worth is 52px and everything
//   else drops a level. This refuses that premise. A person who opens this
//   every day already knows roughly where their net worth is; what they want
//   is to SCAN. So every KPI is the same size in one ruled run, dashed cells
//   included, with EDIT LAYOUT as the last cell of that same run.
//
// Two rules it breaks, named rather than hidden:
//
//   · The "one number leads" premise itself. Not a DESIGN.md clause — it is
//     the argument the previous header rested on — and refusing it is the
//     whole point.
//   · DESIGN.md §3's rhythm ("~16px between groups"). There is no whitespace
//     between the three bands at all, only rules. The density is the point;
//     §3's asymmetry survives inside the cells, where it does the work.
//
// A third break belongs to the caller rather than to this file: the AI
// insights slot is filled with a DENSE surface — no radius, no elevation —
// where DESIGN.md §6 gives an ephemeral, dismissible surface both. The trade
// is that the terminal register is worth more here than that distinction.
// The dismiss affordance is untouched, so the surface is still ephemeral in
// behaviour; only its marking changed.
//
// The marks below (Strip, Divided, Reading, EditLayout, Key, PageLabel,
// Insights) are exported because components/proto/top-region.tsx renders the
// other five arrangements out of the same vocabulary. Six arrangements of one
// treatment was the brief; sharing the treatment is what makes that true.

import { Fragment, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useGetAccountsChangeAttribution } from "@workspace/api-client-react";
import { Text, HStack, VStack } from "@/components/primitives";
import { Drill, DrillButton, DrillTarget } from "@/components/drill";
import { AttributionWorkings } from "@/components/change-attribution";
import { LayoutGrid } from "lucide-react";
import { formatMoney } from "@/lib/utils";
import { splitInsight } from "@/lib/insight-split";
import { attributionView, causeSegments, type AttributionRow, type AttributionView } from "@/lib/change-attribution-view";

export const RULE = "1px solid var(--ft-border)";

/** Structurally the dashboard's own KpiCellData, declared here rather than
 *  imported so nothing in components/ depends on a page module. */
export interface TopRegionCell {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: string;
  valueColor?: string;
  href?: string;
}

export interface TopRegionProps {
  cells: TopRegionCell[];
  dashboardLabel: string;
  isCustomizing: boolean;
  onCustomize: () => void;
  /** The AI insights surface, passed in rather than imported: it lives in the
   *  page, owns its own fetch and its own dismissal, and this file must not
   *  reach into a page module. Null when there is nothing to show. */
  insights?: ReactNode;
}

/** The attribution report, already narrowed, plus the currency it is in.
 *  Both or neither — a figure with no currency is not renderable. */
export function useAttribution(): {
  ok: Extract<AttributionView, { status: "ok" }> | null;
  currency: string;
  emptyReason: string | null;
} {
  const { data } = useGetAccountsChangeAttribution();
  const view = attributionView(data);
  const baseCurrency = data?.baseCurrency ?? null;
  if (view === null || baseCurrency === null) return { ok: null, currency: "", emptyReason: null };
  if (view.status === "insufficient") return { ok: null, currency: baseCurrency, emptyReason: view.emptyReason };
  return { ok: view, currency: baseCurrency, emptyReason: null };
}

/** A cell printing an en dash has nothing to say. */
export function isDashed(cell: TopRegionCell): boolean {
  return cell.value === "–" || cell.value === "—";
}

export function signColour(v: number): string {
  if (v === 0) return "var(--ft-muted)";
  return v > 0 ? "var(--ft-green)" : "var(--ft-red)";
}

export function signed(v: number, currency: string): string {
  return `${v > 0 ? "+" : ""}${formatMoney(v, currency)}`;
}

// ── Marks ───────────────────────────────────────────────────────────────────

/**
 * One reading in a status strip. Key and value on one baseline; the run
 * divides its cells with a left rule and no gap, because a gap says "these
 * are separate" and a rule says "these are adjacent", and on a strip of
 * readings adjacency is the whole idea.
 *
 * §14: a figure computed from rows is a button, and only a figure with rows
 * behind it. `href` is absent on a cell printing an en dash, so a cell with
 * nothing to say carries no underline and no hit area.
 */
export function Reading({ cell, valueSize = 12 }: { cell: TopRegionCell; valueSize?: number }) {
  const figure = (
    <Text as="span" numeric size={valueSize} weight={600}
      color={cell.valueColor ?? "var(--ft-text)"} className={cell.href ? "ft-drill" : undefined} nowrap>
      {cell.value}
    </Text>
  );
  return (
    <HStack align="baseline" gap={6} padding="5px 12px" shrink={false}>
      <Text as="span" mono size={8} upper letterSpacing="0.14em" color="var(--ft-dim)" nowrap>{cell.label}</Text>
      {cell.href
        ? <DrillTarget href={cell.href} title={`${cell.label} — open what it is made of`}>{figure}</DrillTarget>
        : figure}
      {cell.delta !== undefined && (
        <Text as="span" numeric size={9} weight={600} color={cell.deltaColor ?? "var(--ft-dim)"} nowrap>{cell.delta}</Text>
      )}
    </HStack>
  );
}

/** The run those readings sit in. `edges` says which hairlines it seats
 *  itself on, so a strip that follows an already-bordered block does not
 *  paint a second line on top of the first. */
export function Strip({ children, edges = "both" }: { children: ReactNode; edges?: "both" | "bottom" | "none" }) {
  return (
    <div style={{
      display: "flex",
      flexWrap: "wrap",
      alignItems: "stretch",
      borderTop: edges === "both" ? RULE : undefined,
      borderBottom: edges === "none" ? undefined : RULE,
      overflowX: "auto",
      scrollbarWidth: "none",
    }}>
      {children}
    </div>
  );
}

/** The divider belongs to the run, not to the cell, so every mark in a strip
 *  goes through here rather than deciding for itself. */
export function Divided({ children, first }: { children: ReactNode; first: boolean }) {
  return <div style={{ borderLeft: first ? undefined : RULE, flexShrink: 0, display: "flex", alignItems: "center" }}>{children}</div>;
}

/** A column inside a ruled block. Same argument as Divided one level up: the
 *  rule between two columns is a property of the block. */
export function Col({ children, divided, padding }: { children: ReactNode; divided?: boolean; padding: string }) {
  return <div style={{ borderLeft: divided === true ? RULE : undefined, padding, minWidth: 0 }}>{children}</div>;
}

/**
 * EDIT LAYOUT, in two registers.
 *
 * `chip` is the older control — an edge and a radius so it reads as
 * pressable. `cell` is the same control as a divided strip cell, which is
 * what an arrangement with no chrome row needs: at that point the strip IS
 * the frame and a border inside it would be a box in a box. The adopted top
 * region uses `cell`; `chip` is kept for the arrangements that still have a
 * chrome row.
 */
export function EditLayout({ register, isCustomizing, onCustomize }: {
  register: "chip" | "cell";
  isCustomizing: boolean;
  onCustomize: () => void;
}) {
  const shared: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: isCustomizing ? "var(--ft-accent)" : "var(--ft-muted)",
    fontFamily: "var(--font-mono)",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: "0.10em",
    textTransform: "uppercase",
    cursor: "pointer",
    flexShrink: 0,
    whiteSpace: "nowrap",
    background: isCustomizing ? "color-mix(in srgb, var(--ft-accent) 12%, transparent)" : "transparent",
  };
  const style: CSSProperties = register === "chip"
    ? { ...shared, height: 26, border: `1px solid ${isCustomizing ? "var(--ft-accent)" : "var(--ft-border2)"}`, borderRadius: 2, padding: "0 10px" }
    : { ...shared, border: "none", padding: "6px 12px", alignSelf: "stretch" };
  return (
    <button onClick={onCustomize} style={style}
      title={isCustomizing ? "Finish editing" : "Edit layout — add, remove, resize and rearrange the widgets on this page"}>
      <LayoutGrid size={register === "chip" ? 11 : 10} aria-hidden />
      {isCustomizing ? "Done" : "Edit layout"}
    </button>
  );
}

/**
 * The insight cells, in the terminal register: figure, clause, support, with
 * no float, no radius and no elevation, divided by rules. See the file header
 * for the §6 trade this makes.
 *
 * `column` drops the support line and sets the three findings as a list,
 * which is what an arrangement placing them ABOVE the page's subject needs.
 */
export function Insights({ lines, register, trailing }: {
  lines: string[];
  register: "dense" | "column";
  /** Controls that belong to the run rather than to any one cell — the
   *  refresh and dismiss the real panel carries. A trailing cell rather than
   *  a header row, because a header row would put a second rule across a
   *  block whose whole idea is that it has none. */
  trailing?: ReactNode;
}) {
  if (lines.length === 0) return null;
  if (register === "column") {
    return (
      <VStack gap={3} paddingY={8}>
        {lines.map((line, i) => {
          const { figure, clause } = splitInsight(line);
          return (
            <HStack key={i} align="baseline" gap={10} wide>
              {figure !== null && (
                <Text as="span" numeric size={12} weight={700} color="var(--ft-text)" nowrap>{figure}</Text>
              )}
              <Text as="span" size={11} color="var(--ft-muted)" lineHeight={1.35}>{clause}</Text>
            </HStack>
          );
        })}
      </VStack>
    );
  }
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: `repeat(${lines.length}, minmax(0, 1fr))${trailing === undefined ? "" : " auto"}`,
      borderTop: RULE,
      borderBottom: RULE,
    }}>
      {lines.map((line, i) => {
        const { figure, clause, support } = splitInsight(line);
        return (
          <Col key={i} divided={i > 0} padding="7px 12px">
            <VStack gap={3}>
              {figure !== null && (
                <Text as="div" numeric size={14} weight={700} color="var(--ft-text)" lineHeight={1.1}>{figure}</Text>
              )}
              <Text as="div" size={11} color="var(--ft-text)" lineHeight={1.35}>{clause}</Text>
              {support !== null && (
                <Text as="div" mono size={9} color="var(--ft-dim)" lineHeight={1.4}>{support}</Text>
              )}
            </VStack>
          </Col>
        );
      })}
      {trailing !== undefined && (
        <div style={{ borderLeft: RULE, display: "flex", alignItems: "center" }}>{trailing}</div>
      )}
    </div>
  );
}

/** The hero figure, at whatever size an arrangement gives it. Never
 *  overflow-hidden, never ellipsised, and it keeps its drill. */
export function Hero({ cell, size }: { cell: TopRegionCell | undefined; size: number }) {
  const figure = (
    <Text as="span" numeric size={size} weight={700} letterSpacing="-0.035em" lineHeight={1}
      className={cell?.href ? "ft-drill" : undefined} nowrap>
      {cell?.value ?? "—"}
    </Text>
  );
  return (
    <span style={{ color: cell?.valueColor ?? "var(--ft-text)" }}>
      {cell?.href
        ? <DrillTarget href={cell.href} title={`${cell.label} — open what it is made of`}>{figure}</DrillTarget>
        : figure}
    </span>
  );
}

export function Key({ children }: { children: ReactNode }) {
  return <Text as="span" mono size={8} upper letterSpacing="0.14em" color="var(--ft-dim)" nowrap>{children}</Text>;
}

/** The page names itself. */
export function PageLabel({ label }: { label: string }) {
  return <Text as="span" mono upper size={9} weight={700} color="var(--ft-muted)" letterSpacing="0.10em" nowrap>{label}</Text>;
}

/**
 * The causes, as a running clause rather than a row of chips.
 *
 * They used to be `LABEL £x  LABEL £y` — two uppercase mono links pushed to
 * the far right of the line by a spacer, with the finding stranded on the
 * left. Three facts at three x positions, and nothing said they were about
 * each other. Thomas read it exactly that way: "confusing right now."
 *
 * The row labels were always written to be the SUBJECT of a sentence — "you
 * spent", "the rate moved", "nothing explains it" — see KIND_NOUN and its
 * note in change-attribution-view.ts. Nothing had ever used them as one.
 * Setting them in prose and joining them with "and" is what turns the
 * decomposition into the second half of the finding's sentence.
 *
 * §14 moves with them: the DRILL is on the figure, not on the label. A
 * figure computed from rows is the button; an uppercase label that happened
 * to be underlined was reading as navigation.
 */
function Causes({ rows, currency }: { rows: AttributionRow[]; currency: string }) {
  if (rows.length === 0) return null;
  return (
    <Text as="span" size={12} color="var(--ft-muted)" lineHeight={1.35}>
      {"— "}
      {causeSegments(rows).map(({ row, lead }) => (
        <Fragment key={row.kind}>
          {lead}
          {row.label}{" "}
          {/* `Drill`, not `DrillTarget`: .ft-drill-target is display:block, and
              a block inside a clause breaks the sentence onto two lines. Here
              the figure IS the target, so the inline drill is also the right
              §14 shape. */}
          <Drill href={row.drillHref} title={`Open what is behind "${row.label}"`}>
            <Text as="span" numeric size={12} weight={600} color={signColour(row.amountBase)} nowrap>
              {signed(row.amountBase, currency)}
            </Text>
          </Drill>
        </Fragment>
      ))}
    </Text>
  );
}

/**
 * WHAT CHANGED: one sentence, and the workings behind a disclosure.
 *
 * `top-1-flat` bought its shortness by dropping the per-account breakdown —
 * which account moved, at which rate, by how much — and that detail was the
 * only thing on the surface that made the finding checkable. The line stays
 * one line; the breakdown comes back as a disclosure rather than as a second
 * band, so the density the arrangement was chosen for survives and the
 * evidence is one press away instead of gone.
 *
 * `warning` is NOT behind the disclosure. "These do not add up" is a claim
 * about the arithmetic of every figure on the line above it, and a surface
 * whose whole rule is that it must sum cannot hide the one sentence saying
 * it did not.
 */
function WhatChanged({ ok, currency, emptyReason }: {
  ok: Extract<AttributionView, { status: "ok" }> | null;
  currency: string;
  emptyReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const hasWorkings = ok !== null && ok.rows.some((row) => row.breakdown.length > 0 || row.detail !== "");

  return (
    <VStack>
      <HStack align="baseline" gap={10} wide wrap padding="8px 12px">
        <Key>WHAT CHANGED</Key>
        {ok === null ? (
          <Text as="span" mono size={10} color="var(--ft-dim)">{emptyReason ?? "—"}</Text>
        ) : (
          <>
            {/* The claim and its decomposition sit adjacent, in that order,
                with no spacer between them. The spacer that used to stand
                here is what made them read as unrelated; it now sits AFTER
                both, where its job is to push the window to the right edge
                rather than to split a sentence in half. */}
            <Text as="span" size={12} weight={500} color="var(--ft-text)" lineHeight={1.35}>
              {ok.finding.headline}
            </Text>
            <Causes rows={ok.rows} currency={currency} />
            <HStack grow minWidth0 />
            {ok.warning !== null && (
              <Text as="span" mono size={9} color="var(--ft-amber)" letterSpacing="0.04em" nowrap>
                {ok.warning}
              </Text>
            )}
            {hasWorkings && (
              <DrillButton onClick={() => setOpen(!open)}
                title={open ? "Hide the accounts behind these figures" : "Show the accounts behind these figures"}>
                <Text as="span" mono size={8} upper letterSpacing="0.14em" color="var(--ft-muted)" nowrap>
                  {open ? "Hide workings" : "Workings"}
                </Text>
              </DrillButton>
            )}
            <Key>{ok.windowLabel}</Key>
          </>
        )}
      </HStack>

      {/* Same marks as the desktop band's right column — one implementation,
          so the two surfaces cannot drift into two claims about one number. */}
      {open && ok !== null && (
        <VStack gap={4} padding="2px 12px 10px" maxWidth={560}>
          <AttributionWorkings rows={ok.rows} currency={currency} warning={null} />
        </VStack>
      )}
    </VStack>
  );
}

// ── The region ──────────────────────────────────────────────────────────────

export function DashboardTopRegion({ cells, dashboardLabel, isCustomizing, onCustomize, insights }: TopRegionProps) {
  const { ok, currency, emptyReason } = useAttribution();

  return (
    <VStack marginBottom={14}>
      <Strip>
        <Divided first><HStack align="center" padding="5px 12px" shrink={false}><PageLabel label={dashboardLabel} /></HStack></Divided>
        {cells.map((cell) => (
          <Divided key={cell.label} first={false}><Reading cell={cell} /></Divided>
        ))}
        <HStack grow />
        <Divided first={false}><EditLayout register="cell" isCustomizing={isCustomizing} onCustomize={onCustomize} /></Divided>
      </Strip>

      <WhatChanged ok={ok} currency={currency} emptyReason={emptyReason} />

      {insights}
    </VStack>
  );
}
