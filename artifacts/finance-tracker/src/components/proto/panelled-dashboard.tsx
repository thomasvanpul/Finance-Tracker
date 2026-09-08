// ── Design 3 · PANELLED, DONE PROPERLY ──────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Organising idea: keep the frame, and make it mean something. The current
// dashboard draws nine frames at one weight, which is a frame that has
// stopped saying anything except "another one of these". Here there are
// three tiers and they are visibly different objects:
//
//   PRIMARY    one region, two thirds of the width, a 14px header and
//              generous internal space. The thing the screen is about.
//   SECONDARY  the standard panel, at the standard header, in the third
//              column beside it.
//   TERTIARY   full width beneath, a 9px header and tight padding — present,
//              consultable, and clearly not what you came for.
//
// Structure is not any of the three. The KPI strip and WHAT CHANGED carry no
// frame at all (DESIGN.md § 6), which is what makes the tiers legible: with
// six identical rectangles down the page there is no scale left to place a
// primary region on.

import { SectionRule, Text } from "@/components/primitives";
import { Drill, DrillTarget } from "@/components/drill";
import { formatMoney } from "@/lib/utils";
import { ProtoFlowDiagram, ProtoNetWorth, ProtoSavingsGoals, useProtoAttribution, useProtoInsights, type ProtoDashboardProps } from "@/components/proto/proto-shared";
import { ProtoInsightRow } from "@/components/proto/proto-insights";

export function PanelledDashboard({ cells, dashboardLabel }: ProtoDashboardProps) {
  const { view, finding, baseCurrency } = useProtoAttribution();
  const insights = useProtoInsights();

  return (
    <div style={{ display: "grid", gap: 22 }}>
      {/* Structure · the strip. No cell borders, no band fill, no divider
          row: the column gap is the separation (DESIGN.md § 5). */}
      <div>
        <SectionRule right={<Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.1em">{dashboardLabel}</Text>}>
          TODAY
        </SectionRule>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 40, rowGap: 16, paddingTop: 14 }}>
          {cells.map((cell) => (
            <div key={cell.label} style={{ display: "grid", gap: 5 }}>
              <Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.12em">{cell.label}</Text>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <Text as="span" numeric size={19} weight={700} letterSpacing="-0.015em" color={cell.valueColor ?? "var(--ft-text)"}>
                  {cell.value}
                </Text>
                {cell.delta !== undefined && (
                  <Text as="span" numeric size={11} color={cell.deltaColor ?? "var(--ft-dim)"}>{cell.delta}</Text>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Structure · what moved it. The finding leads; the causes are the
          evidence for it and sit to the right of the figure they decompose. */}
      {view !== null && view.status === "ok" && baseCurrency !== null && (
        <div>
          <SectionRule right={<Text as="span" mono size={9} upper color="var(--ft-dim)" letterSpacing="0.08em">{view.windowLabel}</Text>}>
            WHAT CHANGED
          </SectionRule>
          {finding !== null && (
            <div style={{ paddingTop: 12, maxWidth: "72ch" }}>
              <Text as="span" size={14} color="var(--ft-text)">{finding.lead}</Text>{" "}
              <Text as="span" size={14} color="var(--ft-muted)">{finding.cause}</Text>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 34, paddingTop: 12 }}>
            <DrillTarget href="/net-worth" title="Net worth — everything this is the change in">
              <span className="ft-drill">
                <Text as="span" numeric size={30} weight={600} letterSpacing="-0.02em" color={view.totalBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}>
                  {view.totalBase > 0 ? "+" : ""}{formatMoney(view.totalBase, baseCurrency)}
                </Text>
              </span>
            </DrillTarget>
            <div style={{ display: "grid", gap: 5, paddingTop: 4 }}>
              {view.rows.map((row) => (
                <div key={row.kind} style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                  <Drill href={row.drillHref} title={`Open what is behind "${row.label}"`} style={{ fontSize: 12, minWidth: 150 }}>
                    {row.label}
                  </Drill>
                  <Text as="span" numeric size={12} color={row.amountBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}>
                    {row.amountBase > 0 ? "+" : ""}{formatMoney(row.amountBase, baseCurrency)}
                  </Text>
                  <Text as="span" mono size={10} color="var(--ft-dim)">{row.detail}</Text>
                </div>
              ))}
              {/* The accounts under each cause. The band has always carried
                  them and dropping them here would make this design carry
                  less than the one it is competing with. */}
              {view.rows.flatMap((row) => row.breakdown.map((line) => (
                <div key={row.kind + line.label} style={{ display: "flex", alignItems: "baseline", gap: 12, paddingLeft: 16 }}>
                  <Drill href={line.drillHref} title={`Open ${line.label}`} style={{ fontSize: 11, minWidth: 134 }}>
                    {line.label.split(" · ")[0]}
                  </Drill>
                  <Text as="span" numeric size={11} color="var(--ft-dim)">
                    {line.amountBase > 0 ? "+" : ""}{formatMoney(line.amountBase, baseCurrency)}
                  </Text>
                </div>
              )))}
            </div>
          </div>
          {view.warning !== null && (
            <Text as="div" mono size={10} mt={8} color="var(--ft-amber)">{view.warning}</Text>
          )}
        </div>
      )}

      {/* The board, in three tiers.

          SAVINGS GOALS is NOT in the narrow column, which is where the first
          version of this put it: at a third of the width its per-goal cells
          overlapped their own figures ("£220£580.00 left of £80"), and a
          collided figure is the defect CLAUDE.md names first. Only the
          insight float goes beside the primary region — it is prose and a
          figure, and it reads better narrow than wide. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)", gap: 20, alignItems: "start" }}>
        <div className="ft-proto-primary">
          <ProtoNetWorth />
        </div>
        {insights.length > 0 && (
          /* Ephemeral, and drawn as ephemeral (DESIGN.md § 6) — the third
             species is what stops the tiers reading as "big box, small box,
             smaller box". */
          <div className="ft-float" style={{ padding: "12px 14px", display: "grid", gap: 14 }}>
            <Text as="span" size={12} weight={600} color="var(--ft-text)">What Numeris noticed</Text>
            {insights.map((line) => <ProtoInsightRow key={line} line={line} figureSize={16} />)}
          </div>
        )}
      </div>

      <div className="ft-proto-secondary">
        <ProtoSavingsGoals />
      </div>

      <div className="ft-proto-tertiary">
        <ProtoFlowDiagram />
      </div>
    </div>
  );
}
