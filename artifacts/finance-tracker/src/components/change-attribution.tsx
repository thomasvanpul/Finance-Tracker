import { useGetAccountsChangeAttribution } from "@workspace/api-client-react";
import { Text, HStack, VStack, MonoLabel } from "@/components/primitives";
import { Drill, DrillTarget } from "@/components/drill";
import { signColour, signedMoney } from "@/lib/utils";
import { attributionView, type AttributionRow, type AttributionBreakdownLine } from "@/lib/change-attribution-view";

// ── Change attribution ──────────────────────────────────────────────────────
// The headline change figure with the causes underneath it, on the two
// surfaces that already state a net worth: the desktop dashboard band and the
// phone HOME hero.
//
// Everything it renders was already computed somewhere — the rate share in
// fx-drift, the unaccounted share in the reconciliation panel, the spend in
// the ledger — and until now each lived in its own corner, one of them behind
// a dismissible insight slot. This is the standing version: the same answers
// next to the number they explain, every time the screen is opened.
//
// Three rules it holds to, all visible in the markup:
//
//   1. IT MUST SUM. `balances` comes back from the API; when it is false the
//      surface says the parts do not add up rather than adjusting one until
//      they do. Nothing here rounds a part.
//   2. NO SNAPSHOT, NO ATTRIBUTION. The insufficient state says what is
//      missing. It never renders a £0.00 row, because a measured zero and an
//      unmeasured one are different claims.
//   3. EVERY PART DRILLS (DESIGN.md §14). The spend opens the rows it summed
//      over the window it summed them over; the rate opens WORTH; a
//      revaluation opens the account; the unexplained share opens the
//      reconciliation panel that states it in full.
//
// The window is printed next to the figure and is the REPORT's window, not
// the dashboard's month-to-date. They usually agree — the baseline rule
// prefers the 1st — but when they do not, one number under two different
// periods would be the lie, so the period is always stated.
//
// No `detail` is ever truncated: it carries rates and counts, and a clipped
// figure that reads as a different plausible number is the defect CLAUDE.md
// names first. It wraps instead.

// ── The dead third rendering, removed 2026-09-10 ────────────────────────────
//
// `ChangeAttributionBand` stood here: a full desktop band — SectionRule,
// finding column, workings column — 131 lines. It was imported by
// pages/dashboard.tsx and rendered by nothing. The adopted top region took
// over on 2026-09-08 and dashboard.tsx recorded the removal in a comment
// where the mount used to be, but the component and its import stayed.
//
// So the surface had THREE renderings of one report, not two, and the third
// was the one a reader would find first by grepping for the band. Deleting
// it is the whole of what "do not add a third" asks for here: the two that
// remain are the desktop one-liner (dashboard/top-region.tsx `WhatChanged`)
// and the phone block below, and they now render their rows from one
// implementation.

/**
 * The decomposition: one line per cause, each with the accounts behind it,
 * and the warning when the parts do not add up.
 *
 * Exported because the adopted dashboard top region states the same finding
 * on ONE line and needs somewhere to put the workings that line cannot hold.
 * Two implementations of this would be two claims about one number — the
 * mistake DESIGN.md's §14 rule and this file's header both exist to stop —
 * so the band and the top region's disclosure render the same marks.
 */
export function AttributionWorkings({ rows, currency, warning, density = "desktop" }: {
  rows: AttributionRow[];
  currency: string;
  warning: string | null;
  density?: AttributionDensity;
}) {
  const Line = density === "phone" ? PhoneAttributionLine : AttributionLine;
  return (
    <>
      {rows.map((row) => (
        <Line key={row.kind} row={row} currency={currency} />
      ))}
      {warning != null && (
        <Text as="div" mono size={density === "phone" ? 11 : 9} mt={3}
          lineHeight={density === "phone" ? "15px" : undefined}
          color="var(--ft-amber)" letterSpacing="0.04em">
          {warning}
        </Text>
      )}
    </>
  );
}

/**
 * The two densities are DOM shapes, not two sizes of one shape, which is
 * why they are two components under one entry point rather than one
 * component wearing ternaries.
 *
 * Desktop is `[label | evidence | figure]` on a single baseline, with the
 * label held to a 138px column so four rows' figures land on one right
 * margin, and the drill is an inline `<a>` inside a sentence.
 *
 * Phone is `[label over evidence | figure]`, because 390px cannot hold
 * three columns without cropping a rate quote, and the whole row is the
 * drill — a 44px block target (Mobile Amendment), which an inline `<a>`
 * cannot be.
 *
 * What they are NOT allowed to differ on is which rows exist, what those
 * rows say, or what they add to. That is `AttributionRow`, and it comes
 * out of `attributionView()` for both.
 */
export type AttributionDensity = "desktop" | "phone";

function AttributionLine({ row, currency }: { row: AttributionRow; currency: string }) {
  return (
    <VStack gap={2}>
      <HStack align="baseline" gap={8} wide>
        {/* The label is the SUBJECT of the row's sentence — "the rate moved",
            "you spent" — and it inherited --ft-dim, which made it the
            quietest thing on a row it governs, quieter than the evidence
            beneath it. Colour here is meant to be semantic (DESIGN.md) and
            dimming the subject encodes nothing except that nobody chose it.
            --ft-text, one weight up from the detail, and the amount keeps
            the only semantic colour on the row. */}
        {/* minWidth lives on the wrapper, not on the Drill. The Drill is an
            <a>, so it is only a flex item — and only min-width-able — while
            it is a direct child of the HStack. Wrapping it without moving
            the width would have quietly dropped the label column's
            alignment. */}
        <span style={{ color: "var(--ft-text)", minWidth: 138, flexShrink: 0 }}>
          <Drill href={row.drillHref} title={`Open what is behind "${row.label}"`} style={{ fontSize: 11, fontWeight: 500 }}>
            {row.label}
          </Drill>
        </span>
        {/* The evidence grows, which pushes the figure to the column's right
            edge. Every figure in this block — this row and the account lines
            under it — then lands on one right margin, so the decomposition
            reads as a column that visibly sums to the total rather than as
            four numbers at four arbitrary x positions. That ragged edge was
            the surface's own instance of alignment never having been
            chosen. */}
        <HStack grow minWidth0>
          <Text as="span" mono size={11} color="var(--ft-dim)">
            {row.detail}
          </Text>
        </HStack>
        {/* shrink={false}: "in full or not at all". The figure is the one
            thing on the row that must never give up width, so the evidence
            beside it wraps or compresses first. */}
        <HStack shrink={false}>
          <Text as="span" mono size={11} color={signColour(row.amountBase)} numeric>
            {signedMoney(row.amountBase, currency)}
          </Text>
        </HStack>
      </HStack>
      {row.breakdown.map((line) => (
        <BreakdownLine key={line.drillHref + line.label} line={line} currency={currency} />
      ))}
    </VStack>
  );
}

/**
 * One account under a row. Indented to the row's own label column so the
 * sub-lines read as belonging to it, and set a step smaller and dimmer so
 * the row above still carries the weight. The figure is still a full .pnum
 * — CLAUDE.md's "in full or not at all" has no small-print exception.
 */
function BreakdownLine({ line, currency }: { line: AttributionBreakdownLine; currency: string }) {
  return (
    <HStack align="baseline" gap={8} wide padding="0 0 0 14px">
      <HStack grow minWidth0>
        <Drill href={line.drillHref} title={`Open ${line.label}`} style={{ fontSize: 11 }}>
          {line.label}
        </Drill>
      </HStack>
      <HStack shrink={false}>
        <Text as="span" mono size={11} color="var(--ft-dim)" numeric>
          {signedMoney(line.amountBase, currency)}
        </Text>
      </HStack>
    </HStack>
  );
}

/**
 * A cause row on the phone. The whole row is the tap target, so the label
 * carries `.ft-drill` for the mark and the DrillTarget above it carries the
 * href — the split `Drill` uses on desktop does not survive being a block.
 */
function PhoneAttributionLine({ row, currency }: { row: AttributionRow; currency: string }) {
  return (
    <VStack>
      <DrillTarget href={row.drillHref} title={`Open what is behind "${row.label}"`}>
        {/* paddingY 11 on a 22px line box is the Amendment's 44px target,
            and it is what gives the rows their rhythm. */}
        <HStack align="baseline" justify="between" gap={12} paddingY={11}>
          <VStack gap={2} minWidth0>
            <span className="ft-drill">
              <Text as="span" size={13} color="var(--ft-text)">{row.label}</Text>
            </span>
            <Text as="div" mono size={11} color="var(--ft-dim)" lineHeight="15px">{row.detail}</Text>
          </VStack>
          <Text as="span" mono size={13} color={signColour(row.amountBase)} numeric>
            {signedMoney(row.amountBase, currency)}
          </Text>
        </HStack>
      </DrillTarget>
      {row.breakdown.map((line) => (
        <PhoneBreakdownLine key={line.drillHref + line.label} line={line} currency={currency} />
      ))}
    </VStack>
  );
}

/**
 * One account under a phone row.
 *
 * Until 2026-09-10 the phone rendered no breakdown at all: `row.breakdown`
 * has been on every row since 2026-09-07 and only the desktop line read it,
 * so the phone said "the rate moved · 3 currencies" and offered no way to
 * see which three. That was not a density decision — it was the evidence
 * being on one platform and not the other, which is exactly the drift a
 * shared row type exists to prevent.
 *
 * Indented to the row's label, a step down in weight, and still a 44px
 * target of its own because it is still a drill.
 */
function PhoneBreakdownLine({ line, currency }: { line: AttributionBreakdownLine; currency: string }) {
  return (
    <DrillTarget href={line.drillHref} title={`Open ${line.label}`}>
      {/* 14 + a 16px line + 14 = 44. The Amendment says "minimum 44x44px
          for anything tappable, no exceptions", and a sub-line is a drill.
          Hierarchy against the row above it is carried by type and colour
          — 12px muted against 13px text — not by making the target small.
          `padding` alone: passing `paddingY` as well applied both, so each
          sub-line carried 20px top and bottom and the breakdown read as
          three separate blocks rather than as lines under a row. */}
      <HStack align="baseline" justify="between" gap={12} padding="14px 0 14px 14px">
        <HStack grow minWidth0>
          <span className="ft-drill">
            <Text as="span" size={12} color="var(--ft-muted)" lineHeight="16px">{line.label}</Text>
          </span>
        </HStack>
        <HStack shrink={false}>
          <Text as="span" mono size={12} color="var(--ft-dim)" numeric>
            {signedMoney(line.amountBase, currency)}
          </Text>
        </HStack>
      </HStack>
    </DrillTarget>
  );
}

// ── Phone ───────────────────────────────────────────────────────────────────

/**
 * The phone block. Sits directly under the HOME hero, which already states
 * net worth and its month-to-date move — this says what that move was made
 * of. Its own total is printed, small, because its window is its own.
 */
export function ChangeAttributionBlock() {
  const { data, isLoading } = useGetAccountsChangeAttribution();
  const view = attributionView(data);
  if (isLoading || view == null || data == null) return null;

  if (view.status === "insufficient") {
    return (
      <VStack padding="0 18px 18px">
        <Text as="div" size={13} lineHeight="17px" color="var(--ft-dim)">{view.emptyReason}</Text>
      </VStack>
    );
  }

  return (
    <VStack padding="0 18px 18px" gap={8}>
      <HStack align="baseline" justify="between" gap={8}>
        <MonoLabel size={11} letterSpacing="0.16em">WHAT CHANGED</MonoLabel>
        <Text as="span" mono size={11} color="var(--ft-dim)" numeric>
          {signedMoney(view.totalBase, data.baseCurrency)} {view.windowLabel}
        </Text>
      </HStack>

      {/* The same finding the desktop band leads with, and for the same
          reason: the rows say what the parts were, and nothing said what
          the answer was. It sits under the label rather than above it
          because the phone block is a section inside HOME, not a page —
          the label is the section's name and the finding is its first
          line. 15px rather than desktop's 17px: the Mobile Amendment's
          body step, and the hero above it already owns the largest type
          on the screen. */}
      <Text as="div" size={16} weight={600} color="var(--ft-text)" lineHeight="20px" mt={2}>
        {view.finding.headline}
      </Text>
      {view.finding.support != null && (
        <Text as="div" mono size={11} color="var(--ft-muted)" lineHeight="15px">
          {view.finding.support}
        </Text>
      )}

      {/* The same implementation the desktop disclosure renders, at the
          phone's density. The rows, their labels, their evidence, their
          drill targets and the per-account lines under them are one set of
          marks fed by one `AttributionRow[]`; what differs between the two
          surfaces is the DOM shape a 390px column needs and the fact that
          desktop hides these behind a toggle to keep its one-line band. */}
      <VStack>
        <AttributionWorkings rows={view.rows} currency={data.baseCurrency} warning={view.warning} density="phone" />
      </VStack>
    </VStack>
  );
}
