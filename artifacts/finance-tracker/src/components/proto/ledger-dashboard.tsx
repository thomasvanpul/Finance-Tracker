// ── Design 1 · LEDGER ───────────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Organising idea: there are no regions. The whole page is one continuous
// grid with a shared baseline, and structure is carried by column position
// and by indent, the way a printed ledger or a terminal page carries it. A
// figure is a KPI, a cause or an account according to where it sits and how
// far it is indented, not according to which box it is inside.
//
// Everything numeric lands in ONE column, down the entire page, so any two
// figures on the screen are directly comparable — which is the thing a board
// of panels can never do, because each panel starts its own alignment.

import type { ReactNode } from "react";
import { Text } from "@/components/primitives";
import { Drill } from "@/components/drill";
import { formatMoney } from "@/lib/utils";
import { ProtoFlowDiagram, ProtoNetWorth, ProtoSavingsGoals, useProtoAttribution, useProtoInsights, type ProtoDashboardProps } from "@/components/proto/proto-shared";
import { parseProtoInsight } from "@/components/proto/proto-insights";

// Label gutter, then the one numeric column, then the note. The numeric
// column is sized to hold a 7-figure balance with a 5-character currency
// code at 13px mono (DESIGN.md § 8: reserve the width, the slot gives and
// the digits do not).
const LEDGER_COLUMNS = "clamp(180px, 22%, 260px) 180px minmax(0, 1fr)";

const INDENT_STEP = 16;

function LedgerRow({ label, value, valueColor, note, depth, href }: {
  label: ReactNode;
  value?: string;
  valueColor?: string;
  note?: ReactNode;
  depth?: number;
  href?: string;
}) {
  const labelNode = href === undefined
    ? <Text as="span" mono size={10} upper color="var(--ft-dim)" letterSpacing="0.1em">{label}</Text>
    : <Drill href={href} title="Open the rows behind this"><Text as="span" mono size={10} upper color="var(--ft-dim)" letterSpacing="0.1em">{label}</Text></Drill>;

  return (
    <>
      {/* Names may give, numbers may not (DESIGN.md § 8). The gutter is the
          name column, so it is the one that truncates — the figure beside it
          keeps its own reserved column at full width. */}
      <div className="ft-truncate" style={{ paddingLeft: (depth ?? 0) * INDENT_STEP, minWidth: 0, alignSelf: "baseline" }}>
        {labelNode}
      </div>
      <div style={{ textAlign: "right", alignSelf: "baseline" }}>
        {value !== undefined && (
          <Text as="span" numeric size={depth === undefined || depth === 0 ? 14 : 12} weight={600} color={valueColor ?? "var(--ft-text)"}>
            {value}
          </Text>
        )}
      </div>
      <div style={{ minWidth: 0, alignSelf: "baseline" }}>{note}</div>
    </>
  );
}

// The one rule on the page. A ledger separates its sections with a single
// line across the sheet, not with a box round each of them (DESIGN.md § 5:
// the outer edge is the only rule a terminal draws).
function LedgerBreak() {
  return <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--ft-border)", marginTop: 12, marginBottom: 12 }} />;
}

export function LedgerDashboard({ cells, dashboardLabel }: ProtoDashboardProps) {
  const { view, finding, baseCurrency } = useProtoAttribution();
  const insights = useProtoInsights();

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: LEDGER_COLUMNS, columnGap: 24, rowGap: 7, alignItems: "baseline" }}>
        <div style={{ gridColumn: "1 / -1", paddingBottom: 4 }}>
          <Text as="span" mono size={10} upper color="var(--ft-muted)" letterSpacing="0.18em">{dashboardLabel}</Text>
        </div>

        {cells.map((cell) => (
          <LedgerRow
            key={cell.label}
            label={cell.label}
            value={cell.value}
            valueColor={cell.valueColor}
            note={cell.delta === undefined ? null : (
              <Text as="span" numeric size={11} color={cell.deltaColor ?? "var(--ft-dim)"}>{cell.delta}</Text>
            )}
          />
        ))}

        {view !== null && view.status === "ok" && baseCurrency !== null && (
          <>
            <LedgerBreak />
            <LedgerRow
              label="CHANGE"
              value={`${view.totalBase > 0 ? "+" : ""}${formatMoney(view.totalBase, baseCurrency)}`}
              valueColor={view.totalBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
              href="/net-worth"
              note={<Text as="span" mono size={10} color="var(--ft-dim)">{view.windowLabel}</Text>}
            />

            {/* The finding hangs off the figure rather than heading the
                section: on a ledger the reading belongs beside the number it
                is a reading of. Sans, because it is language. */}
            {finding !== null && (
              <div style={{ gridColumn: "2 / -1", paddingTop: 2, paddingBottom: 4, maxWidth: "62ch" }}>
                <Text as="span" size={13} color="var(--ft-text)">{finding.lead}</Text>{" "}
                <Text as="span" size={13} color="var(--ft-muted)">{finding.cause}</Text>
              </div>
            )}

            {view.rows.map((row) => (
              <LedgerRow
                key={row.kind}
                depth={1}
                label={row.label}
                href={row.drillHref}
                value={`${row.amountBase > 0 ? "+" : ""}${formatMoney(row.amountBase, baseCurrency)}`}
                valueColor={row.amountBase >= 0 ? "var(--ft-green)" : "var(--ft-red)"}
                note={<Text as="span" mono size={10} color="var(--ft-dim)">{row.detail}</Text>}
              />
            ))}
            {view.rows.flatMap((row) => row.breakdown.map((line) => (
              <LedgerRow
                key={row.kind + line.label}
                depth={2}
                label={line.label}
                href={line.drillHref}
                value={`${line.amountBase > 0 ? "+" : ""}${formatMoney(line.amountBase, baseCurrency)}`}
                valueColor="var(--ft-muted)"
              />
            )))}
            {view.warning !== null && (
              <div style={{ gridColumn: "1 / -1" }}>
                <Text as="span" mono size={10} color="var(--ft-amber)">{view.warning}</Text>
              </div>
            )}
          </>
        )}

        {insights.length > 0 && (
          <>
            <LedgerBreak />
            {/* Labelled once, not once per row. A gutter that reads
                READING / READING / READING is the over-labelling tell, and
                on a ledger the column position already says what these are. */}
            <div style={{ gridColumn: "1 / -1", paddingBottom: 2 }}>
              <Text as="span" mono size={10} upper color="var(--ft-muted)" letterSpacing="0.18em">NOTICED</Text>
            </div>
            {insights.map((line) => {
              const insight = parseProtoInsight(line);
              return (
                <LedgerRow
                  key={line}
                  label=""
                  value={insight.figure ?? undefined}
                  note={
                    <div style={{ display: "grid", gap: 2 }}>
                      <Text as="span" size={12} color="var(--ft-muted)" lineHeight={1.4}>{insight.cause}</Text>
                      {insight.details.map((detail) => (
                        <Text key={detail.label} as="span" size={10} color="var(--ft-dim)">
                          {detail.label}{detail.value === null ? "" : "  "}
                          {detail.value !== null && <Text as="span" numeric size={10} color="var(--ft-dim)">{detail.value}</Text>}
                        </Text>
                      ))}
                    </div>
                  }
                />
              );
            })}
          </>
        )}

        <LedgerBreak />
      </div>

      {/* The widgets keep their own internals — a chart cannot be set on a
          text baseline — but they lose their frames and their headers become
          the same gutter label as every other row above (index.css,
          [data-proto="ledger"]). */}
      <div style={{ display: "grid", gap: 26 }}>
        <ProtoNetWorth />
        <ProtoSavingsGoals />
        <ProtoFlowDiagram />
      </div>
    </div>
  );
}
