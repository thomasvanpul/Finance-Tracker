// ── Pieces the four prototype dashboards share ──────────────────────────────
// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// What is shared is deliberately small: the data, the two things that are
// broken in every current version, and the three widgets. Everything about
// how a page is ORGANISED is in the four design files, because that is the
// question being asked and sharing a layout helper between them would be
// answering it four times the same way.

import { useEffect, useState } from "react";
import { useGetAccountsChangeAttribution } from "@workspace/api-client-react";
import { attributionView, type AttributionView } from "@/lib/change-attribution-view";
import { protoFinding, type ProtoFinding } from "@/components/proto/proto-finding";
import { NetWorthWidget } from "@/components/widgets/net-worth";
import { SavingsGoalsWidget } from "@/components/widgets/savings-goals";
import { CashFlowSankeyWidget } from "@/components/widgets/cash-flow-sankey";

/** Structurally the dashboard's own KpiCellData. Declared here rather than
 *  imported so nothing in components/ depends on a page module. */
export interface ProtoKpiCell {
  label: string;
  value: string;
  delta?: string;
  deltaColor?: string;
  valueColor?: string;
  href?: string;
}

export interface ProtoDashboardProps {
  cells: ProtoKpiCell[];
  dashboardLabel: string;
}

export interface ProtoAttribution {
  view: AttributionView | null;
  finding: ProtoFinding | null;
  baseCurrency: string | null;
}

export function useProtoAttribution(): ProtoAttribution {
  const { data } = useGetAccountsChangeAttribution();
  const view = attributionView(data);
  return {
    view,
    finding: view === null ? null : protoFinding(view),
    baseCurrency: data?.baseCurrency ?? null,
  };
}

const AI_INSIGHTS_CACHE_KEY = "ft-dashboard-ai-insights";

/**
 * The insight lines already in the session cache. The prototypes read the
 * cache and never call the model: a design comparison across eight
 * screenshots needs the same words in all eight, and a live call would not
 * give that. An empty cache renders nothing — the panel has no lines of its
 * own to fall back on.
 */
export function useProtoInsights(): string[] {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(AI_INSIGHTS_CACHE_KEY);
      if (raw === null) return;
      const entry = JSON.parse(raw) as { insights?: unknown };
      if (Array.isArray(entry.insights)) setLines(entry.insights.filter((l): l is string => typeof l === "string"));
    } catch { /* no cache, no insights */ }
  }, []);
  return lines;
}

/** The three widgets the comparison is run with, rendered directly rather
 *  than through the registry — all three ship defaultEnabled:false, and a
 *  design comparison that depends on a localStorage key being right is a
 *  comparison that will silently photograph the wrong thing. */
export function ProtoNetWorth() { return <NetWorthWidget />; }
export function ProtoSavingsGoals() { return <SavingsGoalsWidget />; }
export function ProtoFlowDiagram() { return <CashFlowSankeyWidget />; }
