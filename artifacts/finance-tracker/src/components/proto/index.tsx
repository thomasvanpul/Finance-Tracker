// PROTOTYPE ONLY — see lib/proto-design.ts.
//
// Round 2's eight take no props: each one pulls what it needs from
// useProtoData(). Round 1's four still take the dashboard's own KPI cells,
// which is part of why they read as the same product — the cells arrive
// pre-decided and a design can only arrange them.

import type { ProtoDesign } from "@/lib/proto-design";
import type { ProtoDashboardProps } from "@/components/proto/proto-shared";
import { LedgerDashboard } from "@/components/proto/ledger-dashboard";
import { EditorialDashboard } from "@/components/proto/editorial-dashboard";
import { PanelledDashboard } from "@/components/proto/panelled-dashboard";
import { BandsDashboard } from "@/components/proto/bands-dashboard";
import { MercuryDashboard } from "@/components/proto/iter-mercury";
import { StripeDashboard } from "@/components/proto/iter-stripe";
import { TerminalDashboard } from "@/components/proto/iter-terminal";
import { LinearDashboard } from "@/components/proto/iter-linear";
import { RampDashboard } from "@/components/proto/iter-ramp";
import { PlausibleDashboard } from "@/components/proto/iter-plausible";
import { BroadsheetDashboard } from "@/components/proto/iter-broadsheet";
import { TimelineDashboard } from "@/components/proto/iter-timeline";

export function ProtoDashboard({ design, ...props }: ProtoDashboardProps & { design: ProtoDesign }) {
  switch (design) {
    case "ledger": return <LedgerDashboard {...props} />;
    case "editorial": return <EditorialDashboard {...props} />;
    case "panelled": return <PanelledDashboard {...props} />;
    case "bands": return <BandsDashboard {...props} />;
    case "mercury": return <MercuryDashboard />;
    case "stripe": return <StripeDashboard />;
    case "terminal": return <TerminalDashboard />;
    case "linear": return <LinearDashboard />;
    case "ramp": return <RampDashboard />;
    case "plausible": return <PlausibleDashboard />;
    case "broadsheet": return <BroadsheetDashboard />;
    case "timeline": return <TimelineDashboard />;
  }
}
