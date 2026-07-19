import { useGetDashboard } from "@workspace/api-client-react";
import { formatGbp } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";

export function AccountsSummaryWidget() {
  const { data: d, isLoading } = useGetDashboard();

  return (
    <WidgetShell title="Accounts" href="/accounts" linkLabel="→ Manage" isLoading={isLoading} accent="var(--ft-green)">
      {d && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "var(--ft-raised)" }}>
                {["Account", "Ccy", "Balance", "GBP"].map(h => (
                  <th key={h} style={{
                    padding: "5px 10px",
                    textAlign: "left",
                    fontFamily: "var(--font-mono)",
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--ft-dim)",
                    borderBottom: "1px solid var(--ft-border)",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.accountBreakdown.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: "16px 10px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-dim)" }}>
                    No accounts — add via Accounts
                  </td>
                </tr>
              ) : (
                d.accountBreakdown.map(acct => (
                  <tr key={acct.id} style={{ borderBottom: "1px solid var(--ft-border)" }}>
                    <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)" }}>
                      <span style={{ display: "inline-block", maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "bottom" }}>
                        {acct.name}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-accent)", fontWeight: 600 }}>
                      {acct.currency}
                    </td>
                    <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)" }}>
                      <span className="pnum">{new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2 }).format(acct.balance)}</span>
                    </td>
                    <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-green)", fontWeight: 600 }}>
                      <span className="pnum">{formatGbp(acct.gbpEquivalent)}</span>
                    </td>
                  </tr>
                ))
              )}
              {d.accountBreakdown.length > 0 && (
                <tr style={{ background: "var(--ft-raised)", borderTop: "1px solid var(--ft-border2)" }}>
                  <td colSpan={3} style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", color: "var(--ft-dim)", textTransform: "uppercase", fontWeight: 600 }}>
                    Total Cash
                  </td>
                  <td style={{ padding: "6px 10px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ft-green)", fontWeight: 700 }}>
                    <span className="pnum">{formatGbp(d.totalCash)}</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Owing strip */}
          <div style={{ borderTop: "1px solid var(--ft-border)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", background: "var(--ft-raised)" }}>
            {[
              { label: "They Owe Me", value: formatGbp(d.owing.totalOwedToMe), color: "var(--ft-green)" },
              { label: "I Owe", value: formatGbp(d.owing.totalIOwe), color: "var(--ft-red)" },
              { label: "Net", value: `${d.owing.netGbp >= 0 ? "+" : ""}${formatGbp(d.owing.netGbp)}`, color: d.owing.netGbp >= 0 ? "var(--ft-green)" : "var(--ft-red)" },
            ].map((item, i) => (
              <div key={item.label} style={{
                padding: "8px 10px",
                borderRight: i < 2 ? "1px solid var(--ft-border)" : undefined,
              }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ft-dim)", marginBottom: 2 }}>
                  {item.label}
                </div>
                <div className="pnum" style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: item.color }}>
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </WidgetShell>
  );
}
