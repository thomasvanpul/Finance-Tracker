// SAFE TO SPEND — the fourth band of the dashboard's top region.
//
// Same computation as the phone's, same endpoint, same wording module
// (lib/allocation-view.ts). The difference is only presentation: the phone
// shows the figure, this shows the figure AND its reasoning — what is
// committed, what each goal claims per day, what drift discounts. Neither
// surface recomputes anything; the arithmetic is the server's, deliberately
// (routes/allocation.ts).
//
// It is a band, not a widget and not a route. CLAUDE.md: a new feature needs
// a home before it needs a route, and the default is a section inside an
// existing screen. This is the one number the top region did not have — the
// KPI run states position, WHAT CHANGED states movement, and neither answers
// "what can I spend today". It cannot be removed for the same reason WHAT
// CHANGED cannot: a headline figure with no stated reasoning is what this
// region exists to stop.
//
// §18's register, unchanged: no whitespace between bands, only rules; the
// 8px mono key; the "Workings" disclosure that WHAT CHANGED already uses, so
// the reasoning is one keystroke away rather than always occupying the page.

import { useState } from "react";
import { useGetAllocation, useListGoals } from "@workspace/api-client-react";
import { Text, HStack, VStack } from "@/components/primitives";
import { DrillButton, DrillTarget } from "@/components/drill";
import { formatMoney } from "@/lib/utils";
import { Key, RULE } from "./top-region";
import {
  allowanceState,
  contributionGap,
  goalClaimViews,
  waitingLine,
  type GoalClaimView,
} from "@/lib/allocation-view";

/** One leg of the decomposition. `href` only where the leg is a sum over
 *  rows the user can go and look at — §14. The allowance itself has no href
 *  and never will: it is a projection, and §14 excludes those by name. */
function Leg({ label, value, currency, href, tone }: {
  label: string;
  value: number | null;
  currency: string;
  href?: string;
  tone?: string;
}) {
  const text = formatMoney(value, currency);
  // Zero is a real sum and prints, but there are no rows behind it, so it
  // takes no drill (§14: "Null, zero and non-zero are three states").
  const drillable = href != null && value != null && value !== 0;
  const figure = (
    <Text as="span" numeric size={11} weight={600} color={tone ?? "var(--ft-text)"}
      className={drillable ? "ft-drill" : undefined} nowrap>
      {text}
    </Text>
  );
  return (
    <HStack align="baseline" gap={5} shrink={false}>
      <Text as="span" mono size={8} upper letterSpacing="0.14em" color="var(--ft-dim)" nowrap>{label}</Text>
      {drillable
        ? <DrillTarget href={href} title={`${label} — open what it is made of`}>{figure}</DrillTarget>
        : figure}
    </HStack>
  );
}

/** A goal's claim, and the two things about it the API states but does not
 *  interpret: that an overdue goal takes its whole remainder at once, and
 *  that a deadline can demand more per month than the user said they would
 *  contribute. */
function GoalRow({ g, currency }: { g: GoalClaimView; currency: string }) {
  const gap = contributionGap(g);
  return (
    <HStack align="baseline" gap={8} wrap>
      <Text as="span" size={11} color="var(--ft-text)" nowrap>{g.name}</Text>
      {/* An overdue goal's perDay IS the whole remainder — the engine claims
          it at once rather than spreading it over a negative number of days
          (allocation.ts, goalClaim). Printing "£580.00/day" on it says the
          goal takes £580 every day, which is false and reads as a much
          larger claim than the one being made. The suffix is dropped, and
          the line beside it says what the figure actually is. */}
      <Text as="span" numeric size={11} weight={600} color="var(--ft-text)" nowrap>
        {formatMoney(g.perDay, currency)}
        {!g.overdue && <Text as="span" size={9} color="var(--ft-dim)">/day</Text>}
      </Text>
      {g.overdue && (
        // Not smoothed and not hidden. The deadline has passed, so the whole
        // remainder is due now rather than spread — spreading it over a
        // negative number of days would hand the user an allowance INCREASE
        // for missing a savings deadline (allocation.ts, goalClaim). It
        // looks startling because it is.
        <Text as="span" mono size={9} color="var(--ft-amber)" letterSpacing="0.04em" nowrap>
          {g.daysOverdue} DAYS OVERDUE — WHOLE REMAINDER CLAIMED NOW
        </Text>
      )}
      {gap !== null && (
        // The one place this UI adds meaning the API does not. The engine
        // lets a deadline beat a stated monthly contribution; stating only
        // the winner turns the user's own figure into a surprise. Both, and
        // it reads as a decision.
        <Text as="span" size={10} color="var(--ft-muted)" nowrap>
          you said {formatMoney(gap.stated, currency)}/mo, your deadline needs{" "}
          <Text as="span" numeric size={10} weight={600} color="var(--ft-text)">
            {formatMoney(gap.needed, currency)}
          </Text>
          /mo
        </Text>
      )}
    </HStack>
  );
}

export function AllowanceBand() {
  const [open, setOpen] = useState(false);
  const { data, isError } = useGetAllocation();
  // Goals carry the stated monthly contribution; the allocation response
  // carries the claim the deadline produced. Neither alone can say "you said
  // £500, your deadline needs £674", which is why both are read here.
  const { data: goals } = useListGoals();

  if (isError || !data) return null;

  const currency = data.baseCurrency;
  const state = allowanceState(data);
  const claims = goalClaimViews(data, goals ?? []);
  // Nothing to disclose in the waiting state that the line does not already
  // say: the legs that WERE computed are inputs to a figure that does not
  // exist, and printing them under a "Workings" toggle invites the reader to
  // do the subtraction themselves and arrive at the partial number the
  // engine withheld on purpose.
  const hasWorkings = state.kind === "figure";

  return (
    // The rule between this band and WHAT CHANGED above it is a property of
    // the block, not of either band — same argument as Divided one level up.
    // A plain div carries it: PanelBox owns surface, Stack owns layout, and
    // a single hairline is neither a panel nor a layout prop (CLAUDE.md).
    <div style={{ borderTop: RULE }}>
    <VStack>
      <HStack align="baseline" gap={10} wide wrap padding="8px 12px">
        <Key>SAFE TO SPEND</Key>

        {state.kind === "figure" ? (
          <Text as="span" numeric size={14} weight={700} letterSpacing="-0.02em" nowrap
            color={state.value < 0 ? "var(--ft-red)" : "var(--ft-text)"}>
            {formatMoney(state.value, currency)}
            <Text as="span" mono size={9} weight={600} color="var(--ft-dim)"> /DAY</Text>
          </Text>
        ) : (
          <Text as="span" size={12} weight={500} color="var(--ft-text)" lineHeight={1.35}>
            {state.kind === "waiting" ? waitingLine(state) : state.reason}
          </Text>
        )}

        {state.kind === "blocked" && state.fix != null && (
          <Text as="span" size={11} color="var(--ft-dim)">{state.fix}</Text>
        )}

        <HStack grow minWidth0 />

        {hasWorkings && (
          <DrillButton onClick={() => setOpen(!open)}
            title={open ? "Hide how this figure was reached" : "Show how this figure was reached"}>
            <Text as="span" mono size={8} upper letterSpacing="0.14em" color="var(--ft-muted)" nowrap>
              {open ? "Hide workings" : "Workings"}
            </Text>
          </DrillButton>
        )}
        <Key>{data.horizonDays}-DAY WINDOW TO {data.windowEnd}</Key>
      </HStack>

      {open && (
        <VStack gap={8} padding="2px 12px 12px">
          {/* baseline, not the default. Each Leg is its own baseline group;
              without it on the run the five sit at whatever y their own box
              height produces and the labels stagger — visible in the first
              render, where EXPECTED IN and DRIFT DISCOUNT rode above the
              other three. */}
          <HStack gap={18} wrap align="baseline">
            <Leg label="Available now" value={data.availableNow} currency={currency} href="/accounts" />
            <Leg label="Expected in" value={data.expectedIncome} currency={currency} href="/upcoming"
              tone="var(--ft-green)" />
            <Leg label="Committed out" value={data.committedOut} currency={currency} href="/upcoming"
              tone="var(--ft-red)" />
            <Leg label="Goals claim" value={data.goalClaim} currency={currency} href="/goals"
              tone="var(--ft-red)" />
            <Leg label="Drift discount" value={data.driftReduction} currency={currency}
              href="/accounts" tone="var(--ft-red)" />
          </HStack>

          {data.driftReduction != null && data.driftGapBase != null && data.driftGapBase !== 0 && (
            // The gap is SIGNED and the engine honours only the negative
            // direction: money that left unexplained lowers the allowance,
            // money that arrived unexplained is not read as headroom, because
            // a mis-keyed balance looks identical. Saying "the window is
            // discounted by that rate" under a positive gap asserts a
            // discount of zero as though it were a discount — caught in the
            // render, where driftGapBase was +£40 and driftReduction £0.00.
            <Text as="span" size={10} color="var(--ft-muted)">
              {formatMoney(Math.abs(data.driftGapBase), currency)}{" "}
              {data.driftGapBase < 0 ? "left" : "arrived in"} your cash accounts over {data.driftDays} days
              with no transaction to explain it
              {data.driftGapBase < 0
                ? ", so the window is discounted by that rate."
                : ". Unexplained money arriving is not treated as headroom — a mis-keyed balance looks the same — so it does not raise the figure."}
            </Text>
          )}

          {claims.length > 0 && (
            <VStack gap={4}>
              <Key>WHAT EACH GOAL CLAIMS</Key>
              {claims.map((g) => <GoalRow key={g.id} g={g} currency={currency} />)}
              {data.goalsWithoutClaim > 0 && (
                // Stated, not hidden: these make the allowance MORE generous,
                // and a reader comparing the goals page to this band would
                // otherwise find goals missing with no explanation.
                <Text as="span" size={10} color="var(--ft-muted)">
                  {data.goalsWithoutClaim} goal{data.goalsWithoutClaim === 1 ? "" : "s"} claim nothing —
                  already met, or with neither a deadline nor a stated monthly contribution.
                </Text>
              )}
            </VStack>
          )}
        </VStack>
      )}
    </VStack>
    </div>
  );
}
