import { useGetAccountsChangeAttribution } from "@workspace/api-client-react";
import { PanelBox, PanelHeader, SectionRule, Text, HStack, VStack, MonoLabel } from "@/components/primitives";
import { Drill, DrillTarget } from "@/components/drill";
import { formatMoney } from "@/lib/utils";
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

function signed(value: number, currency: string): string {
  return `${value > 0 ? "+" : ""}${formatMoney(value, currency)}`;
}

function amountColour(value: number): string {
  if (value === 0) return "var(--ft-muted)";
  return value > 0 ? "var(--ft-green)" : "var(--ft-red)";
}

// ── Desktop ─────────────────────────────────────────────────────────────────

/**
 * The dashboard band. Sits under the KPI bar, which states net worth; this
 * states what moved it. One panel, the total on the left, the causes on the
 * right, so the figure and its decomposition read as one object.
 */
export function ChangeAttributionBand() {
  const { data, isLoading } = useGetAccountsChangeAttribution();
  const view = attributionView(data);
  if (isLoading || view == null || data == null) return null;

  // Structure, not a widget — DESIGN.md § 6. This band is the page: it
  // cannot be dragged, removed or dismissed, and it states what moved the
  // figure the strip above it prints. So it carries no frame and no
  // --ft-surface fill; SectionRule's hairline and the spacing beneath are
  // the whole of its separation. It used to be a PanelBox, which is why the
  // dashboard read as a stack of identical rectangles.
  return (
    <VStack marginBottom={14}>
      {/* When there is nothing to attribute this is one rule and a reason,
          not a frame around a single sentence: the reason goes in the
          right slot and there is no body at all. */}
      {/* The window used to be printed here AND is now printed next to the
          total it qualifies, which is where it belongs — a period is a
          property of a figure, not of a heading. Printing it in both places
          would be one fact stated twice, so the header slot now carries
          only the reason there is nothing to show. */}
      <SectionRule right={
        view.status === "insufficient" ? (
          <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.08em">
            {view.emptyReason}
          </Text>
        ) : (
          /* The window moved up here when the total below it was removed
             — see the note on that removal. A period still has to be
             stated on this surface, because the rows on the right are
             sums over it and a decomposition with no window is not
             checkable. It qualifies every row in the band rather than a
             single figure now, which is what a header slot is for. */
          <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.08em">
            {view.windowLabel}
          </Text>
        )
      }>
        WHAT CHANGED
      </SectionRule>

      {view.status === "insufficient" ? null : (
        /* Three registers, in the order a person reads them, and that order
           is the design.

           Until 2026-09-08 this was two columns: the total floating left of
           an indented list, using 700 of its 1180px and leaving the rest
           blank. It had correct data and no design, and the finding it
           exists to deliver — that almost none of the change was the user
           spending — was not stated anywhere on it. A reader had to compare
           the spend row against the others to reach it, which is the work
           the screen is supposed to have already done.

           So the finding is now the first thing on the surface, in prose,
           at a size nothing else in the band competes with. The claim, then
           the evidence — which is the shape the AI insight card also takes,
           and the two now agree with each other rather than each inventing
           a register.

           It is still two columns, and that is deliberate rather than
           inherited. What was wrong before was not the number of columns;
           it was that the left one was a bare figure with nothing to say,
           so the two halves were fragments rather than a claim and its
           support. Left is now the sentence, its magnitudes, and the total
           that sentence is about; right is the decomposition that sentence
           was derived from. Read across, it is an argument. */
        <HStack align="start" gap={40} wrap justify="between" wide padding="14px 0 4px">
          {/* THE CLAIM. Capped at 420px because this column is prose and
              prose has a measure — a 17px sentence run across 1180px is
              unreadable, and the cap is what lets the band use its width
              without the sentence paying for it. */}
          <VStack gap={2} minWidth={280} maxWidth={420}>
            <Text as="div" size={16} weight={600} color="var(--ft-text)"
              lineHeight={1.25} letterSpacing="-0.01em">
              {view.finding.headline}
            </Text>

            {/* Its evidence, when there is more than one part to weigh.
                Mono, because every term in it is a magnitude or a named
                cause. */}
            {view.finding.support != null && (
              <Text as="div" mono size={11} color="var(--ft-muted)" mt={1} lineHeight={1.4}>
                {view.finding.support}
              </Text>
            )}

            {/* The total used to be printed here at 20px, with its window
                beside it. It was REMOVED on 2026-09-08, when the dashboard
                header was rebuilt around one number: that header now states
                this same figure, with the same sign, colour, window and
                drill target, about 300px above this line.

                Two statements of one fact is bad enough. This pair was
                worse than that, because the second one was BIGGER — 20px
                here against 15px in the header — so the page restated its
                headline movement and then outranked its own first
                statement of it. A reader scanning down met the number,
                met it again larger, and had no way to tell whether the two
                were the same measurement or two different windows.

                What is left in this column is what only this surface has:
                the finding in prose, and its supporting magnitudes. The
                figure lives once, in the header, and the drill to
                /net-worth went up there with it. The window moved to the
                SectionRule above, because it qualifies the decomposition
                on the right as much as it qualified this figure. */}
          </VStack>

          {/* THE WORKINGS. Left to right is a reading order too: the claim,
              then what it was derived from. This is NOT the arrangement
              that was rejected — that one put a bare figure to the left of
              an indented list and stated no finding at all, so the left
              column was a number with nothing to say and the two halves
              were not a claim and its evidence, just two fragments.

              `wrap` on the row: under about 700px the workings drop beneath
              the claim rather than squeezing a rate quote into 200px. The
              rate lines carry "GBP/MYR 5.4700 → 5.5039", which must not be
              cropped. */}
          <VStack gap={4} grow minWidth={340} maxWidth={520} marginTop={2}>
            {view.rows.map((row) => (
              <AttributionLine key={row.kind} row={row} currency={data.baseCurrency} />
            ))}
            {view.warning != null && (
              <Text as="div" mono size={9} mt={3} color="var(--ft-amber)" letterSpacing="0.04em">
                {view.warning}
              </Text>
            )}
          </VStack>
        </HStack>
      )}
    </VStack>
  );
}

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
          <Text as="span" mono size={11} color={amountColour(row.amountBase)} numeric>
            {signed(row.amountBase, currency)}
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
          {signed(line.amountBase, currency)}
        </Text>
      </HStack>
    </HStack>
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
          {signed(view.totalBase, data.baseCurrency)} {view.windowLabel}
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

      <VStack>
        {view.rows.map((row) => (
          <DrillTarget key={row.kind} href={row.drillHref} title={`Open what is behind "${row.label}"`}>
            {/* paddingY 11 on a 22px line box is the Amendment's 44px tap
                target, and it is what gives the rows their rhythm. */}
            <HStack align="baseline" justify="between" gap={12} paddingY={11}>
              <VStack gap={2} minWidth0>
                <span className="ft-drill">
                  <Text as="span" size={13} color="var(--ft-text)">{row.label}</Text>
                </span>
                <Text as="div" mono size={11} color="var(--ft-dim)">{row.detail}</Text>
              </VStack>
              <Text as="span" mono size={13} color={amountColour(row.amountBase)} numeric>
                {signed(row.amountBase, data.baseCurrency)}
              </Text>
            </HStack>
          </DrillTarget>
        ))}
      </VStack>

      {view.warning != null && (
        <Text as="div" mono size={11} lineHeight="15px" color="var(--ft-amber)">
          {view.warning}
        </Text>
      )}
    </VStack>
  );
}
