// ── Design 2 · EDITORIAL ────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Organising idea: one thing matters per screen. A single dominant figure,
// the explanation of it set as prose directly beneath at reading size, and
// everything else demoted hard — not removed, demoted, so the eye reaches it
// second rather than at the same time.
//
// This is the only one of the four where the KPI strip is NOT a strip. Five
// figures at equal weight is a claim that all five are equally the point,
// and on a page whose subject is "what is my net worth and what moved it"
// that claim is false. They become a single quiet line of readings under the
// hero, where they are still comparable to each other and no longer
// competing with the figure they qualify.
//
// Rule it deliberately breaks: DESIGN.md § 3's ~16px between groups. The gap
// between the hero and the demoted material is 52px, because the demotion IS
// the design — at 16px the hero is simply a large number in a stack, and the
// hierarchy has to be re-asserted by weight, which § 5 and § 11 both refuse.

import { Text } from "@/components/primitives";
import { DrillTarget } from "@/components/drill";
import { formatMoney } from "@/lib/utils";
import { ProtoFlowDiagram, ProtoNetWorth, ProtoSavingsGoals, useProtoAttribution, useProtoInsights, type ProtoDashboardProps, type ProtoKpiCell } from "@/components/proto/proto-shared";
import { ProtoInsightRow } from "@/components/proto/proto-insights";

function heroOf(cells: ProtoKpiCell[]): { hero: ProtoKpiCell; rest: ProtoKpiCell[] } | null {
  if (cells.length === 0) return null;
  // The hero is whichever cell the persona put first — the KPI builder
  // already orders by what that persona came for (dashboard.tsx, the
  // persona switch). Picking "NET WORTH" by name here would override that
  // for the market persona, whose whole argument is the intraday delta.
  const [hero, ...rest] = cells;
  if (hero === undefined) return null;
  return { hero, rest };
}

export function EditorialDashboard({ cells, dashboardLabel }: ProtoDashboardProps) {
  const { view, finding, baseCurrency } = useProtoAttribution();
  const insights = useProtoInsights();
  const split = heroOf(cells);

  return (
    <div style={{ maxWidth: 1100 }}>
      <Text as="div" mono size={10} upper color="var(--ft-dim)" letterSpacing="0.18em" mb={26}>
        {dashboardLabel}
      </Text>

      {split !== null && (
        <div>
          <Text as="div" mono size={11} upper color="var(--ft-muted)" letterSpacing="0.14em" mb={10}>
            {split.hero.label}
          </Text>
          <DrillTarget href="/net-worth" title="Everything this is the total of">
            <span className="ft-drill">
              <Text as="span" numeric size={66} weight={700} letterSpacing="-0.035em" color={split.hero.valueColor ?? "var(--ft-text)"}>
                {split.hero.value}
              </Text>
            </span>
          </DrillTarget>
        </div>
      )}

      {/* The explanation, as prose. Not a row of figures with a caption: a
          sentence a person would say, at a size a person reads, on a
          measure short enough to read (DESIGN.md § 10 — this is language). */}
      {finding !== null && view !== null && view.status === "ok" && baseCurrency !== null && (
        <div style={{ maxWidth: "46ch", paddingTop: 18 }}>
          <Text as="p" size={17} lineHeight={1.5} color="var(--ft-text)">
            {finding.lead}{" "}
            <Text as="span" size={17} color="var(--ft-muted)">{finding.cause}</Text>
          </Text>
          <div style={{ paddingTop: 10, display: "flex", alignItems: "baseline", gap: 10 }}>
            <Text as="span" numeric size={15} weight={600} color={view.totalBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}>
              {view.totalBase > 0 ? "+" : ""}{formatMoney(view.totalBase, baseCurrency)}
            </Text>
            <Text as="span" mono size={11} color="var(--ft-dim)">{view.windowLabel}</Text>
          </div>
        </div>
      )}

      {/* Everything else. One line of readings, then the findings, then the
          board — each step quieter than the one above it. */}
      {split !== null && split.rest.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 44, rowGap: 14, paddingTop: 52 }}>
          {split.rest.map((cell) => (
            <div key={cell.label} style={{ display: "grid", gap: 4 }}>
              <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.12em">{cell.label}</Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                <Text as="span" numeric size={15} weight={600} color={cell.valueColor ?? "var(--ft-muted)"}>{cell.value}</Text>
                {cell.delta !== undefined && (
                  <Text as="span" numeric size={10} color={cell.deltaColor ?? "var(--ft-dim)"}>{cell.delta}</Text>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {insights.length > 0 && (
        <div style={{ display: "grid", gap: 16, paddingTop: 40, maxWidth: 760 }}>
          {insights.map((line) => <ProtoInsightRow key={line} line={line} figureSize={15} />)}
        </div>
      )}

      {/* The board sits at the bottom as reference material. Full width and
          stacked, NOT three across: at a third of 1400 the NET WORTH cells
          clipped "£229,867.61" to "£229,867" and SAVINGS GOALS collided its
          "left of" figures into each other. A financial figure is shown in
          full or not at all (CLAUDE.md), which outranks the wish to spend
          less vertical space, so the demotion is carried by position and by
          the header size instead — which is what demotion is supposed to
          mean anyway. */}
      <div style={{ display: "grid", gap: 34, paddingTop: 46 }}>
        <ProtoNetWorth />
        <ProtoSavingsGoals />
        <ProtoFlowDiagram />
      </div>
    </div>
  );
}
