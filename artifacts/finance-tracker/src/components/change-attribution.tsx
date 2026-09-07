import { useGetAccountsChangeAttribution } from "@workspace/api-client-react";
import { PanelBox, PanelHeader, Text, HStack, VStack, MonoLabel } from "@/components/primitives";
import { Drill, DrillTarget } from "@/components/drill";
import { formatMoney } from "@/lib/utils";
import { attributionView, type AttributionRow } from "@/lib/change-attribution-view";

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

  return (
    <VStack marginBottom={6}>
      <PanelBox>
        {/* When there is nothing to attribute the panel is one row, not a
            frame around a single sentence: the reason goes in the header's
            right slot and there is no body at all. A tall empty card is the
            "blocky" complaint in miniature. */}
        <PanelHeader right={
          <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.08em">
            {view.status === "insufficient" ? view.emptyReason : view.windowLabel}
          </Text>
        }>
          WHAT CHANGED
        </PanelHeader>

        {view.status === "insufficient" ? null : (
          <HStack align="stretch">
            <VStack justify="center" padding="12px 16px">
              <DrillTarget href="/net-worth" title="Net worth — everything this is the change in">
                <span className="ft-drill">
                  <Text as="div" size={26} weight={600} letterSpacing="-0.02em"
                    color={amountColour(view.totalBase)} numeric>
                    {signed(view.totalBase, data.baseCurrency)}
                  </Text>
                </span>
              </DrillTarget>
            </VStack>
            <VStack grow gap={3} padding="10px 12px">
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
      </PanelBox>
    </VStack>
  );
}

function AttributionLine({ row, currency }: { row: AttributionRow; currency: string }) {
  return (
    <HStack align="baseline" gap={10}>
      <Drill href={row.drillHref} title={`Open what is behind "${row.label}"`} style={{ fontSize: 11, minWidth: 138 }}>
        {row.label}
      </Drill>
      <Text as="span" mono size={11} color={amountColour(row.amountBase)} numeric>
        {signed(row.amountBase, currency)}
      </Text>
      <Text as="span" mono size={10} color="var(--ft-dim)">
        {row.detail}
      </Text>
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
        <Text as="div" size={12} lineHeight="17px" color="var(--ft-dim)">{view.emptyReason}</Text>
      </VStack>
    );
  }

  return (
    <VStack padding="0 18px 18px" gap={6}>
      <HStack align="baseline" justify="between" gap={10}>
        <MonoLabel size={11} letterSpacing="0.16em">WHAT CHANGED</MonoLabel>
        <Text as="span" mono size={11} color="var(--ft-dim)" numeric>
          {signed(view.totalBase, data.baseCurrency)} {view.windowLabel}
        </Text>
      </HStack>

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
