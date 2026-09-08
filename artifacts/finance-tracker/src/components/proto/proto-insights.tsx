// ── AI insights, third shape ────────────────────────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// The panel has been two wrong things. Two-word labels ("£412/mo ·
// subscriptions up") restated figures already on the screen above them.
// Three paragraphs of prose buried the figure inside a body of text and made
// the surface the largest block on the page. Both failed the same way: the
// reasoning and the figure were competing for the same slot.
//
// This separates them. The figure is the subject and carries the weight; the
// cause is one clause of language subordinate to it; the reasoning survives
// as detail rows, each naming the figure it reasons from, laid out the way
// WHAT CHANGED lays out the accounts under a cause. The two surfaces then
// rhyme instead of competing, which is the argument for this shape rather
// than a fourth invented one.
//
// Wire format, which is what the model is asked for and what the screenshot
// harness primes through SCREENSHOT_AI_INSIGHTS:
//
//     <figure> — <cause clause> · <name>|<figure> · <name>|<figure>
//
// A line that does not comply still renders: no separator means the whole
// line is prose, no pipe means the detail row is prose. Nothing is ever
// promoted to a figure on a guess (lib/insight-split.ts holds that rule).

import { splitInsight } from "@/lib/insight-split";
import { Text } from "@/components/primitives";

export interface ProtoInsight {
  figure: string | null;
  cause: string;
  details: { label: string; value: string | null }[];
}

export function parseProtoInsight(line: string): ProtoInsight {
  const { figure, clause } = splitInsight(line);
  const [cause, ...rest] = clause.split(" · ");
  return {
    figure,
    cause: cause ?? clause,
    details: rest.map((part) => {
      const at = part.indexOf("|");
      if (at < 0) return { label: part.trim(), value: null };
      return { label: part.slice(0, at).trim(), value: part.slice(at + 1).trim() };
    }),
  };
}

/**
 * One finding. `figureSize` is the only thing the four designs vary — the
 * editorial dashboard demotes the whole panel and the ledger sets it on the
 * same baseline as everything else, and both need the figure a step smaller
 * than the panelled and banded ones do.
 */
export function ProtoInsightRow({ line, figureSize }: { line: string; figureSize: number }) {
  const insight = parseProtoInsight(line);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 3 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        {insight.figure !== null && (
          <Text as="span" numeric size={figureSize} weight={700} color="var(--ft-text)">
            {insight.figure}
          </Text>
        )}
        <Text as="span" size={12} color="var(--ft-muted)" lineHeight={1.45}>
          {insight.cause}
        </Text>
      </div>
      {insight.details.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "auto max-content", columnGap: 14, rowGap: 2, justifyContent: "start" }}>
          {insight.details.map((detail) => (
            <ProtoDetailRow key={detail.label + (detail.value ?? "")} label={detail.label} value={detail.value} />
          ))}
        </div>
      )}
    </div>
  );
}

// The name is language and the figure is data (DESIGN.md § 10), and the
// figure sits in its own column so the two rows under one finding align
// against each other rather than against the prose above them.
function ProtoDetailRow({ label, value }: { label: string; value: string | null }) {
  return (
    <>
      <Text as="span" size={11} color="var(--ft-dim)">{label}</Text>
      {value === null
        ? <span />
        : <Text as="span" numeric size={11} color="var(--ft-muted)" align="right">{value}</Text>}
    </>
  );
}
