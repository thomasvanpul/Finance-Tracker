// ── ROUND 3 · SIX TOP REGIONS ───────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts. Nothing here ships and nothing in
// the app can reach it; pages/dashboard.tsx routes to it only when the
// screenshot harness has stamped data-proto="top-N" on <html>.
//
// WHAT IS BEING VARIED, AND WHAT IS NOT
//
// Not varied: the widget grid. It shipped in 1889007, Thomas said it is the
// first thing on this page that got better, and it renders unchanged
// underneath all six of these. Not varied either: the register. Every one is
// the terminal treatment that shipped with the grid — mono for figures, sans
// for language, rules instead of gaps, 8px keys at 0.14em. Six arrangements
// of one treatment, not six treatments.
//
// Varied, one column of this table per axis the brief named:
//
//        KPIs shown          WHAT CHANGED     AI insights   Largest thing
//   1    all 6, dashed too   one prose row    below         nothing (flat)
//   2    none but the hero   ledger column    above hero    net worth 52px
//   3    thin strip, all 6   LEADS the page   below change  the sentence
//   4    all 6, dashed too   middle column    below         net worth 44px
//   5    only the live ones  one inline run   absent        net worth 32px
//   6    all 6, below        below the pair   below         two figures, 52px
//
// THE RULES THESE HOLD TO
//
// No fabricated values. Every figure is one the API supplied. A KPI whose
// value is an en dash — MONTHLY INCOME, SAVINGS RATE and MoM SPEND all print
// one on the seeded account — is shown AS an en dash in five of the six;
// iteration 5 tests the other answer, which is not to show it at all. Neither
// invents a number, and no iteration is allowed to.
//
// §14 survives everywhere. Every figure that drills on the shipped header
// drills here, through the same Drill/DrillTarget components and the same
// hrefs. An arrangement that quietly dropped the affordance would be
// comparing two different products. A projection is not a sum of rows and
// correctly takes no drill in any of them.
//
// Where an iteration breaks a DESIGN.md rule it names the rule at its own
// definition below.

import { useMemo } from "react";
import { useListUpcoming } from "@workspace/api-client-react";
import { Text, HStack, VStack } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatBaseMoney } from "@/lib/utils";
import { useProtoInsights, type ProtoKpiCell } from "@/components/proto/proto-shared";
import type { AttributionRow } from "@/lib/change-attribution-view";
// Iteration 1 was adopted. Its marks moved to components/dashboard/top-region
// with it, and the other five now render out of the shipped vocabulary rather
// than a copy of it — so a change to the real top region shows up here, which
// is what makes these still worth comparing against.
import {
  RULE, Strip, Divided, Col, Reading, EditLayout, Key, PageLabel, Insights, Hero,
  useAttribution, isDashed, signColour, signed,
  DashboardTopRegion,
} from "@/components/dashboard/top-region";

export interface ProtoTopRegionProps {
  variant: number;
  cells: ProtoKpiCell[];
  dashboardLabel: string;
  /** Base-currency net worth, or null. Never coerced to zero — a projection
   *  from a fabricated zero is the thing the shipped MoneyInMotion exists not
   *  to do, and a prototype that did it would compare a lie. */
  netWorth: number | null;
  isCustomizing: boolean;
  onCustomize: () => void;
}

// ── Data ────────────────────────────────────────────────────────────────────

/**
 * The same 30-day committed roll-up the shipped header's MoneyInMotion does,
 * recomputed here rather than imported.
 *
 * Duplicated deliberately: it lives inside pages/dashboard.tsx, and
 * proto-shared.tsx's opening note is that nothing in components/ may depend
 * on a page module. Extracting it into lib/ for six throwaway screenshots
 * would be a refactor of shipped code in service of a prototype, which is the
 * wrong way round. The two must agree; this file is deleted when a direction
 * is picked.
 */
function useMotion(netWorth: number | null) {
  const { data: upcoming } = useListUpcoming();
  return useMemo(() => {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const items = (upcoming ?? []).filter((item) => {
      const due = new Date(item.dueDate);
      return due >= now && due <= in30Days && item.status === "pending";
    });
    // The shipped MoneyInMotion coalesces a null conversion to zero and is
    // baselined for that in fabricated-zero-lock.test.ts; the same shape would
    // be a NEW site here, so an unconvertible row is skipped instead. The two
    // produce the identical total — adding zero and adding nothing are the same
    // sum — so nothing about the comparison shifts.
    const sumConvertible = (type: string): number => {
      let total = 0;
      for (const item of items) {
        if (item.type !== type) continue;
        if (item.baseEquivalent === null) continue;
        total += item.baseEquivalent;
      }
      return total;
    };
    const inflows = sumConvertible("income");
    const outflows = sumConvertible("expense");
    return {
      inflows,
      outflows,
      count: items.length,
      projected: netWorth === null ? null : netWorth + inflows - outflows,
    };
  }, [upcoming, netWorth]);
}

// ── Shared marks ────────────────────────────────────────────────────────────

/** One decomposition row: the cause, its evidence, its amount, and the
 *  accounts under it.
 *
 *  The drill, the right-aligned figure column and the indented sub-lines are
 *  all from the shipped band — what changes between iterations is where the
 *  run of them sits, not how a row is set. The sub-lines are here because the
 *  first pass of these six left them out, and on this account there is
 *  exactly ONE cause row: without its three accounts the column rendered as a
 *  single stranded line, and four of the six iterations were being compared
 *  against a version of the band that had been quietly stripped. The figure
 *  never shrinks, at either level: "in full or not at all". */
function CauseRow({ row, currency, size }: { row: AttributionRow; currency: string; size: number }) {
  return (
    <VStack gap={2}>
      <HStack align="baseline" gap={8} wide>
        <span style={{ color: "var(--ft-text)", minWidth: 118, flexShrink: 0 }}>
          <Drill href={row.drillHref} title={`Open what is behind "${row.label}"`} style={{ fontSize: size, fontWeight: 500 }}>
            {row.label}
          </Drill>
        </span>
        <HStack grow minWidth0>
          <Text as="span" mono size={size - 1} color="var(--ft-dim)">{row.detail}</Text>
        </HStack>
        <HStack shrink={false}>
          <Text as="span" mono size={size} numeric color={signColour(row.amountBase)}>{signed(row.amountBase, currency)}</Text>
        </HStack>
      </HStack>
      {row.breakdown.map((line) => (
        <HStack key={line.drillHref + line.label} align="baseline" gap={8} wide padding="0 0 0 14px">
          <HStack grow minWidth0>
            <Drill href={line.drillHref} title={`Open ${line.label}`} style={{ fontSize: size }}>{line.label}</Drill>
          </HStack>
          <HStack shrink={false}>
            <Text as="span" mono size={size} color="var(--ft-dim)" numeric>{signed(line.amountBase, currency)}</Text>
          </HStack>
        </HStack>
      ))}
    </VStack>
  );
}

/** The two committed rows, at whatever size an iteration gives them. */
function MotionRows({ inflows, outflows, size }: { inflows: number; outflows: number; size: number }) {
  return (
    <>
      <HStack align="baseline" justify="between" gap={12} wide>
        <Drill href="/upcoming" title="Expected in — the items this is the sum of" style={{ fontSize: size, fontWeight: 500 }}>Expected in</Drill>
        <Text as="span" mono size={size} numeric color={inflows === 0 ? "var(--ft-dim)" : "var(--ft-green)"} nowrap>+{formatBaseMoney(Math.abs(inflows))}</Text>
      </HStack>
      <HStack align="baseline" justify="between" gap={12} wide>
        <Drill href="/upcoming" title="Committed out — the items this is the sum of" style={{ fontSize: size, fontWeight: 500 }}>Committed out</Drill>
        <Text as="span" mono size={size} numeric color={outflows === 0 ? "var(--ft-dim)" : "var(--ft-red)"} nowrap>−{formatBaseMoney(Math.abs(outflows))}</Text>
      </HStack>
    </>
  );
}

// ── The six ─────────────────────────────────────────────────────────────────

export function ProtoTopRegion(props: ProtoTopRegionProps) {
  switch (props.variant) {
    case 1: return <TopFlat {...props} />;
    case 2: return <TopHeroLedger {...props} />;
    case 3: return <TopChangeLeads {...props} />;
    case 4: return <TopThreeColumns {...props} />;
    case 5: return <TopMinimum {...props} />;
    case 6: return <TopTwoFigures {...props} />;
    default: return null;
  }
}

/**
 * 1 · FLAT — adopted. This is the shipped top region, not a copy of it.
 *
 * It was the arrangement Thomas picked, so it moved to
 * components/dashboard/top-region.tsx and came out from behind the flag. The
 * variant stays wired here so `data-proto="top-1"` still renders the thing
 * the other five are being compared against — and now it renders the REAL
 * thing, so the comparison cannot silently drift out of date.
 *
 * Its argument, its two knowing rule breaks, and its marks all live in that
 * file now.
 */
function TopFlat({ cells, dashboardLabel, isCustomizing, onCustomize }: ProtoTopRegionProps) {
  const lines = useProtoInsights();
  return (
    <DashboardTopRegion cells={cells} dashboardLabel={dashboardLabel}
      isCustomizing={isCustomizing} onCustomize={onCustomize}
      insights={<Insights lines={lines} register="dense" />} />
  );
}

/**
 * 2 · HERO + LEDGER — the hero survives, the KPI strip does not.
 *
 * Three of the six KPIs have nothing to say on this account and the shipped
 * page prints all six anyway. This drops the strip entirely and gives the
 * width to the two things actually moving the figure: what has already
 * changed it (left) and what is committed to change it next (right). Two
 * ledgers under one number.
 *
 * AI insights sit ABOVE the hero, which is the placement question asked as
 * bluntly as it can be — a dismissible surface printed before the page's own
 * subject. That is a real cost and it is meant to be visible in the
 * screenshot rather than argued about here.
 */
function TopHeroLedger({ cells, dashboardLabel, netWorth, isCustomizing, onCustomize }: ProtoTopRegionProps) {
  const { ok, currency, emptyReason } = useAttribution();
  const lines = useProtoInsights();
  const motion = useMotion(netWorth);
  const hero = cells.find((c) => c.href === "/net-worth") ?? cells[0];

  return (
    <VStack marginBottom={14}>
      <HStack align="center" justify="between" gap={12} wide paddingY={9}>
        <PageLabel label={dashboardLabel} />
        <EditLayout register="chip" isCustomizing={isCustomizing} onCustomize={onCustomize} />
      </HStack>

      <div style={{ borderTop: RULE, borderBottom: RULE, marginBottom: 14 }}>
        <Insights lines={lines} register="column" />
      </div>

      <VStack gap={5} marginBottom={14}>
        <Text as="span" mono size={9} weight={600} upper color="var(--ft-dim)" letterSpacing="0.14em" nowrap>
          {hero?.label ?? "NET WORTH"}
        </Text>
        <Hero cell={hero} size={52} />
        {ok !== null && (
          <HStack align="baseline" gap={8} marginTop={7}>
            <Text as="span" numeric size={15} weight={700} color={signColour(ok.totalBase)} nowrap>{signed(ok.totalBase, currency)}</Text>
            <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.10em" nowrap>net {ok.windowLabel}</Text>
          </HStack>
        )}
      </VStack>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: RULE, borderBottom: RULE }}>
        <Col padding="9px 16px 11px 0">
          <VStack gap={5}>
            <Key>WHAT CHANGED IT</Key>
            {ok === null
              ? <Text as="span" mono size={10} color="var(--ft-dim)">{emptyReason ?? "—"}</Text>
              : ok.rows.map((row) => <CauseRow key={row.kind} row={row} currency={currency} size={11} />)}
          </VStack>
        </Col>
        <Col divided padding="9px 0 11px 16px">
          <VStack gap={5}>
            <Key>WHAT WILL · NEXT 30 DAYS · {motion.count} COMMITTED</Key>
            <MotionRows inflows={motion.inflows} outflows={motion.outflows} size={11} />
            <HStack align="baseline" justify="between" gap={16} wide marginTop={4}>
              <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.12em" nowrap>Projected worth</Text>
              {motion.projected === null
                ? <Text as="span" mono size={16} weight={700} color="var(--ft-dim)">—</Text>
                : <Text as="span" mono size={16} weight={700} numeric color="var(--ft-text)" letterSpacing="-0.02em" nowrap>{formatBaseMoney(motion.projected)}</Text>}
            </HStack>
          </VStack>
        </Col>
      </div>
    </VStack>
  );
}

/**
 * 3 · CHANGE LEADS — the finding is the largest thing on the page.
 *
 * Every other iteration, and the shipped page, opens on a figure. This opens
 * on the sentence that figure produced. The net worth is still there and
 * still drills, at the size of a supporting fact rather than a headline.
 *
 * The claim being tested: a dashboard's job is not to state a total — the
 * user can get that from any of five other screens — but to say what
 * happened. It is also the tallest of the six, which is the honest cost of
 * leading with prose.
 *
 * Breaks, named: DESIGN.md §10 keeps mono for data and sans for language, and
 * this obeys that — but it sets the LANGUAGE at 26px and the data at 20px,
 * inverting the weight the rest of the product gives the two.
 */
function TopChangeLeads({ cells, dashboardLabel, isCustomizing, onCustomize }: ProtoTopRegionProps) {
  const { ok, currency, emptyReason } = useAttribution();
  const lines = useProtoInsights();
  const hero = cells.find((c) => c.href === "/net-worth") ?? cells[0];

  return (
    <VStack marginBottom={14}>
      <HStack align="center" justify="between" gap={12} wide paddingY={8}>
        <PageLabel label={dashboardLabel} />
        <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.10em" nowrap>{ok?.windowLabel ?? ""}</Text>
      </HStack>

      <HStack align="start" gap={40} wide wrap marginBottom={14}>
        <VStack gap={9} minWidth={320} maxWidth={560} grow>
          <Text as="div" size={26} weight={600} color="var(--ft-text)" lineHeight={1.2} letterSpacing="-0.015em">
            {ok === null ? (emptyReason ?? "—") : ok.finding.headline}
          </Text>
          {ok?.finding.support != null && (
            <Text as="div" mono size={12} color="var(--ft-muted)" lineHeight={1.45}>{ok.finding.support}</Text>
          )}
          {ok !== null && (
            <HStack align="baseline" gap={10} wrap marginTop={2}>
              <Text as="span" numeric size={20} weight={700} color={signColour(ok.totalBase)} nowrap>{signed(ok.totalBase, currency)}</Text>
              <Key>total movement</Key>
              <Key>·</Key>
              <Key>{hero?.label ?? "NET WORTH"}</Key>
              <Hero cell={hero} size={20} />
            </HStack>
          )}
        </VStack>

        <VStack gap={5} grow minWidth={340} maxWidth={520}>
          {ok?.rows.map((row) => <CauseRow key={row.kind} row={row} currency={currency} size={11} />)}
          {ok?.warning != null && (
            <Text as="div" mono size={9} mt={3} color="var(--ft-amber)" letterSpacing="0.04em">{ok.warning}</Text>
          )}
        </VStack>
      </HStack>

      <Insights lines={lines} register="dense" />

      <Strip edges="bottom">
        {cells.map((cell, i) => (
          <Divided key={cell.label} first={i === 0}><Reading cell={cell} valueSize={11} /></Divided>
        ))}
        <HStack grow />
        <Divided first={false}><EditLayout register="cell" isCustomizing={isCustomizing} onCustomize={onCustomize} /></Divided>
      </Strip>
    </VStack>
  );
}

/**
 * 4 · THREE COLUMNS — WHAT CHANGED as a column rather than a row.
 *
 * The shipped page states the hero, then states what moved it in a band of
 * its own about 300px further down. This puts the three side by side and
 * divides them with rules: what it is, what moved it, what is about to move
 * it. Read left to right it is one sentence.
 *
 * The hero drops to 44px, which is what the third column costs. It is still
 * comfortably the largest thing on the page.
 */
function TopThreeColumns({ cells, dashboardLabel, netWorth, isCustomizing, onCustomize }: ProtoTopRegionProps) {
  const { ok, currency, emptyReason } = useAttribution();
  const lines = useProtoInsights();
  const motion = useMotion(netWorth);
  const hero = cells.find((c) => c.href === "/net-worth") ?? cells[0];
  const demoted = cells.filter((c) => c !== hero);

  return (
    <VStack marginBottom={14}>
      <HStack align="center" justify="between" gap={12} wide paddingY={8}>
        <PageLabel label={dashboardLabel} />
        <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.10em" nowrap>{ok?.windowLabel ?? ""}</Text>
      </HStack>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 0.85fr) minmax(300px, 1.3fr) minmax(230px, 1fr)", borderTop: RULE, borderBottom: RULE }}>
        <Col padding="12px 16px 14px 0">
          <VStack gap={7}>
            <Key>{hero?.label ?? "NET WORTH"}</Key>
            <Hero cell={hero} size={44} />
            {ok !== null && (
              <Text as="span" numeric size={14} weight={700} color={signColour(ok.totalBase)} nowrap>{signed(ok.totalBase, currency)}</Text>
            )}
          </VStack>
        </Col>

        <Col divided padding="12px 16px 14px">
          <VStack gap={5}>
            <Key>WHAT CHANGED</Key>
            <Text as="div" size={13} weight={600} color="var(--ft-text)" lineHeight={1.3} mb={2}>
              {ok === null ? (emptyReason ?? "—") : ok.finding.headline}
            </Text>
            {ok?.rows.map((row) => <CauseRow key={row.kind} row={row} currency={currency} size={10} />)}
          </VStack>
        </Col>

        <Col divided padding="12px 0 14px 16px">
          <VStack gap={5}>
            <Key>WHAT WILL · NEXT 30 DAYS · {motion.count} COMMITTED</Key>
            <MotionRows inflows={motion.inflows} outflows={motion.outflows} size={10} />
            <HStack align="baseline" justify="between" gap={12} wide marginTop={3}>
              <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.12em" nowrap>Projected worth</Text>
              {motion.projected === null
                ? <Text as="span" mono size={20} weight={700} color="var(--ft-dim)">—</Text>
                : <Text as="span" mono size={20} weight={700} numeric color="var(--ft-text)" letterSpacing="-0.02em" nowrap>{formatBaseMoney(motion.projected)}</Text>}
            </HStack>
          </VStack>
        </Col>
      </div>

      <Strip edges="bottom">
        {demoted.map((cell, i) => (
          <Divided key={cell.label} first={i === 0}><Reading cell={cell} /></Divided>
        ))}
        <HStack grow />
        <Divided first={false}><EditLayout register="cell" isCustomizing={isCustomizing} onCustomize={onCustomize} /></Divided>
      </Strip>

      <Insights lines={lines} register="dense" />
    </VStack>
  );
}

/**
 * 5 · MINIMUM — the radically short one.
 *
 * Two rows, and each has to earn its height. The widgets are the good part of
 * this page and the top currently pushes them a long way down; this is what
 * it costs to stop doing that.
 *
 * What it gives up, stated rather than hidden:
 *   · the KPIs that print an en dash are NOT SHOWN. This is the iteration the
 *     brief asked for on that question. Nothing is fabricated to fill the
 *     gap, the strip simply gets shorter, and the count of what was left out
 *     is printed at the end of the run so "hidden" and "does not exist" stay
 *     distinguishable.
 *   · the decomposition is an inline run — causes and amounts, still
 *     drillable, but their evidence ("GBP/MYR 5.4700 → 5.5039") is gone. That
 *     evidence is what a person checks the band FOR, and losing it is the
 *     real price of this iteration, not the pixels.
 *   · AI insights do not appear at all. The shipped float is suppressed
 *     under every top-region prototype (pages/dashboard.tsx), and this is
 *     the one that puts nothing in its place — the shortest top has no room
 *     for the model's opinion, and that is a claim about priority, not an
 *     oversight.
 */
function TopMinimum({ cells, dashboardLabel, isCustomizing, onCustomize }: ProtoTopRegionProps) {
  const { ok, currency } = useAttribution();
  const hero = cells.find((c) => c.href === "/net-worth") ?? cells[0];
  const live = cells.filter((c) => c !== hero && !isDashed(c));
  const hidden = cells.filter((c) => c !== hero && isDashed(c)).length;

  return (
    <VStack marginBottom={12}>
      <HStack align="baseline" gap={14} wide wrap paddingY={6}>
        <PageLabel label={dashboardLabel} />
        <Hero cell={hero} size={32} />
        {ok !== null && (
          <>
            <Text as="span" numeric size={14} weight={700} color={signColour(ok.totalBase)} nowrap>{signed(ok.totalBase, currency)}</Text>
            <Text as="span" size={12} color="var(--ft-muted)" lineHeight={1.3}>{ok.finding.headline}</Text>
          </>
        )}
        <HStack grow minWidth0 />
        <EditLayout register="chip" isCustomizing={isCustomizing} onCustomize={onCustomize} />
      </HStack>

      <Strip>
        {live.map((cell, i) => (
          <Divided key={cell.label} first={i === 0}><Reading cell={cell} valueSize={11} /></Divided>
        ))}
        {ok?.rows.map((row) => (
          <Divided key={row.kind} first={false}>
            <HStack align="baseline" gap={6} padding="5px 12px" shrink={false}>
              <Drill href={row.drillHref} title={`Open what is behind "${row.label}"`} style={{ fontSize: 8 }}>
                <Text as="span" mono size={8} upper letterSpacing="0.14em" color="var(--ft-muted)" nowrap>{row.label}</Text>
              </Drill>
              <Text as="span" mono size={11} numeric weight={600} color={signColour(row.amountBase)} nowrap>{signed(row.amountBase, currency)}</Text>
            </HStack>
          </Divided>
        ))}
        <HStack grow />
        {hidden > 0 && (
          <Divided first={false}>
            <HStack align="baseline" padding="5px 12px" shrink={false}>
              <Key>{hidden} not measured</Key>
            </HStack>
          </Divided>
        )}
      </Strip>
    </VStack>
  );
}

/**
 * 6 · TWO FIGURES — the page has two subjects, not one.
 *
 * "How much am I worth" and "what will I be worth once everything already
 * committed has happened" are two questions, and the shipped header answers
 * the second at 20px beside a 52px answer to the first. This gives them the
 * same size and a rule between them, and pushes everything else — the six
 * KPIs, the decomposition, the insights — into a dense run underneath.
 *
 * Breaks, named: nothing in DESIGN.md, but it refuses the "one number leads"
 * premise a second way — not by flattening it (iteration 1) but by promoting
 * a second figure to equal rank. §14 makes the pair deliberately asymmetric:
 * net worth is a sum of rows and opens them, a projection is not and does
 * not, so the left figure carries an underline and the right one is flat.
 * Whether that reads as considered or as a bug is exactly what the shot is
 * for.
 */
function TopTwoFigures({ cells, dashboardLabel, netWorth, isCustomizing, onCustomize }: ProtoTopRegionProps) {
  const { ok, currency } = useAttribution();
  const lines = useProtoInsights();
  const motion = useMotion(netWorth);
  const hero = cells.find((c) => c.href === "/net-worth") ?? cells[0];
  const demoted = cells.filter((c) => c !== hero);

  return (
    <VStack marginBottom={14}>
      <HStack align="center" justify="between" gap={12} wide paddingY={8}>
        <PageLabel label={dashboardLabel} />
        <EditLayout register="chip" isCustomizing={isCustomizing} onCustomize={onCustomize} />
      </HStack>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: RULE, borderBottom: RULE }}>
        <Col padding="14px 20px 16px 0">
          <VStack gap={8}>
            <Key>{hero?.label ?? "NET WORTH"} · TODAY</Key>
            <Hero cell={hero} size={52} />
            {ok !== null && (
              <HStack align="baseline" gap={8}>
                <Text as="span" numeric size={14} weight={700} color={signColour(ok.totalBase)} nowrap>{signed(ok.totalBase, currency)}</Text>
                <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.10em" nowrap>net {ok.windowLabel}</Text>
              </HStack>
            )}
          </VStack>
        </Col>

        <Col divided padding="14px 0 16px 20px">
          <VStack gap={8}>
            <Key>PROJECTED · IN 30 DAYS · {motion.count} COMMITTED</Key>
            {motion.projected === null
              ? <Text as="span" mono size={52} weight={700} color="var(--ft-dim)" lineHeight={1}>—</Text>
              : <Text as="span" numeric size={52} weight={700} color="var(--ft-text)" letterSpacing="-0.035em" lineHeight={1} nowrap>{formatBaseMoney(motion.projected)}</Text>}
            <HStack align="baseline" gap={16}>
              <HStack align="baseline" gap={5}>
                <Drill href="/upcoming" title="Expected in — the items this is the sum of" style={{ fontSize: 9 }}>
                  <Text as="span" mono size={9} upper letterSpacing="0.10em" color="var(--ft-muted)" nowrap>IN</Text>
                </Drill>
                <Text as="span" mono size={14} weight={700} numeric color={motion.inflows === 0 ? "var(--ft-dim)" : "var(--ft-green)"} nowrap>+{formatBaseMoney(Math.abs(motion.inflows))}</Text>
              </HStack>
              <HStack align="baseline" gap={5}>
                <Drill href="/upcoming" title="Committed out — the items this is the sum of" style={{ fontSize: 9 }}>
                  <Text as="span" mono size={9} upper letterSpacing="0.10em" color="var(--ft-muted)" nowrap>OUT</Text>
                </Drill>
                <Text as="span" mono size={14} weight={700} numeric color={motion.outflows === 0 ? "var(--ft-dim)" : "var(--ft-red)"} nowrap>−{formatBaseMoney(Math.abs(motion.outflows))}</Text>
              </HStack>
            </HStack>
          </VStack>
        </Col>
      </div>

      <Strip edges="bottom">
        {demoted.map((cell, i) => (
          <Divided key={cell.label} first={i === 0}><Reading cell={cell} valueSize={11} /></Divided>
        ))}
      </Strip>

      {ok !== null && (
        <VStack gap={4} padding="9px 0 10px">
          <HStack align="baseline" gap={10} wide>
            <Key>WHAT CHANGED</Key>
            <Text as="span" size={12} color="var(--ft-text)" lineHeight={1.35}>{ok.finding.headline}</Text>
          </HStack>
          {ok.rows.map((row) => <CauseRow key={row.kind} row={row} currency={currency} size={10} />)}
        </VStack>
      )}

      <Insights lines={lines} register="dense" />
    </VStack>
  );
}
