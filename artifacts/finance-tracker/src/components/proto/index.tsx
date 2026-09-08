// PROTOTYPE ONLY — see lib/proto-design.ts.

import type { ProtoDesign } from "@/lib/proto-design";
import type { ProtoDashboardProps } from "@/components/proto/proto-shared";
import { LedgerDashboard } from "@/components/proto/ledger-dashboard";
import { EditorialDashboard } from "@/components/proto/editorial-dashboard";
import { PanelledDashboard } from "@/components/proto/panelled-dashboard";
import { BandsDashboard } from "@/components/proto/bands-dashboard";

export function ProtoDashboard({ design, ...props }: ProtoDashboardProps & { design: ProtoDesign }) {
  switch (design) {
    case "ledger": return <LedgerDashboard {...props} />;
    case "editorial": return <EditorialDashboard {...props} />;
    case "panelled": return <PanelledDashboard {...props} />;
    case "bands": return <BandsDashboard {...props} />;
  }
}
