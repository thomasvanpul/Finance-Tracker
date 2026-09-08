// ── Design 4 · STACKED BANDS ────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Organising idea: nothing sits beside anything. Every region is a full-width
// horizontal band, in reading order, separated by enough space that no frame
// is needed to say where one ends. Hierarchy is sequence — what you meet
// first is what matters most — rather than size, weight or position.
//
// The reason to test this: at 1440 the current dashboard has a 6px gutter
// between its two columns, and two unframed widgets 6px apart are one
// widget. Columns are what forced the frames. Take the columns away and the
// frames have nothing left to do.
//
// Rule it deliberately breaks: DESIGN.md § 3's ~16px between groups, again,
// and harder — the bands are 46px apart. At 16px with no frames the page is
// the mush the earlier flat attempt produced. The space IS the separation
// here, so it has to be a size that reads as one.

import { Text } from "@/components/primitives";
import { Drill, DrillTarget } from "@/components/drill";
import { formatMoney } from "@/lib/utils";
import { ProtoFlowDiagram, ProtoNetWorth, ProtoSavingsGoals, useProtoAttribution, useProtoInsights, type ProtoDashboardProps } from "@/components/proto/proto-shared";
import { ProtoInsightRow } from "@/components/proto/proto-insights";
import type { ReactNode } from "react";

const BAND_GAP = 46;

/** A band opens with its name on a hairline that runs the full width of the
 *  page — DESIGN.md § 6's "a hairline beneath a strip to seat it", used here
 *  as the only line on the screen. */
function Band({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 14, borderBottom: "1px solid var(--ft-border)", paddingBottom: 7 }}>
        <Text as="span" mono size={11} upper color="var(--ft-text)" letterSpacing="0.2em">{title}</Text>
        {right}
      </div>
      <div style={{ paddingTop: 18 }}>{children}</div>
    </section>
  );
}

export function BandsDashboard({ cells, dashboardLabel }: ProtoDashboardProps) {
  const { view, finding, baseCurrency } = useProtoAttribution();
  const insights = useProtoInsights();

  return (
    <div style={{ display: "grid", gap: BAND_GAP }}>
      <Band title="Standing" right={<Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.12em">{dashboardLabel}</Text>}>
        {/* Spread across the whole width rather than packed left: the band
            is the region, so the figures use all of it. */}
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", columnGap: 32, rowGap: 20 }}>
          {cells.map((cell) => (
            <div key={cell.label} style={{ display: "grid", gap: 6 }}>
              <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.12em">{cell.label}</Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <Text as="span" numeric size={21} weight={700} letterSpacing="-0.02em" color={cell.valueColor ?? "var(--ft-text)"}>
                  {cell.value}
                </Text>
                {cell.delta !== undefined && (
                  <Text as="span" numeric size={11} color={cell.deltaColor ?? "var(--ft-dim)"}>{cell.delta}</Text>
                )}
              </div>
            </div>
          ))}
        </div>
      </Band>

      {view !== null && view.status === "ok" && baseCurrency !== null && (
        <Band title="What changed" right={<Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.1em">{view.windowLabel}</Text>}>
          {finding !== null && (
            <Text as="p" size={15} lineHeight={1.5} mb={16} color="var(--ft-text)">
              {finding.lead}{" "}
              <Text as="span" size={15} color="var(--ft-muted)">{finding.cause}</Text>
            </Text>
          )}
          {/* The causes run across the band, not down a column, because the
              band has the width and a vertical list inside a full-width
              region is a column with nothing beside it. */}
          <div style={{ display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 46 }}>
            <div style={{ display: "grid", gap: 5 }}>
              <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.12em">Total</Text>
              <DrillTarget href="/net-worth" title="Net worth — everything this is the change in">
                <span className="ft-drill">
                  <Text as="span" numeric size={26} weight={600} letterSpacing="-0.02em" color={view.totalBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}>
                    {view.totalBase > 0 ? "+" : ""}{formatMoney(view.totalBase, baseCurrency)}
                  </Text>
                </span>
              </DrillTarget>
            </div>
            {view.rows.map((row) => (
              <div key={row.kind} style={{ display: "grid", gap: 5, minWidth: 0 }}>
                <Drill href={row.drillHref} title={`Open what is behind "${row.label}"`} style={{ fontSize: 11 }}>
                  {row.label}
                </Drill>
                <Text as="span" numeric size={19} weight={600} color={row.amountBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}>
                  {row.amountBase > 0 ? "+" : ""}{formatMoney(row.amountBase, baseCurrency)}
                </Text>
                <Text as="span" mono size={10} color="var(--ft-dim)">{row.detail}</Text>
                {row.breakdown.map((line) => (
                  <div key={line.label} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                    <Drill href={line.drillHref} title={`Open ${line.label}`} style={{ fontSize: 10 }}>{line.label}</Drill>
                    <Text as="span" numeric size={10} color="var(--ft-dim)">
                      {line.amountBase > 0 ? "+" : ""}{formatMoney(line.amountBase, baseCurrency)}
                    </Text>
                  </div>
                ))}
              </div>
            ))}
          </div>
          {view.warning !== null && (
            <Text as="div" mono size={10} mt={12} color="var(--ft-amber)">{view.warning}</Text>
          )}
        </Band>
      )}

      {insights.length > 0 && (
        <Band title="Noticed">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 34 }}>
            {insights.map((line) => <ProtoInsightRow key={line} line={line} figureSize={18} />)}
          </div>
        </Band>
      )}

      <Band title="Net worth"><ProtoNetWorth /></Band>
      <Band title="Savings goals"><ProtoSavingsGoals /></Band>
      <Band title="Flow diagram"><ProtoFlowDiagram /></Band>
    </div>
  );
}
